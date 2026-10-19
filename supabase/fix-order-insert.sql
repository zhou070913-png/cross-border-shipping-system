-- 修复已有项目中商家账号未生成 profiles 记录时的订单创建权限。
-- 在 Supabase SQL Editor 新建查询，粘贴整份并点击 Run query。

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null::public.app_role
    else coalesce(
      (select role from public.profiles where id = auth.uid()),
      'merchant'::public.app_role
    )
  end;
$$;

drop policy if exists orders_merchant_insert on public.orders;
create policy orders_merchant_insert on public.orders for insert to authenticated
with check (merchant_id = auth.uid());

drop policy if exists fees_merchant_insert on public.fees;
create policy fees_merchant_insert on public.fees for insert to authenticated
with check (
  public.owns_order(order_id)
  and total_amount is null
  and shipping_fee is null
  and handling_fee is null
);
