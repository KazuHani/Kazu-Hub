(() => {
  const $ = (id) => document.getElementById(id);

  // Birth config is owned by lib.js (single source of truth). Fall back to the
  // literals if lib.js failed to load so the rest of the page still works.
  const KazuLib = window.KazuLib;
  const _BIRTH = (KazuLib && KazuLib.BIRTH) || { year: 2001, month: 10, day: 9 };
  const BIRTH_YEAR = _BIRTH.year;
  const BIRTH_MONTH = _BIRTH.month; // 0-indexed: 10 = November
  const BIRTH_DAY = _BIRTH.day;
  const TIMEZONE = 'Europe/London';
  const DISCORD_ID = '346360416827473921';
  const STEAM_VANITY = 'Kazu-Hani';

  // Owned by lib.js; local copy so the page still escapes safely if lib.js fails to load.
  const escapeHtml = (KazuLib && KazuLib.escapeHtml) || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  // Same for the Steam store-link helper (see lib.js).
  const steamStoreUrl = (KazuLib && KazuLib.steamStoreUrl) || function (url) {
    const m = /\/apps?\/(\d{1,9})\b/.exec(String(url || ''));
    return m ? 'https://store.steampowered.com/app/' + m[1] : null;
  };
  // Same for the software denylist (see lib.js for why a list is the only option).
  const steamIsSoftware = (KazuLib && KazuLib.steamIsSoftware) || function (url) {
    const IDS = { '250820': 1, '431960': 1, '629520': 1, '1905180': 1, '431730': 1, '365670': 1, '274920': 1, '363890': 1, '220700': 1, '993090': 1, '382110': 1, '908520': 1, '1009850': 1, '1325860': 1, '1068820': 1, '1173510': 1, '1494460': 1, '665300': 1 };
    const m = /\/apps?\/(\d{1,9})\b/.exec(String(url || ''));
    return m ? !!IDS[m[1]] : false;
  };
  // Same for the recent-games hours line (see lib.js).
  const steamHoursText = (KazuLib && KazuLib.steamHoursText) || function (hoursPlayed, hoursOnRecord) {
    const recent = (typeof hoursPlayed === 'number' && hoursPlayed > 0) ? hoursPlayed : 0;
    const total = (typeof hoursOnRecord === 'number' && hoursOnRecord > 0) ? hoursOnRecord : 0;
    const fmt = (n) => (n % 1 === 0 ? String(n) : n.toFixed(1));
    if (recent && total && Math.round(recent * 10) !== Math.round(total * 10)) {
      return fmt(recent) + ' hrs last 2 wks · ' + fmt(total) + ' hrs total';
    }
    if (total) return fmt(total) + ' hrs total';
    if (recent) return fmt(recent) + ' hrs last 2 wks';
    return 'played';
  };

  // ---------- Seasons ----------
  // Preview any season on any date: ?season=birthday|christmas|pride|all (comma-combinable, e.g. ?season=birthday,christmas)
  const SEASON_OVERRIDE = (() => {
    try {
      const p = new URLSearchParams(location.search).get('season');
      if (!p) return null;
      const v = p.toLowerCase();
      if (v === 'all') return { birthday: true, christmas: true, pride: true };
      const set = v.split(',').map((s) => s.trim());
      return {
        birthday: set.includes('birthday') || set.includes('bday'),
        christmas: set.includes('christmas') || set.includes('xmas'),
        pride: set.includes('pride'),
      };
    } catch (e) { return null; }
  })();

  // Preview the weather-reactive atmosphere on demand:
  // ?atmosphere=rain|blossom|blossom-heavy|aurora|none
  const ATMOSPHERE_OVERRIDE = (() => {
    try {
      const p = new URLSearchParams(location.search).get('atmosphere');
      if (!p) return null;
      const v = p.toLowerCase().trim();
      if (v === 'off') return 'none';
      return ['rain', 'blossom', 'blossom-heavy', 'aurora', 'none'].includes(v) ? v : null;
    } catch (e) { return null; }
  })();

  // ---------- Dev settings (secret code: kazudev) ----------
  // Typing the code opens a floating panel with per-season Auto/On/Off
  // overrides plus the responsive sky-curve switch. Overrides persist in
  // localStorage across reloads. Matching and parsing live in lib.js
  // (gate-tested); the local copies keep the panel working if lib.js fails.
  const devCodeMatch = (KazuLib && KazuLib.devCodeMatch) || function (recent) {
    const CODE = 'kazudev';
    if (!recent || recent.length < CODE.length) return false;
    const off = recent.length - CODE.length;
    for (let i = 0; i < CODE.length; i++) {
      const k = recent[off + i];
      if (typeof k !== 'string' || k.toLowerCase() !== CODE.charAt(i)) return false;
    }
    return true;
  };
  const seasonDevApply = (KazuLib && KazuLib.seasonDevApply) || function (state, overrides) {
    const s = state || {};
    const out = { birthday: !!s.birthday, christmas: !!s.christmas, pride: !!s.pride };
    overrides = overrides || {};
    ['birthday', 'christmas', 'pride'].forEach((k) => {
      if (overrides[k] === 'on') out[k] = true;
      else if (overrides[k] === 'off') out[k] = false;
    });
    return out;
  };
  const seasonDevParse = (KazuLib && KazuLib.seasonDevParse) || function () { return null; };
  const devModeParse = (KazuLib && KazuLib.devModeParse) || function (raw) {
    return raw === 'on' || raw === 'off' || raw === 'auto' ? raw : 'auto';
  };

  const DEV_KEY = 'kazu-dev-seasons';
  let devSeasons = {}; // { birthday|christmas|pride: 'on'|'off' } — 'auto' is the absence of a key
  try { devSeasons = seasonDevParse(localStorage.getItem(DEV_KEY)) || {}; } catch (e) {}
  const DEV_CURVE_KEY = 'kazu-dev-curve';
  let devCurveMode = 'auto';
  try { devCurveMode = devModeParse(localStorage.getItem(DEV_CURVE_KEY)); } catch (e) {}

  function saveDevSeasons() {
    try {
      if (Object.keys(devSeasons).length) localStorage.setItem(DEV_KEY, JSON.stringify(devSeasons));
      else localStorage.removeItem(DEV_KEY); // all-auto: leave no trace
    } catch (e) {}
  }

  function saveDevCurve() {
    try {
      if (devCurveMode === 'auto') localStorage.removeItem(DEV_CURVE_KEY);
      else localStorage.setItem(DEV_CURVE_KEY, devCurveMode);
    } catch (e) {}
  }

  function seasonState(now) {
    if (SEASON_OVERRIDE) return SEASON_OVERRIDE; // the ?season= param beats even the dev panel
    const m = now.getMonth(), d = now.getDate(); // visitor-local: Christmas & pride are ambient
    // The birthday season follows the UK wall clock: it's Kazu's day, in the UK.
    let bM = m, bD = d;
    if (KazuLib && KazuLib.ukWallParts) {
      const w = KazuLib.ukWallParts(now);
      bM = w.month; bD = w.day;
    }
    return seasonDevApply({
      birthday: (bM === BIRTH_MONTH && bD === BIRTH_DAY), // Nov 9, UK time
      christmas: (m === 11 && d === 25),                  // Dec 25
      pride: (m === 5),                                   // all of June
    }, devSeasons);
  }

  let bdayCelebrated = false; // latch so confetti fires once per OFF->ON birthday transition

  // ---------- Clock / age / birthday ----------
  // Intl.DateTimeFormat construction is one of the priciest built-ins there
  // is, and these two used to be rebuilt on every per-second tick. Construct
  // once, reuse forever. en-GB 12-hour, matching the time modal (fmtTimeUK).
  const fmtClockTime = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const fmtClockDate = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  function computeClock() {
    const now = new Date();
    const timeStr = fmtClockTime.format(now);
    const dateStr = fmtClockDate.format(now);

    let ageStr, bdayText, bdaySub;
    if (KazuLib) {
      // UK wall clock (see lib.js): the birthday flips at midnight in the UK,
      // not at midnight in the visitor's timezone.
      const p = KazuLib.birthdayCountdownParts(now);
      ageStr = String(p.ageNow);
      if (p.isToday) {
        bdayText = '🎉 Today!';
        bdaySub = 'Happy birthday — turning ' + p.ageNow;
      } else {
        bdayText = p.calDays + (p.calDays === 1 ? ' day' : ' days');
        bdaySub = 'until turning ' + p.turning;
      }
    } else {
      // Fallback if lib.js failed to load: visitor-local math (approximate).
      let age = now.getFullYear() - BIRTH_YEAR;
      const m = now.getMonth(), d = now.getDate();
      const hadBday = (m > BIRTH_MONTH) || (m === BIRTH_MONTH && d >= BIRTH_DAY);
      if (!hadBday) age--;

      let target = new Date(now.getFullYear(), BIRTH_MONTH, BIRTH_DAY);
      const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (todayMid > target) target = new Date(now.getFullYear() + 1, BIRTH_MONTH, BIRTH_DAY);
      const days = Math.round((target - todayMid) / 86400000);
      const isToday = (m === BIRTH_MONTH && d === BIRTH_DAY);

      ageStr = String(age);
      if (isToday) {
        bdayText = '🎉 Today!';
        bdaySub = 'Happy birthday — turning ' + age;
      } else {
        bdayText = days + (days === 1 ? ' day' : ' days');
        bdaySub = 'until turning ' + (age + 1);
      }
    }
    return { timeStr, dateStr, ageStr, bdayText, bdaySub };
  }

  function tick() {
    const c = computeClock();
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    set('liveTime', c.timeStr);
    set('liveDate', c.dateStr);
    set('liveAge', c.ageStr);
    set('liveBday', c.bdayText);
    set('liveBdaySub', c.bdaySub);
    updatePresenceProgress(); // advance the Discord Spotify bar / game timer smoothly between polls
    applySeasons(); // re-evaluate every second so a page left open crosses midnight correctly
  }

  // ---------- Fetch timeout wrapper ----------
  // A hung API or proxy (corsproxy.io on a bad day) used to pin a card on its
  // loading line forever. AbortSignal.timeout fails the fetch fast instead,
  // landing in each loader's existing catch (error card / localStorage cache
  // / fallback quotes) — no new failure modes. Older browsers without it get
  // exactly today's behaviour.
  function fetchT(url, opts) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return fetch(url, Object.assign({}, opts, { signal: AbortSignal.timeout(12000) }));
    }
    return fetch(url, opts);
  }

  // ---------- Render dedup signatures ----------
  // Polls regularly return the same data as the previous cycle. Each renderer
  // compares a JSON signature and skips the DOM rewrite when nothing changed,
  // so an unchanged list costs no re-created <img> nodes, no style/layout pass.
  let lastSteamRecentSig = '';
  let lastMalAnimeSig = '';
  let lastMalMangaSig = '';
  let lastLbSig = '';
  let lastMusicSig = '';
  let lastYtmSig = '';

  // ---------- Weather ----------
  function weatherInfo(code, isDay) {
    if (code === 0) return { e: isDay ? '☀️' : '🌙', d: 'Clear sky' };
    if (code === 1) return { e: isDay ? '🌤️' : '🌙', d: 'Mainly clear' };
    if (code === 2) return { e: '⛅', d: 'Partly cloudy' };
    if (code === 3) return { e: '☁️', d: 'Overcast' };
    if (code === 45 || code === 48) return { e: '🌫️', d: 'Foggy' };
    if (code >= 51 && code <= 57) return { e: '🌦️', d: 'Drizzle' };
    if (code >= 61 && code <= 67) return { e: '🌧️', d: 'Rain' };
    if (code >= 71 && code <= 77) return { e: '❄️', d: 'Snow' };
    if (code >= 80 && code <= 82) return { e: '🌧️', d: 'Rain showers' };
    if (code >= 85 && code <= 86) return { e: '🌨️', d: 'Snow showers' };
    if (code >= 95) return { e: '⛈️', d: 'Thunderstorm' };
    return { e: '🌡️', d: 'Cloudy' };
  }

  let weatherDaily = null;   // Open-Meteo `daily` block for the modal forecast strip
  let weatherCurrent = null; // last good `current` snapshot, reused by "compare with your sky"
  let weatherDone = false;   // true once a fetch attempt has finished (ok or failed)

  async function loadWeather() {
    weatherDone = false;
    try {
      const url = (KazuLib && KazuLib.openMeteoUrl)
        ? KazuLib.openMeteoUrl(52.414, -4.081)
        : 'https://api.open-meteo.com/v1/forecast?latitude=52.414&longitude=-4.081&current=temperature_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=Europe%2FLondon';
      const r = await fetchT(url);
      const j = await r.json();
      const w = j.current;
      weatherDaily = j.daily || null;
      weatherCurrent = {
        code: w.weather_code, isDay: w.is_day === 1,
        tempC: w.temperature_2m, windKmh: w.wind_speed_10m,
      };
      const info = weatherInfo(w.weather_code, w.is_day === 1);
      $('liveTemp').textContent = Math.round(w.temperature_2m) + '°C';
      $('liveWeatherDesc').textContent = info.d;
      $('liveWind').textContent = 'Wind ' + Math.round(w.wind_speed_10m) + ' km/h';
      if (!ATMOSPHERE_OVERRIDE) setAtmosphere(atmosphereMode(w.weather_code, w.is_day === 1));
      $('weatherLoaded').classList.remove('hidden');
      $('weatherLoading').classList.add('hidden');
      $('weatherError').classList.add('hidden');
      weatherDone = true;
      if (modalKey === 'weather') renderForecastStrip();
    } catch (e) {
      weatherDone = true;
      $('weatherLoading').classList.add('hidden');
      $('weatherError').classList.remove('hidden');
      if (modalKey === 'weather') renderForecastStrip();
    }
  }

  // ---------- Weather-reactive atmosphere ----------
  // Ambient particles follow the live weather: rain streaks when it's
  // raining, a heavier petal shower when it's actually snowing, and the
  // cherry-blossom default otherwise. The mode mapping lives in lib.js
  // (KazuLib.atmosphereMode) so it's gate-tested; the local copy keeps the
  // page working if lib.js fails to load.
  const atmosphereMode = (KazuLib && KazuLib.atmosphereMode) || function (code) {
    const c = +code;
    if (isNaN(c)) return 'blossom';
    if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'blossom-heavy';
    if ((c === 0 || c === 1) && arguments[1] === false) return 'aurora';
    return 'blossom';
  };

  const atmosphereEl = document.querySelector('.atmosphere');
  const pageEl = document.querySelector('.page');
  let atmosphereCurrent = null;
  let atmosphereHeight = window.innerHeight;
  let atmosphereBoundsFrame = 0;
  const BLOSSOM_GLYPHS = ['🌸'];
  const SNOW_COLORS = ['#bfe3ff', '#a9d6ff', '#cde8ff', '#b9deff']; // Konami dragon burst only
  const randRange = (min, max) => min + Math.random() * (max - min);

  // Particle density follows the hardware (see KazuLib.particleCount): every
  // petal/drop animates under the glass cards and keeps their backdrop-filter
  // busy, so phones get a lighter drift. Flags are stable for a session.
  const PARTICLE_FLAGS = {
    coarsePointer: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
    smallScreen: Math.min(window.innerWidth, window.innerHeight) < 500,
    lowConcurrency: !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4),
    saveData: !!(navigator.connection && navigator.connection.saveData),
  };
  // particleCount() clamps to a minimum of 8 (it's sized for petals/drops);
  // the one-off canvas bursts (confetti, balloons) scale smaller counts off
  // the same hardware flags directly.
  const lightDevice = PARTICLE_FLAGS.coarsePointer || PARTICLE_FLAGS.smallScreen ||
    PARTICLE_FLAGS.lowConcurrency || PARTICLE_FLAGS.saveData;
  const particleCount = (KazuLib && KazuLib.particleCount) || function (n, o) {
    const light = o && (o.coarsePointer || o.smallScreen || o.lowConcurrency || o.saveData);
    return Math.min(64, Math.max(8, light ? Math.round(n * 0.6) : n));
  };
  const petalFallDuration = (KazuLib && KazuLib.petalFallDuration) || function (pageHeight, spawnY, viewportHeight, baseSeconds, exitPad) {
    const view = +viewportHeight;
    const base = +baseSeconds;
    if (!isFinite(view) || view <= 0 || !isFinite(base) || base <= 0) return 0;
    const page = !isFinite(+pageHeight) || +pageHeight < view ? view : +pageHeight;
    const spawn = isFinite(+spawnY) ? +spawnY : 0;
    const pad = isFinite(+exitPad) && +exitPad >= 0 ? +exitPad : 0;
    const reference = view * 1.12;
    return Math.round(base * Math.max(reference, page - spawn + pad) / reference * 100) / 100;
  };

  // Blossom mode owns a page-height runway. A ResizeObserver follows the
  // natural .page height as live cards and responsive layouts settle, then a
  // single CSS custom property updates every petal's transform-only endpoint.
  // Rain and aurora intentionally retain their original one-viewport layer.
  function measureAtmosphereHeight() {
    if (!pageEl) return Math.max(window.innerHeight, document.documentElement.scrollHeight);
    const r = pageEl.getBoundingClientRect();
    return Math.max(window.innerHeight, Math.ceil(r.bottom + window.scrollY));
  }

  function syncPetalDurations() {
    if (!atmosphereEl) return;
    atmosphereEl.querySelectorAll('.petal[data-base-fall]').forEach((petal) => {
      const fall = petalFallDuration(
        atmosphereHeight,
        +petal.dataset.spawnY,
        window.innerHeight,
        +petal.dataset.baseFall,
        +petal.dataset.exitPad
      );
      petal.style.animationDuration = fall.toFixed(2) + 's, ' + petal.dataset.swayDuration + 's, ' + petal.dataset.rockDuration + 's';
    });
  }

  function syncAtmosphereBounds() {
    atmosphereBoundsFrame = 0;
    if (!atmosphereEl) return;
    atmosphereHeight = measureAtmosphereHeight();
    atmosphereEl.style.setProperty('--atmosphere-height', atmosphereHeight + 'px');
    syncPetalDurations();
  }

  function scheduleAtmosphereBounds() {
    if (atmosphereBoundsFrame) return;
    atmosphereBoundsFrame = requestAnimationFrame(syncAtmosphereBounds);
  }

  if (atmosphereEl) {
    syncAtmosphereBounds();
    window.addEventListener('resize', scheduleAtmosphereBounds, { passive: true });
    window.addEventListener('load', scheduleAtmosphereBounds, { once: true });
    if ('ResizeObserver' in window && pageEl) new ResizeObserver(scheduleAtmosphereBounds).observe(pageEl);
  }

  // Petal physics: fallY carries each petal down a steady wind-drifted path
  // (--dx = total sideways travel across the fall, AWAY from its branch), a
  // tight flutter wobbles on top and a slow tumble rocks it (keyframes in
  // style.css). Blossom mode spawns petals
  // AT the branches: the anchors below are blossom positions in each SVG's
  // viewBox, projected through the branch's live on-screen rect, so a petal
  // starts exactly where a drawn blossom sits at any viewport width. It
  // fades in on the spot (fallY), then drifts down and AWAY from its edge,
  // so the shower visibly comes out of the trees. blossom-heavy stays a
  // plain top-down shower, and with no branch on screen (narrow phones
  // aside, e.g. mid-scroll rebuilds) blossom mode falls back to the top edge.
  const BRANCH_A = document.querySelector('.sakura-branch--a');
  const BRANCH_B = document.querySelector('.sakura-branch--b');
  const ANCHORS_A = [[150, 214], [176, 184], [206, 154], [238, 128], [282, 102], [326, 66], [386, 30], [292, 146], [300, 224], [152, 146]];
  const ANCHORS_B = [[214, 78], [160, 44], [124, 214], [92, 150], [28, 232], [60, 196], [148, 102]];

  // Blossom anchors as page-layer spawn points: x remains a width percentage;
  // y is a pixel offset inside the document-height atmosphere. Measuring both
  // against the layer rect keeps the detachment point exact at any scroll.
  function branchSpawnPoints() {
    const pts = [];
    if (!atmosphereEl) return null;
    const layer = atmosphereEl.getBoundingClientRect();
    if (!layer.width) return null;
    const add = (el, anchors, boxW, boxH, dir) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return;
      anchors.forEach(a => pts.push({
        x: (r.left + a[0] / boxW * r.width - layer.left) / layer.width * 100,
        y: r.top + a[1] / boxH * r.height - layer.top,
        dx: dir,
      }));
    };
    add(BRANCH_A, ANCHORS_A, 460, 340, -1);
    add(BRANCH_B, ANCHORS_B, 300, 280, 1);
    return pts.length ? pts : null;
  }

  // Depth pass: each petal draws a 0..1 depth (0 = far away, 1 = close);
  // size, sharpness, brightness and fall speed all follow it, so the drift
  // reads as a layered shower instead of a flat curtain of emoji. Opacity
  // travels via --po so fallY can fade fresh petals in as they detach.
  function buildPetals(count, sizeMin, sizeMax, fromBranches) {
    const frag = document.createDocumentFragment();
    const spawns = fromBranches ? branchSpawnPoints() : null;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'petal';
      s.textContent = BLOSSOM_GLYPHS[(Math.random() * BLOSSOM_GLYPHS.length) | 0];
      const depth = Math.random();
      let spawnY;
      if (spawns) {
        const a = spawns[(Math.random() * spawns.length) | 0];
        s.style.left = (a.x + randRange(-1.5, 1.5)).toFixed(1) + '%';
        spawnY = a.y + randRange(-12, 12);
        s.style.top = spawnY.toFixed(1) + 'px';
        s.style.setProperty('--y0', '0vh'); // detach exactly on the blossom
        s.style.setProperty('--dx', (a.dx * randRange(8, 18)).toFixed(1) + 'vw');
      } else {
        const layer = atmosphereEl.getBoundingClientRect();
        spawnY = -layer.top - window.innerHeight * 0.05;
        s.style.left = randRange(0, 100).toFixed(1) + '%';
        s.style.top = spawnY.toFixed(1) + 'px';
        s.style.setProperty('--dx', (randRange(5, 14) * (Math.random() < 0.5 ? -1 : 1)).toFixed(1) + 'vw');
      }
      const size = sizeMin + (sizeMax - sizeMin) * (0.35 + depth * 0.65);
      const exitPad = Math.max(48, size * 2);
      s.style.fontSize = size.toFixed(0) + 'px';
      s.style.setProperty('--spawn-y', spawnY.toFixed(1) + 'px');
      s.style.setProperty('--exit-pad', exitPad.toFixed(1) + 'px');
      s.style.setProperty('--po', (0.42 + depth * 0.43).toFixed(2));
      s.style.filter = 'blur(' + (2.6 - depth * 1.8).toFixed(1) + 'px)';
      // Scale the original one-viewport timing to the remaining page distance
      // so terminal velocity stays familiar. A fresh cohort still detaches at
      // the branches; the rest starts phase-seeded along the long runway so
      // the lower sections are populated from first paint.
      const baseFall = randRange(12, 20 + (1 - depth) * 6);
      const fall = petalFallDuration(atmosphereHeight, spawnY, window.innerHeight, baseFall, exitPad);
      const swayDuration = randRange(2.2, 3.8);
      const rockDuration = randRange(3.5, 6);
      const freshAtBranch = fromBranches && i < Math.max(6, Math.round(count * 0.35));
      const fallDelay = freshAtBranch ? randRange(0, 7) : -randRange(0, fall);
      s.dataset.spawnY = spawnY.toFixed(1);
      s.dataset.baseFall = baseFall.toFixed(2);
      s.dataset.exitPad = exitPad.toFixed(1);
      s.dataset.swayDuration = swayDuration.toFixed(1);
      s.dataset.rockDuration = rockDuration.toFixed(1);
      s.style.animationDuration = fall.toFixed(2) + 's, ' + s.dataset.swayDuration + 's, ' + s.dataset.rockDuration + 's';
      s.style.animationDelay = fallDelay.toFixed(2) + 's, ' + (-randRange(0, 4)).toFixed(1) + 's, ' + (-randRange(0, 5)).toFixed(1) + 's';
      frag.appendChild(s);
    }
    return frag;
  }

  function buildDrops(count) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const d = document.createElement('span');
      d.className = 'drop';
      d.style.left = randRange(0, 100).toFixed(1) + '%';
      d.style.top = '-15%';
      d.style.opacity = randRange(0.35, 0.7).toFixed(2);
      d.style.animationDuration = randRange(0.7, 1.4).toFixed(2) + 's';
      d.style.animationDelay = randRange(0, 2).toFixed(2) + 's';
      frag.appendChild(d);
    }
    return frag;
  }

  // Rebuilds .atmosphere for the given mode (no-op when the mode hasn't
  // changed). The hardcoded petals in index.html are the no-JS fallback;
  // the first call replaces them.
  function setAtmosphere(mode) {
    if (!atmosphereEl || mode === atmosphereCurrent) return;
    atmosphereCurrent = mode;
    atmosphereEl.innerHTML = '';
    const pagePetals = mode === 'blossom' || mode === 'blossom-heavy';
    atmosphereEl.classList.toggle('atmosphere--page', pagePetals);
    if (pagePetals) syncAtmosphereBounds();
    if (mode === 'none') return;
    if (mode === 'rain') { atmosphereEl.appendChild(buildDrops(particleCount(46, PARTICLE_FLAGS))); return; }
    if (mode === 'blossom-heavy') { atmosphereEl.appendChild(buildPetals(particleCount(48, PARTICLE_FLAGS), 12, 26, false)); return; }
    if (mode === 'aurora') {
      // Clear night sky: two drifting light ribbons over a static starfield.
      // Pure CSS animation, no per-frame JS (see style.css).
      const a = document.createElement('div');
      a.className = 'aurora';
      a.innerHTML = '<div class="aurora-stars"></div>' +
        '<div class="aurora-ribbon aurora-ribbon--a"></div>' +
        '<div class="aurora-ribbon aurora-ribbon--b"></div>';
      atmosphereEl.appendChild(a);
      return;
    }
    // cherry-blossom default: petals detach from the sakura branches
    atmosphereEl.appendChild(buildPetals(particleCount(30, PARTICLE_FLAGS), 13, 24, true));
  }

  // ---------- Sky body (sun/moon arc on UK time) ----------
  // The scenery layer's sun (by day) or moon (by night) rides an arc from
  // the left edge of the page to the right, timed to the Europe/London wall
  // clock with approximate Aberystwyth sunrise/sunset. The maths lives in
  // lib.js (KazuLib.skyBodyState, gate-tested); the local copy keeps the sky
  // working if lib.js fails to load. Cheap by construction: one style write
  // a minute, with a CSS transition gliding each step.
  const skySceneEl = document.querySelector('.sakura-scene');
  const skyProfileEl = document.querySelector('.pfp');
  const skyBodyEl = document.querySelector('.sky-body');
  const skyCurveGuideEl = document.querySelector('.sky-curve-guide');
  const skyCurveGuidePaths = skyCurveGuideEl
    ? skyCurveGuideEl.querySelectorAll('.sky-curve-guide__glow, .sky-curve-guide__line')
    : [];
  const skyArcPoint = (KazuLib && KazuLib.skyArcPoint) || function (progress, crestY) {
    let p = +progress;
    if (isNaN(p)) return null;
    p = Math.min(1, Math.max(0, p));
    let crest = crestY == null ? 19 : +crestY;
    if (isNaN(crest)) crest = 19;
    crest = Math.min(52, Math.max(0, crest));
    const alt = Math.sin(Math.PI * p);
    return {
      x: +(6 + p * 88).toFixed(2),
      y: +(52 - alt * (52 - crest)).toFixed(2),
      alt: +alt.toFixed(3),
    };
  };
  const skyBodyState = (KazuLib && KazuLib.skyBodyState) || function (ukMinutes, dayOfYear, crestY) {
    const t0 = +ukMinutes;
    if (isNaN(t0)) return null;
    const t = ((t0 % 1440) + 1440) % 1440;
    let d = Math.round(+dayOfYear);
    if (isNaN(d) || d < 1 || d > 366) d = 172;
    const w = 2 * Math.PI * (d - 172) / 365;
    const rise = Math.round(397.5 - 97.5 * Math.cos(w));
    const set = Math.round(1125 + 165 * Math.cos(w));
    const dayLen = set - rise;
    const isSun = t >= rise && t < set;
    const p = isSun ? (t - rise) / dayLen : ((((t - set) % 1440) + 1440) % 1440) / (1440 - dayLen);
    const point = skyArcPoint(p, crestY);
    return { body: isSun ? 'sun' : 'moon', x: point.x, y: point.y, alt: point.alt, low: point.alt < 0.28 };
  };

  // The scenery's coordinate frame is the viewport, while the profile picture
  // moves with the responsive hero padding. Measure its actual centre so the
  // crest is behind the picture on every screen size, not just one desktop.
  function skyArcPeakY() {
    if (!skySceneEl || !skyProfileEl) return undefined;
    const sceneRect = skySceneEl.getBoundingClientRect();
    const profileRect = skyProfileEl.getBoundingClientRect();
    if (!sceneRect.height || !profileRect.height) return undefined;
    const y = ((profileRect.top + profileRect.height / 2 - sceneRect.top) / sceneRect.height) * 100;
    return +Math.min(52, Math.max(0, y)).toFixed(2);
  }

  // The guide uses the same pure point helper as the live body. Its crest is
  // measured from the profile picture, then redrawn when the viewport changes.
  function renderSkyCurveGuide() {
    if (!skyCurveGuideEl) return;
    const steps = 48;
    const crestY = skyArcPeakY();
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const point = skyArcPoint(i / steps, crestY);
      if (!point) return;
      d += (i ? ' L ' : 'M ') + point.x + ' ' + point.y;
    }
    skyCurveGuidePaths.forEach((path) => path.setAttribute('d', d));
  }
  let skyBodySnapped = false;
  function updateSkyBody() {
    if (!skyBodyEl) return;
    // UK wall frame via lib.js; visitor-local is an acceptable fallback for
    // an ambient feature (same call the seasonal themes make).
    const now = new Date();
    let mins, doy;
    if (KazuLib && KazuLib.ukWallParts) {
      const w = KazuLib.ukWallParts(now);
      mins = w.hours * 60 + w.minutes;
      doy = Math.round((Date.UTC(w.year, w.month, w.day) - Date.UTC(w.year, 0, 1)) / 86400000) + 1;
    } else {
      mins = now.getHours() * 60 + now.getMinutes();
      doy = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86400000) + 1;
    }
    const st = skyBodyState(mins, doy, skyArcPeakY());
    if (!st) return;
    skyBodyEl.classList.toggle('sky-body--sun', st.body === 'sun');
    skyBodyEl.classList.toggle('sky-body--moon', st.body === 'moon');
    skyBodyEl.classList.toggle('sky-body--low', !!st.low);
    if (!skyBodySnapped) {
      // First write: no transition — the body must simply BE in position on
      // load, not glide across the sky from the no-JS default pose. The
      // transition is restored a frame later for the per-minute updates.
      skyBodySnapped = true;
      skyBodyEl.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => { skyBodyEl.style.transition = ''; }));
    }
    skyBodyEl.style.left = st.x + '%';
    skyBodyEl.style.top = st.y + '%';
  }
  // Auto restores the stylesheet's responsive sky-body behaviour and keeps
  // the debug line hidden. On forces both the sky body and its visible guide
  // on for inspection; Off hides both everywhere.
  function applySkyCurveMode(mode) {
    devCurveMode = devModeParse(mode);
    if (skyBodyEl) {
      skyBodyEl.style.display = devCurveMode === 'on' ? 'block' :
        (devCurveMode === 'off' ? 'none' : '');
    }
    if (skyCurveGuideEl) {
      if (devCurveMode === 'on') renderSkyCurveGuide();
      skyCurveGuideEl.style.display = devCurveMode === 'on' ? 'block' : 'none';
    }
  }
  renderSkyCurveGuide();
  applySkyCurveMode(devCurveMode);
  updateSkyBody();
  setInterval(updateSkyBody, 60000);
  let skyLayoutFrame = 0;
  function scheduleSkyLayout() {
    if (skyLayoutFrame) return;
    skyLayoutFrame = requestAnimationFrame(() => {
      skyLayoutFrame = 0;
      renderSkyCurveGuide();
      updateSkyBody();
    });
  }
  window.addEventListener('resize', scheduleSkyLayout, { passive: true });

  // ---------- Discord (Lanyard) ----------
  const STATUS_MAP = {
    online: ['Online', '#43b581'],
    idle: ['Idle', '#faa61a'],
    dnd: ['Do Not Disturb', '#f04747'],
    offline: ['Offline', '#747f8d'],
  };

  let sharedAvatarUrl = ''; // Steam avatar wins once loaded, shared with Discord card

  function discordAvatarUrl(u) {
    return u.avatar
      ? 'https://cdn.discordapp.com/avatars/' + u.id + '/' + u.avatar + (u.avatar.startsWith('a_') ? '.gif' : '.png') + '?size=128'
      : 'https://cdn.discordapp.com/embed/avatars/0.png';
  }

  function gameIconUrl(game) {
    const img = game && game.assets && (game.assets.large_image || game.assets.small_image);
    if (!img) return '';
    if (img.startsWith('mp:external/')) {
      return 'https://media.discordapp.net/external/' + img.slice('mp:external/'.length);
    }
    if (img.startsWith('mp:')) {
      return 'https://media.discordapp.net/' + img.slice('mp:'.length);
    }
    if (game.application_id) {
      return 'https://cdn.discordapp.com/app-assets/' + game.application_id + '/' + img + '.png';
    }
    return '';
  }

  let lastDiscordFallbackAvatar = '';

  // ---- Extra Lanyard presence state (set by renderDiscord, animated by tick) ----
  let discordUsername = '';
  let discordHasData = false; // true after the first successful render
  let spotifyTimes = null;   // { start, end } in ms while listening
  let gameStartMs = null;    // activity start in ms while playing

  const PLATFORM_ICONS = {
    mobile: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M16 1H8a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm-4 21a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zM16 18H8V4h8z"/></svg>',
    desktop: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M21 3H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h7v2H8v2h8v-2h-2v-2h7a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm-1 12H4V5h16z"/></svg>',
    web: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.92 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8 8 0 0 1 18.92 8zM12 4c.83 1.2 1.48 2.53 1.85 4h-3.7c.37-1.47 1.02-2.8 1.85-4zM4.26 14a8 8 0 0 1 0-4h3.38a17.5 17.5 0 0 0 0 4zm.82 2h2.95c.34 1.3.81 2.5 1.38 3.56A8 8 0 0 1 5.08 16zm2.95-8H5.08a8 8 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8zM12 20c-.83-1.2-1.48-2.53-1.85-4h3.7c-.37 1.47-1.02 2.8-1.85 4zm2.34-6H9.66a15.5 15.5 0 0 1 0-4h4.68a15.5 15.5 0 0 1 0 4zm.27 5.56c.57-1.06 1.04-2.26 1.38-3.56h2.95a8 8 0 0 1-4.33 3.56zM16.36 14a17.5 17.5 0 0 0 0-4h3.38a8 8 0 0 1 0 4z"/></svg>',
  };

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtClock(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    if (h > 0) return h + ':' + pad2(Math.floor((total % 3600) / 60)) + ':' + pad2(total % 60);
    return Math.floor(total / 60) + ':' + pad2(total % 60);
  }
  function fmtElapsed(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (h > 0) return 'for ' + h + 'h ' + pad2(m) + 'm';
    if (m > 0) return 'for ' + m + ' min';
    return 'for ' + s + 's';
  }

  // Advance the Spotify bar + game timer smoothly between Lanyard polls (called each second by tick)
  function updatePresenceProgress() {
    const now = Date.now();
    if (spotifyTimes) {
      const dur = spotifyTimes.end - spotifyTimes.start;
      const pos = Math.min(Math.max(now - spotifyTimes.start, 0), Math.max(dur, 0));
      const fill = $('spotifyBarFill');
      if (fill) fill.style.width = (dur > 0 ? (pos / dur) * 100 : 0).toFixed(1) + '%';
      const el = $('spotifyElapsed'); if (el) el.textContent = fmtClock(pos);
      const du = $('spotifyDuration'); if (du) du.textContent = fmtClock(dur);
    }
    const gEl = $('discordGameElapsed');
    if (gEl) {
      if (gameStartMs) { gEl.textContent = fmtElapsed(now - gameStartMs); gEl.classList.remove('hidden'); }
      else { gEl.textContent = ''; gEl.classList.add('hidden'); }
    }
  }

  // ---- Toast + "copy my Discord username" (shared by the Add me pill and the @username line) ----
  let toastTimer = null;
  function showToast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      const done = document.execCommand('copy');
      ta.remove();
      return done;
    } catch (e) { return false; }
  }
  function copyDiscordUsername() {
    if (!discordUsername) return;
    const handle = '@' + discordUsername;
    const ok = () => showToast('Copied ' + handle + ' — add me on Discord!');
    const fallback = () => showToast((legacyCopy(discordUsername) ? 'Copied ' : 'My Discord: ') + handle);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(discordUsername).then(ok).catch(fallback);
    } else {
      fallback();
    }
  }

  // REST fallback: used for the first paint and whenever the socket is down.
  // While the socket is live it is the fresher source, so the poll no-ops.
  // cache: 'no-store' — presence must never come from the browser HTTP cache.
  async function loadDiscord() {
    if (lanyardWsLive) return;
    try {
      const r = await fetchT('https://api.lanyard.rest/v1/users/' + DISCORD_ID, { cache: 'no-store' });
      const j = await r.json();
      if (!j || !j.success || !j.data || !j.data.discord_user) throw new Error('bad payload');
      if (lanyardWsLive) return; // a socket update beat this response
      renderDiscord(j.data);
    } catch (e) {
      // With data already on screen, stay silent: stale beats an error card.
      if (!discordHasData && !lanyardWsLive) {
        $('discordLoading').classList.add('hidden');
        $('discordError').classList.remove('hidden');
      }
    }
  }

  // Renders one Lanyard payload. REST `data` and the WebSocket's
  // INIT_STATE / PRESENCE_UPDATE `d` share the same shape, so both feed here.
  function renderDiscord(dc) {
    const u = dc.discord_user;

    const displayName = u.global_name || u.display_name || u.username;
    lastDiscordFallbackAvatar = discordAvatarUrl(u);
    $('discordAvatar').src = sharedAvatarUrl || lastDiscordFallbackAvatar;
    $('discordName').textContent = displayName;

    discordUsername = u.username || '';
    const handleEl = $('discordUsername');
    if (handleEl) {
      if (u.username) { handleEl.textContent = '@' + u.username; handleEl.classList.remove('hidden'); }
      else handleEl.classList.add('hidden');
    }

    const s = STATUS_MAP[dc.discord_status] || STATUS_MAP.offline;
    $('discordStatusText').textContent = '● ' + s[0];
    $('discordStatusText').style.color = s[1];
    $('discordStatusDot').style.background = s[1];

    // Platform (mobile / desktop / web) — only meaningful while connected
    const plat = (dc.discord_status !== 'offline')
      ? (dc.active_on_discord_mobile ? { k: 'mobile', t: 'Active on mobile' }
        : dc.active_on_discord_desktop ? { k: 'desktop', t: 'Active on desktop' }
        : dc.active_on_discord_web ? { k: 'web', t: 'Active on web' } : null)
      : null;
    const platEl = $('discordPlatform');
    if (platEl) {
      if (plat) { platEl.innerHTML = PLATFORM_ICONS[plat.k]; platEl.title = plat.t; platEl.classList.remove('hidden'); }
      else { platEl.innerHTML = ''; platEl.classList.add('hidden'); }
    }

    // Custom status (activity type 4) — emoji can be unicode or a custom server emoji
    const custom = (dc.activities || []).find((a) => a.type === 4);
    const hasCustom = !!(custom && (custom.state || (custom.emoji && (custom.emoji.id || custom.emoji.name))));
    const customEl = $('discordCustom');
    if (customEl) {
      if (hasCustom) {
        const emojiEl = $('discordCustomEmoji');
        if (custom.emoji && custom.emoji.id) {
          emojiEl.innerHTML = '<img class="discord-custom-emoji-img" src="https://cdn.discordapp.com/emojis/' + custom.emoji.id + (custom.emoji.animated ? '.gif' : '.png') + '?size=32" alt="">';
        } else {
          emojiEl.textContent = (custom.emoji && custom.emoji.name) ? custom.emoji.name : '💬';
        }
        $('discordCustomText').textContent = custom.state || '';
        customEl.classList.remove('hidden');
      } else {
        customEl.classList.add('hidden');
      }
    }

    const game = (dc.activities || []).find((a) => a.type === 0);
    const isSpotify = !!(dc.listening_to_spotify && dc.spotify);

    if (game) {
      gameStartMs = (game.timestamps && game.timestamps.start) ? game.timestamps.start : null;
      $('discordGameName').textContent = game.name || 'a game';
      const parts = [game.details, game.state].filter(Boolean);
      const sub = parts.join(' · ');
      $('discordGameSub').textContent = sub;
      $('discordGameSub').classList.toggle('hidden', parts.length === 0);
      $('discordGame').classList.remove('hidden');

      const iconUrl = gameIconUrl(game);
      const iconEl = $('discordGameIcon');
      const emojiEl = $('discordGameEmoji');
      if (iconUrl) {
        iconEl.src = iconUrl;
        iconEl.classList.remove('hidden');
        emojiEl.classList.add('hidden');
      } else {
        iconEl.classList.add('hidden');
        emojiEl.classList.remove('hidden');
      }
    } else {
      gameStartMs = null;
      $('discordGame').classList.add('hidden');
    }

    if (isSpotify) {
      $('spotifySong').textContent = dc.spotify.song || '';
      $('spotifyArtist').textContent = dc.spotify.artist || '';
      if (dc.spotify.album_art_url) $('spotifyArt').src = dc.spotify.album_art_url;
      const ts = dc.spotify.timestamps;
      spotifyTimes = (ts && ts.start && ts.end) ? { start: ts.start, end: ts.end } : null;
      $('spotifyProgress').classList.toggle('hidden', !spotifyTimes);
      // Click-through to the playing track (anchor without href stays inert)
      const spotifyEl = $('discordSpotify');
      if (dc.spotify.track_id) spotifyEl.setAttribute('href', 'https://open.spotify.com/track/' + dc.spotify.track_id);
      else spotifyEl.removeAttribute('href');
      spotifyEl.classList.remove('hidden');
    } else {
      spotifyTimes = null;
      $('discordSpotify').removeAttribute('href');
      $('discordSpotify').classList.add('hidden');
    }

    const idle = !game && !isSpotify && !hasCustom;
    if (idle) {
      $('discordIdle').textContent = dc.discord_status === 'offline'
        ? 'Currently offline — catch me later ❄️'
        : 'Online, not in a game right now';
      $('discordIdle').classList.remove('hidden');
    } else {
      $('discordIdle').classList.add('hidden');
    }

    updatePresenceProgress();
    discordHasData = true;
    $('discordLoaded').classList.remove('hidden');
    $('discordLoading').classList.add('hidden');
    $('discordError').classList.add('hidden');
  }

  // ---- Lanyard WebSocket: instant presence, REST poll as fallback ----
  // Protocol: server Hello (op 1, heartbeat interval) → client Initialize
  // (op 2, subscribe_to_id) → INIT_STATE, then PRESENCE_UPDATE on every
  // change; client answers with heartbeat (op 3) on the given interval.
  let lanyardSocket = null;
  let lanyardHeartbeat = null;
  let lanyardReconnect = null;
  let lanyardWsLive = false;  // true once the socket has delivered state
  let lanyardWanted = false;  // false while intentionally disconnected (hidden tab)
  let lanyardBackoff = 1000;  // doubles on each failed attempt, capped at 30s

  function startLanyard() {
    if (lanyardWanted) return;
    lanyardWanted = true;
    connectLanyard();
  }

  function stopLanyard() {
    lanyardWanted = false;
    lanyardWsLive = false;
    if (lanyardHeartbeat) { clearInterval(lanyardHeartbeat); lanyardHeartbeat = null; }
    if (lanyardReconnect) { clearTimeout(lanyardReconnect); lanyardReconnect = null; }
    if (lanyardSocket) {
      const s = lanyardSocket;
      lanyardSocket = null;
      try { s.close(); } catch (e) {}
    }
  }

  function connectLanyard() {
    if (lanyardSocket) return;
    let socket;
    try { socket = new WebSocket('wss://api.lanyard.rest/socket'); }
    catch (e) { scheduleLanyardReconnect(); return; }
    lanyardSocket = socket;

    socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg.op === 1) { // Hello: subscribe + start heartbeating
        try { socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: DISCORD_ID } })); } catch (e) {}
        const every = (msg.d && msg.d.heartbeat_interval) || 30000;
        if (lanyardHeartbeat) clearInterval(lanyardHeartbeat);
        lanyardHeartbeat = setInterval(() => {
          if (socket.readyState === 1) { try { socket.send(JSON.stringify({ op: 3 })); } catch (e) {} }
        }, every);
      } else if (msg.op === 0 && (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE')) {
        if (msg.d && msg.d.discord_user) {
          lanyardWsLive = true;
          lanyardBackoff = 1000; // healthy traffic resets the reconnect backoff
          renderDiscord(msg.d);
        }
      }
    };
    socket.onclose = () => {
      if (lanyardSocket === socket) lanyardSocket = null;
      lanyardWsLive = false;
      if (lanyardHeartbeat) { clearInterval(lanyardHeartbeat); lanyardHeartbeat = null; }
      if (lanyardWanted) scheduleLanyardReconnect();
    };
    socket.onerror = () => { try { socket.close(); } catch (e) {} };
  }

  function scheduleLanyardReconnect() {
    if (lanyardReconnect || !lanyardWanted) return;
    const wait = lanyardBackoff;
    lanyardBackoff = Math.min(lanyardBackoff * 2, 30000);
    lanyardReconnect = setTimeout(() => {
      lanyardReconnect = null;
      if (lanyardWanted) connectLanyard();
    }, wait);
  }

  // ---------- Steam ----------
  function steamStatusInfo(state) {
    if (state === 'in-game') return ['In-Game', '#90c040'];
    if (state === 'online') return ['Online', '#57cbde'];
    if (state === 'away') return ['Away', '#faa61a'];
    return ['Offline', '#9fc0d8'];
  }

  async function loadSteam() {
    const STEAM_URL = 'https://steamcommunity.com/id/' + STEAM_VANITY + '/?xml=1';
    try {
      let xmlText;
      try {
        // Proxy first: steamcommunity.com sends no Access-Control-Allow-Origin,
        // so a direct browser fetch can never succeed. (Order flipped after the
        // direct attempt wasted one doomed round trip on every 5-min poll.)
        // no-store: status must track the server, not the browser HTTP cache.
        const r = await fetchT('https://corsproxy.io/?' + encodeURIComponent(STEAM_URL), { cache: 'no-store' });
        if (!r.ok) throw new Error('proxy failed');
        xmlText = await r.text();
      } catch (e) {
        const r2 = await fetchT(STEAM_URL, { cache: 'no-store' });
        if (!r2.ok) throw new Error('bad status');
        xmlText = await r2.text();
      }
      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML parse error');
      const txt = (tag, ctx) => { const el = (ctx || doc).querySelector(tag); return el ? el.textContent.trim() : ''; };

      const avatar = txt('avatarFull') || txt('avatarMedium') || txt('avatarIcon');
      if (!avatar) throw new Error('no avatar found');

      const onlineState = txt('onlineState') || 'offline';
      const inGameEl = doc.querySelector('inGameInfo');
      const currentGame = inGameEl ? txt('gameName', inGameEl) : '';

      const games = [];
      doc.querySelectorAll('mostPlayedGame').forEach((g) => {
        const name = txt('gameName', g);
        const logo = txt('gameLogo', g) || txt('gameLogoSmall', g) || txt('gameIcon', g);
        const link = txt('gameLink', g);
        const hoursPlayed = parseFloat((txt('hoursPlayed', g) || '0').replace(/,/g, '')) || 0;
        const hoursOnRecord = parseFloat((txt('hoursOnRecord', g) || '0').replace(/,/g, '')) || 0;
        // Skip software (SteamVR, Wallpaper Engine, …) — the list is games only.
        if (name && !steamIsSoftware(link || logo)) games.push({ name, logo, link, hoursPlayed, hoursOnRecord });
      });

      sharedAvatarUrl = avatar;
      $('steamAvatar').src = avatar;
      const discordImg = $('discordAvatar');
      if (discordImg) discordImg.src = avatar;

      const [statusText, statusColor] = steamStatusInfo(onlineState);
      $('steamStatusText').textContent = '● ' + statusText;
      $('steamStatusText').style.color = statusColor;

      if (currentGame) {
        $('steamGameName').textContent = currentGame;
        // Click-through to the store page: gameLink when Steam includes it,
        // else the appid recovered from the game's art URLs.
        const steamGameEl = $('steamGame');
        const gameUrl = steamStoreUrl(txt('gameLink', inGameEl)) ||
          steamStoreUrl(txt('gameLogo', inGameEl) || txt('gameIcon', inGameEl));
        if (gameUrl) steamGameEl.setAttribute('href', gameUrl);
        else steamGameEl.removeAttribute('href');
        steamGameEl.classList.remove('hidden');
      } else {
        $('steamGame').removeAttribute('href');
        $('steamGame').classList.add('hidden');
      }

      const recent = games.slice(0, 3).map((g) => ({
        name: escapeHtml(g.name),
        logo: escapeHtml(g.logo),
        url: steamStoreUrl(g.link) || steamStoreUrl(g.logo) || '',
        hoursStr: steamHoursText(g.hoursPlayed, g.hoursOnRecord),
      }));
      const listEl = $('recentGamesList');
      const recentSig = JSON.stringify(recent);
      if (recent.length) {
        if (recentSig !== lastSteamRecentSig) {
          lastSteamRecentSig = recentSig;
          listEl.innerHTML = recent.map((g) => (
            '<a class="recent-game-row"' + (g.url ? ' href="' + escapeHtml(g.url) + '" target="_blank" rel="noopener"' : '') + '>' +
              '<img class="recent-game-logo" src="' + g.logo + '" alt="' + g.name + '" loading="lazy" decoding="async">' +
              '<div style="min-width:0;flex:1;">' +
                '<div class="recent-game-name">' + g.name + '</div>' +
                '<div class="recent-game-hours">' + g.hoursStr + '</div>' +
              '</div>' +
            '</a>'
          )).join('');
        }
        $('steamRecent').classList.remove('hidden');
      } else {
        lastSteamRecentSig = recentSig;
        $('steamRecent').classList.add('hidden');
      }

      $('steamLoaded').classList.remove('hidden');
      $('steamLoading').classList.add('hidden');
      $('steamErr').classList.add('hidden');
    } catch (e) {
      console.warn('Steam load failed:', e);
      $('steamLoading').classList.add('hidden');
      $('steamLoaded').classList.add('hidden');
      $('steamErr').classList.remove('hidden');
    }
  }

  // ---------- MyAnimeList (Jikan) ----------
  const MAL_USER = 'Kazu_Hani';
  // Entry-to-row extraction lives in lib.js (gate-tested); local copy keeps
  // the card working if lib.js fails to load.
  const malRow = (KazuLib && KazuLib.malRow) || function (entry) {
    const a = entry && entry.anime;
    if (!a || !(a.title_english || a.title)) return null;
    const watched = (typeof entry.episodes_watched === 'number' && entry.episodes_watched >= 0) ? entry.episodes_watched : 0;
    const total = (typeof a.episodes === 'number' && a.episodes > 0) ? a.episodes : null;
    const img = (a.images && a.images.jpg && (a.images.jpg.small_image_url || a.images.jpg.image_url)) || '';
    return {
      url: a.url || (a.mal_id ? 'https://myanimelist.net/anime/' + a.mal_id : 'https://myanimelist.net'),
      title: a.title_english || a.title,
      watched, total,
      pct: total ? Math.min(100, Math.round((watched / total) * 100)) : 0,
      img,
    };
  };
  const malListRow = (KazuLib && KazuLib.malListRow) || function (entry) {
    if (!entry) return null;
    const title = entry.anime_title_eng || entry.anime_title;
    if (!title) return null;
    const id = (typeof entry.anime_id === 'number' && entry.anime_id > 0) ? entry.anime_id : null;
    const watched = (typeof entry.num_watched_episodes === 'number' && entry.num_watched_episodes >= 0) ? entry.num_watched_episodes : 0;
    const total = (typeof entry.anime_num_episodes === 'number' && entry.anime_num_episodes > 0) ? entry.anime_num_episodes : null;
    return {
      url: id ? 'https://myanimelist.net/anime/' + id : 'https://myanimelist.net',
      title,
      watched, total,
      pct: total ? Math.min(100, Math.round((watched / total) * 100)) : 0,
      img: typeof entry.anime_image_path === 'string' ? entry.anime_image_path : '',
    };
  };

  // Last-good rows survive Jikan outages (its user endpoints 504 whenever MAL
  // refuses the scrape): written on every successful fetch, read on failure.
  const MAL_CACHE_KEY = 'kazu-mal-cache';
  const MAL_MANGA_CACHE_KEY = 'kazu-mal-manga-cache';

  // Both lists feed the card's idle banner: it's only shown when there's
  // nothing being watched AND nothing being read.
  let malAnimeRows = [];
  let malMangaRows = [];
  function updateMalIdle() {
    const idle = $('malIdle');
    if (!idle) return;
    const empty = malAnimeRows.length === 0 && malMangaRows.length === 0;
    if (empty) idle.textContent = 'Not watching or reading anything right now ❄️';
    idle.classList.toggle('hidden', !empty);
  }

  function renderMalRows(rows) {
    malAnimeRows = rows;
    const sig = JSON.stringify(rows);
    if (sig !== lastMalAnimeSig) {
      lastMalAnimeSig = sig;
      $('malList').innerHTML = rows.map((x) => (
        '<a class="mal-row" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">' +
          (x.img ? '<img class="mal-cover" src="' + escapeHtml(x.img) + '" alt="" loading="lazy" decoding="async">' : '') +
          '<div class="mal-info">' +
            '<div class="mal-title">' + escapeHtml(x.title) + '</div>' +
            '<div class="mal-progress">' +
              (x.total ? '<div class="mal-bar"><span style="width:' + x.pct + '%;"></span></div>' : '') +
              '<div class="mal-eps">Ep ' + x.watched + ' / ' + (x.total || '?') + '</div>' +
            '</div>' +
          '</div>' +
        '</a>'
      )).join('');
    }
    updateMalIdle();

    $('malLoaded').classList.remove('hidden');
    $('malLoading').classList.add('hidden');
    $('malError').classList.add('hidden');
  }

  function renderMalMangaRows(rows) {
    malMangaRows = rows;
    const section = $('malMangaSection');
    const list = $('malMangaList');
    if (section && list) {
      const sig = JSON.stringify(rows);
      if (sig !== lastMalMangaSig) {
        lastMalMangaSig = sig;
        list.innerHTML = rows.map((x) => (
          '<a class="mal-row" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">' +
            (x.img ? '<img class="mal-cover" src="' + escapeHtml(x.img) + '" alt="" loading="lazy" decoding="async">' : '') +
            '<div class="mal-info">' +
              '<div class="mal-title">' + escapeHtml(x.title) + '</div>' +
              '<div class="mal-progress">' +
                (x.total ? '<div class="mal-bar"><span style="width:' + x.pct + '%;"></span></div>' : '') +
                '<div class="mal-eps">Ch ' + x.read + ' / ' + (x.total || '?') + '</div>' +
              '</div>' +
            '</div>' +
          '</a>'
        )).join('');
      }
      section.classList.toggle('hidden', rows.length === 0);
    }
    updateMalIdle();
  }

  function malCacheRead() {
    const parse = (KazuLib && KazuLib.malCacheParse) || function () { return null; };
    try { return parse(localStorage.getItem(MAL_CACHE_KEY)); } catch (e) { return null; }
  }

  // Live rows come from the first source that answers. Jikan stays first
  // because it is CORS-clean, but MAL has been refusing its scrape of the
  // user endpoints for long stretches (they 504 while the rest of Jikan is
  // fine). The fallback is MAL's own load.json — the endpoint myanimelist.net
  // itself uses — reached through the same corsproxy.io the Steam card uses,
  // because MAL sends no Access-Control-Allow-Origin.
  async function fetchMalRows() {
    try {
      const r = await fetchT('https://api.jikan.moe/v4/users/' + MAL_USER + '/animelist?status=watching', { cache: 'no-store' });
      if (!r.ok) throw new Error('bad status ' + r.status);
      const j = await r.json();
      // ?status=watching does the filtering server-side; the extra client-side
      // check guards against the param being ignored, tolerating entries that
      // don't carry the field at all.
      return ((j && j.data) || [])
        .filter((e) => !e || !e.watching_status || e.watching_status === 'watching')
        .map(malRow)
        .filter(Boolean)
        .slice(0, 3);
    } catch (e) {
      console.warn('Jikan failed, trying MAL load.json via proxy:', e);
      const listUrl = 'https://myanimelist.net/animelist/' + MAL_USER + '/load.json?status=1';
      const r2 = await fetchT('https://corsproxy.io/?' + encodeURIComponent(listUrl), { cache: 'no-store' });
      if (!r2.ok) throw new Error('proxy status ' + r2.status);
      const list = await r2.json();
      if (!Array.isArray(list)) throw new Error('unexpected load.json payload');
      // status 1 = watching; ?status=1 already filters server-side, same
      // belt-and-braces guard as the Jikan path above.
      return list
        .filter((e) => !e || e.status == null || e.status === 1)
        .map(malListRow)
        .filter(Boolean)
        .slice(0, 3);
    }
  }

  async function loadMal() {
    try {
      const rows = await fetchMalRows();

      renderMalRows(rows);
      try { localStorage.setItem(MAL_CACHE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch (e) {}
    } catch (e) {
      const cached = malCacheRead();
      if (cached) {
        renderMalRows(cached);
        return;
      }
      $('malLoading').classList.add('hidden');
      $('malError').classList.remove('hidden');
    }
  }

  // ---- Manga (currently reading, same Jikan → MAL load.json → cache ladder) ----
  // Unlike the anime path these helpers aren't duplicated locally: if lib.js
  // failed to load the section just stays hidden (the modals already degrade
  // the same way).
  async function fetchMalMangaRows() {
    const mRow = KazuLib.malMangaRow;
    const mListRow = KazuLib.malMangaListRow;
    try {
      const r = await fetchT('https://api.jikan.moe/v4/users/' + MAL_USER + '/mangalist?status=reading', { cache: 'no-store' });
      if (!r.ok) throw new Error('bad status ' + r.status);
      const j = await r.json();
      return ((j && j.data) || [])
        .filter((e) => !e || !e.reading_status || e.reading_status === 'reading')
        .map(mRow)
        .filter(Boolean)
        .slice(0, 2);
    } catch (e) {
      console.warn('Jikan manga failed, trying MAL mangalist load.json via proxy:', e);
      const listUrl = 'https://myanimelist.net/mangalist/' + MAL_USER + '/load.json?status=1';
      const r2 = await fetchT('https://corsproxy.io/?' + encodeURIComponent(listUrl), { cache: 'no-store' });
      if (!r2.ok) throw new Error('proxy status ' + r2.status);
      const list = await r2.json();
      if (!Array.isArray(list)) throw new Error('unexpected mangalist load.json payload');
      return list
        .filter((e) => !e || e.status == null || e.status === 1)
        .map(mListRow)
        .filter(Boolean)
        .slice(0, 2);
    }
  }

  function malMangaCacheRead() {
    const parse = KazuLib && KazuLib.malMangaCacheParse;
    if (!parse) return null;
    try { return parse(localStorage.getItem(MAL_MANGA_CACHE_KEY)); } catch (e) { return null; }
  }

  // Manga failures never flip the whole card to its error state: the anime
  // rows are the primary content, the reading section just hides.
  async function loadMalManga() {
    if (!KazuLib || !KazuLib.malMangaRow) return;
    try {
      const rows = await fetchMalMangaRows();
      renderMalMangaRows(rows);
      try { localStorage.setItem(MAL_MANGA_CACHE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch (e) {}
    } catch (e) {
      const cached = malMangaCacheRead();
      if (cached) renderMalMangaRows(cached);
    }
  }

  function loadMalAll() { loadMal(); loadMalManga(); }

  // ---------- Letterboxd (latest diary entry via RSS) ----------
  // Letterboxd has no public API, but every profile publishes a diary RSS
  // feed. No Access-Control-Allow-Origin there either, so it rides the same
  // corsproxy.io the Steam and MAL fallbacks use. Parsing lives in lib.js
  // (regex-based, DOM-free, gate-tested); the last good entry is cached in
  // localStorage exactly like the MAL rows.
  const LB_USER = 'KazuHani';
  const LB_CACHE_KEY = 'kazu-lb-cache';

  function renderLetterboxd(entry) {
    const row = $('lbRow');
    if (!row) return;
    const sig = JSON.stringify(entry);
    if (sig !== lastLbSig) {
      lastLbSig = sig;
      if (!entry) {
        row.innerHTML = '';
        $('lbIdle').classList.remove('hidden');
      } else {
        $('lbIdle').classList.add('hidden');
        row.innerHTML =
          '<a class="lb-entry" href="' + escapeHtml(entry.link) + '" target="_blank" rel="noopener">' +
            (entry.poster
              ? '<img class="lb-poster" src="' + escapeHtml(entry.poster) + '" alt="" loading="lazy" decoding="async">'
              : '<div class="lb-poster lb-poster--empty">🎬</div>') +
            '<div class="lb-info">' +
              '<div class="lb-label">Latest watch' + (entry.rewatch ? ' · rewatch' : '') + '</div>' +
              '<div class="lb-title">' + escapeHtml(entry.title) + (entry.year ? ' <span class="lb-year">' + entry.year + '</span>' : '') + '</div>' +
              (entry.stars ? '<div class="lb-stars">' + entry.stars + '</div>' : '') +
              (entry.watched ? '<div class="lb-watched">' + escapeHtml(entry.watched) + '</div>' : '') +
            '</div>' +
          '</a>';
      }
    }
    $('lbLoaded').classList.remove('hidden');
    $('lbLoading').classList.add('hidden');
    $('lbError').classList.add('hidden');
  }

  function lbCacheRead() {
    const parse = KazuLib && KazuLib.letterboxdCacheParse;
    if (!parse) return null;
    try { return parse(localStorage.getItem(LB_CACHE_KEY)); } catch (e) { return null; }
  }

  async function loadLetterboxd() {
    if (!KazuLib || !KazuLib.parseLetterboxdRss) return;
    try {
      const rss = 'https://letterboxd.com/' + LB_USER + '/rss/';
      const r = await fetchT('https://corsproxy.io/?' + encodeURIComponent(rss), { cache: 'no-store' });
      if (!r.ok) throw new Error('proxy status ' + r.status);
      const entry = KazuLib.parseLetterboxdRss(await r.text());
      renderLetterboxd(entry);
      try { localStorage.setItem(LB_CACHE_KEY, JSON.stringify({ at: Date.now(), entry })); } catch (e) {}
    } catch (e) {
      const cached = lbCacheRead();
      if (cached) { renderLetterboxd(cached); return; }
      $('lbLoading').classList.add('hidden');
      $('lbError').classList.remove('hidden');
    }
  }

  // ---------- ListenBrainz recent tracks (music card) ----------
  // Free, keyless, CORS-open API. While the account 404s (or a fetch fails)
  // the "recently played" block stays hidden and the static playlist card is
  // the content — so this switches itself on once listens exist, no deploy
  // needed.
  const LISTENBRAINZ_USER = 'Kazu_Hani';

  async function loadMusicRecent() {
    if (!LISTENBRAINZ_USER || !KazuLib || !KazuLib.listenbrainzRow) return;
    try {
      const r = await fetchT('https://api.listenbrainz.org/1/user/' + encodeURIComponent(LISTENBRAINZ_USER) + '/listens?count=3');
      if (!r.ok) throw new Error('status ' + r.status);
      const j = await r.json();
      const rows = ((((j || {}).payload) || {}).listens || [])
        .map(KazuLib.listenbrainzRow)
        .filter(Boolean)
        .slice(0, 3);
      const wrap = $('musicRecent');
      const list = $('musicTrackList');
      if (!wrap || !list) return;
      if (!rows.length) { wrap.classList.add('hidden'); return; }
      const sig = JSON.stringify(rows);
      if (sig !== lastMusicSig) {
        lastMusicSig = sig;
        list.innerHTML = rows.map((t, i) => {
          const inner =
            '<div class="music-track-num">' + (t.playingNow ? '▶' : String(i + 1)) + '</div>' +
            '<div class="music-track-text">' +
              '<div class="music-track-name">' + escapeHtml(t.name) + '</div>' +
              '<div class="music-track-artist">' + escapeHtml(t.artist) + '</div>' +
            '</div>';
          return t.url
            ? '<a class="music-track-row" href="' + escapeHtml(t.url) + '" target="_blank" rel="noopener">' + inner + '</a>'
            : '<div class="music-track-row">' + inner + '</div>';
        }).join('');
      }
      wrap.classList.remove('hidden');
    } catch (e) {
      // Keep the static card on failure; the playlist link is the fallback content.
    }
  }

  // ---------- YouTube Music playlist (latest additions via Atom feed) -------
  // Every public playlist publishes an Atom feed (feeds/videos.xml, newest
  // additions first) — keyless, so the "From the playlist" rows track the
  // real playlist instead of going stale: a song added in YouTube Music
  // appears here on the next poll. No CORS header on the feed, so it rides
  // the same corsproxy.io as Letterboxd; parsing lives in lib.js (regex,
  // DOM-free, gate-tested). Failure order: localStorage cache → the static
  // snapshot rows shipped in index.html.
  const YTM_PLAYLIST_ID = 'PLEWxJlvxPVrkYhMCA1IlYwDh5bg-jf39m';
  const YTM_CACHE_KEY = 'kazu-ytm-cache';

  function renderPlaylistTracks(rows) {
    const list = $('musicFeatured');
    if (!list) return;
    const sig = JSON.stringify(rows);
    if (sig === lastYtmSig) return;
    lastYtmSig = sig;
    list.innerHTML = '<div class="music-recent-label">From the playlist</div>' + rows.map((t, i) =>
      '<a class="music-track-row" href="https://music.youtube.com/watch?v=' + t.id + '&amp;list=' + YTM_PLAYLIST_ID + '" target="_blank" rel="noopener">' +
        '<div class="music-track-num">' + (i + 1) + '</div>' +
        '<div class="music-track-text">' +
          '<div class="music-track-name">' + escapeHtml(t.title) + '</div>' +
          '<div class="music-track-artist">' + escapeHtml(t.artist) + '</div>' +
        '</div>' +
      '</a>').join('');
  }

  function ytmCacheRead() {
    const parse = KazuLib && KazuLib.ytPlaylistCacheParse;
    if (!parse) return null;
    try { return parse(localStorage.getItem(YTM_CACHE_KEY)); } catch (e) { return null; }
  }

  async function loadPlaylistTracks() {
    if (!KazuLib || !KazuLib.parseYouTubePlaylistRss) return;
    try {
      const feed = 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + YTM_PLAYLIST_ID;
      const r = await fetchT('https://corsproxy.io/?' + encodeURIComponent(feed), { cache: 'no-store' });
      if (!r.ok) throw new Error('proxy status ' + r.status);
      const rows = KazuLib.parseYouTubePlaylistRss(await r.text()).slice(0, 5);
      if (!rows.length) throw new Error('feed had no usable entries');
      renderPlaylistTracks(rows);
      try { localStorage.setItem(YTM_CACHE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch (e) {}
    } catch (e) {
      // No cache yet → the static snapshot in index.html stays as the fallback.
      const cached = ytmCacheRead();
      if (cached && cached.length) renderPlaylistTracks(cached);
    }
  }

  // ---------- Motivational quotes ----------
  const FALLBACK_QUOTES = [
    ['The only way to do great work is to love what you do.', 'Steve Jobs'],
    ['Believe you can and you’re halfway there.', 'Theodore Roosevelt'],
    ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
    ['Whether you think you can or you think you can’t, you’re right.', 'Henry Ford'],
    ['Success is not final, failure is not fatal: it is the courage to continue that counts.', 'Winston Churchill'],
    ['The future belongs to those who believe in the beauty of their dreams.', 'Eleanor Roosevelt'],
    ['Hardships often prepare ordinary people for an extraordinary destiny.', 'C.S. Lewis'],
    ['It is during our darkest moments that we must focus to see the light.', 'Aristotle'],
    ['Do not wait to strike till the iron is hot; make it hot by striking.', 'William Butler Yeats'],
    ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
    ['Act as if what you do makes a difference. It does.', 'William James'],
    ['Success usually comes to those who are too busy to be looking for it.', 'Henry David Thoreau'],
    ['Don’t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
    ['Everything you’ve ever wanted is on the other side of fear.', 'George Addair'],
    ['Hard work beats talent when talent doesn’t work hard.', 'Tim Notke'],
    ['Dream big and dare to fail.', 'Norman Vaughan'],
    ['Opportunities don’t happen, you create them.', 'Chris Grosser'],
    ['I find that the harder I work, the more luck I seem to have.', 'Thomas Jefferson'],
    ['The only limit to our realization of tomorrow is our doubts of today.', 'Franklin D. Roosevelt'],
    ['What you get by achieving your goals is not as important as what you become by achieving your goals.', 'Zig Ziglar'],
    ['You are never too old to set another goal or to dream a new dream.', 'C.S. Lewis'],
    ['It always seems impossible until it’s done.', 'Nelson Mandela'],
    ['Don’t be afraid to give up the good to go for the great.', 'John D. Rockefeller'],
    ['The way to get started is to quit talking and begin doing.', 'Walt Disney'],
    ['If you are working on something exciting that you care about, you don’t have to be pushed.', 'Steve Jobs'],
    ['Success is walking from failure to failure with no loss of enthusiasm.', 'Winston Churchill'],
    ['Quality is not an act, it is a habit.', 'Aristotle'],
    ['Either you run the day, or the day runs you.', 'Jim Rohn'],
    ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['Believe in yourself and all that you are.', 'Christian D. Larson'],
    ['Knowing yourself is the beginning of all wisdom.', 'Aristotle'],
    ['You don’t have to be great to start, but you have to start to be great.', 'Zig Ziglar'],
    ['Strive not to be a success, but rather to be of value.', 'Albert Einstein'],
    ['The mind is everything. What you think you become.', 'Buddha'],
    ['Failure will never overtake me if my determination to succeed is strong enough.', 'Og Mandino'],
    ['We may encounter many defeats but we must not be defeated.', 'Maya Angelou'],
    ['Imagine your life is perfect in every respect; what would it look like?', 'Brian Tracy'],
    ['We generate fears while we sit. We overcome them by action.', 'Henry Link'],
    ['Whatever the mind dwells upon, it expands.', 'Robert Cooper'],
    ['Limitations live only in our minds. If we use our imaginations, our possibilities become limitless.', 'Jamie Paolinetti'],
    ['You take your life in your own hands, and what happens? A terrible thing: no one to blame.', 'Erica Jong'],
    ['What’s money? A man is a success if he gets up in the morning and goes to bed at night and in between does what he wants.', 'Bob Dylan'],
    ['A successful man is one who can lay a firm foundation with the bricks others have thrown at him.', 'David Brinkley'],
    ['The road to success and the road to failure are almost exactly the same.', 'Colin R. Davis'],
    ['The only place where your dream becomes impossible is in your own thinking.', 'Robert H. Schuller'],
    ['All progress takes place outside the comfort zone.', 'Michael John Bobak'],
    ['Push yourself, because no one else is going to do it for you.', 'Unknown'],
    ['Great things never come from comfort zones.', 'Unknown'],
    ['Sometimes later becomes never. Do it now.', 'Unknown'],
    ['Little things make big days.', 'Unknown'],
    ['Don’t stop when you’re tired. Stop when you’re done.', 'Unknown'],
  ];

  function showFallbackQuote() {
    const [text, author] = FALLBACK_QUOTES[(Math.random() * FALLBACK_QUOTES.length) | 0];
    $('quoteText').textContent = text;
    $('quoteAuthor').textContent = '— ' + author;
    $('quoteBox').classList.add('visible');
  }

  async function loadQuote() {
    try {
      const r = await fetchT('https://zenquotes.io/api/random');
      const j = await r.json();
      const q = j && j[0];
      if (!q || !q.q) throw new Error('bad payload');
      $('quoteText').textContent = q.q;
      $('quoteAuthor').textContent = '— ' + (q.a || 'Unknown');
      $('quoteBox').classList.add('visible');
    } catch (e) {
      showFallbackQuote();
    }
  }

  // Click/Enter on the quote deals a new one. Debounced: zenquotes' free tier
  // rate-limits per IP, and a hammered click shouldn't burn it.
  let quoteLastShuffle = 0;
  function reshuffleQuote() {
    const now = Date.now();
    if (now - quoteLastShuffle < 3000) return;
    quoteLastShuffle = now;
    loadQuote();
  }


  // ---------- Theme toggle ----------
  const orb = $('theme-orb');
  const orbIcon = $('orb-icon');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  // Browser-chrome colour follows the active theme (and the Christmas palette,
  // which applySeasons reapplies on top of this).
  function setThemeColor(c) {
    if (themeColorMeta && themeColorMeta.getAttribute('content') !== c) {
      themeColorMeta.setAttribute('content', c);
    }
  }

  function applyTheme(dark) {
    document.body.dataset.theme = dark ? 'dark' : 'light';
    orb.dataset.dark = dark ? '1' : '0';
    orb.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    orb.setAttribute('aria-pressed', dark ? 'true' : 'false');
    orbIcon.textContent = dark ? '🌙' : '☀️';
    if (!document.body.classList.contains('season-christmas')) {
      setThemeColor(dark ? '#0d1b31' : '#eaf6ff');
    }
  }

  // No saved choice → follow the OS, and keep following it live until the
  // visitor picks a side with the orb (an explicit choice always wins).
  const themeMedia = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('kazu-dark'); } catch (e) {}
  let isDark = savedTheme !== null ? savedTheme === '1' : (themeMedia ? themeMedia.matches : true);
  applyTheme(isDark);

  if (themeMedia && savedTheme === null) {
    const onSystemTheme = (e) => { isDark = e.matches; applyTheme(isDark); };
    if (themeMedia.addEventListener) themeMedia.addEventListener('change', onSystemTheme);
    else if (themeMedia.addListener) themeMedia.addListener(onSystemTheme); // older Safari
  }

  orb.addEventListener('click', () => {
    isDark = !isDark;
    try { localStorage.setItem('kazu-dark', isDark ? '1' : '0'); } catch (e) {}
    applyTheme(isDark);
  });

  // ---------- Back to top ----------
  const toTopBtn = $('toTopBtn');
  window.addEventListener('scroll', () => {
    toTopBtn.classList.toggle('hidden', window.scrollY <= 420);
  }, { passive: true });
  // Ride the heavy-scroll loop when it's active — its per-frame instant
  // writes would otherwise stomp this native smooth scroll mid-glide.
  // (Reduced motion: the hook is absent and the old native glide stays.)
  toTopBtn.addEventListener('click', () => {
    if (window.kazuSmoothScrollTo) { window.kazuSmoothScrollTo(0); return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---------- Card detail modals ----------
  // Click/Enter on any .stat-card[data-modal] opens one reusable glass pop-up.
  // Each card maps to an entry in MODALS: render() paints the body, afterRender()
  // runs DOM work that needs layout (mount the wind-globe iframe), live()
  // re-runs every second while the pop-up is open. Bodies are laid out to fit
  // the panel without scrolling on typical screens (see style.css modal rules).
  const modalEl = $('cardModal');
  const modalPanel = modalEl ? modalEl.querySelector('.modal-panel') : null;
  const modalTitleEl = $('modalTitle');
  const modalBodyEl = $('modalBody');
  const modalCloseEl = $('modalClose');
  const FOCUSABLE = 'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
  let modalTrigger = null; // card that opened the pop-up (focus returns here)
  let modalUpdater = null; // setInterval id for live() while open
  let modalKey = null;

  // Intl formatters are cheap to keep around and reused by the live tick.
  const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const fmtTimeUK = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const fmtDayUK = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' });

  // ----- Time & timezones -----
  function timeModalHTML() {
    const now = new Date();
    const localZone = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device').replace(/_/g, ' ');
    const ukOffset = KazuLib.isUkBST(now) ? 1 : 0;
    const localOffset = -now.getTimezoneOffset() / 60;
    const diff = localOffset - ukOffset;
    const absDiff = Math.abs(diff);
    const diffText = absDiff < 0.001
      ? 'None — same as the UK 🇬🇧'
      : absDiff + (absDiff === 1 ? ' hour ' : ' hours ') + (diff > 0 ? 'ahead of the UK' : 'behind the UK');

    const dst = KazuLib.nextUkDstTransition(now);
    const dstDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(dst.date);
    const daysToDst = Math.ceil((dst.date - now) / 86400000);
    const dirText = dst.direction === 'forward'
      ? 'clocks go <strong>forward</strong> 1 hour — lose an hour, BST begins ☀️'
      : 'clocks go <strong>back</strong> 1 hour — gain an hour, GMT returns 🌙';
    const stateText = KazuLib.isUkBST(now)
      ? 'Right now: <strong>British Summer Time</strong> (BST, UTC+1)'
      : 'Right now: <strong>Greenwich Mean Time</strong> (GMT, UTC+0)';

    return ''
      + '<div class="tz-grid">'
      +   '<div class="tz-cell"><div class="tz-label">🇬🇧 UK time</div>'
      +     '<div class="tz-time" id="mUkTime">' + fmtTimeUK.format(now) + '</div>'
      +     '<div class="tz-meta">' + fmtDayUK.format(now) + ' · Europe/London</div></div>'
      +   '<div class="tz-cell"><div class="tz-label">📍 Your time</div>'
      +     '<div class="tz-time" id="mLocalTime">' + fmtTime.format(now) + '</div>'
      +     '<div class="tz-meta">' + localZone + '</div></div>'
      + '</div>'
      + '<div class="modal-note">'
      +   '<div class="modal-row"><span>Time difference</span><strong>' + diffText + '</strong></div>'
      +   '<div class="modal-note-hr"></div>'
      +   stateText + '<br>'
      +   '<span class="modal-row-sub">Next clock change:</span> <strong>' + dstDate + '</strong> '
      +   '(in ' + daysToDst + ' day' + (daysToDst === 1 ? '' : 's') + ') — ' + dirText
      + '</div>';
  }
  function timeModalLive() {
    const now = new Date();
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    set('mUkTime', fmtTimeUK.format(now));
    set('mLocalTime', fmtTime.format(now));
  }

  // ----- Weather: 3D wind globe + 5-day forecast -----
  function weatherModalHTML() {
    return ''
      + '<p class="modal-lead">Live surface wind over the UK — drag to spin, scroll to zoom. <span class="modal-lead-src">Source: earth.nullschool.net</span></p>'
      + '<div class="globe-frame" id="globeFrame"></div>'
      + '<div class="forecast-strip" id="forecastStrip"></div>'
      + '<div class="modal-actions">'
      +   '<a class="modal-btn" id="globeOpen" target="_blank" rel="noopener">Open full UK wind map ↗</a>'
      +   '<button type="button" class="modal-btn modal-btn--ghost" id="skyCompare">📍 Compare with your sky</button>'
      + '</div>'
      + '<div class="sky-compare hidden" id="skyCompareOut"></div>';
  }

  // "Compare with your sky": opt-in geolocation (button click only — never
  // prompted on modal open), then one current-block-only Open-Meteo call for
  // the visitor's coordinates, rendered side by side with Aberystwyth.
  function compareSkies() {
    const out = $('skyCompareOut');
    if (!out) return;
    out.classList.remove('hidden');
    if (!('geolocation' in navigator)) {
      out.innerHTML = '<div class="forecast-empty">This browser can’t share your location.</div>';
      return;
    }
    out.innerHTML = '<div class="forecast-empty">Asking for your sky…</div>';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const lat = +pos.coords.latitude.toFixed(3);
        const lon = +pos.coords.longitude.toFixed(3);
        const r = await fetchT(KazuLib.openMeteoUrl(lat, lon, false));
        const j = await r.json();
        const w = j.current;
        if (!w) throw new Error('no current block');
        renderSkyCompare(out, {
          code: w.weather_code, isDay: w.is_day === 1,
          tempC: w.temperature_2m, windKmh: w.wind_speed_10m,
        });
      } catch (e) {
        out.innerHTML = '<div class="forecast-empty">Couldn’t read your sky ☁️</div>';
      }
    }, () => {
      out.innerHTML = '<div class="forecast-empty">Location off — your sky stays a mystery ❄️</div>';
    }, { timeout: 10000, maximumAge: 300000 });
  }

  function renderSkyCompare(out, yours) {
    if (!weatherCurrent) {
      out.innerHTML = '<div class="forecast-empty">My sky hasn’t loaded yet — retry the weather card first.</div>';
      return;
    }
    const mine = weatherCurrent;
    const mineInfo = weatherInfo(mine.code, mine.isDay);
    const yourInfo = weatherInfo(yours.code, yours.isDay);
    const dt = Math.round(yours.tempC - mine.tempC);
    const delta = dt === 0 ? 'Same temperature as you'
      : Math.abs(dt) + '°C ' + (dt > 0 ? 'warmer where you are' : 'colder where you are');
    out.innerHTML = '<div class="tz-grid">'
      + '<div class="tz-cell"><div class="tz-label">🐉 Aberystwyth</div>'
      +   '<div class="tz-time">' + mineInfo.e + ' ' + Math.round(mine.tempC) + '°C</div>'
      +   '<div class="tz-meta">' + mineInfo.d + ' · wind ' + Math.round(mine.windKmh) + ' km/h</div></div>'
      + '<div class="tz-cell"><div class="tz-label">📍 Your sky</div>'
      +   '<div class="tz-time">' + yourInfo.e + ' ' + Math.round(yours.tempC) + '°C</div>'
      +   '<div class="tz-meta">' + yourInfo.d + ' · wind ' + Math.round(yours.windKmh) + ' km/h</div></div>'
      + '</div>'
      + '<div class="modal-note"><div class="modal-row"><span>Difference</span><strong>' + delta + '</strong></div></div>';
  }

  // 5-day strip under the globe, from the Open-Meteo daily block cached by
  // loadWeather. Rows are shaped by KazuLib.forecastRows (gate-tested); the
  // strip shows an honest loading / unavailable note until data arrives.
  function renderForecastStrip() {
    const strip = $('forecastStrip');
    if (!strip) return;
    const rows = (KazuLib && KazuLib.forecastRows) ? KazuLib.forecastRows(weatherDaily, 5) : [];
    if (!rows.length) {
      strip.innerHTML = '<div class="forecast-empty">'
        + (weatherDone ? 'Forecast unavailable right now.' : 'Loading forecast…')
        + '</div>';
      return;
    }
    strip.innerHTML = rows.map(function (r) {
      const info = (typeof r.code === 'number') ? weatherInfo(r.code, true) : { e: '🌡️', d: 'Forecast' };
      return '<div class="forecast-day">'
        + '<div class="forecast-label">' + escapeHtml(r.label) + '</div>'
        + '<div class="forecast-emoji" title="' + escapeHtml(info.d) + '">' + info.e + '</div>'
        + '<div class="forecast-temps">'
        +   (r.maxC === null ? '–' : r.maxC + '°')
        +   ' <span class="forecast-min">' + (r.minC === null ? '–' : r.minC + '°') + '</span>'
        + '</div>'
        + (r.precipPct === null ? '' : '<div class="forecast-precip">💧 ' + r.precipPct + '%</div>')
        + '</div>';
    }).join('');
  }

  function weatherModalAfter() {
    const url = KazuLib.nullschoolUrl({ lon: -2.5, lat: 54.5, zoom: 2800 });
    const open = $('globeOpen'); if (open) open.href = url;
    const cmp = $('skyCompare'); if (cmp) cmp.addEventListener('click', compareSkies);
    const frame = $('globeFrame');
    if (frame) {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.loading = 'lazy';
      iframe.title = 'Interactive 3D wind globe of the UK';
      iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      frame.appendChild(iframe);
    }
    renderForecastStrip();
  }

  // ----- Age & life stats -----
  const nf = (n) => n.toLocaleString('en-GB');
  function statTile(num, label) {
    return '<div class="stat-tile"><div class="stat-tile-num">' + num + '</div><div class="stat-tile-label">' + label + '</div></div>';
  }
  function funCell(emoji, num, label) {
    return '<div class="fun-cell"><span class="fun-emoji">' + emoji + '</span><div>'
      + '<div class="fun-num">' + num + '</div><div class="fun-label">' + label + '</div></div></div>';
  }
  function ageModalHTML() {
    const a = KazuLib.ageBreakdown(new Date());
    const f = KazuLib.birthFacts();
    const milestoneOn = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(a.nextMilestoneOn);
    return ''
      + '<div class="age-head">' + a.years + ' years, ' + a.months + ' months, ' + a.days + ' days <span class="age-sub">old</span></div>'
      + '<div class="stat-tiles">'
      +   statTile(nf(a.totalDays), 'days lived')
      +   statTile(nf(a.totalWeeks), 'weeks lived')
      +   statTile(nf(a.totalHours), 'hours lived')
      +   statTile('~' + nf(a.heartbeats), 'heartbeats')
      + '</div>'
      + '<div class="modal-note">'
      +   '<div class="modal-row"><span>Next milestone</span><strong>' + nf(a.nextMilestoneDays) + ' days</strong></div>'
      +   '<div class="modal-row modal-row-sub"><span>reached on</span><span>' + milestoneOn + ' · ' + nf(a.nextMilestoneDays - a.totalDays) + ' to go</span></div>'
      + '</div>'
      + '<div class="sign-row"><div class="sign-glyph">' + f.starGlyph + '</div><div>'
      +   '<div class="tz-label">Star sign</div><div class="sign-name">' + f.starSign + '</div>'
      +   '<div class="tz-meta">Born ' + f.dateLabel + ' — a ' + f.weekday + '</div></div></div>'
      + '<div class="fun-wrap"><div class="fun-title">Life in fun units</div>'
      +   '<div class="fun-grid">'
      +     funCell('🌕', nf(a.fullMoons), 'full moons seen')
      +     funCell('🌍', a.orbits.toFixed(1), 'laps of the Sun')
      +     funCell('😴', '~' + a.asleepYears.toFixed(1), 'years asleep')
      +     funCell('💨', nf(a.breaths), 'breaths taken')
      +   '</div>'
      + '</div>';
  }

  // ----- Next birthday: countdown + calendar export -----
  function cdCell(id, val, label) {
    return '<div class="cd-cell"><div class="cd-num" id="' + id + '">' + val + '</div><div class="cd-label">' + label + '</div></div>';
  }
  function bdayModalHTML() {
    const p = KazuLib.birthdayCountdownParts(new Date());
    // targetDate is a UK wall-frame date: format in UTC so the label is right
    // in every timezone.
    const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(p.targetDate);
    const head = p.isToday
      ? '🎉 It’s today — happy birthday! Turning <strong>' + p.ageNow + '</strong>'
      : 'Turning <strong>' + p.turning + '</strong> on ' + dateLabel;
    return ''
      + '<div class="modal-note modal-note--center">' + head + '</div>'
      + '<div class="countdown">'
      +   cdCell('cdDays', p.days, 'days')
      +   cdCell('cdHours', pad2(p.hours), 'hours')
      +   cdCell('cdMins', pad2(p.minutes), 'mins')
      +   cdCell('cdSecs', pad2(p.seconds), 'secs')
      + '</div>'
      + '<div class="modal-actions modal-actions--center">'
      +   '<a class="modal-btn" id="bdayGoogle" target="_blank" rel="noopener">📅 Add to Google Calendar</a>'
      +   '<button type="button" class="modal-btn modal-btn--ghost" id="bdayIcs">⬇️ Download .ics file</button>'
      + '</div>'
      + '<p class="modal-credit modal-credit--center">Adds a yearly all-day event with a reminder the day before.</p>';
  }
  function bdayModalAfter() {
    const p = KazuLib.birthdayCountdownParts(new Date());
    const summary = 'Kazu’s Birthday 🎂';
    const g = $('bdayGoogle');
    if (g) g.href = KazuLib.googleCalendarUrl({ summary: summary, date: p.targetDate, details: 'Kazu turns ' + (p.isToday ? p.ageNow : p.turning) + '! 🎉' });
    const ics = $('bdayIcs');
    if (ics) ics.addEventListener('click', () => downloadBirthdayICS(summary));
  }
  function bdayModalLive() {
    const p = KazuLib.birthdayCountdownParts(new Date());
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
    set('cdDays', p.days); set('cdHours', pad2(p.hours)); set('cdMins', pad2(p.minutes)); set('cdSecs', pad2(p.seconds));
  }
  function downloadBirthdayICS(summary) {
    const blob = new Blob([KazuLib.buildBirthdayICS({ summary: summary })], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kazu-birthday.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Saved kazu-birthday.ics 🎂');
  }

  const MODALS = {
    time: { title: '🕒 Time & timezones', render: timeModalHTML, live: timeModalLive },
    weather: { title: '🌬️ UK wind globe', wide: true, render: weatherModalHTML, afterRender: weatherModalAfter },
    age: { title: '🎂 Age & life stats', render: ageModalHTML },
    bday: { title: '🎉 Next birthday', render: bdayModalHTML, afterRender: bdayModalAfter, live: bdayModalLive },
  };

  function openModal(key, trigger) {
    if (!modalEl || !KazuLib) return;
    const def = MODALS[key];
    if (!def) return;
    modalKey = key;
    modalTrigger = trigger || null;
    modalPanel.classList.toggle('modal-panel--wide', !!def.wide);
    modalTitleEl.innerHTML = def.title;
    modalBodyEl.innerHTML = def.render();
    modalEl.hidden = false;                 // unhide first so afterRender() has real layout
    document.body.classList.add('modal-open');
    if (def.afterRender) def.afterRender();
    void modalEl.offsetWidth;               // reflow so the open transition runs
    modalEl.classList.add('is-open');
    modalPanel.focus();
    if (def.live) { def.live(); modalUpdater = setInterval(def.live, 1000); }
  }

  function closeModal() {
    if (!modalEl || modalEl.hidden) return;
    modalEl.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    if (modalUpdater) { clearInterval(modalUpdater); modalUpdater = null; }
    if (modalTrigger && modalTrigger.focus) modalTrigger.focus();
    modalTrigger = null; modalKey = null;
    setTimeout(() => {                       // hide + unmount after the fade-out
      if (!modalEl.classList.contains('is-open')) {
        modalEl.hidden = true;
        modalBodyEl.innerHTML = '';          // stops the globe iframe + frees the canvas
      }
    }, 340);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(modalPanel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!nodes.length) { e.preventDefault(); modalPanel.focus(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  if (modalEl) {
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
    if (modalCloseEl) modalCloseEl.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (modalEl.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      else trapFocus(e);
    });
    document.querySelectorAll('.stat-card[data-modal]').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.modal, card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(card.dataset.modal, card); }
      });
    });
  }

  // ---------- Seasonal effects ----------
  // Seasons only depend on the calendar date (visitor-local for Christmas and
  // pride, UK wall clock for the birthday) plus the dev-panel overrides, so the
  // per-second tick skips all re-evaluation until one of those flips — midnight
  // crossover is still caught within a second, and dev-panel clicks apply
  // instantly (they mutate devSeasons, which changes the key).
  let lastSeasonKey = null;
  function applySeasons() {
    const now = new Date();
    let key = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + '|' + JSON.stringify(devSeasons);
    if (KazuLib && KazuLib.ukWallParts) {
      const w = KazuLib.ukWallParts(now);
      key = w.year + '-' + w.month + '-' + w.day + '|' + key;
    }
    if (key === lastSeasonKey) return;
    lastSeasonKey = key;
    const s = seasonState(now);
    const body = document.body;
    body.classList.toggle('season-birthday', s.birthday);
    body.classList.toggle('season-christmas', s.christmas);
    body.classList.toggle('season-pride', s.pride);
    // Christmas owns the palette (and hides the theme orb), so it owns the
    // browser-chrome colour too; otherwise follow the active theme.
    setThemeColor(s.christmas ? '#071f16' : (isDark ? '#0d1b31' : '#eaf6ff'));
    if (s.birthday && !bdayCelebrated) { bdayCelebrated = true; fireConfetti(); }
    if (!s.birthday) bdayCelebrated = false; // re-arm if it turns off (e.g. preview param removed)
    syncDevPanel(s); // keep the dev panel's live badges / pressed buttons current
    setBalloons(s.birthday); // balloon canvas runs only while the birthday season is live
  }

  function fireConfetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.getElementById('confetti-canvas')) return; // already running
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    function size() { canvas.width = innerWidth * DPR; canvas.height = innerHeight * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
    size();
    const COLORS = ['#ff5ea8', '#a05cff', '#5cc6ff', '#ffd34d', '#3ddc97', '#ff7a59'];
    const parts = [];
    const COUNT = lightDevice ? 84 : 140; // lighter burst on weak hardware
    for (let i = 0; i < COUNT; i++) parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.32 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 11, vy: Math.random() * -13 - 4, g: 0.28 + Math.random() * 0.12,
      size: 5 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    });
    const start = performance.now(), DURATION = 3200;
    function frame(t) {
      const e = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = Math.max(0, 1 - e / DURATION); // one fade value for the whole frame
      for (const p of parts) {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (e < DURATION) requestAnimationFrame(frame); else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  // ---------- Birthday balloons (canvas physics) ----------
  // Six balloons drift up behind the content while the birthday season is
  // live. The physics core is KazuLib.balloonDriftStep / ropeStep
  // (gate-tested): buoyant drift with deterministic wind gusts for the body,
  // a verlet rope for the string, so the trailing wiggle is real physics,
  // not a keyframe. No local fallback: if lib.js failed to load the balloons
  // sit this one out, same as the manga rows.
  const BALLOON_COLORS = ['#ff5ea8', '#a05cff', '#5cc6ff', '#ffd34d', '#3ddc97', '#ff7a59']; // confetti palette
  const BALLOON_COUNT = 8, BALLOON_SEGS = 7, BALLOON_SEGLEN = 9;
  let balloonCanvas = null, balloonCtx = null, balloonRaf = 0, balloonLast = 0, balloonT = 0;
  let balloons = [];

  function knotPos(b) {
    return { x: b.x - Math.sin(b.tilt) * b.ry, y: b.y + Math.cos(b.tilt) * b.ry };
  }

  function initRope(b) {
    const knot = knotPos(b);
    b.rope = [];
    for (let i = 0; i < BALLOON_SEGS; i++) {
      b.rope.push({ x: knot.x, y: knot.y + i * BALLOON_SEGLEN, px: knot.x, py: knot.y + i * BALLOON_SEGLEN });
    }
  }

  function spawnBalloon(w, h, midAir) {
    const r = 24 + Math.random() * 12;
    const b = {
      x: w * (0.08 + Math.random() * 0.84),
      // Spawn off-screen below the viewport and float in, rather than popping
      // in mid-air. Re-entry after leaving the top also comes from below.
      y: midAir ? h + 80 + Math.random() * 420 : h + 120 + Math.random() * 160,
      vx: 0, vy: 0, tilt: 0,
      r, rx: r * 0.82, ry: r,
      buoy: 15 + Math.random() * 8,       // terminal rise ≈ buoy/drag: 80-130 px/s
      drag: 0.18,
      windAmp: 8 + Math.random() * 8,      // stronger gusts match the quicker pace
      phase: Math.random() * 7,
      color: BALLOON_COLORS[(Math.random() * BALLOON_COLORS.length) | 0],
      rope: [],
    };
    initRope(b);
    return b;
  }

  function sizeBalloonCanvas() {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    balloonCanvas.width = innerWidth * DPR;
    balloonCanvas.height = innerHeight * DPR;
    balloonCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function balloonFrame(now) {
    balloonRaf = requestAnimationFrame(balloonFrame);
    const dt = Math.min((now - balloonLast) / 1000, 0.05); // tab-switch gaps can't teleport
    balloonLast = now;
    balloonT += dt;
    const w = innerWidth, h = innerHeight;
    for (let i = 0; i < balloons.length; i++) {
      let b = balloons[i];
      KazuLib.balloonDriftStep(b, { dt, t: balloonT, buoy: b.buoy, drag: b.drag, windAmp: b.windAmp, phase: b.phase });
      // Soft wall: gusts may never carry a balloon off-screen sideways.
      const M = 50;
      if (b.x < M) b.vx += (M - b.x) * 0.9 * dt;
      else if (b.x > w - M) b.vx -= (b.x - (w - M)) * 0.9 * dt;
      b.tilt = Math.max(-0.3, Math.min(0.3, b.vx * 0.0022)); // lean into the drift
      if (b.y < -(b.ry + 140)) { balloons[i] = b = spawnBalloon(w, h, false); continue; }
      KazuLib.ropeStep(b.rope, knotPos(b), { dt, gravity: 1400, segLen: BALLOON_SEGLEN });
    }
    const c = balloonCtx;
    c.clearRect(0, 0, w, h);
    for (const b of balloons) {
      const pts = b.rope;
      // String first (behind the body): a smooth curve through the rope.
      c.strokeStyle = 'rgba(255,255,255,.55)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      c.stroke();
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.tilt);
      c.fillStyle = b.color;
      c.beginPath(); c.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-5, b.ry - 2); c.lineTo(5, b.ry - 2); c.lineTo(0, b.ry + 7); c.closePath(); c.fill(); // knot
      c.fillStyle = 'rgba(255,255,255,.35)'; // shine
      c.beginPath(); c.ellipse(-b.rx * 0.32, -b.ry * 0.38, b.rx * 0.28, b.ry * 0.34, -0.5, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }

  function startBalloons() {
    if (balloonCanvas) return; // applySeasons re-calls every second: stay idempotent
    if (!KazuLib || !KazuLib.balloonDriftStep || !KazuLib.ropeStep) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    balloonCanvas = document.createElement('canvas');
    balloonCanvas.id = 'balloon-canvas';
    balloonCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(balloonCanvas);
    balloonCtx = balloonCanvas.getContext('2d');
    sizeBalloonCanvas();
    balloons = [];
    const count = lightDevice ? 5 : BALLOON_COUNT; // smaller fleet on weak hardware
    for (let i = 0; i < count; i++) balloons.push(spawnBalloon(innerWidth, innerHeight, true));
    balloonT = 0;
    balloonLast = performance.now();
    window.addEventListener('resize', sizeBalloonCanvas, { passive: true });
    balloonRaf = requestAnimationFrame(balloonFrame);
  }

  function stopBalloons() {
    if (!balloonCanvas) return;
    cancelAnimationFrame(balloonRaf); balloonRaf = 0;
    window.removeEventListener('resize', sizeBalloonCanvas);
    balloonCanvas.remove();
    balloonCanvas = null; balloonCtx = null; balloons = [];
  }

  function setBalloons(on) { if (on) startBalloons(); else stopBalloons(); }

  // ---------- Scroll reveal ----------
  // Every .scroll-reveal element starts hidden (.scroll-reveal in style.css)
  // and fades + slides into place the first time it enters the viewport: an
  // IntersectionObserver adds .is-visible, then stops watching (one-shot, so
  // nothing ever hides again once shown). Elements already on screen on load
  // intersect immediately, so the top of the page still waves in on refresh.
  // Entries arriving in the same batch get a small stagger so grids ripple
  // rather than popping in as one block; the inline delay is cleared once
  // each transition has run, so hover motion stays delay-free afterwards
  // (see the social-card note in style.css).
  const revealEls = Array.from(document.querySelectorAll('.scroll-reveal'));
  const REVEAL_STAGGER = 70, REVEAL_MAX_DELAY = 350;
  const revealEl = (el, delay) => {
    if (delay > 0) {
      el.style.transitionDelay = delay + 'ms';
      setTimeout(() => { el.style.transitionDelay = ''; }, delay + 900);
    }
    el.classList.add('is-visible');
  };
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      let batch = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealObserver.unobserve(entry.target);
        revealEl(entry.target, Math.min(batch++ * REVEAL_STAGGER, REVEAL_MAX_DELAY));
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    // No observer support: everything is simply present.
    revealEls.forEach((el) => revealEl(el, 0));
  }

  // ---------- Konami code easter egg ----------
  // ↑↑↓↓←→←→BA sends the dragon flying across the screen with a snow burst.
  // The sequence check lives in KazuLib.konamiMatch (gate-tested); the local
  // copy keeps the egg alive if lib.js fails to load.
  const konamiMatch = (KazuLib && KazuLib.konamiMatch) || function (recent) {
    const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    if (!recent || recent.length < CODE.length) return false;
    const off = recent.length - CODE.length;
    for (let i = 0; i < CODE.length; i++) if (recent[off + i] !== CODE[i]) return false;
    return true;
  };
  const konamiRecent = [];
  let konamiBusy = false;
  function dragonFly() {
    if (konamiBusy) return;
    konamiBusy = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showToast('You found the dragon! 🐉');
      konamiBusy = false;
      return;
    }
    showToast('🐉 Konami! The dragon takes flight…');
    const d = document.createElement('div');
    d.className = 'konami-dragon';
    d.textContent = '🐉';
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    d.addEventListener('animationend', () => { d.remove(); konamiBusy = false; });
    for (let i = 0; i < 24; i++) {
      const f = document.createElement('span');
      f.className = 'konami-flake';
      f.setAttribute('aria-hidden', 'true');
      f.textContent = Math.random() < 0.5 ? '❄' : '❅';
      f.style.left = (Math.random() * 100) + 'vw';
      f.style.fontSize = (10 + Math.random() * 16) + 'px';
      f.style.color = SNOW_COLORS[(Math.random() * SNOW_COLORS.length) | 0];
      f.style.animationDelay = (Math.random() * 0.9) + 's';
      f.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 5000);
    }
  }
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; // never hijack typing
    konamiRecent.push(e.key);
    if (konamiRecent.length > 10) konamiRecent.shift();
    if (konamiMatch(konamiRecent)) { konamiRecent.length = 0; dragonFly(); }
    // Dev panel code: only single-character keys count, so held modifiers
    // (Shift for capitals, etc.) never pollute the rolling window.
    if (e.key && e.key.length === 1) {
      devRecent.push(e.key);
      if (devRecent.length > 7) devRecent.shift(); // 'kazudev'.length
      if (devCodeMatch(devRecent)) { devRecent.length = 0; toggleDevPanel(); }
    }
    if (e.key === 'Escape') closeDevPanel();
  });

  // ---------- Dev settings panel (secret code: kazudev) ----------
  // A floating panel for previewing the seasonal event themes on any date
  // and checking the responsive sky curve guide. Built once on first use; styles
  // live in style.css ("DEV SETTINGS PANEL").
  const DEV_SEASON_ROWS = [
    ['birthday', '🎂 Birthday'],
    ['christmas', '🎄 Christmas'],
    ['pride', '🏳️‍🌈 Pride'],
  ];
  const devRecent = [];
  let devPanel = null;

  function buildDevPanel() {
    const el = document.createElement('div');
    el.id = 'devPanel';
    el.className = 'dev-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Developer settings');
    el.hidden = true;
    let html = '<div class="dev-panel-head">' +
        '<span class="dev-panel-title">🛠 Dev settings</span>' +
        '<button type="button" class="dev-panel-close" aria-label="Close developer settings">✕</button>' +
      '</div>' +
      '<div class="dev-panel-sub">Season triggers + responsive scenery preview:</div>';
    DEV_SEASON_ROWS.forEach((row) => {
      html += '<div class="dev-row" data-season="' + row[0] + '">' +
          '<span class="dev-row-label">' + row[1] + ' <span class="dev-live" hidden>live</span></span>' +
          '<span class="dev-seg" role="group" aria-label="' + row[1] + ' season override">' +
            '<button type="button" data-mode="auto">Auto</button>' +
            '<button type="button" data-mode="on">On</button>' +
            '<button type="button" data-mode="off">Off</button>' +
          '</span>' +
        '</div>';
    });
    html += '<div class="dev-row" data-setting="curve">' +
        '<span class="dev-row-label">Sky curve guide</span>' +
        '<span class="dev-seg" role="group" aria-label="Sky curve guide mode">' +
          '<button type="button" data-mode="auto">Auto</button>' +
          '<button type="button" data-mode="on">On</button>' +
          '<button type="button" data-mode="off">Off</button>' +
        '</span>' +
      '</div>';
    html += '<button type="button" class="dev-reset">Reset all to auto</button>' +
      '<div class="dev-hint">type <kbd>kazudev</kbd> to toggle · Esc to close</div>';
    el.innerHTML = html;

    el.querySelector('.dev-panel-close').addEventListener('click', closeDevPanel);
    el.querySelector('.dev-reset').addEventListener('click', () => {
      devSeasons = {};
      devCurveMode = 'auto';
      saveDevSeasons();
      saveDevCurve();
      applySkyCurveMode(devCurveMode);
      applySeasons();
      syncDevPanel(seasonState(new Date()));
      showToast('Dev overrides cleared — back to auto');
    });
    el.querySelectorAll('.dev-row[data-season] .dev-seg button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const season = btn.closest('.dev-row').dataset.season;
        if (btn.dataset.mode === 'auto') delete devSeasons[season];
        else devSeasons[season] = btn.dataset.mode;
        saveDevSeasons();
        applySeasons(); // repaint now; the per-second tick keeps it honest
      });
    });
    el.querySelectorAll('.dev-row[data-setting="curve"] .dev-seg button').forEach((btn) => {
      btn.addEventListener('click', () => {
        devCurveMode = devModeParse(btn.dataset.mode);
        saveDevCurve();
        applySkyCurveMode(devCurveMode);
        syncDevPanel(seasonState(new Date()));
      });
    });
    document.body.appendChild(el);
    return el;
  }

  // Reflects the effective season state into the open panel: which rows are
  // live right now, and which override (if any) is armed on each. Called by
  // applySeasons (every second) and on open.
  function syncDevPanel(s) {
    if (!devPanel || devPanel.hidden) return;
    DEV_SEASON_ROWS.forEach((row) => {
      const key = row[0];
      const rowEl = devPanel.querySelector('.dev-row[data-season="' + key + '"]');
      if (!rowEl) return;
      const live = rowEl.querySelector('.dev-live');
      if (live) live.hidden = !s[key];
      const mode = devSeasons[key] || 'auto';
      rowEl.querySelectorAll('.dev-seg button').forEach((b) => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    const curveRow = devPanel.querySelector('.dev-row[data-setting="curve"]');
    if (curveRow) {
      curveRow.querySelectorAll('.dev-seg button').forEach((b) => {
        const on = b.dataset.mode === devCurveMode;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
  }

  function toggleDevPanel() {
    if (!devPanel) devPanel = buildDevPanel();
    if (!devPanel.hidden) { closeDevPanel(); return; } // re-typing the code closes it
    devPanel.hidden = false;
    syncDevPanel(seasonState(new Date()));
    showToast('🛠 Dev settings unlocked');
  }

  function closeDevPanel() {
    if (devPanel) devPanel.hidden = true;
  }

  // ---------- Boot ----------
  // "Add me" pill + the @username line both copy my Discord username to the clipboard
  const addMeLink = $('discordAddMe');
  if (addMeLink) addMeLink.addEventListener('click', copyDiscordUsername);
  const usernameBtn = $('discordUsername');
  if (usernameBtn) usernameBtn.addEventListener('click', copyDiscordUsername);

  // Retry buttons on the weather / Discord error states
  const weatherRetry = $('weatherRetry');
  if (weatherRetry) weatherRetry.addEventListener('click', () => {
    $('weatherError').classList.add('hidden');
    $('weatherLoading').classList.remove('hidden');
    loadWeather();
  });
  const discordRetryBtn = $('discordRetry');
  if (discordRetryBtn) discordRetryBtn.addEventListener('click', () => {
    $('discordError').classList.add('hidden');
    $('discordLoading').classList.remove('hidden');
    loadDiscord();
    startLanyard(); // also re-arm the socket if it was the one that failed
  });
  const malRetryBtn = $('malRetry');
  if (malRetryBtn) malRetryBtn.addEventListener('click', () => {
    $('malError').classList.add('hidden');
    $('malLoading').classList.remove('hidden');
    loadMal();
  });
  const lbRetryBtn = $('lbRetry');
  if (lbRetryBtn) lbRetryBtn.addEventListener('click', () => {
    $('lbError').classList.add('hidden');
    $('lbLoading').classList.remove('hidden');
    loadLetterboxd();
  });

  // Quote box: click / Enter / Space deals a new quote (debounced in reshuffleQuote)
  const quoteBox = $('quoteBox');
  if (quoteBox) {
    quoteBox.addEventListener('click', reshuffleQuote);
    quoteBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reshuffleQuote(); }
    });
  }

  setAtmosphere(ATMOSPHERE_OVERRIDE || 'blossom');

  // ---------- Pause polling/ticking while the page isn't visible ----------
  // Saves battery/data when the tab is backgrounded or the phone screen is
  // locked/swiped away — covered by the Page Visibility API on both desktop
  // and mobile browsers (Chrome included).
  //
  // Each poller stamps its last run and startPolling only refetches what's
  // actually stale. Before the stamp, every visibilitychange fired all five
  // fetchers at once, so rapid tab-switching stormed the APIs (and the CORS
  // proxy, which rate-limits).
  //
  // Every live-API fetch passes { cache: 'no-store' }, so the browser HTTP
  // cache can never answer for Discord/Steam/MAL/Letterboxd: each poll and
  // each reload goes straight to the network and the cards track the server
  // end. (The service worker ignores cross-origin requests entirely — see
  // sw.js — so there is no second cache layer in front of them either.)
  const POLLERS = [
    { fn: tick, ms: 1000, last: 0 },
    { fn: loadWeather, ms: 10 * 60 * 1000, last: 0 },
    { fn: loadDiscord, ms: 20 * 1000, last: 0 },
    { fn: loadSteam, ms: 5 * 60 * 1000, last: 0 },
    { fn: loadMalAll, ms: 10 * 60 * 1000, last: 0 },
    { fn: loadLetterboxd, ms: 30 * 60 * 1000, last: 0 },
    { fn: loadPlaylistTracks, ms: 30 * 60 * 1000, last: 0, firstDelay: 2000 },
    // firstDelay: the lowest-priority cards yield their FIRST fetch to the
    // critical load-time resources (fonts, hero image, weather, Discord)
    // instead of joining the load-time burst. Intervals/payloads unchanged.
    { fn: loadMusicRecent, ms: 2 * 60 * 1000, last: 0, firstDelay: 1000 },
    { fn: loadQuote, ms: 15 * 60 * 1000, last: 0, firstDelay: 1500 },
  ];
  let timers = [];

  function runPoller(p) { p.last = Date.now(); p.fn(); }

  function startPolling() {
    if (timers.length) return; // already running
    const now = Date.now();
    for (const p of POLLERS) {
      if (now - p.last >= p.ms) {
        // The delayed first run's id lands in the same timers array —
        // clearTimeout and clearInterval are interchangeable — so the
        // visibility pause cancels it like everything else.
        if (p.firstDelay && !p.last) timers.push(setTimeout(() => runPoller(p), p.firstDelay));
        else runPoller(p); // stale → refresh now; fresh → wait for the interval
      }
      timers.push(setInterval(() => runPoller(p), p.ms));
    }
  }
  function stopPolling() {
    timers.forEach(clearInterval);
    timers = [];
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPolling(); stopLanyard(); }
    else { startPolling(); startLanyard(); }
  });

  if (!document.hidden) { startPolling(); startLanyard(); }
})();

/* ============================================================================
   LIQUID GLASS — refractive rim for the translucent cards
   ----------------------------------------------------------------------------
   Progressive enhancement on top of the CSS frosted-glass look (see style.css).
   The displacement-map maths here is the lens demo's buildLensMap, adapted from a
   draggable lens-over-cloned-scene into a static, per-card backdrop-filter: for
   each translucent card we bake a PNG whose R/G channels encode an inward
   refraction "ring" sitting just inside the rounded edge (flat, undistorted
   interior so text stays crisp), feed it to an feDisplacementMap, and apply that
   via `backdrop-filter: … url(#id)` so the real page content behind the card bends
   at the rim. Chromium-only: backdrop-filter + SVG filters don't compose in
   WebKit/Gecko, so elsewhere this bails and the cards keep the stylesheet's blur +
   glint. Maps are cached by size and only rebuilt when a card changes size. */
(() => {
  const ua = navigator.userAgent;
  const CAN_REFRACT =
    'CSS' in window && CSS.supports && CSS.supports('backdrop-filter', 'url("#a")') &&
    /Chrome|Chromium|Edg|OPR/.test(ua) && !/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua);
  if (!CAN_REFRACT) return;

  const housing = document.getElementById('glass-filters');
  if (!housing) return;

  // --- tuning ---
  // Displacement only warps the BACKDROP behind the card (never the card's own
  // text), so we can push it hard for an obvious glass-edge magnification while
  // keeping the interior flat + readable. Keep BLUR modest: a heavy blur flattens
  // the backdrop to a uniform wash, leaving the displacement nothing to refract.
  const DEPTH = 20;    // displacement scale in px — refraction strength at the rim
  const RIM = 2;       // edge inset + width of the hard part of the bevel
  const FEATHER = 26;  // soft inner falloff — width of the visible refractive band
  const CURVE = 1.4;   // bevel profile shaping (matches the demo's "curvature")
  const BOOST = 0.9;   // displacement-map saturation
  const BLUR = 0;      // backdrop blur under the refraction (matches the CSS base)
  const SAT = 1.7;     // backdrop saturation (matches the CSS base)

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const mapCache = new Map();

  // Bake a w×h displacement map: a rounded-rect SDF (inset by RIM so the bevel sits
  // fully inside the box) drives an inward-pointing refraction ring along the edge.
  function buildMap(w, h, radius) {
    const key = w + 'x' + h + 'r' + Math.round(radius);
    const hit = mapCache.get(key);
    if (hit) return hit;

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h), px = img.data;

    const hx = w / 2 - RIM, hy = h / 2 - RIM;                 // glass half-size (inset)
    const rad = Math.max(0, Math.min(radius - RIM, hx, hy));  // corner radius, clamped
    const sdf = (x, y) => {                                   // signed dist to the edge
      const qx = Math.abs(x - w / 2) - (hx - rad);
      const qy = Math.abs(y - h / 2) - (hy - rad);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rad;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        const s = sdf(cx, cy);
        const gx = sdf(cx + 1, cy) - sdf(cx - 1, cy);         // outward edge normal
        const gy = sdf(cx, cy + 1) - sdf(cx, cy - 1);
        const len = Math.hypot(gx, gy) || 1;
        const nx = gx / len, ny = gy / len;
        const span = s < 0 ? RIM + FEATHER : RIM;             // softer falloff inside
        let amt = Math.max(0, 1 - Math.abs(s) / span);
        amt = amt * amt * amt * (amt * (amt * 6 - 15) + 10);  // smootherstep (no crease)
        amt = Math.pow(amt, CURVE);
        const i = (y * w + x) * 4;
        px[i]     = clamp255(Math.round(127.5 - nx * amt * 127 * BOOST)); // R = x displ (inward)
        px[i + 1] = clamp255(Math.round(127.5 - ny * amt * 127 * BOOST)); // G = y displ
        px[i + 2] = 128;                                      // B unused
        px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL('image/png');
    if (mapCache.size > 60) mapCache.delete(mapCache.keys().next().value);
    mapCache.set(key, url);
    return url;
  }

  const filters = new Map(); // id -> <filter> markup, all re-rendered into the housing
  let housingDirty = false;
  // The whole <defs> is a single innerHTML rewrite, so batch it: refresh()
  // just marks it dirty and refreshAll() writes once at the end, instead of
  // re-rendering the full defs once per card during a resize storm.
  function renderHousing() {
    if (!housingDirty) return;
    housingDirty = false;
    housing.innerHTML = '<defs>' + Array.from(filters.values()).join('') + '</defs>';
  }

  // Rebuild a card's filter only when its size actually changes (responsive reflow,
  // font load, toast growing to fit its text), then point its backdrop-filter at it.
  function refresh(card) {
    const r = card.el.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || (w === card.w && h === card.h)) return;
    card.w = w; card.h = h;
    const radius = parseFloat(getComputedStyle(card.el).borderTopLeftRadius) || 18;
    const url = buildMap(w, h, radius);
    filters.set(card.id,
      '<filter id="' + card.id + '" x="0" y="0" width="100%" height="100%" ' +
      'filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">' +
      '<feImage href="' + url + '" xlink:href="' + url + '" x="0" y="0" width="' + w +
      '" height="' + h + '" preserveAspectRatio="none" result="map"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + DEPTH +
      '" xChannelSelector="R" yChannelSelector="G"/></filter>');
    housingDirty = true;
    const f = 'blur(' + BLUR + 'px) saturate(' + SAT + ') url(#' + card.id + ')';
    card.el.style.backdropFilter = card.el.style.webkitBackdropFilter = f;
  }

  // Every .card refracts by default — the birthday tile is the one opt-out
  // (solid brand gradient, nothing to refract through). The toast joins too.
  // Keying the selector off .card means any future card gets the rim
  // automatically. (The social tiles used to be excluded — the rim read as a
  // drawn-on outline on them — but they're full glass citizens now.)
  const cards = Array.from(
    document.querySelectorAll('.card:not(.stat-card--bday), .toast'),
  ).map((el, i) => ({ el, id: 'glass-' + i, w: 0, h: 0 }));

  function refreshAll() { cards.forEach(refresh); renderHousing(); }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; refreshAll(); });
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    cards.forEach((c) => ro.observe(c.el));
  } else {
    window.addEventListener('resize', schedule, { passive: true });
  }

  refreshAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshAll);
  window.addEventListener('load', refreshAll);

  // Scroll-idle refraction: re-running every card's SVG displacement filter
  // against a moving backdrop is the desktop scroll stutter, so while the
  // page is actively scrolling html.glass-scrolling swaps the cards back to
  // the stylesheet's plain frosted blur (the look Safari/Firefox always
  // render). The refractive rims return ~120ms after the scroll stops. The
  // handler only toggles a class — no layout reads, no per-card work.
  let scrollIdleTimer = null;
  window.addEventListener('scroll', () => {
    document.documentElement.classList.add('glass-scrolling');
    if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null;
      document.documentElement.classList.remove('glass-scrolling');
    }, 120);
  }, { passive: true });
})();

/* ============================================================================
   Custom scrollbars, site-wide (fine pointers only)
   ----------------------------------------------------------------------------
   Every vertical scroller gets the site-styled bar (frosted track, light
   thumb, up/down steppers): the window itself, plus any inner overflow
   container found by a DOM scan — today that's the card detail modal, and any
   future `overflow-y: auto/scroll` element is picked up automatically by the
   MutationObserver. Native bars are hidden only where a custom bar is active
   (html.has-cscroll for the window, .cscroll-host for inner hosts), so touch
   devices and no-JS keep the real thing everywhere. Wheel and keyboard
   scrolling are untouched — each bar is a visual mirror plus pointer controls.
   Geometry comes from KazuLib (lib.js, pinned by tests.js / tests.html);
   local fallbacks keep it alive if lib.js fails.
   ========================================================================== */
(() => {
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;

  const KazuLib = window.KazuLib;
  // Owned by lib.js (single source of truth, gate-tested); local copies below.
  const thumbGeometry = (KazuLib && KazuLib.scrollThumbGeometry) || function (o) {
    o = o || {};
    const viewportH = Math.max(0, +o.viewportH || 0);
    const contentH = Math.max(0, +o.contentH || 0);
    const trackH = Math.max(0, +o.trackH || 0);
    const maxScroll = contentH - viewportH;
    if (maxScroll <= 1 || trackH <= 0) return { shown: false, thumbH: 0, thumbTop: 0, maxScroll: 0 };
    const minThumbH = Math.max(10, +o.minThumbH || 28);
    let thumbH = Math.round(trackH * (viewportH / contentH));
    thumbH = Math.min(trackH, Math.max(minThumbH, thumbH));
    const scrollY = Math.min(Math.max(+o.scrollY || 0, 0), maxScroll);
    return { shown: true, thumbH, thumbTop: Math.round((scrollY / maxScroll) * (trackH - thumbH)), maxScroll };
  };
  const thumbScrollY = (KazuLib && KazuLib.scrollThumbScrollY) || function (o) {
    o = o || {};
    const maxScroll = Math.max(0, +o.maxScroll || 0);
    const travel = Math.max(0, (+o.trackH || 0) - (+o.thumbH || 0));
    if (travel <= 0 || maxScroll <= 0) return 0;
    return (Math.min(Math.max(+o.thumbTop || 0, 0), travel) / travel) * maxScroll;
  };

  const rootEl = document.documentElement;
  const STEP = 56;        // px per click, about a text line and a half
  const HOLD_DELAY = 350; // ms before holding turns into a glide (OS-like)
  const GLIDE = 1500;     // px/s while held

  // Visual mirror only: aria-hidden, no tab stop — native keyboard scrolling
  // still works, so the buttons never need focus. Starts visible: a
  // display:none track measures 0px tall and could never unhide itself;
  // render() hides it synchronously when there's nothing to scroll.
  function buildBar(inner) {
    const bar = document.createElement('div');
    bar.className = inner ? 'cscroll cscroll--inner' : 'cscroll';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML =
      '<button class="cscroll-btn cscroll-btn--up" type="button" tabindex="-1">' +
        '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.2 9.2 8H0.8Z"/></svg>' +
      '</button>' +
      '<div class="cscroll-track"><div class="cscroll-thumb"></div></div>' +
      '<button class="cscroll-btn cscroll-btn--down" type="button" tabindex="-1">' +
        '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 8.8 0.8 2h8.4Z"/></svg>' +
      '</button>';
    return bar;
  }

  // One scroller = one vertical scroll target. `host` null means the window
  // (fixed bar on <body>); otherwise the bar mounts inside a zero-height
  // STICKY WRAPPER, prepended as the host's first in-flow child. An
  // absolutely-placed bar would scroll away with the content and need a JS
  // re-pin every frame — but a composited (fast wheel) scroll repaints the
  // content before the pin lands, so the whole bar visibly trails.
  // position:fixed doesn't help either: a fixed child still rides its own
  // scroller's content (verified in Edge). The sticky wrapper sticks to the
  // scrollport ON THE COMPOSITOR, lag-free by construction, and height:0
  // gives it no flow footprint so prepending shifts no content. The bar is
  // absolute inside it: sticky boxes compute auto margins to 0 and ignore
  // over-constrained negative margins, so the bar could not right-align or
  // poke past the host's padding on its own (see render() for geometry).
  // opts: { host, viewportH(), contentH(), scroll(), scrollTo(y) }
  function createScroller(opts) {
    const host = opts.host || null;
    const bar = buildBar(!!host);
    let mount = bar;
    if (host) {
      const stick = document.createElement('div');
      stick.className = 'cscroll-stick';
      stick.setAttribute('aria-hidden', 'true');
      stick.appendChild(bar);
      host.prepend(stick);
      mount = stick;
      host.classList.add('cscroll-host'); // style.css hides the host's native bar
    } else {
      document.body.appendChild(bar);
    }

    const track = bar.querySelector('.cscroll-track');
    const thumb = bar.querySelector('.cscroll-thumb');
    const btnUp = bar.querySelector('.cscroll-btn--up');
    const btnDown = bar.querySelector('.cscroll-btn--down');

    let trackH = 0, thumbH = 0, travel = 0, maxScroll = 0;
    let rafId = 0, needMeasure = true, destroyed = false;

    function render() {
      rafId = 0;
      if (destroyed) return;
      if (host && !host.isConnected) { destroy(); return; }
      if (needMeasure) {
        needMeasure = false;
        bar.classList.remove('cscroll--hidden'); // display:none measures 0px
        if (host) {
          // Bar geometry inside the sticky wrapper (style.css owns
          // position/top/width): height = the host's content-box height, so
          // the bar's insets equal the host's own padding — the modal
          // panel's 26/28px padding also keeps the arrow buttons clear of
          // its 26px corner radius, which clipped them when the bar hugged
          // the edges. right compensates the host's right padding so the
          // bar sits 4px off the host's inner edge.
          const hcs = getComputedStyle(host);
          const padT = parseFloat(hcs.paddingTop) || 0;
          const padB = parseFloat(hcs.paddingBottom) || 0;
          const padR = parseFloat(hcs.paddingRight) || 0;
          bar.style.height = Math.max(0, host.clientHeight - padT - padB) + 'px';
          bar.style.right = (4 - padR) + 'px';
        }
        trackH = track.getBoundingClientRect().height;
      }
      const g = thumbGeometry({ viewportH: opts.viewportH(), contentH: opts.contentH(), trackH, scrollY: opts.scroll() });
      bar.classList.toggle('cscroll--hidden', !g.shown);
      if (!g.shown) return;
      maxScroll = g.maxScroll;
      thumbH = g.thumbH;
      travel = trackH - thumbH;
      thumb.style.height = thumbH + 'px';
      thumb.style.transform = 'translateY(' + g.thumbTop + 'px)';
    }
    // Plain scrolls only need a repaint; resizes and content changes can also
    // change the track height, so those re-measure first.
    const schedule = (withMeasure) => {
      if (destroyed) return;
      if (withMeasure) needMeasure = true;
      if (!rafId) rafId = requestAnimationFrame(render);
    };

    (host || window).addEventListener('scroll', () => schedule(false), { passive: true });
    let ro = null, mo = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => schedule(true));
      ro.observe(host || document.body);
    }
    // Inner hosts change CONTENT without changing size (modal bodies are
    // injected into a fixed-height panel) — scrollHeight shifts never fire
    // ResizeObserver on the host, so watch the subtree too.
    if (host && 'MutationObserver' in window) {
      mo = new MutationObserver(() => schedule(false));
      mo.observe(host, { childList: true, subtree: true, characterData: true });
    }

    function destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId); rafId = 0;
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      mount.remove();
      if (host) host.classList.remove('cscroll-host');
    }

    // ---- Thumb dragging ----
    let drag = null;
    thumb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || maxScroll <= 0) return;
      e.preventDefault();
      try { thumb.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers have no id */ }
      drag = { pointerY: e.clientY, startThumbTop: (opts.scroll() / maxScroll) * travel };
      rootEl.classList.add('cscroll-dragging');
    });
    thumb.addEventListener('pointermove', (e) => {
      if (!drag) return;
      opts.scrollTo(thumbScrollY({ trackH, thumbH, thumbTop: drag.startThumbTop + (e.clientY - drag.pointerY), maxScroll }));
    });
    const endDrag = () => { drag = null; rootEl.classList.remove('cscroll-dragging'); };
    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);

    // ---- Steppers: one line-step per click; hold to glide. ----
    function bindStepper(btn, dir) {
      let delayT = 0, glideRaf = 0, lastT = 0;
      const stop = () => {
        clearTimeout(delayT); delayT = 0;
        cancelAnimationFrame(glideRaf); glideRaf = 0;
      };
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers have no id */ }
        opts.scrollTo(opts.scroll() + dir * STEP);
        delayT = setTimeout(() => {
          lastT = performance.now();
          const tick = (t) => {
            const dt = Math.min(64, t - lastT); // tab-switch gaps shouldn't teleport
            lastT = t;
            opts.scrollTo(opts.scroll() + dir * GLIDE * dt / 1000);
            glideRaf = requestAnimationFrame(tick);
          };
          glideRaf = requestAnimationFrame(tick);
        }, HOLD_DELAY);
      });
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('lostpointercapture', stop);
    }
    bindStepper(btnUp, -1);
    bindStepper(btnDown, 1);

    // ---- Track: page toward the click; hold to keep paging. Stops once the
    // thumb edge reaches the pointer, like a native bar. ----
    let pageTimer = 0, pageDelay = 0;
    const stopPaging = () => {
      clearTimeout(pageDelay); pageDelay = 0;
      clearInterval(pageTimer); pageTimer = 0;
    };
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== track) return;
      e.preventDefault();
      try { track.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers have no id */ }
      const page = () => {
        const r = thumb.getBoundingClientRect();
        if (e.clientY < r.top) opts.scrollTo(opts.scroll() - opts.viewportH() * 0.9);
        else if (e.clientY > r.bottom) opts.scrollTo(opts.scroll() + opts.viewportH() * 0.9);
        else stopPaging(); // thumb arrived under the pointer
      };
      page();
      pageDelay = setTimeout(() => { pageTimer = setInterval(page, 90); }, HOLD_DELAY);
    });
    track.addEventListener('pointerup', stopPaging);
    track.addEventListener('pointercancel', stopPaging);
    track.addEventListener('lostpointercapture', stopPaging);

    render();
    return { schedule, destroy };
  }

  // ---- The window scroller ----
  // 'instant' per call: the stylesheet's `scroll-behavior: smooth` would
  // otherwise make drag and stepper scrolls trail behind the pointer.
  const winScroller = createScroller({
    host: null,
    viewportH: () => window.innerHeight,
    contentH: () => Math.max(rootEl.scrollHeight, document.body ? document.body.scrollHeight : 0),
    scroll: () => window.scrollY,
    scrollTo: (y) => window.scrollTo({ top: y, behavior: 'instant' }),
  });
  rootEl.classList.add('has-cscroll'); // style.css hides the native window bar
  window.addEventListener('resize', () => winScroller.schedule(true), { passive: true });
  window.addEventListener('load', () => winScroller.schedule(true));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => winScroller.schedule(true));
  // body.modal-open hides the window bar (style.css) while the modal locks
  // page scroll — re-measure when it toggles so the bar never goes stale.
  if ('MutationObserver' in window) {
    new MutationObserver(() => winScroller.schedule(true))
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // ---- Inner scrollers: auto-discovered, now and as the DOM changes ----
  // Any element styled overflow-y: auto/scroll gets a bar — the card detail
  // modal today, anything future automatically. Bars inside bars are skipped.
  const attached = new WeakSet();
  let scanRaf = 0;
  function scan() {
    scanRaf = 0;
    document.querySelectorAll('*').forEach((el) => {
      if (attached.has(el) || el.closest('.cscroll')) return;
      // Cheap reject first: only an overflowing element can need a bar. The
      // scrollHeight/clientHeight reads batch into a single layout pass (no
      // writes between them), while getComputedStyle forces a style recalc
      // PER ELEMENT — so the expensive check now runs on a handful of
      // candidates instead of the whole DOM. Elements that only start
      // overflowing later are caught by the next mutation/load/resize scan;
      // until then they'd have shown a self-hidden bar anyway, so nothing
      // visible changes.
      if (el.scrollHeight <= el.clientHeight + 1) return;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') return;
      attached.add(el);
      createScroller({
        host: el,
        viewportH: () => el.clientHeight,
        contentH: () => el.scrollHeight,
        scroll: () => el.scrollTop,
        // Inline style beats any stylesheet scroll-behavior for the duration
        // of the write, so drags and steppers stay 1:1 on smooth-styled hosts.
        scrollTo: (y) => {
          el.style.scrollBehavior = 'auto';
          el.scrollTop = y;
          el.style.scrollBehavior = '';
        },
      });
    });
  }
  const scheduleScan = () => { if (!scanRaf) scanRaf = requestAnimationFrame(scan); };
  if ('MutationObserver' in window) {
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  }
  scan();
  window.addEventListener('load', scheduleScan);
  window.addEventListener('resize', scheduleScan, { passive: true });
})();

/* ============================================================================
   Heavy smooth scroll (wheel lerp)
   ----------------------------------------------------------------------------
   "Lazy" scrolling: wheel input no longer jumps the page in notches — each
   turn of the wheel accumulates into a target position and a rAF loop eases
   the real scroll toward it, so the page feels weighted, like it has
   momentum and mass. The ease is scaled by the real frame delta (the rAF
   timestamp), so the glide's time constant is the same at any refresh rate
   — without that, high-Hz displays shrink the tail 2-4x and the scroll
   stops dead the moment the wheel does instead of slowing to a stop.
   Wheel-only: touch flings keep their native inertia, and everything else
   that moves the real scroll position — keyboard, the custom scrollbar's
   drag/steppers, the to-top button, anchor jumps — is adopted via the
   scroll listener (any scroll the loop didn't write itself is external
   input: resync and yield). Skipped entirely under prefers-reduced-motion.
   The maths lives in lib.js (wheelDeltaPx, smoothScrollStep, gate-tested);
   local fallbacks keep it alive if lib.js fails to load.
   ========================================================================== */
(() => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const KazuLib = window.KazuLib;
  // Owned by lib.js (single source of truth, gate-tested); local copies below.
  const wheelDeltaPx = (KazuLib && KazuLib.wheelDeltaPx) || function (deltaY, deltaMode) {
    const d = +deltaY;
    if (isNaN(d)) return 0;
    if (deltaMode === 1) return d * 16;
    if (deltaMode === 2) return d * 800;
    return d;
  };
  const smoothScrollStep = (KazuLib && KazuLib.smoothScrollStep) || function (current, target, ease, dtMs, snap) {
    let c = +current, t = +target;
    if (isNaN(c) || isNaN(t)) return 0;
    let e = +ease; if (isNaN(e) || e <= 0 || e > 1) e = 0.1;
    let dt = +dtMs; if (isNaN(dt) || dt <= 0) dt = 1000 / 60;
    if (dt > 100) dt = 100;
    let s = +snap; if (isNaN(s) || s <= 0) s = 0.5;
    const diff = t - c;
    return Math.abs(diff) <= s ? t : c + diff * (1 - Math.pow(1 - e, dt / (1000 / 60)));
  };

  // Fraction of the remaining gap closed per 60fps frame: lower = heavier.
  // 0.12 keeps the weighted feel but tracks the wheel closely and settles in
  // under half a second — the old 0.03 trailed input by seconds, so reversing
  // direction meant fighting the old tail (read as jitter) and scroll events
  // kept firing long after the wheel stopped. smoothScrollStep scales the
  // fraction by the real frame delta, so the glide lasts the same wall-clock
  // time on a 240Hz display as on a 60Hz one.
  const SMOOTH_EASE = 0.12;

  let targetY = window.scrollY;
  let lastWritten = window.scrollY; // loop's last write; scroll events matching it are our own
  let rafId = null;
  let lastTickAt = 0; // rAF timestamp of the previous tick; 0 = no glide running
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const tick = (now) => {
    rafId = null;
    const dt = lastTickAt ? now - lastTickAt : 1000 / 60;
    lastTickAt = now;
    targetY = Math.min(Math.max(targetY, 0), maxScroll()); // content can shrink mid-glide
    // Fractional writes, 0.5px snap: the exponential tail decays smoothly to
    // a stop. (Rounding writes to whole pixels made the tail stall below a
    // 1px step and then jump the remaining gap in one frame — an abrupt
    // stop.)
    const next = Math.min(Math.max(smoothScrollStep(window.scrollY, targetY, SMOOTH_EASE, dt, 0.5), 0), maxScroll());
    lastWritten = next;
    window.scrollTo({ top: next, behavior: 'instant' });
    if (next !== targetY) rafId = requestAnimationFrame(tick);
    else lastTickAt = 0;
  };

  // Programmatic glides (the back-to-top button) ride the same loop — a
  // native smooth scrollTo would be stomped by the loop's per-frame writes.
  window.kazuSmoothScrollTo = (y) => {
    targetY = Math.min(Math.max(+y || 0, 0), maxScroll());
    if (rafId === null) { lastTickAt = 0; rafId = requestAnimationFrame(tick); }
  };

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch-zoom gesture, not a scroll
    // An open modal owns the wheel: its panel scrolls natively (with its own
    // custom scrollbar) and the window behind it is scroll-locked anyway.
    if (e.target && e.target.closest && e.target.closest('.modal-overlay')) return;
    e.preventDefault();
    targetY = Math.min(Math.max(targetY + wheelDeltaPx(e.deltaY, e.deltaMode), 0), maxScroll());
    if (rafId === null) { lastTickAt = 0; rafId = requestAnimationFrame(tick); }
  }, { passive: false });

  // Any scroll the loop didn't write is external (keyboard, scrollbar drag,
  // to-top button, anchor jump): adopt it as the new resting point so the
  // loop never fights back.
  window.addEventListener('scroll', () => {
    if (rafId === null || Math.abs(window.scrollY - lastWritten) > 2) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      lastTickAt = 0;
      targetY = window.scrollY;
      lastWritten = window.scrollY;
    }
  }, { passive: true });
})();
