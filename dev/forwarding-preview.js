// 临时本地测试身份，不是正式账号；只在本地服务提供的预览页加载。
const localBar=document.createElement('div');
localBar.id='localPreviewBar';
localBar.style.cssText='position:fixed;bottom:8px;left:260px;right:16px;z-index:1000;background:#fff7ed;border:1px solid #ea580c;padding:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
localBar.innerHTML='<b>开发版 · 本地隔离数据库</b><span>重启清空，禁止真实付款或寄件</span>';
let localSwitching=false;
async function localSwitch(role){
 if(localSwitching||paymentWorkspace.busy||paymentWorkspace.loading||forwarding.busy||warehouseWorkspace.busy||warehouseWorkspace.loading||workspace.parcelBusy||(typeof combined!=='undefined'&&combined.busy))return;
 localSwitching=true;
 localBar.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{
  if(typeof progressSync!=='undefined'){progressSync.manual++;stopProgressChannel()}
  window.MospaceSupabase.setLocalRole(role);
  state.activeOrderId=null;state.order={record:null};state.dbOrders=[];state.adminOrders=[];state.addresses=[];state.events=[];state.auditLogs=[];state.page='dashboard';
  await syncAuth();
  $('#envLabel').textContent='本地测试数据库';
 }finally{
  if(typeof progressSync!=='undefined')progressSync.manual--;
  localSwitching=false;
  localBar.querySelectorAll('button').forEach(b=>{b.disabled=false;b.setAttribute('aria-pressed',String(b.dataset.localIdentity===window.MospaceSupabase.getLocalRole()))});
 }
}
for(const [role,label]of [['merchant','测试客户 A / Pelanggan A'],['merchant2','测试客户 B / Pelanggan B'],['warehouse','测试仓库 / Gudang'],['admin','测试运营 / Admin']]){const b=document.createElement('button');b.className='btn small ghost';b.dataset.localIdentity=role;b.textContent=label;b.onclick=()=>localSwitch(role);localBar.append(b)}
document.body.append(localBar);document.body.style.paddingBottom='85px';
document.querySelector('.side-footer')?.replaceChildren(document.createTextNode('v3.1 开发验收 · 整单一次结算'));
localSwitch(window.MospaceSupabase.getLocalRole());updateAuthMode();
