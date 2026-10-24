/* ============================================================================
   sky-seam.js: real-browser eval for the fold seam (periodic, not a gate).
   ----------------------------------------------------------------------------
   The sunset, the scenery (sun, moon, horizon glow) and the cloud canvas are
   anchored to the top of the page. Each one used to end at 100vh, so the
   moment you scrolled, the sky stopped in a hard horizontal line across the
   page (Kazu's screenshot, 24 Oct 2026, 16:50: a band right through the
   "Right now" cards). evals/sky-edges.js gates the CSS and the cloud maths;
   this measures the pixels Chrome actually paints.

   Loads the real page in headless Chrome (plain Node >= 22, no dependencies;
   chrome-harness.js), every API answered from fixtures, the clock pinned near
   sunset. It hides everything but the sky layers, scrolls a fifth of a
   screen, takes a screenshot and decodes it (PNG, zlib only). Across eight
   vertical bands it compares the mean colour of the last row the first screen
   covered with the row under it: a seam is a jump of tens of levels there,
   a smooth sky well under one. Fails (exit 1) on a jump over MAX_JUMP in any
   band, or when a desktop run never drew the clouds (nothing measured).

   Runs: the moment of the screenshot (golden glow, 1920 x 900), 20 minutes
   before and 15 after sunset (both palettes), a summer sunset, short laptop
   windows (where the glow and the clouds also reached the edge) and a phone.

   Usage:   node evals/sky-seam.js                 every run
            node evals/sky-seam.js --out shots     keep each screenshot
            node evals/sky-seam.js --root <dir>    measure another copy (a
                                                   git archive of an old commit)
   ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var H = require('./chrome-harness.js');
require('../lib.js');
var L = globalThis.KazuLib;

var argv = process.argv.slice(2);
function arg(name, def) {
  var i = argv.indexOf('--' + name);
  if (i === -1) return def;
  var v = argv[i + 1];
  return v === undefined || v.indexOf('--') === 0 ? true : v;
}
var OPT = { root: path.resolve(arg('root', path.join(__dirname, '..'))), out: arg('out', '') };
var MAX_JUMP = 2.5;   // levels (of 255) between two adjacent rows, any channel, any band
var BANDS = 8;
var SCROLL = 0.2;     // of a screen

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// The UTC instant a UK wall-clock minute falls on (date: 'YYYY-MM-DD').
function ukInstant(date, ukMinutes) {
  var t0 = Date.parse(date + 'T00:00:00Z') - 2 * 3600000;
  for (var t = t0; t < t0 + 30 * 3600000; t += 60000) {
    var w = L.ukWallParts(new Date(t)), ymd = w.year + '-' + String(w.month + 1).padStart(2, '0') + '-' + String(w.day).padStart(2, '0');
    if (ymd === date && w.hours * 60 + w.minutes === ukMinutes) return t;
  }
  throw new Error('no UK minute ' + ukMinutes + ' on ' + date);
}
function doy(date) { var d = new Date(date + 'T00:00:00Z'); return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); }
function nearSunset(date, offset) { return ukInstant(date, L.sunTimesUK(doy(date)).set + offset); }

var DESK = function (w, h) { return { width: w, height: h, dpr: 1, mobile: false, touch: false }; };
var RUNS = [
  { name: 'the screenshot: 24 Oct 16:50, Halloween, overcast, 1920 x 900', now: Date.parse('2026-10-24T15:50:00Z'), device: DESK(1920, 900), clouds: true },
  { name: 'Halloween, 20 min before sunset, 1366 x 768', now: nearSunset('2026-10-24', -20), device: DESK(1366, 768), clouds: true },
  { name: 'Halloween, 15 min after sunset (rose palette), 1600 x 900', now: nearSunset('2026-10-24', 15), device: DESK(1600, 900), clouds: true },
  { name: 'summer, 20 min before sunset, 1440 x 800', now: nearSunset('2026-08-12', -20), device: DESK(1440, 800), clouds: true },
  { name: 'short laptop window, at sunset, 1280 x 540', now: nearSunset('2026-08-12', 0), device: DESK(1280, 540), clouds: true },
  { name: 'short window, Halloween, 1024 x 420', now: nearSunset('2026-10-24', -10), device: DESK(1024, 420), clouds: true },
  { name: 'phone, Halloween, 20 min before sunset, 390 x 844', now: nearSunset('2026-10-24', -20), device: { width: 390, height: 844, dpr: 1, mobile: true, touch: true }, clouds: false }
];

/* ------------------------------------------------------------- PNG decode */

function paeth(a, b, c) {
  var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
// 8-bit RGB or RGBA, not interlaced (what Chrome's screenshots are).
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  var pos = 8, w = 0, h = 0, bpp = 0, idat = [];
  while (pos < buf.length) {
    var len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('unsupported PNG (depth ' + data[8] + ', colour ' + data[9] + ', interlace ' + data[12] + ')');
      bpp = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  var raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(stride * h);
  for (var y = 0, r = 0; y < h; y++) {
    var f = raw[r++], row = y * stride, prev = row - stride;
    for (var x = 0; x < stride; x++) {
      var a = x >= bpp ? out[row + x - bpp] : 0, b = y ? out[prev + x] : 0, c = x >= bpp && y ? out[prev + x - bpp] : 0, v = raw[r++];
      out[row + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  return { w: w, h: h, bpp: bpp, px: out };
}

// Mean [r, g, b] of row y over columns [x0, x1).
function rowMean(img, y, x0, x1) {
  var s = [0, 0, 0], o = y * img.w * img.bpp;
  for (var x = x0; x < x1; x++) { var i = o + x * img.bpp; s[0] += img.px[i]; s[1] += img.px[i + 1]; s[2] += img.px[i + 2]; }
  return s.map(function (v) { return v / (x1 - x0); });
}
// The largest band-mean jump between row y - 1 and row y.
function jumpAt(img, y, cols) {
  var worst = { v: 0, band: -1 }, bw = cols / BANDS;
  for (var b = 0; b < BANDS; b++) {
    var x0 = Math.round(b * bw), x1 = Math.round((b + 1) * bw), p = rowMean(img, y - 1, x0, x1), q = rowMean(img, y, x0, x1);
    for (var k = 0; k < 3; k++) { var d = Math.abs(q[k] - p[k]); if (d > worst.v) worst = { v: d, band: b }; }
  }
  return worst;
}

/* --------------------------------------------------------------------- run */

// Everything but the sky layers goes invisible (layout and scroll height stay).
var HIDE = 'body > :not(.sunset-sky):not(.sakura-scene):not(.weather-fx) { visibility: hidden !important; } .sky-curve-guide { display: none !important; }';

async function measure(chrome, srv, run) {
  var fx = H.fixtures({ date: new Date(run.now).toISOString(), weather: 'cloudy', presence: 'active' });
  var page = await H.openPage(chrome, srv, { device: run.device, fx: fx, fonts: 'stub', init: H.mockScript({ now: run.now - run.now % 60000, lanyard: fx.lanyardData }) });
  try {
    await page.goto('http://127.0.0.1:' + srv.port + '/index.html' + (run.clouds ? '?weather=clouds:1' : ''));
    var drawn = false;
    if (run.clouds) { // the canvas mounts once the page is idle, then the clouds fade in (~2.5 s)
      for (var i = 0; i < 60 && !drawn; i++) { await sleep(250); drawn = await page.eval('!!document.querySelector(".weather-fx--clouds")'); }
      if (drawn) await sleep(4000);
    } else await sleep(2500);
    var state = await page.eval('(function () {' +
      '  var s = document.createElement("style"); s.textContent = ' + JSON.stringify(HIDE) + '; document.head.appendChild(s);' +
      '  window.scrollTo({ top: Math.round(innerHeight * ' + SCROLL + '), behavior: "instant" });' +
      '  var sky = document.querySelector(".sunset-sky");' +
      '  return { scroll: Math.round(scrollY), vh: innerHeight, cols: document.documentElement.clientWidth, sunset: +getComputedStyle(sky).opacity, sky: Math.round(sky.getBoundingClientRect().height) };' +
      '})()');
    await page.eval('new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(r, 300); }); }); })');
    var shot = await page.call('Page.captureScreenshot', { format: 'png' });
    var png = Buffer.from(shot.data, 'base64');
    if (OPT.out) { fs.mkdirSync(OPT.out, { recursive: true }); fs.writeFileSync(path.join(OPT.out, run.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') + '.png'), png); }
    var img = decodePng(png), fold = state.vh - state.scroll;
    // the scrollbar column is left out; the rows around the fold give the sky's own slope
    var at = jumpAt(img, fold, state.cols), near = 0;
    for (var y = fold - 40; y < fold + 40; y++) if (y !== fold && y > 0 && y < img.h) near = Math.max(near, jumpAt(img, y, state.cols).v);
    return { state: state, fold: fold, jump: at, near: near, drawn: drawn };
  } finally { await page.close(); }
}

(async function main() {
  var srv = await H.startServer(OPT.root);
  var chrome = await H.launchChrome({ gpu: 'soft' });
  var problems = [];
  try {
    console.log('Fold seam, ' + OPT.root + '\n');
    console.log(pad('run', 64) + pad('sunset', 8) + pad('fold', 7) + pad('jump', 13) + 'nearby');
    for (var i = 0; i < RUNS.length; i++) {
      var run = RUNS[i], r = await measure(chrome, srv, run);
      var verdict = r.jump.v > MAX_JUMP ? 'SEAM' : 'ok';
      console.log(pad(run.name, 64) + pad(r.state.sunset.toFixed(2), 8) + pad(r.fold + 'px', 7) + pad(r.jump.v.toFixed(1) + ' (band ' + r.jump.band + ')', 13) + r.near.toFixed(1) + '  ' + verdict);
      if (r.jump.v > MAX_JUMP) problems.push(run.name + ': the sky jumps ' + r.jump.v.toFixed(1) + ' levels at the fold (band ' + r.jump.band + ' of ' + BANDS + '), ' + r.near.toFixed(1) + ' at most in the rows around it');
      if (run.clouds && !r.drawn) problems.push(run.name + ': the cloud canvas never mounted, so the clouds were not measured');
    }
  } finally {
    await chrome.close();
    srv.server.close();
  }
  console.log('');
  if (problems.length) { problems.forEach(function (p) { console.log('FAIL ' + p); }); process.exitCode = 1; }
  else console.log('PASS no sky layer stops in a line at the fold (' + RUNS.length + ' runs, max jump ' + MAX_JUMP + ')');
})().catch(function (e) { console.error(e); process.exitCode = 1; });

function pad(s, n) { s = String(s); return s.length >= n ? s + ' ' : s + new Array(n - s.length + 1).join(' '); }
