const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');
function staff(role='warehouse',page='confirm'){
 const h=setup();h.run(`state.role='${role}';state.auth.role='${role==='warehouse'?'warehouse_operator':'admin'}';state.page='${page}';window.MospaceSupabase.orderTracking=async()=>[];
 combined.customers=[{merchant_id:'a',member_no:'A-001',display_name:'客户A'},{merchant_id:'b',member_no:'B-002',display_name:'客户B'}];
 state.dbOrders=[{...o,id:'a1',merchant_id:'a',order_no:'ORDER-A',recipient_name:'Same recipient',status:'ready_to_ship',fees:[{shipping_fee:60,handling_fee:18,last_mile_fee:30,total_amount:108,confirmed_at:'now'}]},{...o,id:'b1',merchant_id:'b',order_no:'ORDER-B',recipient_name:'Same recipient',status:'shipped',fees:[{total_amount:999,confirmed_at:'now'}]}];render()`);return h;
}
test('warehouse and operations start each customer-facing section with customers, then isolate records',()=>{
 for(const [role,page]of [['warehouse','confirm'],['warehouse','ship'],['admin','orders']]){
  const {run,document}=staff(role,page);
  assert.equal(document.querySelectorAll('[data-staff-customer-row]').length,2);assert.equal(document.querySelectorAll('[data-combined-order-row]').length,0);
  document.querySelector('[data-staff-customer="a"]').onclick();
  assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);assert.match(document.querySelector('tbody').textContent,/ORDER-A/);assert.doesNotMatch(document.querySelector('#content').textContent,/ORDER-B|999/);
  run('render()');assert.equal(document.querySelectorAll('[data-combined-order-row]').length,1);
  document.querySelector('[data-staff-customer-back]').onclick();document.querySelector('[data-staff-customer="b"]').onclick();assert.match(document.querySelector('tbody').textContent,/ORDER-B/);assert.doesNotMatch(document.querySelector('tbody').textContent,/ORDER-A/);
 }
});
test('customer directory filters and searches before pagination, clamps refresh and retains directory position',async()=>{
 const {run,document}=staff();run(`state.dbOrders=Array.from({length:23},(_,n)=>({...o,id:'o'+n,merchant_id:'customer-'+n,order_no:'SEARCH-'+n,status:'ready_to_ship'}));render()`);
 assert.equal(document.querySelectorAll('[data-staff-customer-row]').length,10);
 document.querySelector('[data-staff-customer-page="2"]').onclick();document.querySelector('[data-staff-customer-page="3"]').onclick();assert.equal(document.querySelectorAll('[data-staff-customer-row]').length,3);
 document.querySelector('[data-staff-customer]').onclick();document.querySelector('[data-staff-customer-back]').onclick();assert.match(document.querySelector('.parcel-pagination').textContent,/3 \/ 3/);
 document.querySelector('#staffCustomerQuery').value='SEARCH-22';document.querySelector('#staffCustomerSearch').onsubmit({preventDefault(){}});assert.equal(document.querySelectorAll('[data-staff-customer-row]').length,1);
 document.querySelector('[data-staff-customer-filter="shipped"]').onclick();assert.equal(document.querySelectorAll('[data-staff-customer-row]').length,0);
 document.querySelector('[data-staff-customer-filter="all"]').onclick();document.querySelector('#staffCustomerReset').onclick();
 run(`staffCustomerState().page=3;state.dbOrders=state.dbOrders.slice(0,1);render()`);assert.equal(run('staffCustomerState().page'),1);
});
test('order detail returns to selected customer with independent section search and pagination',async()=>{
 const {run,document}=staff();run(`state.dbOrders=Array.from({length:15},(_,n)=>({...o,id:'a'+n,merchant_id:'a',order_no:'RETURN-'+n,status:'ready_to_ship'}));render()`);
 document.querySelector('[data-staff-customer="a"]').onclick();document.querySelector('#orderSearchText').value='RETURN-';document.querySelector('#orderSearch').onsubmit({preventDefault(){}});document.querySelector('[data-combined-order-page="2"]').onclick();
 await document.querySelector('[data-combined-open="a12"]').onclick();document.querySelector('[data-staff-order-back]').onclick();assert.equal(run('state.page'),'confirm');assert.equal(run('staffCustomerState().customer'),'a');assert.equal(document.querySelector('#orderSearchText').value,'RETURN-');assert.equal(document.querySelector('[data-combined-order-row]').dataset.combinedOrderRow,'a10');
 document.querySelector('#nav [data-page="ship"]').onclick();assert.equal(document.querySelectorAll('[data-combined-order-row]').length,0);document.querySelector('[data-staff-customer="a"]').onclick();assert.equal(document.querySelector('#orderSearchText').value,'');
});
test('payment review scopes counts, selected proof, statuses and direct review links to one customer',()=>{
 const {run,document}=staff('admin','payment-review');run(`paymentWorkspace.account={mode:'test'};paymentWorkspace.receipts=[{id:'ra',order_id:'a1',status:'pending',amount:108,currency:'CNY',is_test:true,created_at:'2026-10-28',account_snapshot:{}},{id:'rb',order_id:'b1',status:'pending',amount:999,currency:'CNY',is_test:true,created_at:'2026-10-28',account_snapshot:{}}];render()`);
 document.querySelector('[data-staff-customer="a"]').onclick();assert.equal(document.querySelectorAll('[data-review-receipt]').length,1);assert.equal(run(`openPaymentReview('rb')`),false);
 document.querySelector('[data-review-receipt="ra"]').onclick();assert.equal(document.querySelector('#paymentReviewForm').dataset.receiptId,'ra');assert.doesNotMatch(document.querySelector('#content').textContent,/ORDER-B|999/);
 run(`paymentWorkspace.selected='rb';render()`);assert.equal(document.querySelector('#paymentReviewDetail'),null);assert.doesNotMatch(document.querySelector('#content').textContent,/ORDER-B|999/);
 document.querySelector('[data-payment-filter="approved"]').onclick();assert.equal(document.querySelectorAll('[data-review-receipt]').length,0);
 document.querySelector('[data-staff-customer-back]').onclick();document.querySelector('[data-staff-customer-filter="all"]').onclick();document.querySelector('[data-staff-customer="b"]').onclick();assert.equal(document.querySelectorAll('[data-review-receipt]').length,1);
});
test('support starts by customer, keeps general enquiries and replies isolated, and config remains reachable without tickets',()=>{
 for(const role of ['warehouse','admin']){
  const {run,document}=staff(role,role==='admin'?'support-admin':'support-warehouse');
  assert.ok(document.querySelector('details'));if(role==='admin')assert.ok(document.querySelector('#combinedContacts'));
  run(`workspace.tickets=[{id:'ta',merchant_id:'a',subject:'QUESTION-A',message:'CUSTOMER-A',status:'open'},{id:'tb',merchant_id:'b',subject:'QUESTION-B',message:'CUSTOMER-B',status:'open'}];combined.replies=[{ticket_id:'ta',actor_role:'admin',message:'REPLY-A'},{ticket_id:'tb',actor_role:'admin',message:'REPLY-B'}];render()`);
  assert.equal(document.querySelectorAll('[data-combined-reply]').length,0);document.querySelector('[data-staff-customer="a"]').onclick();assert.ok(document.querySelector('[data-combined-reply="ta"]'));assert.doesNotMatch(document.querySelector('#content').textContent,/QUESTION-B|CUSTOMER-B|REPLY-B/);
 }
});
test('staff contexts reset across users and customer actions are blocked during saves',()=>{
 const {run,document}=staff();run('combined.busy=true');document.querySelector('[data-staff-customer="a"]').onclick();assert.equal(run('staffCustomerState().customer'),null);
 run('combined.busy=false');document.querySelector('[data-staff-customer="a"]').onclick();run(`staffCustomerState().detailQuery='SECRET';state.auth.user={id:'another'};render()`);assert.equal(run('staffCustomerState().customer'),null);assert.equal(run('staffCustomerState().detailQuery'),'');
});
test('workbench routes into a customer list rather than flat orders',()=>{
 for(const role of ['warehouse','admin']){
  const {run,document}=staff(role,'dashboard');assert.equal(document.querySelectorAll('[data-combined-open]').length,0);
  document.querySelector('[data-staff-section]').onclick();assert.notEqual(run('state.page'),'dashboard');assert.equal(document.querySelectorAll('[data-combined-order-row]').length,0);
 }
});

test('operations can open a historical order under the same customer and return without losing context',async()=>{
 const {run,document}=staff('admin','orders');run(`state.dbOrders[0].fulfillment_mode=null;render()`);document.querySelector('[data-staff-customer="a"]').onclick();await document.querySelector('[data-overall-order="a1"]').onclick();assert.equal(run('state.page'),'overall-order');assert.match(document.querySelector('#content').textContent,/ORDER-A/);assert.doesNotMatch(document.querySelector('#content').textContent,/ORDER-B/);document.querySelector('[data-staff-order-back]').onclick();assert.equal(run('staffCustomerState().customer'),'a');assert.equal(run('state.page'),'orders');
});

test('receiving order navigation does not inherit a previous consolidation return destination',async()=>{
 const {run,document}=staff();document.querySelector('[data-staff-customer="a"]').onclick();await document.querySelector('[data-combined-open="a1"]').onclick();document.querySelector('#nav [data-page="inbound"]').onclick();assert.equal(run('staffCustomers.orderReturn'),null);document.querySelector('[data-combined-customer="a"]').onclick();document.querySelector('[data-combined-inbound-tab="orders"]').onclick();await document.querySelector('[data-combined-open="a1"]').onclick();assert.ok(document.querySelector('[data-page="inbound"]'));assert.equal(document.querySelector('[data-staff-order-back]'),null);
});
