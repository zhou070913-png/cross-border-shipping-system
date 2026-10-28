/* 空运按计费重量，海运按体积；运价与历史确认金额分开保存。 */
'use strict';
const transportWorkspace={routeCode:'ID-AIR',busy:false};
const oldPackingEstimateHtml=packingEstimateHtml;
packingEstimateHtml=function(q,snapshot=false){
 if(q?.status!=='ready'||q.billingBasis!=='cbm')return oldPackingEstimateHtml(q,snapshot).replace('预估运费','预估头程运费').replace('人民币 · 仅供参考','人民币 · 头程及操作费小计')+notice('尾程费用待确认','印尼海外仓到消费者的尾程配送费尚未计入此预估；仓库确认头程后支付头程；到印尼仓后尾程单独核价付款。');
 return `<h3>${snapshot?'下单时海运费用预估':'海运费用预估'}</h3>${q.isTestRate?notice('测试运价','此报价只用于流程测试，正式使用前请由运营维护实际海运报价。'):''}<p class="estimate-total">${money(q.total)} <small>人民币 · 头程及操作费小计</small></p><div class="estimate-grid">${[['包裹数量',q.count+' 个'],['重量合计',formatWeight(q.weight)],['体积合计',Number(q.volumeCbm).toFixed(6)+' m³'],['计费体积',Number(q.billableCbm).toFixed(6)+' m³'],...(q.seaChargeRule==='higher_of_weight_volume'?[['按体积计算',money(q.seaVolumeCharge)],['按重量计算',money(q.seaWeightCharge)],['最终采用',q.seaWeightCharge>q.seaVolumeCharge?'重量费（较高）':q.seaWeightCharge<q.seaVolumeCharge?'体积费（较高）':'两项相同']]:[]),['预估头程海运费',money(q.shipping)],['国内仓操作费',money(q.handling)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}</div><p class="page-note">${esc(q.routeName||'')} · ${money(q.pricePerCbm)}/m³，最低 ${esc(q.minimumCbm)} m³。${q.seaChargeRule==='higher_of_weight_volume'?`重量单价 ${money(q.seaPricePerKg)}/kg；体积费与重量费取高。`:'按已填包裹外箱体积合计预估。'}此处不含尾程配送费。仓库确认头程后支付头程，尾程配送另单付款。</p>`;
};
const oldRatesView=merchantRates;
merchantRates=function(){
 const q=workspace.quote;
 if(q?.billingBasis!=='cbm')return oldRatesView().replace('参考合计','头程及操作费参考小计')+notice('尾程配送另列','此处未包含印尼海外仓到消费者的尾程费用，到印尼仓申请尾程后单独核价、付款。');
 let html=oldRatesView();
 const start=html.indexOf('<h3>参考费用明细</h3>'),end=html.lastIndexOf('</div></div>');
 if(start>=0&&end>=0)html=html.slice(0,start)+packingEstimateHtml(q)+notice('此处不收款','海运按立方米计费；此处不含印尼仓到消费者的尾程费用。')+html.slice(end);
 return html.replace('同一外箱的实重与体积重取大值。多箱订单以仓库逐箱实测结果为准。','海运按外箱体积合计计费，并适用最低计费体积；多箱订单以仓库逐箱实测结果为准。');
};
MerchantViews.rates=merchantRates;
function seaFeeDetails(f){
 if(f?.billing_basis!=='cbm')return '';
 return `<div class="card section-space"><h3>海运计费依据</h3>${f.pricing_snapshot?.is_test_rate?notice('测试运价记录','本单海运费用按测试运价确认，不代表正式承运商报价。'):''}${[['体积合计',Number(f.volume_cbm).toFixed(6)+' m³'],['计费体积',Number(f.billable_cbm).toFixed(6)+' m³'],['海运单价',money(f.pricing_snapshot?.price_per_cbm)+'/m³'],...(f.pricing_snapshot?.sea_charge_rule==='higher_of_weight_volume'?[['重量单价',money(f.pricing_snapshot.sea_price_per_kg)+'/kg'],['按体积计算',money(Math.round(Number(f.billable_cbm)*Number(f.pricing_snapshot.price_per_cbm)*100)/100)],['按重量计算',money(Math.round(Number(f.actual_weight_kg)*Number(f.pricing_snapshot.sea_price_per_kg)*100)/100)],['采用规则','体积费与重量费取高']]:[]),['头程海运费',money(f.shipping_fee)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}
const transportMerchantFee=merchantFee;
function transportFeeRows(f){
 if(f?.fee_breakdown_version===4)return [['尾程配送费 · 印尼仓 → 消费者',money(f.last_mile_fee)],['报价依据',esc(f.last_mile_note)],['本尾程单应付',money(f.total_amount)]];
 if(f?.fee_breakdown_version===3)return [['头程运输费 · 深圳仓 → 印尼海外仓',money(f.shipping_fee)],['国内仓操作费',money(f.handling_fee)],['本头程单应付',money(f.total_amount)],['尾程费用','到印尼仓后另建尾程单结算']];
 if(f?.fee_breakdown_version===2)return [['头程运输费',money(f.shipping_fee)],['国内仓操作费',money(f.handling_fee)],['已含尾程费',money(f.last_mile_fee)],['原账单合计',money(f.total_amount)]];
 return [['原订单运输费',money(f?.shipping_fee)],['仓库操作费',money(f?.handling_fee)],['原账单金额',money(f?.total_amount)],['结算说明',f?.confirmed_at?'历史账单未拆分，保留原金额':'头程待确认；尾程另单结算']];
}
function transportFeesHtml(f){return transportFeeRows(f).map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}
merchantFee=function(){
 const f=feeRecord(state.order.record);
 let html=transportMerchantFee();
 const old=[['运输费用',money(f?.shipping_fee)],['仓库操作费',money(f?.handling_fee)],['计费重量',formatWeight(f?.billable_weight_kg)],['体积重',formatWeight(f?.volume_weight_kg)],['唯一应付金额',money(f?.total_amount)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('');
 return html.replace(old,transportFeesHtml(f)+(f?.billing_basis==='cbm'?'':`<div class="metric"><span>计费重量</span><b>${formatWeight(f?.billable_weight_kg)}</b></div>`))+seaFeeDetails(f);
};
const transportWarehouseFees=warehouseActualFees;
warehouseActualFees=function(o){
 const f=feeRecord(o);
 if(f?.total_amount==null)return transportWarehouseFees(o);
 return `<div class="card section-space" data-warehouse-actual-fees><h3>仓库实际费用</h3>${transportFeesHtml(f)}<p class="page-note">头程单与尾程单各自核价、付款；本单已确认金额独立锁定。</p></div>`+seaFeeDetails(f);
};
const transportAdminReview=adminPaymentReview;
adminPaymentReview=function(customerId=null){const r=paymentWorkspace.receipts.find(r=>r.id===paymentWorkspace.selected&&(!customerId||state.dbOrders.some(o=>o.id===r.order_id&&o.merchant_id===customerId))),o=r&&state.dbOrders.find(o=>o.id===r.order_id);return transportAdminReview(customerId)+(o?`<div class="card section-space"><h3>本段费用核对</h3>${transportFeesHtml(feeRecord(o))}</div>`:'')};
adminConfig=function(){
 const route=workspace.routes.find(r=>r.route_code===transportWorkspace.routeCode)||workspace.routes[0];
 const heading=shell('线路与运价配置','分别维护海运 / 空运的普货和敏感货；已确认订单保留费用快照。');
 if(!route)return heading+notice('线路暂不可用','请刷新数据；若持续失败请联系管理员检查线路配置。');
 const sea=route.billing_basis==='cbm';
 return heading+`<div class="card"><div class="field"><label for="transportRoute">选择运输线路</label><select id="transportRoute">${workspace.routes.map(r=>`<option value="${esc(r.route_code)}" ${r.route_code===route.route_code?'selected':''}>${esc(r.route_name)}${r.is_active?'':'（已停用）'}</option>`).join('')}</select></div></div><div class="card section-space"><form id="transportRouteForm" data-code="${esc(route.route_code)}" data-version="${esc(route.updated_at)}"><h3>${esc(route.route_name)}</h3><div class="form-grid">${field('线路名称','transportName',route.route_name,'text','required maxlength="120"')}<div class="field"><label>运输方式</label><input value="${route.transport_mode==='sea'?'海运':'空运'}" readonly></div><div class="field"><label>计费方式</label><input value="${sea?(route.sea_charge_rule==='higher_of_weight_volume'?'体积费与重量费取高':'立方米（m³）'):'实际重量与体积重取大（kg）'}" readonly></div>${sea?field('海运单价（CNY/m³）','transportCbmPrice',route.price_per_cbm,'number','required min="0.01" step="0.01"')+field('最低计费体积（m³）','transportMinCbm',route.minimum_cbm,'number','required min="0.000001" step="0.000001"')+(route.sea_charge_rule==='higher_of_weight_volume'?field('海运重量单价（CNY/kg）','transportSeaWeightPrice',route.sea_price_per_kg,'number','required min="0.01" step="0.01"'):''):field('首重（kg）','transportFirstWeight',route.first_weight_kg,'number','required min="0.001" step="0.001"')+field('首重价格（CNY）','transportFirstPrice',route.first_price,'number','required min="0" step="0.01"')+field('续重价格（CNY/kg）','transportAdditional',route.additional_price_per_kg,'number','required min="0" step="0.01"')+field('体积重系数','transportDivisor',route.volume_divisor,'number','required min="1" step="1"')}${field('国内仓操作费（CNY）','transportHandling',route.handling_fee,'number','required min="0" step="0.01"')}<div class="field full"><label for="transportNotes">计费说明</label><textarea id="transportNotes" maxlength="2000">${esc(route.notes||'')}</textarea></div></div><p><label><input id="transportActive" type="checkbox" ${route.is_active?'checked':''}> 启用线路，允许商家选择</label></p><p><label><input id="transportTest" type="checkbox" ${route.is_test_rate?'checked':''}> 测试运价（商家可见提示）</label></p><p class="page-note">运价只用于计算头程及国内仓操作费。海运按体积费与重量费取高，重量和体积单价分别维护；测试运价正式使用前请替换。尾程按消费者地址单独核价，在尾程配送单中独立确认。</p><button class="btn primary" type="submit">保存本条线路</button></form></div>`;
};
const transportPreviousBind=bind;
bind=function(){
 transportPreviousBind();
 const routeSelect=$('#transportRoute');if(routeSelect)routeSelect.onchange=()=>{if(transportWorkspace.busy)return;transportWorkspace.routeCode=routeSelect.value;render()};
 const form=$('#transportRouteForm');if(form)form.onsubmit=e=>{e.preventDefault();if(transportWorkspace.busy)return;paymentTask(form,async()=>{
  transportWorkspace.busy=true;
  try{
   const r=workspace.routes.find(r=>r.route_code===form.dataset.code);if(!r)throw Error('线路已变化，请刷新');
   const sea=r.billing_basis==='cbm',num=id=>Number($('#'+id).value);
   const cfg={...r,route_name:$('#transportName').value.trim(),handling_fee:num('transportHandling'),notes:$('#transportNotes').value.trim(),is_active:$('#transportActive').checked,is_test_rate:$('#transportTest').checked};
   if(sea)Object.assign(cfg,{price_per_cbm:num('transportCbmPrice'),minimum_cbm:num('transportMinCbm'),...(r.sea_charge_rule==='higher_of_weight_volume'?{sea_price_per_kg:num('transportSeaWeightPrice')}:{})});
   else Object.assign(cfg,{first_weight_kg:num('transportFirstWeight'),first_price:num('transportFirstPrice'),additional_price_per_kg:num('transportAdditional'),volume_divisor:num('transportDivisor')});
   await rpcWorkspace('admin_save_transport_route',{p_config:cfg,p_expected_updated_at:form.dataset.version});await loadMerchantWorkspace();
   if(workspace.errors.routes)throw Error('已保存，但刷新失败，请刷新核对');render();toast('线路运价已保存');
  }finally{transportWorkspace.busy=false}
 })};
 const rate=$('#rateForm');if(rate)rate.onsubmit=e=>{e.preventDefault();
  const r=workspace.routes.find(r=>r.route_code===$('#rateRoute').value);
  const weight=Number($('#rateWeight').value),length=Number($('#rateLength').value),width=Number($('#rateWidth').value),height=Number($('#rateHeight').value);
  if(![weight,length,width,height].every(v=>Number.isFinite(v)&&v>0)){toast('请填写有效的正数重量和尺寸');return}
  const q=estimatePacking([{declared_weight_kg:weight,declared_length_cm:length,declared_width_cm:width,declared_height_cm:height}],r);
  if(q.status!=='ready'){toast('当前线路计费资料不完整，请联系运营');return}
  workspace.quote={...q,weight,length,width,height,updatedAt:r.updated_at};render();
 };
};
