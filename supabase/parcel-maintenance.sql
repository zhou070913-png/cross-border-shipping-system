-- 预报包裹纠错：仅本人、未入库且未关联订单的包裹可编辑或删除。
-- 不授予商家直接 UPDATE/DELETE 表权限；复用锁与审计记录。
begin;

create or replace function public.merchant_edit_parcel(
  p_parcel_id uuid, p_tracking text, p_item_name text, p_carrier text,
  p_expected_updated_at timestamptz
) returns public.parcels language plpgsql security definer set search_path=public as $$
declare v public.parcels; result public.parcels;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'merchant'::public.app_role then
    raise exception '仅商家可修改本人预报包裹';
  end if;
  select * into v from public.parcels where id=p_parcel_id and merchant_id=auth.uid() for update;
  if v.id is null then raise exception '包裹不存在或无权操作，请刷新列表'; end if;
  if v.status<>'pre_advised' or v.received_at is not null or v.measured_at is not null
    or v.actual_weight_kg is not null or v.length_cm is not null or v.width_cm is not null or v.height_cm is not null
    or exists(select 1 from public.order_parcels where parcel_id=v.id)
    or exists(select 1 from public.tracking_events where parcel_id=v.id) then
    raise exception '包裹已入库、开始作业或关联订单，不能编辑或删除，请联系运营处理';
  end if;
  if p_expected_updated_at is null or v.updated_at is distinct from p_expected_updated_at then
    raise exception '包裹信息已变化，请刷新后重新操作';
  end if;
  if length(trim(coalesce(p_tracking,''))) not between 5 and 80
    or length(trim(coalesce(p_item_name,''))) not between 1 and 120
    or length(trim(coalesce(p_carrier,'')))>80 then
    raise exception '请填写5至80位快递单号、1至120字品名，快递公司不超过80字';
  end if;
  update public.parcels set tracking_no=trim(p_tracking),parcel_no=trim(p_tracking),
    item_name=trim(p_item_name),carrier=nullif(trim(p_carrier),''),updated_at=clock_timestamp()
    where id=v.id returning * into result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'merchant_edit_parcel','parcel',v.id,to_jsonb(v),to_jsonb(result));
  return result;
exception when unique_violation then
  raise exception '该国内快递单号已存在，请核对后再保存';
end;
$$;

create or replace function public.merchant_delete_parcel(
  p_parcel_id uuid, p_expected_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare v public.parcels;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'merchant'::public.app_role then
    raise exception '仅商家可删除本人预报包裹';
  end if;
  select * into v from public.parcels where id=p_parcel_id and merchant_id=auth.uid() for update;
  if v.id is null then raise exception '包裹不存在或无权操作，请刷新列表'; end if;
  if v.status<>'pre_advised' or v.received_at is not null or v.measured_at is not null
    or v.actual_weight_kg is not null or v.length_cm is not null or v.width_cm is not null or v.height_cm is not null
    or exists(select 1 from public.order_parcels where parcel_id=v.id)
    or exists(select 1 from public.tracking_events where parcel_id=v.id) then
    raise exception '包裹已入库、开始作业或关联订单，不能编辑或删除，请联系运营处理';
  end if;
  if p_expected_updated_at is null or v.updated_at is distinct from p_expected_updated_at then
    raise exception '包裹信息已变化，请刷新后重新操作';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'merchant_delete_parcel','parcel',v.id,to_jsonb(v),null);
  delete from public.parcels where id=v.id;
  return v.id;
end;
$$;

revoke all on function public.merchant_edit_parcel(uuid,text,text,text,timestamptz) from public,anon;
revoke all on function public.merchant_delete_parcel(uuid,timestamptz) from public,anon;
grant execute on function public.merchant_edit_parcel(uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.merchant_delete_parcel(uuid,timestamptz) to authenticated;
commit;

select proname as installed_function from pg_proc
where oid in ('public.merchant_edit_parcel(uuid,text,text,text,timestamptz)'::regprocedure,
              'public.merchant_delete_parcel(uuid,timestamptz)'::regprocedure);
