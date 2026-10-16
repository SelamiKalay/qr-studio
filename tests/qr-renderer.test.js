'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../js/qr-encoder.js');
const R = require('../js/qr-renderer.js');
const { HAS_ZBAR, HAS_RSVG, tmpFile, svgToPng, decodeImage } = require('./helpers.js');

const TEXT = 'https://selamikalay.github.io/qr-studio/';
const encoded = QR.encode(TEXT, { ecLevel: 'M' });

// Arayüzdeki seçeneklerle aynı listeler (js/app.js)
const DOT_SHAPES = ['square', 'rounded', 'extra-rounded', 'dot', 'diamond', 'classy'];
const EYE_FRAME_SHAPES = ['square', 'rounded', 'circle', 'leaf', 'leaf-alt'];
const EYE_BALL_SHAPES = ['square', 'rounded', 'circle', 'diamond', 'leaf'];

test('boyutlar: sessiz bölge (margin) ve çerçeve tasarım ölçüsüne eklenir', () => {
  const n = encoded.size;
  assert.equal(R.build(encoded.matrix, {}).width, n + 2 * R.DEFAULTS.margin);
  assert.equal(R.build(encoded.matrix, { margin: 0 }).width, n);
  assert.equal(R.build(encoded.matrix, { margin: -3 }).width, n, 'negatif margin 0 sayılır');
  const framed = R.build(encoded.matrix, { frame: { enabled: true, style: 'scan-me-bottom' } });
  assert.ok(framed.height > framed.width, 'alt etiketli çerçeve yüksekliği artırır');
});

test('SVG çıktısı: kök öğe, viewBox ve piksel boyutu', () => {
  const built = R.build(encoded.matrix, {});
  const svg = R.toSVG(built, 512);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${built.width} ${built.height}"`));
  assert.match(svg, /width="512"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});

test('şeffaf arka planda zemin dikdörtgeni çizilmez', () => {
  const solid = R.build(encoded.matrix, {});
  const clear = R.build(encoded.matrix, { transparentBackground: true });
  assert.equal(solid.ops[0].fill, R.DEFAULTS.background);
  assert.equal(clear.ops.length, solid.ops.length - 1);
});

test('çerçeve metnindeki özel karakterler SVG içinde kaçırılır', () => {
  const built = R.build(encoded.matrix, {
    frame: { enabled: true, style: 'scan-me-bottom', text: 'A & B <tara> "şimdi"' },
  });
  const svg = R.toSVG(built, 400);
  assert.ok(!svg.includes('<tara>'), 'ham < > kalmamalı');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#)/.test(svg), 'kaçırılmamış & kalmamalı');
});

/* ---------------- Uçtan uca: çizilen SVG taranabilir mi? ---------------- */

const E2E = !(HAS_ZBAR && HAS_RSVG) && 'zbarimg veya rsvg-convert yok';

function scan(options) {
  const svg = R.toSVG(R.build(encoded.matrix, options), 800);
  return decodeImage(svgToPng(svg, tmpFile('r.png')));
}

for (const dotShape of DOT_SHAPES) {
  test(`taranabilir: nokta şekli "${dotShape}"`, { skip: E2E }, () => {
    assert.equal(scan({ dotShape }), TEXT);
  });
}
for (const eyeFrameShape of EYE_FRAME_SHAPES) {
  test(`taranabilir: göz çerçevesi "${eyeFrameShape}"`, { skip: E2E }, () => {
    assert.equal(scan({ eyeFrameShape }), TEXT);
  });
}
for (const eyeBallShape of EYE_BALL_SHAPES) {
  test(`taranabilir: göz bebeği "${eyeBallShape}"`, { skip: E2E }, () => {
    assert.equal(scan({ eyeBallShape }), TEXT);
  });
}

test('taranabilir: gradient, renkli göz ve çerçeveli tasarım', { skip: E2E }, () => {
  assert.equal(scan({
    dotShape: 'classy', eyeFrameShape: 'leaf', eyeBallShape: 'leaf',
    gradient: { enabled: true, type: 'linear', angle: 45, colors: ['#1E3A8A', '#7C3AED'] },
    eyeColor: '#B91C1C',
  }), TEXT);
  assert.equal(scan({ frame: { enabled: true, style: 'badge', text: 'BENİ TARA' } }), TEXT);
  assert.equal(scan({ gradient: { enabled: true, type: 'radial', colors: ['#000000', '#334155'] } }), TEXT);
});
