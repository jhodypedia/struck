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
 * Gambar garis pembatas
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
 * Gambar badge status bergaya premium
 */
function drawBadge(ctx, text, x, y) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const paddingX = 12;
  const badgeWidth = textWidth + (paddingX * 2);
  const badgeHeight = 22;

  // Background Badge (Soft Blue/Emerald)
  ctx.fillStyle = text === 'LUNAS' ? '#ECFDF5' : '#FEF2F2'; 
  ctx.beginPath();
  ctx.roundRect(x - badgeWidth, y - 14, badgeWidth, badgeHeight, 6);
  ctx.fill();

  // Text Badge
  ctx.fillStyle = text === 'LUNAS' ? '#059669' : '#DC2626'; 
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

  height += 80;  // Header spacing
  height += 70;  // Brand
  height += 30;  // separator
  height += 120; // info transaksi
  height += 30;  // separator

  items.forEach((item) => {
    height += 30; 
    if ((item.name || '').length > 28) height += 20;
  });

  height += 30;  // separator
  height += 100; // subtotal dll
  height += 80;  // Total Box Highlight (Lebih tinggi)
  height += 60;  // spacing

  // Hitung tinggi note
  if (data.note) {
    const tempCanvas = createCanvas(100, 100);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = '12px sans-serif';
    const noteLines = wrapText(tempCtx, data.note, 560 - 80);
    height += (noteLines.length * 18);
  }

  height += 60; // footer bottom padding

  return Math.max(height, 600);
}

/**
 * Generator utama: membangun struk digital Super HD Premium
 * @param {Object} data - data struk
 * @returns {Buffer} PNG buffer
 */
function generateReceipt(data) {
  const SCALE = 3; 
  const BASE_WIDTH = 560;
  const BASE_HEIGHT = calculateHeight(data);
  const PAD = 40; 

  const canvas = createCanvas(BASE_WIDTH * SCALE, BASE_HEIGHT * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // --- Background Pure White ---
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  // --- Outer Border (Frame Kartu Halus) ---
  ctx.strokeStyle = '#F4F4F5'; // Sangat soft
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, BASE_WIDTH - 2, BASE_HEIGHT - 2);

  // --- Top Accent Line (Pansa Blue Premium) ---
  ctx.fillStyle = '#2563EB'; 
  ctx.fillRect(0, 0, BASE_WIDTH, 6);

  let y = 60;

  // --- Label Resmi ---
  ctx.fillStyle = '#2563EB'; 
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px'; // Jika didukung environment, jika tidak diabaikan
  ctx.fillText('OFFICIAL RECEIPT', BASE_WIDTH / 2, y);
  y += 35;

  // --- Header: Brand ---
  ctx.fillStyle = '#18181B'; 
  ctx.font = '900 28px sans-serif'; 
  ctx.textAlign = 'center';
  ctx.fillText(data.merchantName || 'PANSA GROUP', BASE_WIDTH / 2, y);
  y += 24;

  if (data.merchantAddress) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#71717A'; 
    ctx.fillText(data.merchantAddress, BASE_WIDTH / 2, y);
  }

  y += 25;
  drawDivider(ctx, PAD, y, BASE_WIDTH - PAD);
  y += 35;

  // --- Info transaksi ---
  ctx.textAlign = 'left';

  const infoRow = (label, value, isBadge = false) => {
    ctx.fillStyle = '#71717A'; 
    ctx.font = '13px sans-serif';
    ctx.fillText(label, PAD, y);
    
    if (isBadge) {
      drawBadge(ctx, value, BASE_WIDTH - PAD, y);
    } else {
      ctx.fillStyle = '#18181B'; 
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
  ctx.fillStyle = '#A1A1AA'; 
  ctx.fillText('ITEM TRANSAKSI', PAD, y);
  y += 30;

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

  // --- Ringkasan subtotal ---
  const subtotalAll = data.subtotal ?? items.reduce((sum, i) => sum + (i.subtotal ?? i.qty * i.price), 0);

  const totalRow = (label, value) => {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#71717A';
    ctx.fillText(label, PAD, y);
    
    ctx.fillStyle = '#18181B';
    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(value), BASE_WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += 24;
  };

  totalRow('Subtotal', subtotalAll);
  if (data.discount) totalRow('Diskon', -Math.abs(data.discount));
  if (data.tax) totalRow('Pajak', data.tax);
  if (data.shippingFee) totalRow('Biaya Layanan', data.shippingFee);

  y += 15;

  // --- Kotak Highlight TOTAL BAYAR ---
  const total = data.total ?? (subtotalAll - (data.discount || 0) + (data.tax || 0) + (data.shippingFee || 0));
  
  // Background Kotak Total (Biru Sangat Soft)
  ctx.fillStyle = '#EFF6FF'; 
  ctx.beginPath();
  ctx.roundRect(PAD, y, BASE_WIDTH - (PAD * 2), 60, 8);
  ctx.fill();

  y += 36; // Posisikan text di tengah kotak
  ctx.font = '800 18px sans-serif';
  ctx.fillStyle = '#1E3A8A'; // Biru Tua Elegan
  ctx.fillText('TOTAL BAYAR', PAD + 20, y);
  
  ctx.fillStyle = '#2563EB'; // Biru Pansa
  ctx.textAlign = 'right';
  ctx.fillText(formatRupiah(total), BASE_WIDTH - PAD - 20, y);
  ctx.textAlign = 'left';

  y += 60; // Turun melewati kotak

  // --- Footer Text (Memperbaiki Bug Kosong) ---
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#18181B';
  ctx.fillText(data.footerTitle || 'Transaksi Berhasil', BASE_WIDTH / 2, y);
  y += 22;

  if (data.note) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#71717A';
    const noteLines = wrapText(ctx, data.note, BASE_WIDTH - (PAD * 2));
    noteLines.forEach((line) => {
      ctx.fillText(line, BASE_WIDTH / 2, y);
      y += 18;
    });
  }

  y += 10;
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#A1A1AA'; // Zinc 400
  ctx.fillText('Dokumen digital ini sah dan diterbitkan otomatis oleh sistem.', BASE_WIDTH / 2, y);

  return canvas.toBuffer('image/png', {
    compressionLevel: 6,
    filters: canvas.PNG_FILTER_NONE
  });
}

module.exports = { generateReceipt, formatRupiah, formatTanggal };
