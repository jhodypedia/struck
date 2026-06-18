const { createCanvas } = require('canvas');

/**
 * Format angka jadi Rupiah, contoh: 15000 -> "Rp 15.000"
 */
function formatRupiah(angka) {
  const num = Number(angka) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

/**
 * Format tanggal jadi format Indonesia, contoh: 18 Jun 2026, 14:30
 */
function formatTanggal(date) {
  const d = date instanceof Date ? date : new Date(date);
  const hari = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${hari}, ${jam}`;
}

/**
 * Pecah teks panjang jadi beberapa baris agar tidak overflow lebar canvas
 */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Gambar garis solid modern (pengganti garis putus-putus)
 */
function drawDivider(ctx, x1, y, x2, color = '#27272A') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Gambar badge status (contoh: LUNAS dengan background hijau)
 */
function drawBadge(ctx, text, x, y) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const paddingX = 12;
  const paddingY = 6;
  const badgeWidth = textWidth + (paddingX * 2);
  const badgeHeight = 22;

  // Background Badge (Emerald / Green)
  ctx.fillStyle = '#064E3B'; 
  ctx.beginPath();
  ctx.roundRect(x - badgeWidth, y - 14, badgeWidth, badgeHeight, 6);
  ctx.fill();

  // Text Badge
  ctx.fillStyle = '#34D399'; 
  ctx.textAlign = 'center';
  ctx.fillText(text, x - (badgeWidth / 2), y + 1);
  ctx.restore();
}

/**
 * Hitung tinggi canvas dinamis
 */
function calculateHeight(data) {
  const items = data.items || [];
  let height = 0;

  height += 60;  // padding top + logo/header spacing
  height += 80;  // nama brand & deskripsi
  height += 30;  // separator
  height += 120; // info transaksi
  height += 30;  // separator

  items.forEach((item) => {
    height += 30; // spacing per item (premium lebih lega)
    if ((item.name || '').length > 28) height += 20;
  });

  height += 30;  // separator sebelum total
  height += 130; // subtotal, diskon, pajak, total
  height += 30;  // separator
  height += 90;  // footer

  if (data.note) height += 40;

  return Math.max(height, 550);
}

/**
 * Generator utama: membangun struk digital dari data transaksi
 * @param {Object} data - data struk
 * @returns {Buffer} PNG buffer
 */
function generateReceipt(data) {
  const WIDTH = 560;
  const HEIGHT = calculateHeight(data);
  const PAD = 40; // Padding lebih lebar untuk kesan premium

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // --- Background (Dark Mode Premium) ---
  ctx.fillStyle = '#09090B'; // Zinc 950
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // --- Top Accent Line (Neon Glow vibe) ---
  ctx.fillStyle = '#3B82F6'; // Blue 500
  ctx.fillRect(0, 0, WIDTH, 4);

  let y = 60;

  // --- Header: Brand ---
  ctx.fillStyle = '#FAFAFA'; // Zinc 50
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.merchantName || 'PANSA GROUP', WIDTH / 2, y);
  y += 28;

  if (data.merchantAddress) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#A1A1AA'; // Zinc 400
    const addrLines = wrapText(ctx, data.merchantAddress, WIDTH - PAD * 2);
    addrLines.forEach((line) => {
      ctx.fillText(line, WIDTH / 2, y);
      y += 20;
    });
  }

  y += 10;
  drawDivider(ctx, PAD, y, WIDTH - PAD);
  y += 30;

  // --- Info transaksi ---
  ctx.textAlign = 'left';

  const infoRow = (label, value, isBadge = false) => {
    ctx.fillStyle = '#A1A1AA';
    ctx.font = '13px sans-serif';
    ctx.fillText(label, PAD, y);
    
    if (isBadge) {
      drawBadge(ctx, value, WIDTH - PAD, y);
    } else {
      ctx.fillStyle = '#FAFAFA';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(value ?? '-'), WIDTH - PAD, y);
      ctx.textAlign = 'left';
    }
    y += 26; // Spacing lebih lega
  };

  infoRow('No. Transaksi', data.txid || '-');
  infoRow('Tanggal', formatTanggal(data.date || new Date()));
  if (data.customerName) infoRow('Pelanggan', data.customerName);
  if (data.paymentMethod) infoRow('Metode Bayar', data.paymentMethod);
  infoRow('Status', data.status || 'LUNAS', true); // Panggil fungsi badge

  y += 10;
  drawDivider(ctx, PAD, y, WIDTH - PAD);
  y += 30;

  // --- Daftar item ---
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#71717A'; // Zinc 500
  ctx.fillText('ITEM TRANSAKSI', PAD, y);
  y += 24;

  const items = data.items || [];
  items.forEach((item) => {
    const qty = item.qty || 1;
    const price = item.price || 0;
    const subtotal = item.subtotal ?? qty * price;

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#FAFAFA';

    const nameLines = wrapText(ctx, item.name || 'Item', 300);
    ctx.fillText(nameLines[0], PAD, y);

    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(subtotal), WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += 20;

    if (nameLines.length > 1) {
      ctx.fillText(nameLines[1], PAD, y);
      y += 18;
    }

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#A1A1AA';
    ctx.fillText(`${qty} x ${formatRupiah(price)}`, PAD, y);
    y += 28;
  });

  drawDivider(ctx, PAD, y, WIDTH - PAD);
  y += 30;

  // --- Ringkasan total ---
  const subtotalAll = data.subtotal ?? items.reduce((sum, i) => sum + (i.subtotal ?? i.qty * i.price), 0);

  const totalRow = (label, value, big = false) => {
    ctx.font = big ? 'bold 18px sans-serif' : '14px sans-serif';
    ctx.fillStyle = big ? '#FAFAFA' : '#A1A1AA';
    ctx.fillText(label, PAD, y);
    
    if (big) ctx.fillStyle = '#60A5FA'; // Aksentuasi warna biru untuk Total Bayar
    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(value), WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += big ? 30 : 24;
  };

  totalRow('Subtotal', subtotalAll);
  if (data.discount) totalRow('Diskon', -Math.abs(data.discount));
  if (data.tax) totalRow('Pajak', data.tax);
  if (data.shippingFee) totalRow('Biaya Layanan', data.shippingFee);

  y += 6;
  drawDivider(ctx, PAD, y, WIDTH - PAD);
  y += 30;

  const total = data.total ?? (subtotalAll - (data.discount || 0) + (data.tax || 0) + (data.shippingFee || 0));
  totalRow('TOTAL BAYAR', total, true);

  y += 20;

  // --- Footer ---
  ctx.fillStyle = '#18181B'; // Background kotak footer
  ctx.beginPath();
  ctx.roundRect(PAD, y, WIDTH - (PAD * 2), 80, 8);
  ctx.fill();

  y += 32;
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#FAFAFA';
  ctx.fillText(data.footerTitle || 'Transaksi Berhasil', WIDTH / 2, y);
  y += 22;

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#A1A1AA';
  ctx.fillText('Dokumen digital ini sah dan diterbitkan oleh sistem.', WIDTH / 2, y);

  return canvas.toBuffer('image/png');
}

module.exports = { generateReceipt, formatRupiah, formatTanggal };
