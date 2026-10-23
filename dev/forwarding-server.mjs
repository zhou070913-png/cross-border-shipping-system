// 本地隔离验收服务：只监听127.0.0.1，使用临时PGlite数据库，重启清空。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createForwardingDb,withRole,seedForwardingPreview,fixtureUsers} from './forwarding-db.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),port=4175,db=await createForwardingDb();
await seedForwardingPreview(db);
const proofs=new Map();
const tables=new Set(['profiles','orders','parcels','overseas_packages','forwarding_order_packages','overseas_warehouse_staff','overseas_warehouses','last_mile_zones','route_pricing','warehouses','support_tickets','payment_receipts','payment_receiving_accounts','payment_notifications','merchant_addresses','tracking_events','audit_logs']);
const calls={forwarding_capabilities:[],warehouse_receive_overseas_packages:['p_order_id','p_package_nos','p_note','p_complete'],merchant_create_forwarding:['p_order_id','p_package_ids','p_recipient','p_zone_id','p_expected_zone_version','p_request_id'],merchant_cancel_forwarding:['p_order_id'],warehouse_dispatch_forwarding:['p_order_id','p_carrier','p_tracking_no'],warehouse_quote_last_mile_distance:['p_order_id','p_zone_id','p_distance_km','p_distance_note','p_expected_zone_version'],warehouse_complete_delivery:['p_order_id','p_note'],merchant_submit_payment_receipt:['p_order_id','p_object_path','p_payer_name','p_transfer_reference','p_transferred_at','p_note','p_account_updated_at'],admin_review_payment_receipt:['p_receipt_id','p_approve','p_received_amount','p_bank_reference','p_note','p_confirmed_received'],admin_set_overseas_staff:['p_member_no','p_warehouse_id','p_enabled']};
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function readBody(req){let s='';for await(const b of req){s+=b;if(s.length>8*1024*1024)throw Error('Request too large')}return JSON.parse(s||'{}')}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(req.headers.host!=='127.0.0.1:'+port)throw Error('Only local requests allowed');
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:'+port)throw Error('Cross-origin requests rejected');
  if(url.pathname.startsWith('/api/')){
   if(req.method!=='POST')return json(res,{error:'Use POST'},405);
   const body=await readBody(req),role=body.role;if(!fixtureUsers[role])throw Error('Invalid local test role');
   if(url.pathname==='/api/table'){
    if(!tables.has(body.table))throw Error('Unsupported table');
    const rows=await withRole(db,role,async tx=>{
     if(body.table==='orders')return (await tx.query(`select o.*,coalesce((select json_agg(f) from public.fees f where f.order_id=o.id),'[]') fees,coalesce((select json_agg(p) from public.payments p where p.order_id=o.id),'[]') payments,coalesce((select json_agg(json_build_object('parcel_id',op.parcel_id,'parcels',row_to_json(p))) from public.order_parcels op join public.parcels p on p.id=op.parcel_id where op.order_id=o.id),'[]') order_parcels from public.orders o order by created_at desc`)).rows;
     return (await tx.query('select * from public.'+body.table)).rows;
    });return json(res,{data:rows});
   }
   if(url.pathname==='/api/rpc'){
    const params=calls[body.name];if(!params)throw Error('Unsupported RPC in isolated preview');
    const values=params.map(k=>body.args[k]??null);
    const result=await withRole(db,role,tx=>tx.query('select to_jsonb(public.'+body.name+'('+params.map((k,i)=>k+'=> $'+(i+1)).join(',')+')) as result',values));
    return json(res,{data:result.rows[0].result});
   }
   if(url.pathname==='/api/proof'){
    if(role!=='merchant'||!body.path?.startsWith(fixtureUsers.merchant+'/'))throw Error('Invalid proof owner');
    const bytes=Buffer.from(body.base64||'','base64');if(bytes.length<1||bytes.length>5242880||!['image/png','image/jpeg','image/webp'].includes(body.type))throw Error('Invalid proof image');
    await withRole(db,role,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('payment-proofs',$1,$2)",[body.path,{size:bytes.length,mimetype:body.type}]));proofs.set(body.path,{bytes,type:body.type});return json(res,{data:{path:body.path}});
   }
   if(url.pathname==='/api/proof-read'){
    const key=body.path;
    const allowed=await withRole(db,role,tx=>tx.query('select id from public.payment_receipts where object_path=$1',[key]));
    if(!allowed.rows.length||!proofs.has(key))throw Error('Proof unavailable');
    const p=proofs.get(key);return json(res,{data:'data:'+p.type+';base64,'+p.bytes.toString('base64')});
   }
   return json(res,{error:'Not found'},404);
  }
  if(req.method!=='GET')return json(res,{error:'Not allowed'},405);
  if(url.pathname==='/'||url.pathname==='/dev/forwarding-preview.html'){
   let html=await fs.readFile(path.join(root,'index.html'),'utf8');
   html=html.replace('<head>','<head><base href="/">').replace(/<script src="https:\/\/cdn[^\"]*supabase[^\"]*"><\/script>/,'').replace(/<script src="supabase-client[^\"]*"><\/script>/,'<script src="dev/forwarding-local-client.js"></script>').replace('<script>render(); updateAuthMode(); syncAuth();</script>','<script src="dev/forwarding-preview.js"></script>');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
  }
  const requested=decodeURIComponent(url.pathname).slice(1);
  if(requested.split(/[\\/]/).some(s=>s.startsWith('.'))||requested.includes('node_modules')||!['.js','.css','.svg','.png'].includes(path.extname(requested)))return json(res,{error:'Not found'},404);
  const target=path.resolve(root,requested);if(!target.startsWith(root))throw Error('Invalid file');
  const content=await fs.readFile(target);res.writeHead(200,{'Content-Type':{'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(target)],'Cache-Control':'no-store'});res.end(content);
 }catch(e){json(res,{error:e.message},400)}
});
server.listen(port,'127.0.0.1',()=>console.log('Isolated forwarding preview: http://127.0.0.1:'+port+' (temporary data; restart resets)'));
process.on('SIGINT',()=>server.close(async()=>{await db.close();process.exit()}));
