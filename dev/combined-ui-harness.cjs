const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom');
module.exports=function setup(){
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const {window,document}=parseHTML(html);
 const c=vm.createContext({console,document,window:{MospaceSupabase:{isConfigured:()=>true},scrollTo:()=>{},scrollY:0},NodeFilter:{SHOW_TEXT:4},localStorage:{getItem:()=>null,setItem:()=>{}},navigator:{onLine:true},crypto:require('node:crypto').webcrypto,URL,Blob,Uint8Array,setTimeout:()=>0,clearTimeout:()=>{},MutationObserver:undefined});
 const run=s=>vm.runInContext(s,c);
 run([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const state =')));
 for(const f of ['merchant-workspace.js','warehouse-workspace.js','payment-workspace.js','transport-workspace.js','separate-settlement.js','overseas-addresses.js','calculator-workspace.js','last-mile-pricing.js','overall-orders.js','forwarding-workspace.js','combined-workspace.js','customer-workspace.js','locale-en.js','bilingual-workspace.js','locale-switch.js'])run(fs.readFileSync(path.join(root,f),'utf8'));
 run(`state.auth={user:{id:'m',email:'m@local.test'},profile:{member_no:'TEST-MERCHANT',is_active:true},role:'merchant'};state.role='merchant';workspace.owner='m';warehouseWorkspace.owner='m';paymentWorkspace.owner='m';combined.owner='m:merchant';combined.ready=true;
  workspace.routes=[{route_code:'ID-AIR',route_name:'印尼空运',transport_mode:'air',is_active:true,billing_basis:'kg',first_weight_kg:.5,first_price:68,additional_price_per_kg:42,volume_divisor:6000,handling_fee:18,updated_at:'2026-10-28'}, {route_code:'ID-SEA',route_name:'印尼海运',transport_mode:'sea',is_active:true,billing_basis:'cbm',price_per_cbm:600,minimum_cbm:.1,sea_price_per_kg:1.5,sea_charge_rule:'higher_of_weight_volume',volume_divisor:6000,first_weight_kg:.5,first_price:0,additional_price_per_kg:0,handling_fee:18,updated_at:'2026-10-28'}];
  const f={id:'f',shipping_fee:null,last_mile_fee:null,total_amount:null};
  o={id:'o',merchant_id:'m',order_no:'TEST-ORDER',status:'submitted',fulfillment_mode:'combined_delivery',destination_country:'印度尼西亚',destination_city:'Jakarta',destination_address:'TEST address',recipient_name:'TEST name',recipient_phone:'TEST phone',route_code:'ID-AIR',route_name:'印尼空运',parcel_count:1,updated_at:'v1',fees:[f],payments:[],order_parcels:[]};
  state.dbOrders=[o];applyDbOrder(o);combined.contacts={wechat:'TEST-WECHAT',whatsapp:'TEST-WHATSAPP',is_test:true};combined.pending=[];`);
 return {run,document,c};
};
