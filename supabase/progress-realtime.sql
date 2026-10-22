-- v2.0 启用既有业务表的变化通知。保留原有权限与行级访问规则。
begin;
do $$
declare t text;
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception 'Supabase Realtime publication 不存在，请检查项目实时服务';end if;
 foreach t in array array['orders','parcels','tracking_events','payment_notifications'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
commit;
select tablename as realtime_table from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('orders','parcels','tracking_events','payment_notifications') order by tablename;
