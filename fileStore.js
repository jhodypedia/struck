const fs = require('fs');
const fsp = require('fs').promises; // Menggunakan versi Promise untuk performa non-blocking
const path = require('path');
const crypto = require('crypto');

const STORAGE_DIR = path.join(__dirname, 'storage');
const TTL_MS = 5 * 60 * 1000; // 5 menit

// Inisialisasi folder storage saat server menyala
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  console.log('[PansaGroup Storage] Direktori penyimpanan berhasil dibuat.');
}

// Menyimpan referensi timer aktif per file
const activeTimers = new Map();

/**
 * Generate nama file random & aman (Hex 32 karakter)
 */
function generateRandomFilename() {
  const randomId = crypto.randomBytes(16).toString('hex');
  return `struk_${randomId}.png`;
}

/**
 * Simpan buffer PNG ke disk dengan nama random.
 * Otomatis dijadwalkan untuk dihapus setelah TTL_MS.
 *
 * @param {Buffer} buffer - data PNG
 * @returns {{ filename: string, filePath: string, expiresAt: number }}
 */
function saveReceiptFile(buffer) {
  const filename = generateRandomFilename();
  const filePath = path.join(STORAGE_DIR, filename);

  // Penulisan file sinkron (cepat untuk ukuran kecil) agar API response instan
  fs.writeFileSync(filePath, buffer);

  const expiresAt = Date.now() + TTL_MS;
  scheduleDelete(filename);

  return { filename, filePath, expiresAt };
}

/**
 * Jadwalkan penghapusan file setelah waktu TTL habis.
 */
function scheduleDelete(filename) {
  if (activeTimers.has(filename)) {
    clearTimeout(activeTimers.get(filename));
  }

  const timer = setTimeout(async () => {
    await deleteFile(filename);
    activeTimers.delete(filename);
  }, TTL_MS);

  activeTimers.set(filename, timer);
}

/**
 * Hapus file dari disk secara asynchronous.
 */
async function deleteFile(filename) {
  const filePath = path.join(STORAGE_DIR, filename);
  try {
    await fsp.unlink(filePath);
    console.log(`[PansaGroup Storage] File terhapus (TTL habis): ${filename}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[PansaGroup Storage] Gagal hapus file ${filename}:`, err.message);
    }
  }
}

/**
 * Ambil path file jika masih ada & valid.
 * Melindungi server dari serangan Path Traversal.
 */
function getFilePath(filename) {
  // Validasi Regex ketat
  if (!/^struk_[a-f0-9]{32}\.png$/.test(filename)) {
    return null;
  }

  const filePath = path.join(STORAGE_DIR, filename);

  // Verifikasi akhir memastikan file tidak keluar dari STORAGE_DIR
  if (!filePath.startsWith(STORAGE_DIR)) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return filePath;
}

/**
 * Cleanup job: Membersihkan file yatim (orphaned files) akibat server restart.
 * Menggunakan Async/Await murni agar tidak membebani proses Node.js utama.
 */
async function cleanupExpiredFiles() {
  try {
    const files = await fsp.readdir(STORAGE_DIR);
    const now = Date.now();

    for (const filename of files) {
      const filePath = path.join(STORAGE_DIR, filename);
      
      try {
        const stats = await fsp.stat(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > TTL_MS) {
          await fsp.unlink(filePath);
          console.log(`[PansaGroup Storage] Cleanup system menghapus file usang: ${filename}`);
        }
      } catch (statErr) {
        // Abaikan file jika sudah terhapus oleh proses lain di tengah jalan
        if (statErr.code !== 'ENOENT') {
          console.error(`[PansaGroup Storage] Gagal cek status file ${filename}:`, statErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[PansaGroup Storage] Gagal membaca folder storage:', err.message);
  }
}

/**
 * Jalankan interval pembersihan setiap 1 menit.
 */
function startCleanupInterval() {
  cleanupExpiredFiles(); // Eksekusi pertama saat server menyala
  setInterval(cleanupExpiredFiles, 60 * 1000);
}

module.exports = {
  saveReceiptFile,
  getFilePath,
  deleteFile,
  startCleanupInterval,
  STORAGE_DIR,
  TTL_MS,
};
