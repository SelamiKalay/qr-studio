/* =====================================================================
 *  app.js — Form kontrolleri, durum yönetimi, canlı önizleme
 * ===================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------
   * Durum
   * ------------------------------------------------------------- */
  function defaultState() {
    var data = {};
    QRContent.types.forEach(function (t) { data[t.id] = QRContent.defaults(t.id); });
    return {
      type: 'url',
      data: data,
      dotShape: 'rounded',
      eyeFrameShape: 'rounded',
      eyeBallShape: 'rounded',
      perCornerEyes: false,
      eyes: [
        { frame: 'rounded', ball: 'rounded' },
        { frame: 'rounded', ball: 'rounded' },
        { frame: 'rounded', ball: 'rounded' }
      ],
      fg: '#111827',
      bg: '#FFFFFF',
      transparentBg: false,
      gradient: { enabled: false, type: 'linear', angle: 45, colors: ['#6366F1', '#EC4899'] },
      eyeColorEnabled: false,
      eyeColor: '#111827',
      logo: { dataUrl: '', sizeRatio: 0.22, backdrop: true, bgColor: '#FFFFFF', rounded: true },
      frame: { enabled: false, style: 'scan-me-bottom', text: 'BENİ TARA', color: '#111827', textColor: '#FFFFFF' },
      ecLevel: 'M',
      margin: 4,
      bgRadius: 0,
      pngSize: 1024,
      pdfWidth: 80
    };
  }

  var state = defaultState();
  var current = null;      // { content, encoded, built, svg }
  var undoStack = [];
  var suppressSnapshot = false;

  var DOT_SHAPES = [
    { id: 'square', label: 'Kare' },
    { id: 'rounded', label: 'Yuvarlak' },
    { id: 'extra-rounded', label: 'Damla' },
    { id: 'dot', label: 'Nokta' },
    { id: 'diamond', label: 'Elmas' },
    { id: 'classy', label: 'Classy' }
  ];
  var EYE_FRAME_SHAPES = [
    { id: 'square', label: 'Kare' },
    { id: 'rounded', label: 'Yuvarlak' },
    { id: 'circle', label: 'Daire' },
    { id: 'leaf', label: 'Damla' },
    { id: 'leaf-alt', label: 'Ters damla' }
  ];
  var EYE_BALL_SHAPES = [
    { id: 'square', label: 'Kare' },
    { id: 'rounded', label: 'Yuvarlak' },
    { id: 'circle', label: 'Daire' },
    { id: 'diamond', label: 'Elmas' },
    { id: 'leaf', label: 'Damla' }
  ];

  var PRESETS = [
    {
      name: 'Klasik', color: '#111827',
      apply: { dotShape: 'square', eyeFrameShape: 'square', eyeBallShape: 'square', fg: '#111827', bg: '#FFFFFF', gradient: { enabled: false } }
    },
    {
      name: 'Yumuşak', color: '#4F46E5',
      apply: { dotShape: 'extra-rounded', eyeFrameShape: 'rounded', eyeBallShape: 'circle', fg: '#4F46E5', bg: '#FFFFFF', gradient: { enabled: false } }
    },
    {
      name: 'Instagram', color: '#BC1888',
      apply: {
        dotShape: 'dot', eyeFrameShape: 'circle', eyeBallShape: 'circle', bg: '#FFFFFF',
        // Marka gradienti; turuncu uç beyaz üzerinde 2.5:1'de kaldığı için koyu tonlar seçildi
        gradient: { enabled: true, type: 'linear', angle: 45, colors: ['#BC1888', '#8134AF'] }
      }
    },
    {
      name: 'Kurumsal', color: '#0F766E',
      apply: { dotShape: 'rounded', eyeFrameShape: 'square', eyeBallShape: 'rounded', fg: '#0F766E', bg: '#FFFFFF', gradient: { enabled: false } }
    },
    {
      name: 'Gece', color: '#22D3EE',
      apply: {
        dotShape: 'extra-rounded', eyeFrameShape: 'rounded', eyeBallShape: 'rounded', bg: '#0B1120',
        gradient: { enabled: true, type: 'linear', angle: 135, colors: ['#22D3EE', '#818CF8'] }
      }
    },
    {
      name: 'Afiş', color: '#DC2626',
      apply: {
        dotShape: 'classy', eyeFrameShape: 'leaf', eyeBallShape: 'leaf', fg: '#DC2626', bg: '#FFF7ED',
        gradient: { enabled: false },
        frame: { enabled: true, style: 'scan-me-bottom', text: 'BENİ TARA', color: '#DC2626', textColor: '#FFFFFF' }
      }
    }
  ];

  /* ---------------------------------------------------------------
   * Küçük yardımcılar
   * ------------------------------------------------------------- */
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function deepAssign(target, src) {
    Object.keys(src).forEach(function (k) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) &&
          target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        deepAssign(target[k], src[k]);
      } else {
        target[k] = Array.isArray(src[k]) ? src[k].slice() : src[k];
      }
    });
    return target;
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function normalizeHex(v, fallback) {
    var s = String(v || '').trim();
    if (s[0] !== '#') s = '#' + s;
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : fallback;
  }

  function relLuminance(hex) {
    var h = normalizeHex(hex, '#000000').slice(1);
    var parts = [0, 2, 4].map(function (i) {
      var c = parseInt(h.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
  }

  function contrastRatio(a, b) {
    var l1 = relLuminance(a), l2 = relLuminance(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ---------------------------------------------------------------
   * Şekil seçici düğmeleri
   * ------------------------------------------------------------- */
  function shapeSwatch(kind, shapeId) {
    var d, viewBox;
    if (kind === 'dot') {
      // L şeklinde 3 modül — köşe birleştirme davranışını da gösterir
      var cells = [
        { x: 0, y: 0, nb: { t: false, l: false, r: true, b: true } },
        { x: 1, y: 0, nb: { t: false, l: true, r: false, b: false } },
        { x: 0, y: 1, nb: { t: true, l: false, r: false, b: false } }
      ];
      d = cells.map(function (c) {
        return dotShapePath(c.x, c.y, shapeId, c.nb);
      }).join('');
      viewBox = '-0.15 -0.15 2.3 2.3';
    } else if (kind === 'eyeFrame') {
      d = eyeFrameSwatch(shapeId);
      viewBox = '-0.3 -0.3 7.6 7.6';
    } else {
      d = eyeBallSwatch(shapeId);
      viewBox = '1.7 1.7 3.6 3.6';
    }
    return '<svg viewBox="' + viewBox + '" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="' + d + '" fill-rule="evenodd"/></svg>';
  }

  // Renderer ile aynı geometriyi kullanan küçük önizleme path'leri
  var dotShapePath, eyeFrameSwatch, eyeBallSwatch;
  (function () {
    dotShapePath = function (x, y, shape, nb) {
      var P = QRRenderer._paths;
      switch (shape) {
        case 'dot': return P.circle(x + 0.5, y + 0.5, 0.46);
        case 'diamond': return P.diamond(x, y, 1);
        case 'rounded': return P.roundRect(x, y, 1, 1, [
          (!nb.t && !nb.l) ? 0.32 : 0, (!nb.t && !nb.r) ? 0.32 : 0,
          (!nb.b && !nb.r) ? 0.32 : 0, (!nb.b && !nb.l) ? 0.32 : 0]);
        case 'extra-rounded': return P.roundRect(x, y, 1, 1, [
          (!nb.t && !nb.l) ? 0.5 : 0, (!nb.t && !nb.r) ? 0.5 : 0,
          (!nb.b && !nb.r) ? 0.5 : 0, (!nb.b && !nb.l) ? 0.5 : 0]);
        case 'classy': return P.roundRect(x, y, 1, 1, [
          (!nb.t && !nb.l) ? 0.5 : 0, 0, (!nb.b && !nb.r) ? 0.5 : 0, 0]);
        default: return P.rect(x, y, 1, 1);
      }
    };

    eyeFrameSwatch = function (shape) {
      var P = QRRenderer._paths;
      switch (shape) {
        case 'circle': return P.circle(3.5, 3.5, 3.5) + P.circle(3.5, 3.5, 2.5, true);
        case 'rounded': return P.roundRect(0, 0, 7, 7, [2, 2, 2, 2]) + P.roundRect(1, 1, 5, 5, [1.3, 1.3, 1.3, 1.3]);
        case 'leaf': return P.roundRect(0, 0, 7, 7, [3.5, 0, 3.5, 0]) + P.roundRect(1, 1, 5, 5, [2.5, 0, 2.5, 0]);
        case 'leaf-alt': return P.roundRect(0, 0, 7, 7, [0, 3.5, 0, 3.5]) + P.roundRect(1, 1, 5, 5, [0, 2.5, 0, 2.5]);
        default: return P.rect(0, 0, 7, 7) + P.rect(1, 1, 5, 5);
      }
    };

    eyeBallSwatch = function (shape) {
      var P = QRRenderer._paths;
      switch (shape) {
        case 'circle': return P.circle(3.5, 3.5, 1.5);
        case 'rounded': return P.roundRect(2, 2, 3, 3, [1, 1, 1, 1]);
        case 'diamond': return P.diamond(2, 2, 3);
        case 'leaf': return P.roundRect(2, 2, 3, 3, [1.5, 0, 1.5, 0]);
        default: return P.rect(2, 2, 3, 3);
      }
    };
  })();

  function buildShapePicker(containerId, shapes, kind, getValue, setValue) {
    var box = $(containerId);
    box.textContent = '';
    shapes.forEach(function (shape) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shapebtn';
      btn.title = shape.label;
      btn.setAttribute('aria-label', shape.label);
      btn.innerHTML = shapeSwatch(kind, shape.id);
      btn.addEventListener('click', function () {
        snapshot();
        setValue(shape.id);
        syncShapeActive(containerId, shapes, getValue);
        render();
      });
      btn.dataset.shape = shape.id;
      box.appendChild(btn);
    });
    syncShapeActive(containerId, shapes, getValue);
  }

  function syncShapeActive(containerId, shapes, getValue) {
    var box = $(containerId);
    Array.prototype.forEach.call(box.children, function (btn) {
      btn.classList.toggle('is-active', btn.dataset.shape === getValue());
    });
  }

  /* ---------------------------------------------------------------
   * İçerik sekmeleri ve dinamik form
   * ------------------------------------------------------------- */
  function buildTypeTabs() {
    var box = $('typeTabs');
    box.textContent = '';
    QRContent.types.forEach(function (type) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'typetab' + (type.id === state.type ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', type.id === state.type ? 'true' : 'false');
      btn.dataset.type = type.id;
      btn.innerHTML = '<span aria-hidden="true">' + type.icon + '</span>' + type.label;
      btn.addEventListener('click', function () {
        snapshot();
        state.type = type.id;
        buildTypeTabs();
        buildForm();
        render();
      });
      box.appendChild(btn);
    });
  }

  function buildForm() {
    var type = QRContent.byId[state.type];
    var box = $('contentForm');
    box.textContent = '';
    var values = state.data[state.type];

    type.fields.forEach(function (f) {
      var wrap = document.createElement('div');
      var input;

      if (f.type === 'checkbox') {
        wrap.className = 'switch';
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!values[f.name];
        var span = document.createElement('span');
        span.textContent = f.label;
        wrap.appendChild(input);
        wrap.appendChild(span);
      } else {
        wrap.className = 'field';
        var label = document.createElement('label');
        label.className = 'field__label';
        label.textContent = f.label;
        label.htmlFor = 'f_' + f.name;
        wrap.appendChild(label);

        if (f.type === 'textarea') {
          input = document.createElement('textarea');
          input.rows = f.rows || 3;
        } else if (f.type === 'select') {
          input = document.createElement('select');
          f.options.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            input.appendChild(o);
          });
        } else {
          input = document.createElement('input');
          input.type = f.type;
        }
        input.id = 'f_' + f.name;
        if (f.placeholder) input.placeholder = f.placeholder;
        input.value = values[f.name] == null ? '' : values[f.name];
        wrap.appendChild(input);
      }

      var handler = function () {
        values[f.name] = f.type === 'checkbox' ? input.checked : input.value;
        renderDebounced();
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
      input.addEventListener('focus', snapshotOnce);

      box.appendChild(wrap);
    });

    // WiFi: şifresiz seçilince şifre alanını gizle
    if (state.type === 'wifi') {
      var encSel = box.querySelector('#f_encryption');
      var pwField = box.querySelector('#f_password');
      var syncWifi = function () {
        if (pwField) pwField.parentElement.style.display = encSel.value === 'nopass' ? 'none' : '';
      };
      encSel.addEventListener('change', syncWifi);
      syncWifi();
    }

    $('contentHint').textContent = hintFor(state.type);
  }

  function hintFor(typeId) {
    switch (typeId) {
      case 'wifi': return 'Taratan cihaz ağa tek dokunuşla bağlanır. Şifre QR içinde açık metin olarak yer alır.';
      case 'vcard': return 'Taratınca rehbere kişi olarak eklenebilir. Alan sayısı arttıkça QR yoğunlaşır.';
      case 'sms': return 'SMSTO biçimi kullanılır — çoğu Android ve iOS kamerası destekler.';
      case 'event': return 'Takvim uygulamalarına etkinlik olarak eklenir (VEVENT).';
      case 'geo': return 'Harita uygulamasında konumu açar. Ondalık ayracı olarak nokta kullanın.';
      default: return '';
    }
  }

  /* ---------------------------------------------------------------
   * Şablonlar
   * ------------------------------------------------------------- */
  function buildPresets() {
    var box = $('presets');
    box.textContent = '';
    PRESETS.forEach(function (p) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset';
      var dot = document.createElement('span');
      dot.className = 'preset__dot';
      dot.style.background = p.apply.gradient && p.apply.gradient.enabled
        ? 'linear-gradient(135deg,' + p.apply.gradient.colors[0] + ',' + p.apply.gradient.colors[1] + ')'
        : p.color;
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(p.name));
      btn.addEventListener('click', function () {
        snapshot();
        if (!p.apply.frame) state.frame.enabled = false;
        deepAssign(state, clone(p.apply));
        state.eyes = state.eyes.map(function () {
          return { frame: state.eyeFrameShape, ball: state.eyeBallShape };
        });
        syncControlsFromState();
        render();
        toast(p.name + ' şablonu uygulandı.');
      });
      box.appendChild(btn);
    });
  }

  /* ---------------------------------------------------------------
   * Köşe başına ayar paneli
   * ------------------------------------------------------------- */
  function buildPerCorner() {
    var box = $('perCornerPanel');
    box.textContent = '';
    var names = ['Sol üst', 'Sağ üst', 'Sol alt'];
    names.forEach(function (name, i) {
      var row = document.createElement('div');
      row.className = 'percorner__row';

      var label = document.createElement('div');
      label.className = 'percorner__label';
      label.textContent = name;
      row.appendChild(label);

      var frameSel = document.createElement('select');
      EYE_FRAME_SHAPES.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.label;
        frameSel.appendChild(o);
      });
      frameSel.value = state.eyes[i].frame;
      frameSel.addEventListener('change', function () {
        snapshot();
        state.eyes[i].frame = frameSel.value;
        render();
      });
      row.appendChild(frameSel);

      var ballSel = document.createElement('select');
      EYE_BALL_SHAPES.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.label;
        ballSel.appendChild(o);
      });
      ballSel.value = state.eyes[i].ball;
      ballSel.addEventListener('change', function () {
        snapshot();
        state.eyes[i].ball = ballSel.value;
        render();
      });
      row.appendChild(ballSel);

      box.appendChild(row);
    });
  }

  /* ---------------------------------------------------------------
   * Render
   * ------------------------------------------------------------- */
  function effectiveEc() {
    // Logo varsa hata düzeltme otomatik H'ye yükseltilir
    return state.logo.dataUrl ? 'H' : state.ecLevel;
  }

  function styleOptions() {
    return {
      margin: state.margin,
      dotShape: state.dotShape,
      eyeFrameShape: state.eyeFrameShape,
      eyeBallShape: state.eyeBallShape,
      perCornerEyes: state.perCornerEyes,
      eyes: state.eyes,
      foreground: state.fg,
      background: state.bg,
      transparentBackground: state.transparentBg,
      eyeColor: state.eyeColorEnabled ? state.eyeColor : '',
      gradient: {
        enabled: state.gradient.enabled,
        type: state.gradient.type,
        angle: state.gradient.angle,
        colors: state.gradient.colors.slice()
      },
      logo: state.logo.dataUrl ? {
        dataUrl: state.logo.dataUrl,
        sizeRatio: state.logo.sizeRatio,
        backgroundFill: state.logo.backdrop ? state.logo.bgColor : 'none',
        rounded: state.logo.rounded,
        padding: state.logo.backdrop ? 0.7 : 0
      } : null,
      frame: {
        enabled: state.frame.enabled,
        style: state.frame.style,
        text: state.frame.text,
        color: state.frame.color,
        textColor: state.frame.textColor
      },
      backgroundRadius: state.bgRadius
    };
  }

  function currentContent() {
    return QRContent.format(state.type, state.data[state.type]);
  }

  function showPlaceholder() {
    current = null;
    $('previewSvg').textContent = '';
    $('previewPlaceholder').hidden = false;
    $('previewMeta').hidden = true;
    $('scanScore').hidden = true;
    setExportEnabled(false);
  }

  function render() {
    var content = currentContent();

    if (!content) {
      showPlaceholder();
      $('alerts').textContent = '';
      persistSettings();
      return;
    }

    var encoded;
    try {
      encoded = QREncoder.encode(content, { ecLevel: effectiveEc() });
    } catch (err) {
      showPlaceholder();
      showAlerts([{ level: 'danger', icon: '⚠️', text: err.message }]);
      return;
    }

    var built = QRRenderer.build(encoded.matrix, styleOptions());
    var svg = QRRenderer.toSVG(built, 1024);
    current = { content: content, encoded: encoded, built: built, svg: svg };

    $('previewSvg').innerHTML = svg;
    $('previewPlaceholder').hidden = true;
    $('previewStage').classList.toggle('is-transparent', state.transparentBg);
    setExportEnabled(true);

    // Bilgi çipleri
    $('previewMeta').hidden = false;
    $('chipVersion').textContent = 'Versiyon ' + encoded.version;
    $('chipEc').textContent = 'EC ' + encoded.ecLevel + ' (%' + ({ L: 7, M: 15, Q: 25, H: 30 })[encoded.ecLevel] + ')';
    $('chipMode').textContent = ({ numeric: 'Sayısal', alphanumeric: 'Alfanümerik', byte: 'Byte / UTF-8' })[encoded.mode];
    $('chipModules').textContent = encoded.size + ' × ' + encoded.size + ' modül';

    updateScore(encoded);
    persistSettings();
  }

  var renderDebounced = debounce(render, 130);

  function setExportEnabled(on) {
    ['btnPng', 'btnSvg', 'btnPdf', 'btnSaveHistory'].forEach(function (id) { $(id).disabled = !on; });
  }

  /* ---------------------------------------------------------------
   * Taranabilirlik skoru + uyarılar
   * ------------------------------------------------------------- */
  function updateScore(encoded) {
    var bg = state.transparentBg ? '#FFFFFF' : state.bg;
    var fgColors = state.gradient.enabled ? state.gradient.colors.slice() : [state.fg];
    if (state.eyeColorEnabled) fgColors.push(state.eyeColor);

    var minRatio = Infinity;
    fgColors.forEach(function (c) { minRatio = Math.min(minRatio, contrastRatio(c, bg)); });

    var bgLum = relLuminance(bg);
    var inverted = fgColors.every(function (c) { return relLuminance(c) > bgLum; });

    var score = 100;
    var alerts = [];

    if (minRatio < 2) score -= 60;
    else if (minRatio < 3) score -= 40;
    else if (minRatio < 4.5) score -= 22;
    else if (minRatio < 7) score -= 8;

    if (minRatio < 3) {
      alerts.push({
        level: 'danger', icon: '⛔',
        text: 'Kontrast çok düşük (' + minRatio.toFixed(1) + ':1). Bu kod çoğu kamerada okunmayacaktır — ön plan rengini koyulaştırın.'
      });
    } else if (minRatio < 4.5) {
      alerts.push({
        level: 'warn', icon: '⚠️',
        text: 'Kontrast sınırda (' + minRatio.toFixed(1) + ':1). Baskıda sorun çıkabilir; en az 7:1 hedefleyin.'
      });
    }

    if (inverted) {
      score -= 15;
      alerts.push({
        level: 'warn', icon: '🔄',
        text: 'Açık desen / koyu zemin (negatif) kullanıyorsunuz. Bazı eski tarayıcılar bunu okuyamaz.'
      });
    }

    if (state.margin < 2) {
      score -= 12;
      alerts.push({
        level: 'warn', icon: '📏',
        text: 'Sessiz bölge çok dar. Standart en az 4 modül boşluk ister; taranabilirlik düşer.'
      });
    } else if (state.margin < 4) score -= 4;

    if (state.logo.dataUrl) {
      alerts.push({
        level: 'info', icon: 'ℹ️',
        text: 'Logo eklendiği için hata düzeltme seviyesi otomatik olarak H (%30) yapıldı — kodun ortası kapansa bile okunur.'
      });
      if (state.logo.sizeRatio > 0.25) {
        score -= 10;
        alerts.push({
          level: 'warn', icon: '🖼️',
          text: 'Logo alanın %' + Math.round(state.logo.sizeRatio * 100) + "'i kadar. %25'in altında tutmak daha güvenli."
        });
      }
      if (!state.logo.backdrop) score -= 5;
    }

    if (state.transparentBg) {
      score -= 5;
      alerts.push({
        level: 'info', icon: '🧊',
        text: 'Şeffaf arka planda kod, üzerine konduğu zemine göre okunur. Açık ve düz bir zemin seçin.'
      });
    }

    var fill = Math.round((encoded.usedBits / encoded.capacityBits) * 100);
    if (fill > 92 && encoded.version >= 20) {
      alerts.push({
        level: 'info', icon: '📦',
        text: 'İçerik büyük (versiyon ' + encoded.version + '). Küçük baskılarda okumak zorlaşır — kısa bir link kullanmayı düşünün.'
      });
    }

    score = Math.max(0, Math.min(100, score));
    var box = $('scanScore');
    box.hidden = false;
    var fillEl = $('scanScoreFill');
    fillEl.style.width = score + '%';
    fillEl.style.background = score >= 80 ? 'var(--ok)' : (score >= 55 ? 'var(--warn)' : 'var(--danger)');
    $('scanScoreText').textContent = 'Taranabilirlik skoru: ' + score + '/100 · kontrast ' + minRatio.toFixed(1) + ':1';

    showAlerts(alerts);
  }

  function showAlerts(alerts) {
    var box = $('alerts');
    box.textContent = '';
    alerts.forEach(function (a) {
      var el = document.createElement('div');
      el.className = 'alert alert--' + a.level;
      var icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = a.icon;
      var text = document.createElement('span');
      text.textContent = a.text;
      el.appendChild(icon);
      el.appendChild(text);
      box.appendChild(el);
    });
  }

  /* ---------------------------------------------------------------
   * Kayıt biçimi (plan bölüm 5 ile uyumlu)
   * ------------------------------------------------------------- */
  function toRecord(thumbnail) {
    return {
      id: QRStorage.uuid(),
      createdAt: new Date().toISOString(),
      contentType: state.type,
      content: current ? current.content : '',
      values: clone(state.data[state.type]),
      favorite: 0,
      style: {
        dotShape: state.dotShape,
        cornerFrameShape: state.eyeFrameShape,
        cornerBallShape: state.eyeBallShape,
        perCornerEyes: state.perCornerEyes,
        eyes: clone(state.eyes),
        foreground: state.fg,
        background: state.bg,
        eyeColor: state.eyeColorEnabled ? state.eyeColor : '',
        gradient: clone(state.gradient),
        transparentBackground: state.transparentBg,
        margin: state.margin,
        backgroundRadius: state.bgRadius,
        errorCorrection: effectiveEc()
      },
      logo: {
        enabled: !!state.logo.dataUrl,
        dataUrl: state.logo.dataUrl,
        sizeRatio: state.logo.sizeRatio,
        backgroundFill: state.logo.backdrop ? state.logo.bgColor : 'none',
        rounded: state.logo.rounded
      },
      frame: clone(state.frame),
      thumbnail: thumbnail || ''
    };
  }

  function fromRecord(rec) {
    snapshot(); // geçmişten yükleme de geri alınabilsin
    var s = rec.style || {};
    state.type = rec.contentType || 'url';
    if (rec.values) state.data[state.type] = deepAssign(QRContent.defaults(state.type), rec.values);
    state.dotShape = s.dotShape || 'rounded';
    state.eyeFrameShape = s.cornerFrameShape || 'rounded';
    state.eyeBallShape = s.cornerBallShape || 'rounded';
    state.perCornerEyes = !!s.perCornerEyes;
    if (Array.isArray(s.eyes) && s.eyes.length === 3) state.eyes = clone(s.eyes);
    state.fg = s.foreground || '#111827';
    state.bg = s.background || '#FFFFFF';
    state.eyeColorEnabled = !!s.eyeColor;
    state.eyeColor = s.eyeColor || state.fg;
    if (s.gradient) state.gradient = deepAssign(clone(defaultState().gradient), s.gradient);
    state.transparentBg = !!s.transparentBackground;
    state.margin = typeof s.margin === 'number' ? s.margin : 4;
    state.bgRadius = typeof s.backgroundRadius === 'number' ? s.backgroundRadius : 0;
    state.ecLevel = s.errorCorrection || 'M';

    var lg = rec.logo || {};
    state.logo = {
      dataUrl: lg.enabled ? (lg.dataUrl || '') : '',
      sizeRatio: lg.sizeRatio || 0.22,
      backdrop: !!lg.backgroundFill && lg.backgroundFill !== 'none',
      bgColor: (lg.backgroundFill && lg.backgroundFill !== 'none') ? lg.backgroundFill : '#FFFFFF',
      rounded: lg.rounded !== false
    };
    if (rec.frame) state.frame = deepAssign(clone(defaultState().frame), rec.frame);

    buildTypeTabs();
    buildForm();
    syncControlsFromState();
    render();
  }

  function saveCurrentToHistory(silent) {
    if (!current) return Promise.resolve();
    return QRExport.toPngDataUrl(current.svg, current.built, 240).then(function (thumb) {
      return QRStorage.save(toRecord(thumb));
    }).then(function () {
      return QRHistoryUI.refresh();
    }).then(function () {
      if (!silent) toast('Geçmişe kaydedildi.');
    }).catch(function (err) {
      toast('Kaydedilemedi: ' + err.message);
    });
  }

  /* ---------------------------------------------------------------
   * Kontrolleri duruma göre senkronla
   * ------------------------------------------------------------- */
  function syncControlsFromState() {
    $('fgColor').value = state.fg;
    $('fgColorText').value = state.fg;
    $('bgColor').value = state.bg;
    $('bgColorText').value = state.bg;
    $('transparentBg').checked = state.transparentBg;

    $('gradientEnabled').checked = state.gradient.enabled;
    $('gradientPanel').hidden = !state.gradient.enabled;
    $('gradColor1').value = state.gradient.colors[0];
    $('gradColor2').value = state.gradient.colors[1];
    $('gradType').value = state.gradient.type;
    $('gradAngle').value = state.gradient.angle;
    $('gradAngleVal').textContent = state.gradient.angle + '°';

    $('eyeColorEnabled').checked = state.eyeColorEnabled;
    $('eyeColorPanel').hidden = !state.eyeColorEnabled;
    $('eyeColor').value = state.eyeColor;
    $('eyeColorText').value = state.eyeColor;

    $('perCornerEyes').checked = state.perCornerEyes;
    $('perCornerPanel').hidden = !state.perCornerEyes;

    $('ecLevel').value = state.ecLevel;
    $('ecLevel').disabled = !!state.logo.dataUrl;
    $('ecHint').textContent = state.logo.dataUrl
      ? 'Logo eklendiği için H seviyesi zorunlu kılındı.'
      : 'Seviye yükseldikçe kod yoğunlaşır ama hasara/logoya dayanıklılık artar.';

    $('margin').value = state.margin;
    $('marginVal').textContent = state.margin;
    $('bgRadius').value = state.bgRadius;
    $('bgRadiusVal').textContent = state.bgRadius;

    $('logoSize').value = Math.round(state.logo.sizeRatio * 100);
    $('logoSizeVal').textContent = '%' + Math.round(state.logo.sizeRatio * 100);
    $('logoBackdrop').checked = state.logo.backdrop;
    $('logoBgColor').value = state.logo.bgColor;
    $('logoRounded').checked = state.logo.rounded;
    $('logoPanel').hidden = !state.logo.dataUrl;
    $('logoPreview').hidden = !state.logo.dataUrl;
    $('logoEmpty').hidden = !!state.logo.dataUrl;
    if (state.logo.dataUrl) $('logoImg').src = state.logo.dataUrl;

    $('frameEnabled').checked = state.frame.enabled;
    $('framePanel').hidden = !state.frame.enabled;
    $('frameStyle').value = state.frame.style;
    $('frameText').value = state.frame.text;
    $('frameColor').value = state.frame.color;
    $('frameTextColor').value = state.frame.textColor;

    syncShapeActive('dotShapes', DOT_SHAPES, function () { return state.dotShape; });
    syncShapeActive('eyeFrameShapes', EYE_FRAME_SHAPES, function () { return state.eyeFrameShape; });
    syncShapeActive('eyeBallShapes', EYE_BALL_SHAPES, function () { return state.eyeBallShape; });
    buildPerCorner();
  }

  /* ---------------------------------------------------------------
   * Geri alma
   * ------------------------------------------------------------- */
  function snapshot() {
    if (suppressSnapshot) return;
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 25) undoStack.shift();
  }
  var snapshotOnce = debounce(snapshot, 400);

  function undo() {
    if (!undoStack.length) { toast('Geri alınacak değişiklik yok.'); return; }
    var prev = undoStack.pop();
    suppressSnapshot = true;
    state = JSON.parse(prev);
    buildTypeTabs();
    buildForm();
    syncControlsFromState();
    render();
    suppressSnapshot = false;
    toast('Son değişiklik geri alındı.');
  }

  /* ---------------------------------------------------------------
   * Ayarların kalıcılığı + bağlantı paylaşımı
   * ------------------------------------------------------------- */
  function shareableState() {
    var copy = clone(state);
    delete copy.data; // form değerleri ayrı taşınır
    copy.logo.dataUrl = '';
    return { s: copy, t: state.type, v: state.data[state.type] };
  }

  function persistSettings() {
    var copy = clone(state);
    // Büyük logo verisini localStorage yerine sadece oturumda tut
    if (copy.logo.dataUrl && copy.logo.dataUrl.length > 400000) copy.logo.dataUrl = '';
    QRStorage.saveSettings(copy);
  }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(str) {
    var s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function applyShareHash() {
    if (!location.hash || location.hash.length < 4) return false;
    try {
      var obj = JSON.parse(b64decode(location.hash.slice(1)));
      if (!obj || !obj.s) return false;
      var fresh = defaultState();
      deepAssign(fresh, obj.s);
      // Paylaşım bağlantısı logo taşımaz; dışarıdan gelen değer SVG'ye enjekte edilmesin
      fresh.logo.dataUrl = '';
      fresh.data = state.data;
      state = fresh;
      if (obj.t) state.type = obj.t;
      if (obj.v) state.data[state.type] = deepAssign(QRContent.defaults(state.type), obj.v);
      return true;
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------
   * Rastgele tasarım
   * ------------------------------------------------------------- */
  function randomDesign() {
    var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var palettes = [
      ['#6366F1', '#EC4899'], ['#0EA5E9', '#22D3EE'], ['#F59E0B', '#EF4444'],
      ['#10B981', '#065F46'], ['#7C3AED', '#2563EB'], ['#DB2777', '#F97316'],
      ['#111827', '#4B5563'], ['#0F766E', '#84CC16']
    ];
    snapshot();
    var pal = pick(palettes);
    var useGradient = Math.random() > 0.4;

    state.dotShape = pick(DOT_SHAPES).id;
    state.eyeFrameShape = pick(EYE_FRAME_SHAPES).id;
    state.eyeBallShape = pick(EYE_BALL_SHAPES).id;
    state.gradient.enabled = useGradient;
    state.gradient.type = Math.random() > 0.75 ? 'radial' : 'linear';
    state.gradient.angle = Math.floor(Math.random() * 8) * 45;
    state.gradient.colors = pal.slice();
    state.fg = pal[0];
    state.bg = '#FFFFFF';
    state.transparentBg = false;
    state.eyeColorEnabled = Math.random() > 0.65;
    state.eyeColor = pal[1];
    state.eyes = state.eyes.map(function () {
      return { frame: state.eyeFrameShape, ball: state.eyeBallShape };
    });

    syncControlsFromState();
    render();
    toast('Rastgele tasarım uygulandı.');
  }

  /* ---------------------------------------------------------------
   * Dışa aktarma
   * ------------------------------------------------------------- */
  function pngWidth() {
    var sel = $('pngSize').value;
    if (sel === 'custom') {
      var v = parseInt($('pngSizeCustom').value, 10);
      return Math.max(64, Math.min(8192, isNaN(v) ? 1024 : v));
    }
    return parseInt(sel, 10);
  }

  function exportPNG() {
    if (!current) return;
    var w = pngWidth();
    var name = QRExport.makeFilename(current.content, 'png');
    QRExport.downloadPNG(current.svg, current.built, w, name).then(function () {
      toast('PNG indirildi (' + w + 'px).');
      saveCurrentToHistory(true);
    }).catch(function (err) { toast('PNG hatası: ' + err.message); });
  }

  function exportSVG() {
    if (!current) return;
    var name = QRExport.makeFilename(current.content, 'svg');
    QRExport.downloadSVG(current.svg, name);
    toast('SVG indirildi.');
    saveCurrentToHistory(true);
  }

  function exportPDF() {
    if (!current) return;
    var name = QRExport.makeFilename(current.content, 'pdf');
    $('btnPdf').disabled = true;
    QRExport.downloadPDF(current.built, {
      widthMm: state.pdfWidth,
      logoBacking: state.logo.backdrop ? state.logo.bgColor : (state.transparentBg ? '#FFFFFF' : state.bg)
    }, name).then(function () {
      toast('PDF indirildi (vektörel, ' + state.pdfWidth + ' mm).');
      saveCurrentToHistory(true);
    }).catch(function (err) {
      toast('PDF hatası: ' + err.message);
    }).then(function () {
      $('btnPdf').disabled = false;
    });
  }

  /* ---------------------------------------------------------------
   * Logo yükleme
   * ------------------------------------------------------------- */
  function handleLogoFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Lütfen bir görsel dosyası seçin.'); return; }
    if (file.size > 4 * 1024 * 1024) { toast('Logo 4 MB\'tan küçük olmalı.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      snapshot();
      state.logo.dataUrl = reader.result;
      if (state.ecLevel !== 'H') state.ecLevel = 'H';
      syncControlsFromState();
      render();
      toast('Logo eklendi — hata düzeltme H seviyesine alındı.');
    };
    reader.onerror = function () { toast('Logo okunamadı.'); };
    reader.readAsDataURL(file);
  }

  /* ---------------------------------------------------------------
   * Toplu üretim
   * ------------------------------------------------------------- */
  var batchRows = null;

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function batchAlert(level, text) {
    var box = $('batchAlerts');
    var el = document.createElement('div');
    el.className = 'alert alert--' + level;
    el.textContent = text;
    box.appendChild(el);
  }

  function runBatch() {
    $('batchAlerts').textContent = '';
    var jobs = [];

    if (batchRows && batchRows.length) {
      jobs = QRBatch.toJobs(batchRows);
    } else {
      var lines = $('batchText').value.split(/\r?\n/).map(function (l) { return l.trim(); })
        .filter(function (l) { return l; });
      jobs = lines.map(function (l) { return { content: l, label: '' }; });
    }

    if (!jobs.length) { batchAlert('warn', 'Üretilecek içerik bulunamadı.'); return; }
    if (jobs.length > 500) { batchAlert('warn', 'En fazla 500 satır işlenir. İlk 500 satır kullanılacak.'); jobs = jobs.slice(0, 500); }

    var progress = $('batchProgress');
    var fill = $('batchProgressFill');
    var text = $('batchProgressText');
    progress.hidden = false;
    $('btnBatchRun').disabled = true;

    QRBatch.run(jobs, {
      style: styleOptions(),
      ecLevel: effectiveEc(),
      format: $('batchFormat').value,
      pngSize: parseInt($('batchSize').value, 10),
      onProgress: function (i, total, content) {
        fill.style.width = Math.round((i / total) * 100) + '%';
        text.textContent = (i + 1) + ' / ' + total + ' — ' + content.slice(0, 42);
      }
    }).then(function (res) {
      fill.style.width = '100%';
      text.textContent = res.count + ' kod üretildi.';
      if (res.errors.length) {
        batchAlert('warn', res.errors.length + ' satır atlandı (çok uzun veya geçersiz): ' +
          res.errors.slice(0, 3).map(function (e) { return e.row; }).join(', ') + '…');
      }
      if (res.blob) {
        QRExport.download(res.blob, 'qr-toplu-' + Date.now() + '.zip');
        batchAlert('ok', res.count + ' dosya ZIP olarak indirildi.');
      } else {
        batchAlert('danger', 'Hiçbir kod üretilemedi.');
      }
    }).catch(function (err) {
      batchAlert('danger', 'Hata: ' + err.message);
    }).then(function () {
      $('btnBatchRun').disabled = false;
    });
  }

  /* ---------------------------------------------------------------
   * Kamera ile tarama testi
   * ------------------------------------------------------------- */
  var scanStream = null, scanTimer = null;

  function scanAlert(level, text) {
    var box = $('scanAlerts');
    box.textContent = '';
    var el = document.createElement('div');
    el.className = 'alert alert--' + level;
    el.textContent = text;
    box.appendChild(el);
  }

  function startScan() {
    openModal('scanModal');
    $('scanAlerts').textContent = '';

    if (!('BarcodeDetector' in window)) {
      scanAlert('info',
        'Bu tarayıcı yerleşik barkod okuyucuyu (BarcodeDetector) desteklemiyor. ' +
        'Kodu telefonunuzun kamerasıyla test edebilirsiniz — genellikle en gerçekçi sonucu bu verir.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      scanAlert('warn', 'Kameraya erişilemiyor. Sayfayı http://localhost üzerinden açtığınızdan emin olun.');
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      scanStream = stream;
      var video = $('scanVideo');
      video.srcObject = stream;
      video.play();
      var detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanAlert('info', 'Kamera açık — QR kodu çerçeveye alın.');

      scanTimer = setInterval(function () {
        detector.detect(video).then(function (codes) {
          if (!codes.length) return;
          var value = codes[0].rawValue;
          if (current && value === current.content) {
            scanAlert('ok', '✓ Okundu ve içerik birebir eşleşti.');
          } else {
            scanAlert('warn', 'Okundu: ' + value.slice(0, 120) + (current ? ' (mevcut içerikle aynı değil)' : ''));
          }
        }).catch(function () { /* kare atlandı */ });
      }, 400);
    }).catch(function (err) {
      scanAlert('warn', 'Kamera açılamadı: ' + err.message);
    });
  }

  function stopScan() {
    clearInterval(scanTimer);
    scanTimer = null;
    if (scanStream) {
      scanStream.getTracks().forEach(function (t) { t.stop(); });
      scanStream = null;
    }
    $('scanVideo').srcObject = null;
  }

  /* ---------------------------------------------------------------
   * Olay bağlama
   * ------------------------------------------------------------- */
  function bindColorPair(colorId, textId, get, set) {
    var color = $(colorId), text = $(textId);
    color.addEventListener('input', function () {
      snapshotOnce();
      set(color.value.toUpperCase());
      text.value = color.value.toUpperCase();
      renderDebounced();
    });
    text.addEventListener('change', function () {
      var v = normalizeHex(text.value, get());
      snapshot();
      set(v);
      color.value = v;
      text.value = v;
      render();
    });
  }

  function bindEvents() {
    /* --- Renkler --- */
    bindColorPair('fgColor', 'fgColorText', function () { return state.fg; }, function (v) { state.fg = v; });
    bindColorPair('bgColor', 'bgColorText', function () { return state.bg; }, function (v) { state.bg = v; });
    bindColorPair('eyeColor', 'eyeColorText', function () { return state.eyeColor; }, function (v) { state.eyeColor = v; });

    $('transparentBg').addEventListener('change', function () {
      snapshot();
      state.transparentBg = this.checked;
      render();
    });

    $('gradientEnabled').addEventListener('change', function () {
      snapshot();
      state.gradient.enabled = this.checked;
      $('gradientPanel').hidden = !this.checked;
      render();
    });
    $('gradColor1').addEventListener('input', function () {
      snapshotOnce(); state.gradient.colors[0] = this.value.toUpperCase(); renderDebounced();
    });
    $('gradColor2').addEventListener('input', function () {
      snapshotOnce(); state.gradient.colors[1] = this.value.toUpperCase(); renderDebounced();
    });
    $('gradType').addEventListener('change', function () {
      snapshot(); state.gradient.type = this.value; render();
    });
    $('gradAngle').addEventListener('input', function () {
      state.gradient.angle = parseInt(this.value, 10);
      $('gradAngleVal').textContent = state.gradient.angle + '°';
      renderDebounced();
    });

    $('eyeColorEnabled').addEventListener('change', function () {
      snapshot();
      state.eyeColorEnabled = this.checked;
      $('eyeColorPanel').hidden = !this.checked;
      render();
    });

    $('perCornerEyes').addEventListener('change', function () {
      snapshot();
      state.perCornerEyes = this.checked;
      $('perCornerPanel').hidden = !this.checked;
      if (this.checked) {
        state.eyes = state.eyes.map(function () {
          return { frame: state.eyeFrameShape, ball: state.eyeBallShape };
        });
        buildPerCorner();
      }
      render();
    });

    /* --- Logo --- */
    var drop = $('logoDrop');
    drop.addEventListener('click', function (e) {
      if (e.target.id === 'logoRemove') return;
      $('logoFile').click();
    });
    $('logoFile').addEventListener('change', function () { handleLogoFile(this.files[0]); this.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-drag'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleLogoFile(e.dataTransfer.files[0]);
    });
    $('logoRemove').addEventListener('click', function (e) {
      e.stopPropagation();
      snapshot();
      state.logo.dataUrl = '';
      syncControlsFromState();
      render();
      toast('Logo kaldırıldı.');
    });
    $('logoSize').addEventListener('input', function () {
      state.logo.sizeRatio = parseInt(this.value, 10) / 100;
      $('logoSizeVal').textContent = '%' + this.value;
      renderDebounced();
    });
    $('logoBackdrop').addEventListener('change', function () {
      snapshot(); state.logo.backdrop = this.checked; render();
    });
    $('logoBgColor').addEventListener('input', function () {
      snapshotOnce(); state.logo.bgColor = this.value.toUpperCase(); renderDebounced();
    });
    $('logoRounded').addEventListener('change', function () {
      snapshot(); state.logo.rounded = this.checked; render();
    });

    /* --- Çerçeve --- */
    $('frameEnabled').addEventListener('change', function () {
      snapshot();
      state.frame.enabled = this.checked;
      $('framePanel').hidden = !this.checked;
      render();
    });
    $('frameStyle').addEventListener('change', function () { snapshot(); state.frame.style = this.value; render(); });
    $('frameText').addEventListener('input', function () { state.frame.text = this.value; renderDebounced(); });
    $('frameColor').addEventListener('input', function () { snapshotOnce(); state.frame.color = this.value.toUpperCase(); renderDebounced(); });
    $('frameTextColor').addEventListener('input', function () { snapshotOnce(); state.frame.textColor = this.value.toUpperCase(); renderDebounced(); });

    /* --- Gelişmiş --- */
    $('ecLevel').addEventListener('change', function () { snapshot(); state.ecLevel = this.value; render(); });
    $('margin').addEventListener('input', function () {
      state.margin = parseInt(this.value, 10);
      $('marginVal').textContent = state.margin;
      renderDebounced();
    });
    $('bgRadius').addEventListener('input', function () {
      state.bgRadius = parseFloat(this.value);
      $('bgRadiusVal').textContent = state.bgRadius;
      renderDebounced();
    });

    /* --- Çıktı --- */
    $('pngSize').addEventListener('change', function () {
      $('pngSizeCustom').hidden = this.value !== 'custom';
      state.pngSize = this.value === 'custom' ? parseInt($('pngSizeCustom').value, 10) : parseInt(this.value, 10);
    });
    $('pngSizeCustom').addEventListener('input', function () { state.pngSize = pngWidth(); });
    $('pdfWidth').addEventListener('input', function () {
      state.pdfWidth = parseInt(this.value, 10);
      $('pdfWidthVal').textContent = state.pdfWidth + ' mm';
    });

    $('btnPng').addEventListener('click', exportPNG);
    $('btnSvg').addEventListener('click', exportSVG);
    $('btnPdf').addEventListener('click', exportPDF);
    $('btnSaveHistory').addEventListener('click', function () { saveCurrentToHistory(false); });

    /* --- Geçmiş yedeği --- */
    $('btnExportHistory').addEventListener('click', function () {
      QRStorage.exportJson().then(function (json) {
        QRExport.download(new Blob([json], { type: 'application/json' }),
          'qr-gecmis-' + new Date().toISOString().slice(0, 10) + '.json');
        toast('Geçmiş JSON olarak indirildi.');
      });
    });
    $('btnImportHistory').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function () {
      var file = this.files[0];
      this.value = '';
      if (!file) return;
      file.text().then(function (text) {
        return QRStorage.importJson(text, 'merge');
      }).then(function (count) {
        toast(count + ' kayıt içe aktarıldı.');
        QRHistoryUI.refresh();
      }).catch(function (err) { toast('İçe aktarma hatası: ' + err.message); });
    });

    /* --- Önizleme araçları --- */
    $('btnRandom').addEventListener('click', randomDesign);
    $('btnReset').addEventListener('click', function () {
      if (!confirm('Tüm tasarım ayarları varsayılana dönecek. İçerik korunur. Devam edilsin mi?')) return;
      snapshot();
      var data = state.data, type = state.type;
      state = defaultState();
      state.data = data;
      state.type = type;
      syncControlsFromState();
      render();
      toast('Tasarım sıfırlandı.');
    });
    $('btnShare').addEventListener('click', function () {
      var hash = b64encode(JSON.stringify(shareableState()));
      var url = location.origin + location.pathname + '#' + hash;
      if (url.length > 8000) { toast('Ayarlar bağlantı için fazla büyük.'); return; }
      history.replaceState(null, '', '#' + hash);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast('Ayar bağlantısı panoya kopyalandı.');
        }).catch(function () { toast('Bağlantı adres çubuğunda hazır.'); });
      } else toast('Bağlantı adres çubuğunda hazır.');
    });

    /* --- Modallar --- */
    $('btnBatch').addEventListener('click', function () { openModal('batchModal'); });
    $('btnScanTest').addEventListener('click', startScan);
    document.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var modal = el.closest('.modal');
        if (!modal) return;
        modal.hidden = true;
        if (modal.id === 'scanModal') stopScan();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        ['batchModal', 'scanModal'].forEach(function (id) {
          if (!$(id).hidden) { $(id).hidden = true; if (id === 'scanModal') stopScan(); }
        });
      }
    });

    /* --- Toplu üretim girişleri --- */
    var csvDrop = $('csvDrop');
    csvDrop.addEventListener('click', function () { $('csvFile').click(); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      csvDrop.addEventListener(ev, function (e) { e.preventDefault(); csvDrop.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      csvDrop.addEventListener(ev, function (e) { e.preventDefault(); csvDrop.classList.remove('is-drag'); });
    });
    function readCsv(file) {
      if (!file) return;
      file.text().then(function (text) {
        batchRows = QRBatch.parseCSV(text);
        var jobs = QRBatch.toJobs(batchRows);
        $('batchAlerts').textContent = '';
        batchAlert('ok', file.name + ' okundu — ' + jobs.length + ' satır hazır.');
      }).catch(function (err) { batchAlert('danger', 'CSV okunamadı: ' + err.message); });
    }
    csvDrop.addEventListener('drop', function (e) { readCsv(e.dataTransfer.files[0]); });
    $('csvFile').addEventListener('change', function () { readCsv(this.files[0]); this.value = ''; });
    $('batchText').addEventListener('input', function () { if (this.value.trim()) batchRows = null; });
    $('btnBatchRun').addEventListener('click', runBatch);

    /* --- Tema --- */
    $('btnTheme').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      QRStorage.saveTheme(next);
    });

    /* --- Klavye kısayolları --- */
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) exportSVG(); else exportPNG();
      } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        undo();
      } else if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        randomDesign();
      }
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* ---------------------------------------------------------------
   * Başlangıç
   * ------------------------------------------------------------- */
  /* Native Android kabuğunda çalışırken arayüzü uyarla */
  function applyAndroidTweaks() {
    if (!QRExport.isAndroidApp || !QRExport.isAndroidApp()) return;
    document.body.classList.add('is-android');

    // Uygulama içinde ayar bağlantısı ve klavye kısayolları anlamsız
    var share = $('btnShare');
    if (share) share.hidden = true;
    var keys = document.querySelector('.footer__keys');
    if (keys) keys.hidden = true;

    // 4096 px, telefon belleğini zorlayabilir — kaldır
    var sizeSel = $('pngSize');
    var big = sizeSel.querySelector('option[value="4096"]');
    if (big) big.remove();
    if (sizeSel.value !== '1024') sizeSel.value = '1024';

    // İndirme hedefini kullanıcıya söyle
    var hint = document.querySelector('.downloads + .field .hint');
    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Dosyalar telefonun İndirilenler klasörüne kaydedilir.';
    if (hint && hint.parentElement) hint.parentElement.appendChild(note);
  }

  function init() {
    // Tema
    var savedTheme = QRStorage.loadTheme();
    if (!savedTheme) {
      savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(savedTheme);

    // Kayıtlı ayarlar
    var saved = QRStorage.loadSettings();
    if (saved) {
      var fresh = defaultState();
      deepAssign(fresh, saved);
      // Eski sürümlerden gelen eksik alanları tamamla
      QRContent.types.forEach(function (t) {
        fresh.data[t.id] = deepAssign(QRContent.defaults(t.id), fresh.data[t.id] || {});
      });
      state = fresh;
    }
    applyShareHash();

    buildTypeTabs();
    buildForm();
    buildShapePicker('dotShapes', DOT_SHAPES, 'dot',
      function () { return state.dotShape; },
      function (v) { state.dotShape = v; });
    buildShapePicker('eyeFrameShapes', EYE_FRAME_SHAPES, 'eyeFrame',
      function () { return state.eyeFrameShape; },
      function (v) { state.eyeFrameShape = v; });
    buildShapePicker('eyeBallShapes', EYE_BALL_SHAPES, 'eyeBall',
      function () { return state.eyeBallShape; },
      function (v) { state.eyeBallShape = v; });
    buildPresets();
    syncControlsFromState();
    bindEvents();
    applyAndroidTweaks();

    QRHistoryUI.init({
      onLoad: function (rec) {
        fromRecord(rec);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast('Kayıt düzenlemeye açıldı.');
      },
      onToast: toast
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
