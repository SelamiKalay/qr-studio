/* Testler için ortak yardımcılar — bağımlılık yok, yalnızca Node yerleşikleri.
 *
 * Uçtan uca testler üretilen QR'ı bağımsız bir okuyucuyla (zbarimg) çözer.
 * SVG için rsvg-convert, PDF için pdftoppm kullanılır. Araç kurulu değilse
 * ilgili test atlanır (CI'da hepsi kurulur).
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

/* Tarayıcıda <script> ile yüklenen dosyaları (window'a bağlananlar dahil)
   index.html'deki sırayla tek bir sandbox'ta çalıştırır. extraGlobals ile
   localStorage, crypto gibi tarayıcı nesneleri sahte olarak verilebilir. */
function loadBrowserModules(files, extraGlobals = {}) {
  const sandbox = { TextEncoder, TextDecoder, Blob, btoa, atob, console, Promise, Uint8Array, DataView, ...extraGlobals };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return sandbox;
}

function hasCommand(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
}

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-studio-test-'));
  return path.join(dir, name);
}

/* QR matrisini (0/1) sessiz bölgeli, ölçekli PGM görüntüsüne yazar */
function matrixToPGM(matrix, file, scale = 4, quiet = 4) {
  const size = matrix.length;
  const N = (size + quiet * 2) * scale;
  const px = Buffer.alloc(N * N, 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y + quiet) * scale + dy) * N;
        px.fill(0, row + (x + quiet) * scale, row + (x + quiet + 1) * scale);
      }
    }
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P5\n${N} ${N}\n255\n`), px]));
  return file;
}

/* Görüntüdeki QR'ı zbarimg ile çözer; bulamazsa null döner */
function decodeImage(file) {
  const r = spawnSync('zbarimg', ['--raw', '-q', '-Sbinary', file]);
  if (r.status !== 0) return null;
  return r.stdout.toString('utf8').replace(/\n$/, '');
}

function svgToPng(svg, file, width = 800) {
  const src = file.replace(/\.png$/, '.svg');
  fs.writeFileSync(src, svg);
  execFileSync('rsvg-convert', ['-w', String(width), '-b', 'white', src, '-o', file]);
  return file;
}

function pdfToPng(pdfBytes, file) {
  const src = file.replace(/\.png$/, '.pdf');
  fs.writeFileSync(src, pdfBytes);
  const prefix = file.replace(/\.png$/, '');
  execFileSync('pdftoppm', ['-png', '-r', '200', '-singlefile', src, prefix]);
  return file;
}

module.exports = {
  ROOT, loadBrowserModules, hasCommand, tmpFile, matrixToPGM, decodeImage, svgToPng, pdfToPng,
  HAS_ZBAR: hasCommand('zbarimg'),
  HAS_RSVG: hasCommand('rsvg-convert'),
  HAS_PDFTOPPM: hasCommand('pdftoppm'),
};
