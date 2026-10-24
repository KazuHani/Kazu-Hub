/* ============================================================================
   chrome-harness.js: the real-browser plumbing shared by the periodic evals
   (perf.js, layout-sweep.js). Plain Node >= 22, no dependencies.
   ----------------------------------------------------------------------------
   - startServer(root): a static server on 127.0.0.1 that gzips text like
     GitHub Pages does, so transfer sizes are honest.
   - fixtures(o) / routeFor(url, fx): canned answers for every live API the
     page calls (weather, Lanyard, Steam, Jikan, Letterboxd, the playlist
     feed, ListenBrainz, ZenQuotes), so a run measures the page, not the
     weather. Fonts are stubbed unless the caller lets them through.
   - launchChrome({ gpu }): headless Chrome over the DevTools protocol.
   - mockScript(cfg): source for a pinned clock that still ticks in real time
     and a Lanyard socket that behaves. Runs before any page script.
   - openPage(chrome, srv, opts): a new tab with the device emulated, every
     request outside the local server answered from the fixtures, and the
     caller's init script installed.
   Moved out of perf.js unchanged in behaviour; perf.js keeps its scenarios,
   its frame sampler and its CLI.
   ========================================================================== */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var childProcess = require('child_process');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ------------------------------------------------------------ static server */

var TEXT = /\.(html|css|js|json|svg|xml|webmanifest|txt)$/;
var MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain'
};

function startServer(root) {
  var served = { requests: 0, bytes: 0, byPath: {} };
  var server = http.createServer(function (req, res) {
    var url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    var file = path.join(root, url);
    if (file.indexOf(root) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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

// o: { date, weather: clear | rain | snow | cloudy, presence: active | idle }
function fixtures(o) {
  var now = Date.parse(o.date);
  var day = function (n) { return new Date(now + n * 86400000).toISOString().slice(0, 10); };
  var codes = { clear: 1, rain: 63, snow: 73, cloudy: 3 };
  var code = codes[o.weather] != null ? codes[o.weather] : 1;
  // Open-Meteo's is_day follows the UK hour of the pinned clock (06:00-20:59 = day), so a night
  // date exercises the clear-night aurora.
  var ukHour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(new Date(now)) % 24;
  var weather = {
    current: { temperature_2m: 15.4, weather_code: code, wind_speed_10m: o.weather === 'rain' ? 38 : 14, is_day: ukHour >= 6 && ukHour < 21 ? 1 : 0,
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

var CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

function findChrome() {
  for (var i = 0; i < CHROME_CANDIDATES.length; i++) if (fs.existsSync(CHROME_CANDIDATES[i])) return CHROME_CANDIDATES[i];
  throw new Error('No Chrome/Chromium found; set CHROME_PATH');
}

// opts.gpu: 'soft' runs GPU work in software (SwiftShader), anything else keeps the real GPU.
async function launchChrome(opts) {
  opts = opts || {};
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kazu-perf-'));
  var flags = ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--disable-background-networking', '--disable-sync',
    '--disable-component-update', '--disable-default-apps', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,Translate',
    '--metrics-recording-only', '--force-color-profile=srgb', 'about:blank'];
  if (opts.gpu === 'soft') flags.splice(1, 0, '--disable-gpu');
  // Hosted CI runners restrict the user namespaces Chrome's sandbox needs and have a tiny /dev/shm.
  if (process.env.CI) flags.splice(1, 0, '--no-sandbox', '--disable-dev-shm-usage');
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

/* A pinned clock that still ticks in real time and a Lanyard socket that
   behaves. cfg: { now: ms (the start of a UK minute), lanyard: the INIT_STATE
   payload, steady: roll the first minute tick after 3 s }. Returns source to
   run before any page script. */
function mockScript(cfg) {
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
  } + ')(' + JSON.stringify({ now: cfg.now, lanyard: cfg.lanyard, steady: !!cfg.steady }) + ');';
}

/* A new tab. opts: { device: { width, height, dpr, mobile, touch, ua? },
   fx: fixtures(), fonts: 'stub' | 'real', init: source run before any page
   script }. Requests to the local server (and data: URLs) go through; real
   fonts go through when asked; everything else is answered from the fixtures
   or refused. */
async function openPage(chrome, srv, opts) {
  var d = opts.device, fx = opts.fx;
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
      if (opts.fonts === 'real' && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) {
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
  if (opts.init) await call('Page.addScriptToEvaluateOnNewDocument', { source: opts.init });
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
    close: function () { return chrome.send('Target.closeTarget', { targetId: t.targetId }).catch(function () {}); }
  };
}

module.exports = {
  sleep: sleep, startServer: startServer, fixtures: fixtures, routeFor: routeFor, solidPng: solidPng,
  findChrome: findChrome, launchChrome: launchChrome, mockScript: mockScript, openPage: openPage
};
