/* ============================================================================
   Performance guards: gate-lane assertions for the rules behind the page's
   idle and scroll cost. Shared by tests.js and tests.html; run standalone:
   node evals/perf-guards.js
   ----------------------------------------------------------------------------
   Why these exist. A real-browser run (evals/perf.js) found the page burning a
   full CPU core at rest and missing every scroll frame on a throttled phone,
   from a handful of small, innocent-looking things:
     - a 90s CSS transition on four INHERITED custom properties (the sky tint),
       retargeted every minute so one was always running: whole-document
       restyle every frame;
     - an infinite spin on an invisible halo (Pride month's, all year);
     - a width transition on a 5px progress bar, and any other running
       animation: each one makes the compositor + GPU produce a frame on every
       vsync (144 a second) for as long as it lives;
     - a MutationObserver that re-swept every element of the page after every
       DOM change, including the 1 Hz clock text swap (~9 ms, once a second);
     - a CSS animation started inside a content-visibility:auto subtree that was
       skipped (never completes: a frame is requested on every vsync, forever).
   Each rule is pinned two ways: by reading the source for the dangerous shape,
   and by running the real code (sliced out of script.js) against fakes. All
   deterministic, local, no browser, no network, no waiting.
   ========================================================================== */
(function (global) {
  'use strict';

  function between(source, from, to) {
    var a = source.indexOf(from);
    if (a < 0) return null;
    var b = source.indexOf(to, a + from.length);
    return b > a ? source.slice(a, b) : null;
  }

  // HSL -> RGB in unrounded 0..255 floats: movement below one 8-bit level that
  // the hex form hides.
  function rgbFloat(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function run(L, source, css, html, ok, eq) {
    var flat = css.replace(/\r/g, '');

    /* ---------------------------------------------------------- static pins */

    // The sky tint: registered for typed defaults, but never transitioned.
    ok('perf: the sky tint is never transitioned (an inherited custom-property glide restyles the whole page every frame)',
      !/transition(?:-property)?\s*:[^;{}]*--(?:bg-|sunset|m-)/.test(flat) &&
      flat.indexOf('data-bg-live') === -1 && source.indexOf('bgLive') === -1 &&
      flat.indexOf("@property --bg-h { syntax: '<number>';") !== -1 && flat.indexOf('@property --bg-glow') !== -1);
    ok('perf: the sky tint steps from the existing 1 Hz tick (no timer of its own, nothing while hidden)',
      /function tick\(\) \{[\s\S]*?stepSky\(\);[\s\S]*?\n  \}/.test(source) && source.indexOf('setInterval(updateSkyBody') === -1 &&
      source.indexOf('applySkyTint(c.mins, c.doy)') !== -1 && source.indexOf('const TINT_STEP_MS = 10000;') !== -1);
    ok('perf: an unchanged tint writes nothing (deep night costs no restyle)',
      source.indexOf('if (key !== skyTintKey) {') !== -1 && source.indexOf('skyTintKey = key;') !== -1);

    // An invisible infinite animation is not free: it keeps frames flowing.
    // Every infinite loop in the stylesheet must be one of these, each of which
    // is only ever on screen (or only ever running) when it is the feature.
    var allowed = ['.petal', '.drop', '.pulse-dot', '.music-viz span', 'body.season-pride .pfp-ring::before',
      '.xmas-lights circle', '.aurora-ribbon--a', '.aurora-ribbon--b'];
    var found = [], re = /([^{}]+)\{([^{}]*)\}/g, m;
    while ((m = re.exec(flat))) {
      if (/\binfinite\b/.test(m[2]) && /animation/.test(m[2])) found.push(m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim());
    }
    var rogue = found.filter(function (sel) { return allowed.indexOf(sel) === -1; });
    ok('perf: every infinite CSS animation is a gated feature (a new always-on loop must be added to this list on purpose)', !rogue.length,
      'unlisted infinite animation(s): ' + JSON.stringify(rogue) + ' (found ' + JSON.stringify(found) + ')');
    ok('perf: the Pride halo only spins during Pride month, and reduced motion still wins',
      /(^|\n)\.pfp-ring::before \{[^}]*\}/.test(flat) && !/(^|\n)\.pfp-ring::before \{[^}]*animation/.test(flat) &&
      flat.indexOf('body.season-pride .pfp-ring::before { opacity: 1; animation: prideSpin 14s linear infinite; }') !== -1 &&
      flat.indexOf('@media (prefers-reduced-motion: reduce) { body.season-pride .pfp-ring::before { animation: none; } }') !== -1 &&
      flat.indexOf('body.low-power .pfp-ring::before,') !== -1);

    // The Spotify bar moves by transform in discrete steps: no layout, no animation.
    ok('perf: the Spotify bar is a transform in discrete steps, never a transition (width OR transform)',
      /\.spotify-bar-fill \{[^}]*transform: translateX\(-100%\);[^}]*\}/.test(flat) && !/\.spotify-bar-fill \{[^}]*transition/.test(flat) &&
      source.indexOf("fill.style.transform = 'translateX('") !== -1 && source.indexOf('fill.style.width') === -1);
    ok('perf: the bar timer follows the song and the tab (started by renderDiscord, stopped by the visibility handler)',
      source.indexOf('syncSpotifyBar(); // the 4 Hz bar timer exists only while a song is playing') !== -1 &&
      /visibilitychange', \(\) => \{[\s\S]*?syncSpotifyBar\(\);/.test(source));

    // Scroll hosts are found incrementally; the page-wide sweep is for load/resize.
    ok('perf: the scroll-host scan is incremental (the clock text swap cannot trigger a page-wide sweep)',
      source.indexOf('new MutationObserver(onScanMutations)') !== -1 && source.indexOf('new MutationObserver(scheduleScan)') === -1 &&
      source.indexOf("document.querySelectorAll('*').forEach(considerScroller);") !== -1 &&
      (source.match(/document\.querySelectorAll\('\*'\)/g) || []).length === 1 &&
      source.indexOf('scanResizeTimer = setTimeout(() => scheduleScan(true), 150);') !== -1);
    ok('perf: populate motion only runs for what is on screen and never leaves a finished animation behind',
      source.indexOf('function inViewport(el) {') !== -1 && source.indexOf("setTimeout(() => el.classList.remove('populated-in'), 600)") !== -1 &&
      source.indexOf('if (!el || LOW_POWER || REDUCED_MOTION || !inViewport(el)) return;') !== -1);

    /* ----------------------------------- the footer costs nothing until needed */

    // The meadow is ~535 SVG nodes at the end of a long page. Skipped until the
    // reader nears it, it takes ~28% off a throttled phone's first contentful
    // paint; the placeholder must be the art's REAL height or the page jumps when
    // it renders, so it is derived from the same numbers as .meadow-art itself.
    var art = /\.meadow-art \{[^}]*width: clamp\((\d+)px, 100%, (\d+)px\);[^}]*aspect-ratio: (\d+) \/ (\d+);[^}]*\}/.exec(flat);
    ok('perf: the meadow footer is content-visibility: auto, with a placeholder height computed from the art\'s own width clamp and aspect ratio',
      !!art && /\.footer\.meadow \{[^}]*content-visibility: auto;/.test(flat) &&
      flat.indexOf('contain-intrinsic-block-size: auto calc(clamp(' + art[1] + 'px, 100vw, ' + art[2] + 'px) * ' + art[4] + ' / ' + art[3] + ');') !== -1 &&
      html.indexOf('viewBox="0 0 ' + (art ? art[3] + ' ' + art[4] : '?') + '"') !== -1);
    ok('perf: nothing keeps the skipped footer awake (no scripted measuring of it, no animation inside it)',
      !/\.footer\.meadow[^{]*\{[^}]*animation/.test(flat) && !/\.mf-[a-z-]+[^{]*\{[^}]*animation/.test(flat) && source.indexOf("querySelector('.footer.meadow')") === -1);

    /* ----------------------------------------- no traffic nobody can see */

    // A poller whose answer has nowhere to go is pure cost: a request (and on a
    // phone a radio wake-up) every interval, forever. ListenBrainz's strip has
    // no markup at the moment; the loader must look for it BEFORE fetching.
    var lbSlice = between(source, '  async function loadMusicRecent() {', '  // ---------- YouTube Music playlist');
    ok('perf: ListenBrainz loader source is where the guards expect it', !!lbSlice);
    if (lbSlice) {
      var lbRun = function (present) {
        var fetched = [];
        var api = new Function('LISTENBRAINZ_USER', 'KazuLib', '$', 'fetchT', 'lastMusicSig', 'escapeHtml', 'popReveal',
          lbSlice + '\nreturn loadMusicRecent;')(
          'someone', { listenbrainzRow: function (x) { return x; } },
          function () { return present ? { classList: { add: function () {} }, innerHTML: '' } : null; },
          function (url) { fetched.push(url); return new Promise(function () {}); }, '', function (x) { return x; }, function () {});
        api();
        return fetched;
      };
      eq('perf: no ListenBrainz request while its strip has no markup', lbRun(false), []);
      eq('perf: ...and it fetches again the moment the markup exists', lbRun(true).length, 1);
    }
    var hints = (html.match(/<link rel="(?:preconnect|dns-prefetch)" href="[^"]+"/g) || []).join('\n');
    ok('perf: no preconnect to hosts the page never fetches (corsproxy.io, api.listenbrainz.org); the shared CORS proxy is warmed instead',
      hints.indexOf('corsproxy.io') === -1 && hints.indexOf('listenbrainz') === -1 && hints.indexOf('preconnect" href="https://proxy.cors.sh"') !== -1);
    ok('perf: only hosts used within the first seconds get a full preconnect (an idle socket is dropped after ~10s); late ones get DNS only',
      (hints.match(/rel="preconnect"/g) || []).length <= 7 && hints.indexOf('dns-prefetch" href="//zenquotes.io"') !== -1 && hints.indexOf('preconnect" href="https://zenquotes.io"') === -1);

    /* ------------------------------------- the tint step is below perception */

    var stepMs = +(/const TINT_STEP_MS = (\d+);/.exec(source) || [0, 0])[1];
    ok('perf: tint step is between 5s and 15s (finer than that is wasted work, coarser stops reading as a glide)', stepMs >= 5000 && stepMs <= 15000, stepMs);
    (function () {
      // The tint is smooth, so one step moves it by (per-minute change) x (step / 60s)
      // to well within the tolerance; sweep one-minute changes over days spread
      // across the year (both palettes), including both solstices, where the
      // fastest hours of the year live.
      var days = [1, 172, 355, 366];
      for (var d = 8; d < 366; d += 14) days.push(d);
      var worstRgb = 0, worstSunset = 0, worstAt = '';
      [null, 'halloween'].forEach(function (palette) {
        days.forEach(function (day) {
          var prev = null, prevSun = null;
          for (var t = 0; t < 1440; t += 1) {
            var tint = L.skyTint(t, day, palette), sun = L.sunsetGlow(t, day);
            var f = rgbFloat(tint.h, tint.s, tint.l);
            if (prev) {
              var drgb = Math.max(Math.abs(f[0] - prev[0]), Math.abs(f[1] - prev[1]), Math.abs(f[2] - prev[2]));
              var dsun = Math.max(Math.abs(sun.glow - prevSun.glow), Math.abs(sun.late - prevSun.late));
              if (drgb > worstRgb) { worstRgb = drgb; worstAt = (palette || 'plain') + ' day ' + day + ' min ' + t; }
              if (dsun > worstSunset) worstSunset = dsun;
            }
            prev = f; prevSun = sun;
          }
        });
      });
      var perStep = worstRgb * stepMs / 60000, sunPerStep = worstSunset * stepMs / 60000;
      ok('perf: one tint step moves the canvas colour by under a quarter of one 8-bit level, all year, both palettes (' + perStep.toFixed(3) + ' at ' + stepMs / 1000 + 's, worst ' + worstAt + ')', perStep < 0.25, perStep);
      ok('perf: one tint step moves the sunset layer by under 1% (' + (sunPerStep * 100).toFixed(2) + '%)', sunPerStep < 0.01, sunPerStep);
    })();

    /* ------------------------------------------------- sky cadence (real code) */

    var skySlice = between(source, '  // The UK clock the sky runs on', '  let skyLayoutFrame = 0;');
    ok('perf: sky cadence source is where the guards expect it', !!skySlice);
    if (skySlice) {
      var doy = function (y, mo, d) { return Math.round((Date.UTC(y, mo, d) - Date.UTC(y, 0, 1)) / 86400000) + 1; };
      var sky = function (override) {
        var now = 0, tints = [], counter = { body: 0 }, win = { __kazuPopAnim: 0 };
        var parts = { year: 2026, month: 7, day: 12, hours: 12, minutes: 34, seconds: 30 };
        var api = new Function('seasonUKParts', 'SKY_TIME_OVERRIDE', 'performance', 'window', 'applySkyTint', 'counter',
          'var modalAnim = null;\n' + skySlice +
          '\nfunction updateSkyBody() { counter.body++; skyBodyAt = skyTintAt = performance.now(); }' +
          '\nreturn { stepSky: stepSky, skyClock: skyClock, setScroll: function (t) { lastScrollAt = t; }, setModal: function (v) { modalAnim = v; }, quiet: SKY_QUIET_MS, tintMs: TINT_STEP_MS, bodyMs: BODY_STEP_MS };')(
          function () { return parts; }, override == null ? null : override, { now: function () { return now; } }, win,
          function (mins, d) { tints.push([mins, d]); }, counter);
        return { api: api, win: win, tints: tints, counter: counter, at: function (t) { now = t; api.stepSky(); } };
      };

      var s = sky();
      eq('perf: skyClock uses fractional UK minutes (seconds included) and the day of year', s.api.skyClock(new Date(0)), { mins: 12 * 60 + 34 + 0.5, doy: doy(2026, 7, 12) });
      eq('perf: a ?time= preview pins the sky clock exactly', sky(1100).api.skyClock(new Date(0)).mins, 1100);
      s.at(0); s.at(9999);
      eq('perf: nothing is written before the first step is due', [s.tints.length, s.counter.body], [0, 0]);
      s.at(10000);
      eq('perf: the first step writes the tint at the exact fractional minute', s.tints, [[754.5, doy(2026, 7, 12)]]);
      s.at(19999);
      eq('perf: no write inside a step', s.tints.length, 1);
      s.at(20000);
      eq('perf: steps repeat every TINT_STEP_MS', s.tints.length, 2);

      // A realistic minute: the 1 Hz tick for 59 seconds, then the minute step.
      var clock = sky();
      for (var sec = 0; sec <= 59; sec++) clock.at(sec * 1000);
      eq('perf: a quiet minute writes the tint five times (10s..50s) and never moves the body', [clock.tints.length, clock.counter.body], [5, 0]);
      clock.at(60000);
      eq('perf: the minute step moves the body (which writes the tint itself, so no extra write)', [clock.counter.body, clock.tints.length], [1, 5]);
      for (sec = 61; sec <= 69; sec++) clock.at(sec * 1000);
      eq('perf: nothing is due again until a step after the body write', clock.tints.length, 5);
      clock.at(70000);
      eq('perf: the cadence restarted from the body write', [clock.counter.body, clock.tints.length], [1, 6]);

      var busy = sky();
      busy.at(10000);
      busy.api.setScroll(19950); busy.at(20000);
      eq('perf: a step is deferred while the page is being scrolled', busy.tints.length, 1);
      busy.at(19950 + busy.api.quiet - 1);
      eq('perf: ...and still deferred just inside the quiet window', busy.tints.length, 1);
      busy.at(19950 + busy.api.quiet);
      eq('perf: ...then lands on the first tick after the page is at rest', busy.tints.length, 2);
      busy.api.setModal({}); busy.at(40000);
      eq('perf: a step never lands mid pop-up flight', busy.tints.length, 2);
      busy.api.setModal(null); busy.win.__kazuPopAnim = 1; busy.at(40500);
      eq('perf: ...or mid card-height glide', busy.tints.length, 2);
      busy.win.__kazuPopAnim = 0; busy.at(41000);
      eq('perf: ...and catches up as soon as both have settled', busy.tints.length, 3);
      var pinned = sky(1100);
      pinned.at(10000);
      eq('perf: a ?time= preview feeds the pinned minute to every step', pinned.tints[0][0], 1100);
    }

    /* ----------------------------------------- Spotify bar (real code, fakes) */

    var spotSlice = between(source, '  // The Spotify bar advances in small DISCRETE steps', '  // Advance the Spotify bar + game timer');
    ok('perf: Spotify bar source is where the guards expect it', !!spotSlice);
    if (spotSlice) {
      var spot = function (lowPower) {
        var timers = {}, nextId = 1, fill = { style: {} }, doc = { hidden: false };
        var api = new Function('LOW_POWER', '$', 'document', 'setInterval', 'clearInterval',
          'var spotifyTimes = null;\n' + spotSlice +
          '\nreturn { paint: paintSpotifyBar, sync: syncSpotifyBar, setTimes: function (t) { spotifyTimes = t; }, ms: SPOTIFY_BAR_MS };')(
          !!lowPower, function () { return fill; }, doc,
          function (fn, ms) { var id = nextId++; timers[id] = { fn: fn, ms: ms }; return id; },
          function (id) { delete timers[id]; });
        return { api: api, fill: fill, doc: doc, timers: timers, count: function () { return Object.keys(timers).length; } };
      };
      var sp = spot(false);
      sp.api.sync();
      eq('perf: no bar timer while nothing is playing', sp.count(), 0);
      sp.api.setTimes({ start: 1000, end: 11000 }); sp.api.sync(); sp.api.sync();
      eq('perf: one bar timer while a song plays (re-syncing never stacks them)', [sp.count(), sp.timers[1].ms, sp.api.ms], [1, 250, 250]);
      sp.doc.hidden = true; sp.api.sync();
      eq('perf: no bar timer while the tab is hidden', sp.count(), 0);
      sp.doc.hidden = false; sp.api.sync(); sp.api.setTimes(null); sp.api.sync();
      eq('perf: the bar timer goes away when the song stops', sp.count(), 0);
      var low = spot(true);
      low.api.setTimes({ start: 0, end: 1000 }); low.api.sync();
      eq('perf: low-power devices step off the clock tick with no extra timer', [low.count(), low.api.ms], [0, 1000]);
      var bar = spot(false);
      bar.api.setTimes({ start: 1000, end: 11000 });
      var at = function (t) { bar.api.paint(t); return bar.fill.style.transform; };
      eq('perf: bar is empty at the start of the song', at(1000), 'translateX(-100.00%)');
      eq('perf: bar is half full halfway', at(6000), 'translateX(-50.00%)');
      eq('perf: bar is full at the end', at(11000), 'translateX(0.00%)');
      eq('perf: bar clamps before the start and after the end', [at(0), at(99999)], ['translateX(-100.00%)', 'translateX(0.00%)']);
      bar.api.setTimes({ start: 5, end: 5 });
      eq('perf: a zero-length song shows an empty bar, not NaN', at(5), 'translateX(-100.00%)');
      bar.api.setTimes(null); bar.fill.style.transform = 'unchanged'; bar.api.paint(0);
      eq('perf: painting with no song touches nothing', bar.fill.style.transform, 'unchanged');
    }

    /* ----------------------------------- scroll-host scan (real code, fakes) */

    var scanSlice = between(source, '  const attached = new WeakSet();', '  // First sweep once the page is idle');
    ok('perf: scroll-host scan source is where the guards expect it', !!scanSlice);
    if (scanSlice) {
      var scanWorld = function () {
        var all = [], reads = [], attachedHosts = [], pending = null, sweeps = 0;
        function el(name, o) {
          o = o || {};
          var e = { name: name, nodeType: 1, parentElement: o.parent || null, children: [], isConnected: true, cls: o.cls || '', oy: o.oy || 'visible', ch: o.ch || 0, sh: o.sh || 0 };
          Object.defineProperty(e, 'scrollHeight', { get: function () { reads.push(name); return e.sh; } });
          Object.defineProperty(e, 'clientHeight', { get: function () { return e.ch; } });
          e.closest = function () { for (var n = e; n; n = n.parentElement) if (n.cls === 'cscroll') return n; return null; };
          e.querySelectorAll = function () { var out = []; (function walk(n) { n.children.forEach(function (c) { out.push(c); walk(c); }); })(e); return out; };
          if (o.parent) o.parent.children.push(e);
          all.push(e);
          return e;
        }
        var doc = { querySelectorAll: function () { sweeps++; return all.slice(); }, body: null };
        var api = new Function('document', 'window', 'getComputedStyle', 'createScroller', 'requestAnimationFrame',
          scanSlice + '\nreturn { onMutations: onScanMutations, scan: scan, schedule: scheduleScan, selfSize: function () { return scanSelf.size; }, deepSize: function () { return scanDeep.size; } };')(
          doc, {}, function (e) { return { overflowY: e.oy }; }, function (o) { attachedHosts.push(o.host.name); },
          function (fn) { pending = fn; return 1; });
        return { el: el, api: api, reads: reads, hosts: attachedHosts, sweeps: function () { return sweeps; },
          flush: function () { var f = pending; pending = null; if (f) f(); }, hasPending: function () { return !!pending; },
          text: function (target) { return { target: target, addedNodes: [{ nodeType: 3 }], removedNodes: [{ nodeType: 3 }] }; },
          added: function (target, nodes) { return { target: target, addedNodes: nodes, removedNodes: [] }; },
          removed: function (target, nodes) { return { target: target, addedNodes: [], removedNodes: nodes }; } };
      };

      var w = scanWorld();
      var html0 = w.el('html'), body = w.el('body', { parent: html0 }), clock = w.el('clock', { parent: body });
      w.api.onMutations([w.text(clock)]);
      eq('perf: a text swap (the 1 Hz clock) queues nothing and schedules no frame', [w.hasPending(), w.api.selfSize(), w.api.deepSize()], [false, 0, 0]);
      w.api.onMutations([w.text(clock), w.text(clock), w.text(clock)]);
      eq('perf: a whole batch of text swaps stays free', w.hasPending(), false);

      var card = w.el('card', { parent: body }), row = w.el('row', { parent: card }), img = w.el('img', { parent: row });
      w.api.onMutations([w.added(body, [card])]);
      eq('perf: an added element queues itself and its ancestors, and schedules one frame', [w.hasPending(), w.api.deepSize(), w.api.selfSize()], [true, 1, 2]);
      w.reads.length = 0; w.flush();
      eq('perf: the scan inspects only what was added (never the whole page)', [w.sweeps(), w.reads.indexOf('clock') === -1, w.reads.indexOf('card') !== -1, w.reads.indexOf('row') !== -1, w.reads.indexOf('img') !== -1], [0, true, true, true, true]);
      eq('perf: the queue is empty after a scan', [w.api.selfSize(), w.api.deepSize()], [0, 0]);

      // The pop-up case: content is injected INTO an already-present panel that
      // then overflows; the panel is an ancestor of the mutation, not a new node.
      var panel = w.el('panel', { parent: body, oy: 'auto', ch: 500, sh: 900 }), mbody = w.el('modalBody', { parent: panel }), tile = w.el('tile', { parent: mbody });
      w.api.onMutations([w.added(mbody, [tile])]); w.flush();
      eq('perf: content injected into an overflowing panel still attaches that panel\'s scrollbar', w.hosts, ['panel']);
      w.api.onMutations([w.added(mbody, [w.el('tile2', { parent: mbody })])]); w.flush();
      eq('perf: a host is attached once, however often it changes', w.hosts, ['panel']);
      w.api.onMutations([w.removed(mbody, [tile])]); w.flush();
      eq('perf: removing content re-checks ancestors without attaching twice', w.hosts, ['panel']);
      var late = w.el('late', { parent: body, oy: 'scroll', ch: 100, sh: 400 });
      w.api.schedule(true); w.flush();
      eq('perf: load / resize run one full sweep that finds hosts mutations could not', [w.sweeps(), w.hosts.indexOf('late') !== -1], [1, true]);
      var ghost = w.el('ghost', { parent: body, oy: 'auto', ch: 10, sh: 99 }); ghost.isConnected = false;
      w.api.onMutations([w.added(body, [ghost])]); w.flush();
      eq('perf: detached elements are never given a scrollbar', w.hosts.indexOf('ghost'), -1);
      var bar = w.el('bar', { parent: body, cls: 'cscroll', oy: 'auto', ch: 10, sh: 99 });
      w.api.onMutations([w.added(body, [bar])]); w.flush();
      eq('perf: our own scrollbars are never scrolled hosts', w.hosts.indexOf('bar'), -1);
    }

    /* ------------------------------------- populate motion (real code, fakes) */

    var popSlice = between(source, "  // Is any part of `el` inside the viewport right now?", '  // ---------- Scroll anchor ----------');
    ok('perf: populate source is where the guards expect it', !!popSlice);
    if (popSlice) {
      var popWorld = function (flags) {
        flags = flags || {};
        var now = 0, queue = [], next = 1, win = { innerHeight: 800 };
        function classes(initial) { var set = {}; (initial || []).forEach(function (c) { set[c] = true; }); return { add: function (c) { set[c] = true; }, remove: function (c) { delete set[c]; }, contains: function (c) { return !!set[c]; } }; }
        function box(top, height, initial) {
          return { rect: { top: top, bottom: top + height, width: 300, height: height }, classList: classes(initial), offsetWidth: 1,
            getBoundingClientRect: function () { return this.rect; }, animate: function () { var a = { onfinish: null, oncancel: null }; box.animations.push(a); return a; } };
        }
        box.animations = [];
        var api = new Function('LOW_POWER', 'REDUCED_MOTION', 'POP_EASE', 'window', 'setTimeout', 'clearTimeout',
          popSlice + '\nreturn { inViewport: inViewport, popRefresh: popRefresh, popReveal: popReveal };')(
          !!flags.lowPower, !!flags.reduced, 'ease', win,
          function (fn, ms) { var id = next++; queue.push({ id: id, fn: fn, at: now + ms }); return id; },
          function (id) { queue = queue.filter(function (q) { return q.id !== id; }); });
        return { api: api, box: box, win: win, animations: box.animations,
          advance: function (ms) { now += ms; var due = queue.filter(function (q) { return q.at <= now; }); queue = queue.filter(function (q) { return q.at > now; }); due.forEach(function (q) { q.fn(); }); },
          pendingTimers: function () { return queue.length; } };
      };

      var pw = popWorld();
      var list = pw.box(300, 120);
      pw.api.popRefresh(list);
      eq('perf: an on-screen block gets the populate class', list.classList.contains('populated-in'), true);
      pw.advance(599);
      eq('perf: ...which is still there just before the run ends', list.classList.contains('populated-in'), true);
      pw.advance(1);
      eq('perf: ...and is taken off again once the content has landed (no finished animation left attached)', [list.classList.contains('populated-in'), pw.pendingTimers()], [false, 0]);
      var below = pw.box(2000, 120);
      pw.api.popRefresh(below);
      eq('perf: a block below the fold gets no animation at all (content-visibility skips it and the animation never ends)', [below.classList.contains('populated-in'), pw.pendingTimers()], [false, 0]);
      var above = pw.box(-400, 100);
      pw.api.popRefresh(above);
      eq('perf: a block scrolled past gets none either', above.classList.contains('populated-in'), false);
      var edge = pw.box(790, 100);
      pw.api.popRefresh(edge);
      eq('perf: a block just entering the viewport is on screen', edge.classList.contains('populated-in'), true);
      var gone = pw.box(100, 100); gone.rect.width = 0;
      pw.api.popRefresh(gone);
      eq('perf: a display:none block is never animated', gone.classList.contains('populated-in'), false);
      pw.advance(1000);
      var again = pw.box(100, 50);
      pw.api.popRefresh(again); pw.advance(400); pw.api.popRefresh(again); pw.advance(300);
      eq('perf: a restart while a run is in flight keeps the class (the old timer is cancelled)', again.classList.contains('populated-in'), true);
      pw.advance(300);
      eq('perf: ...and clears it 600ms after the LAST start', again.classList.contains('populated-in'), false);
      var calm = popWorld({ lowPower: true }), calmBox = calm.box(100, 50);
      calm.api.popRefresh(calmBox);
      var still = popWorld({ reduced: true }), stillBox = still.box(100, 50);
      still.api.popRefresh(stillBox);
      eq('perf: low-power and reduced-motion keep the instant swap', [calmBox.classList.contains('populated-in'), stillBox.classList.contains('populated-in')], [false, false]);

      // popReveal: the card height glide only runs for a card the reader can see.
      function reveal(world, cardTop) {
        var card = world.box(cardTop, 120), loaded = world.box(cardTop + 20, 0, ['hidden']), loading = world.box(cardTop + 20, 20);
        loaded.animate = function () { return {}; }; // Web Animations present
        loaded.closest = function () { return card; };
        loaded.classList.remove = (function (orig) { return function (c) { orig(c); if (c === 'hidden') { card.rect.height = 300; card.rect.bottom = card.rect.top + 300; loaded.rect.height = 100; } }; })(loaded.classList.remove);
        world.win.__kazuPopAnim = 0;
        world.api.popReveal(loaded, loading);
        return { card: card, loaded: loaded, loading: loading };
      }
      var vis = popWorld(), r1 = reveal(vis, 200);
      eq('perf: a visible card glides: one height animation from the loading to the loaded height', [vis.animations.length, vis.win.__kazuPopAnim, r1.loading.classList.contains('hidden'), r1.loaded.classList.contains('hidden')], [1, 1, true, false]);
      vis.animations[0].onfinish();
      eq('perf: ...and the in-flight counter returns to zero when it ends', vis.win.__kazuPopAnim, 0);
      var hid = popWorld(), r2 = reveal(hid, 3000);
      eq('perf: a card below the fold takes its final height with no glide and no animation counter', [hid.animations.length, hid.win.__kazuPopAnim, r2.loaded.classList.contains('hidden'), r2.loading.classList.contains('hidden'), r2.loaded.classList.contains('populated-in')], [0, 0, false, true, false]);
    }
  }

  global.KazuPerfGuards = { run: run };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuPerfGuards;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      var ok = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      var eq = function (name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + ' != ' + JSON.stringify(expected)); };
      var read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n'); };
      run(global.KazuLib, read('script.js'), read('style.css'), read('index.html'), ok, eq);
      console.log('Perf guards: ' + pass + ' passed, ' + fail + ' failed');
      process.exit(fail ? 1 : 0);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
