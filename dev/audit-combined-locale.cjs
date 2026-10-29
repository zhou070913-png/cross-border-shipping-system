const setup=require('./combined-ui-harness.cjs');
function audit(){
 const {run,document}=setup(),missing=new Set();
 const inspect=(html,label)=>{
  document.querySelector('#content').innerHTML=html;run('localizeKnownDom()');
  const walk=document.createTreeWalker(document.querySelector('#content'),4);
  while(walk.nextNode()){
   const n=walk.currentNode,t=n.textContent.trim();
   if(n.nodeType===3&&/[\u4e00-\u9fff]/.test(t)&&!n.parentElement.closest('[data-i18n],[data-user-content],script,style,input,textarea,option'))missing.add(label+': '+t);
  }
  for(const language of ['en','id']){
   run(`setUiLanguage('${language}')`);
   for(const el of document.querySelectorAll('#content [data-i18n]')){
    if(language==='en'&&!el.dataset.en)missing.add(label+' missing English: '+el.dataset.zh);
    if(/[\u4e00-\u9fff]/.test(el.textContent))missing.add(label+' '+language+': '+el.textContent);
   }
   for(const el of document.querySelectorAll('#content [placeholder],#content [aria-label],#content option')){
    if(el.closest('[data-user-content],[data-language-control]'))continue;
    const text=el.tagName==='OPTION'?el.textContent:(el.getAttribute('placeholder')||el.getAttribute('aria-label'));
    if(/[\u4e00-\u9fff]/.test(text))missing.add(label+' '+language+' attribute/option: '+text);
   }
  }
  run("setUiLanguage('zh')");
 };
 run(`paymentWorkspace.account={id:'a',mode:'test',bank_name:'TEST-BANK',account_holder:'TEST-OWNER',account_number:'TEST-NOT-A-BANK',currency:'CNY',is_active:true,updated_at:'v1'};o.status='awaiting_payment';o.fees=[{shipping_fee:60,handling_fee:18,last_mile_fee:30,total_amount:108,confirmed_at:'now',fee_breakdown_version:2}];`);
 for(const role of ['merchant','warehouse','admin']){
  run(`state.auth.loginTargetRole='${role}';state.auth.pendingRole='${role}'`);inspect(run('loginPage()'),role+' login');
  for(const mode of ['login','signup']){run(`state.auth.mode='${mode}';updateAuthMode()`);inspect(document.querySelector('#authModal').innerHTML,role+' '+mode)}
 }
 run(`state.role='merchant';workspace.parcels=[{id:'p',status:'pre_advised',tracking_no:'TEST-PARCEL',item_name:'用户原文'}];workspace.editParcelId='p';state.events=[{title:'合包实测已保存',desc:'头程预估已更新，尾程费用待仓库复核',time:'10/28 16:00'}]`);
 for(const expr of ['combinedDashboard()','combinedAdvice()','combinedAdvice(true)','combinedParcelList()','combinedPackingRequest()','combinedOrderList()','combinedCalculator()','combinedAddresses()','combinedProfile()','merchantAddress()','combinedDetail(o)','combinedSupport()','adminReceivingConfig()','adminPaymentReview()','combinedConfig()','adminAudit()','combinedAccounts()'])inspect(run(expr),expr);
 run(`state.role='warehouse';combined.pending=[{merchant_id:'m',member_no:'TEST-MERCHANT',parcel_count:1,parcels:[{id:'p',tracking_no:'TEST-PARCEL',item_name:'原文商品'}]}]`);
 run(`workspace.parcels=[{id:'p',merchant_id:'m',tracking_no:'TEST-PARCEL',item_name:'原文商品',status:'pre_advised'}];combined.inboundCustomer='m'`);
 for(const expr of ['combinedWarehouseDashboard()','combinedPending()','combinedInboundCustomers()','combinedInboundCustomerDetail()','combinedSupport()','combinedDetail(o)'])inspect(run(expr),expr);
 run(`state.role='admin';paymentWorkspace.receipts=[{id:'r',order_id:'o',amount:108,currency:'CNY',is_test:true,status:'pending',account_snapshot:paymentWorkspace.account,transferred_at:'2026-10-28',created_at:'2026-10-28',payer_name:'TEST'}];paymentWorkspace.selected='r'`);
 for(const status of ['pending','approved','rejected']){run(`paymentWorkspace.receipts[0].status='${status}';paymentWorkspace.receipts[0].reviewed_at='2026-10-28'`);inspect(run('adminPaymentReview()'),'review '+status)}
 for(const role of ['warehouse','admin']){
  run(`state.role='${role}';state.auth.role='${role==='warehouse'?'warehouse_operator':'admin'}';workspace.tickets=[{id:'t',merchant_id:'m',subject:'USER',message:'USER',status:'open'}]`);
  for(const page of role==='warehouse'?['confirm','ship','support-warehouse']:['orders','payment-review','support-admin']){
   run(`state.page='${page}';staffCustomerState().customer=null`);inspect(run('staffCustomerView(state.page)'),role+' '+page+' directory');
   run(`staffCustomerState().customer='m';paymentWorkspace.selected='r'`);inspect(run('staffCustomerView(state.page)'),role+' '+page+' detail');
  }
  inspect(run('staffCustomerDashboard()'),role+' customer dashboard');
 }
 for(const role of ['merchant','warehouse','admin'])for(const stage of ['submitted','warehouse_received','measuring','awaiting_payment','ready_to_ship','shipped','delivered']){
  run(`state.role='${role}';o.status='${stage}';o.route_name='印尼海运普货';o.packed_at=['submitted','warehouse_received'].includes(o.status)?null:'now';o.order_parcels=[{parcels:{id:'p',received_at:'now'}}];o.packed_boxes=[{weight:2,length:20,width:20,height:20}];o.overseas_received_at=o.status==='delivered'?'now':null;o.tail_shipped_at=o.status==='delivered'?'now':null;`);
  inspect(run('combinedDetail(o)'),role+' order '+stage);
 }
 return [...missing];
}
module.exports=audit;
if(require.main===module){const missing=audit();console.log(JSON.stringify(missing,null,2));if(missing.length)process.exitCode=1}
