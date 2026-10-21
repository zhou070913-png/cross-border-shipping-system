const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function setup(count=25){
  const root=path.join(__dirname,'..'),elements=new Map(),groups=new Map();
  elements.set('crumb',{textContent:''});
  const context=vm.createContext({console,setTimeout,clearTimeout,window:{MospaceSupabase:{isConfigured:()=>true}},document:{
    querySelector:selector=>selector.startsWith('#')?elements.get(selector.slice(1))||null:null,
    querySelectorAll:selector=>groups.get(selector)||[],getElementById:id=>elements.get(id)||null
  },localStorage:{getItem:()=>null},URL,Blob});
  const inline=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state ='));
  vm.runInContext(inline,context);
  vm.runInContext('bind=()=>{};render=()=>{merchantParcels()};',context);
  vm.runInContext(fs.readFileSync(path.join(root,'merchant-workspace.js'),'utf8'),context);
  const run=s=>vm.runInContext(s,context);
  run(`state.role='merchant';state.auth={user:{id:'qa'},role:'merchant'};state.dbOrders=[];
    workspace.owner='qa';workspace.parcels=Array.from({length:${count}},(_,i)=>({id:'p-'+i,tracking_no:'TRACK-'+String(i+1).padStart(3,'0'),item_name:'商品-'+i,status:i%2?'received':'pre_advised'}));`);
  elements.set('workspaceGlobalRefresh',{});
  return {context,run,elements,groups};
}
const tracks=html=>[...html.matchAll(/<td class="mono">(TRACK-\d+)<\/td>/g)].map(m=>m[1]);

test('pages cover every parcel once, with correct last-page ranges and disabled boundaries',()=>{
  const {run}=setup();
  const first=run('merchantParcels()');
  assert.equal(tracks(first).length,10);
  assert.ok(first.includes('data-parcel-page="0" disabled'));
  run('workspace.parcelPage=2');
  const second=run('merchantParcels()');
  assert.equal(tracks(second)[0],'TRACK-011');
  assert.ok(second.includes('共 25 个包裹 · 显示 11–20 条 · 第 2 / 3 页'));
  run('workspace.parcelPage=3');
  const last=run('merchantParcels()');
  assert.equal(tracks(last).length,5);
  assert.ok(last.includes('data-parcel-page="4" disabled'));
  assert.equal(new Set([...tracks(first),...tracks(second),...tracks(last)]).size,25);
});

test('filter and search totals are computed before slicing, and out-of-range pages clamp after refresh',()=>{
  const {run}=setup();
  run("workspace.parcelTab='received';workspace.parcelPage=2");
  const filtered=run('merchantParcels()');
  assert.equal(tracks(filtered).length,2);
  assert.ok(filtered.includes('共 12 个包裹 · 显示 11–12 条'));
  run("workspace.parcelTab='all';workspace.parcelQuery='TRACK-025';workspace.parcelPage=99");
  assert.deepEqual(tracks(run('merchantParcels()')),['TRACK-025']);
  assert.equal(run('workspace.parcelPage'),1);
  run("workspace.parcelQuery='';workspace.parcelPage=3;workspace.parcels=workspace.parcels.slice(0,8)");
  assert.ok(run('merchantParcels()').includes('共 8 个包裹 · 显示 1–8 条'));
  assert.equal(run('workspace.parcelPage'),1);
});

test('empty and single-page lists have no invalid navigation',()=>{
  for(const count of [0,1,10]){
    const {run}=setup(count),html=run('merchantParcels()');
    assert.ok(html.includes(`共 ${count} 个包裹 · 显示 ${count?1:0}–${count} 条 · 第 1 / 1 页`));
    assert.ok(html.includes('data-parcel-page="0" disabled'));
    assert.ok(html.includes('data-parcel-page="2" disabled'));
  }
});

test('wired controls reset search, filters and sizes but preserve page through detail navigation',()=>{
  const {run,elements,groups,context}=setup();
  const tab={dataset:{parcelTab:'received'}},next={dataset:{parcelPage:'3'}};
  const search={addEventListener:(_,fn)=>search.submit=fn};
  const size={focus:()=>{},addEventListener:(_,fn)=>size.change=fn};
  const detail={dataset:{workspaceParcel:'p-24'}};
  elements.set('parcelSearch',search);elements.set('parcelSearchText',{value:' TRACK-025 '});elements.set('parcelPageSize',size);
  groups.set('[data-parcel-tab]',[tab]);groups.set('[data-parcel-page]',[next]);groups.set('[data-workspace-parcel]',[detail]);
  run('bind();workspace.parcelPage=2');tab.onclick();
  assert.equal(run('workspace.parcelPage'),1);
  run("workspace.parcelTab='all';workspace.parcelPage=3");
  search.submit({preventDefault(){}});
  assert.equal(run('workspace.parcelPage'),1);
  assert.equal(run('workspace.parcelQuery'),'TRACK-025');
  run("workspace.parcelQuery='';workspace.parcelPage=3");
  size.change({target:{value:'20'}});
  assert.equal(run('workspace.parcelPageSize'),20);
  assert.equal(run('workspace.parcelPage'),1);
  run('workspace.parcelPageSize=10');next.onclick();
  assert.equal(run('workspace.parcelPage'),3);
  context.pages=[];run('go=page=>pages.push(page)');detail.onclick();
  assert.equal(run('workspace.detailParcelId'),'p-24');
  assert.equal(run('workspace.parcelPage'),3);
  assert.deepEqual(context.pages,['parcel-detail']);
  assert.equal(tracks(run('merchantParcels()'))[0],'TRACK-021');
});

test('large lists use bounded page numbers and ellipses',()=>{
  const {run}=setup(1000);
  run('workspace.parcelPage=50');
  const html=run('merchantParcels()');
  assert.ok(html.includes('第 50 / 100 页'));
  assert.ok(html.includes('aria-label="第 100 页"'));
  assert.ok(html.includes('pagination-gap'));
  assert.ok([...html.matchAll(/data-parcel-page=/g)].length<=9);
});

test('parcel loading traverses API batches without truncating the total and propagates errors',async()=>{
  const {run,context}=setup();
  const ranges=[],orders=[],records=Array.from({length:1025},(_,id)=>({id}));
  context.window.MospaceSupabase.getClient=()=>({from:()=>({select:()=>{
    const query={order:(column)=>{orders.push(column);return query},range:async(a,b)=>{ranges.push([a,b]);return {data:records.slice(a,b+1),error:null}}};
    return query;
  }})});
  assert.equal((await run("queryData('parcels')")).length,1025);
  assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
  assert.deepEqual(orders,['created_at','id','created_at','id','created_at','id']);
  context.window.MospaceSupabase.getClient=()=>({from:()=>({select:()=>{
    const query={order:()=>query,range:async()=>({data:null,error:Error('offline')})};return query;
  }})});
  await assert.rejects(run("queryData('parcels')"),/offline/);
});
