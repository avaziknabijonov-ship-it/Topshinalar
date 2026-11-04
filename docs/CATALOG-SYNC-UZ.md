# Bot → sayt katalog nusxasi

Bog‘liq bot branchi: [director-catalog-sync](https://github.com/avaziknabijonov-ship-it/topshinalar-bot/tree/feature/director-catalog-sync).
To‘liq arxitektura, operator runbook, auth, rollback va kelajak iBox eksport maydonlari:
[DIRECTOR-CATALOG-UZ.md](https://github.com/avaziknabijonov-ship-it/topshinalar-bot/blob/feature/director-catalog-sync/docs/DIRECTOR-CATALOG-UZ.md).

2026-11-04 tekshirilgan sayt `main`: `afcafafb1675f7d6d0d103bd66c7a64a61fa1e85`.
AGENTS.md topilmadi; shu paytda boshqa ochiq sayt PRlari topilmadi.
Vinext/Vite, Worker/D1 `DB`/R2 `BUCKET`, mavjud hosting ID va audience saqlandi.
`app/chatgpt-auth.ts`, admin ruxsatlari, banner/aloqa va mijoz so‘rovi oqimlari saqlandi.
Productionga deploy/migratsiya qilinmadi.

## API shartnomasi

`POST /api/sync/catalog`, server-to-server HTTPS. Secret: `CATALOG_SYNC_SECRET` (kamida 32 belgi),
ikkala serverning secret storage’ida. Git, frontend, URL yoki logga qo‘ymang.

`X-Sync-Time` Unix seconds; `X-Sync-Nonce` 32 lowercase hex; `X-Sync-Signature` 64 lowercase hex.
HMAC-SHA256 ma’lumoti: UTF-8 `time + "\n" + nonce + "\n"` + **aynan yuborilgan body baytlari**.
±120 sekund, WebCrypto verify; D1 unique nonce qayta ishlatilmaydi.
Body streaming limit 6 MiB; mahsulot body 32 KiB. Har payload turi qat’iy whitelist bilan tekshiriladi.

Mahsulot JSON: `type: product`, stable `source_product_id`, nullable `catalog_sku`, positive safe integer `source_version`,
`name`, `brand`, `model`, `size`, `category: TBR|OTR|AGRO|PCR`, `description` (UZ), `descriptionRu`,
`currency: USD`, `price_unit: cent`, `price_cents: integer|null`, `stock: integer|null`,
`available: boolean|null`, `published: boolean`, `images: /media/{sha256}.jpg[]`.
`12500` sent = `125.00 USD`; null = Narx so‘rov asosida / Цена по запросу. UZSga avtomatik aylantirish yo‘q.

Nonce va versioned upsert bir D1 batch/tranzaksiyada. Past versiya holatni o‘zgartirmaydi;
bir xil versiya/payload idempotent; bir xil versiya/boshqa payload rad etiladi, parallel holat ham SQL bilan himoyalangan.
Qoldiq qo‘shilmaydi — to‘liq haqiqiy snapshot bilan almashtiriladi.

`type: image` faqat JPEG base64 + SHA-256. Bot originalni decode/re-encode qiladi;
Worker jpeg-js bilan mustaqil decode qiladi (16 MP, 4 MiB, decode memory cap 48 MiB),
R2’da content hashli o‘zgarmas fayl. Ixtiyoriy tashqi URL fetch qilinmaydi.
Shared fayllar avtomatik o‘chirilmaydi; snapshotdan image link o‘chirilishi katalogdan olib tashlaydi.

`type: inventory` — autentifikatsiyalangan, katalogga write qilmaydigan inventarizatsiya;
faqat katalog maydonlari, sample belgilari, source IDs va noaniq mappinglar. Replay nonce bundan mustasno.
Biznes hisobi, tannarx, foyda, mijoz, xodim, qarz, ichki ombor yoki secret maydonlar qabul/oshkor qilinmaydi.

## Saqlash va katalog egaligi

Yangi `0001_catalog_replica.sql` additive/idempotent migratsiya; oldingi `0000` o‘zgarmadi.
`catalog_replica`, `catalog_nonces`, `catalog_mode`; Drizzle schema/snapshot/journal qo‘shildi.
D1 migration runner tranzaksiyasida **koddan oldin** yangi migratsiyani qo‘llash kerak.

Replica `bot-{source_product_id}` namespace’da; `records`dagi legacy mahsulotlarga yozmaydi.
Shunday legacy ID allaqachon bo‘lsa, avtomatik birlashtirish o‘rniga 409 va operator tekshiruvi.
Bot mahsulotining nom/narx/qoldiq/tavsif/rasm/nashr maydonlarini direktor kabineti boshqaradi;
sayt adminidagi POST/DELETE bloklanadi. Admin login/ruxsat nazorati saqlandi.
Banner, kompaniya/aloqa, legacy mahsulot, mijoz so‘rovlari saytga tegishli.

Katalog GET endi hech qachon sample seed yozmaydi. `ensureSampleProducts` explicit util sifatida qoldi,
lekin real katalog markeridan keyin u ham sample qayta chiqara olmaydi.
Birinchi to‘liq sync real katalog rejimini yoqadi: mavjud sample yozuvlar **o‘chirilmaydi**, ommadan yashiriladi.
Haqiqiy legacy mahsulotlar ommada saqlanadi, avtomatik mapping yo‘q.
Legacy narxning valyutasi/unit’i tasdiqlanmagan bo‘lsa, USD deb ko‘rsatilmaydi; review flag/inventory’da qoladi.
Yangi manual sayt narxi explicit `price_usd` decimal string yoki `currency:USD, price_cents` talab qiladi.

Ommaviy katalog API whitelist bilan qaytaradi; `stock_as_of`/`synced_at` saqlanadi va saytda oxirgi yangilanish vaqti ko‘rinadi.
“Jonli qoldiq” va’dasi berilmaydi. Noma’lum mavjudlik null, yashirish snapshoti ommaviy katalogdan chiqaradi.

## Lokal tekshirish

`pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, `pnpm build`.
CI faqat test/typecheck/build; publish/deploy yo‘q.
Lokal Workerda migratsiyalarni `--local --config dist/server/wrangler.json --persist-to .wrangler/state`
bilan qo‘llash mumkin. Buni production migratsiyasi deb qabul qilmang.
`pnpm start` lokal Worker. Muhit HOME’ga write bermasa, `XDG_CONFIG_HOME`ni checkoutning ignored
`.sites-runtime/config`iga belgilang; hosting konfiguratsiyasini o‘zgartirmang.

`python tests/browser_catalog.py http://127.0.0.1:8787` Playwright + system Chromium talab qiladi;
oldindan faqat lokal D1’ga test snapshotlarini joylang. Script production originni rad etadi.
`docs/screenshots` — lokal test yozuvlari bilan 1440×1000 / 390×844, production mahsulotlari emas.
Browser test USD cents, narx noma’lum RU va mobil overflow’ni tekshiradi.

## Chegaralar

Haqiqiy bot DB va R2 inventarizatsiyasi bajarilmadi; 2026-11-04 ommaviy katalog GET HTTP 403 qaytardi.
Real Telegram rasmlari, production HTTPS serverlararo yetkazish, production audience va katta yuklama hali stagingda tekshiriladi.
Sync secret o‘rnatilmasa endpoint yopiq (503), administrator loginini ochish shart emas.
Agar hostingning tashqi audience qoidasi server-to-server POSTni bloklasa, loyiha egasi mavjud
kirish siyosatini saqlagan holda alohida ruxsatli servis yo‘lini tekshirishi kerak; bu PR audience’ni o‘zgartirmaydi.

Rollback: worker/timer va secretni o‘chirish; biznes yozuvlarini eski nusxa bilan almashtirmaslik;
D1 jadvallarni saqlash. Sample filteri/replica o‘qishni rollbackda saqlang;
eski auto-seed kodini tekshirmasdan qaytarmang. R2 fayllarini reference tekshiruvisiz o‘chirmang.
