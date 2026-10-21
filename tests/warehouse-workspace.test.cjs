const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const root=path.join(__dirname,'..');
  const context=vm.createContext({console,setTimeout,clearTimeout,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:()=>({textContent:''}),querySelectorAll:()=>[]},localStorage:{getItem:()=>null},URL,Blob});
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const inline=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state ='));
  vm.runInContext(inline,context);
  for(const f of ['merchant-workspace.js','warehouse-workspace.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context);
  vm.runInContext(`render=()=>{};toast=message=>testMessages.push(message);state.role='warehouse';state.auth={user:{id:'qa'},role:'warehouse_operator'};state.dbOrders=[];`,Object.assign(context,{testMessages:[]}));
  return {context,run:s=>vm.runInContext(s,context)};
}
test('all warehouse orders and stage counts are independent of the selected order',()=>{
  const {run}=setup();
  run(`state.dbOrders=['submitted','submitted','warehouse_received','awaiting_payment','paid','paid','ready_to_ship','shipped'].map((status,i)=>({id:'id-'+i,order_no:'ORDER-'+i,status,parcel_count:1,order_parcels:[]}));applyDbOrder(state.dbOrders[7]);`);
  const html=run('warehouseDashboard()');
  for(let i=0;i<8;i++)assert.ok(html.includes('ORDER-'+i));
  assert.ok(run("warehouseQueue('packing')").includes('（2 单）'));
  assert.ok(run("warehouseQueue('confirm')").includes('（1 单）'));
});
test('completed measurements do not imply confirmed fees for a received order',()=>{
  const {run}=setup();
  run(`const o={id:'a',order_no:'A',status:'warehouse_received',parcel_count:1,order_parcels:[{parcel_id:'p',parcels:{id:'p',parcel_no:'P',actual_weight_kg:2,length_cm:20,width_cm:10,height_cm:10}}]};state.dbOrders=[o];applyDbOrder(o);warehouseWorkspace.selectedId='a';`);
  assert.ok(run('warehouseConfirm()').includes('id="confirmBtn"'));
});
test('confirmation saves the selected ID, exits the queue, and removes repeat confirmation',async()=>{
  const {context,run}=setup();
  run(`state.dbOrders=[{id:'old',order_no:'OLD',status:'submitted',order_parcels:[]},{id:'chosen',order_no:'CHOSEN',status:'warehouse_received',order_parcels:[]}];applyDbOrder(state.dbOrders[1]);warehouseWorkspace.selectedId='chosen';refreshDbState=async()=>{applyDbOrder(state.dbOrders.find(o=>o.id===state.activeOrderId));return true};`);
  context.saved=[];
  await run(`warehouseSave({disabled:false,textContent:''},async id=>{saved.push(id);state.dbOrders.find(o=>o.id===id).status='awaiting_payment'},'confirm',['awaiting_payment'],'完成')`);
  assert.deepEqual(context.saved,['chosen']);
  assert.equal(run('state.order.dbId'),'chosen');
  assert.ok(!run('warehouseConfirm()').includes('id="confirmBtn"'));
  assert.ok(run("warehouseQueue('confirm')").includes('（0 单）'));
  assert.equal(run('state.dbOrders[0].status'),'submitted');
});
test('save failure and stale refresh never report success',async()=>{
  for(const failure of ['rpc','refresh']){
    const {context,run}=setup();
    run(`state.dbOrders=[{id:'a',order_no:'A',status:'warehouse_received',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';refreshDbState=async()=>false;`);
    await run(`warehouseSave({disabled:false,textContent:''},async()=>{${failure==='rpc'?"throw Error('接口失败')":''}},'confirm',['awaiting_payment'],'成功')`);
    assert.ok(!context.testMessages.includes('成功'));
    assert.equal(run('warehouseWorkspace.busy'),false);
  }
});
test('duplicate submission and navigation are blocked during an in-flight save',async()=>{
  const {context,run}=setup();context.calls=0;
  run(`state.dbOrders=[{id:'a',order_no:'A',status:'paid',order_parcels:[]}];applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';refreshDbState=async()=>true;`);
  const first=run(`warehouseSave({disabled:false,textContent:''},()=>{calls++;return new Promise(r=>{releaseSave=r})},'packing',['paid'],'完成')`);
  assert.equal(run("go('ship',{role:'warehouse'})"),false);
  await run(`warehouseSave({},async()=>{calls++},'packing',['paid'],'重复')`);
  assert.equal(context.calls,1);
  run('releaseSave()');await first;
});
test('historical multiple-order parcel associations cannot be processed twice',async()=>{
  const {context,run}=setup();context.calls=0;
  run(`state.dbOrders=['a','b'].map(id=>({id,order_no:id,status:'submitted',order_parcels:[{parcel_id:'shared',parcels:{id:'shared'}}]}));applyDbOrder(state.dbOrders[0]);warehouseWorkspace.selectedId='a';`);
  await run(`warehouseSave({},async()=>{calls++},'inbound',['warehouse_received'],'完成')`);
  assert.equal(context.calls,0);
  assert.ok(context.testMessages.some(s=>s.includes('历史重复关联')));
});
