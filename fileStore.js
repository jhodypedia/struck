const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORAGE_DIR = path.join(__dirname, 'storage');
const TTL_MS = 5 * 60 * 1000; // 5 menit

// Pastikan folder storage ada
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Simpan referensi timer aktif per file, supaya bisa di-clear kalau perlu
// (misal file diakses ulang dan mau di-refresh masa berlakunya).
const activeTimers = new Map();

/**
 * Generate nama file random & aman (tidak bisa ditebak), contoh:
 * struk_3f9a1c2e8b7d4f6a1029384756abcdef.png
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

  fs.writeFileSync(filePath, buffer);

  const expiresAt = Date.now() + TTL_MS;
  scheduleDelete(filename);

  return { filename, filePath, expiresAt };
}

/**
 * Jadwalkan penghapusan file setelah TTL_MS milidetik.
 */
function scheduleDelete(filename) {
  // Kalau sebelumnya sudah ada timer untuk file ini, batalkan dulu (hindari dobel)
  if (activeTimers.has(filename)) {
    clearTimeout(activeTimers.get(filename));
  }

  const timer = setTimeout(() => {
    deleteFile(filename);
    activeTimers.delete(filename);
  }, TTL_MS);

  activeTimers.set(filename, timer);
}

/**
 * Hapus file dari disk jika masih ada. Aman dipanggil walau file sudah tidak ada.
 */
function deleteFile(filename) {
  const filePath = path.join(STORAGE_DIR, filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`Gagal hapus file ${filename}:`, err.message);
    } else if (!err) {
      console.log(`File dihapus (TTL habis): ${filename}`);
    }
  });
}

/**
 * Ambil path file jika masih ada & valid. Return null jika tidak ditemukan
 * atau filename mencurigakan (proteksi path traversal).
 */
function getFilePath(filename) {
  // Validasi format nama file: hanya boleh sesuai pola yang kita generate sendiri
  if (!/^struk_[a-f0-9]{32}\.png$/.test(filename)) {
    return null;
  }

  const filePath = path.join(STORAGE_DIR, filename);

  // Pastikan hasil resolve tetap di dalam STORAGE_DIR (anti path traversal)
  if (!filePath.startsWith(STORAGE_DIR)) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return filePath;
}

/**
 * Cleanup job: hapus semua file yang umurnya sudah lebih dari TTL_MS,
 * berguna sebagai jaga-jaga kalau server pernah restart sehingga
 * timer in-memory hilang tapi file lama masih tersisa di disk.
 */
function cleanupExpiredFiles() {
  fs.readdir(STORAGE_DIR, (err, files) => {
    if (err) return console.error('Gagal baca folder storage:', err.message);

    const now = Date.now();
    files.forEach((filename) => {
      const filePath = path.join(STORAGE_DIR, filename);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        const age = now - stats.mtimeMs;
        if (age > TTL_MS) {
          deleteFile(filename);
        }
      });
    });
  });
}

/**
 * Jalankan cleanup berkala setiap 1 menit, sebagai pengaman tambahan
 * di luar mekanisme setTimeout per-file.
 */
function startCleanupInterval() {
  cleanupExpiredFiles(); // jalankan sekali saat startup (bersihkan sisa file lama)
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
