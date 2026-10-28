import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
export const fixtureUsers={merchant:'10000000-0000-0000-0000-000000000001',admin:'10000000-0000-0000-0000-000000000002',warehouse:'10000000-0000-0000-0000-000000000003'};
export async function createForwardingDb(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 create function storage.extension(text) returns text language sql immutable as $$select reverse(split_part(reverse($1),'.',1))$$;
 grant usage on schema public,auth,storage to authenticated,anon;
 grant select,insert on storage.objects to authenticated;
 alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
 const migrations=['schema','warehouse-operations','admin-operations','merchant-workspace','parcel-maintenance','parcel-estimates','payment-review','sea-route','separate-settlement','overseas-addresses','cargo-channels','last-mile-pricing','overseas-forwarding','combined-delivery'];
 for(const name of migrations){let sql=await fs.readFile(new URL('../supabase/'+name+'.sql',import.meta.url),'utf8');await db.exec(sql.replace('create extension if not exists pgcrypto;',''))}
 for(const [role,id] of Object.entries(fixtureUsers)){
  await db.query('insert into auth.users(id,email) values($1,$2)',[id,role+'@local.test']);
  await db.query("update public.profiles set role=$1,member_no=$2,warehouse_id=(select id from public.warehouses where code='SZ-LG-01') where id=$3",[role==='warehouse'?'warehouse_operator':role,'LOCAL-'+role.toUpperCase(),id]);
 }
 return db;
}
export async function withRole(db,role,fn){
 if(!fixtureUsers[role])throw Error('Invalid local test role');
 return db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[fixtureUsers[role]]);return fn(tx)});
}
export async function seedForwardingPreview(db){
 await db.exec(`insert into public.orders(order_no,merchant_id,warehouse_id,status,route_code,route_name,destination_address,recipient_name,recipient_phone,origin_warehouse_name,origin_warehouse_address,destination_overseas_warehouse_id,destination_warehouse_snapshot,parcel_count)
 select 'MO-LOCAL-TEST-001','${fixtureUsers.merchant}',w.id,'shipped','ID-SEA','印尼海运普货（本地测试）',ow.address_line,ow.contact_name,ow.contact_phone,'深圳测试仓','本地测试地址，禁止寄件',ow.id,to_jsonb(ow),2
 from public.warehouses w cross join public.overseas_warehouses ow where w.code='SZ-LG-01' and ow.code='ID-JKT-TEST';
 insert into public.fees(order_id,fee_breakdown_version,shipping_fee,handling_fee,total_amount,confirmed_at) select id,3,60,18,78,now() from public.orders where order_no='MO-LOCAL-TEST-001';
 insert into public.payments(order_id,merchant_id,amount,status) select id,merchant_id,78,'paid' from public.orders where order_no='MO-LOCAL-TEST-001';
 insert into public.overseas_warehouse_staff(user_id,warehouse_id) select '${fixtureUsers.warehouse}',id from public.overseas_warehouses where code='ID-JKT-TEST';`);
}
