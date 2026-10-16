'use strict';

/* storage.js'in localStorage ve yardımcı kısımları. IndexedDB'ye dayanan
   geçmiş kayıtları gerçek bir tarayıcı gerektirdiği için burada yalnızca
   IndexedDB yokken anlaşılır hata verilmesi test edilir. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers.js');

function fakeLocalStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('ayarlar ve tema localStorage üzerinden kaydedilip okunur', () => {
  const ls = fakeLocalStorage();
  const S = loadBrowserModules(['storage.js'], { localStorage: ls }).QRStorage;
  assert.equal(S.loadSettings(), null);
  S.saveSettings({ ecLevel: 'H', dotShape: 'classy', size: 1024 });
  assert.equal(JSON.stringify(S.loadSettings()), JSON.stringify({ ecLevel: 'H', dotShape: 'classy', size: 1024 }));
  S.saveTheme('dark');
  assert.equal(S.loadTheme(), 'dark');
  assert.deepEqual([...ls.data.keys()].sort(), ['qr.settings', 'qr.theme']);
});

test('bozuk ayar verisi uygulamayı çökertmez', () => {
  const ls = fakeLocalStorage();
  ls.setItem('qr.settings', '{bozuk');
  const S = loadBrowserModules(['storage.js'], { localStorage: ls }).QRStorage;
  assert.equal(S.loadSettings(), null);
});

test('localStorage erişimi engelliyse (gizli mod) hata fırlatılmaz', () => {
  const blocked = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  const S = loadBrowserModules(['storage.js'], { localStorage: blocked }).QRStorage;
  assert.doesNotThrow(() => S.saveSettings({ a: 1 }));
  assert.doesNotThrow(() => S.saveTheme('light'));
  assert.equal(S.loadSettings(), null);
  assert.equal(S.loadTheme(), null);
});

test('uuid: crypto.randomUUID varsa onu, yoksa geçerli bir v4 üretir', () => {
  const noCrypto = loadBrowserModules(['storage.js']).QRStorage;
  const ids = new Set(Array.from({ length: 200 }, () => noCrypto.uuid()));
  assert.equal(ids.size, 200, 'tekrarsız olmalı');
  for (const id of ids) assert.match(id, UUID_V4);

  const withCrypto = loadBrowserModules(['storage.js'], { crypto: { randomUUID: () => 'sabit-id' } }).QRStorage;
  assert.equal(withCrypto.uuid(), 'sabit-id');
});

test('IndexedDB yoksa geçmiş işlemleri anlaşılır hatayla reddedilir', async () => {
  const S = loadBrowserModules(['storage.js']).QRStorage;
  await assert.rejects(S.save({ content: 'x' }), /IndexedDB desteklemiyor/);
  await assert.rejects(S.list(), /IndexedDB desteklemiyor/);
});

test('yedek içe aktarma: geçersiz JSON ve items eksikliği reddedilir', async () => {
  const S = loadBrowserModules(['storage.js']).QRStorage;
  await assert.rejects(S.importJson('{bozuk'), /Geçersiz JSON/);
  await assert.rejects(S.importJson('{"app":"qr-studio"}'), /items/);
});
