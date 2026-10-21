-- 事务内临时夹具，结束全部回滚，不修改现有包裹订单。
begin;
create temporary table qa_estimates_results(test text,result text) on commit drop;
grant select,insert on qa_estimates_results to authenticated;
select set_config('app.est.merchant',(select id::text from public.profiles where role='merchant' and is_active limit 1),true);
select set_config('app.est.admin',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
set local role authenticated;
do $$
declare m uuid:=current_setting('app.est.merchant')::uuid; a uuid:=current_setting('app.est.admin')::uuid;
 p public.parcels; p2 public.parcels; empty_p public.parcels; edited public.parcels; ord public.orders; f public.fees;
 addr uuid; r public.route_pricing; q jsonb; expected numeric; msg text; bad jsonb;
begin
 perform set_config('request.jwt.claim.sub',m::text,true);
 p:=public.merchant_pre_advise_with_measurements('QA-EST-'||gen_random_uuid()::text,'预报尺寸回滚验收',null,'{"weight_kg":2,"length_cm":30,"width_cm":20,"height_cm":10}');
 if p.declared_weight_kg<>2 or p.declared_length_cm<>30 or p.actual_weight_kg is not null or p.length_cm is not null or p.status<>'pre_advised' then raise exception '预报保存或实测隔离失败'; end if;
 insert into qa_estimates_results values('预报重量尺寸原子保存，实测字段保持空值','PASS');
 edited:=public.merchant_edit_parcel_with_measurements(p.id,p.tracking_no,'修改后',null,p.updated_at,'{"weight_kg":3.123,"length_cm":40,"width_cm":20,"height_cm":10}');
 if edited.declared_weight_kg<>3.123 or edited.actual_weight_kg is not null then raise exception '编辑预报失败'; end if;
 insert into qa_estimates_results values('待入库包裹可修改预报且保持实测隔离','PASS');
 foreach bad in array array['{"weight_kg":0}'::jsonb,'{"weight_kg":1,"length_cm":2}'::jsonb,'{"weight_kg":1.1234}'::jsonb,'{"weight_kg":"NaN"}'::jsonb] loop
   msg:=null;
   begin perform public.merchant_edit_parcel_with_measurements(p.id,p.tracking_no,'不应保存',null,edited.updated_at,bad);
   exception when others then msg:=sqlerrm; end;
   if msg is null then raise exception '无效预报未拒绝：%',bad; end if;
 end loop;
 select * into p from public.parcels where id=p.id;
 if p.item_name<>'修改后' then raise exception '无效更新未回滚'; end if;
 insert into qa_estimates_results values('零值、缺少尺寸、超精度、NaN均拒绝且不部分保存','PASS');
 empty_p:=public.merchant_pre_advise_with_measurements('QA-EST-'||gen_random_uuid()::text,'允许选填',null,'{}');
 if empty_p.declared_weight_kg is not null then raise exception '选填不兼容'; end if;
 insert into qa_estimates_results values('全部选填为空兼容旧流程','PASS');
 select id into addr from public.merchant_addresses where merchant_id=m limit 1;
 select * into r from public.route_pricing where is_active and route_code like 'ID-%' order by route_code limit 1;
 if addr is null or r.route_code is null then raise exception '缺少测试地址或运价'; end if;
 ord:=public.merchant_create_from_parcels(array[p.id],addr,r.route_code,'合并为一个外箱','回滚验收');
 select * into f from public.fees where order_id=ord.id;
 expected:=round(r.first_price+greatest(greatest(3.123,round(40*20*10/r.volume_divisor,3))-r.first_weight_kg,0)*r.additional_price_per_kg,2)+r.handling_fee;
 if f.estimated_total<>expected or f.estimate_snapshot->>'status'<>'ready' or f.total_amount is not null or ord.status<>'submitted' or exists(select 1 from public.payments where order_id=ord.id) then raise exception '预估不符或提前生成应付/付款'; end if;
 insert into qa_estimates_results values('服务端按当前运价生成下单快照，不生成应付或付款','PASS');
 msg:=null;
 begin perform public.merchant_edit_parcel_with_measurements(p.id,p.tracking_no,'锁定后修改',null,p.updated_at,'{}'); exception when others then msg:=sqlerrm;end;
 if msg is null or msg not like '%关联订单%' then raise exception '关联订单未锁定'; end if;
 insert into qa_estimates_results values('申请打包后禁止修改预报','PASS');
 ord:=public.merchant_create_from_parcels(array[empty_p.id],addr,r.route_code,'合并为一个外箱',null);
 select * into f from public.fees where order_id=ord.id;
 if f.estimate_snapshot->>'status'<>'incomplete' or f.estimate_snapshot ? 'total' or f.total_amount is not null then raise exception '资料不全显示错误预估'; end if;
 insert into qa_estimates_results values('缺资料仍可申请，快照明确不完整且无虚假总额','PASS');
 perform set_config('request.jwt.claim.sub',a::text,true);
 msg:=null;
 begin perform public.merchant_pre_advise_with_measurements('QA-EST-'||gen_random_uuid()::text,'角色拦截',null,'{}');exception when others then msg:=sqlerrm;end;
 if msg is null or msg not like '%仅商家%' then raise exception '非商家未拒绝'; end if;
 msg:=null;
 begin perform public.merchant_edit_parcel_with_measurements(empty_p.id,empty_p.tracking_no,'越权',null,empty_p.updated_at,'{}');exception when others then msg:=sqlerrm;end;
 if msg is null then raise exception '越权修改未拒绝'; end if;
 insert into qa_estimates_results values('非商家/他人不能预报或修改','PASS');
end $$;
reset role;
do $$
declare r public.route_pricing; p public.parcels; q jsonb; m uuid:=current_setting('app.est.merchant')::uuid; wh uuid; t text;
begin
 select * into r from public.route_pricing where is_active and route_code like 'ID-%' limit 1;
 select id into wh from public.warehouses where code='SZ-LG-01';
 t:='QA-EST-'||gen_random_uuid()::text;
 insert into public.parcels(parcel_no,tracking_no,item_name,merchant_id,warehouse_id,actual_weight_kg,length_cm,width_cm,height_cm,declared_weight_kg,declared_length_cm,declared_width_cm,declared_height_cm)
 values(t,t,'实测优先回滚',m,wh,1,60,40,40,5,10,10,10) returning * into p;
 q:=public.estimate_parcels_internal(array[p.id],r);
 if (q->>'weight')::numeric<>1 or (q->>'volume')::numeric<>round(96000/r.volume_divisor,3) or (q->>'measuredCount')::int<>1 then raise exception '实测优先或体积重计算失败'; end if;
 if has_function_privilege('authenticated','public.estimate_parcels_internal(uuid[],public.route_pricing)','execute') or has_function_privilege('anon','public.merchant_pre_advise_with_measurements(text,text,text,jsonb)','execute') then raise exception '权限设置错误'; end if;
 insert into qa_estimates_results values('实测优先、体积重取大、内部估算函数不公开','PASS');
end $$;
select * from qa_estimates_results;
rollback;
