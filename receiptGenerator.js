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
 * Gambar garis putus-putus horizontal (separator ala struk kasir)
 */
function drawDashedLine(ctx, x1, y, x2, color = '#999999') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Hitung tinggi canvas dinamis berdasarkan jumlah item & catatan,
 * supaya struk tidak terpotong / tidak terlalu banyak whitespace.
 */
function calculateHeight(data) {
  const items = data.items || [];
  let height = 0;

  height += 40;  // padding top
  height += 90;  // header (nama toko, alamat, telp)
  height += 30;  // separator + spacing
  height += 110; // info transaksi (txid, tanggal, kasir, metode bayar)
  height += 30;  // separator

  items.forEach((item) => {
    height += 28;
    if ((item.name || '').length > 28) height += 18;
  });

  height += 20;  // separator sebelum total
  height += 130; // subtotal, diskon, pajak, total
  height += 30;  // separator
  height += 90;  // footer (terima kasih, catatan)

  if (data.note) height += 40;

  return Math.max(height, 500);
}

/**
 * Generator utama: membangun struk digital dari data transaksi
 * @param {Object} data - data struk
 * @returns {Buffer} PNG buffer
 */
function generateReceipt(data) {
  const WIDTH = 560;
  const HEIGHT = calculateHeight(data);
  const PAD = 32;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // --- Background ---
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  let y = 36;

  // --- Header: nama toko ---
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.merchantName || 'Toko Online', WIDTH / 2, y);
  y += 28;

  if (data.merchantAddress) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#555555';
    const addrLines = wrapText(ctx, data.merchantAddress, WIDTH - PAD * 2);
    addrLines.forEach((line) => {
      ctx.fillText(line, WIDTH / 2, y);
      y += 17;
    });
  }

  if (data.merchantPhone) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText(`Telp: ${data.merchantPhone}`, WIDTH / 2, y);
    y += 17;
  }

  y += 12;
  drawDashedLine(ctx, PAD, y, WIDTH - PAD);
  y += 26;

  // --- Info transaksi ---
  ctx.textAlign = 'left';
  ctx.font = '13px sans-serif';

  const infoRow = (label, value) => {
    ctx.fillStyle = '#777777';
    ctx.font = '13px sans-serif';
    ctx.fillText(label, PAD, y);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(value ?? '-'), WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += 20;
  };

  infoRow('No. Transaksi', data.txid || '-');
  infoRow('Tanggal', formatTanggal(data.date || new Date()));
  if (data.cashier) infoRow('Kasir', data.cashier);
  if (data.customerName) infoRow('Pelanggan', data.customerName);
  if (data.paymentMethod) infoRow('Metode Bayar', data.paymentMethod);
  infoRow('Status', data.status || 'LUNAS');

  y += 6;
  drawDashedLine(ctx, PAD, y, WIDTH - PAD);
  y += 24;

  // --- Daftar item ---
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#999999';
  ctx.fillText('ITEM', PAD, y);
  ctx.textAlign = 'right';
  ctx.fillText('SUBTOTAL', WIDTH - PAD, y);
  ctx.textAlign = 'left';
  y += 18;

  const items = data.items || [];
  items.forEach((item) => {
    const qty = item.qty || 1;
    const price = item.price || 0;
    const subtotal = item.subtotal ?? qty * price;

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#111111';

    const nameLines = wrapText(ctx, item.name || 'Item', 320);
    ctx.fillText(nameLines[0], PAD, y);

    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(subtotal), WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += 18;

    if (nameLines.length > 1) {
      ctx.fillText(nameLines[1], PAD, y);
      y += 16;
    }

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText(`${qty} x ${formatRupiah(price)}`, PAD, y);
    y += 22;
  });

  drawDashedLine(ctx, PAD, y, WIDTH - PAD);
  y += 24;

  // --- Ringkasan total ---
  const subtotalAll = data.subtotal ?? items.reduce((sum, i) => sum + (i.subtotal ?? i.qty * i.price), 0);

  const totalRow = (label, value, big = false) => {
    ctx.font = big ? 'bold 17px sans-serif' : '13px sans-serif';
    ctx.fillStyle = big ? '#111111' : '#555555';
    ctx.fillText(label, PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatRupiah(value), WIDTH - PAD, y);
    ctx.textAlign = 'left';
    y += big ? 26 : 20;
  };

  totalRow('Subtotal', subtotalAll);
  if (data.discount) totalRow('Diskon', -Math.abs(data.discount));
  if (data.tax) totalRow('Pajak', data.tax);
  if (data.shippingFee) totalRow('Ongkir', data.shippingFee);

  y += 4;
  drawDashedLine(ctx, PAD, y, WIDTH - PAD);
  y += 26;

  const total = data.total ?? (subtotalAll - (data.discount || 0) + (data.tax || 0) + (data.shippingFee || 0));
  totalRow('TOTAL', total, true);

  y += 10;
  drawDashedLine(ctx, PAD, y, WIDTH - PAD);
  y += 30;

  // --- Footer ---
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText(data.footerTitle || 'Terima kasih telah berbelanja!', WIDTH / 2, y);
  y += 20;

  if (data.note) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#777777';
    const noteLines = wrapText(ctx, data.note, WIDTH - PAD * 2);
    noteLines.forEach((line) => {
      ctx.fillText(line, WIDTH / 2, y);
      y += 16;
    });
    y += 6;
  }

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('Struk ini dibuat otomatis oleh sistem', WIDTH / 2, y);

  return canvas.toBuffer('image/png');
}

module.exports = { generateReceipt, formatRupiah, formatTanggal };
