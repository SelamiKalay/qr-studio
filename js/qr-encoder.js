/* =====================================================================
 *  qr-encoder.js — Sıfırdan QR Kod Matris Üreticisi
 *  ---------------------------------------------------------------
 *  ISO/IEC 18004 standardına göre yazılmış, sıfır bağımlılıklı encoder.
 *  Kapsam: Numeric / Alphanumeric / Byte (UTF-8) modları, versiyon 1-40,
 *          L/M/Q/H hata düzeltme, Reed-Solomon, blok interleaving,
 *          8 maske + ceza puanı değerlendirmesi.
 *
 *  Kullanım:
 *      const res = QREncoder.encode("https://example.com", { ecLevel: "M" });
 *      res.matrix  -> [[0,1,...],[...]]  (0 = açık, 1 = koyu)
 *      res.size, res.version, res.ecLevel, res.mask, res.mode
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QREncoder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------
   * 1) Sabit tablolar
   * ------------------------------------------------------------- */

  // EC seviyesi -> RS tablosundaki sıra (L, M, Q, H)
  var EC_ORDER = { L: 0, M: 1, Q: 2, H: 3 };
  // EC seviyesi -> format bilgisindeki 2 bitlik gösterge
  var EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  var MODE_NUMERIC = 1, MODE_ALNUM = 2, MODE_BYTE = 4;

  // Hizalama (alignment) deseni merkez koordinatları — versiyon 1..40
  var ALIGN_POS = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
    [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
    [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];

  // RS blok tablosu: her satır [blokSayısı, toplamKodSözcüğü, veriKodSözcüğü, ...]
  // Sıra: her versiyon için L, M, Q, H
  var RS_BLOCKS = [
    [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
    [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
    [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
    [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
    [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
    [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
    [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
    [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
    [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
    [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
    [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
    [4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
    [3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
    [5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12, 7, 37, 13],
    [5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
    [1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
    [5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
    [3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
    [3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
    [4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
    [2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
    [4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
    [6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
    [8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
    [10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
    [8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
    [3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
    [7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
    [5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
    [13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
    [17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
    [17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
    [13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
    [12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
    [6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
    [17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
    [4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
    [20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
    [19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]
  ];

  var ALNUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  /* ---------------------------------------------------------------
   * 2) Galois Field GF(256) — Reed-Solomon için
   * ------------------------------------------------------------- */
  var GF_EXP = new Uint8Array(512);
  var GF_LOG = new Uint8Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // primitif polinom: x^8+x^4+x^3+x^2+1
    }
    for (var j = 255; j < 512; j++) GF_EXP[j] = GF_EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  // İki polinomun çarpımı (katsayılar yüksek dereceden düşüğe)
  function polyMul(a, b) {
    var res = new Uint8Array(a.length + b.length - 1);
    for (var i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) res[i + j] ^= gfMul(a[i], b[j]);
    }
    return res;
  }

  var GEN_CACHE = {};
  function rsGenerator(degree) {
    if (GEN_CACHE[degree]) return GEN_CACHE[degree];
    var poly = new Uint8Array([1]);
    for (var i = 0; i < degree; i++) poly = polyMul(poly, new Uint8Array([1, GF_EXP[i]]));
    GEN_CACHE[degree] = poly;
    return poly;
  }

  // Veri kod sözcüklerinden hata düzeltme kod sözcüklerini üretir
  function rsEncode(data, ecCount) {
    var gen = rsGenerator(ecCount);
    var buf = new Uint8Array(data.length + ecCount);
    buf.set(data, 0);
    for (var i = 0; i < data.length; i++) {
      var coef = buf[i];
      if (coef === 0) continue;
      for (var j = 1; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], coef);
    }
    return buf.slice(data.length);
  }

  /* ---------------------------------------------------------------
   * 3) Bit tamponu
   * ------------------------------------------------------------- */
  function BitBuffer() { this.bytes = []; this.length = 0; }
  BitBuffer.prototype.put = function (value, bits) {
    for (var i = bits - 1; i >= 0; i--) this.putBit(((value >>> i) & 1) === 1);
  };
  BitBuffer.prototype.putBit = function (bit) {
    var idx = this.length >> 3;
    if (this.bytes.length <= idx) this.bytes.push(0);
    if (bit) this.bytes[idx] |= 0x80 >>> (this.length & 7);
    this.length++;
  };

  /* ---------------------------------------------------------------
   * 4) Mod seçimi ve veri kodlaması
   * ------------------------------------------------------------- */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i++;
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return out;
  }

  function detectMode(str) {
    if (/^[0-9]*$/.test(str)) return MODE_NUMERIC;
    if (/^[0-9A-Z $%*+\-./:]*$/.test(str)) return MODE_ALNUM;
    return MODE_BYTE;
  }

  function charCountBits(mode, version) {
    var group = version <= 9 ? 0 : (version <= 26 ? 1 : 2);
    if (mode === MODE_NUMERIC) return [10, 12, 14][group];
    if (mode === MODE_ALNUM) return [9, 11, 13][group];
    return [8, 16, 16][group]; // byte
  }

  function dataLength(mode, str, bytes) {
    return mode === MODE_BYTE ? bytes.length : str.length;
  }

  // Mod + uzunluk göstergesi hariç, saf veri bit sayısı
  function payloadBits(mode, str, bytes) {
    if (mode === MODE_NUMERIC) {
      var n = str.length;
      return 10 * Math.floor(n / 3) + [0, 4, 7][n % 3];
    }
    if (mode === MODE_ALNUM) {
      var m = str.length;
      return 11 * Math.floor(m / 2) + 6 * (m % 2);
    }
    return bytes.length * 8;
  }

  function writePayload(bb, mode, str, bytes) {
    var i;
    if (mode === MODE_NUMERIC) {
      for (i = 0; i + 2 < str.length; i += 3) bb.put(parseInt(str.substr(i, 3), 10), 10);
      var rest = str.length - i;
      if (rest === 2) bb.put(parseInt(str.substr(i, 2), 10), 7);
      else if (rest === 1) bb.put(parseInt(str.substr(i, 1), 10), 4);
    } else if (mode === MODE_ALNUM) {
      for (i = 0; i + 1 < str.length; i += 2) {
        bb.put(ALNUM_CHARS.indexOf(str[i]) * 45 + ALNUM_CHARS.indexOf(str[i + 1]), 11);
      }
      if (i < str.length) bb.put(ALNUM_CHARS.indexOf(str[i]), 6);
    } else {
      for (i = 0; i < bytes.length; i++) bb.put(bytes[i], 8);
    }
  }

  /* ---------------------------------------------------------------
   * 5) Blok bilgisi / kapasite
   * ------------------------------------------------------------- */
  function getBlocks(version, ecLevel) {
    var row = RS_BLOCKS[(version - 1) * 4 + EC_ORDER[ecLevel]];
    var blocks = [];
    for (var i = 0; i < row.length; i += 3) {
      for (var k = 0; k < row[i]; k++) {
        blocks.push({ total: row[i + 1], data: row[i + 2] });
      }
    }
    return blocks;
  }

  function dataCapacityBits(version, ecLevel) {
    var blocks = getBlocks(version, ecLevel), sum = 0;
    for (var i = 0; i < blocks.length; i++) sum += blocks[i].data;
    return sum * 8;
  }

  /* ---------------------------------------------------------------
   * 6) Matris kurulumu
   * ------------------------------------------------------------- */
  function createMatrix(version) {
    var size = version * 4 + 17;
    var m = [], f = [], r;
    for (r = 0; r < size; r++) {
      m.push(new Array(size).fill(null));
      f.push(new Array(size).fill(false));
    }

    function setFn(row, col, val) {
      if (row < 0 || col < 0 || row >= size || col >= size) return;
      m[row][col] = val ? 1 : 0;
      f[row][col] = true;
    }

    // Bulucu (finder) desenleri + ayırıcılar
    function finder(row, col) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var rr = row + dr, cc = col + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          var inner = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          var dark = inner && (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setFn(rr, cc, dark);
        }
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // Zamanlama (timing) desenleri
    for (var i = 8; i < size - 8; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }

    // Hizalama (alignment) desenleri
    var pos = ALIGN_POS[version - 1];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var ar = pos[a], ac = pos[b];
        // Bulucu desenlerle çakışanları atla
        if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
        for (var dr2 = -2; dr2 <= 2; dr2++) {
          for (var dc2 = -2; dc2 <= 2; dc2++) {
            var mx = Math.max(Math.abs(dr2), Math.abs(dc2));
            setFn(ar + dr2, ac + dc2, mx !== 1);
          }
        }
      }
    }

    // Format bilgisi alanları rezerve edilir (değerler maskeden sonra yazılacak)
    for (var k = 0; k < 15; k++) {
      if (k < 6) f[k][8] = true;
      else if (k < 8) f[k + 1][8] = true;
      else f[size - 15 + k][8] = true;

      if (k < 8) f[8][size - k - 1] = true;
      else if (k < 9) f[8][15 - k] = true;
      else f[8][15 - k - 1] = true;
    }
    setFn(size - 8, 8, true); // sabit koyu modül

    // Versiyon bilgisi alanları (v7+)
    if (version >= 7) {
      for (var v = 0; v < 18; v++) {
        f[Math.floor(v / 3)][(v % 3) + size - 11] = true;
        f[(v % 3) + size - 11][Math.floor(v / 3)] = true;
      }
    }

    return { modules: m, isFunction: f, size: size };
  }

  function placeData(mat, bytes) {
    var m = mat.modules, f = mat.isFunction, size = mat.size;
    var totalBits = bytes.length * 8, bitIndex = 0;
    var row = size - 1, dir = -1;

    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // 6. sütun zamanlama deseni — atlanır
      while (true) {
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (!f[row][cc]) {
            var dark = 0;
            if (bitIndex < totalBits) {
              dark = (bytes[bitIndex >> 3] >>> (7 - (bitIndex & 7))) & 1;
            }
            m[row][cc] = dark;
            bitIndex++;
          }
        }
        row += dir;
        if (row < 0 || row >= size) { row -= dir; dir = -dir; break; }
      }
    }
  }

  function maskFn(mask, i, j) {
    switch (mask) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
    }
    return false;
  }

  function applyMask(mat, mask) {
    var m = mat.modules, f = mat.isFunction, size = mat.size;
    var out = [];
    for (var r = 0; r < size; r++) {
      var line = new Array(size);
      for (var c = 0; c < size; c++) {
        line[c] = (!f[r][c] && maskFn(mask, r, c)) ? (m[r][c] ^ 1) : m[r][c];
      }
      out.push(line);
    }
    return out;
  }

  // Format bilgisi: 15 bit BCH(15,5) + 0x5412 maskesi
  function formatBits(ecLevel, mask) {
    var data = (EC_FORMAT_BITS[ecLevel] << 3) | mask;
    var rem = data << 10;
    for (var i = 14; i >= 10; i--) {
      if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  // Versiyon bilgisi: 18 bit BCH(18,6)
  function versionBits(version) {
    var rem = version << 12;
    for (var i = 17; i >= 12; i--) {
      if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
    }
    return (version << 12) | rem;
  }

  function writeFormatInfo(modules, size, ecLevel, mask) {
    var bits = formatBits(ecLevel, mask);
    for (var i = 0; i < 15; i++) {
      var bit = (bits >>> i) & 1;
      if (i < 6) modules[i][8] = bit;
      else if (i < 8) modules[i + 1][8] = bit;
      else modules[size - 15 + i][8] = bit;

      if (i < 8) modules[8][size - i - 1] = bit;
      else if (i < 9) modules[8][15 - i] = bit;
      else modules[8][15 - i - 1] = bit;
    }
    modules[size - 8][8] = 1;
  }

  function writeVersionInfo(modules, size, version) {
    if (version < 7) return;
    var bits = versionBits(version);
    for (var i = 0; i < 18; i++) {
      var bit = (bits >>> i) & 1;
      modules[Math.floor(i / 3)][(i % 3) + size - 11] = bit;
      modules[(i % 3) + size - 11][Math.floor(i / 3)] = bit;
    }
  }

  /* ---------------------------------------------------------------
   * 7) Maske ceza puanı (ISO 18004 §8.8.2)
   * ------------------------------------------------------------- */
  function penalty(m, size) {
    var score = 0, r, c, run, prev;

    // Kural 1: satır/sütunda 5+ ardışık aynı renk
    for (r = 0; r < size; r++) {
      run = 1; prev = m[r][0];
      for (c = 1; c < size; c++) {
        if (m[r][c] === prev) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = m[r][c]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (c = 0; c < size; c++) {
      run = 1; prev = m[0][c];
      for (r = 1; r < size; r++) {
        if (m[r][c] === prev) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; prev = m[r][c]; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }

    // Kural 2: 2x2 aynı renk blokları
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    // Kural 3: 10111010000 / 00001011101 deseni (bulucu deseni taklidi)
    var p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (r = 0; r < size; r++) {
      for (c = 0; c + 10 < size; c++) {
        var okA = true, okB = true;
        for (var k = 0; k < 11; k++) {
          var val = m[r][c + k];
          if (val !== p1[k]) okA = false;
          if (val !== p2[k]) okB = false;
          if (!okA && !okB) break;
        }
        if (okA || okB) score += 40;
      }
    }
    for (c = 0; c < size; c++) {
      for (r = 0; r + 10 < size; r++) {
        var okC = true, okD = true;
        for (var k2 = 0; k2 < 11; k2++) {
          var val2 = m[r + k2][c];
          if (val2 !== p1[k2]) okC = false;
          if (val2 !== p2[k2]) okD = false;
          if (!okC && !okD) break;
        }
        if (okC || okD) score += 40;
      }
    }

    // Kural 4: koyu modül oranının %50'den sapması
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) dark += m[r][c];
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  /* ---------------------------------------------------------------
   * 8) Ana encode fonksiyonu
   * ------------------------------------------------------------- */
  function encode(text, options) {
    options = options || {};
    var ecLevel = (options.ecLevel || 'M').toUpperCase();
    if (!(ecLevel in EC_ORDER)) ecLevel = 'M';

    var str = String(text == null ? '' : text);
    if (str.length === 0) throw new Error('QR içeriği boş olamaz.');

    var bytes = utf8Bytes(str);
    var mode = options.mode === 'byte' ? MODE_BYTE : detectMode(str);
    var minVersion = Math.max(1, options.minVersion || 1);
    var maxVersion = Math.min(40, options.maxVersion || 40);

    // Uygun en küçük versiyonu bul
    var version = -1, need = 0;
    for (var v = minVersion; v <= maxVersion; v++) {
      need = 4 + charCountBits(mode, v) + payloadBits(mode, str, bytes);
      if (need <= dataCapacityBits(v, ecLevel)) { version = v; break; }
    }
    if (version === -1) {
      throw new Error('İçerik çok uzun — tek bir QR koda sığmıyor (maks. versiyon 40).');
    }

    // Bit akışını oluştur
    var capacityBits = dataCapacityBits(version, ecLevel);
    var bb = new BitBuffer();
    bb.put(mode, 4);
    bb.put(dataLength(mode, str, bytes), charCountBits(mode, version));
    writePayload(bb, mode, str, bytes);

    // Sonlandırıcı + byte hizalama
    var terminator = Math.min(4, capacityBits - bb.length);
    for (var t = 0; t < terminator; t++) bb.putBit(false);
    while (bb.length % 8 !== 0) bb.putBit(false);

    // Dolgu baytları
    var dataBytes = bb.bytes.slice();
    var capacityBytes = capacityBits / 8;
    var padToggle = true;
    while (dataBytes.length < capacityBytes) {
      dataBytes.push(padToggle ? 0xec : 0x11);
      padToggle = !padToggle;
    }

    // Bloklara böl + Reed-Solomon
    var blocks = getBlocks(version, ecLevel);
    var dcBlocks = [], ecBlocks = [], offset = 0, maxDc = 0, maxEc = 0;
    for (var bi = 0; bi < blocks.length; bi++) {
      var dcCount = blocks[bi].data;
      var ecCount = blocks[bi].total - dcCount;
      var dc = Uint8Array.from(dataBytes.slice(offset, offset + dcCount));
      offset += dcCount;
      dcBlocks.push(dc);
      ecBlocks.push(rsEncode(dc, ecCount));
      maxDc = Math.max(maxDc, dcCount);
      maxEc = Math.max(maxEc, ecCount);
    }

    // Interleaving
    var finalBytes = [];
    var i2, b;
    for (i2 = 0; i2 < maxDc; i2++) {
      for (b = 0; b < dcBlocks.length; b++) if (i2 < dcBlocks[b].length) finalBytes.push(dcBlocks[b][i2]);
    }
    for (i2 = 0; i2 < maxEc; i2++) {
      for (b = 0; b < ecBlocks.length; b++) if (i2 < ecBlocks[b].length) finalBytes.push(ecBlocks[b][i2]);
    }

    // Matrisi kur, veriyi yerleştir, en iyi maskeyi seç
    var mat = createMatrix(version);
    placeData(mat, finalBytes);

    var bestMask = 0, bestScore = Infinity, bestModules = null;
    var forced = typeof options.mask === 'number' ? options.mask : -1;
    for (var mk = 0; mk < 8; mk++) {
      if (forced >= 0 && mk !== forced) continue;
      var candidate = applyMask(mat, mk);
      writeFormatInfo(candidate, mat.size, ecLevel, mk);
      writeVersionInfo(candidate, mat.size, version);
      var score = penalty(candidate, mat.size);
      if (score < bestScore) { bestScore = score; bestMask = mk; bestModules = candidate; }
    }

    return {
      matrix: bestModules,
      size: mat.size,
      version: version,
      ecLevel: ecLevel,
      mask: bestMask,
      mode: mode === MODE_NUMERIC ? 'numeric' : (mode === MODE_ALNUM ? 'alphanumeric' : 'byte'),
      usedBits: need,
      capacityBits: capacityBits
    };
  }

  /* Belirli bir versiyon/EC için kaç karakter sığdığını döndürür (UI uyarıları için) */
  function capacityFor(version, ecLevel, mode) {
    mode = mode || MODE_BYTE;
    var bits = dataCapacityBits(version, ecLevel) - 4 - charCountBits(mode, version);
    if (mode === MODE_NUMERIC) return Math.floor(bits / 10) * 3;
    if (mode === MODE_ALNUM) return Math.floor(bits / 11) * 2;
    return Math.floor(bits / 8);
  }

  return {
    encode: encode,
    capacityFor: capacityFor,
    MODE_NUMERIC: MODE_NUMERIC,
    MODE_ALNUM: MODE_ALNUM,
    MODE_BYTE: MODE_BYTE,
    _internal: {
      formatBits: formatBits, versionBits: versionBits, rsEncode: rsEncode,
      gfMul: gfMul, rsGenerator: rsGenerator, getBlocks: getBlocks,
      dataCapacityBits: dataCapacityBits, maskFn: maskFn, utf8Bytes: utf8Bytes,
      createMatrix: createMatrix, ALIGN_POS: ALIGN_POS
    }
  };
});
