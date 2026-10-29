const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');
function addresses(){const h=setup();h.run(`state.page='receivers';state.addresses=Array.from({length:23},(_,n)=>({id:'a'+n,label:'Address '+n,recipient_name:'Receiver '+n,recipient_phone:'PHONE-'+n,city:n===22?'Bandung':'Jakarta',address_line:n===22?'<img src=x onerror=alert(1)>':'Street '+n,postal_code:'POST-'+n,is_default:n===0}));render()`);return h}
test('address pagination covers every row and preserves unsaved add form across pagination, page size and search',()=>{
 const {run,document}=addresses();const form=document.querySelector('#receiverForm');document.querySelector('#receiverName').value='UNSAVED';document.querySelector('#receiverLine').value='DRAFT ADDRESS';
 assert.equal(document.querySelectorAll('[data-address-row]').length,10);assert.match(document.querySelector('#combinedAddressList').textContent,/23 个地址.*1–10.*1 \/ 3/s);
 document.querySelector('[data-address-page="2"]').onclick();assert.equal(document.querySelector('[data-address-row]').dataset.addressRow,'a10');document.querySelector('[data-address-page="3"]').onclick();assert.equal(document.querySelectorAll('[data-address-row]').length,3);
 assert.equal(document.querySelector('#receiverForm'),form);assert.equal(document.querySelector('#receiverName').value,'UNSAVED');assert.equal(document.querySelector('#receiverLine').value,'DRAFT ADDRESS');
 const size=document.querySelector('#addressListSize');size.querySelector('option[value="20"]').selected=true;size.onchange({target:size});assert.equal(document.querySelectorAll('[data-address-row]').length,20);assert.equal(run('addressList.page'),1);
 for(const q of ['Bandung','PHONE-22','POST-22','Receiver 22']){document.querySelector('#addressListQuery').value=q;document.querySelector('#addressListSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-address-row]').length,1);assert.equal(document.querySelector('[data-address-row]').dataset.addressRow,'a22')}
 assert.equal(document.querySelectorAll('#combinedAddressList img').length,0);assert.equal(document.querySelector('#receiverForm'),form);
 document.querySelector('#addressListReset').onclick();assert.equal(run('addressList.query'),'');assert.equal(document.querySelectorAll('[data-address-row]').length,20);
});
test('address editing on later pages opens exact record, preserves editing form on list navigation, and saving retains list position',async()=>{
 const {run,document}=addresses();document.querySelector('[data-address-page="2"]').onclick();document.querySelector('[data-edit-address="a12"]').onclick();assert.equal(document.querySelector('#receiverName').value,'Receiver 12');
 document.querySelector('#receiverName').value='Updated';const form=document.querySelector('#receiverForm');document.querySelector('[data-address-page="3"]').onclick();assert.equal(document.querySelector('#receiverForm'),form);assert.equal(document.querySelector('#receiverName').value,'Updated');
 run(`window.MospaceSupabase.saveAddress=async payload=>{savedAddress=payload;state.addresses=state.addresses.map(a=>a.id===payload.id?{...a,...payload}:a)};window.MospaceSupabase.listAddresses=async()=>state.addresses`);
 run('busyForm=(form,action)=>{addressSavePromise=action()}');form.dispatchEvent(new document.defaultView.Event('submit',{bubbles:true,cancelable:true}));await run('addressSavePromise');assert.equal(run('savedAddress.id'),'a12');assert.equal(run('savedAddress.recipient_name'),'Updated');assert.equal(run('workspace.editingAddress'),null);assert.equal(run('addressList.page'),3);
});
test('address empty search and shrinking data clamp pagination; account changes reset list context',()=>{
 const {run,document}=addresses();document.querySelector('[data-address-page="2"]').onclick();run('state.addresses=state.addresses.slice(0,1);render()');assert.equal(run('addressList.page'),1);assert.ok(document.querySelector('[data-address-page="0"]').disabled);
 document.querySelector('#addressListQuery').value='MISSING';document.querySelector('#addressListSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-address-row]').length,0);assert.match(document.querySelector('#combinedAddressList').textContent,/没有匹配的地址/);
 run(`state.auth.user={id:'another'};state.addresses=[];render()`);assert.equal(run('addressList.query'),'');assert.equal(run('addressList.size'),10);assert.match(document.querySelector('#combinedAddressList').textContent,/0 个地址.*0–0/s);
});
