# Struk Digital API

Backend Node.js + Express untuk generate struk digital (PNG) menggunakan `canvas`.
Setiap struk yang digenerate disimpan ke disk dengan **nama file random** (tidak bisa
ditebak) dan **otomatis terhapus setelah 5 menit**.

## Instalasi

```bash
npm install
```

> **Catatan khusus untuk iPhone/terminal mobile (iSH dll):** package `canvas` butuh
> native build (Cairo). Kalau `npm install` gagal di lingkungan terbatas, jalankan
> project ini di VPS biasa. Di Ubuntu/Debian cukup:
> ```bash
> sudo apt update && sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
> ```

## Menjalankan

```bash
npm start
# development (auto-restart):
npm run dev
```

Server jalan di `http://localhost:3000`.

## Struktur File

```
struk-api/
├── server.js              # Express app + semua route
├── receiptGenerator.js    # Logika gambar struk pakai canvas
├── fileStore.js           # Simpan file random + auto-hapus 5 menit
├── storage/                # Folder penyimpanan struk (auto dibuat & dibersihkan)
├── package.json
└── README.md
```

## Cara Kerja Penyimpanan & Auto-Delete

1. Saat `POST /api/receipt` dipanggil, struk digambar di memory lalu disimpan ke
   folder `storage/` dengan nama random: `struk_<32 hex>.png` (pakai `crypto.randomBytes`,
   tidak bisa ditebak/brute-force dalam waktu wajar).
2. `setTimeout` dijadwalkan untuk menghapus file tersebut tepat 5 menit kemudian.
3. Sebagai pengaman tambahan (misal server restart sehingga timer in-memory hilang),
   ada **cleanup interval** yang jalan setiap 1 menit dan menghapus file apa pun di
   `storage/` yang umurnya sudah lebih dari 5 menit (dicek dari `mtime` file).
4. Endpoint `GET /api/receipt/file/:filename` memvalidasi format nama file (regex)
   dan memastikan path tetap di dalam folder `storage/` (anti path traversal),
   sebelum mengirim file. Kalau file sudah dihapus/expired, balasannya 404.

## Endpoint

### POST /api/receipt
Generate struk, simpan ke disk dengan nama random, balas info file (bukan gambar langsung).

Response:
```json
{
  "success": true,
  "txid": "TRX-1750261800000-A1B2C3",
  "filename": "struk_3f9a1c2e8b7d4f6a1029384756abcdef.png",
  "url": "/api/receipt/file/struk_3f9a1c2e8b7d4f6a1029384756abcdef.png",
  "expiresAt": "2026-06-18T14:35:00.000Z",
  "expiresInSeconds": 300
}
```

Gabungkan `url` dengan base URL server untuk membuka/mendownload gambarnya, contoh:
`http://localhost:3000/api/receipt/file/struk_3f9a....png`

### GET /api/receipt/file/:filename
Ambil file struk yang sudah digenerate. 404 jika sudah lewat 5 menit / file tidak ada / nama tidak valid.

### POST /api/receipt/direct
Sama seperti di atas, tapi langsung balas binary PNG **tanpa disimpan ke disk**. Cocok untuk preview cepat tanpa bikin file.

### GET /api/receipt/preview
Contoh struk dummy untuk testing layout cepat di browser (langsung PNG, tidak disimpan).

### GET /health
Health check.

## Contoh request (curl)

```bash
# 1. Generate struk -> dapat URL file
curl -X POST http://localhost:3000/api/receipt \
  -H "Content-Type: application/json" \
  -d '{
    "merchantName": "Toko Jaya Makmur",
    "merchantAddress": "Jl. Merdeka No. 10, Jakarta",
    "merchantPhone": "0812-3456-7890",
    "cashier": "Admin",
    "customerName": "Budi Santoso",
    "paymentMethod": "QRIS",
    "items": [
      { "name": "Kaos Polos Hitam L", "qty": 2, "price": 75000 },
      { "name": "Ongkir Reguler", "qty": 1, "price": 15000 }
    ],
    "discount": 10000,
    "note": "Barang tidak dapat dikembalikan tanpa struk ini."
  }'

# Response berisi "url": "/api/receipt/file/struk_xxxx.png"

# 2. Download gambar dari url tersebut (dalam 5 menit)
curl http://localhost:3000/api/receipt/file/struk_xxxx.png --output struk.png
```

`txid` dan `date` otomatis di-generate jika tidak dikirim di body.

## Mengubah Durasi TTL

Edit `TTL_MS` di `fileStore.js`:
```js
const TTL_MS = 5 * 60 * 1000; // ganti sesuai kebutuhan, dalam milidetik
```
