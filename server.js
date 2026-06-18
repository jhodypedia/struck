const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { generateReceipt } = require('./receiptGenerator');
const { saveReceiptFile, getFilePath, startCleanupInterval, TTL_MS } = require('./fileStore');

const app = express();
const PORT = process.env.PORT || 3000;

// WAJIB UNTUK CLOUDFLARE + NGINX REVERSE PROXY
// Memastikan Express membaca IP asli dari header HTTP, bukan IP lokal Nginx
app.set('trust proxy', true);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Jalankan cleanup berkala untuk menghapus file struk yang sudah expired (lebih dari 5 menit)
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
 * Generate struk digital, SIMPAN ke disk dengan nama random.
 * Mengembalikan dua URL: satu untuk dilihat (viewUrl), satu untuk diunduh (downloadUrl).
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
      viewUrl: `/api/receipt/file/${filename}`,
      downloadUrl: `/api/receipt/download/${filename}`,
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
 * Ambil file struk PNG untuk DILIHAT di dalam browser (inline preview).
 */
app.get('/api/receipt/file/:filename', (req, res) => {
  const filePath = getFilePath(req.params.filename);

  if (!filePath) {
    return res.status(404).json({
      success: false,
      message: 'Struk tidak ditemukan. Mungkin sudah kedaluwarsa atau nama file tidak valid.',
    });
  }

  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

/**
 * GET /api/receipt/download/:filename
 * Ambil file struk PNG untuk LANGSUNG DIUNDUH (Force Download) ke perangkat user.
 */
app.get('/api/receipt/download/:filename', (req, res) => {
  const filePath = getFilePath(req.params.filename);

  if (!filePath) {
    return res.status(404).json({
      success: false,
      message: 'Struk tidak ditemukan. Mungkin sudah kedaluwarsa atau nama file tidak valid.',
    });
  }

  // Memberikan nama file yang lebih ramah saat diunduh user
  const downloadName = `Struk-${req.params.filename}`;
  res.download(filePath, downloadName);
});

/**
 * POST /api/receipt/direct
 * Cocok untuk sistem bot. Merender gambar PNG secara instan tanpa menyimpannya ke server.
 * Tambahkan query ?download=true jika ingin memaksa unduhan (contoh: /api/receipt/direct?download=true)
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

    if (req.query.download === 'true') {
      res.set('Content-Disposition', `attachment; filename="Struk-${payload.txid}.png"`);
    } else {
      res.set('Content-Disposition', 'inline');
    }

    res.send(buffer);
  } catch (err) {
    console.error('Gagal generate struk:', err);
    return res.status(500).json({ success: false, message: 'Gagal generate struk', error: err.message });
  }
});

/**
 * GET /api/receipt/preview
 * Lihat contoh struk dummy langsung di browser.
 */
app.get('/api/receipt/preview', (req, res) => {
  const dummy = getDummyData();
  const buffer = generateReceipt(dummy);
  
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', 'inline');
  res.send(buffer);
});

/**
 * GET /api/receipt/preview/download
 * Tes fitur otomatis download menggunakan data dummy.
 */
app.get('/api/receipt/preview/download', (req, res) => {
  const dummy = getDummyData();
  const buffer = generateReceipt(dummy);
  
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', `attachment; filename="Struk-${dummy.txid}.png"`);
  res.send(buffer);
});

app.get('/health', (req, res) => res.json({ status: 'ok', proxyActive: req.ip }));

app.listen(PORT, () => {
  console.log(`Struk API jalan di port ${PORT}`);
  console.log(`Preview (Lihat)    : http://localhost:${PORT}/api/receipt/preview`);
  console.log(`Preview (Download) : http://localhost:${PORT}/api/receipt/preview/download`);
  console.log(`File akan otomatis terhapus setelah ${TTL_MS / 1000} detik sejak dibuat.`);
});

/**
 * Fungsi bantuan untuk menyediakan data dummy yang seragam
 */
function getDummyData() {
  return {
    merchantName: 'PANSA GROUP',
    merchantAddress: 'Digital Services & API Solutions',
    merchantPhone: 'support@pansa.my.id',
    txid: `INV-${Date.now()}`,
    date: new Date().toISOString(),
    customerName: 'Client #0821',
    paymentMethod: 'QRIS Deposit Gateway',
    status: 'LUNAS',
    items: [
      { name: 'WhatsApp OTP Premium', qty: 1, price: 150000 },
      { name: 'Setup Cloud Server VM', qty: 1, price: 250000 },
      { name: 'Maintenance Bulanan', qty: 1, price: 100000 },
    ],
    discount: 50000,
    tax: 0,
    shippingFee: 0,
    note: 'Layanan digital yang sudah diaktifkan tidak dapat dibatalkan (Non-refundable).',
    footerTitle: 'Transaksi Berhasil',
  };
}
