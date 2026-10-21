-- 付款审核验收：全事务回滚，不更改现有业务记录。不上传文件，仅测试存储元数据与权限。
begin;
create temporary table qa_payment_results(test text,result text) on commit drop;
grant select,insert on qa_payment_results to authenticated;
select set_config('app.pay.m',(select id::text from public.profiles where role='merchant' and is_active limit 1),true);
select set_config('app.pay.a',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
select set_config('app.pay.w',(select id::text from public.profiles where role='warehouse_operator' and is_active and warehouse_id is not null limit 1),true);
do $$
declare m uuid:=current_setting('app.pay.m')::uuid; a uuid:=current_setting('app.pay.a')::uuid; w uuid:=current_setting('app.pay.w')::uuid; wh public.warehouses; o public.orders; p public.parcels; i int; path text;
begin
 if m is null or a is null or w is null then raise exception '需要现有三个角色账号';end if;
 select * into wh from public.warehouses where id=(select warehouse_id from public.profiles where id=w);
 for i in 1..3 loop
  insert into public.orders(order_no,merchant_id,warehouse_id,status,destination_address,recipient_name,recipient_phone,route_code,route_name,origin_warehouse_name,origin_warehouse_address,parcel_count)
   values('QA-PAY-'||gen_random_uuid(),m,wh.id,'awaiting_payment','测试地址，不可发货','QA','000000','ID-AIR','QA测试线路',wh.name,wh.address,1) returning * into o;
  perform set_config('app.pay.o'||i,o.id::text,true);
  insert into public.parcels(parcel_no,tracking_no,item_name,merchant_id,warehouse_id,status,actual_weight_kg,length_cm,width_cm,height_cm)
   values('QA-'||gen_random_uuid(),'QA-'||gen_random_uuid(),'付款回滚验收',m,wh.id,'measured',1,10,10,10) returning * into p;
  insert into public.order_parcels(order_id,parcel_id) values(o.id,p.id);
  insert into public.fees(order_id,total_amount,shipping_fee,handling_fee,currency,confirmed_at) values(o.id,128,110,18,'CNY',now());
  path:=m::text||'/'||o.id::text||'/'||gen_random_uuid()::text||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('payment-proofs',path,'{"size":100,"mimetype":"image/png"}');
  perform set_config('app.pay.path'||i,path,true);
 end loop;
end $$;
set local role authenticated;
do $$
declare m uuid:=current_setting('app.pay.m')::uuid; a uuid:=current_setting('app.pay.a')::uuid; w uuid:=current_setting('app.pay.w')::uuid;
 oid uuid:=current_setting('app.pay.o1')::uuid; oid2 uuid:=current_setting('app.pay.o2')::uuid; oid3 uuid:=current_setting('app.pay.o3')::uuid;
 ac public.payment_receiving_accounts; r public.payment_receipts; r2 public.payment_receipts; r3 public.payment_receipts; err text; n int; cfg jsonb;
begin
 perform set_config('request.jwt.claim.sub',m::text,true);
 select * into ac from public.payment_receiving_accounts where singleton;
 if ac.mode<>'test' or ac.account_number<>'DEMO-NOT-A-BANK-0001' then raise exception '不是预期虚拟账号，请勿跑测试';end if;
 err:=null;begin perform public.record_order_payment(oid,'bank_transfer',null,null);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '旧付款函数未禁止';end if;
 err:=null;begin update public.orders set status='paid' where id=oid;exception when others then err:=sqlerrm;end;
 if err is null then raise exception '可直接改付款状态';end if;
 err:=null;begin insert into public.payments(order_id,merchant_id,amount,status) values(oid,m,128,'paid');exception when others then err:=sqlerrm;end;
 if err is null then raise exception '可直接写付款表';end if;
 insert into qa_payment_results values('禁止旧付款函数、订单直改和付款表绕过审核','PASS');
 err:=null;begin perform public.merchant_submit_payment_receipt(oid,current_setting('app.pay.path2'),'QA',null,now(),null,ac.updated_at);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '跨单文件未拒绝';end if;
 err:=null;begin perform public.merchant_submit_payment_receipt(oid,current_setting('app.pay.path1'),'QA',null,now(),null,ac.updated_at-interval '1 second');exception when others then err:=sqlerrm;end;
 if err is null then raise exception '过期账户版本未拒绝';end if;
 r:=public.merchant_submit_payment_receipt(oid,current_setting('app.pay.path1'),'QA测试',null,now(),'回滚测试',ac.updated_at);
 r2:=public.merchant_submit_payment_receipt(oid,current_setting('app.pay.path1'),'QA测试',null,now(),'重试',ac.updated_at);
 if r2.id<>r.id or r.status<>'pending' or not r.is_test or exists(select 1 from public.payments where order_id=oid) or (select status from public.orders where id=oid)<>'awaiting_payment' then raise exception '提交即付款或重试不幂等';end if;
 perform set_config('app.pay.receipt1',r.id::text,true);
 insert into qa_payment_results values('跨单文件与过期配置拒绝，提交待审核，重试幂等且不生成付款','PASS');
 err:=null;begin perform public.admin_review_payment_receipt(r.id,true,128,'QA-REF','',true);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '商家可审核';end if;
 perform set_config('request.jwt.claim.sub',w::text,true);
 if exists(select 1 from public.payment_receipts where id=r.id) or exists(select 1 from storage.objects where bucket_id='payment-proofs' and name=current_setting('app.pay.path1')) then raise exception '仓库可看付款凭证';end if;
 err:=null;begin perform public.warehouse_pack_order(oid,'TEST-BOX','回滚');exception when others then err:=sqlerrm;end;
 if err is null then raise exception '未审核可打包';end if;
 insert into qa_payment_results values('商家不能审核、仓库看不到凭证且待审核不能打包','PASS');
 perform set_config('request.jwt.claim.sub',a::text,true);
 err:=null;begin perform public.admin_review_payment_receipt(r.id,true,127,'QA-REF','',true);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '金额不一致可通过';end if;
 err:=null;begin perform public.admin_review_payment_receipt(r.id,true,128,'QA-REF','',false);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '未核实可通过';end if;
 err:=null;begin perform public.admin_review_payment_receipt(r.id,false,null,null,'',false);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '无理由可退回';end if;
 r:=public.admin_review_payment_receipt(r.id,false,null,null,'图片不清，请补清晰凭证',false);
 if r.status<>'rejected' or exists(select 1 from public.payments where order_id=oid) or (select status from public.orders where id=oid)<>'awaiting_payment' then raise exception '退回后误付款';end if;
 insert into qa_payment_results values('金额不符、未勾确认、空退回理由拒绝；退回保持未付款','PASS');
 -- 第二单待审核，供批准、重复审核及流水唯一性测试。
 perform set_config('request.jwt.claim.sub',m::text,true);
 r2:=public.merchant_submit_payment_receipt(oid2,current_setting('app.pay.path2'),'QA',null,now(),null,ac.updated_at);
 r3:=public.merchant_submit_payment_receipt(oid3,current_setting('app.pay.path3'),'QA',null,now(),null,ac.updated_at);
 perform set_config('request.jwt.claim.sub',a::text,true);
 r2:=public.admin_review_payment_receipt(r2.id,true,128,'QA-REF-UNIQUE','模拟到账',true);
 if r2.status<>'approved' or (select status from public.orders where id=oid2)<>'paid' or (select provider from public.payments where order_id=oid2)<>'test_transfer_review' or (select locked_at from public.fees where order_id=oid2) is null then raise exception '审核未原子生成测试付款锁费';end if;
 select count(*) into n from public.payment_notifications where order_id=oid2 and is_test;
 if n<>2 then raise exception '商家仓库通知缺失';end if;
 err:=null;begin perform public.admin_review_payment_receipt(r2.id,true,128,'QA-REF-OTHER','',true);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '重复审核通过';end if;
 err:=null;begin perform public.admin_review_payment_receipt(r3.id,true,128,'qa-ref-unique','',true);exception when others then err:=sqlerrm;end;
 if err is null or exists(select 1 from public.payments where order_id=oid3) or (select status from public.orders where id=oid3)<>'awaiting_payment' then raise exception '重复流水未原子回滚';end if;
 insert into qa_payment_results values('审核原子入账锁费、双端通知、重复审核拒绝、重复流水完整回滚','PASS');
 perform set_config('request.jwt.claim.sub',w::text,true);
 if (select count(*) from public.payment_notifications where order_id=oid2)<>1 then raise exception '仓库通知权限错误';end if;
 perform public.warehouse_pack_order(oid2,'TEST-BOX','回滚打包验收');
 if (select status from public.orders where id=oid2)<>'ready_to_ship' then raise exception '付款后打包失败';end if;
 perform public.warehouse_ship_order(oid2,'QA承运商','QA-TEST-NOT-A-WAYBILL');
 if (select status from public.orders where id=oid2)<>'shipped' then raise exception '出货失败';end if;
 insert into qa_payment_results values('仓库仅见本站通知、审核后打包待出货并完成出货登记','PASS');
 perform set_config('request.jwt.claim.sub',m::text,true);
 if (select count(*) from public.payment_notifications where order_id=oid2)<>1 then raise exception '商家通知权限错误';end if;
 err:=null;begin perform public.admin_save_receiving_account(to_jsonb(ac),ac.updated_at);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '商家可改收款账户';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 cfg:=to_jsonb(ac)||'{"mode":"live"}'::jsonb;
 err:=null;begin perform public.admin_save_receiving_account(cfg,ac.updated_at);exception when others then err:=sqlerrm;end;
 if err is null then raise exception '虚拟账号可切真实';end if;
 ac:=public.admin_save_receiving_account(to_jsonb(ac),ac.updated_at);
 insert into qa_payment_results values('商家本站通知隔离、账户仅运营维护且虚拟账号不能冒充真实','PASS');
end $$;
reset role;
-- 用新的存储对象补交第一单；仍使用相同转账说明，不重复转账。
do $$
declare path text:=current_setting('app.pay.m')||'/'||current_setting('app.pay.o1')||'/'||gen_random_uuid()||'.png';
begin
 insert into storage.objects(bucket_id,name,metadata) values('payment-proofs',path,'{"size":100,"mimetype":"image/png"}');
 perform set_config('app.pay.resubmit',path,true);
end $$;
set local role authenticated;
do $$
declare ac public.payment_receiving_accounts; r public.payment_receipts;
begin
 perform set_config('request.jwt.claim.sub',current_setting('app.pay.m'),true);
 select * into ac from public.payment_receiving_accounts where singleton;
 r:=public.merchant_submit_payment_receipt(current_setting('app.pay.o1')::uuid,current_setting('app.pay.resubmit'),'QA补充',null,now(),'更清晰凭证',ac.updated_at);
 if r.status<>'pending' or (select count(*) from public.payment_receipts where order_id=r.order_id)<>2 then raise exception '补交未保留历史';end if;
 insert into qa_payment_results values('退回可补交，保留前次审核历史且仍未生成付款','PASS');
end $$;
reset role;
select * from qa_payment_results;
rollback;
