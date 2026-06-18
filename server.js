const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { generateReceipt } = require('./receiptGenerator');
const { saveReceiptFile, getFilePath, startCleanupInterval, TTL_MS } = require('./fileStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Jalankan cleanup berkala (jaga-jaga file nyangkut kalau server pernah restart)
startCleanupInterval();

/**
 * Validasi payload minimal yang wajib ada untuk generate struk
 */
function validatePayload(body) {
  const errors = [];

  if (!body.merchantName) errors.push('merchantName wajib diisi');
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items wajib berupa array dan tidak boleh kosong');
  } else {
    body.items.forEach((item, idx) => {
      if (!item.name) errors.push(`items[${idx}].name wajib diisi`);
      if (item.price === undefined || isNaN(item.price)) errors.push(`items[${idx}].price wajib berupa angka`);
      if (item.qty === undefined || isNaN(item.qty)) errors.push(`items[${idx}].qty wajib berupa angka`);
    });
  }

  return errors;
}

/**
 * POST /api/receipt
 * Generate struk digital, SIMPAN ke disk dengan nama file random,
 * dan file otomatis terhapus setelah 5 menit.
 *
 * Body contoh:
 * {
 *   "merchantName": "Toko Jaya Makmur",
 *   "merchantAddress": "Jl. Merdeka No. 10, Jakarta",
 *   "merchantPhone": "0812-3456-7890",
 *   "txid": "TRX-20260618-0001",      // opsional, auto generate jika kosong
 *   "date": "2026-06-18T14:30:00Z",   // opsional, default now
 *   "cashier": "Admin",
 *   "customerName": "Budi Santoso",
 *   "paymentMethod": "QRIS",
 *   "status": "LUNAS",
 *   "items": [
 *     { "name": "Kaos Polos Hitam L", "qty": 2, "price": 75000 },
 *     { "name": "Ongkir Reguler", "qty": 1, "price": 15000 }
 *   ],
 *   "discount": 10000,
 *   "tax": 0,
 *   "shippingFee": 0,
 *   "note": "Barang tidak dapat dikembalikan tanpa struk ini.",
 *   "footerTitle": "Terima kasih telah berbelanja!"
 * }
 *
 * Response (JSON):
 * {
 *   "success": true,
 *   "txid": "TRX-...",
 *   "filename": "struk_3f9a1c2e....png",
 *   "url": "/api/receipt/file/struk_3f9a1c2e....png",
 *   "expiresAt": "2026-06-18T14:35:00.000Z",
 *   "expiresInSeconds": 300
 * }
 *
 * File bisa langsung dibuka via `url` di atas (digabung dengan base URL server).
 * File akan otomatis terhapus 5 menit setelah dibuat.
 */
app.post('/api/receipt', (req, res) => {
  try {
    const errors = validatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const payload = {
      ...req.body,
      txid: req.body.txid || `TRX-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`,
      date: req.body.date || new Date().toISOString(),
    };

    const buffer = generateReceipt(payload);
    const { filename, expiresAt } = saveReceiptFile(buffer);

    return res.json({
      success: true,
      txid: payload.txid,
      filename,
      url: `/api/receipt/file/${filename}`,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: Math.round(TTL_MS / 1000),
    });
  } catch (err) {
    console.error('Gagal generate struk:', err);
    return res.status(500).json({ success: false, message: 'Gagal generate struk', error: err.message });
  }
});

/**
 * GET /api/receipt/file/:filename
 * Ambil file struk PNG yang sudah digenerate (selama belum expired/dihapus).
 */
app.get('/api/receipt/file/:filename', (req, res) => {
  const filePath = getFilePath(req.params.filename);

  if (!filePath) {
    return res.status(404).json({
      success: false,
      message: 'Struk tidak ditemukan. Mungkin sudah kedaluwarsa (lebih dari 5 menit) atau nama file tidak valid.',
    });
  }

  res.set('Content-Type', 'image/png');
  res.sendFile(filePath);
});

/**
 * POST /api/receipt/direct
 * Sama seperti /api/receipt, tapi langsung balas gambar PNG (tanpa simpan file).
 * Cocok untuk preview cepat tanpa perlu menyimpan apa pun di server.
 */
app.post('/api/receipt/direct', (req, res) => {
  try {
    const errors = validatePayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const payload = {
      ...req.body,
      txid: req.body.txid || `TRX-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`,
      date: req.body.date || new Date().toISOString(),
    };

    const buffer = generateReceipt(payload);
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('Gagal generate struk:', err);
    return res.status(500).json({ success: false, message: 'Gagal generate struk', error: err.message });
  }
});

/**
 * GET /api/receipt/preview
 * Lihat contoh struk dummy langsung di browser, sekaligus tersimpan ke disk
 * dan auto-hapus 5 menit seperti endpoint utama (untuk testing end-to-end).
 */
app.get('/api/receipt/preview', (req, res) => {
  const dummy = {
    merchantName: 'Toko Jaya Makmur',
    merchantAddress: 'Jl. Merdeka No. 10, Jakarta Selatan',
    merchantPhone: '0812-3456-7890',
    txid: `TRX-${Date.now()}`,
    date: new Date().toISOString(),
    cashier: 'Admin',
    customerName: 'Budi Santoso',
    paymentMethod: 'QRIS',
    status: 'LUNAS',
    items: [
      { name: 'Kaos Polos Hitam Ukuran L', qty: 2, price: 75000 },
      { name: 'Celana Jeans Slim Fit', qty: 1, price: 150000 },
      { name: 'Ongkos Kirim Reguler', qty: 1, price: 15000 },
    ],
    discount: 10000,
    tax: 0,
    shippingFee: 0,
    note: 'Barang yang sudah dibeli tidak dapat dikembalikan tanpa menyertakan struk ini.',
    footerTitle: 'Terima kasih telah berbelanja!',
  };

  const buffer = generateReceipt(dummy);
  res.set('Content-Type', 'image/png');
  res.send(buffer);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Struk API jalan di http://localhost:${PORT}`);
  console.log(`Preview cepat   : http://localhost:${PORT}/api/receipt/preview`);
  console.log(`File akan otomatis terhapus setelah ${TTL_MS / 1000} detik sejak dibuat.`);
});
