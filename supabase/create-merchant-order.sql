-- 订单创建事务补丁：请在 Supabase SQL Editor 新建查询后整段执行。
create or replace function public.create_merchant_order(
  p_destination_country text,
  p_destination_city text,
  p_destination_address text,
  p_recipient_name text,
  p_recipient_phone text,
  p_parcels jsonb,
  p_estimated_fee numeric default 268
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_warehouse public.warehouses;
  v_order public.orders;
  v_parcel record;
  v_parcel_row public.parcels;
begin
  if v_user_id is null then raise exception '请先登录商家账号'; end if;
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce((select email from auth.users where id = v_user_id), '跨境商家'))
  on conflict (id) do nothing;
  select * into v_warehouse from public.warehouses where code = 'SZ-LG-01' and is_active = true limit 1;
  if v_warehouse.id is null then raise exception '深圳仓配置不存在'; end if;
  if coalesce(p_destination_address, '') = '' or coalesce(p_recipient_name, '') = '' then raise exception '目的地地址和收件人不能为空'; end if;
  insert into public.orders (order_no, merchant_id, warehouse_id, status, destination_country, destination_city, destination_address, recipient_name, recipient_phone, route_code, route_name, origin_warehouse_name, origin_warehouse_address, estimated_weight_kg, parcel_count, submitted_at)
  values ('MO' || to_char(now(), 'YYYYMMDDHH24MISS') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), v_user_id, v_warehouse.id, 'submitted', coalesce(p_destination_country, '印度尼西亚'), coalesce(p_destination_city, '雅加达'), p_destination_address, p_recipient_name, p_recipient_phone, 'ID-AIR', '印尼空运专线', v_warehouse.name, v_warehouse.address, 4.2, jsonb_array_length(coalesce(p_parcels, '[]'::jsonb)), now()) returning * into v_order;
  for v_parcel in select no, name from jsonb_to_recordset(coalesce(p_parcels, '[]'::jsonb)) as x(no text, name text) loop
    insert into public.parcels (parcel_no, merchant_id, warehouse_id, status, tracking_no, item_name)
    values (v_parcel.no, v_user_id, v_warehouse.id, 'pre_advised', v_parcel.no, coalesce(v_parcel.name, '未填写品名'))
    on conflict (parcel_no) do update set updated_at = now() returning * into v_parcel_row;
    insert into public.order_parcels (order_id, parcel_id) values (v_order.id, v_parcel_row.id) on conflict do nothing;
  end loop;
  insert into public.fees (order_id, estimated_shipping_fee, estimated_total) values (v_order.id, greatest(coalesce(p_estimated_fee, 268), 0), greatest(coalesce(p_estimated_fee, 268), 0));
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by) values (v_order.id, 'order_submitted', '已创建集运订单', '商家提交订单，等待深圳仓收货确认', v_warehouse.name, v_user_id);
  return v_order;
end;
$$;
revoke all on function public.create_merchant_order(text, text, text, text, text, jsonb, numeric) from public;
grant execute on function public.create_merchant_order(text, text, text, text, text, jsonb, numeric) to authenticated;
