/* =====================================================================
 *  dev-server.js — Bağımlılıksız yerel statik sunucu
 *  ---------------------------------------------------------------
 *  Kullanım:  node dev-server.js  [port]
 *  Sadece Node gerektirir; npm paketi kurulmaz, internet gerekmez.
 * ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.argv[2], 10) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {          // dizin dışına çıkmayı engelle
    res.writeHead(403).end('403');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('QR Studio çalışıyor:  http://localhost:' + PORT);
  console.log('Durdurmak için Ctrl+C');
});
