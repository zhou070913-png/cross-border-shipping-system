const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map([['crumb',{textContent:''}],['workspaceGlobalRefresh',{}],['workspaceSyncStatus',{textContent:''}],['content',{querySelectorAll:()=>[]}]]),groups=new Map();
 const document={visibilityState:'visible',activeElement:null,getElementById:id=>elements.get(id)||null,querySelector:s=>s.startsWith('#')?elements.get(s.slice(1))||null:null,querySelectorAll:s=>groups.get(s)||[]};
 const window={MospaceSupabase:{isConfigured:()=>true},scrollY:0,scrollTo(){}};
 const c=vm.createContext({console,setTimeout,clearTimeout,URL,Blob,Uint8Array,window,document,navigator:{onLine:true},localStorage:{getItem:()=>null}});
 const root=path.join(__dirname,'..'),run=s=>vm.runInContext(s,c),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));run('bind=()=>{};render=()=>{}');
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js','overseas-addresses.js','calculator-workspace.js','last-mile-pricing.js','overall-orders.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`state.role='merchant';state.auth={user:{id:'m'},role:'merchant'};workspace.owner='m';paymentWorkspace.owner='m';warehouseWorkspace.owner='m';
 p={id:'p',tracking_no:'DOMESTIC-111',item_name:'Test',status:'shipped'};workspace.parcels=[p];
 h={id:'h',order_no:'MO-OVERALL',transport_leg:'first_mile',status:'shipped',consolidated:true,parcel_count:2,destination_country:'印度尼西亚',destination_city:'Jakarta',destination_address:'印尼仓地址',recipient_name:'印尼仓联系人',overseas_received_at:'2026-10-22',overseas_warehouse:'测试仓',route_name:'印尼海运普货',order_parcels:[{parcel_id:'p',parcels:p}],fees:[{fee_breakdown_version:3,total_amount:78,confirmed_at:'2026-10-22'}],payments:[{status:'paid',amount:78}],shipment_tracking_no:'HEAD-WAYBILL'};
 t={id:'t',order_no:'LM-INTERNAL',transport_leg:'last_mile',parent_order_id:'h',status:'awaiting_payment',parcel_count:2,destination_country:'印度尼西亚',destination_city:'巴厘',destination_address:'消费者街道',recipient_name:'消费者',order_parcels:[],fees:[{fee_breakdown_version:4,last_mile_fee:312.5,total_amount:312.5,confirmed_at:'2026-10-22'}],payments:[],shipment_tracking_no:'TAIL-WAYBILL'};
 state.dbOrders=[t,h];applyDbOrder(h);toast=()=>{};paymentWorkspace.account={is_active:true,mode:'test',updated_at:'v1'};`);
 return {run,elements,groups,c};
}
test('one family is one row regardless of input order, filtered tail or repeated input; unreadable parents remain visible',()=>{
 const {run}=setup();for(const rows of ['[h,t]','[t,h]','[t]','[h,t,h]']){
  const html=run(`workspaceOrderTable(${rows})`);assert.equal((html.match(/data-overall-row=/g)||[]).length,1);assert.match(html,/data-overall-row="h"/);assert.match(html,/MO-OVERALL/);assert.match(html,/¥78.00/);assert.match(html,/¥312.50/);assert.doesNotMatch(html,/data-overall-row="t"/);
 }
 run(`state.dbOrders=[t]`);assert.match(run('workspaceOrderTable([t])'),/LM-INTERNAL/);assert.match(run('overallOrderDetail()'),/整体订单/);
});
test('overall detail includes both segment addresses and independent payments without changing selection or totals',()=>{
 const {run}=setup();const html=run('overallOrderDetail()');
 for(const text of ['MO-OVERALL','LM-INTERNAL','1. 头程运输','2. 尾程配送','印尼仓地址','消费者街道','¥78.00','¥312.50','已付款','待付款'])assert.ok(html.includes(text),text);
 assert.match(html,/data-order-target="t" data-order-page="fee">查看费用与付款/);assert.match(html,/data-order-target="h" data-order-page="tracking"/);assert.doesNotMatch(html,/lastMileRequestForm/);
 assert.equal(run('state.activeOrderId'),'h');assert.equal(run('feeRecord(h).total_amount'),78);
 run(`applyDbOrder(t)`);assert.match(run('merchantFee()'),/所属整体订单/);assert.match(run('merchantFee()'),/data-overall-order="h"/);assert.match(run('merchantFee()'),/data-order-id="t"/);
});
test('tail application stays inside overall detail and estimates never masquerade as confirmed or paid costs',()=>{
 const {run}=setup();run('state.dbOrders=[h]');assert.match(run('overallOrderDetail()'),/lastMileRequestForm/);
 run(`h.overseas_received_at=null`);assert.doesNotMatch(run('overallOrderDetail()'),/lastMileRequestForm/);
 run(`h.overseas_received_at='2026-10-22';state.dbOrders=[h,t];t.fees=[{estimated_total:30}];t.status='warehouse_received'`);assert.match(run('overallOrderDetail()'),/¥30.00（预估）/);assert.equal(run('overallFeeText(t)'),'¥30.00（预估）');
 run(`t.fees=[]`);assert.equal(run('overallFeeText(t)'),'待确认');
});
test('search by tail ID, consumer, waybill or domestic tracking finds one overall order with correct status filters',()=>{
 const {run}=setup();for(const query of ['LM-INTERNAL','消费者','TAIL-WAYBILL','DOMESTIC-111']){
  run(`workspace.orderQuery='${query}'`);const html=run('merchantOrders()');assert.equal((html.match(/data-overall-row=/g)||[]).length,1);assert.match(html,/MO-OVERALL/);
 }
 run(`workspace.orderQuery='';workspace.orderTab='awaiting_payment'`);assert.equal((run('merchantOrders()').match(/data-overall-row=/g)||[]).length,1);
 run(`t.status='delivered';workspace.orderTab='shipped'`);assert.doesNotMatch(run('merchantOrders()'),/data-overall-row=/);
 run(`workspace.orderTab='delivered'`);assert.equal((run('merchantOrders()').match(/data-overall-row=/g)||[]).length,1);
});
test('warehouse groups matching tasks under the parent while continuing work on the tail ID',async()=>{
 const {run}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';t.status='warehouse_received';go=(page)=>{state.page=page}`);
 const html=run('warehouseOrderRows([t])');assert.equal((html.match(/data-overall-row=/g)||[]).length,1);assert.match(html,/MO-OVERALL/);assert.match(html,/DOMESTIC-111/);assert.match(html,/data-warehouse-order="t" data-warehouse-page="confirm"/);
 await run('openOverallOrder("t")');assert.equal(run('state.activeOrderId'),'h');assert.equal(run('state.page'),'overall-order');assert.match(run('overallOrderDetail()'),/核对尾程费用/);
 await run('openWarehouseOrder("t","confirm")');assert.equal(run('state.activeOrderId'),'t');assert.match(run('warehouseConfirm()'),/data-order-id="t"/);assert.match(run('warehouseConfirm()'),/data-overall-order="h"/);
});
test('dashboard counts, tracking lists and navigation stay at one overall order while preserving both waybills',()=>{
 const {run}=setup();run(`t.status='shipped'`);let html=run('merchantDashboard()');assert.equal((html.match(/data-overall-row=/g)||[]).length,1);assert.match(html,/运输中<\/div><div class="kpi-num">1|运输中[\s\S]*?>1</);
 for(const expr of ['merchantTrackingList()','warehouseTrackingList()']){html=run(expr);assert.equal((html.match(/data-overall-row=/g)||[]).length,1);assert.match(html,/HEAD-WAYBILL/);assert.match(html,/TAIL-WAYBILL/)}
 assert.equal(run('navActivePage("overall-order","merchant")'),'orders');assert.equal(run('navActivePage("overall-order","warehouse")'),'dashboard');
});
test('overall screen refreshes both segments from a new snapshot without persisting an aggregate delivery state',async()=>{
 const {run}=setup();run(fs.readFileSync(path.join(__dirname,'..','progress-sync.js'),'utf8'));
 run(`state.page='overall-order';render=()=>{rendered=overallOrderDetail()};readProgressSnapshot=async()=>({orders:JSON.parse(JSON.stringify(state.dbOrders)).map(o=>o.id==='t'?{...o,status:'delivered'}:o),parcels:workspace.parcels,receipts:[],notices:[],events:null,warehouseEvents:null})`);
 assert.equal(await run('runProgressSync()'),true);assert.match(run('rendered'),/已签收/);assert.equal(run('state.order.record.status'),'shipped');assert.equal(run('state.order.record.id'),'h');
});
