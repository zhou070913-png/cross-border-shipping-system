const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map(),forms=[],timers=new Map(),listeners={},channels=[],removed=[];let timer=0;
 elements.set('content',{querySelectorAll:()=>forms});elements.set('crumb',{textContent:''});elements.set('workspaceGlobalRefresh',{});elements.set('workspaceSyncStatus',{textContent:'',remove(){elements.delete('workspaceSyncStatus')}});
 const client={channel(name){const c={name,events:[],on(type,filter,callback){this.events.push({type,filter,callback});return this},subscribe(callback){this.status=callback;return this}};channels.push(c);return c},removeChannel(c){removed.push(c);return Promise.resolve()}};
 const document={visibilityState:'visible',activeElement:null,getElementById:id=>elements.get(id)||null,querySelector:s=>s.startsWith('#')?elements.get(s.slice(1))||null:null,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn};
 const window={MospaceSupabase:{isConfigured:()=>true,getClient:()=>client},scrollY:120,scrollTo(){},addEventListener:(name,fn)=>listeners[name]=fn};
 const c=vm.createContext({console,window,document,navigator:{onLine:true},URL,Blob,Uint8Array,localStorage:{getItem:()=>null},setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{listeners['interval-'+ms]=fn}});
 const root=path.join(__dirname,'..'),run=s=>vm.runInContext(s,c),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));run('bind=()=>{};render=()=>{}');
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js','overseas-addresses.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`renderCount=0;render=()=>{renderCount++;rendered=merchantParcels()};refreshDbState=async()=>true;
 state.role='merchant';state.page='parcels';state.auth={user:{id:'m'},role:'merchant',profile:{warehouse_id:'w'}};workspace.owner='m';paymentWorkspace.owner='m';
 p={id:'p',parcel_no:'p',tracking_no:'TRACK-1',item_name:'Test',status:'shipped'};workspace.parcels=[p];
 h={id:'h',order_no:'HEAD',merchant_id:'m',warehouse_id:'w',transport_leg:'first_mile',status:'shipped',order_parcels:[{parcel_id:'p',parcels:p}],fees:[{fee_breakdown_version:3,total_amount:78}],payments:[{status:'paid'}]};state.dbOrders=[h];applyDbOrder(h);
 snapshot=()=>JSON.parse(JSON.stringify({orders:state.dbOrders,parcels:workspace.parcels,receipts:paymentWorkspace.receipts,notices:paymentWorkspace.notices,events:null,warehouseEvents:null}));`);
 run(fs.readFileSync(path.join(root,'progress-sync.js'),'utf8'));
 return {run,c,elements,forms,timers,listeners,channels,removed};
}
test('parcel status follows overseas arrival and every tail settlement/delivery stage instead of stale shipped flag',()=>{
 const {run}=setup();assert.equal(run('parcelLabel(allParcels()[0])'),'头程运输中');
 run(`h.overseas_received_at='2026-10-22'`);assert.equal(run('parcelLabel(allParcels()[0])'),'已到印尼仓');
 run(`t={id:'t',order_no:'TAIL',parent_order_id:'h',transport_leg:'last_mile',status:'warehouse_received'};state.dbOrders.push(t)`);
 for(const [state,label,group] of [['warehouse_received','待尾程报价','tail-pending'],['awaiting_payment','尾程待付款','tail-pending'],['paid','尾程待出库','tail-pending'],['ready_to_ship','尾程待出库','tail-pending'],['shipped','尾程派送中','tail-shipped'],['delivered','已签收','delivered']]){
  run(`t.status='${state}'`);assert.equal(run('parcelLabel(allParcels()[0])'),label);assert.equal(run('parcelGroup(allParcels()[0])'),group);
 }
 run(`t.status='awaiting_payment';paymentWorkspace.receipts=[{id:'r',order_id:'t',status:'pending'}]`);assert.equal(run('parcelLabel(allParcels()[0])'),'尾程付款审核中');
 run(`t.status='cancelled'`);assert.equal(run('parcelLabel(allParcels()[0])'),'已到印尼仓');
 run(`p.status='exception'`);assert.equal(run('parcelLabel(allParcels()[0])'),'异常');
});
test('parcel rows, counts, filters and tail order links use the same progression',()=>{
 const {run}=setup();run(`h.overseas_received_at='2026-10-22';workspace.parcels.push({...p,id:'other',tracking_no:'TRACK-2'});`);
 let html=run('merchantParcels()');assert.match(html,/已到印尼仓<small>1<\/small>/);assert.match(html,/头程运输中<small>1<\/small>/);
 run(`workspace.parcelTab='overseas'`);html=run('merchantParcels()');assert.match(html,/TRACK-1/);assert.doesNotMatch(html,/TRACK-2/);
 run(`state.dbOrders.push({id:'t',order_no:'TAIL-ORDER',transport_leg:'last_mile',parent_order_id:'h',status:'shipped'});workspace.parcelTab='tail-shipped'`);html=run('merchantParcels()');assert.match(html,/TAIL-ORDER/);assert.match(html,/尾程派送中/);assert.match(html,/data-order-target="t"/);assert.match(html,/共 1 个包裹/);
});

test('head summaries and filters follow only their linked tail through settlement and delivery',()=>{
 const {run}=setup();run(`h.overseas_received_at='2026-10-22';t={id:'t',order_no:'TAIL',parent_order_id:'h',transport_leg:'last_mile',status:'warehouse_received'};state.dbOrders.push(t,{...t,id:'other',order_no:'UNRELATED',parent_order_id:'another',status:'delivered'});`);
 for(const [stage,label] of [['warehouse_received','待尾程报价'],['awaiting_payment','尾程待付款'],['paid','尾程待出库'],['ready_to_ship','尾程待出库'],['shipped','尾程派送中'],['delivered','已签收'],['cancelled','尾程已取消']]){
  run(`t.status='${stage}'`);const html=run('workspaceOrderTable([h])');assert.ok(html.includes(label),stage);assert.match(html,/头程已到印尼仓/);
  assert.equal(run(`orderMatchesProgress(h,'${stage}')`),true);assert.equal(run('h.status'),'shipped');assert.equal(run('feeRecord(h).total_amount'),78);
 }
 run(`t.status='awaiting_payment';paymentWorkspace.receipts=[{order_id:'t',status:'pending'}]`);assert.equal(run('orderProgress(h).label'),'尾程付款审核中');
 run(`state.dbOrders=[h]`);assert.equal(run('orderProgress(h).label'),'头程已到印尼仓');assert.equal(run("orderMatchesProgress(h,'overseas')"),true);assert.equal(run("orderMatchesProgress(h,'shipped')"),false);
});

test('background tail delivery refresh updates head list, detail and tracking without changing head fees or operational state',async()=>{
 const {run}=setup();run(`h.overseas_received_at='2026-10-22';t={id:'t',order_no:'TAIL',parent_order_id:'h',transport_leg:'last_mile',status:'shipped',fees:[{fee_breakdown_version:4,total_amount:30}]};state.dbOrders.push(t);state.page='dashboard';render=()=>{renderCount++;rendered=merchantDashboard()};readProgressSnapshot=async()=>{const next=snapshot();next.orders.find(o=>o.id==='t').status='delivered';return next};`);
 assert.match(run('workspaceOrderTable([h])'),/尾程派送中/);assert.equal(await run('runProgressSync()'),true);
 assert.match(run('rendered'),/class="status green">已签收<\/span>/);assert.match(run('rendered'),/本批订单已完成/);assert.equal(run('orderProgress(state.dbOrders[0]).label'),run("orderProgress(state.dbOrders.find(o=>o.id==='t')).label"));assert.doesNotMatch(run('rendered'),/>整票已签收<|>尾程已签收</);assert.match(run('rendered'),/头程已到印尼仓 · 尾程已签收/);
 run(`workspace.orderTab='delivered'`);assert.match(run('merchantOrders()'),/HEAD/);run(`workspace.orderTab='shipped'`);assert.doesNotMatch(run('merchantOrders()'),/<td class="mono">HEAD/);
 run(`state.page='fee'`);assert.match(run('merchantPageFrame(merchantFee())'),/class="status green">已签收<\/span>/);
 run(`state.page='tracking'`);assert.match(run('merchantTracking()'),/class="status green">已签收<\/span>/);
 assert.match(run('warehouseOrderRows(state.dbOrders)'),/class="status green">已签收<\/span>/);assert.equal(run('state.order.record.status'),'shipped');assert.equal(run('feeRecord(state.order.record).total_amount'),78);
});
test('subscription invalidations are debounced and data is reread with merchant filters',async()=>{
 const {run,channels,timers}=setup();run('ensureProgressChannel()');const channel=channels[0];assert.deepEqual(channel.events.map(e=>e.filter.table),['orders','parcels','tracking_events','payment_notifications']);assert.equal(channel.events[0].filter.filter,'merchant_id=eq.m');
 for(let i=0;i<8;i++)channel.events[0].callback({new:{status:'fake-delivered'}});assert.equal(timers.size,1);assert.equal(run('parcelLabel(allParcels()[0])'),'头程运输中');
 run(`reads=0;readProgressSnapshot=async()=>{reads++;let s=snapshot();s.orders[0].overseas_received_at='2026-10-22';return s}`);
 assert.equal(await run('runProgressSync()'),true);assert.equal(run('reads'),1);assert.equal(run('parcelLabel(allParcels()[0])'),'已到印尼仓');assert.match(run('rendered'),/已到印尼仓/);
});
test('automatic refresh does not overwrite forms, unsubmitted search, focused fields or warehouse writes',async()=>{
 const {run,forms,c}=setup();run('reads=0;readProgressSnapshot=async()=>{reads++;return snapshot()}');
 forms.push({id:'lastMileRequestForm'});assert.equal(await run('runProgressSync()'),false);forms.length=0;
 forms.push({id:'parcelSearch',querySelectorAll:()=>[{value:'not submitted',defaultValue:''}]});assert.equal(await run('runProgressSync()'),false);forms.length=0;
 c.document.activeElement={matches:()=>true};assert.equal(await run('runProgressSync()'),false);c.document.activeElement=null;
 run('warehouseWorkspace.busy=true');assert.equal(await run('runProgressSync()'),false);run('warehouseWorkspace.busy=false');assert.equal(run('reads'),0);
});
test('out of order reads after account changes, navigation, manual refresh or a new draft are discarded',async()=>{
 for(const change of ["state.auth.user={id:'another'}","state.page='orders'","progressSync.revision++","document.activeElement={matches:()=>true}"]){
  const {run}=setup();run(`readProgressSnapshot=()=>new Promise(resolve=>finish=resolve)`);const pending=run('runProgressSync()');run(`next=snapshot();next.orders[0].overseas_received_at='2026-10-22';${change};finish(next)`);assert.equal(await pending,false);assert.equal(run('h.overseas_received_at'),undefined);assert.equal(run('renderCount'),0);
 }
});
test('one background read at a time; failures retain current data and subsequent reads recover',async()=>{
 const {run}=setup();run(`readProgressSnapshot=()=>new Promise(resolve=>finish=resolve)`);const pending=run('runProgressSync()');assert.equal(await run('runProgressSync()'),false);run('finish(snapshot())');assert.equal(await pending,true);
 run(`readProgressSnapshot=async()=>{throw Error('network')}`);assert.equal(await run('runProgressSync()'),false);assert.equal(run('state.dbOrders[0].id'),'h');assert.equal(run('progressSync.error'),true);
 run('readProgressSnapshot=async()=>snapshot()');assert.equal(await run('runProgressSync()'),true);assert.equal(run('progressSync.error'),false);
});
test('logout, hidden tabs and offline state close old subscriptions; stale callbacks cannot schedule another user refresh',()=>{
 const {run,channels,removed,c,timers}=setup();run('ensureProgressChannel()');const old=channels[0];c.document.visibilityState='hidden';run('ensureProgressChannel()');assert.equal(removed.length,1);old.events[0].callback();assert.equal(timers.size,0);
 c.document.visibilityState='visible';run(`state.auth.user={id:'new'};ensureProgressChannel()`);assert.equal(channels.length,2);assert.equal(channels[1].events[0].filter.filter,'merchant_id=eq.new');old.status('SUBSCRIBED');assert.equal(run('progressSync.connected'),false);
 c.navigator.onLine=false;run('ensureProgressChannel()');assert.equal(removed.length,2);assert.match(run('progressLabel()'),/网络已断开/);
});
test('visible return and reconnect schedule a read; warehouse subscriptions use warehouse membership',()=>{
 const {run,c,listeners,channels,timers}=setup();run(`state.role='warehouse';ensureProgressChannel()`);assert.equal(channels[0].events[0].filter.filter,'warehouse_id=eq.w');
 c.document.visibilityState='hidden';listeners.visibilitychange();c.document.visibilityState='visible';listeners.visibilitychange();assert.ok(timers.size>0);assert.equal(channels.length,2);
});

test('realtime setup failures keep polling usable and unchanged tracking does not rerender',async()=>{
 const {run}=setup();run(`window.MospaceSupabase.getClient=()=>({channel(){throw Error('socket unavailable')}});ensureProgressChannel()`);
 assert.equal(run('progressSync.channel'),null);assert.match(run('progressLabel()'),/每10秒/);
 run(`state.page='tracking';rawEvents=[{event_title:'头程发货',event_description:'仓库登记',occurred_at:'2026-10-22T08:00:00Z'}];applyTracking(rawEvents);readProgressSnapshot=async()=>({...snapshot(),events:rawEvents})`);
 assert.equal(await run('runProgressSync()'),true);assert.equal(run('renderCount'),0);
 run(`rawEvents.push({event_title:'已到印尼仓',occurred_at:'2026-10-22T09:00:00Z'})`);
 assert.equal(await run('runProgressSync()'),true);assert.equal(run('renderCount'),1);
});
