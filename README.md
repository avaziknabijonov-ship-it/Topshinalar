# TOPSHINALAR

Brendbuk asosidagi o‘zbekcha/ruscha shinalar katalogi va admin panel. Sayt va admin panelining UZ/RU manba kodi.

## Foydalanish

- `/` — yuk mashinalari va maxsus texnika katalogi, karier/magistral bannerlari, o‘lcham/o‘q/kategoriya filtrlari, mijoz so‘rovi.
- `/admin` — mahsulotlar, bannerlar, aloqa ma’lumotlari va mijoz so‘rovlari.
- Kirish platformaning ChatGPT sign-in mexanizmi orqali. Faqat `ADMIN_EMAIL` sozlamasidagi hisob admin API’dan foydalana oladi. Parol kodga yozilmaydi.
- Mijoz so‘rovlari serverdagi D1 bazaga, yuklangan rasmlar R2 omborga saqlanadi. Brauzer xotirasiga bog‘liq emas.

## Ikki til

UZ / RU tugmasi sayt va admin panelida mavjud. Til tanlovi qurilmada saqlanadi; filtr va forma qiymatlari tarjima vaqtida o‘zgarmaydi. Mahsulot nomi, tavsifi, texnika turi, banner sarlavhasi va matni, kompaniya haqida, manzil hamda ish vaqti uchun RU maydonlari mavjud. Ruscha maydon bo‘sh qolsa, asosiy matn ko‘rsatiladi.

## Birinchi sozlash

1. Admin panelga egasi hisobi orqali kiring.
2. “Sozlamalar”da telefon, manzil, Telegram va ish vaqtini to‘ldiring.
3. Haqiqiy mahsulotlarni rasm, nom, o‘lcham, kategoriya, o‘q turi, narx va mavjud soni bilan kiriting.
4. “Saytda ko‘rsatish”ni belgilang. Narx bo‘sh qolsa “Narx so‘rov asosida” ko‘rinadi.
5. “Bannerlar”da standart bannerlarni boshqaruvga qo‘shish yoki yangilarini yuklash mumkin. Barcha bannerlar o‘chirilsa, oddiy matnli kirish bloki ko‘rinadi.
6. “Mijoz so‘rovlari”da holat: Yangi → Bog‘lanildi → Yakunlandi.

Haqiqiy assortiment berilmagan: bazaga soxta mahsulot, narx, mavjudlik yoki mijoz yozuvlari kiritilmagan. Ochiq tashrif uchun Site audience holatini egasi alohida o‘zgartiradi; ushbu yangilanish mavjud xususiy kirish holatini saqlaydi.

## Texnik tuzilma

Vinext/Vite + Cloudflare Workers, D1 va R2. `.openai/hosting.json` Site identifikatori hamda binding nomlarini saqlaydi. `storefront.html` va `admin.html` asl sahifa kodlari. `app/` marshrutlar va API; `lib/catalog.ts` ma’lumotga kirish hamda ruxsat tekshiruvlari.

Muhit sozlamasi: `ADMIN_EMAIL` (server tomonda). Maxfiy qiymatlar kod yoki git ichiga yozilmaydi.

## Tekshirish

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-vm-modules --test tests/api.mjs tests/locale.mjs
node /root/.codex/plugins/cache/openai-curated-remote/sites/1.0.0/scripts/build-site.mjs
```

API testlari SQLite xotira bazasida ishlaydi va haqiqiy mijoz ma’lumotlariga tegmaydi. Brauzer orqali vizual QA ushbu muhitda bajarilmadi.

Yangi sxema: `npm run db:generate`. Oldin qo‘llangan migratsiyalar o‘zgartirilmaydi. Hosted migratsiyalar Sites deployment jarayonida qo‘llanadi.
