-- v3.0 第一阶段：海外仓实际整箱入库、占用、分批转寄。
-- 仅在开发数据库执行；先完成 v2.2。不得与旧前端同时部署到正式环境。
begin;
alter table public.orders add column if not exists forwarding_enabled boolean not null default false;
alter table public.orders add column if not exists fulfillment_mode text;
alter table public.orders add column if not exists overseas_receiving_completed_at timestamptz;
alter table public.orders add column if not exists forwarding_request_id uuid;
alter table public.orders add column if not exists forwarding_request_payload jsonb;
create unique index if not exists forwarding_request_unique on public.orders(merchant_id,forwarding_request_id) where forwarding_request_id is not null;
drop index if exists public.one_last_mile_per_parent;
create table if not exists public.overseas_warehouse_staff(
 user_id uuid not null references public.profiles(id),warehouse_id uuid not null references public.overseas_warehouses(id),
 primary key(user_id,warehouse_id),created_at timestamptz not null default now()
);
create or replace function public.can_operate_overseas(p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and
 (p.role='admin' or p.role='warehouse_operator' and exists(select 1 from public.overseas_warehouse_staff s where s.user_id=p.id and s.warehouse_id=p_warehouse_id)));
$$;
create or replace function public.can_operate_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.orders o join public.profiles p on p.id=auth.uid()
 where o.id=p_order_id and p.is_active and p.role='warehouse_operator' and
 ((public.can_operate_overseas(o.destination_overseas_warehouse_id) and (o.transport_leg='last_mile' or o.status in ('shipped','delivered'))) or
 (o.fulfillment_mode is distinct from 'whole_package' and p.warehouse_id=o.warehouse_id)));
$$;
create table if not exists public.overseas_packages(
 id uuid primary key default gen_random_uuid(),package_no text not null check(length(trim(package_no)) between 1 and 80),
 source_order_id uuid not null references public.orders(id),merchant_id uuid not null references public.profiles(id),
 overseas_warehouse_id uuid not null references public.overseas_warehouses(id),
 status text not null default 'available' check(status in ('available','reserved','dispatched','delivered')),
 assigned_order_id uuid references public.orders(id),received_by uuid not null references public.profiles(id),
 received_at timestamptz not null default now(),dispatched_at timestamptz,delivered_at timestamptz,
 note text not null default '' check(length(note)<=500),created_at timestamptz not null default now(),
 unique(overseas_warehouse_id,package_no),check((status='available')=(assigned_order_id is null))
);
create index if not exists overseas_package_stock on public.overseas_packages(merchant_id,overseas_warehouse_id,status);
create table if not exists public.forwarding_order_packages(
 order_id uuid not null references public.orders(id),package_id uuid not null references public.overseas_packages(id),
 primary key(order_id,package_id),created_at timestamptz not null default now()
);
alter table public.overseas_packages enable row level security;
alter table public.forwarding_order_packages enable row level security;
alter table public.overseas_warehouse_staff enable row level security;
revoke all on public.overseas_packages,public.forwarding_order_packages,public.overseas_warehouse_staff from anon,authenticated;
grant select on public.overseas_packages,public.forwarding_order_packages,public.overseas_warehouse_staff to authenticated;
drop policy if exists overseas_packages_read on public.overseas_packages;
create policy overseas_packages_read on public.overseas_packages for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active) and
 (merchant_id=auth.uid() or public.can_operate_overseas(overseas_warehouse_id)));
drop policy if exists forwarding_items_read on public.forwarding_order_packages;
create policy forwarding_items_read on public.forwarding_order_packages for select to authenticated using(public.can_view_order(order_id));
drop policy if exists overseas_staff_read on public.overseas_warehouse_staff;
create policy overseas_staff_read on public.overseas_warehouse_staff for select to authenticated using(public.is_admin() or user_id=auth.uid());
drop policy if exists payment_notice_read on public.payment_notifications;
create policy payment_notice_read on public.payment_notifications for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and
 (p.role='admin' or recipient_user_id=p.id or p.role='warehouse_operator' and
 (case when exists(select 1 from public.orders o where o.id=payment_notifications.order_id and o.fulfillment_mode='whole_package')
 then public.can_operate_order(payment_notifications.order_id) else payment_notifications.warehouse_id=p.warehouse_id end))));

create or replace function public.forwarding_capabilities() returns integer language sql stable security definer set search_path=public as $$
 select case when exists(select 1 from public.profiles where id=auth.uid() and is_active) then 1 else 0 end;
$$;
create or replace function public.admin_set_overseas_staff(p_member_no text,p_warehouse_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='admin') then raise exception '仅运营可分配海外仓权限';end if;
 select id into u from public.profiles where member_no=trim(p_member_no) and role='warehouse_operator' and is_active;
 if u is null or not exists(select 1 from public.overseas_warehouses where id=p_warehouse_id and is_active) or p_enabled is null then raise exception '请选择启用仓库及有效仓库人员会员号';end if;
 if p_enabled then insert into public.overseas_warehouse_staff values(u,p_warehouse_id,now()) on conflict do nothing;
 else delete from public.overseas_warehouse_staff where user_id=u and warehouse_id=p_warehouse_id;end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'overseas_staff_assignment','profile',u,jsonb_build_object('warehouse_id',p_warehouse_id,'enabled',p_enabled));
end $$;

-- 海外包裹是实际外箱；不能按国内原包裹数量自动生成，以免合包后出现虚假库存。
create or replace function public.warehouse_receive_overseas_packages(p_order_id uuid,p_package_nos text[],p_note text,p_complete boolean)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders;code text;existing public.overseas_packages;n integer:=0;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null or not public.can_operate_overseas(o.destination_overseas_warehouse_id) then raise exception '无权在此海外仓入库';end if;
 if o.transport_leg<>'first_mile' or o.status<>'shipped' or not exists(select 1 from public.payments where order_id=o.id and status='paid') then raise exception '仅已付款且已出货的头程可登记到仓';end if;
 if not exists(select 1 from public.fees where order_id=o.id and fee_breakdown_version=3) then raise exception '历史合并账单需运营核对，不能自动重复结算尾程';end if;
 if not exists(select 1 from public.overseas_warehouses where id=o.destination_overseas_warehouse_id and is_active) then raise exception '海外仓未配置或已停用';end if;
 if exists(select 1 from public.orders where parent_order_id=o.id and fulfillment_mode is distinct from 'whole_package' and status<>'cancelled') then raise exception '此批已有历史尾程，请先人工核对，不能重复生成在仓包裹';end if;
 if p_complete is null or coalesce(length(p_note),0)>500 or coalesce(cardinality(p_package_nos),0)>100 then raise exception '每次最多登记100箱，请填写有效备注与完成状态';end if;
 if cardinality(p_package_nos)<> (select count(distinct trim(x)) from unnest(p_package_nos) x) then raise exception '箱号重复或为空';end if;
 foreach code in array coalesce(p_package_nos,array[]::text[]) loop
  if coalesce(length(trim(code)),0) not between 1 and 80 then raise exception '箱号应为1至80个字符';end if;
  select * into existing from public.overseas_packages where overseas_warehouse_id=o.destination_overseas_warehouse_id and package_no=trim(code);
  if existing.id is not null then
   if existing.source_order_id<>o.id then raise exception '箱号已属于其他批次：%',code;end if;
   continue;
  end if;
  if o.overseas_receiving_completed_at is not null then raise exception '此批已确认全部到齐，不能再追加箱号';end if;
  insert into public.overseas_packages(package_no,source_order_id,merchant_id,overseas_warehouse_id,received_by,note)
  values(trim(code),o.id,o.merchant_id,o.destination_overseas_warehouse_id,auth.uid(),coalesce(p_note,''));n:=n+1;
 end loop;
 if not exists(select 1 from public.overseas_packages where source_order_id=o.id) then raise exception '请至少扫描或录入一个实际到货箱号';end if;
 update public.orders set forwarding_enabled=true,overseas_received_at=coalesce(overseas_received_at,now()),
 overseas_warehouse=coalesce(destination_warehouse_snapshot->>'name',overseas_warehouse),
 overseas_receiving_completed_at=case when p_complete then coalesce(overseas_receiving_completed_at,now()) else overseas_receiving_completed_at end where id=o.id returning * into o;
 if n>0 or p_complete then
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by)
 values(o.id,'overseas_packages_received',case when p_complete then '海外仓本批到货已收齐' else '海外仓分批到货' end,'本次新增实际外箱 '||n||' 个；按实际外箱申请整包转寄',o.overseas_warehouse,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'overseas_packages_received','order',o.id,jsonb_build_object('package_nos',p_package_nos,'complete',p_complete));
 end if;
 return o;
end $$;

create or replace function public.merchant_create_forwarding(p_order_id uuid,p_package_ids uuid[],p_recipient jsonb,p_zone_id uuid,p_expected_zone_version timestamptz,p_request_id uuid)
returns public.orders language plpgsql security definer set search_path=public as $$
declare p public.orders;o public.orders;z public.last_mile_zones;pkg public.overseas_packages;k text;n numeric;payload jsonb;counted integer:=0;ids uuid[];
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='merchant') then raise exception '仅启用商家可申请转寄';end if;
 select * into p from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
 if p.id is null or p.transport_leg<>'first_mile' or not p.forwarding_enabled then raise exception '请选择已登记实际外箱的本人头程批次';end if;
 if p_request_id is null or coalesce(cardinality(p_package_ids),0) not between 1 and 100 then raise exception '请选择1至100个可用整包';end if;
 select array_agg(x order by x) into ids from unnest(p_package_ids) x;
 payload:=jsonb_build_object('head',p_order_id,'packages',ids,'recipient',p_recipient,'zone',p_zone_id,'zone_version',p_expected_zone_version);
 select * into o from public.orders where merchant_id=auth.uid() and forwarding_request_id=p_request_id;
 if o.id is not null then
  if o.forwarding_request_payload is distinct from payload then raise exception '此请求号已用于其他内容，请刷新核对';end if;
  return o;
 end if;
 if jsonb_typeof(p_recipient) is distinct from 'object' or p_recipient->>'country' is distinct from '印度尼西亚' then raise exception '请填写印度尼西亚消费者地址';end if;
 foreach k in array array['recipient_name','recipient_phone','city','address_line'] loop
  if coalesce(length(trim(p_recipient->>k)),0) not between 1 and (case when k='address_line' then 1000 when k='recipient_phone' then 80 else 120 end) then raise exception '请填写完整且长度有效的消费者地址';end if;
 end loop;
 if coalesce(length(p_recipient->>'postal_code'),0)>30 then raise exception '邮编过长';end if;
 if not exists(select 1 from public.overseas_warehouses where id=p.destination_overseas_warehouse_id and is_active) then raise exception '发货仓已停用';end if;
 select * into z from public.last_mile_zones where id=p_zone_id for share;
 if z.id is null or not z.is_active or z.warehouse_id is distinct from p.destination_overseas_warehouse_id or z.updated_at is distinct from p_expected_zone_version then raise exception '地区运价已变化或不属于发货仓，请刷新核对';end if;
 n:=public.last_mile_distance_amount(z.base_fee,z.included_distance_km,z.price_per_km,z.reference_distance_km);
 for pkg in select * from public.overseas_packages where id=any(ids) order by id for update loop
  if pkg.merchant_id<>auth.uid() or pkg.source_order_id<>p.id or pkg.overseas_warehouse_id<>z.warehouse_id or pkg.status<>'available' then raise exception '包裹不属于本批或已被占用，请刷新核对';end if;
  counted:=counted+1;
 end loop;
 if counted<>cardinality(ids) then raise exception '包裹不存在或重复选择';end if;
 insert into public.orders(order_no,merchant_id,warehouse_id,status,transport_leg,parent_order_id,fulfillment_mode,forwarding_request_id,forwarding_request_payload,
 route_code,route_name,destination_country,destination_city,destination_address,recipient_name,recipient_phone,origin_warehouse_name,origin_warehouse_address,parcel_count,submitted_at,consolidated,destination_overseas_warehouse_id,delivery_zone_id)
 values('LM'||to_char(now(),'YYYYMMDDHH24MISS')||substr(replace(gen_random_uuid()::text,'-',''),1,8),auth.uid(),p.warehouse_id,'warehouse_received','last_mile',p.id,'whole_package',p_request_id,payload,
 'ID-LAST-MILE','印尼整包转寄','印度尼西亚',trim(p_recipient->>'city'),concat_ws(' ',trim(p_recipient->>'address_line'),nullif(trim(p_recipient->>'postal_code'),'')),trim(p_recipient->>'recipient_name'),trim(p_recipient->>'recipient_phone'),
 coalesce(p.destination_warehouse_snapshot->>'name',p.overseas_warehouse),coalesce(p.destination_warehouse_snapshot->>'address_line',p.overseas_warehouse),counted,now(),true,z.warehouse_id,z.id) returning * into o;
 insert into public.forwarding_order_packages(order_id,package_id) select o.id,unnest(ids);
 update public.overseas_packages set status='reserved',assigned_order_id=o.id where id=any(ids);
 insert into public.fees(order_id,estimated_total,fee_breakdown_version,pricing_snapshot) values(o.id,n,1,jsonb_build_object('type','last_mile_distance','zone',to_jsonb(z),'distance_km',z.reference_distance_km,'distance_source','region_reference'));
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by) values(o.id,'last_mile_requested','整包转寄已申请','来源整体订单：'||p.order_no||'；已占用 '||counted||' 个整包，等待核价',o.origin_warehouse_name,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'forwarding_created','order',o.id,jsonb_build_object('packages',ids));
 return o;
end $$;

create or replace function public.merchant_cancel_forwarding(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='merchant') then raise exception '仅启用商家可取消转寄';end if;
 select * into o from public.orders where id=p_order_id and merchant_id=auth.uid() and fulfillment_mode='whole_package' for update;
 if o.id is null then raise exception '转寄单不存在';end if;
 if o.status='cancelled' then return o;end if;
 if o.status not in ('warehouse_received','awaiting_payment') or exists(select 1 from public.payments where order_id=o.id and status='paid') or exists(select 1 from public.payment_receipts where order_id=o.id and status in ('pending','approved')) then raise exception '付款审核中或已付款、已出库的转寄单不能取消';end if;
 perform id from public.overseas_packages where assigned_order_id=o.id order by id for update;
 update public.overseas_packages set status='available',assigned_order_id=null where assigned_order_id=o.id and status='reserved';
 update public.orders set status='cancelled',cancelled_at=now() where id=o.id returning * into o;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'forwarding_cancelled','整包转寄已取消','占用包裹已释放，可重新申请转寄',auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'forwarding_cancelled','order',o.id);
 return o;
end $$;

create or replace function public.warehouse_dispatch_forwarding(p_order_id uuid,p_carrier text,p_tracking_no text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders;n integer;
begin
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null or o.fulfillment_mode is distinct from 'whole_package' or not public.can_operate_overseas(o.destination_overseas_warehouse_id) then raise exception '无权出库此转寄单';end if;
 if coalesce(length(trim(p_carrier)),0) not between 1 and 120 or coalesce(length(trim(p_tracking_no)),0) not between 1 and 120 then raise exception '请填写有效承运商及快递单号';end if;
 if o.status in ('shipped','delivered') then
  if o.shipment_carrier=trim(p_carrier) and o.shipment_tracking_no=trim(p_tracking_no) then return o;end if;
  raise exception '本单已出库，不能覆盖原单号';
 end if;
 if o.status not in ('paid','ready_to_ship') or not exists(select 1 from public.payments p join public.fees f on f.order_id=p.order_id where p.order_id=o.id and p.status='paid' and p.amount=f.total_amount and f.confirmed_at is not null) then raise exception '请等待本尾程费用审核付款成功';end if;
 perform id from public.overseas_packages where assigned_order_id=o.id order by id for update;
 select count(*) into n from public.forwarding_order_packages f join public.overseas_packages p on p.id=f.package_id where f.order_id=o.id and p.assigned_order_id=o.id and p.status='reserved';
 if n<>o.parcel_count or n=0 then raise exception '包裹占用与出库明细不一致，请人工核对';end if;
 update public.overseas_packages set status='dispatched',dispatched_at=now() where assigned_order_id=o.id;
 update public.orders set status='shipped',shipped_at=now(),shipment_carrier=trim(p_carrier),shipment_tracking_no=trim(p_tracking_no) where id=o.id returning * into o;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by) values(o.id,'shipped','尾程整包已出库','已交承运商：'||trim(p_carrier)||'；快递单号：'||trim(p_tracking_no)||'。签收需另行核实。',o.origin_warehouse_name,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'forwarding_dispatched','order',o.id,to_jsonb(o));
 return o;
end $$;

-- 旧接口不再允许绕过实际外箱库存建单、整批到货及新单出库。
create or replace function public.warehouse_receive_overseas(p_order_id uuid,p_location text) returns public.orders language plpgsql security definer set search_path=public as $$
begin raise exception '请使用海外仓到货入库，扫描实际整箱并确认是否全部到齐';end $$;
create or replace function public.merchant_create_distance_last_mile(p_order_id uuid,p_recipient jsonb,p_zone_id uuid,p_expected_zone_version timestamptz) returns public.orders language plpgsql security definer set search_path=public as $$
begin raise exception '请在海外仓选择实际可用整包后申请转寄';end $$;
create or replace function public.merchant_create_last_mile_with_address(p_order_id uuid,p_recipient jsonb) returns public.orders language plpgsql security definer set search_path=public as $$
begin raise exception '请在海外仓选择实际可用整包后申请转寄';end $$;
create or replace function public.merchant_create_last_mile(p_order_id uuid,p_address_id uuid) returns public.orders language plpgsql security definer set search_path=public as $$
begin raise exception '请在海外仓选择实际可用整包后申请转寄';end $$;
do $$ begin
 if to_regprocedure('public.warehouse_ship_order_before_forwarding(uuid,text,text)') is null then alter function public.warehouse_ship_order(uuid,text,text) rename to warehouse_ship_order_before_forwarding;end if;
 if to_regprocedure('public.warehouse_complete_delivery_before_forwarding(uuid,text)') is null then alter function public.warehouse_complete_delivery(uuid,text) rename to warehouse_complete_delivery_before_forwarding;end if;
 if to_regprocedure('public.admin_review_payment_before_forwarding(uuid,boolean,numeric,text,text,boolean)') is null then alter function public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) rename to admin_review_payment_before_forwarding;end if;
end $$;
create or replace function public.admin_review_payment_receipt(p_receipt_id uuid,p_approve boolean,p_received_amount numeric,p_bank_reference text,p_note text,p_confirmed_received boolean)
returns public.payment_receipts language plpgsql security definer set search_path=public as $$
declare r public.payment_receipts;
begin
 r:=public.admin_review_payment_before_forwarding(p_receipt_id,p_approve,p_received_amount,p_bank_reference,p_note,p_confirmed_received);
 if p_approve and exists(select 1 from public.orders where id=r.order_id and fulfillment_mode='whole_package') then
  update public.payment_notifications set title=replace(title,'继续打包','整包出库'),message=replace(replace(message,'继续打包','整包出库'),'打包队列','整包出库队列') where order_id=r.order_id;
  update public.tracking_events set event_description=replace(event_description,'待打包','待出库') where order_id=r.order_id and event_code='payment_review_approved';
 end if;
 return r;
end $$;
create or replace function public.warehouse_ship_order(p_order_id uuid,p_carrier text,p_tracking_no text) returns public.orders language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.orders where id=p_order_id and fulfillment_mode='whole_package') then return public.warehouse_dispatch_forwarding(p_order_id,p_carrier,p_tracking_no);end if;
 return public.warehouse_ship_order_before_forwarding(p_order_id,p_carrier,p_tracking_no);
end $$;
create or replace function public.warehouse_complete_delivery(p_order_id uuid,p_note text) returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 o:=public.warehouse_complete_delivery_before_forwarding(p_order_id,p_note);
 if o.fulfillment_mode='whole_package' then update public.overseas_packages set status='delivered',delivered_at=now() where assigned_order_id=o.id and status='dispatched';end if;
 return o;
end $$;
revoke all on function public.warehouse_ship_order_before_forwarding(uuid,text,text),public.warehouse_complete_delivery_before_forwarding(uuid,text) from public,anon,authenticated;
revoke all on function public.admin_review_payment_before_forwarding(uuid,boolean,numeric,text,text,boolean) from public,anon,authenticated;
revoke all on function public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) from public,anon;
grant execute on function public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) to authenticated;
revoke all on function public.can_operate_overseas(uuid),public.forwarding_capabilities(),public.admin_set_overseas_staff(text,uuid,boolean),public.warehouse_receive_overseas_packages(uuid,text[],text,boolean),public.merchant_create_forwarding(uuid,uuid[],jsonb,uuid,timestamptz,uuid),public.merchant_cancel_forwarding(uuid),public.warehouse_dispatch_forwarding(uuid,text,text) from public,anon;
grant execute on function public.can_operate_overseas(uuid),public.forwarding_capabilities(),public.admin_set_overseas_staff(text,uuid,boolean),public.warehouse_receive_overseas_packages(uuid,text[],text,boolean),public.merchant_create_forwarding(uuid,uuid[],jsonb,uuid,timestamptz,uuid),public.merchant_cancel_forwarding(uuid),public.warehouse_dispatch_forwarding(uuid,text,text),public.warehouse_ship_order(uuid,text,text),public.warehouse_complete_delivery(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
