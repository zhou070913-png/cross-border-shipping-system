const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const setup=require('../dev/combined-ui-harness.cjs');
function flow(){const ctx=setup();for(const f of ['mobile-workspace.js','mobile-flows.js'])ctx.run(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));return ctx}
function packing(size=1){const ctx=flow();ctx.run(`workspace.parcels=Array.from({length:${size}},(_,i)=>({id:'p'+i,tracking_no:'TRACK-'+i,item_name:'ITEM '+i,status:'pre_advised'}));go('packing-request')`);ctx.document.querySelector('#crRoute option').selected=true;return ctx}
function selectAndAddress(ctx){const {run,document}=ctx;const check=document.querySelector('[name=combinedParcel]');check.setAttribute('checked','');check.checked=true;document.querySelector('#combinedRequest').onchange();document.querySelector('#h5StepNext').click();for(const [id,value]of Object.entries({crName:'TEST',crPhone:'000000',crCity:'Jakarta',crAddress:'TEST ONLY',crNote:'KEEP'}))document.querySelector('#'+id).value=value;document.querySelector('#combinedRequest').oninput();document.querySelector('#h5StepNext').click();assert.equal(run('mobileFlow.step'),3)}

for(const size of [1,12,50])test(`consolidation with ${size} parcels validates steps, keeps drafts on back and has fixed form actions`,()=>{
 const ctx=packing(size),{run,document}=ctx;assert.equal(document.querySelectorAll('[name=combinedParcel]').length,size);assert.equal(document.querySelector('#h5BottomNav'),null);assert.ok(document.querySelector('#combinedRequest>.h5-flow-bar'));
 document.querySelector('#h5StepNext').click();assert.equal(run('mobileFlow.step'),1);
 const check=document.querySelector('[name=combinedParcel]');check.setAttribute('checked','');check.checked=true;document.querySelector('#combinedRequest').onchange();document.querySelector('#h5StepNext').click();assert.equal(run('mobileFlow.step'),2);document.querySelector('#h5StepNext').click();assert.equal(run('mobileFlow.step'),2);
 document.querySelector('#crName').value='PRESERVE';document.querySelector('#combinedRequest').oninput();document.querySelector('#h5Back').click();assert.equal(run('mobileFlow.step'),1);document.querySelector('#h5StepNext').click();assert.equal(document.querySelector('#crName').value,'PRESERVE');
 run(`render()`);assert.equal(document.querySelector('#crName').value,'PRESERVE');assert.equal(document.querySelector('[name=combinedParcel]').hasAttribute('checked'),true);assert.equal(document.querySelector('[data-h5-step="1"]').hidden,true);
 for(const [id,value]of Object.entries({crPhone:'0000',crCity:'Jakarta',crAddress:'TEST ONLY'}))document.querySelector('#'+id).value=value;document.querySelector('#h5StepNext').click();assert.equal(run('mobileFlow.step'),3);assert.match(document.querySelector('#h5RequestSummary').textContent,/PRESERVE.*TEST ONLY/);assert.equal(document.querySelector('#h5StepSubmit').hidden,false);
 run(`setUiLanguage('id')`);assert.match(document.querySelector('.h5-stepper').textContent,/Pilih paket/);run(`setUiLanguage('en')`);assert.match(document.querySelector('#h5StepSubmit').textContent,/Submit order/);assert.equal(document.querySelector('#crName').value,'PRESERVE');
});

test('consolidation retries keep the same request ID after a committed save and failed refresh; success resets only then',async()=>{
 const ctx=packing(),{run,document}=ctx;selectAndAddress(ctx);
 run(`rpcCalls=[];rpcWorkspace=async(name,args)=>{rpcCalls.push({name,args});return {...o,id:'new',order_no:'20261030001'}};refreshDbState=async page=>{if(rpcCalls.length===1)return false;state.dbOrders.push({...o,id:'new',order_no:'20261030001'});state.page=page;render();return true}`);
 await document.querySelector('#combinedRequest').onsubmit({preventDefault(){}});assert.equal(run('workspace.selected.size'),1);assert.equal(run('mobileFlow.step'),3);assert.ok(run('combined.requestId'));
 await document.querySelector('#combinedRequest').onsubmit({preventDefault(){}});assert.equal(run('rpcCalls[0].args.p_request_id'),run('rpcCalls[1].args.p_request_id'));assert.equal(run('state.page'),'submission-success');assert.equal(run('combined.requestId'),null);assert.equal(run('workspace.selected.size'),0);assert.match(document.querySelector('.h5-success').textContent,/20261030001.*暂不付款/);
});

test('save buttons block duplicate submissions and a late consolidation result cannot enter another account',async()=>{
 const ctx=packing(),{run,document}=ctx;selectAndAddress(ctx);run(`calls=0;rpcWorkspace=()=>{calls++;return new Promise(r=>finishCreate=r)};refreshDbState=async()=>{throw Error('must not refresh another account')}`);
 const form=document.querySelector('#combinedRequest'),pending=form.onsubmit({preventDefault(){}});await form.onsubmit({preventDefault(){}});assert.equal(run('calls'),1);assert.equal(document.querySelector('#h5StepSubmit').disabled,true);
 run(`state.auth.user={id:'other'};state.addresses=[];render();finishCreate({...o,id:'old-result',order_no:'999'})`);await pending;assert.equal(run('mobileFlow.success'),null);assert.notEqual(run('state.activeOrderId'),'old-result');
});

test('pre-advice success gives next actions and failed refresh retries without duplicating the declaration',async()=>{
 const {run,document}=flow();run(`go('pre-advise');calls=0;rpcWorkspace=async()=>{calls++};refreshes=0;refreshDbState=async p=>{if(++refreshes===1)return false;state.page=p;render();return true}`);
 document.querySelector('#caTracking').value='TRACK-123';document.querySelector('#caItem').value='TEST';await document.querySelector('#combinedAdvice').onsubmit({preventDefault(){}});await document.querySelector('#combinedAdvice').onsubmit({preventDefault(){}});
 assert.equal(run('calls'),1);assert.match(document.querySelector('.h5-success').textContent,/TRACK-123/);assert.ok(document.querySelector('#h5CopyShenzhen'));assert.ok(document.querySelector('[data-page="pre-advise"]'));
});

test('payment belongs to its own page and retains the actual file-input DOM across refresh, languages and back navigation',()=>{
 const {run,document}=flow();run(`o.status='awaiting_payment';o.fees=[{confirmed_at:'now',total_amount:100,last_mile_fee:30,shipping_fee:52,handling_fee:18}];paymentWorkspace.account={is_active:true,mode:'test',account_number:'TEST ONLY',account_holder:'TEST',updated_at:'v1'};go('fee')`);
 assert.equal(document.querySelector('#paymentReceiptForm'),null);document.querySelector('[data-h5-payment]').click();const input=document.querySelector('#paymentFile'),form=document.querySelector('#paymentReceiptForm');Object.defineProperty(input,'files',{value:[{name:'proof.png'}]});document.querySelector('#paymentPayer').value='DRAFT';
 run(`render();setUiLanguage('en');go('fee');go('payment')`);assert.equal(document.querySelector('#paymentFile'),input);assert.equal(input.files[0].name,'proof.png');assert.equal(document.querySelector('#paymentPayer').value,'DRAFT');assert.ok(form.querySelector('.h5-flow-bar'));assert.equal(document.querySelector('#h5BottomNav'),null);
 run(`paymentWorkspace.receipts=[{id:'r',order_id:'o',status:'pending'}];render()`);assert.equal(document.querySelector('#paymentReceiptForm'),null);assert.equal(run('mobileFlow.paymentDraft'),null);assert.match(document.querySelector('#content').textContent,/review/i);
 run(`paymentWorkspace.receipts[0].status='rejected';paymentWorkspace.receipts[0].review_note='TEST';go('fee')`);assert.match(document.querySelector('[data-h5-payment]').textContent,/Resubmit receipt/);
});

test('tracking defaults to transport, removes fees from cards, sorts full timestamps newest first and updates the first viewport',async()=>{
 const {run,document}=flow();run(`o.status='shipped';o.shipment_carrier='TEST CARRIER';o.shipment_tracking_no='HEAD-TEST';o.tail_tracking_no='TAIL-TEST';state.dbOrders.push({...o,id:'not-shipped',status:'submitted'});window.MospaceSupabase.orderTracking=async()=>[{event_title:'EARLY',occurred_at:'2025-12-31T23:00:00Z'},{event_title:'LATEST',event_description:'TEST WAREHOUSE',occurred_at:'2026-01-01T02:00:00Z'}];go('dashboard');go('tracking-list')`);
 assert.equal(run('combined.filter'),'shipped');assert.equal(document.querySelectorAll('.h5-list-card').length,1);assert.equal(document.querySelector('.h5-list-fees'),null);
 await document.querySelector('[data-h5-order-action]').onclick();assert.match(document.querySelector('.h5-current-tracking').textContent,/LATEST.*TEST WAREHOUSE/);assert.equal(document.querySelector('.event h4').textContent,'LATEST');assert.equal(document.querySelectorAll('[data-h5-copy]').length,2);assert.equal(document.querySelector('details.h5-tracking-fees').hasAttribute('open'),false);
 assert.equal(typeof document.querySelector('[data-h5-copy]').onclick,'function');document.querySelector('#h5Back').click();assert.match(document.querySelector('.h5-tracking-preview').textContent,/LATEST/);
 run(`window.MospaceSupabase.orderTracking=async()=>{throw Error('offline')}`);await document.querySelector('[data-h5-order-action]').onclick();assert.ok(document.querySelector('#h5TrackingRetry'));assert.equal(typeof document.querySelector('#h5TrackingRetry').onclick,'function');
});

test('standalone address editor preserves a cancelled record, retries failures, and refuses late results in a new session',async()=>{
 const {run,document}=flow();run(`state.addresses=[{id:'a',recipient_name:'ORIGINAL',recipient_phone:'000',city:'Jakarta',address_line:'TEST ONLY'}];go('receivers')`);
 document.querySelector('[data-edit-address]').click();document.querySelector('#receiverName').value='CANCEL ME';document.querySelector('#h5CancelAddress').click();assert.equal(run('state.addresses[0].recipient_name'),'ORIGINAL');document.querySelector('[data-edit-address]').click();assert.equal(document.querySelector('#receiverName').value,'ORIGINAL');
 document.querySelector('#receiverName').value='RETRY';document.querySelector('#receiverForm').oninput();run(`window.MospaceSupabase.saveAddress=async()=>{throw Error('offline')}`);assert.equal(await document.querySelector('#receiverForm').onsubmit({preventDefault(){}}),false);assert.equal(document.querySelector('#receiverName').value,'RETRY');assert.equal(document.querySelector('#receiverForm [type=submit]').disabled,false);
 run(`window.MospaceSupabase.saveAddress=()=>new Promise(r=>finishSave=r);window.MospaceSupabase.listAddresses=async()=>{throw Error('late result must not list')}`);const pending=document.querySelector('#receiverForm').onsubmit({preventDefault(){}});assert.equal(await run('mobileSignOut()'),false);assert.equal(run(`go('dashboard')`),false);
 run(`authFlow.syncVersion++;finishSave({id:'a'})`);assert.equal(await pending,false);assert.equal(run('state.addresses[0].recipient_name'),'ORIGINAL');
});

test('a different account clears all task drafts and tracking caches',()=>{
 const {run}=flow();run(`go('dashboard');mobileFlow.addressDraft={values:{receiverName:'PRIVATE'}};mobileFlow.step=3;mobileFlow.success={kind:'order',id:'PRIVATE'};mobileFlow.trackingCache.set('PRIVATE',{events:[]});state.auth.user={id:'b'};state.dbOrders=[];state.page='dashboard';render()`);
 assert.equal(run('mobileFlow.step'),1);assert.equal(run('mobileFlow.addressDraft'),null);assert.equal(run('mobileFlow.success'),null);assert.equal(run('mobileFlow.trackingCache.size'),0);
});

test('home consolidation count, available filter and wizard use the same eligible states including early declarations',()=>{
 const {run,document}=flow();run(`workspace.parcels=[{id:'p1',tracking_no:'EARLY',status:'pre_advised'},{id:'p2',tracking_no:'ARRIVED',status:'received'},{id:'p3',tracking_no:'MEASURED',status:'measured'},{id:'bad',tracking_no:'EXCEPTION',status:'exception'}];go('dashboard')`);
 assert.match(document.querySelector('[data-mobile-filter="available"]').textContent,/3.*可申请合包/);document.querySelector('[data-mobile-filter="available"]').click();assert.equal(document.querySelectorAll('.h5-list-card').length,3);run(`go('packing-request')`);assert.equal(document.querySelectorAll('[name=combinedParcel]').length,3);assert.equal(document.querySelector('[name=combinedParcel][value="bad"]'),null);
});

test('whole cards open details by click or keyboard while selection controls do not navigate',()=>{
 const {run,document}=flow();run(`workspace.parcels=[{id:'p',tracking_no:'TRACK-123',item_name:'ITEM',status:'pre_advised'}];go('parcels')`);
 document.querySelector('.h5-list-card p').click();assert.equal(run('state.page'),'parcel-detail');assert.ok(document.querySelector('[data-h5-consolidate-one="p"]'));
 document.querySelector('[data-h5-consolidate-one]').click();assert.equal(run('state.page'),'packing-request');assert.equal(document.querySelector('[name=combinedParcel]').hasAttribute('checked'),true);
 run(`go('parcels');combined.filter='available';render()`);const input=document.querySelector('[data-h5-select-parcel]');input.checked=false;input.onchange();input.click();assert.equal(run('state.page'),'parcels');
 run(`combined.filter='all';go('orders')`);const card=document.querySelector('.h5-list-card');card.onkeydown({target:card,key:'Enter',preventDefault(){}});assert.equal(run('state.page'),'fee');assert.equal(document.querySelector('#h5BottomNav'),null);
});

test('parcel selection survives lazy loading and searches, and invalidated parcels cannot be submitted',()=>{
 const {run,document}=flow();run(`workspace.parcels=Array.from({length:27},(_,i)=>({id:'p'+i,tracking_no:'TRACK-'+i,item_name:'ITEM',status:'pre_advised'}));go('parcels');combined.filter='available';render()`);
 assert.equal(document.querySelector('#h5ConsolidateSelected').disabled,true);let input=document.querySelector('[data-h5-select-parcel="p0"]');input.checked=true;input.onchange();document.querySelector('[data-h5-load]').click();
 assert.equal(document.querySelectorAll('.h5-list-card').length,24);assert.equal(document.querySelector('[data-h5-select-parcel="p0"]').checked,true);
 run(`setUiLanguage('id');setUiLanguage('zh')`);assert.equal(document.querySelector('#parcelSearchText').placeholder,'快递单号 / 品名');assert.equal(document.querySelector('[data-h5-select-parcel="p0"]').checked,true);
 run(`workspace.parcelQuery='TRACK-26';render()`);input=document.querySelector('[data-h5-select-parcel="p26"]');input.checked=true;input.onchange();assert.equal(run('workspace.selected.size'),2);
 document.querySelector('#h5ConsolidateSelected').click();assert.equal(document.querySelectorAll('[name=combinedParcel][checked]').length,2);assert.equal(run('mobileFlow.step'),1);
 run(`go('parcels');workspace.parcels[0].status='exception';workspace.parcels[26].status='exception';render()`);assert.equal(run('workspace.selected.size'),0);assert.equal(document.querySelector('#h5ConsolidateSelected').disabled,true);
});

test('root tabs have no dead back button, detail pages have no global tabs, and login errors remain inline in three languages',async()=>{
 const {run,document}=flow();for(const page of ['dashboard','parcels','orders','profile','pre-advise']){run(`go('${page}')`);assert.equal(document.querySelector('#h5Back'),null);assert.ok(document.querySelector('#h5BottomNav'))}
 run(`state.auth.user=null;state.auth.role=null;render();window.MospaceSupabase.signInWithIdentifier=async()=>{throw Error('Invalid login credentials')}`);
 await run('submitLandingAuth()');assert.equal(document.querySelector('#loginIdentifier').getAttribute('aria-invalid'),'true');assert.match(document.querySelector('#h5LoginError').textContent,/会员号或邮箱/);
 document.querySelector('#loginIdentifier').value='M88000001';document.querySelector('#loginPassword').value='test-only-password';await run('submitLandingAuth()');assert.ok(document.querySelector('#h5LoginError'));assert.equal(run('state.auth.user'),null);assert.equal(run('authFlow.busy'),false);
 run(`setUiLanguage('en')`);assert.match(document.querySelector('#h5LoginError').textContent,/Sign-in failed/);run(`render();setUiLanguage('id')`);assert.match(document.querySelector('#h5LoginError').textContent,/Gagal masuk/);assert.ok(document.querySelector('.login-brand #languageControl'));
 document.querySelector('#h5LoginForm').oninput();assert.equal(document.querySelector('#h5LoginError'),null);assert.equal(document.querySelector('[aria-invalid]'),null);
});

test('parcel details omit absent measurements and tracking collapses older duplicate descriptions',()=>{
 const {run,document}=flow();run(`workspace.parcels=[{id:'p',tracking_no:'TRACK-123',item_name:'ITEM',status:'pre_advised'}];workspace.detailParcelId='p';go('parcel-detail')`);
 assert.equal(document.querySelectorAll('#content .metric').length,0);assert.doesNotMatch(document.querySelector('#content').textContent,/未填写|此处不展示|申请打包/);
 run(`o.status='delivered';state.events=Array.from({length:9},(_,i)=>({title:'EVENT '+i,desc:'EVENT '+i,occurredAt:'2026-10-'+String(29-i).padStart(2,'0')+'T12:00:00Z'}));state.page='tracking';render()`);
 assert.equal(document.querySelectorAll('.timeline>.event').length,3);assert.equal(document.querySelectorAll('.h5-older-events .event').length,6);assert.equal(document.querySelector('.h5-older-events').hasAttribute('open'),false);assert.doesNotMatch(document.querySelector('.event p').textContent,/EVENT/);
});
