/* =====================================================================
 *  history-ui.js — Geçmiş listesi arayüzü
 * ===================================================================== */
(function (root) {
  'use strict';

  var listEl, emptyEl, countEl, favOnlyEl;
  var onLoad = null;
  var onToast = function () {};
  var favOnly = false;

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (v) { return ('0' + v).slice(-2); };
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function shortLabel(rec) {
    var c = rec.content || '';
    if (rec.contentType === 'vcard') {
      var m = c.match(/FN:(.+)/);
      return m ? m[1] : 'Kartvizit';
    }
    if (rec.contentType === 'wifi') {
      var s = c.match(/S:((?:\\.|[^;])*)/);
      return 'WiFi: ' + (s ? s[1].replace(/\\(.)/g, '$1') : '');
    }
    return c.replace(/^https?:\/\//, '').replace(/\s+/g, ' ').slice(0, 40);
  }

  function card(rec) {
    var el = document.createElement('article');
    el.className = 'histcard';

    var img = document.createElement('img');
    img.className = 'histcard__thumb';
    img.alt = 'QR önizleme';
    img.loading = 'lazy';
    if (rec.thumbnail) img.src = rec.thumbnail;
    img.title = 'Bu tasarımı düzenlemeye aç';
    img.addEventListener('click', function () { if (onLoad) onLoad(rec); });
    el.appendChild(img);

    var fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'histcard__fav';
    fav.textContent = rec.favorite ? '★' : '☆';
    fav.title = rec.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle';
    fav.setAttribute('aria-label', fav.title);
    fav.addEventListener('click', function (e) {
      e.stopPropagation();
      QRStorage.toggleFavorite(rec.id).then(refresh);
    });
    el.appendChild(fav);

    var label = document.createElement('div');
    label.className = 'histcard__label';
    label.textContent = shortLabel(rec);
    label.title = rec.content || '';
    el.appendChild(label);

    var meta = document.createElement('div');
    meta.className = 'histcard__meta';
    var type = document.createElement('span');
    var typeDef = QRContent.byId[rec.contentType];
    type.textContent = typeDef ? typeDef.label : (rec.contentType || '');
    var date = document.createElement('span');
    date.textContent = fmtDate(rec.createdAt);
    meta.appendChild(type);
    meta.appendChild(date);
    el.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'histcard__actions';

    var loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn--ghost';
    loadBtn.textContent = 'Aç';
    loadBtn.addEventListener('click', function () { if (onLoad) onLoad(rec); });

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn--danger';
    delBtn.textContent = 'Sil';
    delBtn.addEventListener('click', function () {
      QRStorage.remove(rec.id).then(function () {
        onToast('Kayıt silindi.');
        refresh();
      });
    });

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    el.appendChild(actions);

    return el;
  }

  function refresh() {
    return QRStorage.list().then(function (items) {
      var shown = favOnly ? items.filter(function (i) { return i.favorite; }) : items;
      listEl.textContent = '';
      shown.forEach(function (rec) { listEl.appendChild(card(rec)); });
      countEl.textContent = items.length;
      emptyEl.hidden = shown.length > 0;
      emptyEl.textContent = items.length && !shown.length
        ? 'Favori olarak işaretlenmiş kayıt yok.'
        : 'Henüz kayıt yok — bir QR oluşturup indirdiğinizde burada birikecek.';
    }).catch(function (err) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Geçmiş yüklenemedi: ' + err.message;
    });
  }

  function init(opts) {
    opts = opts || {};
    onLoad = opts.onLoad || null;
    onToast = opts.onToast || function () {};

    listEl = document.getElementById('historyList');
    emptyEl = document.getElementById('historyEmpty');
    countEl = document.getElementById('historyCount');
    favOnlyEl = document.getElementById('favOnly');

    favOnlyEl.addEventListener('change', function () {
      favOnly = favOnlyEl.checked;
      refresh();
    });

    document.getElementById('btnClearHistory').addEventListener('click', function () {
      QRStorage.count().then(function (c) {
        if (!c) { onToast('Geçmiş zaten boş.'); return; }
        if (!confirm(c + ' kayıt kalıcı olarak silinecek. Emin misiniz?')) return;
        QRStorage.clear().then(function () {
          onToast('Geçmiş temizlendi.');
          refresh();
        });
      });
    });

    return refresh();
  }

  root.QRHistoryUI = { init: init, refresh: refresh };
})(window);
