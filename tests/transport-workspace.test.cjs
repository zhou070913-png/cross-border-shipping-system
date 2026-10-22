const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map([["#crumb",{textContent:""}]]),groups=new Map(),c=vm.createContext({console,setTimeout,clearTimeout,URL,Blob,Uint8Array,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:s=>groups.get(s)||[],getElementById:id=>id==="workspaceGlobalRefresh"?{}:null},localStorage:{getItem:()=>null}});
 const root=path.join(__dirname,'..'),run=s=>vm.runInContext(s,c),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));
 run('bind=()=>{};render=()=>{}');
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`render=()=>{};messages=[];toast=s=>messages.push(s);state.role='merchant';state.auth={user:{id:'m'},role:'merchant'};
 air={is_active:true,route_code:'ID-AIR',route_name:'印尼空运专线',transport_mode:'air',billing_basis:'kg',volume_divisor:6000,first_weight_kg:0.5,first_price:68,additional_price_per_kg:42,handling_fee:18};
 sea={...air,route_code:'ID-SEA',route_name:'印尼海运专线',transport_mode:'sea',billing_basis:'cbm',price_per_cbm:600,minimum_cbm:0.1,is_test_rate:true};workspace.routes=[air,sea];
 p={id:'p',tracking_no:'P',parcel_no:'P',declared_weight_kg:2,declared_length_cm:30,declared_width_cm:20,declared_height_cm:10};
 o={id:'o',order_no:'SEA-QA',status:'warehouse_received',parcel_count:1,order_parcels:[{parcel_id:'p',parcels:p}],fees:[]};state.dbOrders=[o];applyDbOrder(o);workspace.parcels=[p];`);
 return {run,c,elements,groups};
}
test('sea uses cubic metres and minimum charge; air remains weight based',()=>{
 const {run}=setup();let q=run('estimatePacking([p],sea)');assert.equal(q.volumeCbm,0.006);assert.equal(q.billableCbm,0.1);assert.equal(q.total,78);
 q=run('estimatePacking([{...p,declared_length_cm:100,declared_width_cm:50,declared_height_cm:40}],sea)');assert.equal(q.volumeCbm,0.2);assert.equal(q.shipping,120);
 assert.equal(run('estimatePacking([p],air).total'),149);
 assert.equal(run('estimatePacking([{...p,actual_weight_kg:1,length_cm:100,width_cm:100,height_cm:50}],sea).shipping'),300);
});
test('sea invalid pricing cannot produce a payable quote',()=>{
 const {run}=setup();for(const patch of ['price_per_cbm:null','minimum_cbm:Infinity','minimum_cbm:0','is_active:false'])assert.equal(run(`estimatePacking([p],{...sea,${patch}}).status`),'no_route');
 assert.equal(run('estimatePacking([{...p,declared_height_cm:null}],sea).status'),'incomplete');
});
test('merchant route form includes air and sea; sea rate page is wired to the replacement renderer',()=>{
 const {run}=setup();run('workspace.quote={...estimatePacking([p],sea),length:30,width:20,height:10}');
 const html=run('MerchantViews.rates()');assert.match(html,/印尼空运专线/);assert.match(html,/印尼海运专线/);assert.match(html,/最低 0.1 m³/);assert.match(html,/未.*尾程|不含.*尾程/);assert.doesNotMatch(html,/参考费用明细|同一外箱的实重与体积重取大值/);
});
test('estimates label head subtotal, unknown last mile and test price without collecting payment',()=>{
 const {run}=setup();for(const r of ['air','sea']){const html=run(`packingEstimateHtml(estimatePacking([p],${r}))`);assert.match(html,/尾程/);assert.match(html,/尾程.*另单|尾程.*单独/);assert.doesNotMatch(html,/paymentReceiptForm|id="payBtn"/)}
 assert.match(run('packingEstimateHtml(estimatePacking([p],sea))'),/测试运价/);
});
test('head fees explicitly separate future last mile; old confirmed charges are retained',()=>{
 const {run}=setup();run(`o.status='awaiting_payment';o.fees=[{fee_breakdown_version:3,billing_basis:'cbm',shipping_fee:60,handling_fee:18,last_mile_fee:null,total_amount:78,confirmed_at:'2026-10-22',volume_cbm:0.006,billable_cbm:0.1,pricing_snapshot:{price_per_cbm:600,is_test_rate:true}}];applyDbOrder(o);paymentWorkspace.account=null;`);
 for(const expr of ['merchantFee()','warehouseActualFees(o)']){const html=run(expr);for(const text of ['深圳仓 → 印尼海外仓','尾程','¥60.00','¥78.00'])assert.ok(html.includes(text),expr+text)}
 run(`o.fees=[{shipping_fee:110,handling_fee:18,total_amount:128,confirmed_at:'2026-10-22'}];applyDbOrder(o)`);assert.match(run('merchantFee()'),/历史账单未拆分/);assert.equal(run('feeRecord(o).total_amount'),128);
});
test('merchant can request last mile only after arrival and only for new separate head bills; child has its own payable fee',()=>{
 const {run}=setup();run(`o.fees=[{fee_breakdown_version:3,total_amount:78,shipping_fee:60,handling_fee:18}];o.payments=[{status:'paid',amount:78}];o.status='shipped';applyDbOrder(o)`);
 assert.doesNotMatch(run('merchantFee()'),/lastMileRequestForm/);
 run(`o.overseas_received_at='2026-10-22';o.overseas_warehouse='测试印尼仓';applyDbOrder(o)`);assert.match(run('merchantFee()'),/lastMileRequestForm/);
 run(`tail={id:'t',order_no:'TAIL-001',transport_leg:'last_mile',parent_order_id:'o',route_name:'印尼尾程配送',status:'awaiting_payment',fees:[{fee_breakdown_version:4,last_mile_fee:25,last_mile_note:'测试报价',total_amount:25,confirmed_at:'2026-10-22',shipping_fee:0,handling_fee:0}],order_parcels:[]};state.dbOrders.push(tail);paymentWorkspace.account={is_active:true,mode:'test',updated_at:'v1'};applyDbOrder(tail)`);
 const html=run('merchantFee()');assert.match(html,/¥25.00/);assert.match(html,/paymentReceiptForm/);assert.match(html,/关联头程/);assert.doesNotMatch(html,/lastMileRequestForm/);assert.doesNotMatch(html,/仓库确认进度/);
 run('applyDbOrder(o)');assert.doesNotMatch(run('merchantFee()'),/lastMileRequestForm/);assert.match(run('merchantFee()'),/TAIL-001/);
 run(`state.dbOrders=[o];o.fees[0].fee_breakdown_version=1;applyDbOrder(o)`);assert.doesNotMatch(run('merchantFee()'),/lastMileRequestForm/);
});
test('tail warehouse quote and arrival controls follow the correct leg; quoted tails cannot be requoted',()=>{
 const {run}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';o.transport_leg='last_mile';o.parent_order_id='parent';o.destination_address='<img>';warehouseWorkspace.selectedId='o'`);
 assert.match(run('warehouseConfirm()'),/lastMileQuoteForm/);assert.match(run('warehouseConfirm()'),/&lt;img&gt;/);assert.doesNotMatch(run('warehouseConfirm()'),/measure-row|id="confirmBtn"/);
 run(`o.status='awaiting_payment';applyDbOrder(o)`);assert.doesNotMatch(run('warehouseConfirm()'),/lastMileQuoteForm/);
 run(`o.status='shipped';o.transport_leg='first_mile';applyDbOrder(o)`);assert.match(run('warehouseShip()'),/overseasReceivedForm/);assert.doesNotMatch(run('warehouseShip()'),/lastMileDeliveredForm/);
 run(`o.transport_leg='last_mile';applyDbOrder(o)`);assert.match(run('warehouseShip()'),/lastMileDeliveredForm/);assert.doesNotMatch(run('warehouseShip()'),/overseasReceivedForm/);
});
test('separate request selects returned child ID and quote submits independent amount, not parent total',async()=>{
 const {run,elements}=setup();let form={dataset:{orderId:'o'},querySelectorAll:()=>[]};elements.set('#lastMileRequestForm',form);elements.set('#lastMileAddress',{value:'addr'});
 run(`paymentTask=async(f,fn)=>fn();rpcWorkspace=async(name,args)=>{sent={name,args};return {id:'new-tail'}};refreshDbState=async(page)=>{refreshed=page;return true}`);run('bind()');await form.onsubmit({preventDefault(){}});
 assert.equal(run('sent.name'),'merchant_create_last_mile');assert.equal(run('sent.args.p_address_id'),'addr');assert.equal(run('state.activeOrderId'),'new-tail');assert.equal(run('refreshed'),'fee');
 elements.delete('#lastMileRequestForm');form={dataset:{orderId:'t'},querySelectorAll:()=>[]};elements.set('#lastMileQuoteForm',form);elements.set('#lastMileFee',{value:'25'});elements.set('#lastMileNote',{value:'本地报价'});run('bind()');await form.onsubmit({preventDefault(){}});
 assert.equal(run('sent.name'),'warehouse_quote_last_mile');assert.equal(run('sent.args.p_order_id'),'t');assert.equal(run('sent.args.p_amount'),25);
});
test('smallest positive declared dimensions retain minimum positive sea volume',()=>{const {run}=setup();assert.equal(run('estimatePacking([{...p,declared_length_cm:0.01,declared_width_cm:0.01,declared_height_cm:0.01}],sea).volumeCbm'),0.000001)});
