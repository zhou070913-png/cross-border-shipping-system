/* Merchant H5 only. Reuse server authorization, business actions and data from the latest development site. */
'use strict';
document.body.classList.add('h5-mode');
const mobile={owner:null,historyRoute:null,popping:false,navigating:false,renderedPage:null,signingOut:false,lists:{},addressBusy:false,observer:null,guideSeen:false,scrolls:{}};
for(const [zh,id,en]of [['会员号或邮箱','Nomor anggota atau email','Member number or email'],['我的待办','Ringkasan saya','My tasks'],['主导航','Navigasi utama','Main navigation']]){enLocale[zh]=en;extraIndonesian[zh]=id}
const mt=(zh,id,en)=>localeMarkup(zh,id,en);
const mobileOrderListPages=new Set(['orders','tracking-list','sea-tracking','billing']);
const mobileTrackingPages=new Set(['tracking-list','sea-tracking']);
const mobileEligibleParcel=p=>!p.order&&['pre_advised','received','measured'].includes(p.status);
pageRoles['account-details']='merchant';
const mobileAccountDetails=combinedProfile;
combinedProfile=function(){return ''};
const mobileBaseView=combinedView;
combinedView=function(){if(state.role==='merchant'&&state.page==='account-details')return mobileAccountDetails();return mobileBaseView()};
enLocale['我的']='Account';extraIndonesian['我的']='Akun';
const mobileIcon=name=>{
 const paths={home:'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',parcels:'m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4',orders:'M7 3h10v3H7zM7 5H4v16h16V5h-3M8 11h8M8 16h8',profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',back:'m14 5-7 7 7 7',arrow:'M5 12h14m-6-6 6 6-6 6',plus:'M12 4v16M4 12h16',rates:'M5 3h14v18H5zM8 7h8M8 11h1M12 11h1M16 11h1M8 15h1M12 15h1M16 15h1M8 18h1M12 18h1M16 18h1',support:'M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v6h4v-6H4Zm16 0h2v6h-4v-6h2ZM18 18v3h-6',address:'M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 1 1 14 0ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',tracking:'M3 6h12v12H3zM15 10h4l3 4v4h-7M5 18a2 2 0 1 0 4 0M16 18a2 2 0 1 0 4 0',refresh:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]||paths.arrow}"/></svg>`;
};
function mobileLink(page,zh,id,en,symbol=page){return `<button type="button" class="h5-service" data-page="${page}"><span class="h5-service-icon">${mobileIcon(symbol)}</span>${mt(zh,id,en)}<span class="h5-chevron" aria-hidden="true">›</span></button>`}
function mobileSection(){
 if(state.page==='dashboard')return 'dashboard';
 if(['parcels','parcel-detail','parcel-edit','pre-advise','packing-request','packing-history','order-create','consolidate'].includes(state.page))return 'parcels';
 if(['orders','fee','tracking','tracking-list','sea-tracking','overall-order','last-mile-create'].includes(state.page))return 'orders';
 return 'profile';
}
function mobileParent(){
 if(['parcel-detail','parcel-edit','pre-advise','packing-request','packing-history','order-create','consolidate'].includes(state.page))return 'parcels';
 if(['fee','tracking','overall-order'].includes(state.page))return mobile.orderReturnPage||'orders';
 if(['tracking-list','sea-tracking'].includes(state.page))return 'dashboard';
 if(['account-details','receivers','address','messages','support','rates','billing','offers'].includes(state.page))return 'profile';
 return 'dashboard';
}
loginPage=function(){
 state.auth.loginTargetRole='merchant';
 return `<div class="login-page"><section class="login-intro"><div class="login-brand"><span class="brand-mark">E</span><span>Eaztrans</span></div><h1>${mt('跨境集运，随时掌握','Pengiriman lintas negara, selalu terpantau','Cross-border shipping, at your fingertips')}</h1><p>${mt('深圳到印尼，预报、合包与物流一站查看。','Shenzhen ke Indonesia. Daftarkan, gabungkan, dan lacak paket.','Shenzhen to Indonesia. Declare, consolidate and track your parcels.')}</p><span class="h5-login-route">SHENZHEN <span aria-hidden="true">→</span> INDONESIA</span></section><section class="login-panel"><div class="login-card"><h2>${mt('商家登录','Masuk pelanggan','Customer sign in')}</h2><p>${mt('使用已有会员号或邮箱登录','Masuk dengan nomor anggota atau email','Use your member number or email')}</p><form id="h5LoginForm"><div class="field"><label for="loginIdentifier">${mt('会员号 / 邮箱','Nomor anggota / email','Member number / email')}</label><input id="loginIdentifier" name="username" placeholder="${esc(uiText('会员号或邮箱','Nomor anggota atau email','Member number or email'))}" autocomplete="username" autocapitalize="none" spellcheck="false" required></div><div class="field"><label for="loginPassword">${mt('密码','Kata sandi','Password')}</label><input id="loginPassword" name="password" type="password" placeholder="${esc(uiText('至少 6 位','Minimal 6 karakter','At least 6 characters'))}" autocomplete="current-password" required minlength="6"></div><button type="submit" class="btn primary login-submit" id="loginSubmit">${mt('登录','Masuk','Sign in')}</button></form><div class="login-links"><span>${mt('还没有账号？','Belum punya akun?','New customer?')}</span><button type="button" id="loginRegister">${mt('注册商家账号','Daftar akun pelanggan','Create customer account')}</button></div><div class="login-note">${mt('重新打开或刷新后需登录，包裹与订单和电脑端同步。','Masuk kembali setelah membuka ulang atau memuat ulang. Data tersinkron dengan desktop.','Sign in after reopening or refreshing. Parcels and orders stay in sync with desktop.')}</div></div></section></div>`;
};
combinedDashboard=function(){
 const parcels=allParcels(),orders=overallOrderRoots(state.dbOrders);
 const pending=parcels.filter(p=>p.status==='pre_advised').length,available=parcels.filter(mobileEligibleParcel).length;
 const due=orders.filter(o=>o.status==='awaiting_payment').length;
 const reviewing=orders.filter(o=>o.status==='awaiting_payment'&&orderReceipt(o.id)?.status==='pending').length;
 const tasks=[['parcels','待入库','Belum diterima','Awaiting receipt',pending,'pre_advised'],['parcels','可合包','Siap digabung','To consolidate',available,'available'],['orders','待付款 / 审核','Pembayaran','Payment',due,'awaiting_payment'],['orders','全部订单','Semua pesanan','All orders',orders.length,'all']];
 return `<section class="h5-welcome"><span>${mt('我的集运工作台','Ruang pengiriman saya','My shipping workspace')}</span><p class="mono" data-user-content>${esc(state.auth.profile?.member_no||'')}</p></section><section class="card h5-service-card"><h2>${mt('常用服务','Layanan','Quick services')}</h2><div class="h5-shortcuts">${mobileLink('packing-request','申请合包','Gabungkan paket','Consolidate','parcels')}${mobileLink('tracking-list','查询物流','Lacak paket','Track shipment','tracking')}${mobileLink('rates','运输计算器','Kalkulator ongkir','Shipping calculator','rates')}${mobileLink('messages','联系客服','Bantuan','Contact support','support')}</div></section><section class="h5-task-grid" aria-label="${esc(uiText('我的待办','Ringkasan saya','My tasks'))}">${tasks.map(([page,z,i,e,n,filter])=>`<button type="button" data-mobile-task="${page}" data-mobile-filter="${filter}"><strong>${n}</strong>${mt(z,i,e)}</button>`).join('')}</section>${reviewing?`<button type="button" class="h5-review-notice" data-mobile-task="orders" data-mobile-filter="awaiting_payment">${mt('付款凭证审核中','Bukti sedang diperiksa','Payment receipt under review')} <b>${reviewing}</b><span aria-hidden="true">›</span></button>`:''}<section class="h5-info-note">${mobileIcon('parcels')}<p>${mt('仓库确认头程和尾程费用后，只需付款一次。','Bayar sekali setelah biaya awal dan akhir diverifikasi gudang.','Pay once after the warehouse confirms first-mile and last-mile fees.')}</p></section>`;
};
function mobileAccountLinks(){return `<section class="card h5-service-card h5-account-services"><h2>${mt('我的服务','Layanan saya','My services')}</h2>${mobileLink('account-details','账户及资料','Akun dan profil','Account & profile','profile')}${mobileLink('receivers','地址管理','Alamat penerima','Delivery addresses','address')}${mobileLink('rates','运输计算器','Kalkulator ongkir','Shipping calculator','rates')}${mobileLink('messages','消息与客服','Pesan dan bantuan','Messages & support','support')}${mobileLink('address','国内仓库地址','Alamat gudang domestik','Shenzhen warehouse','parcels')}<button type="button" class="h5-service" data-h5-guide>${mobileIcon('orders')}${mt('新人指南','Panduan pemula','Getting started')}<span class="h5-chevron">›</span></button><button type="button" class="h5-service" id="h5Shopping">${mobileIcon('parcels')}<span>${mt('代购产品','Belanja titipan','Product shopping')}<small>${mt('即将开放','Segera hadir','Coming soon')}</small></span><span class="h5-chevron">›</span></button><button type="button" class="h5-service" id="h5Refresh">${mobileIcon('refresh')}${mt('刷新业务数据','Muat ulang data','Refresh data')}<span aria-hidden="true">↻</span></button></section><div class="h5-account-actions"><button type="button" class="btn primary" data-h5-signout>${mt('切换账号','Ganti akun','Switch account')}</button><button type="button" class="btn ghost h5-signout" id="h5SignOut">${mt('退出登录','Keluar','Sign out')}</button></div>`}
async function mobileSignOut(){
 if(mobile.signingOut)return false;
 if(mobile.addressBusy||authFlow.busy||combined.busy||paymentWorkspace.busy||workspace.parcelBusy){toast(uiText('正在保存，请稍候','Sedang menyimpan, mohon tunggu','Saving. Please wait.'));return false}
 mobile.signingOut=true;setAuthBusy(true);
 const buttons=[...document.querySelectorAll('[data-h5-signout],#h5SignOut')];
 for(const b of buttons){b.disabled=true;b.setAttribute('aria-busy','true')}
 try{
  const client=window.MospaceSupabase.getClient();
  // End this browser session only; do not revoke the merchant's other devices.
  if(client?.auth?.signOut){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error}
  else await window.MospaceSupabase.signOut();
  if(typeof stopProgressChannel==='function')stopProgressChannel();
  Object.assign(state.auth,{user:null,profile:null,role:null,pending:null,pendingRole:null,mode:'login',loginTargetRole:'merchant'});
  Object.assign(state,{role:'merchant',page:'dashboard',dbOrders:[],addresses:[],parcels:[],events:[],activeOrderId:null,order:{id:'',status:'draft',record:null}});
  combined.ready=false;combined.owner=null;combined.draft={};combined.replyDraft={};workspace.parcels=[];workspace.selected=new Set();
  document.getElementById('paymentProofDialog')?.remove();closeAuth();
  setAuthBusy(false);render();
  // A fresh document clears all account-specific drafts, caches and pending UI jobs.
  // The SDK has already removed its persisted session, so refresh cannot restore it.
  if(window.location?.replace)window.location.replace(window.location.pathname+window.location.search);
  return true;
 }catch(error){toast(uiText('退出失败，请检查网络后重试','Gagal keluar. Periksa koneksi dan coba lagi.','Could not sign out. Check your connection and retry.'));return false}
 finally{mobile.signingOut=false;setAuthBusy(false);for(const b of buttons){b.disabled=false;b.removeAttribute('aria-busy')}}
}
function mobilePrepareTables(root){
 for(const table of root.querySelectorAll('.table')){
  if(table.dataset.h5Cards)continue;
  const heads=[...table.querySelectorAll('thead th')];if(!heads.length)continue;
  table.dataset.h5Cards='true';table.classList.add('h5-card-table');
  for(const row of table.querySelectorAll('tbody tr')){
   const cells=[...row.children].filter(el=>el.tagName==='TD');
   if(cells.length===1&&cells[0].hasAttribute('colspan')){row.classList.add('h5-empty-row');continue}
   cells.forEach((cell,index)=>{
    const value=document.createElement('div');value.className='h5-cell-value';while(cell.firstChild)value.append(cell.firstChild);
    const label=document.createElement('span');label.className='h5-cell-label';label.setAttribute('aria-hidden','true');label.innerHTML=heads[index]?.innerHTML||'';
    cell.append(label,value);if(index===cells.length-1)cell.classList.add('h5-card-actions');
   });
  }
 }
}
function mobileRoute(){return {h5:true,owner:state.auth.user?.id||null,page:state.page,order:state.activeOrderId||null,parcel:workspace.detailParcelId||null,address:workspace.editingAddress||null,step:typeof mobileFlow==='undefined'?1:mobileFlow.step}}
function mobileRememberRoute(push=false){
 if(!window.history?.replaceState||mobile.popping||mobile.navigating)return;
 const route=mobileRoute(),key=JSON.stringify(route);
 if(key===mobile.historyRoute)return;
 if(push&&mobile.owner===route.owner)window.history.pushState(route,'');else window.history.replaceState(route,'');
 mobile.owner=route.owner;mobile.historyRoute=key;
}
const mobileOriginalGo=go;
go=function(page,options={}){
 if(options.role&&options.role!=='merchant')return false;
 if(state.auth.user&&normalizedRole(state.auth.role)!=='merchant')return false;
 if(mobile.addressBusy){toast(uiText('正在删除地址，请稍候','Menghapus alamat, mohon tunggu','Deleting address. Please wait.'));return false}
 if(paymentWorkspace.busy){toast(uiText('正在保存付款资料，请稍候','Menyimpan pembayaran, mohon tunggu','Saving payment details. Please wait.'));return false}
 let changed;mobile.navigating=true;
 try{changed=mobileOriginalGo(page,{...options,role:'merchant'})}finally{mobile.navigating=false}
 if(changed){mobileRememberRoute(true);const key=mobile.lists[state.page]?.key;if(key)window.scrollTo?.(0,mobile.scrolls[key]||0)}return changed;
};
function mobileRenderChrome(){
 const logged=!!state.auth.user,merchant=logged&&normalizedRole(state.auth.role)==='merchant';
 document.body.classList.toggle('h5-authenticated',merchant);
 document.getElementById('h5BottomNav')?.remove();
 document.getElementById('h5SwitchAccount')?.remove();
 if(!merchant)return;
 let heading=document.getElementById('h5Heading');
 if(!heading){heading=document.createElement('div');heading.id='h5Heading';heading.className='h5-heading';document.querySelector('.topbar')?.prepend(heading)}
 const atRoot=['dashboard','parcels','orders','profile','pre-advise'].includes(state.page);
 document.body.classList.toggle('h5-home',state.page==='dashboard');
 document.body.classList.toggle('h5-subpage',!atRoot);
 const pageTitle=document.querySelector('#content h1');
 heading.innerHTML=`${atRoot?'<span class="brand-mark">E</span>':`<button type="button" id="h5Back" aria-label="${esc(uiText('返回','Kembali','Back'))}">${mobileIcon('back')}</button>`}<span class="h5-heading-title">${state.page==='dashboard'?'Eaztrans':state.page==='profile'?mt('我的','Akun','Account'):pageTitle?.innerHTML||mt('商家端','Pelanggan','Customer')}</span>`;
 const nav=document.createElement('nav');nav.id='h5BottomNav';nav.className='h5-bottom-nav';nav.setAttribute('aria-label',uiText('主导航','Navigasi utama','Main navigation'));
 const items=[['dashboard','首页','Beranda','Home','home'],['parcels','包裹','Paket','Parcels','parcels'],['pre-advise','预报包裹','Daftarkan','Declare','plus'],['orders','订单','Pesanan','Orders','orders'],['profile','我的','Akun','Account','profile']];
 nav.innerHTML=items.map(([page,z,i,e,symbol])=>`<button type="button" data-h5-nav="${page}" class="${page==='pre-advise'?'h5-nav-declare':''}" ${((page==='pre-advise'&&state.page===page)||(page!=='pre-advise'&&mobileSection()===page&&state.page!=='pre-advise'))?'aria-current="page"':''}>${mobileIcon(symbol)}${mt(z,i,e)}</button>`).join('');document.body.append(nav);
 if(state.page==='profile'){
  document.querySelector('#content .head-actions')?.remove();

  document.getElementById('content').insertAdjacentHTML('beforeend',mobileAccountLinks());
 }
 mobilePrepareTables(document.getElementById('content'));
 // Reparenting cells preserves their event handlers and file inputs; bind only new H5 controls.
 document.querySelectorAll('[data-h5-nav],[data-mobile-task]').forEach(button=>button.onclick=()=>{
  const page=button.dataset.h5Nav||button.dataset.mobileTask;
  if(['parcels','orders'].includes(page)){combined.filter=button.dataset.mobileFilter||'all';workspace.parcelQuery='';workspace.orderQuery='';workspace.parcelPage=1;combined.orderPage=1}
  go(page,{role:'merchant'});
 });
 // Profile services are appended after the existing bind pass.
 document.querySelectorAll('.h5-account-services [data-page]').forEach(button=>button.onclick=()=>go(button.dataset.page,{role:'merchant'}));
 document.querySelectorAll('[data-combined-back-orders]').forEach(b=>b.onclick=()=>go(mobile.orderReturnPage||'orders',{role:'merchant'}));
 const back=document.getElementById('h5Back');if(back)back.onclick=()=>go(mobileParent(),{role:'merchant'});
 document.querySelectorAll('[data-h5-signout],#h5SignOut').forEach(button=>button.onclick=mobileSignOut);
 document.getElementById('h5Refresh')?.addEventListener('click',()=>refreshDbState());
 mobileBindLazy();
 document.querySelectorAll('[data-h5-guide]').forEach(b=>b.onclick=()=>mobileGuide(true));
 document.getElementById('h5Shopping')?.addEventListener('click',()=>toast(uiText('代购产品即将开放，当前暂不支持选购。','Belanja titipan segera hadir; pembelian belum tersedia.','Product shopping is coming soon and is not available yet.')));
 mobileRememberRoute();
}
const mobileBaseOrderList=combinedOrderList;
combinedOrderList=function(warehouse=false,customerId=null){
 let html=mobileBaseOrderList(warehouse,customerId);
 if(!warehouse&&mobileOrderListPages.has(state.page))html=html.replaceAll('data-target-page="orders"',`data-target-page="${state.page}"`);
 if(!warehouse&&mobileTrackingPages.has(state.page))html=html.replace(ch('我的订单','Pesanan saya'),`<div class="page-head"><h1>${mt('物流查询','Lacak pengiriman','Track shipments')}</h1></div>`);
 return html;
};
const mobileBaseOpen=combinedOpen;
combinedOpen=function(id){
 if(mobileOrderListPages.has(state.page))mobile.orderReturnPage=state.page;
 if(state.role==='merchant'&&mobileTrackingPages.has(state.page)){
  const o=state.dbOrders.find(o=>o.id===id);if(!o)return;applyDbOrder(o);workspace.supportOrderId=o.id;state.events=[];
  return loadSelectedOrderTracking(id,'tracking');
 }
 return mobileBaseOpen(id);
};
function mobileListPage(rows,kind){
 const key=[state.auth.user?.id,kind,kind==='receivers'?'':combined.filter,kind==='receivers'?addressList.query:kind==='parcels'?workspace.parcelQuery:workspace.orderQuery].join('|');
 let list=mobile.lists[kind];if(!list||list.key!==key)list=mobile.lists[kind]={key,limit:12};
 return {rows:rows.slice(0,list.limit),total:rows.length,to:Math.min(list.limit,rows.length),kind};
}
const mobileDesktopParcelPagination=parcelPagination,mobileDesktopOrderPagination=combinedOrderPagination;
parcelPagination=function(rows){return state.page==='parcels'?mobileListPage(rows,'parcels'):mobileDesktopParcelPagination(rows)};
combinedOrderPagination=function(rows){return mobileOrderListPages.has(state.page)?mobileListPage(rows,state.page):mobileDesktopOrderPagination(rows)};
function mobileListFooter(p){return `<div class="h5-load-footer" role="status">${p.to<p.total?`${mt(`已显示 ${p.to} / ${p.total} 条`,`Ditampilkan ${p.to} / ${p.total}`,`Showing ${p.to} / ${p.total}`)}<button type="button" class="btn ghost" data-h5-load="${p.kind}">${mt('加载更多','Muat lebih banyak','Load more')}</button>`:mt(p.total?`共 ${p.total} 条 · 已显示全部`:'暂无记录',p.total?`${p.total} data · semua ditampilkan`:'Belum ada data',p.total?`${p.total} records · all shown`:'No records yet')}</div>`}
const mobileDesktopParcelPager=parcelPager,mobileDesktopOrderPager=combinedOrderPager;
parcelPager=function(p){return p.kind?mobileListFooter(p):mobileDesktopParcelPager(p)};
combinedOrderPager=function(p){return p.kind?mobileListFooter(p):mobileDesktopOrderPager(p)};
const mobileDesktopOrderTable=combinedOrderTable;
combinedOrderTable=function(rows,warehouse=false){
 if(warehouse||!mobileOrderListPages.has(state.page))return mobileDesktopOrderTable(rows,warehouse);
 return `<div class="h5-list">${rows.map(o=>{const f=feeRecord(o);return `<article class="h5-list-card" data-combined-order-row="${esc(o.id)}"><header><b class="mono" data-user-content>${esc(o.order_no)}</b>${isCombined(o)?`<button type="button" class="btn small ghost" data-combined-open="${esc(o.id)}">${mobileTrackingPages.has(state.page)?mt('查看物流','Lacak pengiriman','Track shipment'):mt('查看详情','Lihat detail','View details')}</button>`:overallOrderButton(o,mt('查看详情','Lihat detail','View details'))}</header><div class="h5-list-meta">${isCombined(o)?cs(o):translatedText(orderProgress(o).label)}<span>${translatedText(o.route_name)} · ${mt(`${o.parcel_count||0} 个包裹`,`${o.parcel_count||0} paket`,`${o.parcel_count||0} parcels`)}</span></div><div class="h5-list-fees"><span>${mt('头程','Awal','First mile')}<b>${combinedMoney(combinedHeadAmount(o))}</b></span><span>${mt('尾程','Akhir','Last mile')}<b>${combinedMoney(f?.last_mile_fee,mt('待复核费用','Menunggu verifikasi','Awaiting quote'))}</b></span></div><footer><span data-user-content>${esc(o.recipient_name||'—')} · ${esc(o.destination_city||'—')}</span><strong>${mt('合计','Total','Total')} ${combinedMoney(f?.confirmed_at?f.total_amount:null,mt('待复核','Menunggu verifikasi','Awaiting quote'))}</strong></footer></article>`}).join('')||ce()}</div>`;
};
const mobileDesktopParcelList=combinedParcelList;
combinedParcelList=function(){
 const rows=allParcels().filter(p=>(combined.filter==='all'||p.status===combined.filter||combined.filter==='available'&&mobileEligibleParcel(p))&&[p.tracking_no,p.item_name].join(' ').toLowerCase().includes(workspace.parcelQuery.toLowerCase()));
 const p=mobileListPage(rows,'parcels');
 const selecting=combined.filter==='available'||mobile.selectingParcels;
 const eligible=new Set(allParcels().filter(mobileEligibleParcel).map(p=>p.id));
 for(const id of workspace.selected)if(!eligible.has(id))workspace.selected.delete(id);
 const cards=`<div class="h5-list">${p.rows.map(p=>`<article class="h5-list-card" data-h5-parcel-card="${esc(p.id)}">${selecting&&mobileEligibleParcel(p)?`<label class="h5-parcel-select"><input type="checkbox" data-h5-select-parcel="${esc(p.id)}" ${workspace.selected.has(p.id)?'checked':''}>${mt('选择合包','Pilih untuk digabung','Select to consolidate')}</label>`:''}<header><b class="mono" data-user-content>${esc(p.tracking_no)}</b><button type="button" class="btn small ghost" data-workspace-parcel="${esc(p.id)}">${mt('查看详情','Lihat detail','View details')}</button></header><p data-user-content>${esc(p.item_name)}</p><div class="h5-list-meta">${p.status==='pre_advised'?mt('待入库','Belum diterima','Awaiting receipt'):p.order&&isCombined(p.order)?cs(p.order):translatedText(parcelLabel(p))}</div>${p.order?`<footer>${mt('关联订单','Pesanan terkait','Linked order')} ${isCombined(p.order)?combinedOpenButton(p.order,p.order.order_no,p.order.order_no):overallOrderButton(p.order)}</footer>`:''}</article>`).join('')||ce()}</div>`;
 return ch('我的包裹','Paket saya',cb('预报包裹','Daftarkan paket','pre-advise',true)+`<button type="button" class="btn ghost" id="h5SelectParcels">${selecting?mt('退出选择','Selesai memilih','Done selecting'):mt('选择合包','Pilih untuk digabung','Select to consolidate')}</button>`)+`<div class="workspace-tabs">${[['all','全部','Semua','All'],['pre_advised','待入库','Belum diterima','Awaiting receipt'],['available','可申请合包','Dapat digabungkan','Can consolidate']].map(([f,z,i,e])=>`<button type="button" data-combined-filter="${f}" data-target-page="parcels" class="${combined.filter===f?'active':''}" aria-pressed="${combined.filter===f}">${mt(z,i,e)}</button>`).join('')}</div>${selecting?`<p class="h5-selection-note">${mt('可提前申请合包，仓库收齐并复核费用后再付款。','Bisa diajukan sebelum paket tiba. Bayar setelah gudang menerima semua paket dan memverifikasi biaya.','You can apply before arrival. Pay after all parcels arrive and fees are confirmed.')}</p>`:''}<div class="card"><form id="parcelSearch" class="workspace-toolbar"><input id="parcelSearchText" aria-label="${esc(uiText('快递单号或品名','Resi atau nama barang','Tracking number or contents'))}" placeholder="${esc(uiText('快递单号 / 品名','Resi / nama barang','Tracking number / contents'))}" value="${esc(workspace.parcelQuery)}"><button class="btn ghost">${mt('查询','Cari','Search')}</button></form>${cards}${mobileListFooter(p)}</div>${selecting?`<div class="h5-flow-bar h5-parcel-bar"><span id="h5ParcelCount" role="status"></span><button type="button" class="btn primary" id="h5ConsolidateSelected">${mt('申请合包','Gabungkan paket','Consolidate')}</button></div>`:''}`;
};
const mobileBaseAddressPagination=combinedAddressPagination;
combinedAddressPagination=function(){
 if(state.page!=='receivers')return mobileBaseAddressPagination();
 const owner=state.auth.user?.id+':'+state.role;
 if(addressList.owner!==owner)Object.assign(addressList,{owner,query:'',page:1,size:10});
 const q=addressList.query.toLowerCase();
 return mobileListPage(state.addresses.filter(a=>[a.label,a.recipient_name,a.recipient_phone,a.country,a.city,a.address_line,a.postal_code].join(' ').toLowerCase().includes(q)),'receivers');
};
const mobileBaseAddressList=combinedAddressList;
combinedAddressList=function(){
 if(state.page!=='receivers')return mobileBaseAddressList();
 const p=combinedAddressPagination();
 return `<div class="card"><h2>${mt('收货地址列表','Daftar alamat penerima','Delivery addresses')}</h2><form id="addressListSearch" class="workspace-toolbar"><input id="addressListQuery" aria-label="${esc(uiText('查询地址','Cari alamat','Search addresses'))}" placeholder="${esc(uiText('收件人 / 电话 / 城市 / 地址','Penerima / telepon / kota / alamat','Recipient / phone / city / address'))}" value="${esc(addressList.query)}"><button class="btn ghost">${mt('查询','Cari','Search')}</button><button type="button" class="btn ghost" id="addressListReset">${mt('重置','Atur ulang','Reset')}</button></form></div>${p.rows.map(a=>`<article class="card section-space" data-address-row="${esc(a.id)}"><div class="card-title"><h3>${raw(a.label)}</h3>${a.is_default?`<span class="status green">${mt('默认地址','Alamat utama','Default address')}</span>`:''}</div><b>${raw(a.recipient_name)} · ${raw(a.recipient_phone)}</b><p>${raw(a.city)}<br>${raw(a.address_line)} ${raw(a.postal_code)}</p><div class="h5-address-actions"><button type="button" class="btn ghost" data-edit-address="${esc(a.id)}" ${mobile.addressBusy?'disabled':''}>${mt('编辑地址','Ubah alamat','Edit address')}</button><button type="button" class="btn ghost h5-address-delete" data-delete-address="${esc(a.id)}" ${mobile.addressBusy?'disabled':''}>${mt('删除','Hapus','Delete')}</button></div></article>`).join('')||`<div class="card section-space">${addressList.query?mt('没有匹配的地址','Tidak ada alamat yang sesuai','No matching addresses'):mt('尚未保存收货地址','Belum ada alamat tersimpan','No saved delivery addresses')}</div>`}${mobileListFooter(p)}`;
};
function mobileRefreshAddresses(){
 const root=document.getElementById('combinedAddressList');if(!root)return;
 root.innerHTML=combinedAddressList();bindCombinedAddressList();localizeKnownDom(root);mobileBindLazy();
}
async function mobileDeleteAddress(id){
 if(mobile.addressBusy||state.role!=='merchant'||!state.auth.user||!state.addresses.some(a=>a.id===id))return false;
 const form=document.getElementById('receiverForm');
 if(form?.querySelector('[type=submit]')?.disabled){toast(uiText('正在保存地址，请稍候','Menyimpan alamat, mohon tunggu','Saving address. Please wait.'));return false}
 if(!window.confirm(uiText('确定删除此收货地址？删除后无法恢复，已提交订单的收件信息不受影响。','Hapus alamat ini? Tidak dapat dipulihkan. Alamat pada pesanan yang sudah diajukan tetap tersimpan.','Delete this delivery address? This cannot be undone. Delivery details on submitted orders will stay unchanged.')))return false;
 const owner=state.auth.user.id,version=authFlow.syncVersion;
 const current=()=>state.auth.user?.id===owner&&authFlow.syncVersion===version;
 const controls=[...document.querySelectorAll('#receiverForm input,#receiverForm textarea,#receiverForm button,[data-edit-address],[data-delete-address]')].map(el=>[el,el.disabled]);
 mobile.addressBusy=true;for(const [el] of controls)el.disabled=true;
 try{
  const {data,error}=await window.MospaceSupabase.getClient().from('merchant_addresses').delete().eq('id',id).eq('merchant_id',owner).select('id');
  if(error)throw error;
  if(!data?.some(a=>a.id===id))throw Error(uiText('地址已不存在或无权删除，请刷新后核对','Alamat tidak ditemukan atau tidak dapat dihapus. Muat ulang untuk memeriksa.','Address missing or deletion not allowed. Refresh to check.'));
  if(!current())return false;
  state.addresses=state.addresses.filter(a=>a.id!==id);
  const editing=workspace.editingAddress===id;if(editing)workspace.editingAddress=null;
  mobile.addressBusy=false;
  if(state.page==='receivers'){if(editing)render();else mobileRefreshAddresses()}
  toast(uiText('地址已删除','Alamat dihapus','Address deleted'));return true;
 }catch(e){if(current())toast(uiText('删除失败：','Gagal menghapus: ','Delete failed: ')+e.message,6000);return false}
 finally{mobile.addressBusy=false;for(const [el,disabled] of controls)if(el.isConnected)el.disabled=disabled}
}
const mobileBaseAddressBind=bindCombinedAddressList;
bindCombinedAddressList=function(){
 if(state.page!=='receivers')return mobileBaseAddressBind();
 const root=document.getElementById('combinedAddressList');if(!root)return;
 root.querySelector('#addressListSearch').onsubmit=e=>{e.preventDefault();addressList.query=root.querySelector('#addressListQuery').value.trim();mobileRefreshAddresses()};
 root.querySelector('#addressListReset').onclick=()=>{addressList.query='';mobileRefreshAddresses()};
 root.querySelectorAll('[data-edit-address]').forEach(b=>b.onclick=()=>{if(mobile.addressBusy)return;workspace.editingAddress=b.dataset.editAddress;render()});
 root.querySelectorAll('[data-delete-address]').forEach(b=>b.onclick=()=>mobileDeleteAddress(b.dataset.deleteAddress));
};
function mobileBindLazy(){
 mobile.observer?.disconnect();mobile.observer=null;
 const button=document.querySelector('[data-h5-load]');if(!button)return;
 const owner=state.auth.user?.id,page=state.page,key=mobile.lists[button.dataset.h5Load]?.key;
 const load=()=>{if(!button.isConnected||button.disabled||state.auth.user?.id!==owner||state.page!==page)return;const list=mobile.lists[button.dataset.h5Load];if(list?.key!==key)return;button.disabled=true;list.limit+=12;if(page==='receivers')mobileRefreshAddresses();else render()};
 button.onclick=load;
 if(window.IntersectionObserver){mobile.observer=new window.IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load()},{rootMargin:'0px 0px 180px 0px'});mobile.observer.observe(button)}
}
function mobileGuide(force=false){
 if(document.getElementById('h5Guide'))return;
 if(!force){if(mobile.guideSeen)return;try{if(localStorage.getItem('eaztrans:h5:guide:v1')){mobile.guideSeen=true;return}}catch{}}
 mobile.guideSeen=true;const prior=document.activeElement;
 const dialog=document.createElement('div');dialog.id='h5Guide';dialog.className='h5-guide-backdrop';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','h5GuideTitle');
 dialog.innerHTML=`<section class="h5-guide-card"><span class="brand-mark">E</span><h2 id="h5GuideTitle">${mt('欢迎使用 Eaztrans','Selamat datang di Eaztrans','Welcome to Eaztrans')}</h2><p>${mt('四步开始你的集运','Mulai pengiriman dalam empat langkah','Start shipping in four steps')}</p><ol>${[['预报包裹','填国内快递单号和品名，将包裹寄到深圳仓。','Daftarkan paket','Isi resi dan nama barang, lalu kirim ke gudang Shenzhen.','Declare parcels','Enter tracking and contents, then send to Shenzhen.'],['申请合包','在“包裹”选包裹，填写印尼收件地址。','Gabungkan paket','Pilih paket dan isi alamat penerima Indonesia.','Consolidate','Choose parcels and enter the Indonesian delivery address.'],['复核后付款','仓库确认头程、尾程费用后，一次付款并上传凭证。','Bayar setelah verifikasi','Bayar biaya awal dan akhir sekaligus, lalu unggah bukti.','Pay after review','Pay both legs once the warehouse confirms fees, and upload your receipt.'],['查看物流','在“订单”查看审核、出货及派送进度。','Lacak pengiriman','Lihat verifikasi, pengiriman dan pengantaran di Pesanan.','Track delivery','Follow payment review, dispatch and delivery in Orders.']].map(([z,d,i,di,e,de])=>`<li><strong>${mt(z,i,e)}</strong><p>${mt(d,di,de)}</p></li>`).join('')}</ol><button type="button" class="btn primary" id="h5GuideClose">${mt('我知道了，开始使用','Mengerti, mulai','Got it, let’s start')}</button><small>${mt('可在“我的 → 新人指南”再次查看','Buka lagi di Akun → Panduan pemula','Reopen under Account → Getting started')}</small></section>`;
 document.body.append(dialog);const close=()=>{try{localStorage.setItem('eaztrans:h5:guide:v1','seen')}catch{}dialog.remove();prior?.focus?.()};
 const button=dialog.querySelector('button');button.onclick=close;dialog.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){e.preventDefault();button.focus?.()}};button.focus?.();localizeKnownDom(dialog);
}

const mobileOriginalRender=render;
render=function(){
 const previousList=mobile.lists[mobile.renderedPage],previousKey=previousList?.key;
 if(mobile.renderedPage!==state.page&&previousKey)mobile.scrolls[previousKey]=window.scrollY||0;
 if(state.auth.user&&normalizedRole(state.auth.role)!=='merchant'){
  $('#appShell').classList.add('login-mode');document.body.classList.remove('h5-authenticated');$('#h5BottomNav')?.remove();
  $('#h5SwitchAccount')?.remove();$('#content').innerHTML=`<section class="h5-staff-handoff card"><span class="brand-mark">E</span><h1>${mt('此入口仅供商家使用','Halaman ini khusus pelanggan','This entry is for customers')}</h1><p>${mt('当前登录的是内部员工账号，请返回电脑端工作台。','Akun staf terdeteksi. Buka ruang kerja desktop.','You are signed in as staff. Please use the desktop workspace.')}</p><a class="btn primary" href="../">${mt('打开电脑端','Buka desktop','Open desktop')}</a><button type="button" class="btn ghost" data-h5-signout>${mt('切换商家账号','Ganti ke akun pelanggan','Switch to customer account')}</button></section>`;document.querySelector('[data-h5-signout]').onclick=mobileSignOut;localizeKnownDom($('#content'));return;
 }
 mobileOriginalRender();mobileRenderChrome();mobileGuide();
 const currentKey=mobile.lists[state.page]?.key;
 if(mobile.renderedPage!==state.page||currentKey!==previousKey){window.scrollTo?.(0,currentKey?mobile.scrolls[currentKey]||0:0);mobile.renderedPage=state.page}
 const form=document.getElementById('h5LoginForm');if(form)form.onsubmit=e=>{e.preventDefault();void submitLandingAuth()};
 const submit=document.getElementById('loginSubmit');if(form&&submit)submit.onclick=null;
};
if(typeof window.addEventListener==='function')window.addEventListener('popstate',event=>{
 const route=event.state;if(!route?.h5||route.owner!==state.auth.user?.id||normalizedRole(state.auth.role)!=='merchant')return;
 mobile.popping=true;
 try{
  if(route.order){const order=state.dbOrders.find(o=>o.id===route.order);if(order)applyDbOrder(order)}
  if(route.parcel)workspace.detailParcelId=route.parcel;
  if(route.page==='address-edit')workspace.editingAddress=route.address||null;
  if(['packing-request','consolidate','packing-history'].includes(route.page)&&typeof mobileFlow!=='undefined')mobileFlow.step=route.step||1;
  if(['fee','tracking','overall-order'].includes(route.page)&&state.activeOrderId)void loadSelectedOrderTracking(state.activeOrderId,route.page);
  else go(route.page,{role:'merchant'});
  mobile.historyRoute=JSON.stringify(route);
 }finally{mobile.popping=false}
});
if(typeof window.addEventListener==='function')window.addEventListener('pageshow',event=>{if(event.persisted)window.location?.reload?.()});
