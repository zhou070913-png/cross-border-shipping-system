import fs from 'node:fs/promises';
import path from 'node:path';
import {buildLatest,root} from './latest-deployment.mjs';
import {mobileHtml,mobileAsset} from './mobile-entry.mjs';

export async function buildMobile(options){
 const result=await buildLatest({...options,signupVerification:'link'});
 const output=result.output;
 for(const name of ['mobile-workspace.css','mobile-workspace.js'])await fs.copyFile(path.join(root,name),path.join(output,name));
 const html=await fs.readFile(path.join(output,'index.html'),'utf8');
 await fs.writeFile(path.join(output,'index.html'),mobileHtml(html));
 const localeFile=path.join(output,'locale-switch.js');
 await fs.writeFile(localeFile,mobileAsset('locale-switch.js',await fs.readFile(localeFile,'utf8')));
 const metadata=JSON.parse(await fs.readFile(path.join(output,'deployment.json'),'utf8'));
 await fs.writeFile(path.join(output,'deployment.json'),JSON.stringify({...metadata,surface:'merchant-h5',desktopBaseline:'878f628b64db2f85b19b47eb80512ffba4b678e5'},null,2));
 return result;
}
