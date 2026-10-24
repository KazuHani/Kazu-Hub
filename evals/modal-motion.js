/* ============================================================================
   Pop-up motion gates. Shared by tests.js and
   tests.html; run standalone:  node evals/modal-motion.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - KazuLib.modalMorphFrames: a pop-up flies at its real size, moved by a
       translate and trimmed by a clip-path inset, so the box you see is a true
       rounded box on every frame. The old transform: scale(sx, sy) flight
       squashed the corners into flat ellipses (phones skipped the radius fix,
       so they went almost square). Walked here the way the browser
       interpolates the keyframes: the box starts as exactly the card (box and
       corners), lands as exactly the panel, moves on the straight line between
       them (the same path the Christmas snow copies take), and its corners are
       round the whole way.
     - KazuLib.outerShadows: the clip cuts the drop shadow off, so a
       shadow-only box carries the outer shadows (inset ones dropped).
     - script.js flies with those frames on every device (no phone-only path
       without corners), lands the shadow box with the flight, and keeps the
       Christmas snow hand-off.
     - style.css keeps the scrollbar gutter when a pop-up locks the page: where
       the native bar shows, losing it widened the page 15px and moved every
       card under the pop-up as it took off.
     - (the pop-up text sizes are evals/fluid-layout.js)
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

  // One keyframe's numbers: translate x y, scale x y, inset t r b l, radius x y.
  function parseFrame(f) {
    var t = /^translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+), ([-\d.e]+)\)$/.exec(f.transform);
    var c = /^inset\(([-\d.e]+)px ([-\d.e]+)px ([-\d.e]+)px ([-\d.e]+)px round ([-\d.e]+)px \/ ([-\d.e]+)px\)$/.exec(f.clipPath);
    if (!t || !c) return null;
    return t.slice(1).concat(c.slice(1)).map(Number);
  }
  // What is seen at progress p (the browser interpolates each number linearly
  // between matching transform / inset lists), panel at rest at `to`, its
  // transform-origin at 0 0.
  function seen(a, b, to, p) {
    var v = a.map(function (x, i) { return x + (b[i] - x) * p; });
    var tx = v[0], ty = v[1], sx = v[2], sy = v[3];
    return {
      left: to.left + tx + v[7] * sx, top: to.top + ty + v[4] * sy,
      width: (to.width - v[5] - v[7]) * sx, height: (to.height - v[4] - v[6]) * sy,
      rx: v[8] * sx, ry: v[9] * sy
    };
  }


  function run(L, source, css, ok, eq) {
    source = String(source).replace(/\r\n/g, '\n'); css = String(css).replace(/\r\n/g, '\n'); // a Windows checkout has CRLF files
    // ---- KazuLib.modalMorphFrames ----
    var cases = [
      // [name, from, to, r0, r1]
      ['desktop wide pop-up from a stat card', { left: 280, top: 377, width: 224, height: 144 }, { left: 132, top: 96, width: 760, height: 576 }, 22, 26],
      ['phone pop-up from a half-width card (the squashed one)', { left: 14, top: 277, width: 169, height: 87 }, { left: 10, top: 157, width: 355, height: 510 }, 22, 20],
      ['card below the panel', { left: 900, top: 700, width: 224, height: 144 }, { left: 300, top: 120, width: 560, height: 420 }, 22, 26],
      ['card wider than the panel', { left: 10, top: 300, width: 400, height: 90 }, { left: 20, top: 100, width: 335, height: 500 }, 20, 20],
      ['card taller and wider than the panel', { left: 0, top: 0, width: 600, height: 700 }, { left: 50, top: 60, width: 500, height: 400 }, 30, 26],
      ['tiny card, radius bigger than half its height', { left: 5, top: 5, width: 60, height: 30 }, { left: 10, top: 10, width: 300, height: 300 }, 22, 26]
    ];
    var bad = { ends: [], line: [], round: [], parse: [] };
    cases.forEach(function (c) {
      var name = c[0], from = c[1], to = c[2], r0 = c[3], r1 = c[4];
      var fr = L.modalMorphFrames(from, to, r0, r1);
      var a = fr && parseFrame(fr[0]), b = fr && parseFrame(fr[1]);
      if (!a || !b) { bad.parse.push(name); return; }
      var near = function (x, y) { return Math.abs(x - y) < 0.01; };
      var s0 = seen(a, b, to, 0), s1 = seen(a, b, to, 1), rr = Math.min(r0, from.width / 2, from.height / 2);
      if (!(near(s0.left, from.left) && near(s0.top, from.top) && near(s0.width, from.width) && near(s0.height, from.height) && near(s0.rx, rr) && near(s0.ry, rr))) bad.ends.push(name + ' start ' + JSON.stringify(s0));
      if (!(near(s1.left, to.left) && near(s1.top, to.top) && near(s1.width, to.width) && near(s1.height, to.height) && near(s1.rx, r1) && near(s1.ry, r1))) bad.ends.push(name + ' end ' + JSON.stringify(s1));
      var grows = from.width <= to.width && from.height <= to.height;
      for (var p = 0; p <= 1.00001; p += 0.02) {
        var s = seen(a, b, to, p), lerp = function (k) { return from[k] + (to[k] - from[k]) * p; };
        // a card no bigger than the panel moves on the straight line between
        // the two boxes, the path the Christmas snow copies take
        if (grows && !(near(s.left, lerp('left')) && near(s.top, lerp('top')) && near(s.width, lerp('width')) && near(s.height, lerp('height')))) { bad.line.push(name + ' at ' + p.toFixed(2)); break; }
        if (grows && Math.abs(s.rx - s.ry) > 0.01) { bad.round.push(name + ' at ' + p.toFixed(2) + ': ' + s.rx.toFixed(2) + ' x ' + s.ry.toFixed(2)); break; }
        if (!(s.width > 0 && s.height > 0)) { bad.line.push(name + ' empty at ' + p.toFixed(2)); break; }
      }
    });
    ok('morph: every case gives two well-formed keyframes (translate + scale, inset + round radius)', !bad.parse.length, bad.parse.join(', '));
    ok('morph: the pop-up starts as exactly the card (box and round corners) and lands as exactly the panel', !bad.ends.length, bad.ends.join(' | '));
    ok('morph: in between it moves on the straight line between the two boxes (where the snow copies fly)', !bad.line.length, bad.line.join(' | '));
    ok('morph: its corners stay round on every frame (no squashed ellipses)', !bad.round.length, bad.round.join(' | '));
    var phone = L.modalMorphFrames({ left: 14, top: 277, width: 169, height: 87 }, { left: 10, top: 157, width: 355, height: 510 }, 22, 20);
    ok('morph: a smaller card never scales the panel (content keeps its real size)', /scale\(1, 1\)$/.test(phone[0].transform) && /scale\(1, 1\)$/.test(phone[1].transform));
    eq('morph: unusable boxes give no frames', [L.modalMorphFrames(null, { left: 0, top: 0, width: 10, height: 10 }), L.modalMorphFrames({ left: 0, top: 0, width: 0, height: 10 }, { left: 0, top: 0, width: 10, height: 10 }), L.modalMorphFrames({ left: NaN, top: 0, width: 5, height: 5 }, { left: 0, top: 0, width: 10, height: 10 })], [null, null, null]);

    // ---- KazuLib.outerShadows ----
    eq('shadow: keeps the drop shadows and drops the inset glint', L.outerShadows('rgba(0, 0, 0, 0.3) 0px 14px 34px 0px, rgba(255, 255, 255, 0.55) 1.5px 0.5px 0px 0px inset, rgba(0, 0, 0, 0.24) -2px -3px 8px 0px inset'), 'rgba(0, 0, 0, 0.3) 0px 14px 34px 0px');
    eq('shadow: several drop shadows survive in order', L.outerShadows('rgb(1, 2, 3) 0px 1px 2px 0px, rgba(4, 5, 6, 0.5) 0px 8px 16px 0px'), 'rgb(1, 2, 3) 0px 1px 2px 0px, rgba(4, 5, 6, 0.5) 0px 8px 16px 0px');
    eq('shadow: none, empty, or inset only give no shadow box', [L.outerShadows('none'), L.outerShadows(''), L.outerShadows('inset 0 0 4px red')], ['', '', '']);

    // ---- script.js wiring ----
    var fly = between(source, '  function flyModal(card, opening, onDone) {', '\n  }\n');
    ok('wiring: every flight uses the morph frames, on phones too (no squashing scale, no phone path without corners)', !!fly && fly.indexOf('KazuLib.modalMorphFrames(from, to, cardR, panelR)') !== -1 && fly.indexOf('lite') === -1 && fly.indexOf('borderRadius') === -1 && !/scale\(' \+ sx/.test(fly));
    ok('wiring: the shadow box flies with the panel and is gone when it lands or a new flight starts', !!fly && fly.indexOf('flightShadowLand();') < fly.indexOf('if (!modalPanel.animate)') && fly.indexOf('if (fly) flightShadow(from, to, opening,') !== -1 && /anim\.onfinish = \(\) => \{[\s\S]*?flightShadowLand\(\);[\s\S]*?done\(\);/.test(fly));
    ok('wiring: the shadow box sits under the panel and carries only the outer shadows', /modalEl\.insertBefore\(el, modalPanel\)/.test(source) && source.indexOf('KazuLib.outerShadows(cs.boxShadow)') !== -1);
    ok('wiring: the Christmas snow still flies with it and lands with it', !!fly && fly.indexOf('if (fly) frostFly(modalEl, modalPanel, card, from, to, opening, { duration: ms, easing: MODAL_EASE, fill: \'both\' });') > fly.indexOf('const frames = fly'));

    // ---- style.css ----
    ok('css: the panel and the shadow box both scale from their top-left corner (the morph maths assumes it)', /\.modal-panel \{[^}]*transform-origin: 0 0;/.test(css) && /\.modal-flight-shadow \{[^}]*position: absolute;[^}]*transform-origin: 0 0;/.test(css));
    ok('css: locking the page for a pop-up keeps the scrollbar gutter, so no card moves under it (the flight starts where the card is)', /\nhtml \{ scrollbar-gutter: stable; \}/.test(css) && /body\.modal-open \{ overflow: hidden; \}/.test(css));
    // pop-up text sizes: evals/fluid-layout.js
  }

  global.KazuModalMotionChecks = { run: run, parseFrame: parseFrame, seen: seen };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuModalMotionChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      var eqFn = function (name, actual, expected) { okFn(name, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + ' != ' + JSON.stringify(expected)); };
      run(global.KazuLib, fs.readFileSync(path.join(root, 'script.js'), 'utf8'), fs.readFileSync(path.join(root, 'style.css'), 'utf8'), okFn, eqFn);
      console.log('Modal motion eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
