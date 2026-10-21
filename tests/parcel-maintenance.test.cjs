const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const elements=new Map([['crumb',{textContent:''}],['workspaceGlobalRefresh',{}]]),groups=new Map();
  const context=vm.createContext({console,setTimeout,clearTimeout,window:{MospaceSupabase:{isConfigured:()=>true}},document:{
    querySelector:s=>elements.get(s.replace(/^#/,''))||null,getElementById:id=>elements.get(id)||null,querySelectorAll:s=>groups.get(s)||[]
  },localStorage:{getItem:()=>null},URL,Blob,messages:[],calls:[],refreshes:[]});
  const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state ='));
  const run=s=>vm.runInContext(s,context);
  run(inline);run('bind=()=>{};render=()=>{};toast=m=>messages.push(m)');
  run(fs.readFileSync(path.join(root,'merchant-workspace.js'),'utf8'));
  run(`state.role='merchant';state.auth={user:{id:'merchant'},role:'merchant'};state.dbOrders=[];
    workspace.owner='merchant';workspace.parcels=[{id:'pending',tracking_no:'TRACK-001',item_name:'测试商品',carrier:'快递',status:'pre_advised',updated_at:'2026-10-21T00:00:00Z'}];
    workspace.editParcelId='pending';refreshDbState=async p=>{refreshes.push(p);return true};
    window.MospaceSupabase.getClient=()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='merchant_edit_parcel'?{id:args.p_parcel_id}:args.p_parcel_id,error:null}}});`);
  return {run,context,elements,groups};
}
test('only untouched unlinked pre-advised parcels expose edit and delete in list and detail',()=>{
  const {run}=setup();
  for(const view of ['merchantParcels()','merchantParcelDetail()']){
    run("workspace.detailParcelId='pending'");
    assert.ok(run(view).includes('data-edit-parcel="pending"'));
    assert.ok(run(view).includes('data-delete-parcel="pending"'));
  }
  for(const fields of ["status:'received'","status:'shipped'","received_at:'2026-10-21'",'actual_weight_kg:0','length_cm:10']){
    const {run:r}=setup();r(`Object.assign(workspace.parcels[0],{${fields}})`);
    assert.ok(!r('merchantParcels()').includes('data-delete-parcel='));
  }
  run("state.dbOrders=[{id:'order',status:'submitted',order_parcels:[{parcel_id:'pending'}]}]");
  assert.ok(!run('merchantParcels()').includes('data-edit-parcel='));
});
test('edit page escapes user data, exposes only editable fields, and remains under parcel navigation',()=>{
  const {run}=setup();run("workspace.parcels[0].item_name='<img src=x onerror=alert(1)>'");
  const html=run('merchantParcelEdit()');
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('editParcelTracking'));
  assert.ok(!html.includes('actual_weight_kg'));
  assert.equal(run("navActivePage('parcel-edit','merchant')"),'parcels');
  assert.equal(run("pageRoles['parcel-edit']"),'merchant');
});
test('edit sends the correct record/version and refreshes the database before reporting success',async()=>{
  const {run,context}=setup();
  await run("maintainParcel('pending','edit',{p_tracking:'NEW-001',p_item_name:'新商品',p_carrier:'新快递'})");
  assert.equal(context.calls[0].name,'merchant_edit_parcel');
  assert.equal(context.calls[0].args.p_parcel_id,'pending');
  assert.equal(context.calls[0].args.p_expected_updated_at,'2026-10-21T00:00:00Z');
  assert.equal(context.calls[0].args.p_tracking,'NEW-001');
  assert.deepEqual(context.refreshes,['parcels']);
  assert.ok(context.messages.includes('修改已保存'));
  assert.equal(run('workspace.parcelBusy'),false);
});
test('cancel deletion sends no request; confirm identifies the parcel and removes stale selections',async()=>{
  const {run,context,groups}=setup(),el={dataset:{deleteParcel:'pending'}};
  groups.set('[data-delete-parcel]',[el]);
  let prompt='';context.window.confirm=text=>{prompt=text;return false};
  run('bind();workspace.selected.add("pending")');await el.onclick();
  assert.ok(prompt.includes('TRACK-001'));
  assert.ok(prompt.includes('测试商品'));
  assert.equal(context.calls.length,0);
  context.window.confirm=()=>true;await el.onclick();
  assert.equal(context.calls[0].name,'merchant_delete_parcel');
  assert.equal(run('workspace.selected.size'),0);
  assert.ok(context.messages.includes('包裹已删除'));
});
test('RPC rejection and refresh failure do not produce misleading success',async()=>{
  const {run,context}=setup();
  run("rpcWorkspace=async()=>{throw Error('包裹已入库')}");
  await assert.rejects(run("maintainParcel('pending','delete')"),/已入库/);
  assert.equal(context.refreshes.length,0);
  assert.equal(context.messages.length,0);
  assert.equal(run('workspace.parcelBusy'),false);
  run("rpcWorkspace=async()=>({id:'pending'});refreshDbState=async()=>false");
  await run("maintainParcel('pending','edit')");
  assert.ok(context.messages.some(m=>m.includes('已保存')&&m.includes('刷新失败')));
});
test('in-flight mutation blocks duplicate requests/navigation and rejects non-merchant entry',async()=>{
  const {run,context}=setup();
  run("rpcWorkspace=()=>{calls.push('first');return new Promise(r=>release=r)}");
  const pending=run("maintainParcel('pending','delete')");
  await run("maintainParcel('pending','delete')");
  assert.equal(context.calls.length,1);
  assert.equal(run("go('orders')"),false);
  run("release('pending')");await pending;
  run("state.auth.role='warehouse_operator'");
  await assert.rejects(run("maintainParcel('pending','edit')"));
});
