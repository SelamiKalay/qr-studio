/* =====================================================================
 *  storage.js — Lokal kalıcılık
 *  ---------------------------------------------------------------
 *  IndexedDB  : tam geçmiş (ayarlar + küçük önizleme görseli)
 *  localStorage: son kullanılan ayarlar, tema tercihi
 * ===================================================================== */
(function (root) {
  'use strict';

  var DB_NAME = 'qr-studio';
  var DB_VERSION = 1;
  var STORE = 'qrHistory';
  var LS_SETTINGS = 'qr.settings';
  var LS_THEME = 'qr.theme';

  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in root)) {
        reject(new Error('Tarayıcınız IndexedDB desteklemiyor.'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('favorite', 'favorite');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB açılamadı.')); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var result;
        try { result = fn(store); } catch (err) { reject(err); return; }
        t.oncomplete = function () { resolve(result && result.__req ? result.__req.result : result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('İşlem iptal edildi.')); };
      });
    });
  }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  /* ---------------- Geçmiş ---------------- */

  function save(record) {
    var rec = Object.assign({}, record);
    if (!rec.id) rec.id = uuid();
    if (!rec.createdAt) rec.createdAt = new Date().toISOString();
    if (typeof rec.favorite !== 'number') rec.favorite = rec.favorite ? 1 : 0;
    return tx('readwrite', function (store) { store.put(rec); return rec.id; });
  }

  function list(limit) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = [];
        var t = db.transaction(STORE, 'readonly');
        var idx = t.objectStore(STORE).index('createdAt');
        var req = idx.openCursor(null, 'prev');
        req.onsuccess = function () {
          var cursor = req.result;
          if (!cursor || (limit && out.length >= limit)) { resolve(out); return; }
          out.push(cursor.value);
          cursor.continue();
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function get(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return tx('readwrite', function (store) { store.delete(id); return id; });
  }

  function clear() {
    return tx('readwrite', function (store) { store.clear(); return true; });
  }

  function toggleFavorite(id) {
    return get(id).then(function (rec) {
      if (!rec) return null;
      rec.favorite = rec.favorite ? 0 : 1;
      return save(rec).then(function () { return rec.favorite; });
    });
  }

  function count() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* ---------------- Yedekleme ---------------- */

  function exportJson() {
    return list().then(function (items) {
      return JSON.stringify({
        app: 'qr-studio',
        version: 1,
        exportedAt: new Date().toISOString(),
        items: items
      }, null, 2);
    });
  }

  function importJson(text, mergeMode) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return Promise.reject(new Error('Geçersiz JSON dosyası.')); }
    var items = Array.isArray(data) ? data : (data && data.items);
    if (!Array.isArray(items)) return Promise.reject(new Error('Yedek dosyasında "items" listesi bulunamadı.'));

    var start = mergeMode === 'replace' ? clear() : Promise.resolve();
    return start.then(function () {
      return tx('readwrite', function (store) {
        items.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          if (!item.id) item.id = uuid();
          if (!item.createdAt) item.createdAt = new Date().toISOString();
          item.favorite = item.favorite ? 1 : 0;
          store.put(item);
        });
        return items.length;
      });
    });
  }

  /* ---------------- Ayarlar (localStorage) ---------------- */

  function saveSettings(obj) {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(obj)); } catch (e) { /* kota dolu olabilir */ }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(LS_SETTINGS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveTheme(theme) {
    try { localStorage.setItem(LS_THEME, theme); } catch (e) { /* yoksay */ }
  }

  function loadTheme() {
    try { return localStorage.getItem(LS_THEME); } catch (e) { return null; }
  }

  root.QRStorage = {
    save: save,
    list: list,
    get: get,
    remove: remove,
    clear: clear,
    count: count,
    toggleFavorite: toggleFavorite,
    exportJson: exportJson,
    importJson: importJson,
    saveSettings: saveSettings,
    loadSettings: loadSettings,
    saveTheme: saveTheme,
    loadTheme: loadTheme,
    uuid: uuid
  };
})(window);
