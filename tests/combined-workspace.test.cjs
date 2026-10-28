const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');
test('new advice and edit have precisely tracking and item name',()=>{
 const {run,document}=setup();for(const edit of [false,true]){
  run(`workspace.parcels=[{id:'p',status:'pre_advised',tracking_no:'TEST-PARCEL',item_name:'测试品名'}];workspace.editParcelId='p';state.dbOrders=[]`);
  document.querySelector('#content').innerHTML=run('combinedAdvice('+edit+')');
  assert.deepEqual([...document.querySelectorAll('#combinedAdvice input')].map(i=>i.id),['caTracking','caItem']);
 }
});
test('calculator only exposes Indonesia air and sea; sea uses higher of weight/volume',()=>{
 const {run}=setup();run(`workspace.routes.push({...workspace.routes[0],route_code:'ID-AIR-SENSITIVE'})`);
 assert.equal(run('freightChannels().length'),2);
 assert.equal(run(`calculateFreight([{weight:100,length:100,width:100,height:20,quantity:1}],workspace.routes[1]).shipping`),150);
 assert.equal(run(`calculateFreight([{weight:1,length:100,width:100,height:20,quantity:1}],workspace.routes[1]).shipping`),120);
 assert.doesNotMatch(run('combinedCalculator()'),/SENSITIVE|敏感货/);
});
test('overall order shows pending tail as unknown, then single combined total and recipient',()=>{
 const {run}=setup();assert.match(run('combinedSummary(o)'),/待复核费用/);assert.doesNotMatch(run('combinedSummary(o)'),/¥0\.00|尚未申请|独立结算/);
 run(`o.fees[0]={shipping_fee:60,handling_fee:18,last_mile_fee:30,total_amount:108,confirmed_at:'now'};o.status='awaiting_payment'`);
 const html=run('combinedSummary(o)');for(const s of ['¥78.00','¥30.00','¥108.00','TEST address','TEST name','TEST phone','一次付款'])assert.ok(html.includes(s));
});
test('dashboard every workflow card routes to an actual workflow; filters navigate',()=>{
 const {run,document}=setup();run(`state.page='dashboard';render()`);
 assert.equal(document.querySelectorAll('.combined-flow [data-page]').length,4);assert.equal(document.querySelectorAll('[data-combined-filter]').length,6);
 const b=document.querySelector('[data-combined-filter=awaiting_payment]');b.onclick();
 assert.equal(run('state.page'),'orders');assert.equal(run('combined.filter'),'awaiting_payment');
});
test('fee details use the saved air tariff and measured cartons, retaining pending fees and zero charges',()=>{
 const {run,document}=setup();
 run(`o.fees[0]={shipping_fee:75,handling_fee:18,last_mile_fee:null,total_amount:null,actual_weight_kg:1,volume_weight_kg:.5,billable_weight_kg:1,billing_basis:'kg',pricing_snapshot:{first_weight_kg:.5,first_price:50,additional_price_per_kg:50,volume_divisor:6000,packed_boxes:[{weight:1,length:20,width:15,height:10}]}};workspace.routes[0].first_price=9999`);
 document.querySelector('#content').innerHTML=run('combinedSummary(o)');
 const details=document.querySelector('[data-combined-fees]');assert.ok(details);assert.equal(details.hasAttribute('open'),false);
 for(const text of ['头程运费','国内仓操作费','¥75.00','¥18.00','¥93.00','1.000 kg','20.00 cm','¥50.00','待复核费用'])assert.ok(details.textContent.includes(text),text);
 assert.doesNotMatch(details.textContent,/9999|9,999|¥0\.00/);
 run(`o.fees[0].last_mile_fee=0;o.fees[0].total_amount=93;o.fees[0].confirmed_at='now';o.fees[0].last_mile_note='<img src=x onerror=alert(1)>'`);
 document.querySelector('#content').innerHTML=run('combinedFeeDetails(o)');
 assert.match(document.querySelector('#content').textContent,/¥0\.00/);assert.equal(document.querySelectorAll('#content img').length,0);
});
test('sea fee details explain weight and volume pricing from the order snapshot and stay expanded after refresh',()=>{
 const {run,document}=setup();
 run(`o.route_name='印尼海运';o.fees[0]={shipping_fee:150,handling_fee:18,last_mile_fee:30,total_amount:198,confirmed_at:'now',billing_basis:'cbm',actual_weight_kg:100,volume_cbm:.2,billable_cbm:.2,pricing_snapshot:{price_per_cbm:600,sea_price_per_kg:1.5,sea_charge_rule:'higher_of_weight_volume'}};state.page='fee';state.order.record=o;render()`);
 const details=document.querySelector('[data-combined-fees]');
 for(const text of ['体积费与重量费取高','0.200000 m³','¥600.00/m³','¥1.50/kg','按体积计算','¥120.00','按重量计算','¥150.00','¥198.00'])assert.ok(details.textContent.includes(text),text);
 details.setAttribute('open','');run('render()');assert.equal(document.querySelector('[data-combined-fees]').hasAttribute('open'),true);
});
test('warehouse pending is hierarchical by customer, not order or parcel count',()=>{
 const {run,document}=setup();run(`combined.pending=[{member_no:'TEST-A',merchant_id:'a',parcel_count:2,parcels:[{id:'p1',tracking_no:'P1'},{id:'p2',tracking_no:'P2'}]},{member_no:'TEST-B',merchant_id:'b',parcel_count:1,parcels:[{id:'p3',tracking_no:'P3'}]}]`);
 document.querySelector('#content').innerHTML=run('combinedPending()');
 assert.equal(document.querySelectorAll('details.customer-group').length,2);assert.equal(document.querySelectorAll('[data-combined-receive]').length,3);assert.match(document.querySelector('h2').textContent,/2/);
});
test('warehouse shows one actionable next step and ships after payment without second pack or bill',()=>{
 const {run}=setup();run(`state.role='warehouse';o.order_parcels=[{parcels:{id:'p',received_at:null}}]`);assert.doesNotMatch(run('combinedWarehouseActions(o)'),/id="combinedPack"/);
 run(`o.order_parcels[0].parcels.received_at='now'`);assert.match(run('combinedWarehouseActions(o)'),/id="combinedPack"/);
 run(`o.packed_at='now';o.status='measuring'`);assert.match(run('combinedWarehouseActions(o)'),/id="combinedQuote"/);
 run(`o.status='awaiting_payment'`);assert.doesNotMatch(run('combinedWarehouseActions(o)'),/id="combinedAdvance"/);
 run(`o.status='ready_to_ship'`);assert.match(run('combinedWarehouseActions(o)'),/data-action="head_ship"/);assert.doesNotMatch(run('combinedWarehouseActions(o)'),/combinedPack/);
 run(`o.status='shipped';o.overseas_received_at='now'`);assert.match(run('combinedWarehouseActions(o)'),/data-action="tail_ship"/);
 run(`o.tail_shipped_at='now'`);assert.match(run('combinedWarehouseActions(o)'),/data-action="delivered"/);
});
test('support contacts test flag and both staff replies are visible; raw content is escaped and untranslated',()=>{
 const {run,document}=setup();run(`workspace.tickets=[{id:'t',subject:'测试用户标题',message:'<script>test</script>',status:'replied'}];combined.replies=[{ticket_id:'t',actor_role:'warehouse_operator',message:'仓库原文'},{ticket_id:'t',actor_role:'admin',message:'运营原文'}]`);
 document.querySelector('#content').innerHTML=run('combinedSupport()');run('localizeKnownDom()');
 assert.equal(document.querySelectorAll('.support-message').length,2);assert.equal(document.querySelectorAll('#content script').length,0);assert.match(document.querySelector('#content').textContent,/TEST-WECHAT.*TEST-WHATSAPP/s);
 assert.equal(document.querySelector('h3 [data-user-content]').textContent,'测试用户标题');
});
test('localization is idempotent, Chinese above Indonesian, and preserves values and user data',()=>{
 const {run,document}=setup();document.querySelector('#content').innerHTML='<button>我的包裹</button><input value="我的包裹"><p data-user-content>我的包裹</p>';
 run('localizeKnownDom();localizeKnownDom()');assert.equal(document.querySelectorAll('#content [data-i18n]').length,1);
 assert.equal(document.querySelector('#content [lang=zh-CN]').textContent,'我的包裹');assert.equal(document.querySelector('#content [lang=id]').textContent,'Paket saya');assert.equal(document.querySelector('#content input').value,'我的包裹');assert.equal(document.querySelector('#content p').textContent,'我的包裹');
});

test('all new role views, receipt states, login and signup text have Indonesian translations',()=>{
 assert.deepEqual(require('../dev/audit-combined-locale.cjs')(),[]);
});

test('Indonesia arrival completes head step; tail dispatch advances to signature without another payment',()=>{
 const {run,document}=setup();run(`o.status='shipped';o.overseas_received_at='now'`);
 document.querySelector('#content').innerHTML=run('combinedDetail(o)');
 assert.match(document.querySelector('.combined-steps .current').textContent,/尾程派送/);
 run(`o.tail_shipped_at='now'`);document.querySelector('#content').innerHTML=run('combinedDetail(o)');
 assert.match(document.querySelector('.combined-steps .current').textContent,/签收/);
 assert.equal(document.querySelectorAll('#paymentReceiptForm').length,0);
});

test('missing combined migration prevents customers from submitting legacy order forms',()=>{
 const {run,document}=setup();run(`combined.ready=false;combined.error='missing migration';state.page='packing-request';render()`);
 assert.match(document.querySelector('#content').textContent,/combined-delivery/);
 assert.equal(document.querySelectorAll('#content form').length,0);
});

test('combined writes block duplicate submit and navigation until refreshed; failed refresh reports uncertainty',async()=>{
 const {run,document}=setup();
 document.querySelector('#content').innerHTML='<form id="save"><button>Save</button></form>';
 run(`let finishWrite,writeCount=0,notices=[];toast=m=>notices.push(m);refreshDbState=async()=>false;let firstWrite=combinedSave(document.querySelector('#save'),()=>{writeCount++;return new Promise(resolve=>finishWrite=resolve)})`);
 await run(`combinedSave(document.querySelector('#save'),()=>{writeCount++})`);
 assert.equal(run('writeCount'),1);assert.equal(run(`go('orders',{role:'merchant'})`),false);
 assert.equal(document.querySelector('#save button').disabled,true);
 run('finishWrite()');await run('firstWrite');
 assert.equal(run('combined.busy'),false);assert.equal(document.querySelector('#save button').disabled,false);
 assert.ok(run(`notices.some(n=>n.includes('刷新失败'))`));assert.ok(!run(`notices.includes('操作已保存')`));
});

test('warehouse can receive consecutive parcels after each refresh replaces the pending customer buttons',async()=>{
 const {run,document}=setup();
 run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='dashboard';state.dbOrders=[];
 combined.pending=[{merchant_id:'m',member_no:'TEST-MERCHANT',parcel_count:3,parcels:[{id:'p1',tracking_no:'TEST-1'},{id:'p2',tracking_no:'TEST-2'},{id:'p3',tracking_no:'TEST-3'}]}];
 let received=[];rpcWorkspace=async(name,args)=>{received.push(args.p_parcel_id);const c=combined.pending[0];c.parcels=c.parcels.filter(p=>p.id!==args.p_parcel_id);c.parcel_count=c.parcels.length;if(!c.parcel_count)combined.pending=[]};
 refreshDbState=async()=>{render();return true};render()`);
 document.querySelector('details.customer-group').setAttribute('open','');
 for(const id of ['p1','p2','p3']){
  const button=document.querySelector('[data-combined-receive="'+id+'"]');
  assert.equal(button.disabled,false,'remaining receive button must be usable without manual refresh');
  await button.onclick();assert.equal(run('combined.busy'),false);
  if(id!=='p3')assert.equal(document.querySelector('details.customer-group').hasAttribute('open'),true);
 }
 assert.deepEqual(Array.from(run('received')),['p1','p2','p3']);
 assert.equal(document.querySelectorAll('[data-combined-receive]').length,0);
});

test('releasing a save lock never enables buttons disabled by business rules',async()=>{
 const {run,document}=setup();
 document.querySelector('#content').innerHTML='<form id="save"><button id="allowed">Save</button><button id="unavailable" disabled>Unavailable</button></form>';
 run('refreshDbState=async()=>false');
 await run(`combinedSave(document.querySelector('#save'),async()=>{})`);
 assert.equal(document.querySelector('#allowed').disabled,false);
 assert.equal(document.querySelector('#unavailable').disabled,true);
});
