-- v1.7 海运专线与头程 / 尾程费用拆分；已有订单与已确认金额不重算。
begin;
alter table public.route_pricing add column if not exists transport_mode text not null default 'air' check(transport_mode in ('air','sea'));
alter table public.route_pricing add column if not exists billing_basis text not null default 'kg' check(billing_basis in ('kg','cbm'));
alter table public.route_pricing add column if not exists price_per_cbm numeric(12,2) check(price_per_cbm>=0);
alter table public.route_pricing add column if not exists minimum_cbm numeric(12,6) check(minimum_cbm>0);
alter table public.route_pricing add column if not exists is_test_rate boolean not null default false;
alter table public.fees add column if not exists billing_basis text not null default 'kg' check(billing_basis in ('kg','cbm'));
alter table public.fees add column if not exists volume_cbm numeric(12,6);
alter table public.fees add column if not exists billable_cbm numeric(12,6);
alter table public.fees add column if not exists pricing_snapshot jsonb;
alter table public.fees add column if not exists fee_breakdown_version integer not null default 1 check(fee_breakdown_version in (1,2));
alter table public.fees add column if not exists last_mile_fee numeric(12,2) check(last_mile_fee>=0 and last_mile_fee<10000000);
alter table public.fees add column if not exists last_mile_note text;
-- 只替换旧的合计约束；历史单尾程为 NULL，不伪造历史拆分。
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.fees'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%total_amount%shipping_fee%handling_fee%'
  and pg_get_constraintdef(oid) not like '%last_mile_fee%'
 loop execute format('alter table public.fees drop constraint %I',c.conname);end loop;
end $$;
alter table public.fees drop constraint if exists fees_two_leg_total_check;
alter table public.fees add constraint fees_two_leg_total_check check(total_amount is null or total_amount=coalesce(shipping_fee,0)+coalesce(handling_fee,0)+coalesce(last_mile_fee,0));
alter table public.fees drop constraint if exists fees_two_leg_complete_check;
alter table public.fees add constraint fees_two_leg_complete_check check(fee_breakdown_version<>2 or (last_mile_fee is not null and coalesce(length(trim(last_mile_note)),0) between 1 and 500));
alter table public.route_pricing drop constraint if exists route_cbm_complete_check;
alter table public.route_pricing add constraint route_cbm_complete_check check(billing_basis<>'cbm' or (price_per_cbm is not null and minimum_cbm is not null and price_per_cbm>0 and price_per_cbm<10000000 and minimum_cbm>0 and minimum_cbm<100000));
insert into public.route_pricing(route_code,route_name,transport_mode,billing_basis,first_weight_kg,first_price,additional_price_per_kg,volume_divisor,handling_fee,price_per_cbm,minimum_cbm,is_test_rate,notes)
values('ID-SEA','印尼海运专线','sea','cbm',0.5,0,0,6000,18,600,0.1,true,'测试运价：¥600/立方米，最低0.1立方米，操作费¥18；仅用于验证流程，正式使用前请运营按实际报价修改。')
on conflict(route_code) do nothing;

create or replace function public.admin_save_transport_route(p_config jsonb,p_expected_updated_at timestamptz)
returns public.route_pricing language plpgsql security definer set search_path=public as $$
declare old public.route_pricing; r public.route_pricing; k text; n numeric;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role='admin') then raise exception '仅运营管理员可维护线路';end if;
 select * into old from public.route_pricing where route_code=p_config->>'route_code' for update;
 if old.route_code is null or old.updated_at is distinct from p_expected_updated_at then raise exception '线路已变更，请刷新后重新编辑';end if;
 if (p_config->>'billing_basis') is distinct from old.billing_basis or (p_config->>'transport_mode') is distinct from old.transport_mode then raise exception '不可更改已有线路的运输及计费方式';end if;
 foreach k in array array['first_weight_kg','first_price','additional_price_per_kg','volume_divisor','handling_fee'] loop
   n:=(p_config->>k)::numeric;
   if n is null or n<0 or n>=10000000 or n::text in ('NaN','Infinity','-Infinity') then raise exception '无效计费参数：%',k;end if;
 end loop;
 if (p_config->>'first_weight_kg')::numeric<=0 or (p_config->>'volume_divisor')::numeric<=0 then raise exception '首重和体积系数必须大于零';end if;
 if coalesce(p_config->>'billing_basis','') not in ('kg','cbm') or coalesce(p_config->>'transport_mode','') not in ('air','sea')
   or length(trim(coalesce(p_config->>'route_name',''))) not between 1 and 120
   or length(coalesce(p_config->>'notes',''))>2000 then raise exception '请完整填写线路资料';end if;
 update public.route_pricing set route_name=trim(p_config->>'route_name'),transport_mode=p_config->>'transport_mode',billing_basis=p_config->>'billing_basis',
   first_weight_kg=(p_config->>'first_weight_kg')::numeric,first_price=(p_config->>'first_price')::numeric,additional_price_per_kg=(p_config->>'additional_price_per_kg')::numeric,
   volume_divisor=(p_config->>'volume_divisor')::numeric,handling_fee=(p_config->>'handling_fee')::numeric,price_per_cbm=nullif(p_config->>'price_per_cbm','')::numeric,
   minimum_cbm=nullif(p_config->>'minimum_cbm','')::numeric,is_test_rate=coalesce((p_config->>'is_test_rate')::boolean,true),is_active=coalesce((p_config->>'is_active')::boolean,false),notes=p_config->>'notes'
 where route_code=old.route_code returning * into r;
 if r.first_weight_kg is null or r.first_price is null or r.additional_price_per_kg is null or r.volume_divisor is null or r.handling_fee is null
    or (r.billing_basis='cbm' and (r.price_per_cbm is null or r.minimum_cbm is null)) then raise exception '计费参数不能为空';end if;
 insert into public.audit_logs(actor_id,action,entity_type,before_data,after_data) values(auth.uid(),'transport_route_updated','route_pricing',to_jsonb(old),to_jsonb(r));
 return r;
end $$;
revoke all on function public.admin_save_transport_route(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_save_transport_route(jsonb,timestamptz) to authenticated;

create or replace function public.estimate_parcels_internal(ids uuid[],r public.route_pricing)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.parcels; w numeric:=0; vol numeric:=0; cbm numeric:=0; bw numeric; ship numeric; missing jsonb:='[]'; measured int:=0; v numeric[]; bcbm numeric;
begin
 for p in select * from public.parcels where id=any(ids) loop
  if p.actual_weight_kg>0 and p.length_cm>0 and p.width_cm>0 and p.height_cm>0 then
   v:=array[p.actual_weight_kg,p.length_cm,p.width_cm,p.height_cm];measured:=measured+1;
  elsif p.declared_weight_kg>0 and p.declared_length_cm>0 and p.declared_width_cm>0 and p.declared_height_cm>0 then
   v:=array[p.declared_weight_kg,p.declared_length_cm,p.declared_width_cm,p.declared_height_cm];
  else missing:=missing||jsonb_build_array(p.tracking_no);continue;end if;
  w:=w+v[1];vol:=vol+v[2]*v[3]*v[4]/r.volume_divisor;cbm:=cbm+v[2]*v[3]*v[4]/1000000;
 end loop;
 if not r.is_active or (r.billing_basis='cbm' and (r.price_per_cbm is null or r.minimum_cbm is null)) then return jsonb_build_object('status','no_route');end if;
 if jsonb_array_length(missing)>0 then return jsonb_build_object('status','incomplete','missing',missing,'count',cardinality(ids));end if;
 w:=round(w,3);vol:=round(vol,3);bw:=greatest(w,vol);cbm:=ceil(cbm*1000000)/1000000;
 if r.billing_basis='cbm' then bcbm:=greatest(cbm,r.minimum_cbm);ship:=round(bcbm*r.price_per_cbm,2);
 else ship:=round(r.first_price+greatest(bw-r.first_weight_kg,0)*r.additional_price_per_kg,2);end if;
 return jsonb_build_object('status','ready','count',cardinality(ids),'weight',w,'volume',vol,'billable',bw,'volumeCbm',cbm,'billableCbm',bcbm,
  'billingBasis',r.billing_basis,'pricePerCbm',r.price_per_cbm,'minimumCbm',r.minimum_cbm,'isTestRate',r.is_test_rate,
  'shipping',ship,'handling',r.handling_fee,'total',round(ship+r.handling_fee,2),'measuredCount',measured,'routeName',r.route_name,'routeCode',r.route_code,
  'volumeDivisor',r.volume_divisor,'firstWeight',r.first_weight_kg,'firstPrice',r.first_price,'additionalPrice',r.additional_price_per_kg,'pricingUpdatedAt',r.updated_at,'estimatedAt',now());
end $$;

create or replace function public.warehouse_confirm_transport_fees(
  p_order_id uuid,
  p_measurements jsonb,
  p_last_mile_fee numeric,
  p_last_mile_note text
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
  if p_last_mile_fee is null or p_last_mile_fee<0 or p_last_mile_fee>=10000000
    or p_last_mile_fee<>round(p_last_mile_fee,2) or p_last_mile_fee::text in ('NaN','Infinity','-Infinity')
    or coalesce(length(trim(p_last_mile_note)),0) not between 1 and 500 then
    raise exception '请填写有效尾程配送报价及说明；尚未报价不可确认费用';
  end if;
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
  v_total := round(v_shipping_fee + v_handling_fee + p_last_mile_fee, 2);

  insert into public.fees (
    order_id, actual_weight_kg, volume_weight_kg, billable_weight_kg,
    shipping_fee, handling_fee, total_amount, confirmed_by, confirmed_at, billing_basis, volume_cbm, billable_cbm, pricing_snapshot, fee_breakdown_version, last_mile_fee, last_mile_note
  ) values (
    p_order_id, v_actual_weight, v_volume_weight, v_billable_weight,
    v_shipping_fee, v_handling_fee, v_total, auth.uid(), now(), v_pricing.billing_basis, v_cbm, v_billable_cbm, to_jsonb(v_pricing), 2, p_last_mile_fee, trim(p_last_mile_note)
  ) on conflict (order_id) do update set
    fee_breakdown_version=2,last_mile_fee=excluded.last_mile_fee,last_mile_note=excluded.last_mile_note,
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
          '已确认头程运输、国内仓操作费与印尼尾程配送费，等待商家一次付款', v_order.origin_warehouse_name, auth.uid());
  return v_fee;
end;
$$;


revoke all on function public.warehouse_confirm_transport_fees(uuid,jsonb,numeric,text) from public,anon;
grant execute on function public.warehouse_confirm_transport_fees(uuid,jsonb,numeric,text) to authenticated;
-- 旧页面不允许跳过尾程报价；请刷新到新版页面。
revoke all on function public.warehouse_confirm_measurements(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.confirm_order_fee(uuid,numeric,numeric,numeric,numeric) from public,anon,authenticated;
comment on column public.fees.shipping_fee is 'v2 为深圳仓到印尼海外仓头程运输费；v1 历史记录保持原含义';
comment on column public.fees.last_mile_fee is '印尼海外仓到订单消费者地址的尾程配送费，CNY；NULL 为未报价或历史未拆分';
notify pgrst,'reload schema';
commit;
select 'v1.7 sea route + two-leg fees installed' as result;
