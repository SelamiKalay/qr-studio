/* =====================================================================
 *  make-icons.js — Uygulama ikonlarını üretir (sıfır bağımlılık)
 *  ---------------------------------------------------------------
 *  Node'un yerleşik zlib'i ile PNG dosyalarını elle yazar; marka
 *  işaretini (yuvarlatılmış kare + QR göz/nokta deseni) SDF tabanlı
 *  4x4 süperörnekleme ile çizer.
 *
 *  Kullanım:  node tools/make-icons.js
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------------------------------------------------------
 * PNG yazıcı
 * ------------------------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePNG(file, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit derinliği
  ihdr[9] = 6;   // renk tipi: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Her tarama satırının başına filtre baytı (0 = None)
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

/* ---------------------------------------------------------------
 * Geometri (işaretli mesafe fonksiyonları)
 * ------------------------------------------------------------- */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

const BRAND_A = [0x63, 0x66, 0xf1]; // #6366F1
const BRAND_B = [0xec, 0x48, 0x99]; // #EC4899

// Marka işareti — 32x32 birimlik tuvalde
const GLYPH = [
  { x: 6, y: 6, w: 8, h: 8, r: 2.5 },
  { x: 18, y: 6, w: 8, h: 8, r: 2.5 },
  { x: 6, y: 18, w: 8, h: 8, r: 2.5 },
  { x: 18, y: 18, w: 3.2, h: 3.2, r: 1 },
  { x: 22.8, y: 18, w: 3.2, h: 3.2, r: 1 },
  { x: 18, y: 22.8, w: 3.2, h: 3.2, r: 1 },
  { x: 22.8, y: 22.8, w: 3.2, h: 3.2, r: 1 }
];

/**
 * @param size      çıktı kenar uzunluğu (px)
 * @param opts.shape  'rounded' | 'circle' | 'none'   (zemin biçimi)
 * @param opts.inset  glifin kapladığı oran (adaptive ikonun güvenli alanı için)
 */
function renderIcon(size, opts) {
  const shape = opts.shape || 'rounded';
  const inset = opts.inset === undefined ? 1 : opts.inset;
  const SS = 4; // süperörnekleme
  const out = Buffer.alloc(size * size * 4);

  // Glif, tuvalin ortasında `inset` oranında bir alana yerleşir
  const glyphSize = size * inset;
  const glyphOrigin = (size - glyphSize) / 2;
  const u = glyphSize / 32; // 32 birimlik tuvalden piksele

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // Zemin
          let inBg;
          if (shape === 'circle') inBg = sdCircle(px, py, size / 2, size / 2, size / 2) < 0;
          else if (shape === 'none') inBg = false;
          else inBg = sdRoundRect(px, py, 0, 0, size, size, size * 0.225) < 0;

          // Glif (beyaz)
          const gx = (px - glyphOrigin) / u;
          const gy = (py - glyphOrigin) / u;
          let inGlyph = false;
          for (const s of GLYPH) {
            if (sdRoundRect(gx, gy, s.x, s.y, s.w, s.h, s.r) < 0) { inGlyph = true; break; }
          }

          if (inGlyph && (inBg || shape === 'none')) {
            r += 255; g += 255; b += 255; a += 255;
          } else if (inBg) {
            // Köşegen gradient
            const t = Math.min(1, Math.max(0, (px + py) / (2 * size)));
            r += BRAND_A[0] + (BRAND_B[0] - BRAND_A[0]) * t;
            g += BRAND_A[1] + (BRAND_B[1] - BRAND_A[1]) * t;
            b += BRAND_A[2] + (BRAND_B[2] - BRAND_A[2]) * t;
            a += 255;
          }
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* ---------------------------------------------------------------
 * Üretim
 * ------------------------------------------------------------- */
const RES = path.join(__dirname, '..', 'android', 'res');

// Yoğunluk -> ölçek (mdpi = 1x)
const DENSITIES = [
  ['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]
];

let count = 0;
for (const [dpi, scale] of DENSITIES) {
  const dir = path.join(RES, 'mipmap-' + dpi);
  fs.mkdirSync(dir, { recursive: true });

  // Eski sürüm ikonları: 48dp
  const legacy = Math.round(48 * scale);
  writePNG(path.join(dir, 'ic_launcher.png'), legacy, legacy, renderIcon(legacy, { shape: 'rounded' }));
  writePNG(path.join(dir, 'ic_launcher_round.png'), legacy, legacy, renderIcon(legacy, { shape: 'circle' }));

  // Adaptive ikon ön planı: 108dp tuval, glif ortadaki %55'lik güvenli alanda
  const fg = Math.round(108 * scale);
  writePNG(path.join(dir, 'ic_launcher_foreground.png'), fg, fg, renderIcon(fg, { shape: 'none', inset: 0.55 }));

  count += 3;
}

// Karşılama ekranı için tek bir büyük ikon
const playDir = path.join(__dirname, '..', 'android', 'res', 'drawable-nodpi');
fs.mkdirSync(playDir, { recursive: true });
writePNG(path.join(playDir, 'splash_logo.png'), 384, 384, renderIcon(384, { shape: 'rounded' }));
count++;

console.log(count + ' ikon dosyasi uretildi -> android/res/');
