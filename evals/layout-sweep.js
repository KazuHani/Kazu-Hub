/* ============================================================================
   layout-sweep.js: real-browser layout eval for Kazu Hub (periodic, not a gate).
   ----------------------------------------------------------------------------
   Loads the real page in headless Chrome (plain Node >= 22, no dependencies)
   with every live API answered from fixtures (chrome-harness.js), so every
   card is filled in, and the real web fonts by default. Then it resizes the
   window through every width from 280px to 1920px in 8px steps, the way
   dragging a window edge does, and measures the page at each one with
   evals/fluid-layout.js (measure), and the four pop-ups every 80px.

   It fails (exit 1) on anything evals/fluid-layout.js analyse reports:
     - text or a picture that shrinks as the window widens, or grows faster
       than the window (a jump at a breakpoint)
     - text under 12px from 390px wide (10px below that)
     - a grid row left with an orphan that is neither centred nor full width
     - sideways page scroll, text spilling its box, a stat value or PC spec
       outside its card
   and when fewer roles than expected were on the page (fixtures not loading),
   and when a pop-up has to scroll on a short screen (FIT_SIZES: laptops with
   browser chrome down to a 320 x 568 phone).

   Passes: mouse (desktop window, 280-1920px) and touch (phone/tablet
   emulation: overlay scrollbars, coarse pointer, 280-1366px), each in English
   and Japanese, on a plain day and in October (Halloween hero decorations).

   Usage:   node evals/layout-sweep.js                 every pass
            node evals/layout-sweep.js --quick         16px steps, English only
            node evals/layout-sweep.js --fonts stub    offline: system fonts
            node evals/layout-sweep.js --out run.json  keep every snapshot
            node evals/layout-sweep.js --from 300 --to 900 --step 4
   The page is served from the working copy (--root to measure another).
   ========================================================================== */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var H = require('./chrome-harness.js');
var F = require('./fluid-layout.js');

var argv = process.argv.slice(2);
function arg(name, def) {
  var i = argv.indexOf('--' + name);
  if (i === -1) return def;
  var v = argv[i + 1];
  return v === undefined || v.indexOf('--') === 0 ? true : v;
}
var QUICK = !!arg('quick', false);
var OPT = {
  root: path.resolve(arg('root', path.join(__dirname, '..'))),
  fonts: arg('fonts', 'real'),
  from: +arg('from', 280), to: +arg('to', 1920), step: +arg('step', QUICK ? 16 : 8),
  popStep: +arg('pop-step', 80),
  out: arg('out', ''),
  date: '2026-08-12T10:00:00Z' // a plain summer day: daylight, no season of its own
};
var PASSES = [
  { name: 'mouse, English', mobile: false, touch: false, max: OPT.to, query: '' },
  { name: 'touch, English', mobile: true, touch: true, max: Math.min(OPT.to, 1366), query: '' },
  { name: 'mouse, English, Halloween', mobile: false, touch: false, max: OPT.to, query: '&season=halloween' },
  { name: 'mouse, Japanese', mobile: false, touch: false, max: OPT.to, query: '&lang=ja' },
  { name: 'touch, Japanese', mobile: true, touch: true, max: Math.min(OPT.to, 1366), query: '&lang=ja' }
].filter(function (p) { return !QUICK || !/Japanese/.test(p.name); });
// Roles the fixtures fill: if fewer show up, the run measured a half-loaded page.
var MIN_TEXT_ROLES = 40, MIN_POPUP_ROLES = 18;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function widths(from, to, step) { var out = []; for (var w = from; w <= to; w += step) out.push(w); if (out[out.length - 1] !== to) out.push(to); return out; }

var MEASURE = '(' + F.measure.toString() + ')';
function measureExpr(modal) { return MEASURE + '(window, ' + JSON.stringify(F.ROLES) + ', ' + !!modal + ')'; }

async function resize(page, pass, w) {
  await page.call('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: pass.mobile });
  await page.eval('document.body.offsetWidth');
}

// Settle the page so what is measured is the layout, not an entrance: finish
// every running animation, reveal every scroll-reveal block, and render the
// below-the-fold cards (content-visibility) so their boxes are real.
var SETTLE = '(function () {' +
  'document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });' +
  'document.querySelectorAll(".scroll-reveal").forEach(function (el) { el.style.transition = "none"; el.classList.add("is-visible"); });' +
  'document.querySelectorAll(".card, .footer").forEach(function (el) { el.style.contentVisibility = "visible"; });' +
  'return true; })()';

async function runPass(chrome, srv, fx, pass) {
  var device = { width: 1280, height: 900, dpr: 1, mobile: pass.mobile, touch: pass.touch };
  var page = await H.openPage(chrome, srv, { device: device, fx: fx, fonts: OPT.fonts, init: H.mockScript({ now: Date.parse(OPT.date), lanyard: fx.lanyardData }) });
  try {
    await page.goto('http://127.0.0.1:' + srv.port + '/index.html?weather=none' + pass.query);
    // the staged boot fills the live cards over several seconds
    var want = ['.spotify-song', '.mal-title', '.lb-title', '.music-track-name', '.recent-game-name', '.stat-value'];
    for (var i = 0; i < 60; i++) {
      var have = await page.eval('(' + JSON.stringify(want) + ').filter(function (s) { var e = document.querySelector(s); return e && e.getClientRects().length; }).length');
      if (have === want.length) break;
      await sleep(500);
    }
    if (OPT.fonts === 'real') await page.eval('document.fonts.ready.then(function () { return true; })');
    await page.eval(SETTLE);
    var list = widths(OPT.from, pass.max, OPT.step), snaps = [], pops = [];
    for (var k = 0; k < list.length; k++) {
      await resize(page, pass, list[k]);
      snaps.push(await page.eval(measureExpr(false)));
    }
    var popList = widths(Math.max(OPT.from, 320), pass.max, OPT.popStep);
    for (var j = 0; j < popList.length; j++) {
      await resize(page, pass, popList[j]);
      pops.push(await page.eval('(function () {' +
        'var snap = null;' +
        '["time", "weather", "age", "bday"].forEach(function (key) {' +
        '  document.querySelector(".stat-card[data-modal=\\"" + key + "\\"]").click();' +
        '  document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });' +
        '  var s = ' + measureExpr(true) + ';' +
        '  if (!snap) snap = s; else Object.keys(s.text).forEach(function (r) { if (s.text[r] != null) snap.text[r] = s.text[r]; });' +
        '  var c = document.querySelector(".modal-close"); if (c) c.click();' +
        '  document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} });' +
        '});' +
        'return snap; })()'));
    }
    return { snaps: snaps, pops: pops };
  } finally { await page.close(); }
}

// Short screens: each pop-up must fit without scrolling (laptops with browser
// chrome, small phones). The weather pop-up's globe shrinks to make room.
var FIT_SIZES = [[1440, 900], [1366, 657], [1280, 600], [820, 1180], [390, 844], [375, 667], [360, 640], [320, 568]];
async function runFit(chrome, srv, fx, query) {
  var bad = [];
  for (var i = 0; i < FIT_SIZES.length; i++) {
    var w = FIT_SIZES[i][0], h = FIT_SIZES[i][1], mobile = w < 800;
    var page = await H.openPage(chrome, srv, { device: { width: w, height: h, dpr: 1, mobile: mobile, touch: mobile }, fx: fx, fonts: OPT.fonts, init: H.mockScript({ now: Date.parse(OPT.date), lanyard: fx.lanyardData }) });
    try {
      await page.goto('http://127.0.0.1:' + srv.port + '/index.html?weather=none' + query);
      await sleep(2500);
      if (OPT.fonts === 'real') await page.eval('document.fonts.ready.then(function () { return true; })');
      var r = await page.eval('(function () {' +
        'var fin = function () { document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) {} }); }, out = [];' +
        '["time", "weather", "age", "bday"].forEach(function (k) {' +
        '  document.querySelector(".stat-card[data-modal=\\"" + k + "\\"]").click(); fin();' +
        '  var p = document.querySelector(".modal-overlay:not([hidden]) .modal-panel");' +
        '  if (p && p.scrollHeight > p.clientHeight + 1) out.push(k + " scrolls " + (p.scrollHeight - p.clientHeight) + "px");' +
        '  var c = document.querySelector(".modal-close"); if (c) c.click(); fin();' +
        '});' +
        'return out; })()');
      r.forEach(function (x) { bad.push('pop-up does not fit ' + w + 'x' + h + ': ' + x); });
    } finally { await page.close(); }
  }
  return bad;
}

function seen(snaps, kind) {
  if (!snaps.length) return 0;
  return Object.keys(snaps[0][kind] || {}).filter(function (r) { return snaps.some(function (s) { return s[kind][r] != null; }); }).length;
}

// A small table of what a reader sees: key sizes at familiar widths.
function table(snaps) {
  var at = [320, 390, 432, 592, 768, 1024, 1440].map(function (w) {
    return snaps.reduce(function (best, s) { return Math.abs(s.w - w) < Math.abs(best.w - w) ? s : best; }, snaps[0]);
  });
  var rows = [['.title', 'text'], ['.quote-text', 'text'], ['.stat-label', 'text'], ['.stat-value', 'card'], ['.stat-sub', 'text'], ['.section-title', 'text'],
    ['.presence-name', 'text'], ['.info-pill-value', 'text'], ['.mal-title', 'text'], ['.social-name', 'text'], ['.story-desc', 'text'], ['.pfp', 'boxes']];
  var line = function (cells) { return '  ' + cells.map(function (c, i) { return i ? String(c).padStart(7) : String(c).padEnd(16); }).join(''); };
  console.log(line(['width'].concat(at.map(function (s) { return s.w; }))));
  rows.forEach(function (r) { console.log(line([r[0]].concat(at.map(function (s) { var v = s[r[1]][r[0]]; return v == null ? '-' : Math.round(v * 10) / 10; })))); });
}

(async function main() {
  var srv = await H.startServer(OPT.root);
  var chrome = await H.launchChrome({ gpu: 'soft' });
  var fx = H.fixtures({ date: OPT.date, weather: 'rain', presence: 'active' });
  var all = {}, failures = 0;
  console.log('Kazu Hub layout sweep | ' + OPT.from + '-' + OPT.to + 'px every ' + OPT.step + 'px | pop-ups every ' + OPT.popStep + 'px | fonts ' + OPT.fonts + (QUICK ? ' | quick' : ''));
  try {
    for (var i = 0; i < PASSES.length; i++) {
      var pass = PASSES[i];
      var r = await runPass(chrome, srv, fx, pass);
      var probs = F.analyse(r.snaps), popProbs = F.analyse(r.pops);
      var textRoles = seen(r.snaps, 'text'), popRoles = seen(r.pops, 'text');
      var short = [];
      if (textRoles < MIN_TEXT_ROLES) short.push('only ' + textRoles + ' of the page text roles were on the page (want ' + MIN_TEXT_ROLES + '+): fixtures did not load?');
      if (popRoles < MIN_POPUP_ROLES) short.push('only ' + popRoles + ' pop-up text roles measured (want ' + MIN_POPUP_ROLES + '+)');
      var bad = probs.concat(popProbs.map(function (p) { return 'pop-up: ' + p; }), short);
      failures += bad.length;
      console.log('\n== ' + pass.name + ' | ' + r.snaps.length + ' widths, ' + textRoles + ' text roles, ' + seen(r.snaps, 'boxes') + ' pictures | ' + r.pops.length + ' pop-up widths, ' + popRoles + ' roles ==');
      table(r.snaps);
      if (bad.length) { console.log('  ' + bad.length + ' problem(s):'); bad.slice(0, 40).forEach(function (p) { console.log('    ' + p); }); if (bad.length > 40) console.log('    ... +' + (bad.length - 40) + ' more'); }
      else console.log('  no problems');
      all[pass.name] = r;
    }
    var langs = QUICK ? [['English', '']] : [['English', ''], ['Japanese', '&lang=ja']];
    for (var li = 0; li < langs.length; li++) {
      var fit = await runFit(chrome, srv, fx, langs[li][1]);
      failures += fit.length;
      console.log('\n== pop-ups on short screens, ' + langs[li][0] + ' | ' + FIT_SIZES.map(function (s) { return s.join('x'); }).join(', ') + ' ==');
      if (fit.length) fit.forEach(function (p) { console.log('    ' + p); }); else console.log('  every pop-up fits without scrolling');
    }
  } finally {
    await chrome.close();
    srv.server.close();
  }
  var outFile = OPT.out && OPT.out !== true ? OPT.out : path.join(os.tmpdir(), 'kazu-layout-sweep-' + Date.now() + '.json');
  fs.writeFileSync(outFile, JSON.stringify({ opts: OPT, passes: all }, null, 1));
  console.log('\nsnapshots: ' + outFile);
  console.log(failures ? '\nLAYOUT SWEEP FAILED: ' + failures + ' problem(s)' : '\nlayout sweep: no problems');
  process.exitCode = failures ? 1 : 0;
})().catch(function (e) { console.error(e); process.exit(1); });
