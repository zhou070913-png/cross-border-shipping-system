-- Eaztrans v3.1 开发迁移：新订单一单一地址、合包后头尾程一次结算。
-- 依赖 overseas-forwarding.sql；不回填、不重算历史订单。上线前在开发库验收。
begin;
alter table public.orders add column if not exists combined_request_id uuid;
alter table public.orders add column if not exists combined_payload jsonb;
alter table public.orders add column if not exists packed_boxes jsonb;
alter table public.orders add column if not exists tail_carrier text;
alter table public.orders add column if not exists tail_tracking_no text;
alter table public.orders add column if not exists tail_shipped_at timestamptz;
create unique index if not exists combined_request_once on public.orders(merchant_id,combined_request_id) where combined_request_id is not null;

create or replace function public.combined_capabilities() returns integer language sql stable security definer set search_path=public as $$select 1 where exists(select 1 from profiles where id=auth.uid() and is_active)$$;

-- 服务器返回可见包裹对应的会员号，仓库不必获得商家完整资料。
create or replace function public.warehouse_pending_customers() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(x),'[]') from (
 select p.merchant_id,pr.member_no,count(*) parcel_count,jsonb_agg(jsonb_build_object('id',p.id,'tracking_no',p.tracking_no,'item_name',p.item_name,'order_id',(select op.order_id from order_parcels op where op.parcel_id=p.id limit 1)) order by p.created_at) parcels
 from parcels p join profiles pr on pr.id=p.merchant_id
 where p.status='pre_advised' and exists(select 1 from profiles actor where actor.id=auth.uid() and actor.is_active and (actor.role='admin' or (actor.role='warehouse_operator' and actor.warehouse_id=p.warehouse_id)))
 group by p.merchant_id,pr.member_no order by pr.member_no) x
$$;

create or replace function public.merchant_create_combined_order(p_parcel_ids uuid[],p_route_code text,p_recipient jsonb,p_note text,p_request_id uuid)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders; p public.parcels; w public.warehouses; r public.route_pricing; ow public.overseas_warehouses; k text; n integer:=0; payload jsonb;
begin
 if not exists(select 1 from profiles where id=auth.uid() and role='merchant' and is_active) then raise exception '仅启用商家可创建订单';end if;
 if p_request_id is null or coalesce(cardinality(p_parcel_ids),0) not between 1 and 1000 or length(coalesce(p_note,''))>2000 then raise exception '请选择包裹并核对备注';end if;
 if jsonb_typeof(p_recipient) is distinct from 'object' or p_recipient->>'country' is distinct from '印度尼西亚' then raise exception '请填写印尼收件地址';end if;
 foreach k in array array['recipient_name','recipient_phone','city','address_line'] loop
  if coalesce(length(trim(p_recipient->>k)),0) not between 1 and (case when k='address_line' then 1000 when k='recipient_phone' then 80 else 120 end) then raise exception '请填写完整收件人、电话、城市和地址';end if;
 end loop;
 if length(coalesce(p_recipient->>'postal_code',''))>30 then raise exception '邮编过长';end if;
 payload:=jsonb_build_object('parcels',to_jsonb(p_parcel_ids),'route',p_route_code,'recipient',p_recipient,'note',p_note);
 -- serialize retried requests, including requests with different parcel sets.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 select * into o from orders where merchant_id=auth.uid() and combined_request_id=p_request_id;
 if o.id is not null then
  if o.combined_payload is distinct from payload then raise exception '提交内容已变化，请重新开始申请';end if;return o;
 end if;
 select * into r from route_pricing where route_code=p_route_code and is_active and route_code in ('ID-AIR','ID-SEA') for share;
 if r.route_code is null then raise exception '请选择印尼空运或印尼海运';end if;
 select * into w from warehouses where code='SZ-LG-01' and is_active;
 select * into ow from overseas_warehouses where is_active order by created_at,id limit 1;
 if w.id is null or ow.id is null then raise exception '请配置深圳仓及印尼中转仓';end if;
 for p in select * from parcels where id=any(p_parcel_ids) order by id for update loop
  if p.merchant_id<>auth.uid() or p.warehouse_id<>w.id or p.status not in ('pre_advised','received','measured') or exists(select 1 from order_parcels where parcel_id=p.id) then raise exception '包裹已关联订单、异常或不属于本人';end if;n:=n+1;
 end loop;
 if n<>cardinality(p_parcel_ids) then raise exception '包裹不存在或重复选择';end if;
 insert into orders(order_no,merchant_id,warehouse_id,status,destination_country,destination_city,destination_address,recipient_name,recipient_phone,route_code,route_name,origin_warehouse_name,origin_warehouse_address,parcel_count,submitted_at,consolidated,consolidation_method,consolidation_note,consolidation_at,destination_overseas_warehouse_id,destination_warehouse_snapshot,fulfillment_mode,combined_request_id,combined_payload)
 values('EZ'||to_char(now(),'YYYYMMDDHH24MISS')||substr(replace(gen_random_uuid()::text,'-',''),1,6),auth.uid(),w.id,'submitted','印度尼西亚',trim(p_recipient->>'city'),concat_ws(' ',trim(p_recipient->>'address_line'),nullif(trim(p_recipient->>'postal_code'),'')),trim(p_recipient->>'recipient_name'),trim(p_recipient->>'recipient_phone'),r.route_code,case when r.transport_mode='sea' then '印尼海运' else '印尼空运' end,w.name,w.address,n,now(),true,'去除国内外包装后合包',p_note,now(),ow.id,to_jsonb(ow),'combined_delivery',p_request_id,payload) returning * into o;
 insert into order_parcels(order_id,parcel_id) select o.id,unnest(p_parcel_ids);
 insert into fees(order_id) values(o.id);
 insert into tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'combined_requested','合包订单已提交','深圳仓收货合包后核定头程和尾程；只付款一次',auth.uid());
 return o;
end $$;

-- 按实物逐件收货，关联订单也不再一次性把全部包裹标为收货。
create or replace function public.warehouse_receive_combined_parcel(p_parcel_id uuid) returns public.parcels language plpgsql security definer set search_path=public as $$
declare p public.parcels; oid uuid;
begin
 -- Same lock order as create/pack: parcels first, then order. No partial confirmation.
 select * into p from parcels where id=p_parcel_id for update;
 if p.id is null or not exists(select 1 from profiles where id=auth.uid() and is_active and (role='admin' or (role='warehouse_operator' and warehouse_id=p.warehouse_id))) then raise exception '无权收货此包裹';end if;
 select order_id into oid from order_parcels where parcel_id=p.id limit 1;
 if oid is not null and not exists(select 1 from orders where id=oid and fulfillment_mode='combined_delivery') then raise exception '历史订单请使用原入库流程';end if;
 if p.status<>'pre_advised' then raise exception '包裹已收货或当前不可入库，请刷新';end if;
 update parcels set status='received',received_at=now() where id=p.id returning * into p;
 if oid is not null then
  perform 1 from orders where id=oid for update;
  if not exists(select 1 from order_parcels op join parcels x on x.id=op.parcel_id where op.order_id=oid and x.received_at is null) then update orders set status='warehouse_received',warehouse_received_at=now() where id=oid and status='submitted';end if;
  insert into tracking_events(order_id,parcel_id,event_code,event_title,event_description,created_by) values(oid,p.id,'parcel_received','深圳仓包裹已收货',p.tracking_no,auth.uid());
 end if;
 return p;
end $$;

create or replace function public.warehouse_pack_combined(p_order_id uuid,p_boxes jsonb,p_expected_updated_at timestamptz)
returns public.fees language plpgsql security definer set search_path=public as $$
declare o public.orders; r public.route_pricing; f public.fees; b jsonb; k text; v numeric; wt numeric:=0; vol numeric:=0; vw numeric; cbm numeric; bw numeric; shipping numeric;
begin
 if not public.can_operate_order(p_order_id) then raise exception '无权处理此订单';end if;
 perform 1 from parcels where id in(select parcel_id from order_parcels where order_id=p_order_id) order by id for update;
 select * into o from orders where id=p_order_id for update;
 if o.fulfillment_mode is distinct from 'combined_delivery' or o.updated_at is distinct from p_expected_updated_at or o.status not in ('submitted','warehouse_received','measuring') then raise exception '订单状态已变化，请刷新后重新核对';end if;
 if exists(select 1 from order_parcels op join parcels p on p.id=op.parcel_id where op.order_id=o.id and (p.received_at is null or p.status not in ('received','measured','consolidated'))) then raise exception '请逐件完成全部包裹的实际收货';end if;
 if jsonb_typeof(p_boxes) is distinct from 'array' or jsonb_array_length(p_boxes) not between 1 and 100 then raise exception '请填写1至100个实际合包外箱';end if;
 select * into r from route_pricing where route_code=o.route_code and is_active for share;
 if r.route_code is null then raise exception '线路已停用，请联系运营';end if;
 for b in select * from jsonb_array_elements(p_boxes) loop
  foreach k in array array['weight','length','width','height'] loop
   v:=(b->>k)::numeric;
   if v is null or v<=0 or v>10000 or v::text in ('NaN','Infinity','-Infinity') or v<>round(v,case when k='weight' then 3 else 2 end) then raise exception '请核对实际外箱重量及尺寸';end if;
  end loop;
  wt:=wt+(b->>'weight')::numeric;vol:=vol+(b->>'length')::numeric*(b->>'width')::numeric*(b->>'height')::numeric;
 end loop;
 vw:=round(vol/r.volume_divisor,3);cbm:=ceil(vol)/1000000;bw:=greatest(wt,vw);
 if r.billing_basis='cbm' then
  if r.sea_charge_rule is distinct from 'higher_of_weight_volume' or r.sea_price_per_kg is null then raise exception '请配置海运重量费与体积费取高规则';end if;
  shipping:=greatest(round(greatest(cbm,r.minimum_cbm)*r.price_per_cbm,2),round(wt*r.sea_price_per_kg,2));
 else shipping:=round(r.first_price+greatest(0,bw-r.first_weight_kg)*r.additional_price_per_kg,2);end if;
 update orders set packed_boxes=p_boxes,packed_at=now(),status='measuring',warehouse_received_at=coalesce(warehouse_received_at,now()),updated_at=clock_timestamp() where id=o.id;
 update parcels set status='consolidated' where id in(select parcel_id from order_parcels where order_id=o.id);
 update fees set shipping_fee=shipping,handling_fee=r.handling_fee,actual_weight_kg=wt,volume_weight_kg=vw,billable_weight_kg=bw,billing_basis=r.billing_basis,volume_cbm=cbm,billable_cbm=case when r.billing_basis='cbm' then greatest(cbm,r.minimum_cbm) end,pricing_snapshot=to_jsonb(r)||jsonb_build_object('packed_boxes',p_boxes),estimated_total=shipping+r.handling_fee,estimated_shipping_fee=shipping,estimated_handling_fee=r.handling_fee,total_amount=null,last_mile_fee=null,last_mile_note=null,confirmed_at=null,confirmed_by=null where order_id=o.id returning * into f;
 insert into tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'combined_packed','合包实测已保存','头程预估已更新，尾程费用待仓库复核',auth.uid());
 return f;
end $$;

create or replace function public.warehouse_confirm_combined_fees(p_order_id uuid,p_last_mile_fee numeric,p_note text,p_expected_updated_at timestamptz)
returns public.fees language plpgsql security definer set search_path=public as $$
declare o public.orders; f public.fees;
begin
 if not public.can_operate_order(p_order_id) then raise exception '无权核定此订单';end if;
 select * into o from orders where id=p_order_id for update;
 if o.fulfillment_mode is distinct from 'combined_delivery' or o.updated_at is distinct from p_expected_updated_at or o.status<>'measuring' or o.packed_at is null then raise exception '请先完成合包实测，或刷新订单版本';end if;
 if p_last_mile_fee is null or p_last_mile_fee<0 or p_last_mile_fee>=10000000 or p_last_mile_fee::text in ('NaN','Infinity','-Infinity') or p_last_mile_fee<>round(p_last_mile_fee,2) or coalesce(length(trim(p_note)),0) not between 1 and 500 then raise exception '请填写有效尾程金额和地址距离核价说明';end if;
 update fees set fee_breakdown_version=2,last_mile_fee=p_last_mile_fee,last_mile_note=trim(p_note),total_amount=shipping_fee+handling_fee+p_last_mile_fee,confirmed_by=auth.uid(),confirmed_at=now() where order_id=o.id and locked_at is null and shipping_fee is not null returning * into f;
 if f.id is null or f.total_amount<=0 then raise exception '头程费用尚未生成';end if;
 update orders set status='awaiting_payment',updated_at=clock_timestamp() where id=o.id;
 insert into tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'combined_fees_confirmed','头程尾程费用已复核','等待客户合计付款一次',auth.uid());
 insert into audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'combined_quote','order',o.id,to_jsonb(f));
 return f;
end $$;

create or replace function public.warehouse_advance_combined(p_order_id uuid,p_action text,p_carrier text,p_tracking_no text,p_expected_updated_at timestamptz)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders; title text;
begin
 select * into o from orders where id=p_order_id for update;
 if o.fulfillment_mode is distinct from 'combined_delivery' or not public.can_operate_order(o.id) then raise exception '无权更新此订单';end if;
 if o.updated_at is distinct from p_expected_updated_at then raise exception '订单已更新，请刷新核对';end if;
 if not exists(select 1 from payments where order_id=o.id and status='paid') then raise exception '必须等待运营确认整单付款';end if;
 if p_action in ('head_ship','tail_ship') and (coalesce(length(trim(p_carrier)),0) not between 1 and 120 or coalesce(length(trim(p_tracking_no)),0) not between 3 and 160) then raise exception '请填写承运商及运单号';end if;
 if p_action='head_ship' and o.status in ('paid','ready_to_ship') and o.packed_at is not null then
  update orders set status='shipped',shipped_at=now(),shipment_carrier=trim(p_carrier),shipment_tracking_no=trim(p_tracking_no) where id=o.id;title:='头程已出货';
  update parcels set status='shipped' where id in(select parcel_id from order_parcels where order_id=o.id);
 elsif p_action='overseas_receive' and o.status='shipped' and o.overseas_received_at is null then
  update orders set overseas_received_at=now(),overseas_warehouse=destination_warehouse_snapshot->>'name' where id=o.id;title:='印尼仓已到货';
 elsif p_action='tail_ship' and o.status='shipped' and o.overseas_received_at is not null and o.tail_shipped_at is null then
  update orders set tail_shipped_at=now(),tail_carrier=trim(p_carrier),tail_tracking_no=trim(p_tracking_no) where id=o.id;title:='尾程快递已发出';
 elsif p_action='delivered' and o.status='shipped' and o.tail_shipped_at is not null then
  update orders set status='delivered',delivered_at=now() where id=o.id;title:='客户已签收';
 else raise exception '当前状态不能执行此步骤，请刷新核对';end if;
 update orders set updated_at=clock_timestamp() where id=o.id returning * into o;
 insert into tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'combined_'||p_action,title,case when p_action in ('head_ship','tail_ship') then trim(p_carrier)||' · '||trim(p_tracking_no) else title end,auth.uid());
 return o;
end $$;

-- 不允许旧接口绕过“合包实测、尾程复核、一次付款”或再次创建收费尾程。
create or replace function public.guard_combined_orders() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.parent_order_id is not null and exists(select 1 from orders where id=new.parent_order_id and fulfillment_mode='combined_delivery') then raise exception '整体订单已含尾程，不能创建独立收费尾程';end if;
 if tg_op='UPDATE' and old.fulfillment_mode='combined_delivery' then
  if new.fulfillment_mode is distinct from old.fulfillment_mode or new.destination_address is distinct from old.destination_address or new.recipient_name is distinct from old.recipient_name or new.recipient_phone is distinct from old.recipient_phone or new.route_code is distinct from old.route_code or new.merchant_id<>old.merchant_id then raise exception '已提交订单的地址和运输方式已锁定';end if;
  if new.status in ('awaiting_payment','paid','ready_to_ship','shipped','delivered') and (new.packed_at is null or new.packed_boxes is null or not exists(select 1 from fees where order_id=new.id and fee_breakdown_version=2 and last_mile_fee is not null and confirmed_at is not null and total_amount>0)) then raise exception '必须先合包实测并复核头程尾程费用';end if;
  if new.status in ('paid','ready_to_ship','shipped','delivered') and not exists(select 1 from payments where order_id=new.id and status='paid') then raise exception '必须先完成整单付款审核';end if;
  if new.status='delivered' and new.tail_shipped_at is null then raise exception '尾程尚未发出，不能签收';end if;
 end if;return new;
end $$;
drop trigger if exists guard_combined_orders on public.orders;
create trigger guard_combined_orders before insert or update on public.orders for each row execute function public.guard_combined_orders();
create or replace function public.guard_combined_fees() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from orders where id=new.order_id and fulfillment_mode='combined_delivery') then
  if new.confirmed_at is not null and (new.fee_breakdown_version<>2 or new.last_mile_fee is null) then raise exception '请统一复核头程和尾程费用';end if;
  if tg_op='UPDATE' and (old.confirmed_at is not null) and (to_jsonb(new)-array['locked_at','updated_at']) is distinct from (to_jsonb(old)-array['locked_at','updated_at']) then raise exception '已复核账单已锁定，请联系运营处理';end if;
 end if;return new;
end $$;
drop trigger if exists guard_combined_fees on public.fees;
create trigger guard_combined_fees before insert or update on public.fees for each row execute function public.guard_combined_fees();

-- 追加消息保留仓库与运营的各自回复，不能互相覆盖。
create table if not exists public.support_replies(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references support_tickets(id),actor_id uuid not null references profiles(id),actor_role public.app_role not null,message text not null check(length(trim(message)) between 1 and 4000),created_at timestamptz not null default now());
alter table public.support_replies enable row level security;
create or replace function public.can_access_ticket(p_ticket_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from support_tickets t join profiles a on a.id=auth.uid() where t.id=p_ticket_id and a.is_active and (a.id=t.merchant_id or a.role='admin' or (a.role='warehouse_operator' and ((t.order_id is not null and public.can_operate_order(t.order_id)) or (t.order_id is null and exists(select 1 from parcels p where p.merchant_id=t.merchant_id and p.warehouse_id=a.warehouse_id))))))
$$;
drop policy if exists tickets_shared_read on public.support_tickets;
create policy tickets_shared_read on public.support_tickets for select to authenticated using(public.can_access_ticket(id));
drop policy if exists support_replies_read on public.support_replies;
create policy support_replies_read on public.support_replies for select to authenticated using(public.can_access_ticket(ticket_id));
revoke all on public.support_replies from anon,authenticated;
grant select on public.support_replies to authenticated;
create or replace function public.submit_support(p_ticket_id uuid,p_order_id uuid,p_subject text,p_message text) returns public.support_tickets language plpgsql security definer set search_path=public as $$
declare t public.support_tickets; a public.profiles;
begin
 select * into a from profiles where id=auth.uid() and is_active;
 if a.id is null or coalesce(length(trim(p_message)),0) not between 1 and 4000 then raise exception '请填写有效客服消息';end if;
 if p_ticket_id is null then
  if a.role<>'merchant' or coalesce(length(trim(p_subject)),0) not between 2 and 120 or length(trim(p_message))<5 or (p_order_id is not null and not exists(select 1 from orders where id=p_order_id and merchant_id=a.id)) then raise exception '请核对咨询标题、内容和订单';end if;
  insert into support_tickets(merchant_id,order_id,subject,message) values(a.id,p_order_id,trim(p_subject),trim(p_message)) returning * into t;
 else
  select * into t from support_tickets where id=p_ticket_id for update;
  if not public.can_access_ticket(t.id) then raise exception '无权回复此咨询';end if;
  insert into support_replies(ticket_id,actor_id,actor_role,message) values(t.id,a.id,a.role,trim(p_message));
  update support_tickets set status=case when a.role='merchant' then 'open' else 'replied' end,updated_at=clock_timestamp() where id=t.id returning * into t;
 end if;return t;
end $$;
create table if not exists public.support_contacts(id boolean primary key default true check(id),wechat text not null,whatsapp text not null,is_test boolean not null default true,updated_at timestamptz not null default now());
insert into public.support_contacts(id,wechat,whatsapp) values(true,'Eaztrans_TEST_ONLY','TEST-WHATSAPP-NOT-A-PHONE') on conflict do nothing;
alter table public.support_contacts enable row level security;
drop policy if exists support_contacts_read on public.support_contacts;
create policy support_contacts_read on public.support_contacts for select to authenticated using(exists(select 1 from profiles where id=auth.uid() and is_active));
revoke all on public.support_contacts from anon,authenticated;
grant select on public.support_contacts to authenticated;
create or replace function public.admin_save_support_contacts(p_wechat text,p_whatsapp text,p_is_test boolean,p_expected_updated_at timestamptz) returns public.support_contacts language plpgsql security definer set search_path=public as $$
declare c public.support_contacts;begin
 if not exists(select 1 from profiles where id=auth.uid() and is_active and role='admin') then raise exception '仅运营可配置客服';end if;
 if coalesce(length(trim(p_wechat)),0) not between 1 and 120 or coalesce(length(trim(p_whatsapp)),0) not between 1 and 120 or p_is_test is null then raise exception '请填写有效联系方式';end if;
 update support_contacts set wechat=trim(p_wechat),whatsapp=trim(p_whatsapp),is_test=p_is_test,updated_at=clock_timestamp() where id and updated_at=p_expected_updated_at returning * into c;
 if c.id is null then raise exception '配置已更新，请刷新';end if;return c;
end $$;

-- 所有新 RPC 默认禁止匿名调用；表写入只通过带身份校验的函数。
do $$ begin
 if to_regprocedure('public.receive_order_before_combined(uuid)') is null then alter function public.warehouse_receive_order(uuid) rename to receive_order_before_combined;end if;
 if to_regprocedure('public.review_payment_before_combined(uuid,boolean,numeric,text,text,boolean)') is null then alter function public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) rename to review_payment_before_combined;end if;
end $$;
create or replace function public.warehouse_receive_order(p_order_id uuid) returns public.orders language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from orders where id=p_order_id and fulfillment_mode='combined_delivery') then raise exception '请逐件确认实际包裹收货，不可整单自动收货';end if;
 return public.receive_order_before_combined(p_order_id);
end $$;
create or replace function public.admin_review_payment_receipt(p_receipt_id uuid,p_approve boolean,p_received_amount numeric,p_bank_reference text,p_note text,p_confirmed_received boolean)
returns public.payment_receipts language plpgsql security definer set search_path=public as $$
declare r public.payment_receipts;
begin
 r:=public.review_payment_before_combined(p_receipt_id,p_approve,p_received_amount,p_bank_reference,p_note,p_confirmed_received);
 if p_approve and exists(select 1 from orders where id=r.order_id and fulfillment_mode='combined_delivery') then
  update orders set status='ready_to_ship' where id=r.order_id;
  update payment_notifications set title=replace(title,'继续打包','出货'),message=replace(replace(message,'继续打包','安排出货'),'打包队列','待出货队列') where order_id=r.order_id;
  update tracking_events set event_description=replace(event_description,'待打包','待出货') where order_id=r.order_id and event_code='payment_review_approved';
 end if;return r;
end $$;
revoke all on function public.receive_order_before_combined(uuid),public.review_payment_before_combined(uuid,boolean,numeric,text,text,boolean) from public,anon,authenticated;
revoke all on function public.warehouse_receive_order(uuid),public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) from public,anon;
grant execute on function public.warehouse_receive_order(uuid),public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) to authenticated;
revoke all on function public.combined_capabilities(),public.warehouse_pending_customers(),public.merchant_create_combined_order(uuid[],text,jsonb,text,uuid),public.warehouse_receive_combined_parcel(uuid),public.warehouse_pack_combined(uuid,jsonb,timestamptz),public.warehouse_confirm_combined_fees(uuid,numeric,text,timestamptz),public.warehouse_advance_combined(uuid,text,text,text,timestamptz),public.can_access_ticket(uuid),public.submit_support(uuid,uuid,text,text),public.admin_save_support_contacts(text,text,boolean,timestamptz) from public,anon;
grant execute on function public.combined_capabilities(),public.warehouse_pending_customers(),public.merchant_create_combined_order(uuid[],text,jsonb,text,uuid),public.warehouse_receive_combined_parcel(uuid),public.warehouse_pack_combined(uuid,jsonb,timestamptz),public.warehouse_confirm_combined_fees(uuid,numeric,text,timestamptz),public.warehouse_advance_combined(uuid,text,text,text,timestamptz),public.can_access_ticket(uuid),public.submit_support(uuid,uuid,text,text),public.admin_save_support_contacts(text,text,boolean,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
