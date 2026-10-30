const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const setup=require('../dev/combined-ui-harness.cjs');
function mobileSetup(){const context=setup();context.run(fs.readFileSync(path.join(__dirname,'../mobile-workspace.js'),'utf8'));return context}

test('H5 home has five customer tabs, functional parcel filters and payment summary',()=>{
 const {run,document}=mobileSetup();run(`workspace.parcels=[{id:'p',tracking_no:'TEST-MOBILE',item_name:'TEST',status:'pre_advised'}];state.page='dashboard';render()`);
 assert.equal(document.querySelectorAll('#h5BottomNav button').length,5);
 assert.match(document.querySelector('#h5BottomNav button:nth-child(3)').textContent,/预报包裹/);
 assert.equal(document.querySelector('#h5SwitchAccount'),null);
 assert.equal(document.querySelector('.h5-welcome h1'),null);assert.doesNotMatch(document.querySelector('.h5-welcome').textContent,/让每一件包裹/);
 assert.ok(document.querySelector('.h5-service-card').compareDocumentPosition(document.querySelector('.h5-task-grid'))&4);
 document.querySelector('[data-mobile-task="parcels"]').onclick();assert.equal(run('state.page'),'parcels');assert.equal(run('combined.filter'),'pre_advised');
 document.querySelector('[data-h5-nav="orders"]').onclick();assert.equal(run('state.page'),'orders');assert.equal(run('combined.filter'),'all');assert.ok(document.querySelector('[data-h5-nav="orders"]').hasAttribute('aria-current'));
});

test('mobile compact cards keep details out of list and retain working detail navigation',()=>{
 const {run,document}=mobileSetup();run(`state.page='orders';render()`);
 assert.ok(document.querySelector('.h5-list-card'));assert.equal(document.querySelector('.combined-order-address'),null);
 assert.equal(document.querySelector('.h5-list-card header button').textContent,'查看详情');
 run(`setUiLanguage('en')`);assert.equal(document.querySelector('.h5-list-card header button').textContent,'View details');
 assert.equal(typeof document.querySelector('[data-combined-open]').onclick,'function');
 run(`workspace.parcels=[{id:'p',tracking_no:'TEST-PARCEL',item_name:'ITEM',status:'pre_advised'}];state.page='parcels';render()`);
 document.querySelector('[data-workspace-parcel]').onclick();assert.equal(run('state.page'),'parcel-detail');assert.equal(run('workspace.detailParcelId'),'p');
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

test('H5 switches accounts directly, clears the persisted session and cannot restore the previous customer',async()=>{
 const {run,document}=mobileSetup();run(`
  persistedUser={id:'m',email:'a@local.test'};logoutScopes=[];reloads=[];
  window.location={pathname:'/h5/',search:'?v=test',replace:url=>reloads.push(url)};
  window.MospaceSupabase.getClient=()=>({auth:{signOut:async options=>{logoutScopes.push(options.scope);persistedUser=null;return {error:null}}}});
  window.MospaceSupabase.currentUser=async()=>persistedUser;
  window.MospaceSupabase.currentProfile=async user=>({id:user.id,member_no:'CUSTOMER-B',role:'merchant'});
  window.MospaceSupabase.myOrders=async()=>[];window.MospaceSupabase.listAddresses=async()=>[];
  loadMerchantWorkspace=async()=>{combined.ready=true};
  state.page='profile';render();document.getElementById('authBtn').onclick=()=>{throw Error('Hidden desktop button must not be used')};
 `);
 assert.equal(document.querySelector('#h5SwitchAccount'),null);assert.ok(document.querySelector('.h5-account-actions [data-h5-signout]'));
 await document.querySelector('.h5-account-actions [data-h5-signout]').onclick();
 assert.equal(run('logoutScopes.join()'),'local');assert.equal(run('state.auth.user'),null);assert.equal(run('state.dbOrders.length'),0);assert.equal(run('workspace.parcels.length'),0);assert.equal(run('reloads[0]'),'/h5/?v=test');assert.ok(document.querySelector('#h5LoginForm'));
 await run('syncAuth()');assert.equal(run('state.auth.user'),null);assert.ok(document.querySelector('#h5LoginForm'));
 run(`window.MospaceSupabase.signInWithIdentifier=async identifier=>{persistedUser={id:'merchant-b',email:identifier}}`);
 document.querySelector('#loginIdentifier').value='b@local.test';document.querySelector('#loginPassword').value='test-only-password';
 await run('submitLandingAuth()');assert.equal(run('state.auth.user.id'),'merchant-b');assert.equal(run('state.page'),'dashboard');assert.equal(run('state.dbOrders.length'),0);assert.doesNotMatch(document.querySelector('#content').textContent,/TEST-ORDER/);
});

test('H5 logout failure stays retryable, prevents duplicate requests and blocks stale auth restoration',async()=>{
 const {run,document}=mobileSetup();run(`state.page='profile';render();logoutCalls=0;window.MospaceSupabase.getClient=()=>({auth:{signOut:()=>{logoutCalls++;return new Promise(r=>releaseLogout=r)}}});window.MospaceSupabase.currentUser=()=>new Promise(r=>releaseOldAuth=r)`);
 const staleAuth=run('syncAuth({renderView:false})');
 const first=run('mobileSignOut()');assert.equal(document.querySelector('#h5SignOut').disabled,true);await run('mobileSignOut()');assert.equal(run('logoutCalls'),1);
 run(`releaseLogout({error:Error('offline')})`);assert.equal(await first,false);assert.equal(run('state.auth.user.id'),'m');assert.equal(document.querySelector('#h5SignOut').disabled,false);assert.equal(run('authFlow.busy'),false);
 run(`releaseOldAuth({id:'stale-customer'})`);await staleAuth;assert.equal(run('state.auth.user.id'),'m');
 run(`window.MospaceSupabase.getClient=()=>({auth:{signOut:async()=>({error:null})}})`);assert.equal(await run('mobileSignOut()'),true);assert.ok(document.querySelector('#h5LoginForm'));
});

test('H5 staff handoff also offers a working switch to a customer account and saves block logout',async()=>{
 const {run,document}=mobileSetup();run(`logoutCalls=0;window.MospaceSupabase.getClient=()=>({auth:{signOut:async()=>{logoutCalls++;return {error:null}}}});state.auth.role='warehouse_operator';state.role='warehouse';render()`);
 assert.ok(document.querySelector('.h5-staff-handoff [data-h5-signout]'));
 run('paymentWorkspace.busy=true');assert.equal(await run('mobileSignOut()'),false);assert.equal(run('logoutCalls'),0);
 run('paymentWorkspace.busy=false');await document.querySelector('.h5-staff-handoff [data-h5-signout]').onclick();assert.ok(document.querySelector('#h5LoginForm'));assert.equal(run('logoutCalls'),1);
});

test('H5 release uses dedicated assets and link verification; desktop source entry stays byte-identical',async()=>{
 const fsp=require('node:fs/promises'),os=require('node:os');const {buildMobile}=await import('../dev/mobile-deployment.mjs');
 const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'eaztrans-h5-')),entry=path.join(__dirname,'../index.html'),before=await fsp.readFile(entry);
 try{
  const output=path.join(tmp,'h5');await buildMobile({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_TEST',output});
  const html=await fsp.readFile(path.join(output,'index.html'),'utf8');assert.match(html,/mobile-workspace.css/);assert.ok(html.indexOf('mobile-workspace.js')<html.indexOf('<script>render();'));
  assert.match(html,/viewport-fit=cover/);assert.match(html,/<title>Eaztrans集运系统<\/title>/);
  const {parseHTML}=require('linkedom'),head=parseHTML(html).document.head;
  assert.equal(head.querySelector('meta[property="og:title"]').content,'Eaztrans集运系统');
  const image=head.querySelector('meta[property="og:image"]').content;
  assert.equal(image,'https://zhou070913-png.github.io/eaztrans-latest-development/h5/eaztrans-share.png?v=1');
  assert.equal(head.querySelector('link[rel="canonical"]').getAttribute('href'),'https://zhou070913-png.github.io/eaztrans-latest-development/h5/');
  const icon=await fsp.readFile(path.join(output,'eaztrans-share.png'));assert.equal(icon.subarray(1,4).toString(),'PNG');assert.equal(icon.readUInt32BE(16),512);assert.equal(icon.readUInt32BE(20),512);assert.doesNotMatch(html,/forwarding-local-client/);
  const client=await fsp.readFile(path.join(output,'supabase-client.js'),'utf8');assert.match(client,/"signupVerification":"link"/);assert.doesNotMatch(client,/bdxqphmzwojamyuboqmz/);
  assert.equal(JSON.parse(await fsp.readFile(path.join(output,'deployment.json'),'utf8')).surface,'merchant-h5');assert.deepEqual(await fsp.readFile(entry),before);
 }finally{await fsp.rm(tmp,{recursive:true,force:true})}
});

test('scroll loading grows in batches, resets for filters, preserves limit on return and rejects stale observer',()=>{
 const {run,document}=mobileSetup();run(`observerCallbacks=[];window.IntersectionObserver=class {constructor(cb){observerCallbacks.push(cb)}observe(){}disconnect(){}};state.dbOrders=Array.from({length:31},(_,i)=>({...o,id:'o'+i,order_no:'2026103000000000'+i}));state.page='orders';render()`);
 assert.equal(document.querySelectorAll('.h5-list-card').length,12);assert.equal(document.querySelector('.pagination-pages'),null);
 run(`observerCallbacks.at(-1)([{isIntersecting:true}])`);assert.equal(document.querySelectorAll('.h5-list-card').length,24);
 run(`go('profile');go('orders')`);assert.equal(document.querySelectorAll('.h5-list-card').length,24);
 document.querySelector('[data-h5-load]').onclick();assert.equal(document.querySelectorAll('.h5-list-card').length,31);assert.equal(document.querySelector('[data-h5-load]'),null);
 run(`combined.filter='pending';render()`);assert.equal(document.querySelectorAll('.h5-list-card').length,12);
 run(`workspace.orderQuery='NO-MATCH';render();observerCallbacks[0]([{isIntersecting:true}])`);assert.equal(document.querySelectorAll('.h5-list-card').length,0);
 run(`workspace.parcels=Array.from({length:27},(_,i)=>({id:'p'+i,tracking_no:'TEST-'+i,item_name:'ITEM',status:'pre_advised'}));combined.filter='all';state.page='parcels';render()`);
 assert.equal(document.querySelectorAll('.h5-list-card').length,12);document.querySelector('[data-h5-load]').onclick();assert.equal(document.querySelectorAll('.h5-list-card').length,24);
 run(`state.auth.user={id:'second'};render()`);assert.equal(document.querySelectorAll('.h5-list-card').length,12);
});
test('newcomer guide appears once, persists dismissal and can be reopened from account; shopping remains a placeholder',()=>{
 const {run,document}=mobileSetup();run(`guideStore={};localStorage.getItem=k=>guideStore[k]||null;localStorage.setItem=(k,v)=>guideStore[k]=v;render()`);
 assert.ok(document.querySelector('#h5Guide'));document.querySelector('#h5GuideClose').click();run('render()');assert.equal(document.querySelector('#h5Guide'),null);
 run(`mobile.guideSeen=false;render()`);assert.equal(document.querySelector('#h5Guide'),null);
 run(`state.page='profile';render()`);document.querySelector('[data-h5-guide]').click();assert.ok(document.querySelector('#h5Guide'));document.querySelector('#h5GuideClose').click();
 assert.match(document.querySelector('#h5Shopping').textContent,/即将开放/);document.querySelector('#h5Shopping').click();assert.equal(run('state.page'),'profile');
 run(`setUiLanguage('en');mobileGuide(true)`);assert.match(document.querySelector('#h5Guide').textContent,/Welcome to Eaztrans/);assert.doesNotMatch(document.querySelector('#h5Guide').textContent,/预报包裹/);
});

test('mobile detail return restores list scroll while a new filter starts at the top',()=>{
 const {run}=mobileSetup();run(`positions=[];window.scrollTo=(x,y)=>positions.push(y);state.page='orders';render();window.scrollY=640;go('profile');window.scrollY=0;go('orders')`);
 assert.equal(run('positions.at(-1)'),640);
 run(`combined.filter='pending';render()`);assert.equal(run('positions.at(-1)'),0);
});

test('tracking shortcuts use compact incremental lists, retain tracking filters and return from shipment details',async()=>{
 const {run,document}=mobileSetup();run(`state.dbOrders=Array.from({length:29},(_,i)=>({...o,id:'t'+i,order_no:'20261030000000'+i}));window.MospaceSupabase.orderTracking=async()=>[];go('dashboard')`);
 document.querySelector('[data-page="tracking-list"]').click();assert.equal(run('state.page'),'tracking-list');assert.equal(document.querySelectorAll('.h5-list-card').length,12);assert.equal(document.querySelector('.pagination-pages'),null);assert.equal(document.querySelector('h1').textContent,'物流查询');
 document.querySelector('[data-h5-load]').onclick();assert.equal(document.querySelectorAll('.h5-list-card').length,24);
 document.querySelector('[data-combined-filter="pending"]').click();assert.equal(run('state.page'),'tracking-list');assert.equal(document.querySelectorAll('.h5-list-card').length,12);
 assert.equal(document.querySelector('[data-combined-open]').textContent,'查看物流');await document.querySelector('[data-combined-open]').onclick();assert.equal(run('state.page'),'tracking');
 document.querySelector('#h5Back').click();assert.equal(run('state.page'),'tracking-list');
 for(const page of ['sea-tracking','billing']){run(`go('${page}')`);assert.equal(document.querySelectorAll('.h5-list-card').length,12);assert.equal(document.querySelector('.pagination-pages'),null)}
});
test('account overview is a service row; profile details open progressively and the original save still works',async()=>{
 const {run,document}=mobileSetup();run(`go('profile');saveWorkspaceTable=async(table,payload,id)=>({...state.auth.profile,...payload})`);
 assert.equal(document.querySelector('#profileForm'),null);assert.equal(document.querySelector('.account-facts'),null);
 const entry=document.querySelector('[data-page="account-details"]');assert.equal(entry.parentElement,document.querySelector('.h5-account-services'));entry.click();assert.equal(run('state.page'),'account-details');assert.ok(document.querySelector('#profileForm'));assert.equal(document.querySelector('.h5-account-services'),null);
 document.querySelector('#profileName').value='TEST CHANGED';document.querySelector('#profilePhone').value='TEST';
 document.querySelector('#profileForm').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(run('state.auth.profile.display_name'),'TEST CHANGED');
 document.querySelector('#h5Back').click();assert.equal(run('state.page'),'profile');assert.equal(document.querySelector('#profileForm'),null);
});
test('H5 build creates an isolated ephemeral SDK session and preserves explicit email confirmation handling',async()=>{
 const {mobileAsset,mobileHtml}=await import('../dev/mobile-entry.mjs');
 const clientSource=fs.readFileSync(path.join(__dirname,'../supabase-client.js'),'utf8');
 let options,creates=0;const sdk={auth:{getUser:async()=>({data:{user:null},error:null})}};
 const global={supabase:{createClient:(url,key,opts)=>{creates++;options=opts;return sdk}}};
 vm.runInNewContext(mobileAsset('supabase-client.js',clientSource),{window:global});
 assert.equal(global.MospaceSupabase.getClient(),sdk);assert.equal(global.MospaceSupabase.getClient(),sdk);assert.equal(creates,1);
 assert.equal(options.auth.persistSession,false);assert.equal(options.auth.storageKey,'eaztrans-h5-auth-v1');assert.equal(options.auth.detectSessionInUrl,true);assert.equal(await global.MospaceSupabase.currentUser(),null);
 assert.doesNotMatch(clientSource,/persistSession:false/);
 const entry=mobileHtml(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'));assert.match(entry,/supabase-client.js\?v=h5-4/);
});

test('account has only the top-bar title and address scrolling/search preserve the live add and edit form',async()=>{
 const {run,document}=mobileSetup();run(`go('profile')`);assert.equal(document.querySelector('#content h1'),null);assert.equal(document.querySelector('.h5-heading-title').textContent,'我的');
 run(`observerCallbacks=[];window.IntersectionObserver=class{constructor(cb){observerCallbacks.push(cb)}observe(){}disconnect(){}};state.addresses=Array.from({length:29},(_,i)=>({id:'a'+i,label:'Address '+i,recipient_name:'Receiver '+i,recipient_phone:'PHONE-'+i,city:i===28?'Bandung':'Jakarta',address_line:'Street '+i,postal_code:'ZIP-'+i}));go('receivers')`);
 const form=document.querySelector('#receiverForm');document.querySelector('#receiverName').value='UNSAVED';document.querySelector('#receiverLine').value='DRAFT';
 assert.equal(document.querySelectorAll('[data-address-row]').length,12);assert.equal(document.querySelector('#addressListSize'),null);assert.equal(document.querySelector('[data-address-page]'),null);
 run(`observerCallbacks.at(-1)([{isIntersecting:true}])`);assert.equal(document.querySelectorAll('[data-address-row]').length,24);assert.equal(document.querySelector('#receiverForm'),form);assert.equal(document.querySelector('#receiverName').value,'UNSAVED');
 document.querySelector('[data-h5-load]').click();assert.equal(document.querySelectorAll('[data-address-row]').length,29);assert.equal(document.querySelector('[data-h5-load]'),null);
 document.querySelector('#addressListQuery').value='ZIP-28';document.querySelector('#addressListSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-address-row]').length,1);assert.equal(document.querySelector('[data-address-row]').dataset.addressRow,'a28');assert.equal(document.querySelector('#receiverForm'),form);assert.equal(document.querySelector('#receiverLine').value,'DRAFT');
 document.querySelector('#addressListReset').click();assert.equal(document.querySelectorAll('[data-address-row]').length,12);document.querySelector('[data-h5-load]').click();document.querySelector('[data-edit-address="a18"]').click();
 assert.equal(document.querySelector('#receiverName').value,'Receiver 18');const edit=document.querySelector('#receiverForm');document.querySelector('#receiverName').value='EDIT DRAFT';document.querySelector('[data-h5-load]').click();assert.equal(document.querySelector('#receiverForm'),edit);assert.equal(document.querySelector('#receiverName').value,'EDIT DRAFT');
 run(`busyForm=(form,fn)=>addressSaving=fn();window.MospaceSupabase.saveAddress=async payload=>{savedMobileAddress=payload;state.addresses=state.addresses.map(a=>a.id===payload.id?{...a,...payload}:a)};window.MospaceSupabase.listAddresses=async()=>state.addresses`);
 edit.dispatchEvent(new document.defaultView.Event('submit',{bubbles:true,cancelable:true}));await run('addressSaving');assert.equal(run('savedMobileAddress.id'),'a18');assert.equal(run('savedMobileAddress.recipient_name'),'EDIT DRAFT');assert.equal(document.querySelectorAll('[data-address-row]').length,29);
 run(`state.auth.user={id:'other'};state.addresses=[];render();observerCallbacks[0]([{isIntersecting:true}])`);assert.equal(run('addressList.query'),'');assert.equal(document.querySelectorAll('[data-address-row]').length,0);assert.equal(document.querySelector('[data-h5-load]'),null);assert.doesNotMatch(document.querySelector('#combinedAddressList').textContent,/第.*页/);
});

function addressDeleteSetup(){
 const ctx=mobileSetup();ctx.run(`state.addresses=[{id:'a',label:'TEST',recipient_name:'TEST A',city:'Jakarta',address_line:'TEST ONLY',is_default:true},{id:'b',label:'TEST B',recipient_name:'TEST B'}];go('receivers');deleteCalls=[];confirmCalls=[];allowDelete=true;window.confirm=message=>{confirmCalls.push(message);return allowDelete};window.MospaceSupabase.getClient=()=>({from:table=>({delete:()=>{deleteCalls.push({table,filters:[]});return {eq(k,v){deleteCalls.at(-1).filters.push([k,v]);return this},select:()=>new Promise(r=>finishAddressDelete=r)}}})})`);return ctx;
}
test('H5 address deletion confirms, deletes only owned ID, preserves other drafts and submitted orders',async()=>{
 const {run,document}=addressDeleteSetup();const form=document.querySelector('#receiverForm');document.querySelector('#receiverName').value='UNSAVED';
 run('allowDelete=false');await document.querySelector('[data-delete-address="a"]').onclick();assert.equal(run('deleteCalls.length'),0);assert.equal(document.querySelectorAll('[data-address-row]').length,2);
 run('allowDelete=true');const pending=document.querySelector('[data-delete-address="a"]').onclick();assert.equal(document.querySelector('[data-delete-address="b"]').disabled,true);assert.equal(document.querySelector('#receiverName').disabled,true);
 await run(`mobileDeleteAddress('b')`);assert.equal(run('deleteCalls.length'),1);assert.equal(run(`JSON.stringify(deleteCalls[0])`),JSON.stringify({table:'merchant_addresses',filters:[['id','a'],['merchant_id','m']]}));
 run(`finishAddressDelete({data:[{id:'a'}],error:null})`);assert.equal(await pending,true);
 assert.equal(document.querySelector('[data-address-row="a"]'),null);assert.ok(document.querySelector('[data-address-row="b"]'));assert.equal(document.querySelector('#receiverForm'),form);assert.equal(document.querySelector('#receiverName').value,'UNSAVED');assert.equal(document.querySelector('#receiverName').disabled,false);assert.equal(run('o.destination_address'),'TEST address');
 run('setUiLanguage("en")');assert.equal(document.querySelector('[data-delete-address]').textContent,'Delete');run('setUiLanguage("id")');assert.equal(document.querySelector('[data-delete-address]').textContent,'Hapus');
});
test('H5 address deletion failure is retryable; deleting the edited last address clears the editor',async()=>{
 const {run,document}=addressDeleteSetup();run(`state.addresses=state.addresses.slice(0,1);workspace.editingAddress='a';render()`);
 let pending=document.querySelector('[data-delete-address="a"]').onclick();run(`finishAddressDelete({data:null,error:Error('offline')})`);assert.equal(await pending,false);assert.ok(document.querySelector('[data-address-row="a"]'));assert.equal(document.querySelector('[data-delete-address="a"]').disabled,false);assert.equal(run('workspace.editingAddress'),'a');
 pending=document.querySelector('[data-delete-address="a"]').onclick();run(`finishAddressDelete({data:[],error:null})`);assert.equal(await pending,false);assert.equal(run('state.addresses.length'),1);
 pending=document.querySelector('[data-delete-address="a"]').onclick();run(`finishAddressDelete({data:[{id:'a'}],error:null})`);assert.equal(await pending,true);assert.equal(run('workspace.editingAddress'),null);assert.equal(document.querySelectorAll('[data-address-row]').length,0);assert.equal(document.querySelector('#receiverName').value,'');assert.equal(document.querySelector('#cancelAddressEdit'),null);
});
test('H5 ignores late deletion results after account change, and saving prevents delete',async()=>{
 const {run,document}=addressDeleteSetup();document.querySelector('#receiverForm [type=submit]').disabled=true;assert.equal(await run(`mobileDeleteAddress('a')`),false);assert.equal(run('deleteCalls.length'),0);document.querySelector('#receiverForm [type=submit]').disabled=false;
 const pending=run(`mobileDeleteAddress('a')`);run(`state.auth.user={id:'other'};state.addresses=[{id:'a',label:'OTHER ACCOUNT'}];render();finishAddressDelete({data:[{id:'a'}],error:null})`);assert.equal(await pending,false);assert.equal(run('state.addresses[0].label'),'OTHER ACCOUNT');assert.ok(document.querySelector('[data-address-row="a"]'));
});

test('H5 old address deletion cannot mutate a new session for the same account',async()=>{
 const {run}=addressDeleteSetup();const pending=run(`mobileDeleteAddress('a')`);run(`authFlow.syncVersion++;finishAddressDelete({data:[{id:'a'}],error:null})`);assert.equal(await pending,false);assert.equal(run('state.addresses.length'),2);
});
