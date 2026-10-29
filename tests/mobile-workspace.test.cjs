const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const setup=require('../dev/combined-ui-harness.cjs');
function mobileSetup(){const context=setup();context.run(fs.readFileSync(path.join(__dirname,'../mobile-workspace.js'),'utf8'));return context}

test('H5 home has four customer tabs, functional parcel filters and payment summary',()=>{
 const {run,document}=mobileSetup();run(`workspace.parcels=[{id:'p',tracking_no:'TEST-MOBILE',item_name:'TEST',status:'pre_advised'}];state.page='dashboard';render()`);
 assert.equal(document.querySelectorAll('#h5BottomNav button').length,4);
 assert.match(document.querySelector('.h5-primary-action').textContent,/预报包裹/);
 document.querySelector('[data-mobile-task="parcels"]').onclick();assert.equal(run('state.page'),'parcels');assert.equal(run('combined.filter'),'pre_advised');
 document.querySelector('[data-h5-nav="orders"]').onclick();assert.equal(run('state.page'),'orders');assert.equal(run('combined.filter'),'all');assert.ok(document.querySelector('[data-h5-nav="orders"]').hasAttribute('aria-current'));
});

test('mobile card conversion keeps business buttons and unsaved input nodes intact and is idempotent',()=>{
 const {run,document}=mobileSetup();run(`state.page='orders';render()`);
 const table=document.querySelector('.h5-card-table');assert.ok(table);assert.equal(table.dataset.h5Cards,'true');
 const action=table.querySelector('[data-combined-open]')||table.querySelector('button');assert.equal(typeof action.onclick,'function');
 const input=document.createElement('input');input.value='UNSAVED';table.querySelector('td').append(input);
 run('mobilePrepareTables(document.getElementById("content"))');assert.equal(table.querySelector('input'),input);assert.equal(input.value,'UNSAVED');assert.equal(table.querySelectorAll('.h5-cell-label').length,7);
});

test('phone order detail and back navigation work without waiting for tracking or losing draft',async()=>{
 const {run,document}=mobileSetup();run(`state.page='orders';render();window.MospaceSupabase.orderTracking=()=>new Promise(r=>releaseMobileTracking=r)`);
 const pending=run('combinedOpen("o")');assert.equal(run('state.page'),'fee');assert.ok(document.querySelector('#h5Back'));
 const field=document.createElement('input');field.value='KEEP';document.querySelector('#content').append(field);
 run(`releaseMobileTracking([{event_title:'TEST-MOBILE',occurred_at:'2026-10-29'}])`);await pending;assert.equal(field.value,'KEEP');assert.equal(field.isConnected,true);
 document.querySelector('#h5Back').click();assert.equal(run('state.page'),'orders');
});

test('account services stay usable after render and H5 never exposes staff workspaces',()=>{
 const {run,document}=mobileSetup();run(`state.page='profile';render()`);
 assert.ok(document.querySelector('.h5-account-services'));document.querySelector('.h5-account-services [data-page="receivers"]').click();assert.equal(run('state.page'),'receivers');assert.ok(document.querySelector('#h5Back'));
 run(`state.auth.role='warehouse_operator';state.role='warehouse';state.page='dashboard';render()`);
 assert.match(document.querySelector('#content').textContent,/仅供商家/);assert.equal(document.querySelector('#h5BottomNav'),null);assert.equal(run(`go('inbound',{role:'warehouse'})`),false);
 assert.equal(document.querySelector('.h5-staff-handoff a').getAttribute('href'),'../');
});

test('H5 login is merchant-only, supports form submit and three languages without changing input values',()=>{
 const {run,document}=mobileSetup();run(`state.auth.user=null;state.auth.role=null;state.page='dashboard';render()`);
 assert.ok(document.querySelector('#h5LoginForm'));assert.equal(document.querySelectorAll('[data-login-role]').length,0);assert.equal(document.querySelector('#h5BottomNav'),null);
 const identifier=document.querySelector('#loginIdentifier');identifier.value='TEST-CUSTOMER';run(`setUiLanguage('en')`);assert.match(document.querySelector('#content').textContent,/Customer sign in/);assert.equal(identifier.value,'TEST-CUSTOMER');assert.equal(identifier.getAttribute('placeholder'),'Member number or email');
 run(`setUiLanguage('id')`);assert.match(document.querySelector('#content').textContent,/Masuk pelanggan/);assert.equal(identifier.value,'TEST-CUSTOMER');
 run('landingCalls=0;submitLandingAuth=async()=>{landingCalls++}');document.querySelector('#h5LoginForm').onsubmit({preventDefault(){}});assert.equal(run('landingCalls'),1);
});

test('mobile history pushes navigation once and avoids duplicates during refresh and rendering',()=>{
 const {run}=mobileSetup();run(`historyCalls=[];window.history={replaceState:r=>historyCalls.push(['replace',r]),pushState:r=>historyCalls.push(['push',r])};state.page='dashboard';render();go('orders',{role:'merchant'});render();render();`);
 assert.equal(run(`historyCalls.filter(x=>x[0]==='push').length`),1);assert.equal(run(`historyCalls.at(-1)[1].page`),'orders');
});

test('mobile payment keeps the receipt uploader and payer draft while tracking finishes',async()=>{
 const {run,document}=mobileSetup();run(`o.status='awaiting_payment';o.fees=[{confirmed_at:'now',total_amount:108,shipping_fee:60,last_mile_fee:30,handling_fee:18}];paymentWorkspace.account={id:'a',bank_name:'TEST',account_holder:'TEST',account_number:'TEST',currency:'CNY',is_active:true,mode:'test',updated_at:'v1'};window.MospaceSupabase.orderTracking=()=>new Promise(r=>mobileTrackingReady=r)`);
 const opened=run(`combinedOpen('o')`),upload=document.querySelector('input[type=file]');assert.ok(upload);
 const form=upload.closest('form'),text=form.querySelector('input[type=text]');assert.ok(text);text.value='MOBILE DRAFT';
 run(`mobileTrackingReady([])`);await opened;assert.equal(document.querySelector('input[type=file]'),upload);assert.equal(text.value,'MOBILE DRAFT');assert.equal(form.isConnected,true);
});

test('H5 release uses dedicated assets and link verification; desktop source entry stays byte-identical',async()=>{
 const fsp=require('node:fs/promises'),os=require('node:os');const {buildMobile}=await import('../dev/mobile-deployment.mjs');
 const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'eaztrans-h5-')),entry=path.join(__dirname,'../index.html'),before=await fsp.readFile(entry);
 try{
  const output=path.join(tmp,'h5');await buildMobile({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_TEST',output});
  const html=await fsp.readFile(path.join(output,'index.html'),'utf8');assert.match(html,/mobile-workspace.css/);assert.ok(html.indexOf('mobile-workspace.js')<html.indexOf('<script>render();'));
  assert.match(html,/viewport-fit=cover/);assert.match(html,/商家移动端/);assert.doesNotMatch(html,/forwarding-local-client/);
  const client=await fsp.readFile(path.join(output,'supabase-client.js'),'utf8');assert.match(client,/"signupVerification":"link"/);assert.doesNotMatch(client,/bdxqphmzwojamyuboqmz/);
  assert.equal(JSON.parse(await fsp.readFile(path.join(output,'deployment.json'),'utf8')).surface,'merchant-h5');assert.deepEqual(await fsp.readFile(entry),before);
 }finally{await fsp.rm(tmp,{recursive:true,force:true})}
});
