const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function setup(){
 const root=path.join(__dirname,'..'),elements={};
 const context=vm.createContext({console,setTimeout,clearTimeout,URL,Blob,Uint8Array,crypto:require('node:crypto').webcrypto,createImageBitmap:async()=>({close(){}}),window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:s=>elements[s]||{textContent:''},querySelectorAll:()=>[],getElementById:()=>null},localStorage:{getItem:()=>null}});
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 vm.runInContext([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')),context);
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context);
 const run=s=>vm.runInContext(s,context);
 run(`render=()=>{};toast=()=>{};state.auth={user:{id:'m'},role:'merchant'};state.role='merchant';paymentWorkspace.owner='m';state.dbOrders=[{id:'o',merchant_id:'m',order_no:'QA-PAY',status:'awaiting_payment',parcel_count:1,order_parcels:[],fees:[{total_amount:128,shipping_fee:110,handling_fee:18,currency:'CNY',confirmed_at:'2026-10-21T00:00:00Z'}]}];applyDbOrder(state.dbOrders[0]);paymentWorkspace.account={id:'a',mode:'test',currency:'CNY',bank_name:'演示银行',account_holder:'测试',account_number:'DEMO-NOT-A-BANK-0001',is_active:true,updated_at:'v1'};`);
 return {context,elements,run};
}
test('virtual account is visibly nonpayable; actual final amount and test proof are available after confirmation',()=>{
 const {run}=setup();const html=run('merchantFee()');
 for(const text of ['不可转账','DEMO-NOT-A-BANK-0001','未发生转账','¥128.00','paymentReceiptForm','自动生成'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('id="payBtn"'));assert.ok(!html.includes('测试阶段仅登记付款'));
 run(`state.dbOrders[0].status='submitted';applyDbOrder(state.dbOrders[0])`);
 assert.ok(!run('merchantFee()').includes('paymentReceiptForm'));
});
test('pending or approved receipts never offer another transfer; historical demo labels remain honest',()=>{
 const {run}=setup();run(`paymentWorkspace.receipts=[{id:'r',order_id:'o',status:'pending',is_test:true,amount:128,created_at:'2026-10-21'}]`);
 let html=run('merchantFee()');assert.ok(html.includes('待运营审核'));assert.ok(!html.includes('paymentReceiptForm'));assert.ok(!html.includes('付款成功</strong>'));
 run(`state.dbOrders[0].payments=[{status:'paid',provider:'test_transfer_review',amount:128}];applyDbOrder(state.dbOrders[0])`);
 html=run('merchantFee()');assert.ok(html.includes('未发生真实资金交易'));assert.ok(!html.includes('paymentReceiptForm'));
 run(`state.dbOrders[0].payments[0].provider='manual'`);assert.ok(run('merchantFee()').includes('历史演示登记'));
});
test('rejection permits corrected proof and escapes note without asking for another transfer',()=>{
 const {run}=setup();run(`paymentWorkspace.receipts=[{id:'r',order_id:'o',status:'rejected',amount:128,review_note:'<script>资料不清</script>',created_at:'2026-10-21'}]`);
 const html=run('merchantFee()');assert.ok(html.includes('paymentReceiptForm'));assert.ok(html.includes('勿重复转账'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>资料不清'));
});
test('account missing/error fails closed, and live account never offers synthetic proof',()=>{
 const {run}=setup();run('paymentWorkspace.account=null');assert.ok(!run('merchantFee()').includes('paymentReceiptForm'));
 run(`paymentWorkspace.error='读取失败'`);assert.ok(!run('merchantFee()').includes('paymentReceiptForm'));
 run(`paymentWorkspace.error=null;paymentWorkspace.account={mode:'live',is_active:true,updated_at:'v',currency:'CNY'}`);
 const html=run('merchantFee()');assert.ok(html.includes('paymentReceiptForm'));assert.ok(!html.includes('useTestProof'));
});
test('approval validates exact amount, explicit confirmation, unique reference; rejection requires reason',async()=>{
 const {context,elements,run}=setup();context.calls=[];
 run(`paymentWorkspace.receipts=[{id:'r',order_id:'o',status:'pending',amount:128,is_test:true}];rpcWorkspace=async(n,a)=>calls.push({n,a});refreshDbState=async()=>true;`);
 elements['#reviewAmount']={value:'127'};elements['#reviewReference']={value:'TEST-123'};elements['#reviewNote']={value:''};elements['#reviewConfirmed']={checked:true};context.form={dataset:{receiptId:'r'}};
 await assert.rejects(run('reviewPaymentReceipt(form,true)'),/核对金额/);assert.equal(context.calls.length,0);
 elements['#reviewAmount'].value='128';elements['#reviewConfirmed'].checked=false;await assert.rejects(run('reviewPaymentReceipt(form,true)'),/核对金额/);
 elements['#reviewConfirmed'].checked=true;await run('reviewPaymentReceipt(form,true)');assert.equal(context.calls[0].a.p_received_amount,128);assert.equal(context.calls[0].a.p_confirmed_received,true);
 await assert.rejects(run('reviewPaymentReceipt(form,false)'),/退回原因/);
 elements['#reviewNote'].value='请补充清晰截图';await run('reviewPaymentReceipt(form,false)');assert.equal(context.calls[1].a.p_approve,false);assert.equal(context.calls[1].a.p_received_amount,null);
});
test('inflight task blocks navigation and double submit and restores controls after failure',async()=>{
 const {context,run}=setup();context.form={querySelectorAll:()=>[{disabled:false},{disabled:true}]};context.calls=0;
 const first=run(`paymentTask(form,()=>new Promise(resolve=>{calls++;release=resolve}))`);
 assert.equal(run("go('orders')"),false);await run(`paymentTask(form,async()=>calls++)`);assert.equal(context.calls,1);run('release()');await first;assert.equal(run('paymentWorkspace.busy'),false);
 await run(`paymentTask(form,async()=>{throw Error('断网')})`);assert.equal(run('paymentWorkspace.busy'),false);
});
test('upload validates actual image header, MIME and size',async()=>{
 const {context,run}=setup();
 for(const file of [new Blob(['fake'],{type:'image/png'}),new Blob(['bad'],{type:'application/pdf'}),new Blob([],{type:'image/png'})]){context.file=file;await assert.rejects(run('validatePaymentImage(file)'))}
 context.file=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'});assert.ok(await run('validatePaymentImage(file)'));
});
test('private upload is followed by pending receipt RPC and never by direct paid mutation',async()=>{
 const {context,elements,run}=setup();context.calls=[];
 elements['#paymentPayer']={value:'测试付款人'};elements['#paymentTime']={value:'2026-10-21T08:00'};elements['#paymentReference']={value:'REF'};elements['#paymentNote']={value:'TEST'};elements['#useTestProof']={checked:false};
 const file=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'});file.name='proof.png';file.lastModified=1;elements['#paymentFile']={files:[file]};context.form={dataset:{orderId:'o',accountVersion:'v1'}};
 run(`window.MospaceSupabase.getClient=()=>({storage:{from:bucket=>({upload:async(path,file,options)=>{calls.push({bucket,path,options});return {error:null}}})}});rpcWorkspace=async(n,a)=>calls.push({n,a});refreshDbState=async()=>true;`);
 await run('submitPaymentReceipt(form)');assert.equal(context.calls[0].bucket,'payment-proofs');assert.ok(context.calls[0].path.startsWith('m/o/'));assert.equal(context.calls[0].options.upsert,false);
 assert.equal(context.calls[1].n,'merchant_submit_payment_receipt');assert.equal(context.calls[1].a.p_account_updated_at,'v1');assert.equal(run('state.dbOrders[0].status'),'awaiting_payment');
});
test('notifications show correct next warehouse action and never expose proof',()=>{
 const {run}=setup();run(`state.role='warehouse';state.dbOrders[0].status='paid';paymentWorkspace.notices=[{id:'n',order_id:'o',title:'测试订单可继续打包',message:'模拟审核通过',is_test:true,created_at:'2026-10-21'}]`);
 const html=run('paymentNotificationsHtml()');assert.ok(html.includes('data-warehouse-page="packing"'));assert.ok(html.includes('仅供测试'));assert.ok(!html.includes('data-proof-preview'));
});
