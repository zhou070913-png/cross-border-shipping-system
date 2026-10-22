/* 头程与尾程使用独立订单、费用、凭证和付款记录；一笔订单只支付该段一次。 */
'use strict';
function isLastMile(o){return o?.transport_leg==='last_mile'}
function lastMileChild(o){return state.dbOrders.find(x=>x.parent_order_id===o?.id&&isLastMile(x))}
function legLabel(o){return isLastMile(o)?'尾程 · 印尼仓 → 消费者':'头程 · 深圳仓 → 印尼仓'}
function settlementContext(o){
 if(!o)return '';
 const p=isLastMile(o)&&state.dbOrders.find(x=>x.id===o.parent_order_id),child=!isLastMile(o)&&lastMileChild(o);
 return `<div class="card section-space"><h3>${legLabel(o)}</h3>${p?`<p>关联头程：${esc(p.order_no)}。头程已结算，本尾程单只收配送费。</p>${state.role==='merchant'?orderAction(p,'fee','查看头程账单'):''}`:`<p>头程单仅结算深圳仓到印尼海外仓的运输及国内仓操作费；尾程配送另单核价、付款。</p>`}${o.overseas_received_at?notice('头程已入印尼海外仓',`${o.overseas_warehouse} · ${dateText(o.overseas_received_at)}。尚未代表消费者签收。`):''}${child?`<p>已关联尾程：${esc(child.order_no)} · ${esc(orderStatusLabel(child.status))}</p>${state.role==='merchant'?orderAction(child,'fee','进入尾程订单与付款'):warehouseOrderButton(child,warehouseStage(child)||'ship','进入尾程作业')}`:''}</div>`;
}
function lastMileRequest(o){
 if(!o||isLastMile(o)||!o.overseas_received_at||lastMileChild(o)||feeRecord(o)?.fee_breakdown_version!==3)return '';
 return `<div class="card section-space"><h3>申请尾程配送</h3><p>本次将整票头程货物配送至一个消费者地址，单独生成尾程订单。头程费用保持已结算，不重复收取。</p><form id="lastMileRequestForm" data-order-id="${esc(o.id)}"><div class="field"><label for="lastMileAddress">消费者收件地址</label><select id="lastMileAddress"><option value="">沿用头程预留地址：${esc(o.recipient_name)} · ${esc(o.destination_address)}</option>${state.addresses.filter(a=>a.country==='印度尼西亚').map(a=>`<option value="${esc(a.id)}">${esc(a.recipient_name)} · ${esc(a.address_line)}</option>`).join('')}</select></div><p class="page-note">创建后锁定本次地址；请在提交前核对。当前暂不支持一票货拆成多笔消费者配送。</p><button class="btn primary" type="submit">确认地址，创建尾程配送单</button></form></div>`;
}
const separateMerchantFee=merchantFee;
merchantFee=function(){
 const o=state.order.record;
 if(!isLastMile(o))return separateMerchantFee().replace('仓库确认费用后一次付款。','头程确认后支付头程；尾程另单结算。')+settlementContext(o)+lastMileRequest(o);
 const f=feeRecord(o);
 return shell('尾程订单与费用','印尼海外仓 → 消费者，本段独立付款。',button('返回我的订单','orders'))+settlementContext(o)+`<div class="card"><h3>${esc(o.order_no)}</h3>${status(orderStatusLabel(o.status),statusTone(o.status))}${transportFeesHtml(f)}${[['收件人',o.recipient_name],['联系电话',o.recipient_phone],['消费者地址',o.destination_address],['印尼发货仓',o.origin_warehouse_address]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${esc(v||'')}</b></div>`).join('')}<div class="form-actions">${orderAction(o,'tracking','查看尾程物流')}</div></div>`+merchantPaymentSection(o).replaceAll('仓库可继续打包','尾程仓库可继续出库').replaceAll('本单唯一应付','本尾程单应付');
};
const separatePaymentSection=merchantPaymentSection;
merchantPaymentSection=function(o){return separatePaymentSection(o).replaceAll('本单不再付款','本段不再付款').replaceAll('本单唯一应付','本段应付')};
const separateOrderTable=workspaceOrderTable;
workspaceOrderTable=function(orders){
 let html=separateOrderTable(orders);
 for(const o of orders){
  if(isLastMile(o))html=html.replace(esc(o.route_name),esc(o.route_name)+'<br><small>尾程独立结算</small>');
  else if(o.overseas_received_at)html=html.replace(/<tr>[\s\S]*?<\/tr>/g,row=>row.includes(esc(o.order_no))?row.replace(status(orderStatusLabel(o.status),statusTone(o.status)),status('头程已到印尼仓','blue')):row);
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
adminPaymentReview=function(){const r=paymentWorkspace.receipts.find(x=>x.id===paymentWorkspace.selected),o=r&&state.dbOrders.find(x=>x.id===r.order_id);return separateReview()+settlementContext(o)};
const separateBind=bind;
bind=function(){
 separateBind();
 const forms=[['lastMileRequestForm','merchant_create_last_mile',form=>({p_order_id:form.dataset.orderId,p_address_id:$('#lastMileAddress').value||null}),'尾程配送单已创建，等待独立报价'],['lastMileQuoteForm','warehouse_quote_last_mile',form=>({p_order_id:form.dataset.orderId,p_amount:Number($('#lastMileFee').value),p_note:$('#lastMileNote').value.trim()}),'尾程报价已确认，等待本段付款'],['overseasReceivedForm','warehouse_receive_overseas',form=>({p_order_id:form.dataset.orderId,p_location:$('#overseasLocation').value.trim()}),'头程已到印尼仓，商家可申请尾程配送'],['lastMileDeliveredForm','warehouse_complete_delivery',form=>({p_order_id:form.dataset.orderId,p_note:$('#lastMileDeliveredNote').value.trim()}),'消费者签收已登记']];
 for(const [id,rpc,args,message] of forms){const form=$('#'+id);if(form)form.onsubmit=e=>{e.preventDefault();paymentTask(form,async()=>{
  const owner=state.auth.user?.id,result=await rpcWorkspace(rpc,args(form));
  if(owner!==state.auth.user?.id)throw Error('登录账号已变化，请刷新核对');
  if(rpc==='merchant_create_last_mile'){state.activeOrderId=result.id;if(!await refreshDbState('fee'))throw Error('申请已提交，请刷新查看，勿重复操作')}
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

const legWarehouseContext=warehouseContext;warehouseContext=function(o){return legWarehouseContext(o)+`<p class="page-note">${legLabel(o)} · ${isLastMile(o)?'核对本段独立付款后出库':'到达印尼仓后登记到货，尾程另建配送单'}</p>`};
const legWarehouseRows=warehouseOrderRows;warehouseOrderRows=function(rows){let html=legWarehouseRows(rows);for(const o of rows)if(o.overseas_received_at)html=html.replace(/<tr>[\s\S]*?<\/tr>/g,row=>row.includes(esc(o.order_no))?row.replace(status(orderStatusLabel(o.status),statusTone(o.status)),status('头程已到印尼仓','blue')):row);return html};

const separatePageFrame=merchantPageFrame;
merchantPageFrame=function(html){const o=state.order.record;let frame=separatePageFrame(html);if(!o||!['fee','tracking'].includes(state.page))return frame;
 const tail=isLastMile(o);frame=frame.replace('一次付款',tail?'尾程付款':'头程付款');
 if(tail)frame=frame.replace('提交打包','申请尾程').replace('仓库确认','尾程报价').replace('打包出货','尾程出库').replace('运输签收','配送签收');
 else{frame=frame.replace('运输签收','运输至印尼仓');if(o.overseas_received_at)frame=frame.replace(status(orderStatusLabel(o.status),statusTone(o.status)),status('头程已到印尼仓','blue')).replace('class="current" aria-current="step"','class="done"');}
 return frame;
};
