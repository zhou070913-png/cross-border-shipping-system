const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map([["#crumb",{textContent:""}]]),groups=new Map(),c=vm.createContext({console,setTimeout,clearTimeout,URL,Blob,Uint8Array,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:s=>elements.get(s)||null,querySelectorAll:s=>groups.get(s)||[],getElementById:id=>id==="workspaceGlobalRefresh"?{}:null},localStorage:{getItem:()=>null}});
 const root=path.join(__dirname,'..'),run=s=>vm.runInContext(s,c),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));
 run('bind=()=>{};render=()=>{}');
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js','overseas-addresses.js','calculator-workspace.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`render=()=>{};messages=[];toast=s=>messages.push(s);state.role='merchant';state.auth={user:{id:'m'},role:'merchant'};
 air={is_active:true,route_code:'ID-AIR',route_name:'印尼空运专线',transport_mode:'air',billing_basis:'kg',volume_divisor:6000,first_weight_kg:0.5,first_price:68,additional_price_per_kg:42,handling_fee:18};
 sea={...air,route_code:'ID-SEA',route_name:'印尼海运专线',transport_mode:'sea',billing_basis:'cbm',price_per_cbm:600,minimum_cbm:0.1,is_test_rate:true};workspace.routes=[air,sea];
 p={id:'p',tracking_no:'P',parcel_no:'P',declared_weight_kg:2,declared_length_cm:30,declared_width_cm:20,declared_height_cm:10};
 o={id:'o',order_no:'SEA-QA',status:'warehouse_received',parcel_count:1,order_parcels:[{parcel_id:'p',parcels:p}],fees:[]};state.dbOrders=[o];applyDbOrder(o);workspace.parcels=[p];`);
 run(`workspace.routes.push({...air,route_code:'ID-AIR-SENSITIVE',route_name:'印尼空运敏感货',cargo_type:'sensitive',first_price:88,additional_price_per_kg:52,is_test_rate:true},{...sea,route_code:'ID-SEA-SENSITIVE',route_name:'印尼海运敏感货',cargo_type:'sensitive',price_per_cbm:800});boxes=[{length:'30',width:'20',height:'10',weight:'2',quantity:'1'}];`);return {run,c,elements,groups};
}

test('four channels price independently, with sea minimum and air volumetric charging',()=>{
 const {run}=setup();assert.deepEqual(JSON.parse(run('JSON.stringify(workspace.routes.map(r=>calculateFreight(boxes,r).total))')),[149,78,184,98]);
 run(`boxes=[{length:100,width:50,height:40,weight:2,quantity:2},{length:30,width:20,height:10,weight:10,quantity:1}]`);
 const air=run('calculateFreight(boxes,workspace.routes[0])'),sea=run('calculateFreight(boxes,workspace.routes[1])');
 assert.equal(air.count,3);assert.equal(air.weight,14);assert.equal(air.volume,67.667);assert.equal(air.billable,67.667);assert.equal(air.total,2907.01);
 assert.equal(sea.volumeCbm,0.406);assert.equal(sea.shipping,243.6);assert.equal(sea.total,261.6);assert.equal(sea.handling,18);
 assert.equal(run('calculateFreight([{length:30,width:20,height:10,weight:0.1,quantity:1}],workspace.routes[1]).total'),78);
});

test('invalid, missing, excessive inputs and inactive routes never produce estimates',()=>{
 const {run}=setup();
 for(const patch of ["weight:''","weight:-1","weight:Infinity","length:0","height:10001","quantity:1.5","quantity:101","length:0.001","weight:0.0001"]){assert.throws(()=>run(`calculateFreight([{...boxes[0],${patch}}],air)`))}
 assert.throws(()=>run('calculateFreight([],air)'));assert.throws(()=>run('calculateFreight(boxes,{...air,is_active:false})'));
 assert.throws(()=>run('calculateFreight(boxes,{...sea,price_per_cbm:null})'));
 assert.throws(()=>run('calculateFreight(Array(21).fill(boxes[0]),air)'));
 assert.throws(()=>run('calculateFreight(Array(11).fill({...boxes[0],quantity:100}),air)'));
});

test('rendered calculator exposes four choices, test prices, calculation detail and separate tail settlement',()=>{
 const {run}=setup();let html=run('MerchantViews.rates()');assert.match(html,/运输计算器/);assert.match(html,/freightAddBox/);assert.match(html,/ID-AIR-SENSITIVE/);assert.match(html,/ID-SEA-SENSITIVE/);
 run(`freightCalculator.quote=calculateFreight(boxes,workspace.routes[2])`);html=run('freightResultHtml()');assert.match(html,/¥184.00/);assert.match(html,/测试运价/);assert.match(html,/敏感货/);assert.match(html,/总体积重/);assert.match(html,/分箱明细/);assert.match(html,/尾程另建订单/);assert.doesNotMatch(html,/paymentReceiptForm|id="payBtn"/);
 run(`freightCalculator.quote=calculateFreight(boxes,sea)`);html=run('freightResultHtml()');assert.match(html,/最低 0.1 m³/);assert.doesNotMatch(html,/计费重量/);
 run(`state.dbOrders=[];workspace.parcels=[{...p,status:'pre_advised'}];workspace.overseasWarehouses=[]`);html=run('merchantPackingRequest()');assert.match(html,/ID-AIR-SENSITIVE/);assert.match(html,/ID-SEA-SENSITIVE/);
 assert.match(run(`packingEstimateHtml(estimatePacking([p],workspace.routes[2]))`),/测试运价/);
});

test('edits and channel changes invalidate quotes; adding/removing groups preserves raw draft and never writes orders',()=>{
 const {run,elements,groups}=setup();run('merchantRates()');
 const result={innerHTML:''},form={},channel={value:'ID-SEA'},add={},reset={},remove={dataset:{removeFreightBox:'1'}};
 elements.set('#freightCalculatorForm',form);elements.set('#freightChannel',channel);elements.set('#freightResult',result);elements.set('#freightAddBox',add);elements.set('#freightReset',reset);
 const inputs=['length','width','height','weight','quantity'].map(k=>({value:{length:'30',width:'20',height:'10',weight:'2',quantity:'2'}[k],dataset:{freightBox:'0',freightKey:k}}));groups.set('[data-freight-box]',inputs);groups.set('[data-remove-freight-box]',[remove]);run('bind()');
 form.onsubmit({preventDefault(){}});assert.match(result.innerHTML,/¥78.00/);assert.equal(run('freightCalculator.quote.count'),2);
 inputs[0].value='100';form.oninput();assert.equal(run('freightCalculator.quote'),null);assert.doesNotMatch(result.innerHTML,/¥78.00/);
 add.onclick();assert.equal(run('freightCalculator.boxes.length'),2);assert.equal(run('freightCalculator.boxes[0].length'),'100');remove.onclick();assert.equal(run('freightCalculator.boxes.length'),1);
 channel.value='ID-AIR-SENSITIVE';channel.onchange();form.onsubmit({preventDefault(){}});assert.equal(run('freightCalculator.quote.routeCode'),'ID-AIR-SENSITIVE');
 reset.onclick();assert.equal(run('freightCalculator.boxes[0].weight'),'');assert.equal(run('freightCalculator.quote'),null);assert.equal(run('state.dbOrders.length'),1);
});

test('another merchant gets an empty calculator; disabled channels stay out of selection',()=>{
 const {run}=setup();run(`merchantRates();freightCalculator.boxes[0].weight='99';freightCalculator.quote=calculateFreight(boxes,air);state.auth.user={id:'other'};workspace.routes[2].is_active=false;`);
 const html=run('merchantRates()');assert.equal(run('freightCalculator.quote'),null);assert.equal(run('freightCalculator.boxes[0].weight'),'');assert.doesNotMatch(html,/value="ID-AIR-SENSITIVE"/);
});

test('sea weight and volume are independent charges; choose higher, including minimum, tie and missing rate',()=>{
 const {run}=setup();run(`sea.sea_charge_rule='higher_of_weight_volume';sea.sea_price_per_kg=1.5;`);
 let q=run('calculateFreight([{length:100,width:50,height:40,weight:100,quantity:1}],sea)');assert.equal(q.seaVolumeCharge,120);assert.equal(q.seaWeightCharge,150);assert.equal(q.shipping,150);assert.equal(q.total,168);
 q=run('calculateFreight([{length:100,width:50,height:40,weight:2,quantity:1}],sea)');assert.equal(q.shipping,120);
 q=run('calculateFreight([{length:30,width:20,height:10,weight:2,quantity:1}],sea)');assert.equal(q.seaVolumeCharge,60);assert.equal(q.shipping,60);
 q=run('calculateFreight([{length:100,width:100,height:10,weight:40,quantity:1}],sea)');assert.equal(q.seaVolumeCharge,q.seaWeightCharge);
 assert.throws(()=>run('calculateFreight(boxes,{...sea,sea_price_per_kg:null})'));
 run(`freightCalculator.quote=calculateFreight([{length:100,width:50,height:40,weight:100,quantity:1}],sea)`);let html=run('freightResultHtml()');assert.match(html,/按体积计算/);assert.match(html,/按重量计算/);assert.match(html,/重量费（较高）/);assert.match(html,/非相加/);
 run(`f={billing_basis:'cbm',shipping_fee:150,actual_weight_kg:100,volume_cbm:0.2,billable_cbm:0.2,pricing_snapshot:sea}`);html=run('seaFeeDetails(f)');assert.match(html,/¥150.00/);assert.match(html,/¥120.00/);assert.match(html,/取高/);
 run(`delete f.pricing_snapshot.sea_charge_rule`);assert.doesNotMatch(run('seaFeeDetails(f)'),/按重量计算/);
});

test('operations can save independent sea weight price without changing other channel or historical amounts',async()=>{
 const {run,elements}=setup();run(`sea.sea_charge_rule='higher_of_weight_volume';sea.sea_price_per_kg=1.5;transportWorkspace.routeCode='ID-SEA';state.role='admin';state.auth.role='admin'`);
 assert.match(run('adminConfig()'),/海运重量单价/);const form={dataset:{code:'ID-SEA',version:'v1'}};
 elements.set('#transportRouteForm',form);
 for(const [id,value] of Object.entries({transportName:'印尼海运普货',transportHandling:'18',transportNotes:'测试配置',transportCbmPrice:'600',transportMinCbm:'0.1',transportSeaWeightPrice:'1.75'}))elements.set('#'+id,{value});
 elements.set('#transportActive',{checked:true});elements.set('#transportTest',{checked:true});
 run(`paymentTask=async(f,fn)=>fn();rpcWorkspace=async(name,args)=>{sent={name,args}};loadMerchantWorkspace=async()=>{};bind()`);await form.onsubmit({preventDefault(){}});
 assert.equal(run('sent.name'),'admin_save_transport_route');assert.equal(run('sent.args.p_config.sea_price_per_kg'),1.75);assert.equal(run('sent.args.p_expected_updated_at'),'v1');assert.equal(run('air.first_price'),68);assert.equal(run('o.fees.length'),0);
});
