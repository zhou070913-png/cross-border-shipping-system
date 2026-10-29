const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
test('latest deployment refuses the first-version database, repository and privileged keys',async()=>{
 const {validateTarget}=await import('../dev/latest-deployment.mjs');
 const good={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_TEST'};
 assert.equal(validateTarget(good),'abcdefghijklmnopqrst');
 assert.throws(()=>validateTarget({...good,url:'https://bdxqphmzwojamyuboqmz.supabase.co'}),/first version/);
 assert.throws(()=>validateTarget({...good,repository:'zhou070913-png/cross-border-shipping-system'}),/separate/);
 assert.throws(()=>validateTarget({...good,key:'sb_secret_TEST'}),/secret/);
 const key='header.'+Buffer.from(JSON.stringify({ref:'abcdefghijklmnopqrst',role:'service_role'})).toString('base64url')+'.signature';
 assert.throws(()=>validateTarget({...good,key}),/Only an anon/);
});
test('public release contains only runtime assets and the new project, without local test identities or old configuration',async()=>{
 const {buildLatest,bootstrapSql}=await import('../dev/latest-deployment.mjs'),temp=await fs.mkdtemp(path.join(os.tmpdir(),'eaztrans-release-')),output=path.join(temp,'site');
 try{
  await buildLatest({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_TEST',output});
  const files=await fs.readdir(output);assert.ok(files.includes('locale-switch.js'));assert.ok(!files.includes('dev'));assert.ok(!files.includes('supabase'));assert.ok(!files.includes('.git'));
  const index=await fs.readFile(path.join(output,'index.html'),'utf8');assert.match(index,/最新开发版/);assert.doesNotMatch(index,/forwarding-local-client|forwarding-preview/);
  for(const file of files){const text=await fs.readFile(path.join(output,file),'utf8');assert.ok(!text.includes('bdxqphmzwojamyuboqmz'),file)}
  const sql=await bootstrapSql();assert.match(sql,/requires a fresh project/);assert.match(sql,/resolve_login_email/);assert.match(sql,/combined_capabilities/);assert.doesNotMatch(sql,/insert into auth.users|LOCAL-MERCHANT/);
  await assert.rejects(buildLatest({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_TEST',output}),/EEXIST/);
 }finally{await fs.rm(temp,{recursive:true,force:true})}
});
