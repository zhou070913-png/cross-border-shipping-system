/* One interface language at a time. Switching changes text only, never form data or business state. */
'use strict';
const uiLanguage={current:'zh',storageKey:'eaztrans-ui-language',attributes:new WeakMap()};
try{const saved=localStorage.getItem(uiLanguage.storageKey);if(['zh','en','id'].includes(saved))uiLanguage.current=saved}catch(e){}
const uiLangTag=()=>({zh:'zh-CN',en:'en',id:'id'})[uiLanguage.current];
function englishFor(text,id=''){
 const s=String(text);if(enLocale[s])return enLocale[s];
 let m;
 for(const [prefix,enPrefix]of [['操作失败：','Operation failed: '],['删除失败：','Delete failed: '],['发送失败：','Send failed: ']])if(s.startsWith(prefix)){const detail=s.slice(prefix.length);return enPrefix+(englishFor(detail)||detail)}
 if(s.endsWith('，列表刷新失败，请点击刷新数据'))return (englishFor(s.replace('，列表刷新失败，请点击刷新数据',''))||'Saved')+'. Unable to refresh the list. Click Refresh data.';
 const patterns=[
  [/^(\d+) 个客户 · (\d+) 个订单$/,(a,c,n)=>`${c} customers · ${n} orders`],
  [/^待尾程登记 (\d+) 单 · 运输中 (\d+) 单$/,(a,n,t)=>`${n} awaiting last-mile registration · ${t} in transit`],
  [/^共 (\d+) 个(订单|地址|包裹) · 显示 (\d+)–(\d+) 条 · 第 (\d+) \/ (\d+) 页$/,(a,n,type,from,to,page,pages)=>`${n} ${{订单:'orders',地址:'addresses',包裹:'parcels'}[type]} · showing ${from}–${to} · page ${page} / ${pages}`],
  [/^共 (\d+) 条记录 · 显示 (\d+)–(\d+) 条 · 第 (\d+) \/ (\d+) 页$/,(a,n,from,to,page,pages)=>`${n} records · showing ${from}–${to} · page ${page} / ${pages}`],
  [/^共 (\d+) 个客户 · 第 (\d+) \/ (\d+) 页$/,(a,n,page,pages)=>`${n} customers · page ${page} / ${pages}`],
  [/^(\d+) 个(包裹|订单)$/,(a,n,type)=>`${n} ${type==='包裹'?(n==='1'?'parcel':'parcels'):(n==='1'?'order':'orders')}`],
  [/^(\d+) 箱 · (.+) kg$/,(a,n,kg)=>`${n} cartons · ${kg} kg`],
  [/^待收货 (\d+) 个包裹$/,(a,n)=>`${n} parcels awaiting receipt`],
  [/^已收货 (\d+) 个包裹$/,(a,n)=>`${n} parcels received`],
  [/^合包订单 (\d+) 单$/,(a,n)=>`${n} consolidation orders`],
  [/^已核价金额 (.+)$/,(a,amount)=>`Confirmed fees ${amount}`],
  [/^待审核 (\d+) 笔 · 共 (\d+) 笔$/,(a,n,total)=>`${n} pending reviews · ${total} payment records`],
  [/^待回复 (\d+) 条 · 共 (\d+) 条$/,(a,n,total)=>`${n} awaiting reply · ${total} inquiries`],
  [/^待处理 (\d+) 单 · 运输中 (\d+) 单$/,(a,n,transit)=>`${n} pending · ${transit} in transit`],
  [/^本次筛选：(\d+) 个订单 · (\d+) 个包裹 · 已核价金额（CNY）(.+) · (\d+) 单待核价$/,(a,n,p,amount,pending)=>`Filtered: ${n} orders · ${p} parcels · confirmed total (CNY) ${amount} · ${pending} awaiting pricing`],
  [/^第 (\d+) 页$/,(a,n)=>`Page ${n}`],
  [/^第 (\d+) 组外箱$/,(a,n)=>`Carton group ${n}`],
  [/^(\d+) 条(?: \/ data)?$/,(a,n)=>`${n} items`],
  [/^(\d+)条 \/ 页$/,(a,n)=>`${n} per page`],
  [/^共 (\d+) 条 · 显示 (\d+)–(\d+) 条$/,(a,n,from,to)=>`${n} records · showing ${from}–${to}`],
  [/^共 (\d+) 个包裹 · 显示 (\d+)–(\d+) 个$/,(a,n,from,to)=>`${n} parcels · showing ${from}–${to}`],
  [/^(.+)（(\d+) 单）$/,(a,k,n)=>enLocale[k]?`${enLocale[k]} (${n} orders)`:null],
  [/^(待审核|已通过|需补充|全部)（(\d+)）$/,(a,k,n)=>`${enLocale[k]} (${n})`],
  [/^审核时间：(.*)$/,(a,t)=>`Reviewed at: ${t}`],
  [/^(\d{4}\/\d{1,2}\/\d{1,2}.*) · 测试$/,(a,t)=>`${t} · Test`],
  [/^审核 (.+)$/,(a,n)=>`Review ${n}`],
  [/^商家填写的流水：(.*)$/,(a,t)=>`Customer reference: ${enLocale[t]||t}`],
  [/^备注：(.*)$/,(a,t)=>`Note: ${t==='无'?'None':t}`],
  [/^测试 · (.+)$/,(a,t)=>`Test · ${enLocale[t]||t}`],
  [/^自动同步（每10秒）(.*)$/,(a,t)=>`Auto-sync (every 10 seconds)${t}`],
  [/^实时同步(.*)$/,(a,t)=>`Live sync${t}`],
  [/^正在同步进度.*$/,()=> 'Syncing progress…'],
  [/^自动同步已开启.*$/,()=> 'Auto-sync paused while editing'],
  [/^更新暂不可用.*$/,()=> 'Update unavailable. Retrying automatically'],
  [/^网络已断开.*$/,()=> 'Offline. Sync resumes when connected']
 ];
 for(const [re,fn]of patterns){m=s.match(re);if(m)return fn(...m)}
 // Explicit bilingual option/attribute strings are split at the known separator, not at slashes in addresses.
 const zh=splitUiPair(s);if(zh&&zh.zh!==s)return englishFor(zh.zh,zh.id);
 if(!/[\u4e00-\u9fff]/.test(s))return s;
 return null;
}
function splitUiPair(s){
 const match=String(s).match(/^(.+?[\u4e00-\u9fff].*?)\s+(?:·|\/)\s+([A-Za-z].*)$/);
 return match?{zh:match[1].trim(),id:match[2].trim()}:null;
}
function uiText(zh,id='',en=''){
 if(uiLanguage.current==='zh')return String(zh);
 if(uiLanguage.current==='id')return id||indonesianFor(String(zh))||String(zh);
 return en||englishFor(zh,id)||String(zh);
}
function localeMarkup(zh,id,en=''){
 const z=String(zh),i=String(id??''),e=en||englishFor(z,i)||'';
 return `<span class="bi" data-i18n data-zh="${esc(z)}" data-id="${esc(i)}" data-en="${esc(e)}" lang="${uiLangTag()}">${esc(uiText(z,i,e))}</span>`;
}
function knownUiPair(text){
 const s=String(text).trim();const split=splitUiPair(s);
 const id=indonesianFor(s);
 if(id)return {zh:s,id};
 if(split&&(indonesianFor(split.zh)||enLocale[split.zh]))return split;
 if(enLocale[s])return {zh:s,id:extraIndonesian[s]||s};
 let m=s.match(/^(\d+) 条(?: \/ data)?$/);if(m)return {zh:`${m[1]} 条`,id:`${m[1]} data`};
 return null;
}
const extraIndonesian={
 '登录成功':'Berhasil masuk','注册成功，已登录':'Akun dibuat. Berhasil masuk.','正在登录…':'Sedang masuk…',
 '商家填写的流水：':'Referensi pelanggan: ','备注：':'Catatan: ','无':'Tidak ada',
 '包裹预报已保存':'Informasi paket tersimpan','正在保存包裹，请稍候':'Menyimpan paket, mohon tunggu','正在保存付款资料，请稍候':'Menyimpan pembayaran, mohon tunggu','保存失败，请刷新核对后重试':'Gagal menyimpan. Muat ulang dan coba lagi','此包裹当前不能删除，请刷新后核对':'Paket ini belum dapat dihapus. Muat ulang dan periksa','未找到订单，请刷新列表':'Pesanan tidak ditemukan. Muat ulang daftar','物流节点读取失败，请刷新重试':'Gagal memuat riwayat. Muat ulang dan coba lagi','已退回凭证并通知商家':'Bukti dikembalikan dan pelanggan diberi tahu','凭证读取失败，请重新点击查看':'Gagal memuat bukti. Coba buka lagi','配置已保存，请刷新核对':'Pengaturan tersimpan. Muat ulang untuk memeriksa','收款配置已保存':'Pengaturan rekening tersimpan','工单已提交':'Tiket terkirim','回复已保存':'Balasan tersimpan','浏览器无法保存已读状态':'Gagal menyimpan status dibaca di peramban','请输入大于 0 的重量和尺寸':'Masukkan berat dan ukuran lebih besar dari nol',
 '印尼空运普货':'Udara Indonesia · barang umum','印尼海运普货':'Laut Indonesia · barang umum','印尼空运敏感货':'Udara Indonesia · barang sensitif','印尼海运敏感货':'Laut Indonesia · barang sensitif','印度尼西亚':'Indonesia','图片加载失败，请关闭后重新查看。':'Gagal memuat gambar. Tutup dan coba lagi.','测试凭证':'Bukti uji','转账凭证':'Bukti transfer',
 '核对并补交凭证即可，勿重复转账。':'Periksa dan lengkapi bukti. Jangan transfer lagi.',
 '语言':'Bahasa','中文':'Mandarin','英文':'Inggris','印尼语':'Indonesia','商家控制台':'Dasbor pelanggan',
 '至少 6 位':'Minimal 6 karakter','查询地址':'Cari alamat','查询客户':'Cari pelanggan','查询收货记录':'Cari riwayat penerimaan','查询订单':'Cari pesanan',
 '收件人 / 电话 / 城市 / 地址':'Penerima / telepon / kota / alamat','会员号 / 客户名称 / 单号':'Anggota / pelanggan / resi',
 '会员号 / 客户名称 / 快递单号 / 订单号':'Anggota / pelanggan / resi / pesanan','快递单号 / 品名 / 订单号':'Resi / isi paket / pesanan','快递单号 / 品名':'Resi / isi paket',
 '订单号 / 收件人 / 运单号':'Pesanan / penerima / resi','订单号 / 收件人 / 城市':'Pesanan / penerima / kota','M12345678 或 name@company.com':'M12345678 atau name@company.com',
 '测试客户 A':'Pelanggan uji A','测试客户 B':'Pelanggan uji B','测试仓库':'Gudang uji','测试运营':'Admin uji',
 '印尼空运':'Udara Indonesia','印尼海运':'Laut Indonesia','新地址':'Alamat baru','一般咨询':'Pertanyaan umum','没有匹配的地址':'Tidak ada alamat yang sesuai',
 '登记头程出货':'Catat pengiriman ke Indonesia','确认印尼仓到货':'Konfirmasi tiba di gudang Indonesia','登记尾程发货':'Catat pengiriman akhir','确认客户签收':'Konfirmasi diterima pelanggan',
 '待审核 / 付款记录':'Menunggu / bukti pembayaran','待回复 / 咨询记录':'Menunggu / pertanyaan','待处理 / 运输中':'Menunggu / dalam pengiriman',
 '没有匹配的收货记录':'Tidak ada riwayat yang sesuai','暂无已收货记录':'Belum ada riwayat penerimaan',
 '订单列表分页':'Halaman daftar pesanan','包裹列表分页':'Halaman daftar paket'
};
Object.assign(idLocale,extraIndonesian);
function ensureLanguageControl(){
 let el=document.getElementById('languageControl');
 if(!el){
  el=document.createElement('div');el.id='languageControl';el.className='language-control';el.dataset.languageControl='';
  el.innerHTML='<span aria-hidden="true">🌐</span><select id="uiLanguage" aria-label="语言"><option value="zh">中文</option><option value="en">English</option><option value="id">Bahasa Indonesia</option></select>';
  el.querySelector('select').onchange=e=>setUiLanguage(e.target.value);
 }
 const login=document.getElementById('appShell')?.classList.contains('login-mode'),host=login?document.body:document.querySelector('.top-actions')||document.body;
 if(el.parentElement!==host){if(host===document.body)host.append(el);else host.prepend(el)}
 el.classList.toggle('login-language-control',!!login);
 const select=el.querySelector('select');if(select.value!==uiLanguage.current)for(const option of select.querySelectorAll('option'))option.selected=option.value===uiLanguage.current;
 const label=uiText('语言','Bahasa','Language');if(select.getAttribute('aria-label')!==label)select.setAttribute('aria-label',label);
}
function updateUiElement(el){
 const text=uiText(el.dataset.zh,el.dataset.id,el.dataset.en);
 if(el.textContent!==text)el.textContent=text;
 if(el.getAttribute('lang')!==uiLangTag())el.setAttribute('lang',uiLangTag());
}
localizeKnownDom=function(root=document.body){
 if(!root)return;
 // Explicit page renders already localize synchronously. Do not observe our own text replacements.
 const observer=typeof localeMutationObserver==='undefined'?null:localeMutationObserver;observer?.disconnect();
 try{
 ensureLanguageControl();document.documentElement.lang=uiLangTag();
 const title=uiText('Eaztrans集运｜产品原型','Eaztrans Logistik · Demo','Eaztrans Logistics · Demo');if(document.title!==title)document.title=title;
 if(root.matches?.('[data-i18n][data-zh]'))updateUiElement(root);
 for(const el of root.querySelectorAll('[data-i18n][data-zh]'))updateUiElement(el);
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
 while(walk.nextNode())nodes.push(walk.currentNode);
 for(const n of nodes){
  const p=n.parentElement;if(!p||p.closest('[data-i18n],[data-user-content],[data-language-control],script,style,textarea,input,option'))continue;
  const text=n.textContent,trim=text.trim(),pair=knownUiPair(trim);if(!pair)continue;
  const holder=document.createElement('span');holder.innerHTML=localeMarkup(pair.zh,pair.id);n.replaceWith(holder.firstChild);
 }
 // Attribute sources are remembered separately; values, option values and user content are never translated.
 const attributeSelector='[placeholder],[aria-label],img[alt],option';
 for(const el of [...(root.matches?.(attributeSelector)?[root]:[]),...root.querySelectorAll(attributeSelector)]){
  if(el.closest('[data-user-content],[data-language-control]'))continue;
  let attrs=uiLanguage.attributes.get(el);if(!attrs){attrs={};uiLanguage.attributes.set(el,attrs)}
  for(const key of el.tagName==='OPTION'?['textContent']:['placeholder','aria-label','alt']){
   const current=key==='textContent'?el.textContent:el.getAttribute(key);if(current==null)continue;
   let record=attrs[key];if(!record||current!==record.output){const pair=knownUiPair(current);if(!pair)continue;record=attrs[key]={...pair,output:current}}
   const next=uiText(record.zh,record.id);
   if(next!==current){if(key==='textContent'){if(!el.hasAttribute('value'))el.setAttribute('value',el.value);el.textContent=next}else el.setAttribute(key,next)}
   record.output=next;
  }
 }
 }finally{observer?.observe(document.body,localeObserveOptions)}
};
function setUiLanguage(language){
 if(!['zh','en','id'].includes(language))return false;
 uiLanguage.current=language;try{localStorage.setItem(uiLanguage.storageKey,language)}catch(e){}
 localizeKnownDom();return true;
}

