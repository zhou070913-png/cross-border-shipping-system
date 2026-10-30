// A separate customer H5 entry. The desktop source and published root stay unchanged.
export function mobileHtml(html){
 const startup='<script>render(); updateAuthMode(); syncAuth();</script>';
 if(!html.includes(startup)||!html.includes('</style>'))throw Error('Unexpected desktop entry structure');
 return mobileAsset('locale-switch.js',html).replace('width=device-width, initial-scale=1','width=device-width, initial-scale=1, viewport-fit=cover')
  .replace('</style>','</style>\n<link rel="stylesheet" href="mobile-workspace.css?v=3" />\n<meta name="theme-color" content="#315efb" />\n<meta name="apple-mobile-web-app-capable" content="yes" />')
  .replace(startup,'<script src="mobile-workspace.js?v=3"></script>\n'+startup);
}
export function mobileAsset(name,text){
 if(name!=='locale-switch.js')return text;
 return text.replaceAll('Eaztrans集运｜产品原型','Eaztrans集运｜商家移动端').replaceAll('Eaztrans集运｜最新开发版','Eaztrans集运｜商家移动端')
  .replaceAll('Eaztrans Logistik · Demo','Eaztrans Logistik · Pelanggan seluler').replaceAll('Eaztrans Logistik · Pengembangan terbaru','Eaztrans Logistik · Pelanggan seluler')
  .replaceAll('Eaztrans Logistics · Demo','Eaztrans Logistics · Customer mobile').replaceAll('Eaztrans Logistics · Latest development','Eaztrans Logistics · Customer mobile');
}
