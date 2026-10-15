import source from '../../lib/product-auto.ts?raw';
export function GET(){return new Response(source,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}})}
