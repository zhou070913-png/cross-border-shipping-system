-- v1.9 头程只到平台印尼仓；尾程创建时单独填写消费者地址。历史数据不回填。
begin;
create table if not exists public.overseas_warehouses(
 id uuid primary key default gen_random_uuid(),code text not null unique,
 name text not null,country text not null default '印度尼西亚' check(country='印度尼西亚'),
 city text not null,address_line text not null,postal_code text,
 contact_name text not null,contact_phone text not null,
 is_test_address boolean not null default true,is_active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.overseas_warehouses enable row level security;
revoke all on public.overseas_warehouses from anon,authenticated;
grant select on public.overseas_warehouses to authenticated;
drop policy if exists overseas_warehouse_read on public.overseas_warehouses;
create policy overseas_warehouse_read on public.overseas_warehouses for select to authenticated
 using(exists(select 1 from public.profiles where id=auth.uid() and is_active) and (is_active or public.is_admin()));
insert into public.overseas_warehouses(code,name,city,address_line,contact_name,contact_phone)
 values('ID-JKT-TEST','Eaztrans 印尼测试仓（禁止寄件）','Jakarta 雅加达','测试占位地址：TEST WAREHOUSE ONLY，非实际收货地址，禁止寄件','测试仓联系人（虚拟）','TEST-NOT-A-PHONE')
 on conflict(code) do nothing;
alter table public.orders add column if not exists destination_overseas_warehouse_id uuid references public.overseas_warehouses(id);
alter table public.orders add column if not exists destination_warehouse_snapshot jsonb;

create or replace function public.admin_save_overseas_warehouse(p_id uuid,p_expected_updated_at timestamptz,p_config jsonb)
returns public.overseas_warehouses language plpgsql security definer set search_path=public as $$
declare w public.overseas_warehouses;before_w public.overseas_warehouses;k text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='admin') then raise exception '仅启用的运营管理员可维护印尼仓地址';end if;
 select * into before_w from public.overseas_warehouses where id=p_id for update;
 if before_w.id is null or before_w.updated_at is distinct from p_expected_updated_at then raise exception '仓库资料已变化，请刷新后修改';end if;
 foreach k in array array['name','city','address_line','contact_name','contact_phone'] loop
  if coalesce(length(trim(p_config->>k)),0) not between 1 and (case when k='address_line' then 1000 when k='contact_phone' then 80 else 120 end) then raise exception '请填写完整且长度有效的仓库名称、城市、地址、联系人及电话';end if;
 end loop;
 if coalesce(length(p_config->>'postal_code'),0)>30 or jsonb_typeof(p_config->'is_test_address') is distinct from 'boolean' or jsonb_typeof(p_config->'is_active') is distinct from 'boolean' then raise exception '仓库配置格式错误';end if;
 update public.overseas_warehouses set name=trim(p_config->>'name'),city=trim(p_config->>'city'),address_line=trim(p_config->>'address_line'),contact_name=trim(p_config->>'contact_name'),contact_phone=trim(p_config->>'contact_phone'),postal_code=trim(p_config->>'postal_code'),is_test_address=(p_config->>'is_test_address')::boolean,is_active=(p_config->>'is_active')::boolean,updated_at=clock_timestamp() where id=p_id returning * into w;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'overseas_warehouse_updated','overseas_warehouse',w.id,to_jsonb(before_w),to_jsonb(w));
 return w;
end $$;

create or replace function public.merchant_create_head_order(
  p_parcel_ids uuid[], p_overseas_warehouse_id uuid, p_route_code text, p_method text, p_note text default null
) returns public.orders language plpgsql security definer set search_path = public as $$
declare v_address public.overseas_warehouses; v_warehouse public.warehouses; v_route public.route_pricing;
  v_order public.orders; v_parcel public.parcels; v_count integer := 0;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='merchant') then raise exception '仅商家可创建订单'; end if;
  if coalesce(cardinality(p_parcel_ids),0)=0 then raise exception '至少选择一个包裹'; end if;
  if p_method is null or p_method not in ('合并为一个外箱','按品类分箱','保持原包裹分别出货') then raise exception '请选择包装方式'; end if;
  select * into v_address from public.overseas_warehouses where id=p_overseas_warehouse_id and is_active for share;
  if v_address.id is null then raise exception '请选择已启用的平台印尼仓'; end if;
  select * into v_route from public.route_pricing where route_code=p_route_code and is_active;
  if v_route.route_code is null or v_address.country <> '印度尼西亚' or p_route_code not like 'ID-%' then raise exception '当前只开放已配置的印度尼西亚线路'; end if;
  select * into v_warehouse from public.warehouses where code='SZ-LG-01' and is_active;
  if v_warehouse.id is null then raise exception '深圳仓尚未配置'; end if;
  for v_parcel in select * from public.parcels where id=any(p_parcel_ids) order by id for update loop
    if v_parcel.merchant_id <> auth.uid() or v_parcel.warehouse_id <> v_warehouse.id then raise exception '包裹不属于本人或深圳仓'; end if;
    if exists(select 1 from public.order_parcels where parcel_id=v_parcel.id) then raise exception '包裹已关联订单，请勿重复申请'; end if;
    if v_parcel.status in ('shipped','exception','consolidated') then raise exception '此包裹当前状态不可申请打包'; end if;
    v_count := v_count+1;
  end loop;
  if v_count <> cardinality(p_parcel_ids) then raise exception '包裹选择无效或重复'; end if;
  insert into public.orders(order_no,merchant_id,warehouse_id,status,destination_country,destination_city,destination_address,
    recipient_name,recipient_phone,route_code,route_name,origin_warehouse_name,origin_warehouse_address,parcel_count,submitted_at,
    consolidated,consolidation_method,consolidation_note,consolidation_at,destination_overseas_warehouse_id,destination_warehouse_snapshot)
  values('MO'||to_char(now(),'YYYYMMDDHH24MISS')||substr(replace(gen_random_uuid()::text,'-',''),1,6),auth.uid(),v_warehouse.id,
    'submitted',v_address.country,v_address.city,v_address.address_line,v_address.contact_name,v_address.contact_phone,
    v_route.route_code,v_route.route_name,v_warehouse.name,v_warehouse.address,v_count,now(),true,p_method,left(p_note,2000),now(),v_address.id,to_jsonb(v_address))
  returning * into v_order;
  insert into public.order_parcels(order_id,parcel_id) select v_order.id,unnest(p_parcel_ids);
  insert into public.fees(order_id,estimated_total) values(v_order.id,0);
  insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
  values(v_order.id,'order_submitted','打包申请已提交',p_method||'；头程目的地为平台印尼仓；等待深圳仓收货与确认头程费用',auth.uid());
  return v_order;
end;
$$;

-- 替换旧尾程入口：地址必须显式选择本人地址；禁止把头程仓地址作为默认消费者地址。
create or replace function public.merchant_create_last_mile(p_order_id uuid,p_address_id uuid)
returns public.orders language plpgsql security definer set search_path=public as $$
declare p public.orders;o public.orders;a public.merchant_addresses;f public.fees;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='merchant') then raise exception '仅启用商家可申请尾程配送';end if;
 select * into p from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
 select * into f from public.fees where order_id=p.id;
 if p.id is null or p.transport_leg<>'first_mile' or p.overseas_received_at is null or f.fee_breakdown_version is distinct from 3 or not exists(select 1 from public.payments where order_id=p.id and status='paid') then raise exception '仅新版头程已付款且到印尼仓后可申请；历史已结算订单请联系运营核对';end if;
 select * into o from public.orders where parent_order_id=p.id and transport_leg='last_mile';
 if o.id is not null then return o;end if;
 select * into a from public.merchant_addresses where id=p_address_id and merchant_id=auth.uid() and country='印度尼西亚';
 if a.id is null or coalesce(length(trim(a.recipient_name)),0)=0 or coalesce(length(trim(a.recipient_phone)),0)=0 or coalesce(length(trim(a.city)),0)=0 or coalesce(length(trim(a.address_line)),0)=0 then raise exception '尾程必须单独填写或选择完整的本人消费者收货地址';end if;
 insert into public.orders(order_no,merchant_id,warehouse_id,status,transport_leg,parent_order_id,route_code,route_name,
 destination_country,destination_city,destination_address,recipient_name,recipient_phone,origin_warehouse_name,origin_warehouse_address,parcel_count,submitted_at,consolidated)
 values('LM'||to_char(now(),'YYYYMMDDHH24MISS')||substr(replace(gen_random_uuid()::text,'-',''),1,6),p.merchant_id,p.warehouse_id,'warehouse_received','last_mile',p.id,'ID-LAST-MILE','印尼尾程配送',
 a.country,a.city,concat_ws(' ',a.address_line,nullif(a.postal_code,'')),a.recipient_name,a.recipient_phone,
 coalesce(p.destination_warehouse_snapshot->>'name',p.overseas_warehouse),coalesce(p.destination_warehouse_snapshot->>'address_line',p.overseas_warehouse),p.parcel_count,now(),true) returning * into o;
 insert into public.fees(order_id,fee_breakdown_version) values(o.id,1);
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by) values(o.id,'last_mile_requested','尾程配送申请已提交','关联头程：'||p.order_no||'；消费者地址已独立确认，等待独立尾程报价',p.overseas_warehouse,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'last_mile_created','order',o.id,to_jsonb(o));
 return o;
end $$;

create or replace function public.merchant_create_last_mile_with_address(p_order_id uuid,p_recipient jsonb)
returns public.orders language plpgsql security definer set search_path=public as $$
declare p public.orders;o public.orders;a public.merchant_addresses;k text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='merchant') then raise exception '仅启用商家可申请尾程配送';end if;
 select * into p from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
 if p.id is null then raise exception '头程订单不存在或不属于本人';end if;
 select * into o from public.orders where parent_order_id=p.id and transport_leg='last_mile';
 if o.id is not null then return o;end if;
 if jsonb_typeof(p_recipient) is distinct from 'object' or p_recipient->>'country' is distinct from '印度尼西亚' then raise exception '请填写印度尼西亚消费者地址';end if;
 foreach k in array array['recipient_name','recipient_phone','city','address_line'] loop
  if coalesce(length(trim(p_recipient->>k)),0) not between 1 and (case when k='address_line' then 1000 when k='recipient_phone' then 80 else 120 end) then raise exception '请完整填写尾程消费者姓名、电话、城市和详细地址';end if;
 end loop;
 if coalesce(length(p_recipient->>'postal_code'),0)>30 then raise exception '邮编过长';end if;
 -- 避免重复保存完全相同的本人地址；地址快照仍在订单中独立锁定。
 select * into a from public.merchant_addresses where merchant_id=auth.uid() and country='印度尼西亚' and recipient_name=trim(p_recipient->>'recipient_name') and recipient_phone=trim(p_recipient->>'recipient_phone') and city=trim(p_recipient->>'city') and address_line=trim(p_recipient->>'address_line') and coalesce(postal_code,'')=coalesce(trim(p_recipient->>'postal_code'),'') limit 1;
 if a.id is null then
  insert into public.merchant_addresses(merchant_id,label,recipient_name,recipient_phone,country,city,postal_code,address_line)
  values(auth.uid(),'尾程消费者地址',trim(p_recipient->>'recipient_name'),trim(p_recipient->>'recipient_phone'),'印度尼西亚',trim(p_recipient->>'city'),trim(p_recipient->>'postal_code'),trim(p_recipient->>'address_line')) returning * into a;
 end if;
 return public.merchant_create_last_mile(p.id,a.id);
end $$;

revoke all on function public.merchant_create_from_parcels(uuid[],uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.merchant_create_head_order(uuid[],uuid,text,text,text),public.merchant_create_last_mile_with_address(uuid,jsonb),public.admin_save_overseas_warehouse(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.merchant_create_head_order(uuid[],uuid,text,text,text),public.merchant_create_last_mile_with_address(uuid,jsonb),public.admin_save_overseas_warehouse(uuid,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'v1.9 overseas warehouse + separate consumer addresses installed' as result;
