/* =====================================================================
 *  qr-export.js — PNG / SVG / PDF dışa aktarma
 *  ---------------------------------------------------------------
 *  PNG : SVG -> Image -> Canvas -> toBlob        (ekstra kütüphane yok)
 *  SVG : üretilen string doğrudan Blob olarak    (vektörel)
 *  PDF : çizim komutları PDF içerik akışına       (gerçek vektör, sıfır bağımlılık)
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QRExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------
   * Yardımcılar
   * ------------------------------------------------------------- */
  function svgToDataUrl(svg) {
    // UTF-8 güvenli base64
    var utf8 = new TextEncoder().encode(svg);
    var bin = '';
    for (var i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
    return 'data:image/svg+xml;base64,' + btoa(bin);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Görsel yüklenemedi.')); };
      img.src = src;
    });
  }

  /* Android WebView köprüsü — WebView'de blob: indirmeleri çalışmadığı için
     dosya parça parça native tarafa aktarılır ve İndirilenler klasörüne yazılır. */
  function hasAndroidBridge() {
    return typeof AndroidBridge !== 'undefined' &&
      AndroidBridge && typeof AndroidBridge.fileStart === 'function';
  }

  function androidSave(blob, filename) {
    var id = 'f' + Date.now() + '-' + Math.random().toString(36).slice(2);
    var CHUNK = 512 * 1024;
    var offset = 0;
    AndroidBridge.fileStart(id);

    function step() {
      if (offset >= blob.size) {
        AndroidBridge.fileEnd(id, filename, blob.type || 'application/octet-stream');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var comma = reader.result.indexOf(',');
        AndroidBridge.fileChunk(id, reader.result.slice(comma + 1));
        offset += CHUNK;
        step();
      };
      reader.onerror = function () {
        AndroidBridge.fileAbort(id, 'Dosya okunamadı.');
      };
      reader.readAsDataURL(blob.slice(offset, offset + CHUNK));
    }
    step();
  }

  function download(blob, filename) {
    if (hasAndroidBridge()) { androidSave(blob, filename); return; }

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------------------------------------------------------
   * PNG
   * ------------------------------------------------------------- */
  function toCanvas(svg, built, pxWidth) {
    var ratio = built.height / built.width;
    var w = Math.round(pxWidth);
    var h = Math.round(pxWidth * ratio);
    return loadImage(svgToDataUrl(svg)).then(function (img) {
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, w, h);
      return canvas;
    });
  }

  function toPngBlob(svg, built, pxWidth) {
    return toCanvas(svg, built, pxWidth).then(function (canvas) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b); }, 'image/png');
      });
    });
  }

  function toPngDataUrl(svg, built, pxWidth) {
    return toCanvas(svg, built, pxWidth).then(function (c) { return c.toDataURL('image/png'); });
  }

  function downloadPNG(svg, built, pxWidth, filename) {
    return toPngBlob(svg, built, pxWidth).then(function (blob) {
      download(blob, filename);
      return blob;
    });
  }

  /* ---------------------------------------------------------------
   * SVG
   * ------------------------------------------------------------- */
  function downloadSVG(svg, filename) {
    var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    download(blob, filename);
    return blob;
  }

  /* ---------------------------------------------------------------
   * PDF — vektörel
   * ------------------------------------------------------------- */

  // WinAnsi dışındaki Türkçe harfleri en yakın karşılığa çevirir
  var TR_MAP = { 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S', 'İ': 'I', 'ı': 'i' };
  function toWinAnsi(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (TR_MAP[ch]) { out += TR_MAP[ch]; continue; }
      var code = ch.charCodeAt(0);
      out += code <= 0xff ? ch : '?';
    }
    return out;
  }

  function pdfEscape(str) {
    return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  // Helvetica-Bold için kabaca genişlik (1/1000 em) — metni ortalamak yeterli hassasiyet
  function textWidth(str, size) {
    var total = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c === 32) total += 278;
      else if (c >= 48 && c <= 57) total += 556;
      else if (c >= 65 && c <= 90) total += 722;
      else if (c >= 97 && c <= 122) total += 578;
      else total += 380;
    }
    return total / 1000 * size;
  }

  function hexToRgb01(hex) {
    var h = String(hex || '#000000').trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var num = parseInt(h, 16);
    if (isNaN(num)) return [0, 0, 0];
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  }

  function fmt(v) { return (Math.round(v * 1000) / 1000).toString(); }

  // Yalnız M/L/C/Z içeren path -> PDF içerik akışı
  function pathToPdfOps(d) {
    var out = [];
    var re = /([MLCZ])([^MLCZ]*)/g, m;
    while ((m = re.exec(d)) !== null) {
      var cmd = m[1];
      var raw = m[2].trim();
      var nums = raw.length ? raw.split(/[\s,]+/).map(parseFloat) : [];
      if (cmd === 'M') out.push(fmt(nums[0]) + ' ' + fmt(nums[1]) + ' m');
      else if (cmd === 'L') out.push(fmt(nums[0]) + ' ' + fmt(nums[1]) + ' l');
      else if (cmd === 'C') {
        out.push(nums.slice(0, 6).map(fmt).join(' ') + ' c');
      } else if (cmd === 'Z') out.push('h');
    }
    return out.join(' ');
  }

  // Basit PDF yazıcı — byte offset takibiyle
  function PdfWriter() {
    this.parts = [];
    this.length = 0;
  }
  PdfWriter.prototype.push = function (data) {
    var bytes;
    if (typeof data === 'string') {
      bytes = new Uint8Array(data.length);
      for (var i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff;
    } else bytes = data;
    this.parts.push(bytes);
    this.length += bytes.length;
    return this;
  };
  PdfWriter.prototype.blob = function () {
    return new Blob(this.parts, { type: 'application/pdf' });
  };

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Logoyu PDF'e gömmek için JPEG'e çevirir (şeffaflık verilen zemin rengiyle doldurulur)
  function logoToJpeg(dataUrl, backing) {
    return loadImage(dataUrl).then(function (img) {
      var side = Math.max(64, Math.min(1024, Math.max(img.naturalWidth || 256, img.naturalHeight || 256)));
      var canvas = document.createElement('canvas');
      canvas.width = side; canvas.height = side;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = backing || '#FFFFFF';
      ctx.fillRect(0, 0, side, side);
      // en-boy oranını koruyarak ortala
      var iw = img.naturalWidth || side, ih = img.naturalHeight || side;
      var scale = Math.min(side / iw, side / ih);
      var dw = iw * scale, dh = ih * scale;
      ctx.drawImage(img, (side - dw) / 2, (side - dh) / 2, dw, dh);
      var url = canvas.toDataURL('image/jpeg', 0.94);
      return { bytes: base64ToBytes(url.split(',')[1]), width: side, height: side };
    });
  }

  /**
   * built  : QRRenderer.build() sonucu
   * opts   : { widthMm, page: 'a4'|'fit', title }
   */
  function buildPDF(built, opts) {
    opts = opts || {};
    var MM = 72 / 25.4;
    var widthMm = opts.widthMm || 80;
    var designW = built.width, designH = built.height;
    var drawW = widthMm * MM;
    var scale = drawW / designW;
    var drawH = designH * scale;

    var pageW, pageH, ox, oyTop;
    if (opts.page === 'fit') {
      var padPt = 8 * MM;
      pageW = drawW + padPt * 2;
      pageH = drawH + padPt * 2;
      ox = padPt; oyTop = padPt;
    } else {
      pageW = 595.276; pageH = 841.89; // A4 dikey
      ox = (pageW - drawW) / 2;
      oyTop = (pageH - drawH) / 2;
    }

    // Tasarım koordinatlarını (y aşağı) sayfa koordinatlarına taşıyan matris
    var mtx = [scale, 0, 0, -scale, ox, pageH - oyTop];
    var mtxStr = mtx.map(fmt).join(' ');

    // Logo var mı?
    var logoOp = null;
    built.ops.forEach(function (op) { if (op.type === 'image') logoOp = op; });

    var prep = logoOp
      ? logoToJpeg(logoOp.href, opts.logoBacking || '#FFFFFF')
      : Promise.resolve(null);

    return prep.then(function (jpeg) {
      /* ---- içerik akışı ---- */
      var cs = [];
      cs.push('q');
      cs.push(mtxStr + ' cm');

      var usesPattern = false;
      built.ops.forEach(function (op) {
        if (op.type === 'path') {
          if (op.fill === 'url(#qrGrad)') {
            usesPattern = true;
            cs.push('/Pattern cs /P0 scn');
          } else {
            var rgb = hexToRgb01(op.fill);
            cs.push(rgb.map(fmt).join(' ') + ' rg');
          }
          cs.push(pathToPdfOps(op.d));
          cs.push(op.evenodd ? 'f*' : 'f');
        } else if (op.type === 'image' && jpeg) {
          cs.push('q');
          cs.push([fmt(op.w), '0', '0', fmt(-op.h), fmt(op.x), fmt(op.y + op.h)].join(' ') + ' cm');
          cs.push('/Im0 Do');
          cs.push('Q');
        } else if (op.type === 'text') {
          var txt = toWinAnsi(String(op.text));
          var tw = textWidth(txt, op.size) + (op.spacing || 0) * Math.max(0, txt.length - 1);
          var tx = op.anchor === 'middle' ? op.x - tw / 2 : op.x;
          var trgb = hexToRgb01(op.fill);
          cs.push('BT');
          cs.push(trgb.map(fmt).join(' ') + ' rg');
          cs.push('/F1 ' + fmt(op.size) + ' Tf');
          if (op.spacing) cs.push(fmt(op.spacing) + ' Tc');
          cs.push('1 0 0 -1 ' + fmt(tx) + ' ' + fmt(op.y) + ' Tm');
          cs.push('(' + pdfEscape(txt) + ') Tj');
          cs.push('ET');
        }
      });
      cs.push('Q');
      var content = cs.join('\n');

      /* ---- nesneler ---- */
      var objects = [];
      function obj(body) { objects.push(body); return objects.length; } // 1 tabanlı numara

      var catalogNo = obj(null);   // 1 — sonra doldurulacak
      var pagesNo = obj(null);     // 2
      var pageNo = obj(null);      // 3
      var contentNo = obj(null);   // 4
      var fontNo = obj(null);      // 5
      var imageNo = jpeg ? obj(null) : 0;
      var patternNo = 0, shadingNo = 0;
      if (usesPattern && built.gradient) { shadingNo = obj(null); patternNo = obj(null); }

      objects[catalogNo - 1] = '<< /Type /Catalog /Pages ' + pagesNo + ' 0 R >>';
      objects[pagesNo - 1] = '<< /Type /Pages /Kids [' + pageNo + ' 0 R] /Count 1 >>';

      var res = '<< /ProcSet [/PDF /Text /ImageC] /Font << /F1 ' + fontNo + ' 0 R >>';
      if (jpeg) res += ' /XObject << /Im0 ' + imageNo + ' 0 R >>';
      if (patternNo) res += ' /Pattern << /P0 ' + patternNo + ' 0 R >>';
      res += ' >>';

      objects[pageNo - 1] = '<< /Type /Page /Parent ' + pagesNo + ' 0 R /MediaBox [0 0 ' +
        fmt(pageW) + ' ' + fmt(pageH) + '] /Resources ' + res + ' /Contents ' + contentNo + ' 0 R >>';

      objects[contentNo - 1] = { dict: '<< /Length ' + content.length + ' >>', stream: content };
      objects[fontNo - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

      if (jpeg) {
        objects[imageNo - 1] = {
          dict: '<< /Type /XObject /Subtype /Image /Width ' + jpeg.width + ' /Height ' + jpeg.height +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.bytes.length + ' >>',
          streamBytes: jpeg.bytes
        };
      }

      if (patternNo) {
        var g = built.gradient;
        var c0 = hexToRgb01(g.colors[0]).map(fmt).join(' ');
        var c1 = hexToRgb01(g.colors[1]).map(fmt).join(' ');
        var fnDict = '<< /FunctionType 2 /Domain [0 1] /C0 [' + c0 + '] /C1 [' + c1 + '] /N 1 >>';
        var coords = g.type === 'radial'
          ? '[' + [g.cx, g.cy, 0, g.cx, g.cy, g.r].map(fmt).join(' ') + ']'
          : '[' + [g.x1, g.y1, g.x2, g.y2].map(fmt).join(' ') + ']';
        objects[shadingNo - 1] = '<< /ShadingType ' + (g.type === 'radial' ? 3 : 2) +
          ' /ColorSpace /DeviceRGB /Coords ' + coords + ' /Function ' + fnDict + ' /Extend [true true] >>';
        objects[patternNo - 1] = '<< /Type /Pattern /PatternType 2 /Matrix [' + mtxStr + '] /Shading ' +
          shadingNo + ' 0 R >>';
      }

      /* ---- dosyayı yaz ---- */
      var w = new PdfWriter();
      w.push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      var offsets = [0];
      for (var i = 0; i < objects.length; i++) {
        offsets.push(w.length);
        var body = objects[i];
        w.push((i + 1) + ' 0 obj\n');
        if (typeof body === 'string') {
          w.push(body + '\n');
        } else {
          w.push(body.dict + '\nstream\n');
          if (body.streamBytes) w.push(body.streamBytes);
          else w.push(body.stream);
          w.push('\nendstream\n');
        }
        w.push('endobj\n');
      }
      var xrefStart = w.length;
      w.push('xref\n0 ' + (objects.length + 1) + '\n');
      w.push('0000000000 65535 f \n');
      for (var j = 1; j <= objects.length; j++) {
        w.push(('0000000000' + offsets[j]).slice(-10) + ' 00000 n \n');
      }
      w.push('trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogNo + ' 0 R >>\n');
      w.push('startxref\n' + xrefStart + '\n%%EOF\n');

      return w.blob();
    });
  }

  function downloadPDF(built, opts, filename) {
    return buildPDF(built, opts).then(function (blob) {
      download(blob, filename);
      return blob;
    });
  }

  /* ---------------------------------------------------------------
   * Dosya adı üretimi
   * ------------------------------------------------------------- */
  function slugify(text, maxLen) {
    var map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
    var s = String(text || 'qr')
      .replace(/^https?:\/\//, '')
      .replace(/[çğıöşüÇĞİÖŞÜ]/g, function (c) { return map[c] || c; })
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!s) s = 'qr';
    return s.slice(0, maxLen || 28).replace(/-+$/, '');
  }

  function makeFilename(content, ext) {
    var d = new Date();
    var pad = function (v) { return ('0' + v).slice(-2); };
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    return 'qr-' + slugify(content) + '-' + stamp + '.' + ext;
  }

  return {
    svgToDataUrl: svgToDataUrl,
    loadImage: loadImage,
    download: download,
    isAndroidApp: hasAndroidBridge,
    toCanvas: toCanvas,
    toPngBlob: toPngBlob,
    toPngDataUrl: toPngDataUrl,
    downloadPNG: downloadPNG,
    downloadSVG: downloadSVG,
    buildPDF: buildPDF,
    downloadPDF: downloadPDF,
    makeFilename: makeFilename,
    slugify: slugify
  };
});
