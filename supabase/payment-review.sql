-- v1.6 转账凭证审核。新增私有凭证、收款配置、审核及站内通知。
-- 默认只启用不可转账的虚拟账号；不重写已有付款记录。
begin;
create table if not exists public.payment_receiving_accounts (
  id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
  mode text not null default 'test' check(mode in ('test','live')),
  bank_name text not null, account_holder text not null, account_number text not null,
  branch_name text, swift_code text, instructions text,
  currency text not null default 'CNY' check(currency='CNY'), is_active boolean not null default false,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default clock_timestamp(),
  check(length(bank_name) between 1 and 120 and length(account_holder) between 1 and 160 and length(account_number) between 1 and 100),
  check(mode<>'live' or account_number ~ '^[0-9 -]{8,40}$')
);
insert into public.payment_receiving_accounts(bank_name,account_holder,account_number,instructions,is_active)
values('演示银行（不可转账）','Mospace 虚拟收款账户','DEMO-NOT-A-BANK-0001','仅用于测试提交凭证与运营审核，不要向此账号转账，不发生真实扣款。',true)
on conflict(singleton) do nothing;

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  merchant_id uuid not null references public.profiles(id), account_id uuid not null references public.payment_receiving_accounts(id),
  account_snapshot jsonb not null, amount numeric(12,2) not null check(amount>0), currency text not null check(currency='CNY'),
  is_test boolean not null, object_path text not null unique,
  payer_name text not null check(length(payer_name) between 1 and 120), transfer_reference text,
  transferred_at timestamptz not null, merchant_note text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_note text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  received_amount numeric(12,2), bank_reference text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((status='pending' and reviewed_by is null and reviewed_at is null) or (status<>'pending' and reviewed_by is not null and reviewed_at is not null)),
  check(status<>'approved' or (received_amount=amount and bank_reference is not null and length(trim(bank_reference))>0)),
  check(status<>'rejected' or length(trim(review_note))>=2)
);
create unique index if not exists one_active_receipt_per_order on public.payment_receipts(order_id) where status in ('pending','approved');
create unique index if not exists one_approved_bank_reference on public.payment_receipts(account_id,lower(bank_reference)) where status='approved';
create index if not exists receipts_status_time on public.payment_receipts(status,created_at desc);
create table if not exists public.payment_notifications (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  recipient_user_id uuid references public.profiles(id), warehouse_id uuid references public.warehouses(id),
  title text not null, message text not null, is_test boolean not null default false, created_at timestamptz not null default now(),
  check((recipient_user_id is not null)::int+(warehouse_id is not null)::int=1)
);
alter table public.payment_receiving_accounts enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.payment_notifications enable row level security;
drop policy if exists receiving_read on public.payment_receiving_accounts;
create policy receiving_read on public.payment_receiving_accounts for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and is_active and (role='admin' or role='merchant' and payment_receiving_accounts.is_active)));
drop policy if exists receipt_read on public.payment_receipts;
create policy receipt_read on public.payment_receipts for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and is_active and (role='admin' or role='merchant' and payment_receipts.merchant_id=auth.uid())));
drop policy if exists payment_notice_read on public.payment_notifications;
create policy payment_notice_read on public.payment_notifications for select to authenticated
using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and
 (p.role='admin' or recipient_user_id=p.id or p.role='warehouse_operator' and payment_notifications.warehouse_id=p.warehouse_id)));
revoke all on public.payment_receiving_accounts,public.payment_receipts,public.payment_notifications from anon,authenticated;
grant select on public.payment_receiving_accounts,public.payment_receipts,public.payment_notifications to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/png','image/jpeg','image/webp'];
drop policy if exists payment_proof_upload on storage.objects;
create policy payment_proof_upload on storage.objects for insert to authenticated
with check(bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text
  and array_length(storage.foldername(name),1)=2 and lower(storage.extension(name)) in ('png','jpg','jpeg','webp')
  and exists(select 1 from public.orders o join public.fees f on f.order_id=o.id join public.profiles p on p.id=auth.uid()
    where o.id::text=(storage.foldername(name))[2] and o.merchant_id=auth.uid() and p.role='merchant' and p.is_active
      and o.status='awaiting_payment' and f.total_amount>0 and f.confirmed_at is not null
      and not exists(select 1 from public.payment_receipts r where r.order_id=o.id and r.status in ('pending','approved'))));
drop policy if exists payment_proof_read on storage.objects;
create policy payment_proof_read on storage.objects for select to authenticated
using(bucket_id='payment-proofs' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and
  (p.role='merchant' and (storage.foldername(name))[1]=auth.uid()::text or p.role='admin' and exists(select 1 from public.payment_receipts r where r.object_path=name))));
-- 无客户端 UPDATE/DELETE 策略，已提交凭证不能覆盖/删除。无公开 URL。

create or replace function public.admin_save_receiving_account(p_config jsonb,p_expected_updated_at timestamptz)
returns public.payment_receiving_accounts language plpgsql security definer set search_path=public as $$
declare old public.payment_receiving_accounts; result public.payment_receiving_accounts;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active) then raise exception '仅运营管理员可配置收款账户'; end if;
  select * into old from public.payment_receiving_accounts where singleton for update;
  if old.updated_at is distinct from p_expected_updated_at then raise exception '收款账户已更新，请刷新后重新编辑'; end if;
  if coalesce(p_config->>'mode','') not in ('test','live') or length(trim(coalesce(p_config->>'bank_name',''))) not between 1 and 120
    or length(trim(coalesce(p_config->>'account_holder',''))) not between 1 and 160
    or length(trim(coalesce(p_config->>'account_number',''))) not between 1 and 100
    or length(coalesce(p_config->>'instructions',''))>2000 or length(coalesce(p_config->>'branch_name',''))>160 or length(coalesce(p_config->>'swift_code',''))>40
    or p_config->>'currency' is distinct from 'CNY' then raise exception '请填写完整的人民币收款账户资料'; end if;
  if p_config->>'mode'='live' and (p_config->>'account_number' !~ '^[0-9 -]{8,40}$' or ((p_config->>'bank_name')||(p_config->>'account_holder')) ~* '(演示|虚拟|DEMO)') then raise exception '真实收款请填写你自己的有效银行资料，不能使用演示账号'; end if;
  update public.payment_receiving_accounts set mode=p_config->>'mode',bank_name=trim(p_config->>'bank_name'),
    account_holder=trim(p_config->>'account_holder'),account_number=trim(p_config->>'account_number'),branch_name=left(p_config->>'branch_name',160),
    swift_code=left(p_config->>'swift_code',40),instructions=p_config->>'instructions',is_active=coalesce((p_config->>'is_active')::boolean,false),
    updated_by=auth.uid(),updated_at=clock_timestamp() where id=old.id returning * into result;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'receiving_account_updated','receiving_account',old.id,to_jsonb(old),to_jsonb(result));
  return result;
end $$;

create or replace function public.merchant_submit_payment_receipt(p_order_id uuid,p_object_path text,p_payer_name text,
 p_transfer_reference text,p_transferred_at timestamptz,p_note text,p_account_updated_at timestamptz)
returns public.payment_receipts language plpgsql security definer set search_path=public as $$
declare o public.orders; f public.fees; a public.payment_receiving_accounts; r public.payment_receipts; meta jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='merchant' and is_active) then raise exception '仅商家可提交本人订单付款凭证'; end if;
  select * into o from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
  if o.id is null then raise exception '订单不存在或无权操作'; end if;
  select * into r from public.payment_receipts where object_path=p_object_path and order_id=o.id and merchant_id=auth.uid();
  if r.id is not null then return r; end if;
  if o.status<>'awaiting_payment' or exists(select 1 from public.payments where order_id=o.id) then raise exception '此单当前不可提交付款凭证'; end if;
  if exists(select 1 from public.payment_receipts where order_id=o.id and status in ('pending','approved')) then raise exception '本单已有待审核或已通过凭证，请勿重复提交'; end if;
  select * into f from public.fees where order_id=o.id for update;
  if f.total_amount is null or f.total_amount<=0 or f.confirmed_at is null or f.currency<>'CNY' then raise exception '请等待仓库确认人民币最终费用'; end if;
  select * into a from public.payment_receiving_accounts where singleton for share;
  if a.id is null or not a.is_active then raise exception '平台暂未启用收款账户，请联系运营'; end if;
  if a.updated_at is distinct from p_account_updated_at then raise exception '收款账户已变更，请刷新核对后重新提交，勿重复转账'; end if;
  if length(trim(coalesce(p_payer_name,''))) not between 1 and 120 or length(coalesce(p_transfer_reference,''))>160 or length(coalesce(p_note,''))>2000
    or p_transferred_at is null or p_transferred_at>now()+interval '5 minutes' or p_transferred_at<o.created_at-interval '5 minutes' then raise exception '请核对付款人、转账时间和备注'; end if;
  if p_object_path is null or split_part(p_object_path,'/',1)<>auth.uid()::text or split_part(p_object_path,'/',2)<>o.id::text or array_length(string_to_array(p_object_path,'/'),1)<>3 then raise exception '凭证文件不属于本账号或本单'; end if;
  select metadata into meta from storage.objects where bucket_id='payment-proofs' and name=p_object_path;
  if meta is null or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880 or coalesce(meta->>'mimetype','') not in ('image/png','image/jpeg','image/webp') then raise exception '凭证图片未上传成功或格式/大小不合规'; end if;
  insert into public.payment_receipts(order_id,merchant_id,account_id,account_snapshot,amount,currency,is_test,object_path,payer_name,transfer_reference,transferred_at,merchant_note)
    values(o.id,auth.uid(),a.id,to_jsonb(a)-'updated_by',f.total_amount,f.currency,a.mode='test',p_object_path,trim(p_payer_name),nullif(trim(p_transfer_reference),''),p_transferred_at,p_note) returning * into r;
  insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
    values(o.id,'payment_review_pending',case when r.is_test then '测试凭证已提交' else '付款凭证已提交' end,'等待运营核实，尚未确认付款成功',auth.uid());
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'payment_receipt_submitted','payment_receipt',r.id,to_jsonb(r));
  return r;
end $$;

create or replace function public.admin_review_payment_receipt(p_receipt_id uuid,p_approve boolean,p_received_amount numeric,p_bank_reference text,p_note text,p_confirmed_received boolean)
returns public.payment_receipts language plpgsql security definer set search_path=public as $$
declare o public.orders; f public.fees; r public.payment_receipts; previous jsonb; oid uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active) then raise exception '仅运营管理员可审核付款'; end if;
  select order_id into oid from public.payment_receipts where id=p_receipt_id;
  select * into o from public.orders where id=oid for update;
  select * into r from public.payment_receipts where id=p_receipt_id for update;
  if r.id is null then raise exception '凭证不存在'; end if;
  if r.status<>'pending' then raise exception '该凭证已审核，请刷新查看结果'; end if;
  if p_approve is null or o.status<>'awaiting_payment' then raise exception '订单状态已变化，不能审核'; end if;
  if length(coalesce(p_note,''))>2000 then raise exception '审核备注最多2000字'; end if;
  previous:=to_jsonb(r);
  select * into f from public.fees where order_id=o.id for update;
  if p_approve then
    if p_confirmed_received is distinct from true or p_received_amount is null or p_received_amount<>r.amount
      or f.total_amount is distinct from r.amount or f.currency<>r.currency or f.confirmed_at is null
      or length(trim(coalesce(p_bank_reference,''))) not between 3 and 160 then raise exception '请核实实际到账，金额必须等于本单最终费用，并填写唯一银行流水号'; end if;
    if exists(select 1 from public.payments where order_id=o.id) then raise exception '本单已有付款记录，不能重复入账'; end if;
    insert into public.payments(order_id,merchant_id,amount,currency,status,payment_method,provider,provider_transaction_id,paid_at)
      values(o.id,o.merchant_id,r.amount,r.currency,'paid','bank_transfer',case when r.is_test then 'test_transfer_review' else 'bank_transfer_review' end,trim(p_bank_reference),now());
    update public.fees set locked_at=now() where id=f.id;
    update public.orders set status='paid',paid_at=now() where id=o.id;
    update public.payment_receipts set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),review_note=nullif(trim(p_note),''),received_amount=p_received_amount,bank_reference=trim(p_bank_reference) where id=r.id returning * into r;
    insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
      values(o.id,'payment_review_approved',case when r.is_test then '测试付款审核通过' else '付款审核通过' end,case when r.is_test then '模拟付款成功，未发生真实资金交易；进入待打包' else '运营已核实到账，付款成功；进入待打包' end,auth.uid());
    insert into public.payment_notifications(order_id,recipient_user_id,title,message,is_test)
      values(o.id,o.merchant_id,case when r.is_test then '测试付款审核通过' else '付款成功' end,o.order_no||'：运营审核通过，仓库将继续打包。',r.is_test);
    insert into public.payment_notifications(order_id,warehouse_id,title,message,is_test)
      values(o.id,o.warehouse_id,case when r.is_test then '测试订单可继续打包' else '商家付款成功，可继续打包' end,o.order_no||'：运营已审核通过，请进入打包队列。',r.is_test);
  else
    if length(trim(coalesce(p_note,'')))<2 then raise exception '退回凭证必须填写具体原因'; end if;
    update public.payment_receipts set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),review_note=trim(p_note) where id=r.id returning * into r;
    insert into public.payment_notifications(order_id,recipient_user_id,title,message,is_test)
      values(o.id,o.merchant_id,'付款凭证需补充',o.order_no||'：'||trim(p_note)||'。请核对并补交凭证，勿重复转账。',r.is_test);
    insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by)
      values(o.id,'payment_review_rejected','付款凭证已退回','请核对并补交付款资料，勿重复转账',auth.uid());
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),case when p_approve then 'payment_review_approved' else 'payment_review_rejected' end,'payment_receipt',r.id,previous,to_jsonb(r));
  return r;
exception when unique_violation then raise exception '该订单或银行流水已处理，请刷新核对，勿重复入账';
end $$;

-- 关闭旧的“一键标记付款成功”及表级直写；所有付款只能经审核函数。
create or replace function public.record_order_payment(p_order_id uuid,p_payment_method text,p_provider text default null,p_provider_transaction_id text default null)
returns public.payments language plpgsql security definer set search_path=public as $$
begin raise exception '请上传付款凭证并等待运营审核，不能直接登记付款成功'; end $$;
revoke all on function public.record_order_payment(uuid,text,text,text) from public,anon,authenticated;
revoke insert,update,delete on public.payments,public.orders,public.fees from anon,authenticated;
revoke all on function public.admin_save_receiving_account(jsonb,timestamptz) from public,anon;
revoke all on function public.merchant_submit_payment_receipt(uuid,text,text,text,timestamptz,text,timestamptz) from public,anon;
revoke all on function public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) from public,anon;
grant execute on function public.admin_save_receiving_account(jsonb,timestamptz) to authenticated;
grant execute on function public.merchant_submit_payment_receipt(uuid,text,text,text,timestamptz,text,timestamptz) to authenticated;
grant execute on function public.admin_review_payment_receipt(uuid,boolean,numeric,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select 'v1.6 payment review installed; virtual account only' as result;
