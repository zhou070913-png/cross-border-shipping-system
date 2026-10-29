/* 数据库变化只触发重新读取有权限的数据；不信任事件内容，不覆盖表单。 */
'use strict';
const progressSync={key:null,client:null,channel:null,epoch:0,revision:0,busy:false,manual:0,timer:null,dirty:false,connected:false,error:false,lastSuccess:0,lastAttempt:0};
function progressOwnerKey(){return state.auth.user?.id?`${state.auth.user.id}:${state.role}`:null}
function progressOnline(){return typeof navigator==='undefined'||navigator.onLine!==false}
function progressReady(){return !!(progressOwnerKey()&&window.MospaceSupabase.isConfigured()&&document.visibilityState==='visible'&&progressOnline())}
function progressHasDraft(){
 const focused=document.activeElement;
 if(focused?.matches?.('input,textarea,select,[contenteditable="true"]'))return true;
 if(document.querySelector('dialog[open],#authDialog.open'))return true;
 const content=document.getElementById('content');if(!content)return true;
 // 搜索框允许自动更新结果，但尚未提交的搜索词也必须保留。
 for(const form of content.querySelectorAll('form')){
  if(!['parcelSearch','orderSearch','trackingSearch','warehouseSearchForm','warehouseTrackingSearch'].includes(form.id))return true;
  for(const input of form.querySelectorAll('input,textarea'))if(input.value!==input.defaultValue)return true;
 }
 return false;
}
function progressCanApply(){
 if(!progressReady()||progressSync.manual||paymentWorkspace.busy||paymentWorkspace.loading||warehouseWorkspace.busy||warehouseWorkspace.loading||workspace.parcelBusy||(typeof combined!=='undefined'&&combined.busy))return false;
 if(!['dashboard','inbound','confirm','ship','overall-order','overseas-stock','overseas-stock-warehouse','parcels','parcel-detail','orders','fee','tracking','tracking-list','sea-tracking','packing-history','billing','warehouse-tracking','warehouse-tracking-detail','messages'].includes(state.page))return false;
 return !progressHasDraft();
}
function progressLabel(){
 if(!progressOnline())return '网络已断开，恢复后自动更新';
 if(progressSync.error)return '更新暂不可用，将自动重试';
 if(progressSync.busy||progressSync.manual)return '正在同步进度…';
 if(progressSync.dirty&&!progressCanApply())return '自动同步已开启，填写期间暂缓更新';
 const time=progressSync.lastSuccess?new Date(progressSync.lastSuccess).toLocaleTimeString('zh-CN',{hour12:false}):'';
 return `${progressSync.connected?'实时同步':'自动同步（每10秒）'}${time?' · '+time:''}`;
}
function showProgressSync(){
 let el=document.getElementById('workspaceSyncStatus');
 if(!progressOwnerKey()){el?.remove();return}
 if(!el){const actions=document.querySelector('.top-actions');if(!actions)return;el=document.createElement('span');el.id='workspaceSyncStatus';el.className='muted';el.style.fontSize='12px';el.setAttribute('role','status');actions.prepend(el)}
 const label=progressLabel();
 if(typeof localeMarkup==='function')el.innerHTML=localeMarkup(label,typeof indonesianFor==='function'?indonesianFor(label)||'':'');
 else el.textContent=label;
}
function stopProgressChannel(){
 const channel=progressSync.channel,client=progressSync.client;
 Object.assign(progressSync,{channel:null,client:null,key:null,connected:false});progressSync.epoch++;
 if(progressSync.timer){clearTimeout(progressSync.timer);progressSync.timer=null}
 if(channel&&client){try{Promise.resolve(client.removeChannel(channel)).catch(()=>{})}catch(e){/* 关闭失败时继续使用轮询。 */}}
}
function ensureProgressChannel(){
 const key=progressOwnerKey();
 if(!progressReady()){if(progressSync.channel||progressSync.key)stopProgressChannel();showProgressSync();return}
 if(progressSync.key===key)return;
 stopProgressChannel();
 const client=window.MospaceSupabase.getClient();if(!client?.channel)return;
 const epoch=progressSync.epoch,merchant=state.role==='merchant',warehouse=state.role==='warehouse',uid=state.auth.user.id,warehouseId=state.auth.profile?.warehouse_id;
 progressSync.key=key;progressSync.client=client;
 progressSync.error=false;progressSync.lastSuccess=0;
 try{
 const channel=client.channel('workspace-progress-'+uid+'-'+state.role);progressSync.channel=channel;
 for(const table of ['orders','parcels','tracking_events','payment_notifications']){
  const config={event:'*',schema:'public',table};
  if(['orders','parcels'].includes(table)){
   if(merchant)config.filter=`merchant_id=eq.${uid}`;
   else if(warehouse&&warehouseId)config.filter=`warehouse_id=eq.${warehouseId}`;
  }
  if(table==='payment_notifications'){
   if(merchant)config.filter=`recipient_user_id=eq.${uid}`;
   else if(warehouse&&warehouseId)config.filter=`warehouse_id=eq.${warehouseId}`;
  }
  channel.on('postgres_changes',config,()=>{if(epoch===progressSync.epoch&&key===progressOwnerKey())queueProgressRefresh()});
 }
 channel.subscribe(status=>{
  if(epoch!==progressSync.epoch||key!==progressOwnerKey())return;
  progressSync.connected=status==='SUBSCRIBED';showProgressSync();
  if(status==='SUBSCRIBED')queueProgressRefresh();
 });
 }catch(e){stopProgressChannel();showProgressSync()}
}
function queueProgressRefresh(){
 progressSync.dirty=true;showProgressSync();
 if(progressSync.timer)return;
 progressSync.timer=setTimeout(()=>{progressSync.timer=null;void runProgressSync()},400);
}
async function readProgressSnapshot(){
 const role=state.role,id=state.activeOrderId,trackingId=warehouseWorkspace.selectedId;
 const [orders,parcels,receipts,notices,events,warehouseEvents]=await Promise.all([
  window.MospaceSupabase.myOrders(),queryData('parcels'),
  role==='warehouse'?Promise.resolve(paymentWorkspace.receipts):paymentRows('payment_receipts'),paymentRows('payment_notifications'),
  ['tracking','fee','overall-order'].includes(state.page)&&id?window.MospaceSupabase.orderTracking(id):Promise.resolve(null),
  state.page==='warehouse-tracking-detail'&&trackingId?window.MospaceSupabase.orderTracking(trackingId):Promise.resolve(null)
 ]);
 const forwardingSnapshot=typeof forwarding!=='undefined'&&forwarding.ready?await readForwardingSnapshot():null;
 const combinedPending=typeof combined!=='undefined'&&combined.ready&&role!=='merchant'?await rpcWorkspace('warehouse_pending_customers',{}):null;
 return {orders,parcels,receipts,notices,events,warehouseEvents,forwardingSnapshot,combinedPending};
}
function progressTrackingFingerprint(events){return events===null?null:(events||[]).map(e=>[e.event_title??e.title,e.event_description??e.desc??'',e.occurred_at?new Date(e.occurred_at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):e.time])}
function progressFingerprint(snapshot){return JSON.stringify([snapshot.orders,snapshot.parcels,snapshot.receipts,snapshot.notices,progressTrackingFingerprint(snapshot.events),snapshot.warehouseEvents,snapshot.forwardingSnapshot||null,snapshot.combinedPending||null])}
function currentProgressSnapshot(){return {orders:state.dbOrders,parcels:workspace.parcels,receipts:paymentWorkspace.receipts,notices:paymentWorkspace.notices,events:['tracking','fee','overall-order'].includes(state.page)?state.events:null,warehouseEvents:state.page==='warehouse-tracking-detail'?warehouseWorkspace.tracking.events:null,forwardingSnapshot:typeof forwarding!=='undefined'&&forwarding.ready?{packages:forwarding.packages,items:forwarding.items,staff:forwarding.staff}:null,combinedPending:typeof combined!=='undefined'&&combined.ready&&state.role!=='merchant'?combined.pending:null}}
async function runProgressSync(){
 if(progressSync.busy||!progressCanApply())return false;
 const owner=progressOwnerKey(),revision=progressSync.revision,epoch=progressSync.epoch,page=state.page,id=state.activeOrderId,warehouseId=warehouseWorkspace.selectedId;
 progressSync.busy=true;progressSync.dirty=false;progressSync.lastAttempt=Date.now();showProgressSync();
 let success=false;
 try{
  const snapshot=await readProgressSnapshot();
  // 离开页面、换账号、手动刷新或提交表单后，丢弃先前的异步读取结果。
  if(owner!==progressOwnerKey()||revision!==progressSync.revision||epoch!==progressSync.epoch||page!==state.page||id!==state.activeOrderId||warehouseId!==warehouseWorkspace.selectedId||!progressCanApply()){progressSync.dirty=true;return false}
  const changed=progressFingerprint(snapshot)!==progressFingerprint(currentProgressSnapshot());
  state.dbOrders=snapshot.orders;workspace.parcels=snapshot.parcels;delete workspace.errors.parcels;
  paymentWorkspace.receipts=snapshot.receipts;paymentWorkspace.notices=snapshot.notices;
  if(snapshot.forwardingSnapshot)applyForwardingSnapshot(snapshot.forwardingSnapshot);
  if(snapshot.combinedPending!==null&&typeof combined!=='undefined')combined.pending=snapshot.combinedPending;
  const order=currentDbOrder(snapshot.orders);
  if(order)applyDbOrder(order);
  else{state.activeOrderId=null;state.order={id:'',status:'draft',record:null};state.parcels=[];state.events=[]}
  if(snapshot.events!==null)applyTracking(snapshot.events);
  if(snapshot.warehouseEvents!==null)warehouseWorkspace.tracking={orderId:warehouseId,events:snapshot.warehouseEvents,loading:false,error:null,request:warehouseWorkspace.tracking.request};
  progressSync.error=false;progressSync.lastSuccess=Date.now();success=true;
  if(changed){const scroll=window.scrollY;render();if(Number.isFinite(scroll)&&typeof window.scrollTo==='function')window.scrollTo(0,scroll)}
  return true;
 }catch(e){if(owner===progressOwnerKey()&&epoch===progressSync.epoch)progressSync.error=true;return false}
 finally{progressSync.busy=false;showProgressSync();if(success&&progressSync.dirty&&progressCanApply())queueProgressRefresh()}
}
const progressBaseRefresh=refreshDbState;
refreshDbState=async function(...args){
 progressSync.manual++;progressSync.revision++;showProgressSync();
 try{const ok=await progressBaseRefresh(...args);if(ok){progressSync.error=false;progressSync.lastSuccess=Date.now()}return ok}
 finally{progressSync.manual--;progressSync.revision++;showProgressSync()}
};
const progressBaseRender=render;
render=function(){progressSync.revision++;progressBaseRender();ensureProgressChannel();showProgressSync()};
if(typeof setInterval==='function')setInterval(()=>{
 ensureProgressChannel();
 const cadence=typeof forwarding!=='undefined'&&forwarding.ready?10000:progressSync.connected?30000:10000;
 if(progressReady()&&(progressSync.dirty||Date.now()-progressSync.lastAttempt>=cadence))void runProgressSync();
},10000);
if(typeof document.addEventListener==='function'){
 document.addEventListener('visibilitychange',()=>{ensureProgressChannel();if(progressReady())queueProgressRefresh()});
 document.addEventListener('focusout',()=>{if(progressSync.dirty)queueProgressRefresh()});
}
if(typeof window.addEventListener==='function'){
 window.addEventListener('online',()=>{ensureProgressChannel();queueProgressRefresh()});
 window.addEventListener('offline',()=>{stopProgressChannel();showProgressSync()});
 window.addEventListener('focus',()=>{ensureProgressChannel();queueProgressRefresh()});
 window.addEventListener('pagehide',stopProgressChannel);
}
