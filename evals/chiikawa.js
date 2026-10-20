/* ============================================================================
   Chiikawa peek gates (Japanese mode: Chiikawa peeks out from behind the
   profile picture). Shared by tests.js and tests.html; run standalone:
   node evals/chiikawa.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - KazuLib.chiikawaPeekMode: English is 'off', reduced motion is 'still'
       (parked, no motion), otherwise 'move'. Low-power still moves: every
       phone trips low-power, and the peek is one composited transform.
     - KazuLib.chiikawaPeekDelay: the first peek waits out the picture's
       entrance pop, later ones land 7-12 s apart for any random draw, and bad
       input never yields NaN or a zero gap (a zero gap would be a busy loop).
     - Markup: decorative (alt="", aria-hidden), lazy so the English page never
       downloads it, inside .pfp-ring right after the picture; precached.
     - CSS: hidden unless <html lang="ja">, stacked under the picture, the peek
       is a one-shot animation (never infinite), starts and ends tucked in,
       and no body.low-power or reduced-motion rule kills it (script.js decides).
     - The real initChiikawaPeek (sliced out of script.js) against fakes: no
       timer in English, a timer then a peek in Japanese, re-armed after
       animationend, nothing while hidden or scrolled away, back to English
       stops everything, reduced motion parks it without ever animating,
       phones (low-power) still peek.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  function run(L, html, script, css, sw, ok, eq) {
    var lf = function (t) { return String(t).split(String.fromCharCode(13)).join(''); };
    html = lf(html); script = lf(script); css = lf(css); sw = lf(sw);
    // ---- mode ----
    eq('chiikawa: English page is off', L.chiikawaPeekMode({ lang: 'en' }), 'off');
    eq('chiikawa: no state is off', L.chiikawaPeekMode(), 'off');
    eq('chiikawa: English stays off even with reduced motion', L.chiikawaPeekMode({ lang: 'en', reducedMotion: true }), 'off');
    eq('chiikawa: Japanese moves', L.chiikawaPeekMode({ lang: 'ja' }), 'move');
    eq('chiikawa: Japanese + reduced motion is still', L.chiikawaPeekMode({ lang: 'ja', reducedMotion: true }), 'still');
    eq('chiikawa: Japanese + low-power still moves (every phone is low-power)', L.chiikawaPeekMode({ lang: 'ja', lowPower: true }), 'move');

    // ---- delay ----
    eq('chiikawa: first peek waits out the entrance pop', L.chiikawaPeekDelay(0, 0.5), 1200);
    eq('chiikawa: a bad count is treated as the first peek', L.chiikawaPeekDelay(NaN, 0.5), 1200);
    eq('chiikawa: later peek, lowest draw', L.chiikawaPeekDelay(1, 0), 7000);
    eq('chiikawa: later peek, middle draw', L.chiikawaPeekDelay(3, 0.5), 9500);
    var spread = true;
    for (var i = 0; i <= 100; i++) { var d = L.chiikawaPeekDelay(2, i / 100); if (!(d >= 7000 && d < 12000)) spread = false; }
    ok('chiikawa: every later gap is 7-12 s', spread);
    eq('chiikawa: a draw of 1 is clamped below 12 s', L.chiikawaPeekDelay(2, 1), 11995);
    eq('chiikawa: a NaN draw falls back to the shortest gap', L.chiikawaPeekDelay(2, NaN), 7000);
    eq('chiikawa: a negative draw falls back to the shortest gap', L.chiikawaPeekDelay(2, -3), 7000);

    // ---- markup ----
    var tag = (/<img class="chiikawa-peek"[^>]*>/.exec(html) || [''])[0];
    ok('chiikawa: the image is in the page', !!tag);
    ok('chiikawa: decorative (empty alt, aria-hidden)', tag.indexOf('alt=""') !== -1 && tag.indexOf('aria-hidden="true"') !== -1, tag);
    ok('chiikawa: lazy, so the English page (display:none) never downloads it', tag.indexOf('loading="lazy"') !== -1, tag);
    ok('chiikawa: sits in .pfp-ring right after the picture', /<div class="pfp-ring">\s*<img class="pfp"[^>]*>\s*<!--[\s\S]*?-->\s*<img class="chiikawa-peek"/.test(html));
    ok('chiikawa: the asset is precached for offline Japanese', sw.indexOf("'./assets/chiikawa.webp',") !== -1);

    // ---- CSS ----
    function rule(sel) { var at = css.indexOf('\n' + sel + ' {'); if (at === -1) return null; var open = css.indexOf('{', at); return css.slice(open + 1, css.indexOf('}', open)); }
    var base = rule('.chiikawa-peek') || '', pfp = rule('.pfp') || '';
    ok('chiikawa: hidden by default (English never shows it)', /display: none;/.test(base) && /opacity: 0;/.test(base), base);
    ok('chiikawa: only <html lang="ja"> displays it', css.indexOf('html[lang="ja"] .chiikawa-peek { display: block; }') !== -1);
    ok('chiikawa: stacked under the picture', /z-index: 0;/.test(base) && /position: relative; z-index: 1;/.test(pfp), pfp);
    var peekRule = (/html\[lang="ja"\] \.chiikawa-peek\.is-peeking \{([^}]*)\}/.exec(css) || [])[1] || '';
    ok('chiikawa: the peek is one-shot, never infinite', /animation: chiikawaPeek [\d.]+s/.test(peekRule) && !/infinite/.test(peekRule), peekRule);
    ok('chiikawa: no stylesheet rule silences it behind the script', !/low-power[^{]*chiikawa|chiikawa[^{]*low-power/.test(css));
    var kf = (/@keyframes chiikawaPeek \{([\s\S]*?)\n\}/.exec(css) || [])[1] || '';
    var first = (/0% +\{([^}]*)\}/.exec(kf) || [])[1] || '', last = (/100% \{([^}]*)\}/.exec(kf) || [])[1] || '';
    ok('chiikawa: starts and ends tucked in and transparent', /opacity: 0;/.test(first) && /translateY\(0\)/.test(first) && /opacity: 0;/.test(last) && /translateY\(0\)/.test(last), first + ' | ' + last);
    ok('chiikawa: the peek pose is the still pose', kf.indexOf('rotate(-38deg) translateY(-96%)') !== -1 && css.indexOf('html[lang="ja"] .chiikawa-peek.is-still { opacity: 1; transform: translate(-50%, -50%) rotate(-38deg) translateY(-96%); }') !== -1);

    // ---- the real loop, sliced out of script.js, against fakes ----
    var start = script.indexOf('  (function initChiikawaPeek() {'), end = script.indexOf('\n  })();', start);
    ok('chiikawa: initChiikawaPeek found in script.js', start !== -1 && end !== -1);
    if (start === -1 || end === -1) return;
    var body = script.slice(start, end + '\n  })();'.length);

    function harness(o) {
      var timers = [], nextId = 1, docL = {}, elL = {}, io = null;
      var classes = {};
      var el = {
        parentElement: {},
        classList: {
          add: function (c) { classes[c] = true; },
          remove: function (c) { delete classes[c]; },
          contains: function (c) { return !!classes[c]; },
          toggle: function (c, on) { if (on) classes[c] = true; else delete classes[c]; },
        },
        addEventListener: function (t, f) { elL[t] = f; },
      };
      var doc = {
        hidden: false,
        querySelector: function (s) { return s === '.chiikawa-peek' ? el : null; },
        addEventListener: function (t, f) { docL[t] = f; },
      };
      var state = { lang: o.lang };
      var win = { IntersectionObserver: true };
      function FakeIO(cb) { io = cb; this.observe = function () {}; }
      var fn = new Function('document', 'window', 'KazuLib', 'pageIsJapanese', 'REDUCED_MOTION', 'LOW_POWER',
        'setTimeout', 'clearTimeout', 'IntersectionObserver', 'Math', body);
      var fakeMath = Object.create(Math); fakeMath.random = function () { return 0.5; };
      fn(doc, win, L, function () { return state.lang === 'ja'; }, !!o.reducedMotion, !!o.lowPower,
        function (f, ms) { var t = { id: nextId++, f: f, ms: ms }; timers.push(t); return t.id; },
        function (id) { timers = timers.filter(function (t) { return t.id !== id; }); },
        FakeIO, fakeMath);
      return {
        classes: classes, doc: doc, state: state,
        pending: function () { return timers.map(function (t) { return t.ms; }); },
        fire: function () { var t = timers.shift(); if (t) t.f(); return !!t; },
        lang: function (l) { state.lang = l; docL['kazu-langchange'](); },
        end: function () { elL.animationend(); },
        hide: function (h) { doc.hidden = h; docL.visibilitychange(); },
        view: function (v) { io([{ isIntersecting: v }]); },
      };
    }

    var en = harness({ lang: 'en' });
    eq('chiikawa loop: English arms nothing', en.pending(), []);
    ok('chiikawa loop: English has no peek or still class', !en.classes['is-peeking'] && !en.classes['is-still']);

    var h = harness({ lang: 'ja' });
    eq('chiikawa loop: Japanese arms the first peek', h.pending(), [1200]);
    h.fire();
    ok('chiikawa loop: the timer starts a peek', !!h.classes['is-peeking']);
    eq('chiikawa loop: nothing armed mid-peek', h.pending(), []);
    h.end();
    ok('chiikawa loop: animationend drops the class', !h.classes['is-peeking']);
    eq('chiikawa loop: and re-arms a 7-12 s gap', h.pending(), [9500]);
    h.hide(true);
    eq('chiikawa loop: hidden tab disarms', h.pending(), []);
    h.hide(false);
    eq('chiikawa loop: visible again re-arms', h.pending(), [9500]);
    h.view(false);
    eq('chiikawa loop: scrolled away disarms', h.pending(), []);
    h.view(true);
    eq('chiikawa loop: back in view re-arms', h.pending(), [9500]);
    h.lang('en');
    eq('chiikawa loop: switching to English disarms', h.pending(), []);
    h.lang('ja');
    eq('chiikawa loop: switching back starts over with the first peek', h.pending(), [1200]);
    h.fire(); h.lang('en');
    ok('chiikawa loop: English mid-peek drops the class', !h.classes['is-peeking']);

    var late = harness({ lang: 'ja' });
    late.doc.hidden = true; late.fire();
    ok('chiikawa loop: a timer that fires while hidden does not peek', !late.classes['is-peeking']);

    var still = harness({ lang: 'ja', reducedMotion: true });
    ok('chiikawa loop: reduced motion parks it', !!still.classes['is-still']);
    eq('chiikawa loop: reduced motion arms nothing', still.pending(), []);
    still.lang('en');
    ok('chiikawa loop: English unparks it', !still.classes['is-still']);
    var lp = harness({ lang: 'ja', lowPower: true });
    ok('chiikawa loop: low-power (phones) still peeks', !lp.classes['is-still'] && lp.pending().length === 1);
  }

  global.KazuChiikawaChecks = { run: run };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuChiikawaChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var root = path.join(__dirname, '..');
      var read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n'); };
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; if (!value) console.log('FAIL ' + name + ': ' + detail); };
      var eqFn = function (name, a, b) { okFn(name, JSON.stringify(a) === JSON.stringify(b), 'got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); };
      run(global.KazuLib, read('index.html'), read('script.js'), read('style.css'), read('sw.js'), okFn, eqFn);
      console.log('chiikawa eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
