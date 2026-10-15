// @ts-nocheck
// This module is also served unchanged to the admin browser.
export const categories = [
 {code:'TBR',uz:'TBR — Yuk mashinalari',ru:'TBR — Грузовые шины'},
 {code:'OTR',uz:'OTR — Maxsus texnika',ru:'OTR — Шины для спецтехники'},
 {code:'AGRO',uz:'AGRO — Qishloq xo‘jaligi',ru:'AGRO — Сельхозшины'},
 {code:'PCR',uz:'PCR — Yengil avtomobillar',ru:'PCR — Легковые шины'}
];
export function normalizeCategory(value){
 const key=String(value||'').trim();const upper=key.toUpperCase();
 if(['TBR','OTR','AGRO','PCR'].includes(upper))return upper;
 if(upper==='OTTR')return 'OTR';
 const legacy={'Yuk mashinalari':'TBR','Maxsus texnika':'OTR','Qishloq xo‘jaligi':'AGRO','Yengil avtomobillar':'PCR'};
 return legacy[key]||key;
}
export function categoryLabel(value,lang='uz'){const code=normalizeCategory(value);const row=categories.find(x=>x.code===code);return row?row[lang==='ru'?'ru':'uz']:code;}
export function autoProduct(product) {
  const p = {...product};p.category=normalizeCategory(p.category||'TBR');
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const name = clean(p.name), brand = clean(p.brand), size = clean(p.size);
  const kind = [p.name,p.vehicle,p.vehicleRu,p.category].map(clean).join(' ').toLowerCase();
  const industrial = /kara|forklift|вилоч|ombor|warehouse/.test(kind);
  const special = p.category === 'OTR';
  const axleRu = {'Rul o‘qi':'рулевая ось','Tortuvchi o‘q':'ведущая ось','Tirkama o‘qi':'прицепная ось','Universal':'универсальная'};
  const categoryRu = {'Yuk mashinalari':'грузовые автомобили','Maxsus texnika':'спецтехника'};
  p.descriptionAuto = p.descriptionAuto ?? !clean(p.description);
  p.descriptionRuAuto = p.descriptionRuAuto ?? !clean(p.descriptionRu);
  p.imageAuto = p.imageAuto ?? !clean(p.image);
  const title = [brand, name].filter(Boolean).filter((v,i,a)=>i===0 || v.toLowerCase()!==a[0].toLowerCase()).join(' — ');
  const uz = [title ? title + '.' : '', size ? 'Shina o‘lchami: '+size+'.' : '', clean(p.axle) ? 'O‘q turi: '+p.axle+'.' : '', clean(p.category) ? 'Kategoriya: '+categoryLabel(p.category,'uz')+'.' : '', clean(p.vehicle) ? 'Texnika turi: '+p.vehicle+'.' : ''].filter(Boolean).join(' ');
  const ru = [[brand,clean(p.nameRu)||name].filter(Boolean).filter((v,i,a)=>i===0 || v.toLowerCase()!==a[0].toLowerCase()).join(' — '),size?'Размер шины: '+size:'',clean(p.axle)?'Тип оси: '+(axleRu[p.axle]||p.axle):'',clean(p.category)?'Категория: '+categoryLabel(p.category,'ru'):'',clean(p.vehicleRu)||industrial?'Техника: '+(clean(p.vehicleRu)||(industrial?'вилочный погрузчик':'')):clean(p.vehicle)?'Техника: '+p.vehicle:''].filter(Boolean).join('. ');
  if(p.descriptionAuto) p.description=uz;
  if(p.descriptionRuAuto) p.descriptionRu=ru ? ru+'.' : '';
  if(p.imageAuto) p.image='/assets/'+(p.category==='AGRO'?'auto-agro':p.category==='PCR'?'auto-pcr':industrial?'auto-industrial':special?'auto-otr':'auto-truck')+'.webp';
  p.imageSample = /^\/assets\/auto-(truck|industrial|otr|agro|pcr)\.webp$/.test(p.image||'');
  return p;
}
