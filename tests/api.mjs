import jpeg from 'jpeg-js';
import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import vm from 'node:vm';import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_loose_inertia.sql','utf8').replaceAll('--> statement-breakpoint',''));
sql.exec(fs.readFileSync('drizzle/0001_catalog_replica.sql','utf8').replaceAll('--> statement-breakpoint',''));
const DB={prepare(query){const st=sql.prepare(query);let args=[];const wrap={bind(...v){args=v;return wrap},async all(){return {results:st.all(...args)}},async run(){return st.run(...args)},async first(){return st.get(...args)||null}};return wrap}};
DB.batch=async statements=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}};
const objects=new Map();const env={DB,CATALOG_SYNC_SECRET:'integration-test-secret-at-least-32-characters',ADMIN_EMAIL:'owner@example.test',BUCKET:{async head(key){return objects.has(key)?{}:null},async put(key,bytes,meta){objects.set(key,{bytes,meta})},async get(key){const x=objects.get(key);return x?{body:x.bytes,httpMetadata:x.meta.httpMetadata}:null}}};const context=vm.createContext({URL,Request,Response,File,FormData,crypto,TextEncoder,TextDecoder,Uint8Array,Date,console,atob});const cache=new Map();
async function module(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;const m=new vm.SourceTextModule(code,{context,identifier:file});cache.set(file,m);await m.link(async spec=>{if(spec==='jpeg-js'){return new vm.SyntheticModule(['default'],function(){this.setExport('default',jpeg)},{context});}if(spec==='cloudflare:workers'){const mod=new vm.SyntheticModule(['env'],function(){this.setExport('env',env)},{context});return mod}return module(path.resolve(path.dirname(file),spec)+'.ts')});await m.evaluate();return m}
const routes={};for(const [key,f]of Object.entries({admin:'app/api/admin/[kind]/route.ts',catalog:'app/api/catalog/route.ts',inquiries:'app/api/inquiries/route.ts',upload:'app/api/upload/route.ts',media:'app/media/[key]/route.ts',sync:'app/api/sync/catalog/route.ts'}))routes[key]=(await module(f)).namespace;
function request(method,body,owner=true,origin='https://site.test'){return new Request('https://site.test/api',{method,headers:{origin,...(owner?{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})}
const params=kind=>({params:Promise.resolve({kind})});
test('admin rejects anonymous and other users, including writes',async()=>{assert.equal((await routes.admin.GET(request('GET',null,false),params('products'))).status,403);const r=request('POST',{name:'Bad'},true);r.headers.set('oai-authenticated-user-email','other@example.test');assert.equal((await routes.admin.POST(r,params('products'))).status,403);assert.equal((await routes.admin.POST(request('POST',{},true,'https://evil.test'),params('products'))).status,403)});
test('product CRUD persists and unpublished products stay private',async()=>{let r=await routes.admin.POST(request('POST',{id:'test-product',name:'Truck tire',nameRu:'Грузовая шина',descriptionRu:'Для магистральных перевозок',size:'315/80 R22.5',category:'Yuk mashinalari',currency:'USD',price_cents:12500,stock:4,published:false}),params('products'));assert.equal(r.status,200);assert.equal((await (await routes.catalog.GET()).json()).products.filter(x=>!x.sample).length,0);r=await routes.admin.POST(request('POST',{id:'test-product',name:'Truck tire',nameRu:'Грузовая шина',descriptionRu:'Для магистральных перевозок',size:'315/80 R22.5',category:'Yuk mashinalari',currency:'USD',price_cents:12500,stock:4,published:true}),params('products'));assert.equal(r.status,200);const result=await (await routes.catalog.GET()).json();result.products=result.products.filter(x=>!x.sample);assert.equal(result.products[0].nameRu,'Грузовая шина');assert.equal(result.products[0].descriptionRu,'Для магистральных перевозок');assert.equal(result.products[0].price_cents,12500);assert.equal(result.products[0].currency,'USD');assert.equal(result.products[0].stock,4);assert.equal((await routes.admin.POST(request('POST',{name:'Bad',size:'R20',image:'javascript:alert(1)'}),params('products'))).status,400);const req=new Request('https://site.test/api?id=test-product',{method:'DELETE',headers:{origin:'https://site.test','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'}});await routes.admin.DELETE(req,params('products'));assert.equal((await (await routes.catalog.GET()).json()).products.filter(x=>!x.sample).length,0)});
test('settings validate outbound links and persist',async()=>{assert.equal((await routes.admin.POST(request('POST',{telegram:'javascript:alert(1)'}),params('settings'))).status,400);assert.equal((await routes.admin.POST(request('POST',{company:'TOPSHINALAR',phone:'+998 90 123 45 67',telegram:'https://t.me/topshinalar'}),params('settings'))).status,200);assert.equal((await (await routes.catalog.GET()).json()).settings.phone,'+998 90 123 45 67')});
test('inquiries validate phone, persist selections, update status and rate-limit',async()=>{assert.equal((await routes.inquiries.POST(request('POST',{name:'Client',phone:'invalid'},false))).status,400);for(let i=0;i<5;i++)assert.equal((await routes.inquiries.POST(request('POST',{name:'Client',phone:'+998901234567',message:'Need tires',products:['315/80 R22.5']},false))).status,200);assert.equal((await routes.inquiries.POST(request('POST',{name:'Client',phone:'+998901234567'},false))).status,429);const list=await (await routes.admin.GET(request('GET'),params('inquiries'))).json();assert.equal(list.length,5);assert.deepEqual(list[0].products,['315/80 R22.5']);assert.equal((await routes.admin.POST(request('POST',{id:list[0].id,status:'done'}),params('inquiries'))).status,200)});
test('upload rejects SVG and anonymous users; valid PNG is retrievable',async()=>{const build=(file,owner=true)=>{const body=new FormData();body.append('file',file);return new Request('https://site.test/api/upload',{method:'POST',headers:{origin:'https://site.test',...(owner?{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}:{})},body})};assert.equal((await routes.upload.POST(build(new File(['<svg>bad</svg>'],'bad.svg')))).status,400);const file=new File([fs.readFileSync('public/assets/topshinalar-mark.png')],'logo.png');assert.equal((await routes.upload.POST(build(file,false))).status,403);const r=await routes.upload.POST(build(file));assert.equal(r.status,200);const {url}=await r.json();const media=await routes.media.GET(new Request('https://site.test'+url),{params:Promise.resolve({key:url.split('/').at(-1)})});assert.equal(media.status,200);assert.equal(media.headers.get('Content-Type'),'image/png');assert.ok((await media.arrayBuffer()).byteLength>100)});

test('truck banner leads and hiding the quarry banner preserves it',async()=>{const initial=await (await routes.catalog.GET()).json();assert.equal(initial.banners.length,6);assert.equal(initial.banners[0].id,'highway');for(const item of initial.banners){assert.ok(item.titleRu);assert.ok(fs.existsSync('public'+item.image))}const req=new Request('https://site.test/api?id=quarry',{method:'DELETE',headers:{origin:'https://site.test','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'}});assert.equal((await routes.admin.DELETE(req,params('banners'))).status,200);const hidden=await (await routes.catalog.GET()).json();assert.equal(hidden.banners.length,5);assert.ok(!hidden.banners.some(x=>x.id==='quarry'));const adminView=await (await routes.admin.GET(request('GET'),params('banners'))).json();assert.equal(adminView.find(x=>x.id==='quarry').published,false)});

const automatic=(await module('lib/product-auto.ts')).namespace.autoProduct;
test('automatic details use supplied facts and choose truck, forklift or OTR samples',()=>{
const truck=automatic({name:'TR-01',brand:'Example',size:'315/80 R22.5',axle:'Tortuvchi o‘q',category:'Yuk mashinalari',vehicle:'Tyagach'});
assert.ok(truck.description.includes('Example — TR-01'));assert.ok(truck.description.includes('315/80 R22.5'));assert.ok(truck.descriptionRu.includes('ведущая ось'));assert.equal(truck.image,'/assets/auto-truck.webp');assert.equal(truck.imageSample,true);
assert.equal(automatic({...truck,category:'Maxsus texnika',vehicle:'Kara (forklift)'}).image,'/assets/auto-industrial.webp');
assert.equal(automatic({...truck,category:'Maxsus texnika',vehicle:'Frontal yuklagich',vehicleRu:'Фронтальный погрузчик'}).image,'/assets/auto-otr.webp');
assert.ok(automatic({...truck,size:'385/65 R22.5'}).description.includes('385/65 R22.5'));
});
test('manual copy and uploaded photos survive automatic defaults and disabled options',()=>{
const manual=automatic({name:'Model',size:'R20',description:'My own copy',descriptionRu:'Свой текст',image:'/media/abc.png'});assert.equal(manual.description,'My own copy');assert.equal(manual.descriptionRu,'Свой текст');assert.equal(manual.image,'/media/abc.png');assert.equal(manual.imageSample,false);
const disabled=automatic({name:'Model',description:'',descriptionAuto:false,image:'',imageAuto:false});assert.equal(disabled.description,'');assert.equal(disabled.image,'');
});
test('API persists automation flags and updates generated descriptions after size edits',async()=>{
const base={id:'auto-test',name:'Model',brand:'Brand',size:'315/80 R22.5',category:'Yuk mashinalari',axle:'Rul o‘qi',published:true,descriptionAuto:true,descriptionRuAuto:true,imageAuto:true};
assert.equal((await routes.admin.POST(request('POST',base),params('products'))).status,200);
assert.equal((await routes.admin.POST(request('POST',{...base,size:'295/80 R22.5'}),params('products'))).status,200);
const result=await (await routes.catalog.GET()).json(),p=result.products.find(x=>x.id==='auto-test');assert.ok(p.description.includes('295/80 R22.5'));assert.ok(p.descriptionRu.includes('295/80 R22.5'));assert.equal(p.imageAuto,true);
});

test('catalog reads never seed samples; explicit seed disabled after real sync',async()=>{
 const before=sql.prepare('SELECT COUNT(*) n FROM records').get().n;
 const initial=await (await routes.catalog.GET()).json();assert.equal(initial.products.filter(x=>x.sample).length,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM records').get().n,before);
 const seed=(await module('lib/sample-products.ts')).namespace.ensureSampleProducts;
 await seed(DB);assert.equal(sql.prepare("SELECT COUNT(*) n FROM records WHERE kind='products' AND json_extract(payload,'$.sample')=1").get().n,8);
 const samples=(await (await routes.catalog.GET()).json()).products.filter(x=>x.sample);assert.equal(samples.length,8);assert.ok(samples.every(x=>x.price_cents===null));
 sql.prepare('INSERT OR IGNORE INTO catalog_mode VALUES(1,1)').run();
 assert.equal((await (await routes.catalog.GET()).json()).products.filter(x=>x.sample).length,0);
 sql.prepare("DELETE FROM records WHERE kind='imports'").run();await seed(DB);
 assert.equal((await (await routes.catalog.GET()).json()).products.filter(x=>x.sample).length,0);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM records WHERE kind='products' AND json_extract(payload,'$.sample')=1").get().n,8);
});

test('canonical categories preserve legacy products and choose AGRO/PCR images',async()=>{
 const automatic=(await module('lib/product-auto.ts')).namespace.autoProduct;
 assert.equal(automatic({category:'Yuk mashinalari'}).category,'TBR');
 assert.equal(automatic({category:'Maxsus texnika'}).category,'OTR');
 assert.equal(automatic({category:'OTTR'}).category,'OTR');
 for(const code of ['TBR','OTR','AGRO','PCR']){
  const id='category-'+code;const res=await routes.admin.POST(request('POST',{id,name:'Category test',size:code==='AGRO'?'18.4-38':'315/80 R22.5',category:code,published:true,imageAuto:true}),params('products'));assert.equal(res.status,200);
  const row=(await (await routes.catalog.GET()).json()).products.find(x=>x.id===id);assert.equal(row.category,code);assert.ok(row.description.includes(code));assert.ok(row.descriptionRu.includes(code));assert.ok(fs.existsSync('public'+row.image));
  if(code==='AGRO')assert.equal(row.image,'/assets/auto-agro.webp');if(code==='PCR')assert.equal(row.image,'/assets/auto-pcr.webp');
 }
 assert.equal((await routes.admin.POST(request('POST',{name:'Bad category',size:'R20',category:'UNKNOWN'}),params('products'))).status,400);
});

const samplePayload=(version=1)=>({type:'product',source_product_id:'702',catalog_sku:'SKU702',source_version:version,name:'Real tire',brand:'Brand',model:'M1',size:'315/80 R22.5',category:'TBR',description:'UZ',descriptionRu:'RU',currency:'USD',price_unit:'cent',price_cents:12500,stock:10,available:true,published:true,images:[]});
async function syncRequest(payload,options={}){
 const body=JSON.stringify(payload),stamp=String(options.stamp??Math.floor(Date.now()/1000)),nonce=options.nonce??crypto.randomUUID().replaceAll('-','');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.CATALOG_SYNC_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'\n'+nonce+'\n'+body))).toString('hex');
 return new Request('https://site.test/api/sync/catalog',{method:'POST',headers:{'Content-Type':'application/json','X-Sync-Time':stamp,'X-Sync-Nonce':nonce,'X-Sync-Signature':options.signature??sig},body});
}
test('sync rejects unauthorized, expired, replayed, oversized and private fields',async()=>{
 assert.equal((await routes.sync.POST(request('POST',samplePayload(),false))).status,401);
 assert.equal((await routes.sync.POST(await syncRequest(samplePayload(),{stamp:Math.floor(Date.now()/1000)-121}))).status,401);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(),cost:100}))).status,400);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(),currency:'UZS'}))).status,400);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(),stock:-1}))).status,400);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(),price_cents:12.5}))).status,400);
 const nonce=crypto.randomUUID().replaceAll('-','');assert.equal((await routes.sync.POST(await syncRequest(samplePayload(),{nonce}))).status,200);
 assert.equal((await routes.sync.POST(await syncRequest(samplePayload(),{nonce}))).status,409);
 const big=new Request('https://site.test/api/sync/catalog',{method:'POST',headers:{'content-length':String(7*1024*1024)},body:'{}'});assert.equal((await routes.sync.POST(big)).status,413);
});
test('duplicate and reordered snapshots replace absolute stock and preserve USD cents',async()=>{
 assert.equal((await routes.sync.POST(await syncRequest(samplePayload()))).status,200);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(3),stock:7}))).status,200);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(2),stock:99}))).status,200);
 let p=(await (await routes.catalog.GET()).json()).products.find(x=>x.source_product_id==='702');assert.equal(p.stock,7);assert.equal(p.price_cents,12500);assert.equal(p.currency,'USD');assert.equal(p.price_unit,'cent');assert.ok(p.synced_at);
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(3),stock:8}))).status,409);
 const all=(await (await routes.catalog.GET()).json()).products;assert.equal(all.filter(x=>x.source_product_id==='702').length,1);
 assert.ok(!('cost' in p));assert.ok(!('catalog_sku' in p));assert.ok(!('source_version' in p));assert.ok(!('points' in p));
});
test('concurrent sync snapshots keep greatest version',async()=>{
 await Promise.all([9,4,11,8].map(v=>syncRequest({...samplePayload(v),stock:v}).then(r=>routes.sync.POST(r))));
 const p=(await (await routes.catalog.GET()).json()).products.find(x=>x.source_product_id==='702');assert.equal(p.stock,11);
});
test('sync unknown price/stock, hiding and admin edits blocked',async()=>{
 await routes.sync.POST(await syncRequest({...samplePayload(12),price_cents:null,stock:null,available:null}));
 const p=(await (await routes.catalog.GET()).json()).products.find(x=>x.source_product_id==='702');assert.equal(p.price_cents,null);assert.equal(p.stock,null);assert.equal(p.available,null);
 assert.equal((await routes.admin.POST(request('POST',{id:'bot-702',name:'Override',size:'R20',currency:'USD',price_cents:1}),params('products'))).status,409);
 const del=new Request('https://site.test/api?id=bot-702',{method:'DELETE',headers:{origin:'https://site.test','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'}});
 assert.equal((await routes.admin.DELETE(del,params('products'))).status,409);
 await routes.sync.POST(await syncRequest({...samplePayload(13),published:false}));assert.ok(!(await (await routes.catalog.GET()).json()).products.some(x=>x.source_product_id==='702'));
});
test('images validate real JPEG, cache object and remove product references without deleting shared objects',async()=>{
 const pixels=Buffer.alloc(3*3*4,255),bytes=jpeg.encode({width:3,height:3,data:pixels},80).data;const sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const body={type:'image',sha256:sha,data:bytes.toString('base64')};const response=await routes.sync.POST(await syncRequest(body));assert.equal(response.status,200);const {path:publicPath}=await response.json();
 assert.equal((await routes.sync.POST(await syncRequest(body))).status,200);assert.ok(objects.has(publicPath.slice(7)));
 const invalid=Buffer.from([255,216,255,217]);assert.equal((await routes.sync.POST(await syncRequest({type:'image',sha256:Buffer.from(await crypto.subtle.digest('SHA-256',invalid)).toString('hex'),data:invalid.toString('base64')}))).status,400);
 await routes.sync.POST(await syncRequest({...samplePayload(14),images:[publicPath]}));let p=(await (await routes.catalog.GET()).json()).products.find(x=>x.source_product_id==='702');assert.equal(p.image,publicPath);
 await routes.sync.POST(await syncRequest({...samplePayload(15),images:[]}));p=(await (await routes.catalog.GET()).json()).products.find(x=>x.source_product_id==='702');assert.equal(p.image,'');assert.deepEqual(p.images,[]);assert.ok(objects.has(publicPath.slice(7)));
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(16),images:['https://api.telegram.org/file/botsecret/x']}))).status,400);
});
test('signed dry-run is read-only for business/catalog records and reports unlinked legacy rows',async()=>{
 const before=sql.prepare('SELECT COUNT(*) n FROM catalog_replica').get().n;
 const response=await routes.sync.POST(await syncRequest({type:'inventory'}));assert.equal(response.status,200);const data=await response.json();assert.ok(Array.isArray(data.ambiguous_mapping));assert.ok(data.products.some(x=>x.sample));assert.equal(sql.prepare('SELECT COUNT(*) n FROM catalog_replica').get().n,before);
});
test('legacy prices require review and new manual prices use exact USD decimal input',async()=>{
 assert.equal((await routes.admin.POST(request('POST',{id:'legacy-new',name:'Bad units',size:'R20',price:12500}),params('products'))).status,400);
 assert.equal((await routes.admin.POST(request('POST',{id:'usd-new',name:'USD exact',size:'R20',price_usd:'125.01',published:true}),params('products'))).status,200);
 const p=(await (await routes.catalog.GET()).json()).products.find(x=>x.id==='usd-new');assert.equal(p.price_cents,12501);
 for(const value of ['125.001','1e3','-1'])assert.equal((await routes.admin.POST(request('POST',{id:'invalid-usd',name:'Invalid',size:'R20',price_usd:value}),params('products'))).status,400);
});
test('USD display never relabels legacy prices or substitutes unknown values with zero',()=>{
 const scope={};vm.runInNewContext(fs.readFileSync('public/catalog-price.js','utf8'),scope);
 assert.equal(scope.CatalogPrice.text({currency:'USD',price_unit:'cent',price_cents:12500}),'125.00 USD');
 assert.equal(scope.CatalogPrice.text({currency:'USD',price_unit:'cent',price_cents:0}),'0.00 USD');
 assert.equal(scope.CatalogPrice.text({currency:'USD',price_unit:'cent',price_cents:null}),'Narx so‘rov asosida');
 assert.equal(scope.CatalogPrice.text({currency:'UZS',price:12500},'ru'),'Цена по запросу');
 assert.equal(scope.CatalogPrice.stock({available:null,stock:null},'ru'),'Наличие уточняется');
});

test('source namespace collision never overwrites or silently merges a legacy product',async()=>{
 const original={name:'Existing real legacy',size:'R20',published:true,stock:4};sql.prepare('INSERT INTO records VALUES(?,?,?,?)').run('bot-999','products',JSON.stringify(original),Date.now());
 assert.equal((await routes.sync.POST(await syncRequest({...samplePayload(1),source_product_id:'999'}))).status,409);
 assert.equal(JSON.parse(sql.prepare('SELECT payload FROM records WHERE id=?').get('bot-999').payload).name,original.name);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM catalog_replica WHERE source_product_id=?').get('999').n,0);
 assert.equal((await routes.admin.POST(request('POST',{id:'bot-999',...original,name:'Edited legacy'}),params('products'))).status,200);
});
test('idempotent additive migration preserves legacy records, settings, inquiries and replicas',()=>{
 const before=sql.prepare('SELECT * FROM records ORDER BY id').all(),replicas=sql.prepare('SELECT * FROM catalog_replica ORDER BY source_product_id').all();
 sql.exec('BEGIN');sql.exec(fs.readFileSync('drizzle/0001_catalog_replica.sql','utf8').replaceAll('--> statement-breakpoint',''));sql.exec('COMMIT');
 assert.deepEqual(sql.prepare('SELECT * FROM records ORDER BY id').all(),before);assert.deepEqual(sql.prepare('SELECT * FROM catalog_replica ORDER BY source_product_id').all(),replicas);
});
