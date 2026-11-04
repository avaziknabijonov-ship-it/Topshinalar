import jpeg from 'jpeg-js';
import {env} from 'cloudflare:workers';
const db=()=>{if(!env.DB)throw Error('Database unavailable');return env.DB;};
const json=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

const encoder=new TextEncoder();
const hex=(x:ArrayBuffer)=>Array.from(new Uint8Array(x),v=>v.toString(16).padStart(2,'0')).join('');
export const sha256=async (x:Uint8Array)=>hex(await crypto.subtle.digest('SHA-256',new Uint8Array(x)));
function validString(x:unknown,n:number,empty=true):x is string{return typeof x==='string'&&x.length<=n&&(empty||x.trim().length>0);}
const keys=['type','source_product_id','catalog_sku','source_version','name','brand','model','size','category','description','descriptionRu','currency','price_unit','price_cents','stock','available','published','images'];
export function validateProduct(p:any){
 if(!p||Object.getPrototypeOf(p)!==Object.prototype||Object.keys(p).some(k=>!keys.includes(k))||keys.some(k=>!(k in p)))throw Error('fields');
 if(p.type!=='product'||!/^\d{1,16}$/.test(p.source_product_id)||typeof p.source_product_id!=='string'||!Number.isSafeInteger(p.source_version)||p.source_version<=0)throw Error('source');
 for(const [k,n] of Object.entries({name:160,brand:100,model:160,size:60,description:3000,descriptionRu:3000}))if(!validString(p[k],n,k!=='name'))throw Error('text');
 if(p.catalog_sku!==null&&!validString(p.catalog_sku,100,false))throw Error('sku');
 if(!['TBR','OTR','AGRO','PCR'].includes(p.category)||p.currency!=='USD'||p.price_unit!=='cent')throw Error('currency/category');
 if(p.price_cents!==null&&(!Number.isSafeInteger(p.price_cents)||p.price_cents<0||p.price_cents>100000000000000))throw Error('price');
 if(p.stock!==null&&(!Number.isSafeInteger(p.stock)||p.stock<0||p.stock>200000000))throw Error('stock');
 if(p.available!==null&&typeof p.available!=='boolean'||typeof p.published!=='boolean'||p.stock!==null&&p.available!==(p.stock>0))throw Error('availability');
 if(!Array.isArray(p.images)||p.images.length>20||new Set(p.images).size!==p.images.length||p.images.some((x:any)=>typeof x!=='string'||!/^\/media\/[a-f0-9]{64}\.jpg$/.test(x)))throw Error('images');
 return p;
}

export async function authenticateSync(req:Request,body:Uint8Array,secret:string,clock=Date.now()){
 const stamp=req.headers.get('x-sync-time')||'',nonce=req.headers.get('x-sync-nonce')||'',sig=req.headers.get('x-sync-signature')||'';
 if(!/^\d{10}$/.test(stamp)||Math.abs(clock/1000-Number(stamp))>120||!/^([a-f0-9]{32})$/.test(nonce)||!/^([a-f0-9]{64})$/.test(sig))return null;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const prefix=encoder.encode(stamp+'\n'+nonce+'\n');const bytes=new Uint8Array(prefix.length+body.length);bytes.set(prefix);bytes.set(body,prefix.length);
 const signature=Uint8Array.from(sig.match(/../g)!,x=>parseInt(x,16));
 return await crypto.subtle.verify('HMAC',key,signature,bytes)?nonce:null;
}

export async function boundedBody(req:Request,limit:number){
 if(Number(req.headers.get('content-length'))>limit)throw Error('large');
 const reader=req.body?.getReader();if(!reader)throw Error('body');const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('large');}chunks.push(value);}
 const out=new Uint8Array(length);let pos=0;for(const c of chunks){out.set(c,pos);pos+=c.length;}return out;
}

export async function receive(req:Request){
 if(!env.CATALOG_SYNC_SECRET||env.CATALOG_SYNC_SECRET.length<32)return json({error:'Sync not configured'},503);
 let body:Uint8Array;try{body=await boundedBody(req,6*1024*1024)}catch{return json({error:'Payload limit'},413)}
 const nonce=await authenticateSync(req,body,env.CATALOG_SYNC_SECRET);if(!nonce)return json({error:'Unauthorized'},401);
 const database=db();
 if(await database.prepare('SELECT nonce FROM catalog_nonces WHERE nonce=?').bind(nonce).first())return json({error:'Replay'},409);
 let p:any;try{p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body))}catch{return json({error:'JSON'},400)}
 if(!p||typeof p!=='object'||Array.isArray(p))return json({error:'Payload'},400);
 const stamp=Date.now();const claim=database.prepare('INSERT INTO catalog_nonces(nonce,expires) VALUES(?,?)').bind(nonce,stamp+300000);
 if(p.type==='inventory'){
  if(Object.keys(p).length!==1)return json({error:'fields'},400);
  try{await claim.run()}catch{return json({error:'Replay'},409)}
  const legacy=await database.prepare("SELECT id,payload FROM records WHERE kind='products'").all();
  const replica=await database.prepare('SELECT source_product_id,source_version,payload,synced_at FROM catalog_replica').all();
  // Explicit whitelist: no internal business records can reach the receiver.
  const legacyRows=legacy.results.map((r:any)=>{const x=JSON.parse(r.payload);return {id:r.id,sample:x.sample===true,currency:x.currency||'UNVERIFIED',price:x.price??null,price_cents:x.price_cents??null,stock:x.stock??null,source_product_id:null};});
  return json({products:[...legacyRows,...replica.results.map((r:any)=>({...publicProduct(JSON.parse(r.payload),r.synced_at),source_version:r.source_version}))],ambiguous_mapping:legacyRows.filter((x:any)=>!x.sample).map((x:any)=>x.id)});
 }
 if(p.type==='image'){
  if(Object.keys(p).sort().join(',')!=='data,sha256,type'||typeof p.data!=='string'||!/^[a-f0-9]{64}$/.test(p.sha256))return json({error:'image'},400);
  let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0))}catch{return json({error:'image'},400)}
  if(bytes.length>4*1024*1024||!validJpeg(bytes)||await sha256(bytes)!==p.sha256)return json({error:'image content'},400);
  try{jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:16,maxMemoryUsageInMB:48});}catch{return json({error:'Invalid JPEG'},400);}
  const key=p.sha256+'.jpg';
  try{await claim.run()}catch{return json({error:'Replay'},409)}
  if(!await env.BUCKET.head(key))await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  return json({path:'/media/'+key});
 }
 try{validateProduct(p)}catch{return json({error:'Invalid public product'},400)}
 if(body.length>32000)return json({error:'Product limit'},413);
 for(const path of p.images)if(!await env.BUCKET.head(path.slice(7)))return json({error:'Image missing'},400);
 if(await database.prepare("SELECT id FROM records WHERE id=? AND kind='products'").bind('bot-'+p.source_product_id).first())return json({error:'Legacy ID collision; explicit review required'},409);
 const payload=JSON.stringify(p);const digest=await sha256(encoder.encode(payload));
 const previous:any=await database.prepare('SELECT source_version,digest FROM catalog_replica WHERE source_product_id=?').bind(p.source_product_id).first();
 if(previous?.source_version===p.source_version&&previous.digest!==digest)return json({error:'Version conflict'},409);
 try{
  await database.batch([claim,database.prepare(`INSERT INTO catalog_replica(source_product_id,source_version,payload,digest,synced_at) VALUES(?,?,?,?,?) ON CONFLICT(source_product_id) DO UPDATE SET source_version=excluded.source_version,payload=excluded.payload,digest=CASE WHEN excluded.source_version=catalog_replica.source_version AND excluded.digest<>catalog_replica.digest THEN NULL ELSE excluded.digest END,synced_at=CASE WHEN excluded.source_version>catalog_replica.source_version THEN excluded.synced_at ELSE catalog_replica.synced_at END WHERE excluded.source_version>=catalog_replica.source_version`).bind(p.source_product_id,p.source_version,payload,digest,stamp),database.prepare('INSERT OR IGNORE INTO catalog_mode VALUES(1,1)'),database.prepare('DELETE FROM catalog_nonces WHERE expires<?').bind(stamp)]);
 }catch{return json({error:'Replay or storage conflict'},409)}
 return json({ok:true,source_product_id:p.source_product_id,source_version:p.source_version});
}

export function validJpeg(data:Uint8Array){
 if(data.length<20||data[0]!==255||data[1]!==216||data.at(-2)!==255||data.at(-1)!==217)return false;
 let offset=2,dimensions=false;
 while(offset+4<data.length){
  if(data[offset++]!==255)return false;let marker=data[offset++];while(marker===255)marker=data[offset++];
  if(marker===218)return dimensions; // entropy stream follows validated headers
  const len=(data[offset]<<8)|data[offset+1];if(len<2||offset+len>data.length)return false;
  if([192,193,194].includes(marker)){
   if(len<8)return false;const h=(data[offset+3]<<8)|data[offset+4],w=(data[offset+5]<<8)|data[offset+6];if(!w||!h||w*h>16000000)return false;dimensions=true;
  }
  offset+=len;
 }
 return false;
}

export function publicProduct(p:any,syncedAt:number){
 return {sort:0,id:'bot-'+p.source_product_id,source_product_id:p.source_product_id,name:p.name,brand:p.brand,model:p.model,size:p.size,category:p.category,description:p.description,descriptionRu:p.descriptionRu,image:p.images[0]||'',images:p.images,currency:'USD',price_unit:'cent',price_cents:p.price_cents,price:null,stock:p.stock,available:p.available,published:p.published,synced_at:syncedAt,stock_as_of:syncedAt,imageAuto:false,descriptionAuto:false,descriptionRuAuto:false};
}
