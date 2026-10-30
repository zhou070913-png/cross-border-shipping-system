-- Display numbers are text (18 digits); UUID relationships remain unchanged.
begin;
lock table public.orders in share row exclusive mode;
create sequence if not exists public.numeric_order_number_seq minvalue 1 maxvalue 9999999999 no cycle;
revoke all on sequence public.numeric_order_number_seq from public,anon,authenticated;
create table if not exists public.order_number_aliases(
 order_id uuid primary key references public.orders(id) on delete cascade,
 previous_order_no text not null,
 numeric_order_no text not null unique,
 migrated_at timestamptz not null default now()
);
alter table public.order_number_aliases enable row level security;
revoke all on public.order_number_aliases from public,anon,authenticated;
create or replace function public.next_numeric_order_number() returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate text;
begin
 loop
  candidate:=to_char(clock_timestamp() at time zone 'Asia/Shanghai','YYYYMMDD')||lpad(nextval('public.numeric_order_number_seq')::text,10,'0');
  exit when not exists(select 1 from public.orders where order_no=candidate);
 end loop;
 return candidate;
end $$;
revoke all on function public.next_numeric_order_number() from public,anon,authenticated;
create or replace function public.assign_numeric_order_number() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then new.order_no:=public.next_numeric_order_number();
 elsif new.order_no is distinct from old.order_no then raise exception 'Order number cannot be changed';
 end if;
 return new;
end $$;
revoke all on function public.assign_numeric_order_number() from public,anon,authenticated;
-- No business state or timestamp changes during the one-time renumbering.
drop trigger if exists assign_numeric_order_number on public.orders;
alter table public.orders disable trigger set_orders_updated_at;
insert into public.order_number_aliases(order_id,previous_order_no,numeric_order_no)
select id,order_no,public.next_numeric_order_number() from public.orders where order_no !~ '^[0-9]+$'
on conflict(order_id) do nothing;
update public.orders o set order_no=a.numeric_order_no from public.order_number_aliases a
where a.order_id=o.id and o.order_no=a.previous_order_no and o.order_no !~ '^[0-9]+$';
alter table public.orders enable trigger set_orders_updated_at;
create trigger assign_numeric_order_number before insert or update of order_no on public.orders
for each row execute function public.assign_numeric_order_number();
commit;
notify pgrst,'reload schema';
