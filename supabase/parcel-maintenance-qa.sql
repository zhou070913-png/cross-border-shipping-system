-- 只操作本事务创建的 QA-PM-* 夹具，全部回滚。
begin;
select set_config('app.pm.merchant',(select id::text from public.profiles where role='merchant' and is_active limit 1),true);
select set_config('app.pm.admin',(select id::text from public.profiles where role='admin' and is_active limit 1),true);
select set_config('app.pm.warehouse',(select id::text from public.profiles where role='warehouse_operator' and is_active limit 1),true);
create temporary table qa_pm_fixture(kind text,id uuid) on commit drop;
create temporary table qa_pm_results(test text,result text) on commit drop;
grant select,insert on qa_pm_fixture,qa_pm_results to authenticated;
do $$
declare k text; who uuid; pid uuid; tracking text; wh uuid;
begin
  select id into wh from public.warehouses where code='SZ-LG-01' and is_active;
  foreach k in array array['edit','delete','received','linked','other','measured'] loop
    who:=case when k='other' then current_setting('app.pm.admin')::uuid else current_setting('app.pm.merchant')::uuid end;
    tracking:='QA-PM-'||replace(gen_random_uuid()::text,'-','');
    insert into public.parcels(parcel_no,tracking_no,item_name,merchant_id,warehouse_id,updated_at)
      values(tracking,tracking,'回滚验收包裹',who,wh,now()-interval '1 day') returning id into pid;
    insert into qa_pm_fixture values(k,pid);
  end loop;
  update public.parcels set status='received',received_at=now() where id=(select id from qa_pm_fixture where kind='received');
  update public.parcels set actual_weight_kg=0 where id=(select id from qa_pm_fixture where kind='measured');
end;
$$;
set local role authenticated;
do $$
declare m uuid:=current_setting('app.pm.merchant')::uuid; a uuid:=current_setting('app.pm.admin')::uuid;
  w uuid:=current_setting('app.pm.warehouse')::uuid;
  p public.parcels; original public.parcels; other public.parcels; pid uuid;
  msg text; mode text; v_kind text; actor uuid; address_id uuid; ord public.orders;
begin
  if m is null or a is null or w is null then raise exception '缺少测试角色'; end if;
  perform set_config('request.jwt.claim.sub',m::text,true);
  select * into original from public.parcels where id=(select id from qa_pm_fixture where kind='edit');
  p:=public.merchant_edit_parcel(original.id,'  '||original.tracking_no||'-EDIT  ',' 修改后的品名 ',' 测试快递 ',original.updated_at);
  if p.tracking_no<>original.tracking_no||'-EDIT' or p.parcel_no<>p.tracking_no or p.item_name<>'修改后的品名'
    or p.carrier<>'测试快递' or p.id<>original.id or p.status<>'pre_advised' then raise exception '编辑结果不正确'; end if;
  insert into qa_pm_results values('编辑单号、品名、快递公司并清理空格','PASS');
  foreach mode in array array['edit','delete'] loop
    msg:=null;
    begin
      if mode='edit' then perform public.merchant_edit_parcel(p.id,p.tracking_no,p.item_name,p.carrier,original.updated_at);
      else perform public.merchant_delete_parcel(p.id,original.updated_at); end if;
    exception when others then msg:=sqlerrm; end;
    if msg is null or msg not like '%信息已变化%' then raise exception '旧版本未拒绝：%',mode; end if;
  end loop;
  insert into qa_pm_results values('过期页面编辑与删除拦截','PASS');
  select * into other from public.parcels where id=(select id from qa_pm_fixture where kind='delete');
  msg:=null;
  begin perform public.merchant_edit_parcel(p.id,other.tracking_no,'重复单号',null,p.updated_at);
  exception when others then msg:=sqlerrm; end;
  if msg is null or msg not like '%单号已存在%' then raise exception '重复单号未拒绝'; end if;
  msg:=null;
  begin perform public.merchant_edit_parcel(p.id,'123','无效单号',null,p.updated_at);
  exception when others then msg:=sqlerrm; end;
  if msg is null or msg not like '%5至80%' then raise exception '无效输入未拒绝'; end if;
  insert into qa_pm_results values('重复单号与无效输入拦截','PASS');
  foreach v_kind in array array['received','measured','other'] loop
    select id into pid from qa_pm_fixture where qa_pm_fixture.kind=v_kind;
    foreach mode in array array['edit','delete'] loop
      msg:=null;
      begin
        if mode='edit' then perform public.merchant_edit_parcel(pid,'QA-INVALID','不应修改',null,now());
        else perform public.merchant_delete_parcel(pid,now()); end if;
      exception when others then msg:=sqlerrm; end;
      if msg is null or not(msg like '%不能编辑或删除%' or msg like '%无权操作%') then raise exception '状态或归属拦截失败：% % %',v_kind,mode,msg; end if;
    end loop;
  end loop;
  insert into qa_pm_results values('已入库、已有测量与其他归属包裹拦截','PASS');
  insert into public.merchant_addresses(merchant_id,label,recipient_name,recipient_phone,country,city,address_line)
    values(m,'QA-PM回滚地址','测试','00000000000','印度尼西亚','Jakarta','QA，不可发货') returning id into address_id;
  select * into original from public.parcels where id=(select id from qa_pm_fixture where kind='linked');
  ord:=public.merchant_create_from_parcels(array[original.id],address_id,'ID-AIR','合并为一个外箱','QA回滚');
  foreach mode in array array['edit','delete'] loop
    msg:=null;
    begin
      if mode='edit' then perform public.merchant_edit_parcel(original.id,original.tracking_no,'不应修改',null,original.updated_at);
      else perform public.merchant_delete_parcel(original.id,original.updated_at); end if;
    exception when others then msg:=sqlerrm; end;
    if msg is null or msg not like '%关联订单%' then raise exception '已关联订单未拒绝'; end if;
  end loop;
  insert into qa_pm_results values('待入库但已申请打包的包裹拦截','PASS');
  foreach actor in array array[w,a] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    foreach mode in array array['edit','delete'] loop
      msg:=null;
      begin
        if mode='edit' then perform public.merchant_edit_parcel(p.id,p.tracking_no,'越权',null,p.updated_at);
        else perform public.merchant_delete_parcel(p.id,p.updated_at); end if;
      exception when others then msg:=sqlerrm; end;
      if msg is null or msg not like '%仅商家%' then raise exception '角色越权未拒绝'; end if;
    end loop;
  end loop;
  insert into qa_pm_results values('仓库及运营不能调用商家纠错接口','PASS');
  perform set_config('request.jwt.claim.sub',m::text,true);
  if public.merchant_delete_parcel(other.id,other.updated_at)<>other.id then raise exception '删除返回值异常'; end if;
  if exists(select 1 from public.parcels where id=other.id) then raise exception '删除后仍存在'; end if;
  insert into qa_pm_results values('本人未入库且未关联包裹删除','PASS');
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.audit_logs where entity_id in (select id from qa_pm_fixture)
    and action in ('merchant_edit_parcel','merchant_delete_parcel'))<>2 then raise exception '审计记录缺失'; end if;
  insert into qa_pm_results values('成功操作审计及失败操作不产生额外审计','PASS');
end;
$$;
select * from qa_pm_results;
rollback;
