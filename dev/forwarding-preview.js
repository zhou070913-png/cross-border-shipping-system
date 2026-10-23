// 临时本地测试身份，不是正式账号；只在本地服务提供的预览页加载。
const localBar=document.createElement('div');
localBar.style.cssText='position:fixed;bottom:8px;left:260px;right:16px;z-index:1000;background:#fff7ed;border:1px solid #ea580c;padding:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
localBar.innerHTML='<b>开发版 · 本地隔离数据库</b><span>重启清空，禁止真实付款或寄件</span>';
async function localSwitch(role){
 if(paymentWorkspace.busy||forwarding.busy||warehouseWorkspace.busy)return;
 window.MospaceSupabase.setLocalRole(role);state.activeOrderId=null;state.order={record:null};state.page=role==='merchant'?'overseas-stock':role==='warehouse'?'overseas-receive':'payment-review';await syncAuth();
 $('#envLabel').textContent='本地测试数据库';
}
for(const [role,label]of [['merchant','切换测试商家'],['warehouse','切换测试仓库'],['admin','切换测试运营']]){const b=document.createElement('button');b.className='btn small ghost';b.textContent=label;b.onclick=()=>localSwitch(role);localBar.append(b)}
document.body.append(localBar);document.body.style.paddingBottom='85px';
document.querySelector('.side-footer')?.replaceChildren(document.createTextNode('v3.0 开发验收 · 海外仓整包转寄'));
localSwitch('warehouse');updateAuthMode();
