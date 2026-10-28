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
test('compact merchant home keeps four prominent working shortcuts and moves details into parcel and order entries',()=>{
 const {run,document}=setup();run(`workspace.parcels=[{id:'p',tracking_no:'TEST-PARCEL',item_name:'测试包裹',status:'pre_advised'}];state.page='dashboard';render()`);
 assert.equal(document.querySelectorAll('.combined-shortcuts [data-page]').length,4);assert.equal(document.querySelectorAll('[data-combined-filter]').length,0);assert.equal(document.querySelectorAll('.combined-order-row').length,0);
 assert.equal(document.querySelectorAll('[data-page="pre-advise"]').length,1);assert.ok(document.querySelector('.combined-shortcut-primary[data-page="pre-advise"]'));
 assert.match(document.querySelector('.combined-home-entry[data-page="parcels"]').textContent,/1 个包裹/);assert.match(document.querySelector('.combined-home-entry[data-page="orders"]').textContent,/1 个订单/);
 for(const page of ['pre-advise','parcels','orders','tracking-list']){
  run(`state.page='dashboard';render()`);document.querySelector('.combined-shortcuts [data-page="'+page+'"]').onclick();assert.equal(run('state.page'),page);
 }
 for(const page of ['parcels','orders']){
  run(`state.page='dashboard';combined.filter='paid';render()`);document.querySelector('.combined-home-entry[data-page="'+page+'"]').onclick();assert.equal(run('state.page'),page);assert.equal(run('combined.filter'),'all');
 }
 assert.equal(run('workspace.parcels.length'),1);assert.equal(run('state.dbOrders.length'),1);
});
test('order list retains waiting shipment between payment and transport after homepage simplification',()=>{
 const {run,document}=setup();
 run(`state.dbOrders=['measuring','awaiting_payment','paid','ready_to_ship','shipped','delivered'].map((status,n)=>({...o,id:'o'+n,order_no:'TEST-STAGE-'+status,status}));state.page='orders';render()`);
 const paid=document.querySelector('[data-combined-filter="paid"]');assert.ok(paid);assert.match(paid.textContent,/待出货/);
 const filters=[...document.querySelectorAll('[data-combined-filter]')].map(b=>b.dataset.combinedFilter);
 assert.equal(filters.indexOf('paid'),filters.indexOf('awaiting_payment')+1);assert.equal(filters.indexOf('shipped'),filters.indexOf('paid')+1);
 paid.onclick();assert.equal(run('state.page'),'orders');assert.equal(run('combined.filter'),'paid');assert.equal(document.querySelectorAll('[data-combined-order-row]').length,2);
 const text=document.querySelector('.combined-order-table').textContent;assert.match(text,/TEST-STAGE-paid/);assert.match(text,/TEST-STAGE-ready_to_ship/);assert.doesNotMatch(text,/TEST-STAGE-awaiting_payment|TEST-STAGE-shipped/);
 run(`state.dbOrders[2].status='shipped';render()`);assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);
 document.querySelector('[data-combined-filter="shipped"]').onclick();assert.equal(document.querySelectorAll('[data-combined-order-row]').length,2);
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
test('merchant order pagination searches the entire result set, combines status filters and clamps shrinking pages',()=>{
 const {run,document}=setup();run(`state.dbOrders=Array.from({length:25},(_,n)=>({...o,id:'o'+n,order_no:'ORDER-'+String(n+1).padStart(3,'0'),recipient_name:n%2?'Beta':'Alpha',status:n%2?'awaiting_payment':'ready_to_ship'}));state.page='orders';render()`);
 assert.equal(document.querySelectorAll('[data-combined-order-row]').length,10);assert.match(document.querySelector('.pagination-summary').textContent,/共 25 个订单.*1–10.*1 \/ 3/s);
 document.querySelector('[data-combined-order-page="2"]').onclick();assert.equal(document.querySelector('[data-combined-order-row]').dataset.combinedOrderRow,'o10');
 document.querySelector('#orderSearchText').value='ORDER-025';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});
 assert.equal(run('combined.orderPage'),1);assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);assert.match(document.querySelector('tbody').textContent,/ORDER-025/);
 document.querySelector('#combinedOrderReset').onclick();const size=document.querySelector('#combinedOrderPageSize');size.querySelector('option[value="20"]').selected=true;size.onchange();assert.equal(document.querySelectorAll('[data-combined-order-row]').length,20);
 document.querySelector('[data-combined-order-page="2"]').onclick();assert.equal(document.querySelectorAll('[data-combined-order-row]').length,5);
 document.querySelector('#orderSearchText').value='Alpha';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});document.querySelector('[data-combined-filter="paid"]').onclick();
 assert.equal(run('workspace.orderQuery'),'Alpha');assert.equal(document.querySelectorAll('[data-combined-order-row]').length,13);
 document.querySelector('#orderSearchText').value='NOT-FOUND';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-combined-order-row]').length,0);assert.match(document.querySelector('tbody').textContent,/没有匹配的订单/);assert.match(document.querySelector('.pagination-summary').textContent,/0–0.*1 \/ 1/s);
 run(`workspace.orderQuery='';combined.filter='all';combined.orderPageSize=10;combined.orderPage=3;state.dbOrders=state.dbOrders.slice(0,2);render()`);assert.equal(run('combined.orderPage'),1);assert.equal(document.querySelectorAll('[data-combined-order-row]').length,2);
 run(`state.dbOrders[1].tail_tracking_no='TAIL-SEARCH-ONLY';workspace.orderQuery='TAIL-SEARCH-ONLY';render()`);assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);assert.equal(document.querySelector('[data-combined-order-row]').dataset.combinedOrderRow,'o1');
});
test('paged order details open the selected order and return to the same page and search',async()=>{
 const {run,document}=setup();run(`window.MospaceSupabase.orderTracking=async()=>[];state.dbOrders=Array.from({length:15},(_,n)=>({...o,id:'o'+n,order_no:'RETURN-'+n}));state.page='orders';workspace.orderQuery='RETURN-';combined.orderPage=2;render()`);
 await document.querySelector('[data-combined-order-row="o12"] [data-combined-open]').onclick();
 assert.equal(run('state.page'),'fee');assert.equal(run('state.order.record.id'),'o12');assert.match(document.querySelector('.combined-summary').textContent,/RETURN-12/);
 document.querySelector('[data-combined-back-orders]').onclick();assert.equal(run('state.page'),'orders');assert.equal(run('combined.orderPage'),2);assert.equal(run('workspace.orderQuery'),'RETURN-');assert.equal(document.querySelector('[data-combined-order-row]').dataset.combinedOrderRow,'o10');
});
test('order table preserves pending fees, actual zero tail, historical navigation and escapes user content',()=>{
 const {run,document}=setup();run(`o.recipient_name='<img src=x onerror=alert(1)>';o.destination_address='"<script>unsafe</script>';state.page='orders';render()`);
 assert.match(document.querySelector('tbody').textContent,/待复核费用/);assert.doesNotMatch(document.querySelector('tbody').textContent,/¥0\.00/);assert.equal(document.querySelectorAll('tbody img,tbody script').length,0);
 run(`o.fees[0]={shipping_fee:60,handling_fee:18,last_mile_fee:0,total_amount:78,confirmed_at:'now'};render()`);assert.match(document.querySelector('tbody').textContent,/¥78\.00/);assert.match(document.querySelector('tbody').textContent,/¥0\.00/);
 run(`state.dbOrders=[{...o,id:'legacy',fulfillment_mode:null}];render()`);assert.ok(document.querySelector('[data-overall-order="legacy"]'));assert.match(document.querySelector('tbody').textContent,/历史订单/);
});
test('warehouse consolidation table filters in place, summarizes all matching pages and preserves query when returning from detail',async()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='confirm';window.MospaceSupabase.orderTracking=async()=>[];state.dbOrders=Array.from({length:25},(_,n)=>({...o,id:'w'+n,order_no:'WAREHOUSE-'+n,recipient_name:'Recipient',parcel_count:2,status:n%2?'awaiting_payment':'measuring',packed_at:'2026-10-28',packed_boxes:[{weight:2}],fees:n%2?[{shipping_fee:60,handling_fee:18,last_mile_fee:0,total_amount:78,actual_weight_kg:2,confirmed_at:'now'}]:[{shipping_fee:60,handling_fee:18,last_mile_fee:null,total_amount:null,actual_weight_kg:2}]}));render()`);
 assert.match(document.querySelector('h1').textContent,/合包与费用复核/);assert.equal(document.querySelectorAll('.combined-order-row').length,0);assert.equal(document.querySelectorAll('[data-combined-order-row]').length,10);
 const summary=document.querySelector('.combined-order-stats').textContent;assert.match(summary,/25 个订单.*50 个包裹.*¥936\.00.*13 单待核价/);
 document.querySelector('[data-combined-order-page="2"]').onclick();assert.equal(document.querySelector('.combined-order-stats').textContent,summary);
 document.querySelector('#orderSearchText').value='WAREHOUSE-';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});document.querySelector('[data-combined-filter="pending"]').onclick();assert.equal(run('state.page'),'confirm');assert.equal(run('workspace.orderQuery'),'WAREHOUSE-');assert.equal(document.querySelectorAll('[data-combined-order-row]').length,10);assert.match(document.querySelector('[data-combined-filter="pending"]').textContent,/13 单/);
 document.querySelector('[data-combined-order-page="2"]').onclick();await document.querySelector('[data-combined-order-row="w22"] [data-combined-open]').onclick();assert.ok(document.querySelector('#combinedQuote'));
 document.querySelector('[data-combined-back-warehouse]').onclick();assert.equal(run('state.page'),'confirm');assert.equal(run('combined.orderPage'),2);assert.equal(run('combined.warehouseFilter'),'pending');assert.equal(document.querySelector('#orderSearchText').value,'WAREHOUSE-');
 run(`state.dbOrders[22].status='awaiting_payment';render()`);assert.match(document.querySelector('.combined-order-stats').textContent,/12 个订单/);
 document.querySelector('#combinedOrderReset').onclick();assert.equal(run('combined.warehouseFilter'),'all');assert.equal(run('combined.orderPage'),1);
});
test('warehouse shipping table exposes correct next steps, searches waybills and opens the selected shipment',async()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='ship';window.MospaceSupabase.orderTracking=async()=>[];state.dbOrders=[{...o,id:'paid',status:'ready_to_ship'},{...o,id:'head',status:'shipped',shipment_tracking_no:'HEAD-TRACK',shipment_carrier:'<img src=x>'},{...o,id:'overseas',status:'shipped',overseas_received_at:'now'},{...o,id:'tail',status:'shipped',overseas_received_at:'now',tail_shipped_at:'now',tail_tracking_no:'TAIL-TRACK'},{...o,id:'delivered',status:'delivered'}];render()`);
 assert.match(document.querySelector('h1').textContent,/出货与物流/);
 for(const [id,label]of [['paid','登记出货'],['head','登记印尼到仓'],['overseas','登记尾程快递'],['tail','登记签收'],['delivered','查看订单']])assert.match(document.querySelector('[data-combined-open="'+id+'"]').textContent,new RegExp(label));
 assert.match(document.querySelector('tbody').textContent,/HEAD-TRACK/);assert.match(document.querySelector('tbody').textContent,/TAIL-TRACK/);assert.equal(document.querySelectorAll('tbody img').length,0);
 document.querySelector('#orderSearchText').value='TAIL-TRACK';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});document.querySelector('[data-combined-filter="shipped"]').onclick();assert.equal(run('state.page'),'ship');assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);assert.match(document.querySelector('[data-combined-filter="all"]').textContent,/1 单/);
 await document.querySelector('[data-combined-open="tail"]').onclick();assert.equal(document.querySelector('#combinedAdvance').dataset.action,'delivered');document.querySelector('[data-combined-back-warehouse]').onclick();assert.equal(run('state.page'),'ship');assert.equal(document.querySelector('#orderSearchText').value,'TAIL-TRACK');
 document.querySelector('#orderSearchText').value='MISSING';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-combined-order-row]').length,0);assert.match(document.querySelector('.combined-order-stats').textContent,/0 个订单/);assert.doesNotMatch(document.querySelector('tbody').textContent,/我的包裹/);
});
test('warehouse status counts include historical orders and amount summaries do not double count child legs',()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='ship';const head={...o,id:'legacy-head',order_no:'LEGACY-HEAD',fulfillment_mode:null,status:'shipped',parcel_count:2,fees:[{total_amount:78,confirmed_at:'now'}]};state.dbOrders=[head,{...head,id:'legacy-tail',order_no:'LEGACY-TAIL',parent_order_id:'legacy-head',transport_leg:'last_mile',parcel_count:2}, {...o,id:'completed',status:'delivered',parcel_count:1,fees:[{total_amount:22,confirmed_at:'now'}]}];render()`);
 assert.match(document.querySelector('[data-combined-filter="all"]').textContent,/2 单/);assert.match(document.querySelector('[data-combined-filter="shipped"]').textContent,/1 单/);assert.match(document.querySelector('.combined-order-stats').textContent,/2 个订单.*3 个包裹.*¥100\.00/);
 document.querySelector('[data-combined-filter="shipped"]').onclick();assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);assert.ok(document.querySelector('[data-overall-order="legacy-head"]'));
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
test('warehouse receipt history retains received parcels through shipment and delivery, with search and pagination',async()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='inbound';workspace.parcels=Array.from({length:22},(_,n)=>({id:'receipt-'+n,merchant_id:'m',tracking_no:'RECEIPT-'+n,item_name:n===21?'<img src=x>':'TEST item',received_at:new Date(Date.UTC(2026,9,28,0,n)).toISOString(),status:'received'}));workspace.parcels.push({id:'not-received',merchant_id:'m',tracking_no:'PENDING',status:'pre_advised'});o.order_parcels=[{parcel_id:'receipt-0',parcels:workspace.parcels[0]}];o.status='shipped';window.MospaceSupabase.orderTracking=async()=>[];render()`);
 document.querySelector('[data-combined-customer="m"]').onclick();assert.match(document.querySelector('#content').textContent,/当前没有待收货包裹/);
 document.querySelector('[data-combined-inbound-tab="received"]').onclick();assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,10);assert.match(document.querySelector('#content').textContent,/共 22 条记录/);assert.equal(document.querySelectorAll('tbody img').length,0);
 document.querySelector('[data-combined-receipt-page="2"]').onclick();assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,10);
 document.querySelector('#combinedReceiptQuery').value='TEST-ORDER';document.querySelector('#combinedReceiptSearch').onsubmit({preventDefault(){}});assert.equal(run('combined.receiptPage'),1);assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,1);assert.match(document.querySelector('tbody').textContent,/头程运输中/);
 await document.querySelector('[data-combined-open="o"]').onclick();const back=document.querySelector('#content [data-page="inbound"]');assert.match(back.textContent,/返回客户详情/);back.onclick();assert.equal(run('state.page'),'inbound');assert.equal(document.querySelector('#combinedReceiptQuery').value,'TEST-ORDER');
 run(`o.status='delivered';render()`);assert.match(document.querySelector('tbody').textContent,/已签收/);
 document.querySelector('#combinedReceiptReset').onclick();assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,10);
 run(`combined.receiptPage=3;workspace.parcels=workspace.parcels.slice(0,1);render()`);assert.equal(run('combined.receiptPage'),1);
 run(`workspace.errors.parcels='failed';render()`);assert.match(document.querySelector('#content').textContent,/收货记录读取失败/);assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,0);
});
test('confirming receipt moves the parcel from pending to retained history without a page reload',async()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='inbound';workspace.parcels=[{id:'received-now',merchant_id:'m',tracking_no:'NEW-RECEIPT',item_name:'TEST',status:'pre_advised'}];combined.pending=[{member_no:'M-TEST',merchant_id:'m',parcel_count:1,parcels:workspace.parcels}];rpcWorkspace=async()=>{workspace.parcels[0].received_at='2026-10-28T00:00:00Z';workspace.parcels[0].status='received';combined.pending=[]};refreshDbState=async()=>{render();return true};render()`);
 document.querySelector('[data-combined-customer="m"]').onclick();await document.querySelector('[data-combined-receive]').onclick();assert.equal(document.querySelectorAll('[data-combined-receive]').length,0);
 document.querySelector('[data-combined-inbound-tab="received"]').onclick();assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,1);assert.match(document.querySelector('tbody').textContent,/NEW-RECEIPT/);
});
test('receiving starts with customers and drills into only that merchant parcels, orders and fees',async()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='inbound';window.MospaceSupabase.orderTracking=async()=>[];
 combined.customers=[{merchant_id:'a',member_no:'M-A',display_name:'客户A'},{merchant_id:'b',member_no:'M-B',display_name:'客户B'}];
 workspace.parcels=[{id:'a1',merchant_id:'a',tracking_no:'A-PENDING',status:'pre_advised'},{id:'a2',merchant_id:'a',tracking_no:'A-RECEIVED',status:'received',received_at:'2026-10-28T01:00:00Z'},{id:'b1',merchant_id:'b',tracking_no:'B-RECEIVED',status:'received',received_at:'2026-10-28T02:00:00Z'}];
 combined.pending=[{merchant_id:'a',member_no:'M-A',parcel_count:1,parcels:[workspace.parcels[0]]}];state.dbOrders=[{...o,id:'oa',merchant_id:'a',order_no:'ORDER-A',fees:[{total_amount:108,confirmed_at:'now'}],order_parcels:[{parcel_id:'a2',parcels:workspace.parcels[1]}]},{...o,id:'ob',merchant_id:'b',order_no:'ORDER-B',fees:[{total_amount:999,confirmed_at:'now'}],order_parcels:[{parcel_id:'b1',parcels:workspace.parcels[2]}]}];render()`);
 assert.equal(document.querySelectorAll('[data-combined-customer-row]').length,2);assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,0);assert.equal(document.querySelectorAll('[data-combined-receive]').length,0);
 document.querySelector('#combinedCustomerQuery').value='A-RECEIVED';document.querySelector('#combinedCustomerSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-combined-customer-row]').length,1);
 document.querySelector('[data-combined-customer="a"]').onclick();assert.match(document.querySelector('#content').textContent,/客户A/);assert.match(document.querySelector('.combined-customer-summary').textContent,/待收货 1.*已收货 1.*¥108\.00/s);assert.doesNotMatch(document.querySelector('#content').textContent,/B-RECEIVED|ORDER-B|¥999/);
 document.querySelector('[data-combined-inbound-tab="received"]').onclick();assert.equal(document.querySelectorAll('[data-combined-received-parcel]').length,1);assert.match(document.querySelector('tbody').textContent,/A-RECEIVED/);
 document.querySelector('[data-combined-inbound-tab="orders"]').onclick();assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);await document.querySelector('[data-combined-open="oa"]').onclick();document.querySelector('#content [data-page="inbound"]').onclick();assert.equal(run('combined.inboundCustomer'),'a');assert.equal(run('combined.inboundTab'),'orders');
 document.querySelector('[data-combined-customers-back]').onclick();assert.equal(run('combined.inboundCustomer'),null);assert.equal(document.querySelector('#combinedCustomerQuery').value,'A-RECEIVED');
 document.querySelector('#combinedCustomerReset').onclick();document.querySelector('[data-combined-customer="b"]').onclick();document.querySelector('[data-combined-inbound-tab="received"]').onclick();assert.match(document.querySelector('tbody').textContent,/B-RECEIVED/);assert.doesNotMatch(document.querySelector('tbody').textContent,/A-RECEIVED/);
});
test('customer list paginates, clamps results and uses merchant identity rather than consumer recipient',()=>{
 const {run,document}=setup();run(`state.role='warehouse';state.auth.role='warehouse_operator';state.page='inbound';state.dbOrders=Array.from({length:23},(_,n)=>({...o,id:'ord-'+n,merchant_id:'merchant-'+n,recipient_name:'same consumer'}));render()`);
 assert.equal(document.querySelectorAll('[data-combined-customer-row]').length,10);document.querySelector('[data-combined-customer-page="2"]').onclick();document.querySelector('[data-combined-customer-page="3"]').onclick();assert.equal(document.querySelectorAll('[data-combined-customer-row]').length,3);
 run(`state.dbOrders=state.dbOrders.slice(0,1);render()`);assert.equal(run('combined.customerPage'),1);assert.equal(document.querySelectorAll('[data-combined-customer-row]').length,1);
});
test('private proof sources accept isolated local raster images without allowing other data URLs or external signed links',()=>{
 const {run}=setup();run(`window.location={origin:'http://127.0.0.1:4175'};window.MospaceSupabase.isLocalPreview=true`);
 assert.equal(run(`paymentProofSource('data:image/png;base64,aGVsbG8=')`),'data:image/png;base64,aGVsbG8=');
 for(const source of ['data:image/svg+xml;base64,aGVsbG8=','javascript:alert(1)','https://evil.example/proof.png'])assert.throws(()=>run(`paymentProofSource(${JSON.stringify(source)})`));
 run(`window.MospaceSupabase.isLocalPreview=false;window.MospaceSupabase.config={url:'https://project.supabase.co'}`);
 assert.throws(()=>run(`paymentProofSource('data:image/png;base64,aGVsbG8=')`));
 assert.equal(run(`paymentProofSource('https://project.supabase.co/storage/v1/object/sign/payment-proofs/m/o/image.png?token=TEST')`),'https://project.supabase.co/storage/v1/object/sign/payment-proofs/m/o/image.png?token=TEST');
 for(const source of ['https://evil.example/storage/v1/object/sign/payment-proofs/proof.png','http://project.supabase.co/storage/v1/object/sign/payment-proofs/proof.png','https://project.supabase.co/public/proof.png'])assert.throws(()=>run(`paymentProofSource(${JSON.stringify(source)})`));
});
test('payment proof opens an image dialog and ignores stale responses after role changes',async()=>{
 const {run,document}=setup();run(`window.location={origin:'http://127.0.0.1:4175'};window.MospaceSupabase.isLocalPreview=true;paymentWorkspace.receipts=[{id:'r',object_path:'m/o/image.png',is_test:true}];document.defaultView.HTMLElement.prototype.showModal=function(){this.setAttribute('open','')};document.defaultView.HTMLElement.prototype.close=function(){this.remove()};window.MospaceSupabase.getClient=()=>({storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'data:image/png;base64,aGVsbG8='},error:null})})}});`);
 await run(`showPaymentProof('r')`);assert.equal(document.querySelector('#paymentProofDialog img').getAttribute('src'),'data:image/png;base64,aGVsbG8=');assert.ok(document.querySelector('#paymentProofDialog').hasAttribute('open'));document.querySelector('#paymentProofDialog button').onclick();assert.equal(document.querySelector('#paymentProofDialog'),null);
 run(`window.MospaceSupabase.getClient=()=>({storage:{from:()=>({createSignedUrl:()=>new Promise(resolve=>{resolveProof=resolve})})}});pendingProof=showPaymentProof('r');state.role='warehouse';resolveProof({data:{signedUrl:'data:image/png;base64,aGVsbG8='}})`);await run('pendingProof');assert.equal(document.querySelector('#paymentProofDialog'),null);
});
test('admin dashboard and order detail open the exact receipt review and return to admin orders',()=>{
 const {run,document}=setup();
 run(`state.role='admin';state.auth.role='admin';state.page='dashboard';o.status='awaiting_payment';o.fees[0]={shipping_fee:60,handling_fee:18,last_mile_fee:30,total_amount:108,confirmed_at:'now'};paymentWorkspace.selected='other';paymentWorkspace.filter='approved';paymentWorkspace.receipts=[{id:'other',order_id:'other-order',status:'approved',amount:999,created_at:'2026-10-28T01:00:00Z'},{id:'old',order_id:'o',status:'rejected',amount:108,created_at:'2026-10-28T02:00:00Z'},{id:'current',order_id:'o',status:'pending',amount:108,currency:'CNY',is_test:true,payer_name:'TEST',created_at:'2026-10-28T03:00:00Z'}];render()`);
 const entry=document.querySelector('[data-combined-review="o"]');assert.ok(entry);entry.onclick();
 assert.equal(run('state.page'),'payment-review');assert.equal(run('paymentWorkspace.selected'),'current');assert.equal(run('paymentWorkspace.filter'),'pending');
 assert.equal(document.querySelector('#paymentReviewForm').dataset.receiptId,'current');assert.match(document.querySelector('#paymentReviewDetail h3').textContent,/TEST-ORDER/);
 run(`state.page='overall-order';state.order.record=o;render()`);
 assert.ok(document.querySelector('[data-combined-review="o"]'));
 document.querySelector('[data-page="orders"]').onclick();assert.equal(run('state.page'),'orders');assert.equal(run('state.role'),'admin');
 run(`state.page='overall-order';render()`);document.querySelector('[data-combined-review="o"]').onclick();
 assert.equal(document.querySelector('#paymentReviewForm').dataset.receiptId,'current');
 run(`paymentWorkspace.receipts[2].status='approved';state.page='overall-order';render()`);
 assert.match(document.querySelector('[data-combined-review="o"]').textContent,/查看付款审核记录/);
 document.querySelector('[data-combined-review="o"]').onclick();assert.equal(run('paymentWorkspace.filter'),'approved');assert.equal(document.querySelector('#paymentReviewForm'),null);
});
test('payment review links never grant merchant access or open missing receipts, and preserve selection while saving',()=>{
 const {run,document}=setup();run(`paymentWorkspace.receipts=[{id:'r',order_id:'o',status:'pending'}];state.page='fee';render()`);
 assert.equal(document.querySelector('[data-combined-review]'),null);assert.equal(run(`openPaymentReview('r')`),false);assert.equal(run('state.page'),'fee');
 run(`state.role='admin';state.auth.role='admin';state.page='dashboard';paymentWorkspace.selected=null;paymentWorkspace.filter='all';paymentWorkspace.busy=true`);
 assert.equal(run(`openPaymentReview('r')`),false);assert.equal(run('paymentWorkspace.selected'),null);
 run(`paymentWorkspace.busy=false`);assert.equal(run(`openPaymentReview('missing')`),false);
 run(`combined.busy=true`);assert.equal(run(`openPaymentReview('r')`),false);assert.equal(run('paymentWorkspace.selected'),null);assert.equal(run('paymentWorkspace.filter'),'all');
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

test('fully received combined orders show awaiting packing instead of awaiting receipt',()=>{
 const {run}=setup();run(`o.order_parcels=[{parcel_id:'p',parcels:{id:'p',received_at:'2026-10-28T00:00:00Z'}}]`);assert.equal(run('combinedProgress(o)[1]'),'待合包实测');
 run(`o.order_parcels.push({parcel_id:'q',parcels:{id:'q',received_at:null}})`);assert.equal(run('combinedProgress(o)[1]'),'待收货 / 合包');
});
