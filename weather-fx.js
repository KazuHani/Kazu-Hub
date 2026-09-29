/* ============================================================================
   weather-fx.js — live weather layers for the page background (desktop only).
   ----------------------------------------------------------------------------
   Rain, snow, wind and clouds drawn on ONE fixed <canvas> behind the content,
   driven by the current weather that script.js already fetches for the UK
   (Aberystwyth). Layers combine only when the weather says so: cloudy + raining
   plays both, a windy day adds wind streaks and leans the rain, and so on.

   Loaded on demand: script.js injects this file only for visitors who pass
   KazuLib.weatherFxAllowed (no phones or tablets, no narrow windows, no
   reduced-motion / save-data / low-power devices), so mobile visitors never
   download, parse or run any of it. style.css hides the canvas on those
   devices too, as a second, independent guard.

   Built to be cheap:
     - one canvas at half resolution (the layer is soft, background ambience,
       and every pixel is composited under the liquid-glass cards);
     - 30 fps for rain/snow/wind, 12 fps when only slow clouds are showing,
       halved again while the page is scrolling;
     - a handful of BATCHED paths per frame (one stroke per depth bucket, not
       one per drop) and pre-rendered cloud sprites: ~600 canvas calls at the
       very worst, gate-tested;
     - nothing at all runs (no canvas, no rAF) when the weather is clear;
     - paused behind an open modal and in hidden tabs;
     - a frame-time governor: if the page can't hold ~36 fps the density steps
       down, and past the last step the effect switches itself off.

   Everything deterministic (weather -> layers, quality governor, particle
   physics with a seeded RNG, colours, draw budget) is DOM-free so tests.js /
   tests.html can pin it; only mount()/frame() at the bottom touch the DOM.
   Plain ES5-ish, attaches KazuWeatherFx to the global (browser and Node).
   ========================================================================== */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  // ---- Tunables ---------------------------------------------------------
  var WIND_MIN_KMH = 32;      // 20 mph: "windy" (streaks start here at 20% strength)
  var WIND_FULL_KMH = 80;     // 50 mph: a gale, full-strength streaks
  var CLOUD_MIN_COVER = 25;   // % cloud cover below which the sky reads as clear
  var MAX = { rain: 240, snow: 200, clouds: 14, wind: 14 }; // particles at intensity 1, quality 1
  var QUALITY_LEVELS = [1, 0.6, 0.35, 0.18];                // density factor per governor level
  var SLOW_FRAME_MS = 28;     // average rAF interval above this (~36 fps) steps quality down
  var FAST_FPS = 30;          // rain / snow / wind
  var SLOW_FPS = 12;          // clouds only (they drift a few px a second)
  var SCALE = 0.5;            // canvas resolution relative to CSS px
  var EASE_RATE = 0.4;        // layer intensity change per second (fade in / out ~2.5s)
  var SPRITE_W = 460, SPRITE_H = 220; // cloud sprite size in CSS px at scale 1

  // ---- Weather -> layers ------------------------------------------------
  // Open-Meteo WMO weather_code tables. Intensity is 0..1 and drives particle
  // count and opacity. A code that is not listed contributes nothing.
  var RAIN_BY_CODE = {
    51: 0.25, 53: 0.35, 55: 0.45, 56: 0.35, 57: 0.5,                       // drizzle (56/57 freezing)
    61: 0.45, 63: 0.65, 65: 0.9, 66: 0.65, 67: 0.9,                        // rain (66/67 freezing)
    80: 0.5, 81: 0.7, 82: 1,                                               // rain showers
    95: 0.85, 96: 0.95, 99: 1                                              // thunderstorm (96/99 with hail)
  };
  var SNOW_BY_CODE = { 71: 0.35, 73: 0.6, 75: 0.9, 77: 0.3, 85: 0.55, 86: 0.85 };
  // Cloud cover (%) implied by the code, used only when the API gives none.
  var COVER_BY_CODE = { 0: 5, 1: 15, 2: 50, 3: 95, 45: 100, 48: 100 };

  function clamp01(v) { v = +v; return v > 0 ? (v < 1 ? v : 1) : 0; }
  function round2(v) { return Math.round(v * 100) / 100; }

  // 0 below CLOUD_MIN_COVER, then 0.2 .. 1 up to full overcast.
  function cloudsFromCover(cover) {
    if (!(cover >= CLOUD_MIN_COVER)) return 0;
    return round2(0.2 + 0.8 * Math.min(1, (cover - CLOUD_MIN_COVER) / (100 - CLOUD_MIN_COVER)));
  }

  // 0 below WIND_MIN_KMH, then 0.2 .. 1 up to WIND_FULL_KMH.
  function windFromKmh(kmh) {
    if (!(kmh >= WIND_MIN_KMH)) return 0;
    return round2(0.2 + 0.8 * Math.min(1, (kmh - WIND_MIN_KMH) / (WIND_FULL_KMH - WIND_MIN_KMH)));
  }

  // +1 when the wind blows left -> right on screen, -1 right -> left.
  // `windDir` is the meteorological direction the wind comes FROM, in degrees:
  // a westerly (180..360) blows east, so left -> right. Missing / due-north /
  // due-south all fall back to the UK's prevailing westerly look.
  function windSignFor(windDir) {
    if (windDir == null || windDir === '') return 1;
    var d = +windDir;
    if (isNaN(d)) return 1;
    var s = Math.round(Math.sin(d * Math.PI / 180) * 1000) / 1000;
    return s > 0 ? -1 : 1;
  }

  // The whole rule set: what does this weather look like?
  //   w = { code, cloudCover (%, optional), windKmh, windDir (deg, optional) }
  // Returns { rain, snow, clouds, wind, windSign, windKmh, active } with each
  // layer 0..1. Rain and snow come from one weather code, so they never
  // overlap; rain/snow imply cloud (the precipitation has to come from
  // somewhere) whatever cover the API reports; fog reads as full cover.
  function layersFor(w) {
    w = w || {};
    var code = +w.code;
    var rain = RAIN_BY_CODE[code] || 0;
    var snow = SNOW_BY_CODE[code] || 0;
    var cover;
    if (w.cloudCover != null && w.cloudCover !== '' && !isNaN(+w.cloudCover)) cover = +w.cloudCover;
    else cover = COVER_BY_CODE.hasOwnProperty(code) ? COVER_BY_CODE[code] : 0;
    if (rain || snow) cover = Math.max(cover, code >= 80 && code <= 82 ? 75 : 85);
    var kmh = +w.windKmh;
    if (isNaN(kmh)) kmh = 0;
    var out = {
      rain: rain,
      snow: snow,
      clouds: cloudsFromCover(cover),
      wind: windFromKmh(kmh),
      windSign: windSignFor(w.windDir),
      windKmh: kmh
    };
    out.active = out.rain > 0 || out.snow > 0 || out.clouds > 0 || out.wind > 0;
    return out;
  }

  // Preview override: ?weather=rain,wind,clouds,snow,storm,all,none, each with
  // an optional strength (rain:1, clouds:0.4). Returns a layers object in the
  // same shape as layersFor, or null when there is nothing usable (-> the real
  // weather is used). `none` forces a clear sky.
  function forcedParse(raw) {
    if (typeof raw !== 'string') return null;
    var v = raw.toLowerCase().replace(/^\s+|\s+$/g, '');
    if (!v) return null;
    var out = { rain: 0, snow: 0, clouds: 0, wind: 0 }, any = false;
    var parts = v.split(',');
    for (var i = 0; i < parts.length; i++) {
      var bits = parts[i].replace(/\s+/g, '').split(':');
      var name = bits[0];
      var lvl = bits.length > 1 ? parseFloat(bits[1]) : NaN;
      var has = !isNaN(lvl);
      lvl = clamp01(lvl);
      if (name === 'rain') { out.rain = has ? lvl : 0.7; any = true; }
      else if (name === 'drizzle') { out.rain = has ? lvl : 0.3; any = true; }
      else if (name === 'snow') { out.snow = has ? lvl : 0.7; any = true; }
      else if (name === 'clouds' || name === 'cloud' || name === 'cloudy') { out.clouds = has ? lvl : 0.8; any = true; }
      else if (name === 'wind' || name === 'windy') { out.wind = has ? lvl : 0.7; any = true; }
      else if (name === 'storm') { out.rain = 1; out.wind = 1; out.clouds = 1; any = true; }
      else if (name === 'all') { out.rain = 0.7; out.wind = 0.7; out.clouds = 0.8; any = true; }
      else if (name === 'none' || name === 'clear') any = true;
    }
    if (!any) return null;
    out.windSign = 1;
    out.windKmh = out.wind > 0 ? Math.round(WIND_MIN_KMH + (out.wind - 0.2) / 0.8 * (WIND_FULL_KMH - WIND_MIN_KMH)) : 0;
    out.active = out.rain > 0 || out.snow > 0 || out.clouds > 0 || out.wind > 0;
    return out;
  }

  // ---- Quality governor -------------------------------------------------
  // level 0..3 index QUALITY_LEVELS; level 4 = off. Down-only within a session:
  // one slow window steps density down, and the level after the last switches
  // the effect off for good (an oscillating governor would itself cost frames).
  function qualityStep(level, avgFrameMs) {
    var l = +level;
    if (!(l >= 0)) l = 0;
    if (l >= QUALITY_LEVELS.length) return l;
    return avgFrameMs > SLOW_FRAME_MS ? l + 1 : l;
  }
  function qualityFactor(level) {
    var l = +level;
    if (!(l >= 0)) l = 0;
    return l >= QUALITY_LEVELS.length ? 0 : QUALITY_LEVELS[l];
  }

  // Particles to simulate/draw for a layer at `intensity` and quality `factor`.
  function countFor(kind, intensity, factor) {
    var i = clamp01(intensity);
    if (i < 0.02) return 0;
    return Math.min(MAX[kind], Math.ceil(MAX[kind] * i * clamp01(factor)));
  }

  // ---- Colours ----------------------------------------------------------
  // Clouds follow the time of day: slate-grey at night, white-blue at midday,
  // blushing towards orange at sunrise/sunset (daylight / dusk come from
  // KazuLib.skyTint via script.js). Returns [r, g, b].
  function cloudRgb(sky) {
    sky = sky || {};
    var d = clamp01(sky.daylight), du = clamp01(sky.dusk);
    var r = 105 + 133 * d, g = 122 + 124 * d, b = 152 + 103 * d;
    var w = du * 0.55;
    r += (255 - r) * w; g += (176 - g) * w; b += (140 - b) * w;
    return [Math.round(r), Math.round(g), Math.round(b)];
  }
  // Whole-cloud opacity: faint silhouettes at night, clearer by day.
  function cloudAlpha(sky) {
    return round2(0.13 + 0.15 * clamp01(sky && sky.daylight));
  }
  // Sprites only rebuild when the colour moves by a visible step.
  function cloudKey(sky) {
    var c = cloudRgb(sky);
    return (c[0] >> 3) + ',' + (c[1] >> 3) + ',' + (c[2] >> 3);
  }

  // ---- Seeded RNG (mulberry32) ------------------------------------------
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Scene: particle state + physics ------------------------------------
  // All coordinates are CSS px; the canvas transform applies SCALE.
  function createScene(W, H, opts) {
    opts = opts || {};
    var rng = makeRng(opts.seed != null ? opts.seed : 0x5EED);
    var i;
    var sc = {
      W: W, H: H, rng: rng,
      cur: { rain: 0, snow: 0, clouds: 0, wind: 0 },
      sign: 1, windKmh: 0, quality: 1,
      sky: { daylight: 0.5, dusk: 0 },
      makeCanvas: opts.makeCanvas || null,
      sprites: null, spriteKey: '',
      nRain: 0, nSnow: 0, nClouds: 0,
      rain: { x: new Float32Array(MAX.rain), y: new Float32Array(MAX.rain), z: new Float32Array(MAX.rain) },
      snow: { x: new Float32Array(MAX.snow), y: new Float32Array(MAX.snow), z: new Float32Array(MAX.snow), p: new Float32Array(MAX.snow) },
      clouds: { x: new Float32Array(MAX.clouds), y: new Float32Array(MAX.clouds), z: new Float32Array(MAX.clouds), s: new Float32Array(MAX.clouds), v: new Uint8Array(MAX.clouds) },
      wisps: []
    };
    for (i = 0; i < MAX.rain; i++) { sc.rain.x[i] = rng() * W; sc.rain.y[i] = rng() * H; sc.rain.z[i] = rng(); }
    for (i = 0; i < MAX.snow; i++) { sc.snow.x[i] = rng() * W; sc.snow.y[i] = rng() * H; sc.snow.z[i] = rng(); sc.snow.p[i] = rng() * TAU; }
    for (i = 0; i < MAX.clouds; i++) {
      var z = (i * 0.6180339887) % 1;                 // spread depth evenly whatever count is active
      var s = 0.65 + 1.0 * z;                          // nearer clouds are bigger
      sc.clouds.z[i] = z;
      sc.clouds.s[i] = s;
      sc.clouds.v[i] = i % 3;
      sc.clouds.x[i] = rng() * (W + SPRITE_W * s) - SPRITE_W * s;
      sc.clouds.y[i] = (0.0 + rng() * 0.6) * H - SPRITE_H * s * 0.35; // upper sky, partly off the top is fine
    }
    return sc;
  }

  // Advance the scene by dt seconds towards `target` (a layersFor result).
  // Returns true while anything is still visible or should be.
  function stepScene(sc, dt, target) {
    var W = sc.W, H = sc.H, rng = sc.rng, i, k;
    target = target || {};
    sc.sign = target.windSign === -1 ? -1 : 1;
    sc.windKmh = +target.windKmh || 0;
    // Ease each layer's intensity so weather changes fade rather than pop.
    var names = ['rain', 'snow', 'clouds', 'wind'], step = EASE_RATE * dt;
    for (k = 0; k < names.length; k++) {
      var t = +target[names[k]] || 0, c = sc.cur[names[k]];
      sc.cur[names[k]] = c < t ? Math.min(t, c + step) : Math.max(t, c - step);
    }
    sc.nRain = countFor('rain', sc.cur.rain, sc.quality);
    sc.nSnow = countFor('snow', sc.cur.snow, sc.quality);
    sc.nClouds = countFor('clouds', sc.cur.clouds, sc.quality);

    // Rain: falls fast, leans with the wind.
    var slant = Math.min(0.6, sc.windKmh / 90), span = H * slant, sign = sc.sign;
    var r = sc.rain, n = sc.nRain, sp;
    for (i = 0; i < n; i++) {
      sp = 700 + 800 * r.z[i];
      r.y[i] += sp * dt;
      r.x[i] += sign * slant * sp * dt;
      if (r.y[i] > H + 40) {
        r.y[i] = -20 - rng() * 60;
        r.x[i] = rng() * (W + span) - (sign > 0 ? span : 0);
      }
    }
    // Snow: slow fall, gentle sway, pushed sideways by the wind.
    var s = sc.snow, ns = sc.nSnow, drift = sign * sc.windKmh * 0.9;
    for (i = 0; i < ns; i++) {
      s.y[i] += (30 + 70 * s.z[i]) * dt;
      s.p[i] += dt * (0.6 + s.z[i]);
      s.x[i] += (drift * (0.4 + 0.6 * s.z[i]) + Math.sin(s.p[i]) * 14) * dt;
      if (s.y[i] > H + 8) { s.y[i] = -8; s.x[i] = rng() * W; }
      if (s.x[i] > W + 12) s.x[i] = -12; else if (s.x[i] < -12) s.x[i] = W + 12;
    }
    // Clouds: drift with the wind, wrapping round the edges.
    var cl = sc.clouds, nc = sc.nClouds;
    var base = sign * (4 + sc.windKmh * 0.55);
    for (i = 0; i < nc; i++) {
      var sw = SPRITE_W * cl.s[i];
      cl.x[i] += base * (0.35 + 0.65 * cl.z[i]) * dt;
      if (sign > 0 && cl.x[i] > W) cl.x[i] = -sw;
      else if (sign < 0 && cl.x[i] + sw < 0) cl.x[i] = W;
    }
    // Wind: long faint streaks that sweep across and fade.
    var w = sc.wisps, wi = sc.cur.wind;
    for (i = w.length - 1; i >= 0; i--) {
      w[i].age += dt;
      if (w[i].age >= w[i].ttl) w.splice(i, 1);
    }
    var want = wi < 0.02 ? 0 : Math.round((2 + 12 * wi) * sc.quality);
    if (w.length < want && rng() < Math.min(1, dt * 6)) {
      var len = 160 + rng() * 300;
      w.push({
        x0: rng() * (W + len) - len, y: H * (0.04 + rng() * 0.78), len: len,
        speed: (380 + rng() * 520) * (0.6 + 0.6 * wi), age: 0, ttl: 1.4 + rng() * 1.8,
        amp: 4 + rng() * 12, ph: rng() * TAU
      });
    }
    return sc.cur.rain > 0.005 || sc.cur.snow > 0.005 || sc.cur.clouds > 0.005 || sc.cur.wind > 0.005 ||
      w.length > 0 || (+target.rain > 0) || (+target.snow > 0) || (+target.clouds > 0) || (+target.wind > 0);
  }

  // ---- Cloud sprites ----------------------------------------------------
  // Three soft cumulus shapes pre-rendered once per colour step (radial
  // gradient puffs, flat-ish base), so a frame only blits them.
  function buildSprites(sc) {
    var rgb = cloudRgb(sc.sky), out = [], v, i;
    for (v = 0; v < 3; v++) {
      var cv = sc.makeCanvas(Math.ceil(SPRITE_W * SCALE), Math.ceil(SPRITE_H * SCALE));
      var c = cv.getContext('2d');
      c.scale(SCALE, SCALE);
      var rng = makeRng(1000 + v * 77), puffs = 6 + v;
      var col = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
      for (i = 0; i < puffs; i++) {
        var u = puffs === 1 ? 0.5 : i / (puffs - 1);
        var bump = Math.sin(Math.PI * u);                  // 0 at the ends, 1 in the middle
        var cx = 70 + u * (SPRITE_W - 140) + (rng() - 0.5) * 22;
        var rad = 46 + bump * 34 + rng() * 16;
        var cy = SPRITE_H - 70 - bump * (34 + rng() * 26) + (rng() - 0.5) * 8;
        var g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, 'rgba(' + col + ',0.85)');
        g.addColorStop(0.55, 'rgba(' + col + ',0.38)');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, cy, rad, 0, TAU);
        c.fill();
      }
      out.push(cv);
    }
    sc.sprites = out;
    sc.spriteKey = cloudKey(sc.sky);
  }

  // ---- Drawing ----------------------------------------------------------
  function drawScene(sc, ctx) {
    var W = sc.W, H = sc.H, cur = sc.cur, i;
    ctx.clearRect(0, 0, W, H);

    // Clouds (behind everything else in this layer).
    if (sc.nClouds > 0 && sc.makeCanvas) {
      if (!sc.sprites || sc.spriteKey !== cloudKey(sc.sky)) buildSprites(sc);
      var cl = sc.clouds, a0 = cloudAlpha(sc.sky) * Math.min(1, cur.clouds * 1.3);
      for (i = 0; i < sc.nClouds; i++) {
        ctx.globalAlpha = a0 * (0.45 + 0.55 * cl.z[i]);
        ctx.drawImage(sc.sprites[cl.v[i]], cl.x[i], cl.y[i], SPRITE_W * cl.s[i], SPRITE_H * cl.s[i]);
      }
      ctx.globalAlpha = 1;
    }

    // Wind streaks: two strokes each (a faint wide one under a brighter thin one).
    var w = sc.wisps;
    if (w.length) {
      ctx.strokeStyle = '#e6f0ff';
      ctx.lineCap = 'round';
      for (i = 0; i < w.length; i++) {
        var q = w[i];
        var hx = q.x0 + sc.sign * q.speed * q.age, tx = hx - sc.sign * q.len;
        if ((hx < -20 && tx < -20) || (hx > W + 20 && tx > W + 20)) continue;
        var a = Math.sin(Math.PI * q.age / q.ttl) * (0.1 + 0.14 * cur.wind);
        var y = q.y + Math.sin(q.age * 2 + q.ph) * 6;
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = a * 0.45;
        ctx.beginPath();
        ctx.moveTo(tx, y);
        ctx.quadraticCurveTo((tx + hx) / 2, y - q.amp, hx, y + q.amp * 0.3);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(tx + sc.sign * q.len * 0.3, y - q.amp * 0.15);
        ctx.quadraticCurveTo((tx + hx) / 2, y - q.amp, hx, y + q.amp * 0.3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Rain: one batched stroke per depth bucket.
    if (sc.nRain > 0) {
      var r = sc.rain, slant = Math.min(0.6, sc.windKmh / 90) * sc.sign;
      var norm = 1 / Math.sqrt(1 + slant * slant), la = Math.min(1, cur.rain * 1.4);
      ctx.lineCap = 'butt';
      for (var pass = 0; pass < 2; pass++) {
        var near = pass === 1;
        ctx.strokeStyle = 'rgba(200,220,255,' + (la * (near ? 0.34 : 0.17)).toFixed(3) + ')';
        ctx.lineWidth = near ? 1.6 : 1;
        ctx.beginPath();
        for (i = 0; i < sc.nRain; i++) {
          if ((r.z[i] >= 0.5) !== near) continue;
          var len = 10 + 26 * r.z[i];
          ctx.moveTo(r.x[i], r.y[i]);
          ctx.lineTo(r.x[i] - slant * norm * len, r.y[i] - norm * len);
        }
        ctx.stroke();
      }
    }

    // Snow: one batched fill per depth bucket.
    if (sc.nSnow > 0) {
      var s = sc.snow, sa = Math.min(1, cur.snow * 1.4);
      for (var ps = 0; ps < 2; ps++) {
        var close = ps === 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (sa * (close ? 0.85 : 0.5)).toFixed(3) + ')';
        ctx.beginPath();
        for (i = 0; i < sc.nSnow; i++) {
          if ((s.z[i] >= 0.5) !== close) continue;
          var rad = 1 + 2.6 * s.z[i];
          ctx.moveTo(s.x[i] + rad, s.y[i]);
          ctx.arc(s.x[i], s.y[i], rad, 0, TAU);
        }
        ctx.fill();
      }
    }
  }

  // ---- DOM shell (the only part that touches the page) ------------------------
  var S = null;                 // live state while mounted
  var disabled = false;         // governor gave up: stay off for the session
  var skyNow = { daylight: 0.5, dusk: 0 };
  var lastLayers = null;
  var hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';

  function domMakeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function sizeCanvas() {
    var W = window.innerWidth || 1280, H = window.innerHeight || 720;
    S.canvas.width = Math.ceil(W * SCALE);
    S.canvas.height = Math.ceil(H * SCALE);
    S.ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    var old = S.sc, sc = createScene(W, H, { makeCanvas: domMakeCanvas });
    if (old) { sc.cur = old.cur; sc.wisps = []; }
    sc.sky = skyNow;
    sc.quality = qualityFactor(S.level);
    S.sc = sc;
  }

  function onResize() {
    if (!S) return;
    clearTimeout(S.resizeT);
    S.resizeT = setTimeout(function () { if (S) sizeCanvas(); }, 200);
  }

  function onVisibility() {
    if (!S || document.hidden) return;
    // Coming back from a hidden tab: forget the long gap so the governor
    // doesn't read it as a slow page.
    var now = performance.now();
    S.lastRaf = now; S.lastDraw = now; S.statN = 0; S.statSum = 0; S.warmUntil = now + 1500;
  }

  function mount() {
    if (S || !hasDom || disabled || !window.requestAnimationFrame) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'weather-fx';
    canvas.setAttribute('aria-hidden', 'true');
    var ref = document.querySelector('.atmosphere');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(canvas, ref);
    else document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext('2d');
    if (!ctx) { canvas.parentNode.removeChild(canvas); return; }
    var now = performance.now();
    S = {
      canvas: canvas, ctx: ctx, sc: null, target: {}, fast: false, raf: 0,
      lastRaf: now, lastDraw: 0, statN: 0, statSum: 0, warmUntil: now + 2500,
      level: 0, drawMs: 0, drawn: 0, resizeT: 0
    };
    sizeCanvas();
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    S.raf = requestAnimationFrame(frame);
  }

  function unmount() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    clearTimeout(S.resizeT);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    if (S.canvas.parentNode) S.canvas.parentNode.removeChild(S.canvas);
    S = null;
  }

  function frame(now) {
    if (!S) return;
    S.raf = requestAnimationFrame(frame);

    // Governor: average rAF interval over ~90 ticks, after warm-up, ignoring
    // long gaps (tab switches, debugger pauses).
    var d = now - S.lastRaf;
    S.lastRaf = now;
    if (d > 0 && d < 250 && now > S.warmUntil) {
      S.statSum += d;
      if (++S.statN >= 90) {
        var next = qualityStep(S.level, S.statSum / S.statN);
        S.statN = 0; S.statSum = 0;
        if (next !== S.level) {
          S.level = next;
          if (next >= QUALITY_LEVELS.length) { disabled = true; unmount(); return; }
          S.sc.quality = qualityFactor(next);
        }
      }
    }

    var scrolling = document.documentElement.classList.contains('glass-scrolling');
    var fps = S.fast ? (scrolling ? FAST_FPS / 2 : FAST_FPS) : (scrolling ? SLOW_FPS / 2 : SLOW_FPS);
    var since = now - S.lastDraw;
    if (since < 1000 / fps - 2) return;
    S.lastDraw = now;
    if (document.body.classList.contains('modal-open')) return; // covered by a modal: no work

    var t0 = performance.now();
    var busy = stepScene(S.sc, Math.min(0.1, since / 1000), S.target);
    drawScene(S.sc, S.ctx);
    var ms = performance.now() - t0;
    S.drawMs = S.drawn ? S.drawMs * 0.9 + ms * 0.1 : ms;
    S.drawn++;
    if (!busy) unmount(); // weather cleared and faded out: nothing left to run
  }

  // Public: feed the current weather. `forced` (from ?weather=) replaces it.
  function update(weather, forced) {
    if (disabled) return null;
    var L = forced || layersFor(weather);
    lastLayers = L;
    if (!L.active) {
      if (S) { S.target = L; S.fast = false; } // fade out, then frame() unmounts
      return L;
    }
    if (!S) mount();
    if (S) { S.target = L; S.fast = L.rain > 0 || L.snow > 0 || L.wind > 0; }
    return L;
  }

  // Public: time-of-day colours for the clouds (called every minute).
  function setSky(sky) {
    if (!sky) return;
    skyNow = { daylight: clamp01(sky.daylight), dusk: clamp01(sky.dusk) };
    if (S && S.sc) S.sc.sky = skyNow;
  }

  function stop() {
    if (S) unmount();
  }

  function stats() {
    return {
      mounted: !!S,
      disabled: disabled,
      level: S ? S.level : 0,
      quality: S ? qualityFactor(S.level) : 0,
      drawMs: S ? +S.drawMs.toFixed(3) : 0,
      frames: S ? S.drawn : 0,
      layers: lastLayers
    };
  }

  root.KazuWeatherFx = {
    // pure, gate-tested
    layersFor: layersFor,
    forcedParse: forcedParse,
    windSignFor: windSignFor,
    cloudsFromCover: cloudsFromCover,
    windFromKmh: windFromKmh,
    qualityStep: qualityStep,
    qualityFactor: qualityFactor,
    countFor: countFor,
    cloudRgb: cloudRgb,
    cloudAlpha: cloudAlpha,
    cloudKey: cloudKey,
    makeRng: makeRng,
    createScene: createScene,
    stepScene: stepScene,
    drawScene: drawScene,
    MAX: MAX,
    QUALITY_LEVELS: QUALITY_LEVELS,
    SLOW_FRAME_MS: SLOW_FRAME_MS,
    WIND_MIN_KMH: WIND_MIN_KMH,
    WIND_FULL_KMH: WIND_FULL_KMH,
    CLOUD_MIN_COVER: CLOUD_MIN_COVER,
    // DOM-bound
    update: update,
    setSky: setSky,
    stop: stop,
    stats: stats
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
