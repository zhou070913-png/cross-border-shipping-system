-- Mospace 增量迁移：运价配置、管理员保存和审计
-- 在已执行 schema.sql 与 warehouse-operations.sql 的 Supabase SQL Editor 中执行。

create table if not exists public.route_pricing (
  route_code text primary key,
  route_name text not null,
  first_weight_kg numeric(10,3) not null default 0.5 check (first_weight_kg > 0),
  first_price numeric(12,2) not null default 68 check (first_price >= 0),
  additional_price_per_kg numeric(12,2) not null default 42 check (additional_price_per_kg >= 0),
  volume_divisor numeric(12,2) not null default 6000 check (volume_divisor > 0),
  handling_fee numeric(12,2) not null default 18 check (handling_fee >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_route_pricing_updated_at on public.route_pricing;
create trigger set_route_pricing_updated_at before update on public.route_pricing for each row execute function public.set_updated_at();

insert into public.route_pricing(route_code, route_name, first_weight_kg, first_price, additional_price_per_kg, volume_divisor, handling_fee, notes)
values ('ID-AIR', '印尼空运专线', 0.5, 68, 42, 6000, 18, '实际重量与体积重取大值；仓库确认后生成费用快照。')
on conflict (route_code) do nothing;

alter table public.route_pricing enable row level security;
drop policy if exists route_pricing_select_authenticated on public.route_pricing;
create policy route_pricing_select_authenticated on public.route_pricing for select to authenticated using (is_active or public.is_admin());
drop policy if exists route_pricing_admin_manage on public.route_pricing;
create policy route_pricing_admin_manage on public.route_pricing for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_update_route_pricing(
  p_route_code text,
  p_route_name text,
  p_first_weight_kg numeric,
  p_first_price numeric,
  p_additional_price_per_kg numeric,
  p_volume_divisor numeric,
  p_handling_fee numeric,
  p_notes text default null
)
returns public.route_pricing
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_after public.route_pricing;
begin
  if auth.uid() is null or not public.is_admin() then raise exception '仅平台管理员可修改运价'; end if;
  select to_jsonb(r) into v_before from public.route_pricing r where r.route_code = p_route_code;
  insert into public.route_pricing(route_code, route_name, first_weight_kg, first_price, additional_price_per_kg, volume_divisor, handling_fee, notes)
  values (trim(p_route_code), trim(p_route_name), p_first_weight_kg, p_first_price, p_additional_price_per_kg, p_volume_divisor, p_handling_fee, p_notes)
  on conflict (route_code) do update set
    route_name = excluded.route_name,
    first_weight_kg = excluded.first_weight_kg,
    first_price = excluded.first_price,
    additional_price_per_kg = excluded.additional_price_per_kg,
    volume_divisor = excluded.volume_divisor,
    handling_fee = excluded.handling_fee,
    notes = excluded.notes,
    updated_at = now()
  returning * into v_after;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), 'route_pricing_updated', 'route_pricing', null, v_before, to_jsonb(v_after));
  return v_after;
end;
$$;

revoke all on function public.admin_update_route_pricing(text, text, numeric, numeric, numeric, numeric, numeric, text) from public;
grant execute on function public.admin_update_route_pricing(text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
comment on table public.route_pricing is '管理员维护的线路运价；订单费用确认后写入 fees 快照。';
comment on function public.admin_update_route_pricing(text, text, numeric, numeric, numeric, numeric, numeric, text) is '管理员保存线路运价并写入审计日志。';

-- 让管理员维护的线路运价参与仓库确认费用计算。
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
         coalesce(sum((p.length_cm * p.width_cm * p.height_cm) / coalesce(nullif(v_pricing.volume_divisor, 0), 6000.0)), 0)
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

