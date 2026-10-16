'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { loadBrowserModules, HAS_ZBAR, HAS_RSVG, tmpFile, svgToPng, decodeImage } = require('./helpers.js');

const W = loadBrowserModules(['qr-encoder.js', 'qr-renderer.js', 'qr-export.js', 'batch.js']);
const B = W.QRBatch;

// vm sandbox'ından gelen diziler farklı bir Array prototipine sahip;
// deepEqual prototipi de karşılaştırdığı için düz nesnelere çevrilir
const plain = (v) => JSON.parse(JSON.stringify(v));

/* Merkezi dizini okuyarak ZIP içeriğini çıkarır ve her dosyanın CRC'sini
   Node'un zlib.crc32'siyle bağımsız olarak doğrular. */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'merkezi dizin sonu bulunamadı');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'merkezi dizin imzası');
    const flags = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    assert.equal(buf.readUInt32LE(localOffset), 0x04034b50, `${name}: yerel başlık imzası`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + size);
    assert.equal(zlib.crc32(data), crc, `${name}: CRC`);
    files.push({ name, data, utf8Flag: Boolean(flags & 0x0800) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test('crc32: standart kontrol değeri', () => {
  assert.equal(B.crc32(new TextEncoder().encode('123456789')) >>> 0, 0xCBF43926);
  assert.equal(B.crc32(new Uint8Array(0)) >>> 0, 0);
});

test('CSV: ayraç otomatik algılanır (virgül, noktalı virgül, sekme)', () => {
  assert.deepEqual(plain(B.parseCSV('a,b\nc,d')), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(plain(B.parseCSV('a;b\nc;d')), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(plain(B.parseCSV('a\tb\nc\td')), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(plain(B.parseCSV('"x;y",z\n')), [['x;y', 'z']], 'tırnak içindeki ayraç sayılmaz');
});

test('CSV: tırnaklar, kaçırılmış tırnak, alan içinde satır sonu, CRLF ve BOM', () => {
  const csv = '﻿icerik,etiket\r\n"https://a.com/?x=1,2","Etiket ""1"""\r\n"çok\nsatırlı",2\r\n\r\n';
  assert.deepEqual(plain(B.parseCSV(csv)), [
    ['icerik', 'etiket'],
    ['https://a.com/?x=1,2', 'Etiket "1"'],
    ['çok\nsatırlı', '2'],
  ]);
});

test('toJobs: başlık satırı atlanır, boş içerik elenir, etiket isteğe bağlı', () => {
  assert.deepEqual(plain(B.toJobs([['URL', 'Ad'], ['a.com', 'A'], ['', 'boş'], [' b.com ']])), [
    { content: 'a.com', label: 'A' },
    { content: 'b.com', label: '' },
  ]);
  assert.deepEqual(plain(B.toJobs([['a.com'], ['b.com']]).map((j) => j.content)), ['a.com', 'b.com'],
    'başlıksız dosyada ilk satır da içeriktir');
  assert.deepEqual(plain(B.toJobs([])), []);
});

test('createZip: geçerli ZIP, UTF-8 dosya adları ve doğru CRC', async () => {
  const enc = new TextEncoder();
  const blob = B.createZip([
    { name: 'bir.txt', data: enc.encode('birinci') },
    { name: 'şahane-ğüş.txt', data: enc.encode('ikinci ✓') },
    { name: 'bos.txt', data: new Uint8Array(0) },
  ]);
  const files = readZip(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual(files.map((f) => f.name), ['bir.txt', 'şahane-ğüş.txt', 'bos.txt']);
  assert.equal(files[1].data.toString('utf8'), 'ikinci ✓');
  assert.ok(files.every((f) => f.utf8Flag), 'UTF-8 ad bayrağı');
});

test('run (SVG): her satır için dosya, benzersiz adlar, hatalı satır raporlanır', async () => {
  const progress = [];
  const result = await B.run([
    { content: 'https://a.com', label: 'Ürün' },
    { content: 'https://b.com', label: 'Ürün' },
    { content: 'x'.repeat(5000), label: 'çok uzun' },
  ], { format: 'svg', ecLevel: 'L', onProgress: (i, n) => progress.push(`${i}/${n}`) });

  assert.equal(result.count, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 3);
  assert.match(result.errors[0].message, /çok uzun/);
  assert.deepEqual(progress, ['0/3', '1/3', '2/3']);

  const files = readZip(Buffer.from(await result.blob.arrayBuffer()));
  assert.deepEqual(files.map((f) => f.name), ['001-urun.svg', '002-urun.svg']);
  assert.ok(files[0].data.toString('utf8').startsWith('<svg'));
});

test('run: hiç geçerli satır yoksa ZIP üretilmez', async () => {
  const result = await B.run([{ content: 'y'.repeat(5000) }], { format: 'svg' });
  assert.equal(result.blob, null);
  assert.equal(result.count, 0);
});

test('taranabilir: toplu üretimdeki SVG dosyaları', { skip: !(HAS_ZBAR && HAS_RSVG) && 'zbarimg veya rsvg-convert yok' }, async () => {
  const contents = ['https://ornek.com/1', 'WIFI:T:WPA;S:Ev;P:sifre;;', 'Merhaba ğüşıöç'];
  const result = await B.run(contents.map((c) => ({ content: c })), { format: 'svg', pngSize: 600 });
  const files = readZip(Buffer.from(await result.blob.arrayBuffer()));
  files.forEach((f, i) => {
    assert.equal(decodeImage(svgToPng(f.data.toString('utf8'), tmpFile('b.png'))), contents[i]);
  });
});
