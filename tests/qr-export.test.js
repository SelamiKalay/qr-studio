'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../js/qr-encoder.js');
const R = require('../js/qr-renderer.js');
const X = require('../js/qr-export.js');
const { HAS_ZBAR, HAS_PDFTOPPM, tmpFile, pdfToPng, decodeImage } = require('./helpers.js');

test('slugify: Türkçe harfler, URL öneki ve uzunluk', () => {
  assert.equal(X.slugify('https://Örnek Şirket.com/ğ'), 'ornek-sirket-com-g');
  assert.equal(X.slugify('İstanbul Çağrı Merkezi'), 'istanbul-cagri-merkezi');
  assert.equal(X.slugify(''), 'qr');
  assert.equal(X.slugify('!!!'), 'qr');
  assert.equal(X.slugify(null), 'qr');
  const s = X.slugify('aaaa bbbb cccc dddd eeee ffff gggg', 10);
  assert.ok(s.length <= 10 && !s.endsWith('-'), s);
});

test('makeFilename: qr-<slug>-YYYYMMDD-HHMM.<uzantı>', () => {
  assert.match(X.makeFilename('Merhaba Dünya', 'png'), /^qr-merhaba-dunya-\d{8}-\d{4}\.png$/);
  assert.match(X.makeFilename('', 'svg'), /^qr-qr-\d{8}-\d{4}\.svg$/);
});

test('svgToDataUrl: UTF-8 içerik base64 ile kayıpsız taşınır', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>ğüşıöç 🚀</text></svg>';
  const url = X.svgToDataUrl(svg);
  assert.ok(url.startsWith('data:image/svg+xml;base64,'));
  const decoded = Buffer.from(url.split(',')[1], 'base64').toString('utf8');
  assert.equal(decoded, svg);
});

async function pdfBytes(text, opts) {
  const built = R.build(QR.encode(text, { ecLevel: 'M' }).matrix, {});
  const blob = await X.buildPDF(built, opts);
  return Buffer.from(await blob.arrayBuffer());
}

test('PDF yapısı: başlık, xref ofsetleri ve trailer tutarlı', async () => {
  const buf = await pdfBytes('PDF yapı testi', { widthMm: 60 });
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));

  const startxref = Number(s.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.ok(s.startsWith('xref', startxref), 'startxref xref tablosunu göstermeli');

  const xref = s.slice(startxref).split('\n');
  const count = Number(xref[1].split(' ')[1]);
  for (let i = 1; i < count; i++) {
    const offset = Number(xref[2 + i].slice(0, 10));
    assert.ok(s.startsWith(`${i} 0 obj`, offset), `nesne ${i} ofseti (${offset}) yanlış`);
  }
  assert.match(s, new RegExp(`/Size ${count} /Root \\d+ 0 R`));
});

test('PDF sayfa boyutu: page=fit seçilen genişliğe göre ölçeklenir', async () => {
  const MM = 72 / 25.4;
  const s = (await pdfBytes('ölçü', { widthMm: 50, page: 'fit' })).toString('latin1');
  const [, w, h] = s.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  assert.ok(Math.abs(Number(w) - (50 + 16) * MM) < 0.5, `genişlik ${w}`);
  assert.ok(Math.abs(Number(w) - Number(h)) < 0.5, 'kare QR için sayfa kare olmalı');
});

test('taranabilir: PDF çıktısı', { skip: !(HAS_ZBAR && HAS_PDFTOPPM) && 'zbarimg veya pdftoppm yok' }, async () => {
  const text = 'PDF ile taranabilir ✓ ğüş';
  const png = pdfToPng(await pdfBytes(text, { widthMm: 60 }), tmpFile('p.png'));
  assert.equal(decodeImage(png), text);
});
