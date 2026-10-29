const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');
function registration(mode='otp'){
 const h=setup();h.run(`state.auth.user=null;state.auth.role=null;state.auth.mode='signup';state.auth.pendingRole='merchant';state.auth.pending={page:'parcels',role:'merchant'};requests=0;verifications=[];notices=[];views=0;toast=m=>notices.push(m);
 window.MospaceSupabase={isConfigured:()=>true,registrationVerificationMode:()=> '${mode}',signUp:async()=>{requests++;return {user:{identities:[{}]},session:null}},resendConfirmation:async()=>{requests++},verifyRegistrationCode:async(email,token)=>{verifications.push([email,token]);return {session:{}}},signInWithIdentifier:async()=>{requests++;return {session:{}}}};
 continuePendingNavigation=async()=>{state.auth.user={id:'verified'};return true};render=()=>{views++};openAuth();`);
 h.document.querySelector('#authIdentifier').value='TEST@EXAMPLE.COM';h.document.querySelector('#authPassword').value='test-password';return h;
}
test('OTP registration stays in verification step without granting access or retaining password, then enters once',async()=>{
 const {run,document}=registration();await run('submitAuth()');
 assert.equal(run('registration.email'),'test@example.com');assert.equal(run('state.auth.user'),null);assert.equal(run('views'),0);assert.equal(document.querySelector('#authModal').hidden,false);assert.equal(document.querySelector('#authCodeField').hidden,false);assert.equal(document.querySelector('#authPassword').value,'');assert.equal(document.querySelector('#authResend').disabled,true);
 document.querySelector('#authCode').value='123456';await run('submitAuth()');assert.equal(run('verifications.length'),1);assert.equal(run('verifications[0].join(":")'),'test@example.com:123456');assert.equal(run('views'),1);assert.equal(document.querySelector('#authModal').hidden,true);assert.equal(document.querySelector('#authCode').value,'');assert.equal(run('notices.length'),1);
});
test('malformed and expired codes never enter a workbench and allow retry',async()=>{
 const {run,document}=registration();await run('submitAuth()');document.querySelector('#authCode').value='abc123';await run('submitAuth()');assert.equal(run('verifications.length'),0);
 run(`window.MospaceSupabase.verifyRegistrationCode=async()=>{throw {code:'otp_expired'}}`);document.querySelector('#authCode').value='12345678';await run('submitAuth()');assert.match(run('notices.at(-1)'),/无效或已过期/);assert.equal(run('views'),0);assert.equal(run('authFlow.busy'),false);assert.equal(document.querySelector('#authSubmit').disabled,false);
 run(`window.MospaceSupabase.verifyRegistrationCode=async()=>({session:null})`);await run('submitAuth()');assert.equal(run('views'),0);assert.equal(run('state.auth.user'),null);
});
test('registration and verification prevent repeated requests while in flight; resend uses a cooldown and clears the old code',async()=>{
 const {run,document}=registration();run(`window.MospaceSupabase.signUp=async()=>{requests++;return new Promise(r=>release=r)}`);const pending=run('submitAuth()');await run('submitAuth()');assert.equal(run('requests'),1);run('release({session:null})');await pending;
 await run('resendRegistration()');assert.equal(run('requests'),1);run(`registration.deadlines.set(registration.email,0)`);document.querySelector('#authCode').value='123456';await run('resendRegistration()');assert.equal(run('requests'),2);assert.equal(document.querySelector('#authCode').value,'');assert.equal(document.querySelector('#authResend').disabled,true);
 run(`registration.deadlines.set(registration.email,0);window.MospaceSupabase.resendConfirmation=async()=>{throw {status:429}}`);await run('resendRegistration()');assert.match(run('notices.at(-1)'),/频繁/);assert.equal(run('views'),0);
});
test('link fallback never asks for an unavailable code, keeps signup open, and checks password after verification',async()=>{
 const {run,document}=registration('link');await run('submitAuth()');assert.equal(document.querySelector('#authCodeField').hidden,true);assert.match(document.querySelector('#authSubmit').textContent,/已验证/);assert.equal(document.querySelector('#authModal').hidden,false);
 run(`window.MospaceSupabase.signInWithIdentifier=async()=>{throw {code:'email_not_confirmed'}}`);await run('submitAuth()');assert.match(run('notices.at(-1)'),/尚未验证/);assert.equal(run('views'),0);
 run(`window.MospaceSupabase.signInWithIdentifier=async()=>({session:{}})`);await run('submitAuth()');assert.equal(run('views'),1);assert.equal(document.querySelector('#authPassword').value,'');
});
test('registration validation, cancellation and language switching preserve verification identity without storing passwords',async()=>{
 const {run,document}=registration();document.querySelector('#authIdentifier').value='bad-email';await run('submitAuth()');assert.equal(run('requests'),0);
 document.querySelector('#authIdentifier').value='test@example.com';await run('submitAuth()');document.querySelector('#authCode').value='123456';
 for(const lang of ['en','id','zh']){run(`setUiLanguage('${lang}');updateAuthMode()`);assert.equal(document.querySelector('#authIdentifier').value,'test@example.com');assert.equal(document.querySelector('#authCode').value,'123456');if(lang!=='zh')assert.doesNotMatch(document.querySelector('#authSignupNote').textContent,/[\u4e00-\u9fff]/)}
 run('closeAuth()');assert.equal(document.querySelector('#authCode').value,'');assert.equal(document.querySelector('#authPassword').value,'');run('openAuth()');assert.equal(document.querySelector('#authCodeField').hidden,false);
 run(`state.auth.mode='login';updateAuthMode()`);assert.equal(run('registration.sent'),false);assert.equal(document.querySelector('#authCodeField').hidden,true);assert.equal(document.querySelector('#authIdentifier').readOnly,false);
});
test('adapter sends explicit full Pages return path and verifies code through Supabase rather than a client comparison',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let signup,verification;
 const w={location:{origin:'https://example.github.io',pathname:'/latest/'},supabase:{createClient:()=>({auth:{signUp:async p=>{signup=p;return {data:{session:null}}},verifyOtp:async p=>{verification=p;return {data:{session:{}}}}}})}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../supabase-client.js'),'utf8'),{window:w});
 await w.MospaceSupabase.signUp('test@example.com','test-password');assert.equal(signup.options.emailRedirectTo,'https://example.github.io/latest/');await w.MospaceSupabase.verifyRegistrationCode('test@example.com','12345678');assert.deepEqual(JSON.parse(JSON.stringify(verification)),{email:'test@example.com',token:'12345678',type:'email'});assert.equal(w.MospaceSupabase.registrationVerificationMode(),'link');
});

test('initial script parsing does not invoke language markup before the language module is loaded',()=>{
 const fs=require('node:fs'),vm=require('node:vm');let callback,observed=0,walked=0;
 const context=vm.createContext({toast:()=>{},loginPage:()=>'',NodeFilter:{SHOW_TEXT:4},document:{body:{},createTreeWalker:()=>{walked++;return {nextNode:()=>false}}},MutationObserver:class{constructor(fn){callback=fn}disconnect(){}observe(){observed++}}});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../bilingual-workspace.js'),'utf8'),context);
 assert.doesNotThrow(()=>callback());assert.equal(walked,0);vm.runInContext('function localeMarkup(){return ""}',context);callback();assert.equal(walked,1);assert.equal(observed,3);
});

test('confirmation return displays success only for a server-verified confirmed user, not a URL marker or existing unverified user',async()=>{
 for(const kind of ['confirmed','unconfirmed','none','expired']){
  const {run,document}=setup();run(`
   state.auth.user=null;state.auth.role=null;state.auth.profile=null;state.page='dashboard';state.dbOrders=[];
   registrationReturn.pending=true;registrationReturn.error=${kind==='expired'?"'otp_expired'":'null'};
   returnUser=${kind==='none'?'null':`{id:'verified-user',email_confirmed_at:${kind==='unconfirmed'?'null':"'2026-10-29T09:14:00Z'"}}`};
   clearedUrl=null;window.location={pathname:'/latest/',search:'?v=TEST'};window.history={replaceState:(a,b,url)=>{clearedUrl=url}};
   window.MospaceSupabase={isConfigured:()=>true,currentUser:async()=>returnUser,currentProfile:async()=>({id:'verified-user',role:'merchant'}),myOrders:async()=>[],listAddresses:async()=>[]};loadMerchantWorkspace=async()=>{};
  `);
  await run('syncAuth()');const panel=document.querySelector('#registrationResult');assert.ok(panel);
  if(kind==='confirmed'){assert.match(panel.textContent,/邮箱验证成功，注册已完成/);run("setUiLanguage('en')");assert.match(panel.textContent,/Email verified/)}
  else {assert.doesNotMatch(panel.textContent,/注册已完成/);assert.match(panel.textContent,kind==='expired'?/已失效或已使用/:/暂时无法确认/)}
  assert.equal(run('clearedUrl'),'/latest/?v=TEST');panel.querySelector('button').onclick();assert.equal(document.querySelector('#registrationResult'),null);run('render()');assert.equal(document.querySelector('#registrationResult'),null);
 }
});

test('return parsing retains no credentials or raw descriptions and never treats a generic successful page as verification',()=>{
 const {run}=setup();
 const info=run(`JSON.stringify(registrationReturnInfo({hash:'#access_token=PRIVATE&refresh_token=PRIVATE&type=signup',search:''}))`);
 assert.deepEqual(JSON.parse(info),{pending:true,error:null});assert.ok(!info.includes('PRIVATE'));
 assert.equal(run(`registrationReturnInfo({hash:'',search:'?success=true'}).pending`),false);
 assert.equal(run(`registrationReturnInfo({hash:'#error=access_denied&error_code=otp_expired&error_description=PRIVATE'}).error`),'otp_expired');
});
