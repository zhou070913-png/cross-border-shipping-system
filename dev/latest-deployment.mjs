// Build a separate public site and an empty-project database installer. Never deploy the first version.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const firstProject='bdxqphmzwojamyuboqmz';
export const firstRepository='zhou070913-png/cross-border-shipping-system';
export const latestRepository='zhou070913-png/eaztrans-latest-development';
export const migrations=['schema','member-login','warehouse-operations','admin-operations','merchant-workspace','parcel-maintenance','parcel-estimates','payment-review','sea-route','separate-settlement','overseas-addresses','cargo-channels','last-mile-pricing','overseas-forwarding','combined-delivery'];
export function validateTarget({url,key,repository=latestRepository}){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!/^[a-z]{20}\.supabase\.co$/.test(parsed.host)||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)throw Error('Use the dedicated Supabase project HTTPS URL');
 const project=parsed.hostname.split('.')[0];
 if(project===firstProject)throw Error('Refusing the development first version database');
 if(repository!==latestRepository)throw Error('Only the separate latest development repository may be published');
 if(!key||key.startsWith('sb_secret_'))throw Error('A browser publishable key is required; secret keys are forbidden');
 if(!key.startsWith('sb_publishable_')){
  let claims;try{claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'))}catch{throw Error('Invalid publishable/anon key')}
  if(claims.role!=='anon'||claims.ref!==project)throw Error('Only an anon key belonging to the new project is allowed');
 }
 return project;
}
export async function bootstrapSql(){
 const parts=[`-- Eaztrans 最新开发版：仅允许安装到全新、空白项目。禁止在开发首版运行。
begin;
do $$begin
 if to_regclass('public.profiles') is not null or to_regclass('public.orders') is not null then
  raise exception 'STOP: this installer requires a fresh project. Existing data is protected.';
 end if;
end $$;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
grant usage on schema public to authenticated,anon;
`];
 for(const name of migrations){const sql=await fs.readFile(path.join(root,'supabase',name+'.sql'),'utf8');parts.push(`\n-- Migration: ${name}\n`+sql.replace(/^\s*(begin|commit);\s*$/gim,''))}
 parts.push(`
create table public.deployment_environment (id boolean primary key default true check(id),name text not null check(name='latest-development'),installed_at timestamptz not null default now());
alter table public.deployment_environment enable row level security;
revoke all on public.deployment_environment from public,anon,authenticated;
insert into public.deployment_environment(id,name) values(true,'latest-development');
commit;
notify pgrst,'reload schema';
select 'latest-development' as environment, (select count(*) from public.orders) as orders, (select count(*) from public.profiles) as accounts;
`);return parts.join('\n');
}
export async function buildLatest({url,key,repository=latestRepository,output=path.join(root,'.deployment','latest-site')}){
 const project=validateTarget({url,key,repository});
 // Refuse to overwrite source, a prior build or an arbitrary directory.
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
 const html=await fs.readFile(path.join(root,'index.html'),'utf8');
 const assets=[...html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)].map(m=>m[1]).filter(s=>!/^https?:/.test(s));
 for(const name of new Set(assets)){
  if(!/^[\w-]+\.(js|css)$/.test(name))throw Error('Unexpected public asset: '+name);
  let data=await fs.readFile(path.join(root,name),'utf8');
  if(name==='supabase-client.js'){
   const config=/const config = \{[\s\S]*?\n  \};/;if(!config.test(data))throw Error('Client configuration block changed');
   data=data.replace(config,'const config = '+JSON.stringify({url:new URL(url).origin,anonKey:key})+';');
  }
  if(name==='locale-switch.js')data=data.replace(/Eaztrans集运｜产品原型/g,'Eaztrans集运｜最新开发版').replace(/Eaztrans Logistik · Demo/g,'Eaztrans Logistik · Pengembangan terbaru').replace(/Eaztrans Logistics · Demo/g,'Eaztrans Logistics · Latest development');
  if(data.includes(firstProject))throw Error('First-version project found in public asset: '+name);
  await fs.writeFile(path.join(output,name),data);
 }
 const badge='<div class="side-footer"><span class="bi" data-i18n data-zh="最新开发版" data-id="Pengembangan terbaru" data-en="Latest development">最新开发版</span></div>';
 await fs.writeFile(path.join(output,'index.html'),html.replace(/<div class="side-footer">[\s\S]*?<\/div>/,badge).replace('Eaztrans集运｜产品原型','Eaztrans集运｜最新开发版'));
 await fs.writeFile(path.join(output,'.nojekyll'),'');
 let commit='unknown';try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()}catch{}
 await fs.writeFile(path.join(output,'deployment.json'),JSON.stringify({name:'最新开发版',environment:'latest-development',project,repository,sourceCommit:commit,builtAt:new Date().toISOString()},null,2));
 return {project,output};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const action=process.argv[2];
 if(action==='sql'){const destination=path.join(root,'.deployment','latest-bootstrap.sql');await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,await bootstrapSql());console.log(destination)}
 else if(action==='build')console.log(await buildLatest({url:process.env.EAZTRANS_LATEST_SUPABASE_URL,key:process.env.EAZTRANS_LATEST_PUBLISHABLE_KEY}));
 else throw Error('Use sql or build');
}
