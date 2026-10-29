/* Deterministic network-wave probe. Uses synthetic data only; does not connect to Supabase. */
const path=require('node:path');
async function measure(root=path.join(__dirname,'..')){
 const {run,c,document}=require(path.join(root,'dev/combined-ui-harness.cjs'))();
 const requests=[],waiting=[];let waves=0,finished=false;
 c.network=(label,result)=>{requests.push(label);return new Promise(resolve=>waiting.push(()=>resolve(result)))};
 run(`window.MospaceSupabase.getClient=()=>({from(table){const q={select(){return q},order(){return q},range(){return network(table,{data:[]})},then(resolve,reject){return network(table,{data:[]}).then(resolve,reject)}};return q},rpc(name){return network('rpc:'+name,{data:name.endsWith('capabilities')?1:[]})}});`);
 const load=run('loadMerchantWorkspace()');load.then(()=>finished=true,()=>finished=true);
 while(!finished){await new Promise(setImmediate);if(waiting.length){waves++;waiting.splice(0).forEach(resolve=>resolve())}if(waves>20)throw Error('Probe did not settle')}
 await load;
 run(`state.role='merchant';state.page='orders';state.auth.user={id:'m'};combined.ready=true;state.dbOrders=Array.from({length:100},(_,i)=>({...o,id:'o'+i,order_no:'PERF-'+i}));render()`);
 let textVisits=0;const walk=document.createTreeWalker.bind(document);
 document.createTreeWalker=(...args)=>{const tree=walk(...args),next=tree.nextNode.bind(tree);tree.nextNode=()=>{const node=next();if(node)textVisits++;return node};return tree};
 const el=document.createElement('div');el.id='perfStatus';el.textContent='登录成功';document.body.append(el);
 if(run("typeof localizeMutationRecords==='function'"))run(`localizeMutationRecords([{type:'childList',addedNodes:[document.querySelector('#perfStatus')]}])`);
 else run('localizeKnownDom()');
 return {networkWaves:waves,totalReads:requests.length,reads:requests.reduce((r,name)=>(r[name]=(r[name]||0)+1,r),{}),statusUpdateTextVisits:textVisits};
}
module.exports=measure;
if(require.main===module)measure(process.argv[2]?path.resolve(process.argv[2]):undefined).then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e);process.exitCode=1});
