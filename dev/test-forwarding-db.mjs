import fs from 'node:fs/promises';
import {createForwardingDb} from './forwarding-db.mjs';
const db=await createForwardingDb();
try{
 await db.exec(await fs.readFile(new URL('../supabase/overseas-forwarding.sql',import.meta.url),'utf8'));
 console.log('Migration rerun: PASS');
 const results=await db.exec(await fs.readFile(new URL('../supabase/overseas-forwarding-qa.sql',import.meta.url),'utf8'));
 for(const r of results)if(r.rows?.[0]?.test)for(const row of r.rows)console.log(row.result+': '+row.test);
}finally{await db.close()}
