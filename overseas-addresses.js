/* 平台印尼仓与尾程消费者地址分开；历史订单快照不重写。 */
'use strict';
function overseasAddressCard(w){
 if(!w)return notice('印尼仓暂不可用','请刷新数据，或联系运营维护平台印尼仓。');
 return `<div class="card section-space"><h3>${esc(w.name)}</h3>${w.is_test_address?notice('测试仓地址 · 禁止寄件','此地址、联系人及电话均为流程测试占位信息，不是实际可收货仓库。正式使用前请由运营替换。'):''}<p class="address-copy">${esc(w.country)} · ${esc(w.city)}<br>${esc(w.address_line)} ${esc(w.postal_code||'')}</p><div class="metric"><span>仓库联系人</span><b>${esc(w.contact_name)}</b></div><div class="metric"><span>联系电话</span><b>${esc(w.contact_phone)}</b></div></div>`;
}
function overseasPackingDestination(){
 const rows=safeRows(workspace.overseasWarehouses).filter(w=>w.is_active),selected=rows.find(w=>w.id===workspace.packingDraft?.address)||rows[0];
 return `<div class="field"><label for="packingAddress">头程目的地 · 平台印尼仓</label><select id="packingAddress" required>${rows.length?rows.map(w=>`<option value="${esc(w.id)}" ${selected?.id===w.id?'selected':''}>${esc(w.name)} · ${esc(w.city)}${w.is_test_address?'（测试占位）':''}</option>`).join(''):'<option value="">暂无可用印尼仓</option>'}</select></div><div id="overseasDestinationPreview">${overseasAddressCard(selected)}</div><p class="page-note">头程从深圳仓发往上述平台印尼仓。消费者地址在到仓后申请尾程配送时填写，尾程单独核价、付款。</p>`;
}
function readLastMileRecipient(){
 const value=id=>$('#'+id).value.trim();
 const r={recipient_name:value('lastMileName'),recipient_phone:value('lastMilePhone'),country:'印度尼西亚',city:value('lastMileCity'),postal_code:value('lastMilePostal'),address_line:value('lastMileLine')};
 if(!r.recipient_name||!r.recipient_phone||!r.city||!r.address_line)throw Error('请完整填写尾程消费者姓名、电话、城市和详细地址');
 return r;
}
const overseasMerchantOrders=merchantOrders;
merchantOrders=function(){return overseasMerchantOrders()+notice('尾程在哪里结算？','进入头程订单“详情”。仓库登记已到印尼仓后，详情中会出现“申请尾程配送”，填写消费者地址后生成独立尾程单；报价后在尾程单付款。')};
const overseasMerchantFee=merchantFee;
merchantFee=function(){
 const o=state.order.record;let html=overseasMerchantFee();if(!o||isLastMile(o))return html;
 if(o.destination_overseas_warehouse_id){html=html.replace('详细收货地址','头程目的地 · 印尼仓地址').replace('收件人 / 电话','印尼仓联系人 / 电话');if(o.destination_warehouse_snapshot?.is_test_address)html+=notice('本单目的地为测试仓 · 禁止寄件','此单印尼仓地址为虚拟占位信息，仅供测试，不可实际发货。');}
 if(html.includes('id="lastMileApplication"'))html=`<div class="card section-space"><div class="card-title"><h3>头程已到印尼仓，可以申请尾程</h3><button type="button" id="openLastMileApplication" class="btn primary">填写消费者地址，申请尾程配送</button></div><p>尾程将生成独立订单、单独报价和付款。</p></div>`+html;
 return html;
};
const overseasOrderTable=workspaceOrderTable;
workspaceOrderTable=function(orders){let html=overseasOrderTable(orders);for(const o of orders){if(isLastMile(o)||!o.overseas_received_at||feeRecord(o)?.fee_breakdown_version!==3)continue;const child=lastMileChild(o);html=html.replace(/<tr>[\s\S]*?<\/tr>/g,row=>row.includes(esc(o.order_no))?row.replace('</td></tr>',`${orderAction(child||o,'fee',child?lastMileLinkLabel(child):'申请尾程配送')}</td></tr>`):row)}return html};
const overseasAdminConfig=adminConfig;
adminConfig=function(){
 const rows=safeRows(workspace.overseasWarehouses);
 return overseasAdminConfig()+`<div class="card section-space"><h2>平台印尼仓地址配置</h2><p>新头程订单使用这里的仓地址；尾程消费者地址在申请配送时填写。修改不会覆盖已有订单地址快照。</p>${rows.map(w=>`<form data-overseas-config="${esc(w.id)}" data-version="${esc(w.updated_at)}" class="section-space"><h3>${esc(w.code)}</h3><div class="form-grid">${field('仓库名称','overseasName-'+w.id,w.name,'text','required maxlength="120"')}${field('城市','overseasCity-'+w.id,w.city,'text','required maxlength="120"')}${field('仓库联系人','overseasContact-'+w.id,w.contact_name,'text','required maxlength="120"')}${field('联系电话','overseasPhone-'+w.id,w.contact_phone,'text','required maxlength="80"')}${field('邮编','overseasPostal-'+w.id,w.postal_code,'text','maxlength="30"')}<div class="field full"><label for="overseasLine-${esc(w.id)}">印尼仓详细地址</label><textarea id="overseasLine-${esc(w.id)}" required maxlength="1000">${esc(w.address_line)}</textarea></div></div><p><label><input id="overseasTest-${esc(w.id)}" type="checkbox" ${w.is_test_address?'checked':''}> 测试占位地址（禁止寄件）</label></p><p><label><input id="overseasActive-${esc(w.id)}" type="checkbox" ${w.is_active?'checked':''}> 启用此仓</label></p><button class="btn primary" type="submit">保存印尼仓地址</button></form>`).join('')||notice('仓库资料未加载','请刷新，或检查印尼仓数据库更新是否已执行。')}</div>`;
};
const overseasBind=bind;
bind=function(){
 overseasBind();
 const jump=$('#openLastMileApplication');if(jump)jump.onclick=()=>$('#lastMileApplication').scrollIntoView({behavior:'smooth',block:'start'});
 const destination=$('#packingAddress');if(destination)destination.addEventListener('change',()=>{$('#overseasDestinationPreview').innerHTML=overseasAddressCard(workspace.overseasWarehouses.find(w=>w.id===destination.value))});
 const saved=$('#lastMileAddress');if(saved)saved.onchange=()=>{
  const a=state.addresses.find(x=>x.id===saved.value)||{};
  for(const [id,key] of [['lastMileName','recipient_name'],['lastMilePhone','recipient_phone'],['lastMileCity','city'],['lastMilePostal','postal_code'],['lastMileLine','address_line']])$('#'+id).value=a[key]||'';
 };
 document.querySelectorAll('[data-overseas-config]').forEach(form=>form.onsubmit=e=>{e.preventDefault();paymentTask(form,async()=>{
  const id=form.dataset.overseasConfig,v=key=>$('#overseas'+key+'-'+id).value.trim();
  await rpcWorkspace('admin_save_overseas_warehouse',{p_id:id,p_expected_updated_at:form.dataset.version,p_config:{name:v('Name'),city:v('City'),contact_name:v('Contact'),contact_phone:v('Phone'),postal_code:v('Postal'),address_line:v('Line'),is_test_address:$('#overseasTest-'+id).checked,is_active:$('#overseasActive-'+id).checked}});
  await loadMerchantWorkspace();if(workspace.errors.overseasWarehouses)throw Error('已保存，但读取失败，请刷新核对');render();toast('印尼仓地址已保存；历史订单地址不变');
 })});
};
