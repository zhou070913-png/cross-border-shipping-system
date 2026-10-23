const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('merchant and operations load all order batches so older parents and child shipments are retained',async()=>{
 const records=Array.from({length:1025},(_,id)=>({id})),ranges=[],sorts=[];
 const client={from:()=>({select:()=>{const q={order:k=>{sorts.push(k);return q},range:async(a,b)=>{ranges.push([a,b]);return {data:records.slice(a,b+1)}}};return q}})};
 const window={supabase:{createClient:()=>client}},c=vm.createContext({window});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../supabase-client.js'),'utf8'),c);
 assert.equal((await window.MospaceSupabase.myOrders()).length,1025);
 assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
 assert.deepEqual(sorts,['created_at','id','created_at','id','created_at','id']);
 assert.equal((await window.MospaceSupabase.adminOrders()).length,1025);
 client.from=()=>({select:()=>{const q={order:()=>q,range:async()=>({error:Error('offline')})};return q}});
 await assert.rejects(window.MospaceSupabase.myOrders(),/offline/);
});
