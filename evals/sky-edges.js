/* ============================================================================
   Sky edge gates: no sky layer stops in a straight line below the first
   screen. Shared by tests.js and tests.html; run standalone:
   node evals/sky-edges.js
   ----------------------------------------------------------------------------
   The sunset, the scenery (sun, moon, horizon glow, branches) and the clouds
   are anchored to the top of the page and scroll away with the hero. Each
   one ended at 100vh, so whatever it still painted there was cut off in a
   hard horizontal line as soon as you scrolled. The sunset glow is about 30%
   strong at that height: in October 2026 it showed as a band right across
   the "Right now" cards. What is pinned:
     - .sunset-sky: every gradient is fully transparent before the box ends
       (a radial one at its centre plus its last visible stop times its
       radius, a linear one at its last visible stop), and every vertical
       size, position and stop is in vh. A % would stretch with the box, so
       growing it to fit the fade would also have moved the first screen.
     - .sakura-scene clips sideways only (overflow: clip visible), so the
       horizon glow, the low sun's halo and the branches fade out on their
       own, and no other rule clips it again.
     - The cloud canvas: every cloud sprite drawn lies above the canvas's
       bottom edge at every window size (short laptop windows included) and
       while the clouds drift, and the puffs stay inside their sprite. Under
       570px tall the lowest clouds used to run off the canvas.
   tests.html runs fadeEnd() on the gradients the browser resolves in a page
   frame; evals/sky-seam.js measures the real pixels at the fold in Chrome.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  // Window sizes the cloud check runs at: desktop screens and short windows
  // (weather-fx.js only runs on desktop, but a window can be any height).
  var CLOUD_SIZES = [[1920, 1080], [1920, 900], [1600, 900], [1440, 800], [1366, 768], [1366, 600], [1280, 560], [1280, 500], [1024, 420], [900, 320]];
  var CLOUD_SEEDS = [0x5EED, 7, 99, 2026];

  function clean(css) { return String(css).replace(/\r\n/g, '\n'); }

  // Splits on commas outside brackets: gradient lists and gradient arguments.
  function splitTop(s) {
    var out = [], depth = 0, start = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
    }
    out.push(s.slice(start).trim());
    return out.filter(Boolean);
  }
  function alphaOf(color) {
    if (/^transparent$/i.test(color)) return 0;
    var m = /^rgba?\(([^)]*)\)$/i.exec(color);
    if (!m) return 1;
    var p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 4) return 1;
    return /%$/.test(p[3]) ? parseFloat(p[3]) / 100 : +p[3];
  }
  // "<color> <length>" -> { a, v, u } (v/u: the stop's number and unit).
  function stopOf(s) {
    var m = /^(.*\))\s+(-?[\d.]+)(%|px|vh)$/.exec(s) || /^(transparent)\s+(-?[\d.]+)(%|px|vh)$/i.exec(s);
    return m ? { a: alphaOf(m[1]), v: +m[2], u: m[3] } : null;
  }
  // Where a stop list goes transparent for good: the first stop from which
  // every stop is alpha 0. Infinity when the last stop is still visible.
  function clearFrom(stops) {
    var at = Infinity;
    for (var i = stops.length - 1; i >= 0; i--) {
      if (stops[i].a > 0) break;
      at = i;
    }
    return at === Infinity ? null : stops[at];
  }

  // One `background` value (a gradient list) -> how far down it paints, in
  // `unit` (vh in the source; a browser's computed style keeps vh in Chrome,
  // px elsewhere), plus any vertical geometry that is not in `unit`. Handles what .sunset-sky uses:
  // radial-gradient(<x> <y> at <x> <y>, stops in %) and
  // linear-gradient(to bottom, stops in `unit`).
  function fadeEnd(background, unit) {
    var bad = [], end = 0, n = 0, m;
    var list = splitTop(String(background).replace(/\s+/g, ' ').trim());
    list.forEach(function (g) {
      if (!(m = /^(radial|linear)-gradient\((.*)\)$/.exec(g))) { bad.push('not a gradient: ' + g.slice(0, 40)); return; }
      n++;
      var args = splitTop(m[2]);
      // a browser's computed style drops the default direction, to bottom
      if (m[1] === 'linear' && stopOf(args[0])) args.unshift('to bottom');
      var stops = args.slice(1).map(stopOf);
      if (stops.some(function (s) { return !s; })) { bad.push(m[1] + ': a stop without a position'); return; }
      var last = clearFrom(stops);
      if (m[1] === 'radial') {
        var shape = new RegExp('^(?:ellipse )?([\\d.]+)(%|px) ([\\d.]+)(' + unit + '|%) at ([\\d.]+)(%|px) ([\\d.]+)(' + unit + '|%)$').exec(args[0]);
        if (!shape) { bad.push('radial: unreadable shape "' + args[0] + '"'); return; }
        if (shape[4] !== unit || shape[8] !== unit) bad.push('radial: vertical radius and centre must be in ' + unit + ' ("' + args[0] + '")');
        if (stops.some(function (s) { return s.u !== '%'; })) bad.push('radial: stops must be % of the radius');
        if (!last) { bad.push('radial: never fades out ("' + args[0] + '")'); end = Infinity; return; }
        end = Math.max(end, +shape[7] + +shape[3] * last.v / 100);
      } else {
        if (args[0] !== 'to bottom' && args[0] !== '180deg') { bad.push('linear: only to bottom is modelled ("' + args[0] + '")'); return; }
        if (stops.some(function (s) { return s.u !== unit && !(s.v === 0 && s.u === '%'); })) bad.push('linear: stops must be in ' + unit);
        if (!last) { bad.push('linear: never fades out'); end = Infinity; return; }
        end = Math.max(end, last.v);
      }
    });
    return { end: end, gradients: n, bad: bad };
  }

  function rule(css, sel) {
    var m = new RegExp('\\n' + sel.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + ' \\{([^}]*)\\}').exec(css);
    return m ? m[1] : null;
  }
  function backgroundOf(body) {
    var m = body && /background:\s*([\s\S]*?);\s*$/.exec(body);
    return m ? m[1] : null;
  }
  // Rules that mention `sel` and set `prop`, comments left out.
  function setting(css, sel, prop) {
    var bare = css.replace(/\/\*[\s\S]*?\*\//g, ''), out = [], re = /([^{}]*)\{([^{}]*)\}/g, m;
    while ((m = re.exec(bare))) {
      if (m[1].indexOf(sel) !== -1 && new RegExp('(^|[;{\\s])' + prop + '(-[xy])?:').test(m[2])) out.push(m[1].trim() + ' { ' + m[2].trim() + ' }');
    }
    return out;
  }

  // ---- the cloud canvas, run against weather-fx.js with canvas stubs ----
  function stubCtx(log) {
    var c = {};
    ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'quadraticCurveTo', 'setTransform'].forEach(function (k) { c[k] = function () {}; });
    c.scale = function (x, y) { log.scale = [x, y]; };
    c.arc = function (x, y, r) { log.arcs.push([x, y, r]); };
    c.drawImage = function (img, x, y, w, h) { log.draws.push([x, y, w, h]); };
    c.createRadialGradient = function () { return { addColorStop: function () {} }; };
    return c;
  }
  function clouds(FX, W, H, seed) {
    var sprites = [], draws = { draws: [], arcs: [] };
    var sc = FX.createScene(W, H, {
      seed: seed,
      makeCanvas: function (w, h) {
        var log = { w: w, h: h, scale: [1, 1], arcs: [], draws: [] };
        sprites.push(log);
        return { width: w, height: h, getContext: function () { return stubCtx(log); } };
      }
    });
    var target = FX.forcedParse('clouds:1'), ctx = stubCtx({ arcs: [], draws: [] }), cctx = stubCtx(draws);
    // 6 s to fade every cloud in, then 90 s of drift, drawn every half second
    for (var t = 0; t < 96 * 30; t++) {
      FX.stepScene(sc, 1 / 30, target);
      if (t > 6 * 30 && t % 15 === 0) FX.drawScene(sc, ctx, cctx);
    }
    return { draws: draws.draws, sprites: sprites };
  }

  function run(FX, css, ok) {
    css = clean(css);

    // ---- sunset ----
    var box = rule(css, '.sunset-sky'), h = box && /height: ([\d.]+)vh;/.exec(box);
    var heights = setting(css, '.sunset-sky', 'height'), paints = setting(css, '.sunset-sky', 'background');
    ok('sky edges: the sunset layer is one rule, top of the page, its height in vh', !!h && /position: absolute; top: 0;/.test(box) && heights.length === 1,
      box ? box.trim().slice(0, 80) + ' / ' + heights.length + ' height rules' : 'no .sunset-sky rule');
    ok('sky edges: the two sunset palettes fill the layer box (inset: 0), so their geometry is the layer\'s',
      css.indexOf('.sunset-sky::before, .sunset-sky::after { content: \'\'; position: absolute; inset: 0; }') !== -1);
    ok('sky edges: only ::before and ::after paint the sunset (no other rule sets its background)', paints.length === 2, paints.join(' | ').slice(0, 300));
    ['::before', '::after'].forEach(function (p) {
      var bg = backgroundOf(rule(css, '.sunset-sky' + p)), f = bg ? fadeEnd(bg, 'vh') : null;
      ok('sky edges: sunset ' + p + ' is two gradients placed in vh (the first screen cannot stretch with the box)', !!f && f.gradients === 2 && !f.bad.length,
        f ? f.gradients + ' gradients; ' + f.bad.join('; ') : 'no background');
      ok('sky edges: sunset ' + p + ' is fully transparent before the layer ends, so it fades out instead of stopping in a line',
        !!f && !!h && f.end <= +h[1], f && h ? 'paints to ' + f.end.toFixed(2) + 'vh, the layer ends at ' + h[1] + 'vh' : 'unreadable');
    });

    // ---- the scenery: sun, moon, horizon glow, branches ----
    var scene = rule(css, '.sakura-scene'), clip = css.indexOf('@supports (overflow: clip) {\n  .sakura-scene { overflow: clip visible; }\n}');
    ok('sky edges: the scenery clips sideways only (overflow: clip visible), after its overflow: hidden fallback',
      !!scene && /overflow: hidden;/.test(scene) && clip > css.indexOf('\n.sakura-scene {'));
    var clips = setting(css, '.sakura-scene', 'overflow');
    ok('sky edges: no other rule clips the scenery again', clips.length === 2, clips.join(' | ').slice(0, 300));

    // ---- the cloud canvas ----
    var low = [], none = [], cut = [];
    CLOUD_SIZES.forEach(function (s) {
      CLOUD_SEEDS.forEach(function (seed) {
        var r = clouds(FX, s[0], s[1], seed), worst = -Infinity;
        if (!r.draws.length) none.push(s.join('x') + '#' + seed);
        r.draws.forEach(function (d) { worst = Math.max(worst, d[1] + d[3]); });
        if (worst > s[1] + 0.01) low.push(s.join('x') + '#' + seed + ' reaches ' + worst.toFixed(1) + 'px');
        r.sprites.forEach(function (sp, i) {
          var hh = sp.h / sp.scale[1];
          sp.arcs.forEach(function (a) { if (a[1] + a[2] > hh + 0.01) cut.push('sprite ' + i + ' puff to ' + (a[1] + a[2]).toFixed(1) + ' of ' + hh); });
        });
      });
    });
    ok('sky edges: clouds are drawn at every size checked (the cloud checks are not vacuous)', !none.length, none.join(', '));
    ok('sky edges: every cloud stays above the bottom of its one-viewport canvas, short windows included, while it drifts', !low.length, low.slice(0, 6).join(', '));
    ok('sky edges: each cloud sprite\'s puffs end inside the sprite (no flat bottom)', !cut.length, cut.slice(0, 4).join(', '));
  }

  global.KazuSkyEdgeChecks = { run: run, fadeEnd: fadeEnd, clouds: clouds };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuSkyEdgeChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      require(path.join(__dirname, '..', 'weather-fx.js'));
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      run(global.KazuWeatherFx, fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), okFn);
      console.log('Sky edges eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
