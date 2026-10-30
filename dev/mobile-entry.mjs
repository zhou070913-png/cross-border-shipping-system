// A separate customer H5 entry. The desktop source and published root stay unchanged.
export function mobileHtml(html){
 const startup='<script>render(); updateAuthMode(); syncAuth();</script>';
 if(!html.includes(startup)||!html.includes('</style>'))throw Error('Unexpected desktop entry structure');
 return mobileAsset('locale-switch.js',html).replace('width=device-width, initial-scale=1','width=device-width, initial-scale=1, viewport-fit=cover')
  .replace(/locale-switch\.js\?v=[^\"\s]+/, 'locale-switch.js?v=h5-2')
  .replace('</head>',`<meta name="description" content="Eaztrans集运系统，提供包裹预报、合包发货、费用查询与物流跟踪服务。" />
<link rel="canonical" href="https://zhou070913-png.github.io/eaztrans-latest-development/h5/" />
<link rel="icon" type="image/png" href="eaztrans-share.png?v=1" />
<link rel="apple-touch-icon" href="eaztrans-share.png?v=1" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Eaztrans集运" />
<meta property="og:title" content="Eaztrans集运系统" />
<meta property="og:description" content="包裹预报、合包发货、费用查询与物流跟踪。" />
<meta property="og:url" content="https://zhou070913-png.github.io/eaztrans-latest-development/h5/" />
<meta property="og:image" content="https://zhou070913-png.github.io/eaztrans-latest-development/h5/eaztrans-share.png?v=1" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
<meta property="og:image:alt" content="Eaztrans" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Eaztrans集运系统" />
<meta name="twitter:description" content="包裹预报、合包发货、费用查询与物流跟踪。" />
<meta name="twitter:image" content="https://zhou070913-png.github.io/eaztrans-latest-development/h5/eaztrans-share.png?v=1" />
</head>`)
  .replace(/supabase-client\.js\?v=[^"\s]+/, 'supabase-client.js?v=h5-4')
  .replace('</style>','</style>\n<link rel="stylesheet" href="mobile-workspace.css?v=8" />\n<meta name="theme-color" content="#315efb" />\n<meta name="apple-mobile-web-app-capable" content="yes" />')
  .replace(startup,'<script src="mobile-workspace.js?v=8"></script>\n<script src="mobile-flows.js?v=1"></script>\n'+startup);
}
export function mobileAsset(name,text){
 if(name==='supabase-client.js'){
  const creation='global.supabase.createClient(config.url, config.anonKey)';
  if(!text.includes(creation))throw Error('Unexpected Supabase client initialization');
  // A mobile document has its own in-memory session. Never restore the desktop's
  // localStorage session or persist a customer across a fresh open/refresh.
  // Keep confirmation-link handling so an explicit email verification still works.
  return text.replace(creation,"global.supabase.createClient(config.url, config.anonKey, {auth:{storageKey:'eaztrans-h5-auth-v1',persistSession:false,detectSessionInUrl:true}})");
 }
 if(name!=='locale-switch.js')return text;
 return text.replaceAll('Eaztrans集运｜产品原型','Eaztrans集运系统').replaceAll('Eaztrans集运｜最新开发版','Eaztrans集运系统')
  .replaceAll('Eaztrans Logistik · Demo','Eaztrans Logistik').replaceAll('Eaztrans Logistik · Pengembangan terbaru','Eaztrans Logistik')
  .replaceAll('Eaztrans Logistics · Demo','Eaztrans Logistics').replaceAll('Eaztrans Logistics · Latest development','Eaztrans Logistics');
}
