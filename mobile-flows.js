/* H5 task flows. Desktop entries never load this module. Business RPCs stay shared. */
'use strict';
Object.assign(pageRoles,{'payment':'merchant','address-edit':'merchant','submission-success':'merchant'});
const mobileFlow={owner:null,step:1,success:null,pendingAdvice:null,addressDraft:null,addressSaving:false,paymentDraft:null,trackingVisited:false,trackingCache:new Map()};
for(const [zh,id,en] of [['新增地址','Tambah alamat','Add address'],['编辑地址','Ubah alamat','Edit address'],['付款与凭证','Pembayaran dan bukti','Payment & receipt'],['提交成功','Berhasil dikirim','Submitted'],['提交结果','Hasil pengiriman','Submission result']]){enLocale[zh]=en;extraIndonesian[zh]=id}
const mobileFlowOwner=()=>state.auth.user?.id||null;
function mobileResetFlows(){
 const owner=mobileFlowOwner();if(mobileFlow.owner===owner)return;
 Object.assign(mobileFlow,{owner,step:1,success:null,pendingAdvice:null,addressDraft:null,addressSaving:false,paymentDraft:null,trackingVisited:false,trackingCache:new Map()});
 workspace.editingAddress=null;
}
const mobileFlowBaseSection=mobileSection,mobileFlowBaseParent=mobileParent;
mobileSection=function(){if(state.page==='payment')return 'orders';if(state.page==='submission-success')return mobileFlow.success?.kind==='order'?'orders':'parcels';return mobileFlowBaseSection()};
mobileParent=function(){if(state.page==='address-edit')return 'receivers';if(state.page==='payment')return 'fee';if(state.page==='submission-success')return mobileFlow.success?.kind==='order'?'orders':'parcels';return mobileFlowBaseParent()};
const mobileFlowBaseGo=go;
const mobileFlowBaseSignOut=mobileSignOut;
mobileSignOut=async function(){if(mobileFlow.addressSaving){toast(uiText('正在保存地址，请稍候','Menyimpan alamat, mohon tunggu','Saving address. Please wait.'));return false}return mobileFlowBaseSignOut()};
go=function(page,options={}){
 if(mobileFlow.addressSaving){toast(uiText('正在保存地址，请稍候','Menyimpan alamat, mohon tunggu','Saving address. Please wait.'));return false}
 if(mobileTrackingPages.has(page)&&!mobileFlow.trackingVisited){combined.filter='shipped';workspace.orderQuery='';mobileFlow.trackingVisited=true}
 return mobileFlowBaseGo(page,options);
};
const mobileFlowBaseDashboard=combinedDashboard;
combinedDashboard=function(){return mobileFlowBaseDashboard().replace(mt('可合包','Siap digabung','To consolidate'),mt('可申请合包','Dapat diajukan','Can consolidate'))};
const mobileFlowBaseLinks=mobileAccountLinks;
mobileAccountLinks=function(){
 const root=document.createElement('div');root.innerHTML=mobileFlowBaseLinks();
 root.querySelector('[data-h5-signout]')?.remove();
 const signout=root.querySelector('#h5SignOut');signout?.setAttribute('class','btn ghost h5-signout');
 if(signout)signout.innerHTML=mt('退出 / 切换账号','Keluar / ganti akun','Sign out / switch account');
 root.querySelector('#h5Shopping')?.classList.add('h5-coming-soon');return root.innerHTML;
};

// Keep every input in the same form: step changes do not throw away selections or drafts.
const mobileFlowBasePacking=combinedPackingRequest;
combinedPackingRequest=function(){
 const root=document.createElement('div');root.innerHTML=mobileFlowBasePacking();
 const form=root.querySelector('#combinedRequest');if(!form)return root.innerHTML;
 form.setAttribute('novalidate','');
 const cards=[...form.children],first=cards[0],second=cards[1],last=cards[2];
 first.dataset.h5Step='1';second.dataset.h5Step='2';last.dataset.h5Step='3';
 const routeLabel=first.querySelector('label[for=crRoute]'),route=first.querySelector('#crRoute');
 second.prepend(routeLabel,route);last.insertAdjacentHTML('afterbegin','<div id="h5RequestSummary"></div>');
 last.querySelector('.form-actions')?.remove();
 form.insertAdjacentHTML('beforebegin',`<ol class="h5-stepper" aria-label="${esc(uiText('合包步骤','Langkah penggabungan','Consolidation steps'))}">${[['选择包裹','Pilih paket','Parcels'],['线路与地址','Jalur dan alamat','Route & address'],['确认提交','Konfirmasi','Confirm']].map(([z,i,e],n)=>`<li data-h5-step-label="${n+1}"><b>${n+1}</b>${mt(z,i,e)}</li>`).join('')}</ol>`);
 form.insertAdjacentHTML('beforeend',`<div class="h5-flow-bar"><span id="h5SelectedCount" role="status"></span><button type="button" class="btn ghost" id="h5StepPrevious">${mt('上一步','Sebelumnya','Back')}</button><button type="button" class="btn primary" id="h5StepNext">${mt('下一步','Berikutnya','Next')}</button><button type="submit" class="btn primary" id="h5StepSubmit">${mt('提交订单','Kirim pesanan','Submit order')}</button></div>`);
 return root.innerHTML;
};
function mobilePackingSummary(){
 const d=combined.draft,r=d.recipient||{},selected=allParcels().filter(p=>workspace.selected.has(p.id));
 const route=freightChannels().find(x=>x.route_code===d.route);
 return `<h2>${mt('确认合包信息','Konfirmasi penggabungan','Review consolidation')}</h2><dl class="h5-review-fields"><dt>${mt('已选包裹','Paket terpilih','Selected parcels')}</dt><dd>${selected.length}</dd><dt>${mt('运输线路','Jalur pengiriman','Shipping route')}</dt><dd>${route?.transport_mode==='sea'?mt('印尼海运','Laut Indonesia','Indonesia sea'):mt('印尼空运','Udara Indonesia','Indonesia air')}</dd><dt>${mt('收件人','Penerima','Recipient')}</dt><dd data-user-content>${esc(r.recipient_name||'')} · ${esc(r.recipient_phone||'')}</dd><dt>${mt('收件地址','Alamat penerima','Delivery address')}</dt><dd data-user-content>${esc(r.city||'')} · ${esc(r.address_line||'')} ${esc(r.postal_code||'')}</dd>${d.note?`<dt>${mt('备注','Catatan','Note')}</dt><dd data-user-content>${esc(d.note)}</dd>`:''}</dl><details class="h5-selected-details"><summary>${mt('查看包裹明细','Lihat rincian paket','View selected parcels')}</summary>${selected.map(p=>`<p data-user-content>${esc(p.tracking_no)} · ${esc(p.item_name)}</p>`).join('')}</details>`;
}
function mobilePackingStep(step,scroll=true){
 mobileFlow.step=Math.max(1,Math.min(3,step));
 document.querySelectorAll('[data-h5-step]').forEach(el=>el.hidden=Number(el.dataset.h5Step)!==mobileFlow.step);
 document.querySelectorAll('[data-h5-step-label]').forEach(el=>{el.classList.toggle('active',Number(el.dataset.h5StepLabel)===mobileFlow.step);if(Number(el.dataset.h5StepLabel)===mobileFlow.step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current')});
 const prev=$('#h5StepPrevious'),next=$('#h5StepNext'),submit=$('#h5StepSubmit');if(!prev)return;
 prev.hidden=mobileFlow.step===1;next.hidden=mobileFlow.step===3;submit.hidden=mobileFlow.step!==3;
 $('#h5SelectedCount').innerHTML=mt(`已选 ${workspace.selected.size} 件`,`${workspace.selected.size} paket dipilih`,`${workspace.selected.size} selected`);
 if(mobileFlow.step===3)$('#h5RequestSummary').innerHTML=mobilePackingSummary();
 localizeKnownDom($('#combinedRequest'));if(scroll)window.scrollTo?.(0,0);
 mobileRememberRoute();
}
function mobileValidatePacking(step){
 if(step===1&&!workspace.selected.size){toast(uiText('请选择至少一个包裹','Pilih minimal satu paket','Select at least one parcel'));return false}
 if(step===2){
  for(const id of ['crRoute','crName','crPhone','crCity','crAddress','crPostal','crNote']){const input=$('#'+id);if(!['crPostal','crNote'].includes(id)&&!input?.value?.trim()){input?.focus?.();input?.reportValidity?.();toast(uiText('请填写完整收货信息','Lengkapi data penerima','Complete the delivery details'));return false}if(input.checkValidity&&!input.checkValidity()){input.reportValidity?.();return false}}
 }return true;
}

const mobileFlowBaseAddresses=combinedAddresses;
combinedAddresses=function(){return ch('地址管理','Kelola alamat')+`<button type="button" class="btn primary h5-add-address" id="h5AddAddress">${mt('＋ 新增收货地址','＋ Tambah alamat','＋ Add delivery address')}</button><div id="combinedAddressList">${combinedAddressList()}</div>`};
function mobileAddressEditor(){
 const a=state.addresses.find(a=>a.id===workspace.editingAddress);
 if(workspace.editingAddress&&!a){workspace.editingAddress=null;mobileFlow.addressDraft=null;return ch('编辑地址','Ubah alamat')+cn('地址已不存在，请返回地址列表重新选择。','Alamat tidak tersedia. Kembali ke daftar alamat.')+cb('返回地址列表','Kembali ke daftar alamat','receivers')}
 const root=document.createElement('div');root.innerHTML=mobileFlowBaseAddresses();
 const form=root.querySelector('#receiverForm');form.querySelector('#cancelAddressEdit')?.remove();
 form.querySelector('.form-actions').classList.add('h5-flow-bar');
 form.querySelector('.form-actions').insertAdjacentHTML('afterbegin',`<button type="button" class="btn ghost" id="h5CancelAddress">${mt('取消','Batal','Cancel')}</button>`);
 form.querySelector('#receiverPhone').type='tel';form.querySelector('#receiverPostal').setAttribute('inputmode','numeric');
 form.querySelector('#receiverLine').previousElementSibling?.setAttribute('for','receiverLine');
 return ch(a?'编辑地址':'新增地址',a?'Ubah alamat':'Tambah alamat')+`<section class="card">${form.outerHTML}</section>`;
}
const mobileFlowBaseAddressBind=bindCombinedAddressList;
const mobileFlowBaseDeleteAddress=mobileDeleteAddress;
mobileDeleteAddress=async function(id){if(mobileFlow.addressSaving)return false;const result=await mobileFlowBaseDeleteAddress(id);if(result&&mobileFlow.addressDraft?.id===id)mobileFlow.addressDraft=null;return result};
bindCombinedAddressList=function(){
 mobileFlowBaseAddressBind();
 if(state.page==='receivers')document.querySelectorAll('[data-edit-address]').forEach(b=>b.onclick=()=>{if(mobile.addressBusy)return;workspace.editingAddress=b.dataset.editAddress;mobileFlow.addressDraft=null;go('address-edit')});
};
function mobileReadAddress(){return Object.fromEntries(['receiverLabel','receiverName','receiverPhone','receiverCity','receiverPostal','receiverLine'].map(id=>[id,$('#'+id)?.value||'']))}
async function mobileSaveAddress(form){
 if(mobileFlow.addressSaving||mobile.addressBusy)return false;
 const owner=mobileFlowOwner(),version=authFlow.syncVersion,id=workspace.editingAddress,d=mobileReadAddress();
 const payload={label:d.receiverLabel.trim()||'收货地址',recipient_name:d.receiverName.trim(),recipient_phone:d.receiverPhone.trim(),country:'印度尼西亚',city:d.receiverCity.trim(),postal_code:d.receiverPostal.trim(),address_line:d.receiverLine.trim()};
 if(!payload.recipient_name||!payload.recipient_phone||!payload.city||!payload.address_line){toast(uiText('请填写完整收货信息','Lengkapi data penerima','Complete the delivery details'));return false}
 if(id)payload.id=id;else payload.is_default=state.addresses.length===0;
 const current=()=>owner===mobileFlowOwner()&&version===authFlow.syncVersion;
 mobileFlow.addressSaving=true;const controls=[...form.querySelectorAll('button,input,textarea')],prior=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
 try{
  const saved=await window.MospaceSupabase.saveAddress(payload);if(!current())return false;
  const addresses=await window.MospaceSupabase.listAddresses();if(!current())return false;
  state.addresses=addresses;workspace.editingAddress=null;mobileFlow.addressDraft=null;
  const savedId=saved?.id||id||addresses.find(a=>a.recipient_name===payload.recipient_name&&a.address_line===payload.address_line)?.id;
  // Clear a restrictive search so a newly saved address is never invisible.
  addressList.query='';mobileFlow.addressSaving=false;go('receivers');
  const index=addresses.findIndex(a=>a.id===savedId);if(index>=12){mobile.lists.receivers.limit=Math.ceil((index+1)/12)*12;mobileRefreshAddresses()}
  const row=[...document.querySelectorAll('[data-address-row]')].find(el=>el.dataset.addressRow===savedId);row?.classList.add('h5-saved-address');row?.scrollIntoView?.({block:'center',behavior:'smooth'});
  toast(uiText('收货地址已保存','Alamat disimpan','Delivery address saved'));return true;
 }catch(error){if(current())toast(uiText('保存失败：','Gagal menyimpan: ','Save failed: ')+error.message,6000);return false}
 finally{mobileFlow.addressSaving=false;controls.forEach((c,i)=>{if(c.isConnected)c.disabled=prior[i]});if(current()&&state.page==='address-edit')$('#receiverForm')?.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false)}
}

function mobileCanPay(o){return o?.status==='awaiting_payment'&&!!feeRecord(o)?.confirmed_at&&Number(feeRecord(o)?.total_amount)>0&&orderReceipt(o.id)?.status!=='pending'&&paymentRecord(o)?.status!=='paid'}
const mobileFlowBasePayment=merchantPaymentSection;
merchantPaymentSection=function(o){
 if(state.role!=='merchant'||!isCombined(o)||state.page==='payment')return mobileFlowBasePayment(o);
 if(mobileCanPay(o))return `<section class="card section-space"><h2>${mt('仓库费用已复核','Biaya telah diverifikasi','Warehouse fees confirmed')}</h2><p>${orderReceipt(o.id)?.status==='rejected'?mt('请补充凭证，勿重复转账。','Lengkapi bukti, jangan transfer ulang.','Resubmit your receipt. Do not transfer again.'):mt('确认头程、尾程总额后，一次转账并上传凭证。','Konfirmasi total biaya, transfer sekali dan unggah bukti.','Confirm both fees, transfer once and upload your receipt.')}</p><button type="button" class="btn primary h5-payment-entry" data-h5-payment="${esc(o.id)}">${orderReceipt(o.id)?.status==='rejected'?mt('补交付款凭证','Lengkapi bukti','Resubmit receipt'):mt('去付款','Bayar sekarang','Go to payment')}</button></section>`;
 return mobileFlowBasePayment(o);
};
function mobilePaymentPage(o){
 if(!o||o.merchant_id!==mobileFlowOwner())return ch('付款','Pembayaran')+ce();
 return ch('付款与凭证','Pembayaran dan bukti')+`<section class="card h5-pay-total"><span>${mt(mobileCanPay(o)?'整单应付':'整单金额','Total pesanan','Order total')}</span><strong>${combinedMoney(feeRecord(o)?.total_amount)}</strong><small class="mono" data-user-content>${esc(o.order_no)}</small><p>${mt('头程＋尾程，一次付款。上传凭证后待运营审核。','Biaya awal + akhir, satu pembayaran. Bukti diperiksa admin.','First mile + last mile, one payment. Receipts require review.')}</p></section>`+mobileFlowBasePayment(o);
}
async function mobileCopy(value){try{await navigator.clipboard.writeText(value);toast(uiText('已复制','Disalin','Copied'))}catch{toast(uiText('无法复制，请长按文本手动复制','Tidak dapat menyalin. Tekan lama teks untuk menyalin.','Could not copy. Long-press the text to copy manually.'))}}
function mobileTrackingNumbers(o){return `<div class="h5-tracking-numbers">${[['头程运单','Resi awal','First-mile tracking',o.shipment_carrier,o.shipment_tracking_no],['尾程运单','Resi akhir','Last-mile tracking',o.tail_carrier,o.tail_tracking_no]].map(([z,i,e,carrier,no])=>`<div><span>${mt(z,i,e)}</span><b data-user-content>${esc(carrier||'—')}</b><p class="mono" data-user-content>${esc(no||'—')}</p>${no?`<button type="button" class="btn small ghost" data-h5-copy="${esc(no)}">${mt('复制单号','Salin resi','Copy number')}</button>`:`<small>${mt('尚未登记','Belum dicatat','Not registered yet')}</small>`}</div>`).join('')}</div>`}
const mobileFlowBaseApplyTracking=applyTracking;
applyTracking=function(events){
 const sorted=[...(events||[])].sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));mobileFlowBaseApplyTracking(sorted);
 state.events.forEach((e,n)=>{e.occurredAt=sorted[n]?.occurred_at});
 if(state.activeOrderId)mobileFlow.trackingCache.set(state.activeOrderId,{events:state.events.map(e=>({...e})),version:state.order.record?.updated_at});
};
const mobileFlowBaseTimeline=selectedOrderTimeline;
selectedOrderTimeline=function(){
 if(state.page!=='tracking'||!isCombined(state.order.record))return mobileFlowBaseTimeline();
 const o=state.order.record,current=workspace.trackingLoad?.id===o.id?workspace.trackingLoad:null,events=[...(state.events||[])].sort((a,b)=>new Date(b.occurredAt||0)-new Date(a.occurredAt||0)),latest=events[0];
 return `<section class="card h5-current-tracking"><span>${mt('当前运输状态','Status pengiriman','Current shipping status')}</span><h2>${cs(o)}</h2><p class="mono" data-user-content>${esc(o.order_no)}</p>${current?.loading?`<p role="status">${mt('物流加载中…','Memuat pelacakan…','Loading tracking…')}</p>`:current?.error?`<p role="alert">${mt('物流读取失败，请重试','Gagal memuat pelacakan. Coba lagi.','Tracking could not load. Please retry.')}</p><button type="button" class="btn ghost" id="h5TrackingRetry">${mt('重新加载','Muat ulang','Retry')}</button>`:latest?`<h3>${translatedText(latest.title)}</h3><p>${translatedText(latest.desc)}</p><time>${esc(latest.occurredAt?dateText(latest.occurredAt):latest.time)}</time>`:`<p>${mt('暂无物流节点，等待仓库更新。','Belum ada pembaruan. Menunggu gudang.','No tracking events yet. Awaiting a warehouse update.')}</p>`}</section>${mobileTrackingNumbers(o)}<section class="card section-space"><h2>${mt('物流记录 · 最新在前','Riwayat · terbaru dahulu','Tracking history · newest first')}</h2><div class="timeline">${!current?.loading&&!current?.error&&events.length?events.map(e=>`<div class="event"><div></div><div><h4>${translatedText(e.title)}</h4><p>${translatedText(e.desc)}<br><time>${esc(e.occurredAt?dateText(e.occurredAt):e.time)}</time></p></div></div>`).join(''):mt('暂无可显示记录','Belum ada riwayat','No history to display')}</div></section>`;
};
// Tracking completes with a partial DOM update. Bind copy/retry controls again without replacing payment forms.
const mobileFlowBaseLoadTracking=loadSelectedOrderTracking;
loadSelectedOrderTracking=async function(id,page){const result=await mobileFlowBaseLoadTracking(id,page);if(result)mobileBindCopies();return result};
function mobileBindCopies(){document.querySelectorAll('[data-h5-copy]').forEach(b=>b.onclick=()=>mobileCopy(b.dataset.h5Copy));const retry=$('#h5TrackingRetry');if(retry)retry.onclick=()=>loadSelectedOrderTracking(state.activeOrderId,'tracking')}
function mobileFlowLabels(){
 $('#h5Back')?.setAttribute('aria-label',uiText('返回','Kembali','Back'));
 $('.h5-stepper')?.setAttribute('aria-label',uiText('合包步骤','Langkah penggabungan','Consolidation steps'));
 $('#h5BottomNav')?.setAttribute('aria-label',uiText('主导航','Navigasi utama','Main navigation'));
}
const mobileFlowBaseLanguage=setUiLanguage;
setUiLanguage=function(language){const result=mobileFlowBaseLanguage(language);mobileFlowLabels();return result};
const mobileFlowBaseDetail=combinedDetail;
combinedDetail=function(o,tracking=false){
 if(tracking&&state.role==='merchant'&&isCombined(o))return ch('物流详情','Pelacakan pengiriman')+`<div data-order-timeline>${selectedOrderTimeline()}</div><details class="h5-tracking-fees section-space"><summary>${mt('订单费用与收件地址','Biaya dan alamat penerima','Order fees & delivery address')}</summary>${combinedSummary(o)}</details>`;
 return mobileFlowBaseDetail(o,tracking);
};
const mobileFlowBaseOrderTable=combinedOrderTable;
combinedOrderTable=function(rows,warehouse=false){
 const root=document.createElement('div');root.innerHTML=mobileFlowBaseOrderTable(rows,warehouse);
 if(warehouse||!mobileOrderListPages.has(state.page))return root.innerHTML;
 for(const o of rows){const card=[...root.querySelectorAll('[data-combined-order-row]')].find(el=>el.dataset.combinedOrderRow===o.id);if(!card||!isCombined(o))continue;
  const button=card.querySelector('[data-combined-open]');if(!button)continue;
  let target='fee',label=mt('查看复核进度','Lihat verifikasi','View review progress');
  if(mobileTrackingPages.has(state.page)||['shipped','delivered'].includes(o.status)){target='tracking';label=mt('查看物流','Lacak pengiriman','Track shipment')}
  else if(mobileCanPay(o)){target='payment';label=orderReceipt(o.id)?.status==='rejected'?mt('补交凭证','Lengkapi bukti','Resubmit receipt'):mt('去付款','Bayar sekarang','Go to payment')}
  else if(o.status==='awaiting_payment')label=mt('查看审核进度','Lihat pemeriksaan','View payment review');
  else if(['paid','ready_to_ship'].includes(o.status))label=mt('查看出货进度','Lihat pengiriman','View dispatch');
  button.removeAttribute('data-combined-open');button.dataset.h5OrderAction=o.id;button.dataset.h5OrderPage=target;button.innerHTML=label;if(target==='payment')button.classList.add('primary');
  if(mobileTrackingPages.has(state.page)){
   card.querySelector('.h5-list-fees')?.remove();card.querySelector('footer')?.remove();
   const cached=mobileFlow.trackingCache.get(o.id),event=cached?.version===o.updated_at?cached.events[0]:null;
   const at=o.delivered_at||o.tail_shipped_at||o.overseas_received_at||o.shipped_at||o.updated_at;
   card.insertAdjacentHTML('beforeend',`<p class="h5-tracking-preview">${event?translatedText(event.title):cs(o)}<small>${event?mt('最新节点','Pembaruan terbaru','Latest event'):mt('状态更新时间','Waktu pembaruan status','Status updated')} · ${esc(event?.occurredAt?dateText(event.occurredAt):dateText(at))}</small></p>`);
  }
 }return root.innerHTML;
};

function mobileSuccessPage(){
 const s=mobileFlow.success;if(!s)return ch('提交结果','Hasil pengiriman')+cb('返回首页','Kembali ke beranda','dashboard');
 if(s.kind==='order'&&state.dbOrders.some(o=>o.id===s.id)){combined.requestId=null;combined.draft={};workspace.selected.clear();mobileFlow.step=1}
 if(s.kind==='parcel')mobileFlow.pendingAdvice=null;
 return ch('提交成功','Berhasil dikirim')+`<section class="card h5-success"><span class="h5-success-mark" aria-hidden="true">✓</span><h2>${s.kind==='order'?mt('合包订单已提交','Pesanan gabungan terkirim','Consolidation submitted'):mt('包裹预报成功','Paket berhasil didaftarkan','Parcel declared')}</h2><p class="mono" data-user-content>${esc(s.number||'')}</p><p>${s.kind==='order'?mt('等待仓库收货、实测及费用复核，暂不付款。','Menunggu penerimaan, pengukuran dan verifikasi biaya. Belum perlu membayar.','Awaiting receipt, measurement and fee verification. No payment yet.'):mt('请在包裹面单注明会员号，并寄往深圳仓。','Cantumkan nomor anggota pada label paket dan kirim ke gudang Shenzhen.','Add your member number to the parcel label and send it to Shenzhen.')}</p><div class="h5-success-actions">${s.kind==='order'?`<button type="button" class="btn primary" data-h5-success-order>${mt('查看订单','Lihat pesanan','View order')}</button>`:`<button type="button" class="btn primary" id="h5CopyShenzhen">${mt('复制深圳仓地址','Salin alamat Shenzhen','Copy Shenzhen warehouse')}</button><button type="button" class="btn ghost" data-page="pre-advise">${mt('继续预报','Daftarkan lagi','Declare another')}</button>`}${cb('我的包裹','Paket saya','parcels')}</div></section>`;
}
const mobileFlowBaseView=combinedView;
combinedView=function(){if(state.role==='merchant'){if(state.page==='address-edit')return mobileAddressEditor();if(state.page==='payment')return mobilePaymentPage(state.dbOrders.find(o=>o.id===state.activeOrderId));if(state.page==='submission-success')return mobileSuccessPage()}return mobileFlowBaseView()};

function mobileBindFlows(){
 const form=$('#combinedRequest');if(form){
  $('.h5-heading-title').innerHTML=mt('申请合包','Gabungkan paket','Consolidate');
  const remember=()=>{rememberCombinedRequest();mobilePackingStep(mobileFlow.step,false)};
  form.oninput=form.onchange=remember;
  // The shared saved-address onchange still populates inputs before the bubbled form event.
  $('#h5StepPrevious').onclick=()=>mobilePackingStep(mobileFlow.step-1);
  $('#h5StepNext').onclick=()=>{rememberCombinedRequest();if(mobileValidatePacking(mobileFlow.step))mobilePackingStep(mobileFlow.step+1)};
  form.onsubmit=e=>{e.preventDefault();if(combined.busy)return;rememberCombinedRequest();
   if(!mobileValidatePacking(1)){mobilePackingStep(1);return}if(mobileFlow.step<3){if(mobileFlow.step===1||mobileValidatePacking(2))mobilePackingStep(mobileFlow.step+1);return}mobilePackingStep(2,false);if(!mobileValidatePacking(2))return;mobilePackingStep(3,false);
   combined.requestId??=crypto.randomUUID();
   const owner=mobileFlowOwner(),version=authFlow.syncVersion;
   return combinedSave(form,async()=>{const o=await rpcWorkspace('merchant_create_combined_order',{p_parcel_ids:[...workspace.selected],p_route_code:combined.draft.route,p_recipient:combined.draft.recipient,p_note:combined.draft.note,p_request_id:combined.requestId});if(owner!==mobileFlowOwner()||version!==authFlow.syncVersion)throw Error(uiText('登录状态已变化，请重新登录','Sesi berubah, masuk kembali','Session changed. Please sign in again.'));state.activeOrderId=o.id;mobileFlow.success={kind:'order',id:o.id,number:o.order_no};combined.filter='all'},'submission-success');
  };mobilePackingStep(mobileFlow.step,false);
 }
 const advice=$('#combinedAdvice');if(advice&&!advice.dataset.edit)advice.onsubmit=e=>{e.preventDefault();if(combined.busy)return;const number=$('#caTracking').value.trim(),item=$('#caItem').value.trim(),owner=mobileFlowOwner(),version=authFlow.syncVersion,key=JSON.stringify([owner,number,item]);return combinedSave(advice,async()=>{if(mobileFlow.pendingAdvice!==key)await rpcWorkspace('merchant_pre_advise',{p_tracking:number,p_item_name:item,p_carrier:null});if(owner!==mobileFlowOwner()||version!==authFlow.syncVersion)throw Error(uiText('登录状态已变化，请重新登录','Sesi berubah, masuk kembali','Session changed. Please sign in again.'));mobileFlow.pendingAdvice=key;combined.filter='all';mobileFlow.success={kind:'parcel',number}},'submission-success')};
 $('#h5AddAddress')?.addEventListener('click',()=>{workspace.editingAddress=null;mobileFlow.addressDraft=null;go('address-edit')});
 const address=$('#receiverForm');if(address&&state.page==='address-edit'){
  const draft=mobileFlow.addressDraft;if(draft&&draft.id===workspace.editingAddress)for(const [id,value]of Object.entries(draft.values))if($('#'+id))$('#'+id).value=value;
  address.oninput=()=>mobileFlow.addressDraft={id:workspace.editingAddress,values:mobileReadAddress()};
  address.onsubmit=e=>{e.preventDefault();return mobileSaveAddress(address)};
  if(mobileFlow.addressSaving)address.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
  $('#h5CancelAddress').onclick=()=>{workspace.editingAddress=null;mobileFlow.addressDraft=null;go('receivers')};
 }
 document.querySelectorAll('[data-h5-payment],[data-h5-order-action]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.h5Payment||b.dataset.h5OrderAction,o=state.dbOrders.find(o=>o.id===id);if(!o)return;
  if(mobileOrderListPages.has(state.page))mobile.orderReturnPage=state.page;
  applyDbOrder(o);workspace.supportOrderId=o.id;
  const page=b.dataset.h5Payment?'payment':b.dataset.h5OrderPage;if(page==='tracking')return loadSelectedOrderTracking(o.id,page);return go(page);
 });
 const payment=$('#paymentReceiptForm');if(payment&&state.page==='payment'){
  const actions=payment.querySelector('.form-actions');actions.classList.add('h5-flow-bar');
  if(!actions.querySelector('small'))actions.insertAdjacentHTML('afterbegin',`<small>${mt('提交后等待审核','Menunggu pemeriksaan setelah dikirim','Review follows submission')}</small>`);
 }
 if(state.page==='payment'&&paymentWorkspace.account){const a=paymentWorkspace.account,values=[['收款账号','Nomor rekening','Account number',a.account_number],['账户名称','Nama pemilik','Account holder',a.account_holder]];
  const total=$('.h5-pay-total');total?.insertAdjacentHTML('afterend',`<div class="h5-account-copy">${values.filter(x=>x[3]).map(([z,i,e,v])=>`<button type="button" class="btn ghost" data-h5-copy="${esc(v)}">${mt('复制'+z,'Salin '+i,'Copy '+e)}</button>`).join('')}</div>`);
 }
 $('[data-h5-success-order]')?.addEventListener('click',()=>{combined.requestId=null;return combinedOpen(mobileFlow.success.id)});
 $('#h5CopyShenzhen')?.addEventListener('click',()=>{const w=workspace.warehouses?.[0];if(!w){go('address');return}return mobileCopy(`${w.address}\n${w.contact_name||''} ${w.contact_phone||''}\n${state.auth.profile?.member_no||''}`)});
 mobileBindCopies();
 mobileFlowLabels();
 const flow=!!form||state.page==='address-edit'||state.page==='payment'&&!!payment;
 document.body.classList.toggle('h5-in-flow',flow);if(flow)$('#h5BottomNav')?.remove();
 if(form)$('#h5Back').onclick=()=>{if(mobileFlow.step>1)mobilePackingStep(mobileFlow.step-1);else go('parcels')};
 // The topbar owns titles and back navigation. Preserve useful header action buttons.
 document.querySelectorAll('#content .page-head h1,#content [data-combined-back-orders]').forEach(el=>el.hidden=true);
 document.querySelectorAll('#content .head-actions [data-page]').forEach(el=>{if(el.dataset.page===mobileParent())el.hidden=true});
}
const mobileFlowBaseRender=render;
render=function(){
 mobileResetFlows();
 const liveForm=$('#paymentReceiptForm'),liveOwner=mobileFlowOwner();
 if(liveForm&&liveForm.dataset.h5Owner===liveOwner&&mobileFlow.paymentDraft?.form!==liveForm)mobileFlow.paymentDraft={owner:liveOwner,order:liveForm.dataset.orderId,account:liveForm.dataset.accountVersion,form:liveForm};
 const cached=mobileFlow.paymentDraft;
 mobileFlowBaseRender();
 if(!state.auth.user||state.role!=='merchant'){document.body.classList.remove('h5-in-flow');return}
 const fresh=$('#paymentReceiptForm');
 if(fresh&&state.page==='payment'&&cached?.owner===liveOwner&&cached.order===fresh.dataset.orderId&&cached.account===fresh.dataset.accountVersion){fresh.replaceWith(cached.form)}
 else if(cached&&(!mobileCanPay(state.dbOrders.find(o=>o.id===cached.order))||cached.owner!==liveOwner||cached.account!==paymentWorkspace.account?.updated_at))mobileFlow.paymentDraft=null;
 if($('#paymentReceiptForm'))$('#paymentReceiptForm').dataset.h5Owner=liveOwner;
 mobileBindFlows();
};
