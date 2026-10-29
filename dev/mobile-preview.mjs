// Reuse the running isolated preview database through a local proxy; do not reset it.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mobileHtml,mobileAsset} from './mobile-entry.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),port=4176;
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`){res.writeHead(403);return res.end('Local preview only')}
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  if(url.pathname.startsWith('/api/')){
   const proxy=http.request({hostname:'127.0.0.1',port:4175,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:4175',origin:'http://127.0.0.1:4175'}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res)});
   proxy.on('error',()=>{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Start the isolated preview on port 4175 first'}))});req.pipe(proxy);return;
  }
  if(req.method!=='GET'){res.writeHead(405);return res.end()}
  if(['/','/h5/','/h5'].includes(url.pathname)){
   let html=mobileHtml(await fs.readFile(path.join(root,'index.html'),'utf8'));
   html=html.replace('<head>','<head><base href="/">').replace(/<script src="https:\/\/cdn[^\"]*supabase[^\"]*"><\/script>/,'').replace(/<script src="supabase-client[^\"]*"><\/script>/,'<script src="dev/forwarding-local-client.js"></script>').replace('<script>render(); updateAuthMode(); syncAuth();</script>','<script src="dev/forwarding-preview.js"></script>');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
  }
  const name=decodeURIComponent(url.pathname).replace(/^\/(?:h5\/)?/,'');
  if(!/^[\w-]+\.(js|css)$/.test(name)&&!['dev/forwarding-preview.js','dev/forwarding-local-client.js'].includes(name)){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(mobileAsset(name,await fs.readFile(path.join(root,name),'utf8')));
 }catch(e){res.writeHead(500,{'Content-Type':'text/plain'});res.end('Preview asset unavailable')}
});
server.listen(port,'127.0.0.1',()=>console.log(`Customer H5 preview: http://127.0.0.1:${port}/h5/ (uses isolated preview on 4175)`));
