-- Mospace 跨境集运系统数据库结构
-- 适用于 Supabase PostgreSQL。执行前请在 Supabase SQL Editor 中运行整份文件。
-- 业务规则：商家先寄深圳仓；仓库确认实重/尺寸后生成最终费用；商家只支付一次；付款后费用锁定。

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('merchant', 'warehouse_operator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'draft', 'submitted', 'warehouse_received', 'measuring',
    'awaiting_payment', 'paid', 'ready_to_ship', 'shipped',
    'delivered', 'cancelled', 'exception'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.parcel_status as enum (
    'pre_advised', 'received', 'measuring', 'measured',
    'consolidated', 'shipped', 'exception'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null default '中国',
  province text not null default '广东省',
  city text not null default '深圳市',
  address text not null,
  contact_name text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'merchant',
  company_name text,
  display_name text,
  phone text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_addresses (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default '默认收货地址',
  recipient_name text not null,
  recipient_phone text not null,
  country text not null default '印度尼西亚',
  province text,
  city text,
  address_line text not null,
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  merchant_id uuid not null references public.profiles(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status public.order_status not null default 'draft',
  destination_country text not null default '印度尼西亚',
  destination_city text,
  destination_address text not null,
  recipient_name text not null,
  recipient_phone text not null,
  route_code text not null,
  route_name text not null,
  origin_warehouse_name text not null,
  origin_warehouse_address text not null,
  estimated_weight_kg numeric(10,3),
  parcel_count integer not null default 0 check (parcel_count >= 0),
  merchant_note text,
  submitted_at timestamptz,
  warehouse_received_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  parcel_no text not null unique,
  merchant_id uuid not null references public.profiles(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status public.parcel_status not null default 'pre_advised',
  tracking_no text not null,
  carrier text,
  item_name text,
  declared_value numeric(12,2),
  declared_currency text not null default 'CNY',
  actual_weight_kg numeric(10,3),
  length_cm numeric(10,2),
  width_cm numeric(10,2),
  height_cm numeric(10,2),
  received_at timestamptz,
  measured_at timestamptz,
  exception_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (declared_value is null or declared_value >= 0),
  check (actual_weight_kg is null or actual_weight_kg >= 0),
  check (length_cm is null or length_cm >= 0),
  check (width_cm is null or width_cm >= 0),
  check (height_cm is null or height_cm >= 0)
);

create table if not exists public.order_parcels (
  order_id uuid not null references public.orders(id) on delete cascade,
  parcel_id uuid not null references public.parcels(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (order_id, parcel_id)
);

create table if not exists public.fees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  estimated_shipping_fee numeric(12,2) not null default 0 check (estimated_shipping_fee >= 0),
  estimated_handling_fee numeric(12,2) not null default 0 check (estimated_handling_fee >= 0),
  estimated_total numeric(12,2) not null default 0 check (estimated_total >= 0),
  actual_weight_kg numeric(10,3),
  volume_weight_kg numeric(10,3),
  billable_weight_kg numeric(10,3),
  shipping_fee numeric(12,2),
  handling_fee numeric(12,2),
  total_amount numeric(12,2),
  currency text not null default 'CNY',
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (actual_weight_kg is null or actual_weight_kg >= 0),
  check (volume_weight_kg is null or volume_weight_kg >= 0),
  check (billable_weight_kg is null or billable_weight_kg >= 0),
  check (shipping_fee is null or shipping_fee >= 0),
  check (handling_fee is null or handling_fee >= 0),
  check (total_amount is null or total_amount >= 0),
  check (total_amount is null or total_amount = coalesce(shipping_fee, 0) + coalesce(handling_fee, 0))
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  merchant_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'CNY',
  status public.payment_status not null default 'pending',
  payment_method text,
  provider text,
  provider_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  parcel_id uuid references public.parcels(id) on delete set null,
  event_code text not null,
  event_title text not null,
  event_description text,
  location text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_merchant_status on public.orders(merchant_id, status, created_at desc);
create index if not exists idx_orders_warehouse_status on public.orders(warehouse_id, status, created_at desc);
create index if not exists idx_parcels_merchant_status on public.parcels(merchant_id, status, created_at desc);
create index if not exists idx_tracking_order_time on public.tracking_events(order_id, occurred_at desc);
create index if not exists idx_audit_entity_time on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_warehouses_updated_at on public.warehouses;
create trigger set_warehouses_updated_at before update on public.warehouses for each row execute function public.set_updated_at();
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_addresses_updated_at on public.merchant_addresses;
create trigger set_addresses_updated_at before update on public.merchant_addresses for each row execute function public.set_updated_at();
drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists set_parcels_updated_at on public.parcels;
create trigger set_parcels_updated_at before update on public.parcels for each row execute function public.set_updated_at();
drop trigger if exists set_fees_updated_at on public.fees;
create trigger set_fees_updated_at before update on public.fees for each row execute function public.set_updated_at();
drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 商家本人可以维护展示信息，但不能把自己升级为管理员或改绑仓库。
  if auth.uid() = old.id and not public.is_admin() then
    new.role = old.role;
    new.warehouse_id = old.warehouse_id;
    new.is_active = old.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists protect_profiles_privileged_fields on public.profiles;
create trigger protect_profiles_privileged_fields before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null::public.app_role
    else coalesce(
      (select role from public.profiles where id = auth.uid()),
      'merchant'::public.app_role
    )
  end;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false);
$$;

create or replace function public.is_warehouse_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'warehouse_operator'::public.app_role, false);
$$;

create or replace function public.owns_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.orders where id = p_order_id and merchant_id = auth.uid());
$$;

create or replace function public.can_operate_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.orders o
    join public.profiles p on p.id = auth.uid()
    where o.id = p_order_id and p.role = 'warehouse_operator'::public.app_role
      and p.warehouse_id = o.warehouse_id
  );
$$;

create or replace function public.can_view_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.owns_order(p_order_id) or public.can_operate_order(p_order_id);
$$;

-- 仓库确认实重/尺寸后调用：生成订单唯一最终费用，并把订单推进到待付款。
create or replace function public.confirm_order_fee(
  p_order_id uuid,
  p_actual_weight_kg numeric,
  p_volume_weight_kg numeric,
  p_shipping_fee numeric,
  p_handling_fee numeric
)
returns public.fees
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_fee public.fees;
  v_total numeric(12,2);
  v_billable numeric(10,3);
begin
  if not (public.is_admin() or public.can_operate_order(p_order_id)) then
    raise exception '无权确认该订单费用';
  end if;
  if p_actual_weight_kg is null or p_actual_weight_kg < 0
     or coalesce(p_volume_weight_kg, 0) < 0
     or p_shipping_fee < 0 or p_handling_fee < 0 then
    raise exception '重量和费用必须为有效的非负数';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception '订单不存在'; end if;
  if v_order.status not in ('warehouse_received', 'measuring') then
    raise exception '当前订单状态不可确认费用';
  end if;

  v_billable := greatest(p_actual_weight_kg, coalesce(p_volume_weight_kg, 0));
  v_total := round(p_shipping_fee + p_handling_fee, 2);
  insert into public.fees (
    order_id, actual_weight_kg, volume_weight_kg, billable_weight_kg,
    shipping_fee, handling_fee, total_amount, confirmed_by, confirmed_at
  ) values (
    p_order_id, p_actual_weight_kg, p_volume_weight_kg, v_billable,
    round(p_shipping_fee, 2), round(p_handling_fee, 2), v_total, auth.uid(), now()
  )
  on conflict (order_id) do update set
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

  update public.orders
  set status = 'awaiting_payment', updated_at = now()
  where id = p_order_id;

  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (p_order_id, 'fee_confirmed', '仓库已确认费用', '已完成实重和尺寸确认，等待商家一次付款', v_order.origin_warehouse_name, auth.uid());
  return v_fee;
end;
$$;

-- 商家付款调用：金额必须等于最终费用，订单只能生成一条已付款记录。
create or replace function public.record_order_payment(
  p_order_id uuid,
  p_payment_method text,
  p_provider text default null,
  p_provider_transaction_id text default null
)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_fee public.fees;
  v_payment public.payments;
begin
  if not (public.is_admin() or public.owns_order(p_order_id)) then
    raise exception '无权支付该订单';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_fee from public.fees where order_id = p_order_id;
  if v_order.id is null then raise exception '订单不存在'; end if;
  if v_order.status <> 'awaiting_payment' then raise exception '当前订单不可付款'; end if;
  if v_fee.total_amount is null or v_fee.total_amount <= 0 then raise exception '订单尚未生成最终费用'; end if;
  if exists(select 1 from public.payments where order_id = p_order_id) then raise exception '该订单已存在付款记录'; end if;

  insert into public.payments (
    order_id, merchant_id, amount, currency, status, payment_method,
    provider, provider_transaction_id, paid_at
  ) values (
    p_order_id, v_order.merchant_id, v_fee.total_amount, v_fee.currency,
    'paid', p_payment_method, p_provider, p_provider_transaction_id, now()
  ) returning * into v_payment;

  update public.fees set locked_at = now(), updated_at = now() where id = v_fee.id;
  update public.orders set status = 'paid', paid_at = now(), updated_at = now() where id = p_order_id;
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (p_order_id, 'payment_received', '付款成功', '费用已锁定，仓库进入待出货', v_order.origin_warehouse_name, auth.uid());
  return v_payment;
end;
$$;

-- 商家创建订单：在一次事务中写入订单、包裹关联和预估费用，避免前端逐表写入造成权限中断。
create or replace function public.create_merchant_order(
  p_destination_country text,
  p_destination_city text,
  p_destination_address text,
  p_recipient_name text,
  p_recipient_phone text,
  p_parcels jsonb,
  p_estimated_fee numeric default 268
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_warehouse public.warehouses;
  v_order public.orders;
  v_parcel record;
  v_parcel_row public.parcels;
begin
  if v_user_id is null then raise exception '请先登录商家账号'; end if;
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce((select email from auth.users where id = v_user_id), '跨境商家'))
  on conflict (id) do nothing;

  select * into v_warehouse from public.warehouses where code = 'SZ-LG-01' and is_active = true limit 1;
  if v_warehouse.id is null then raise exception '深圳仓配置不存在'; end if;
  if coalesce(p_destination_address, '') = '' or coalesce(p_recipient_name, '') = '' then
    raise exception '目的地地址和收件人不能为空';
  end if;

  insert into public.orders (
    order_no, merchant_id, warehouse_id, status, destination_country, destination_city,
    destination_address, recipient_name, recipient_phone, route_code, route_name,
    origin_warehouse_name, origin_warehouse_address, estimated_weight_kg,
    parcel_count, submitted_at
  ) values (
    'MO' || to_char(now(), 'YYYYMMDDHH24MISS') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
    v_user_id, v_warehouse.id, 'submitted', coalesce(p_destination_country, '印度尼西亚'),
    coalesce(p_destination_city, '雅加达'), p_destination_address, p_recipient_name,
    p_recipient_phone, 'ID-AIR', '印尼空运专线', v_warehouse.name, v_warehouse.address,
    4.2, jsonb_array_length(coalesce(p_parcels, '[]'::jsonb)), now()
  ) returning * into v_order;

  for v_parcel in select no, name from jsonb_to_recordset(coalesce(p_parcels, '[]'::jsonb)) as x(no text, name text) loop
    insert into public.parcels (parcel_no, merchant_id, warehouse_id, status, tracking_no, item_name)
    values (v_parcel.no, v_user_id, v_warehouse.id, 'pre_advised', v_parcel.no, coalesce(v_parcel.name, '未填写品名'))
    on conflict (parcel_no) do update set updated_at = now()
    returning * into v_parcel_row;
    insert into public.order_parcels (order_id, parcel_id) values (v_order.id, v_parcel_row.id)
    on conflict do nothing;
  end loop;

  insert into public.fees (order_id, estimated_shipping_fee, estimated_total)
  values (v_order.id, greatest(coalesce(p_estimated_fee, 268), 0), greatest(coalesce(p_estimated_fee, 268), 0));
  insert into public.tracking_events (order_id, event_code, event_title, event_description, location, created_by)
  values (v_order.id, 'order_submitted', '已创建集运订单', '商家提交订单，等待深圳仓收货确认', v_warehouse.name, v_user_id);
  return v_order;
end;
$$;

revoke all on function public.confirm_order_fee(uuid, numeric, numeric, numeric, numeric) from public;
grant execute on function public.confirm_order_fee(uuid, numeric, numeric, numeric, numeric) to authenticated;
revoke all on function public.record_order_payment(uuid, text, text, text) from public;
grant execute on function public.record_order_payment(uuid, text, text, text) to authenticated;
revoke all on function public.create_merchant_order(text, text, text, text, text, jsonb, numeric) from public;
grant execute on function public.create_merchant_order(text, text, text, text, text, jsonb, numeric) to authenticated;

-- 新用户默认只能作为商家使用；仓库操作员和管理员由管理员在后台授予。
alter table public.profiles enable row level security;
alter table public.warehouses enable row level security;
alter table public.merchant_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.parcels enable row level security;
alter table public.order_parcels enable row level security;
alter table public.fees enable row level security;
alter table public.payments enable row level security;
alter table public.tracking_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists warehouses_select_authenticated on public.warehouses;
create policy warehouses_select_authenticated on public.warehouses for select to authenticated using (is_active or public.is_admin());
drop policy if exists warehouses_admin_manage on public.warehouses;
create policy warehouses_admin_manage on public.warehouses for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists addresses_merchant_manage on public.merchant_addresses;
create policy addresses_merchant_manage on public.merchant_addresses for all to authenticated
using (merchant_id = auth.uid() or public.is_admin())
with check (merchant_id = auth.uid() or public.is_admin());

drop policy if exists orders_view on public.orders;
create policy orders_view on public.orders for select to authenticated using (public.can_view_order(id));
drop policy if exists orders_merchant_insert on public.orders;
create policy orders_merchant_insert on public.orders for insert to authenticated
with check (merchant_id = auth.uid());
drop policy if exists orders_merchant_update_draft on public.orders;
create policy orders_merchant_update_draft on public.orders for update to authenticated
using ((merchant_id = auth.uid() and status = 'draft') or public.is_admin())
with check ((merchant_id = auth.uid() and status = 'draft') or public.is_admin());
drop policy if exists orders_warehouse_update on public.orders;
create policy orders_warehouse_update on public.orders for update to authenticated
using (public.can_operate_order(id) or public.is_admin())
with check (public.can_operate_order(id) or public.is_admin());

drop policy if exists parcels_view on public.parcels;
create policy parcels_view on public.parcels for select to authenticated
using (merchant_id = auth.uid() or public.is_admin() or (public.is_warehouse_operator() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.warehouse_id = warehouse_id)));
drop policy if exists parcels_merchant_manage on public.parcels;
create policy parcels_merchant_manage on public.parcels for insert to authenticated
with check (merchant_id = auth.uid() and public.current_app_role() = 'merchant'::public.app_role);
drop policy if exists parcels_warehouse_update on public.parcels;
create policy parcels_warehouse_update on public.parcels for update to authenticated
using (public.is_admin() or (public.is_warehouse_operator() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.warehouse_id = warehouse_id)))
with check (public.is_admin() or (public.is_warehouse_operator() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.warehouse_id = warehouse_id)));

drop policy if exists order_parcels_view on public.order_parcels;
create policy order_parcels_view on public.order_parcels for select to authenticated using (public.can_view_order(order_id));
drop policy if exists order_parcels_merchant_insert on public.order_parcels;
create policy order_parcels_merchant_insert on public.order_parcels for insert to authenticated
with check (public.owns_order(order_id) and exists(select 1 from public.parcels p where p.id = parcel_id and p.merchant_id = auth.uid()));
drop policy if exists order_parcels_admin_manage on public.order_parcels;
create policy order_parcels_admin_manage on public.order_parcels for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists fees_view on public.fees;
create policy fees_view on public.fees for select to authenticated using (public.can_view_order(order_id));
drop policy if exists fees_admin_or_warehouse_manage on public.fees;
create policy fees_admin_or_warehouse_manage on public.fees for all to authenticated using (public.is_admin() or public.can_operate_order(order_id)) with check (public.is_admin() or public.can_operate_order(order_id));
drop policy if exists fees_merchant_insert on public.fees;
create policy fees_merchant_insert on public.fees for insert to authenticated
with check (public.owns_order(order_id) and total_amount is null and shipping_fee is null and handling_fee is null);

drop policy if exists payments_view on public.payments;
create policy payments_view on public.payments for select to authenticated using (merchant_id = auth.uid() or public.is_admin() or public.can_operate_order(order_id));
drop policy if exists payments_merchant_create on public.payments;
create policy payments_merchant_create on public.payments for insert to authenticated
with check (merchant_id = auth.uid() and public.owns_order(order_id));
drop policy if exists payments_admin_update on public.payments;
create policy payments_admin_update on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists tracking_view on public.tracking_events;
create policy tracking_view on public.tracking_events for select to authenticated using (public.can_view_order(order_id));
drop policy if exists tracking_staff_insert on public.tracking_events;
create policy tracking_staff_insert on public.tracking_events for insert to authenticated
with check (public.is_admin() or public.can_operate_order(order_id));

drop policy if exists audit_admin_view on public.audit_logs;
create policy audit_admin_view on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists audit_staff_insert on public.audit_logs;
create policy audit_staff_insert on public.audit_logs for insert to authenticated with check (public.is_admin() or public.is_warehouse_operator());

insert into public.warehouses (code, name, address, contact_name, contact_phone)
values ('SZ-LG-01', '深圳仓 · 龙岗跨境集运仓', '广东省深圳市龙岗区平湖街道物流园 2 号楼 1 楼', 'Mospace 深圳仓收货组', '0755-8888-1688')
on conflict (code) do update set name = excluded.name, address = excluded.address, contact_name = excluded.contact_name, contact_phone = excluded.contact_phone, updated_at = now();

comment on table public.orders is '商家创建的跨境集运订单；仓库确认后进入 awaiting_payment，付款后费用锁定，不支持补款。';
comment on table public.fees is '每个订单只有一条费用记录；confirmed_at 后为最终费用，locked_at 后禁止修改。';
comment on table public.payments is '每个订单最多一条付款记录，支付金额必须等于最终费用。';
comment on function public.confirm_order_fee(uuid, numeric, numeric, numeric, numeric) is '仓库确认实重和尺寸，生成唯一最终费用并进入待付款。';
comment on function public.record_order_payment(uuid, text, text, text) is '商家一次付款；订单已有付款记录或金额不一致时拒绝。';
comment on function public.create_merchant_order(text, text, text, text, text, jsonb, numeric) is '商家一次事务创建订单、包裹关联和预估费用。';
