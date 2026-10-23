const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map([['#crumb',{textContent:''}]]),groups=new Map();
 const c=vm.createContext({console,setTimeout,clearTimeout,URL,Blob,Uint8Array,crypto:require('node:crypto').webcrypto,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:s=>groups.get(s)||[],getElementById:id=>id==='workspaceGlobalRefresh'?{}:null},localStorage:{getItem:()=>null},confirm:()=>true});
 const root=path.join(__dirname,'..'),run=s=>vm.runInContext(s,c),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));run('bind=()=>{};render=()=>{}');
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js','overseas-addresses.js','calculator-workspace.js','last-mile-pricing.js','overall-orders.js','forwarding-workspace.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`state.role='merchant';state.auth={user:{id:'m'},role:'merchant'};workspace.owner='m';warehouseWorkspace.owner='m';paymentWorkspace.owner='m';
 h={id:'h',order_no:'MO-QA',status:'shipped',transport_leg:'first_mile',forwarding_enabled:true,overseas_received_at:'2026-10-23',overseas_receiving_completed_at:null,destination_overseas_warehouse_id:'wh',destination_warehouse_snapshot:{name:'印尼测试仓'},fees:[{total_amount:78,confirmed_at:'2026-10-23',fee_breakdown_version:3}],payments:[{amount:78,status:'paid'}]};
 t={id:'t',order_no:'LM-QA-1',parent_order_id:'h',fulfillment_mode:'whole_package',transport_leg:'last_mile',status:'delivered',destination_city:'Jakarta',recipient_name:'Alice',fees:[{total_amount:30,confirmed_at:'2026-10-23'}],payments:[{status:'paid',amount:30}]};
 t2={...t,id:'t2',order_no:'LM-QA-2',status:'awaiting_payment',destination_city:'Bali',recipient_name:'Bob',fees:[{total_amount:312.5,confirmed_at:'2026-10-23'}],payments:[]};
 z={id:'z',warehouse_id:'wh',name:'雅加达',is_active:true,updated_at:'v1',reference_distance_km:30,included_distance_km:10,base_fee:20,price_per_km:.5};workspace.lastMileZones=[z];workspace.overseasWarehouses=[{id:'wh',name:'测试雅加达仓',is_active:true}];
 forwarding.owner=forwardingOwner();forwarding.ready=true;forwarding.packages=[{id:'p1',package_no:'BOX-1',source_order_id:'h',overseas_warehouse_id:'wh',status:'delivered',assigned_order_id:'t'},{id:'p2',package_no:'BOX-2',source_order_id:'h',overseas_warehouse_id:'wh',status:'reserved',assigned_order_id:'t2'},{id:'p3',package_no:'BOX-3',source_order_id:'h',overseas_warehouse_id:'wh',status:'available'}];forwarding.items=[{order_id:'t',package_id:'p1'},{order_id:'t2',package_id:'p2'}];
 state.dbOrders=[t,t2,h];applyDbOrder(h);toast=()=>{};`);
 return {run,elements,groups,c};
}
test('one overall order retains every tail, independent price, destination and real external box',()=>{
 const {run}=setup();const html=run('overallOrderDetail()');
 for(const s of ['MO-QA','LM-QA-1','LM-QA-2','¥78.00','¥30.00','¥312.50','BOX-1','BOX-2','BOX-3'])assert.ok(html.includes(s),s);
 assert.match(run('overallDestination(h)'),/Jakarta.*Alice.*Bali.*Bob/);
 assert.equal((run('merchantOrders()').match(/data-overall-row=/g)||[]).length,1);
 assert.match(html,/data-forward-head="h"/);assert.match(run('settlementContext(h)'),/2 笔尾程记录/);
});
test('an early delivered tail cannot finish a batch with stock, pending tail or uncompleted arrivals',()=>{
 const {run}=setup();assert.notEqual(run('orderProgress(h).group'),'delivered');
 run(`t2.status='delivered';forwarding.packages.forEach(p=>p.status='delivered')`);assert.notEqual(run('orderProgress(h).group'),'delivered');
 run(`h.overseas_receiving_completed_at='2026-10-23'`);assert.equal(run('orderProgress(h).group'),'delivered');
 run(`forwarding.packages[2].status='available'`);assert.equal(run('orderProgress(h).group'),'overseas');
 run(`forwarding.ready=false`);assert.match(run('orderProgress(h).label'),/待同步/);
});
test('stock filters and request selection operate on overseas boxes, not domestic original parcels',()=>{
 const {run}=setup();assert.equal(run('forwardingAvailable(h).length'),1);run(`forwarding.tab='available'`);
 const html=run('forwardingStock()');assert.match(html,/BOX-3/);assert.doesNotMatch(html,/BOX-1|BOX-2/);
 run(`go=(p)=>state.page=p;beginForwarding('h')`);assert.equal(run('state.page'),'forwarding-request');assert.match(run('forwarding.requestId'),/^[0-9a-f-]{36}$/);
 assert.match(run('forwardingRequest()'),/data-forward-package="p1"[^>]*disabled/);assert.doesNotMatch(run('forwardingRequest()'),/data-forward-package="p3"[^>]*disabled/);
 assert.match(run('forwardingRequest()'),/消费者详细地址/);
});
test('whole-package paid tails go directly to dispatch, and cancellation disappears on receipt review or paid state',()=>{
 const {run}=setup();assert.equal(run('forwardingCancelable(t2)'),true);
 run(`paymentWorkspace.receipts=[{order_id:'t2',status:'pending'}]`);assert.equal(run('forwardingCancelable(t2)'),false);
 run(`paymentWorkspace.receipts=[];t2.status='paid';state.role='warehouse';warehouseWorkspace.selectedId='t2';applyDbOrder(t2)`);
 assert.equal(run('warehouseStage(t2)'),'ship');assert.match(run('warehouseShip()'),/forwardingDispatchForm/);assert.doesNotMatch(run('warehousePacking()'),/id="packBtn"/);
 run(`t2.status='shipped';t2.shipment_carrier='J&T';t2.shipment_tracking_no='JT123'`);
 assert.doesNotMatch(run('warehouseShip()'),/forwardingDispatchForm/);assert.match(run('warehouseShip()'),/JT123/);assert.match(run('warehouseShip()'),/lastMileDeliveredForm/);
});
test('stock and receiving remain unavailable when the migration is missing, and warehouse assignments filter arrivals',()=>{
 const {run}=setup();run(`forwarding.ready=false`);assert.match(run('forwardingStock()'),/海外仓数据暂不可用/);assert.doesNotMatch(run('forwardingStock()'),/data-forward-head/);
 run(`forwarding.ready=true;state.role='warehouse';forwarding.staff=[]`);assert.doesNotMatch(run('overseasReceive()'),/<option value="h"/);
 run(`forwarding.staff=[{user_id:'m',warehouse_id:'wh'}]`);assert.match(run('overseasReceive()'),/<option value="h"/);
});
test('request sends selected box IDs and idempotency key; duplicate submit is blocked until refreshed',async()=>{
 const {run,elements}=setup();const form={dataset:{headId:'h'},querySelectorAll:()=>[]};elements.set('#forwardingRequestForm',form);elements.set('#forwardingZone',{value:'z'});
 run(`forwarding.headId='h';forwarding.selected.add('p3');forwarding.requestId='request-1';readLastMileRecipient=()=>({country:'印度尼西亚'});rpcWorkspace=async(name,args)=>{sent={name,args};return {id:'new-tail'}};refreshDbState=async()=>true;bind()`);
 await form.onsubmit({preventDefault(){}});
 await new Promise(r=>setImmediate(r));assert.equal(run('sent.name'),'merchant_create_forwarding');assert.equal(run('sent.args.p_request_id'),'request-1');assert.deepEqual(Array.from(run('sent.args.p_package_ids')),['p3']);assert.equal(run('state.activeOrderId'),'new-tail');assert.equal(run('state.page'),'fee');assert.equal(run('forwarding.busy'),false);
});
test('failed refresh never reports success and account changes discard an in-flight request response',async()=>{
 const {run}=setup();run(`messages=[];toast=m=>messages.push(m);refreshDbState=async()=>false`);
 await run(`forwardingTask({querySelectorAll:()=>[]},async()=>{})`);assert.match(run('messages.join()'),/刷新失败/);assert.doesNotMatch(run('messages.join()'),/操作已保存/);
 run(`refreshDbState=async()=>{throw Error('should not read new account')};messages=[];pending=forwardingTask({querySelectorAll:()=>[]},()=>new Promise(resolve=>release=resolve));state.auth.user={id:'other'};release()`);await run('pending');assert.equal(run('messages.length'),0);
});

test('tracking preserves the carrier number, escapes input and distinguishes registered events from carrier tracking',()=>{
 const {run}=setup();run(`t.shipment_carrier='J&T';t.shipment_tracking_no='JT<123>';applyDbOrder(t)`);
 assert.match(run('merchantTracking()'),/data-forward-copy="JT&lt;123&gt;"/);
 assert.match(run('overallOrderDetail()'),/尚未接入快递实时轨迹/);
 assert.doesNotMatch(run('forwardingTrackingControls(h)'),/复制快递单号/);
});

test('whole-package payment messages and warehouse notices lead to dispatch instead of repacking',()=>{
 const {run}=setup();run(`t2.status='awaiting_payment';paymentWorkspace.account={is_active:true,mode:'test'};applyDbOrder(t2)`);
 assert.match(run('merchantPaymentSection(t2)'),/进入待出库/);assert.doesNotMatch(run('merchantPaymentSection(t2)'),/进入待打包/);
 run(`state.role='warehouse';paymentWorkspace.notices=[{order_id:'t2',title:'付款审核通知',message:'已审核'}]`);
 assert.match(run('warehouseDashboard()'),/付款审核通知/);
});
