'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../js/qr-encoder.js');
const { HAS_ZBAR, tmpFile, matrixToPGM, decodeImage } = require('./helpers.js');

const I = QR._internal;

/* ---------------- Standarttaki bilinen değerler ---------------- */

test('format bilgisi: ISO/IEC 18004 tablosundaki değerler', () => {
  // (EC seviyesi, maske) -> 15 bitlik format dizisi (maskeleme 0x5412 dahil)
  assert.equal(I.formatBits('L', 0), 0b111011111000100);
  assert.equal(I.formatBits('L', 7), 0b110100101110110);
  assert.equal(I.formatBits('M', 0), 0b101010000010010);
  assert.equal(I.formatBits('M', 5), 0b100000011001110);
  assert.equal(I.formatBits('Q', 0), 0b011010101011111);
  assert.equal(I.formatBits('H', 0), 0b001011010001001);
  assert.equal(I.formatBits('H', 7), 0b000100000111011);
});

test('versiyon bilgisi: 7, 21 ve 40 için BCH(18,6) değerleri', () => {
  assert.equal(I.versionBits(7), 0b000111110010010100);
  assert.equal(I.versionBits(21), 0b010101011010000011);
  assert.equal(I.versionBits(40), 0b101000110001101001);
});

test('Reed-Solomon: "HELLO WORLD" 1-M örneğinin hata düzeltme baytları', () => {
  const data = Uint8Array.from([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
  const ec = Array.from(I.rsEncode(data, 10));
  assert.deepEqual(ec, [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('kapasite tablosu: bilinen karakter sınırları', () => {
  assert.equal(QR.capacityFor(1, 'L', QR.MODE_NUMERIC), 41);
  assert.equal(QR.capacityFor(1, 'L', QR.MODE_ALNUM), 25);
  assert.equal(QR.capacityFor(1, 'L', QR.MODE_BYTE), 17);
  assert.equal(QR.capacityFor(1, 'H', QR.MODE_BYTE), 7);
  assert.equal(QR.capacityFor(10, 'M', QR.MODE_BYTE), 213);
  assert.equal(QR.capacityFor(40, 'L', QR.MODE_NUMERIC), 7089);
  assert.equal(QR.capacityFor(40, 'L', QR.MODE_ALNUM), 4296);
  assert.equal(QR.capacityFor(40, 'L', QR.MODE_BYTE), 2953);
  assert.equal(QR.capacityFor(40, 'H', QR.MODE_BYTE), 1273);
});

test('blok yapısı: her versiyon/EC için toplam kod sözcüğü sayısı doğru', () => {
  // ISO tablosundaki toplam kod sözcüğü (veri + EC) sayıları
  const TOTAL = { 1: 26, 2: 44, 5: 134, 10: 346, 20: 1085, 27: 1828, 40: 3706 };
  for (const [v, total] of Object.entries(TOTAL)) {
    for (const ec of ['L', 'M', 'Q', 'H']) {
      const sum = I.getBlocks(Number(v), ec).reduce((s, b) => s + b.total, 0);
      assert.equal(sum, total, `v${v}-${ec}`);
    }
  }
});

/* ---------------- encode() davranışı ---------------- */

test('mod seçimi ve en küçük uygun versiyon', () => {
  const num = QR.encode('01234567', { ecLevel: 'M' });
  assert.equal(num.mode, 'numeric');
  assert.equal(num.version, 1);
  const alnum = QR.encode('HELLO WORLD', { ecLevel: 'Q' });
  assert.equal(alnum.mode, 'alphanumeric');
  assert.equal(alnum.version, 1);
  const byte = QR.encode('merhaba dünya', { ecLevel: 'L' });
  assert.equal(byte.mode, 'byte');
  assert.equal(byte.size, byte.version * 4 + 17);
  assert.equal(byte.matrix.length, byte.size);
  assert.ok(byte.matrix.every((row) => row.length === byte.size));
});

test('kapasite sınırında doğru versiyon seçilir (capacityFor ile tutarlı)', () => {
  const cases = [
    ['1', QR.MODE_NUMERIC], ['A', QR.MODE_ALNUM], ['a', QR.MODE_BYTE],
  ];
  for (const [ch, mode] of cases) {
    for (const ec of ['L', 'M', 'Q', 'H']) {
      for (const v of [1, 2, 9, 10, 26, 27]) {
        const max = QR.capacityFor(v, ec, mode);
        assert.equal(QR.encode(ch.repeat(max), { ecLevel: ec, minVersion: v }).version, v,
          `${ch} x${max} v${v}-${ec} sığmalı`);
        if (v < 40) {
          assert.equal(QR.encode(ch.repeat(max + 1), { ecLevel: ec, minVersion: v }).version, v + 1,
            `${ch} x${max + 1} v${v}-${ec} taşmalı`);
        }
      }
    }
  }
});

test('boş ve sığmayan içerik anlaşılır hatayla reddedilir', () => {
  assert.throws(() => QR.encode(''), /boş/);
  assert.throws(() => QR.encode(null), /boş/);
  assert.throws(() => QR.encode('x'.repeat(3000), { ecLevel: 'L' }), /çok uzun/);
  assert.throws(() => QR.encode('x'.repeat(30), { ecLevel: 'H', maxVersion: 2 }), /çok uzun/);
});

test('sabit desenler: üç köşe göz deseni ve zamanlama çizgileri', () => {
  const { matrix: m, size } = QR.encode('desen kontrol', { ecLevel: 'M' });
  const eye = [
    [1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1], [1, 0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1, 1],
  ];
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) assert.equal(Number(m[r0 + r][c0 + c]), eye[r][c], `göz (${r0},${c0})`);
    }
  }
  for (let i = 8; i < size - 8; i++) {
    assert.equal(Number(m[6][i]), i % 2 === 0 ? 1 : 0, 'yatay zamanlama');
    assert.equal(Number(m[i][6]), i % 2 === 0 ? 1 : 0, 'dikey zamanlama');
  }
  assert.equal(Number(m[size - 8][8]), 1, 'karanlık modül');
});

test('format bilgisi matrise doğru yazılır (her iki kopya)', () => {
  for (const ec of ['L', 'M', 'Q', 'H']) {
    const r = QR.encode('format', { ecLevel: ec, mask: 3 });
    const m = r.matrix, n = r.size;
    const expected = I.formatBits(ec, 3);
    // 1. kopya: sol üst; bit 14..0 sırası standarttaki yerleşime göre
    const pos1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
                  [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    const pos2 = [[n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8],
                  [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]];
    const read = (pos) => pos.reduce((v, [r2, c]) => (v << 1) | Number(m[r2][c]), 0);
    assert.equal(read(pos1), expected, `${ec} kopya 1`);
    assert.equal(read(pos2), expected, `${ec} kopya 2`);
  }
});

/* ---------------- Uçtan uca: bağımsız okuyucuyla çözme ---------------- */

const SAMPLES = [
  ['sayısal', '3141592653589793238462643383279'],
  ['alfanümerik', 'HTTPS://ORNEK.COM/$%*+-./:'],
  ['URL', 'https://selamikalay.github.io/qr-studio/?ref=test&id=42'],
  ['Türkçe UTF-8', 'Şahane bir gün: ğüşıöç ĞÜŞİÖÇ'],
  ['emoji', 'QR Studio 🚀✅'],
  ['çok satırlı', 'BEGIN:VCARD\nVERSION:3.0\nFN:Selami Kalay\nEND:VCARD'],
  ['büyük (çok bloklu)', 'Lorem ipsum dolor sit amet, '.repeat(30)],
];

for (const [name, text] of SAMPLES) {
  for (const ec of ['L', 'M', 'Q', 'H']) {
    test(`zbar ile çözülür: ${name} / ${ec}`, { skip: !HAS_ZBAR && 'zbarimg yok' }, () => {
      const r = QR.encode(text, { ecLevel: ec });
      const out = decodeImage(matrixToPGM(r.matrix, tmpFile('qr.pgm')));
      assert.equal(out, text, `v${r.version} maske ${r.mask}`);
    });
  }
}

test('8 maskenin hepsi okunabilir QR üretir', { skip: !HAS_ZBAR && 'zbarimg yok' }, () => {
  for (let mask = 0; mask < 8; mask++) {
    const r = QR.encode('maske testi ' + mask, { ecLevel: 'M', mask });
    assert.equal(r.mask, mask);
    assert.equal(decodeImage(matrixToPGM(r.matrix, tmpFile('m.pgm'))), 'maske testi ' + mask);
  }
});

test('versiyon bilgisi bloğu olan büyük versiyonlar (7+) okunur', { skip: !HAS_ZBAR && 'zbarimg yok' }, () => {
  for (const v of [7, 15, 25, 40]) {
    const r = QR.encode('v' + v, { ecLevel: 'L', minVersion: v });
    assert.equal(r.version, v);
    assert.equal(decodeImage(matrixToPGM(r.matrix, tmpFile('v.pgm'), 3)), 'v' + v);
  }
});
