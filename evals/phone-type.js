/* ============================================================================
   Phone text gates: on phones (max-width: 560px) the page's and the pop-ups'
   text grows with the screen. Shared by tests.js and tests.html; run
   standalone:  node evals/phone-type.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - Every text size is clamp(B, B / 3.2 vw, 1.3 * B): B, its old phone
       size, at 320px and below (the narrowest phone still fits as before),
       B * width / 320 above that (17% bigger at 375px), capped at 30% from
       416px. Written out as numbers in style.css, so the formula is checked
       rule by rule.
     - Page block: re-derived here from the main phone block (every fixed px
       font-size before its modal rules), so a size added there without a
       growing rule, or a base size changed without its rule, fails.
     - Pop-up block: one rule per text class the four pop-ups render.
     - Both blocks come after the main phone block and its modal overrides,
       so they win every tie.
     - rules(css) is exported for tests.html, which measures each rule's real
       computed size in a phone frame.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  var POPUP_HEAD = '/* ---- Pop-up text on phones grows with the screen ----';
  var PAGE_HEAD = '/* ---- Page text on phones grows with the screen ----';
  var MAIN_END = '/* Modals: mobile dynamic viewport */';
  var POPUP_CLASSES = ['.modal-title', '.modal-body', '.modal-lead', '.modal-lead-src', '.modal-credit', '.modal-note', '.modal-row-sub', '.modal-btn', '.tz-label', '.tz-time', '.tz-meta',
    '.forecast-label', '.forecast-condition', '.forecast-temps', '.forecast-precip', '.forecast-empty', '.age-head', '.age-head .age-sub', '.stat-tile-num', '.stat-tile-label', '.sign-name', '.fun-title', '.fun-num', '.fun-label', '.cd-num', '.cd-label'];

  function blockAt(css, head) {
    var at = css.indexOf(head);
    if (at < 0) return null;
    var open = css.indexOf('@media (max-width: 560px) {', at);
    var close = css.indexOf('\n}\n', open);
    return open < 0 || close < 0 ? null : { at: at, text: css.slice(open, close + 2) };
  }
  // [selector as written after the prefix, B, vw, max] for one block.
  function parse(block, prefix) {
    var out = [], re = /\n  ([^{]+?) \{ font-size: clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\); \}/g, m;
    while ((m = re.exec(block))) {
      var sels = m[1].split(', ').map(function (s) { return s.indexOf(prefix) === 0 ? s.slice(prefix.length) : null; });
      out.push([sels.indexOf(null) === -1 ? sels.join(', ') : null, +m[2], +m[3], +m[4], m[1]]);
    }
    return out;
  }
  // The fixed px sizes of the main phone block: [selector list, B].
  function mainSizes(css) {
    var end = css.indexOf(MAIN_END), start = css.lastIndexOf('@media (max-width: 560px) {', end);
    if (end < 0 || start < 0) return null;
    var block = css.slice(start + '@media (max-width: 560px) {'.length, end).replace(/\/\*[\s\S]*?\*\//g, '');
    var out = [], re = /([^{}]+)\{([^}]*)\}/g, m;
    while ((m = re.exec(block))) {
      var fs = /font-size:\s*([\d.]+)px\s*;/.exec(m[2]);
      if (fs) out.push([m[1].trim().split(',').map(function (s) { return s.trim(); }).join(', '), +fs[1]]);
    }
    return { start: start, sizes: out };
  }
  // Every growing rule, for the live check: { css: full selector, base, max }.
  function rules(css) {
    css = String(css).replace(/\r\n/g, '\n');
    var out = [];
    [blockAt(css, PAGE_HEAD), blockAt(css, POPUP_HEAD)].forEach(function (b) {
      if (b) parse(b.text, '').forEach(function (r) { out.push({ css: r[4], base: r[1], max: r[3] }); });
    });
    return out;
  }

  function run(css, ok) {
    css = String(css).replace(/\r\n/g, '\n'); // a Windows checkout has CRLF files
    var formula = function (r) { return Math.abs(r[2] - r[1] / 3.2) < 0.0001 && Math.abs(r[3] - r[1] * 1.3) < 0.0001; };
    var main = mainSizes(css), page = blockAt(css, PAGE_HEAD), pop = blockAt(css, POPUP_HEAD);

    // ---- page ----
    var pageRules = page ? parse(page.text, 'body ') : [];
    var want = main ? main.sizes.map(function (s) { return [s[0].split(', ').join(', '), s[1]]; }) : [];
    var missing = want.filter(function (w) { return !pageRules.some(function (r) { return r[0] === w[0] && r[1] === w[1]; }); }).map(function (w) { return w[0] + ' ' + w[1] + 'px'; });
    var extra = pageRules.filter(function (r) { return !want.some(function (w) { return r[0] === w[0] && r[1] === w[1]; }); }).map(function (r) { return r[4]; });
    ok('page: the main phone block has fixed text sizes to grow (it was found)', !!main && want.length >= 25, main ? want.length : 'block not found');
    ok('page: every fixed phone text size there has a growing rule with the same base, and nothing else', !!page && !missing.length && !extra.length, 'missing ' + missing.join(', ') + ' / extra ' + extra.join(', '));
    ok('page: every rule is clamp(B, B/3.2 vw, 1.3B), B at 320px, growing to 30% at most', pageRules.length > 0 && pageRules.every(formula), pageRules.filter(function (r) { return !formula(r); }).map(function (r) { return r[4]; }).join(', '));

    // a fixed-width column holding growing text has to grow with it: the PC
    // storage size ("240 GB") spilled its 68px column at 375px
    var col = /\.pc-storage-entry \{ grid-template-columns: clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\) minmax\(0, 1fr\);/.exec(css);
    // and wide enough at 320px for "240 GB" at 20px in the fallback font (69px)
    ok('page: the PC storage size column grows by the same clamp as its text, from 72px (the fallback font fits too)', !!col && formula([null, +col[1], +col[2], +col[3]]) && +col[1] >= 72, col ? col[0] : 'rule not found');

    // ---- pop-ups ----
    var popRules = pop ? parse(pop.text, '.modal-overlay .modal-panel ') : [];
    var popHave = popRules.map(function (r) { return r[0]; });
    var popMissing = POPUP_CLASSES.filter(function (c) { return popHave.indexOf(c) === -1; });
    ok('pop-ups: one growing rule for every text class the pop-ups render', !!pop && !popMissing.length && popRules.length === POPUP_CLASSES.length, 'missing ' + popMissing.join(', ') + ' / ' + popRules.length + ' rules');
    ok('pop-ups: every rule is clamp(B, B/3.2 vw, 1.3B)', popRules.length > 0 && popRules.every(formula), popRules.filter(function (r) { return !formula(r); }).map(function (r) { return r[4]; }).join(', '));

    // ---- order ----
    var modalOverrides = css.lastIndexOf('.modal-panel--age .fun-label { font-size: 11px; }');
    ok('order: both blocks come after the main phone block and every per-pop-up phone override, so they win ties', !!main && !!page && !!pop && page.at > main.start && pop.at > main.start && pop.at > modalOverrides && page.at > modalOverrides && css.indexOf('.cd-num { font-size: 18px; }') < Math.min(page.at, pop.at));
  }

  global.KazuPhoneTypeChecks = { run: run, rules: rules, mainSizes: mainSizes };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuPhoneTypeChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      run(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), okFn);
      console.log('Phone type eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
