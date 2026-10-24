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
       wider screen). With the container's padding it gives the share of the
       hero the name covers: 70-86% at every phone width from 280px to 600px,
       at least 60% up to 768px. Its box must also fit the hero in a 5em
       fallback font (Fredoka and Times measure 4.35em), so a slow font load
       never pushes the page sideways. tests.html measures the real share in
       frames and holds it to this model, which keeps TITLE_EM honest.
     - A small phone held sideways (667 x 375) is under 768px too: the name
       takes at most a fifth of its height (16vh in the rule; 16.5vw alone
       made it 110px, a third of the screen).
     - The quote: the hero block's sizes are the phone bases' 30% cap, so the
       size runs on unbroken from 560px to 561px, and both are bigger than
       the old phone bases (14.5px / 11px) and the desktop sizes (16px / 12px).
     - The quote box opens to 420px or more there: tests.html renders a 320
       character quote at 320px, 390px and 590px and checks nothing is cut off.
     - The picture and the stat boxes keep the name's proportions on phones:
       the picture is 1.9-2.9x the name's font size (it was 132px under a 68px
       name, with 181px on desktop), a stat value .33-.45x it (21px under the
       same name), at every phone width. A value must also fit its half-width
       box on one line (VALUE_EM is the widest time string in Fredoka 600,
       tabular, measured in Chrome), and stay clearly bigger than the line
       under it. tests.html measures the real picture and values in frames.
     - Order: the hero block comes before the main phone block, so on phones
       the phone bases (and their growing rules after it) win.
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
  // .container side padding: 10px to 360px and 14px to 560px (the phone
  // blocks), clamp(18px, 4vw, 40px) above. run() checks those rules still read so.
  function pad(w) { return w <= 360 ? 10 : w <= 560 ? 14 : Math.min(40, Math.max(18, w * 0.04)); }

  // "08:33:54 am" and "12:33:54 pm" in Fredoka 600, tabular, per px of font size
  // (Chrome, 2026-10-24): the widest a stat value gets. 5.4 covers both.
  var VALUE_EM = 5.4;
  // The first font-size (or width) clamp(lo, vw, hi) or clamp(lo, min(vw, vh), hi)
  // in a selector's rule, as { lo, vw, vh, hi } (vh is null when there is none).
  function clampOf(text, sel) {
    var m = new RegExp('\\n  ' + sel.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + ' \\{[^}]*?(?:font-size|width): clamp\\(([\\d.]+)px, (?:min\\()?([\\d.]+)vw(?:, ([\\d.]+)vh\\))?, ([\\d.]+)px\\)').exec(text);
    return m ? { lo: +m[1], vw: +m[2], vh: m[3] ? +m[3] : null, hi: +m[4] } : null;
  }
  function px(c, w, h) {
    var v = c.vw * w / 100;
    if (c.vh !== null) v = Math.min(v, c.vh * h / 100);
    return Math.min(c.hi, Math.max(c.lo, v));
  }
  function block(css) {
    var at = css.indexOf(HEAD);
    if (at < 0) return null;
    var open = css.indexOf('@media (max-width: 768px) {', at);
    var close = css.indexOf('\n}\n', open);
    return open < 0 || close < 0 ? null : { at: at, text: css.slice(open, close + 2) };
  }
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
    var q = /\n  \.quote-text \{ font-size: ([\d.]+)px; \}/.exec(text), a = /\n  \.quote-author \{ font-size: ([\d.]+)px; \}/.exec(text);
    var pq = /\n  \.quote-text \{ font-size: ([\d.]+)px;/.exec(main), pa = /\n  \.quote-author \{ font-size: ([\d.]+)px;/.exec(main);
    var all = !!(q && a && pq && pa);
    ok('hero: the quote and its author sit at the phone bases\' 30% cap, so the size runs on unbroken from 560px to 561px',
      all && Math.abs(+q[1] - 1.3 * +pq[1]) < 0.001 && Math.abs(+a[1] - 1.3 * +pa[1]) < 0.001,
      all ? q[1] + '/' + pq[1] + ', ' + a[1] + '/' + pa[1] : 'rules not found');
    ok('hero: the quote is bigger than before on phones (14.5px / 11px bases) and on small tablets (16px / 12px)',
      all && +pq[1] > 14.5 && +pa[1] > 11 && +q[1] > 16 && +a[1] > 12);
    var mh = /\n  \.quote-box\.visible \{ max-height: (\d+)px; \}/.exec(text);
    ok('hero: the quote box opens to 420px or more, room for a long quote at the bigger size', !!mh && +mh[1] >= 420, mh ? mh[1] : 'rule not found');

    // ---- the picture and the stat boxes ----
    var pfpC = clampOf(main, '.pfp'), valC = clampOf(main, '.stat-value');
    ok('hero: the phone block sizes the picture and the stat values with clamp() rules', !!pfpC && !!valC, (pfpC ? '' : 'no .pfp ') + (valC ? '' : 'no .stat-value'));
    if (pfpC && valC) {
      var pfpBad = [], valBad = [], fitBad = [], subBad = [];
      WIDTHS.filter(function (w) { return w <= 560; }).forEach(function (w) {
        var t = title(css, w), h = w * 2, pp = px(pfpC, w, h), vp = px(valC, w, h);
        // .stat-card side padding 8px (6px to 360px), grid gap 10px (8px to 360px)
        var padCard = w <= 360 ? 6 : 8, gap = w <= 360 ? 8 : 10, card = (w - 2 * pad(w) - gap) / 2, inner = card - 2 * padCard;
        if (pp / t.px < 1.9 || pp / t.px > 2.9) pfpBad.push(w + 'px ' + (pp / t.px).toFixed(2));
        if (vp / t.px < 0.33 || vp / t.px > 0.45) valBad.push(w + 'px ' + (vp / t.px).toFixed(2));
        if (vp * VALUE_EM > inner) fitBad.push(w + 'px ' + Math.round(vp * VALUE_EM) + ' > ' + Math.round(inner));
        // .stat-sub: clamp(12px, 3.75vw, 15.6px) in the page text block
        var sub = Math.min(15.6, Math.max(12, 3.75 * w / 100));
        if (vp < 1.3 * sub) subBad.push(w + 'px ' + vp.toFixed(1) + ' vs ' + sub.toFixed(1));
      });
      ok('hero: the picture is 1.9-2.9x the name\'s size at every phone width, so photo and name read as one hero', !pfpBad.length, pfpBad.join(', '));
      ok('hero: a stat value is .33-.45x the name\'s size at every phone width, so the boxes match the hero', !valBad.length, valBad.join(', '));
      ok('hero: the widest time string fits its half-width box on one line at every phone width', !fitBad.length, fitBad.join(', '));
      ok('hero: a stat value stays at least 1.3x the line under it', !subBad.length, subBad.join(', '));
      ok('hero: the picture stops at the desktop picture\'s 181px and keeps a 124px floor', pfpC.hi === 181 && pfpC.lo === 124, pfpC.lo + '..' + pfpC.hi);
      var small = px(pfpC, 540, 360);
      ok('hero: a small phone held sideways (540 x 360) keeps the picture at its floor, not a third of the screen', small === 124, small);
    }
    var tiny = /@media \(max-width: 360px\) \{[\s\S]*?\n\}\n/.exec(css.slice(mainEnd));
    ok('hero: the 360px block no longer pins .stat-value to 18px, which would undo the scaling', !!tiny && !/\.stat-value/.test(tiny[0]), tiny ? 'rule still there' : 'block not found');

    // ---- order ----
    ok('hero: the block comes before the main phone block, so the phone quote bases win on phones', !!b && mainStart > b.at);
  }

  global.KazuHeroFillChecks = { run: run, title: title, em: em, clampOf: clampOf, px: px };
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
