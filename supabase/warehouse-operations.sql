-- 仓库作业闭环补丁
-- 作用：入库 -> 确认实重尺寸 -> 商家一次付款 -> 打包 -> 出货。
-- 请在同一个 Supabase 项目的 SQL Editor 中整段执行。

alter table public.orders add column if not exists packed_at timestamptz;
alter table public.orders add column if not exists box_no text;
alter table public.orders add column if not exists package_note text;
alter table public.orders add column if not exists shipment_carrier text;
alter table public.orders add column if not exists shipment_tracking_no text;

create or replace function public.warehouse_receive_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权处理该订单';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  if v_order.status = 'submitted' then
    update public.parcels p
    set status = 'received', received_at = coalesce(received_at, now()), updated_at = now()
    where p.id in (select op.parcel_id from public.order_parcels op where op.order_id = p_order_id);
    update public.orders
    set status = 'warehouse_received', warehouse_received_at = coalesce(warehouse_received_at, now()), updated_at = now()
    where id = p_order_id
    returning * into v_order;
    insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
    values (p_order_id, 'warehouse_received', '深圳仓已收货', '仓库已扫描收货，等待确认实重和尺寸', v_order.origin_warehouse_name, auth.uid());
  elsif v_order.status <> 'warehouse_received' and v_order.status <> 'measuring' then
    raise exception '当前订单状态不可入库确认';
  end if;
  return v_order;
end;
$$;

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
  v_handling_fee numeric(12,2) := 18;
  v_total numeric(12,2);
begin
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权确认该订单';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
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
    where parcel_no = v_row.parcel_no and merchant_id = v_order.merchant_id and warehouse_id = v_order.warehouse_id;
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
         coalesce(sum((p.length_cm * p.width_cm * p.height_cm) / 6000.0), 0)
  into v_actual_weight, v_volume_weight
  from public.order_parcels op join public.parcels p on p.id = op.parcel_id
  where op.order_id = p_order_id;
  v_billable_weight := greatest(v_actual_weight, v_volume_weight);
  -- 初版印尼空运计费：首重 0.5kg ¥68，续重 ¥42/kg，仓库操作费 ¥18。
  v_shipping_fee := round(68 + greatest(v_billable_weight - 0.5, 0) * 42, 2);
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

create or replace function public.warehouse_pack_order(
  p_order_id uuid,
  p_box_no text default null,
  p_package_note text default null
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权处理该订单';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  if v_order.status <> 'paid' then raise exception '订单必须完成一次付款后才能打包'; end if;
  update public.orders set status = 'ready_to_ship', packed_at = now(), box_no = nullif(trim(p_box_no), ''),
    package_note = p_package_note, updated_at = now() where id = p_order_id returning * into v_order;
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (p_order_id, 'packed', '仓库已打包', coalesce(p_package_note, '已完成合包和打包'), v_order.origin_warehouse_name, auth.uid());
  return v_order;
end;
$$;

create or replace function public.warehouse_ship_order(
  p_order_id uuid,
  p_carrier text,
  p_tracking_no text
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权处理该订单';
  end if;
  if coalesce(trim(p_carrier), '') = '' or coalesce(trim(p_tracking_no), '') = '' then
    raise exception '承运商和物流单号不能为空';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  if v_order.status <> 'ready_to_ship' then raise exception '订单必须先完成打包才能出货'; end if;
  update public.orders set status = 'shipped', shipped_at = now(), shipment_carrier = trim(p_carrier),
    shipment_tracking_no = trim(p_tracking_no), updated_at = now() where id = p_order_id returning * into v_order;
  update public.parcels set status = 'shipped', carrier = trim(p_carrier), updated_at = now()
  where id in (select parcel_id from public.order_parcels where order_id = p_order_id);
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (p_order_id, 'shipped', '已离港出境', '承运商：' || trim(p_carrier) || ' · 单号：' || trim(p_tracking_no), v_order.origin_warehouse_name, auth.uid());
  return v_order;
end;
$$;

revoke all on function public.warehouse_receive_order(uuid) from public;
grant execute on function public.warehouse_receive_order(uuid) to authenticated;
revoke all on function public.warehouse_confirm_measurements(uuid, jsonb) from public;
grant execute on function public.warehouse_confirm_measurements(uuid, jsonb) to authenticated;
revoke all on function public.warehouse_pack_order(uuid, text, text) from public;
grant execute on function public.warehouse_pack_order(uuid, text, text) to authenticated;
revoke all on function public.warehouse_ship_order(uuid, text, text) from public;
grant execute on function public.warehouse_ship_order(uuid, text, text) to authenticated;

comment on function public.warehouse_receive_order(uuid) is '仓库扫描收货，订单进入 warehouse_received。';
comment on function public.warehouse_confirm_measurements(uuid, jsonb) is '仓库确认全部包裹实重尺寸并生成唯一最终费用。';
comment on function public.warehouse_pack_order(uuid, text, text) is '付款后仓库完成合包打包，订单进入 ready_to_ship。';
comment on function public.warehouse_ship_order(uuid, text, text) is '仓库登记承运商和单号，订单进入 shipped。';
