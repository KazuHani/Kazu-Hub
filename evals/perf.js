/* ============================================================================
   perf.js: real-browser performance eval for Kazu Hub (periodic, not a gate).
   ----------------------------------------------------------------------------
   Drives headless Chrome over the DevTools protocol (plain Node >= 22, no
   dependencies, no network) against a local static server, with every live
   API mocked, the UK clock pinned and the Lanyard socket faked, so each run
   measures the page rather than the weather. What it reports, per device:

     idle     CPU seconds per wall second for the renderer / GPU / browser
              processes while the page just sits there (the battery and heat
              number), plus main-thread counters: style recalcs, layouts,
              script time, long tasks and the CSS transitions still running.
     scroll   frame pacing (p50 / p95 / p99, missed frames) through a scripted
              scroll of the whole page, wheel on desktop, touch on a phone.
     modal    frame pacing while a stat card flies open and closed.
     load     first contentful paint, LCP, long-task time, DOM size, bytes.

   Devices: desktop (1440x900, mouse), tablet (820x1180, touch, full effects),
   phone (390x844 at 3x, touch, 4x CPU throttle: the page's low-power mode).
   GPU work runs in software (SwiftShader) by default so pixel cost shows up as
   measurable CPU time in the GPU process; --gpu hard keeps the real GPU.

   Usage:   node evals/perf.js                 every device, every scenario
            node evals/perf.js --devices phone --scenarios idle,scroll
            node evals/perf.js --quick         shorter windows, for iterating
            node evals/perf.js --out run.json  keep the raw numbers
            node evals/perf.js --compare base.json   delta table vs a saved run
            node evals/perf.js --budget        exit 1 when a budget is blown

   Pass thresholds (BUDGETS below) are machine-independent counters, not wall
   time: idle style recalcs and layouts per second, running transitions, long
   tasks, and a generous idle-CPU ceiling. The pure statistics helpers are
   exported for tests.js (this file only runs a browser when executed
   directly).
   ========================================================================== */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var childProcess = require('child_process');

/* ---------------------------------------------------------------- statistics
   Pure and deterministic: exported for tests.js. */

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  var rank = (p / 100) * (sorted.length - 1);
  var lo = Math.floor(rank), hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function median(values) {
  var s = values.slice().sort(function (a, b) { return a - b; });
  return percentile(s, 50);
}

// Frame deltas (ms between consecutive requestAnimationFrame callbacks) to the
// numbers a human cares about. `refresh` is the nominal frame time; a frame
// "misses" when it takes 1.5x that or more, and `dropped` counts the vsyncs
// that went by with nothing new on screen.
function frameStats(deltas, refresh) {
  refresh = refresh || 1000 / 60;
  var d = deltas.filter(function (x) { return x > 0 && isFinite(x); });
  if (!d.length) return { frames: 0, p50: 0, p95: 0, p99: 0, max: 0, missed: 0, dropped: 0, fps: 0 };
  var s = d.slice().sort(function (a, b) { return a - b; });
  var total = d.reduce(function (a, b) { return a + b; }, 0);
  var missed = 0, dropped = 0;
  for (var i = 0; i < d.length; i++) {
    if (d[i] >= refresh * 1.5) { missed++; dropped += Math.max(0, Math.round(d[i] / refresh) - 1); }
  }
  return {
    frames: d.length,
    p50: round(percentile(s, 50), 2), p95: round(percentile(s, 95), 2), p99: round(percentile(s, 99), 2),
    max: round(s[s.length - 1], 2), missed: missed, dropped: dropped,
    fps: round(d.length / (total / 1000), 1)
  };
}

function round(n, places) {
  var f = Math.pow(10, places == null ? 2 : places);
  return Math.round(n * f) / f;
}

// Per-process CPU seconds consumed between two SystemInfo.getProcessInfo
// snapshots, grouped by process type. The page's own renderer is the busiest
// one, so `renderer` is the maximum, not the sum (other tabs idle at ~0).
function cpuDelta(before, after, seconds) {
  var prev = {};
  (before || []).forEach(function (p) { prev[p.id] = p.cpuTime; });
  var out = { renderer: 0, gpu: 0, browser: 0, network: 0 };
  (after || []).forEach(function (p) {
    var d = Math.max(0, p.cpuTime - (prev[p.id] || 0));
    if (p.type === 'renderer') out.renderer = Math.max(out.renderer, d);
    else if (p.type === 'GPU') out.gpu += d;
    else if (p.type === 'browser') out.browser += d;
    else if (/network/i.test(p.type)) out.network += d;
  });
  var res = {};
  Object.keys(out).forEach(function (k) { res[k] = round(out[k] / seconds, 4); });
  res.total = round(res.renderer + res.gpu + res.browser + res.network, 4);
  return res;
}

// Delta of two Performance.getMetrics snapshots (arrays of {name, value}),
// durations in seconds, counts as plain numbers, all divided by the window.
function metricsDelta(before, after, seconds) {
  var a = {}, b = {}, out = {};
  (before || []).forEach(function (m) { a[m.name] = m.value; });
  (after || []).forEach(function (m) { b[m.name] = m.value; });
  ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'ThreadTime',
    'LayoutCount', 'RecalcStyleCount', 'V8CompileDuration'].forEach(function (k) {
    if (b[k] === undefined) return;
    out[k] = round((b[k] - (a[k] || 0)) / seconds, 4);
  });
  ['Nodes', 'JSHeapUsedSize', 'JSEventListeners'].forEach(function (k) { if (b[k] !== undefined) out[k] = b[k]; });
  return out;
}

/* ------------------------------------------------------------------ budgets */

// Machine-independent ceilings an idle page must stay under. Counters per
// second, not milliseconds: they hold on a fast desktop and a slow CI box.
var BUDGETS = {
  idle: {
    transitionsRunning: 0,          // no always-on CSS transition / animation churn at rest
    RecalcStyleCount: 6,            // style recalcs per second (the 1 Hz clock is the floor)
    LayoutCount: 6,
    longTasksPerMin: 4,
    'cpu.total': 0.12               // generous ceiling: 12% of one core, software GPU included
  }
};

function checkBudget(device, scenario, result) {
  var b = BUDGETS[scenario];
  if (!b || !result) return [];
  var fails = [];
  Object.keys(b).forEach(function (k) {
    var v = k.split('.').reduce(function (o, part) { return o == null ? o : o[part]; }, result);
    if (v == null) return;
    if (v > b[k]) fails.push(device + ' ' + scenario + ': ' + k + ' = ' + v + ' > budget ' + b[k]);
  });
  return fails;
}

module.exports = {
  percentile: percentile, median: median, frameStats: frameStats, cpuDelta: cpuDelta,
  metricsDelta: metricsDelta, checkBudget: checkBudget, BUDGETS: BUDGETS, round: round
};
if (require.main !== module) return;

/* ------------------------------------------------------------------ CLI args */

var argv = process.argv.slice(2);
function arg(name, def) {
  var i = argv.indexOf('--' + name);
  if (i === -1) return def;
  var v = argv[i + 1];
  return v === undefined || v.indexOf('--') === 0 ? true : v;
}
var OPT = {
  devices: String(arg('devices', 'desktop,phone')).split(','),
  scenarios: String(arg('scenarios', 'load,idle,scroll,modal')).split(','),
  quick: !!arg('quick', false),
  out: arg('out', ''),
  compare: arg('compare', ''),
  budget: !!arg('budget', false),
  gpu: arg('gpu', 'soft'),
  date: arg('date', '2026-08-12T10:00:00Z'),   // a plain summer day: no season theme, no blossom, daylight
  presence: arg('presence', 'active'),         // active (game + Spotify) | idle
  weather: arg('weather', 'clear'),            // clear | rain | snow | cloudy
  runs: +arg('runs', 1),
  verbose: !!arg('verbose', false),
  // Experiments: CSS / JS injected into every page, to try a fix before
  // writing it into the source. --css 'body{transition:none!important}'
  css: arg('css', ''),
  js: arg('js', ''),
  pre: arg('pre', ''),            // JS run before any page script (to stub APIs)
  cpu: +arg('cpu', 0),           // override the device's CPU throttle (1 = none)
  shot: arg('shot', ''),          // after the idle warm-up, save a PNG of the viewport here (visual checks)
  shotTo: arg('shot-to', ''),     // ...scrolled so this selector is centred first
  trace: !!arg('trace', false),  // add a Chrome trace summary (top events per thread) to idle / scroll / modal
  traceDetail: !!arg('trace-detail', false)   // ...with event counts and a longer list
};
if (OPT.traceDetail) OPT.trace = true;

var ROOT = path.resolve(arg('root', path.join(__dirname, '..')));
var PAGE = arg('page', 'index.html');   // page to load under ROOT (experiments use tiny pages)
var CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

var DEVICES = {
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false, touch: false, cpu: 1, label: 'desktop 1440x900' },
  tablet: { width: 820, height: 1180, dpr: 2, mobile: true, touch: true, cpu: 2, label: 'tablet 820x1180 touch' },
  phone: { width: 390, height: 844, dpr: 3, mobile: true, touch: true, cpu: 4,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
    label: 'phone 390x844 @3x touch, 4x CPU throttle' }
};

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function log() { if (OPT.verbose) console.log.apply(console, arguments); }

/* ------------------------------------------------------------ static server */

var TEXT = /\.(html|css|js|json|svg|xml|webmanifest|txt)$/;
var MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain'
};

function startServer() {
  var served = { requests: 0, bytes: 0, byPath: {} };
  var server = http.createServer(function (req, res) {
    var url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    var file = path.join(ROOT, url);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    var ext = path.extname(file);
    var body = fs.readFileSync(file);
    var headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=600' };
    // GitHub Pages gzips text; do the same so transfer sizes are honest.
    if (TEXT.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      body = zlib.gzipSync(body, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    served.requests++; served.bytes += body.length;
    served.byPath[url] = (served.byPath[url] || 0) + body.length;
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port, served: served });
    });
  });
}

/* ---------------------------------------------------------------- fixtures */

function crc32Png(buf) { return zlib.crc32 ? zlib.crc32(buf) >>> 0 : 0; }
function pngChunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  var td = Buffer.concat([Buffer.from(type), data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32Png(td));
  return Buffer.concat([len, td, crc]);
}
function solidPng(w, h, rgb) {
  var row = Buffer.alloc(1 + w * 3);
  for (var x = 0; x < w; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  var raw = Buffer.concat(new Array(h).fill(row));
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function fixtures(o) {
  var now = Date.parse(o.date);
  var day = function (n) { return new Date(now + n * 86400000).toISOString().slice(0, 10); };
  var codes = { clear: 1, rain: 63, snow: 73, cloudy: 3 };
  var code = codes[o.weather] != null ? codes[o.weather] : 1;
  var weather = {
    current: { temperature_2m: 15.4, weather_code: code, wind_speed_10m: o.weather === 'rain' ? 38 : 14, is_day: 1,
      cloud_cover: o.weather === 'cloudy' || o.weather === 'rain' ? 85 : 20, wind_direction_10m: 250 },
    daily: {
      time: [0, 1, 2, 3, 4].map(day), weather_code: [code, 2, 3, 61, 1],
      temperature_2m_max: [17.2, 16.1, 15.5, 14.2, 16.8], temperature_2m_min: [9.1, 8.4, 9.9, 10.2, 8.8],
      precipitation_probability_max: [10, 20, 35, 70, 15]
    }
  };
  var activities = [];
  if (o.presence === 'active') {
    activities = [
      { type: 0, name: 'Baldur\'s Gate 3', details: 'Act 2', state: 'Exploring', application_id: '1', assets: { large_image: 'mp:external/a/b/c.png' },
        timestamps: { start: now - 3600e3 } },
      { type: 4, state: 'vibing' }
    ];
  }
  var lanyardData = {
    discord_user: { id: '346360416827473921', username: 'kazu_hani', global_name: 'Kazu', avatar: 'abc123' },
    discord_status: o.presence === 'active' ? 'online' : 'offline',
    active_on_discord_desktop: o.presence === 'active', active_on_discord_mobile: false, active_on_discord_web: false,
    activities: activities,
    listening_to_spotify: o.presence === 'active',
    spotify: o.presence === 'active' ? { song: 'Rocketeer', artist: 'Far East Movement', album_art_url: 'https://i.scdn.co/image/x',
      track_id: 'abc', timestamps: { start: now - 60e3, end: now + 180e3 } } : null
  };
  var steam = '<?xml version="1.0"?><profile><avatarFull>https://avatars.steamstatic.com/a_full.jpg</avatarFull><onlineState>online</onlineState>' +
    '<mostPlayedGames>' + [1, 2, 3].map(function (n) {
      return '<mostPlayedGame><gameName>Game ' + n + '</gameName><gameLogo>https://cdn.cloudflare.steamstatic.com/steam/apps/' + (1000 + n) +
        '/capsule_184x69.jpg</gameLogo><gameLink>https://steamcommunity.com/app/' + (1000 + n) + '</gameLink><hoursPlayed>' + (4 + n) +
        '.5</hoursPlayed><hoursOnRecord>' + (100 * n) + '.0</hoursOnRecord></mostPlayedGame>';
    }).join('') + '</mostPlayedGames></profile>';
  var anime = { data: [1, 2, 3].map(function (n) {
    return { watching_status: 'watching', episodes_watched: 3 * n, anime: { mal_id: n, url: 'https://myanimelist.net/anime/' + n,
      title: 'Anime ' + n, title_english: 'Anime Title ' + n, episodes: 12, images: { jpg: { small_image_url: 'https://cdn.myanimelist.net/images/anime/' + n + '.jpg' } } } };
  }) };
  var manga = { data: [1, 2].map(function (n) {
    return { reading_status: 'reading', chapters_read: 10 * n, manga: { mal_id: n, url: 'https://myanimelist.net/manga/' + n, title: 'Manga ' + n,
      chapters: null, images: { jpg: { small_image_url: 'https://cdn.myanimelist.net/images/manga/' + n + '.jpg' } } } };
  }) };
  var letterboxd = '<?xml version="1.0"?><rss><channel><item><title>Arrival, 2016 - ★★★★</title><link>https://letterboxd.com/kazuhani/film/arrival-2016/</link>' +
    '<description><![CDATA[<p><img src="https://a.ltrbxd.com/resized/film-poster/x.jpg"/></p>]]></description>' +
    '<letterboxd:filmTitle>Arrival</letterboxd:filmTitle><letterboxd:filmYear>2016</letterboxd:filmYear><letterboxd:memberRating>4.0</letterboxd:memberRating>' +
    '<letterboxd:watchedDate>2026-08-01</letterboxd:watchedDate><letterboxd:rewatch>No</letterboxd:rewatch></item></channel></rss>';
  var yt = '<?xml version="1.0"?><feed>' + ['ejUr_Uunvjc', 'DFBvS_fuSqY', 'Skbzy3BBTcM', '4IcAIrPCerA', 'yqsJsO8H-oA'].map(function (id, i) {
    return '<entry><yt:videoId>' + id + '</yt:videoId><title>Track ' + (i + 1) + '</title><author><name>Artist ' + (i + 1) + ' - Topic</name></author></entry>';
  }).join('') + '</feed>';
  var listenbrainz = { payload: { listens: [{ playing_now: false, track_metadata: { track_name: 'Song', artist_name: 'Band', additional_info: {} } }] } };
  return { weather: weather, lanyardData: lanyardData, steam: steam, anime: anime, manga: manga, letterboxd: letterboxd, yt: yt, listenbrainz: listenbrainz,
    quote: [{ q: 'Little things make big days.', a: 'Unknown' }], avatar: solidPng(64, 64, [88, 101, 242]) };
}

function routeFor(url, fx) {
  var j = function (o) { return { type: 'application/json', body: Buffer.from(JSON.stringify(o)) }; };
  var t = function (type, s) { return { type: type, body: Buffer.from(s) }; };
  if (/^https:\/\/api\.open-meteo\.com\//.test(url)) return j(fx.weather);
  if (/^https:\/\/api\.lanyard\.rest\/v1\//.test(url)) return j({ success: true, data: fx.lanyardData });
  if (/proxy\.cors\.sh\/https:\/\/steamcommunity\.com\//.test(url)) return t('text/xml', fx.steam);
  if (/api\.jikan\.moe\/v4\/users\/[^/]+\/animelist/.test(url)) return j(fx.anime);
  if (/api\.jikan\.moe\/v4\/users\/[^/]+\/mangalist/.test(url)) return j(fx.manga);
  if (/proxy\.cors\.sh\/https:\/\/letterboxd\.com\//.test(url)) return t('application/rss+xml', fx.letterboxd);
  if (/proxy\.cors\.sh\/https:\/\/www\.youtube\.com\/feeds\//.test(url)) return t('application/atom+xml', fx.yt);
  if (/^https:\/\/api\.listenbrainz\.org\//.test(url)) return j(fx.listenbrainz);
  if (/^https:\/\/zenquotes\.io\//.test(url)) return j(fx.quote);
  if (/^https:\/\/fonts\.googleapis\.com\//.test(url)) return t('text/css', '/* fonts stubbed: system fonts */');
  if (/earth\.nullschool\.net/.test(url)) return t('text/html', '<!doctype html><title>globe</title><body style="background:#05070d">');
  if (/\.(png|jpe?g|webp|gif)(\?|$)|cdn\.discordapp\.com|media\.discordapp\.net|i\.scdn\.co|steamstatic\.com|myanimelist\.net|ltrbxd\.com/.test(url)) {
    return { type: 'image/png', body: fx.avatar };
  }
  return null;
}

/* --------------------------------------------------------------- Chrome CDP */

function findChrome() {
  for (var i = 0; i < CHROME_CANDIDATES.length; i++) if (fs.existsSync(CHROME_CANDIDATES[i])) return CHROME_CANDIDATES[i];
  throw new Error('No Chrome/Chromium found; set CHROME_PATH');
}

async function launchChrome() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kazu-perf-'));
  var flags = ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--disable-background-networking', '--disable-sync',
    '--disable-component-update', '--disable-default-apps', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,Translate',
    '--metrics-recording-only', '--force-color-profile=srgb', 'about:blank'];
  if (OPT.gpu === 'soft') flags.splice(1, 0, '--disable-gpu');
  var child = childProcess.spawn(findChrome(), flags, { stdio: 'ignore' });
  var portFile = path.join(dir, 'DevToolsActivePort');
  for (var i = 0; i < 200 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) { child.kill(); throw new Error('Chrome did not expose a debugging port'); }
  var lines = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  var ws = new WebSocket('ws://127.0.0.1:' + lines[0] + lines[1]);
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  var id = 0, pending = new Map(), listeners = [];
  ws.onmessage = function (m) {
    var msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      var p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message + ' (' + p.method + ')')); else p.res(msg.result);
    } else if (msg.method) listeners.forEach(function (fn) { fn(msg); });
  };
  function send(method, params, sessionId) {
    return new Promise(function (res, rej) {
      var i = ++id; pending.set(i, { res: res, rej: rej, method: method });
      ws.send(JSON.stringify({ id: i, method: method, params: params || {}, sessionId: sessionId }));
    });
  }
  return {
    send: send,
    on: function (fn) { listeners.push(fn); },
    close: async function () {
      try { ws.close(); } catch (e) {}
      child.kill();
      await sleep(400);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    }
  };
}

/* The script every page gets before its own scripts run: a pinned clock that
   still ticks in real time, a Lanyard socket that behaves, and the observers
   and frame sampler the scenarios read back. */
function initScript(o, fx) {
  return '(' + function (cfg) {
    // cfg.now is the start of a UK minute; begin 2 s before the next one so the
    // minute rolls over right after load and the sky tint has a step to glide.
    var RealDate = Date, off = cfg.now + 58000 - RealDate.now();
    class FakeDate extends RealDate {
      constructor() { if (arguments.length === 0) super(RealDate.now() + off); else super(...arguments); }
      static now() { return RealDate.now() + off; }
    }
    window.Date = FakeDate;

    var RealWS = window.WebSocket;
    function FakeLanyard(url) {
      var self = this; this.url = url; this.readyState = 0;
      setTimeout(function () {
        self.readyState = 1; if (self.onopen) self.onopen({});
        self.emit({ op: 1, d: { heartbeat_interval: 30000 } });
      }, 40);
    }
    FakeLanyard.prototype.send = function (s) {
      var self = this, m = JSON.parse(s);
      if (m.op === 2) setTimeout(function () { self.emit({ op: 0, t: 'INIT_STATE', d: cfg.lanyard }); }, 20);
    };
    FakeLanyard.prototype.close = function () { this.readyState = 3; if (this.onclose) this.onclose({}); };
    FakeLanyard.prototype.emit = function (o) { if (this.onmessage) this.onmessage({ data: JSON.stringify(o) }); };
    window.WebSocket = function (url, p) { return /lanyard/.test(url) ? new FakeLanyard(url) : new RealWS(url, p); };

    if (cfg.steady) { // first minute-tick after 3 s, so a short run sees the steady state
      var realSI = window.setInterval;
      window.setInterval = function (fn, ms) {
        if (ms === 60000) setTimeout(fn, 3000);
        return realSI.apply(window, arguments);
      };
    }

    var P = window.__perf = { longtasks: [], loaf: [], lcp: null, cls: 0 };
    function obs(type, cb) { try { new PerformanceObserver(function (l) { l.getEntries().forEach(cb); }).observe({ type: type, buffered: true }); } catch (e) {} }
    obs('longtask', function (e) { P.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); });
    obs('long-animation-frame', function (e) { P.loaf.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration || 0)]); });
    obs('largest-contentful-paint', function (e) { P.lcp = { t: Math.round(e.startTime), size: e.size, tag: e.element ? e.element.tagName + '.' + String(e.element.className).slice(0, 24) : '' }; });
    obs('layout-shift', function (e) { if (!e.hadRecentInput) P.cls += e.value; });

    if (cfg.pre) { try { (0, eval)(cfg.pre); } catch (e) { console.error('--pre failed', e); } }
    if (cfg.css) { // experiment hook: extra CSS as soon as <head> exists
      var addCss = function () { var st = document.createElement('style'); st.textContent = cfg.css; (document.head || document.documentElement).appendChild(st); };
      if (document.head) addCss(); else document.addEventListener('DOMContentLoaded', addCss);
    }
    if (cfg.js) { document.addEventListener('DOMContentLoaded', function () { try { (0, eval)(cfg.js); } catch (e) { console.error('--js failed', e); } }); }

    var fps = window.__fps = { d: [], slow: [], on: false, last: 0, t0: 0 };
    function tick(t) {
      if (!fps.on) return;
      if (fps.last) { fps.d.push(t - fps.last); if (t - fps.last > 20) fps.slow.push([Math.round(t - fps.t0), Math.round(t - fps.last), Math.round(window.scrollY)]); }
      fps.last = t; requestAnimationFrame(tick);
    }
    fps.start = function () { fps.d = []; fps.slow = []; fps.last = 0; fps.t0 = performance.now(); fps.on = true; requestAnimationFrame(tick); };
    fps.stop = function () { fps.on = false; return fps.d; };
  } + ')(' + JSON.stringify({ now: Date.parse(o.date), lanyard: fx.lanyardData, steady: OPT.quick || o.steady, css: o.css === true ? '' : o.css, js: o.js === true ? '' : o.js, pre: o.pre === true ? '' : o.pre }) + ');';
}

async function openPage(chrome, device, fx, srv) {
  var d = DEVICES[device];
  var t = await chrome.send('Target.createTarget', { url: 'about:blank' });
  var a = await chrome.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  var sid = a.sessionId;
  var call = function (m, p) { return chrome.send(m, p, sid); };
  var events = [];
  chrome.on(function (msg) {
    if (msg.sessionId !== sid) return;
    events.push(msg);
    if (msg.method === 'Fetch.requestPaused') {
      var r = msg.params, url = r.request.url;
      if (url.indexOf('http://127.0.0.1:' + srv.port) === 0 || url.indexOf('data:') === 0) {
        call('Fetch.continueRequest', { requestId: r.requestId }).catch(function () {});
        return;
      }
      var hit = routeFor(url, fx);
      if (hit) {
        call('Fetch.fulfillRequest', { requestId: r.requestId, responseCode: 200, body: hit.body.toString('base64'),
          responseHeaders: [{ name: 'Content-Type', value: hit.type }, { name: 'Access-Control-Allow-Origin', value: '*' }] }).catch(function () {});
      } else {
        call('Fetch.failRequest', { requestId: r.requestId, errorReason: 'BlockedByClient' }).catch(function () {});
      }
    }
  });
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable'); await call('Performance.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.mobile });
  if (d.touch) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (d.ua) await call('Emulation.setUserAgentOverride', { userAgent: d.ua, userAgentMetadata: { platform: 'Android', platformVersion: '14', architecture: '', model: 'Pixel 8', mobile: true,
    brands: [{ brand: 'Chromium', version: '154' }], fullVersionList: [{ brand: 'Chromium', version: '154.0.0.0' }] } });
  if (d.mobile) await call('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: 8 }).catch(function () {});
  await call('Network.setBypassServiceWorker', { bypass: true });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: initScript(OPT, fx) });
  return {
    call: call, events: events,
    eval: async function (expr) {
      var r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    },
    goto: async function (url) {
      events.length = 0;
      await call('Page.navigate', { url: url });
      for (var i = 0; i < 300; i++) {
        if (events.some(function (e) { return e.method === 'Page.loadEventFired'; })) return;
        await sleep(50);
      }
      throw new Error('page never fired load');
    },
    // CPU throttling is for latency scenarios (scroll, modal, load). Idle runs
    // unthrottled: the throttle itself burns renderer CPU, which would drown
    // the very number idle exists to measure.
    throttle: function (on) {
      var rate = on ? (OPT.cpu || d.cpu) : 1;
      return call('Emulation.setCPUThrottlingRate', { rate: rate });
    },
    close: function () { return chrome.send('Target.closeTarget', { targetId: t.targetId }).catch(function () {}); }
  };
}

/* ------------------------------------------------------------------- traces */

// Chrome's own trace of a window, reduced to "which threads were busy and what
// were they busy with": top-level durations summed per thread and event name.
// A diagnostic for finding WHY a number is high, not a pass/fail measure.
async function traceStart(chrome) {
  var trace = { events: [], done: false };
  chrome.on(function (msg) {
    if (msg.method === 'Tracing.dataCollected') for (var i = 0; i < msg.params.value.length; i++) trace.events.push(msg.params.value[i]);
    else if (msg.method === 'Tracing.tracingComplete') trace.done = true;
  });
  await chrome.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordContinuously',
    includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'viz', 'blink', 'blink.animations', 'benchmark', 'gpu'] } });
  return trace;
}

async function traceStop(chrome, trace) {
  await chrome.send('Tracing.end');
  for (var i = 0; i < 300 && !trace.done; i++) await sleep(100);
  var summary = summarizeTrace(trace.events);
  summarizeTrace.slow = slowFrames(trace.events, 12);
  return summary;
}

function summarizeTrace(events) {
  var names = {};
  events.forEach(function (e) { if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name; });
  var per = {};
  // Script time by call site: which functions the page itself spent its time in.
  var calls = {};
  events.forEach(function (e) {
    if (e.ph !== 'X' || !e.dur || e.name !== 'FunctionCall' || !e.args || !e.args.data) return;
    var d = e.args.data;
    var key = (d.functionName || '(anonymous)') + ' @ ' + String(d.url || '').split('/').pop().split('?')[0] + ':' + d.lineNumber;
    var c = calls[key] || (calls[key] = { ms: 0, n: 0 });
    c.ms += e.dur / 1000; c.n++;
  });
  summarizeTrace.calls = Object.keys(calls).map(function (k) { return { site: k, ms: round(calls[k].ms, 1), n: calls[k].n }; })
    .sort(function (a, b) { return b.ms - a.ms; }).slice(0, 8);
  events.forEach(function (e) {
    if (e.ph !== 'X' || !e.dur) return;
    var tn = names[e.pid + ':' + e.tid] || ('t' + e.tid);
    if (!/CrRendererMain|Compositor|CompositorTileWorker|GPU|VizCompositor|Raster|ThreadPool/i.test(tn)) return;
    var t = per[e.pid + ':' + tn] || (per[e.pid + ':' + tn] = { thread: tn, pid: e.pid, byName: {}, counts: {}, busy: 0 });
    t.byName[e.name] = (t.byName[e.name] || 0) + e.dur;
    t.counts[e.name] = (t.counts[e.name] || 0) + 1;
    // Top-level scheduler tasks carry the thread's true busy time.
    if (/^(ThreadControllerImpl::RunTask|ThreadPool_RunTask|RunTask)$/.test(e.name)) t.busy += e.dur;
  });
  return Object.keys(per).map(function (k) {
    var t = per[k];
    var top = Object.keys(t.byName).filter(function (n) { return !/^(ThreadControllerImpl::RunTask|ThreadPool_RunTask|RunTask)$/.test(n); })
      .sort(function (a, b) { return t.byName[b] - t.byName[a]; }).slice(0, OPT.traceDetail ? 22 : 8)
      .map(function (n) { return n + ' ' + round(t.byName[n] / 1000, 1) + 'ms' + (OPT.traceDetail ? ' x' + t.counts[n] : ''); });
    return { thread: t.thread, pid: t.pid, busyMs: round(t.busy / 1000, 1), top: top };
  }).filter(function (t) { return t.busyMs > 1 || t.top.length; })
    .sort(function (a, b) { return b.busyMs - a.busyMs; }).slice(0, 8);
}

// The slowest main-thread frames and what each was made of. A frame is one
// ProxyMain::BeginMainFrame; its parts are the events nested inside it.
function slowFrames(events, minMs) {
  var names = {};
  events.forEach(function (e) { if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name; });
  var main = events.filter(function (e) { return e.ph === 'X' && e.dur && names[e.pid + ':' + e.tid] === 'CrRendererMain'; })
    .sort(function (a, b) { return a.ts - b.ts || b.dur - a.dur; });
  var WRAP = /^(ProxyMain::BeginMainFrame|WebFrameWidgetImpl::BeginMainFrame|WebFrameWidgetImpl::UpdateLifecycle|LocalFrameView::RunStyleAndLayoutLifecyclePhases|LocalFrameView::RunPaintLifecyclePhase|LocalFrameView::RunPrePaintLifecyclePhase|LocalFrameView::RunCompositingInputsLifecyclePhase|RunTask|ThreadControllerImpl::RunTask|LocalFrameView::UpdateStyleAndLayout|Blink\.[A-Za-z.]+|LocalFrameView::pushPaintArtifactToCompositor|PageAnimator::serviceScriptedAnimations|AnimationTimeline::serviceAnimations)$/;
  var out = [];
  main.filter(function (e) { return e.name === 'ProxyMain::BeginMainFrame' && e.dur / 1000 >= minMs; })
    .sort(function (a, b) { return b.dur - a.dur; }).slice(0, 6).forEach(function (f) {
      var parts = {};
      main.forEach(function (e) {
        if (e === f || e.ts < f.ts || e.ts + e.dur > f.ts + f.dur || WRAP.test(e.name)) return;
        parts[e.name] = (parts[e.name] || 0) + e.dur;
      });
      var top = Object.keys(parts).sort(function (a, b) { return parts[b] - parts[a]; }).slice(0, 5)
        .map(function (n) { return n + ' ' + round(parts[n] / 1000, 1) + 'ms'; });
      out.push({ ms: round(f.dur / 1000, 1), at: round(f.ts / 1000000, 2), top: top });
    });
  return out;
}

function printTrace(summary, seconds) {
  console.log('  trace over ' + seconds + ' s (busy ms per thread):');
  summary.forEach(function (t) {
    if (/GpuVSync/.test(t.thread)) return; // busy-waits on vsync by design; not work
    console.log('    ' + t.thread + ' (' + t.pid + '): busy ' + t.busyMs + ' ms | ' + t.top.join(OPT.traceDetail ? '\n        ' : ', '));
  });
  if (summarizeTrace.slow && summarizeTrace.slow.length) {
    console.log('  slowest frames (main thread):');
    summarizeTrace.slow.forEach(function (f) { console.log('    ' + f.ms + ' ms at t=' + f.at + 's: ' + f.top.join(', ')); });
  }
  if (summarizeTrace.calls && summarizeTrace.calls.length) {
    console.log('  script time by call site:');
    summarizeTrace.calls.forEach(function (c) { console.log('    ' + c.ms + ' ms in ' + c.n + ' calls: ' + c.site); });
  }
}

/* --------------------------------------------------------------- scenarios */

async function snapshot(chrome, page) {
  var info = await chrome.send('SystemInfo.getProcessInfo');
  var m = await page.call('Performance.getMetrics');
  return { cpu: info.processInfo, metrics: m.metrics, at: Date.now() };
}

async function settle(page, device, secs) {
  // The boot ladder (staged fetches, glass bake, weather canvas) finishes in
  // roughly 14 s on a throttled phone; wait it out so idle means idle.
  await sleep(secs * 1000);
}

async function runLoad(chrome, page, base, device) {
  await page.throttle(true);
  await page.goto(base + '/' + PAGE);
  await sleep(4500);
  var r = await page.eval('(function () {' +
    'var nav = performance.getEntriesByType("navigation")[0] || {};' +
    'var fcp = (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime;' +
    'var P = window.__perf;' +
    'var tbt = P.longtasks.reduce(function (a, l) { return a + Math.max(0, l[1] - 50); }, 0);' +
    'return { fcp: Math.round(fcp || 0), lcp: P.lcp, dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0),' +
    ' tbt: Math.round(tbt), longtasks: P.longtasks.length, cls: +P.cls.toFixed(4), nodes: document.getElementsByTagName("*").length,' +
    ' transfer: performance.getEntriesByType("resource").reduce(function (a, e) { return a + (e.transferSize || 0); }, 0),' +
    ' requests: performance.getEntriesByType("resource").length };})()');
  var m = await page.call('Performance.getMetrics');
  var by = {}; m.metrics.forEach(function (x) { by[x.name] = x.value; });
  r.scriptMs = Math.round(by.ScriptDuration * 1000); r.layoutMs = Math.round(by.LayoutDuration * 1000);
  r.styleMs = Math.round(by.RecalcStyleDuration * 1000); r.taskMs = Math.round(by.TaskDuration * 1000);
  r.heapMB = round(by.JSHeapUsedSize / 1048576, 1);
  return r;
}

async function runIdle(chrome, page, base, device) {
  await page.throttle(false);
  await page.goto(base + '/' + PAGE);
  var warm = OPT.quick ? 14 : (device === 'phone' ? 20 : 16);
  await settle(page, device, warm);
  // Lift any longtask records from boot so the window counts only steady state.
  var t0 = await page.eval('performance.now()');
  var secs = OPT.quick ? 12 : 30;
  if (OPT.shot && OPT.shot !== true) {
    if (OPT.shotTo && OPT.shotTo !== true) {
      await page.eval('(function () { var e = document.querySelector(' + JSON.stringify(OPT.shotTo) + '); if (e) e.scrollIntoView({ block: "center" }); })()');
      await sleep(900);
    }
    var png = await page.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OPT.shot, Buffer.from(png.data, 'base64'));
    console.log('  screenshot: ' + OPT.shot);
    await page.eval('window.scrollTo(0, 0)');
  }
  var tr = OPT.trace ? await traceStart(chrome) : null;
  var a = await snapshot(chrome, page);
  await sleep(secs * 1000);
  var b = await snapshot(chrome, page);
  var traceSummary = tr ? await traceStop(chrome, tr) : null;
  if (tr && arg('trace-names', false)) {
    var cnt = {};
    tr.events.forEach(function (e) { if (e.cat && /blink|devtools|cc/.test(e.cat)) { var k = e.ph + ' ' + e.name; cnt[k] = (cnt[k] || 0) + 1; } });
    fs.writeFileSync(path.join(os.tmpdir(), 'kazu-trace-names.json'), JSON.stringify(cnt, null, 1));
  }
  var run = await page.eval('(function () {' +
    'var anims = document.getAnimations();' +
    'var kinds = {};' +
    'anims.forEach(function (x) { var k = x.constructor.name + ":" + (x.transitionProperty || x.animationName || "?") + ":" + x.playState; kinds[k] = (kinds[k] || 0) + 1; });' +
    'var P = window.__perf; var lt = P.longtasks.filter(function (l) { return l[0] >= ' + t0 + '; });' +
    'return { raf: window.__raf || null, running: anims.filter(function (x) { return x.playState === "running"; }).length, kinds: kinds, longtasks: lt.length, longtaskMs: lt.reduce(function (s, l) { return s + l[1]; }, 0) };})()');
  var real = (b.at - a.at) / 1000;
  var out = { seconds: round(real, 1), cpu: cpuDelta(a.cpu, b.cpu, real), main: metricsDelta(a.metrics, b.metrics, real) };
  out.transitionsRunning = Object.keys(run.kinds).filter(function (k) { return /^CSSTransition/.test(k); })
    .reduce(function (n, k) { return n + run.kinds[k]; }, 0);
  out.animationsRunning = run.running; out.animationKinds = run.kinds; if (run.raf) out.raf = run.raf;
  out.longTasksPerMin = round(run.longtasks / (real / 60), 1); out.longTaskMs = run.longtaskMs;
  out.RecalcStyleCount = out.main.RecalcStyleCount; out.LayoutCount = out.main.LayoutCount;
  if (traceSummary) { printTrace(traceSummary, round(real, 1)); out.trace = traceSummary; }
  return out;
}

async function scrollSession(chrome, page, device, fn) {
  await page.eval('window.__fps.start()');
  await fn();
  await sleep(300);
  var deltas = await page.eval('window.__fps.stop()');
  scrollSession.slow = await page.eval('window.__fps.slow');
  return deltas;
}

async function runScroll(chrome, page, base, device) {
  await page.throttle(true);
  await page.goto(base + '/' + PAGE);
  await settle(page, device, OPT.quick ? 14 : (device === 'phone' ? 20 : 16));
  var d = DEVICES[device];
  var total = await page.eval('document.documentElement.scrollHeight - innerHeight');
  var tr = OPT.trace ? await traceStart(chrome) : null;
  var a = await snapshot(chrome, page);
  var deltas = await scrollSession(chrome, page, device, async function () {
    var x = Math.round(d.width / 2), y = Math.round(d.height / 2);
    if (d.touch) {
      for (var pass = 0; pass < 2; pass++) {
        var dir = pass === 0 ? -1 : 1, travelled = 0;
        while (travelled < total) {
          var dist = Math.min(700, total - travelled);
          await page.call('Input.synthesizeScrollGesture', { x: x, y: y, yDistance: dir * dist, speed: 1400, gestureSourceType: 'touch' });
          travelled += dist; await sleep(60);
        }
      }
    } else {
      for (var pass2 = 0; pass2 < 2; pass2++) {
        var sgn = pass2 === 0 ? 1 : -1, steps = Math.ceil(total / 100);
        for (var i = 0; i < steps; i++) {
          await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x, y: y, deltaX: 0, deltaY: sgn * 100 });
          await sleep(16);
        }
        await sleep(400);
      }
    }
  });
  var b = await snapshot(chrome, page);
  var real = (b.at - a.at) / 1000;
  if (tr) printTrace(await traceStop(chrome, tr), round(real, 1));
  var res = { pageHeight: total, seconds: round(real, 1), frames: frameStats(deltas), cpu: cpuDelta(a.cpu, b.cpu, real), main: metricsDelta(a.metrics, b.metrics, real) };
  res.slowFrames = scrollSession.slow || [];
  return res;
}

async function runModal(chrome, page, base, device) {
  await page.throttle(true);
  await page.goto(base + '/' + PAGE);
  await settle(page, device, OPT.quick ? 14 : (device === 'phone' ? 20 : 16));
  var d = DEVICES[device];
  var results = [];
  var cards = ['time', 'age', 'bday'];
  for (var i = 0; i < cards.length; i++) {
    var rect = await page.eval('(function () { var r = document.querySelector(\'.stat-card[data-modal="' + cards[i] + '"]\').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
    await page.eval('window.__fps.start()');
    if (d.touch) {
      await page.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x, y: rect.y }] });
      await page.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    }
    await sleep(900);
    await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(800);
    results.push(frameStats(await page.eval('window.__fps.stop()')));
    await sleep(300);
  }
  var agg = { frames: 0, missed: 0, dropped: 0, p95: 0, p99: 0, max: 0 };
  results.forEach(function (r) {
    agg.frames += r.frames; agg.missed += r.missed; agg.dropped += r.dropped;
    agg.p95 = Math.max(agg.p95, r.p95); agg.p99 = Math.max(agg.p99, r.p99); agg.max = Math.max(agg.max, r.max);
  });
  return { perCard: results, frames: agg };
}

var RUNNERS = { load: runLoad, idle: runIdle, scroll: runScroll, modal: runModal };

/* ------------------------------------------------------------------- report */

function fmt(v) { return v == null ? '-' : (typeof v === 'number' ? String(round(v, 3)) : String(v)); }

function printResult(device, scenario, r) {
  var head = '\n== ' + DEVICES[device].label + ' / ' + scenario + ' ==';
  console.log(head);
  if (scenario === 'load') {
    console.log('  FCP ' + r.fcp + ' ms | LCP ' + (r.lcp ? r.lcp.t + ' ms (' + r.lcp.tag + ')' : '-') + ' | DCL ' + r.dcl + ' ms | load ' + r.load + ' ms');
    console.log('  TBT ' + r.tbt + ' ms over ' + r.longtasks + ' long tasks | CLS ' + r.cls + ' | script ' + r.scriptMs + ' ms, style ' + r.styleMs + ' ms, layout ' + r.layoutMs + ' ms, all tasks ' + r.taskMs + ' ms');
    console.log('  DOM nodes ' + r.nodes + ' | requests ' + r.requests + ' | transfer ' + round(r.transfer / 1024, 1) + ' KB | JS heap ' + r.heapMB + ' MB');
  } else if (scenario === 'idle') {
    console.log('  CPU (cores) renderer ' + fmt(r.cpu.renderer) + ' | gpu ' + fmt(r.cpu.gpu) + ' | browser ' + fmt(r.cpu.browser) + ' | TOTAL ' + fmt(r.cpu.total) + '  over ' + r.seconds + ' s');
    console.log('  main thread/s: task ' + fmt(r.main.TaskDuration) + ' | script ' + fmt(r.main.ScriptDuration) + ' | style ' + fmt(r.main.RecalcStyleDuration) + ' (' + fmt(r.main.RecalcStyleCount) + ' recalcs) | layout ' + fmt(r.main.LayoutDuration) + ' (' + fmt(r.main.LayoutCount) + ' layouts)');
    console.log('  running transitions ' + r.transitionsRunning + ' | running animations ' + r.animationsRunning + ' | long tasks/min ' + r.longTasksPerMin + ' (' + r.longTaskMs + ' ms)');
    if (OPT.verbose) console.log('  kinds', JSON.stringify(r.animationKinds));
    if (r.raf) console.log('  requestAnimationFrame callers: ' + JSON.stringify(r.raf));
  } else if (scenario === 'scroll') {
    var f = r.frames;
    if (r.slowFrames && r.slowFrames.length && OPT.verbose) console.log('  slow frames [t ms since start, frame ms, scrollY]: ' + r.slowFrames.map(function (x) { return '[' + x.join(',') + ']'; }).join(' '));
    console.log('  ' + f.frames + ' frames, ' + f.fps + ' fps | frame p50 ' + f.p50 + ' p95 ' + f.p95 + ' p99 ' + f.p99 + ' max ' + f.max + ' ms | missed ' + f.missed + ' (dropped vsyncs ' + f.dropped + ')');
    console.log('  CPU (cores) renderer ' + fmt(r.cpu.renderer) + ' | gpu ' + fmt(r.cpu.gpu) + ' | TOTAL ' + fmt(r.cpu.total) + ' | main thread task ' + fmt(r.main.TaskDuration) + '/s, style ' + fmt(r.main.RecalcStyleDuration) + '/s, layout ' + fmt(r.main.LayoutDuration) + '/s');
  } else if (scenario === 'modal') {
    var g = r.frames;
    console.log('  ' + g.frames + ' frames | worst p95 ' + g.p95 + ' p99 ' + g.p99 + ' max ' + g.max + ' ms | missed ' + g.missed + ' (dropped vsyncs ' + g.dropped + ')');
  }
}

function flatten(obj, prefix, out) {
  out = out || {}; prefix = prefix || '';
  Object.keys(obj || {}).forEach(function (k) {
    var v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'animationKinds' && k !== 'perCard' && k !== 'lcp') flatten(v, prefix + k + '.', out);
    else if (typeof v === 'number') out[prefix + k] = v;
  });
  return out;
}

function printCompare(base, cur) {
  console.log('\n== delta vs ' + OPT.compare + ' (negative is better for time/cost) ==');
  Object.keys(cur).forEach(function (key) {
    if (!base[key]) return;
    Object.keys(cur[key]).forEach(function (scn) {
      var a = flatten(base[key][scn]), b = flatten(cur[key][scn]);
      var lines = [];
      Object.keys(b).forEach(function (k) {
        if (a[k] === undefined || /seconds|Nodes|heap|requests|pageHeight|JSEventListeners/.test(k)) return;
        if (a[k] === 0 && b[k] === 0) return;
        var pct = a[k] ? ((b[k] - a[k]) / a[k]) * 100 : (b[k] ? 100 : 0);
        if (Math.abs(pct) < 8) return;
        lines.push('    ' + k + ': ' + fmt(a[k]) + ' -> ' + fmt(b[k]) + '  (' + (pct > 0 ? '+' : '') + Math.round(pct) + '%)');
      });
      console.log('  ' + key + ' / ' + scn + (lines.length ? '' : ': no change over 8%'));
      lines.forEach(function (l) { console.log(l); });
    });
  });
}

/* --------------------------------------------------------------------- main */

(async function main() {
  var srv = await startServer();
  var base = 'http://127.0.0.1:' + srv.port;
  var fx = fixtures(OPT);
  var results = {}, failures = [];
  OPT.devices.forEach(function (d) { if (!DEVICES[d]) { console.error('unknown device: ' + d); process.exit(2); } });
  console.log('Kazu Hub perf eval | ' + OPT.devices.join(',') + ' | ' + OPT.scenarios.join(',') + (OPT.quick ? ' | quick' : '') +
    ' | gpu ' + OPT.gpu + ' | clock ' + OPT.date + ' | presence ' + OPT.presence + ' | weather ' + OPT.weather);
  try {
    for (var di = 0; di < OPT.devices.length; di++) {
      var device = OPT.devices[di];
      results[device] = {};
      for (var si = 0; si < OPT.scenarios.length; si++) {
        var scn = OPT.scenarios[si];
        if (!RUNNERS[scn]) { console.error('unknown scenario: ' + scn); continue; }
        var runs = [];
        for (var n = 0; n < OPT.runs; n++) {
          var chrome = await launchChrome();
          try {
            var page = await openPage(chrome, device, fx, srv);
            runs.push(await RUNNERS[scn](chrome, page, base, device));
          } finally { await chrome.close(); }
        }
        // With several runs keep the median run by its headline number.
        var pick = runs.length === 1 ? runs[0] : runs.slice().sort(function (a, b) {
          var ka = a.cpu ? a.cpu.total : (a.frames ? a.frames.p95 : a.tbt || 0), kb = b.cpu ? b.cpu.total : (b.frames ? b.frames.p95 : b.tbt || 0);
          return ka - kb;
        })[Math.floor(runs.length / 2)];
        results[device][scn] = pick;
        printResult(device, scn, pick);
        failures = failures.concat(checkBudget(device, scn, pick));
      }
    }
  } finally { srv.server.close(); }
  var outFile = OPT.out || path.join(os.tmpdir(), 'kazu-perf-' + Date.now() + '.json');
  fs.writeFileSync(outFile, JSON.stringify({ opts: OPT, results: results }, null, 2));
  console.log('\nraw numbers: ' + outFile);
  if (OPT.compare) printCompare(JSON.parse(fs.readFileSync(OPT.compare, 'utf8')).results, results);
  if (failures.length) {
    console.log('\nBUDGET FAILURES:'); failures.forEach(function (f) { console.log('  ' + f); });
    if (OPT.budget) process.exit(1);
  } else if (OPT.budget) console.log('\nall budgets met');
})().catch(function (e) { console.error(e); process.exit(1); });
