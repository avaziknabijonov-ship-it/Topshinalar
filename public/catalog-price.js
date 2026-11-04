(function(root){
 'use strict';
 const text=(p,lang='uz')=>{
  if(p.currency!=='USD'||p.price_unit!=='cent'||!Number.isSafeInteger(p.price_cents)||p.price_cents<0)return lang==='ru'?'Цена по запросу':'Narx so‘rov asosida';
  const cents=BigInt(p.price_cents);return String(cents/100n)+'.'+String(cents%100n).padStart(2,'0')+' USD';
 };
 const stock=(p,lang='uz')=>{
  if(p.available==null)return lang==='ru'?'Наличие уточняется':'Mavjudligini aniqlashtiring';
  if(!p.available)return lang==='ru'?'Нет в наличии':'Mavjud emas';
  return (lang==='ru'?'В наличии':'Mavjud')+(Number.isSafeInteger(p.stock)?': '+p.stock:'');
 };
 root.CatalogPrice={text,stock};
})(globalThis);
