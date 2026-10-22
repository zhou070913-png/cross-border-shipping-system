-- v1.8 分段结算：头程一单一次付款，尾程配送单另单一次付款。不修改已有订单 / 付款。
begin;
alter table public.orders add column if not exists transport_leg text not null default 'first_mile' check(transport_leg in ('first_mile','last_mile'));
alter table public.orders add column if not exists parent_order_id uuid references public.orders(id);
alter table public.orders add column if not exists overseas_received_at timestamptz;
alter table public.orders add column if not exists overseas_warehouse text;
create unique index if not exists one_last_mile_per_parent on public.orders(parent_order_id) where transport_leg='last_mile';
alter table public.orders drop constraint if exists orders_leg_parent_check;
alter table public.orders add constraint orders_leg_parent_check check((transport_leg='first_mile' and parent_order_id is null) or (transport_leg='last_mile' and parent_order_id is not null));
alter table public.fees drop constraint if exists fees_fee_breakdown_version_check;
alter table public.fees add constraint fees_fee_breakdown_version_check check(fee_breakdown_version in (1,2,3,4));
alter table public.fees drop constraint if exists fees_two_leg_complete_check;
alter table public.fees add constraint fees_two_leg_complete_check check(fee_breakdown_version not in (2,4) or (last_mile_fee is not null and coalesce(length(trim(last_mile_note)),0) between 1 and 500));
alter table public.fees drop constraint if exists fees_leg_amount_check;
alter table public.fees add constraint fees_leg_amount_check check((fee_breakdown_version<>3 or last_mile_fee is null) and (fee_breakdown_version<>4 or (coalesce(shipping_fee,0)=0 and coalesce(handling_fee,0)=0)));
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
  v_cbm numeric; v_billable_cbm numeric;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('warehouse_operator','admin')) then raise exception '仅启用的仓库人员或运营可确认费用';end if;
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权确认该订单';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  select * into v_pricing from public.route_pricing where route_code = v_order.route_code and is_active = true limit 1;
  if v_pricing.route_code is null then raise exception '线路已停用或未配置，不能使用空运默认价格'; end if;
  v_handling_fee := v_pricing.handling_fee;
  if v_order.transport_leg='last_mile' then raise exception '尾程单请使用尾程报价入口';end if;
  if exists(select 1 from public.fees where order_id=p_order_id and (locked_at is not null or confirmed_at is not null))
    or exists(select 1 from public.payments where order_id=p_order_id and status='paid') then raise exception '费用已确认或已付款，不可重算';end if;
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
       or v_row.actual_weight_kg <= 0 or v_row.actual_weight_kg>10000 or v_row.actual_weight_kg::text in ('NaN','Infinity','-Infinity') or v_row.length_cm is null or v_row.length_cm <= 0
       or v_row.width_cm is null or v_row.width_cm <= 0 or v_row.height_cm is null or v_row.height_cm <= 0
       or v_row.length_cm>10000 or v_row.width_cm>10000 or v_row.height_cm>10000
       or v_row.length_cm::text='NaN' or v_row.width_cm::text='NaN' or v_row.height_cm::text='NaN' then
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
  -- 头程：空运取实重 / 体积重较大值；海运按立方米与最低计费体积。
  v_shipping_fee := round(coalesce(v_pricing.first_price,68) + greatest(v_billable_weight - coalesce(v_pricing.first_weight_kg,0.5), 0) * coalesce(v_pricing.additional_price_per_kg,42), 2);
  select ceil(sum(length_cm*width_cm*height_cm))/1000000 into v_cbm from public.parcels where id in(select parcel_id from public.order_parcels where order_id=p_order_id);
  if v_pricing.billing_basis='cbm' then
    v_billable_cbm:=greatest(v_cbm,v_pricing.minimum_cbm);
    v_shipping_fee:=round(v_billable_cbm*v_pricing.price_per_cbm,2);
  end if;
  v_total := round(v_shipping_fee + v_handling_fee, 2);

  insert into public.fees (
    order_id, actual_weight_kg, volume_weight_kg, billable_weight_kg,
    shipping_fee, handling_fee, total_amount, confirmed_by, confirmed_at, billing_basis, volume_cbm, billable_cbm, pricing_snapshot, fee_breakdown_version, last_mile_fee, last_mile_note
  ) values (
    p_order_id, v_actual_weight, v_volume_weight, v_billable_weight,
    v_shipping_fee, v_handling_fee, v_total, auth.uid(), now(), v_pricing.billing_basis, v_cbm, v_billable_cbm, to_jsonb(v_pricing), 3, null, null
  ) on conflict (order_id) do update set
    fee_breakdown_version=3,last_mile_fee=excluded.last_mile_fee,last_mile_note=excluded.last_mile_note,
    billing_basis=excluded.billing_basis,volume_cbm=excluded.volume_cbm,billable_cbm=excluded.billable_cbm,pricing_snapshot=excluded.pricing_snapshot,
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
          '头程运输与国内仓操作费已确认；商家支付头程后出货，印尼尾程另单结算', v_order.origin_warehouse_name, auth.uid());
  return v_fee;
end;
$$;


create or replace function public.warehouse_receive_overseas(p_order_id uuid,p_location text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','warehouse_operator')) or not(public.is_admin() or public.can_operate_order(p_order_id)) then raise exception '无权登记本单海外仓入库';end if;
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null or o.transport_leg<>'first_mile' or o.status<>'shipped' or not exists(select 1 from public.payments where order_id=o.id and status='paid') then raise exception '头程需已付款并出货后才能登记海外仓到货';end if;
 if coalesce(length(trim(p_location)),0) not between 2 and 500 then raise exception '请填写实际印尼海外仓名称及位置';end if;
 if o.overseas_received_at is not null then raise exception '本单已登记海外仓入库，无需重复登记';end if;
 update public.orders set overseas_received_at=now(),overseas_warehouse=trim(p_location) where id=o.id returning * into o;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by) values(o.id,'overseas_received','头程已到印尼海外仓','请商家申请尾程配送，尾程独立核价与付款',o.overseas_warehouse,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'overseas_received','order',o.id,to_jsonb(o));
 return o;
end $$;

create or replace function public.merchant_create_last_mile(p_order_id uuid,p_address_id uuid)
returns public.orders language plpgsql security definer set search_path=public as $$
declare p public.orders;o public.orders;a public.merchant_addresses;f public.fees;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='merchant') then raise exception '仅启用商家可申请尾程配送';end if;
 select * into p from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
 select * into f from public.fees where order_id=p.id;
 if p.id is null or p.transport_leg<>'first_mile' or p.overseas_received_at is null or f.fee_breakdown_version<>3 or not exists(select 1 from public.payments where order_id=p.id and status='paid') then raise exception '仅新版头程已付款且到印尼仓后可申请；历史已结算订单请联系运营核对，勿重复收费';end if;
 select * into o from public.orders where parent_order_id=p.id and transport_leg='last_mile';
 if o.id is not null then return o;end if;
 if p_address_id is not null then
  select * into a from public.merchant_addresses where id=p_address_id and merchant_id=auth.uid() and country='印度尼西亚';
  if a.id is null then raise exception '请选择本人印度尼西亚收件地址';end if;
 end if;
 insert into public.orders(order_no,merchant_id,warehouse_id,status,transport_leg,parent_order_id,route_code,route_name,
  destination_country,destination_city,destination_address,recipient_name,recipient_phone,origin_warehouse_name,origin_warehouse_address,parcel_count,submitted_at,consolidated)
 values('LM'||to_char(now(),'YYYYMMDDHH24MISS')||substr(replace(gen_random_uuid()::text,'-',''),1,6),p.merchant_id,p.warehouse_id,'warehouse_received','last_mile',p.id,'ID-LAST-MILE','印尼尾程配送',
  '印度尼西亚',coalesce(a.city,p.destination_city),coalesce(a.address_line,p.destination_address),coalesce(a.recipient_name,p.recipient_name),coalesce(a.recipient_phone,p.recipient_phone),
  p.overseas_warehouse,p.overseas_warehouse,p.parcel_count,now(),true) returning * into o;
 insert into public.fees(order_id,fee_breakdown_version) values(o.id,1);
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by) values(o.id,'last_mile_requested','尾程配送申请已提交','关联头程：'||p.order_no||'；等待独立尾程报价，不重复收取头程费用',p.overseas_warehouse,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'last_mile_created','order',o.id,to_jsonb(o));
 return o;
end $$;

create or replace function public.warehouse_quote_last_mile(p_order_id uuid,p_amount numeric,p_note text)
returns public.fees language plpgsql security definer set search_path=public as $$
declare o public.orders;p public.orders;f public.fees;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','warehouse_operator')) or not(public.is_admin() or public.can_operate_order(p_order_id)) then raise exception '无权核定本单尾程报价';end if;
 select * into o from public.orders where id=p_order_id for update;
 select * into p from public.orders where id=o.parent_order_id;
 if o.id is null or o.transport_leg<>'last_mile' or o.status<>'warehouse_received' or p.overseas_received_at is null then raise exception '尾程单当前不可报价';end if;
 if p_amount is null or p_amount<=0 or p_amount>=10000000 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') or coalesce(length(trim(p_note)),0) not between 2 and 500 then raise exception '尾程报价须为有效正数人民币金额，并填写报价依据';end if;
 if exists(select 1 from public.fees where order_id=o.id and confirmed_at is not null) or exists(select 1 from public.payments where order_id=o.id) then raise exception '本单尾程报价已确认，不可重算';end if;
 update public.fees set fee_breakdown_version=4,shipping_fee=0,handling_fee=0,last_mile_fee=p_amount,last_mile_note=trim(p_note),total_amount=p_amount,confirmed_at=now(),confirmed_by=auth.uid() where order_id=o.id returning * into f;
 update public.orders set status='awaiting_payment' where id=o.id;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'fee_confirmed','尾程报价已确认','仅支付本尾程配送费；头程已结算，不重复收费',auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'last_mile_quoted','fees',f.id,to_jsonb(f));
 return f;
end $$;

create or replace function public.warehouse_complete_delivery(p_order_id uuid,p_note text)
returns public.orders language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','warehouse_operator')) or not(public.is_admin() or public.can_operate_order(p_order_id)) then raise exception '无权登记签收';end if;
 select * into o from public.orders where id=p_order_id for update;
 if o.id is null or o.transport_leg<>'last_mile' or o.status<>'shipped' or coalesce(length(trim(p_note)),0) not between 2 and 500 then raise exception '请核实已发货尾程单并填写真实签收依据';end if;
 update public.orders set status='delivered' where id=o.id returning * into o;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,location,created_by) values(o.id,'last_mile_delivered','消费者已签收',trim(p_note),o.destination_city,auth.uid());
 return o;
end $$;

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
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','warehouse_operator')) then raise exception '账号无效';end if;
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权处理该订单';
  end if;
  if coalesce(trim(p_carrier), '') = '' or coalesce(trim(p_tracking_no), '') = '' then
    raise exception '承运商和物流单号不能为空';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  if not exists(select 1 from public.payments where order_id=p_order_id and status='paid') then raise exception '本段尚未付款审核通过，不可发货';end if;
  if v_order.status <> 'ready_to_ship' then raise exception '订单必须先完成打包才能出货'; end if;
  update public.orders set status = 'shipped', shipped_at = now(), shipment_carrier = trim(p_carrier),
    shipment_tracking_no = trim(p_tracking_no), updated_at = now() where id = p_order_id returning * into v_order;
  update public.parcels set status = 'shipped', carrier = trim(p_carrier), updated_at = now()
  where id in (select parcel_id from public.order_parcels where order_id = p_order_id);
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (p_order_id, 'shipped', case when v_order.transport_leg='last_mile' then '印尼尾程已出库配送' else '头程已离港出境' end, '承运商：' || trim(p_carrier) || ' · 单号：' || trim(p_tracking_no), v_order.origin_warehouse_name, auth.uid());
  return v_order;
end;
$$;


revoke all on function public.warehouse_confirm_transport_fees(uuid,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.warehouse_confirm_measurements(uuid,jsonb) to authenticated;
revoke all on function public.warehouse_receive_overseas(uuid,text),public.merchant_create_last_mile(uuid,uuid),public.warehouse_quote_last_mile(uuid,numeric,text),public.warehouse_complete_delivery(uuid,text) from public,anon;
grant execute on function public.warehouse_receive_overseas(uuid,text),public.merchant_create_last_mile(uuid,uuid),public.warehouse_quote_last_mile(uuid,numeric,text),public.warehouse_complete_delivery(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'v1.8 separate first-mile + last-mile settlement installed' as result;
