import {catalog,json} from '../../../lib/catalog';
export async function GET(){try{return json(await catalog())}catch{return json({error:'Katalogni yuklab bo‘lmadi. Keyinroq qayta urinib ko‘ring.'},503)}}
