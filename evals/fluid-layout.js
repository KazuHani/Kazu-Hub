/* ============================================================================
   Fluid layout gates: text and pictures keep one size rule from the smallest
   phone to the widest desktop, so nothing jumps at a breakpoint, nothing gets
   smaller as the window gets wider, and phones and tablets never get the
   small sizes. Shared by tests.js, tests.html and evals/layout-sweep.js; run
   standalone:  node evals/fluid-layout.js
   ----------------------------------------------------------------------------
   The sizing contract (style.css, "Fluid sizing" in AGENTS.md):
     - Every size that differs between a phone and a desktop is ONE rule,
       clamp(B, B/3.2 vw, P): B (its 320px size) up to 320px, B * width / 320
       above that, held at P (never below B) from 320 * P / B, which is at most
       ~470px. Phones from ~470px, tablets and desktops all get P. Width media
       queries change layout (columns, stacking), never a text size or a
       picture size.
     - The stat values are clamp(16px, 6.6vw, 36px): every padding around a
       stat card grows with the window, so 6.6vw is 16.5% of the card. They
       must not be container units (the clock would restyle the card's
       contents every second at rest).
     - Text sized to its own card (container units: the PC specs) follows the
       card instead, and must fit it.
     - The name: clamp(40px, min(16.5vw, 16vh), 112px), see evals/hero-fill.js.
   What is pinned here, without a browser:
     - No font-size inside a width media query (except the reviewed card-sized
       rules in MEDIA_FONT_OK), and no width or height there for the pictures
       in BOXES.
     - Every font-size is a plain size, the fluid form with the vw part
       taking over at 320px or below (continuous, never shrinking, never
       growing faster than the window), the title's rule, or a card clamp on
       a card-sized selector.
     - Readable floors: a fluid size is at least 10px at 320px and 12px from
       390px; a fixed size on the page is at least 12px (DEV_SMALL_OK aside).
     - The stat grid is two columns, then four from STAT_FOUR_UP; a model of
       the card from the rules shows the widest clock string fits at every
       width from 280px to 1920px and the value never shrinks (so not when
       the grid splits), and the cards are not size containers.
     - The weather pop-up's globe shrinks before the pop-up scrolls.
     - The "Right now" grid is one column, then two (never 3 + 1), and the
       socials are 2-up (last tile full width), then a centred 4 + 3.
   What the live sweep (measure + analyse) checks in real layout, at every
   width it is given: no viewport-sized text or picture shrinks as the window
   widens or grows faster than it (a jump), readable floors, no grid row left
   with an uncentred orphan, no sideways scroll, no text spilling its box,
   card-sized text inside its card.
   Deterministic, local, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  // ---- what is tracked ----------------------------------------------------
  // Text whose size follows the window: one selector per role, the first
  // element on the page that is laid out is measured.
  var TEXT = ['.title', '.quote-text', '.quote-author', '.stat-label', '.stat-value', '.stat-sub', '.stat-faint', '.section-title',
    '.card-head-title', '.presence-name', '.presence-status', '.info-pill-label', '.info-pill-value', '.info-pill-sub',
    '.spotify-song', '.spotify-times', '.recent-games-label', '.recent-game-name', '.recent-game-hours',
    '.mal-section-label', '.mal-title', '.mal-eps', '.lb-label', '.lb-title', '.lb-watched',
    '.pc-spec-card-title', '.pc-spec-entry dt', '.pc-storage-entry dt', '.pc-gpu-mark span',
    '.music-playlist-label', '.music-playlist-name', '.music-playlist-sub', '.music-recent-label',
    '.music-track-num', '.music-track-name', '.music-track-artist', '.social-name', '.social-handle',
    '.story-title', '.story-desc', '.story-cta', '.pill-link', '.lang-switch-btn'];
  // Text that must fit its card (the PC specs are sized to it in container
  // units; the stat values follow the window and are also in TEXT).
  var CARD_TEXT = ['.stat-value', '.pc-spec-feature-name', '.pc-gpu-mark strong', '.pc-spec-entry dd', '.pc-storage-entry dd'];
  // Pictures and fixed-shape boxes (layout width).
  var BOXES = ['.pfp', '.avatar-img', '.steam-avatar', '.spotify-art', '.lb-poster', '.mal-cover', '.music-cover-wrap', '.social-mark', '.to-top'];
  var GRIDS = ['.stat-grid', '.right-now-grid', '.socials-grid', '.stories-grid', '.pc-specs-grid'];
  // Pop-up text (measured with a pop-up open; same rules as TEXT).
  var MODAL_TEXT = ['.modal-title', '.modal-lead', '.modal-note', '.modal-credit', '.modal-btn', '.tz-label', '.tz-time', '.tz-meta',
    '.forecast-label', '.forecast-condition', '.forecast-temps', '.age-head', '.stat-tile-num', '.stat-tile-label',
    '.sign-name', '.fun-title', '.fun-num', '.fun-label', '.cd-num', '.cd-label'];
  var ROLES = { text: TEXT, card: CARD_TEXT, boxes: BOXES, grids: GRIDS, modal: MODAL_TEXT };

  // Reviewed exceptions to "no font-size in a width media query": card-sized
  // text whose card changes its own layout there.
  var MEDIA_FONT_OK = {
    '.pc-spec-list--build dd': 'card-sized (cqi): the build list goes from three columns to one, so each entry gets the card\'s full width'
  };
  // Card-sized clamp() rules (container units) are allowed on these only.
  var CARD_FONT_SELECTORS = ['.pc-spec-feature-name', '.pc-gpu-mark strong', '.pc-spec-entry dd', '.pc-spec-list--build dd', '.pc-storage-entry dd'];
  // Fixed sizes under 12px that only the owner ever sees (the kazudev panel).
  var DEV_SMALL_OK = /^\.dev-/;
  // The stat grid's four-up switch (min-width). A desktop's classic scrollbar
  // (up to 17px) is inside the media query's width but not the layout's.
  var STAT_FOUR_UP = 1110, SCROLLBAR = 17;
  // The socials' four-across switch: "MyAnimeList" (113px of .social-name at
  // 19.5px in Fredoka, 121px in the fallback font) fits a four-up tile's
  // inner width (127px at 760px with a 17px scrollbar) from here.
  var SOCIALS_FOUR_UP = 760;

  // ---- a small CSS reader -------------------------------------------------
  // [{ at: '@media (...)' or '', sel, decls: [[prop, value]] }] for every
  // style rule, one level of @media / @supports / @container deep;
  // @keyframes are skipped. Comments are dropped.
  function rulesOf(css) {
    css = String(css).replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    var out = [];
    function block(text, at) {
      var i = 0;
      while (i < text.length) {
        var open = text.indexOf('{', i);
        if (open < 0) break;
        var prelude = text.slice(i, open).trim(), depth = 0, j = open;
        for (; j < text.length; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}' && --depth === 0) break;
        }
        var body = text.slice(open + 1, j);
        if (/^@(media|supports|container)/.test(prelude)) block(body, prelude.replace(/\s+/g, ' '));
        else if (prelude.charAt(0) !== '@') {
          var decls = body.split(';').map(function (d) {
            var k = d.indexOf(':');
            return k < 0 ? null : [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim().replace(/\s+/g, ' ')];
          }).filter(Boolean);
          prelude.split(',').forEach(function (s) { out.push({ at: at, sel: s.trim().replace(/\s+/g, ' '), decls: decls }); });
        }
        i = j + 1;
      }
    }
    block(css, '');
    return out;
  }
  function widthMedia(at) { return /^@media/.test(at) && /\((max|min)-width/.test(at); }

  var FLUID = /^clamp\(([\d.]+)px, ?([\d.]+)vw, ?([\d.]+)px\)$/;
  var CARD = /^clamp\(([\d.]+)px, ?([\d.]+)cqi, ?([\d.]+)px\)$/;
  var TITLE = /^clamp\(([\d.]+)px, ?min\(([\d.]+)vw, ?([\d.]+)vh\), ?([\d.]+)px\)$/;
  // The size a fluid rule gives at a given 100vw.
  function fluidAt(b, k, p, w) { return Math.min(p, Math.max(b, k * w / 100)); }

  function run(css, ok) {
    var rules = rulesOf(css);

    // ---- breakpoints change layout, never sizes ----
    var mediaFonts = [], mediaBoxes = [];
    rules.forEach(function (r) {
      if (!widthMedia(r.at)) return;
      r.decls.forEach(function (d) {
        if (d[0] === 'font-size' && !MEDIA_FONT_OK[r.sel]) mediaFonts.push(r.sel + ' ' + d[1] + ' in ' + r.at);
        if (/^(width|height|min-width|min-height)$/.test(d[0]) && BOXES.concat(['.social-mark svg', '.info-pill-icon']).indexOf(r.sel) !== -1) mediaBoxes.push(r.sel + ' ' + d[0] + ' ' + d[1] + ' in ' + r.at);
      });
    });
    ok('fluid: no width media query sets a text size (each size is one rule from phone to desktop)', mediaFonts.length === 0, mediaFonts.slice(0, 6).join(' | ') + (mediaFonts.length > 6 ? ' | +' + (mediaFonts.length - 6) + ' more' : ''));
    ok('fluid: no width media query resizes a picture (profile, avatars, covers, marks, buttons)', mediaBoxes.length === 0, mediaBoxes.join(' | '));
    ok('fluid: the old per-breakpoint phone text blocks are gone', String(css).indexOf('text on phones grows with the screen ----') === -1);

    // ---- every font-size has an allowed shape ----
    var bad = [], floors = [], fluidCount = 0;
    rules.forEach(function (r) {
      r.decls.forEach(function (d) {
        if (d[0] !== 'font-size') return;
        var v = d[1].replace(/ ?!important$/, ''), m;
        if (/^[\d.]+(em|%)$/.test(v) || v === 'inherit') return;
        if ((m = /^([\d.]+)px$/.exec(v))) {
          if (+m[1] < 12 && !DEV_SMALL_OK.test(r.sel)) floors.push(r.sel + ' ' + v);
          return;
        }
        if ((m = FLUID.exec(v))) {
          fluidCount++;
          var b = +m[1], k = +m[2], p = +m[3];
          // the vw part takes over at 320px (B/3.2 vw) or below it (steeper):
          // a vw size grows exactly as fast as the window, never faster
          if (k < b / 3.2 - 0.0001 || p < b) bad.push(r.sel + ' ' + v + ' (want ' + (b / 3.2).toFixed(4) + 'vw or more, max >= min)');
          if (b < 10 || fluidAt(b, k, p, 390) < 12) floors.push(r.sel + ' ' + v);
          return;
        }
        if ((m = CARD.exec(v)) && CARD_FONT_SELECTORS.indexOf(r.sel) !== -1) {
          if (+m[1] < 12) floors.push(r.sel + ' ' + v);
          return;
        }
        if (TITLE.exec(v) && r.sel === '.title') return;
        bad.push(r.sel + ' ' + v);
      });
    });
    ok('fluid: every text size is plain, clamp(B, B/3.2 vw or steeper, P >= B), the name\'s rule, or card-sized on a card selector', fluidCount >= 60 && bad.length === 0, fluidCount + ' fluid rules / ' + bad.join(' | '));
    ok('fluid: readable floors (fluid sizes 10px+ at 320px and 12px+ from 390px; fixed page text 12px+)', floors.length === 0, floors.join(' | '));

    // ---- the stat grid: 2 columns, 4 from STAT_FOUR_UP, no value jump ----
    var base = function (sel, prop) {
      for (var i = rules.length - 1; i >= 0; i--) {
        var r = rules[i];
        if (r.sel !== sel || r.at) continue;
        for (var j = r.decls.length - 1; j >= 0; j--) if (r.decls[j][0] === prop) return r.decls[j][1];
      }
      return null;
    };
    var inMedia = function (sel, prop, at) {
      var hit = null;
      rules.forEach(function (r) { if (r.sel === sel && r.at === at) r.decls.forEach(function (d) { if (d[0] === prop) hit = d[1]; }); });
      return hit;
    };
    var fourUp = '@media (min-width: ' + STAT_FOUR_UP + 'px)';
    ok('fluid: the stat grid is two columns, four from ' + STAT_FOUR_UP + 'px (never 3 + 1)',
      base('.stat-grid', 'grid-template-columns') === 'repeat(2, minmax(0, 1fr))' && inMedia('.stat-grid', 'grid-template-columns', fourUp) === 'repeat(4, minmax(0, 1fr))',
      base('.stat-grid', 'grid-template-columns') + ' / ' + inMedia('.stat-grid', 'grid-template-columns', fourUp));
    // Model a stat card from the rules (container padding, grid gap, the
    // card's side padding, two or four columns) at every width from 280px to
    // 1920px, with and without a 17px desktop scrollbar (vw excludes the
    // reserved gutter): the widest value ("00:00:00 am", 5.48em in Fredoka,
    // 5.73em in the fallback font) must fit inside, and the value must never
    // get smaller as the window widens (so not when the grid splits either).
    var sv = FLUID.exec(base('.stat-value', 'font-size') || ''), gap = FLUID.exec(base('.stat-grid', 'gap') || ''),
      padX = FLUID.exec(((base('.stat-card', 'padding') || '').match(/clamp\([^)]*\)/g) || [])[1] || ''),
      cpad = /^max\(clamp\(([\d.]+)px, ?([\d.]+)vw, ?([\d.]+)px\), env\(safe-area-inset-right\)\)$/.exec(base('.container', 'padding-right') || '');
    var spill = [], drops = [];
    if (sv && gap && padX && cpad) {
      [0, SCROLLBAR].forEach(function (bar) {
        var prev = 0;
        for (var w = 280; w <= 1920; w += 2) {
          var lay = w - bar, at = function (m) { return fluidAt(+m[1], +m[2], +m[3], lay); }, cols = w >= STAT_FOUR_UP ? 4 : 2;
          var inner = (Math.min(lay, 1120) - 2 * at(cpad) - (cols - 1) * at(gap)) / cols - 2 * at(padX), value = at(sv);
          if (value * 5.73 > inner + 0.5 && spill.length < 4) spill.push(w + 'px' + (bar ? ' +bar' : '') + ': ' + (value * 5.73).toFixed(1) + ' > ' + inner.toFixed(1));
          if (value < prev - 0.01 && drops.length < 4) drops.push(w + 'px: ' + value + ' < ' + prev);
          prev = value;
        }
      });
    }
    ok('fluid: the stat value fits its card at every width from 280px to 1920px (two or four up, with or without a desktop scrollbar), even in the fallback font',
      !!(sv && gap && padX && cpad) && !spill.length, sv ? spill.join(' | ') : 'rules not found (stat-value, stat-grid gap, stat-card padding, container padding)');
    ok('fluid: the stat value never shrinks as the window widens, so not when the grid splits to four either', !!sv && !drops.length && fluidAt(+sv[1], +sv[2], +sv[3], STAT_FOUR_UP - SCROLLBAR) >= +sv[3] - 0.01, drops.join(' | '));
    // A size container re-runs style for its contents whenever its own layout
    // runs, and the clock re-lays out its card every second: container units
    // on the stat cards cost two style passes a second at rest (perf.js idle).
    ok('fluid: the stat cards are not size containers (the per-second clock would restyle them)', base('.stat-card', 'container-type') === null && !rules.some(function (r) { return /^\.stat-(card|grid)/.test(r.sel) && r.decls.some(function (d) { return d[0] === 'container-type' || d[0] === 'container'; }); }));

    // ---- the pop-ups stay in view on short screens ----
    // Bigger pop-up text made the weather pop-up scroll 55px in a 1280 x 600
    // window; its globe now shrinks first (layout-sweep.js measures the fit).
    ok('fluid: the weather pop-up is a flex column whose globe (140px at least) shrinks before the pop-up scrolls',
      base('.modal-panel:has(.globe-frame)', 'flex-direction') === 'column' && base('.modal-panel:has(.globe-frame) .modal-body', 'min-height') === '0' &&
      base('.modal-panel:has(.globe-frame) .globe-frame', 'flex') === '0 1 auto' && /^1[0-9]{2}px$/.test(base('.modal-panel:has(.globe-frame) .globe-frame', 'min-height') || ''));

    // ---- the other grids ----
    ok('fluid: "Right now" is one column, then two (never 3 + 1)', base('.right-now-grid', 'grid-template-columns') === 'minmax(0, 1fr)' && rules.some(function (r) { return r.sel === '.right-now-grid' && /min-width/.test(r.at) && r.decls.some(function (d) { return d[0] === 'grid-template-columns' && d[1] === 'repeat(2, minmax(0, 1fr))'; }); }));
    ok('fluid: socials wrap in centred rows (2-up with the odd tile full width, then 4 + 3 from ' + SOCIALS_FOUR_UP + 'px)',
      base('.socials-grid', 'display') === 'flex' && base('.socials-grid', 'justify-content') === 'center' && base('.socials-grid', '--cols') === '2' &&
      inMedia('.socials-grid', '--cols', '@media (min-width: ' + SOCIALS_FOUR_UP + 'px)') === '4' &&
      inMedia('.social-card:last-child:nth-child(odd)', 'flex-basis', '@media (max-width: ' + (SOCIALS_FOUR_UP - 1) + 'px)') === '100%');
  }

  // ---- live measurement (runs inside the page) ----------------------------
  // Self-contained (no closure over this file), so layout-sweep.js can send
  // its source over the DevTools protocol. win: the page's window. roles:
  // ROLES. modal: true when a pop-up is open (measures its text instead).
  function measure(win, roles, modal) {
    var d = win.document, de = d.documentElement;
    function shown(e) { return e.getClientRects().length > 0 && win.getComputedStyle(e).visibility !== 'hidden'; }
    function first(sel, root) {
      var list = (root || d).querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) if (shown(list[i]) && !list[i].closest('.modal-overlay[hidden]')) return list[i];
      return null;
    }
    var probe = d.createElement('div');
    probe.style.cssText = 'position:absolute;left:0;top:0;width:100vw;height:0;visibility:hidden';
    d.body.appendChild(probe);
    var vw = probe.getBoundingClientRect().width;
    probe.remove();
    var out = { w: win.innerWidth, vw: vw, text: {}, card: {}, boxes: {}, grids: {}, spill: [], fit: [], scrollX: de.scrollWidth > de.clientWidth };
    if (modal) {
      var panel = d.querySelector('.modal-overlay:not([hidden]) .modal-panel');
      roles.modal.forEach(function (s) { var e = panel && first(s, panel); out.text[s] = e ? parseFloat(win.getComputedStyle(e).fontSize) : null; });
      return out;
    }
    roles.text.forEach(function (s) { var e = first(s); out.text[s] = e ? parseFloat(win.getComputedStyle(e).fontSize) : null; });
    roles.card.forEach(function (s) { var e = first(s); out.card[s] = e ? parseFloat(win.getComputedStyle(e).fontSize) : null; });
    roles.boxes.forEach(function (s) { var e = first(s); out.boxes[s] = e ? e.offsetWidth : null; });
    roles.grids.forEach(function (s) {
      var g = first(s);
      if (!g) { out.grids[s] = null; return; }
      var kids = Array.prototype.filter.call(g.children, shown), rows = [];
      kids.forEach(function (k) {
        var top = Math.round(k.offsetTop), row = rows.filter(function (r) { return Math.abs(r.top - top) < 4; })[0];
        if (!row) rows.push(row = { top: top, n: 0, left: Infinity, right: -Infinity });
        row.n++; row.left = Math.min(row.left, k.offsetLeft); row.right = Math.max(row.right, k.offsetLeft + k.offsetWidth);
      });
      var gl = g.offsetLeft, gr = g.offsetLeft + g.clientWidth, last = rows[rows.length - 1], verdict = 'full';
      if (rows.length > 1 && last.n < rows[0].n) {
        var centred = Math.abs((last.left - gl) - (gr - last.right)) <= 2, fills = last.right - last.left >= 0.95 * (gr - gl);
        verdict = centred || fills ? 'balanced' : 'orphan';
      }
      out.grids[s] = { rows: rows.map(function (r) { return r.n; }), verdict: verdict };
    });
    // text that runs out of its own box sideways (ellipsis and scrollers are meant to)
    Array.prototype.forEach.call(d.querySelectorAll('.container *'), function (e) {
      if (out.spill.length > 5 || e.closest('.modal-overlay') || !shown(e) || !e.clientWidth || e.children.length || !e.textContent.trim()) return;
      var cs = win.getComputedStyle(e);
      if (cs.textOverflow === 'ellipsis' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
      if (e.scrollWidth > e.clientWidth + 1) out.spill.push((String(e.className) || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth);
    });
    // card-sized text stays inside its card's content box
    roles.card.forEach(function (s) {
      Array.prototype.forEach.call(d.querySelectorAll(s), function (e) {
        if (!shown(e)) return;
        var card = e.closest('.card'), cs = card && win.getComputedStyle(card);
        if (!card) return;
        var r = d.createRange(); r.selectNodeContents(e);
        var t = r.getBoundingClientRect(), c = card.getBoundingClientRect();
        var l = c.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) - 1, rt = c.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) + 1;
        if (t.width && (t.left < l || t.right > rt)) out.fit.push(s + ' "' + e.textContent.trim().slice(0, 16) + '" ' + Math.round(t.width) + 'px in ' + Math.round(rt - l) + 'px');
      });
    });
    return out;
  }

  // ---- analysis (pure) ----------------------------------------------------
  // snaps: measure() results at increasing widths. Returns problems as text.
  // Growth faster than the window (2% slack for rounding) is a jump; any
  // shrink as the window widens is a jump the other way.
  function analyse(snaps) {
    var probs = [], s = snaps.filter(Boolean).slice().sort(function (a, b) { return a.vw - b.vw; });
    function series(kind) {
      var names = {};
      s.forEach(function (x) { Object.keys(x[kind] || {}).forEach(function (k) { names[k] = 1; }); });
      Object.keys(names).forEach(function (k) {
        for (var i = 1; i < s.length; i++) {
          var a = s[i - 1], b = s[i], va = a[kind][k], vb = b[kind][k];
          if (va == null || vb == null || b.vw <= a.vw) continue;
          if (vb < va - 0.05) probs.push(k + ' shrinks from ' + va + 'px at ' + a.w + ' to ' + vb + 'px at ' + b.w);
          else if (vb / va > (b.vw / a.vw) * 1.02 + 0.001) probs.push(k + ' jumps from ' + va + 'px at ' + a.w + ' to ' + vb + 'px at ' + b.w);
        }
      });
    }
    series('text'); series('boxes');
    s.forEach(function (x) {
      ['text', 'card'].forEach(function (kind) {
        Object.keys(x[kind] || {}).forEach(function (k) {
          var v = x[kind][k];
          if (v == null) return;
          var floor = x.w >= 390 ? 12 : 10;
          if (v < floor - 0.01) probs.push(k + ' is ' + v + 'px at ' + x.w + ' (under ' + floor + 'px)');
        });
      });
      Object.keys(x.grids || {}).forEach(function (g) { if (x.grids[g] && x.grids[g].verdict === 'orphan') probs.push(g + ' leaves an orphan at ' + x.w + ' (rows ' + x.grids[g].rows.join('+') + ')'); });
      if (x.scrollX) probs.push('the page scrolls sideways at ' + x.w);
      (x.spill || []).forEach(function (t) { probs.push('text spills its box at ' + x.w + ': ' + t); });
      (x.fit || []).forEach(function (t) { probs.push('card text outside its card at ' + x.w + ': ' + t); });
    });
    return probs;
  }

  global.KazuFluidLayout = { run: run, measure: measure, analyse: analyse, rulesOf: rulesOf, ROLES: ROLES, STAT_FOUR_UP: STAT_FOUR_UP, SOCIALS_FOUR_UP: SOCIALS_FOUR_UP };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuFluidLayout;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      run(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8'), okFn);
      console.log('Fluid layout eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
