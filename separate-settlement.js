/* 头程与尾程使用独立订单、费用、凭证和付款记录；一笔订单只支付该段一次。 */
'use strict';
function isLastMile(o){return o?.transport_leg==='last_mile'}
function lastMileChild(o){return state.dbOrders.find(x=>x.parent_order_id===o?.id&&isLastMile(x))}
function legLabel(o){return isLastMile(o)?'尾程 · 印尼仓 → 消费者':'头程 · 深圳仓 → 印尼仓'}
function lastMileLinkLabel(o){
 if(o?.status==='delivered')return '查看尾程结果（已签收）';
 if(o?.status==='cancelled')return '查看已取消尾程';
 if(o?.status==='awaiting_payment')return orderReceipt(o.id)?.status==='pending'?'查看尾程审核进度':'查看尾程付款';
 return '查看关联尾程';
}
function settlementContext(o){
 if(!o)return '';
 const p=isLastMile(o)&&state.dbOrders.find(x=>x.id===o.parent_order_id),child=!isLastMile(o)&&lastMileChild(o);
 return `<div class="card section-space"><h3>当前查看：${legLabel(o)}</h3>${!isLastMile(o)?orderProgressHtml(o):''}<p>本段订单号：<strong>${esc(o.order_no)}</strong></p>${p?`<p>关联头程：${esc(p.order_no)} · 头程确认金额 ${money(feeRecord(p)?.total_amount)}。本页显示独立尾程单，只收印尼仓到消费者的配送费，头程金额不变。</p>${state.role==='merchant'?orderAction(p,'fee','查看头程账单'):''}`:`<p>头程单仅结算深圳仓到印尼海外仓的运输及国内仓操作费；尾程配送另单核价、付款。</p>`}${o.overseas_received_at?notice('头程已入印尼海外仓',`${esc(o.overseas_warehouse)} · ${dateText(o.overseas_received_at)}。${child?'消费者配送进度请查看下方关联尾程。':'尚未申请尾程配送。'}`):''}${child?`<p>已关联尾程：${esc(child.order_no)} · ${esc(orderStatusLabel(child.status))} · ${feeRecord(child)?.confirmed_at?'尾程确认金额 '+money(feeRecord(child)?.total_amount):'尾程费用待确认'}</p>${state.role==='merchant'?orderAction(child,'fee',lastMileLinkLabel(child)):warehouseOrderButton(child,warehouseStage(child)||'ship','查看尾程作业')}`:''}</div>`;
}
function lastMileRequest(o){
 if(!o||isLastMile(o))return '';
 const child=lastMileChild(o);if(child)return '';
 if(feeRecord(o)?.fee_breakdown_version!==3)return notice('历史账单的尾程安排','此单使用旧版费用规则，暂不自动生成尾程，避免重复收费。需要尾程配送请联系运营核对。');
 if(!o.overseas_received_at)return notice('尾程独立结算入口','头程已到印尼仓后，可在此填写消费者收货地址、申请尾程配送；尾程报价和付款单独进行。当前等待仓库登记印尼仓到货。');
 return `<div class="card section-space" id="lastMileApplication" style="scroll-margin-top:88px"><h3>申请尾程配送 · 独立结算</h3><p>整票货物从印尼仓配送至一个消费者地址；生成独立尾程订单，头程费用不重复收取。</p><form id="lastMileRequestForm" data-order-id="${esc(o.id)}"><div class="field"><label for="lastMileAddress">选用已保存的消费者地址（选填）</label><select id="lastMileAddress"><option value="">新增消费者收货地址</option>${state.addresses.filter(a=>a.country==='印度尼西亚').map(a=>`<option value="${esc(a.id)}">${esc(a.recipient_name)} · ${esc(a.address_line)}</option>`).join('')}</select></div><div class="form-grid section-space">${field('消费者收件人','lastMileName','','text','required maxlength="120"')}${field('联系电话','lastMilePhone','','tel','required maxlength="80"')}${field('国家','lastMileCountry','印度尼西亚','text','readonly')}${field('城市 / 地区','lastMileCity','','text','required maxlength="120"')}${field('邮编（选填）','lastMilePostal','','text','maxlength="30"')}<div class="field full"><label for="lastMileLine">消费者详细收货地址</label><textarea id="lastMileLine" required maxlength="1000" rows="3" placeholder="填写消费者街道、门牌号等具体收货地址"></textarea></div></div><p class="page-note">此处填写消费者地址，不能沿用头程印尼仓地址。创建后锁定本次收货信息；当前不支持一票拆成多笔消费者配送。新地址会保存至地址簿。</p><button class="btn primary" type="submit">确认消费者地址，创建尾程订单</button></form></div>`;
}
const separateMerchantFee=merchantFee;
merchantFee=function(){
 const o=state.order.record;
 if(!isLastMile(o))return separateMerchantFee().replace('仓库确认费用后一次付款。','头程确认后支付头程；尾程另单结算。')+settlementContext(o)+lastMileRequest(o);
 const f=feeRecord(o),fees=transportFeesHtml(f).replaceAll('本尾程单应付',paymentRecord(o)?.status==='paid'?'本尾程单已付':'本尾程单应付');
 return shell('尾程订单与费用','印尼海外仓 → 消费者，本段独立付款。',button('返回我的订单','orders'))+settlementContext(o)+`<div class="card"><h3>${esc(o.order_no)}</h3>${status(orderStatusLabel(o.status),statusTone(o.status))}${fees}${[['收件人',o.recipient_name],['联系电话',o.recipient_phone],['消费者地址',o.destination_address],['印尼发货仓',o.origin_warehouse_address]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${esc(v||'')}</b></div>`).join('')}<div class="form-actions">${orderAction(o,'tracking','查看尾程物流')}</div></div>`+merchantPaymentSection(o).replaceAll('本单唯一应付','本尾程单应付');
};
const separatePaymentSection=merchantPaymentSection;
merchantPaymentSection=function(o){
 let html=separatePaymentSection(o).replaceAll('本单不再付款','本段不再付款').replaceAll('本单唯一应付','本段应付');
 const progress=isLastMile(o)?(o.status==='delivered'?'尾程已签收':o.status==='shipped'?'尾程配送中':o.status==='packing'?'尾程出库准备中':'尾程仓库可继续出库'):(o.overseas_received_at?'头程已到印尼仓':o.status==='shipped'?'头程运输中':o.status==='packing'?'仓库打包中':'仓库可继续打包');
 return html.replaceAll('仓库可继续打包',progress);
};
const separateOrderTable=workspaceOrderTable;
workspaceOrderTable=function(orders){
 let html=separateOrderTable(orders);
 for(const o of orders){
  if(isLastMile(o))html=html.replace(esc(o.route_name),esc(o.route_name)+'<br><small>尾程独立结算</small>');
 }
 return html;
};
const separateWarehouseConfirm=warehouseConfirm;
warehouseConfirm=function(){
 const o=warehouseSelected();if(!isLastMile(o))return separateWarehouseConfirm()+settlementContext(o);
 if(o.status!=='warehouse_received')return warehouseContext(o)+shell('尾程报价已确认','按本段订单状态继续。')+settlementContext(o)+warehouseActualFees(o)+(o.status==='paid'?warehouseOrderButton(o,'packing','尾程出库作业'):'');
 return warehouseContext(o)+shell('确认尾程配送报价','请按本单消费者地址核价，头程不再收费。')+settlementContext(o)+`<div class="card"><p>收件人：${esc(o.recipient_name)} · ${esc(o.recipient_phone)}<br>消费者地址：${esc(o.destination_address)}<br>印尼海外仓：${esc(o.origin_warehouse_address)}</p><form id="lastMileQuoteForm" data-order-id="${esc(o.id)}">${field('尾程配送费（CNY）','lastMileFee','','number','required min="0.01" max="9999999" step="0.01"')}${field('报价依据 / 配送区域 / 承运商','lastMileNote','','text','required minlength="2" maxlength="500"')}<p class="page-note">填写真实核定报价；若换汇请记录汇率。确认后商家只支付本尾程单，不改头程金额。当前不支持免单配送。</p><button class="btn primary" type="submit">确认尾程报价，通知商家付款</button></form></div>`;
};
const separateWarehousePacking=warehousePacking;
warehousePacking=function(){const o=warehouseSelected();return separateWarehousePacking().replace(isLastMile(o)?'打包作业':'___',isLastMile(o)?'尾程出库准备':'___')+settlementContext(o)};
const separateWarehouseShip=warehouseShip;
warehouseShip=function(){
 const o=warehouseSelected();let html=separateWarehouseShip()+settlementContext(o);
 if(!o||o.status!=='shipped')return html;
 if(isLastMile(o))return html+`<div class="card section-space"><h3>登记消费者签收</h3><form id="lastMileDeliveredForm" data-order-id="${esc(o.id)}">${field('真实签收依据 / 时间说明','lastMileDeliveredNote','','text','required minlength="2" maxlength="500"')}<button class="btn primary" type="submit">确认消费者已签收</button></form></div>`;
 if(o.overseas_received_at)return html;
 return html+`<div class="card section-space"><h3>登记头程到达印尼海外仓</h3><p>请核实实物已到印尼仓后登记，商家随后可申请独立尾程配送。此操作不代表消费者签收。</p><form id="overseasReceivedForm" data-order-id="${esc(o.id)}">${field('实际印尼海外仓名称及位置','overseasLocation','','text','required minlength="2" maxlength="500"')}<button class="btn primary" type="submit">确认头程已到印尼仓</button></form></div>`;
};
const separateTracking=merchantTracking;
merchantTracking=function(){return separateTracking()+settlementContext(state.order.record)};
const separateReview=adminPaymentReview;
adminPaymentReview=function(customerId=null){const r=paymentWorkspace.receipts.find(x=>x.id===paymentWorkspace.selected&&(!customerId||state.dbOrders.some(o=>o.id===x.order_id&&o.merchant_id===customerId))),o=r&&state.dbOrders.find(x=>x.id===r.order_id);return separateReview(customerId)+settlementContext(o)};
const separateBind=bind;
bind=function(){
 separateBind();
 const forms=[['lastMileRequestForm','merchant_create_last_mile_with_address',form=>({p_order_id:form.dataset.orderId,p_recipient:readLastMileRecipient()}),'尾程配送单已创建，等待独立报价'],['lastMileQuoteForm','warehouse_quote_last_mile',form=>({p_order_id:form.dataset.orderId,p_amount:Number($('#lastMileFee').value),p_note:$('#lastMileNote').value.trim()}),'尾程报价已确认，等待本段付款'],['overseasReceivedForm','warehouse_receive_overseas',form=>({p_order_id:form.dataset.orderId,p_location:$('#overseasLocation').value.trim()}),'头程已到印尼仓，商家可申请尾程配送'],['lastMileDeliveredForm','warehouse_complete_delivery',form=>({p_order_id:form.dataset.orderId,p_note:$('#lastMileDeliveredNote').value.trim()}),'消费者签收已登记']];
 for(const [id,rpc,args,message] of forms){const form=$('#'+id);if(form)form.onsubmit=e=>{e.preventDefault();paymentTask(form,async()=>{
  const owner=state.auth.user?.id,result=await rpcWorkspace(rpc,args(form));
  if(owner!==state.auth.user?.id)throw Error('登录账号已变化，请刷新核对');
  if(rpc==='merchant_create_last_mile_with_address'){state.activeOrderId=result.id;if(!await refreshDbState('fee'))throw Error('申请已提交，请刷新查看，勿重复操作')}
  else if(!await refreshDbState())throw Error('已提交，请刷新核对，勿重复操作');
  toast(message);
 })}}
 // 本段发货时可自由填写实际空运 / 海运 / 印尼本地承运商。
 const carrier=$('#carrier');if(carrier?.tagName==='SELECT'){const input=document.createElement('input');input.id='carrier';input.value=state.order.record?.shipment_carrier||'';input.placeholder=isLastMile(state.order.record)?'实际印尼尾程承运商':'实际空运 / 海运承运商';input.maxLength=120;carrier.replaceWith(input)}
};
// 账单统计基于每段独立订单，已付头程不会算作尾程已付。
const separateBilling=merchantBilling;
merchantBilling=function(){return separateBilling().replace('当前采用订单一次付款','按运输段独立结算').replace('钱包充值和余额支付暂未开放；不需要预存资金。','头程和尾程分别建单、核价、付款，每段只支付一次。').replaceAll('一次付款后锁定','每段付款后锁定')};
MerchantViews.billing=merchantBilling;

const legWarehouseContext=warehouseContext;warehouseContext=function(o){return legWarehouseContext(o)+`<p class="page-note">${legLabel(o)} · ${isLastMile(o)?'核对本段独立付款后出库':o?.overseas_received_at?'头程已到仓，关联尾程进度见订单状态':'到达印尼仓后登记到货，尾程另建配送单'}</p>`};

const separatePageFrame=merchantPageFrame;
merchantPageFrame=function(html){const o=state.order.record;let frame=separatePageFrame(html);if(!o||!['fee','tracking'].includes(state.page))return frame;
 const tail=isLastMile(o);frame=frame.replaceAll('订单详情与费用',tail?'尾程订单与费用':'头程订单与费用').replace('一次付款',tail?'尾程付款':'头程付款');
 if(tail)frame=frame.replace('提交打包','申请尾程').replace('仓库确认','尾程报价').replace('打包出货','尾程出库').replace('运输签收','配送签收');
 else{frame=frame.replace('运输签收','运输至印尼仓');if(o.overseas_received_at)frame=frame.replace('class="current" aria-current="step"','class="done"');}
 return frame;
};
