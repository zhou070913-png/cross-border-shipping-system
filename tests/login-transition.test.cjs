const {test}=require('node:test'),assert=require('node:assert/strict'),setup=require('../dev/combined-ui-harness.cjs');
function login(role='warehouse'){
 const h=setup();h.run(`
 state.auth.user=null;state.auth.profile=null;state.auth.role=null;state.auth.loginTargetRole='${role}';state.page='dashboard';state.dbOrders=[];
 signIns=0;signOuts=0;messages=[];views=[];
 window.MospaceSupabase={isConfigured:()=>true,
  signInWithIdentifier:async()=>{signIns++;await new Promise(r=>releaseSignIn=r);return {user:{id:'login-user'},session:{}}},
  signOut:async()=>{signOuts++},currentUser:async()=>({id:'login-user'}),
  currentProfile:async()=>({id:'login-user',role:'${role==='warehouse'?'warehouse_operator':role}',member_no:'TEST-LOGIN'}),
  myOrders:async()=>[],listAddresses:async()=>[],adminOrders:async()=>[],adminAuditLogs:async()=>[],getRoutePricing:async()=>null};
 loadMerchantWorkspace=async()=>{combined.ready=true};
 toast=msg=>messages.push(msg);const loginRender=render;render=()=>{views.push({page:state.page,user:state.auth.user?.id});loginRender()};render();views=[];
 `);
 h.document.querySelector('#loginIdentifier').value='TEST-LOGIN';h.document.querySelector('#loginPassword').value='testing-password';return h;
}
test('each role signs in once during repeated clicks, renders only its final dashboard and stays on the next page',async()=>{
 for(const role of ['merchant','warehouse','admin']){
  const {run,document}=login(role),pending=run('submitLandingAuth()');
  assert.equal(document.querySelector('#loginSubmit').disabled,true);assert.equal(document.querySelector('#loginSubmit').getAttribute('aria-busy'),'true');
  await run('submitLandingAuth()');await run('submitAuth()');assert.equal(run('signIns'),1);assert.equal(run('views.length'),0);assert.equal(run(`go('dashboard')`),false);
  run('releaseSignIn()');await pending;
  assert.equal(run('views.length'),1);assert.equal(run('state.role'),role);assert.equal(run('authFlow.busy'),false);assert.equal(document.querySelector('#appShell').classList.contains('login-mode'),false);
  assert.deepEqual(JSON.parse(run('JSON.stringify(messages)')),['登录成功']);
  const page=role==='warehouse'?'ship':role==='admin'?'orders':'parcels';run(`go('${page}',{role:'${role}'})`);await Promise.resolve();assert.equal(run('state.page'),page);assert.equal(run('messages.length'),1);
 }
});
test('failed login permits retry without losing credentials or emitting success',async()=>{
 const {run,document}=login();run(`window.MospaceSupabase.signInWithIdentifier=async()=>{signIns++;throw Error('Invalid password')}`);
 await run('submitLandingAuth()');assert.equal(run('authFlow.busy'),false);assert.equal(document.querySelector('#loginSubmit').disabled,false);assert.equal(document.querySelector('#loginPassword').value,'testing-password');assert.equal(run('views.length'),0);assert.match(run('messages[0]'),/登录失败/);
 run(`window.MospaceSupabase.signInWithIdentifier=async()=>{signIns++;return {user:{id:'login-user'}}}`);await run('submitLandingAuth()');assert.equal(run('signIns'),2);assert.equal(run(`messages.filter(m=>m==='登录成功').length`),1);assert.equal(run('views.length'),1);
});
test('one login entry routes by the server profile, ignoring stale role selection or member prefix',async()=>{
 for(const role of ['merchant','warehouse_operator','admin']){
  const {run,document}=login('merchant');run(`state.auth.loginTargetRole='warehouse';window.MospaceSupabase.currentProfile=async()=>({id:'login-user',role:'${role}',is_active:true})`);
  document.querySelector('#loginIdentifier').value='M-NOT-A-ROLE-ASSIGNMENT';
  assert.equal(document.querySelectorAll('[data-login-role]').length,0);assert.equal(document.querySelector('.login-roles'),null);assert.ok(document.querySelector('#desktopLoginForm'));
  const pending=run('submitLandingAuth()');run('releaseSignIn()');await pending;
  assert.equal(run('signOuts'),0);assert.equal(run('state.role'),role==='warehouse_operator'?'warehouse':role);assert.equal(run('views.length'),1);
  const forbidden=role==='merchant'?['warehouse','ship']:['merchant','parcels'];assert.equal(run(`go('${forbidden[1]}',{role:'${forbidden[0]}'})`),false);assert.equal(run('state.page'),'dashboard');
 }
});

test('missing, disabled or unsupported server profiles never enter a workbench and can retry',async()=>{
 for(const profile of [null,{role:'unexpected',is_active:true},{role:'admin',is_active:false}]){
  const {run,document}=login();run(`window.MospaceSupabase.currentProfile=async()=>(${JSON.stringify(profile)})`);
  const pending=run('submitLandingAuth()');run('releaseSignIn()');await pending;
  assert.equal(run('signOuts'),1);assert.equal(run('state.auth.user'),null);assert.equal(run('views.length'),0);assert.match(run('messages[0]'),/账号资料暂不可用/);assert.equal(document.querySelector('#loginSubmit').disabled,false);
 }
});

test('unified login text switches languages while keeping the entered credentials',()=>{
 const {run,document}=login();for(const lang of ['en','id','zh']){
  run(`setUiLanguage('${lang}')`);assert.equal(document.querySelector('#loginIdentifier').value,'TEST-LOGIN');assert.equal(document.querySelector('#loginPassword').value,'testing-password');assert.equal(document.querySelectorAll('[data-login-role]').length,0);
  if(lang!=='zh')assert.doesNotMatch(document.querySelector('.login-card>p').textContent,/[\u4e00-\u9fff]/);
 }
});
test('stale startup session restoration cannot replace a completed login or reset subsequent navigation',async()=>{
 const {run}=login();run(`window.MospaceSupabase.currentUser=()=>new Promise(r=>releaseStartup=r)`);const startup=run('syncAuth()');
 run(`window.MospaceSupabase.currentUser=async()=>({id:'login-user'})`);const pending=run('submitLandingAuth()');run('releaseSignIn()');await pending;
 run(`go('ship',{role:'warehouse'});releaseStartup(null)`);assert.equal(await startup,false);assert.equal(run('state.page'),'ship');assert.equal(run('state.auth.user.id'),'login-user');assert.equal(run('views.length'),2);assert.equal(run('messages.length'),1);
});
test('modal login also prevents duplicate requests and applies pending navigation in one render',async()=>{
 const {run,document}=login('merchant');run(`openAuth({role:'merchant'});state.auth.pending={page:'parcels',role:'merchant'}`);
 document.querySelector('#authIdentifier').value='TEST-LOGIN';document.querySelector('#authPassword').value='testing-password';const pending=run('submitAuth()');await run('submitAuth()');assert.equal(run('signIns'),1);run('releaseSignIn()');await pending;
 assert.equal(run('state.page'),'parcels');assert.equal(run('views.length'),1);assert.equal(document.querySelector('#authModal').hidden,true);assert.equal(run('messages.length'),1);
});
