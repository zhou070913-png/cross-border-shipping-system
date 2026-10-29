/* 银行转账凭证：上传不等于付款成功；审核通过后按订单类型打包或整包出库。 */
'use strict';
const paymentWorkspace={owner:null,account:null,receipts:[],notices:[],error:null,busy:false,selected:null,filter:'pending',preview:null,upload:null,loading:false};
Object.assign(pageRoles,{'payment-review':'admin','receiving-config':'admin'});
navs.admin.splice(2,0,['payment-review','付款审核'],['receiving-config','收款账户']);
const paymentClient=()=>window.MospaceSupabase.getClient();
const testPaymentNotice=()=>notice('测试模式 · 不可转账','此账号是虚拟账号，不接受真实转账。测试凭证和审核仅模拟业务状态，不代表真实资金到账。');
const receiptLabels={pending:'待运营审核',approved:'审核通过',rejected:'凭证需补充'};
function orderReceipt(id){return paymentWorkspace.receipts.filter(r=>r.order_id===id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null}
async function paymentRows(table){
  const rows=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await paymentClient().from(table).select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
    if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)break;
  }
  return rows;
}
async function loadPaymentWorkspace(){
  const owner=state.auth.user?.id,role=state.role;
  if(!owner){Object.assign(paymentWorkspace,{owner:null,account:null,receipts:[],notices:[],preview:null,upload:null});return}
  if(paymentWorkspace.owner!==owner)Object.assign(paymentWorkspace,{owner,account:null,receipts:[],notices:[],selected:null,preview:null,upload:null,error:null});
  paymentWorkspace.loading=true;
  try{
    const [accounts,receipts,notices]=await Promise.all([
      role==='warehouse'?[]:paymentClient().from('payment_receiving_accounts').select('*').then(({data,error})=>{if(error)throw error;return data||[]}),
      role==='warehouse'?[]:paymentRows('payment_receipts'),paymentRows('payment_notifications')]);
    if(state.auth.user?.id!==owner||state.role!==role)return;
    Object.assign(paymentWorkspace,{account:accounts[0]||null,receipts,notices,error:null});
  }catch(e){if(state.auth.user?.id===owner)Object.assign(paymentWorkspace,{account:null,receipts:[],notices:[],error:'付款资料读取失败，请刷新重试；持续失败请联系运营。'})}
  finally{if(state.auth.user?.id===owner)paymentWorkspace.loading=false}
}
const beforePaymentLoad=loadMerchantWorkspace;
loadMerchantWorkspace=async function(){await beforePaymentLoad();await loadPaymentWorkspace()};
function receivingAccountHtml(a){
  if(!a)return notice('暂未启用收款账户','请联系运营配置收款账户，此时不能提交凭证。');
  return (a.mode==='test'?testPaymentNotice():notice('银行转账','请按本单最终金额转账一次，再提交凭证。运营核实到账后才确认付款成功。'))+
    `<div class="card section-space"><h3>收款账户 · ${a.mode==='test'?'仅供测试':'人民币'}</h3>${[['收款银行',a.bank_name],['账户名称',a.account_holder],['收款账号',a.account_number],['开户行',a.branch_name],['SWIFT',a.swift_code],['币种',a.currency]].filter(([,v])=>v).map(([k,v])=>`<div class="metric"><span>${k}</span><b data-user-content>${esc(v)}</b></div>`).join('')}<p data-user-content>${esc(a.instructions||'')}</p></div>`;
}
function paymentHistory(id){
  const rows=paymentWorkspace.receipts.filter(r=>r.order_id===id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return rows.length?`<div class="card section-space"><h3>凭证审核记录</h3>${rows.map(r=>`<div class="metric"><span>${esc(dateText(r.created_at))} ${r.is_test?' · 测试':''}<br>${esc(receiptLabels[r.status])}${r.review_note?'<br><span data-user-content>'+esc(r.review_note)+'</span>':''}</span><div>${money(r.amount)} <button type="button" class="btn small ghost" data-proof-preview="${r.id}">查看凭证</button></div></div>`).join('')}</div>`:'';
}
function merchantPaymentSection(o){
  if(paymentWorkspace.error)return notice('付款资料暂不可用',paymentWorkspace.error);
  const r=orderReceipt(o.id),p=paymentRecord(o),f=feeRecord(o);
  if(p?.status==='paid')return notice(p.provider==='test_transfer_review'?'测试付款审核通过':p.provider==='bank_transfer_review'?'付款成功':'历史演示登记',p.provider==='test_transfer_review'?'未发生真实资金交易。仓库可继续打包；本单不再付款。':p.provider==='bank_transfer_review'?'运营已核实到账，仓库可继续打包；本单不再付款。':'这是一笔旧版演示付款记录，不代表银行到账审核。')+paymentHistory(o.id);
  if(r?.status==='pending')return notice(r.is_test?'测试凭证待运营审核':'付款凭证待运营审核','凭证已保存，尚未确认付款成功。请等待运营审核，不要重复转账。')+`<button type="button" class="btn ghost" data-payment-refresh>刷新审核结果</button>`+paymentHistory(o.id);
  if(o.status!=='awaiting_payment'||!f?.confirmed_at||!(Number(f.total_amount)>0))return '';
  const a=paymentWorkspace.account;
  return (r?.status==='rejected'?`<div class="notice"><div>ⓘ</div><div><strong>请补充付款凭证</strong>${r.review_note?'<p data-user-content>'+esc(r.review_note)+'</p>':''}<p>核对并补交凭证即可，勿重复转账。</p></div></div>`:'')+receivingAccountHtml(a)+
    (a?.is_active?`<div class="card section-space"><h3>${a.mode==='test'?'提交测试凭证':'提交付款凭证'}</h3><p>本单唯一应付：<strong>${money(f.total_amount)} CNY</strong>。${a.mode==='test'?'请使用下方生成的测试凭证，无需真实转账。':'请确认向上方账户完成转账后，再提交资料。'}</p><form id="paymentReceiptForm" data-order-id="${o.id}" data-account-version="${esc(a.updated_at)}"><div class="form-grid">${field(a.mode==='test'?'测试付款人':'付款人姓名','paymentPayer',a.mode==='test'?'演示商家':'','text','required maxlength="120"')}${field('转账时间','paymentTime',new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16),'datetime-local','required')}${field('转账备注 / 流水号（选填）','paymentReference','','text','maxlength="160"')}<div class="field"><label for="paymentFile">凭证图片（PNG / JPG / WebP，最大5MB）</label><input id="paymentFile" type="file" accept="image/png,image/jpeg,image/webp"></div><div class="field full"><label for="paymentNote">备注（选填）</label><textarea id="paymentNote" maxlength="2000"></textarea></div></div>${a.mode==='test'?'<p><label><input id="useTestProof" type="checkbox" checked> 自动生成带有“测试凭证、未发生转账”水印的图片</label></p>':''}<p class="page-note">上传凭证不代表付款成功；运营审核通过后进入待打包。</p><div class="form-actions"><button class="btn primary" type="submit">${a.mode==='test'?'提交测试凭证':'提交凭证，等待审核'}</button></div></form></div>`:'')+paymentHistory(o.id);
}
// 保留订单明细与测量信息，替换旧版直接标记付款的入口。
const paymentOriginalFee=merchantFee;
merchantFee=function(){
  const o=state.order.record;return paymentOriginalFee()+(o?merchantPaymentSection(o):'');
};
const paymentOriginalOrderTable=workspaceOrderTable;
workspaceOrderTable=function(orders){
  let html=paymentOriginalOrderTable(orders);
  for(const o of orders){
    const r=orderReceipt(o.id);if(!r||o.status!=='awaiting_payment')continue;
    const label=r.status==='pending'?'查看审核进度':r.status==='rejected'?'补充凭证':'查看付款结果';
    html=html.replace(orderAction(o,'fee','查看并付款'),orderAction(o,'fee',label));
  }
  return html;
};
function adminReceivingConfig(){
  const a=paymentWorkspace.account;
  return shell('收款账户配置','默认使用虚拟账号测试；切换真实收款前请填写你自己的银行资料。',button('付款审核','payment-review'))+
    (paymentWorkspace.error?notice('配置暂不可用',paymentWorkspace.error):!a?notice('未读取到账户','请刷新数据。'):receivingAccountHtml(a)+`<div class="card section-space"><form id="receivingConfigForm" data-version="${esc(a.updated_at)}"><div class="form-grid"><div class="field"><label for="receivingMode">收款模式</label><select id="receivingMode"><option value="test" ${a.mode==='test'?'selected':''}>测试 · 不可真实转账</option><option value="live" ${a.mode==='live'?'selected':''}>真实银行转账 · 人工核实到账</option></select></div>${field('币种','receivingCurrency','CNY','text','readonly')}${field('收款银行','receivingBank',a.bank_name,'text','required maxlength="120"')}${field('账户名称','receivingHolder',a.account_holder,'text','required maxlength="160"')}${field('收款账号','receivingNumber',a.account_number,'text','required maxlength="100"')}${field('开户行（选填）','receivingBranch',a.branch_name||'','text','maxlength="160"')}${field('SWIFT（选填）','receivingSwift',a.swift_code||'','text','maxlength="40"')}<div class="field full"><label for="receivingInstructions">转账说明</label><textarea id="receivingInstructions" maxlength="2000">${esc(a.instructions||'')}</textarea></div></div><p><label><input id="receivingActive" type="checkbox" ${a.is_active?'checked':''}> 启用此账户</label></p><p class="page-note">仅支持人民币，与订单费用保持一致。修改不影响已提交凭证保存的账户快照。真实收款需逐笔核查银行到账，不自动扣款或自动对账。</p><button class="btn primary" type="submit">保存收款配置</button></form></div>`);
}
function openPaymentReview(id){
  if(state.role!=='admin'||normalizedRole(state.auth.role)!=='admin'||paymentWorkspace.busy)return false;
  const receipt=paymentWorkspace.receipts.find(r=>r.id===id);if(!receipt)return false;
  const previous={selected:paymentWorkspace.selected,filter:paymentWorkspace.filter};
  paymentWorkspace.selected=id;paymentWorkspace.filter=receipt.status;
  if(!go('payment-review',{role:'admin'})){Object.assign(paymentWorkspace,previous);return false}
  document.getElementById('paymentReviewDetail')?.scrollIntoView?.({block:'start'});
  return true;
}
function adminPaymentReview(customerId=null){
  const receipts=paymentWorkspace.receipts.filter(r=>!customerId||state.dbOrders.some(o=>o.id===r.order_id&&o.merchant_id===customerId));
  const rows=receipts.filter(r=>paymentWorkspace.filter==='all'||r.status===paymentWorkspace.filter);
  const r=receipts.find(r=>r.id===paymentWorkspace.selected),o=r&&state.dbOrders.find(o=>o.id===r.order_id);
  let detail='';
  if(r)detail=`<div class="card section-space" id="paymentReviewDetail" style="scroll-margin-top:90px"><div class="card-title"><h3>审核 ${esc(o?.order_no||r.order_id)}</h3>${status(receiptLabels[r.status],r.status==='approved'?'green':'amber')}</div>${r.is_test?testPaymentNotice():notice('请核查银行实际到账','截图仅供核对，不能单凭截图确认收款。请核实收款账户、银行流水和实际到账金额。')}<div class="metric"><span>应收金额</span><b>${money(r.amount)} ${esc(r.currency)}</b></div><div class="metric"><span>付款人 / 转账时间</span><b data-user-content>${esc(r.payer_name)} / ${esc(dateText(r.transferred_at))}</b></div><p><span>商家填写的流水：</span>${r.transfer_reference?`<span data-user-content>${esc(r.transfer_reference)}</span>`:'未填写'}<br><span>备注：</span>${r.merchant_note?`<span data-user-content>${esc(r.merchant_note)}</span>`:'无'}</p><details><summary>提交时收款账户</summary>${receivingAccountHtml(r.account_snapshot)}</details><p><button class="btn ghost" type="button" data-proof-preview="${r.id}">查看私有凭证图片</button></p>${r.status==='pending'?`<form id="paymentReviewForm" data-receipt-id="${r.id}"><div class="form-grid">${field(r.is_test?'模拟到账金额（CNY）':'实际到账金额（CNY）','reviewAmount','','number','min="0.01" step="0.01"')}${field(r.is_test?'测试审核流水号（唯一）':'银行实际流水号（唯一）','reviewReference',r.is_test?'TEST-'+r.id.slice(0,8):'','text','maxlength="160"')}<div class="field full"><label for="reviewNote">审核说明（退回必填）</label><textarea id="reviewNote" maxlength="2000"></textarea></div></div><p><label><input id="reviewConfirmed" type="checkbox"> ${r.is_test?'我确认这是模拟测试，不代表真实资金到账':'我已核实此笔转账真实到账，账户、金额、银行流水一致'}</label></p><div class="form-actions"><button class="btn ghost" name="decision" value="reject" type="submit">退回，补充凭证</button><button class="btn primary" name="decision" value="approve" type="submit">${r.is_test?'测试审核通过':'确认到账，审核通过'}</button></div></form>`:`<p>审核时间：${esc(dateText(r.reviewed_at))}<br><span data-user-content>${esc(r.review_note||'')}</span></p>`}</div>`;
  return shell('付款审核','提交凭证 → 运营核对 → 付款成功 → 仓库作业；整包转寄直接出库。',button('收款账户','receiving-config')+'<button class="btn ghost" data-payment-refresh>刷新</button>')+
    (paymentWorkspace.error?notice('审核资料暂不可用',paymentWorkspace.error):'')+
    `<div class="workspace-tabs">${[['pending','待审核'],['approved','已通过'],['rejected','需补充'],['all','全部']].map(([k,v])=>`<button type="button" class="${paymentWorkspace.filter===k?'active':''}" data-payment-filter="${k}">${v}（${receipts.filter(r=>k==='all'||r.status===k).length}）</button>`).join('')}</div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>订单号</th><th>金额</th><th>类型 / 状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(state.dbOrders.find(o=>o.id===r.order_id)?.order_no||r.order_id)}</td><td>${money(r.amount)}</td><td>${r.is_test?'测试 · ':''}${esc(receiptLabels[r.status])}</td><td>${esc(dateText(r.created_at))}</td><td><button class="btn small ghost" data-review-receipt="${r.id}">查看审核</button></td></tr>`).join('')||'<tr><td colspan="5">暂无对应凭证</td></tr>'}</tbody></table></div></div>${detail}`;
}
function paymentNotificationsHtml(){
  if(paymentWorkspace.error)return notice('付款通知暂不可用',paymentWorkspace.error);
  if(state.role==='admin')return `<div class="card section-space"><h3>待审核付款：${paymentWorkspace.receipts.filter(r=>r.status==='pending').length} 笔</h3>${button('进入付款审核','payment-review',true)} ${button('收款账户配置','receiving-config')}</div>`;
  const rows=paymentWorkspace.notices.slice(0,5);
  return rows.length?`<div class="card section-space"><h3>付款审核通知</h3>${rows.map(n=>{const o=state.dbOrders.find(o=>o.id===n.order_id);return `<div class="metric"><span><b>${esc(n.title)}</b>${n.is_test?' · 仅供测试':''}<br>${esc(n.message)}<br><small>${esc(dateText(n.created_at))}</small></span>${o?(state.role==='merchant'?orderAction(o,'fee','查看订单'):warehouseOrderButton(o,warehouseStage(o)||'ship','查看订单')):''}</div>`}).join('')}</div>`:'';
}
for(const name of ['merchantDashboard','warehouseDashboard','adminDashboard']){
  if(name==='merchantDashboard'){const previous=merchantDashboard;merchantDashboard=()=>previous()+paymentNotificationsHtml()}
  if(name==='warehouseDashboard'){const previous=warehouseDashboard;warehouseDashboard=()=>previous()+paymentNotificationsHtml()}
  if(name==='adminDashboard'){const previous=adminDashboard;adminDashboard=()=>previous()+paymentNotificationsHtml()}
}
const originalPaymentMessages=workspaceMessages;
workspaceMessages=function(){return originalPaymentMessages().map(m=>{const r=m.order&&orderReceipt(m.order.id);return r?.status==='pending'&&m.order.status==='awaiting_payment'?{...m,title:'付款凭证待运营审核',text:m.order.order_no+' · 已提交凭证，请勿重复转账'}:m}).concat(paymentWorkspace.notices.map(n=>({id:n.id,title:n.title,text:n.message,at:n.created_at,page:'fee',order:state.dbOrders.find(o=>o.id===n.order_id)}))).sort((a,b)=>new Date(b.at)-new Date(a.at))};
async function paymentTask(form,fn){
  if(paymentWorkspace.busy)return;paymentWorkspace.busy=true;
  const controls=[...form.querySelectorAll('button,input,textarea,select')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
  try{await fn()}catch(e){toast(e.message||'保存失败，请刷新核对后重试',6000)}finally{paymentWorkspace.busy=false;controls.forEach((c,i)=>c.disabled=disabled[i])}
}
const paymentPreviousGo=go;
go=function(page,options={}){if(paymentWorkspace.busy){toast('正在保存付款资料，请稍候');return false}return paymentPreviousGo(page,options)};
async function validatePaymentImage(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>5242880)throw Error('请选择5MB以内的PNG、JPG或WebP凭证图片');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const valid=file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
  if(!valid)throw Error('图片内容与格式不符，请重新选择图片');
  const bitmap=await createImageBitmap(file);bitmap.close();return file;
}
async function generateTestProof(o){
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=600;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff7ed';ctx.fillRect(0,0,1000,600);ctx.fillStyle='#9a3412';ctx.font='bold 44px sans-serif';ctx.fillText('TEST ONLY / 测试凭证',50,95);ctx.font='28px sans-serif';
  ['未发生真实转账 · 不作为银行收款凭据',o.order_no,'CNY '+Number(feeRecord(o).total_amount).toFixed(2),'DEMO-NOT-A-BANK-0001',new Date().toISOString()].forEach((t,i)=>ctx.fillText(t,50,175+i*65));
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(new File([b],'test-proof.png',{type:'image/png'})):reject(Error('测试凭证生成失败')),'image/png'));
}
async function submitPaymentReceipt(form){
  const owner=state.auth.user?.id,o=state.dbOrders.find(o=>o.id===form.dataset.orderId),a=paymentWorkspace.account;
  if(!owner||!o||o.merchant_id!==owner||o.status!=='awaiting_payment'||!a?.is_active)throw Error('订单或收款账户已变化，请刷新核对');
  const payer=$('#paymentPayer').value.trim(),date=new Date($('#paymentTime').value),reference=$('#paymentReference').value.trim(),note=$('#paymentNote').value.trim();
  if(!payer||!Number.isFinite(date.getTime()))throw Error('请填写付款人和有效的转账时间');
  const file=a.mode==='test'&&$('#useTestProof')?.checked?await generateTestProof(o):await validatePaymentImage($('#paymentFile').files[0]);
  if(state.auth.user?.id!==owner)throw Error('登录状态已变化，请重新登录');
  // 同一文件失败重试复用已上传路径，避免“网络超时”造成重复提交。
  const generatedTest=a.mode==='test'&&$('#useTestProof')?.checked;
  const fingerprint=[owner,o.id,a.updated_at,...(generatedTest?['generated-test']: [file.name,file.size,file.lastModified])].join(':');
  let upload=paymentWorkspace.upload;
  if(!upload||upload.fingerprint!==fingerprint){
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type],path=owner+'/'+o.id+'/'+crypto.randomUUID()+'.'+ext;
    const {error}=await paymentClient().storage.from('payment-proofs').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
    upload={fingerprint,path};paymentWorkspace.upload=upload;
  }
  await rpcWorkspace('merchant_submit_payment_receipt',{p_order_id:o.id,p_object_path:upload.path,p_payer_name:payer,p_transfer_reference:reference,p_transferred_at:date.toISOString(),p_note:note,p_account_updated_at:form.dataset.accountVersion});
  paymentWorkspace.upload=null;
  if(!await refreshDbState('fee'))throw Error('凭证已提交，但刷新失败，请刷新查看，勿重复转账');
  toast('凭证已提交，等待运营审核；请勿重复转账',5000);
}
async function reviewPaymentReceipt(form,approve){
  const r=paymentWorkspace.receipts.find(r=>r.id===form.dataset.receiptId);if(!r||r.status!=='pending')throw Error('此凭证已变化，请刷新');
  const raw=$('#reviewAmount').value,n=raw===''?null:Number(raw),ref=$('#reviewReference').value.trim(),note=$('#reviewNote').value.trim(),confirmed=$('#reviewConfirmed').checked;
  if(approve&&(!confirmed||n===null||!Number.isFinite(n)||n!==Number(r.amount)||ref.length<3))throw Error('请核对金额、填写唯一流水号并勾选确认');
  if(!approve&&note.length<2)throw Error('请填写退回原因，商家只需补充凭证，勿重复转账');
  await rpcWorkspace('admin_review_payment_receipt',{p_receipt_id:r.id,p_approve:approve,p_received_amount:approve?n:null,p_bank_reference:approve?ref:null,p_note:note,p_confirmed_received:approve&&confirmed});
  if(!await refreshDbState('payment-review'))throw Error('审核已提交，但刷新失败，请刷新核对，勿重复审核');
  toast(approve?(r.is_test?'测试审核通过，已通知商家及仓库':'审核通过，已通知商家及仓库'):'已退回凭证并通知商家');
}
function paymentProofSource(value){
  if(typeof value!=='string')throw Error('无法读取凭证链接');
  if(window.MospaceSupabase.isLocalPreview===true&&window.location?.origin==='http://127.0.0.1:4175'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)&&value.length<7500000)return value;
  const url=new URL(value),expected=new URL(window.MospaceSupabase.config.url);
  if(url.protocol!=='https:'||url.origin!==expected.origin||!url.pathname.startsWith('/storage/v1/object/sign/payment-proofs/'))throw Error('无法读取凭证链接');
  return url.href;
}
async function showPaymentProof(id){
  const r=paymentWorkspace.receipts.find(r=>r.id===id),owner=state.auth.user?.id,role=state.role;if(!r)return;
  try{
    const {data,error}=await paymentClient().storage.from('payment-proofs').createSignedUrl(r.object_path,60);if(error)throw error;
    if(owner!==state.auth.user?.id||role!==state.role)return;
    const source=paymentProofSource(data?.signedUrl);
    document.getElementById('paymentProofDialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='paymentProofDialog';dialog.setAttribute('aria-label','付款凭证');dialog.style.cssText='max-width:850px;width:90%;border:0;border-radius:12px;padding:20px';
    dialog.innerHTML=`<button type="button" class="btn ghost">关闭凭证</button><p>${r.is_test?'测试凭证 · 未发生真实转账':'付款凭证 · 请核实银行到账'}</p><img alt="${r.is_test?'测试':'转账'}凭证" style="max-width:100%;max-height:70vh">`;
    const img=dialog.querySelector('img');img.src=source;img.onerror=()=>{img.remove();const error=document.createElement('p');error.textContent='图片加载失败，请关闭后重新查看。 / Gagal memuat gambar. Tutup dan coba lagi.';error.setAttribute('role','alert');dialog.append(error)};
    dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
    if(typeof localizeKnownDom==='function')localizeKnownDom();
    setTimeout(()=>{if(dialog.isConnected)dialog.close()},60000);
  }catch(e){toast('凭证读取失败，请重新点击查看',5000)}
}
const paymentBeforeBind=bind;
bind=function(){
  paymentBeforeBind();
  const form=$('#paymentReceiptForm');if(form)form.onsubmit=e=>{e.preventDefault();paymentTask(form,()=>submitPaymentReceipt(form))};
  const config=$('#receivingConfigForm');if(config)config.onsubmit=e=>{e.preventDefault();paymentTask(config,async()=>{
    await rpcWorkspace('admin_save_receiving_account',{p_config:{mode:$('#receivingMode').value,currency:'CNY',bank_name:$('#receivingBank').value.trim(),account_holder:$('#receivingHolder').value.trim(),account_number:$('#receivingNumber').value.trim(),branch_name:$('#receivingBranch').value.trim(),swift_code:$('#receivingSwift').value.trim(),instructions:$('#receivingInstructions').value.trim(),is_active:$('#receivingActive').checked},p_expected_updated_at:config.dataset.version});
    await loadPaymentWorkspace();if(paymentWorkspace.error)throw Error('配置已保存，请刷新核对');render();toast('收款配置已保存');
  })};
  const review=$('#paymentReviewForm');if(review)review.onsubmit=e=>{e.preventDefault();const decision=e.submitter?.value;if(!['approve','reject'].includes(decision))return;paymentTask(review,()=>reviewPaymentReceipt(review,decision==='approve'))};
  document.querySelectorAll('[data-payment-filter]').forEach(el=>el.onclick=()=>{if(paymentWorkspace.busy)return;paymentWorkspace.filter=el.dataset.paymentFilter;render()});
  document.querySelectorAll('[data-review-receipt]').forEach(el=>el.onclick=()=>openPaymentReview(el.dataset.reviewReceipt));
  document.querySelectorAll('[data-proof-preview]').forEach(el=>el.onclick=()=>showPaymentProof(el.dataset.proofPreview));
  document.querySelectorAll('[data-payment-refresh]').forEach(el=>el.onclick=()=>{if(!paymentWorkspace.busy)refreshDbState()});
  const logout=$('#authBtn');if(logout&&state.auth.user){const previous=logout.onclick;logout.onclick=async()=>{if(paymentWorkspace.busy){toast('正在保存，请稍候');return}document.getElementById('paymentProofDialog')?.remove();await previous();await loadPaymentWorkspace()}}
};
// 页面自动同步由 progress-sync.js 统一管理。
