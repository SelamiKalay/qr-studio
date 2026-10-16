'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers.js');

const { QRContent: C } = loadBrowserModules(['content-types.js']);

test('her içerik tipinin benzersiz kimliği ve biçimlendiricisi var', () => {
  const ids = C.types.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of C.types) {
    assert.equal(typeof t.format, 'function', t.id);
    assert.equal(C.byId[t.id], t);
  }
});

test('zorunlu alan boşsa boş metin döner', () => {
  for (const id of ['url', 'text', 'email', 'phone', 'sms', 'wifi', 'vcard', 'geo', 'event', 'social']) {
    assert.equal(C.format(id, {}), '', id);
  }
});

test('URL: şema yoksa https eklenir, varsa korunur', () => {
  assert.equal(C.format('url', { url: '  ornek.com/a?b=1 ' }), 'https://ornek.com/a?b=1');
  assert.equal(C.format('url', { url: 'http://ornek.com' }), 'http://ornek.com');
  assert.equal(C.format('url', { url: 'ftp://dosya.ornek.com' }), 'ftp://dosya.ornek.com');
});

test('telefon ve SMS: rakam ve + dışındaki karakterler atılır', () => {
  assert.equal(C.format('phone', { phone: '+90 (555) 123-45 67' }), 'tel:+905551234567');
  assert.equal(C.format('sms', { phone: '0555 123 45 67', message: 'Merhaba' }), 'SMSTO:05551234567:Merhaba');
});

test('e-posta: konu ve gövde URL kodlanır', () => {
  assert.equal(
    C.format('email', { to: 'a@b.com', subject: 'Toplantı & not', body: 'Satır 1\nSatır 2' }),
    'mailto:a@b.com?subject=Toplant%C4%B1%20%26%20not&body=Sat%C4%B1r%201%0ASat%C4%B1r%202'
  );
  assert.equal(C.format('email', { to: 'a@b.com' }), 'mailto:a@b.com');
});

test('WiFi: özel karakterler kaçırılır, şifresiz ağda P alanı yok', () => {
  assert.equal(
    C.format('wifi', { ssid: 'Ev;Ağı', password: 'p:a,s"s\\', encryption: 'WPA' }),
    'WIFI:T:WPA;S:Ev\\;Ağı;P:p\\:a\\,s\\"s\\\\;;'
  );
  assert.equal(C.format('wifi', { ssid: 'Kafe', encryption: 'nopass' }), 'WIFI:T:nopass;S:Kafe;;');
  assert.equal(C.format('wifi', { ssid: 'Gizli', password: 'x', encryption: 'WEP', hidden: true }),
    'WIFI:T:WEP;S:Gizli;P:x;H:true;;');
});

test('vCard 3.0: alanlar ve kaçış kuralları', () => {
  const out = C.format('vcard', {
    firstName: 'Selami', lastName: 'Kalay', org: 'Ar-Ge; Yazılım', phone: '+905551112233',
    email: 's@ornek.com', note: 'Satır 1\nSatır 2, devam',
  });
  const lines = out.split('\n');
  assert.equal(lines[0], 'BEGIN:VCARD');
  assert.equal(lines[1], 'VERSION:3.0');
  assert.ok(lines.includes('N:Kalay;Selami;;;'));
  assert.ok(lines.includes('FN:Selami Kalay'));
  assert.ok(lines.includes('ORG:Ar-Ge\\; Yazılım'));
  assert.ok(lines.includes('NOTE:Satır 1\\nSatır 2\\, devam'), 'not tek satırda kalmalı');
  assert.equal(lines[lines.length - 1], 'END:VCARD');
});

test('konum: virgüllü ondalık noktaya çevrilir, etiket kodlanır', () => {
  assert.equal(C.format('geo', { lat: '41,3761', lng: '33,7759' }), 'geo:41.3761,33.7759');
  assert.equal(C.format('geo', { lat: '41.3761', lng: '33.7759', label: 'Kastamonu Üni' }),
    'geo:41.3761,33.7759?q=41.3761,33.7759(Kastamonu%20%C3%9Cni)');
});

test('etkinlik: tarihler UTC iCalendar biçiminde', () => {
  const out = C.format('event', {
    title: 'Sunum', location: 'Salon A', start: '2026-10-16T12:00:00Z', end: '2026-10-16T13:30:00Z',
  });
  assert.deepEqual(out.split('\n'), [
    'BEGIN:VEVENT', 'SUMMARY:Sunum', 'LOCATION:Salon A',
    'DTSTART:20261016T120000Z', 'DTEND:20261016T133000Z', 'END:VEVENT',
  ]);
  assert.ok(!C.format('event', { title: 'X', start: 'geçersiz' }).includes('DTSTART'));
});

test('sosyal medya: platforma göre bağlantı, @ kaldırılır', () => {
  assert.equal(C.format('social', { platform: 'github', handle: '@SelamiKalay' }), 'https://github.com/SelamiKalay');
  assert.equal(C.format('social', { platform: 'x', handle: 'kullanici' }), 'https://x.com/kullanici');
  assert.equal(C.format('social', { platform: 'whatsapp', handle: '+90 555 111 22 33' }), 'https://wa.me/905551112233');
  assert.equal(C.format('social', { platform: 'youtube', handle: 'kanal' }), 'https://youtube.com/@kanal');
  assert.equal(C.format('social', { handle: 'varsayilan' }), 'https://instagram.com/varsayilan');
});

test('defaults: her alan için başlangıç değeri üretir', () => {
  for (const t of C.types) {
    const d = C.defaults(t.id);
    for (const f of t.fields) assert.ok(f.name in d, `${t.id}.${f.name}`);
  }
});
