/* 商家工作台：共享现有角色校验、订单数据与一次付款接口。 */
'use strict';
const workspace = {owner:null, parcels:[], routes:[], warehouses:[], overseasWarehouses:[], tickets:[], errors:{}, parcelTab:'all', parcelQuery:'', parcelPage:1, parcelPageSize:10, editParcelId:null, parcelBusy:false, orderQuery:'', orderTab:'all', trackingQuery:'', selected:new Set(), editingAddress:null, quote:null, read:[]};
const parcelLabels = {pre_advised:'待入库',received:'已入库',measuring:'测量中',measured:'已测量',consolidated:'已打包',shipped:'已出货',exception:'异常'};
const money = n => n == null ? '待确认' : '¥'+Number(n).toFixed(2);
const dateText = v => v ? new Date(v).toLocaleString('zh-CN',{hour12:false}) : '—';
const button = (label,page,primary=false) => `<button type="button" class="btn ${primary?'primary':'ghost'}" data-page="${page}">${label}</button>`;
const emptyState = (title,copy,action='') => `<div class="empty-state"><div class="empty-symbol">◇</div><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;
const notice = (title,copy) => `<div class="notice"><div>ⓘ</div><div><strong>${esc(title)}</strong><p>${esc(copy)}</p></div></div>`;
const field = (label,id,value='',type='text',extra='') => `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" value="${esc(value??'')}" ${extra}></div>`;
const safeRows = (value) => Array.isArray(value)?value:[];
// 商家预报与仓库实测分开，不能把估算写入入库确认字段。
const declaredKeys=['weight_kg','length_cm','width_cm','height_cm'];
function measurementFields(prefix,p={}){
  return declaredKeys.map((k,i)=>field(['预报重量（kg）','预报长度（cm）','预报宽度（cm）','预报高度（cm）'][i],prefix+k,p['declared_'+k]??'','number',`min="${i?'0.01':'0.001'}" max="10000" step="${i?'0.01':'0.001'}" placeholder="选填"`)).join('');
}
function readDeclaredMeasurements(prefix){
  const result={};
  declaredKeys.forEach((k,i)=>{
    const raw=$('#'+prefix+k).value.trim(),n=raw===''?null:Number(raw);
    if(n!==null&&(!Number.isFinite(n)||n<=0||n>10000||Math.abs(n*10**(i?2:3)-Math.round(n*10**(i?2:3)))>1e-6))throw Error('重量须为正数且最多3位小数，尺寸最多2位小数，均不超过10000');
    result[k]=n;
  });
  const dimensions=declaredKeys.slice(1).filter(k=>result[k]!==null).length;
  if(dimensions!==0&&dimensions!==3)throw Error('长、宽、高请同时填写，或全部留空');
  return result;
}
function parcelEstimateMeasurement(p){
  const actual=[p.actual_weight_kg,p.length_cm,p.width_cm,p.height_cm];
  const declared=declaredKeys.map(k=>p['declared_'+k]);
  const complete=vs=>vs.every(v=>v!=null&&Number.isFinite(Number(v))&&Number(v)>0);
  if(complete(actual))return {values:actual.map(Number),source:'仓库实测'};
  if(complete(declared))return {values:declared.map(Number),source:'商家预报'};
  return null;
}
function estimatePacking(parcels,route){
  const missing=parcels.filter(p=>!parcelEstimateMeasurement(p));
  if(!parcels.length)return {status:'empty'};
  const validRoute=route&&route.is_active&&Number(route.volume_divisor)>0&&['volume_divisor','first_weight_kg','first_price','additional_price_per_kg','handling_fee'].every(k=>route[k]!=null&&Number.isFinite(Number(route[k]))&&Number(route[k])>=0);
  if(!validRoute)return {status:'no_route'};
  if(missing.length)return {status:'incomplete',missing:missing.map(p=>p.tracking_no),count:parcels.length};
  const round=(n,d)=>Math.round((n+Number.EPSILON)*10**d)/10**d;
  const measurements=parcels.map(parcelEstimateMeasurement);
  const weight=round(measurements.reduce((n,m)=>n+m.values[0],0),3);
  const volume=round(measurements.reduce((n,m)=>n+m.values[1]*m.values[2]*m.values[3]/Number(route.volume_divisor),0),3);
  const billable=Math.max(weight,volume),handling=Number(route.handling_fee),basis=route.billing_basis||'kg';
  const cbm=Math.ceil(measurements.reduce((s,m)=>s+m.values[1]*m.values[2]*m.values[3],0)-1e-9)/1000000;
  if(basis==='cbm'&&(route.price_per_cbm==null||!Number.isFinite(Number(route.price_per_cbm))||Number(route.price_per_cbm)<0||!Number.isFinite(Number(route.minimum_cbm))||!(Number(route.minimum_cbm)>0)))return {status:'no_route'};
  const billableCbm=basis==='cbm'?Math.max(cbm,Number(route.minimum_cbm)):null;
  const seaChargeRule=route.sea_charge_rule||'volume_only',seaPricePerKg=route.sea_price_per_kg;
  if(basis==='cbm'&&seaChargeRule==='higher_of_weight_volume'&&(seaPricePerKg==null||!Number.isFinite(Number(seaPricePerKg))||Number(seaPricePerKg)<=0))return {status:'no_route'};
  const seaVolumeCharge=basis==='cbm'?round(billableCbm*Number(route.price_per_cbm),2):null;
  const seaWeightCharge=basis==='cbm'&&seaChargeRule==='higher_of_weight_volume'?round(weight*Number(seaPricePerKg),2):null;
  const shipping=basis==='cbm'?Math.max(seaVolumeCharge,seaWeightCharge||0):round(Number(route.first_price)+Math.max(0,billable-Number(route.first_weight_kg))*Number(route.additional_price_per_kg),2);
  return {status:'ready',count:parcels.length,weight,volume,billable,shipping,handling,total:round(shipping+handling,2),billingBasis:basis,volumeCbm:cbm,billableCbm,pricePerCbm:route.price_per_cbm,minimumCbm:route.minimum_cbm,seaChargeRule,seaPricePerKg,seaVolumeCharge,seaWeightCharge,isTestRate:route.is_test_rate,measuredCount:measurements.filter(m=>m.source==='仓库实测').length,routeName:route.route_name,routeCode:route.route_code,volumeDivisor:Number(route.volume_divisor),firstWeight:Number(route.first_weight_kg),firstPrice:Number(route.first_price),additionalPrice:Number(route.additional_price_per_kg),pricingUpdatedAt:route.updated_at};
}
function packingEstimateHtml(q,snapshot=false){
  let body;
  if(q?.status==='ready')body=`<p class="estimate-total">${money(q.total)} <small>人民币 · 仅供参考</small></p><div class="estimate-grid">${[['包裹数',q.count+' 个'],['重量合计',formatWeight(q.weight)],['合包前体积重参考',formatWeight(q.volume)],['预估计费重量',formatWeight(q.billable)],['预估运费',money(q.shipping)],['预估操作费',money(q.handling)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}</div><p class="page-note">${esc(q.routeName||'')} · 首重 ${esc(q.firstWeight)} kg / ${money(q.firstPrice)}，续重 ${money(q.additionalPrice)}/kg，体积系数 ${esc(q.volumeDivisor)}。${q.measuredCount?`${q.measuredCount} 件使用仓库实测，其余使用商家预报。`:'按商家预报重量和外包装尺寸计算。'}</p>`;
  else body=`<p class="muted">${q?.status==='incomplete'?`资料不完整，${q.missing.length} 件包裹缺少重量或完整尺寸，暂无法完整预估。<br>${q.missing.map(esc).join('、')}`:q?.status==='no_route'?'暂无可用运价，请联系运营配置线路。':'选择包裹后显示预估费用。'}</p>`;
  return `<h3>${snapshot?'下单时费用预估':'合包费用预估'}</h3>${body}<p class="page-note">按当前线路汇总计费；合包前体积仅为参考，分箱方式不在此自动加收费用。最终以仓库确认的实际重量、尺寸和费用为准，确认后只付款一次。</p>`;
}
function selectedPackingParcels(){return allParcels().filter(p=>workspace.selected.has(p.id)&&!p.order&&!['exception','shipped','consolidated'].includes(p.status))}
function updatePackingEstimate(){
  const el=$('#packingEstimate');
  if(el)el.innerHTML=packingEstimateHtml(estimatePacking(selectedPackingParcels(),workspace.routes.find(r=>r.route_code===$('#packingRoute').value)));
}
function icon(name){
  const paths={dashboard:'M3 10l9-7 9 7v11H3z M9 21v-8h6v8',parcels:'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 5 9-5 M12 12v9',orders:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',receivers:'M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z M10 9h4',tracking:'M3 6h12v11H3z M15 10h4l3 4v3h-7 M5 17v3h3v-3 M17 17v3h3v-3',rates:'M12 3v18 M16 7H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8',address:'M3 10l9-6 9 6v11H3z M8 21v-7h8v7',messages:'M5 17h14l-2-4V8a5 5 0 0 0-10 0v5z M10 21h4',support:'M4 13v-2a8 8 0 0 1 16 0v6h-4v-7h4 M4 10h4v7H4 M16 21h-4',offers:'M3 3h9l9 9-9 9-9-9z M7 7h1',billing:'M3 5h18v15H3z M3 9h18 M16 13h5',profile:'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-3a8 8 0 0 1 16 0v3'};
  return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${paths[name]||paths.orders}"/></svg></span>`;
}
Object.assign(pageRoles,{'parcel-edit':'merchant','pre-advise':'merchant','packing-request':'merchant','packing-history':'merchant',receivers:'merchant','tracking-list':'merchant','sea-tracking':'merchant',rates:'merchant',messages:'merchant',support:'merchant',offers:'merchant',billing:'merchant',profile:'merchant','support-admin':'admin'});
async function queryData(table,columns='*'){
  // 分批读取包裹，避免接口默认行数上限截断列表和分页总数。
  if(table==='parcels'){
    const rows=[],batchSize=500;
    for(let offset=0;;offset+=batchSize){
      const {data,error}=await window.MospaceSupabase.getClient().from(table).select(columns)
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+batchSize-1);
      if(error)throw error;
      rows.push(...(data||[]));
      if(!data||data.length<batchSize)break;
    }
    return rows;
  }
  const {data,error}=await window.MospaceSupabase.getClient().from(table).select(columns);
  if(error)throw error;
  return data||[];
}
async function loadMerchantWorkspace(){
  if(!state.auth.user)return;
  if(workspace.owner!==state.auth.user.id){
    workspace.lastMileZones=[];
    Object.assign(workspace,{owner:state.auth.user.id,parcels:[],routes:[],warehouses:[],overseasWarehouses:[],tickets:[],errors:{},selected:new Set(),editingAddress:null,addressReturn:null,packingDraft:{},supportOrderId:null,read:[],quote:null,parcelQuery:'',parcelPage:1,parcelPageSize:10,editParcelId:null,parcelBusy:false,orderQuery:'',trackingQuery:'',parcelTab:'all',orderTab:'all'});
    try{workspace.read=JSON.parse(localStorage.getItem('mospace-read-'+workspace.owner)||'[]')}catch(e){workspace.read=[]}
  }
  const jobs={};
  if(['merchant','warehouse','admin'].includes(state.role))jobs.lastMileZones=()=>queryData('last_mile_zones');
  if(state.role==='merchant')Object.assign(jobs,{parcels:()=>queryData('parcels'),routes:()=>queryData('route_pricing'),warehouses:()=>queryData('warehouses')});
  if(state.role==='warehouse')jobs.parcels=()=>queryData('parcels');
  if(state.role==='admin')jobs.routes=()=>queryData('route_pricing');
  if(['merchant','admin'].includes(state.role)){jobs.tickets=()=>queryData('support_tickets');jobs.overseasWarehouses=()=>queryData('overseas_warehouses');}
  await Promise.all(Object.entries(jobs).map(async([key,fn])=>{
    try{workspace[key]=await fn();delete workspace.errors[key]}catch(e){workspace[key]=[];workspace.errors[key]=e.message}
  }));
  if(!state.dbOrders.length){
    state.activeOrderId=null;state.order={id:'',status:'draft',parcels:0,confirmed:0,estimated:0,confirmedAmount:null,paidAmount:null,consolidated:false,record:null};state.parcels=[];state.events=[];
  }
}
function workspaceError(key){return workspace.errors[key]?notice('数据暂不可用','请点击刷新重试；若持续失败，请联系平台检查配置。'):''}
function associatedOrders(parcelId){return state.dbOrders.filter(o=>safeRows(o.order_parcels).some(r=>r.parcel_id===parcelId))}
function associatedOrder(parcelId){const rank={delivered:9,shipped:8,ready_to_ship:7,paid:6,awaiting_payment:5,measuring:4,warehouse_received:3,submitted:2,draft:1,cancelled:0};return associatedOrders(parcelId).sort((a,b)=>(rank[b.status]||0)-(rank[a.status]||0))[0]}
function canRequestLegacy(o){return !o.consolidated&&['submitted','warehouse_received','measuring'].includes(o.status)&&safeRows(o.order_parcels).every(r=>!['shipped','exception','consolidated'].includes(r.parcels?.status))}
function canMaintainParcel(p){
  return p?.status==='pre_advised'&&!p.received_at&&!p.measured_at&&
    ['actual_weight_kg','length_cm','width_cm','height_cm'].every(k=>p[k]==null)&&!associatedOrders(p.id).length;
}
function parcelMaintenanceActions(p){
  if(!canMaintainParcel(p))return '';
  return `<button type="button" class="btn small ghost" data-edit-parcel="${p.id}" ${workspace.parcelBusy?'disabled':''}>编辑</button><button type="button" class="btn small ghost parcel-delete" data-delete-parcel="${p.id}" ${workspace.parcelBusy?'disabled':''}>删除</button>`;
}
function merchantParcelEdit(){
  const p=workspace.parcels.find(p=>p.id===workspace.editParcelId);
  const head=shell('编辑包裹预报','修改快递资料及预报重量、外包装尺寸。',button('返回我的包裹','parcels'));
  if(!canMaintainParcel(p))return head+notice('此包裹当前不可编辑','仅待入库、尚未关联订单的包裹可自行编辑；其他情况请联系运营处理。');
  return head+`<div class="card"><form id="parcelEditForm"><div class="form-grid">${field('国内快递单号','editParcelTracking',p.tracking_no,'text','required minlength="5" maxlength="80"')}${field('快递公司','editParcelCarrier',p.carrier||'','text','maxlength="80"')}${field('包裹品名','editParcelItem',p.item_name||'','text','required maxlength="120"')}${measurementFields('editParcel',p)}</div><p class="page-note">仅修改当前包裹的预报资料；仓库入库或申请打包后不能自行更改。</p><div class="form-actions">${button('取消','parcels')}<button type="submit" class="btn primary" ${workspace.parcelBusy?'disabled':''}>保存修改</button></div></form></div>`;
}
async function maintainParcel(id,action,values={}){
  if(workspace.parcelBusy)return;
  const p=workspace.parcels.find(p=>p.id===id),owner=state.auth.user?.id;
  if(!owner||state.auth.role!=='merchant'||!canMaintainParcel(p))throw Error('包裹已入库或关联订单，不能编辑或删除，请刷新后核对');
  workspace.parcelBusy=true;
  document.querySelectorAll('[data-edit-parcel],[data-delete-parcel],#parcelEditForm button').forEach(b=>b.disabled=true);
  try{
    const result=await rpcWorkspace(action==='edit'?(values.p_measurements?'merchant_edit_parcel_with_measurements':'merchant_edit_parcel'):'merchant_delete_parcel',{
      p_parcel_id:id,p_expected_updated_at:p.updated_at,...values
    });
    if((action==='edit'?result?.id:result)!==id)throw Error('未收到有效保存结果，请刷新核对');
    if(state.auth.user?.id!==owner)return;
    workspace.selected.delete(id);workspace.editParcelId=null;
    if(action==='delete'&&workspace.detailParcelId===id)workspace.detailParcelId=null;
    const refreshed=await refreshDbState('parcels');
    if(state.auth.user?.id===owner)toast((action==='edit'?'修改已保存':'包裹已删除')+(refreshed?'':'，列表刷新失败，请点击刷新数据'),6000);
  }catch(e){
    if(e.code==='PGRST202')throw Error('包裹编辑和删除功能尚未在数据库启用，请联系管理员');
    throw e;
  }finally{
    if(workspace.owner===owner){
      workspace.parcelBusy=false;
      if(state.auth.user?.id===owner)document.querySelectorAll('[data-edit-parcel],[data-delete-parcel],#parcelEditForm button').forEach(b=>b.disabled=false);
    }
  }
}
const parcelBaseGo=go;
go=function(page,options={}){
  if(state.role==='merchant'&&state.auth.user?.id===workspace.owner&&workspace.parcelBusy){toast('正在保存包裹，请稍候');return false}
  return parcelBaseGo(page,options);
};
function allParcels(){return workspace.parcels.map(p=>({...p,order:associatedOrder(p.id)}))}
// 整票进度从关联尾程推导；本段作业状态和费用仍使用各自订单记录。
function orderProgress(o){
 const tail=o?.transport_leg==='last_mile'?o:state.dbOrders.find(t=>t.transport_leg==='last_mile'&&t.parent_order_id===o?.id);
 const arrived=o?.transport_leg!=='last_mile'&&o?.overseas_received_at;
 if(o?.status==='cancelled'||o?.status==='exception')return {label:orderStatusLabel(o.status),tone:statusTone(o.status),group:o.status,detail:''};
 if(tail&&(arrived||tail===o)){
  const labels={warehouse_received:'待尾程报价',measuring:'待尾程报价',submitted:'待尾程报价',awaiting_payment:typeof orderReceipt==='function'&&orderReceipt(tail.id)?.status==='pending'?'尾程付款审核中':'尾程待付款',paid:'尾程待出库',ready_to_ship:'尾程待出库',shipped:'尾程派送中',delivered:'尾程已签收',cancelled:'尾程已取消',exception:'尾程异常'};
  const label=labels[tail.status]||orderStatusLabel(tail.status);
  return {label:tail.status==='delivered'?'已签收':label,tone:statusTone(tail.status),group:tail.status,detail:arrived?'头程已到印尼仓 · '+label:tail.status==='delivered'?'尾程配送完成':''};
 }
 return {label:arrived?'头程已到印尼仓':orderStatusLabel(o?.status),tone:arrived?'blue':statusTone(o?.status),group:arrived?'overseas':o?.status,detail:arrived?'等待申请尾程配送':''};
}
function orderProgressHtml(o){
 const p=orderProgress(o);
 return `<span class="order-progress">${status(p.label,p.tone)}${p.detail?`<small class="muted">${esc(p.detail)}</small>`:''}</span>`;
}
function orderMatchesProgress(o,tab){
 const group=orderProgress(o).group;
 return tab==='all'||(tab==='pending'?['submitted','warehouse_received','measuring'].includes(group):group===tab);
}
function parcelTailOrder(p){return p.order&&state.dbOrders.find(o=>o.transport_leg==='last_mile'&&o.parent_order_id===p.order.id&&o.status!=='cancelled')}
function parcelProgress(p){
 const head=p.order,tail=parcelTailOrder(p);
 if(p.status==='exception')return {group:'exception',label:'异常'};
 if(tail){
  if(tail.status==='delivered')return {group:'delivered',label:'已签收'};
  if(tail.status==='shipped')return {group:'tail-shipped',label:'尾程派送中'};
  if(['paid','ready_to_ship'].includes(tail.status))return {group:'tail-pending',label:'尾程待出库'};
  if(tail.status==='awaiting_payment')return {group:'tail-pending',label:typeof orderReceipt==='function'&&orderReceipt(tail.id)?.status==='pending'?'尾程付款审核中':'尾程待付款'};
  return {group:'tail-pending',label:'待尾程报价'};
 }
 if(head?.status==='delivered')return {group:'delivered',label:'已签收'};
 if(head?.overseas_received_at)return {group:'overseas',label:'已到印尼仓'};
 if(head?.status==='shipped'||p.status==='shipped')return {group:'shipped',label:head?.transport_leg==='last_mile'?'尾程派送中':'头程运输中'};
 if(head?.status==='ready_to_ship'||p.status==='consolidated')return {group:'packed',label:'已打包'};
 if(p.status==='pre_advised')return {group:'pending',label:'待入库'};
 return {group:'received',label:parcelLabels[p.status]||p.status};
}
function parcelGroup(p){return parcelProgress(p).group}
function parcelLabel(p){return parcelProgress(p).label}
function parcelLinkedOrders(p){const tail=parcelTailOrder(p);return p.order?`${esc(p.order.order_no)}${tail?`<br><small>尾程：${esc(tail.order_no)}</small>`:''}`:'未申请打包'}
async function selectWorkspaceOrder(id,page){
  const o=state.dbOrders.find(x=>x.id===id);
  if(!o){toast('未找到订单，请刷新列表');return}
  applyDbOrder(o);state.events=[];
  const selectedId=o.id;
  try{const events=await window.MospaceSupabase.orderTracking(id);if(state.activeOrderId!==selectedId)return;applyTracking(events)}catch(e){toast('物流节点读取失败，请刷新重试')}
  go(page,{role:'merchant'});
}
function orderAction(o,page,label){return `<button class="btn small ghost" data-order-target="${o.id}" data-order-page="${page}">${label}</button>`}
function tabs(items,current,attribute){return `<div class="workspace-tabs" role="tablist">${items.map(([key,label,count])=>`<button role="tab" aria-selected="${key===current}" ${attribute}="${key}">${label}${count==null?'':`<small>${count}</small>`}</button>`).join('')}</div>`}
const baseNav=renderNav;
renderNav=function(){
  baseNav();
  if(state.role!=='merchant')return;
  const groups={dashboard:'业务办理',receivers:'常用服务',messages:'账户与支持'};
  const active=navActivePage(state.page,state.role);
  const icons={'tracking-list':'tracking','sea-tracking':'tracking'};
  $('#nav').innerHTML=navs.merchant.map(([id,label])=>`${groups[id]?`<div class="nav-group">${groups[id]}</div>`:''}<button class="${active===id?'active':''}" ${active===id?'aria-current="page"':''} data-page="${id}">${icon(icons[id]||id)}<span>${label}</span></button>`).join('');
};
merchantDashboard=function(){
  const orders=typeof overallOrderRoots==='function'?overallOrderRoots(state.dbOrders):state.dbOrders, ps=allParcels();
  const waiting=orders.filter(o=>orderMatchesProgress(o,'pending')).length;
  const pending=orders.filter(o=>orderMatchesProgress(o,'awaiting_payment')).length;
  const transit=orders.filter(o=>orderMatchesProgress(o,'shipped')).length;
  const completed=orders.length&&orders.every(o=>orderProgress(o).group==='delivered');
  const current=currentDbOrder(orders);
  const next=completed?'orders':!ps.length?'pre-advise':!orders.length||ps.some(p=>!p.order)?'parcels':current?.status==='awaiting_payment'?'orders':current?.consolidated?'orders':'parcels';
  return shell('商家首页','从包裹预报到签收，在一个工作台完成。',button('预报包裹','pre-advise',true))+
    `<div class="quick-links">${[['pre-advise','预报包裹','填写国内快递单号','parcels'],['parcels','申请打包','在我的包裹确认合包','parcels'],['orders','确认订单','头程、尾程分别确认付款','orders'],['orders','查询物流','从订单进入物流详情','tracking']].map(([page,label,desc,i])=>`<button class="quick-link" data-page="${page}">${icon(i)}<span><b>${label}</b><small>${desc}</small></span></button>`).join('')}</div>`+
    `<div class="grid kpis">${kpi('我的包裹',ps.length,'按当前账号统计')}${kpi('待仓库确认',waiting,'整体订单数')}${kpi('待付款',pending,'整体订单数')}${kpi('运输中',transit,'整体订单数')}</div>`+
    `<div class="card"><div class="card-title"><h3>下一步办理</h3><span class="tag">预报 / 合包 → 头程付款 → 到印尼仓 → 尾程付款配送</span></div>${notice(completed?'本批订单已完成':'按包裹和订单状态继续办理',completed?'头程与关联尾程已完成，可在我的订单查看签收结果，或预报新的包裹。':!ps.length?'先预报包裹，再将包裹寄至深圳仓。':next==='parcels'?'进入我的包裹，选择包裹申请合包或查看已提交的打包申请。':'进入我的订单，查看头程费用与物流；头程到印尼仓后，进入详情申请尾程配送并单独付款。')}<div class="form-actions">${button(next==='pre-advise'?'开始预报':next==='parcels'?'查看我的包裹':'查看我的订单',next,true)}</div></div>`+
    `<div class="card section-space"><div class="card-title"><h3>最近订单</h3>${button('查看全部','orders')}</div>${orders.length?workspaceOrderTable(orders.slice(0,5)):emptyState('还没有集运订单','预报包裹后，在我的包裹里申请打包。',button('去我的包裹','parcels',true))}</div>`;
};
function parcelPagination(rows){
  const size=[10,20,50].includes(workspace.parcelPageSize)?workspace.parcelPageSize:10;
  const total=rows.length,pages=Math.max(1,Math.ceil(total/size));
  const page=Math.min(pages,Math.max(1,Math.trunc(Number(workspace.parcelPage))||1));
  workspace.parcelPage=page;workspace.parcelPageSize=size;
  const start=(page-1)*size;
  return {rows:rows.slice(start,start+size),total,pages,page,size,from:total?start+1:0,to:Math.min(total,start+size)};
}
function parcelPager(p){
  const visible=new Set([1,p.pages]);
  for(let n=Math.max(1,p.page-2);n<=Math.min(p.pages,p.page+2);n++)visible.add(n);
  let previous=0;
  const numbers=[...visible].sort((a,b)=>a-b).map(n=>{
    const gap=n-previous>1?'<span class="pagination-gap" aria-hidden="true">…</span>':'';
    previous=n;
    return gap+`<button type="button" class="btn small ghost" data-parcel-page="${n}" aria-label="第 ${n} 页" ${n===p.page?'aria-current="page"':''}>${n}</button>`;
  }).join('');
  return `<div class="parcel-pagination"><span class="pagination-summary" role="status">共 ${p.total} 个包裹 · 显示 ${p.from}–${p.to} 条 · 第 ${p.page} / ${p.pages} 页</span><div class="pagination-controls"><label class="pagination-size" for="parcelPageSize">每页 <select id="parcelPageSize">${[10,20,50].map(n=>`<option value="${n}" ${n===p.size?'selected':''}>${n} 条</option>`).join('')}</select></label><nav class="pagination-pages" aria-label="包裹列表分页"><button type="button" class="btn small ghost" data-parcel-page="${p.page-1}" ${p.page===1?'disabled':''}>上一页</button>${numbers}<button type="button" class="btn small ghost" data-parcel-page="${p.page+1}" ${p.page===p.pages?'disabled':''}>下一页</button></nav></div></div>`;
}
merchantParcels=function(){
  const ps=allParcels(),q=workspace.parcelQuery.toLowerCase();
  const filtered=ps.filter(p=>(workspace.parcelTab==='all'||parcelGroup(p)===workspace.parcelTab)&&`${p.tracking_no} ${p.item_name}`.toLowerCase().includes(q));
  const page=parcelPagination(filtered);
  return shell('我的包裹','检查包裹状态，在这里申请合包与查看打包进度。',button('打包记录','packing-history')+button('申请打包','packing-request')+button('+ 预报包裹','pre-advise',true))+
    (ps.some(p=>associatedOrders(p.id).length>1)?notice('历史包裹关联提示','部分旧包裹关联了多笔历史订单。这里优先展示运输进度最靠后的订单；请在我的订单逐单核对，新申请已拦截重复关联。'):'')+
    tabs([['all','全部',ps.length],...Object.entries({pending:'待入库',received:'已入库',packed:'已打包',shipped:'头程运输中',overseas:'已到印尼仓','tail-pending':'尾程处理中','tail-shipped':'尾程派送中',delivered:'已签收',exception:'异常'}).map(([key,label])=>[key,label,ps.filter(p=>parcelGroup(p)===key).length])],workspace.parcelTab,'data-parcel-tab')+
    `<div class="card">${workspaceError('parcels')}<form id="parcelSearch" class="workspace-toolbar"><input id="parcelSearchText" aria-label="搜索包裹" placeholder="搜索国内快递单号 / 品名" value="${esc(workspace.parcelQuery)}"><button class="btn ghost">搜索</button><button type="button" class="btn ghost" data-refresh-workspace>刷新</button></form><div id="parcelResults">${filtered.length?`<div class="table-wrap"><table class="table"><thead><tr><th>国内快递单号</th><th>品名</th><th>包裹状态</th><th>重量 / 尺寸</th><th>关联订单</th><th>操作</th></tr></thead><tbody>${page.rows.map(p=>`<tr><td class="mono">${esc(p.tracking_no)}</td><td>${esc(p.item_name||'—')}</td><td>${status(parcelLabel(p),parcelGroup(p)==='exception'?'red':'blue')}</td><td>${p.actual_weight_kg!=null?'实测：'+formatWeight(p.actual_weight_kg):'预报：'+formatWeight(p.declared_weight_kg)}<br><small class="muted">${p.length_cm!=null?formatSize(p):formatSize({length_cm:p.declared_length_cm,width_cm:p.declared_width_cm,height_cm:p.declared_height_cm})}</small></td><td>${parcelLinkedOrders(p)}</td><td><div class="parcel-row-actions"><button class="btn small ghost" data-workspace-parcel="${p.id}">详情</button>${parcelMaintenanceActions(p)}${parcelTailOrder(p)?orderAction(parcelTailOrder(p),'fee','尾程订单'):p.order?.overseas_received_at&&feeRecord(p.order)?.fee_breakdown_version===3?orderAction(p.order,'fee','申请尾程'):''}${p.order&&canRequestLegacy(p.order)?orderAction(p.order,'consolidate','确认合包'):''}</div></td></tr>`).join('')}</tbody></table></div>`:emptyState('没有匹配的包裹',ps.length?'调整状态筛选或搜索词后再试。':'先预报国内快递单号，包裹寄到深圳仓后会更新入库状态。',button('预报包裹','pre-advise',true))}</div>${parcelPager(page)}</div>`;
};
function merchantPreAdvise(){return shell('预报包裹','填写国内快递信息，让深圳仓更快识别你的包裹。',button('返回我的包裹','parcels'))+`<div class="grid layout-2"><div class="card"><form id="preAdviceForm"><div class="form-grid">${field('国内快递单号','adviceTracking','','text','required minlength="5" maxlength="80"')}${field('快递公司','adviceCarrier','','text','maxlength="80"')}${field('包裹品名','adviceItem','','text','required maxlength="120"')}${measurementFields('advice')}</div><p class="page-note">重量和尺寸选填，请按整件包裹（含包装）填写；长宽高需同时填写，用于合包费用预估，仓库入库后另行实测。</p><div class="form-actions"><button class="btn primary" type="submit">提交预报</button></div></form></div><div class="card"><h3>预报后如何操作？</h3><p class="muted">1. 将货物寄到深圳仓，并在面单上备注会员号。</p><p class="muted">2. 在“我的包裹”查看入库情况、选择包裹申请打包。</p><p class="muted">3. 仓库确认实重和尺寸后，支付头程费用；到印尼仓后申请尾程配送，另行核价付款。</p>${button('查看深圳仓地址','address')}</div></div>`}
function merchantPackingRequest(){
  const eligible=allParcels().filter(p=>!p.order&&!['exception','shipped','consolidated'].includes(p.status));
  const legacy=state.dbOrders.filter(canRequestLegacy);
  return shell('申请打包 / 合包','选择包裹、平台印尼仓及包装方式；消费者地址在申请尾程时填写。',button('返回我的包裹','parcels'))+
    (legacy.length?`<div class="card section-space"><h3>已有订单待确认合包</h3>${legacy.map(o=>`<div class="metric"><span>${esc(o.order_no)}</span>${orderAction(o,'consolidate','确认合包')}</div>`).join('')}</div>`:'')+
    (!eligible.length?`<div class="card section-space">${emptyState('没有可申请的包裹','已关联订单的包裹不会重复参与打包申请。你可以先预报新包裹，或查看打包记录。',button('预报包裹','pre-advise',true)+button('打包记录','packing-history'))}</div>`:
    `<form id="packingRequestForm"><div class="grid layout-2 section-space"><div class="card"><div class="card-title"><h3>选择包裹</h3><span class="tag">${eligible.length} 个可选</span></div><div class="check-list">${eligible.map(p=>`<label class="check"><input type="checkbox" name="packingParcel" value="${p.id}" ${workspace.selected.has(p.id)?'checked':''}><span><b>${esc(p.tracking_no)}</b> · ${esc(p.item_name)}<br><small class="muted">${parcelLabel(p)} · ${parcelEstimateMeasurement(p)?parcelEstimateMeasurement(p).source+' '+formatWeight(parcelEstimateMeasurement(p).values[0]):'重量或尺寸待补充'}</small></span></label>`).join('')}</div><p class="page-note">待入库包裹可提前提交申请，仓库收到全部包裹后确认费用。</p></div><div class="card">${overseasPackingDestination()}<div class="field"><label for="packingRoute">运输线路</label><select id="packingRoute" required>${workspace.routes.filter(r=>r.is_active&&r.route_code.startsWith('ID-')).map(r=>`<option value="${esc(r.route_code)}" ${workspace.packingDraft?.route===r.route_code?'selected':''}>${esc(r.route_name)}</option>`).join('')}</select></div><div class="field section-space"><label for="packingMethod">包装方式</label><select id="packingMethod">${['合并为一个外箱','按品类分箱','保持原包裹分别出货'].map(v=>`<option ${workspace.packingDraft?.method===v?'selected':''}>${v}</option>`).join('')}</select></div><div id="packingEstimate" class="packing-estimate section-space" aria-live="polite">${packingEstimateHtml(estimatePacking(selectedPackingParcels(),workspace.routes.find(r=>r.route_code===workspace.packingDraft?.route)||workspace.routes.find(r=>r.is_active&&r.route_code.startsWith('ID-'))))}</div><div class="field section-space"><label for="packingNote">给仓库的备注</label><textarea id="packingNote" maxlength="2000" rows="3" placeholder="例如易碎品加固、保留原包装">${esc(workspace.packingDraft?.note||'')}</textarea></div><div class="form-actions"><button class="btn primary" type="submit" ${!workspace.overseasWarehouses?.some(w=>w.is_active)||!workspace.routes.length?'disabled':''}>提交打包申请</button></div></div></div></form>`);
}
merchantConsolidate=function(){
  const o=state.order.record;
  if(!o)return shell('确认合包','从我的包裹选择订单继续。',button('我的包裹','parcels'));
  const editable=canRequestLegacy(o);
  return shell('确认合包',`订单 ${o.order_no}`,button('返回我的包裹','parcels'))+`<div class="grid layout-2"><div class="card"><h3>本次订单包裹</h3><div class="check-list">${safeRows(o.order_parcels).map(r=>r.parcels).filter(Boolean).map(p=>`<div class="check"><span><b>${esc(p.tracking_no)}</b><br>${esc(p.item_name)}</span></div>`).join('')}</div><p class="page-note">订单内全部包裹按本次方案处理；已关联的包裹不会再次申请。</p></div><div class="card"><div class="packing-estimate">${packingEstimateHtml(estimatePacking(safeRows(o.order_parcels).map(r=>r.parcels).filter(Boolean),workspace.routes.find(r=>r.route_code===o.route_code)))}</div><form id="legacyConsolidationForm"><div class="field"><label for="legacyMethod">包装方式</label><select id="legacyMethod" ${editable?'':'disabled'}>${['合并为一个外箱','按品类分箱','保持原包裹分别出货'].map(x=>`<option ${o.consolidation_method===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field section-space"><label for="legacyNote">仓库备注</label><textarea id="legacyNote" rows="4" maxlength="2000" ${editable?'':'readonly'}>${esc(o.consolidation_note||'')}</textarea></div><div class="form-actions">${editable?'<button class="btn primary" type="submit">确认方案并查看订单</button>':orderAction(o,'fee','查看订单与费用')}</div></form>${!editable?notice(o.consolidated?'包装方案已确认':'仓库已确认费用',o.consolidated?'包装要求已保存，可在打包记录中查看。':'本单已进入费用确认后的流程，请查看订单。'):''}</div></div>`;
};
function merchantPackingHistory(){
  const orders=state.dbOrders.filter(o=>o.consolidated);
  return shell('打包申请记录','合包方式、仓库进度和对应订单保持关联。',button('返回我的包裹','parcels')+button('申请打包','packing-request',true))+
  `<div class="card">${orders.length?`<div class="workspace-list">${orders.map(o=>`<div class="order-card"><div class="order-row"><b>${esc(o.order_no)}</b>${orderProgressHtml(o)}</div><div class="subrow"><span>${esc(o.consolidation_method||'未记录包装方式')}</span><span>${o.parcel_count} 个包裹</span><span>${dateText(o.consolidation_at)}</span></div><p>${esc(o.consolidation_note||'无特殊备注')}</p><div class="form-actions">${orderAction(o,'fee','查看订单')}${orderAction(o,'tracking','查看物流')}</div></div>`).join('')}</div>`:emptyState('还没有打包记录','在我的包裹中申请打包，或确认已有订单的合包方案。',button('去我的包裹','parcels',true))}</div>`;
}
merchantParcelDetail=function(){
  const p=allParcels().find(p=>p.id===workspace.detailParcelId);
  if(!p)return shell('包裹详情','请从包裹列表选择一件包裹。',button('返回我的包裹','parcels'));
  return shell('包裹详情',p.tracking_no,button('返回我的包裹','parcels')+parcelMaintenanceActions(p))+`<div class="grid layout-2"><div class="card"><h3>${esc(p.item_name)}</h3>${status(parcelLabel(p))}<div class="metric"><span>快递公司</span><b>${esc(p.carrier||'未填写')}</b></div><div class="metric"><span>预报重量</span><b>${formatWeight(p.declared_weight_kg)}</b></div><div class="metric"><span>预报外包装尺寸</span><b>${formatSize({length_cm:p.declared_length_cm,width_cm:p.declared_width_cm,height_cm:p.declared_height_cm})}</b></div><div class="metric"><span>仓库实际重量</span><b>${formatWeight(p.actual_weight_kg)}</b></div><div class="metric"><span>仓库实测尺寸</span><b>${formatSize(p)}</b></div><div class="metric"><span>预报时间</span><b>${dateText(p.created_at)}</b></div><div class="metric"><span>收货时间</span><b>${dateText(p.received_at)}</b></div>${p.exception_reason?notice('包裹异常',p.exception_reason):''}${p.order?`<div class="form-actions">${orderAction(p.order,'fee','关联订单')}${orderAction(p.order,'tracking','头程物流')}${parcelTailOrder(p)?orderAction(parcelTailOrder(p),'tracking','尾程物流')+orderAction(parcelTailOrder(p),'fee','尾程订单'):''}</div>`:button('申请打包','packing-request',true)}</div><div class="card"><h3>入库 / 打包照片</h3>${emptyState('暂无照片','当前仓库尚未上传照片；此处不展示示例照片。')}</div></div>`;
};
function workspaceOrderTable(orders){return `<div class="table-wrap"><table class="table"><thead><tr><th>订单号 / 创建时间</th><th>线路 / 目的地</th><th>包裹</th><th>确认金额</th><th>状态</th><th>操作</th></tr></thead><tbody>${orders.map(o=>`<tr><td class="mono">${esc(o.order_no)}<br><small class="muted">${dateText(o.created_at)}</small></td><td>${esc(o.route_name)}<br><small class="muted">${esc(o.destination_country)} · ${esc(o.destination_city||'')}</small></td><td>${o.parcel_count}</td><td class="list-amount">${money(feeRecord(o)?.total_amount)}</td><td>${orderProgressHtml(o)}</td><td>${orderAction(o,'fee',o.status==='awaiting_payment'?'查看并付款':(o.transport_leg==='last_mile'?'尾程详情':'头程详情'))}${orderAction(o,'tracking',o.transport_leg==='last_mile'?'尾程物流':'头程物流')}</td></tr>`).join('')}</tbody></table></div>`}
merchantOrders=function(){
  const filtered=state.dbOrders.filter(o=>orderMatchesProgress(o,workspace.orderTab)&&`${o.order_no} ${o.recipient_name} ${o.shipment_tracking_no||''}`.toLowerCase().includes(workspace.orderQuery.toLowerCase()));
  return shell('我的订单','核对仓库确认费用、付款记录与出货进度。',button('去我的包裹申请打包','parcels',true))+
    tabs([['all','全部订单'],['pending','待仓库确认'],['awaiting_payment','待付款'],['paid','待打包'],['ready_to_ship','待出货'],['overseas','已到印尼仓'],['shipped','运输中'],['delivered','已签收']],workspace.orderTab,'data-order-tab')+
    `<div class="card"><form class="workspace-toolbar" id="orderSearch"><input id="orderSearchText" aria-label="搜索订单" placeholder="搜索订单号 / 收件人 / 国际运单号" value="${esc(workspace.orderQuery)}"><button class="btn ghost">搜索</button><button class="btn ghost" type="button" data-refresh-workspace>刷新</button></form>${filtered.length?workspaceOrderTable(filtered):emptyState('没有匹配的订单','创建订单后，这里会显示真实状态、费用和付款入口。',button('我的包裹','parcels',true))}</div>`;
};
merchantCreate=merchantPreAdvise;
merchantFee=function(){
  const o=state.order.record;
  if(!o)return shell('订单详情','请选择一笔订单。',button('我的订单','orders'));
  const f=feeRecord(o),p=paymentRecord(o),confirmed=f?.total_amount!=null,paid=p?.status==='paid',receipt=typeof orderReceipt==='function'?orderReceipt(o.id):null;
  let html=shell('订单详情与费用','仓库确认费用后一次付款。',button('返回我的订单','orders'))+
    notice(paid?'付款记录已保存':receipt?.status==='pending'?'付款凭证待审核':receipt?.status==='rejected'?'请补充凭证':confirmed?'仓库已确认费用':'等待仓库确认',paid?'本单费用已锁定。付款来源与审核结果见下方记录。':receipt?.status==='pending'?'请等待运营审核，勿重复转账。':receipt?.status==='rejected'?'请根据审核说明补充凭证，勿重复转账。':confirmed?'请核对唯一应付金额后付款。':'尚未生成应付金额；此时无需付款。')+
    `<div class="grid layout-2"><div class="card"><div class="card-title"><h3>${esc(o.order_no)}</h3>${orderProgressHtml(o)}</div>${[['运输费用',money(f?.shipping_fee)],['仓库操作费',money(f?.handling_fee)],['计费重量',formatWeight(f?.billable_weight_kg)],['体积重',formatWeight(f?.volume_weight_kg)],['唯一应付金额',money(f?.total_amount)]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="card"><h3>仓库确认进度 ${state.order.confirmed}/${o.parcel_count}</h3>${safeRows(o.order_parcels).map(r=>r.parcels).filter(Boolean).map(p=>`<div class="metric"><span>${esc(p.tracking_no)}<br><small>${esc(p.item_name||'')} · ${formatWeight(p.actual_weight_kg)} · ${formatSize(p)}</small></span>${status(p.actual_weight_kg!=null&&p.length_cm!=null&&p.width_cm!=null&&p.height_cm!=null?'已确认':'待确认')}</div>`).join('')}</div></div>`+
    (paid?`<div class="card section-space"><h3>付款记录</h3><div class="metric"><span>已登记金额</span><b>${money(p.amount)}</b></div><div class="metric"><span>记录时间</span><b>${dateText(p.paid_at||o.paid_at||p.created_at)}</b></div></div>`:'');
  if(f?.estimate_snapshot)html+=`<div class="card section-space packing-estimate">${packingEstimateHtml(f.estimate_snapshot,true)}</div>`;
  html+=`<div class="card section-space"><div class="card-title"><h3>订单收发信息</h3>${orderAction(o,'tracking','物流详情')}</div><div class="metric"><span>目的地国家</span><b>${esc(o.destination_country)}</b></div><div class="metric"><span>详细收货地址</span><b>${esc(o.destination_address)}</b></div><div class="metric"><span>收件人 / 电话</span><b>${esc(o.recipient_name)} · ${esc(o.recipient_phone)}</b></div><div class="metric"><span>国内深圳仓</span><b>${esc(o.origin_warehouse_address)}</b></div><div class="metric"><span>包装方式</span><b>${esc(o.consolidation_method||'尚未确认')}</b></div><p>${esc(o.consolidation_note||'')}</p></div>`;
  return html;
};
function merchantTrackingList(){
  const sea=state.page==='sea-tracking';
  const q=workspace.trackingQuery.toLowerCase();
  const rows=state.dbOrders.filter(o=>(!sea||/SEA/i.test(o.route_code)||/海运/.test(o.route_name))&&`${o.order_no} ${o.shipment_tracking_no||''} ${o.recipient_name}`.toLowerCase().includes(q));
  return shell(sea?'海运追踪':'物流追踪',sea?'查看海运订单的仓库和运输节点。':'按订单号或国际运单号查询物流。',button('我的订单','orders'))+
    notice('物流节点来源','当前展示仓库登记和系统操作产生的节点；承运商自动轨迹、船名航次与实时船位尚未接入。')+
    `<div class="card"><form id="trackingSearch" class="workspace-toolbar"><input id="trackingSearchText" aria-label="搜索物流" value="${esc(workspace.trackingQuery)}" placeholder="输入订单号 / 国际运单号 / 收件人"><button class="btn primary">查询</button></form>${rows.length?`<div class="workspace-list">${rows.map(o=>`<div class="order-card"><div class="order-row"><b>${esc(o.order_no)}</b>${orderProgressHtml(o)}</div><div class="subrow"><span>${esc(o.route_name)}</span><span>${esc(o.shipment_carrier||'承运商待登记')}</span><span>${esc(o.shipment_tracking_no||'出货后显示运单号')}</span></div><div class="form-actions">${orderAction(o,'tracking','查看物流节点')}</div></div>`).join('')}</div>`:emptyState(sea?'暂无海运订单':'没有匹配的物流记录',sea?'选择印尼海运专线创建订单后，可在此查看出货物流。':'请确认订单或运单号，也可以在我的订单查看状态。')}</div>`;
}
merchantTracking=function(){
  const o=state.order.record;
  if(!o)return shell('物流详情','请选择需要查看的订单。',button('物流追踪','tracking-list'));
  return shell('物流详情',o.order_no,orderAction(o,'fee','返回订单详情')+button('物流查询','tracking-list'))+
    `<div class="tracking-layout"><div class="card"><div class="card-title"><h3>订单节点</h3>${orderProgressHtml(o)}</div>${state.events.length?`<div class="timeline">${state.events.map(e=>`<div class="event"><div></div><div><h4>${esc(e.title)}</h4><p>${esc(e.desc)} · ${esc(e.time)}</p></div></div>`).join('')}</div>`:emptyState('暂无节点','仓库操作后，相关物流节点会在这里显示。')}</div><div class="card"><h3>运单与收件信息</h3>${[['承运商',o.shipment_carrier],['国际运单号',o.shipment_tracking_no],['线路',o.route_name],['目的地国家',o.destination_country],['具体收货地址',o.destination_address],['收件人',o.recipient_name],['深圳送仓地址',o.origin_warehouse_address]].map(([k,v])=>`<div class="metric"><span>${k}</span><b>${esc(v||'待登记')}</b></div>`).join('')}<p class="page-note">节点来自真实作业记录；出货登记不等于已离港，离港和签收以实际记录为准。</p></div></div>`;
};
function merchantRates(){
  const r=workspace.quote;
  return shell('运价查询','输入重量和尺寸，按平台当前运价试算。',button('我的包裹','parcels'))+workspaceError('routes')+
    `<div class="grid layout-2"><div class="card"><form id="rateForm"><div class="form-grid"><div class="field full"><label for="rateRoute">深圳仓 → 印度尼西亚</label><select id="rateRoute" required>${workspace.routes.filter(r=>r.is_active).map(r=>`<option value="${esc(r.route_code)}" ${workspace.quote?.routeCode===r.route_code?'selected':''}>${esc(r.route_name)}</option>`).join('')}</select></div>${field('实际重量（kg）','rateWeight',r?.weight||'','number','required min="0.001" max="100000" step="0.001"')}${field('长（cm）','rateLength',r?.length||'','number','required min="0.01" max="100000" step="0.01"')}${field('宽（cm）','rateWidth',r?.width||'','number','required min="0.01" max="100000" step="0.01"')}${field('高（cm）','rateHeight',r?.height||'','number','required min="0.01" max="100000" step="0.01"')}</div><div class="form-actions"><button class="btn primary" ${!workspace.routes.length?'disabled':''}>计算参考运费</button></div></form><p class="page-note">同一外箱的实重与体积重取大值。多箱订单以仓库逐箱实测结果为准。</p></div><div class="card"><h3>参考费用明细</h3>${r?`<div class="metric"><span>体积重</span><b>${r.volume.toFixed(3)} kg</b></div><div class="metric"><span>计费重量</span><b>${r.billable.toFixed(3)} kg</b></div><div class="metric"><span>运输费</span><b>${money(r.shipping)}</b></div><div class="metric"><span>仓库操作费</span><b>${money(r.handling)}</b></div><div class="metric"><span>参考合计</span><b>${money(r.total)}</b></div><p class="page-note">${esc(r.routeName)} · 运价更新时间 ${dateText(r.updatedAt)}</p>`:emptyState('等待试算','选择线路并填写重量和尺寸。')}${notice('此处不收款','参考价格不锁价，仓库确认实重、尺寸后生成唯一应付金额。')}</div></div>`;
}
merchantAddress=function(){
  return shell('仓库地址','商家先寄到国内深圳仓，再由仓库安排出境。')+workspaceError('warehouses')+
    `<div class="workspace-list">${workspace.warehouses.filter(w=>w.is_active).map(w=>`<div class="card"><div class="card-title"><h3>${esc(w.name)}</h3><span class="tag">${esc(w.code)}</span></div><p class="address-copy">${esc(w.address)}</p><div class="metric"><span>收件人</span><b>${esc(w.contact_name||'未配置')}</b></div><div class="metric"><span>电话</span><b>${esc(w.contact_phone||'未配置')}</b></div><div class="metric"><span>面单备注会员号</span><b class="mono">${esc(state.auth.profile?.member_no||'')}</b></div><div class="form-actions"><button class="btn primary" data-copy-warehouse="${w.id}">复制送仓信息</button></div><p class="page-note">此地址来自平台配置。试运营前请与运营人员确认仓库地址和电话可用。</p></div>`).join('')||emptyState('暂未配置仓库','请联系平台运营人员。')}</div>`;
};
function merchantReceivers(){
  const a=state.addresses.find(x=>x.id===workspace.editingAddress)||{};
  return shell('收货地址','维护尾程消费者收件地址；申请尾程配送时选用，头程直接送至平台印尼仓。',button(workspace.addressReturn?'返回申请打包':'去我的包裹办理',workspace.addressReturn||'parcels'))+
    `<div class="grid layout-2"><div class="workspace-list">${state.addresses.map(a=>`<div class="card"><div class="card-title"><h3>${esc(a.label)}</h3>${a.is_default?status('默认','green'):''}</div><b>${esc(a.recipient_name)} · ${esc(a.recipient_phone)}</b><p class="address-copy">${esc(a.country)} · ${esc(a.city||'')}<br>${esc(a.address_line)} ${esc(a.postal_code||'')}</p><button class="btn small ghost" data-edit-address="${a.id}">编辑地址</button></div>`).join('')||`<div class="card">${emptyState('尚未保存收货地址','在右侧填写收件人、电话和具体地址。')}</div>`}</div><div class="card"><h3>${a.id?'编辑地址':'新增地址'}</h3><form id="receiverForm"><div class="form-grid">${field('地址标签','receiverLabel',a.label||'')}${field('收件人','receiverName',a.recipient_name||'','text','required')}${field('联系电话','receiverPhone',a.recipient_phone||'','tel','required')}${field('国家','receiverCountry','印度尼西亚','text','readonly')}${field('城市','receiverCity',a.city||'','text','required')}${field('邮编','receiverPostal',a.postal_code||'')}<div class="field full"><label for="receiverLine">详细地址</label><textarea id="receiverLine" rows="3" required>${esc(a.address_line||'')}</textarea></div></div><div class="form-actions">${a.id?'<button class="btn ghost" type="button" id="cancelAddressEdit">取消编辑</button>':''}<button class="btn primary" type="submit">保存地址</button></div></form></div></div>`;
}
function workspaceMessages(){
  const list=[];
  for(const o of state.dbOrders){
    const kind=o.status==='awaiting_payment'?'请核对费用并付款':o.status==='shipped'?'订单已出货':o.status==='delivered'?'订单已签收':'订单进度更新';
    list.push({id:o.id+':'+o.status,title:kind,text:`${o.order_no} · ${orderStatusLabel(o.status)}`,at:o.updated_at,page:'fee',order:o});
  }
  for(const t of workspace.tickets.filter(t=>t.reply))list.push({id:t.id+':'+t.updated_at,title:'客服已回复',text:t.subject,at:t.updated_at,page:'support'});
  return list.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
function merchantMessages(){
  const rows=workspaceMessages();
  return shell('消息中心','订单进度和客服回复汇总；已读状态保存在当前浏览器。',`<button class="btn ghost" id="readAllMessages">全部标为已读</button>`)+
    `<div class="workspace-list">${rows.map(m=>`<div class="card ${workspace.read.includes(m.id)?'':'message-unread'}"><div class="order-row"><h3>${esc(m.title)}</h3>${status(workspace.read.includes(m.id)?'已读':'未读',workspace.read.includes(m.id)?'gray':'blue')}</div><p>${esc(m.text)}</p><div class="order-row"><span class="muted">${dateText(m.at)}</span><button class="btn ghost" data-message-id="${esc(m.id)}" data-message-order="${m.order?.id||''}" data-message-page="${m.page}">查看详情</button></div></div>`).join('')||`<div class="card">${emptyState('暂无消息','订单状态变化、客服回复后会在这里显示。')}</div>`}</div>`;
}
function merchantBilling(){
  const orders=state.dbOrders;
  const paid=orders.filter(o=>paymentRecord(o)?.status==='paid');
  const total=paid.reduce((s,o)=>s+Number(paymentRecord(o).amount),0);
  const due=orders.filter(o=>o.status==='awaiting_payment').reduce((s,o)=>s+Number(feeRecord(o)?.total_amount||0),0);
  return shell('费用账单','按订单核对已付款、待付款及费用明细。',`<button class="btn ghost" id="exportBills">导出账单 CSV</button>`)+notice('当前采用订单一次付款','钱包充值和余额支付暂未开放；不需要预存资金。付款须经运营审核；测试付款及旧版演示记录不代表真实资金到账，请在订单详情核对付款来源。')+
    `<div class="grid kpis">${kpi('累计已登记付款',money(total),'当前账号全部订单')}${kpi('待付款',money(due),'只统计已确认费用')}${kpi('已付款订单',paid.length,'一次付款后锁定')}${kpi('钱包充值','未开放','无需预存')}</div><div class="card">${orders.length?workspaceOrderTable(orders):emptyState('暂无账单','订单产生确认费用后会在这里汇总。')}</div>`;
}
function merchantProfile(){
  const p=state.auth.profile||{};
  return shell('我的账户','管理登录资料、联系电话和优惠信息。',button('查看推广优惠','offers'))+`<div class="grid layout-2"><div class="card"><h3>账户信息</h3><div class="account-facts"><div><small>会员号</small><b class="mono">${esc(p.member_no||'—')}</b></div><div><small>登录邮箱</small><b>${esc(state.auth.user?.email||'—')}</b></div><div><small>账号类型</small><b>跨境商家</b></div><div><small>账户状态</small><b>${p.is_active?'正常':'停用'}</b></div></div></div><div class="card"><form id="profileForm"><div class="form-grid">${field('展示名称','profileName',p.display_name||'','text','required maxlength="80"')}${field('联系电话','profilePhone',p.phone||'','tel','maxlength="40"')}</div><div class="form-actions"><button class="btn primary">保存资料</button></div></form></div></div>`;
}
function ticketCards(admin=false){return workspace.tickets.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(t=>`<div class="card"><div class="order-row"><b>${esc(t.subject)}</b>${status({open:'待回复',replied:'已回复',closed:'已关闭'}[t.status],t.status==='open'?'amber':'green')}</div><div class="subrow"><span>工单 ${esc(t.id.slice(0,8))}</span><span>${dateText(t.created_at)}</span></div><div class="ticket-message">${esc(t.message)}</div>${t.reply?`<p><b>平台回复：</b>${esc(t.reply)}</p>`:''}${admin?`<form data-ticket-reply="${t.id}"><div class="field"><label for="reply-${t.id}">回复内容</label><textarea id="reply-${t.id}" required minlength="2" maxlength="4000" rows="3">${esc(t.reply||'')}</textarea></div><div class="form-actions"><button class="btn primary">保存回复</button></div></form>`:''}</div>`).join('')}
function merchantSupport(){return shell('客服工单','提交订单问题，运营人员在后台回复；当前不提供实时在线聊天。')+workspaceError('tickets')+`<div class="grid layout-2"><div class="workspace-list">${ticketCards()||`<div class="card">${emptyState('暂无工单','遇到入库、费用或物流问题时，可在右侧提交工单。')}</div>`}</div><div class="card"><h3>提交问题</h3><form id="supportForm"><div class="field"><label for="ticketOrder">关联订单（可选）</label><select id="ticketOrder"><option value="">一般咨询</option>${state.dbOrders.map(o=>`<option value="${o.id}" ${workspace.supportOrderId===o.id?'selected':''}>${esc(o.order_no)}</option>`).join('')}</select></div><div class="field section-space"><label for="ticketSubject">问题标题</label><input id="ticketSubject" required minlength="2" maxlength="120"></div><div class="field section-space"><label for="ticketMessage">问题描述</label><textarea id="ticketMessage" required minlength="5" maxlength="4000" rows="5" placeholder="请描述具体问题，勿填写密码或支付凭据"></textarea></div><div class="form-actions"><button class="btn primary" ${workspace.errors.tickets?'disabled':''}>提交工单</button></div></form></div></div>`}
function merchantSupportAdmin(){return shell('客服工单','查看商家问题并回复，商家端可查看回复结果。',`<button class="btn ghost" data-refresh-workspace>刷新</button>`)+workspaceError('tickets')+`<div class="workspace-list">${ticketCards(true)||`<div class="card">${emptyState('暂无工单','商家提交问题后会出现在这里。')}</div>`}</div>`}
function merchantOffers(){return shell('推广优惠','查看平台实际发布的活动与优惠。')+`<div class="card">${emptyState('暂无可用优惠','平台尚未配置优惠券或推广返佣活动；订单按已确认费用结算。',button('查看当前运价','rates',true))}</div>`}
const MerchantViews={'parcel-edit':merchantParcelEdit,'pre-advise':merchantPreAdvise,'packing-request':merchantPackingRequest,'packing-history':merchantPackingHistory,receivers:merchantReceivers,'tracking-list':merchantTrackingList,'sea-tracking':merchantTrackingList,rates:merchantRates,messages:merchantMessages,support:merchantSupport,offers:merchantOffers,billing:merchantBilling,profile:merchantProfile};
function exportWorkspaceBills(){
  const rows=[['订单号','运输段','关联头程订单号','线路','目的地','状态','头程运输费CNY（历史单为原运费）','国内仓操作费CNY','尾程配送费CNY','尾程报价说明','确认金额CNY','已登记付款CNY','付款时间'],...state.dbOrders.map(o=>[o.order_no,o.transport_leg==='last_mile'?'尾程':'头程',state.dbOrders.find(p=>p.id===o.parent_order_id)?.order_no||'',o.route_name,o.destination_country,orderStatusLabel(o.status),feeRecord(o)?.shipping_fee??'',feeRecord(o)?.handling_fee??'',feeRecord(o)?.last_mile_fee??'',feeRecord(o)?.last_mile_note??'未报价或历史未拆分',feeRecord(o)?.total_amount??'',paymentRecord(o)?.status==='paid'?paymentRecord(o).amount:0,o.paid_at||''])];
  const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download='集运订单账单.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function rpcWorkspace(name,args){const {data,error}=await window.MospaceSupabase.getClient().rpc(name,args);if(error)throw error;return data}
async function saveWorkspaceTable(table,payload,id){
  const c=window.MospaceSupabase.getClient();const request=id?c.from(table).update(payload).eq('id',id):c.from(table).insert(payload);
  const {data,error}=await request.select().single();if(error)throw error;return data;
}
async function busyForm(form,action){
  const submit=form.querySelector('[type=submit],button:not([type])');if(submit)submit.disabled=true;
  try{await action()}catch(e){toast('操作失败：'+e.message,6000)}finally{if(submit?.isConnected)submit.disabled=false}
}
const baseBind=bind;
bind=function(){
  baseBind();
  document.querySelectorAll('[data-ticket-context]').forEach(el=>el.addEventListener('click',()=>{workspace.supportOrderId=el.dataset.ticketContext},{capture:true}));
  document.querySelectorAll('[data-return-packing]').forEach(el=>el.addEventListener('click',()=>{workspace.addressReturn='packing-request'},{capture:true}));
  document.querySelectorAll('#nav [data-page=receivers]').forEach(el=>el.addEventListener('click',()=>{workspace.addressReturn=null},{capture:true}));
  const on=(id,event,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener(event,fn)};
  document.querySelectorAll('[data-refresh-workspace]').forEach(el=>el.onclick=()=>refreshDbState());
  document.querySelectorAll('[data-parcel-tab]').forEach(el=>el.onclick=()=>{workspace.parcelTab=el.dataset.parcelTab;workspace.parcelPage=1;render()});
  document.querySelectorAll('[data-parcel-page]').forEach(el=>el.onclick=()=>{
    if(el.disabled)return;
    workspace.parcelPage=Number(el.dataset.parcelPage);render();
    document.querySelector('.pagination-pages [aria-current="page"]')?.focus();
  });
  on('parcelPageSize','change',e=>{workspace.parcelPageSize=Number(e.target.value);workspace.parcelPage=1;render();document.getElementById('parcelPageSize')?.focus()});
  document.querySelectorAll('[data-order-tab]').forEach(el=>el.onclick=()=>{workspace.orderTab=el.dataset.orderTab;render()});
  for(const [form,input,key] of [['parcelSearch','parcelSearchText','parcelQuery'],['orderSearch','orderSearchText','orderQuery'],['trackingSearch','trackingSearchText','trackingQuery']])on(form,'submit',e=>{e.preventDefault();workspace[key]=$('#'+input).value.trim();if(key==='parcelQuery')workspace.parcelPage=1;render()});
  document.querySelectorAll('[data-order-target]').forEach(el=>el.onclick=()=>selectWorkspaceOrder(el.dataset.orderTarget,el.dataset.orderPage));
  document.querySelectorAll('[data-workspace-parcel]').forEach(el=>el.onclick=()=>{workspace.detailParcelId=el.dataset.workspaceParcel;go('parcel-detail')});
  document.querySelectorAll('[data-edit-parcel]').forEach(el=>el.onclick=()=>{workspace.editParcelId=el.dataset.editParcel;go('parcel-edit')});
  document.querySelectorAll('[data-delete-parcel]').forEach(el=>el.onclick=async()=>{
    if(workspace.parcelBusy)return;
    const p=workspace.parcels.find(p=>p.id===el.dataset.deleteParcel);
    if(!canMaintainParcel(p)){toast('此包裹当前不能删除，请刷新后核对');return}
    if(!window.confirm(parcelDeleteConfirmation(p)))return;
    try{await maintainParcel(p.id,'delete')}catch(e){toast('删除失败：'+e.message,6000)}
  });
  on('parcelEditForm','submit',e=>{e.preventDefault();busyForm(e.target,()=>maintainParcel(workspace.editParcelId,'edit',{
    p_tracking:$('#editParcelTracking').value.trim(),p_item_name:$('#editParcelItem').value.trim(),p_carrier:$('#editParcelCarrier').value.trim(),p_measurements:readDeclaredMeasurements('editParcel')
  }))});
  document.querySelectorAll('[name=packingParcel]').forEach(el=>el.onchange=()=>{if(el.checked)workspace.selected.add(el.value);else workspace.selected.delete(el.value);updatePackingEstimate()});
  on('preAdviceForm','submit',e=>{e.preventDefault();busyForm(e.target,async()=>{
    await rpcWorkspace('merchant_pre_advise_with_measurements',{p_tracking:$('#adviceTracking').value.trim(),p_item_name:$('#adviceItem').value.trim(),p_carrier:$('#adviceCarrier').value.trim(),p_measurements:readDeclaredMeasurements('advice')});
    workspace.parcelTab='all';workspace.parcelQuery='';workspace.parcelPage=1;toast('包裹预报已保存');await refreshDbState('parcels');
  })});
  function rememberPacking(){workspace.packingDraft={address:$('#packingAddress').value,route:$('#packingRoute').value,method:$('#packingMethod').value,note:$('#packingNote').value};updatePackingEstimate()}
  on('packingRequestForm','input',rememberPacking);on('packingRequestForm','change',rememberPacking);
  on('packingRequestForm','submit',e=>{e.preventDefault();busyForm(e.target,async()=>{
    const ids=[...document.querySelectorAll('[name=packingParcel]:checked')].map(x=>x.value);if(!ids.length)throw new Error('请选择至少一个包裹');
    const o=await rpcWorkspace('merchant_create_head_order',{p_parcel_ids:ids,p_overseas_warehouse_id:$('#packingAddress').value,p_route_code:$('#packingRoute').value,p_method:$('#packingMethod').value,p_note:$('#packingNote').value.trim()});
    state.activeOrderId=o.id;workspace.selected.clear();workspace.packingDraft={};workspace.addressReturn=null;toast('打包申请已保存，等待仓库确认');await refreshDbState('orders');
  })});
  on('legacyConsolidationForm','submit',e=>{e.preventDefault();busyForm(e.target,async()=>{
    await rpcWorkspace('merchant_submit_consolidation',{p_order_id:state.activeOrderId,p_method:$('#legacyMethod').value,p_note:$('#legacyNote').value.trim()});toast('合包方案已保存');await refreshDbState('fee');
  })});
  on('rateForm','submit',e=>{e.preventDefault();const p=workspace.routes.find(p=>p.route_code===$('#rateRoute').value);if(!p)return;
    const [weight,length,width,height]=['rateWeight','rateLength','rateWidth','rateHeight'].map(id=>Number($('#'+id).value));
    if(![weight,length,width,height].every(n=>Number.isFinite(n)&&n>0)){toast('请输入大于 0 的重量和尺寸');return}
    const volume=Math.round(length*width*height/Number(p.volume_divisor)*1000)/1000,billable=Math.max(weight,volume),shipping=Number(p.first_price)+Math.max(0,billable-Number(p.first_weight_kg))*Number(p.additional_price_per_kg),handling=Number(p.handling_fee);
    workspace.quote={routeCode:p.route_code,weight,length,width,height,volume,billable,shipping:Math.round(shipping*100)/100,handling,total:Math.round(shipping*100)/100+handling,routeName:p.route_name,updatedAt:p.updated_at};render();
  });
  document.querySelectorAll('[data-edit-address]').forEach(el=>el.onclick=()=>{workspace.editingAddress=el.dataset.editAddress;render()});
  on('cancelAddressEdit','click',()=>{workspace.editingAddress=null;render()});
  on('receiverForm','submit',e=>{e.preventDefault();busyForm(e.target,async()=>{
    const payload={label:$('#receiverLabel').value.trim()||'收货地址',recipient_name:$('#receiverName').value.trim(),recipient_phone:$('#receiverPhone').value.trim(),country:'印度尼西亚',city:$('#receiverCity').value.trim(),postal_code:$('#receiverPostal').value.trim(),address_line:$('#receiverLine').value.trim()};
    if(!payload.recipient_name||!payload.recipient_phone||!payload.city||!payload.address_line)throw new Error('请填写完整收货信息');
    if(workspace.editingAddress)payload.id=workspace.editingAddress;else payload.is_default=state.addresses.length===0;
    await window.MospaceSupabase.saveAddress(payload);state.addresses=await window.MospaceSupabase.listAddresses();workspace.editingAddress=null;toast('收货地址已保存');render();
  })});
  document.querySelectorAll('[data-copy-warehouse]').forEach(el=>el.onclick=async()=>{
    const w=workspace.warehouses.find(w=>w.id===el.dataset.copyWarehouse);if(!w)return;
    try{await navigator.clipboard.writeText(`${w.address}\n收件人：${w.contact_name||''}\n电话：${w.contact_phone||''}\n会员号：${state.auth.profile.member_no}`);toast('送仓信息已复制')}catch(e){toast('无法访问剪贴板，请手动复制页面地址')}
  });
  on('profileForm','submit',e=>{e.preventDefault();busyForm(e.target,async()=>{
    state.auth.profile=await saveWorkspaceTable('profiles',{display_name:$('#profileName').value.trim(),phone:$('#profilePhone').value.trim()},state.auth.user.id);toast('资料已保存');render();
  })});
  on('supportForm','submit',e=>{e.preventDefault();busyForm(e.target,async()=>{
    await saveWorkspaceTable('support_tickets',{merchant_id:state.auth.user.id,order_id:$('#ticketOrder').value||null,subject:$('#ticketSubject').value.trim(),message:$('#ticketMessage').value.trim()});
    toast('工单已提交');await loadMerchantWorkspace();render();
  })});
  document.querySelectorAll('[data-ticket-reply]').forEach(form=>form.onsubmit=e=>{e.preventDefault();busyForm(form,async()=>{
    await saveWorkspaceTable('support_tickets',{reply:$('#reply-'+form.dataset.ticketReply).value.trim(),status:'replied',updated_at:new Date().toISOString()},form.dataset.ticketReply);
    toast('回复已保存');await loadMerchantWorkspace();render();
  })});
  function markRead(ids){workspace.read=[...new Set([...workspace.read,...ids])];try{localStorage.setItem('mospace-read-'+workspace.owner,JSON.stringify(workspace.read))}catch(e){toast('浏览器无法保存已读状态')}}
  on('readAllMessages','click',()=>{markRead(workspaceMessages().map(m=>m.id));render()});
  document.querySelectorAll('[data-message-id]').forEach(el=>el.onclick=()=>{markRead([el.dataset.messageId]);if(el.dataset.messageOrder)selectWorkspaceOrder(el.dataset.messageOrder,'fee');else go('support')});
  on('exportBills','click',exportWorkspaceBills);
};

const baseWarehouseInbound=warehouseInbound;
warehouseInbound=function(){
 const rows=workspace.parcels.filter(p=>!associatedOrder(p.id));
 return baseWarehouseInbound()+`<div class="card section-space"><h3>尚未申请打包的预报包裹（${rows.length}）</h3><p class="page-note">可先在上方扫描国内快递单号登记入库，商家随后申请打包。</p>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>国内快递单号</th><th>品名</th><th>状态</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.tracking_no)}</td><td>${esc(p.item_name||'')}</td><td>${status(parcelLabel(p))}</td></tr>`).join('')}</tbody></table></div>`:emptyState('暂无独立预报包裹','已关联订单的包裹按原订单作业流程处理。')}</div>`;
};
const workspaceBind=bind;
bind=function(){workspaceBind();if(!state.auth.user)document.getElementById('workspaceGlobalRefresh')?.remove();if(state.auth.user&&!document.getElementById('workspaceGlobalRefresh')){const b=document.createElement('button');b.id='workspaceGlobalRefresh';b.type='button';b.className='btn small ghost';b.textContent='刷新数据';b.onclick=()=>refreshDbState();document.querySelector('.top-actions')?.prepend(b)}};

function branchLinks(items,active,label){
 return `<nav class="branch-links" aria-label="${label}">${items.map(([page,text])=>`<button type="button" class="${active===page?'active':''}" ${active===page?'aria-current="page"':''} data-page="${page}">${text}</button>`).join('')}</nav>`;
}
function merchantPageFrame(html){
 const page=state.page,root=navActivePage(page,'merchant');
 const names={dashboard:'首页',parcels:'我的包裹',orders:'我的订单',receivers:'地址管理',rates:'运输计算器',messages:'消息与客服',profile:'我的账户','pre-advise':'预报包裹','order-create':'预报包裹','packing-request':'申请打包 / 合包','packing-history':'打包记录','parcel-detail':'包裹详情','parcel-edit':'编辑包裹预报',consolidate:'确认合包',fee:'订单详情与费用',tracking:'物流详情','tracking-list':'物流查询','sea-tracking':'海运查询',billing:'费用账单',address:'仓库地址',support:'客服工单',offers:'推广优惠'};
 const isChild=page!==root;
 const back=isChild?`<button type="button" data-page="${root}">${names[root]}</button><span aria-hidden="true">/</span>`:'';
 const orderCrumb=page==='tracking'&&state.order.record?`${orderAction(state.order.record,'fee','订单详情')}<span aria-hidden="true">/</span>`:'';
 const crumb=`<nav class="workspace-breadcrumb" aria-label="页面位置">${back}${orderCrumb}<span aria-current="page">${esc(names[page]||names[root]||'工作台')}</span></nav>`;
 let local='';
 if(['orders','tracking-list','sea-tracking','billing'].includes(page)){
  local=branchLinks([['orders','订单列表'],['tracking-list','物流查询'],['billing','费用账单']],page==='sea-tracking'?'tracking-list':page,'订单功能');
  if(['tracking-list','sea-tracking'].includes(page))local+=branchLinks([['tracking-list','全部运输'],['sea-tracking','海运']],page,'运输方式');
 }
 if(['receivers','address'].includes(page))local=branchLinks([['receivers','收货地址'],['address','深圳仓地址']],page,'地址类型');
 if(['messages','support'].includes(page))local=branchLinks([['messages','进度与回复'],['support','客服工单']],page,'消息与客服功能');
 if(['profile','offers'].includes(page))local=branchLinks([['profile','账户资料'],['offers','推广优惠']],page,'账户功能');
 let journey='';
 if(['fee','tracking'].includes(page)&&state.order.record){
  const o=state.order.record;
  const stages=[['提交打包',['submitted']],['仓库确认',['warehouse_received','measuring']],['一次付款',['awaiting_payment']],['打包出货',['paid','ready_to_ship']],['运输签收',['shipped','delivered']]];
  const current=o.status==='delivered'?stages.length:stages.findIndex(([,statuses])=>statuses.includes(o.status));
  journey=`<section class="order-journey" aria-label="当前订单进度"><div class="order-journey-title"><b>${esc(o.order_no)}</b>${orderProgressHtml(o)}</div><ol>${stages.map(([label],i)=>`<li class="${current<0?'':i<current?'done':i===current?'current':''}" ${i===current?'aria-current="step"':''}><span>${i<current?'✓':i+1}</span>${label}</li>`).join('')}</ol><div class="journey-links">${orderAction(o,'fee','订单详情与费用')}${orderAction(o,'tracking','物流节点')}<button type="button" class="btn small ghost" data-page="support" data-ticket-context="${o.id}">咨询此订单</button></div></section>`;
 }
 $('#crumb').textContent=isChild?`${names[root]} / ${names[page]}`:names[root];
 return crumb+local+journey+html;
}

function parcelDeleteConfirmation(parcel){
 const name=parcel.item_name||(typeof uiText==='function'?uiText('未填写','Belum diisi','Not provided'):'未填写');
 const zh=`确定删除包裹「${parcel.tracking_no}」吗？\n品名：${name}\n删除后将从包裹列表移除，无法自行撤销。`;
 return typeof uiText==='function'?uiText(zh,`Hapus paket "${parcel.tracking_no}"?\nIsi paket: ${name}\nPaket akan dihapus dari daftar. Tindakan ini tidak dapat dibatalkan.`,`Delete parcel "${parcel.tracking_no}"?\nContents: ${name}\nThe parcel will be removed from the list. This cannot be undone.`):zh;
}
