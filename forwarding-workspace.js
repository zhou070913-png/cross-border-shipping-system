/* 海外仓整包转寄开发版：实际外箱库存与国内原包裹分开，所有写操作均由数据库校验。 */
'use strict';
const forwarding={owner:null,ready:false,error:null,packages:[],items:[],staff:[],selected:new Set(),headId:null,warehouse:'',query:'',tab:'all',requestId:null,busy:false};
Object.assign(pageRoles,{'overseas-stock':'merchant','forwarding-request':'merchant','overseas-receive':'warehouse','overseas-stock-warehouse':'warehouse'});
navs.merchant.splice(navs.merchant.findIndex(([id])=>id==='orders')+1,0,['overseas-stock','海外仓']);
navs.warehouse.splice(1,0,['overseas-receive','海外仓到货'],['overseas-stock-warehouse','海外仓包裹']);
const forwardingStockLabels={available:'可转寄',reserved:'已占用',dispatched:'已出库',delivered:'已签收'};
function forwardingOwner(){return `${state.auth.user?.id||''}:${state.role}`}
function resetForwarding(){Object.assign(forwarding,{owner:forwardingOwner(),ready:false,error:null,packages:[],items:[],staff:[],selected:new Set(),headId:null,warehouse:'',query:'',tab:'all',requestId:null})}
async function forwardingRows(table){
 const rows=[];
 for(let offset=0;;offset+=500){let query=window.MospaceSupabase.getClient().from(table).select('*').order('created_at',{ascending:false});query=table==='overseas_packages'?query.order('id',{ascending:false}):table==='forwarding_order_packages'?query.order('order_id').order('package_id'):query.order('user_id').order('warehouse_id');const {data,error}=await query.range(offset,offset+499);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)return rows}
}
async function readForwardingSnapshot(){
 const [packages,items,staff]=await Promise.all(['overseas_packages','forwarding_order_packages','overseas_warehouse_staff'].map(forwardingRows));
 return {packages,items,staff};
}
function applyForwardingSnapshot(snapshot){Object.assign(forwarding,snapshot);forwarding.error=null}
const forwardingLoad=loadMerchantWorkspace;
loadMerchantWorkspace=async function(){
 const owner=forwardingOwner();if(forwarding.owner!==owner)resetForwarding();
 const previous=forwardingLoad();
 const load=async()=>{if(owner!==forwardingOwner()||!state.auth.user)return;
 try{
  const version=await rpcWorkspace('forwarding_capabilities',{});if(version!==1)throw Error('数据库尚未启用整包转寄');
  const snapshot=await readForwardingSnapshot();
  if(owner!==forwardingOwner())return;applyForwardingSnapshot(snapshot);forwarding.ready=true;
  if(state.role==='warehouse')workspace.overseasWarehouses=await queryData('overseas_warehouses');
 }catch(e){if(owner===forwardingOwner()){forwarding.ready=false;forwarding.error='整包转寄开发数据库尚未就绪，或读取失败。请核对开发环境配置后刷新。';forwarding.packages=[];forwarding.items=[];forwarding.staff=[]}}};
 await Promise.all([previous,load()]);
};
function forwardingGuard(){return !forwarding.ready?notice('海外仓数据暂不可用',forwarding.error||'请刷新数据后重试。'):''}
function headPackages(head){return forwarding.packages.filter(p=>p.source_order_id===head?.id)}
function forwardingPackages(order){const ids=new Set(forwarding.items.filter(i=>i.order_id===order?.id).map(i=>i.package_id));return forwarding.packages.filter(p=>ids.has(p.id))}
function forwardingTails(head){return state.dbOrders.filter(o=>isLastMile(o)&&o.parent_order_id===head?.id)}
function forwardingWarehouseName(id){return workspace.overseasWarehouses.find(w=>w.id===id)?.name||state.dbOrders.find(o=>o.destination_overseas_warehouse_id===id)?.destination_warehouse_snapshot?.name||'印尼仓'}
function forwardingAvailable(head){return headPackages(head).filter(p=>p.status==='available')}
function forwardingCancelable(o){return o?.fulfillment_mode==='whole_package'&&['warehouse_received','awaiting_payment'].includes(o.status)&&paymentRecord(o)?.status!=='paid'&&!['pending','approved'].includes(orderReceipt(o.id)?.status)}
function forwardingPackageTable(rows,selectable=false){
 if(!rows.length)return emptyState('暂无整包记录','实际到货外箱由海外仓扫描登记；不会按国内预报数量自动生成。');
 return `<div class="table-wrap"><table class="table"><thead><tr>${selectable?'<th>选择</th>':''}<th>海外仓实际箱号</th><th>来源整体订单</th><th>所在仓库</th><th>状态</th><th>尾程 / 入库时间</th></tr></thead><tbody>${rows.map(p=>{
  const head=state.dbOrders.find(o=>o.id===p.source_order_id),tail=state.dbOrders.find(o=>o.id===p.assigned_order_id);
  return `<tr>${selectable?`<td><input type="checkbox" aria-label="选择 ${esc(p.package_no)}" data-forward-package="${esc(p.id)}" ${forwarding.selected.has(p.id)?'checked':''} ${p.status!=='available'?'disabled':''}></td>`:''}<td><b class="mono">${esc(p.package_no)}</b>${p.note?`<br><small>${esc(p.note)}</small>`:''}</td><td>${head?overallOrderButton(head,head.order_no):'暂无权限查看'}</td><td>${esc(forwardingWarehouseName(p.overseas_warehouse_id))}</td><td>${status(forwardingStockLabels[p.status]||p.status,p.status==='available'?'green':'blue')}</td><td>${tail?esc(tail.order_no):'尚未分配尾程'}<br><small>${dateText(p.received_at)}</small></td></tr>`;
 }).join('')}</tbody></table></div>`;
}
function forwardingStock(){
 const rows=forwarding.packages.filter(p=>(!forwarding.warehouse||p.overseas_warehouse_id===forwarding.warehouse)&&(forwarding.tab==='all'||p.status===forwarding.tab)&&[p.package_no,state.dbOrders.find(o=>o.id===p.source_order_id)?.order_no].join(' ').toLowerCase().includes(forwarding.query.toLowerCase()));
 const warehouseIds=[...new Set(forwarding.packages.map(p=>p.overseas_warehouse_id))],merchant=state.role==='merchant';
 const heads=overallOrderRoots(state.dbOrders).filter(h=>forwardingAvailable(h).length&&(!forwarding.warehouse||h.destination_overseas_warehouse_id===forwarding.warehouse));
 return shell(merchant?'我的海外仓':'海外仓整包库存','按实际外箱管理；整包转寄不拆箱、不登记商品 SKU。',`<button type="button" class="btn ghost" data-refresh-workspace>刷新库存</button>`)+forwardingGuard()+
 `<div class="grid kpis">${Object.entries(forwardingStockLabels).map(([key,label])=>kpi(label,forwarding.packages.filter(p=>p.status===key&&(!forwarding.warehouse||p.overseas_warehouse_id===forwarding.warehouse)).length,'实际外箱数')).join('')}</div>`+
 `<div class="card"><form id="forwardingStockSearch" class="workspace-toolbar"><select id="forwardingWarehouse" aria-label="筛选海外仓"><option value="">全部仓库</option>${warehouseIds.map(id=>`<option value="${esc(id)}" ${id===forwarding.warehouse?'selected':''}>${esc(forwardingWarehouseName(id))}</option>`).join('')}</select><select id="forwardingStockStatus" aria-label="筛选库存状态">${[['all','全部状态'],...Object.entries(forwardingStockLabels)].map(([id,label])=>`<option value="${id}" ${id===forwarding.tab?'selected':''}>${label}</option>`).join('')}</select><input id="forwardingStockQuery" aria-label="搜索海外仓箱号" placeholder="实际箱号 / 来源整体订单" value="${esc(forwarding.query)}"><button class="btn ghost">查询</button></form>${forwardingPackageTable(rows)}</div>`+
 (merchant&&forwarding.ready?`<div class="card section-space"><h2>按批次申请整包转寄</h2><p>每笔申请选择同一头程批次、同一仓库的可用整包，寄往一个消费者地址；可分多次申请。</p>${heads.map(h=>`<div class="metric"><span>${esc(h.order_no)} · ${esc(forwardingWarehouseName(h.destination_overseas_warehouse_id))}<br>可转寄 ${forwardingAvailable(h).length} 箱</span><button type="button" class="btn primary" data-forward-head="${esc(h.id)}">选择整包转寄</button></div>`).join('')||emptyState('暂无可转寄包裹','海外仓登记实际到货后，可用整包会显示在这里。')}</div>`:'');
}
function beginForwarding(id){
 if(!forwarding.ready||forwarding.busy)return;
 const head=state.dbOrders.find(o=>o.id===id&&!isLastMile(o));if(!head||!forwardingAvailable(head).length){toast('当前没有可用整包，请刷新核对');return}
 forwarding.headId=id;forwarding.selected=new Set();forwarding.requestId=crypto.randomUUID();applyDbOrder(head);go('forwarding-request',{role:'merchant'});
}
function forwardingRequest(){
 const head=state.dbOrders.find(o=>o.id===forwarding.headId),available=forwardingAvailable(head);
 if(!forwarding.ready||!head)return shell('申请整包转寄','请先选择一个在仓批次。',button('返回海外仓','overseas-stock'))+forwardingGuard();
 const zones=deliveryZones(head);
 return shell('申请整包转寄',`整体订单 ${head.order_no} · ${forwardingWarehouseName(head.destination_overseas_warehouse_id)}`,overallOrderButton(head,'返回整体订单')+button('返回海外仓','overseas-stock'))+
 `<div class="card"><h2>1. 选择实际整包</h2><p>原外箱完整寄出；本页不支持拆包取商品。已被其他尾程占用的整包不能重复选择。</p>${forwardingPackageTable(headPackages(head),true)}</div>`+
 `<div class="card section-space"><h2>2. 填写消费者地址与配送地区</h2><form id="forwardingRequestForm" data-head-id="${esc(head.id)}"><div class="field"><label for="lastMileAddress">选用消费者地址（选填）</label><select id="lastMileAddress"><option value="">填写新地址</option>${state.addresses.filter(a=>a.country==='印度尼西亚').map(a=>`<option value="${esc(a.id)}">${esc(a.recipient_name)} · ${esc(a.address_line)}</option>`).join('')}</select></div><div class="form-grid section-space">${field('收件人','lastMileName','','text','required maxlength="120"')}${field('联系电话','lastMilePhone','','tel','required maxlength="80"')}${field('国家','lastMileCountry','印度尼西亚','text','readonly')}${field('城市 / 地区','lastMileCity','','text','required maxlength="120"')}${field('邮编（选填）','lastMilePostal','','text','maxlength="30"')}<div class="field full"><label for="lastMileLine">消费者详细地址</label><textarea id="lastMileLine" rows="3" required maxlength="1000"></textarea></div><div class="field full"><label for="forwardingZone">配送地区</label><select id="forwardingZone" required><option value="">请选择消费者所在地区</option>${zones.map(z=>`<option value="${esc(z.id)}">${esc(z.name)}${z.is_test_rate?'（测试运价）':''}</option>`).join('')}</select></div></div><div id="forwardingEstimate">${distanceQuoteHtml(null)}</div><p class="page-note">此处仅预估本笔尾程费用。提交后占用所选整包，仓库确认费用后才付款。新地址保留在本次发货单，不自动加入地址簿。</p><button class="btn primary" type="submit" ${!available.length||!zones.length?'disabled':''}>提交整包转寄申请</button></form></div>`;
}
function overseasReceive(){
 const heads=state.dbOrders.filter(o=>!isLastMile(o)&&o.status==='shipped'&&forwarding.staff.some(s=>s.user_id===state.auth.user?.id&&s.warehouse_id===o.destination_overseas_warehouse_id));
 return shell('海外仓到货入库','扫描实际收到的外箱箱号，允许分批到货。',`<button type="button" class="btn ghost" data-refresh-workspace>刷新到货批次</button>`)+forwardingGuard()+
 notice('按实物外箱登记','合包后外箱数可能与国内原包裹数不同。请使用实际外箱标签号，逐箱扫描，每行一个；最后一批到齐后再勾选“全部到齐”。')+
 `<div class="card section-space"><form id="overseasReceiveForm"><div class="field"><label for="overseasReceiveHead">头程批次 / 目标海外仓</label><select id="overseasReceiveHead" required><option value="">请选择批次</option>${heads.filter(h=>!forwardingTails(h).some(t=>t.fulfillment_mode!=='whole_package'&&t.status!=='cancelled')).map(h=>`<option value="${esc(h.id)}">${esc(h.order_no)} · ${esc(forwardingWarehouseName(h.destination_overseas_warehouse_id))}${h.overseas_receiving_completed_at?'（已全部到齐）':''}</option>`).join('')}</select></div><div class="field section-space"><label for="overseasPackageNos">本次实际到货箱号</label><textarea id="overseasPackageNos" rows="6" placeholder="每行一个实际外箱标签号；扫码枪可逐行输入" maxlength="8100"></textarea></div>${field('到货备注','overseasReceiveNote','','text','maxlength="500"')}<p><label><input type="checkbox" id="overseasReceiveComplete"> 已核对，本批所有外箱全部到齐</label></p><p class="page-note">重复扫描本批已有箱号不会重复入库；同仓库其他批次的箱号不能重复使用。已全部到齐的批次不能追加新箱号。</p><button class="btn primary" type="submit" ${!forwarding.ready||!heads.length?'disabled':''}>确认实际到仓</button></form>${!heads.length?notice('没有可登记的批次','请运营先分配本账号的海外仓权限，并确认头程已付款、已出货至该仓。'):''}</div>`+forwardingPackageTable(forwarding.packages);
}
function forwardingDispatch(){
 const o=warehouseSelected();if(!o||o.fulfillment_mode!=='whole_package')return forwardingOldShip();
 const shipped=['shipped','delivered'].includes(o.status),canShip=['paid','ready_to_ship'].includes(o.status);
 return warehouseContext(o)+shell('尾程整包出库',o.order_no,overallOrderButton(o,'返回整体订单'))+warehouseActualFees(o)+
 `<div class="card section-space"><h2>本单整包明细</h2>${forwardingPackageTable(forwardingPackages(o))}</div><div class="card section-space"><h2>${shipped?'已登记快递':'交承运商并登记快递'}</h2>${shipped?`<div class="metric"><span>承运商</span><b>${esc(o.shipment_carrier)}</b></div><div class="metric"><span>快递单号</span><b class="mono">${esc(o.shipment_tracking_no)}</b></div>${warehouseOrderButton(o,'warehouse-tracking-detail','查看本单物流记录')}`:canShip?`<form id="forwardingDispatchForm" data-order-id="${esc(o.id)}">${field('承运商（例如 J&T 极兔）','forwardingCarrier','','text','required maxlength="120"')}${field('实际快递单号','forwardingTracking','','text','required maxlength="120"')}<p class="page-note">核实整包已交承运商后确认出库。登记单号只代表已出库，不自动认定消费者签收。</p><button class="btn primary" type="submit">确认整包出库</button></form>`:notice('尚不能出库','请先核价、由商家提交付款凭证并经运营审核通过。')}</div>`+
 (o.status==='shipped'?`<div class="card section-space"><h2>人工登记签收</h2><form id="lastMileDeliveredForm" data-order-id="${esc(o.id)}">${field('实际签收依据','lastMileDeliveredNote','','text','required minlength="2" maxlength="500"')}<button class="btn ghost" type="submit">根据实际结果登记已签收</button></form></div>`:'');
}
const forwardingOldShip=warehouseShip;warehouseShip=forwardingDispatch;
const forwardingOldPack=warehousePacking;warehousePacking=function(){return warehouseSelected()?.fulfillment_mode==='whole_package'?forwardingDispatch():forwardingOldPack()};
const forwardingOldStage=warehouseStage;warehouseStage=function(o){return o?.fulfillment_mode==='whole_package'&&o.status==='paid'?'ship':forwardingOldStage(o)};
warehouseQueue=function(page){const rows=state.dbOrders.filter(o=>warehouseStage(o)===page);return `<div class="card section-space"><h3>${warehouseStageLabels[page]}（${overallOrderRoots(rows).length} 单）</h3>${warehouseOrderRows(rows)}</div>`};
const forwardingOldDashboard=warehouseDashboard;
warehouseDashboard=function(){
 const rows=state.dbOrders.filter(o=>(warehouseWorkspace.filter==='all'||(Object.keys(warehouseStages).includes(warehouseWorkspace.filter)?warehouseStage(o)===warehouseWorkspace.filter:orderMatchesProgress(o,warehouseWorkspace.filter)))&&overallOrderSearch(o,warehouseWorkspace.query));
 return shell('仓库工作台','国内头程和海外整包作业按各自阶段办理。',button('海外仓到货','overseas-receive')+button('海外仓包裹','overseas-stock-warehouse'))+
 `<div class="grid kpis">${Object.keys(warehouseStages).map(k=>`<button type="button" class="warehouse-kpi" data-warehouse-filter="${k}">${kpi(warehouseStageLabels[k],overallOrderRoots(state.dbOrders.filter(o=>warehouseStage(o)===k)).length,'整体订单数 · 点击查看队列')}</button>`).join('')}</div>`+
 `<div class="card section-space"><h2>仓库订单与任务</h2><div class="workspace-tabs">${[['all','全部订单'],...Object.entries(warehouseStageLabels),['awaiting_payment','待商家付款'],['shipped','运输中'],['delivered','已签收']].map(([k,label])=>`<button data-warehouse-filter="${k}" class="${warehouseWorkspace.filter===k?'active':''}">${label}</button>`).join('')}</div><form id="warehouseSearchForm" class="workspace-toolbar"><input id="warehouseSearch" value="${esc(warehouseWorkspace.query)}" aria-label="搜索仓库订单" placeholder="整体订单号 / 尾程单号 / 收件人"><button class="btn ghost">搜索</button></form>${warehouseOrderRows(rows)}</div>`+paymentNotificationsHtml();
};
// 一笔头程可分批派送；只有到货收齐、无剩余库存且所有有效尾程签收，整体才算签收。
const forwardingOldProgress=orderProgress;
orderProgress=function(o){
 if(!o||isLastMile(o)||!o.forwarding_enabled)return forwardingOldProgress(o);
 if(!forwarding.ready)return {label:'海外仓进度待同步',tone:'amber',group:'overseas',detail:'请刷新海外仓数据'};
 const stock=headPackages(o),tails=forwardingTails(o).filter(t=>t.status!=='cancelled'),remaining=stock.filter(p=>p.status==='available').length;
 const delivered=tails.filter(t=>t.status==='delivered').length,active=tails.filter(t=>t.status!=='delivered');
 const detail=`${o.overseas_receiving_completed_at?'已收齐':'分批到货中'} · 可转寄 ${remaining} 箱 · 尾程 ${tails.length} 单 / 已签收 ${delivered} 单`;
 if(o.overseas_receiving_completed_at&&stock.length&&stock.every(p=>p.status==='delivered')&&tails.length&&active.length===0)return {label:'已签收',tone:'green',group:'delivered',detail};
 if(active.length){
  const priority=['exception','warehouse_received','measuring','submitted','awaiting_payment','paid','ready_to_ship','shipped'];
  const next=priority.map(s=>active.find(t=>t.status===s)).find(Boolean)||active[0],p=forwardingOldProgress(next);
  return {...p,label:(tails.length>1||remaining?'部分尾程：':'')+p.label,detail};
 }
 return {label:remaining?'海外仓有包裹待转寄':o.overseas_receiving_completed_at?'待核对尾程状态':'本批仍在分批到货',tone:'blue',group:'overseas',detail};
};
const forwardingOldParcelTail=parcelTailOrder;parcelTailOrder=function(p){return p.order?.forwarding_enabled?null:forwardingOldParcelTail(p)};
const forwardingOldParcelProgress=parcelProgress;parcelProgress=function(p){if(!p.order?.forwarding_enabled)return forwardingOldParcelProgress(p);const progress=orderProgress(p.order);return {group:progress.group==='delivered'?'delivered':'overseas',label:progress.label}};
overallFees=function(o){const head=overallOrderRoot(o),tails=forwardingTails(head);return `<div class="overall-fees"><span>${isLastMile(head)?'尾程':'头程'}：<b>${overallFeeText(head)}</b></span>${!isLastMile(head)?`<span>尾程：${tails.length?tails.map(t=>`<span class="overall-tail-fee">${esc(t.order_no)} · ${overallFeeText(t)}${t.status==='cancelled'?'（已取消）':''}</span>`).join(''):'尚未申请'}</span>`:''}</div>`};
overallDestination=function(o){const head=overallOrderRoot(o),tails=forwardingTails(head);return `${esc(head.destination_country||'印度尼西亚')} · ${esc(head.destination_city||'')}${tails.length?`<br><small class="muted">尾程：${tails.map(t=>`${esc(t.destination_city||'')} · ${esc(t.recipient_name||'')}${t.status==='cancelled'?'（取消）':''}`).join(' / ')}</small>`:''}`};
const forwardingOldContext=settlementContext;settlementContext=function(o){if(!o?.forwarding_enabled||isLastMile(o))return forwardingOldContext(o);return `<div class="card section-space"><h3>头程 · 深圳仓 → 印尼仓</h3>${orderProgressHtml(o)}<p>本页仅结算头程；本批 ${forwardingTails(o).length} 笔尾程记录、剩余整包和各收件人信息请进入整体订单查询。</p>${overallOrderButton(o)}</div>`};
lastMileRequest=function(o){return o&&!isLastMile(o)?`<div class="card section-space"><h2>整包转寄</h2>${!o.forwarding_enabled?notice('等待海外仓登记实际外箱','旧尾程记录保留查询；新增转寄需由海外仓核对实际外箱入库。'):forwardingAvailable(o).length?`<p>本批可转寄 ${forwardingAvailable(o).length} 箱，可分次寄给不同消费者。</p><button type="button" class="btn primary" data-forward-head="${esc(o.id)}">选择整包申请转寄</button>`:notice('暂无可转寄整包','已占用、已出库的整包不能重复申请。新到货外箱登记后可继续申请。')}${button('查看海外仓包裹','overseas-stock')}</div>`:''};
overallOrderDetail=function(){
 const o=state.order.record;if(!o)return shell('整体订单','请从列表选择订单。');
 const head=overallOrderRoot(o),legs=overallOrderLegs(head),tails=forwardingTails(head);
 return shell('整体订单',head.order_no,button('返回订单列表',state.role==='merchant'?'orders':'dashboard')+`<button class="btn ghost" data-refresh-workspace>刷新进度</button>`)+
 `<div class="card overall-summary"><h2>${esc(head.order_no)}</h2>${orderProgressHtml(head)}${overallFees(head)}<p class="page-note">每笔尾程单独核价、单独付款一次；头程费用不重复收取。</p></div>`+
 `<div class="section-space">${overallLegCard(head)}</div>`+
 (head.forwarding_enabled?`<div class="card section-space"><h2>本批海外仓实际外箱</h2>${forwardingGuard()}${forwardingPackageTable(headPackages(head))}</div>`:'')+
 `<div class="card section-space"><h2>关联尾程发货记录（${tails.length} 笔）</h2><p>同一头程可分多次整包转寄；每笔保留独立收件地址、费用和快递单号。</p></div><div class="grid layout-2 overall-leg-grid section-space">${legs.filter(isLastMile).map(overallLegCard).join('')||emptyState('尚未申请尾程','海外仓登记到货后，商家选择可用整包申请转寄。')}</div>`+
 (state.role==='merchant'&&!isLastMile(head)?lastMileRequest(head):'');
};
const forwardingOldLeg=overallLegCard;overallLegCard=function(o){const base=forwardingOldLeg(o);return o.fulfillment_mode==='whole_package'?base.replace(overallLegStatus(o),orderProgressHtml(o)).replace('</section>',`<p>整包：${forwardingPackages(o).map(p=>esc(p.package_no)).join(' / ')||'明细待同步'}</p>${state.role==='merchant'&&forwardingCancelable(o)?`<button type="button" class="btn ghost" data-forward-cancel="${esc(o.id)}">取消申请并释放整包</button>`:''}</section>`):base};
const forwardingOldActions=overallLegActions;overallLegActions=function(o){if(state.role==='warehouse'&&o.fulfillment_mode==='whole_package')return warehouseOrderButton(o,warehouseStage(o)||'ship',warehouseStage(o)==='confirm'?'核对尾程费用':['paid','ready_to_ship'].includes(o.status)?'登记整包出库':'查看尾程记录');return forwardingOldActions(o)};
const forwardingOldFee=merchantFee;merchantFee=function(){const o=state.order.record;return forwardingOldFee()+(o?.fulfillment_mode==='whole_package'?`<div class="card section-space"><h2>本笔转寄整包</h2>${forwardingPackageTable(forwardingPackages(o))}${forwardingCancelable(o)?`<button class="btn ghost" data-forward-cancel="${esc(o.id)}">取消申请并释放整包</button>`:''}</div>`:'')};
function forwardingTrackingControls(o){return o?.fulfillment_mode==='whole_package'&&o.shipment_tracking_no?`<div class="card section-space"><h3>尾程快递查询</h3><p>${esc(o.shipment_carrier)} · <b class="mono">${esc(o.shipment_tracking_no)}</b></p><button type="button" class="btn ghost" data-forward-copy="${esc(o.shipment_tracking_no)}">复制快递单号</button><p class="page-note">复制单号后，前往该承运商官方渠道查询。系统展示仓库登记的物流记录，尚未接入快递实时轨迹。</p></div>`:''}
const forwardingTrackingLeg=overallLegCard;overallLegCard=o=>forwardingTrackingLeg(o).replace('</section>',forwardingTrackingControls(o)+'</section>');
const forwardingTrackingFee=merchantFee;merchantFee=()=>forwardingTrackingFee()+forwardingTrackingControls(state.order.record);
const forwardingTrackingShip=warehouseShip;warehouseShip=()=>forwardingTrackingShip()+forwardingTrackingControls(warehouseSelected());
const forwardingMerchantTracking=merchantTracking;merchantTracking=()=>forwardingMerchantTracking()+forwardingTrackingControls(state.order.record);
const forwardingWarehouseTracking=warehouseTrackingDetail;warehouseTrackingDetail=()=>forwardingWarehouseTracking()+forwardingTrackingControls(warehouseSelected());
const forwardingPaymentSection=merchantPaymentSection;merchantPaymentSection=function(o){const html=forwardingPaymentSection(o);return o?.fulfillment_mode==='whole_package'?html.replaceAll('进入待打包','进入待出库').replaceAll('继续打包','整包出库'):html};
const forwardingOrderNav=overallOrderNav;overallOrderNav=function(o){let html=forwardingOrderNav(o);const head=overallOrderRoot(o);if(head?.forwarding_enabled)for(const t of forwardingTails(head)){const label=state.role==='merchant'?'尾程费用与付款':'尾程作业',link=state.role==='merchant'?orderAction(t,'fee',label):warehouseOrderButton(t,warehouseStage(t)||'ship',label);html=html.replace(link,link.replace('>'+label+'<','>'+label+' · '+esc(t.order_no)+'<'))}return html};
// 用逐箱登记替换旧的“整批到货”按钮。
const forwardingHeadShip=warehouseShip;warehouseShip=function(){let html=forwardingHeadShip();if(!isLastMile(warehouseSelected()))html=html.replace(/<div class="card section-space"><h3>登记头程到达印尼海外仓[\s\S]*?<\/form><\/div>/,`<div class="card section-space"><h3>海外仓实际到货</h3>${button('进入海外仓逐箱登记','overseas-receive')}</div>`);return html};
function forwardingStaffPanel(){return `<div class="card section-space"><h2>海外仓人员权限</h2><p>只有获配该海外仓的仓库人员才能登记实际到货、核价和出库；国内仓权限不自动授予海外仓权限。</p><form id="forwardingStaffForm">${field('仓库人员会员号','forwardingStaffMember','','text','required maxlength="40"')}<div class="field"><label for="forwardingStaffWarehouse">海外仓</label><select id="forwardingStaffWarehouse" required>${workspace.overseasWarehouses.filter(w=>w.is_active).map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></div><div class="field"><label for="forwardingStaffAction">操作</label><select id="forwardingStaffAction"><option value="grant">分配权限</option><option value="revoke">移除权限</option></select></div><button class="btn primary" type="submit">保存海外仓权限</button></form></div>`}
const forwardingAdminConfig=adminConfig;adminConfig=function(){return forwardingAdminConfig()+forwardingStaffPanel()};
MerchantViews['overall-order']=overallOrderDetail;MerchantViews['overseas-stock']=forwardingStock;MerchantViews['forwarding-request']=forwardingRequest;
const forwardingOldFrame=merchantPageFrame;merchantPageFrame=function(html){if(!['overseas-stock','forwarding-request'].includes(state.page))return forwardingOldFrame(html);$('#crumb').textContent='海外仓'+(state.page==='forwarding-request'?' / 申请整包转寄':'');return `<nav class="workspace-breadcrumb">${button('海外仓','overseas-stock')}${state.page==='forwarding-request'?'<span>/ 申请整包转寄</span>':''}</nav>`+html};
const forwardingOldNav=navActivePage;navActivePage=function(page,role){return ['overseas-stock','forwarding-request'].includes(page)?'overseas-stock':forwardingOldNav(page,role)};
async function forwardingTask(form,action){
 if(forwarding.busy||paymentWorkspace.busy||warehouseWorkspace.busy)return;
 const owner=forwardingOwner();forwarding.busy=true;
 form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
 try{await action();if(owner!==forwardingOwner())return;if(!await refreshDbState())throw Error('操作可能已保存，刷新失败。请先刷新核对，勿重复提交。');toast('操作已保存，库存与订单已更新')}
 catch(e){if(owner===forwardingOwner())toast(e.message||'操作失败，请刷新核对',7000)}
 finally{forwarding.busy=false;if(owner===forwardingOwner())form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false)}
}
const forwardingOldGo=go;go=function(page,options={}){if(forwarding.busy){toast('正在保存海外仓操作，请稍候');return false}return forwardingOldGo(page,options)};
const forwardingBind=bind;bind=function(){
 forwardingBind();
 document.querySelectorAll('[data-forward-copy]').forEach(el=>el.onclick=async()=>{try{await navigator.clipboard.writeText(el.dataset.forwardCopy);toast('快递单号已复制')}catch(e){toast('未能自动复制，请选择页面上的快递单号手动复制',6000)}});
 document.querySelectorAll('[data-forward-head]').forEach(el=>el.onclick=()=>beginForwarding(el.dataset.forwardHead));
 document.querySelectorAll('[data-forward-package]').forEach(el=>el.onchange=()=>{el.checked?forwarding.selected.add(el.dataset.forwardPackage):forwarding.selected.delete(el.dataset.forwardPackage)});
 const search=$('#forwardingStockSearch');if(search)search.onsubmit=e=>{e.preventDefault();forwarding.query=$('#forwardingStockQuery').value.trim();forwarding.warehouse=$('#forwardingWarehouse').value;forwarding.tab=$('#forwardingStockStatus').value;render()};
 const receive=$('#overseasReceiveForm');if(receive)receive.onsubmit=e=>{e.preventDefault();const args={p_order_id:$('#overseasReceiveHead').value,p_package_nos:$('#overseasPackageNos').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),p_note:$('#overseasReceiveNote').value.trim(),p_complete:$('#overseasReceiveComplete').checked};forwardingTask(receive,()=>rpcWorkspace('warehouse_receive_overseas_packages',args))};
 const zone=$('#forwardingZone');if(zone)zone.onchange=()=>{const head=state.dbOrders.find(o=>o.id===forwarding.headId),z=deliveryZones(head).find(z=>z.id===zone.value);$('#forwardingEstimate').innerHTML=distanceQuoteHtml(z,z?.reference_distance_km)};
 const request=$('#forwardingRequestForm');if(request)request.onsubmit=e=>{
  e.preventDefault();const head=state.dbOrders.find(o=>o.id===request.dataset.headId),z=deliveryZones(head).find(z=>z.id===zone.value),ids=[...forwarding.selected];
  if(!z||!ids.length){toast('请选择整包和配送地区');return}
  const args={p_order_id:head.id,p_package_ids:ids,p_recipient:readLastMileRecipient(),p_zone_id:z.id,p_expected_zone_version:z.updated_at,p_request_id:forwarding.requestId};
  const owner=forwardingOwner();forwardingTask(request,async()=>{const result=await rpcWorkspace('merchant_create_forwarding',args);if(owner!==forwardingOwner())return;if(!result?.id)throw Error('未收到有效转寄单，请刷新核对');state.activeOrderId=result.id;forwarding.selected.clear();state.page='fee'});
 };
 document.querySelectorAll('[data-forward-cancel]').forEach(el=>el.onclick=()=>{if(!confirm('取消本笔尚未付款的转寄申请？所选整包将恢复可用，原记录保留。'))return;forwardingTask(el.parentElement,()=>rpcWorkspace('merchant_cancel_forwarding',{p_order_id:el.dataset.forwardCancel}))});
 const dispatch=$('#forwardingDispatchForm');if(dispatch)dispatch.onsubmit=e=>{e.preventDefault();const args={p_order_id:dispatch.dataset.orderId,p_carrier:$('#forwardingCarrier').value.trim(),p_tracking_no:$('#forwardingTracking').value.trim()};forwardingTask(dispatch,()=>rpcWorkspace('warehouse_dispatch_forwarding',args))};
 const staff=$('#forwardingStaffForm');if(staff)staff.onsubmit=e=>{e.preventDefault();const args={p_member_no:$('#forwardingStaffMember').value.trim(),p_warehouse_id:$('#forwardingStaffWarehouse').value,p_enabled:$('#forwardingStaffAction').value==='grant'};forwardingTask(staff,()=>rpcWorkspace('admin_set_overseas_staff',args))};
};
