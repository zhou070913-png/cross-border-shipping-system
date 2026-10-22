/* 仓库队列与订单详情共用数据库中的订单状态，不通过当前单笔订单计算总任务。 */
'use strict';
const warehouseWorkspace={owner:null,selectedId:null,filter:'all',query:'',busy:false,loading:false,trackingQuery:'',trackingTab:'all',tracking:{orderId:null,events:[],loading:false,error:null,request:0}};
Object.assign(pageRoles,{'warehouse-tracking':'warehouse','warehouse-tracking-detail':'warehouse'});
function warehouseShippedOrders(){return state.dbOrders.filter(o=>['shipped','delivered'].includes(o.status)||o.shipped_at)}
function warehouseTrackingList(){
  const orders=warehouseShippedOrders(),q=warehouseWorkspace.trackingQuery.toLowerCase();
  const rows=orders.filter(o=>(warehouseWorkspace.trackingTab==='all'||orderMatchesProgress(o,warehouseWorkspace.trackingTab))&&`${o.order_no} ${o.shipment_tracking_no||''} ${o.shipment_carrier||''} ${o.recipient_name||''}`.toLowerCase().includes(q));
  return shell('物流查询','出货后按订单或国际运单核对运输状态，点击进入物流详情。',button('返回出货登记','ship'))+
    notice('物流记录来源','与商家端共用系统登记的物流节点。当前尚未接入承运商自动轨迹，出货登记不代表实时运输位置。')+
    `<div class="card"><div class="workspace-tabs">${[['all','全部已出货'],['overseas','已到印尼仓'],['shipped','运输中'],['delivered','已签收']].map(([key,label])=>`<button type="button" data-warehouse-tracking-tab="${key}" class="${warehouseWorkspace.trackingTab===key?'active':''}" aria-pressed="${warehouseWorkspace.trackingTab===key}">${label}（${orders.filter(o=>key==='all'||orderMatchesProgress(o,key)).length}）</button>`).join('')}</div><form id="warehouseTrackingSearch" class="workspace-toolbar"><input id="warehouseTrackingQuery" aria-label="搜索仓库物流" placeholder="订单号 / 国际运单号 / 承运商 / 收件人" value="${esc(warehouseWorkspace.trackingQuery)}"><button class="btn primary">查询</button><button type="button" class="btn ghost" data-refresh-workspace>刷新物流列表</button></form>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>订单号</th><th>承运商 / 国际运单号</th><th>目的地 / 收件人</th><th>物流状态</th><th>操作</th></tr></thead><tbody>${rows.map(o=>`<tr><td class="mono">${esc(o.order_no)}</td><td>${esc(o.shipment_carrier||'待登记')}<br><span class="mono">${esc(o.shipment_tracking_no||'待登记')}</span></td><td>${esc(o.destination_country||'')} · ${esc(o.destination_city||'')}<br>${esc(o.recipient_name||'')}</td><td>${orderProgressHtml(o)}</td><td>${warehouseOrderButton(o,'warehouse-tracking-detail','查看物流')}</td></tr>`).join('')}</tbody></table></div>`:emptyState('没有匹配的已出货订单',orders.length?'调整搜索词或状态后重试。':'完成出货登记后，订单会自动出现在这里。')}</div>`;
}
function warehouseTrackingDetail(){
  const o=warehouseSelected();
  if(!o||!warehouseShippedOrders().some(row=>row.id===o.id))return shell('物流详情','请从物流查询选择一笔已出货订单。',button('返回物流查询','warehouse-tracking'));
  const tracking=warehouseWorkspace.tracking,active=tracking.orderId===o.id;
  let events;
  if(!active||tracking.loading)events=notice('正在读取物流节点','请稍候。');
  else if(tracking.error)events=notice('物流节点读取失败','请点击“刷新本单物流”重试。此处不显示旧订单的节点。');
  else events=tracking.events.length?`<div class="timeline">${tracking.events.map(e=>`<div class="event"><div></div><div><h4>${esc(e.event_title||'物流节点')}</h4><p>${esc(e.event_description||'')}</p><p>${esc(dateText(e.occurred_at))}${e.location?' · '+esc(e.location):''}</p></div></div>`).join('')}</div>`:emptyState('暂无物流节点','该订单尚无可读取的物流记录，请刷新或联系运营核对。');
  return shell('物流详情',o.order_no,button('返回物流查询','warehouse-tracking')+`<button type="button" class="btn primary" id="warehouseTrackingRefresh" ${active&&tracking.loading?'disabled':''}>刷新本单物流</button>`)+
    notice('节点与订单状态','节点来自实际业务登记，与商家端共享。承运商实时轨迹尚未接入，请以承运商实际运输结果为准。')+
    `<div class="grid layout-2"><div class="card"><div class="card-title"><h3>物流节点</h3>${orderProgressHtml(o)}</div>${events}</div><div class="card"><h3>订单与运单信息</h3>${[['订单号',o.order_no],['承运商',o.shipment_carrier],['国际运单号',o.shipment_tracking_no],['运输线路',o.route_name],['目的地国家',o.destination_country],['目的地地址',o.destination_address],['收件人',o.recipient_name],['联系电话',o.recipient_phone],['出货登记时间',o.shipped_at?dateText(o.shipped_at):null]].map(([label,value])=>`<div class="metric"><span>${label}</span><b>${esc(value||'待登记')}</b></div>`).join('')}<div class="form-actions">${warehouseOrderButton(o,'ship','查看出货记录')}</div></div></div>`;
}
async function loadWarehouseTracking(id){
  const owner=state.auth.user?.id,request=warehouseWorkspace.tracking.request+1;
  warehouseWorkspace.tracking={orderId:id,events:[],loading:true,error:null,request};
  if(state.page==='warehouse-tracking-detail')render();
  try{
    const events=await window.MospaceSupabase.orderTracking(id);
    if(state.auth.user?.id!==owner||state.role!=='warehouse'||warehouseWorkspace.tracking.request!==request)return;
    warehouseWorkspace.tracking.events=safeRows(events);
  }catch(e){
    if(state.auth.user?.id!==owner||warehouseWorkspace.tracking.request!==request)return;
    warehouseWorkspace.tracking.error=true;
  }finally{
    if(state.auth.user?.id===owner&&state.role==='warehouse'&&warehouseWorkspace.tracking.request===request){
      warehouseWorkspace.tracking.loading=false;
      if(state.page==='warehouse-tracking-detail'&&warehouseWorkspace.selectedId===id)render();
    }
  }
}
async function refreshWarehouseTracking(){
  const id=warehouseWorkspace.selectedId,owner=state.auth.user?.id;
  if(!id||warehouseWorkspace.tracking.loading)return;
  if(!await refreshDbState())return;
  if(state.auth.user?.id===owner&&state.role==='warehouse'&&state.page==='warehouse-tracking-detail'&&warehouseWorkspace.selectedId===id)await loadWarehouseTracking(id);
}
const warehouseStages={inbound:['submitted'],confirm:['warehouse_received','measuring'],packing:['paid'],ship:['ready_to_ship']};
const warehouseStageLabels={inbound:'待收货',confirm:'待确认实重尺寸',packing:'已付款待打包',ship:'待出货'};
function warehouseStage(o){return Object.keys(warehouseStages).find(k=>warehouseStages[k].includes(o.status))||null}
function warehouseOrderButton(o,page,label){return `<button type="button" class="btn small ghost" data-warehouse-order="${esc(o.id)}" data-warehouse-page="${page}">${label}</button>`}
function warehouseOrderRows(orders){
  return orders.length?`<div class="table-wrap"><table class="table"><thead><tr><th>订单号 / 国内快递单号</th><th>包裹 / 目的地</th><th>状态</th><th>操作</th></tr></thead><tbody>${orders.map(o=>{
    const next=warehouseStage(o),page=next||(['shipped','delivered'].includes(o.status)?'ship':'confirm');
    const tracking=safeRows(o.order_parcels).map(r=>r.parcels?.tracking_no||r.parcels?.parcel_no).filter(Boolean);
    return `<tr><td><b class="mono">${esc(o.order_no)}</b><br><small class="muted">${esc(tracking.join(' / ')||'未关联快递单号')}</small></td><td>${Number(o.parcel_count||0)} 个<br><small class="muted">${esc(o.destination_country||'')} · ${esc(o.destination_city||'')}</small></td><td>${orderProgressHtml(o)}</td><td>${warehouseOrderButton(o,page,next?{inbound:'查看并收货',confirm:'开始确认',packing:'开始打包',ship:'登记出货'}[next]:'查看记录')}${['shipped','delivered'].includes(o.status)?warehouseOrderButton(o,'warehouse-tracking-detail','查看物流'):''}</td></tr>`;
  }).join('')}</tbody></table></div>`:emptyState('当前没有此类订单','可返回工作台查看全部订单，或刷新其他角色的最新操作。');
}
function warehouseQueue(page){
  const rows=state.dbOrders.filter(o=>warehouseStages[page].includes(o.status));
  return `<div class="card section-space"><div class="card-title"><h3>${warehouseStageLabels[page]}（${typeof overallOrderRoots==='function'?overallOrderRoots(rows).length:rows.length} 单）</h3>${button('全部仓库订单','dashboard')}</div>${warehouseOrderRows(rows)}</div>`;
}
function warehouseSelected(){return warehouseWorkspace.selectedId===state.order.dbId?state.order.record:null}
function warehouseActualFees(o){
  const f=feeRecord(o);
  if(f?.total_amount==null)return `<div class="card section-space" data-warehouse-actual-fees><h3>仓库实际费用</h3>${notice('实际费用尚未生成','完成本单全部包裹的实重和尺寸确认后，显示实际运费、操作费和唯一应付总额。')}</div>`;
  return `<div class="card section-space" data-warehouse-actual-fees><div class="card-title"><h3>仓库实际费用</h3>${status('已确认','green')}</div><div class="grid layout-2"><div>${[['实重合计',formatWeight(f.actual_weight_kg)],['体积重',formatWeight(f.volume_weight_kg)],['计费重量',formatWeight(f.billable_weight_kg)]].map(([label,value])=>`<div class="metric"><span>${label}</span><b>${value}</b></div>`).join('')}</div><div>${[['实际运费',money(f.shipping_fee)],['仓库操作费',money(f.handling_fee)],['唯一应付总额',money(f.total_amount)]].map(([label,value])=>`<div class="metric"><span>${label}</span><b>${value}</b></div>`).join('')}</div></div><p class="page-note">费用确认时间：${esc(dateText(f.confirmed_at))}。与商家端共用本单已确认费用，商家按此金额一次付款。</p></div>`;
}
function warehouseContext(o){
  const duplicates=safeRows(o.order_parcels).some(r=>associatedOrders(r.parcel_id).length>1);
  return `<div class="warehouse-context"><div><small>当前操作订单</small><b class="mono">${esc(o.order_no)}</b></div>${orderProgressHtml(o)}<button class="btn small ghost" data-warehouse-back>返回任务列表</button></div>`+
    (duplicates?notice('此订单含历史重复关联包裹','同一包裹关联了多笔订单。请运营先核对保留哪一单，避免重复收货、收费或出货；这里保留原记录。'):'');
}
warehouseDashboard=function(){
  const count=k=>{const rows=state.dbOrders.filter(o=>warehouseStages[k].includes(o.status));return typeof overallOrderRoots==='function'?overallOrderRoots(rows).length:rows.length};
  const independent=workspace.parcels.filter(p=>p.status==='pre_advised'&&!associatedOrders(p.id).length).length;
  const rows=state.dbOrders.filter(o=>(warehouseWorkspace.filter==='all'||(['shipped','delivered'].includes(warehouseWorkspace.filter)?orderMatchesProgress(o,warehouseWorkspace.filter):(warehouseStages[warehouseWorkspace.filter]||[warehouseWorkspace.filter]).includes(o.status)))&&
    (typeof overallOrderSearch==='function'?overallOrderSearch(o,warehouseWorkspace.query):`${o.order_no} ${o.recipient_name||''} ${safeRows(o.order_parcels).map(r=>r.parcels?.tracking_no||'').join(' ')}`.toLowerCase().includes(warehouseWorkspace.query.toLowerCase())));
  const filters=[['all','全部订单'],...Object.entries(warehouseStageLabels),['awaiting_payment','待商家付款'],['shipped','运输中'],['delivered','已签收']];
  return shell('仓库工作台','按订单号接续收货、测量确认、打包和出货；与商家端使用同一订单状态。',button('物流查询','warehouse-tracking')+button('扫描入库','inbound',true))+
    `<div class="grid kpis">${Object.keys(warehouseStages).map(k=>`<button type="button" class="warehouse-kpi" data-warehouse-filter="${k}">${kpi(warehouseStageLabels[k],count(k),'订单数 · 点击查看队列')}</button>`).join('')}</div>`+
    `<p class="page-note">另有 ${independent} 个尚未申请打包的预报包裹待入库，可在入库扫描中处理。</p>`+
    `<div class="card section-space"><div class="card-title"><h3>仓库订单与任务</h3><span class="tag">本账号有权处理的全部订单</span></div><div class="workspace-tabs">${filters.map(([k,v])=>`<button type="button" data-warehouse-filter="${k}" class="${warehouseWorkspace.filter===k?'active':''}" aria-pressed="${warehouseWorkspace.filter===k}">${v}</button>`).join('')}</div><form id="warehouseSearchForm" class="workspace-toolbar"><input id="warehouseSearch" aria-label="搜索仓库订单" placeholder="搜索订单号 / 国内快递单号 / 收件人" value="${esc(warehouseWorkspace.query)}"><button class="btn primary">搜索</button></form>${warehouseOrderRows(rows)}</div>`+
    notice('两端状态对应','待仓库收货 → 仓库登记收货；待确认实重尺寸 → 仓库生成费用；待付款 → 等商家一次付款；已付款待打包 → 仓库打包；待出货 → 登记国际运单。确认完成的订单不会再进入待确认队列。');
};
const originalWarehouseConfirm=warehouseConfirm,originalWarehousePacking=warehousePacking,originalWarehouseShip=warehouseShip;
warehouseInbound=function(){
  const o=warehouseSelected();
  const unlinked=workspace.parcels.filter(p=>!associatedOrders(p.id).length);
  let detail='';
  if(o){
    detail=warehouseContext(o)+`<div class="card"><h3>核对本单收货包裹</h3>${safeRows(o.order_parcels).map(r=>r.parcels).filter(Boolean).map(p=>`<div class="metric"><span>${esc(p.tracking_no||p.parcel_no)} · ${esc(p.item_name||'')}</span><b>${esc(parcelLabels[p.status]||p.status)}</b></div>`).join('')}<p class="page-note">确认下列包裹全部实物到仓后，登记整单收货；不会仅凭打开订单自动入库。</p>${o.status==='submitted'?'<button class="btn primary" id="receiveSelectedOrder">确认本单包裹全部到仓</button>':notice('本单已登记收货','无需重复入库，请按最新状态继续。')}${['warehouse_received','measuring'].includes(o.status)?warehouseOrderButton(o,'confirm','继续确认实重尺寸'):''}</div>`;
  }
  return shell('入库扫描','按订单选择收货，或扫描独立预报包裹的国内快递单号。',button('返回工作台','dashboard'))+detail+warehouseQueue('inbound')+
    `<div class="card section-space"><h3>扫描 / 手工录入</h3><div class="field"><label for="trackingInput">国内快递单号</label><input id="trackingInput" placeholder="扫描或输入完整快递单号"></div><div class="form-actions"><button class="btn primary" id="matchBtn">匹配并核对包裹</button></div><div id="matchResult"></div></div>`+
    workspaceError('parcels')+`<div class="card section-space"><h3>尚未申请打包的预报包裹（${unlinked.length}）</h3>${unlinked.length?`<div class="table-wrap"><table class="table"><thead><tr><th>国内快递单号</th><th>品名</th><th>状态</th></tr></thead><tbody>${unlinked.map(p=>`<tr><td>${esc(p.tracking_no)}</td><td>${esc(p.item_name||'')}</td><td>${status(parcelLabels[p.status]||p.status)}</td></tr>`).join('')}</tbody></table></div>`:emptyState('暂无独立预报包裹','已关联订单的包裹在上方按订单处理。')}</div>`;
};
function warehouseDetail(page,view){
  const o=warehouseSelected();
  if(!o)return shell({confirm:'包裹确认',packing:'打包作业',ship:'出货登记'}[page],'先选择需要处理的订单，再核对该单数据。',button('返回工作台','dashboard')+(page==='ship'?button('查询已出货订单物流','warehouse-tracking',true):''))+warehouseQueue(page);
  const permitted={confirm:['warehouse_received','measuring','awaiting_payment','paid','ready_to_ship','shipped','delivered'],packing:['paid','ready_to_ship','shipped','delivered'],ship:['ready_to_ship','shipped','delivered']}[page].includes(o.status);
  if(!permitted)return shell('订单当前进度',o.order_no,button('返回工作台','dashboard'))+warehouseContext(o)+notice('当前无需执行这项操作','请按订单的最新状态进入对应队列。')+(warehouseStage(o)?warehouseOrderButton(o,warehouseStage(o),'进入下一步'):'' )+warehouseQueue(page);
  let html=warehouseContext(o)+view()+warehouseActualFees(o);
  if(page==='confirm'&&['awaiting_payment','paid','ready_to_ship','shipped','delivered'].includes(o.status)){
    html+=`<div class="card section-space">${notice('实重尺寸和费用确认已完成',o.status==='awaiting_payment'?'下一步等待商家一次付款，无需再次确认。':'此单已完成费用确认，按最新状态继续办理。')}${o.status==='paid'?warehouseOrderButton(o,'packing','进入本单打包'):o.status==='ready_to_ship'?warehouseOrderButton(o,'ship','进入本单出货'):''}</div>`;
  }
  if(page==='packing'&&o.status==='ready_to_ship')html+=`<div class="form-actions">${warehouseOrderButton(o,'ship','继续登记本单出货')}</div>`;
  if(page==='ship'&&['shipped','delivered'].includes(o.status))html+=`<div class="card section-space"><div class="card-title"><h3>出货登记已完成，继续查看物流</h3>${warehouseOrderButton(o,'warehouse-tracking-detail','查看本单物流')}</div>${button('全部已出货订单物流','warehouse-tracking')}</div>`;
  if(safeRows(o.order_parcels).some(r=>associatedOrders(r.parcel_id).length>1))html=html.replace(/<button([^>]*id="(?:confirmBtn|packBtn|shipBtn)"[^>]*)>/g,'<button$1 disabled>');
  return html+warehouseQueue(page);
}
warehouseConfirm=()=>warehouseDetail('confirm',originalWarehouseConfirm);
warehousePacking=()=>warehouseDetail('packing',originalWarehousePacking);
warehouseShip=()=>warehouseDetail('ship',originalWarehouseShip);
async function openWarehouseOrder(id,page){
  if(warehouseWorkspace.busy||warehouseWorkspace.loading)return;
  const o=state.dbOrders.find(x=>x.id===id);
  if(!o){toast('该订单暂不可见，请刷新后重试');return}
  warehouseWorkspace.selectedId=id;applyDbOrder(o);state.events=[];go(page,{role:'warehouse'});
  if(page==='warehouse-tracking-detail')await loadWarehouseTracking(id);
}
async function warehouseSave(buttonEl,action,page,expected,message){
  if(warehouseWorkspace.busy||warehouseWorkspace.loading)return;
  const id=state.order.dbId;
  if(!id||warehouseWorkspace.selectedId!==id){toast('请先选择订单');return}
  if(safeRows(state.order.record?.order_parcels).some(r=>associatedOrders(r.parcel_id).length>1)){toast('历史重复关联需先由运营核对，请勿重复处理同一包裹');return}
  const originalLabel=buttonEl.textContent;let submitted=false;
  warehouseWorkspace.busy=true;buttonEl.disabled=true;buttonEl.textContent='保存并核对状态…';
  try{
    await action(id);
    submitted=true;
    state.activeOrderId=id;
    if(!await refreshDbState(page))throw new Error('操作已提交，但最新状态未读到，请刷新核对，勿重复提交');
    const saved=state.dbOrders.find(o=>o.id===id);
    if(!saved||!expected.includes(saved.status))throw new Error('最新状态与操作结果不一致，请刷新并联系运营核对');
    toast(message);
  }catch(e){toast(e.message||'保存失败，请重试')}
  finally{warehouseWorkspace.busy=false;if(buttonEl.isConnected){buttonEl.disabled=submitted;buttonEl.textContent=submitted?'已提交，请刷新核对':originalLabel}}
}
const warehouseBaseBind=bind;
bind=function(){
  warehouseBaseBind();
  if(state.role!=='warehouse'||!state.auth.user)return;
  if(warehouseWorkspace.owner!==state.auth.user.id)Object.assign(warehouseWorkspace,{owner:state.auth.user.id,selectedId:null,filter:'all',query:'',busy:false,loading:false,trackingQuery:'',trackingTab:'all',tracking:{orderId:null,events:[],loading:false,error:null,request:warehouseWorkspace.tracking.request+1}});
  document.querySelectorAll('#nav [data-page]').forEach(el=>el.addEventListener('click',()=>{if(warehouseWorkspace.busy||warehouseWorkspace.loading)return;warehouseWorkspace.selectedId=null},{capture:true}));
  document.querySelectorAll('[data-warehouse-order]').forEach(el=>el.onclick=()=>openWarehouseOrder(el.dataset.warehouseOrder,el.dataset.warehousePage));
  document.querySelectorAll('[data-warehouse-back]').forEach(el=>el.onclick=()=>{if(warehouseWorkspace.busy||warehouseWorkspace.loading)return;warehouseWorkspace.selectedId=null;render()});
  document.querySelectorAll('[data-warehouse-filter]').forEach(el=>el.onclick=()=>{if(warehouseWorkspace.busy||warehouseWorkspace.loading)return;warehouseWorkspace.filter=el.dataset.warehouseFilter;warehouseWorkspace.selectedId=null;state.page='dashboard';render()});
  document.querySelectorAll('[data-warehouse-tracking-tab]').forEach(el=>el.onclick=()=>{warehouseWorkspace.trackingTab=el.dataset.warehouseTrackingTab;render()});
  const trackingSearch=$('#warehouseTrackingSearch');if(trackingSearch)trackingSearch.onsubmit=e=>{e.preventDefault();warehouseWorkspace.trackingQuery=$('#warehouseTrackingQuery').value.trim();render()};
  const trackingRefresh=$('#warehouseTrackingRefresh');if(trackingRefresh)trackingRefresh.onclick=refreshWarehouseTracking;
  const globalRefresh=$('#workspaceGlobalRefresh');if(globalRefresh&&state.page==='warehouse-tracking-detail')globalRefresh.onclick=refreshWarehouseTracking;
  else if(globalRefresh)globalRefresh.onclick=()=>refreshDbState();
  const search=$('#warehouseSearchForm');if(search)search.onsubmit=e=>{e.preventDefault();warehouseWorkspace.query=$('#warehouseSearch').value.trim();render()};
  const receive=$('#receiveSelectedOrder');if(receive)receive.onclick=()=>warehouseSave(receive,id=>window.MospaceSupabase.warehouseReceiveOrder(id),'inbound',['warehouse_received','measuring'],'本单收货已完成，请继续确认实重尺寸');
  const confirm=$('#confirmBtn');if(confirm)confirm.onclick=()=>{
    const measurements=[...document.querySelectorAll('.measure-row')].map(row=>({parcel_no:row.dataset.parcelNo,actual_weight_kg:Number(row.querySelector('.measure-weight').value),length_cm:Number(row.querySelector('.measure-length').value),width_cm:Number(row.querySelector('.measure-width').value),height_cm:Number(row.querySelector('.measure-height').value)}));
    if(!measurements.length||measurements.some(p=>![p.actual_weight_kg,p.length_cm,p.width_cm,p.height_cm].every(v=>Number.isFinite(v)&&v>0))){toast('请填写本单全部包裹真实的正数重量、长、宽、高');return}
    warehouseSave(confirm,id=>window.MospaceSupabase.warehouseConfirmMeasurements(id,measurements),'confirm',['awaiting_payment','paid','ready_to_ship','shipped','delivered'],'本单确认已完成，等待商家付款，无需再次确认');
  };
  const pack=$('#packBtn');if(pack)pack.onclick=()=>{const box=$('#boxNo').value.trim(),note=$('#packageNote').value.trim();if(!box){toast('请填写实际箱号');return}warehouseSave(pack,id=>window.MospaceSupabase.warehousePackOrder(id,box,note),'packing',['ready_to_ship','shipped','delivered'],'本单打包已完成，进入待出货')};
  const ship=$('#shipBtn');if(ship)ship.onclick=()=>{const carrier=$('#carrier').value,tracking=$('#shipmentTrackingNo').value.trim();if(!tracking){toast('请填写真实国际物流单号');return}warehouseSave(ship,id=>window.MospaceSupabase.warehouseShipOrder(id,carrier,tracking),'ship',['shipped','delivered'],'本单出货已完成，商家端可查看物流')};
  const match=$('#matchBtn');if(match)match.onclick=async()=>{
    if(warehouseWorkspace.busy||warehouseWorkspace.loading)return;
    warehouseWorkspace.loading=true;match.disabled=true;
    try{
      const result=await window.MospaceSupabase.warehouseFindOrderByTracking($('#trackingInput').value);
      if(result.order){warehouseWorkspace.loading=false;await openWarehouseOrder(result.order.id,warehouseStage(result.order)||(['shipped','delivered'].includes(result.order.status)?'ship':'confirm'));return}
      const p=result.parcel;
      $('#matchResult').innerHTML=notice(p.status==='pre_advised'?'已找到独立预报包裹':'包裹已登记收货',`${p.tracking_no} · ${p.item_name||''}；${p.status==='pre_advised'?'核对实物到仓后点击登记。':'无需再次登记，等待商家申请打包。'}`)+(p.status==='pre_advised'?'<button class="btn primary" id="receiveIndependentParcel">确认此包裹已到仓</button>':'');
      const save=$('#receiveIndependentParcel');if(save)save.onclick=async()=>{
        if(warehouseWorkspace.busy)return;warehouseWorkspace.busy=true;save.disabled=true;
        try{await rpcWorkspace('warehouse_receive_parcel',{p_parcel_id:p.id});await refreshDbState('inbound');toast('独立包裹收货已保存')}catch(e){toast(e.message)}finally{warehouseWorkspace.busy=false;render()}
      };
    }catch(e){toast('匹配失败：'+e.message)}finally{warehouseWorkspace.loading=false;match.disabled=false}
  };
};
// 保存期间禁止切走另一笔订单，避免将返回结果误认为当前正在查看的订单。
const warehouseBaseGo=go;
go=function(page,options={}){if(state.role==='warehouse'&&(warehouseWorkspace.busy||warehouseWorkspace.loading)){toast('正在处理本单，请稍候');return false}return warehouseBaseGo(page,options)};
