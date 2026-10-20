-- 商家工作台增量迁移：包裹预报、合包记录与客服工单。
-- 不修改现有订单费用与一次付款规则。
begin;
alter table public.orders add column if not exists consolidated boolean not null default false;
alter table public.orders add column if not exists consolidation_method text;
alter table public.orders add column if not exists consolidation_note text;
alter table public.orders add column if not exists consolidation_at timestamptz;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  subject text not null check (length(trim(subject)) between 2 and 120),
  message text not null check (length(trim(message)) between 5 and 4000),
  status text not null default 'open' check (status in ('open','replied','closed')),
  reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists tickets_read on public.support_tickets;
create policy tickets_read on public.support_tickets for select to authenticated
using (merchant_id = auth.uid() or public.is_admin());
drop policy if exists tickets_insert on public.support_tickets;
create policy tickets_insert on public.support_tickets for insert to authenticated
with check (merchant_id = auth.uid() and public.current_app_role() = 'merchant'
  and status = 'open' and reply is null and
  (order_id is null or exists(select 1 from public.orders o where o.id = order_id and o.merchant_id = auth.uid())));
drop policy if exists tickets_admin_update on public.support_tickets;
create policy tickets_admin_update on public.support_tickets for update to authenticated
using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.support_tickets to authenticated;
create index if not exists support_tickets_merchant_created on public.support_tickets(merchant_id, created_at desc);

create or replace function public.merchant_pre_advise(p_tracking text, p_item_name text, p_carrier text default null)
returns public.parcels language plpgsql security definer set search_path = public as $$
declare v_parcel public.parcels; v_warehouse uuid;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'merchant'::public.app_role then raise exception '仅商家可预报包裹'; end if;
  if length(trim(coalesce(p_tracking,''))) not between 5 and 80 or length(trim(coalesce(p_item_name,''))) not between 1 and 120 or length(coalesce(p_carrier,'')) > 80 then raise exception '请填写快递单号和品名'; end if;
  select id into v_warehouse from public.warehouses where code='SZ-LG-01' and is_active;
  if v_warehouse is null then raise exception '深圳仓尚未配置'; end if;
  insert into public.parcels(parcel_no, tracking_no, item_name, carrier, merchant_id, warehouse_id)
  values(trim(p_tracking),trim(p_tracking),trim(p_item_name),nullif(trim(p_carrier),''),auth.uid(),v_warehouse)
  returning * into v_parcel;
  return v_parcel;
end;
$$;

create or replace function public.merchant_submit_consolidation(
  p_order_id uuid, p_method text, p_note text default null
) returns public.orders language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
  if v_order.id is null or public.current_app_role() is distinct from 'merchant'::public.app_role then raise exception '无权操作此订单'; end if;
  if v_order.consolidated then return v_order; end if;
  if v_order.status not in ('submitted','warehouse_received','measuring') then raise exception '仓库已确认费用，不能再修改包装方案'; end if;
  if p_method is null or p_method not in ('合并为一个外箱','按品类分箱','保持原包裹分别出货') then raise exception '请选择包装方式'; end if;
  update public.orders set consolidated=true, consolidation_method=p_method, consolidation_note=left(p_note,2000), consolidation_at=now()
  where id=p_order_id returning * into v_order;
  insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
  values(p_order_id,'consolidation_requested','商家已确认包装方案',p_method,auth.uid());
  return v_order;
end;
$$;

-- 复用已有预报包裹并锁定归属，防止同一包裹重复关联或跨商家关联。
create or replace function public.merchant_create_from_parcels(
  p_parcel_ids uuid[], p_address_id uuid, p_route_code text, p_method text, p_note text default null
) returns public.orders language plpgsql security definer set search_path = public as $$
declare v_address public.merchant_addresses; v_warehouse public.warehouses; v_route public.route_pricing;
  v_order public.orders; v_parcel public.parcels; v_count integer := 0;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'merchant'::public.app_role then raise exception '仅商家可创建订单'; end if;
  if coalesce(cardinality(p_parcel_ids),0)=0 then raise exception '至少选择一个包裹'; end if;
  if p_method is null or p_method not in ('合并为一个外箱','按品类分箱','保持原包裹分别出货') then raise exception '请选择包装方式'; end if;
  select * into v_address from public.merchant_addresses where id=p_address_id and merchant_id=auth.uid();
  if v_address.id is null then raise exception '请选择本人收货地址'; end if;
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
    consolidated,consolidation_method,consolidation_note,consolidation_at)
  values('MO'||to_char(now(),'YYYYMMDDHH24MISS')||substr(replace(gen_random_uuid()::text,'-',''),1,6),auth.uid(),v_warehouse.id,
    'submitted',v_address.country,v_address.city,v_address.address_line,v_address.recipient_name,v_address.recipient_phone,
    v_route.route_code,v_route.route_name,v_warehouse.name,v_warehouse.address,v_count,now(),true,p_method,left(p_note,2000),now())
  returning * into v_order;
  insert into public.order_parcels(order_id,parcel_id) select v_order.id,unnest(p_parcel_ids);
  insert into public.fees(order_id,estimated_total) values(v_order.id,0);
  insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
  values(v_order.id,'order_submitted','打包申请已提交',p_method||'；等待深圳仓收货与确认费用',auth.uid());
  return v_order;
end;
$$;
revoke all on function public.merchant_pre_advise(text,text,text) from public;
revoke all on function public.merchant_submit_consolidation(uuid,text,text) from public;
revoke all on function public.merchant_create_from_parcels(uuid[],uuid,text,text,text) from public;
grant execute on function public.merchant_pre_advise(text,text,text) to authenticated;
grant execute on function public.merchant_submit_consolidation(uuid,text,text) to authenticated;
grant execute on function public.merchant_create_from_parcels(uuid[],uuid,text,text,text) to authenticated;
-- 试算和仓库确认均读取平台运价；已付款订单仍不可重新确认。
create or replace function public.warehouse_confirm_measurements(
  p_order_id uuid,
  p_measurements jsonb
)
returns public.fees
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_fee public.fees;
  v_row record;
  v_linked_count integer;
  v_measured_count integer;
  v_actual_weight numeric(10,3);
  v_volume_weight numeric(10,3);
  v_billable_weight numeric(10,3);
  v_shipping_fee numeric(12,2);
  v_handling_fee numeric(12,2);
  v_pricing public.route_pricing;
  v_total numeric(12,2);
begin
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权确认该订单';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  select * into v_pricing from public.route_pricing where route_code = v_order.route_code and is_active = true limit 1;
  v_handling_fee := coalesce(v_pricing.handling_fee, 18);
  if v_order.status not in ('warehouse_received', 'measuring') then
    raise exception '当前订单状态不可确认实重尺寸';
  end if;
  if jsonb_typeof(coalesce(p_measurements, '[]'::jsonb)) <> 'array' then
    raise exception '包裹测量数据格式错误';
  end if;

  update public.orders set status = 'measuring', updated_at = now() where id = p_order_id;
  for v_row in
    select parcel_no, actual_weight_kg, length_cm, width_cm, height_cm
    from jsonb_to_recordset(coalesce(p_measurements, '[]'::jsonb)) as x(
      parcel_no text,
      actual_weight_kg numeric,
      length_cm numeric,
      width_cm numeric,
      height_cm numeric
    )
  loop
    if coalesce(v_row.parcel_no, '') = '' or v_row.actual_weight_kg is null
       or v_row.actual_weight_kg < 0 or v_row.length_cm is null or v_row.length_cm <= 0
       or v_row.width_cm is null or v_row.width_cm <= 0 or v_row.height_cm is null or v_row.height_cm <= 0 then
      raise exception '包裹重量和尺寸必须填写完整且为正数';
    end if;
    update public.parcels
    set status = 'measured', actual_weight_kg = round(v_row.actual_weight_kg, 3),
        length_cm = round(v_row.length_cm, 2), width_cm = round(v_row.width_cm, 2),
        height_cm = round(v_row.height_cm, 2), measured_at = now(), updated_at = now()
    where parcel_no = v_row.parcel_no and merchant_id = v_order.merchant_id and warehouse_id = v_order.warehouse_id
      and id in (select parcel_id from public.order_parcels where order_id=p_order_id);
    if not found then raise exception '包裹不属于当前订单：%', v_row.parcel_no; end if;
  end loop;

  select count(*) into v_linked_count from public.order_parcels where order_id = p_order_id;
  select count(*) into v_measured_count
  from public.order_parcels op join public.parcels p on p.id = op.parcel_id
  where op.order_id = p_order_id and p.status = 'measured';
  if v_linked_count = 0 or v_measured_count <> v_linked_count then
    raise exception '请先完成全部包裹的实重和尺寸确认';
  end if;

  select coalesce(sum(p.actual_weight_kg), 0),
         coalesce(sum((p.length_cm * p.width_cm * p.height_cm) / coalesce(nullif(v_pricing.volume_divisor, 0), 6000.0)), 0)
  into v_actual_weight, v_volume_weight
  from public.order_parcels op join public.parcels p on p.id = op.parcel_id
  where op.order_id = p_order_id;
  v_billable_weight := greatest(v_actual_weight, v_volume_weight);
  -- 初版印尼空运计费：首重 0.5kg ¥68，续重 ¥42/kg，仓库操作费 ¥18。
  v_shipping_fee := round(coalesce(v_pricing.first_price,68) + greatest(v_billable_weight - coalesce(v_pricing.first_weight_kg,0.5), 0) * coalesce(v_pricing.additional_price_per_kg,42), 2);
  v_total := round(v_shipping_fee + v_handling_fee, 2);

  insert into public.fees (
    order_id, actual_weight_kg, volume_weight_kg, billable_weight_kg,
    shipping_fee, handling_fee, total_amount, confirmed_by, confirmed_at
  ) values (
    p_order_id, v_actual_weight, v_volume_weight, v_billable_weight,
    v_shipping_fee, v_handling_fee, v_total, auth.uid(), now()
  ) on conflict (order_id) do update set
    actual_weight_kg = excluded.actual_weight_kg,
    volume_weight_kg = excluded.volume_weight_kg,
    billable_weight_kg = excluded.billable_weight_kg,
    shipping_fee = excluded.shipping_fee,
    handling_fee = excluded.handling_fee,
    total_amount = excluded.total_amount,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning * into v_fee;

  update public.orders set status = 'awaiting_payment', updated_at = now() where id = p_order_id;
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (p_order_id, 'fee_confirmed', '仓库已确认费用',
          '已完成全部包裹实重和尺寸确认，等待商家一次付款', v_order.origin_warehouse_name, auth.uid());
  return v_fee;
end;
$$;

-- 包裹先到仓、商家后申请合包：允许独立预报包裹先入库。
create or replace function public.warehouse_receive_parcel(p_parcel_id uuid)
returns public.parcels language plpgsql security definer set search_path=public as $$
declare v public.parcels;
begin
 select * into v from public.parcels where id=p_parcel_id for update;
 if v.id is null or not (public.is_admin() or (public.is_warehouse_operator() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.warehouse_id=v.warehouse_id))) then raise exception '无权登记此包裹'; end if;
 if exists(select 1 from public.order_parcels where parcel_id=v.id) then raise exception '已关联订单，请按订单入库'; end if;
 if v.status<>'pre_advised' then raise exception '包裹已收货或当前不可入库'; end if;
 update public.parcels set status='received',received_at=now() where id=v.id returning * into v;
 return v;
end;
$$;
revoke all on function public.warehouse_receive_parcel(uuid) from public;
grant execute on function public.warehouse_receive_parcel(uuid) to authenticated;

commit;
