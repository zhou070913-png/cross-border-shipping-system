-- 本地 PostgreSQL / 测试项目事务验收，所有测试写入末尾回滚。不执行真实运输或付款。
begin;
create temporary table qa_cargo_results(test text,result text) on commit drop;
grant select,insert on qa_cargo_results to authenticated;
select set_config('app.cargo.m',(select id::text from public.profiles where role='merchant' and is_active limit 1),true);
select set_config('app.cargo.a',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
select set_config('app.cargo.w',(select p.id::text from public.profiles p join public.warehouses wh on wh.id=p.warehouse_id where p.role='warehouse_operator' and p.is_active and wh.code='SZ-LG-01' limit 1),true);
update public.route_pricing set sea_price_per_kg=1.5,price_per_cbm=600,minimum_cbm=0.1,handling_fee=18,is_active=true where route_code='ID-SEA';
set local role authenticated;
do $$
declare m uuid:=current_setting('app.cargo.m')::uuid;a uuid:=current_setting('app.cargo.a')::uuid;w uuid:=current_setting('app.cargo.w')::uuid;
 r public.route_pricing;after_r public.route_pricing;p public.parcels;h public.orders;f public.fees;q jsonb;data jsonb;err text;old_total numeric;old_snapshot jsonb;cfg jsonb;old_version timestamptz;
begin
 for r in select * from public.route_pricing where route_code in ('ID-AIR','ID-SEA','ID-AIR-SENSITIVE','ID-SEA-SENSITIVE') loop
  perform set_config('request.jwt.claim.sub',m::text,true);
  p:=public.merchant_pre_advise_with_measurements('QA-CARGO-'||gen_random_uuid(),'测试包裹','测试快递','{"weight_kg":100,"length_cm":100,"width_cm":50,"height_cm":40}');
  h:=public.merchant_create_head_order(array[p.id],(select id from public.overseas_warehouses where code='ID-JKT-TEST'),r.route_code,'保持原包裹分别出货','QA回滚测试');
  if h.route_code<>r.route_code or h.route_name<>r.route_name then raise exception '渠道未保存在订单';end if;
  perform set_config('request.jwt.claim.sub',w::text,true);perform public.warehouse_receive_order(h.id);
  data:=jsonb_build_array(jsonb_build_object('parcel_no',p.parcel_no,'actual_weight_kg',100,'length_cm',100,'width_cm',50,'height_cm',40));
  f:=public.warehouse_confirm_measurements(h.id,data);
  if f.pricing_snapshot->>'cargo_type'<>r.cargo_type or f.pricing_snapshot->>'route_code'<>r.route_code then raise exception '实际费用未保存渠道快照';end if;
  if r.route_code='ID-SEA' and (f.shipping_fee<>150 or f.total_amount<>168) then raise exception '海运重量费取高错误';end if;
  old_total:=f.total_amount;old_snapshot:=f.pricing_snapshot;
  perform set_config('request.jwt.claim.sub',a::text,true);old_version:=r.updated_at;
  cfg:=to_jsonb(r)||jsonb_build_object('handling_fee',r.handling_fee+1);
  if r.billing_basis='cbm' then cfg:=cfg||jsonb_build_object('sea_price_per_kg',r.sea_price_per_kg+0.25);end if;
  after_r:=public.admin_save_transport_route(cfg,old_version);
  if r.billing_basis='cbm' and after_r.sea_price_per_kg<>r.sea_price_per_kg+0.25 then raise exception '海运重量单价未保存';end if;
  if (select total_amount from public.fees where order_id=h.id)<>old_total or (select pricing_snapshot from public.fees where order_id=h.id)<>old_snapshot then raise exception '新运价污染历史账单';end if;
  err:=null;begin perform public.admin_save_transport_route(cfg,old_version);exception when others then err:=sqlerrm;end;if err is null then raise exception '旧版本覆盖未拦截';end if;
  perform set_config('request.jwt.claim.sub',m::text,true);err:=null;begin perform public.admin_save_transport_route(to_jsonb(after_r),after_r.updated_at);exception when others then err:=sqlerrm;end;if err is null then raise exception '商家可修改运价';end if;
  insert into qa_cargo_results values(r.route_code||' 创建/仓库核价/类型快照/管理员修改/历史锁费/权限与版本校验','PASS');
 end loop;
end $$;
reset role;
-- 内部预估与计算器使用同一公式；明确体积胜出、重量胜出和最低体积。
do $$
declare m uuid:=current_setting('app.cargo.m')::uuid;r public.route_pricing;p public.parcels;q jsonb;
begin
 select * into r from public.route_pricing where route_code='ID-SEA';r.sea_price_per_kg:=1.5;r.price_per_cbm:=600;r.minimum_cbm:=0.1;r.handling_fee:=18;
 perform set_config('request.jwt.claim.sub',m::text,true);
 p:=public.merchant_pre_advise_with_measurements('QA-CALC-'||gen_random_uuid(),'试算','测试快递','{"weight_kg":100,"length_cm":100,"width_cm":50,"height_cm":40}');
 q:=public.estimate_parcels_internal(array[p.id],r);
 if (q->>'shipping')::numeric<>150 or (q->>'seaVolumeCharge')::numeric<>120 or (q->>'seaWeightCharge')::numeric<>150 then raise exception '预估未取两项较高值';end if;
 update public.parcels set declared_weight_kg=2 where id=p.id;q:=public.estimate_parcels_internal(array[p.id],r);if (q->>'shipping')::numeric<>120 then raise exception '体积费较高计算错误';end if;
 update public.parcels set declared_length_cm=30,declared_width_cm=20,declared_height_cm=10 where id=p.id;q:=public.estimate_parcels_internal(array[p.id],r);if (q->>'shipping')::numeric<>60 then raise exception '最低体积未应用';end if;
 insert into qa_cargo_results values('海运体积费120/重量费150取150；体积费较高与最低体积计算','PASS');
end $$;
select * from qa_cargo_results;
rollback;
