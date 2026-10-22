-- v2.2 印尼地区 / 距离尾程测试运价。不重写已有订单或已确认费用。
begin;
create table if not exists public.last_mile_zones (
 id uuid primary key default gen_random_uuid(),
 warehouse_id uuid not null references public.overseas_warehouses(id),
 code text not null check(length(code) between 1 and 40),
 name text not null check(length(trim(name)) between 1 and 120),
 reference_distance_km numeric(10,2) not null check(reference_distance_km between 0 and 50000),
 included_distance_km numeric(10,2) not null check(included_distance_km between 0 and 50000),
 base_fee numeric(12,2) not null check(base_fee>0 and base_fee<10000000),
 price_per_km numeric(12,2) not null check(price_per_km>=0 and price_per_km<100000),
 currency text not null default 'CNY' check(currency='CNY'),
 is_active boolean not null default true,
 is_test_rate boolean not null default true,
 notes text not null default '' check(length(notes)<=1000),
 updated_at timestamptz not null default clock_timestamp(),
 unique(warehouse_id,code)
);
alter table public.last_mile_zones enable row level security;
revoke all on public.last_mile_zones from public,anon,authenticated;
grant select on public.last_mile_zones to authenticated;
drop policy if exists last_mile_zone_read on public.last_mile_zones;
create policy last_mile_zone_read on public.last_mile_zones for select to authenticated
using(exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('merchant','warehouse_operator','admin')));
create or replace function public.touch_last_mile_zone() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');return new;end $$;
drop trigger if exists touch_last_mile_zone on public.last_mile_zones;
create trigger touch_last_mile_zone before update on public.last_mile_zones for each row execute function public.touch_last_mile_zone();
alter table public.orders add column if not exists delivery_zone_id uuid references public.last_mile_zones(id);
-- 仅为测试距离及价格，不能作为实际地图距离或承运商报价。
insert into public.last_mile_zones(warehouse_id,code,name,reference_distance_km,included_distance_km,base_fee,price_per_km,notes)
select w.id,v.code,v.name,v.km,10,v.base,v.unit,'测试参考距离，非导航距离；跨岛不表示公路里程。实际配送范围及距离须由仓库核对。'
from public.overseas_warehouses w cross join (values
 ('JABODETABEK','大雅加达 / Jabodetabek',30,20,0.50),
 ('WEST-JAVA','西爪哇 / Jawa Barat',150,25,0.30),
 ('CENTRAL-JAVA','中爪哇 / Jawa Tengah',450,30,0.25),
 ('EAST-JAVA','东爪哇 / Jawa Timur',800,35,0.22),
 ('BALI','巴厘岛 / Bali',1100,40,0.25),
 ('SUMATRA','苏门答腊 / Sumatra',1200,45,0.28)
)v(code,name,km,base,unit) where w.code='ID-JKT-TEST'
on conflict(warehouse_id,code) do nothing;

create or replace function public.last_mile_distance_amount(p_base numeric,p_included numeric,p_unit numeric,p_distance numeric)
returns numeric language plpgsql immutable set search_path=public as $$
declare n numeric;
begin
 if p_base is null or p_included is null or p_unit is null or p_distance is null
 or p_base::text in ('NaN','Infinity','-Infinity') or p_included::text in ('NaN','Infinity','-Infinity')
 or p_unit::text in ('NaN','Infinity','-Infinity') or p_distance::text in ('NaN','Infinity','-Infinity')
 or p_base<=0 or p_base>=10000000 or p_included<0 or p_included>50000 or p_unit<0 or p_unit>=100000
 or p_distance<0 or p_distance>50000 or p_distance<>round(p_distance,2) then raise exception '尾程距离或运价无效';end if;
 n:=round(p_base+greatest(0,p_distance-p_included)*p_unit,2);
 if n<=0 or n>=10000000 then raise exception '尾程金额超出范围';end if;
 return n;
end $$;

create or replace function public.admin_save_last_mile_zone(p_id uuid,p_expected_updated_at timestamptz,p_config jsonb)
returns public.last_mile_zones language plpgsql security definer set search_path=public as $$
declare z public.last_mile_zones;old_z public.last_mile_zones;k text;n numeric;wid uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active) then raise exception '仅运营管理员可维护尾程运价';end if;
 if jsonb_typeof(p_config) is distinct from 'object' then raise exception '请填写地区运价';end if;
 if p_id is not null then
  select * into old_z from public.last_mile_zones where id=p_id for update;
  if old_z.id is null or old_z.updated_at is distinct from p_expected_updated_at then raise exception '地区运价已变化，请刷新后编辑';end if;
  wid:=old_z.warehouse_id;
 else
  wid:=(p_config->>'warehouse_id')::uuid;
  if not exists(select 1 from public.overseas_warehouses where id=wid and is_active) then raise exception '请选择启用的印尼发货仓';end if;
 end if;
 if coalesce(length(trim(p_config->>'name')),0) not between 1 and 120 or coalesce(length(p_config->>'notes'),0)>1000 then raise exception '请填写有效的地区名称和说明';end if;
 foreach k in array array['reference_distance_km','included_distance_km','base_fee','price_per_km'] loop
  n:=(p_config->>k)::numeric;
  if n is null or n::text in ('NaN','Infinity','-Infinity') or n<>round(n,2) then raise exception '距离和价格须为最多两位小数的有效数值';end if;
 end loop;
 perform public.last_mile_distance_amount((p_config->>'base_fee')::numeric,(p_config->>'included_distance_km')::numeric,(p_config->>'price_per_km')::numeric,(p_config->>'reference_distance_km')::numeric);
 if (p_config->>'is_active') is null or (p_config->>'is_test_rate') is null then raise exception '请指定运价启用及测试状态';end if;
 if p_id is null then
  insert into public.last_mile_zones(warehouse_id,code,name,reference_distance_km,included_distance_km,base_fee,price_per_km,is_active,is_test_rate,notes)
  values(wid,'ZONE-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),trim(p_config->>'name'),(p_config->>'reference_distance_km')::numeric,(p_config->>'included_distance_km')::numeric,(p_config->>'base_fee')::numeric,(p_config->>'price_per_km')::numeric,(p_config->>'is_active')::boolean,(p_config->>'is_test_rate')::boolean,coalesce(p_config->>'notes','')) returning * into z;
 else
  update public.last_mile_zones set name=trim(p_config->>'name'),reference_distance_km=(p_config->>'reference_distance_km')::numeric,included_distance_km=(p_config->>'included_distance_km')::numeric,base_fee=(p_config->>'base_fee')::numeric,price_per_km=(p_config->>'price_per_km')::numeric,is_active=(p_config->>'is_active')::boolean,is_test_rate=(p_config->>'is_test_rate')::boolean,notes=coalesce(p_config->>'notes','') where id=p_id returning * into z;
 end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'last_mile_zone_saved','last_mile_zone',z.id,to_jsonb(old_z),to_jsonb(z));
 return z;
end $$;

create or replace function public.merchant_create_distance_last_mile(p_order_id uuid,p_recipient jsonb,p_zone_id uuid,p_expected_zone_version timestamptz)
returns public.orders language plpgsql security definer set search_path=public as $$
declare p public.orders;o public.orders;z public.last_mile_zones;n numeric;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='merchant' and is_active) then raise exception '仅启用商家可申请尾程';end if;
 select * into p from public.orders where id=p_order_id and merchant_id=auth.uid() for update;
 if p.id is null then raise exception '头程订单不存在或不属于本人';end if;
 select * into o from public.orders where parent_order_id=p.id and transport_leg='last_mile';
 if o.id is not null then return o;end if;
 select * into z from public.last_mile_zones where id=p_zone_id for share;
 if z.id is null or not z.is_active or z.warehouse_id is distinct from p.destination_overseas_warehouse_id then raise exception '请选择该印尼发货仓对应的启用配送地区';end if;
 if z.updated_at is distinct from p_expected_zone_version then raise exception '地区运价已变化，请刷新并重新核对预估';end if;
 n:=public.last_mile_distance_amount(z.base_fee,z.included_distance_km,z.price_per_km,z.reference_distance_km);
 o:=public.merchant_create_last_mile_with_address(p.id,p_recipient);
 update public.orders set delivery_zone_id=z.id where id=o.id returning * into o;
 update public.fees set estimated_shipping_fee=n,estimated_total=n,pricing_snapshot=jsonb_build_object('type','last_mile_distance','zone',to_jsonb(z),'distance_km',z.reference_distance_km,'distance_source','region_reference','estimated_at',clock_timestamp()) where order_id=o.id;
 return o;
end $$;

create or replace function public.warehouse_quote_last_mile_distance(p_order_id uuid,p_zone_id uuid,p_distance_km numeric,p_distance_note text,p_expected_zone_version timestamptz)
returns public.fees language plpgsql security definer set search_path=public as $$
declare o public.orders;p public.orders;z public.last_mile_zones;f public.fees;n numeric;basis text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','warehouse_operator')) or not(public.is_admin() or public.can_operate_order(p_order_id)) then raise exception '无权核定本单尾程报价';end if;
 select * into o from public.orders where id=p_order_id for update;
 select * into p from public.orders where id=o.parent_order_id;
 if o.id is null or o.transport_leg<>'last_mile' or o.status<>'warehouse_received' or p.overseas_received_at is null then raise exception '尾程单当前不可报价';end if;
 select * into z from public.last_mile_zones where id=p_zone_id for share;
 if z.id is null or not z.is_active or z.warehouse_id is distinct from p.destination_overseas_warehouse_id then raise exception '配送地区不属于本单发货仓或已停用';end if;
 if o.delivery_zone_id is not null and o.delivery_zone_id<>z.id then raise exception '请使用商家已选择的配送地区';end if;
 if z.updated_at is distinct from p_expected_zone_version then raise exception '地区运价已变化，请刷新核对后再确认';end if;
 if coalesce(length(trim(p_distance_note)),0) not between 2 and 300 then raise exception '请填写距离核对依据';end if;
 if exists(select 1 from public.fees where order_id=o.id and confirmed_at is not null) or exists(select 1 from public.payments where order_id=o.id) then raise exception '本单尾程报价已确认，不可重算';end if;
 n:=public.last_mile_distance_amount(z.base_fee,z.included_distance_km,z.price_per_km,p_distance_km);
 basis:=left(z.name||'；距离 '||p_distance_km||' km；起步 '||z.base_fee||' CNY（含 '||z.included_distance_km||' km），超出 '||z.price_per_km||' CNY/km；'||trim(p_distance_note),500);
 update public.fees set fee_breakdown_version=4,shipping_fee=0,handling_fee=0,last_mile_fee=n,last_mile_note=basis,total_amount=n,confirmed_at=now(),confirmed_by=auth.uid(),pricing_snapshot=jsonb_build_object('type','last_mile_distance','zone',to_jsonb(z),'distance_km',p_distance_km,'distance_source','warehouse_checked','distance_note',trim(p_distance_note),'confirmed_at',clock_timestamp()) where order_id=o.id returning * into f;
 if f.id is null then raise exception '本单费用记录缺失，请联系运营';end if;
 update public.orders set delivery_zone_id=z.id,status='awaiting_payment' where id=o.id;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'fee_confirmed','尾程地区距离报价已确认','配送费 '||n||' CNY；'||basis,auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'last_mile_distance_quoted','fees',f.id,to_jsonb(f));
 return f;
end $$;
-- 原手工核价入口仅用于没有地区运价的历史尾程单，不能绕过新单的距离计费。
create or replace function public.warehouse_quote_last_mile(p_order_id uuid,p_amount numeric,p_note text)
returns public.fees language plpgsql security definer set search_path=public as $$
declare o public.orders;p public.orders;f public.fees;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','warehouse_operator')) or not(public.is_admin() or public.can_operate_order(p_order_id)) then raise exception '无权核定本单尾程报价';end if;
 select * into o from public.orders where id=p_order_id for update;
 select * into p from public.orders where id=o.parent_order_id;
 if o.delivery_zone_id is not null then raise exception '本单已选择地区，请使用距离核价入口';end if;
 if o.id is null or o.transport_leg<>'last_mile' or o.status<>'warehouse_received' or p.overseas_received_at is null then raise exception '尾程单当前不可报价';end if;
 if p_amount is null or p_amount<=0 or p_amount>=10000000 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') or coalesce(length(trim(p_note)),0) not between 2 and 500 then raise exception '尾程报价须为有效正数人民币金额，并填写报价依据';end if;
 if exists(select 1 from public.fees where order_id=o.id and confirmed_at is not null) or exists(select 1 from public.payments where order_id=o.id) then raise exception '本单尾程报价已确认，不可重算';end if;
 update public.fees set fee_breakdown_version=4,shipping_fee=0,handling_fee=0,last_mile_fee=p_amount,last_mile_note=trim(p_note),total_amount=p_amount,confirmed_at=now(),confirmed_by=auth.uid() where order_id=o.id returning * into f;
 if f.id is null then raise exception '本单费用记录缺失';end if;
 update public.orders set status='awaiting_payment' where id=o.id;
 insert into public.tracking_events(order_id,event_code,event_title,event_description,created_by) values(o.id,'fee_confirmed','尾程报价已确认','历史尾程手工核价，仅支付尾程配送费',auth.uid());
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'last_mile_quoted','fees',f.id,to_jsonb(f));
 return f;
end $$;
revoke all on function public.admin_save_last_mile_zone(uuid,timestamptz,jsonb),public.merchant_create_distance_last_mile(uuid,jsonb,uuid,timestamptz),public.warehouse_quote_last_mile_distance(uuid,uuid,numeric,text,timestamptz),public.last_mile_distance_amount(numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_save_last_mile_zone(uuid,timestamptz,jsonb),public.merchant_create_distance_last_mile(uuid,jsonb,uuid,timestamptz),public.warehouse_quote_last_mile_distance(uuid,uuid,numeric,text,timestamptz),public.last_mile_distance_amount(numeric,numeric,numeric,numeric) to authenticated;
commit;
select 'v2.2 last-mile regional distance pricing installed' as result;
