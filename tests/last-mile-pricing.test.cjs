const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map([["#crumb",{textContent:""}]]),groups=new Map(),c=vm.createContext({console,setTimeout,clearTimeout,URL,Blob,Uint8Array,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:s=>groups.get(s)||[],getElementById:id=>id==="workspaceGlobalRefresh"?{}:null},localStorage:{getItem:()=>null}});
 const root=path.join(__dirname,'..'),run=s=>vm.runInContext(s,c),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));run('bind=()=>{};render=()=>{}');
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js','overseas-addresses.js','calculator-workspace.js','last-mile-pricing.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`render=()=>{};state.role='merchant';state.auth={user:{id:'m'},role:'merchant'};workspace.owner='m';
 z={id:'z',warehouse_id:'wh',name:'大雅加达',reference_distance_km:30,included_distance_km:10,base_fee:20,price_per_km:0.5,is_active:true,is_test_rate:true,updated_at:'v1'};
 workspace.lastMileZones=[z,{...z,id:'other',warehouse_id:'other-wh',name:'OTHER WAREHOUSE'},{...z,id:'disabled',name:'DISABLED REGION',is_active:false}];
 h={id:'h',order_no:'HEAD',status:'shipped',destination_overseas_warehouse_id:'wh',transport_leg:'first_mile',overseas_received_at:'2026-10-22',overseas_warehouse:'QA印尼仓',fees:[{fee_breakdown_version:3,total_amount:78,confirmed_at:'2026-10-22'}]};
 t={id:'t',order_no:'TAIL',status:'warehouse_received',transport_leg:'last_mile',parent_order_id:'h',delivery_zone_id:'z',recipient_name:'QA消费者',destination_address:'QA地址',order_parcels:[],fees:[{fee_breakdown_version:1,estimated_total:30,pricing_snapshot:{type:'last_mile_distance',zone:{...z},distance_km:30}}]};
 state.dbOrders=[h,t];applyDbOrder(t);warehouseWorkspace.owner='m';warehouseWorkspace.selectedId='t';toast=()=>{};`);
 return {run,elements,groups};
}
test('region distance price uses included kilometres, currency rounding and rejects invalid values',()=>{
 const {run}=setup();for(const [km,amount] of [[0,20],[10,20],[30,30],[50,40],[10.01,20.01]])assert.equal(run(`distanceAmount(z,${km})`),amount);
 for(const input of ['null','""','-1','50001','1.001','NaN','Infinity'])assert.throws(()=>run(`distanceAmount(z,${input})`));
 for(const patch of ['base_fee:null','base_fee:0','price_per_km:-1','included_distance_km:-1','is_active:false'])assert.throws(()=>run(`distanceAmount({...z,${patch}},30)`));
 assert.match(run('distanceQuoteHtml(z,30)'),/非地图导航距离|非地图/);assert.match(run('distanceQuoteHtml(z,30)'),/待仓库确认/);
});
test('merchant region selection stays with origin warehouse; existing estimates are explicit and do not enable payment',()=>{
 const {run}=setup();run('state.dbOrders=[h];applyDbOrder(h)');let html=run('lastMileRequest(h)');
 assert.match(html,/lastMileZone/);assert.doesNotMatch(html,/OTHER WAREHOUSE|DISABLED REGION/);assert.match(html,/消费者详细收货地址/);
 run('state.dbOrders=[h,t];applyDbOrder(t)');html=run('merchantFee()');assert.match(html,/¥30.00/);assert.match(html,/下单时预估/);assert.doesNotMatch(html,/id="paymentReceiptForm"/);
 assert.match(html,/待仓库核对配送距离/);assert.doesNotMatch(run('warehouseActualFees(t)'),/实重和尺寸确认/);
 run('workspace.lastMileZones=[];state.dbOrders=[h];applyDbOrder(h)');assert.match(run('lastMileRequest(h)'),/type="submit" disabled/);
});
test('confirmed tail fee and origin stay visible for merchant and warehouse after current zone prices change',()=>{
 const {run}=setup();run(`t.fees=[{fee_breakdown_version:4,total_amount:40,last_mile_fee:40,last_mile_note:'QA距离',confirmed_at:'2026-10-22',pricing_snapshot:{type:'last_mile_distance',zone:{...z},distance_km:50,distance_note:'承运商核对'}}];z.base_fee=999;`);
 const merchant=run('merchantFee()'),warehouse=run('warehouseActualFees(t)');
 for(const html of [merchant,warehouse]){assert.match(html,/¥40.00/);assert.match(html,/50 km/);assert.match(html,/¥20.00/);assert.match(html,/承运商核对/);assert.doesNotMatch(html,/¥999.00/)}
 const rows=run('warehouseOrderRows([t])');assert.match(rows,/<th>本段费用/);assert.match(rows,/<td>¥40.00/);
 run(`t.status='awaiting_payment'`);assert.doesNotMatch(run('warehouseConfirm()'),/id="distanceLastMileQuoteForm"/);
});
test('warehouse computes a quote preview from distance and submits the selected zone version without client amount',async()=>{
 const {run,elements}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator'`);let html=run('warehouseConfirm()');assert.match(html,/distanceQuoteKm/);assert.doesNotMatch(html,/id="lastMileFee"/);
 const form={dataset:{orderId:'t'}},zone={value:'z'},km={value:'30'},preview={innerHTML:''};
 for(const [id,el] of Object.entries({distanceLastMileQuoteForm:form,distanceQuoteZone:zone,distanceQuoteKm:km,distanceQuoteNote:{value:'QA核对50km'},distanceQuotePreview:preview}))elements.set('#'+id,el);
 run('paymentTask=async(f,fn)=>fn();refreshDbState=async()=>true;rpcWorkspace=async(name,args)=>{sent={name,args}};bind()');km.value='50';km.oninput();assert.match(preview.innerHTML,/¥40.00/);
 await form.onsubmit({preventDefault(){}});assert.equal(run('sent.name'),'warehouse_quote_last_mile_distance');assert.equal(run('sent.args.p_distance_km'),50);assert.equal(run('sent.args.p_expected_zone_version'),'v1');assert.equal(run('sent.args.p_amount'),undefined);
 run('z.is_active=false');assert.match(run('warehouseConfirm()'),/配送地区已停用/);assert.match(run('warehouseConfirm()'),/type="submit" disabled/);
});
test('merchant sends region selection and version with consumer address, then navigates to returned tail',async()=>{
 const {run,elements}=setup();run('state.dbOrders=[h];applyDbOrder(h)');const form={dataset:{orderId:'h'}},select={value:'z'},preview={innerHTML:''};
 elements.set('#lastMileRequestForm',form);elements.set('#lastMileZone',select);elements.set('#lastMileEstimate',preview);
 run(`readLastMileRecipient=()=>({country:'印度尼西亚',city:'Jakarta',address_line:'CONSUMER'});paymentTask=async(f,fn)=>fn();rpcWorkspace=async(name,args)=>{sent={name,args};return {id:'new-tail'}};refreshDbState=async(page)=>{targetPage=page;return true};bind()`);
 select.onchange();assert.match(preview.innerHTML,/¥30.00/);await form.onsubmit({preventDefault(){}});
 assert.equal(run('sent.name'),'merchant_create_distance_last_mile');assert.equal(run('sent.args.p_zone_id'),'z');assert.equal(run('sent.args.p_expected_zone_version'),'v1');assert.equal(run('state.activeOrderId'),'new-tail');assert.equal(run('targetPage'),'fee');
});
test('operations save region-specific distance prices with version and expose add, disable and test flags',async()=>{
 const {run,elements}=setup();run(`state.role='admin';lastMilePricing.adminZoneId='z';workspace.overseasWarehouses=[{id:'wh',name:'QA仓',is_active:true}];`);assert.match(run('adminConfig()'),/印尼尾程地区与距离运价/);assert.match(run('adminConfig()'),/新增配送地区/);
 const form={dataset:{id:'z',version:'v1'}};elements.set('#lastMileZoneConfigForm',form);
 for(const [id,value] of Object.entries({zoneWarehouse:'wh',zoneName:'新地区名',zoneReference:'40',zoneIncluded:'10',zoneBase:'25',zoneUnit:'0.6',zoneNotes:'QA配置'}))elements.set('#'+id,{value});
 elements.set('#zoneActive',{checked:true});elements.set('#zoneTest',{checked:true});
 run('paymentTask=async(f,fn)=>fn();loadMerchantWorkspace=async()=>{};rpcWorkspace=async(name,args)=>{sent={name,args};return {id:"z"}};bind()');await form.onsubmit({preventDefault(){}});
 assert.equal(run('sent.name'),'admin_save_last_mile_zone');assert.equal(run('sent.args.p_config.base_fee'),25);assert.equal(run('sent.args.p_expected_updated_at'),'v1');assert.equal(run('t.fees[0].estimated_total'),30);
});


