const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const setup=require('../dev/combined-ui-harness.cjs');
function synced(role='warehouse',page='inbound'){
 const h=setup();Object.defineProperty(h.document,'visibilityState',{value:'visible',configurable:true});
 h.run(`state.role='${role}';state.auth.role='${role==='warehouse'?'warehouse_operator':role}';state.page='${page}';combined.owner='m:${role}';combined.profiles=[];workspace.tickets=[];window.MospaceSupabase.getClient=()=>null;`);
 h.run(fs.readFileSync(path.join(__dirname,'../progress-sync.js'),'utf8'));
 h.run(`render();actualReader=readProgressSnapshot;nextSnapshot=()=>JSON.parse(JSON.stringify(currentProgressSnapshot()));readProgressSnapshot=async()=>nextSnapshot()`);
 return h;
}

test('actual customer directories and received history refresh without losing submitted query, customer or pagination',async()=>{
 for(const page of ['inbound','confirm','ship']){
  const {run,document}=synced('warehouse',page);
  assert.equal(run('progressCanApply()'),true,page);
  const query=document.querySelector(page==='inbound'?'#combinedCustomerQuery':'#staffCustomerQuery');
  Object.defineProperty(query,'defaultValue',{value:query.value});
  query.value='not submitted';assert.equal(run('progressCanApply()'),false,page);
  query.closest('form').onsubmit({preventDefault(){}});assert.equal(run('progressCanApply()'),true,page);
  run(`readProgressSnapshot=async()=>{const s=nextSnapshot();s.orders[0].status='ready_to_ship';return s}`);
  assert.equal(await run('runProgressSync()'),true);assert.equal(document.querySelector(query.id==='combinedCustomerQuery'?'#combinedCustomerQuery':'#staffCustomerQuery').value,'not submitted');
 }
 const {run,document}=synced('warehouse','inbound');
 run(`combined.inboundCustomer='m';combined.inboundTab='received';combined.receiptQuery='TRACK';workspace.parcels=[{id:'p',merchant_id:'m',tracking_no:'TRACK',item_name:'Test',status:'received',received_at:'2026-10-29'}];render()`);
 assert.ok(document.querySelector('#combinedReceiptSearch'));assert.equal(run('progressCanApply()'),true);
 await run('runProgressSync()');assert.equal(run('combined.inboundCustomer'),'m');assert.equal(run('combined.receiptQuery'),'TRACK');
});

test('pending review automatically appears under its customer but an opened review form protects input',async()=>{
 const {run,document}=synced('admin','payment-review');
 assert.equal(run('progressCanApply()'),true);assert.equal(document.querySelector('[data-staff-customer="m"]'),null);
 run(`readProgressSnapshot=async()=>{const s=nextSnapshot();s.receipts=[{id:'r',order_id:'o',amount:100,status:'pending',created_at:'2026-10-29',currency:'CNY',is_test:true,account_snapshot:{}}];return s}`);
 assert.equal(await run('runProgressSync()'),true);assert.ok(document.querySelector('[data-staff-customer="m"]'));
 document.querySelector('[data-staff-customer="m"]').onclick();document.querySelector('[data-review-receipt="r"]').onclick();
 document.querySelector('#reviewNote').value='Checking bank record';
 assert.equal(await run('runProgressSync()'),false);assert.equal(document.querySelector('#reviewNote').value,'Checking bank record');
});

test('support updates conversations for all three roles and retains exact draft DOM nodes and handlers',async()=>{
 for(const role of ['merchant','warehouse','admin']){
  const page=role==='merchant'?'messages':'support-'+role;
  const {run,document}=synced(role,page);
  run(`workspace.tickets=[{id:'t',merchant_id:'m',subject:'Help',message:'Where is my parcel?',status:'open'}];if(state.role!=='merchant')staffCustomerState().customer='m';render()`);
  const form=document.querySelector('[data-combined-reply="t"]'),input=form.querySelector('textarea');input.value='Unsubmitted reply';input.oninput({target:input});
  const newTicket=document.querySelector('#combinedTicket'),newSubject=document.querySelector('#ctSubject');if(newSubject)newSubject.value='New question draft';
  const contacts=document.querySelector('#combinedContacts');if(contacts)document.querySelector('#ccWechat').value='Unsaved contact';
  Object.defineProperty(document,'activeElement',{get:()=>input,configurable:true});
  assert.equal(run('progressCanApply()'),true,role);
  run(`readProgressSnapshot=async()=>{const s=nextSnapshot();s.combinedSnapshot.replies.push({id:'reply',ticket_id:'t',actor_role:'admin',message:'NEW REPLY',created_at:'2026-10-29'});s.combinedSnapshot.tickets[0].status='replied';return s}`);
  assert.equal(await run('runProgressSync()'),true,role);
  assert.match(document.querySelector('[data-support-conversations]').textContent,/NEW REPLY/);
  assert.equal(document.querySelector('[data-combined-reply="t"]'),form);assert.equal(form.querySelector('textarea'),input);assert.equal(input.value,'Unsubmitted reply');assert.equal(document.activeElement,input);assert.equal(typeof form.onsubmit,'function');
  if(newTicket){assert.equal(document.querySelector('#combinedTicket'),newTicket);assert.equal(newSubject.value,'New question draft')}
  if(contacts){assert.equal(document.querySelector('#combinedContacts'),contacts);assert.equal(document.querySelector('#ccWechat').value,'Unsaved contact')}
 }
});

test('new support tickets appear in an empty directory and dashboard reply counts follow refreshed data',async()=>{
 for(const page of ['dashboard','support-admin']){
  const {run,document}=synced('admin',page);
  run(`readProgressSnapshot=async()=>{const s=nextSnapshot();s.combinedSnapshot.tickets=[{id:'new',merchant_id:'m',subject:'NEW QUESTION',message:'Details',status:'open'}];return s}`);
  assert.equal(await run('runProgressSync()'),true);
  if(page==='support-admin')assert.ok(document.querySelector('[data-staff-customer="m"]'));
  else assert.match(document.querySelector('[data-staff-section="support-admin"]').textContent,/1/);
 }
 const {run,document}=synced('merchant','messages');
 run(`readProgressSnapshot=async()=>{const s=nextSnapshot();s.combinedSnapshot.tickets=[{id:'new',merchant_id:'m',subject:'NEW QUESTION',message:'Details',status:'open'}];return s}`);
 await run('runProgressSync()');assert.ok(document.querySelector('[data-combined-reply="new"]'));assert.equal(typeof document.querySelector('[data-combined-reply="new"]').onsubmit,'function');
});

test('background network errors preserve data and drafts, show retry, and recover without migration advice',async()=>{
 const {run,document}=synced('merchant','messages');const input=document.querySelector('#ctSubject');input.value='Keep this draft';
 run(`readProgressSnapshot=async()=>{throw TypeError('Failed to fetch')}`);
 assert.equal(await run('runProgressSync()'),false);assert.equal(run('combined.ready'),true);assert.equal(run('state.dbOrders.length'),1);assert.equal(document.querySelector('#ctSubject'),input);assert.equal(input.value,'Keep this draft');
 assert.match(document.querySelector('#combinedLoadError').textContent,/网络/);assert.doesNotMatch(document.querySelector('#combinedLoadError').textContent,/安装|迁移/);assert.ok(document.querySelector('[data-combined-retry]'));
 run('readProgressSnapshot=async()=>nextSnapshot()');assert.equal(await run('runProgressSync()'),true);assert.equal(document.querySelector('#combinedLoadError'),null);assert.equal(input.value,'Keep this draft');
});

test('error types distinguish session, permission, missing function and network in three languages',()=>{
 const {run,document}=synced();
 for(const [error,kind]of [[{status:401},'session'],[{code:'PGRST301'},'session'],[{code:'42501'},'permission'],[{code:'PGRST202'},'migration'],[{message:'Failed to fetch'},'network']]){
  assert.equal(run(`combinedLoadError(${JSON.stringify(error)}).kind`),kind);
  for(const language of ['zh','en','id']){
   run(`uiLanguage.current='${language}';combined.error=combinedLoadError(${JSON.stringify(error)});showCombinedLoadError()`);
   const text=document.querySelector('#combinedLoadError').textContent;assert.doesNotMatch(text,/undefined/);if(language!=='zh')assert.doesNotMatch(text,/[\u4e00-\u9fff]/);
  }
 }
});

test('late support results and errors cannot overwrite another customer account or page',async()=>{
 for(const change of [`state.auth.user={id:'another'}`,`state.page='dashboard'`]){
  const {run,document}=synced('merchant','messages');run(`readProgressSnapshot=()=>new Promise(r=>finish=r);const incoming=nextSnapshot();incoming.combinedSnapshot.tickets=[{id:'secret',merchant_id:'m',subject:'OLD ACCOUNT',message:'secret'}]`);
  const pending=run('runProgressSync()');run(change+';finish(incoming)');assert.equal(await pending,false);assert.equal(run('workspace.tickets.length'),0);assert.doesNotMatch(document.querySelector('#content').textContent,/OLD ACCOUNT/);
 }
 const {run,document}=synced();run(`readProgressSnapshot=()=>new Promise((r,j)=>fail=j)`);const pending=run('runProgressSync()');run(`state.auth.user={id:'another'};fail(Error('network'))`);assert.equal(await pending,false);assert.equal(document.querySelector('#combinedLoadError'),null);
});

test('failed customer directory read is explicit and retains previous data; retry restores the same page',async()=>{
 const {run,document}=synced();
 run(`queryData=async()=>[];rpcWorkspace=async name=>{if(name==='warehouse_customer_directory')throw {code:'42501'};return name.endsWith('capabilities')?1:[]};`);
 await run('loadMerchantWorkspace()');assert.equal(run('combined.ready'),true);assert.equal(run('combined.error.kind'),'permission');
 run('render()');assert.ok(document.querySelector('#combinedLoadError'));assert.equal(run('state.page'),'inbound');
 run(`rpcWorkspace=async name=>name.endsWith('capabilities')?1:[]`);await run('loadMerchantWorkspace()');assert.equal(run('combined.error'),null);run('render()');assert.equal(document.querySelector('#combinedLoadError'),null);
});

test('initial load failure blocks business forms and its retry rechecks features without resetting the database',async()=>{
 const {run,document}=synced('merchant','packing-request');
 run(`combined.ready=false;combined.error=combinedLoadError({message:'Failed to fetch'});queryData=async()=>[];rpcWorkspace=async name=>name.endsWith('capabilities')?1:[];render()`);
 assert.equal(document.querySelectorAll('#content form').length,0);assert.doesNotMatch(document.querySelector('#content').textContent,/安装|迁移/);
 await document.querySelector('[data-combined-retry]').onclick();assert.equal(run('combined.ready'),true);assert.equal(run('state.page'),'packing-request');assert.equal(document.querySelector('#combinedLoadError'),null);
});

test('real background reader includes complete support records and latest warehouse customer identities',async()=>{
 const {run}=synced('warehouse','dashboard');
 // Use the actual reader rather than the UI fixtures used above.
 run(`readProgressSnapshot=actualReader;calls=[];window.MospaceSupabase.myOrders=async()=>state.dbOrders;forwarding.ready=false;queryData=async t=>{calls.push(t);return t==='support_tickets'?[{id:'ticket'}]:t==='support_replies'?[{id:'reply'}]:[]};paymentRows=async()=>[];rpcWorkspace=async name=>{calls.push(name);return [{merchant_id:'customer',member_no:'M12345678'}]};`);
 const s=await run('readProgressSnapshot()');assert.equal(s.combinedSnapshot.tickets[0].id,'ticket');assert.equal(s.combinedSnapshot.replies[0].id,'reply');assert.equal(s.combinedSnapshot.customers[0].member_no,'M12345678');
 for(const name of ['support_tickets','support_replies','warehouse_pending_customers','warehouse_customer_directory'])assert.equal(run(`calls.includes('${name}')`),true);
 run(`queryData=async()=>{throw Error('offline')}`);await assert.rejects(run('readProgressSnapshot()'),/offline/);
});

test('support query batches keep all history beyond the default database row limit',async()=>{
 const {run}=synced();
 run(`const allRecords=Array.from({length:1025},(_,id)=>({id}));const ranges=[];window.MospaceSupabase.getClient=()=>({from(table){const q={select(){return q},order(){return q},range:async(a,b)=>{ranges.push([table,a,b]);return {data:allRecords.slice(a,b+1)}}};return q}})`);
 for(const table of ['support_tickets','support_replies'])assert.equal((await run(`queryData('${table}')`)).length,1025);
 assert.equal(run('ranges.length'),6);
});

test('unchanged snapshots do not rerender the workspace or replace support input elements',async()=>{
 const {run,document}=synced('merchant','messages'),input=document.querySelector('#ctSubject');
 run(`refreshes=0;const actualSupportRefresh=refreshCombinedSupportView;refreshCombinedSupportView=()=>{refreshes++;actualSupportRefresh()}`);
 assert.equal(await run('runProgressSync()'),true);assert.equal(await run('runProgressSync()'),true);assert.equal(run('refreshes'),0);assert.equal(document.querySelector('#ctSubject'),input);
});
