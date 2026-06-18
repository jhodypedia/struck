const { createCanvas } = require('canvas');

/**
 * Format angka jadi Rupiah
 */
function formatRupiah(angka) {
  const num = Number(angka) || 0;
  return 'Rp ' + num.toLocaleString('id-ID');
}

/**
 * Format tanggal jadi format Indonesia
 */
function formatTanggal(date) {
  const d = date instanceof Date ? date : new Date(date);
  const hari = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${hari}, ${jam}`;
}

/**
 * Pecah teks panjang jadi beberapa baris
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
 * Gambar garis solid modern dan tipis
 */
function drawDivider(ctx, x1, y, x2, color = '#E4E4E7') { // Zinc 200
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
 * Gambar badge status bergaya soft-premium (Light Mode)
 */
function drawBadge(ctx, text, x, y) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const paddingX = 12;
  const paddingY = 6;
  const badgeWidth = textWidth + (paddingX * 2);
  const badgeHeight = 22;

  // Background Badge (Soft Emerald)
  ctx.fillStyle = '#ECFDF5'; 
  ctx.beginPath();
  ctx.roundRect(x - badgeWidth, y - 14, badgeWidth, badgeHeight, 6);
  ctx.fill();

  // Text Badge (Dark Emerald)
  ctx.fillStyle = '#059669'; 
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

  height += 60;  // padding top
  height += 80;  // brand
  height += 30;  // separator
  height += 120; // info transaksi
  height += 30;  // separator

  items.forEach((item) => {
    height += 30; 
    if ((item.name || '').length > 28) height += 20;
  });

  height += 30;  // separator
  height += 130; // subtotal dll
  height += 30;  // separator
  height += 90;  // footer

  if (data.note) height += 40;

  return Math.max(height, 550);
}

/**
 * Generator utama: membangun struk digital Super HD
 * @param {Object} data - data struk
 * @returns {Buffer} PNG buffer
 */
function generateReceipt(data) {
  // --- KONFIGURASI SUPER HD ---
  const SCALE = 3; // 3x Lipat Resolusi (Retina Display Quality)
  const BASE_WIDTH = 560;
  const BASE_HEIGHT = calculateHeight(data);
  const PAD = 40; 

  // Buat kanvas dengan resolusi besar
  const canvas = createCanvas(BASE_WIDTH * SCALE, BASE_HEIGHT * SCALE);
  const ctx = canvas.getContext('2d');

  // Skalakan context agar kita tetap bisa menulis koordinat 1x (normal)
  ctx.scale(SCALE, SCALE);

  // --- Background (Light Mode Premium) ---
  ctx.fillStyle = '#FFFFFF'; // Pure White
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  // --- Top Accent Line (Sleek Black/Zinc 900) ---
  ctx.fillStyle = '#18181B'; 
  ctx.fillRect(0, 0, BASE_WIDTH, 6);

  let y = 70;

  // --- Header: Brand ---
  ctx.fillStyle = '#18181B'; // Zinc 900
  ctx.font = '900 32px sans-serif'; // Font lebih tebal dan tegas
  ctx.textAlign = 'center';
  ctx.fillText(data.merchantName || 'PANSA GROUP', BASE_WIDTH / 2, y);
  y += 28;

  if (data.merchantAddress) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#71717A'; // Zinc 500
    const addrLines = wrapText(ctx, data.merchantAddress, BASE_WIDTH - PAD * 2);
    addrLines.forEach((line) => {
      ctx.fillText(line, BASE_WIDTH / 2, y);
      y += 20;
    });
  }

  y += 15;
  drawDivider(ctx, PAD, y, BASE_WIDTH - PAD);
  y += 35;

  // --- Info transaksi ---
  ctx.textAlign = 'left';

  const infoRow = (label, value, isBadge = false) => {
    ctx.fillStyle = '#71717A'; // Teks Label
    ctx.font = '13px sans-serif';
    ctx.fillText(label, PAD, y);
    
    if (isBadge) {
      drawBadge(ctx, value, BASE_WIDTH - PAD, y);
    } else {
      ctx.fillStyle = '#18181B'; // Teks Value
      ctx.font = '600 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(value ?? '-'), BASE_WIDTH - PAD, y);
      ctx.textAlign = 'left';
    }
    y += 26; 
  };

  infoRow('No. Transaksi', data.txid || '-');
  infoRow('Tanggal', formatTanggal(data.date || new Date()));
  if (data.customerName) infoRow('Pelanggan', data.customerName);
  if (data.paymentMethod) infoRow('Metode Bayar', data.paymentMethod);
  infoRow('Status', data.status || 'LUNAS', true);

  y += 15;
  drawDivider(ctx, PAD, y, BASE_WIDTH - PAD);
  y += 35;

  // --- Daftar item ---
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#A1A1AA'; // Zinc 400
  ctx.fillText('ITEM TRANSAKSI', PAD, y);
  y += 28;

  const items = data.items || [];
  items.forEach((item) => {
    const qty = item.qty || 1;
    const price = item.price || 0;
    const subtotal = item.subtotal ?? qty * price;

    ctx.font = '600 15px sans-serif';
    ctx.fillStyle = '#18181B';

    const nameLines = wrapText(ctx, item.name || 'Item', 300);
    ctx.fillText(nameLines[0], PAD, y);

    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(subtotal), BASE_WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += 20;

    if (nameLines.length > 1) {
      ctx.fillText(nameLines[1], PAD, y);
      y += 18;
    }

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#71717A';
    ctx.fillText(`${qty} x ${formatRupiah(price)}`, PAD, y);
    y += 30;
  });

  drawDivider(ctx, PAD, y, BASE_WIDTH - PAD);
  y += 35;

  // --- Ringkasan total ---
  const subtotalAll = data.subtotal ?? items.reduce((sum, i) => sum + (i.subtotal ?? i.qty * i.price), 0);

  const totalRow = (label, value, big = false) => {
    ctx.font = big ? '800 18px sans-serif' : '14px sans-serif';
    ctx.fillStyle = big ? '#18181B' : '#71717A';
    ctx.fillText(label, PAD, y);
    
    if (big) ctx.fillStyle = '#2563EB'; // Aksentuasi Biru Premium untuk Total
    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(value), BASE_WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += big ? 30 : 24;
  };

  totalRow('Subtotal', subtotalAll);
  if (data.discount) totalRow('Diskon', -Math.abs(data.discount));
  if (data.tax) totalRow('Pajak', data.tax);
  if (data.shippingFee) totalRow('Biaya Layanan', data.shippingFee);

  y += 10;
  drawDivider(ctx, PAD, y, BASE_WIDTH - PAD);
  y += 35;

  const total = data.total ?? (subtotalAll - (data.discount || 0) + (data.tax || 0) + (data.shippingFee || 0));
  totalRow('TOTAL BAYAR', total, true);

  y += 25;

  // --- Footer ---
  ctx.fillStyle = '#F4F4F5'; // Zinc 100 (Sangat soft gray)
  ctx.beginPath();
  ctx.roundRect(PAD, y, BASE_WIDTH - (PAD * 2), 80, 8);
  ctx.fill();

  y += 32;
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#18181B';
  ctx.fillText(data.footerTitle || 'Transaksi Berhasil', BASE_WIDTH / 2, y);
  y += 22;

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#71717A';
  ctx.fillText('Dokumen digital ini sah dan diterbitkan oleh sistem.', BASE_WIDTH / 2, y);

  return canvas.toBuffer('image/png', {
    compressionLevel: 6, // Optimasi ukuran file karena resolusi besar
    filters: canvas.PNG_FILTER_NONE
  });
}

module.exports = { generateReceipt, formatRupiah, formatTanggal };
