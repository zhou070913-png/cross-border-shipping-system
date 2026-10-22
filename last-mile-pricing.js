/* 印尼尾程地区参考距离试算；仓库核对距离后由数据库核价。 */
'use strict';
const lastMilePricing={adminZoneId:null};
function deliveryZones(order){
 const parent=isLastMile(order)?state.dbOrders.find(o=>o.id===order.parent_order_id):order;
 return safeRows(workspace.lastMileZones).filter(z=>z.is_active&&z.warehouse_id===parent?.destination_overseas_warehouse_id);
}
function distanceAmount(zone,distance){
 const d=Number(distance),base=Number(zone?.base_fee),included=Number(zone?.included_distance_km),unit=Number(zone?.price_per_km);
 if(!zone||!zone.is_active||[zone.base_fee,zone.included_distance_km,zone.price_per_km,distance].some(v=>v==null||v==='')||![d,base,included,unit].every(Number.isFinite)||d<0||d>50000||Math.abs(d*100-Math.round(d*100))>1e-6||base<=0||base>=10000000||included<0||included>50000||unit<0||unit>=100000)throw Error('请填写有效距离，并选择已启用且价格完整的配送地区。');
 const amount=Math.round((base+Math.max(0,d-included)*unit+Number.EPSILON)*100)/100;
 if(amount<=0||amount>=10000000)throw Error('尾程费用超出范围，请联系运营核对。');
 return amount;
}
function distanceQuoteHtml(zone,distance,confirmed=false){
 if(!zone)return notice('请选择配送地区','选择消费者所在地区后，显示按地区参考距离计算的尾程预估。');
 let amount;try{amount=distanceAmount({...zone,is_active:true},distance)}catch(e){return notice('暂无法计算尾程费',e.message)}
 const excess=Math.max(0,Number(distance)-Number(zone.included_distance_km));
 return `${zone.is_test_rate?notice('尾程测试运价','当前距离和价格供流程测试，非地图导航距离或承运商实际报价。跨岛参考距离不代表公路里程。'):''}<h3>${confirmed?'尾程已确认计费依据':'尾程费用预估'}</h3><p class="estimate-total">${money(amount)}<small> CNY · ${confirmed?'本尾程单':'预估，待仓库确认'}</small></p>${[['配送地区',esc(zone.name)],['距离',esc(distance)+' km'+(confirmed?'（仓库核对）':'（参考值）')],['起步费',money(zone.base_fee)+' / 含 '+esc(zone.included_distance_km)+' km'],['超出距离',excess.toFixed(2)+' km'],['超出每公里',money(zone.price_per_km)+'/km']].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}<p class="page-note">${money(zone.base_fee)} ＋ ${excess.toFixed(2)} km × ${money(zone.price_per_km)}/km ＝ ${money(amount)}。${esc(zone.notes||'')} ${confirmed?'本账单保留确认时运价，后续改价不影响本单。':'仅含尾程配送；仓库核对距离后再确认应付金额，每段独立付款。'}</p>`;
}
function orderDistanceFeesHtml(o){
 const f=feeRecord(o),s=f?.pricing_snapshot;
 if(!isLastMile(o)||s?.type!=='last_mile_distance')return '';
 return `<div class="card section-space">${distanceQuoteHtml(s.zone,s.distance_km,!!f.confirmed_at)}${s.distance_note?`<p>距离核对依据：${esc(s.distance_note)}</p>`:''}${!f.confirmed_at?notice('下单时预估 · 尚未付款','此处保留下单时的地区参考距离和运价。仓库核对实际配送距离后生成最终尾程费用；运营改价不会伪装为已确认账单。'):''}</div>`;
}
const distanceLastMileRequest=lastMileRequest;
lastMileRequest=function(o){
 let html=distanceLastMileRequest(o);if(!html.includes('id="lastMileRequestForm"'))return html;
 const zones=deliveryZones(o),selection=`<div class="field section-space"><label for="lastMileZone">尾程配送地区</label><select id="lastMileZone" required><option value="">请选择消费者所在地区</option>${zones.map(z=>`<option value="${esc(z.id)}">${esc(z.name)}${z.is_test_rate?'（测试运价）':''}</option>`).join('')}</select></div><div id="lastMileEstimate" class="section-space">${workspace.errors.lastMileZones?workspaceError('lastMileZones'):zones.length?distanceQuoteHtml(null):notice('暂无可用地区运价','请联系运营在系统配置中维护此印尼仓的尾程地区及运价。')}</div>`;
 html=html.replace('<div class="form-grid section-space">',selection+'<div class="form-grid section-space">');
 return zones.length?html:html.replace('type="submit">确认消费者地址','type="submit" disabled>确认消费者地址');
};
const distanceMerchantFee=merchantFee;
merchantFee=function(){return distanceMerchantFee()+orderDistanceFeesHtml(state.order.record)};
const distanceTransportFeeRows=transportFeeRows;
transportFeeRows=function(f){
 if(f?.pricing_snapshot?.type==='last_mile_distance'&&!f.confirmed_at)return [['尾程配送费预估',money(f.estimated_total)],['核价状态','待仓库核对配送距离'],['本尾程单应付','仓库确认后生成']];
 return distanceTransportFeeRows(f);
};
const distanceWarehouseFees=warehouseActualFees;
warehouseActualFees=function(o){return (isLastMile(o)&&!feeRecord(o)?.confirmed_at?`<div class="card section-space"><h3>尾程费用待确认</h3>${notice('核对地区与配送距离','在本尾程单中核对配送地区、距离及依据，确认后生成商家和仓库共用的尾程费用。')}</div>`:distanceWarehouseFees(o))+orderDistanceFeesHtml(o)};
const distanceWarehouseConfirm=warehouseConfirm;
warehouseConfirm=function(){
 const o=warehouseSelected();
 if(!isLastMile(o)||o.status!=='warehouse_received')return distanceWarehouseConfirm();
 if(!o.delivery_zone_id&&!state.dbOrders.find(p=>p.id===o.parent_order_id)?.destination_overseas_warehouse_id)return distanceWarehouseConfirm()+notice('历史尾程单','头程未关联平台印尼仓，继续使用历史手工核价，并记录依据。');
 const zones=deliveryZones(o),selected=o.delivery_zone_id?zones.find(z=>z.id===o.delivery_zone_id):null;
 const available=o.delivery_zone_id?zones.filter(z=>z.id===o.delivery_zone_id):zones;
 return warehouseContext(o)+shell('确认尾程地区与距离费用','核对消费者地区与配送距离，系统按运营运价计算。')+settlementContext(o)+
 `<div class="card"><p>收件人：${esc(o.recipient_name)} · ${esc(o.recipient_phone)}<br>消费者地址：${esc(o.destination_address)}<br>发货仓：${esc(o.origin_warehouse_address)}</p>${workspaceError('lastMileZones')}<form id="distanceLastMileQuoteForm" data-order-id="${esc(o.id)}"><div class="form-grid"><div class="field"><label for="distanceQuoteZone">配送地区</label><select id="distanceQuoteZone" required><option value="">请选择配送地区</option>${available.map(z=>`<option value="${esc(z.id)}" ${selected?.id===z.id?'selected':''}>${esc(z.name)}</option>`).join('')}</select></div>${field('仓库核对配送距离（km）','distanceQuoteKm',selected?.reference_distance_km??'','number','required min="0" max="50000" step="0.01"')}${field('距离核对依据 / 承运商说明','distanceQuoteNote','','text','required minlength="2" maxlength="300" placeholder="测试时可填写：采用地区测试参考距离"')}</div><div id="distanceQuotePreview" class="section-space">${distanceQuoteHtml(selected,selected?.reference_distance_km)}</div>${!available.length?notice('配送地区已停用或未配置','请联系运营核对此单地区，启用或维护运价后刷新；不会套用其他地区费用。'):''}<p class="page-note">地区参考距离不代表地图实际距离；请核对消费者地址，并记录所用距离的依据。确认后商家按本段金额独立付款。</p><button class="btn primary" type="submit" ${!available.length?'disabled':''}>确认尾程费用，通知商家付款</button></form></div>`+orderDistanceFeesHtml(o);
};
// 仓库订单列表直接显示本段金额，未确认时明确显示预估。
const distanceWarehouseRows=warehouseOrderRows;
warehouseOrderRows=function(rows){
 let html=distanceWarehouseRows(rows).replace('<th>状态</th>','<th>本段费用（CNY）</th><th>状态</th>');
 for(const o of rows){const f=feeRecord(o),amount=f?.total_amount??(f?.pricing_snapshot?.type==='last_mile_distance'?f.estimated_total:null);html=html.replace(/<tr>[\s\S]*?<\/tr>/g,row=>row.includes(esc(o.order_no))?row.replace(`<td>${orderProgressHtml(o)}</td>`,`<td>${money(amount)}${amount!=null&&!f?.confirmed_at?'<br><small>预估，待确认</small>':''}</td><td>${orderProgressHtml(o)}</td>`):row)}
 return html;
};
function lastMileAdminPanel(){
 const rows=safeRows(workspace.lastMileZones),z=rows.find(z=>z.id===lastMilePricing.adminZoneId)||null,warehouses=safeRows(workspace.overseasWarehouses);
 return `<div class="card section-space" id="lastMilePricingConfig"><h2>印尼尾程地区与距离运价</h2><p>按发货仓和配送地区分别维护；费用＝起步费＋超出起步里程的公里数×每公里价格，币种为 CNY。新报价使用当前配置，已确认账单保留原价格。</p>${workspaceError('lastMileZones')}<div class="field"><label for="adminLastMileZone">编辑地区 / 新增地区</label><select id="adminLastMileZone"><option value="">＋ 新增配送地区</option>${rows.map(r=>`<option value="${esc(r.id)}" ${z?.id===r.id?'selected':''}>${esc(r.name)}${r.is_active?'':'（停用）'}${r.is_test_rate?' · 测试':''}</option>`).join('')}</select></div><form id="lastMileZoneConfigForm" data-id="${esc(z?.id||'')}" data-version="${esc(z?.updated_at||'')}"><div class="form-grid section-space"><div class="field"><label for="zoneWarehouse">印尼发货仓</label><select id="zoneWarehouse" required ${z?'disabled':''}>${warehouses.filter(w=>w.is_active||w.id===z?.warehouse_id).map(w=>`<option value="${esc(w.id)}" ${w.id===z?.warehouse_id?'selected':''}>${esc(w.name)}</option>`).join('')}</select></div>${field('地区名称','zoneName',z?.name||'','text','required maxlength="120"')}${field('参考配送距离（km）','zoneReference',z?.reference_distance_km??30,'number','required min="0" max="50000" step="0.01"')}${field('起步包含距离（km）','zoneIncluded',z?.included_distance_km??10,'number','required min="0" max="50000" step="0.01"')}${field('起步费（CNY）','zoneBase',z?.base_fee??20,'number','required min="0.01" max="9999999" step="0.01"')}${field('超出每公里价格（CNY/km）','zoneUnit',z?.price_per_km??0.5,'number','required min="0" max="99999" step="0.01"')}<div class="field full"><label for="zoneNotes">适用范围 / 距离说明</label><textarea id="zoneNotes" maxlength="1000">${esc(z?.notes||'测试参考距离，正式使用前请核实配送范围及运价。')}</textarea></div></div><p><label><input id="zoneActive" type="checkbox" ${!z||z.is_active?'checked':''}> 启用该地区</label></p><p><label><input id="zoneTest" type="checkbox" ${!z||z.is_test_rate?'checked':''}> 测试距离和运价（客户可见）</label></p><p class="page-note">参考距离用于商家预估，仓库最终核对距离。当前未接地图测距，不支持自动跨岛路线规划；未覆盖地区请新增运价后再报价。</p><button type="submit" class="btn primary">${z?'保存地区运价':'新增地区运价'}</button></form>${rows.length?`<div class="table-wrap section-space"><table class="table"><thead><tr><th>地区</th><th>参考距离</th><th>起步 / 含公里</th><th>超出每公里</th><th>参考配送费</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}${r.is_test_rate?' · 测试':''}${r.is_active?'':' · 已停用'}</td><td>${esc(r.reference_distance_km)} km</td><td>${money(r.base_fee)} / ${esc(r.included_distance_km)} km</td><td>${money(r.price_per_km)}</td><td>${money(distanceAmount({...r,is_active:true},r.reference_distance_km))}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`;
}
const distanceAdminConfig=adminConfig;
adminConfig=function(){return distanceAdminConfig()+lastMileAdminPanel()};
const distanceBind=bind;
bind=function(){
 distanceBind();
 const request=$('#lastMileRequestForm'),zoneSelect=$('#lastMileZone');
 if(request&&zoneSelect){
  zoneSelect.onchange=()=>{const z=deliveryZones(state.order.record).find(z=>z.id===zoneSelect.value);$('#lastMileEstimate').innerHTML=distanceQuoteHtml(z,z?.reference_distance_km)};
  request.onsubmit=e=>{e.preventDefault();paymentTask(request,async()=>{
   const owner=state.auth.user?.id,z=deliveryZones(state.order.record).find(z=>z.id===zoneSelect.value);if(!z)throw Error('请选择有效配送地区');
   const result=await rpcWorkspace('merchant_create_distance_last_mile',{p_order_id:request.dataset.orderId,p_recipient:readLastMileRecipient(),p_zone_id:z.id,p_expected_zone_version:z.updated_at});
   if(owner!==state.auth.user?.id)throw Error('登录账号已变化，请刷新核对');state.activeOrderId=result.id;
   if(!await refreshDbState('fee'))throw Error('尾程已创建，请刷新核对，勿重复提交');toast('尾程订单已创建，预估费可查看，待仓库确认距离与费用');
  })};
 }
 const quote=$('#distanceLastMileQuoteForm');
 if(quote){
  const select=$('#distanceQuoteZone'),km=$('#distanceQuoteKm'),zones=deliveryZones(warehouseSelected());
  const preview=()=>{const z=zones.find(z=>z.id===select.value);$('#distanceQuotePreview').innerHTML=distanceQuoteHtml(z,km.value)};
  select.onchange=()=>{km.value=zones.find(z=>z.id===select.value)?.reference_distance_km??'';preview()};km.oninput=preview;
  quote.onsubmit=e=>{e.preventDefault();paymentTask(quote,async()=>{
   const z=zones.find(z=>z.id===select.value);distanceAmount(z,km.value);
   await rpcWorkspace('warehouse_quote_last_mile_distance',{p_order_id:quote.dataset.orderId,p_zone_id:z.id,p_distance_km:Number(km.value),p_distance_note:$('#distanceQuoteNote').value.trim(),p_expected_zone_version:z.updated_at});
   if(!await refreshDbState())throw Error('费用已确认，请刷新核对，勿重复提交');toast('尾程费用已确认，商家与仓库共用此账单');
  })};
 }
 const admin=$('#adminLastMileZone');if(admin)admin.onchange=()=>{lastMilePricing.adminZoneId=admin.value||null;render()};
 const config=$('#lastMileZoneConfigForm');if(config)config.onsubmit=e=>{e.preventDefault();paymentTask(config,async()=>{
  const c={warehouse_id:$('#zoneWarehouse').value,name:$('#zoneName').value.trim(),reference_distance_km:Number($('#zoneReference').value),included_distance_km:Number($('#zoneIncluded').value),base_fee:Number($('#zoneBase').value),price_per_km:Number($('#zoneUnit').value),notes:$('#zoneNotes').value.trim(),is_active:$('#zoneActive').checked,is_test_rate:$('#zoneTest').checked};
  distanceAmount({...c,is_active:true},c.reference_distance_km);
  const result=await rpcWorkspace('admin_save_last_mile_zone',{p_id:config.dataset.id||null,p_expected_updated_at:config.dataset.version||null,p_config:c});
  lastMilePricing.adminZoneId=result.id;await loadMerchantWorkspace();if(workspace.errors.lastMileZones)throw Error('已保存但读取失败，请刷新核对');render();toast('尾程地区运价已保存，已确认账单金额保持不变');
 })};
};
