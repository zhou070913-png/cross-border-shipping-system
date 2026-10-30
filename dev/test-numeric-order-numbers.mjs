import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createForwardingDb,withRole,fixtureUsers} from './forwarding-db.mjs';
const db=await createForwardingDb({secondMerchant:true});
const sql=await fs.readFile(new URL('../supabase/numeric-order-numbers.sql',import.meta.url),'utf8');
const recipient={country:'印度尼西亚',recipient_name:'TEST',recipient_phone:'TEST',city:'Jakarta',address_line:'TEST ONLY',postal_code:'12345'};
const rpc=(role,name,args)=>withRole(db,role,async tx=>(await tx.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) r`,args.map(x=>x&&typeof x==='object'?JSON.stringify(x):x))).rows[0].r);
try{
 const p=await rpc('merchant','merchant_pre_advise',['TEST-NUMBER-PARCEL','TEST',null]);
 const request=randomUUID(),args=['{'+p.id+'}','ID-SEA',recipient,'TEST',request];
 const before=await rpc('merchant','merchant_create_combined_order',args);
 const snapshot=(await db.query('select * from orders where id=$1',[before.id])).rows[0];
 await db.exec(sql);await db.exec(sql);
 const after=(await db.query('select * from orders where id=$1',[before.id])).rows[0];
 assert.match(after.order_no,/^\d{18}$/);assert.equal(typeof after.order_no,'string');
 assert.deepEqual({...after,order_no:snapshot.order_no},snapshot);
 assert.equal((await db.query('select previous_order_no from order_number_aliases where order_id=$1',[before.id])).rows[0].previous_order_no,snapshot.order_no);
 assert.equal((await rpc('merchant','merchant_create_combined_order',args)).order_no,after.order_no);
 assert.equal((await db.query('select order_id from order_parcels where parcel_id=$1',[p.id])).rows[0].order_id,before.id);
 for(let i=0;i<5;i++){
  const parcel=await rpc('merchant','merchant_pre_advise',['TEST-NUMBER-'+i,'TEST',null]);
  const o=await rpc('merchant','merchant_create_combined_order',['{'+parcel.id+'}','ID-SEA',recipient,'TEST',randomUUID()]);assert.match(o.order_no,/^\d{18}$/);
 }
 assert.equal((await db.query('select count(*)=count(distinct order_no) ok from orders')).rows[0].ok,true);
 await assert.rejects(withRole(db,'merchant',tx=>tx.query('select * from order_number_aliases')),/permission denied/);
 await assert.rejects(withRole(db,'merchant',tx=>tx.query('select public.next_numeric_order_number()')),/permission denied/);
 assert.equal((await withRole(db,'merchant2',tx=>tx.query('select * from orders'))).rows.length,0);
 await assert.rejects(db.query("update orders set order_no='123' where id=$1",[before.id]),/cannot be changed/);
 console.log('PASS numeric migration: stable UUIDs, unchanged business state, idempotency, actual RPCs, uniqueness, RLS, immutable numbers');
}finally{await db.close()}
