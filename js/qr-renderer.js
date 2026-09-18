/* =====================================================================
 *  qr-renderer.js — Matris -> Vektörel çizim
 *  ---------------------------------------------------------------
 *  Matrisi, seçilen nokta/köşe şekilleri, renk/gradient, logo ve
 *  çerçeve ile birlikte bir "çizim komutları" listesine dönüştürür.
 *  Bu liste hem SVG'ye hem de (qr-export.js içinde) PDF'e çevrilebilir.
 *
 *  Tüm path'ler yalnızca M / L / C / Z komutları kullanır —
 *  böylece PDF içerik akışına birebir çevrilebilirler.
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QRRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var K = 0.5522847498; // daire yayı için bezier sabiti
  var FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  function n(v) {
    return (Math.round(v * 1000) / 1000).toString();
  }

  /* ---------------------------------------------------------------
   * Temel path yardımcıları (yalnız M/L/C/Z)
   * ------------------------------------------------------------- */

  // Köşe yarıçapları ayrı ayrı verilebilen dikdörtgen
  function roundRect(x, y, w, h, r) {
    var tl = r[0], tr = r[1], br = r[2], bl = r[3];
    var max = Math.min(w, h) / 2;
    tl = Math.min(tl, max); tr = Math.min(tr, max);
    br = Math.min(br, max); bl = Math.min(bl, max);

    var p = [];
    p.push('M' + n(x + tl) + ' ' + n(y));
    p.push('L' + n(x + w - tr) + ' ' + n(y));
    if (tr > 0) p.push('C' + n(x + w - tr + tr * K) + ' ' + n(y) + ' ' +
      n(x + w) + ' ' + n(y + tr - tr * K) + ' ' + n(x + w) + ' ' + n(y + tr));
    p.push('L' + n(x + w) + ' ' + n(y + h - br));
    if (br > 0) p.push('C' + n(x + w) + ' ' + n(y + h - br + br * K) + ' ' +
      n(x + w - br + br * K) + ' ' + n(y + h) + ' ' + n(x + w - br) + ' ' + n(y + h));
    p.push('L' + n(x + bl) + ' ' + n(y + h));
    if (bl > 0) p.push('C' + n(x + bl - bl * K) + ' ' + n(y + h) + ' ' +
      n(x) + ' ' + n(y + h - bl + bl * K) + ' ' + n(x) + ' ' + n(y + h - bl));
    p.push('L' + n(x) + ' ' + n(y + tl));
    if (tl > 0) p.push('C' + n(x) + ' ' + n(y + tl - tl * K) + ' ' +
      n(x + tl - tl * K) + ' ' + n(y) + ' ' + n(x + tl) + ' ' + n(y));
    p.push('Z');
    return p.join('');
  }

  function rect(x, y, w, h) { return roundRect(x, y, w, h, [0, 0, 0, 0]); }

  function circle(cx, cy, r, ccw) {
    var o = r * K;
    if (ccw) {
      return 'M' + n(cx) + ' ' + n(cy - r) +
        'C' + n(cx - o) + ' ' + n(cy - r) + ' ' + n(cx - r) + ' ' + n(cy - o) + ' ' + n(cx - r) + ' ' + n(cy) +
        'C' + n(cx - r) + ' ' + n(cy + o) + ' ' + n(cx - o) + ' ' + n(cy + r) + ' ' + n(cx) + ' ' + n(cy + r) +
        'C' + n(cx + o) + ' ' + n(cy + r) + ' ' + n(cx + r) + ' ' + n(cy + o) + ' ' + n(cx + r) + ' ' + n(cy) +
        'C' + n(cx + r) + ' ' + n(cy - o) + ' ' + n(cx + o) + ' ' + n(cy - r) + ' ' + n(cx) + ' ' + n(cy - r) + 'Z';
    }
    return 'M' + n(cx) + ' ' + n(cy - r) +
      'C' + n(cx + o) + ' ' + n(cy - r) + ' ' + n(cx + r) + ' ' + n(cy - o) + ' ' + n(cx + r) + ' ' + n(cy) +
      'C' + n(cx + r) + ' ' + n(cy + o) + ' ' + n(cx + o) + ' ' + n(cy + r) + ' ' + n(cx) + ' ' + n(cy + r) +
      'C' + n(cx - o) + ' ' + n(cy + r) + ' ' + n(cx - r) + ' ' + n(cy + o) + ' ' + n(cx - r) + ' ' + n(cy) +
      'C' + n(cx - r) + ' ' + n(cy - o) + ' ' + n(cx - o) + ' ' + n(cy - r) + ' ' + n(cx) + ' ' + n(cy - r) + 'Z';
  }

  function diamond(x, y, s) {
    var h = s / 2;
    return 'M' + n(x + h) + ' ' + n(y) +
      'L' + n(x + s) + ' ' + n(y + h) +
      'L' + n(x + h) + ' ' + n(y + s) +
      'L' + n(x) + ' ' + n(y + h) + 'Z';
  }

  /* ---------------------------------------------------------------
   * Nokta (veri modülü) şekilleri
   * nb = { t, r, b, l } — komşu modül var mı
   * ------------------------------------------------------------- */
  function dotPath(x, y, shape, nb) {
    switch (shape) {
      case 'dot':
        return circle(x + 0.5, y + 0.5, 0.46);
      case 'diamond':
        return diamond(x, y, 1);
      case 'rounded':
        return roundRect(x, y, 1, 1, [
          (!nb.t && !nb.l) ? 0.32 : 0,
          (!nb.t && !nb.r) ? 0.32 : 0,
          (!nb.b && !nb.r) ? 0.32 : 0,
          (!nb.b && !nb.l) ? 0.32 : 0
        ]);
      case 'extra-rounded':
        return roundRect(x, y, 1, 1, [
          (!nb.t && !nb.l) ? 0.5 : 0,
          (!nb.t && !nb.r) ? 0.5 : 0,
          (!nb.b && !nb.r) ? 0.5 : 0,
          (!nb.b && !nb.l) ? 0.5 : 0
        ]);
      case 'classy':
        return roundRect(x, y, 1, 1, [
          (!nb.t && !nb.l) ? 0.5 : 0,
          0,
          (!nb.b && !nb.r) ? 0.5 : 0,
          0
        ]);
      case 'square':
      default:
        return rect(x, y, 1, 1);
    }
  }

  /* ---------------------------------------------------------------
   * Köşe (finder) desenleri
   * ------------------------------------------------------------- */
  function eyeFramePath(x, y, shape) {
    // 7x7 dış çerçeve, 1 modül kalınlık -> dış path + ters yönlü iç path (evenodd)
    var outer, inner;
    switch (shape) {
      case 'circle':
        outer = circle(x + 3.5, y + 3.5, 3.5);
        inner = circle(x + 3.5, y + 3.5, 2.5, true);
        break;
      case 'rounded':
        outer = roundRect(x, y, 7, 7, [2, 2, 2, 2]);
        inner = roundRect(x + 1, y + 1, 5, 5, [1.3, 1.3, 1.3, 1.3]);
        break;
      case 'leaf': // damla
        outer = roundRect(x, y, 7, 7, [3.5, 0, 3.5, 0]);
        inner = roundRect(x + 1, y + 1, 5, 5, [2.5, 0, 2.5, 0]);
        break;
      case 'leaf-alt':
        outer = roundRect(x, y, 7, 7, [0, 3.5, 0, 3.5]);
        inner = roundRect(x + 1, y + 1, 5, 5, [0, 2.5, 0, 2.5]);
        break;
      case 'square':
      default:
        outer = rect(x, y, 7, 7);
        inner = rect(x + 1, y + 1, 5, 5);
        break;
    }
    return outer + inner;
  }

  function eyeBallPath(x, y, shape) {
    // 3x3 iç blok — (x, y) 7x7 çerçevenin sol üst köşesi
    var bx = x + 2, by = y + 2;
    switch (shape) {
      case 'circle': return circle(bx + 1.5, by + 1.5, 1.5);
      case 'rounded': return roundRect(bx, by, 3, 3, [1, 1, 1, 1]);
      case 'diamond': return diamond(bx, by, 3);
      case 'leaf': return roundRect(bx, by, 3, 3, [1.5, 0, 1.5, 0]);
      case 'square':
      default: return rect(bx, by, 3, 3);
    }
  }

  /* ---------------------------------------------------------------
   * Ana kurgu
   * ------------------------------------------------------------- */
  var DEFAULTS = {
    margin: 4,
    dotShape: 'rounded',
    eyeFrameShape: 'rounded',
    eyeBallShape: 'rounded',
    perCornerEyes: false,
    eyes: null,               // [{frame, ball}, x3] — sol üst, sağ üst, sol alt
    foreground: '#111827',
    background: '#FFFFFF',
    transparentBackground: false,
    eyeColor: '',             // boşsa ana renk/gradient kullanılır
    gradient: { enabled: false, type: 'linear', angle: 45, colors: ['#6366F1', '#EC4899'] },
    logo: null,               // {dataUrl, sizeRatio, backgroundFill, rounded, padding}
    frame: { enabled: false, style: 'scan-me-bottom', text: 'BENİ TARA', color: '#111827', textColor: '#FFFFFF' },
    backgroundRadius: 0
  };

  function merge(dst, src) {
    var out = {};
    var k;
    for (k in dst) if (Object.prototype.hasOwnProperty.call(dst, k)) out[k] = dst[k];
    for (k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k) || src[k] === undefined) continue;
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') {
        out[k] = merge(dst[k], src[k]);
      } else out[k] = src[k];
    }
    return out;
  }

  function build(matrix, options) {
    var o = merge(DEFAULTS, options || {});
    var size = matrix.length;
    var margin = Math.max(0, o.margin);

    // --- Çerçeve ölçüleri (modül birimi) ---
    var frame = o.frame && o.frame.enabled ? o.frame : null;
    var framePad = 0, labelH = 0, labelTop = false;
    if (frame) {
      if (frame.style === 'border') { framePad = 1.6; }
      else if (frame.style === 'scan-me-top') { framePad = 1.6; labelH = 6; labelTop = true; }
      else if (frame.style === 'badge') { framePad = 2.2; labelH = 6.5; }
      else { framePad = 1.6; labelH = 6; } // scan-me-bottom
    }

    var inner = size + margin * 2;              // QR + sessiz bölge
    var W = inner + framePad * 2;
    var H = inner + framePad * 2 + labelH;
    var qrX = framePad + margin;
    var qrY = framePad + margin + (labelTop ? labelH : 0);

    var ops = [];
    var gradient = null;

    // --- Gradient tanımı ---
    var mainFill = o.foreground;
    if (o.gradient && o.gradient.enabled) {
      gradient = {
        id: 'qrGrad',
        type: o.gradient.type || 'linear',
        angle: typeof o.gradient.angle === 'number' ? o.gradient.angle : 45,
        colors: o.gradient.colors && o.gradient.colors.length === 2 ? o.gradient.colors : ['#6366F1', '#EC4899'],
        box: { x: qrX, y: qrY, w: size, h: size }
      };
      var rad = (gradient.angle - 90) * Math.PI / 180;
      var cx = qrX + size / 2, cy = qrY + size / 2, half = size / 2;
      gradient.x1 = cx - Math.cos(rad) * half;
      gradient.y1 = cy - Math.sin(rad) * half;
      gradient.x2 = cx + Math.cos(rad) * half;
      gradient.y2 = cy + Math.sin(rad) * half;
      gradient.cx = cx; gradient.cy = cy; gradient.r = half * 1.15;
      mainFill = 'url(#qrGrad)';
    }
    var eyeFill = o.eyeColor ? o.eyeColor : mainFill;

    // --- Arka plan ---
    if (!o.transparentBackground) {
      var br = o.backgroundRadius || 0;
      ops.push({ type: 'path', d: roundRect(0, 0, W, H, [br, br, br, br]), fill: o.background });
    }

    // --- Çerçeve gövdesi ---
    if (frame) {
      var fc = frame.color || '#111827';
      var tc = frame.textColor || '#FFFFFF';
      var text = (frame.text || '').toString();

      if (frame.style === 'badge') {
        ops.push({ type: 'path', d: roundRect(0, 0, W, H, [2.5, 2.5, 2.5, 2.5]), fill: fc });
        ops.push({
          type: 'path',
          d: roundRect(framePad - 0.8, framePad - 0.8, inner + 1.6, inner + 1.6, [1.6, 1.6, 1.6, 1.6]),
          fill: o.transparentBackground ? '#FFFFFF' : o.background
        });
        if (text) {
          ops.push({
            type: 'text', x: W / 2, y: H - labelH / 2 + 1.15, size: 3.4,
            fill: tc, text: text, anchor: 'middle', weight: '700', spacing: 0.25
          });
        }
      } else if (frame.style === 'border') {
        // İçi boş çerçeve: dış rounded rect + iç ters rect (evenodd)
        var t = 0.8;
        ops.push({
          type: 'path',
          d: roundRect(0, 0, W, H, [2, 2, 2, 2]) + roundRect(t, t, W - 2 * t, H - 2 * t, [1.4, 1.4, 1.4, 1.4]),
          fill: fc, evenodd: true
        });
      } else {
        // scan-me-bottom / scan-me-top
        var barY = labelTop ? 0 : H - labelH;
        var rTop = labelTop ? [2, 2, 0, 0] : [0, 0, 2, 2];
        ops.push({
          type: 'path',
          d: roundRect(0, 0, W, H, [2, 2, 2, 2]) +
             roundRect(0.8, labelTop ? labelH : 0.8, W - 1.6, inner + framePad * 2 - 1.6, [1.4, 1.4, 1.4, 1.4]),
          fill: fc, evenodd: true
        });
        ops.push({ type: 'path', d: roundRect(0, barY, W, labelH, rTop), fill: fc });
        if (text) {
          ops.push({
            type: 'text', x: W / 2, y: barY + labelH / 2 + 1.15, size: 3.4,
            fill: tc, text: text, anchor: 'middle', weight: '700', spacing: 0.25
          });
        }
      }
    }

    // --- Köşe (finder) bölgeleri ---
    var eyeZones = [
      { r: 0, c: 0 },
      { r: 0, c: size - 7 },
      { r: size - 7, c: 0 }
    ];
    function inEye(r, c) {
      for (var i = 0; i < eyeZones.length; i++) {
        var z = eyeZones[i];
        if (r >= z.r && r < z.r + 7 && c >= z.c && c < z.c + 7) return true;
      }
      return false;
    }

    // --- Veri modülleri ---
    function on(r, c) {
      if (r < 0 || c < 0 || r >= size || c >= size) return false;
      if (inEye(r, c)) return false;
      return matrix[r][c] === 1;
    }

    var dots = [];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (!matrix[r][c] || inEye(r, c)) continue;
        dots.push(dotPath(qrX + c, qrY + r, o.dotShape, {
          t: on(r - 1, c), b: on(r + 1, c), l: on(r, c - 1), r: on(r, c + 1)
        }));
      }
    }
    if (dots.length) ops.push({ type: 'path', d: dots.join(''), fill: mainFill });

    // --- Köşe desenleri ---
    var perEye = o.perCornerEyes && Array.isArray(o.eyes) && o.eyes.length === 3 ? o.eyes : null;
    for (var e = 0; e < eyeZones.length; e++) {
      var z2 = eyeZones[e];
      var fShape = perEye ? (perEye[e].frame || o.eyeFrameShape) : o.eyeFrameShape;
      var bShape = perEye ? (perEye[e].ball || o.eyeBallShape) : o.eyeBallShape;
      var color = perEye && perEye[e].color ? perEye[e].color : eyeFill;
      ops.push({ type: 'path', d: eyeFramePath(qrX + z2.c, qrY + z2.r, fShape), fill: color, evenodd: true });
      ops.push({ type: 'path', d: eyeBallPath(qrX + z2.c, qrY + z2.r, bShape), fill: color });
    }

    // --- Logo ---
    if (o.logo && o.logo.dataUrl) {
      var ratio = Math.min(0.3, Math.max(0.05, o.logo.sizeRatio || 0.22));
      var lw = size * ratio;
      var lx = qrX + (size - lw) / 2;
      var ly = qrY + (size - lw) / 2;
      var pad = typeof o.logo.padding === 'number' ? o.logo.padding : 0.6;

      if (o.logo.backgroundFill && o.logo.backgroundFill !== 'none') {
        var pr = o.logo.rounded ? (lw + pad * 2) * 0.22 : 0;
        ops.push({
          type: 'path',
          d: roundRect(lx - pad, ly - pad, lw + pad * 2, lw + pad * 2, [pr, pr, pr, pr]),
          fill: o.logo.backgroundFill
        });
      }
      ops.push({
        type: 'image', x: lx, y: ly, w: lw, h: lw,
        href: o.logo.dataUrl,
        radius: o.logo.rounded ? lw * 0.18 : 0
      });
    }

    return { width: W, height: H, ops: ops, gradient: gradient, moduleCount: size, qrX: qrX, qrY: qrY };
  }

  /* ---------------------------------------------------------------
   * SVG serileştirme
   * ------------------------------------------------------------- */
  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function toSVG(built, pxSize) {
    var W = built.width, H = built.height;
    var px = pxSize || 1024;
    var outW = px, outH = Math.round(px * H / W);

    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + outW + '" height="' + outH + '" viewBox="0 0 ' + n(W) + ' ' + n(H) + '" ' +
      'shape-rendering="geometricPrecision">');

    if (built.gradient) {
      var g = built.gradient;
      parts.push('<defs>');
      if (g.type === 'radial') {
        parts.push('<radialGradient id="' + g.id + '" gradientUnits="userSpaceOnUse" ' +
          'cx="' + n(g.cx) + '" cy="' + n(g.cy) + '" r="' + n(g.r) + '">');
      } else {
        parts.push('<linearGradient id="' + g.id + '" gradientUnits="userSpaceOnUse" ' +
          'x1="' + n(g.x1) + '" y1="' + n(g.y1) + '" x2="' + n(g.x2) + '" y2="' + n(g.y2) + '">');
      }
      parts.push('<stop offset="0" stop-color="' + escapeXml(g.colors[0]) + '"/>');
      parts.push('<stop offset="1" stop-color="' + escapeXml(g.colors[1]) + '"/>');
      parts.push(g.type === 'radial' ? '</radialGradient>' : '</linearGradient>');
      parts.push('</defs>');
    }

    var clipId = 0;
    built.ops.forEach(function (op) {
      if (op.type === 'path') {
        parts.push('<path d="' + op.d + '" fill="' + escapeXml(op.fill) + '"' +
          (op.evenodd ? ' fill-rule="evenodd"' : '') + '/>');
      } else if (op.type === 'image') {
        // Yalnızca gömülü resim verisine izin ver; öznitelikten kaçışı engellemek için kaçışla
        if (!/^data:image\//i.test(String(op.href || ''))) return;
        var href = escapeXml(op.href);
        var attrs = 'x="' + n(op.x) + '" y="' + n(op.y) + '" width="' + n(op.w) + '" height="' + n(op.h) +
          '" preserveAspectRatio="xMidYMid meet"';
        if (op.radius > 0) {
          var cid = 'logoClip' + (clipId++);
          parts.push('<defs><clipPath id="' + cid + '"><path d="' +
            roundRect(op.x, op.y, op.w, op.h, [op.radius, op.radius, op.radius, op.radius]) +
            '"/></clipPath></defs>');
          parts.push('<image ' + attrs + ' clip-path="url(#' + cid + ')" href="' + href +
            '" xlink:href="' + href + '"/>');
        } else {
          parts.push('<image ' + attrs + ' href="' + href + '" xlink:href="' + href + '"/>');
        }
      } else if (op.type === 'text') {
        parts.push('<text x="' + n(op.x) + '" y="' + n(op.y) + '" fill="' + escapeXml(op.fill) +
          '" font-family="' + FONT_STACK + '" font-size="' + n(op.size) + '" font-weight="' + (op.weight || '600') +
          '" letter-spacing="' + n(op.spacing || 0) + '" text-anchor="' + (op.anchor || 'middle') + '">' +
          escapeXml(op.text) + '</text>');
      }
    });

    parts.push('</svg>');
    return parts.join('');
  }

  function render(matrix, options, pxSize) {
    return toSVG(build(matrix, options), pxSize);
  }

  return {
    build: build,
    toSVG: toSVG,
    render: render,
    DEFAULTS: DEFAULTS,
    FONT_STACK: FONT_STACK,
    _paths: { roundRect: roundRect, circle: circle, diamond: diamond, rect: rect }
  };
});
