/* ============================================================================
   Font-scale gates: style.css "TEXT SCALE" sets every font size from three
   fluid tiers (--font-size-small, --font-size-big, --font-size-name), each a
   clamp() that follows the window width. This gate resolves each clamp at
   phone, tablet and desktop widths and fails if text gets too small on a phone
   or too large on a desktop. Shared by tests.js and tests.html; run standalone:
   node evals/font-scale.js
   ----------------------------------------------------------------------------
   What is pinned:
     - the three tiers exist in :root as clamp(<px>, <px> + <vw>, <px>);
     - small text is at least 14px on a 320px phone and at most 18px on a
       2560px desktop; big text 22px .. 36px; the name 44px .. 90px;
     - each tier never shrinks as the window grows, and the order name > big >
       small holds at every width, so the hierarchy survives every display;
     - the rules apply the tiers: body * is small, and the headers, names and
       stat numbers are big, and the hero name uses its own tier.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  var WIDTHS = [320, 375, 430, 768, 1024, 1440, 1920, 2560];
  // [min at 320, max at 2560]: too small on a phone / too big on a desktop.
  var LIMITS = { small: [14, 18], big: [22, 36], name: [44, 90] };
  var CLAMP = /^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)px\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/;

  function tiers(css) {
    var out = {};
    ['small', 'big', 'name'].forEach(function (k) {
      var m = new RegExp('--font-size-' + k + ':\\s*([^;]+);').exec(css);
      var c = m && CLAMP.exec(m[1].trim());
      if (c) out[k] = { min: +c[1], base: +c[2], vw: +c[3], max: +c[4] };
    });
    return out;
  }
  function at(t, w) { return Math.min(t.max, Math.max(t.min, t.base + t.vw * w / 100)); }

  function run(css, ok) {
    css = css.replace(/\r\n/g, '\n');
    var t = tiers(css);
    ok('font scale: the small, big and name tiers are each clamp(min, base + vw, max)', !!(t.small && t.big && t.name),
      Object.keys(t).join(','));
    if (!(t.small && t.big && t.name)) return;

    var bad = [];
    Object.keys(LIMITS).forEach(function (k) {
      var lo = at(t[k], 320), hi = at(t[k], 2560);
      if (lo < LIMITS[k][0]) bad.push(k + ' is ' + lo.toFixed(1) + 'px at 320px (min ' + LIMITS[k][0] + ')');
      if (hi > LIMITS[k][1]) bad.push(k + ' is ' + hi.toFixed(1) + 'px at 2560px (max ' + LIMITS[k][1] + ')');
    });
    ok('font scale: nothing is too small on a phone or too large on a desktop', bad.length === 0, bad.join(' | '));

    var shrink = [], order = [];
    Object.keys(t).forEach(function (k) {
      if (t[k].vw < 0 || t[k].max < t[k].min) shrink.push(k);
      for (var i = 1; i < WIDTHS.length; i++) if (at(t[k], WIDTHS[i]) < at(t[k], WIDTHS[i - 1]) - 1e-9) shrink.push(k + '@' + WIDTHS[i]);
    });
    WIDTHS.forEach(function (w) {
      if (!(at(t.name, w) > at(t.big, w) && at(t.big, w) > at(t.small, w))) order.push(w);
    });
    ok('font scale: each tier only grows with the window', shrink.length === 0, shrink.join(' | '));
    ok('font scale: name > big > small at every width', order.length === 0, order.join(','));

    var sel = function (re) { return re.test(css); };
    ok('font scale: body text is the small tier', sel(/body,\nbody \* \{\s*font-size: var\(--font-size-small\) !important;/));
    ok('font scale: headers, card titles, display names and stat numbers are the big tier',
      sel(/h1, h1 \*,[\s\S]*?\.section-title,[\s\S]*?\.stat-value,[\s\S]*?\.card-head-title,[\s\S]*?\.presence-name,[\s\S]*?\.modal-title,[\s\S]*?\.story-title[\s\S]*?\{\s*font-size: var\(--font-size-big\) !important;/));
    ok('font scale: the hero name is its own tier, set after the big rule',
      sel(/\.title, \.title \* \{\s*font-size: var\(--font-size-name\) !important;/) &&
      css.indexOf('var(--font-size-name) !important') > css.indexOf('var(--font-size-big) !important'));
  }

  var api = { run: run, tiers: tiers, at: at };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
      run(css, okFn);
      var t = tiers(css.replace(/\r\n/g, '\n'));
      console.log('px at ' + WIDTHS.join('/') + ':');
      Object.keys(t).forEach(function (k) { console.log('  ' + k + ': ' + WIDTHS.map(function (w) { return at(t[k], w).toFixed(1); }).join(' / ')); });
      console.log('Font scale eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  } else {
    global.KazuFontScale = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
