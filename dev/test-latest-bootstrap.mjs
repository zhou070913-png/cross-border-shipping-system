import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {bootstrapSql} from './latest-deployment.mjs';
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 create function storage.extension(text) returns text language sql immutable as $$select reverse(split_part(reverse($1),'.',1))$$;
 grant usage on schema public,auth,storage to authenticated,anon;grant select,insert on storage.objects to authenticated;`);
 const sql=(await bootstrapSql()).replace('create extension if not exists pgcrypto;','');
 await db.exec(sql);
 assert.equal((await db.query('select count(*) n from public.orders')).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from public.profiles')).rows[0].n,0);
 assert.equal((await db.query('select name from public.deployment_environment')).rows[0].name,'latest-development');
 assert.ok((await db.query("select 1 from storage.buckets where id='payment-proofs' and not public")).rows.length);
 assert.ok((await db.query("select to_regprocedure('public.resolve_login_email(text)') f")).rows[0].f);
 console.log('Empty-project bootstrap, member login and private receipts: PASS');
 await assert.rejects(db.exec(sql),/requires a fresh project/);await db.exec('rollback');
 assert.equal((await db.query('select name from public.deployment_environment')).rows[0].name,'latest-development');
 console.log('Existing-project installation refused without changing data: PASS');
}finally{await db.close()}
