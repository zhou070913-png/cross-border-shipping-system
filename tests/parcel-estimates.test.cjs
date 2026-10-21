const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 const elements=new Map([['crumb',{textContent:''}],['workspaceGlobalRefresh',{}]]),groups=new Map();
 const c=vm.createContext({console,setTimeout,clearTimeout,window:{MospaceSupabase:{isConfigured:()=>true}},document:{querySelector:s=>elements.get(s.replace(/^#/,''))||null,getElementById:id=>elements.get(id)||null,querySelectorAll:s=>groups.get(s)||[]},localStorage:{getItem:()=>null},URL,Blob});
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const run=s=>vm.runInContext(s,c);
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));
 run('bind=()=>{};render=()=>{}');run(fs.readFileSync(path.join(root,'merchant-workspace.js'),'utf8'));
 run(`state.role='merchant';state.auth={user:{id:'merchant'},role:'merchant'};state.dbOrders=[];state.addresses=[];workspace.owner='merchant';
 r={is_active:true,route_code:'ID-AIR',route_name:'印尼空运',volume_divisor:6000,first_weight_kg:0.5,first_price:68,additional_price_per_kg:42,handling_fee:18};
 p={id:'p',tracking_no:'TRACK',status:'pre_advised',declared_weight_kg:2,declared_length_cm:30,declared_width_cm:20,declared_height_cm:10};`);
 return {run,elements,groups};
}
test('weight and volume dominance use route price, one handling fee, and 3dp/2dp rounding',()=>{
 const {run}=setup();let q=run('estimatePacking([p,p],r)');assert.equal(q.total,233);assert.equal(q.billable,4);assert.equal(q.handling,18);
 q=run('estimatePacking([{...p,declared_length_cm:60,declared_width_cm:40,declared_height_cm:40}],r)');assert.equal(q.volume,16);assert.equal(q.total,737);
 q=run('estimatePacking([{...p,declared_length_cm:13.01,declared_width_cm:12.01,declared_height_cm:99.99,declared_weight_kg:0.1}],r)');assert.equal(q.volume,2.604);assert.equal(q.shipping,156.37);
});
test('missing or invalid data has no fabricated zero fee, real measurement is preferred as a complete set',()=>{
 const {run}=setup();
 for(const patch of ['declared_weight_kg:null','declared_height_cm:0','declared_length_cm:NaN'])assert.equal(run(`estimatePacking([{...p,${patch}}],r).status`),'incomplete');
 assert.equal(run('estimatePacking([],r).status'),'empty');assert.equal(run('estimatePacking([p],{...r,volume_divisor:0}).status'),'no_route');
 assert.equal(run('estimatePacking([p],{...r,first_price:null}).status'),'no_route');
 assert.equal(run('estimatePacking([{...p,actual_weight_kg:3,length_cm:10,width_cm:10,height_cm:10}],r).weight'),3);
 assert.equal(run('estimatePacking([{...p,actual_weight_kg:3}],r).weight'),2);
 assert.equal(run('p.actual_weight_kg'),undefined);
});
test('input validation accepts optional fields, rejects partial dimensions, zero, excess precision and nonfinite numbers',()=>{
 const {run,elements}=setup();const fill=values=>['weight_kg','length_cm','width_cm','height_cm'].forEach((k,i)=>elements.set('x'+k,{value:values[i]}));
 fill(['','','','']);assert.equal(run('readDeclaredMeasurements("x").weight_kg'),null);
 fill(['2.123','30.01','20','10']);assert.equal(run('readDeclaredMeasurements("x").weight_kg'),2.123);
 for(const v of [['1','2','',''],['0','','',''],['Infinity','','',''],['1.1234','','',''],['1','2.123','3','4']]){fill(v);assert.throws(()=>run('readDeclaredMeasurements("x")'));}
});
test('selection and route updates refresh only estimate while preserving address and note draft',()=>{
 const {run,elements,groups}=setup();
 run("workspace.parcels=[p,{...p,id:'p2',tracking_no:'OTHER'}];workspace.routes=[r,{...r,route_code:'ID-EXP',first_price:100}];workspace.selected=new Set(['p']);workspace.packingDraft={address:'addr',note:'保留盒子'}");
 const estimate={innerHTML:''};elements.set('packingEstimate',estimate);elements.set('packingRoute',{value:'ID-AIR'});
 run('bind();updatePackingEstimate()');assert.match(estimate.innerHTML,/149.00/);
 elements.get('packingRoute').value='ID-EXP';run('updatePackingEstimate()');assert.match(estimate.innerHTML,/181.00/);
 assert.equal(run('workspace.packingDraft.note'),'保留盒子');assert.equal(run('workspace.packingDraft.address'),'addr');
 const el={value:'p2',checked:true};groups.set('[name=packingParcel]',[el]);run('bind()');el.onchange();assert.match(estimate.innerHTML,/265.00/);
 el.checked=false;el.onchange();assert.match(estimate.innerHTML,/181.00/);
});
test('pre-advice/edit/detail expose declared measurements; pending edit remains possible, estimates escaped and never payable',()=>{
 const {run}=setup();run("workspace.parcels=[p];workspace.editParcelId='p';workspace.detailParcelId='p';workspace.routes=[r]");
 assert.match(run('merchantPreAdvise()'),/adviceweight_kg/);assert.match(run('merchantParcelEdit()'),/editParcellength_cm/);
 assert.equal(run('canMaintainParcel(p)'),true);assert.match(run('merchantParcelDetail()'),/预报外包装尺寸/);
 assert.match(run('packingEstimateHtml(estimatePacking([p],r))'),/确认后只付款一次/);
 assert.doesNotMatch(run('packingEstimateHtml(estimatePacking([p],r))'),/payBtn|登记一次付款/);
 assert.match(run("packingEstimateHtml({status:'incomplete',missing:['<img>']})"),/&lt;img&gt;/);
});

