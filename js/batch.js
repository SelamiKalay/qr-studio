/* =====================================================================
 *  batch.js — Toplu üretim (CSV -> çoklu QR -> ZIP)
 *  ---------------------------------------------------------------
 *  ZIP dosyası sıfırdan yazılır (STORE yöntemi + CRC32) — PNG zaten
 *  sıkıştırılmış olduğu için ek sıkıştırmaya gerek yok.
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------- CRC32 ---------------- */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------------- ZIP (store) ---------------- */
  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  }

  function createZip(files) {
    var enc = new TextEncoder();
    var now = new Date();
    var time = dosTime(now), date = dosDate(now);
    var chunks = [];
    var central = [];
    var offset = 0;

    files.forEach(function (file) {
      var nameBytes = enc.encode(file.name);
      var data = file.data;
      var crc = crc32(data);

      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);        // gerekli sürüm
      lv.setUint16(6, 0x0800, true);    // UTF-8 dosya adı
      lv.setUint16(8, 0, true);         // yöntem: store
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, data);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + data.length;
    });

    var centralSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  }

  /* ---------------- CSV ---------------- */
  function detectDelimiter(text) {
    var firstLine = text.split(/\r?\n/)[0] || '';
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var inQuotes = false;
    for (var i = 0; i < firstLine.length; i++) {
      var ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch in counts) counts[ch]++;
    }
    var best = ',', bestN = -1;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
    return bestN > 0 ? best : ',';
  }

  function parseCSV(text, delimiter) {
    text = text.replace(/^﻿/, '');
    var delim = delimiter || detectDelimiter(text);
    var rows = [], row = [], field = '', inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        // yoksay — \r\n zaten \n ile kapanacak
      } else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }

  /**
   * CSV satırlarını { content, label } listesine çevirir.
   * Tek sütun -> içerik. İki+ sütun -> 1. sütun içerik, 2. sütun dosya adı etiketi.
   * İlk satır başlık gibi görünüyorsa atlanır.
   */
  function toJobs(rows) {
    if (!rows.length) return [];
    var start = 0;
    var head = rows[0].map(function (c) { return c.trim().toLowerCase(); });
    if (head.indexOf('içerik') >= 0 || head.indexOf('icerik') >= 0 || head.indexOf('content') >= 0 ||
        head.indexOf('url') >= 0 || head.indexOf('text') >= 0 || head.indexOf('link') >= 0) {
      start = 1;
    }
    var jobs = [];
    for (var i = start; i < rows.length; i++) {
      var content = (rows[i][0] || '').trim();
      if (!content) continue;
      jobs.push({ content: content, label: (rows[i][1] || '').trim() });
    }
    return jobs;
  }

  /**
   * Toplu üretim.
   * @param jobs      [{content, label}]
   * @param opts      { style, ecLevel, format: 'png'|'svg', pngSize, onProgress }
   * @returns Promise<{blob, count, errors}>
   */
  function run(jobs, opts) {
    opts = opts || {};
    var format = opts.format === 'svg' ? 'svg' : 'png';
    var pngSize = opts.pngSize || 1024;
    var files = [];
    var errors = [];
    var used = {};

    function uniqueName(base, ext) {
      var name = base + '.' + ext;
      var i = 2;
      while (used[name]) { name = base + '-' + i + '.' + ext; i++; }
      used[name] = true;
      return name;
    }

    var chain = Promise.resolve();
    jobs.forEach(function (job, index) {
      chain = chain.then(function () {
        if (opts.onProgress) opts.onProgress(index, jobs.length, job.content);
        var encoded;
        try {
          encoded = QREncoder.encode(job.content, { ecLevel: opts.ecLevel || 'M' });
        } catch (e) {
          errors.push({ row: index + 1, content: job.content, message: e.message });
          return;
        }
        var built = QRRenderer.build(encoded.matrix, opts.style || {});
        var svg = QRRenderer.toSVG(built, pngSize);
        var base = ('' + (index + 1)).padStart(3, '0') + '-' +
          QRExport.slugify(job.label || job.content, 40);

        if (format === 'svg') {
          files.push({ name: uniqueName(base, 'svg'), data: new TextEncoder().encode(svg) });
          return;
        }
        return QRExport.toPngBlob(svg, built, pngSize).then(function (blob) {
          return blob.arrayBuffer().then(function (buf) {
            files.push({ name: uniqueName(base, 'png'), data: new Uint8Array(buf) });
          });
        });
      });
    });

    return chain.then(function () {
      if (!files.length) return { blob: null, count: 0, errors: errors };
      return { blob: createZip(files), count: files.length, errors: errors };
    });
  }

  root.QRBatch = {
    parseCSV: parseCSV,
    toJobs: toJobs,
    createZip: createZip,
    crc32: crc32,
    run: run
  };
})(window);
