const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');
test('three language modes replace labels in place, preserve unsaved forms, selections, file controls and current workflow',()=>{
 const {run,document}=setup();run("state.page='receivers';state.addresses=[{id:'a',label:'我的包裹',recipient_name:'中文客户',recipient_phone:'TEST',city:'Jakarta',address_line:'客户原文地址'}];render()");
 const form=document.querySelector('#receiverForm'),input=document.querySelector('#receiverName');input.value='尚未保存的客户姓名';const line=document.querySelector('#receiverLine');line.value='UNSAVED ADDRESS';
 const before=run('JSON.stringify([state.page,state.activeOrderId,state.addresses,addressList.page,workspace.editingAddress])');
 const file=document.createElement('input');file.type='file';form.append(file);const check=document.createElement('input');check.type='checkbox';check.checked=true;form.append(check);
 for(const [language,title]of [['en','Addresses'],['id','Kelola alamat'],['zh','地址管理']]){
  assert.equal(run(`setUiLanguage('${language}')`),true);
  assert.equal(document.querySelector('h1').textContent,title);assert.equal(document.documentElement.lang,{en:'en',id:'id',zh:'zh-CN'}[language]);
  assert.equal(document.querySelector('#receiverForm'),form);assert.equal(document.querySelector('#receiverName'),input);assert.equal(input.value,'尚未保存的客户姓名');assert.equal(line.value,'UNSAVED ADDRESS');assert.equal(file.parentElement,form);assert.equal(check.checked,true);
  assert.equal(document.querySelector('[data-address-row] h3').textContent,'我的包裹');
  assert.equal(run('JSON.stringify([state.page,state.activeOrderId,state.addresses,addressList.page,workspace.editingAddress])'),before);
  assert.equal(document.querySelectorAll('#languageControl').length,1);
 }
 assert.equal(run("setUiLanguage('invalid')"),false);
});
test('options and accessible labels follow selected language while submitted option values remain unchanged',()=>{
 const {run,document}=setup();run("state.page='packing-request';workspace.parcels=[{id:'p',status:'pre_advised',tracking_no:'TEST',item_name:'原始品名'}];render();setUiLanguage('en')");
 const select=document.querySelector('#crRoute');const options=[...select.options],values=options.map(o=>o.value);assert.equal(options[0].textContent,'Indonesia air freight');assert.equal(options[1].textContent,'Indonesia sea freight');
 options[1].selected=true;run("setUiLanguage('id')");assert.equal(select.value,'ID-SEA');assert.deepEqual([...select.options].map(o=>o.value),values);assert.equal(select.options[1].textContent,'Laut Indonesia');
 run("state.page='receivers';render();setUiLanguage('en')");assert.equal(document.querySelector('#addressListQuery').getAttribute('aria-label'),'Search addresses');assert.equal(document.querySelector('#addressListQuery').getAttribute('placeholder'),'Recipient / phone / city / address');
});
test('dynamic counters, newly rendered pages and notifications use the active language without translating user data',()=>{
 const {run,document}=setup();run("setUiLanguage('en');state.page='receivers';state.addresses=Array.from({length:12},(_,n)=>({id:'a'+n,label:'用户标签',recipient_name:'原文客户'}));render()");
 assert.match(document.querySelector('#combinedAddressList').textContent,/12 addresses · showing 1–10 · page 1 \/ 2/);
 document.querySelector('[data-address-page="2"]').onclick();run('localizeKnownDom()');assert.match(document.querySelector('#combinedAddressList').textContent,/12 addresses · showing 11–12 · page 2 \/ 2/);
 run("toast('操作已保存')");assert.equal(document.querySelector('#toast').textContent,'Changes saved');
 run("setUiLanguage('id');toast('订单状态已变化，请刷新后重新核对')");assert.equal(document.querySelector('#toast').textContent,'Status pesanan berubah. Muat ulang dan periksa kembali');
 assert.match(run("localeMarkup('<img src=x onerror=alert(1)>','TEST','TEST')"),/data-zh="&lt;img/);assert.equal(document.querySelectorAll('img').length,0);
});
test('language preference persists across page reloads and storage failure does not block switching',()=>{
 const {run}=setup();run("savedLanguage=null;localStorage.setItem=(k,v)=>{savedLanguage=[k,v]};setUiLanguage('en')");assert.equal(run("savedLanguage.join(':')"),'eaztrans-ui-language:en');
 const fs=require('node:fs'),vm=require('node:vm'),code=fs.readFileSync(require('node:path').join(__dirname,'../locale-switch.js'),'utf8');
 const loaded=vm.createContext({localStorage:{getItem:()=> 'id'},idLocale:{},toast:()=>{},localizeKnownDom:()=>{}});vm.runInContext(code,loaded);assert.equal(vm.runInContext('uiLanguage.current',loaded),'id');
 run("localStorage.setItem=()=>{throw Error('disabled')};setUiLanguage('id')");assert.equal(run('uiLanguage.current'),'id');
});
test('language control is available before login and all three role views have English and Indonesian UI copy',()=>{
 const {run,document}=setup();run("state.auth.user=null;render();setUiLanguage('en')");assert.ok(document.querySelector('#languageControl.login-language-control'));assert.equal(document.querySelector('#languageControl select').getAttribute('aria-label'),'Language');
 assert.deepEqual(require('../dev/audit-combined-locale.cjs')(),[]);
});
test('saved addresses, payment details and deletion prompts preserve customer content in all languages',()=>{
 const {run,document}=setup();
 run("state.addresses=[{id:'a',recipient_name:'我的包裹',address_line:'地址管理',city:'Jakarta'}];workspace.parcels=[{id:'p',status:'pre_advised',tracking_no:'TEST',item_name:'原始品名'}];state.page='packing-request';render()");
 const address=document.querySelector('#crSaved option[value="a"]');assert.ok(address);const original=address.textContent;
 for(const lang of ['en','id','zh']){run(`setUiLanguage('${lang}')`);assert.equal(address.textContent,original);assert.equal(address.value,'a')}
 run("state.role='admin';paymentWorkspace.receipts=[{id:'r',order_id:'o',status:'approved',amount:108,currency:'CNY',payer_name:'我的包裹',transfer_reference:'地址管理',merchant_note:'我的订单',review_note:'运输计算器',account_snapshot:{bank_name:'客户列表',account_holder:'消息与客服',account_number:'TEST'}}];paymentWorkspace.selected='r';document.querySelector('#content').innerHTML=transportAdminReview()");
 const protectedText=[...document.querySelectorAll('#content [data-user-content]')].map(el=>el.textContent);
 assert.ok(protectedText.includes('我的订单'));assert.ok(protectedText.includes('运输计算器'));
 for(const lang of ['en','id','zh']){run(`setUiLanguage('${lang}')`);assert.deepEqual([...document.querySelectorAll('#content [data-user-content]')].map(el=>el.textContent),protectedText);const prompt=run("parcelDeleteConfirmation({tracking_no:'TEST-我的包裹',item_name:'地址管理'})");assert.ok(prompt.includes('TEST-我的包裹'));assert.ok(prompt.includes('地址管理'));if(lang==='en')assert.match(prompt,/Delete/)}
});
