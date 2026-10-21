const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const root=path.join(__dirname,'..');
  const context=vm.createContext({console,setTimeout,clearTimeout,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:()=>({textContent:''}),querySelectorAll:()=>[]},localStorage:{getItem:()=>null},URL,Blob});
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const inline=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state ='));
  vm.runInContext(inline,context);
  for(const f of ['merchant-workspace.js','warehouse-workspace.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context);
  vm.runInContext(`render=()=>{};toast=message=>testMessages.push(message);state.role='warehouse';state.auth={user:{id:'qa'},role:'warehouse_operator'};state.dbOrders=[];`,Object.assign(context,{testMessages:[]}));
  return {context,run:s=>vm.runInContext(s,context)};
}
test('all warehouse orders and stage counts are independent of the selected order',()=>{
  const {run}=setup();
  run(`state.dbOrders=['submitted','submitted','warehouse_received','awaiting_payment','paid','paid','ready_to_ship','shipped'].map((status,i)=>({id:'id-'+i,order_no:'ORDER-'+i,status,parcel_count:1,order_parcels:[]}));applyDbOrder(state.dbOrders[7]);`);
  const html=run('warehouseDashboard()');
  for(let i=0;i<8;i++)assert.ok(html.includes('ORDER-'+i));
  assert.ok(run("warehouseQueue('packing')").includes('（2 单）'));
  assert.ok(run("warehouseQueue('confirm')").includes('（1 单）'));
});
test('completed measurements do not imply confirmed fees for a received order',()=>{
  const {run}=setup();
  run(`const o={id:'a',order_no:'A',status:'warehouse_received',parcel_count:1,order_parcels:[{parcel_id:'p',parcels:{id:'p',parcel_no:'P',actual_weight_kg:2,length_cm:20,width_cm:10,height_cm:10}}]};state.dbOrders=[o];applyDbOrder(o);warehouseWorkspace.selectedId='a';`);
  assert.ok(run('warehouseConfirm()').includes('id="confirmBtn"'));
});
test('confirmation saves the selected ID, exits the queue, and removes repeat confirmation',async()=>{
  const {context,run}=setup();
  run(`state.dbOrders=[{id:'old',order_no:'OLD',status:'submitted',order_parcels:[]},{id:'chosen',order_no:'CHOSEN',status:'warehouse_received',order_parcels:[]}];applyDbOrder(state.dbOrders[1]);warehouseWorkspace.selectedId='chosen';refreshDbState=async()=>{applyDbOrder(state.dbOrders.find(o=>o.id===state.activeOrderId));return true};`);
  context.saved=[];
  await run(`warehouseSave({disabled:false,textContent:''},async id=>{saved.push(id);state.dbOrders.find(o=>o.id===id).status='awaiting_payment'},'confirm',['awaiting_payment'],'完成')`);
  assert.deepEqual(context.saved,['chosen']);
  assert.equal(run('state.order.dbId'),'chosen');
  assert.ok(!run('warehouseConfirm()').includes('id="confirmBtn"'));
  assert.ok(run("warehouseQueue('confirm')").includes('（0 单）'));
  assert.equal(run('state.dbOrders[0].status'),'submitted');
});
test('save failure and stale refresh never report success',async()=>{
  for(const failure of ['rpc','refresh']){
    const {context,run}=setup();
    run(`state.dbOrders=[{id:'a',order_no:'A',status:'warehouse_received',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';refreshDbState=async()=>false;`);
    await run(`warehouseSave({disabled:false,textContent:''},async()=>{${failure==='rpc'?"throw Error('接口失败')":''}},'confirm',['awaiting_payment'],'成功')`);
    assert.ok(!context.testMessages.includes('成功'));
    assert.equal(run('warehouseWorkspace.busy'),false);
  }
});
test('duplicate submission and navigation are blocked during an in-flight save',async()=>{
  const {context,run}=setup();context.calls=0;
  run(`state.dbOrders=[{id:'a',order_no:'A',status:'paid',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';refreshDbState=async()=>true;`);
  const first=run(`warehouseSave({disabled:false,textContent:''},()=>{calls++;return new Promise(r=>{releaseSave=r})},'packing',['paid'],'完成')`);
  assert.equal(run("go('ship',{role:'warehouse'})"),false);
  await run(`warehouseSave({},async()=>{calls++},'packing',['paid'],'重复')`);
  assert.equal(context.calls,1);
  run('releaseSave()');await first;
});
test('historical multiple-order parcel associations cannot be processed twice',async()=>{
  const {context,run}=setup();context.calls=0;
  run(`state.dbOrders=['a','b'].map(id=>({id,order_no:id,status:'submitted',order_parcels:[{parcel_id:'shared',parcels:{id:'shared'}}]}));applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';`);
  await run(`warehouseSave({},async()=>{calls++},'inbound',['warehouse_received'],'完成')`);
  assert.equal(context.calls,0);
  assert.ok(context.testMessages.some(s=>s.includes('历史重复关联')));
});

test('warehouse details show selected confirmed database fees through payment, packing and shipping',()=>{
  const {run}=setup();
  run(`state.dbOrders=[{id:'a',order_no:'ORDER-A',status:'awaiting_payment',parcel_count:1,fees:[{estimated_total:99999,total_amount:2585,shipping_fee:2567,handling_fee:18,actual_weight_kg:60,volume_weight_kg:36,billable_weight_kg:60,confirmed_at:'2026-10-21T08:00:00Z'}],order_parcels:[]},{id:'b',order_no:'ORDER-B',status:'paid',fees:{total_amount:128,shipping_fee:110,handling_fee:18},order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';`);
  const html=run('warehouseConfirm()');
  for(const text of ['仓库实际费用','实际运费','¥2567.00','¥18.00','¥2585.00','60.00 kg','36.00 kg','费用确认时间'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('¥99999.00'));assert.ok(!html.includes('id="confirmBtn"'));
  run(`applyDbOrder(state.dbOrders[1]);warehouseWorkspace.selectedId='b'`);
  for(const view of ['warehouseConfirm()','warehousePacking()']){const current=run(view);assert.ok(current.includes('¥128.00'));assert.ok(!current.includes('¥2585.00'));}
  run(`state.dbOrders[1].status='ready_to_ship';applyDbOrder(state.dbOrders[1])`);
  assert.ok(run('warehouseShip()').includes('¥128.00'));
});
test('unconfirmed fees never use estimates as actual; zero confirmed fees render correctly',()=>{
  const {run}=setup();
  const pending=run(`warehouseActualFees({fees:[{estimated_total:123,total_amount:null}]})`);
  assert.ok(pending.includes('实际费用尚未生成'));assert.ok(!pending.includes('¥123.00'));assert.ok(!pending.includes('¥0.00'));
  const zero=run(`warehouseActualFees({fees:{total_amount:0,shipping_fee:0,handling_fee:0}})`);
  assert.ok(zero.includes('¥0.00'));assert.ok(!zero.includes('实际费用尚未生成'));
});

test('warehouse tracking list includes shipped/delivered only, searches waybills, filters and preserves main navigation',()=>{
 const {run}=setup();
 run(`state.dbOrders=[{id:'a',order_no:'ORDER-A',status:'shipped',shipment_carrier:'EMS',shipment_tracking_no:'EM123ID',recipient_name:'Alice',destination_country:'印度尼西亚'},{id:'b',order_no:'ORDER-B',status:'delivered',shipment_tracking_no:'DONE456'},{id:'c',order_no:'UNSHIPPED',status:'ready_to_ship'}];`);
 let html=run('warehouseTrackingList()');assert.ok(html.includes('ORDER-A'));assert.ok(html.includes('ORDER-B'));assert.ok(!html.includes('UNSHIPPED'));
 run("warehouseWorkspace.trackingQuery='em123id'");html=run('warehouseTrackingList()');assert.ok(html.includes('ORDER-A'));assert.ok(!html.includes('ORDER-B'));
 run("warehouseWorkspace.trackingQuery='';warehouseWorkspace.trackingTab='delivered'");html=run('warehouseTrackingList()');assert.ok(html.includes('ORDER-B'));assert.ok(!html.includes('ORDER-A'));
 run("warehouseWorkspace.trackingQuery='not found'");assert.ok(run('warehouseTrackingList()').includes('没有匹配'));
 assert.equal(run("pageRoles['warehouse-tracking-detail']"),'warehouse');assert.equal(run("navActivePage('warehouse-tracking-detail','warehouse')"),'warehouse-tracking');
 assert.ok(run('warehouseShip()').includes('查询已出货订单物流'));
});
test('opening shipped order loads its own persisted events and provides shipping-to-tracking links',async()=>{
 const {context,run}=setup();context.requested=[];
 run(`state.dbOrders=[{id:'a',order_no:'ORDER-A',status:'shipped',shipment_tracking_no:'EM123',order_parcels:[]}];go=page=>state.page=page;window.MospaceSupabase.orderTracking=async id=>{requested.push(id);return [{event_title:'运输节点',event_description:'仓库已登记出货',occurred_at:'2026-10-21T08:00:00Z',location:'深圳'}]};`);
 await run("openWarehouseOrder('a','warehouse-tracking-detail')");assert.deepEqual(context.requested,['a']);assert.equal(run('warehouseWorkspace.tracking.orderId'),'a');
 const html=run('warehouseTrackingDetail()');assert.ok(html.includes('运输节点'));assert.ok(html.includes('深圳'));assert.ok(html.includes('EM123'));assert.ok(html.includes('尚未接入'));assert.ok(!html.includes('暂无物流节点'));
 assert.ok(run('warehouseShip()').includes('查看本单物流'));
});
test('out-of-order event responses never leak previous order nodes and failed reads remain explicit',async()=>{
 const {run}=setup();run(`state.page='warehouse-tracking-detail';window.MospaceSupabase.orderTracking=id=>new Promise((resolve,reject)=>{if(id==='a'){resolveA=resolve}else{resolveB=resolve;rejectB=reject}})`);
 const a=run("loadWarehouseTracking('a')"),b=run("loadWarehouseTracking('b')");run("resolveB([{event_title:'B节点'}])");await b;run("resolveA([{event_title:'A节点'}])");await a;
 assert.equal(run('warehouseWorkspace.tracking.events[0].event_title'),'B节点');assert.equal(run('warehouseWorkspace.tracking.orderId'),'b');
 run(`state.dbOrders=[{id:'b',order_no:'B',status:'shipped',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='b';window.MospaceSupabase.orderTracking=async()=>{throw Error('network')}`);
 await run("loadWarehouseTracking('b')");const html=run('warehouseTrackingDetail()');assert.ok(html.includes('物流节点读取失败'));assert.ok(!html.includes('B节点'));assert.equal(run('warehouseWorkspace.tracking.loading'),false);
});
test('tracking handles empty results and escaped content and discards responses after account changes',async()=>{
 const {run}=setup();run(`state.page='warehouse-tracking-detail';state.dbOrders=[{id:'a',order_no:'A',status:'shipped',shipment_tracking_no:'<img>',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';window.MospaceSupabase.orderTracking=async()=>[]`);
 await run("loadWarehouseTracking('a')");assert.ok(run('warehouseTrackingDetail()').includes('暂无物流节点'));
 run(`warehouseWorkspace.tracking.events=[{event_title:'<script>',event_description:'<img>',location:'<b>'}]`);
 const html=run('warehouseTrackingDetail()');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img>'));
 run(`window.MospaceSupabase.orderTracking=()=>new Promise(r=>releaseTracking=r)`);const pending=run("loadWarehouseTracking('a')");run(`state.auth.user={id:'other'};releaseTracking([{event_title:'不应显示'}])`);await pending;
 assert.equal(run('warehouseWorkspace.tracking.events.length'),0);
});
test('tracking refresh re-reads order status and events for the selected ID without creating any nodes',async()=>{
 const {context,run}=setup();context.requests=[];
 run(`state.page='warehouse-tracking-detail';state.dbOrders=[{id:'a',order_no:'A',status:'shipped',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';refreshDbState=async()=>{requests.push('orders');state.dbOrders[0].status='delivered';applyDbOrder(state.dbOrders[0]);return true};window.MospaceSupabase.orderTracking=async id=>{requests.push(id);return [{event_title:'已签收'}]}`);
 await run('refreshWarehouseTracking()');assert.deepEqual(context.requests,['orders','a']);assert.equal(run('state.order.status'),'delivered');assert.ok(run('warehouseTrackingDetail()').includes('已签收'));
});
