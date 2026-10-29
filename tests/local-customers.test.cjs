const {test}=require('node:test'),assert=require('node:assert/strict');
test('local customer A and B have isolated addresses, parcels, orders and support while staff can group both',async()=>{
 const {createForwardingDb,withRole,fixtureUsers}=await import('../dev/forwarding-db.mjs');
 const db=await createForwardingDb({secondMerchant:true});
 const rpc=(role,name,args)=>withRole(db,role,async tx=>(await tx.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) r`,args)).rows[0].r);
 const rows=(role,table)=>withRole(db,role,async tx=>(await tx.query('select * from public.'+table)).rows);
 try{
  const recipient=JSON.stringify({recipient_name:'TEST',recipient_phone:'TEST-NO-PHONE',country:'印度尼西亚',city:'Jakarta',address_line:'TEST ONLY'});
  const records={};
  for(const role of ['merchant','merchant2']){
   const profile=(await rows(role,'profiles')).find(p=>p.id===fixtureUsers[role]);assert.equal(profile.role,'merchant');
   await withRole(db,role,tx=>tx.query("insert into merchant_addresses(merchant_id,label,recipient_name,recipient_phone,address_line) values($1,$2,'TEST','TEST','TEST ONLY')",[fixtureUsers[role],role]));
   const parcel=await rpc(role,'merchant_pre_advise',['TEST-'+role,'TEST ITEM',null]);
   const order=await rpc(role,'merchant_create_combined_order',['{'+parcel.id+'}','ID-AIR',recipient,'TEST',require('node:crypto').randomUUID()]);
   const ticket=await rpc(role,'submit_support',[null,order.id,'TEST','TEST support message']);
   records[role]={parcel,order,ticket};
  }
  for(const role of ['merchant','merchant2']){
   assert.deepEqual((await rows(role,'merchant_addresses')).map(a=>a.merchant_id),[fixtureUsers[role]]);
   assert.deepEqual((await rows(role,'parcels')).map(a=>a.id),[records[role].parcel.id]);
   assert.deepEqual((await rows(role,'orders')).map(a=>a.id),[records[role].order.id]);
   assert.deepEqual((await rows(role,'support_tickets')).map(a=>a.id),[records[role].ticket.id]);
   const other=role==='merchant'?'merchant2':'merchant';
   await assert.rejects(rpc(role,'merchant_create_combined_order',['{'+records[other].parcel.id+'}','ID-AIR',recipient,'TEST',require('node:crypto').randomUUID()]));
   const changed=await withRole(db,role,tx=>tx.query('update merchant_addresses set label=\'INVALID\' where merchant_id=$1 returning id',[fixtureUsers[other]]));assert.equal(changed.rows.length,0);
  }
  assert.equal((await rows('warehouse','parcels')).length,2);
  const pending=await rpc('warehouse','warehouse_pending_customers',[]);assert.equal(pending.length,2);assert.ok(pending.every(c=>c.parcel_count===1));
  const directory=await rpc('warehouse','warehouse_customer_directory',[]);assert.deepEqual(directory.map(c=>c.member_no).sort(),['LOCAL-MERCHANT','LOCAL-MERCHANT2']);
  assert.equal((await rows('admin','orders')).length,2);
 }finally{await db.close()}
});

test('local browser identities remain independent per tab and refresh restores selected customer',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const code=fs.readFileSync(require('node:path').join(__dirname,'../dev/forwarding-local-client.js'),'utf8');
 const context=saved=>{
  const storage=new Map(saved?[['eaztrans-local-identity',saved]]:[]),requests=[];
  const ctx=vm.createContext({window:{},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {json:async()=>({data:[]})}}});vm.runInContext(code,ctx);return {api:ctx.window.MospaceSupabase,requests,storage};
 };
 const a=context(),b=context();b.api.setLocalRole('merchant2');
 assert.notEqual((await a.api.currentUser()).id,(await b.api.currentUser()).id);
 await b.api.saveAddress({recipient_name:'TEST'});assert.equal(b.requests.at(-1).role,'merchant2');
 assert.equal(context(b.storage.get('eaztrans-local-identity')).api.getLocalRole(),'merchant2');
 assert.equal(a.api.getLocalRole(),'merchant');assert.throws(()=>b.api.setLocalRole('invalid'));
});

