/* 多箱运输试算：复用下单及仓库相同的运价，不写入订单和付款。 */
'use strict';
const freightCalculator={owner:null,routeCode:'',boxes:[],quote:null,error:''};
const emptyFreightBox=()=>({length:'',width:'',height:'',weight:'',quantity:'1'});
function cargoTypeLabel(route){return route?.cargo_type==='sensitive'?'敏感货':'普货'}
function freightChannelLabel(route){const type=cargoTypeLabel(route);return route.route_name.includes(type)?route.route_name:`${route.route_name} · ${type}`}
function freightChannels(){return workspace.routes.filter(r=>r.is_active&&r.route_code.startsWith('ID-')&&r.transport_mode!=='last_mile')}
function resetFreightCalculator(){Object.assign(freightCalculator,{owner:state.auth.user?.id||null,routeCode:freightChannels()[0]?.route_code||'',boxes:[emptyFreightBox()],quote:null,error:''})}
function calculateFreight(boxes,route){
 if(!route||!route.is_active)throw Error('当前渠道未配置或已停用，请刷新后重选。');
 if(!Array.isArray(boxes)||!boxes.length||boxes.length>20)throw Error('请填写1至20组箱子。');
 const parcels=[],details=[];
 for(const [index,box] of boxes.entries()){
  const dimensions=['length','width','height'].map(k=>Number(box[k])),weight=Number(box.weight),quantity=Number(box.quantity);
  if(!dimensions.every(n=>Number.isFinite(n)&&n>0&&n<=10000&&Math.abs(n*100-Math.round(n*100))<1e-6)||!Number.isFinite(weight)||weight<=0||weight>10000||Math.abs(weight*1000-Math.round(weight*1000))>1e-6)throw Error(`第${index+1}组：请填有效重量及完整长宽高；重量最多3位、尺寸最多2位小数，均不超过10000。`);
  if(!Number.isInteger(quantity)||quantity<1||quantity>100||parcels.length+quantity>1000)throw Error('每组箱数须为1至100的整数，总箱数不超过1000。');
  const [length,width,height]=dimensions;
  for(let i=0;i<quantity;i++)parcels.push({declared_weight_kg:weight,declared_length_cm:length,declared_width_cm:width,declared_height_cm:height});
  details.push({index:index+1,quantity,weight:weight*quantity,cbm:length*width*height*quantity/1000000});
 }
 const q=estimatePacking(parcels,route);
 if(q.status!=='ready'||![q.total,q.shipping,q.handling].every(Number.isFinite)||q.total>=10000000)throw Error('渠道计费资料不完整或金额超出范围，请联系运营核对。');
 return {...q,details,cargoType:route.cargo_type||'general'};
}
function freightResultHtml(){
 const {quote:q,error}=freightCalculator;
 if(error)return notice('暂无法试算',error);
 if(!q)return emptyState('填写后查看预估费用','选择运输渠道，填写每组外箱的长宽高、重量及箱数。');
 const sea=q.billingBasis==='cbm';
 return `${q.isTestRate?notice('测试运价 · 仅供流程测试','本渠道尚为测试价格，正式寄件前请联系运营确认实际报价。'):''}<p class="page-note">${esc(q.routeName)} · ${cargoTypeLabel({cargo_type:q.cargoType})}</p><p class="estimate-total">${money(q.total)}<small> CNY · 头程及国内仓操作费</small></p>${[
 ['外箱总数',q.count+' 箱'],['总实重',formatWeight(q.weight)],['总体积',q.volumeCbm.toFixed(6)+' m³'],
 ...(sea?[['计费体积',q.billableCbm.toFixed(6)+' m³']]:[['总体积重',formatWeight(q.volume)],['计费重量',formatWeight(q.billable)]]),
 ...(sea&&q.seaChargeRule==='higher_of_weight_volume'?[['按体积计算',money(q.seaVolumeCharge)],['按重量计算',money(q.seaWeightCharge)],['最终采用',q.seaWeightCharge>q.seaVolumeCharge?'重量费（较高）':q.seaWeightCharge<q.seaVolumeCharge?'体积费（较高）':'两项相同']]:[]),['预估头程运输费',money(q.shipping)],['国内仓操作费 · 每票',money(q.handling)]
 ].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}
 <details class="section-space"><summary>查看计算依据和分箱明细</summary><p class="page-note">${sea?`总体积与最低 ${esc(q.minimumCbm)} m³ 取大，乘以 ${money(q.pricePerCbm)}/m³。${q.seaChargeRule==='higher_of_weight_volume'?`总重量 × ${money(q.seaPricePerKg)}/kg；体积费和重量费取高，非相加。`:''}`:`总体积重＝各箱长×宽×高×箱数之和 ÷ ${esc(q.volumeDivisor)}；计费重量＝总实重与总体积重取大。首重 ${esc(q.firstWeight)} kg / ${money(q.firstPrice)}，超出部分 ${money(q.additionalPrice)}/kg。`} 运价更新时间：${dateText(q.pricingUpdatedAt)}</p>${q.details.map(d=>`<div class="metric"><span>第${d.index}组 · ${d.quantity}箱</span><b>${formatWeight(d.weight)} / ${d.cbm.toFixed(6)} m³</b></div>`).join('')}</details>
 ${notice('不含尾程配送费','此处预估深圳仓到平台印尼仓的头程及国内仓操作费。印尼仓到消费者的尾程另建订单核价付款；不含未配置的其他附加费用。')}<p class="page-note">参考价不锁价、不收款；最终以仓库实际确认的重量、尺寸及费用为准。</p>`;
}
merchantRates=function(){
 if(freightCalculator.owner!==(state.auth.user?.id||null)||!freightCalculator.boxes.length)resetFreightCalculator();
 const routes=freightChannels(),c=freightCalculator,warehouse=workspace.warehouses.find(w=>w.code==='SZ-LG-01'&&w.is_active);
 return shell('运输计算器','先估算，再寄件。支持海运 / 空运、普货 / 敏感货和多箱试算。',button('去预报包裹','pre-advise',true))+workspaceError('routes')+
 `<div class="freight-layout"><section class="card"><form id="freightCalculatorForm"><div class="form-grid"><div class="field"><label>运输区间</label><input readonly value="深圳仓 → 平台印尼仓"></div><div class="field"><label for="freightChannel">运输渠道</label><select id="freightChannel" required><option value="">请选择渠道</option>${routes.map(r=>`<option value="${esc(r.route_code)}" ${r.route_code===c.routeCode?'selected':''}>${esc(freightChannelLabel(r))}${r.is_test_rate?'（测试运价）':''}</option>`).join('')}</select></div></div><p class="page-note">发货仓：${esc(warehouse?.name||'深圳仓')}。尺寸单位 cm，重量单位 kg；请填写含包装的外箱尺寸。普货 / 敏感货的承运范围以仓库核实为准。</p><div id="freightBoxes">${c.boxes.map((b,i)=>`<fieldset class="freight-box"><legend>第 ${i+1} 组外箱</legend><div class="freight-box-fields">${[['length','长（cm）'],['width','宽（cm）'],['height','高（cm）'],['weight','每箱实重（kg）'],['quantity','相同外箱数']].map(([k,label])=>`<div class="field"><label for="freight-${i}-${k}">${label}</label><input id="freight-${i}-${k}" data-freight-box="${i}" data-freight-key="${k}" type="number" required value="${esc(b[k])}" min="${k==='quantity'?1:k==='weight'?0.001:0.01}" max="${k==='quantity'?100:10000}" step="${k==='quantity'?1:k==='weight'?0.001:0.01}"></div>`).join('')}</div>${c.boxes.length>1?`<button class="btn small ghost freight-remove" type="button" data-remove-freight-box="${i}">删除此组</button>`:''}</fieldset>`).join('')}</div><div class="form-actions"><button class="btn primary" type="submit" ${!routes.length?'disabled':''}>计算预估费用</button><button class="btn ghost" id="freightAddBox" type="button" ${c.boxes.length>=20?'disabled':''}>＋ 添加一组箱子</button><button class="btn ghost" id="freightReset" type="button">重置</button></div><p class="page-note">海运分别计算体积费和重量费并取高；空运按总实重与总体积重取大。国内仓操作费每票收取一次。合包后的外箱可能变化，最终以仓库测量结果为准。</p></form></section><aside class="card freight-result"><h3>预估费用明细</h3><div id="freightResult" aria-live="polite">${freightResultHtml()}</div></aside></div>`;
};
MerchantViews.rates=merchantRates;
navs.merchant=navs.merchant.filter(([id])=>id!=='rates');
navs.merchant.splice(navs.merchant.findIndex(([id])=>id==='dashboard')+1,0,['rates','运输计算器']);
function rememberFreightInputs(){
 const select=$('#freightChannel');if(select)freightCalculator.routeCode=select.value;
 document.querySelectorAll('[data-freight-box]').forEach(input=>{const b=freightCalculator.boxes[Number(input.dataset.freightBox)];if(b)b[input.dataset.freightKey]=input.value});
}
function clearFreightQuote(){freightCalculator.quote=null;freightCalculator.error='';const result=$('#freightResult');if(result)result.innerHTML=freightResultHtml()}
const calculatorPreviousBind=bind;
bind=function(){
 calculatorPreviousBind();
 const form=$('#freightCalculatorForm');if(!form)return;
 form.oninput=()=>{rememberFreightInputs();clearFreightQuote()};
 $('#freightChannel').onchange=()=>{rememberFreightInputs();clearFreightQuote()};
 form.onsubmit=e=>{e.preventDefault();rememberFreightInputs();try{freightCalculator.quote=calculateFreight(freightCalculator.boxes,workspace.routes.find(r=>r.route_code===freightCalculator.routeCode));freightCalculator.error=''}catch(error){freightCalculator.quote=null;freightCalculator.error=error.message}$('#freightResult').innerHTML=freightResultHtml()};
 $('#freightAddBox').onclick=()=>{rememberFreightInputs();if(freightCalculator.boxes.length>=20)return;freightCalculator.boxes.push(emptyFreightBox());clearFreightQuote();render()};
 $('#freightReset').onclick=()=>{resetFreightCalculator();render()};
 document.querySelectorAll('[data-remove-freight-box]').forEach(el=>el.onclick=()=>{rememberFreightInputs();freightCalculator.boxes.splice(Number(el.dataset.removeFreightBox),1);clearFreightQuote();render()});
};
// 空运测试价格也应在合包估算中可见。
const cargoPackingEstimate=packingEstimateHtml;
packingEstimateHtml=function(q,snapshot=false){return (q?.status==='ready'&&q.isTestRate&&q.billingBasis!=='cbm'?notice('测试运价','此渠道价格仅供流程测试，正式寄件前请联系运营确认报价。'):'')+cargoPackingEstimate(q,snapshot)};
const cargoAdminConfig=adminConfig;
adminConfig=function(){const r=workspace.routes.find(r=>r.route_code===transportWorkspace.routeCode)||workspace.routes[0];return cargoAdminConfig()+(r?notice('渠道货物类型：'+cargoTypeLabel(r),'每条渠道分别维护运价和启停；变更只影响后续核价，已确认费用保留原快照。'):'')};
