/* ============================================================================
   New Year fireworks: shared gate checks + a local lifecycle/frame eval.
   ----------------------------------------------------------------------------
   Runs the actual script.js effect against a fake UK clock, canvas, storage
   and event loop. No network, dependencies or real waits. Both tests.js and
   tests.html use these assertions; run standalone: node evals/new-year-fireworks.js
   Pass threshold: zero failures, finite paint coordinates, no repeat shows,
   <= 1,800 canvas calls per painted frame, and zero work/DOM left after exit.
   ========================================================================== */
(function (global) {
  'use strict';

  function run(L, source, css, ok, eq) {
    var first = source.indexOf('  // ---------- New Year fireworks ----------');
    var last = source.indexOf('  // ---------- Birthday balloons (canvas physics) ----------');
    ok('New Year: effect section exists', first >= 0 && last > first);
    var effect = source.slice(first, last);

    function harness(options) {
      options = options || {};
      var now = options.now || Date.UTC(2026, 11, 31, 23, 59, 59);
      var time = 0, nextId = 1, rafs = {}, timers = {}, stored = options.stored || null;
      var writes = 0, paints = 0, calls = 0, maxCalls = 0, bad = false;
      var children = [];
      // Seed the renderer's random variation so the gate lane is repeatable.
      var randomMath = Object.create(Math), seed = 123456;
      randomMath.random = function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      function target() {
        var listeners = {};
        return {
          addEventListener: function (name, fn) { (listeners[name] || (listeners[name] = [])).push(fn); },
          removeEventListener: function (name, fn) { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); },
          emit: function (name) { (listeners[name] || []).slice().forEach(function (fn) { fn(); }); },
          listenerCount: function () { return Object.keys(listeners).reduce(function (n, key) { return n + listeners[key].length; }, 0); }
        };
      }
      var motion = target(); motion.matches = !!options.reducedMotion;
      var win = target(); win.innerWidth = 1440; win.innerHeight = 900;
      win.matchMedia = function () { return motion; };
      var doc = target(); doc.hidden = !!options.hidden;
      doc.body = { appendChild: function (el) { children.push(el); } };
      function paint() {
        calls++;
        for (var i = 0; i < arguments.length; i++) if (typeof arguments[i] === 'number' && !isFinite(arguments[i])) bad = true;
      }
      doc.createElement = function (tag) {
        var el = {
          tag: tag, attrs: {}, children: [], textContent: '',
          setAttribute: function (key, value) { this.attrs[key] = value; },
          append: function () { this.children = this.children.concat(Array.prototype.slice.call(arguments)); },
          remove: function () { children = children.filter(function (other) { return other !== el; }); }
        };
        if (tag === 'canvas') {
          var ctx = { setTransform: paint, beginPath: paint, moveTo: paint, lineTo: paint, stroke: paint };
          ctx.clearRect = function () { maxCalls = Math.max(maxCalls, calls); calls = 0; paints++; paint.apply(null, arguments); };
          Object.defineProperty(ctx, 'globalAlpha', { set: function (value) { if (!isFinite(value) || value < 0 || value > 1) bad = true; } });
          el.getContext = function () { return options.noCanvas ? null : ctx; };
        }
        return el;
      };
      function find(id) { return children.filter(function (el) { return el.id === id; })[0] || null; }
      var storage = {
        getItem: function () { if (options.blockedStorage) throw new Error('blocked'); return stored; },
        setItem: function (key, value) { if (options.blockedStorage) throw new Error('blocked'); stored = value; writes++; }
      };
      var api = new Function('KazuLib', 'location', 'sessionStorage', 'document', 'window', 'seasonUKParts', 'Date',
        'LOW_POWER', 'lightDevice', '$', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Math',
        effect + '\nreturn { check: checkNewYear, eligible: newYearCelebrationYear, spark: fireworkSparkState };')(
        options.fallback ? null : L, { search: options.search || '' }, storage, doc, win, L.ukWallParts,
        function () { return new Date(now); }, !!options.lowPower, !!options.lightDevice, find,
        function (fn, delay) { var id = nextId++; timers[id] = { fn: fn, at: time + delay }; return id; },
        function (id) { delete timers[id]; },
        function (fn) { var id = nextId++; rafs[id] = fn; return id; },
        function (id) { delete rafs[id]; }, { now: function () { return time; } }, randomMath);
      return {
        api: api, doc: doc, win: win, motion: motion, find: find,
        tick: function (instant) { if (instant !== undefined) now = instant; api.check(); },
        step: function (at) {
          time = at;
          Object.keys(rafs).forEach(function (id) { var fn = rafs[id]; delete rafs[id]; if (fn) fn(time); });
          Object.keys(timers).forEach(function (id) { var timer = timers[id]; if (timer && time >= timer.at) { delete timers[id]; timer.fn(); } });
        },
        stats: function () { return { stored: stored, writes: writes, paints: paints, maxCalls: Math.max(calls, maxCalls), bad: bad,
          rafs: Object.keys(rafs).length, timers: Object.keys(timers).length, elements: children.length,
          listeners: win.listenerCount() + doc.listenerCount() + motion.listenerCount() }; }
      };
    }

    // UK midnight and the one-minute grace window, including leap-year edges.
    var midnight = Date.UTC(2027, 0, 1);
    var cases = [
      [midnight - 1, 0, null], [midnight, 0, 2027], [midnight + 59999, 0, 2027],
      [midnight + 60000, 0, null], [midnight + 3600000, 0, null],
      [Date.UTC(2027, 0, 2), 0, null], [Date.UTC(2026, 6, 1), 0, null],
      [Date.UTC(2026, 5, 30, 23), 0, null], [midnight, 2027, null], [midnight, 2028, null],
      [Date.UTC(2028, 0, 1), 2027, 2028], [Date.UTC(2029, 0, 1), 2028, 2029]
    ];
    var fallback = harness({ fallback: true }).api;
    cases.forEach(function (c, i) {
      var w = L.ukWallParts(new Date(c[0]));
      eq('New Year midnight edge ' + i, L.newYearCelebrationYear(w, c[1]), c[2]);
      eq('New Year fallback edge ' + i, fallback.eligible(w, c[1]), c[2]);
    });
    eq('New Year: missing wall clock is ignored', L.newYearCelebrationYear(null), null);

    // Motion is analytic: cardinal directions, gravity and fading, plus a
    // parameter sweep to pin parity with the no-lib fallback and finite output.
    eq('firework: starts at the burst centre', L.fireworkSparkState(0, 0, 200, 2), { x: 0, y: 0, alpha: 1 });
    eq('firework: halfway through life is quarter opacity', L.fireworkSparkState(1, 0, 200, 2).alpha, 0.25);
    eq('firework: never appears before the burst', L.fireworkSparkState(-1, 0, 200, 2).alpha, 0);
    eq('firework: expires exactly at its lifetime', L.fireworkSparkState(2, 0, 200, 2).alpha, 0);
    eq('firework: skipped frames cannot bring it back', L.fireworkSparkState(500, 0, 200, 2).alpha, 0);
    eq('firework: invalid inputs are invisible', L.fireworkSparkState(NaN, 0, 200, 2), { x: 0, y: 0, alpha: 0 });
    eq('firework: invalid lifetime is invisible', L.fireworkSparkState(1, 0, 200, 0), { x: 0, y: 0, alpha: 0 });
    var right = L.fireworkSparkState(1, 0, 200, 2), left = L.fireworkSparkState(1, Math.PI, 200, 2);
    ok('firework: opposite sparks stay symmetric under gravity', Math.abs(right.x + left.x) < 1e-9 && Math.abs(right.y - left.y) < 1e-9 && right.y === 22);
    var sweepBad = null;
    for (var age = -0.1; age < 3.2; age += 0.1) {
      [0, 0.4, Math.PI, 5.8].forEach(function (angle) {
        [80, 250].forEach(function (speed) {
          var p = L.fireworkSparkState(age, angle, speed, 2.8);
          if (!isFinite(p.x) || !isFinite(p.y) || p.alpha < 0 || p.alpha > 1 || JSON.stringify(p) !== JSON.stringify(fallback.spark(age, angle, speed, 2.8))) sweepBad = [age, angle, speed];
        });
      });
    }
    ok('firework: finite, frame-independent physics and fallback parity across the show', !sweepBad, sweepBad);

    // Exercise the real trigger and renderer, including cleanup and reloads.
    var h = harness(); h.tick();
    eq('New Year: no DOM or animation before midnight', h.stats().elements, 0);
    h.tick(midnight); h.tick(midnight + 1000);
    eq('New Year: live midnight triggers once and persists the year', [h.stats().elements, h.stats().writes, h.stats().stored], [1, 1, '2027']);
    ok('New Year: fireworks have no greeting box', !h.find('new-year-greeting') && source.indexOf('new-year-greeting') === -1 && css.indexOf('#new-year-greeting') === -1);
    ok('New Year: canvas is decorative', h.find('fireworks-canvas').attrs['aria-hidden'] === 'true');
    var paintedFrames = 0;
    for (var t = 0; t < 20000; t += 1000 / 144) h.step(t);
    paintedFrames = h.stats().paints;
    ok('New Year frame eval: canvas is capped at 30 fps on a 144 Hz screen', paintedFrames > 400 && paintedFrames <= 601, paintedFrames);
    ok('New Year frame eval: coordinates/opacity stay finite and paint budget stays bounded', !h.stats().bad && h.stats().maxCalls <= 1800, h.stats().maxCalls);
    h.step(20000);
    eq('New Year: natural finish removes DOM, rAF, timers and listeners', [h.stats().elements, h.stats().rafs, h.stats().timers, h.stats().listeners], [0, 0, 0, 0]);
    h.tick(midnight + 30000);
    eq('New Year: no replay after the show finishes', h.stats().elements, 0);
    h.tick(Date.UTC(2028, 0, 1));
    eq('New Year: an open page can celebrate the following year', h.stats().stored, '2028');
    h.win.emit('pagehide');
    eq('New Year: navigation cancels all work', [h.stats().elements, h.stats().rafs, h.stats().timers, h.stats().listeners], [0, 0, 0, 0]);

    ['2027', 'bad', null].forEach(function (saved) {
      var reload = harness({ stored: saved, now: midnight }); reload.tick();
      eq('New Year: reload/storage value ' + saved, reload.stats().elements, saved === '2027' ? 0 : 1);
      reload.win.emit('pagehide');
    });
    var blocked = harness({ blockedStorage: true, now: midnight }); blocked.tick(); blocked.tick();
    eq('New Year: blocked storage still uses the in-memory latch', blocked.stats().elements, 1);
    blocked.win.emit('pagehide'); blocked.tick();
    eq('New Year: blocked storage never replays in an open page', blocked.stats().elements, 0);

    var hidden = harness({ hidden: true, now: midnight }); hidden.tick();
    eq('New Year: hidden tabs do not consume the celebration', hidden.stats().writes, 0);
    hidden.doc.hidden = false; hidden.tick(midnight + 10000);
    eq('New Year: resuming within the first minute celebrates', hidden.stats().elements, 1);
    hidden.doc.hidden = true; hidden.doc.emit('visibilitychange');
    eq('New Year: hiding mid-show cancels all work', [hidden.stats().elements, hidden.stats().rafs, hidden.stats().timers, hidden.stats().listeners], [0, 0, 0, 0]);
    var late = harness({ now: midnight + 60000 }); late.tick();
    eq('New Year: returning later never starts a delayed show', late.stats().elements, 0);

    [{ lowPower: true }, { reducedMotion: true }, { noCanvas: true }].forEach(function (flags) {
      flags.now = midnight;
      var still = harness(flags); still.tick();
      eq('New Year: effect is skipped for ' + Object.keys(flags)[0], [still.stats().elements, still.stats().rafs, still.stats().timers, still.stats().listeners], [0, 0, 0, 0]);
    });
    var change = harness({ now: midnight }); change.tick();
    change.motion.matches = true; change.motion.emit('change');
    eq('New Year: enabling reduced motion removes the show immediately', [change.stats().elements, change.stats().rafs, change.stats().timers], [0, 0, 0]);
    eq('New Year: changed-motion cleanup leaves no listeners', change.stats().listeners, 0);
    var resized = harness({ now: midnight, lightDevice: true }); resized.tick();
    resized.win.innerWidth = 390; resized.win.innerHeight = 844; resized.win.emit('resize');
    eq('New Year: resize keeps half-resolution canvas', [resized.find('fireworks-canvas').width, resized.find('fireworks-canvas').height], [195, 422]);
    resized.step(2000);
    ok('New Year: phone-sized light rendering stays finite', !resized.stats().bad);
    resized.win.emit('pagehide');

    [false, true].forEach(function (missingLib) {
      var preview = harness({ search: '?fireworks=1&time=00:00', now: Date.UTC(2026, 6, 1), fallback: missingLib });
      preview.tick(); preview.tick();
      ok('New Year: preview works with/without lib and never changes the real latch', !!preview.find('fireworks-canvas') && preview.stats().writes === 0);
      preview.win.emit('pagehide'); preview.tick();
      eq('New Year: preview plays once per page load', preview.stats().elements, 0);
      var real = harness({ now: midnight, fallback: missingLib }); real.tick();
      eq('New Year: actual midnight works with/without lib', real.stats().stored, '2027');
      real.win.emit('pagehide');
    });
    var skyPreview = harness({ search: '?time=00:00&season=all', now: Date.UTC(2027, 0, 1, 12) }); skyPreview.tick();
    eq('New Year: sky/season previews cannot spoof midnight', skyPreview.stats().elements, 0);
    var tickSource = source.slice(source.indexOf('  function tick()'), source.indexOf('  // ---------- Fetch timeout wrapper ----------'));
    var checks = 0;
    var tick = new Function('computeClock', '$', 'updatePresenceProgress', 'applySeasons', 'checkNewYear', 'stepSky', tickSource + '\nreturn tick;')(
      function () { return {}; }, function () { return null; }, function () {}, function () {}, function () { checks++; }, function () {});
    tick(); tick();
    eq('New Year: existing per-second clock checks even when seasons stay cached', checks, 2);
    ok('New Year: canvas cannot intercept page controls', /#fireworks-canvas\s*\{[^}]*pointer-events: none/.test(css));
  }

  global.KazuNewYearChecks = { run: run };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuNewYearChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      function ok(name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); }
      function eq(name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + ' != ' + JSON.stringify(expected)); }
      run(global.KazuLib, fs.readFileSync(path.join(root, 'script.js'), 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(path.join(root, 'style.css'), 'utf8'), ok, eq);
      console.log('New Year eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
