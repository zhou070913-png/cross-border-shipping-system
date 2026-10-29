const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');

test('workspace load keeps independent request groups within two network waves and reads shared collections once',async()=>{
 const result=await require('../dev/workspace-performance.cjs')();
 assert.ok(result.networkWaves<=2,JSON.stringify(result));
 for(const table of ['support_tickets','route_pricing','parcels'])assert.equal(result.reads[table],1);
 assert.equal(result.statusUpdateTextVisits,1);
});

test('simultaneous identical reads share a request but failures, later reads and account changes never reuse stale results',async()=>{
 const {run}=setup();run(`calls=0;releases=[];window.MospaceSupabase.getClient=()=>({from(){const q={select(){return q},order(){return q},range(){calls++;return new Promise((resolve,reject)=>releases.push({resolve,reject}))}};return q}})`);
 const a=run(`queryData('parcels')`),b=run(`queryData('parcels')`);assert.equal(run('calls'),1);
 run(`state.auth.user={id:'other'};third=queryData('parcels')`);assert.equal(run('calls'),2);
 run(`releases[0].resolve({data:[{id:'FIRST'}]});releases[1].resolve({data:[{id:'SECOND'}]})`);
 assert.equal((await a)[0].id,'FIRST');assert.equal((await b)[0].id,'FIRST');assert.equal((await run('third'))[0].id,'SECOND');
 const failed=run(`queryData('parcels')`);assert.equal(run('calls'),3);run(`releases[2].reject(Error('offline'))`);await assert.rejects(failed,/offline/);
 const retry=run(`queryData('parcels')`);assert.equal(run('calls'),4);run(`releases[3].resolve({data:[]})`);await retry;
});

test('order detail opens before tracking arrives, and timeline refresh retains the exact payment form and draft',async()=>{
 const {run,document}=setup();run(`state.page='orders';o.status='awaiting_payment';o.fees=[{confirmed_at:'now',total_amount:108,shipping_fee:60,last_mile_fee:30,handling_fee:18}];window.MospaceSupabase.orderTracking=()=>new Promise(r=>releaseTracking=r);render()`);
 const opened=run(`combinedOpen('o')`);assert.equal(run('state.page'),'fee');assert.match(document.querySelector('.timeline').textContent,/加载中/);
 const form=document.createElement('form'),input=document.createElement('input');form.id='testPaymentDraft';input.value='KEEP UNSAVED';form.append(input);document.querySelector('#content').append(form);
 run(`releaseTracking([{event_title:'运输测试',event_description:'USER CONTENT',occurred_at:'2026-10-29T00:00:00Z'}])`);await opened;
 assert.equal(document.querySelector('#testPaymentDraft'),form);assert.equal(form.querySelector('input'),input);assert.equal(input.value,'KEEP UNSAVED');assert.match(document.querySelector('.timeline').textContent,/运输测试/);assert.doesNotMatch(document.querySelector('.timeline').textContent,/加载中/);
});

test('late tracking cannot navigate back, replace another order or leak across account changes',async()=>{
 for(const change of [`go('orders',{role:'merchant'})`,`state.auth.user={id:'other'}`]){
  const {run}=setup();run(`window.MospaceSupabase.orderTracking=()=>new Promise(r=>releaseTracking=r)`);const pending=run(`combinedOpen('o')`);run(change+`;releaseTracking([{event_title:'OLD',occurred_at:'2026-10-29'}])`);assert.equal(await pending,false);assert.equal(run('state.events.length'),0);if(change.startsWith('go'))assert.equal(run('state.page'),'orders');
 }
 const {run}=setup();run(`state.dbOrders.push({...o,id:'second',order_no:'SECOND'});releases={};window.MospaceSupabase.orderTracking=id=>new Promise(r=>releases[id]=r)`);
 const first=run(`combinedOpen('o')`),second=run(`combinedOpen('second')`);run(`releases.second([{event_title:'NEW',occurred_at:'2026-10-29'}])`);await second;run(`releases.o([{event_title:'OLD',occurred_at:'2026-10-29'}])`);await first;assert.equal(run('state.activeOrderId'),'second');assert.equal(run('state.events[0].title'),'NEW');
});

test('failed tracking shows a local error and leaves order actions usable',async()=>{
 const {run,document}=setup();run(`window.MospaceSupabase.orderTracking=async()=>{throw Error('offline')}`);await run(`combinedOpen('o')`);
 assert.equal(run('state.page'),'fee');assert.match(document.querySelector('.timeline').textContent,/读取失败/);assert.equal(run('combined.busy'),false);run(`go('orders',{role:'merchant'})`);assert.equal(run('state.page'),'orders');
});

test('language mutation work is scoped, coalesces nested roots and updates attributes without changing input data',()=>{
 const {run,document}=setup();run(`setUiLanguage('en');visited=[];const originalLocale=localizeKnownDom;localizeKnownDom=root=>{visited.push(root.id);return originalLocale(root)}`);
 const root=document.createElement('div');root.id='changedOnly';root.innerHTML='<label id="smallLabel">登录成功</label><input id="smallInput" value="UNCHANGED">';document.body.append(root);
 run(`localizeMutationRecords([{type:'childList',addedNodes:[document.querySelector('#smallLabel'),document.querySelector('#changedOnly')]}])`);
 assert.deepEqual(Array.from(run('visited')),['changedOnly']);assert.match(root.textContent,/Signed in/);
 const input=root.querySelector('input');input.value='CUSTOMER DRAFT';input.setAttribute('placeholder','至少 6 位');
 run(`localizeMutationRecords([{type:'attributes',target:document.querySelector('#smallInput')}])`);assert.equal(input.getAttribute('placeholder'),'At least 6 characters');assert.equal(input.value,'CUSTOMER DRAFT');
 run(`visited=[];localizeMutationRecords([{type:'childList',addedNodes:[document.querySelector('#smallLabel [data-i18n]')]}])`);assert.equal(run('visited.length'),0);
});

test('login reads orders and workspace in parallel, passes the verified user to profile lookup and skips dashboard tracking',async()=>{
 const {run}=setup();run(`
  state.auth.user=null;state.auth.role=null;state.auth.pending=null;state.page='dashboard';started=[];trackingReads=0;
  window.MospaceSupabase={isConfigured:()=>true,currentUser:async()=>({id:'m'}),currentProfile:async user=>{profileUser=user.id;return {id:'m',role:'merchant'}},myOrders:()=>{started.push('orders');return new Promise(r=>releaseOrders=r)},listAddresses:async()=>{started.push('addresses');return []},orderTracking:async()=>{trackingReads++;return []}};
  loadMerchantWorkspace=()=>{started.push('workspace');return new Promise(r=>releaseWorkspace=r)};
 `);const pending=run(`syncAuth({renderView:false})`);await new Promise(setImmediate);
 assert.deepEqual(Array.from(run('started')).sort(),['addresses','orders','workspace']);assert.equal(run('profileUser'),'m');run(`releaseOrders([o]);releaseWorkspace()`);assert.equal(await pending,true);assert.equal(run('trackingReads'),0);
});

test('an empty order read clears the selected order even when workspace finishes first',async()=>{
 for(const action of ['syncAuth({renderView:false})','refreshDbState()']){
  const {run}=setup();run(`
   state.page='dashboard';state.events=[{title:'OLD'}];render=()=>{};
   window.MospaceSupabase={isConfigured:()=>true,currentUser:async()=>({id:'m'}),currentProfile:async()=>({id:'m',role:'merchant'}),myOrders:()=>new Promise(r=>releaseOrders=r),listAddresses:async()=>[]};
   loadMerchantWorkspace=async()=>{workspace.parcels=[{id:'unassigned',order_id:null}];applyDbOrder(o)};
  `);
  const pending=run(action);await new Promise(setImmediate);run('releaseOrders([])');assert.equal(await pending,true);
  assert.equal(run('state.activeOrderId'),null);assert.equal(run('state.order.record'),null);assert.equal(run('state.events.length'),0);assert.equal(run('state.dbOrders.length'),0);assert.equal(run('workspace.parcels.length'),1);
 }
});
