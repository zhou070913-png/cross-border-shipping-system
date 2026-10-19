-- 会员号登录迁移
--
-- 说明：Supabase Auth 仍然使用邮箱保存账号，但前端登录时只展示会员号。
-- 这个安全函数按会员号在服务端解析出对应邮箱，再交给 Auth 校验密码。
-- 会员号不返回密码，也不绕过 profiles.role 权限控制。

begin;

alter table public.profiles
  add column if not exists member_no text;

create or replace function public.generate_member_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_no text;
begin
  loop
    v_member_no := 'M' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (
      select 1 from public.profiles where member_no = v_member_no
    );
  end loop;
  return v_member_no;
end;
$$;

revoke all on function public.generate_member_no() from public, anon, authenticated;

alter table public.profiles
  alter column member_no set default public.generate_member_no();

do $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select id from public.profiles where member_no is null
  loop
    update public.profiles
       set member_no = public.generate_member_no()
     where id = v_profile_id and member_no is null;
  end loop;
end;
$$;

alter table public.profiles
  alter column member_no set not null;

create unique index if not exists profiles_member_no_unique
  on public.profiles(member_no);

create or replace function public.resolve_login_email(p_member_no text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  select u.email
    into v_email
    from auth.users as u
    join public.profiles as p on p.id = u.id
   where upper(p.member_no) = upper(trim(p_member_no))
     and p.is_active = true
   limit 1;
  return v_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

commit;

