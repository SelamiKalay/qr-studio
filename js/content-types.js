/* =====================================================================
 *  content-types.js — QR içerik tipleri ve biçimlendiriciler
 *  ---------------------------------------------------------------
 *  Her tip; form alanlarını (şema) ve bu alanlardan standart QR
 *  yükünü üreten format() fonksiyonunu tanımlar.
 * ===================================================================== */
(function (root) {
  'use strict';

  // WIFI / MECARD gibi biçimlerde ayraç karakterlerini kaçır
  function esc(v) {
    return String(v == null ? '' : v).replace(/([\\;,:"])/g, '\\$1');
  }
  // vCard satır değerlerini kaçır
  function vesc(v) {
    return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([;,])/g, '\\$1');
  }
  function t(v) { return String(v == null ? '' : v).trim(); }

  var TYPES = [
    {
      id: 'url',
      label: 'Web Adresi',
      icon: '🔗',
      fields: [
        { name: 'url', label: 'URL', type: 'text', placeholder: 'https://ornek.com', required: true, autoFocus: true }
      ],
      format: function (v) {
        var u = t(v.url);
        if (!u) return '';
        if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        return u;
      }
    },
    {
      id: 'text',
      label: 'Düz Metin',
      icon: '📝',
      fields: [
        { name: 'text', label: 'Metin', type: 'textarea', placeholder: 'QR kodun içine yazılacak metin…', required: true, rows: 4 }
      ],
      format: function (v) { return t(v.text); }
    },
    {
      id: 'email',
      label: 'E-posta',
      icon: '✉️',
      fields: [
        { name: 'to', label: 'Alıcı', type: 'email', placeholder: 'ad@ornek.com', required: true },
        { name: 'subject', label: 'Konu', type: 'text', placeholder: 'Merhaba' },
        { name: 'body', label: 'Mesaj', type: 'textarea', placeholder: 'Mesaj metni…', rows: 3 }
      ],
      format: function (v) {
        if (!t(v.to)) return '';
        var q = [];
        if (t(v.subject)) q.push('subject=' + encodeURIComponent(t(v.subject)));
        if (t(v.body)) q.push('body=' + encodeURIComponent(t(v.body)));
        return 'mailto:' + t(v.to) + (q.length ? '?' + q.join('&') : '');
      }
    },
    {
      id: 'phone',
      label: 'Telefon',
      icon: '📞',
      fields: [
        { name: 'phone', label: 'Telefon numarası', type: 'tel', placeholder: '+90 555 111 22 33', required: true }
      ],
      format: function (v) {
        var p = t(v.phone).replace(/[^\d+]/g, '');
        return p ? 'tel:' + p : '';
      }
    },
    {
      id: 'sms',
      label: 'SMS',
      icon: '💬',
      fields: [
        { name: 'phone', label: 'Telefon numarası', type: 'tel', placeholder: '+90 555 111 22 33', required: true },
        { name: 'message', label: 'Hazır mesaj', type: 'textarea', placeholder: 'Merhaba!', rows: 2 }
      ],
      format: function (v) {
        var p = t(v.phone).replace(/[^\d+]/g, '');
        if (!p) return '';
        return 'SMSTO:' + p + ':' + t(v.message);
      }
    },
    {
      id: 'wifi',
      label: 'WiFi',
      icon: '📶',
      fields: [
        { name: 'ssid', label: 'Ağ adı (SSID)', type: 'text', placeholder: 'Ev-Wifi', required: true },
        {
          name: 'encryption', label: 'Şifreleme', type: 'select', value: 'WPA',
          options: [
            { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
            { value: 'WEP', label: 'WEP' },
            { value: 'nopass', label: 'Şifresiz' }
          ]
        },
        { name: 'password', label: 'Şifre', type: 'password', placeholder: '••••••••' },
        { name: 'hidden', label: 'Gizli ağ (SSID yayınlanmıyor)', type: 'checkbox' }
      ],
      format: function (v) {
        if (!t(v.ssid)) return '';
        var enc = v.encryption || 'WPA';
        var parts = 'WIFI:T:' + (enc === 'nopass' ? 'nopass' : enc) + ';S:' + esc(t(v.ssid)) + ';';
        if (enc !== 'nopass') parts += 'P:' + esc(v.password || '') + ';';
        if (v.hidden) parts += 'H:true;';
        return parts + ';';
      }
    },
    {
      id: 'vcard',
      label: 'Kartvizit',
      icon: '👤',
      fields: [
        { name: 'firstName', label: 'Ad', type: 'text', placeholder: 'Ahmet', required: true },
        { name: 'lastName', label: 'Soyad', type: 'text', placeholder: 'Yılmaz' },
        { name: 'org', label: 'Şirket', type: 'text', placeholder: 'Örnek A.Ş.' },
        { name: 'title', label: 'Ünvan', type: 'text', placeholder: 'Yazılım Geliştirici' },
        { name: 'phone', label: 'Telefon', type: 'tel', placeholder: '+90 555 111 22 33' },
        { name: 'email', label: 'E-posta', type: 'email', placeholder: 'ad@ornek.com' },
        { name: 'url', label: 'Web sitesi', type: 'text', placeholder: 'https://ornek.com' },
        { name: 'address', label: 'Adres', type: 'text', placeholder: 'Cadde, No, Şehir' },
        { name: 'note', label: 'Not', type: 'textarea', placeholder: 'Kısa not…', rows: 2 }
      ],
      format: function (v) {
        if (!t(v.firstName) && !t(v.lastName)) return '';
        var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
        lines.push('N:' + vesc(t(v.lastName)) + ';' + vesc(t(v.firstName)) + ';;;');
        lines.push('FN:' + vesc((t(v.firstName) + ' ' + t(v.lastName)).trim()));
        if (t(v.org)) lines.push('ORG:' + vesc(t(v.org)));
        if (t(v.title)) lines.push('TITLE:' + vesc(t(v.title)));
        if (t(v.phone)) lines.push('TEL;TYPE=CELL:' + t(v.phone));
        if (t(v.email)) lines.push('EMAIL;TYPE=INTERNET:' + t(v.email));
        if (t(v.url)) lines.push('URL:' + t(v.url));
        if (t(v.address)) lines.push('ADR;TYPE=WORK:;;' + vesc(t(v.address)) + ';;;;');
        if (t(v.note)) lines.push('NOTE:' + vesc(t(v.note)));
        lines.push('END:VCARD');
        return lines.join('\n');
      }
    },
    {
      id: 'geo',
      label: 'Konum',
      icon: '📍',
      fields: [
        { name: 'lat', label: 'Enlem', type: 'text', placeholder: '41.0082', required: true },
        { name: 'lng', label: 'Boylam', type: 'text', placeholder: '28.9784', required: true },
        { name: 'label', label: 'Yer adı (opsiyonel)', type: 'text', placeholder: 'Sultanahmet' }
      ],
      format: function (v) {
        var lat = t(v.lat).replace(',', '.'), lng = t(v.lng).replace(',', '.');
        if (!lat || !lng) return '';
        var base = 'geo:' + lat + ',' + lng;
        return t(v.label) ? base + '?q=' + lat + ',' + lng + '(' + encodeURIComponent(t(v.label)) + ')' : base;
      }
    },
    {
      id: 'event',
      label: 'Etkinlik',
      icon: '📅',
      fields: [
        { name: 'title', label: 'Etkinlik adı', type: 'text', placeholder: 'Ürün lansmanı', required: true },
        { name: 'location', label: 'Yer', type: 'text', placeholder: 'İstanbul' },
        { name: 'start', label: 'Başlangıç', type: 'datetime-local' },
        { name: 'end', label: 'Bitiş', type: 'datetime-local' },
        { name: 'description', label: 'Açıklama', type: 'textarea', rows: 2 }
      ],
      format: function (v) {
        if (!t(v.title)) return '';
        function ical(dt) {
          if (!dt) return '';
          var d = new Date(dt);
          if (isNaN(d.getTime())) return '';
          var p = function (x) { return ('0' + x).slice(-2); };
          return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
            p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
        }
        var lines = ['BEGIN:VEVENT', 'SUMMARY:' + vesc(t(v.title))];
        if (t(v.location)) lines.push('LOCATION:' + vesc(t(v.location)));
        if (ical(v.start)) lines.push('DTSTART:' + ical(v.start));
        if (ical(v.end)) lines.push('DTEND:' + ical(v.end));
        if (t(v.description)) lines.push('DESCRIPTION:' + vesc(t(v.description)));
        lines.push('END:VEVENT');
        return lines.join('\n');
      }
    },
    {
      id: 'social',
      label: 'Sosyal Medya',
      icon: '🌐',
      fields: [
        {
          name: 'platform', label: 'Platform', type: 'select', value: 'instagram',
          options: [
            { value: 'instagram', label: 'Instagram' },
            { value: 'x', label: 'X (Twitter)' },
            { value: 'youtube', label: 'YouTube' },
            { value: 'linkedin', label: 'LinkedIn' },
            { value: 'tiktok', label: 'TikTok' },
            { value: 'facebook', label: 'Facebook' },
            { value: 'github', label: 'GitHub' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'telegram', label: 'Telegram' }
          ]
        },
        { name: 'handle', label: 'Kullanıcı adı / numara', type: 'text', placeholder: 'kullaniciadi', required: true }
      ],
      format: function (v) {
        var h = t(v.handle).replace(/^@/, '');
        if (!h) return '';
        switch (v.platform) {
          case 'x': return 'https://x.com/' + h;
          case 'youtube': return /^(UC|@)/.test(h) ? 'https://youtube.com/' + h : 'https://youtube.com/@' + h;
          case 'linkedin': return 'https://linkedin.com/in/' + h;
          case 'tiktok': return 'https://tiktok.com/@' + h;
          case 'facebook': return 'https://facebook.com/' + h;
          case 'github': return 'https://github.com/' + h;
          case 'whatsapp': return 'https://wa.me/' + h.replace(/[^\d]/g, '');
          case 'telegram': return 'https://t.me/' + h;
          case 'instagram':
          default: return 'https://instagram.com/' + h;
        }
      }
    }
  ];

  var byId = {};
  TYPES.forEach(function (t2) { byId[t2.id] = t2; });

  function format(typeId, values) {
    var type = byId[typeId] || byId.url;
    try { return type.format(values || {}) || ''; }
    catch (e) { return ''; }
  }

  function defaults(typeId) {
    var type = byId[typeId] || byId.url;
    var out = {};
    type.fields.forEach(function (f) {
      out[f.name] = f.value !== undefined ? f.value : (f.type === 'checkbox' ? false : '');
    });
    return out;
  }

  root.QRContent = { types: TYPES, byId: byId, format: format, defaults: defaults };
})(window);
