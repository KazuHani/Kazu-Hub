/* ============================================================================
   Redesign gates: the editorial, flat look that style.css ends with ("REDESIGN"
   block). Shared by tests.js and tests.html; run standalone:
   node evals/redesign.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - Tokens: the light and dark palettes are the redesign's, and every text
       and control colour clears WCAG on its own canvas (ink 7:1, muted, accent
       and the OK green 4.5:1, control borders 3:1, the pressed label on the
       accent 4.5:1). The dark palette follows prefers-color-scheme only: there
       is no toggle.
     - The layer only reaches the page through `body:not(#rd)` / `html:not(#rd)`
       (CSS nesting). That prefix is what lets it beat the seasonal palettes and
       the per-card rules above it without a second stylesheet, so a top-level
       rule without it would be a rule that silently loses (or one that fights
       the legacy cascade). Nothing in the layer may sit outside it.
     - The header is real navigation: every link targets a section heading id
       that exists, in the order the page shows them, and every label (and the
       nav's own aria-label) has a Japanese phrase, so the switch translates it.
     - Touch targets: the nav links, the language buttons and the outlined
       buttons are 44px tall.
     - The footer keeps a "Back to top" link, and the heading rule widths and
       sizes the design names (name 52-104px, section rule 2px) are present.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  var MARK = '/* ============ REDESIGN';

  function hex(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function lum(c) {
    var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) { var l1 = lum(hex(a)), l2 = lum(hex(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function token(body, name) { var m = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})\\b').exec(body); return m ? m[1] : null; }

  // The top-level rules of the layer: [{ sel, body }] with nested braces kept in body.
  function topLevel(layer) {
    var out = [], depth = 0, start = 0, sel = '';
    var s = layer.replace(/\/\*[\s\S]*?\*\//g, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '{') { if (depth === 0) { sel = s.slice(start, i).trim(); start = i + 1; } depth++; }
      else if (c === '}') { depth--; if (depth === 0) { out.push({ sel: sel, body: s.slice(start, i) }); start = i + 1; } }
    }
    return out;
  }

  function run(cssIn, htmlIn, I18n, ok) {
    var css = String(cssIn).replace(/\r\n/g, '\n'), html = String(htmlIn).replace(/\r\n/g, '\n');
    var at = css.indexOf(MARK);
    ok('redesign: style.css ends with the REDESIGN layer', at > 0 && css.indexOf(MARK, at + 1) === -1);
    if (at < 0) return;
    var layer = css.slice(at);
    var rules = topLevel(layer);

    /* ---- tokens and contrast ---- */
    var light = rules.filter(function (r) { return r.sel === 'body:not(#rd)' && /--accent:/.test(r.body); })[0];
    var darkWrap = rules.filter(function (r) { return /^@media \(prefers-color-scheme: dark\)$/.test(r.sel) && /--accent:/.test(r.body); })[0];
    ok('redesign: a light palette and a dark palette (prefers-color-scheme) are both defined', !!light && !!darkWrap);
    if (!light || !darkWrap) return;
    [['light', light.body, 'F7F6F3'], ['dark', darkWrap.body, '111316']].forEach(function (p) {
      var name = p[0], b = p[1];
      var bg = token(b, 'bg'), ink = token(b, 'ink'), muted = token(b, 'muted'), accent = token(b, 'accent'), ok_ = token(b, 'ok'), line = token(b, 'line-strong'), on = token(b, 'on-accent');
      if (name === 'dark') { bg = bg || '#111316'; }
      ok('redesign [' + name + ']: the canvas is the redesign\'s #' + p[2], !!bg && bg.toUpperCase() === '#' + p[2]);
      if (!bg || !ink || !muted || !accent || !ok_ || !line) { ok('redesign [' + name + ']: every token is a hex colour', false, [bg, ink, muted, accent, ok_, line].join(' ')); return; }
      ok('redesign [' + name + ']: ink on the canvas is at least 7:1', contrast(ink, bg) >= 7, contrast(ink, bg).toFixed(2));
      ok('redesign [' + name + ']: muted text on the canvas is at least 4.5:1', contrast(muted, bg) >= 4.5, contrast(muted, bg).toFixed(2));
      ok('redesign [' + name + ']: the accent on the canvas is at least 4.5:1', contrast(accent, bg) >= 4.5, contrast(accent, bg).toFixed(2));
      ok('redesign [' + name + ']: the OK green on the canvas is at least 4.5:1', contrast(ok_, bg) >= 4.5, contrast(ok_, bg).toFixed(2));
      ok('redesign [' + name + ']: control borders on the canvas are at least 3:1', contrast(line, bg) >= 3, contrast(line, bg).toFixed(2));
      if (on) ok('redesign [' + name + ']: the pressed label on the accent is at least 4.5:1', contrast(on, accent) >= 4.5, contrast(on, accent).toFixed(2));
    });
    ok('redesign: there is no theme toggle (the dark palette is only the system setting)', !/data-theme|theme-toggle/.test(html));

    /* ---- the prefix ---- */
    var loose = rules.filter(function (r) { return !/:not\(#rd\)/.test(r.sel) && !/^@media/.test(r.sel); }).map(function (r) { return r.sel; });
    ok('redesign: every top-level rule of the layer sits inside html:not(#rd) / body:not(#rd)', loose.length === 0, loose.join(' | '));
    var strayMedia = rules.filter(function (r) { return /^@media/.test(r.sel) && r !== darkWrap && !/html:not\(#rd\)|body:not\(#rd\)/.test(r.body); }).map(function (r) { return r.sel; });
    ok('redesign: a top-level @media in the layer only wraps prefixed rules', strayMedia.length === 0, strayMedia.join(' | '));

    /* ---- the numbers the design names ---- */
    ok('redesign: the name is clamp(52px, 8vw, 104px)', layer.indexOf('--font-size-name: clamp(52px, 8vw, 104px);') !== -1);
    ok('redesign: section headings carry the 2px ink rule', /\.section-title \{[^}]*border-bottom: 2px solid var\(--ink\)/.test(layer));
    ok('redesign: Figtree is the text face, Fraunces the serif, Noto Sans JP the Japanese fallback',
      /--font-text: Figtree, 'Noto Sans JP'/.test(layer) && /--font-serif: Fraunces, Georgia/.test(layer));

    /* ---- touch targets ---- */
    ['.site-nav a', '.lang-switch-btn', '.pill-link, .retry-btn', '.footer-top', '.story-cta, .story-link:hover .story-cta'].forEach(function (sel) {
      var esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var m = new RegExp(esc + ' \\{[^}]*min-height: 44px').exec(layer);
      ok('redesign: ' + sel + ' is at least 44px tall', !!m);
    });

    /* ---- the header and its anchors ---- */
    var nav = /<nav class="site-nav" aria-label="([^"]+)">([\s\S]*?)<\/nav>/.exec(html);
    ok('redesign: the header has a labelled section nav', !!nav);
    if (nav) {
      var links = (nav[2].match(/<a href="#[a-z]+">[^<]+<\/a>/g) || []).map(function (a) { return /href="#([a-z]+)">([^<]+)</.exec(a); });
      var ids = links.map(function (m) { return m[1]; });
      ok('redesign: the nav lists now, socials, writing, playlist and pc', ids.join(',') === 'now,socials,writing,playlist,pc', ids.join(','));
      var order = ids.map(function (id) { return html.indexOf('id="' + id + '">'); });
      var inOrder = order.every(function (n, i) { return n > 0 && (i === 0 || n > order[i - 1]); });
      ok('redesign: each nav link targets a section heading, in the order the page shows them', inOrder, order.join(','));
      ok('redesign: the headings the nav targets are the section titles',
        ids.every(function (id) { return new RegExp('<h2 class="section-title[^"]*" id="' + id + '">').test(html); }));
      if (I18n && I18n.translate) {
        var missing = links.map(function (m) { return m[2]; }).concat([nav[1]]).filter(function (t) { return I18n.translate(t) === null || I18n.translate(t) === undefined; });
        ok('redesign: every nav label and its aria-label has a Japanese phrase', missing.length === 0, missing.join(' | '));
      }
    }
    ok('redesign: the language switch lives in the header, before the hero',
      html.indexOf('class="site-header"') > 0 && html.indexOf('class="lang-switch"') > html.indexOf('class="site-header"') && html.indexOf('class="lang-switch"') < html.indexOf('<header class="hero">'));
    ok('redesign: the footer keeps a Back to top link', /<a class="footer-top" href="#top">Back to top<\/a>/.test(html));

    /* ---- what the layer retires stays out of sight, not out of the page ---- */
    ['sunset-sky', 'sakura-scene', 'atmosphere', 'xmas-garland', 'weather-fx', 'meadow-art'].forEach(function (c) {
      ok('redesign: .' + c + ' is hidden by the layer', new RegExp('\\.' + c + '\\b[^{]*\\{[^}]*display: none !important').test(layer));
    });
  }

  global.KazuRedesignChecks = { run: run, contrast: contrast, topLevel: topLevel };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuRedesignChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      var root = path.join(__dirname, '..');
      run(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), fs.readFileSync(path.join(root, 'index.html'), 'utf8'), require(path.join(root, 'i18n.js')), okFn);
      console.log(pass + ' passed, ' + fail + ' failed');
      process.exit(fail ? 1 : 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
