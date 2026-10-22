-- 分段付款验收。仅测试事务写入，末尾回滚；不执行真实转账，不上传文件。
begin;
create temporary table qa_separate_results(test text,result text) on commit drop;
grant select,insert on qa_separate_results to authenticated;
select set_config('app.sep.m',(select id::text from public.profiles where role='merchant' and is_active limit 1),true);
select set_config('app.sep.a',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
select set_config('app.sep.w',(select p.id::text from public.profiles p join public.warehouses wh on wh.id=p.warehouse_id where p.role='warehouse_operator' and p.is_active and wh.code='SZ-LG-01' limit 1),true);
update public.route_pricing set price_per_cbm=600,minimum_cbm=0.1,handling_fee=18,is_active=true,is_test_rate=true where route_code='ID-SEA';
set local role authenticated;
do $$
declare m uuid:=current_setting('app.sep.m')::uuid;a uuid:=current_setting('app.sep.a')::uuid;w uuid:=current_setting('app.sep.w')::uuid;
 addr uuid;p public.parcels;h public.orders;t public.orders;again public.orders;f public.fees;ac public.payment_receiving_accounts;r public.payment_receipts;data jsonb;err text;path text;oid uuid;expected numeric;stage int;n text:='QA-SEP-'||gen_random_uuid();
begin
 if m is null or a is null or w is null then raise exception '需要启用的商家、运营、深圳仓人员';end if;
 if has_function_privilege('authenticated','public.warehouse_confirm_transport_fees(uuid,jsonb,numeric,text)','EXECUTE') then raise exception '合并收费旧入口未禁用';end if;
 perform set_config('request.jwt.claim.sub',m::text,true);
 insert into public.merchant_addresses(merchant_id,label,recipient_name,recipient_phone,country,city,address_line) values(m,'QA回滚尾程地址','测试消费者','000000','印度尼西亚','Jakarta','QA地址，不可发货') returning id into addr;
 p:=public.merchant_pre_advise_with_measurements(n,'QA分段费用','测试快递','{"weight_kg":2,"length_cm":30,"width_cm":20,"height_cm":10}');
 h:=public.merchant_create_from_parcels(array[p.id],addr,'ID-SEA','合并为一个外箱','回滚测试');
 err:=null;begin perform public.merchant_create_last_mile(h.id,null);exception when others then err:=sqlerrm;end;if err is null then raise exception '未入海外仓可建尾程';end if;
 data:=jsonb_build_array(jsonb_build_object('parcel_no',p.parcel_no,'actual_weight_kg',2,'length_cm',30,'width_cm',20,'height_cm',10));
 err:=null;begin perform public.warehouse_confirm_measurements(h.id,data);exception when others then err:=sqlerrm;end;if err is null then raise exception '商家越权确认';end if;
 perform set_config('request.jwt.claim.sub',w::text,true);perform public.warehouse_receive_order(h.id);f:=public.warehouse_confirm_measurements(h.id,data);
 if f.total_amount<>78 or f.last_mile_fee is not null or f.fee_breakdown_version<>3 then raise exception '头程不应提前收尾程费';end if;
 insert into qa_separate_results values('海运头程60+操作18=78，尾程未知不收；商家越权与提前创建尾程拒绝','PASS');
 for stage in 1..2 loop
  oid:=case when stage=1 then h.id else t.id end;expected:=case when stage=1 then 78 else 25 end;
  perform set_config('request.jwt.claim.sub',w::text,true);
  err:=null;begin perform public.warehouse_pack_order(oid,n,null);exception when others then err:=sqlerrm;end;if err is null then raise exception '本段未付款可打包';end if;
  perform set_config('request.jwt.claim.sub',m::text,true);
  select * into ac from public.payment_receiving_accounts where singleton;if ac.mode<>'test' or not ac.is_active then raise exception '验收仅允许测试收款模式';end if;
  path:=m||'/'||oid||'/'||gen_random_uuid()||'.png';insert into storage.objects(bucket_id,name,metadata) values('payment-proofs',path,'{"size":100,"mimetype":"image/png"}');
  r:=public.merchant_submit_payment_receipt(oid,path,'QA模拟付款',null,now(),'未真实转账',ac.updated_at);
  if r.amount<>expected or exists(select 1 from public.payments where order_id=oid) then raise exception '本段凭证金额错误或上传即入账';end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  err:=null;begin perform public.admin_review_payment_receipt(r.id,true,expected+1,n||stage,'QA',true);exception when others then err:=sqlerrm;end;if err is null then raise exception '错误本段金额可通过';end if;
  r:=public.admin_review_payment_receipt(r.id,true,expected,n||stage,'QA模拟核对',true);
  if (select count(*) from public.payments where order_id=oid)<>1 or (select amount from public.payments where order_id=oid)<>expected then raise exception '本段付款不唯一或金额错误';end if;
  perform set_config('request.jwt.claim.sub',w::text,true);perform public.warehouse_pack_order(oid,n||stage,'QA出库');perform public.warehouse_ship_order(oid,'QA测试承运商',n||stage);
  if stage=1 then
   perform public.warehouse_receive_overseas(h.id,'QA印尼海外仓，回滚测试位置');
   perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);err:=null;begin perform public.merchant_create_last_mile(h.id,null);exception when others then err:=sqlerrm;end;if err is null then raise exception '跨商家可建尾程';end if;
   perform set_config('request.jwt.claim.sub',m::text,true);t:=public.merchant_create_last_mile(h.id,addr);again:=public.merchant_create_last_mile(h.id,addr);
   if t.id<>again.id or t.parent_order_id<>h.id or t.transport_leg<>'last_mile' or t.status<>'warehouse_received' then raise exception '尾程关联或幂等错误';end if;
   err:=null;begin perform public.warehouse_quote_last_mile(t.id,25,'QA报价');exception when others then err:=sqlerrm;end;if err is null then raise exception '商家可核尾程价';end if;
   perform set_config('request.jwt.claim.sub',w::text,true);
   err:=null;begin perform public.warehouse_confirm_measurements(t.id,data);exception when others then err:=sqlerrm;end;if err is null then raise exception '尾程可误用头程测量';end if;
   err:=null;begin perform public.warehouse_quote_last_mile(t.id,'NaN'::numeric,'QA');exception when others then err:=sqlerrm;end;if err is null then raise exception '无效尾程报价未拒绝';end if;
   f:=public.warehouse_quote_last_mile(t.id,25,'QA承运商Jakarta市区配送价，CNY');if f.total_amount<>25 or f.shipping_fee<>0 or f.last_mile_fee<>25 or f.fee_breakdown_version<>4 then raise exception '尾程重复计入头程费';end if;
   insert into qa_separate_results values('头程78独立审核与锁费、出货入印尼仓后创建唯一尾程单，尾程单独报价25','PASS');
  else
   if not exists(select 1 from public.tracking_events where order_id=t.id and event_title='印尼尾程已出库配送') then raise exception '尾程误显示离港出境';end if;
   perform public.warehouse_complete_delivery(t.id,'QA测试签收依据，回滚');
   if (select status from public.orders where id=t.id)<>'delivered' then raise exception '尾程签收状态错误';end if;
  end if;
 end loop;
 if (select total_amount from public.fees where order_id=h.id)<>78 or (select amount from public.payments where order_id=h.id)<>78 or (select amount from public.payments where order_id=t.id)<>25 then raise exception '尾程付款污染头程账单';end if;
 insert into qa_separate_results values('尾程25独立凭证与审核、未付款禁止出库、配送签收；头程78不变','PASS');
 insert into qa_separate_results values('每段仅一条付款；分段总计103，但各自78与25独立结算，不是补款','PASS');
end $$;
reset role;
select * from qa_separate_results;
rollback;
