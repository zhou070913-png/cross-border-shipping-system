/* Staff workflows: customer directory -> customer records -> individual action. */
'use strict';
const staffCustomers={owner:null,sections:{},orderReturn:null};
const staffSections={
 confirm:['合包与费用复核','Penggabungan dan verifikasi biaya'],
 ship:['出货与物流','Pengiriman dan pelacakan'],
 orders:['全部订单','Semua pesanan'],
 'payment-review':['付款审核','Verifikasi pembayaran'],
 'support-warehouse':['消息与客服','Pesan dan bantuan'],
 'support-admin':['消息与客服','Pesan dan bantuan']
};
function staffCustomerState(page=state.page){
 const owner=state.auth.user?.id+':'+state.role;
 if(staffCustomers.owner!==owner){staffCustomers.owner=owner;staffCustomers.sections={};staffCustomers.orderReturn=null}
 return staffCustomers.sections[page]??={customer:null,query:'',page:1,filter:'all',detailQuery:'',detailPage:1,size:10,paymentFilter:'pending'};
}
function staffCustomerBusy(){return combined.busy||paymentWorkspace.busy}
function staffCustomerGroups(){
 const groups=new Map(),ensure=id=>{
  if(!id)return null;
  if(!groups.has(id))groups.set(id,{id,member:'ID '+String(id).slice(-8),name:'',orders:[],parcels:[],tickets:[],receipts:[]});
  return groups.get(id);
 };
 for(const o of overallOrderRoots(state.dbOrders)){const c=ensure(o.merchant_id);if(c)c.orders.push(o)}
 for(const p of workspace.parcels){const c=ensure(p.merchant_id);if(c)c.parcels.push(p)}
 for(const t of workspace.tickets){const c=ensure(t.merchant_id);if(c)c.tickets.push(t)}
 for(const r of paymentWorkspace.receipts){const o=state.dbOrders.find(o=>o.id===r.order_id),c=ensure(o?.merchant_id);if(c)c.receipts.push(r)}
 const directory=[...(combined.pending||[]),...(combined.customers||[]),...(combined.profiles||[]).filter(p=>p.role==='merchant').map(p=>({...p,merchant_id:p.id}))];
 for(const p of directory){const c=groups.get(p.merchant_id);if(c){c.member=p.member_no||c.member;c.name=p.display_name||c.name}}
 return [...groups.values()].sort((a,b)=>a.member.localeCompare(b.member)||a.id.localeCompare(b.id));
}
function staffCustomerStage(o){const g=orderProgress(o).group;return g==='ready_to_ship'?'paid':g}
function staffCustomerOrderMatch(o,filter){return filter==='all'||staffCustomerStage(o)===filter}
function staffCustomerSearch(c,q){return [c.member,c.name,...c.parcels.flatMap(p=>[p.tracking_no,p.item_name]),...c.orders.flatMap(o=>[o.order_no,o.shipment_tracking_no,o.tail_tracking_no]),...c.tickets.map(t=>t.subject)].join(' ').toLowerCase().includes(q.toLowerCase())}
function staffCustomerRelevant(c,page,ctx){
 if(page==='payment-review')return c.receipts.some(r=>ctx.paymentFilter==='all'||r.status===ctx.paymentFilter);
 if(page.startsWith('support-'))return c.tickets.length>0;
 return c.orders.some(o=>staffCustomerOrderMatch(o,ctx.filter));
}
function staffCustomerLabel(c){return `<b>${raw(c.name||c.member)}</b>${c.name?'<br>'+raw(c.member):''}`}
function staffCustomerConfirmed(c){return c.orders.reduce((n,o)=>{const f=feeRecord(o);return n+(f?.confirmed_at&&f.total_amount!=null&&Number.isFinite(Number(f.total_amount))?Math.round(Number(f.total_amount)*100):0)},0)/100}
function staffCustomerHeader(c,page){return ch(...staffSections[page],`<button type="button" class="btn ghost" data-staff-customer-back>${bi('返回客户列表','Kembali ke daftar pelanggan')}</button>`)+`<div class="card combined-customer-summary"><h2>${staffCustomerLabel(c)}</h2><div class="combined-customer-metrics">${bi(`${c.orders.length} 个订单`,`${c.orders.length} pesanan`)}${bi(`已核价金额 ${money(staffCustomerConfirmed(c))}`,`Biaya terverifikasi ${money(staffCustomerConfirmed(c))}`)}</div></div>`}
function staffCustomerDirectory(page){
 const ctx=staffCustomerState(page),payment=page==='payment-review',support=page.startsWith('support-');
 const all=staffCustomerGroups(),rows=all.filter(c=>staffCustomerRelevant(c,page,ctx)&&staffCustomerSearch(c,ctx.query));
 const pages=Math.max(1,Math.ceil(rows.length/10));ctx.page=Math.max(1,Math.min(pages,ctx.page));
 const filters=payment?[['pending','待审核','Menunggu verifikasi'],['approved','已通过','Disetujui'],['rejected','需补充','Perlu dilengkapi'],['all','全部','Semua']]:support?[]:[['all','全部','Semua'],['pending','待合包 / 复核','Penggabungan / verifikasi'],['awaiting_payment','待付款 / 审核','Pembayaran'],['paid','待出货','Siap dikirim'],['shipped','运输中','Dalam pengiriman'],['delivered','已签收','Selesai']];
 return ch(...staffSections[page])+`<div class="workspace-tabs">${filters.map(([f,z,i])=>`<button type="button" data-staff-customer-filter="${f}" aria-pressed="${(payment?ctx.paymentFilter:ctx.filter)===f}" class="${(payment?ctx.paymentFilter:ctx.filter)===f?'active':''}">${bi(z,i)}</button>`).join('')}</div><div class="card"><h2>${bi('客户列表','Daftar pelanggan')}</h2><p>${bi('先选择客户，再查看该客户的订单、费用及处理记录。','Pilih pelanggan terlebih dahulu untuk melihat pesanan, biaya, dan riwayat penanganannya.')}</p><form id="staffCustomerSearch" class="workspace-toolbar"><input id="staffCustomerQuery" aria-label="查询客户 / Cari pelanggan" placeholder="会员号 / 客户名称 / 单号 · Anggota / pelanggan / resi" value="${esc(ctx.query)}"><button class="btn ghost">${bi('查询','Cari')}</button><button type="button" id="staffCustomerReset" class="btn ghost">${bi('重置','Atur ulang')}</button></form><div class="table-wrap"><table class="table combined-customer-table"><thead><tr>${[['客户 / 会员号','Pelanggan / anggota'],['全部订单数量','Jumlah seluruh pesanan'],[payment?'待审核 / 付款记录':support?'待回复 / 咨询记录':'待处理 / 运输中',payment?'Menunggu / bukti pembayaran':support?'Menunggu / pertanyaan':'Menunggu / dalam pengiriman'],['已核价金额（CNY）','Biaya terverifikasi (CNY)'],['操作','Tindakan']].map(([z,i])=>`<th>${bi(z,i)}</th>`).join('')}</tr></thead><tbody>${rows.slice((ctx.page-1)*10,ctx.page*10).map(c=>`<tr data-staff-customer-row="${esc(c.id)}"><td>${staffCustomerLabel(c)}</td><td>${c.orders.length}</td><td>${payment?bi(`待审核 ${c.receipts.filter(r=>r.status==='pending').length} 笔 · 共 ${c.receipts.length} 笔`,`Menunggu ${c.receipts.filter(r=>r.status==='pending').length} · total ${c.receipts.length}`):support?bi(`待回复 ${c.tickets.filter(t=>t.status==='open').length} 条 · 共 ${c.tickets.length} 条`,`Menunggu ${c.tickets.filter(t=>t.status==='open').length} · total ${c.tickets.length}`):bi(`待处理 ${c.orders.filter(o=>['pending','paid'].includes(staffCustomerStage(o))).length} 单 · 运输中 ${c.orders.filter(o=>staffCustomerStage(o)==='shipped').length} 单`,`Menunggu ${c.orders.filter(o=>['pending','paid'].includes(staffCustomerStage(o))).length} · dalam pengiriman ${c.orders.filter(o=>staffCustomerStage(o)==='shipped').length}`)}</td><td>${money(staffCustomerConfirmed(c))}</td><td><button type="button" class="btn ghost" data-staff-customer="${esc(c.id)}">${bi('客户详情','Rincian pelanggan')}</button></td></tr>`).join('')||`<tr><td colspan="5">${ce()}</td></tr>`}</tbody></table></div><div class="parcel-pagination"><span role="status">${bi(`共 ${rows.length} 个客户 · 第 ${ctx.page} / ${pages} 页`,`${rows.length} pelanggan · halaman ${ctx.page} / ${pages}`)}</span><div class="pagination-controls"><button type="button" class="btn ghost" data-staff-customer-page="${ctx.page-1}" ${ctx.page===1?'disabled':''}>${bi('上一页','Sebelumnya')}</button><button type="button" class="btn ghost" data-staff-customer-page="${ctx.page+1}" ${ctx.page===pages?'disabled':''}>${bi('下一页','Berikutnya')}</button></div></div></div>`+(support?`<details class="card section-space"><summary>${bi('客服联系方式与配置','Kontak dan pengaturan bantuan')}</summary>${combinedSupportContacts()}</details>`:'');
}
function staffCustomerView(page){
 const ctx=staffCustomerState(page);
 if(!ctx.customer)return staffCustomerDirectory(page);
 const c=staffCustomerGroups().find(c=>c.id===ctx.customer);
 if(!c)return ch(...staffSections[page],`<button class="btn ghost" data-staff-customer-back>${bi('返回客户列表','Kembali ke daftar pelanggan')}</button>`)+ce();
 const header=staffCustomerHeader(c,page);
 if(page==='payment-review'){paymentWorkspace.filter=ctx.paymentFilter;return header+staffPaymentReviewPrevious(c.id)}
 if(page.startsWith('support-'))return header+combinedSupport(c.id);
 workspace.orderQuery=ctx.detailQuery;combined.orderPage=ctx.detailPage;combined.orderPageSize=ctx.size;combined.warehouseFilter=ctx.filter;
 const html=combinedOrderList(true,c.id);ctx.detailPage=combined.orderPage;
 return header+html;
}
function staffCustomerDashboard(){
 const warehouse=state.role==='warehouse',groups=staffCustomerGroups();
 const links=warehouse?[['inbound','待收货客户','Pelanggan menunggu penerimaan',combined.pending.length],['confirm','待合包 / 复核客户','Pelanggan penggabungan / verifikasi',groups.filter(c=>c.orders.some(o=>staffCustomerStage(o)==='pending')).length],['ship','待出货客户','Pelanggan siap dikirim',groups.filter(c=>c.orders.some(o=>staffCustomerStage(o)==='paid')).length]]:[['payment-review','待审核付款客户','Pelanggan menunggu verifikasi',groups.filter(c=>c.receipts.some(r=>r.status==='pending')).length],['orders','有订单客户','Pelanggan dengan pesanan',groups.filter(c=>c.orders.length).length],['support-admin','有待回复客户','Pelanggan menunggu jawaban',groups.filter(c=>c.tickets.some(t=>t.status==='open')).length]];
 return ch(warehouse?'仓库工作台':'运营看板',warehouse?'Meja kerja gudang':'Dasbor admin')+`<div class="grid kpis">${links.map(([p,z,i,n])=>`<button type="button" class="card combined-kpi" data-staff-section="${p}" data-staff-filter="${p==='confirm'?'pending':p==='ship'?'paid':'all'}">${bi(z,i)}<strong>${n}</strong>${bi('选择客户处理','Pilih pelanggan')}</button>`).join('')}</div><h2>${bi('客户业务入口','Alur per pelanggan')}</h2><div class="combined-flow">${(warehouse?['inbound','confirm','ship','support-warehouse']:['orders','payment-review','support-admin']).map(p=>`<button type="button" class="btn ghost" data-staff-section="${p}">${bi(...(staffSections[p]||['收货管理','Kelola penerimaan']))}</button>`).join('')}</div>`+cn('按客户进入业务页面，详情中再操作具体订单或包裹。','Buka alur per pelanggan, lalu tangani pesanan atau paket di rinciannya.')+(!warehouse?`<div class="combined-flow">${cb('线路运价配置','Pengaturan tarif','config')}${cb('收款账户','Rekening penerimaan','receiving-config')}</div>`:'');
}
function staffLegacyDetail(){
 const o=state.order.record;
 const back=`<button type="button" class="btn ghost" data-staff-order-back>${bi('返回客户详情','Kembali ke rincian pelanggan')}</button>`;
 if(state.role==='warehouse')return overallOrderDetail().replace(/<button[^>]*data-page="dashboard"[^>]*>[\s\S]*?<\/button>/,back);
 return ch('历史订单详情','Rincian pesanan lama',back)+cn('历史订单保留原有分段费用及付款记录。','Pesanan lama mempertahankan biaya dan riwayat pembayaran per tahap.')+overallOrderLegs(overallOrderRoot(o)).map(leg=>`<div class="card section-space"><h2>${raw(leg.order_no)}</h2>${orderProgressHtml(leg)}<div class="metric">${bi('收件人 / 地址','Penerima / alamat')}<b>${raw(leg.recipient_name)} · ${raw(leg.destination_address)}</b></div><div class="metric">${bi('承运商 / 运单号','Kurir / resi')}<b>${raw(leg.shipment_carrier)} · ${raw(leg.shipment_tracking_no)}</b></div>${transportFeesHtml(feeRecord(leg))}${combinedReviewButton(leg)}</div>`).join('');
}
const staffViewPrevious=combinedView;
combinedView=function(){
 if(['warehouse','admin'].includes(state.role)){
  staffCustomerState();
  if(state.page==='overall-order'&&state.order.record&&!isCombined(state.order.record))return staffLegacyDetail();
  if(state.page==='dashboard')return staffCustomerDashboard();
  if(staffSections[state.page]&&(state.role==='admin'||['confirm','ship','support-warehouse'].includes(state.page)))return staffCustomerView(state.page);
 }
 return staffViewPrevious();
};
const staffPaymentReviewPrevious=adminPaymentReview;
adminPaymentReview=function(){return state.role==='admin'&&combined.ready?staffCustomerView('payment-review'):staffPaymentReviewPrevious()};
const staffDetailPrevious=combinedDetail;
combinedDetail=function(o,tracking=false){
 let html=staffDetailPrevious(o,tracking);const back=staffCustomers.orderReturn;
 if(html&&state.role!=='merchant'&&back&&back.customer===o?.merchant_id){
  html=html.replace(/<button[^>]*(?:data-combined-back-warehouse|data-page="(?:orders|inbound)")[^>]*>[\s\S]*?<\/button>/,`<button type="button" class="btn ghost" data-staff-order-back>${bi('返回客户详情','Kembali ke rincian pelanggan')}</button>`);
 }
 return html;
};
const staffOpenPrevious=combinedOpen;
combinedOpen=async function(id){
 const o=state.dbOrders.find(o=>o.id===id),ctx=staffCustomerState();
 if(state.page==='inbound')staffCustomers.orderReturn=null;
 if(state.role!=='merchant'&&staffSections[state.page]){
  if(!ctx.customer||o?.merchant_id!==ctx.customer)return;
  staffCustomers.orderReturn={page:state.page,customer:ctx.customer};
 }
 return staffOpenPrevious(id);
};
const staffOpenOverallPrevious=openOverallOrder;
openOverallOrder=async function(id){
 if(state.role==='merchant')return staffOpenOverallPrevious(id);
 if(staffCustomerBusy())return;
 const o=state.dbOrders.find(o=>o.id===id),ctx=staffCustomerState();
 if(!o)return;
 if(staffSections[state.page]){
  if(!ctx.customer||o.merchant_id!==ctx.customer)return;
  staffCustomers.orderReturn={page:state.page,customer:ctx.customer};
 }
 if(state.role==='warehouse')return staffOpenOverallPrevious(id);
 applyDbOrder(o);state.events=[];go('overall-order',{role:'admin'});
};
const staffOpenReviewPrevious=openPaymentReview;
openPaymentReview=function(id){
 if(state.role!=='admin'||staffCustomerBusy())return false;
 const r=paymentWorkspace.receipts.find(r=>r.id===id),o=r&&state.dbOrders.find(o=>o.id===r.order_id);
 if(!o)return false;
 const ctx=staffCustomerState('payment-review'),current=staffCustomerState();
 if(staffSections[state.page]&&current.customer&&o.merchant_id!==current.customer)return false;
 const previous={...ctx};ctx.customer=o.merchant_id;ctx.paymentFilter=r.status;
 const ok=staffOpenReviewPrevious(id);if(!ok)Object.assign(ctx,previous);return ok;
};
function staffEnterSection(page,filter=null){
 if(staffCustomerBusy())return;
 if(page==='inbound'){staffCustomers.orderReturn=null;combined.inboundCustomer=null;go(page,{role:state.role});return}
 const ctx=staffCustomerState(page);ctx.customer=null;staffCustomers.orderReturn=null;if(filter!==null){ctx.filter=filter;if(page==='payment-review')ctx.paymentFilter='pending';ctx.detailPage=1;ctx.page=1}
 if(page==='payment-review')paymentWorkspace.selected=null;
 go(page,{role:state.role});
}
const staffBindPrevious=bind;
bind=function(){
 staffBindPrevious();if(!['warehouse','admin'].includes(state.role)||!combined.ready)return;
 const page=state.page,ctx=staffCustomerState(page);
 for(const b of document.querySelectorAll('[data-staff-section]'))b.onclick=()=>staffEnterSection(b.dataset.staffSection,b.dataset.staffFilter??null);
 for(const b of document.querySelectorAll('[data-page]'))if(staffSections[b.dataset.page]&&b.closest('#nav')===null)b.onclick=()=>staffEnterSection(b.dataset.page);
 for(const b of document.querySelectorAll('#nav [data-page]'))if(staffSections[b.dataset.page]||b.dataset.page==='inbound')b.onclick=()=>staffEnterSection(b.dataset.page);
 for(const b of document.querySelectorAll('[data-staff-customer]'))b.onclick=()=>{
  if(staffCustomerBusy())return;ctx.customer=b.dataset.staffCustomer;ctx.detailQuery='';ctx.detailPage=1;document.getElementById('paymentProofDialog')?.remove();paymentWorkspace.selected=null;paymentWorkspace.filter=ctx.paymentFilter;render();
 };
 for(const b of document.querySelectorAll('[data-staff-customer-back]'))b.onclick=()=>{if(staffCustomerBusy())return;ctx.customer=null;document.getElementById('paymentProofDialog')?.remove();paymentWorkspace.selected=null;render()};
 for(const b of document.querySelectorAll('[data-staff-order-back]'))b.onclick=()=>{const back=staffCustomers.orderReturn;if(back&&!staffCustomerBusy())go(back.page,{role:state.role})};
 for(const b of document.querySelectorAll('[data-staff-customer-page]'))b.onclick=()=>{if(staffCustomerBusy()||b.disabled)return;ctx.page=Number(b.dataset.staffCustomerPage);render()};
 for(const b of document.querySelectorAll('[data-staff-customer-filter]'))b.onclick=()=>{if(staffCustomerBusy())return;ctx[page==='payment-review'?'paymentFilter':'filter']=b.dataset.staffCustomerFilter;ctx.page=1;render()};
 const search=$('#staffCustomerSearch');if(search)search.onsubmit=e=>{e.preventDefault();if(staffCustomerBusy())return;ctx.query=$('#staffCustomerQuery').value.trim();ctx.page=1;render()};
 const reset=$('#staffCustomerReset');if(reset)reset.onclick=()=>{if(staffCustomerBusy())return;ctx.query='';ctx.page=1;render()};
 if(!staffSections[page]||!ctx.customer)return;
 const orderSearch=$('#orderSearch');if(orderSearch)orderSearch.onsubmit=e=>{e.preventDefault();ctx.detailQuery=$('#orderSearchText').value.trim();ctx.detailPage=1;render()};
 const orderReset=$('#combinedOrderReset');if(orderReset)orderReset.onclick=()=>{ctx.detailQuery='';ctx.filter='all';ctx.detailPage=1;render()};
 for(const b of document.querySelectorAll('[data-combined-filter]'))b.onclick=()=>{if(staffCustomerBusy())return;ctx.filter=b.dataset.combinedFilter;ctx.detailPage=1;render()};
 for(const b of document.querySelectorAll('[data-combined-order-page]'))b.onclick=()=>{if(staffCustomerBusy()||b.disabled)return;ctx.detailPage=Number(b.dataset.combinedOrderPage);render()};
 const size=$('#combinedOrderPageSize');if(size)size.onchange=()=>{ctx.size=Number(size.value);ctx.detailPage=1;render()};
 for(const b of document.querySelectorAll('[data-payment-filter]'))b.onclick=()=>{if(staffCustomerBusy())return;ctx.paymentFilter=b.dataset.paymentFilter;paymentWorkspace.filter=ctx.paymentFilter;paymentWorkspace.selected=null;render()};
};
const staffNavPrevious=navActivePage;
navActivePage=function(page,role){
 if(page==='overall-order'&&role!=='merchant'&&staffCustomers.owner===state.auth.user?.id+':'+role&&staffCustomers.orderReturn)return staffCustomers.orderReturn.page;
 return staffNavPrevious(page,role);
};
