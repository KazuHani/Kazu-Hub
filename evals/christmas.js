/* ============================================================================
   Christmas gates: the frozen cards (KazuLib.frostCard and the "Christmas
   frost" wiring in script.js), Christmas Day's snowfall (KazuWeatherFx), and
   the static decorations (string lights, the cottage's snowman,
   wreath and eave lights). Shared by tests.js and tests.html; run standalone:
   node evals/christmas.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - frostCard is deterministic (a reload draws the same frost), different
       per card, never NaN, and its 9-slice always fits the card it was drawn
       for: if two corners did not fit, the browser would shrink the whole
       border-image and the snow and rim would drift off the card's edges.
     - the snow never pokes out of the image (it would be cut flat) and the
       frost never reaches the undrawn middle of the 9-slice (a crystal would
       stop at a hard line): every crystal point stays inside its corner's
       fade-out radius, which is the slice boundary.
     - the data URI decodes back to the exact picture and stays small.
     - the real wiring, sliced out of script.js and run against fake observers:
       nothing is drawn until a card nears the viewport, a card is redrawn only
       when its width really changes or it gets too short, nothing runs once the
       season ends, rebuilt cards are picked up, and a missing lib.js is harmless.
     - an opened pop-up keeps the snow on top: openModal freezes the panel
       before its fly-in (drawn at once, seeded per pop-up), closing stops the
       size watch, and phones leave room above a tall pop-up for the snow.
     - the pop-up flies by scale, so while it flies true-size copies of the
       tile's snow and its own ride its exact box (real size, never a scale):
       the picture flown to sits underneath and one copy is always whole, so
       the snow never thins; the pop-up's picture never shows on a box too
       small for its corners (the browser would shrink it); open and close
       mirror by shape; landing puts the panel's own back; and the layer has
       no blend mode or screen-sized box (both measured as dropped frames).
     - the weather rule: Christmas Day snows lightly unless it is raining.
     - the static decorations stay static, decorative and out of the way.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  function between(source, from, to) {
    var a = source.indexOf(from);
    if (a < 0) return null;
    var b = source.indexOf(to, a + from.length);
    return b > a ? source.slice(a, b) : null;
  }

  // Walks the path data frostCard writes (M, L, l with implicit repeats, C, Z)
  // and returns every on-curve point in absolute image coordinates.
  function pathPoints(d) {
    var toks = d.match(/[MLCZl]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    var pts = [], i = 0, cmd = '', x = 0, y = 0;
    function n() { return +toks[i++]; }
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) { cmd = toks[i++]; if (cmd === 'Z') continue; }
      if (cmd === 'M') { x = n(); y = n(); pts.push([x, y]); cmd = 'L'; }
      else if (cmd === 'L') { x = n(); y = n(); pts.push([x, y]); }
      else if (cmd === 'l') { x += n(); y += n(); pts.push([x, y]); }
      else if (cmd === 'C') { n(); n(); n(); n(); x = n(); y = n(); pts.push([x, y]); }
      else i++;
    }
    return pts;
  }

  // CSS color-mix(in oklab, a p, b) for two hex colours, and WCAG contrast:
  // enough to check text against the footer's day/night field at any hour.
  function hexRgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; }); }
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function delin(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function oklab(hex) {
    var c = hexRgb(hex).map(lin);
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function mixOklab(a, b, p) {
    var A = oklab(a), B = oklab(b), k = A.map(function (v, i) { return v * p + B[i] * (1 - p); });
    var l = Math.pow(k[0] + 0.3963377774 * k[1] + 0.2158037573 * k[2], 3), m = Math.pow(k[0] - 0.1055613458 * k[1] - 0.0638541728 * k[2], 3), s = Math.pow(k[0] - 0.0894841775 * k[1] - 1.291485548 * k[2], 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
      .map(function (v) { return Math.min(1, Math.max(0, delin(v))); });
  }
  function luminance(rgb) { var c = rgb.map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrastRgb(a, b) { var x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  // Every element that opens must close, in order (the SVG has no text nodes
  // or comments, so a tag stack is a full well-formedness check here).
  // The string lights' wire is "M x y" then quadratic "Q cx cy x y" swags; each
  // bulb is a <use transform="translate(bx by)"> whose origin is the top of its
  // cap. Returns '' when every cap sits on the wire, else the first miss. The
  // wire once dipped twice as deep as the curve the bulbs were placed on.
  function wireMisses(garland) {
    var d = (/class="xmas-garland-wire" d="([^"]+)"/.exec(garland) || [])[1];
    var bulbs = garland.match(/translate\(-?[\d.]+ -?[\d.]+\)/g) || [];
    if (!d || !bulbs.length) return 'no wire or no bulbs';
    var nums = (d.match(/-?\d*\.?\d+/g) || []).map(Number), segs = [];
    if (!/^M[^A-Za-z]*(Q[^A-Za-z]*)+$/.test(d) || (nums.length - 2) % 4) return 'wire is not M then Q segments';
    for (var k = 2; k < nums.length; k += 4) segs.push([nums[k - 2], nums[k - 1], nums[k], nums[k + 1], nums[k + 2], nums[k + 3]]);
    for (var b = 0; b < bulbs.length; b++) {
      var p = bulbs[b].match(/-?[\d.]+/g).map(Number), s = null;
      for (var j = 0; j < segs.length && !s; j++) if (p[0] >= segs[j][0] && p[0] <= segs[j][4]) s = segs[j];
      if (!s) return 'bulb ' + b + ' at x ' + p[0] + ' is past the wire';
      var lo = 0, hi = 1, t = 0;
      for (var it = 0; it < 50; it++) {
        t = (lo + hi) / 2;
        var x = (1 - t) * (1 - t) * s[0] + 2 * t * (1 - t) * s[2] + t * t * s[4];
        if (x < p[0]) lo = t; else hi = t;
      }
      var y = (1 - t) * (1 - t) * s[1] + 2 * t * (1 - t) * s[3] + t * t * s[5];
      if (Math.abs(y - p[1]) > 0.5) return 'bulb ' + b + ' at (' + p[0] + ', ' + p[1] + ') but the wire is at y ' + y.toFixed(2);
    }
    return '';
  }

  function wellFormed(svg) {
    var re = /<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g, m, stack = [];
    while ((m = re.exec(svg)) !== null) {
      if (m[3] === '/') continue;
      if (m[1] === '/') { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
    }
    return stack.length === 0;
  }

  function run(L, FX, source, css, html, ok, eq) {
    css = css.replace(/\r/g, '');
    html = html.replace(/\r/g, '');
    source = source.replace(/\r/g, '');
    var RISE = L.FROST_RISE, SIDE = L.FROST_SIDE;

    // ---- KazuLib.frostCard: the picture ----
    eq('frost: unusable cards draw nothing', [L.frostCard(), L.frostCard({ w: 59, h: 200 }), L.frostCard({ w: 200, h: 'x' }), L.frostCard({ w: 5000, h: 200 }), L.frostBorderImage(null)], [null, null, null, null, '']);
    eq('frost: how far the frost reaches is 40% of the short side, 30..92px', [L.frostReach(60, 300), L.frostReach(248, 144), L.frostReach(335, 217), L.frostReach(1040, 384)], [30, 58, 87, 92]);
    var a = L.frostCard({ w: 335, h: 217, r: 24, seed: 7 }), b = L.frostCard({ w: 335, h: 217, r: 24, seed: 7 });
    ok('frost: the same card draws the same picture on every load', !!a && a.svg === b.svg);
    var seen = {}, distinct = 0;
    for (var s = 1; s <= 12; s++) { var k = L.frostCard({ w: 335, h: 217, r: 24, seed: s }).svg; if (!seen[k]) { seen[k] = 1; distinct++; } }
    eq('frost: every card on the page gets its own snow line and frost', distinct, 12);
    eq('frost: the border-image geometry (slices, widths, outsets) for a 335x217 card', [a.slice, a.width, a.outset, a.reach], [[RISE + 87, SIDE + 87, 87, SIDE + 87], [RISE + 87, SIDE + 87, 87, SIDE + 87], [RISE, SIDE, 0, SIDE], 87]);
    ok('frost: the picture is the card plus the snow above it and the overhang either side', a.svg.indexOf('width="' + (335 + 2 * SIDE) + '" height="' + (217 + RISE) + '" viewBox="0 0 ' + (335 + 2 * SIDE) + ' ' + (217 + RISE) + '"') !== -1);

    var sizes = [[180, 140], [195, 145], [248, 144], [335, 159], [335, 217], [423, 303], [511, 206], [599, 264], [1040, 384], [1200, 500], [60, 60], [90, 240], [240, 90]];
    var bad = [], fitBad = [], snowBad = [], crystalBad = [], uriBad = [], maxLen = 0, sumLen = 0, count = 0;
    sizes.forEach(function (wh) {
      for (var seed = 1; seed <= 6; seed++) {
        var w = wh[0], h = wh[1], f = L.frostCard({ w: w, h: h, r: 22 + (seed % 3), seed: seed });
        var tag = w + 'x' + h + '#' + seed;
        if (!f || /NaN|undefined|Infinity/.test(f.svg) || !wellFormed(f.svg)) { bad.push(tag); continue; }
        // both corners of every side fit, so the browser never shrinks the image
        if (f.width[0] + f.width[2] > h + RISE || f.width[1] + f.width[3] > w + 2 * SIDE) fitBad.push(tag);
        // the snow stays inside the picture and rests on the card's top edge
        var snow = (/<path d="([^"]*)" fill="url\(#s\)"/.exec(f.svg) || [])[1] || '';
        var sp = pathPoints(snow), lowest = 0;
        sp.forEach(function (p) { if (p[0] < 0 || p[0] > w + 2 * SIDE || p[1] < 1 || p[1] > RISE + 40) snowBad.push(tag + ' ' + p); lowest = Math.max(lowest, p[1]); });
        if (!sp.length || lowest < RISE) snowBad.push(tag + ' never reaches the card');
        // every crystal stays inside its corner's fade-out radius (= the slice edge)
        var cr = '', m, re = /<path d="([^"]*)" stroke-width="(?:\.85|\.55|\.45)"/g;
        while ((m = re.exec(f.svg)) !== null) cr += m[1];
        var corners = [[SIDE, RISE], [SIDE + w, RISE], [SIDE, RISE + h], [SIDE + w, RISE + h]];
        pathPoints(cr).forEach(function (p) {
          var d = Math.min.apply(null, corners.map(function (c) { return Math.sqrt((p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1])); }));
          if (d > f.reach * 1.1 && crystalBad.length < 5) crystalBad.push(tag + ' ' + (d / f.reach).toFixed(2));
        });
        // the CSS value: escaped data URI that decodes to exactly this picture
        var bi = L.frostBorderImage(f), uri = (/^url\("data:image\/svg\+xml,([^"]*)"\) /.exec(bi) || [])[1];
        if (!uri || /[#<>"]/.test(uri) || decodeURIComponent(uri) !== f.svg.replace(/"/g, "'") ||
          bi.slice(bi.indexOf('") ') + 3) !== f.slice.join(' ') + ' / ' + f.width.join('px ') + 'px / ' + f.outset.join('px ') + 'px stretch') uriBad.push(tag);
        maxLen = Math.max(maxLen, bi.length); sumLen += bi.length; count++;
      }
    });
    ok('frost: every size and seed draws a finite, well-formed SVG', !bad.length, bad.join(', '));
    ok('frost: both corners of every side fit the card, so the browser never shrinks the picture', !fitBad.length, fitBad.join(', '));
    ok('frost: the snow stays inside the picture and rests on the card edge', !snowBad.length, snowBad.slice(0, 5).join(' | '));
    ok('frost: no crystal reaches past its corner into the undrawn middle', !crystalBad.length, crystalBad.join(' | '));
    ok('frost: the CSS value is an escaped data URI that decodes to the exact picture', !uriBad.length, uriBad.join(', '));
    ok('frost: small enough to hand to 22 cards (largest card under 28 KB, typical under 18 KB)', maxLen < 28 * 1024 && sumLen / count < 18 * 1024, Math.round(maxLen / 1024) + ' KB max, ' + Math.round(sumLen / count / 1024) + ' KB mean');
    var aBi = L.frostBorderImage(a);
    ok('frost: the crystals fade out by the corner radius and the middle of the 9-slice is never drawn', /<radialGradient id="ftl" gradientUnits="userSpaceOnUse" cx="3" cy="13" r="87">/.test(a.svg) && /<mask id="m"/.test(a.svg) && !/\bfill\b/.test(aBi.slice(aBi.indexOf('") ') + 3)));

    // ---- KazuWeatherFx: Christmas Day's snowfall ----
    var clear = FX.layersFor({ code: 0, cloudCover: 0, windKmh: 5 }, { festive: true });
    eq('snowfall: a clear Christmas Day snows lightly, with no cloud invented', [clear.snow, clear.rain, clear.clouds, clear.active], [FX.FESTIVE_SNOW, 0, 0, true]);
    eq('snowfall: rain wins (rain and snow never share the canvas)', [FX.layersFor({ code: 63 }, { festive: true }).snow, FX.layersFor({ code: 63 }, { festive: true }).rain > 0], [0, true]);
    ok('snowfall: real heavier snow is left as it is', FX.layersFor({ code: 75 }, { festive: true }).snow === FX.layersFor({ code: 75 }).snow && FX.layersFor({ code: 75 }).snow > FX.FESTIVE_SNOW);
    eq('snowfall: any other day is exactly the old rule', JSON.stringify(FX.layersFor({ code: 0, cloudCover: 0 })) === JSON.stringify(FX.layersFor({ code: 0, cloudCover: 0 }, { festive: false })) && FX.layersFor({ code: 0, cloudCover: 0 }).snow, 0);
    ok('snowfall: a ?weather= preview still overrides everything', /var L = forced \|\| layersFor\(weather, opts\);/.test(String(FX.update)));

    // ---- script.js: the wiring (source pins) ----
    var sec = between(source, '  // ---------- Christmas frost (snow on the cards, frost in their corners) ----------', '  // ---------- Seasonal effects ----------');
    ok('wiring: the frost section exists and sits before the season code that calls it', !!sec && source.indexOf('let frostOn = false;') < source.indexOf('function applySeasons()') && source.indexOf('let frostOn = false;') < source.indexOf('\n  applySiteConfig();\n'));
    ok('wiring: applySeasons freezes the cards and re-syncs the snowfall when Christmas flips', source.indexOf('setFrost(!!s.christmas);') !== -1 && source.indexOf('if (christmasLive !== !!s.christmas) { christmasLive = !!s.christmas; syncWeatherFx(); }') !== -1);
    ok('wiring: the weather layers learn it is Christmas, and Christmas snows before the weather arrives', source.indexOf('{ festive: christmasLive }') !== -1 && source.indexOf('if (!weatherCurrent && !WEATHER_FX_RAW && !christmasLive) return;') !== -1);
    var openSrc = between(source, '  function openModal(key, trigger) {', '\n  }\n'), closeSrc = between(source, '  function closeModal() {', '\n  }\n');
    ok('wiring: an opened pop-up is frozen once laid out and before its fly-in, seeded per pop-up', !!openSrc && openSrc.indexOf('frostModal(modalPanel, 101 + Object.keys(MODALS).indexOf(key));') > openSrc.indexOf('if (def.afterRender) def.afterRender();') && openSrc.indexOf('frostModal(') < openSrc.indexOf('flyModal('));
    ok('wiring: closing a pop-up stops its size watch and leaves the snow on for the flight home', !!closeSrc && closeSrc.indexOf('frostModal(null);') !== -1 && !/xmas-frost|--xf/.test(closeSrc));
    var flySrc = between(source, '  function flyModal(card, opening, onDone) {', '\n  }\n'), landSrc = flySrc && between(flySrc, '    anim.onfinish = () => {', '    };');
    ok('wiring: every pop-up flight flies the snow at true size, and a flight cut short leaves none in the air', !!flySrc && flySrc.indexOf('frostLand();') < flySrc.indexOf('if (!modalPanel.animate)') && flySrc.indexOf('if (fly) frostFly(modalEl, modalPanel, card, from, to, opening, { duration: ms, easing: MODAL_EASE, fill: \'both\' });') > flySrc.indexOf('const frames = fly'));
    ok('wiring: the landing hands the panel its own snow back in the same frame as the flight ends', !!landSrc && landSrc.indexOf('frostLand();') > landSrc.indexOf("modalPanel.classList.remove('is-flying');") && landSrc.indexOf('frostLand();') < landSrc.indexOf('done();'));
    ok('wiring: rebuilt control-panel cards are picked up', /function applySiteConfig\(\) \{[\s\S]*?frostRescan\(\);[\s\S]*?\n  \}/.test(source));
    ok('wiring: observers and idle slices only (no timers, no animation frames, no scroll handlers), and every draw goes through the idle queue', !!sec && !/setTimeout|setInterval|requestAnimationFrame|addEventListener/.test(sec) && sec.indexOf('new IntersectionObserver(') !== -1 && sec.indexOf('new ResizeObserver(') !== -1 &&
      (sec.match(/frostDraw\(/g) || []).length === 3 && /function frostPump\(\) \{[^}]*frostDraw\(el\);/.test(sec) && (sec.match(/scheduleIdle\(frostPump, \d+\)/g) || []).length === 2);

    // ---- script.js: the wiring, run for real against fakes ----
    (function () {
      if (!sec) return;
      function card(w, h) {
        var el = { offsetWidth: w, offsetHeight: h, props: {}, cls: {}, draws: 0 };
        el.style = { setProperty: function (k, v) { el.props[k] = v; el.draws++; }, getPropertyValue: function (k) { return el.props[k] || ''; } };
        el.classList = { add: function (c) { el.cls[c] = true; }, contains: function (c) { return !!el.cls[c]; } };
        return el;
      }
      // a DOM node just big enough for a flight: children, removal, animations
      function node() {
        var n = { children: [], style: {}, anims: [], parent: null };
        n.appendChild = function (c) { c.parent = n; n.children.push(c); };
        n.remove = function () { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; };
        n.animate = function (keys, timing) { n.anims.push({ keys: keys, timing: timing }); };
        return n;
      }
      function harness(withLib, cards) {
        var ios = [], ros = [];
        function IO(cb, opts) { this.cb = cb; this.opts = opts; this.on = []; ios.push(this); }
        IO.prototype.observe = function (el) { this.on.push(el); };
        IO.prototype.unobserve = function (el) { this.on = this.on.filter(function (e) { return e !== el; }); };
        IO.prototype.disconnect = function () { this.on = []; };
        function RO(cb) { this.cb = cb; this.on = []; ros.push(this); }
        RO.prototype.observe = function (el) { if (this.on.indexOf(el) === -1) this.on.push(el); };
        RO.prototype.unobserve = function (el) { this.on = this.on.filter(function (e) { return e !== el; }); };
        RO.prototype.disconnect = function () { this.on = []; };
        var win = { IntersectionObserver: IO, ResizeObserver: RO };
        var doc = { querySelectorAll: function () { return cards.slice(); }, createElement: node };
        var idle = [];
        var api = new Function('KazuLib', 'document', 'window', 'getComputedStyle', 'IntersectionObserver', 'ResizeObserver', 'scheduleIdle',
          sec + '\nreturn { setFrost: setFrost, frostRescan: frostRescan, frostModal: frostModal, frostFly: frostFly, frostLand: frostLand };')(
          withLib ? L : null, doc, win, function () { return { borderTopLeftRadius: '24px' }; }, IO, RO, function (fn) { idle.push(fn); });
        api.ios = ios; api.ros = ros; api.idle = idle;
        api.step = function () { var fn = idle.shift(); if (fn) fn(); };
        api.flush = function () { for (var n = 0; idle.length && n < 100; n++) idle.shift()(); };
        api.enter = function (el) { ios[0].cb([{ target: el, isIntersecting: true }]); api.flush(); };
        api.resize = function (el) { ros[0].cb([{ target: el }]); api.flush(); };
        return api;
      }
      var cards = [card(335, 217), card(335, 217), card(1040, 384)];
      var h = harness(true, cards);
      h.setFrost(true);
      ok('wiring (live): turning Christmas on watches every card and draws none yet', h.ios.length === 1 && h.ios[0].on.length === 3 && cards.every(function (c) { return c.draws === 0; }) && h.ios[0].opts.rootMargin === '600px 0px');
      h.enter(cards[0]);
      ok('wiring (live): a card nearing the viewport is drawn once and then only size-watched', cards[0].draws === 1 && cards[0].cls['xmas-frost'] && /^url\("data:image\/svg\+xml,/.test(cards[0].props['--xf']) && h.ios[0].on.indexOf(cards[0]) === -1 && h.ros[0].on.indexOf(cards[0]) !== -1);
      ok('wiring (live): neighbouring cards get different frost', (h.enter(cards[1]), cards[1].props['--xf'] !== cards[0].props['--xf']));
      h.resize(cards[0]);
      cards[0].offsetWidth = 335 * 1.05; h.resize(cards[0]);
      cards[0].offsetHeight = 400; h.resize(cards[0]);
      ok('wiring (live): a re-measure, a 5% width change or a taller card does not redraw', cards[0].draws === 1);
      cards[0].offsetWidth = 335 * 1.12; h.resize(cards[0]);
      ok('wiring (live): a real width change (over 8%) redraws', cards[0].draws === 2);
      cards[0].offsetHeight = 150; h.resize(cards[0]);
      ok('wiring (live): a card grown too short for its corners redraws', cards[0].draws === 3);
      var before = cards[2].draws;
      h.setFrost(false);
      h.ios[0].cb([{ target: cards[2], isIntersecting: true }]);
      ok('wiring (live): once Christmas ends nothing is watched or drawn', h.ios[0].on.length === 0 && h.ros[0].on.length === 0 && cards[2].draws === before);
      h.setFrost(true);
      ok('wiring (live): Christmas again re-watches every card without new observers', h.ios.length === 1 && h.ios[0].on.length === 3);
      var extra = card(195, 145);
      cards.push(extra); h.frostRescan();
      ok('wiring (live): a card the control panel added is watched too, and nothing is watched twice', h.ios[0].on.length === 4 && h.ios[0].on.indexOf(extra) !== -1);
      var noLib = harness(false, [card(300, 200)]);
      var threw = false;
      try { noLib.setFrost(true); noLib.frostRescan(); } catch (e) { threw = true; }
      ok('wiring (live): without lib.js the season just has no frost (no throw, nothing watched)', !threw && noLib.ios.length === 0);
      var tiny = card(0, 0), ht = harness(true, [tiny]);
      ht.setFrost(true); ht.enter(tiny);
      ok('wiring (live): a card that is not laid out yet is skipped and retried by the size watcher', tiny.draws === 0 && ht.ros[0].on.indexOf(tiny) !== -1 && (tiny.offsetWidth = 300, tiny.offsetHeight = 200, ht.resize(tiny), tiny.draws === 1));
      // the first screen arrives as one burst: one card per idle slice, never a pile-up
      var burst = [card(248, 144), card(248, 144), card(248, 144), card(248, 144)], hb = harness(true, burst);
      hb.setFrost(true);
      hb.ios[0].cb(burst.map(function (el) { return { target: el, isIntersecting: true }; }));
      var queued = hb.idle.length;
      hb.step();
      var afterOne = burst.filter(function (c) { return c.draws; }).length;
      hb.flush();
      ok('wiring (live): a burst of cards is drawn one per idle slice, with one slice queued at a time', queued === 1 && afterOne === 1 && burst.every(function (c) { return c.draws === 1; }) && hb.idle.length === 0, queued + ' queued, ' + afterOne + ' after one slice');
      var late = [card(248, 144), card(248, 144)], hq = harness(true, late);
      hq.setFrost(true);
      hq.ios[0].cb(late.map(function (el) { return { target: el, isIntersecting: true }; }));
      hq.setFrost(false); hq.flush();
      ok('wiring (live): cards still queued when Christmas ends are dropped, not drawn', late.every(function (c) { return c.draws === 0; }) && hq.idle.length === 0);
      hq.setFrost(true); hq.ios[0].cb(late.map(function (el) { return { target: el, isIntersecting: true }; })); hq.flush();
      ok('wiring (live): and Christmas coming back draws them again', late.every(function (c) { return c.draws === 1; }));
      // the pop-up: drawn the moment it opens (no idle slice), size-watched while open
      var panel = card(560, 420), hm = harness(true, []);
      hm.frostModal(panel, 101);
      ok('wiring (live): outside Christmas an opened pop-up gets no snow', panel.draws === 0 && !panel.cls['xmas-frost']);
      hm.setFrost(true);
      ok('wiring (live): Christmas beginning with a pop-up open freezes it at once', panel.draws === 1 && panel.cls['xmas-frost'] && hm.idle.length === 0);
      hm.frostModal(null);
      var drawsBefore = panel.draws;
      hm.frostModal(panel, 101);
      ok('wiring (live): opening a pop-up draws its snow at once, before any idle slice, and size-watches it', panel.draws === drawsBefore + 1 && hm.idle.length === 0 && /^url\("data:image\/svg\+xml,/.test(panel.props['--xf']) && hm.ros[0].on.indexOf(panel) !== -1);
      var ageSnow = panel.props['--xf'];
      hm.frostModal(null); hm.frostModal(panel, 102);
      var bdaySnow = panel.props['--xf'];
      hm.frostModal(null); hm.frostModal(panel, 101);
      ok('wiring (live): each pop-up wears its own snow, the same every time', bdaySnow !== ageSnow && panel.props['--xf'] === ageSnow);
      panel.offsetWidth = 400; hm.resize(panel);
      ok('wiring (live): a pop-up the window made narrower is redrawn at its new width', decodeURIComponent(panel.props['--xf']).indexOf("width='406'") !== -1);
      var afterResize = panel.draws;
      hm.frostModal(null);
      ok('wiring (live): a closed pop-up is no longer size-watched', hm.ros[0].on.indexOf(panel) === -1 && panel.draws === afterResize);

      // the flight: a weather tile (252x144) opening into its pop-up (760x626)
      // and back. The pop-up flies by scale, so its own snow would squash; the
      // copies must ride its exact box at true size the whole way.
      var tile = card(252, 144), pop = card(760, 626), hf = harness(true, [tile]), host = node();
      var tileR = { left: 302, top: 387, width: 252, height: 144 }, popR = { left: 48, top: 144, width: 760, height: 626 };
      var T = { duration: 520, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'both' };
      var REACH = 92; // the pop-up picture's corners: frostReach(760, 626)
      function px(r) { return { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }; }
      function opAt(keys, q) { // a fade's opacity at progress q (keyframes are linear between offsets)
        for (var i = 1; i < keys.length; i++) {
          if (q > keys[i].offset) continue;
          var a = keys[i - 1], b = keys[i];
          return b.offset === a.offset ? b.opacity : a.opacity + (b.opacity - a.opacity) * (q - a.offset) / (b.offset - a.offset);
        }
        return keys[keys.length - 1].opacity;
      }
      // '' unless, somewhere along the path, the snow thins (neither copy whole,
      // so where both have snow it shows through) or the pop-up's picture
      // (copy panelAt) shows on a box smaller than two of its corners (the
      // browser would then shrink the whole 9-slice, snow and all)
      function flightBad(gs, a, b, panelAt) {
        var bad = [];
        for (var q = 0; q <= 1.000001; q += 0.005) {
          var w = a.width + (b.width - a.width) * q, h = a.height + (b.height - a.height) * q;
          var ops = gs.map(function (g) { return opAt(g.anims[1].keys, q); });
          var clear = ops.reduce(function (m, o) { return m * (1 - o); }, 1);
          if (clear > 1e-9) bad.push(q.toFixed(3) + ' snow thins to ' + (1 - clear).toFixed(3));
          if (ops[panelAt] > 0 && Math.min(w, h) < 2 * REACH - 1e-6) bad.push(q.toFixed(3) + ' squashed ' + Math.round(w) + 'x' + Math.round(h) + ' at ' + ops[panelAt].toFixed(2));
        }
        return bad.slice(0, 3).join(' | ');
      }
      hf.frostFly(host, pop, tile, tileR, popR, true, T);
      ok('flight (live): outside Christmas a pop-up flies with no snow copies', host.children.length === 0 && pop.style.borderImageSource === undefined);
      hf.setFrost(true); hf.enter(tile); hf.frostModal(pop, 102);
      hf.frostFly(host, pop, tile, tileR, popR, true, T);
      var layer = host.children[0], gs = layer ? layer.children : [];
      // opening: the pop-up's picture (flown to) underneath, the tile's on top
      ok('flight (live): opening hides the pop-up\'s own snow and flies two copies over it on one layer, the picture it flies to underneath', host.children.length === 1 && layer.className === 'frost-flight' && gs.length === 2 && gs[0].style.borderImage === pop.props['--xf'] && gs[1].style.borderImage === tile.props['--xf'] && pop.style.borderImageSource === 'none');
      ok('flight (live): each copy is a real box on the pop-up\'s path (left/top/width/height, never a scale), with its exact timing', gs.length === 2 && gs.every(function (g) { return g.anims.length === 2 && JSON.stringify(g.anims[0].keys) === JSON.stringify([px(tileR), px(popR)]) && g.anims[0].timing === T && g.anims[1].timing === T; }));
      var openBad = gs.length === 2 ? flightBad(gs, tileR, popR, 0) : 'no copies';
      ok('flight (live): opening, the snow never thins and the pop-up\'s picture never shows on a box too small for it', !openBad, openBad);
      ok('flight (live): opening starts as exactly the tile and lands as exactly the pop-up', gs.length === 2 && opAt(gs[1].anims[1].keys, 0) === 1 && opAt(gs[0].anims[1].keys, 0) === 0 && opAt(gs[1].anims[1].keys, 1) === 0 && opAt(gs[0].anims[1].keys, 1) === 1);
      var p0 = (2 * REACH - 144) / (626 - 144); // the box is 184 tall (two 92px corners) here
      ok('flight (live): the pop-up\'s snow starts showing the moment its corners fit, not later', gs.length === 2 && Math.abs(gs[0].anims[1].keys[1].offset - p0) < 1e-9, gs.length && gs[0].anims[1].keys[1].offset + ' vs ' + p0);
      hf.frostFly(host, pop, tile, tileR, popR, false, T);
      var back = host.children[0], bgs = back ? back.children : [];
      var closeBad = bgs.length === 2 ? flightBad(bgs, popR, tileR, 1) : 'no copies';
      ok('flight (live): a new flight replaces the last (one layer at a time)', host.children.length === 1 && back !== layer);
      ok('flight (live): closing puts the tile\'s picture underneath, runs the path backwards, never thins or squashes, and lands as exactly the tile', bgs.length === 2 && bgs[0].style.borderImage === tile.props['--xf'] && JSON.stringify(bgs[0].anims[0].keys) === JSON.stringify([px(popR), px(tileR)]) && !closeBad && opAt(bgs[0].anims[1].keys, 0) === 0 && opAt(bgs[1].anims[1].keys, 0) === 1 && opAt(bgs[0].anims[1].keys, 1) === 1 && opAt(bgs[1].anims[1].keys, 1) === 0, closeBad);
      var mirrorBad = bgs.length === 2 ? 0 : 1;
      for (var mq = 0; mq <= 1.000001 && !mirrorBad; mq += 0.01) {
        if (Math.abs(opAt(bgs[0].anims[1].keys, mq) - opAt(gs[1].anims[1].keys, 1 - mq)) > 1e-9) mirrorBad++; // the tile's picture
        if (Math.abs(opAt(bgs[1].anims[1].keys, mq) - opAt(gs[0].anims[1].keys, 1 - mq)) > 1e-9) mirrorBad++; // the pop-up's
      }
      ok('flight (live): opening and closing mirror each other by shape', mirrorBad === 0);
      hf.frostLand();
      ok('flight (live): landing removes the copies and hands the pop-up its own snow back', host.children.length === 0 && pop.style.borderImageSource === '');
      var threwLand = false;
      try { hf.frostLand(); } catch (e) { threwLand = true; }
      ok('flight (live): landing with nothing in the air is harmless', !threwLand);
      hf.frostFly(host, pop, card(252, 144), tileR, popR, true, T);
      var solo = host.children[0] ? host.children[0].children : [];
      ok('flight (live): a tile not frozen yet flies only the pop-up\'s snow, fading in once it fits', solo.length === 1 && solo[0].style.borderImage === pop.props['--xf'] && opAt(solo[0].anims[1].keys, 0) === 0 && opAt(solo[0].anims[1].keys, p0) === 0 && opAt(solo[0].anims[1].keys, 1) === 1);
      hf.frostLand(); hf.setFrost(false);
      hf.frostFly(host, pop, tile, tileR, popR, true, T);
      ok('flight (live): once Christmas ends a pop-up flies with no snow copies', host.children.length === 0 && pop.style.borderImageSource === '');
    })();

    // ---- style.css ----
    ok('css: the frost shows only on Christmas, keeps every card layout, and outranks the cards\' own borders', css.indexOf('html body.season-christmas .xmas-frost { border-style: solid; border-width: 0; border-image: var(--xf); }') !== -1 && !/[^\n]*\.xmas-frost[^{]*\{[^}]*\}/.test(css.replace('html body.season-christmas .xmas-frost { border-style: solid; border-width: 0; border-image: var(--xf); }', '')));
    var gap = /body\.season-christmas \.stories-grid \{ row-gap: (\d+)px; \}/.exec(css), title = /body\.season-christmas \.section-title \{ margin-bottom: (\d+)px; \}/.exec(css);
    ok('css: rows and section titles open up so the snow never touches the card above (8px clear at least)', !!gap && !!title && +gap[1] >= RISE + 8 && +title[1] >= RISE + 8 && ['stat-grid', 'right-now-grid', 'socials-grid', 'pc-specs-grid'].every(function (g) { return css.indexOf('body.season-christmas .' + g + ',') !== -1; }));
    var xmasRules = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^}]*(xmas-garland|xmas-frost|mf-christmas|mf-x-)[^{]*\{[^}]*\}/g) || []).join('\n');
    ok('css: every new Christmas decoration is static (no animation, no transition)', xmasRules.length > 0 && !/animation|transition/.test(xmasRules));
    ok('css: the string lights are hidden until Christmas and never catch clicks', /\.xmas-garland \{[^}]*pointer-events: none; display: none;/.test(css) && css.indexOf('body.season-christmas .xmas-garland { display: block; }') !== -1);
    var flightCss = (/\.frost-flight \{[^}]*\}\s*\.frost-flight > div \{[^}]*\}/.exec(css) || [''])[0];
    ok('css: the flying snow sits over the pop-up on a 0x0 contained anchor that never catches clicks', flightCss.indexOf('.frost-flight { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 1; pointer-events: none; contain: size layout style; }') === 0 && flightCss.indexOf('.frost-flight > div { position: absolute; border-style: solid; border-width: 0; }') !== -1);
    ok('css: no blend mode, isolation or paint containment on the flying snow (each cost a screen-sized offscreen pass every frame)', !!flightCss && !/mix-blend-mode|isolation|contain: (strict|paint)|inset: 0/.test(flightCss));
    var mpad = /@media \(max-width: 560px\) \{\s*body\.season-christmas \.modal-overlay \{ padding-top: (\d+)px; \}\s*body\.season-christmas \.modal-panel \{ max-height: min\(90vh, calc\(100dvh - (\d+)px\)\); \}\s*\}/.exec(css);
    var phonePad = (/\.modal-overlay \{ padding: (\d+)px; \}/.exec(css) || [])[1];
    ok('css: on phones a tall pop-up starts low enough for its snow (8px clear at least) and still fits the screen', !!mpad && !!phonePad && +mpad[1] >= RISE + 8 && +mpad[2] === +mpad[1] + +phonePad, mpad ? mpad[1] + ' / ' + mpad[2] + ' / ' + phonePad : 'rule not found');
    ok('css: phones (always low-power) keep the pine Christmas cards', css.indexOf('body.low-power.season-christmas { --card-bg: rgba(16,52,36,.95); }') !== -1 && css.indexOf('body.low-power.season-christmas') > css.indexOf('body.low-power { --card-bg: rgba(40,63,98,.95); }'));

    // ---- the footer at night: still snow, and the credit line legible at every hour ----
    var xblock = (/body\.season-christmas \.footer\.meadow \{[^}]*\}/.exec(css) || [''])[0];
    var dfg = (/--d-fg: (#[0-9a-f]{6})/.exec(xblock) || [])[1], nfg = (/--n-fg: (#[0-9a-f]{6})/.exec(xblock) || [])[1];
    var ink = /--m-ink: clamp\(0, calc\(\(([\d.]+) - var\(--m-day\)\) \* (\d+)\), 1\);/.exec(xblock);
    var dark = (/body\.season-christmas \.meadow-credit \{ color: (#[0-9a-f]{6});/.exec(css) || [])[1];
    var light = (/color: color-mix\(in oklab, (#[0-9a-f]{6}) calc\(var\(--m-ink\) \* 100%\), (#[0-9a-f]{6})\);/.exec(css) || []);
    var shadeA = (/body\.season-christmas \.meadow::after \{ display: block; opacity: var\(--m-ink\); background: linear-gradient\(to top, rgba\(4,26,12,([\d.]+)\), rgba\(4,26,12,0\)\); \}/.exec(css) || [])[1];
    var shadeH = +((/\.meadow::after \{[^}]*height: (\d+)px/.exec(css) || [])[1]);
    var creditBottom = 14, creditTop = creditBottom + 18; // bottom: max(14px, ...) and a 13px line of text
    var inkBad = 'could not read the colours from style.css';
    if (dfg && nfg && ink && dark && light[1] && light[2] === dark && shadeA && shadeH) {
      inkBad = '';
      var aAtTop = +shadeA * (1 - creditTop / shadeH); // the shade is faintest at the top of the letters
      for (var md = 0; md <= 1.00001 && !inkBad; md += 0.005) {
        var on = Math.min(1, Math.max(0, (+ink[1] - md) * +ink[2]));
        if (on > 0 && on < 1) continue; // the one-step switch itself
        var field = mixOklab(dfg, nfg, md);
        var bg = on ? field.map(function (c, i) { return c * (1 - aAtTop) + [4, 26, 12][i] / 255 * aAtTop; }) : field;
        var cr = contrastRgb(hexRgb(on ? light[1] : dark), bg);
        if (cr < 4.5) inkBad = 'daylight ' + md.toFixed(3) + ': ' + cr.toFixed(2) + ':1';
      }
    }
    ok('footer: on Christmas the credit line passes WCAG AA at every hour, dark ink on bright snow and light ink over the shade by night', !inkBad, inkBad);
    ok('footer: on Christmas nights the field stays snow (moonlit blue-grey, not green grass)', !!nfg && (function () { var c = hexRgb(nfg); return c[2] > c[1] && c[2] > c[0]; })() && /--n-mid: #[0-9a-f]{6}; --n-mid-hi/.test(xblock) && /--n-roof: #[0-9a-f]{6}/.test(xblock));

    // ---- index.html ----
    var garland = (/<svg class="xmas-garland"[\s\S]*?<\/svg>/.exec(html) || [''])[0];
    ok('html: the string lights are decorative, steady and centred over the profile picture', /aria-hidden="true" focusable="false"/.test(garland) && (garland.match(/<use href="#xb-[rgw]" transform=/g) || []).length === 56 && /Q700 60 800 4Q900 60 1000 4/.test(garland) && !/<animate|class="[^"]*twinkle/.test(garland));
    var wireOff = wireMisses(garland);
    ok('html: every string-light bulb hangs from the wire (its cap within half a unit of the curve)', wireOff === '', wireOff);
    ok('html: the avatar carries only the birthday party hat (the owner removed the Santa hat)', html.indexOf('santa-hat') === -1 && between(html, '<div class="pfp-ring">', '<h1 class="title">').indexOf('<svg class="party-hat"') !== -1);
    var xm = (/<g class="mf-christmas">[\s\S]*?<\/g><\/g><\/svg>/.exec(html) || [''])[0];
    ok('html: the cottage gets a snowman, a door wreath and sixteen eave lights with halos', (xm.match(/class="mf-x-snow"/g) || []).length === 3 && xm.indexOf('class="mf-x-wreath"') !== -1 && (xm.match(/r="2.1"/g) || []).length === 16 && (xm.match(/r="7"/g) || []).length === 16 && html.indexOf('<radialGradient id="mf-x-halo">') !== -1);
  }

  global.KazuChristmasChecks = { run: run, pathPoints: pathPoints, wellFormed: wellFormed };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuChristmasChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      require(path.join(root, 'weather-fx.js'));
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      var eqFn = function (name, actual, expected) { okFn(name, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + ' != ' + JSON.stringify(expected)); };
      run(global.KazuLib, global.KazuWeatherFx, fs.readFileSync(path.join(root, 'script.js'), 'utf8'), fs.readFileSync(path.join(root, 'style.css'), 'utf8'), fs.readFileSync(path.join(root, 'index.html'), 'utf8'), okFn, eqFn);
      console.log('Christmas eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
