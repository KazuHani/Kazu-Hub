/* ============================================================================
   Hero fill gates: the name and the quote fill the width on phones and small
   tablets and hold their full size from there to the widest desktop, with one
   rule each (no breakpoint). Shared by tests.js and tests.html; run
   standalone:  node evals/hero-fill.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - The name is clamp(40px, min(16.5vw, 16vh), 112px) in its own .title
       rule and nowhere else. It used to be a 768px block on top of a desktop
       clamp(42px, 7.4vw, 80px), so widening the window past 768px dropped it
       from 112px to 57px.
     - Fill model: TITLE_EM is the width of "Kazu Hani" per px of font size,
       measured in Chrome with the shipped Fraunces (its optical sizing
       narrows the letters as they grow, so a plain vw size fills less of a
       wider screen). With the container's padding (one fluid rule, read from
       style.css) it gives the share of the hero the name covers: 70-86% at
       every phone width from 280px to 600px, at least 60% up to 768px, never
       more than 86% anywhere, and the size never drops as the window widens.
       Its box must also fit the hero in a 5em fallback font (Fredoka and Times
       measure 4.35em), so a slow font load never pushes the page sideways.
       tests.html measures the real share in frames and holds it to this
       model, which keeps TITLE_EM honest.
     - A short screen: a phone held sideways (667 x 375) or a small laptop
       (1280 x 600) gives the name at most a fifth of its height (16vh; 16.5vw
       alone made it 110px on the phone, a third of the screen).
     - The quote is one rule each for the text and its author (17px / 12.5px
       on a 320px phone, 22.1px / 16.25px from 416px up), both bigger than the
       old phone (14.5px / 11px) and desktop (16px / 12px) sizes, and the box
       opens to 420px: tests.html renders a 320 character quote at 320px,
       390px, 590px and 1200px and checks nothing is cut off.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  // [font px, text width / font px] for "Kazu Hani" (title class, Chrome, 2026-10-22)
  var TITLE_EM = [[36, 4.718], [44, 4.687], [50, 4.651], [56, 4.605], [60, 4.573], [64, 4.541], [70, 4.494], [80, 4.303], [90, 4.152], [96, 4.134], [104, 4.115], [120, 4.096]];
  var FALLBACK_EM = 5;
  var PAD_EM = 0.14, PAD_Y_EM = 0.06; // the .title padding, a side
  var WIDTHS = [280, 320, 360, 375, 390, 412, 430, 480, 560, 561, 590, 600, 680, 744, 768, 769, 820, 1024, 1280, 1440, 1920];

  function em(px) {
    if (px <= TITLE_EM[0][0]) return TITLE_EM[0][1];
    for (var i = 1; i < TITLE_EM.length; i++) {
      var a = TITLE_EM[i - 1], b = TITLE_EM[i];
      if (px <= b[0]) return a[1] + (b[1] - a[1]) * (px - a[0]) / (b[0] - a[0]);
    }
    return TITLE_EM[TITLE_EM.length - 1][1];
  }
  function clean(css) { return String(css).replace(/\r\n/g, '\n'); }
  // The .title rule's body, and the container's side padding clamp.
  function titleRule(css) { var m = /\n\.title \{([^}]*)\}/.exec(clean(css)); return m ? m[1] : null; }
  function padRule(css) { return /\n  padding-right: max\(clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\), env\(safe-area-inset-right\)\);/.exec(clean(css)); }
  // The name on a w x h screen (h defaults to an upright 2:1 phone): font px,
  // hero width, share of the hero the text covers, its box width in the
  // fallback font and its height (line-height 1.04 plus the padding).
  function title(css, w, h) {
    var body = titleRule(css), p = padRule(css);
    var m = body && /font-size: clamp\(([\d.]+)px, min\(([\d.]+)vw, ([\d.]+)vh\), ([\d.]+)px\);/.exec(body);
    if (!m || !p) return null;
    h = h || w * 2;
    var px = Math.min(+m[4], Math.max(+m[1], Math.min(+m[2] * w / 100, +m[3] * h / 100)));
    var pad = Math.min(+p[3], Math.max(+p[1], +p[2] * w / 100)), hero = Math.min(w, 1120) - 2 * pad;
    return { px: px, hero: hero, fill: em(px) * px / hero, fallbackBox: (FALLBACK_EM + 2 * PAD_EM) * px, height: (1.04 + 2 * PAD_Y_EM) * px };
  }

  function run(css, ok) {
    css = clean(css); // a Windows checkout has CRLF files
    var body = titleRule(css);
    ok('hero: the name has one size rule, clamp(40px, min(16.5vw, 16vh), 112px), and no media query resizes it',
      !!body && /font-size: clamp\(40px, min\(16\.5vw, 16vh\), 112px\);/.test(body) && (css.match(/\.title \{[^}]*font-size/g) || []).length === 1,
      body ? (css.match(/\.title \{[^}]*font-size[^;]*/g) || []).join(' | ') : 'no .title rule');
    ok('hero: the title padding the fallback-box model assumes is still .06em .14em', !!body && /padding: \.06em \.14em;/.test(body));
    ok('hero: the container side padding the fill model reads is one fluid rule', !!padRule(css));

    var low = [], over = [], drop = [], prev = 0;
    WIDTHS.forEach(function (w) {
      var t = title(css, w);
      if (!t) { low.push(w + 'px: no rule'); return; }
      var min = w <= 600 ? 0.7 : w <= 768 ? 0.6 : 0;
      if (t.fill < min || t.fill > 0.86) low.push(w + 'px ' + Math.round(t.fill * 100) + '%');
      if (t.fallbackBox > t.hero) over.push(w + 'px ' + Math.round(t.fallbackBox) + ' > ' + Math.round(t.hero));
      if (t.px < prev) drop.push(w + 'px ' + t.px + ' < ' + prev);
      prev = t.px;
    });
    ok('hero: the name covers 70-86% of the hero from 280px to 600px, 60% or more to 768px, and never more than 86%', !low.length, low.join(', '));
    ok('hero: the name\'s box fits the hero even in a wide fallback font, so it never pushes the page sideways', !over.length, over.join(', '));
    ok('hero: the name never gets smaller as the window gets wider (it used to drop from 112px to 57px at 769px)', !drop.length, drop.join(', '));
    // with 16.5vw alone it was 110px on the phone, 34% of the screen's height
    var side = title(css, 667, 375), laptop = title(css, 1280, 600);
    ok('hero: on a short screen (a phone held sideways, a 1280 x 600 laptop) the name takes at most a fifth of the height',
      !!side && !!laptop && side.height <= 375 / 5 && laptop.height <= 600 / 5, side ? Math.round(side.height) + 'px / ' + Math.round(laptop.height) + 'px' : 'no rule');

    // ---- the quote ----
    var q = /\n\.quote-text \{[^}]*font-size: clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\);/.exec(css), a = /\n\.quote-author \{[^}]*font-size: clamp\(([\d.]+)px, ([\d.]+)vw, ([\d.]+)px\);/.exec(css);
    ok('hero: the quote and its author are one fluid rule each, bigger than the old phone (14.5px / 11px) and desktop (16px / 12px) sizes',
      !!q && !!a && +q[1] > 14.5 && +a[1] > 11 && +q[3] > 16 && +a[3] > 12 && (css.match(/\.quote-(text|author) \{[^}]*font-size/g) || []).length === 2,
      q && a ? q[0].split('font-size: ')[1] + ' / ' + a[0].split('font-size: ')[1] : 'rules not found');
    var mh = /\n\.quote-box\.visible \{\n  max-height: (\d+)px;/.exec(css);
    ok('hero: the quote box opens to 420px or more at every width, room for a long quote at the full size', !!mh && +mh[1] >= 420 && (css.match(/\.quote-box\.visible \{[^}]*max-height/g) || []).length === 1, mh ? mh[1] : 'rule not found');
  }

  global.KazuHeroFillChecks = { run: run, title: title, em: em };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuHeroFillChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      run(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), okFn);
      console.log('Hero fill eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
