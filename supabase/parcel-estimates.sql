-- v1.5 预报重量/尺寸与下单预估。只添加字段及函数，不改已有实际测量和应付金额。
begin;
alter table public.parcels add column if not exists declared_weight_kg numeric(10,3);
alter table public.parcels add column if not exists declared_length_cm numeric(10,2);
alter table public.parcels add column if not exists declared_width_cm numeric(10,2);
alter table public.parcels add column if not exists declared_height_cm numeric(10,2);
alter table public.fees add column if not exists estimate_snapshot jsonb;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.parcels'::regclass and conname='parcels_declared_measurements_check') then
    alter table public.parcels add constraint parcels_declared_measurements_check check (
      (declared_weight_kg is null or declared_weight_kg>0 and declared_weight_kg<=10000) and
      ((declared_length_cm is null and declared_width_cm is null and declared_height_cm is null) or
       (declared_length_cm is not null and declared_width_cm is not null and declared_height_cm is not null
        and declared_length_cm>0 and declared_length_cm<=10000 and declared_width_cm>0 and declared_width_cm<=10000 and declared_height_cm>0 and declared_height_cm<=10000)));
  end if;
end $$;

create or replace function public.validate_declared_measurements(p jsonb)
returns void language plpgsql immutable set search_path=public as $$
declare k text; n numeric; i int:=0; dims int:=0;
begin
  if p is null or jsonb_typeof(p)<>'object' then raise exception '预报数据格式不正确'; end if;
  foreach k in array array['weight_kg','length_cm','width_cm','height_cm'] loop
    n:=(p->>k)::numeric;
    if n is not null and (n<=0 or n>10000 or n<>round(n,case when i=0 then 3 else 2 end)) then
      raise exception '重量须为正数且最多3位小数，尺寸最多2位小数，均不超过10000';
    end if;
    if i>0 and n is not null then dims:=dims+1; end if;
    i:=i+1;
  end loop;
  if dims not in (0,3) then raise exception '长、宽、高请同时填写，或全部留空'; end if;
end $$;

create or replace function public.merchant_pre_advise_with_measurements(p_tracking text,p_item_name text,p_carrier text,p_measurements jsonb)
returns public.parcels language plpgsql security definer set search_path=public as $$
declare v public.parcels;
begin
  perform public.validate_declared_measurements(p_measurements);
  v:=public.merchant_pre_advise(p_tracking,p_item_name,p_carrier);
  update public.parcels set declared_weight_kg=(p_measurements->>'weight_kg')::numeric,
    declared_length_cm=(p_measurements->>'length_cm')::numeric,declared_width_cm=(p_measurements->>'width_cm')::numeric,
    declared_height_cm=(p_measurements->>'height_cm')::numeric where id=v.id returning * into v;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'merchant_pre_advise_with_measurements','parcel',v.id,to_jsonb(v));
  return v;
end $$;

create or replace function public.merchant_edit_parcel_with_measurements(p_parcel_id uuid,p_tracking text,p_item_name text,p_carrier text,p_expected_updated_at timestamptz,p_measurements jsonb)
returns public.parcels language plpgsql security definer set search_path=public as $$
declare v public.parcels; original public.parcels;
begin
  perform public.validate_declared_measurements(p_measurements);
  -- 原函数执行身份、归属、状态、版本检查并锁行；整个调用同一事务，失败全部回滚。
  v:=public.merchant_edit_parcel(p_parcel_id,p_tracking,p_item_name,p_carrier,p_expected_updated_at);
  original:=v;
  update public.parcels set declared_weight_kg=(p_measurements->>'weight_kg')::numeric,
    declared_length_cm=(p_measurements->>'length_cm')::numeric,declared_width_cm=(p_measurements->>'width_cm')::numeric,
    declared_height_cm=(p_measurements->>'height_cm')::numeric where id=v.id returning * into v;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'merchant_edit_declared_measurements','parcel',v.id,to_jsonb(original),to_jsonb(v));
  return v;
end $$;

-- 仅供已校验并锁定包裹归属的创建订单函数调用，不向客户端开放。
create or replace function public.estimate_parcels_internal(ids uuid[],r public.route_pricing)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.parcels; w numeric:=0; vol numeric:=0; bw numeric; ship numeric; missing jsonb:='[]'; measured int:=0; v numeric[];
begin
  for p in select * from public.parcels where id=any(ids) loop
    if p.actual_weight_kg>0 and p.length_cm>0 and p.width_cm>0 and p.height_cm>0 then
      v:=array[p.actual_weight_kg,p.length_cm,p.width_cm,p.height_cm];measured:=measured+1;
    elsif p.declared_weight_kg>0 and p.declared_length_cm>0 and p.declared_width_cm>0 and p.declared_height_cm>0 then
      v:=array[p.declared_weight_kg,p.declared_length_cm,p.declared_width_cm,p.declared_height_cm];
    else missing:=missing||jsonb_build_array(p.tracking_no);continue;
    end if;
    w:=w+v[1];vol:=vol+v[2]*v[3]*v[4]/r.volume_divisor;
  end loop;
  if jsonb_array_length(missing)>0 then return jsonb_build_object('status','incomplete','missing',missing,'count',cardinality(ids)); end if;
  w:=round(w,3);vol:=round(vol,3);bw:=greatest(w,vol);
  ship:=round(r.first_price+greatest(bw-r.first_weight_kg,0)*r.additional_price_per_kg,2);
  return jsonb_build_object('status','ready','count',cardinality(ids),'weight',w,'volume',vol,'billable',bw,
    'shipping',ship,'handling',r.handling_fee,'total',round(ship+r.handling_fee,2),'measuredCount',measured,
    'routeName',r.route_name,'routeCode',r.route_code,'volumeDivisor',r.volume_divisor,'firstWeight',r.first_weight_kg,
    'firstPrice',r.first_price,'additionalPrice',r.additional_price_per_kg,'pricingUpdatedAt',r.updated_at,'estimatedAt',now());
end $$;

create or replace function public.merchant_create_from_parcels(
  p_parcel_ids uuid[], p_address_id uuid, p_route_code text, p_method text, p_note text default null
) returns public.orders language plpgsql security definer set search_path = public as $$
declare v_address public.merchant_addresses; v_warehouse public.warehouses; v_route public.route_pricing;
  v_order public.orders; v_parcel public.parcels; v_count integer := 0; v_estimate jsonb;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'merchant'::public.app_role then raise exception '仅商家可创建订单'; end if;
  if coalesce(cardinality(p_parcel_ids),0)=0 then raise exception '至少选择一个包裹'; end if;
  if p_method is null or p_method not in ('合并为一个外箱','按品类分箱','保持原包裹分别出货') then raise exception '请选择包装方式'; end if;
  select * into v_address from public.merchant_addresses where id=p_address_id and merchant_id=auth.uid();
  if v_address.id is null then raise exception '请选择本人收货地址'; end if;
  select * into v_route from public.route_pricing where route_code=p_route_code and is_active for share;
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
  v_estimate:=public.estimate_parcels_internal(p_parcel_ids,v_route);
  insert into public.fees(order_id,estimated_shipping_fee,estimated_handling_fee,estimated_total,estimate_snapshot)
  values(v_order.id,coalesce((v_estimate->>'shipping')::numeric,0),coalesce((v_estimate->>'handling')::numeric,0),coalesce((v_estimate->>'total')::numeric,0),v_estimate);
  insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
  values(v_order.id,'order_submitted','打包申请已提交',p_method||'；等待深圳仓收货与确认费用',auth.uid());
  return v_order;
end;
$$;

revoke all on function public.validate_declared_measurements(jsonb) from public,anon,authenticated;
revoke all on function public.estimate_parcels_internal(uuid[],public.route_pricing) from public,anon,authenticated;
revoke all on function public.merchant_pre_advise_with_measurements(text,text,text,jsonb) from public,anon;
revoke all on function public.merchant_edit_parcel_with_measurements(uuid,text,text,text,timestamptz,jsonb) from public,anon;
grant execute on function public.merchant_pre_advise_with_measurements(text,text,text,jsonb) to authenticated;
grant execute on function public.merchant_edit_parcel_with_measurements(uuid,text,text,text,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'v1.5 parcel measurements + packing estimate installed' as result;
