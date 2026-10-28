/* 一批货只展示一个整体订单；各运输段仍按各自记录核价、付款和作业。 */
'use strict';
function overallOrderRoot(o){
 if(!isLastMile(o))return o;
 return state.dbOrders.find(p=>p.id===o.parent_order_id&&!isLastMile(p))||o;
}
function overallOrderRoots(rows){
 const seen=new Set();return safeRows(rows).map(overallOrderRoot).filter(o=>o&&!seen.has(o.id)&&seen.add(o.id));
}
function overallOrderLegs(o){
 const head=overallOrderRoot(o);
 return isLastMile(head)?[head]:[head,...state.dbOrders.filter(t=>isLastMile(t)&&t.parent_order_id===head.id)];
}
function overallOrderSearch(o,query){
 const q=String(query||'').trim().toLowerCase();
 return !q||overallOrderLegs(o).some(x=>[x.order_no,x.recipient_name,x.destination_city,x.shipment_tracking_no,x.shipment_carrier,x.tail_tracking_no,x.tail_carrier,...safeRows(x.order_parcels).map(p=>p.parcels?.tracking_no)].join(' ').toLowerCase().includes(q));
}
function overallOrderButton(o,label='查看整体订单'){
 return `<button type="button" class="btn small ghost" data-overall-order="${esc(overallOrderRoot(o).id)}">${label}</button>`;
}
function overallFeeText(o){
 const f=feeRecord(o);if(f?.confirmed_at&&f.total_amount!=null)return money(f.total_amount);
 return f?.estimated_total!=null?`${money(f.estimated_total)}（预估）`:'待确认';
}
function overallFees(o){
 const legs=overallOrderLegs(o),head=overallOrderRoot(o),tail=legs.find(isLastMile);
 return `<div class="overall-fees"><span>${isLastMile(head)?'尾程':'头程'}：<b>${overallFeeText(head)}</b></span>${!isLastMile(head)?`<span>尾程：<b>${tail?overallFeeText(tail):'尚未申请'}</b></span>`:''}</div>`;
}
function overallDestination(o){
 const head=overallOrderRoot(o),tail=overallOrderLegs(head).find(isLastMile);
 return `${esc(head.destination_country||'印度尼西亚')} · ${esc(head.destination_city||'')} ${tail&&!isLastMile(head)?`<br><small class="muted">尾程目的地：${esc(tail.destination_city||'')} · ${esc(tail.recipient_name||'')}</small>`:''}`;
}
workspaceOrderTable=function(rows){
 const roots=overallOrderRoots(rows);
 return `<div class="table-wrap"><table class="table overall-order-table"><thead><tr><th>整体订单号 / 创建时间</th><th>线路 / 目的地</th><th>包裹</th><th>分段费用（CNY）</th><th>整体进度</th><th>操作</th></tr></thead><tbody>${roots.map(o=>`<tr data-overall-row="${esc(o.id)}"><td class="mono">${esc(o.order_no)}<br><small class="muted">${dateText(o.created_at)}</small></td><td>${esc(o.route_name||'')}<br><small>${overallDestination(o)}</small></td><td>${o.parcel_count||0}</td><td>${overallFees(o)}</td><td>${orderProgressHtml(o)}</td><td>${overallOrderButton(o)}</td></tr>`).join('')}</tbody></table></div>`;
};
merchantOrders=function(){
 const roots=overallOrderRoots(state.dbOrders).filter(o=>orderMatchesProgress(o,workspace.orderTab)&&overallOrderSearch(o,workspace.orderQuery));
 return shell('我的订单','一批货一个整体订单，进入后接续查看头程与尾程。',button('去我的包裹申请打包','parcels',true))+
 tabs([['all','全部订单'],['pending','待仓库确认'],['awaiting_payment','待付款'],['paid','待打包'],['ready_to_ship','待出货'],['overseas','已到印尼仓'],['shipped','运输中'],['delivered','已签收']],workspace.orderTab,'data-order-tab')+
 `<div class="card"><form class="workspace-toolbar" id="orderSearch"><input id="orderSearchText" aria-label="搜索订单" placeholder="整体订单号 / 尾程单号 / 国内快递号 / 收件人 / 运单号" value="${esc(workspace.orderQuery)}"><button class="btn ghost">搜索</button><button class="btn ghost" type="button" data-refresh-workspace>刷新</button></form>${roots.length?workspaceOrderTable(roots):emptyState('没有匹配的订单','预报包裹并申请打包后，头程与后续尾程会归在同一个订单中。')}</div>`;
};
function overallLegStatus(o){return !isLastMile(o)&&o.overseas_received_at?status('已到印尼仓','green'):status(orderStatusLabel(o.status),statusTone(o.status))}
function overallLegActions(o){
 if(state.role==='merchant')return orderAction(o,'fee',o.status==='awaiting_payment'?'查看费用与付款':isLastMile(o)?'查看尾程费用与记录':'查看头程费用与记录')+orderAction(o,'tracking','查看本段物流');
 const stage=warehouseStage(o),labels={inbound:'头程收货',confirm:isLastMile(o)?'核对尾程费用':'确认头程实重费用',packing:isLastMile(o)?'尾程出库准备':'头程打包',ship:isLastMile(o)?'登记尾程出货':'登记头程出货'};
 return warehouseOrderButton(o,stage||(['shipped','delivered'].includes(o.status)?'ship':'confirm'),stage?labels[stage]:'查看本段作业记录')+(['shipped','delivered'].includes(o.status)?warehouseOrderButton(o,'warehouse-tracking-detail','查看本段物流'):'');
}
function overallLegCard(o){
 const tail=isLastMile(o),f=feeRecord(o),paid=paymentRecord(o)?.status==='paid',r=orderReceipt(o.id);
 const payment=paid?'已付款':r?.status==='pending'?'付款凭证审核中':o.status==='awaiting_payment'?'待付款':'尚未付款';
 return `<section class="card overall-leg-card" aria-label="${tail?'尾程配送':'头程运输'}"><div class="card-title"><h2>${tail?'2. 尾程配送':'1. 头程运输'}</h2>${overallLegStatus(o)}</div><p>${tail?'印尼仓 → 消费者':'深圳仓 → 印尼仓'}</p><div class="metric"><span>${tail?'尾程作业单号':'头程单号'}</span><b class="mono">${esc(o.order_no)}</b></div><div class="metric"><span>本段费用</span><b>${overallFeeText(o)}</b></div><div class="metric"><span>本段付款</span><b>${payment}</b></div><div class="metric"><span>${tail?'消费者收件人':'印尼仓联系人'}</span><b>${esc(o.recipient_name||'')} · ${esc(o.recipient_phone||'')}</b></div><div class="metric"><span>${tail?'消费者收货地址':'印尼仓地址'}</span><b>${esc(o.destination_address||'待填写')}</b></div><div class="metric"><span>发货仓地址</span><b>${esc(o.origin_warehouse_address||'待登记')}</b></div><div class="metric"><span>承运商 / 运单号</span><b>${esc(o.shipment_carrier||'待登记')} / ${esc(o.shipment_tracking_no||'待登记')}</b></div>${f?.last_mile_note?`<p class="page-note">尾程计费依据：${esc(f.last_mile_note)}</p>`:''}${tail?orderDistanceFeesHtml(o):''}<div class="form-actions">${overallLegActions(o)}</div></section>`;
}
function overallOrderDetail(){
 const selected=state.order.record;if(!selected)return shell('整体订单','请先从订单列表选择一笔订单。',button('返回订单列表',state.role==='merchant'?'orders':'dashboard'));
 const head=overallOrderRoot(selected),legs=overallOrderLegs(head),tail=legs.find(isLastMile),orphan=isLastMile(head);
 return shell('整体订单',head.order_no,button('返回订单列表',state.role==='merchant'?'orders':'dashboard')+`<button type="button" class="btn ghost" data-refresh-workspace>刷新进度</button>`)+
 `<div class="card overall-summary"><div class="card-title"><h2 class="mono">${esc(head.order_no)}</h2>${orderProgressHtml(head)}</div><p>一批货从深圳仓发出，到印尼仓后接续尾程配送，均在本订单内查询。</p>${overallFees(head)}<p class="page-note">头程与尾程分别核价、分别付款；已付头程费用不重复收取。</p>${orphan?notice('关联头程暂不可见','当前仅显示有权限读取的尾程记录，请刷新或联系运营核对关联头程。'):''}</div>`+
 `<div class="grid layout-2 section-space overall-leg-grid">${legs.map(overallLegCard).join('')}${!tail?`<section class="card"><h2>2. 尾程配送</h2>${notice(head.overseas_received_at?'待申请尾程配送':'等待头程到印尼仓',head.overseas_received_at?'商家填写消费者收货地址后，尾程信息会显示在这里。':'头程到印尼仓后，在本订单内填写消费者地址，继续尾程配送。')}</section>`:''}</div>`+
 (state.role==='merchant'&&!tail?lastMileRequest(head):'');
}
async function openOverallOrder(id){
 const selected=state.dbOrders.find(o=>o.id===id);if(!selected){toast('订单暂不可见，请刷新');return}
 const head=overallOrderRoot(selected);
 if(state.role==='warehouse')return openWarehouseOrder(head.id,'overall-order');
 if(state.role!=='merchant'||paymentWorkspace.busy||workspace.parcelBusy)return;
 applyDbOrder(head);state.events=[];go('overall-order',{role:'merchant'});
}
function overallOrderNav(o){
 if(!o)return '';
 const head=overallOrderRoot(o),legs=overallOrderLegs(head);
 const link=x=>state.role==='merchant'?orderAction(x,'fee',isLastMile(x)?'尾程费用与付款':'头程费用与付款'):warehouseOrderButton(x,warehouseStage(x)||'ship',isLastMile(x)?'尾程作业':'头程作业');
 return `<div class="card overall-nav"><div><small>所属整体订单</small><b class="mono">${esc(head.order_no)}</b><small>当前查看：${isLastMile(o)?'尾程':'头程'}</small></div><div class="form-actions">${overallOrderButton(head,'返回整体订单')}${legs.map(link).join('')}</div></div>`;
}
const overallMerchantFee=merchantFee;merchantFee=function(){return overallOrderNav(state.order.record)+overallMerchantFee()};
const overallMerchantTracking=merchantTracking;merchantTracking=function(){return overallOrderNav(state.order.record)+overallMerchantTracking()};
const overallWarehouseContext=warehouseContext;warehouseContext=function(o){return overallOrderNav(o)+overallWarehouseContext(o)};
const overallWarehouseTrackingDetail=warehouseTrackingDetail;warehouseTrackingDetail=function(){return overallOrderNav(warehouseSelected())+overallWarehouseTrackingDetail()};
warehouseOrderRows=function(rows){
 const roots=overallOrderRoots(rows);
 if(!roots.length)return emptyState('当前没有此类订单','返回全部订单查看其他进度。');
 return `<div class="table-wrap"><table class="table overall-order-table"><thead><tr><th>整体订单号 / 国内快递单号</th><th>包裹 / 目的地</th><th>分段费用（CNY）</th><th>整体进度</th><th>操作</th></tr></thead><tbody>${roots.map(o=>{
 const tracking=safeRows(o.order_parcels).map(r=>r.parcels?.tracking_no||r.parcels?.parcel_no).filter(Boolean);
 const tasks=overallOrderLegs(o).filter(x=>rows.some(r=>r.id===x.id)&&warehouseStage(x));
 return `<tr data-overall-row="${esc(o.id)}"><td><b class="mono">${esc(o.order_no)}</b><br><small class="muted">${esc(tracking.join(' / ')||'未关联快递单号')}</small></td><td>${o.parcel_count||0} 个<br><small>${overallDestination(o)}</small></td><td>${overallFees(o)}</td><td>${orderProgressHtml(o)}</td><td>${overallOrderButton(o)}${tasks.map(x=>warehouseOrderButton(x,warehouseStage(x),isLastMile(x)?'继续尾程作业':'继续头程作业')).join('')}</td></tr>`;
 }).join('')}</tbody></table></div>`;
};
function overallTrackingTable(roots,warehouse){
 return `<div class="table-wrap"><table class="table"><thead><tr><th>整体订单号</th><th>头程 / 尾程运单</th><th>整体进度</th><th>操作</th></tr></thead><tbody>${roots.map(o=>`<tr data-overall-row="${esc(o.id)}"><td>${esc(o.order_no)}</td><td>${overallOrderLegs(o).map(x=>`${isLastMile(x)?'尾程':'头程'}：${esc(x.shipment_carrier||'待登记')} / ${esc(x.shipment_tracking_no||'待登记')}`).join('<br>')}</td><td>${orderProgressHtml(o)}</td><td>${overallOrderButton(o)}${overallOrderLegs(o).filter(x=>!warehouse||['shipped','delivered'].includes(x.status)||x.shipped_at).map(x=>warehouse?warehouseOrderButton(x,'warehouse-tracking-detail',isLastMile(x)?'尾程物流':'头程物流'):orderAction(x,'tracking',isLastMile(x)?'尾程物流':'头程物流')).join('')}</td></tr>`).join('')}</tbody></table></div>`;
}
merchantTrackingList=function(){
 const sea=state.page==='sea-tracking',rows=overallOrderRoots(state.dbOrders).filter(o=>(!sea||overallOrderLegs(o).some(x=>/SEA/i.test(x.route_code)||/海运/.test(x.route_name)))&&overallOrderSearch(o,workspace.trackingQuery));
 return shell(sea?'海运追踪':'物流查询','按整体订单查看头程、尾程的后续运输进度。',button('我的订单','orders'))+`<div class="card"><form id="trackingSearch" class="workspace-toolbar"><input id="trackingSearchText" aria-label="搜索物流" value="${esc(workspace.trackingQuery)}" placeholder="整体订单号 / 尾程单号 / 运单号 / 收件人"><button class="btn primary">查询</button></form>${rows.length?overallTrackingTable(rows,false):emptyState('暂无匹配的物流记录','订单的头程与尾程将在同一行显示。')}</div>`;
};
warehouseTrackingList=function(){
 const roots=overallOrderRoots(warehouseShippedOrders()),rows=roots.filter(o=>orderMatchesProgress(o,warehouseWorkspace.trackingTab)&&overallOrderSearch(o,warehouseWorkspace.trackingQuery));
 return shell('物流查询','同一个整体订单内查询头程及尾程。',button('返回仓库工作台','dashboard'))+`<div class="card"><div class="workspace-tabs">${[['all','全部已出货'],['overseas','已到印尼仓'],['shipped','运输中'],['delivered','已签收']].map(([key,label])=>`<button type="button" data-warehouse-tracking-tab="${key}" class="${warehouseWorkspace.trackingTab===key?'active':''}">${label}（${roots.filter(o=>orderMatchesProgress(o,key)).length}）</button>`).join('')}</div><form id="warehouseTrackingSearch" class="workspace-toolbar"><input id="warehouseTrackingQuery" aria-label="搜索仓库物流" value="${esc(warehouseWorkspace.trackingQuery)}" placeholder="整体订单号 / 尾程单号 / 运单号 / 收件人"><button class="btn primary">查询</button></form>${rows.length?overallTrackingTable(rows,true):emptyState('暂无匹配的物流记录','完成出货后在整体订单中查询。')}</div>`;
};
MerchantViews['overall-order']=overallOrderDetail;MerchantViews['tracking-list']=merchantTrackingList;MerchantViews['sea-tracking']=merchantTrackingList;
const overallNavActive=navActivePage;navActivePage=function(page,role){return page==='overall-order'?(role==='merchant'?'orders':'dashboard'):overallNavActive(page,role)};
const overallMerchantFrame=merchantPageFrame;merchantPageFrame=function(html){
 if(state.page!=='overall-order')return overallMerchantFrame(html);
 $('#crumb').textContent='我的订单 / 整体订单';return `<nav class="workspace-breadcrumb" aria-label="页面位置"><button data-page="orders">我的订单</button><span>/</span><span>整体订单</span></nav>`+html;
};
const overallBind=bind;bind=function(){overallBind();document.querySelectorAll('[data-overall-order]').forEach(el=>el.onclick=()=>openOverallOrder(el.dataset.overallOrder))};
