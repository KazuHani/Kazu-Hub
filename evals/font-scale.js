/* ============================================================================
   Font-scale gates: style.css "TEXT SCALE" calculates every font size from the
   screen width. One number, --font-unit, is a clamp() of the window width; the
   sizes small, body, lead, title and display are fixed ratios of it, and the hero name
   (--font-size-name) is its own clamp(). This gate resolves them at phone,
   tablet and desktop widths and fails if text gets too small on a phone or too
   large on a desktop. Shared by tests.js and tests.html; run standalone:
   node evals/font-scale.js
   ----------------------------------------------------------------------------
   What is pinned:
     - --font-unit and --font-size-name are clamp(<px>, <px> + <vw>, <px>), and
       the five ratio tiers are calc(var(--font-unit) * <ratio>);
     - at 320px and up, small text is at least 12px and body text at least 14px;
       at 2560px, small <= 15px, body <= 17px, lead <= 20.5px, title <= 28px,
       name <= 90px;
     - nothing shrinks as the window grows, and name > display > title > lead > body >
       small at every width, so the hierarchy survives every display;
     - the rules use the tiers (body * is body, and the title, lead and small
       roles have rules), the hero name's rule comes last, and no text role
       sits in the wrong tier (page headings are title, card headers are lead,
       secondary lines are small).
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  var WIDTHS = [320, 375, 430, 768, 1024, 1440, 1920, 2560];
  var ORDER = ['small', 'body', 'lead', 'title', 'display', 'name'];
  var CLAMP = /^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)px\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/;
  // [min at any width >= 320, max at 2560]
  var LIMITS = { small: [12, 15], body: [14, 17], lead: [16, 20.5], title: [22, 28], display: [24, 30], name: [44, 90] };

  function clampOf(v) {
    var c = CLAMP.exec((v || '').trim());
    return c ? { min: +c[1], base: +c[2], vw: +c[3], max: +c[4] } : null;
  }
  function decl(css, name) {
    var m = new RegExp(name + ':\\s*([^;]+);').exec(css);
    return m ? m[1].trim() : null;
  }
  function unitAt(u, w) { return Math.min(u.max, Math.max(u.min, u.base + u.vw * w / 100)); }

  // The five sizes at a width, or null when a token is missing or malformed.
  function sizes(css) {
    var unit = clampOf(decl(css, '--font-unit')), name = clampOf(decl(css, '--font-size-name'));
    var ratio = {};
    ['small', 'body', 'lead', 'title', 'display'].forEach(function (k) {
      var v = decl(css, '--font-size-' + k), m;
      if (k === 'body') ratio[k] = v === 'var(--font-unit)' ? 1 : null;
      else ratio[k] = (m = /^calc\(var\(--font-unit\) \* ([\d.]+)\)$/.exec(v || '')) ? +m[1] : null;
    });
    if (!unit || !name || ORDER.slice(0, 5).some(function (k) { return ratio[k] === null; })) return null;
    return {
      unit: unit, ratio: ratio,
      at: function (k, w) { return k === 'name' ? unitAt(name, w) : unitAt(unit, w) * ratio[k]; }
    };
  }

  function run(css, ok) {
    css = css.replace(/\r\n/g, '\n');
    var S = sizes(css);
    ok('font scale: --font-unit and the name are clamp(min, base + vw, max); small/body/lead/title are ratios of the unit', !!S);
    if (!S) return;

    var bad = [];
    ORDER.forEach(function (k) {
      WIDTHS.forEach(function (w) { if (S.at(k, w) < LIMITS[k][0] - 1e-9) bad.push(k + ' is ' + S.at(k, w).toFixed(1) + 'px at ' + w + 'px (min ' + LIMITS[k][0] + ')'); });
      if (S.at(k, 2560) > LIMITS[k][1] + 1e-9) bad.push(k + ' is ' + S.at(k, 2560).toFixed(1) + 'px at 2560px (max ' + LIMITS[k][1] + ')');
    });
    ok('font scale: nothing is too small on a phone or too large on a desktop', bad.length === 0, bad.join(' | '));

    var shrink = [], order = [];
    ORDER.forEach(function (k) {
      for (var i = 1; i < WIDTHS.length; i++) if (S.at(k, WIDTHS[i]) < S.at(k, WIDTHS[i - 1]) - 1e-9) shrink.push(k + '@' + WIDTHS[i]);
    });
    WIDTHS.forEach(function (w) {
      for (var i = 1; i < ORDER.length; i++) if (!(S.at(ORDER[i], w) > S.at(ORDER[i - 1], w))) order.push(ORDER[i] + '<=' + ORDER[i - 1] + '@' + w);
    });
    ok('font scale: each size only grows with the window', shrink.length === 0, shrink.join(' | '));
    ok('font scale: name > display > title > lead > body > small at every width', order.length === 0, order.join(' | '));

    // Which tier a selector's rule sets.
    var tierOf = {};
    css.replace(/([^{}]+)\{\s*font-size: var\(--font-size-(small|body|lead|title|display|feature|mark|name)\) !important;\s*\}/g, function (_, sels, t) {
      sels.split(',').forEach(function (s) { s = s.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''); if (s && !/ \*$/.test(s)) tierOf[s] = t; });
      return '';
    });
    // Inside a card the unit also follows the card's width: it may grow past the viewport unit, never fall below it.
    var cardM = /\.card,\s*\.pc-spec-card \{([^}]*)\}/.exec(css), card = cardM ? cardM[1] : '';
    var cu = /--font-unit:\s*clamp\(([\d.]+)px,\s*max\(([\d.]+)cqi,\s*([\d.]+)px \+ ([\d.]+)vw\),\s*([\d.]+)px\)/.exec(card);
    var cardOk = !!cu && /container-type: inline-size/.test(card) && +cu[1] >= S.unit.min && +cu[3] === S.unit.base && +cu[4] === S.unit.vw && +cu[5] > S.unit.max;
    ok('font scale: every card is a size container whose unit is max(card width, viewport unit), floored at the page unit', cardOk, card.replace(/\s+/g, ' '));
    if (cu) {
      var cap = +cu[5], capBad = [];
      if (cap > 19.5) capBad.push('unit ' + cap);
      if (cap * 1.2 > 23.5) capBad.push('lead ' + (cap * 1.2).toFixed(1));
      if (cap * 1.6 > 31) capBad.push('title ' + (cap * 1.6).toFixed(1));
      if (cap * 1.75 > 34) capBad.push('display ' + (cap * 1.75).toFixed(1));
      ok('font scale: text in the widest card is still sane (unit <= 19.5px, lead <= 23.5px, title <= 31px, display <= 34px)', capBad.length === 0, capBad.join(' | '));
    }
    var fm = /--font-size-feature:\s*clamp\(([\d.]+)px,\s*[\d.]+cqi,\s*([\d.]+)px\)/.exec(card), mk = /--font-size-mark:\s*clamp\(([\d.]+)px,\s*[\d.]+cqi,\s*([\d.]+)px\)/.exec(card);
    ok('font scale: the GPU name and badge fill their card (cqi clamps, name 22..46px, badge 40..100px)',
      !!fm && !!mk && +fm[1] >= 22 && +fm[2] <= 46 && +mk[1] >= 40 && +mk[2] <= 100, (fm || []).slice(1) + ' / ' + (mk || []).slice(1));
    ok('font scale: body text is the body tier', /body,\nbody \* \{\s*font-size: var\(--font-size-body\) !important;/.test(css));
    var want = {
      '.section-title': 'title', '.stat-value': 'display', '.music-playlist-name': 'title', '.story-title': 'title', '.modal-title': 'title',
      '.card-head-title': 'lead', '.presence-name': 'lead', '.mal-title': 'lead', '.lb-title': 'lead', '.social-name': 'lead',
      '.music-track-name': 'body', '.story-desc': 'body',
      '.stat-label': 'body', '.stat-sub': 'body', '.mal-title': 'body', '.social-handle': 'small', '.music-track-artist': 'small', '.pill-link': 'small', '.mal-eps': 'small',
      '.title': 'name', '.pc-spec-feature-name': 'feature', '.pc-gpu-mark strong': 'mark', '.pc-spec-list--build dd': 'body'
    };
    var wrong = Object.keys(want).filter(function (s) { return tierOf[s] !== want[s]; }).map(function (s) { return s + ': ' + tierOf[s] + ' (want ' + want[s] + ')'; });
    ok('font scale: page headings are title, card headers lead, rows body, secondary lines small, the name its own tier', wrong.length === 0, wrong.join(' | '));
    ok('font scale: the hero name rule comes after every other tier rule',
      css.lastIndexOf('var(--font-size-name) !important') > css.lastIndexOf('var(--font-size-small) !important'));
  }

  var api = { run: run, sizes: sizes };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
      run(css, okFn);
      var S = sizes(css.replace(/\r\n/g, '\n'));
      if (S) {
        console.log('px at ' + WIDTHS.join(' / ') + ':');
        ORDER.forEach(function (k) { console.log('  ' + k + ': ' + WIDTHS.map(function (w) { return S.at(k, w).toFixed(1); }).join(' / ')); });
      }
      console.log('Font scale eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  } else {
    global.KazuFontScale = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
