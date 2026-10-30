/* Merchant H5 only. Reuse server authorization, business actions and data from the latest development site. */
'use strict';
document.body.classList.add('h5-mode');
const mobile={owner:null,historyRoute:null,popping:false,navigating:false,renderedPage:null,signingOut:false};
for(const [zh,id,en]of [['会员号或邮箱','Nomor anggota atau email','Member number or email'],['我的待办','Ringkasan saya','My tasks'],['主导航','Navigasi utama','Main navigation']]){enLocale[zh]=en;extraIndonesian[zh]=id}
const mt=(zh,id,en)=>localeMarkup(zh,id,en);
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
 if(['fee','tracking','tracking-list','sea-tracking','overall-order'].includes(state.page))return 'orders';
 if(['receivers','address','messages','support','rates','billing','offers'].includes(state.page))return 'profile';
 return 'dashboard';
}
loginPage=function(){
 state.auth.loginTargetRole='merchant';
 return `<div class="login-page"><section class="login-intro"><div class="login-brand"><span class="brand-mark">E</span><span>Eaztrans</span></div><h1>${mt('跨境集运，随时掌握','Pengiriman lintas negara, selalu terpantau','Cross-border shipping, at your fingertips')}</h1><p>${mt('深圳到印尼，预报、合包与物流一站查看。','Shenzhen ke Indonesia. Daftarkan, gabungkan, dan lacak paket.','Shenzhen to Indonesia. Declare, consolidate and track your parcels.')}</p><span class="h5-login-route">SHENZHEN <span aria-hidden="true">→</span> INDONESIA</span></section><section class="login-panel"><div class="login-card"><h2>${mt('商家登录','Masuk pelanggan','Customer sign in')}</h2><p>${mt('使用已有会员号或邮箱登录','Masuk dengan nomor anggota atau email','Use your member number or email')}</p><form id="h5LoginForm"><div class="field"><label for="loginIdentifier">${mt('会员号 / 邮箱','Nomor anggota / email','Member number / email')}</label><input id="loginIdentifier" name="username" placeholder="${esc(uiText('会员号或邮箱','Nomor anggota atau email','Member number or email'))}" autocomplete="username" autocapitalize="none" spellcheck="false" required></div><div class="field"><label for="loginPassword">${mt('密码','Kata sandi','Password')}</label><input id="loginPassword" name="password" type="password" placeholder="${esc(uiText('至少 6 位','Minimal 6 karakter','At least 6 characters'))}" autocomplete="current-password" required minlength="6"></div><button type="submit" class="btn primary login-submit" id="loginSubmit">${mt('登录','Masuk','Sign in')}</button></form><div class="login-links"><span>${mt('还没有账号？','Belum punya akun?','New customer?')}</span><button type="button" id="loginRegister">${mt('注册商家账号','Daftar akun pelanggan','Create customer account')}</button></div><div class="login-note">${mt('与电脑端共用账号，包裹与订单同步。','Akun, paket, dan pesanan sama dengan versi desktop.','Your account, parcels and orders are shared with desktop.')}</div></div></section></div>`;
};
combinedDashboard=function(){
 const parcels=allParcels(),orders=overallOrderRoots(state.dbOrders);
 const pending=parcels.filter(p=>p.status==='pre_advised').length,available=parcels.filter(p=>!p.order).length;
 const due=orders.filter(o=>o.status==='awaiting_payment').length;
 const reviewing=orders.filter(o=>o.status==='awaiting_payment'&&orderReceipt(o.id)?.status==='pending').length;
 const tasks=[['parcels','待入库','Belum diterima','Awaiting receipt',pending,'pre_advised'],['parcels','可合包','Siap digabung','To consolidate',available,'available'],['orders','待付款 / 审核','Pembayaran','Payment',due,'awaiting_payment'],['orders','全部订单','Semua pesanan','All orders',orders.length,'all']];
 return `<section class="h5-welcome"><span>${mt('我的集运工作台','Ruang pengiriman saya','My shipping workspace')}</span><h1>${mt('让每一件包裹，都有迹可循','Setiap paket, selalu terlacak','Every parcel, always in view')}</h1><p class="mono" data-user-content>${esc(state.auth.profile?.member_no||'')}</p></section><button type="button" class="h5-primary-action" data-page="pre-advise"><span class="h5-action-icon">${mobileIcon('plus')}</span><span><strong>${mt('预报包裹','Daftarkan paket','Declare a parcel')}</strong><small>${mt('填写国内单号和包裹品名','Isi resi domestik dan nama barang','Domestic tracking number and parcel contents')}</small></span>${mobileIcon('arrow')}</button><section class="h5-task-grid" aria-label="${esc(uiText('我的待办','Ringkasan saya','My tasks'))}">${tasks.map(([page,z,i,e,n,filter])=>`<button type="button" data-mobile-task="${page}" data-mobile-filter="${filter}"><strong>${n}</strong>${mt(z,i,e)}</button>`).join('')}</section>${reviewing?`<button type="button" class="h5-review-notice" data-mobile-task="orders" data-mobile-filter="awaiting_payment">${mt('付款凭证审核中','Bukti sedang diperiksa','Payment receipt under review')} <b>${reviewing}</b><span aria-hidden="true">›</span></button>`:''}<section class="card h5-service-card"><h2>${mt('常用服务','Layanan','Quick services')}</h2><div class="h5-shortcuts">${mobileLink('packing-request','申请合包','Gabungkan paket','Consolidate','parcels')}${mobileLink('tracking-list','查询物流','Lacak paket','Track shipment','tracking')}${mobileLink('rates','运输计算器','Kalkulator ongkir','Shipping calculator','rates')}${mobileLink('messages','联系客服','Bantuan','Contact support','support')}</div></section><section class="h5-info-note">${mobileIcon('parcels')}<p>${mt('仓库确认头程和尾程费用后，只需付款一次。','Bayar sekali setelah biaya awal dan akhir diverifikasi gudang.','Pay once after the warehouse confirms first-mile and last-mile fees.')}</p></section>`;
};
function mobileAccountLinks(){return `<section class="card h5-service-card h5-account-services"><h2>${mt('我的服务','Layanan saya','My services')}</h2>${mobileLink('receivers','地址管理','Alamat penerima','Delivery addresses','address')}${mobileLink('rates','运输计算器','Kalkulator ongkir','Shipping calculator','rates')}${mobileLink('messages','消息与客服','Pesan dan bantuan','Messages & support','support')}${mobileLink('address','国内仓库地址','Alamat gudang domestik','Shenzhen warehouse','parcels')}<button type="button" class="h5-service" id="h5Refresh">${mobileIcon('refresh')}${mt('刷新业务数据','Muat ulang data','Refresh data')}<span aria-hidden="true">↻</span></button></section><div class="h5-account-actions"><button type="button" class="btn primary" data-h5-signout>${mt('切换账号','Ganti akun','Switch account')}</button><button type="button" class="btn ghost h5-signout" id="h5SignOut">${mt('退出登录','Keluar','Sign out')}</button></div>`}
async function mobileSignOut(){
 if(mobile.signingOut)return false;
 if(authFlow.busy||combined.busy||paymentWorkspace.busy||workspace.parcelBusy){toast(uiText('正在保存，请稍候','Sedang menyimpan, mohon tunggu','Saving. Please wait.'));return false}
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
function mobileRoute(){return {h5:true,owner:state.auth.user?.id||null,page:state.page,order:state.activeOrderId||null,parcel:state.selectedParcelNo||null}}
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
 if(paymentWorkspace.busy){toast(uiText('正在保存付款资料，请稍候','Menyimpan pembayaran, mohon tunggu','Saving payment details. Please wait.'));return false}
 let changed;mobile.navigating=true;
 try{changed=mobileOriginalGo(page,{...options,role:'merchant'})}finally{mobile.navigating=false}
 if(changed)mobileRememberRoute(true);return changed;
};
function mobileRenderChrome(){
 const logged=!!state.auth.user,merchant=logged&&normalizedRole(state.auth.role)==='merchant';
 document.body.classList.toggle('h5-authenticated',merchant);
 document.getElementById('h5BottomNav')?.remove();
 document.getElementById('h5SwitchAccount')?.remove();
 if(!merchant)return;
 let heading=document.getElementById('h5Heading');
 if(!heading){heading=document.createElement('div');heading.id='h5Heading';heading.className='h5-heading';document.querySelector('.topbar')?.prepend(heading)}
 const atRoot=['dashboard','parcels','orders','profile'].includes(state.page);
 const pageTitle=document.querySelector('#content h1');
 heading.innerHTML=`${atRoot?'<span class="brand-mark">E</span>':`<button type="button" id="h5Back" aria-label="${esc(uiText('返回','Kembali','Back'))}">${mobileIcon('back')}</button>`}<span class="h5-heading-title">${state.page==='dashboard'?'Eaztrans':pageTitle?.innerHTML||mt('商家端','Pelanggan','Customer')}</span>`;
 const nav=document.createElement('nav');nav.id='h5BottomNav';nav.className='h5-bottom-nav';nav.setAttribute('aria-label',uiText('主导航','Navigasi utama','Main navigation'));
 const items=[['dashboard','首页','Beranda','Home','home'],['parcels','包裹','Paket','Parcels','parcels'],['orders','订单','Pesanan','Orders','orders'],['profile','我的','Akun','Account','profile']];
 nav.innerHTML=items.map(([page,z,i,e,symbol])=>`<button type="button" data-h5-nav="${page}" ${mobileSection()===page?'aria-current="page"':''}>${mobileIcon(symbol)}${mt(z,i,e)}</button>`).join('');document.body.append(nav);
 const switcher=document.createElement('button');switcher.type='button';switcher.id='h5SwitchAccount';switcher.className='h5-switch-account';switcher.setAttribute('data-h5-signout','');switcher.innerHTML=mt('切换账号','Ganti akun','Switch account');document.querySelector('.top-actions')?.append(switcher);
 if(state.page==='profile'){
  document.querySelector('#content .head-actions')?.remove();
  document.getElementById('content').insertAdjacentHTML('afterbegin',`<div class="h5-account-switch"><button type="button" class="btn ghost" data-h5-signout>${mt('切换账号','Ganti akun','Switch account')}</button></div>`);
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
 document.getElementById('h5Back')?.addEventListener('click',()=>go(mobileParent(),{role:'merchant'}));
 document.querySelectorAll('[data-h5-signout],#h5SignOut').forEach(button=>button.onclick=mobileSignOut);
 document.getElementById('h5Refresh')?.addEventListener('click',()=>refreshDbState());
 mobileRememberRoute();
}
const mobileOriginalRender=render;
render=function(){
 if(state.auth.user&&normalizedRole(state.auth.role)!=='merchant'){
  $('#appShell').classList.add('login-mode');document.body.classList.remove('h5-authenticated');$('#h5BottomNav')?.remove();
  $('#h5SwitchAccount')?.remove();$('#content').innerHTML=`<section class="h5-staff-handoff card"><span class="brand-mark">E</span><h1>${mt('此入口仅供商家使用','Halaman ini khusus pelanggan','This entry is for customers')}</h1><p>${mt('当前登录的是内部员工账号，请返回电脑端工作台。','Akun staf terdeteksi. Buka ruang kerja desktop.','You are signed in as staff. Please use the desktop workspace.')}</p><a class="btn primary" href="../">${mt('打开电脑端','Buka desktop','Open desktop')}</a><button type="button" class="btn ghost" data-h5-signout>${mt('切换商家账号','Ganti ke akun pelanggan','Switch to customer account')}</button></section>`;document.querySelector('[data-h5-signout]').onclick=mobileSignOut;localizeKnownDom($('#content'));return;
 }
 mobileOriginalRender();mobileRenderChrome();
 if(mobile.renderedPage!==state.page){window.scrollTo?.(0,0);mobile.renderedPage=state.page}
 const form=document.getElementById('h5LoginForm');if(form)form.onsubmit=e=>{e.preventDefault();void submitLandingAuth()};
 const submit=document.getElementById('loginSubmit');if(form&&submit)submit.onclick=null;
};
if(typeof window.addEventListener==='function')window.addEventListener('popstate',event=>{
 const route=event.state;if(!route?.h5||route.owner!==state.auth.user?.id||normalizedRole(state.auth.role)!=='merchant')return;
 mobile.popping=true;
 try{
  if(route.order){const order=state.dbOrders.find(o=>o.id===route.order);if(order)applyDbOrder(order)}
  if(route.parcel)state.selectedParcelNo=route.parcel;
  if(['fee','tracking','overall-order'].includes(route.page)&&state.activeOrderId)void loadSelectedOrderTracking(state.activeOrderId,route.page);
  else go(route.page,{role:'merchant'});
  mobile.historyRoute=JSON.stringify(route);
 }finally{mobile.popping=false}
});
if(typeof window.addEventListener==='function')window.addEventListener('pageshow',event=>{if(event.persisted)window.location?.reload?.()});
