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

  // ---------- Site control: settings saved by the control panel ----------
  // The panel keeps a small settings document in an online store. index.html names
  // its address in <meta name="kazu-control"> and #boot-control starts the download
  // before this file arrives. With no address, no network or bad data the page is
  // exactly what index.html says. KazuSiteConfig (site-config.js) validates every
  // value, and settings only reach the page through textContent, vetted attributes
  // and classes, never innerHTML. The last good copy is cached in localStorage so a
  // repeat visit applies it before anything paints. The applying half of this lives
  // just above "Scroll reveal"; this half is here because the constants below use it.
  const SiteConfig = window.KazuSiteConfig;
  const SITE_CONFIG_KEY = 'kazu-site-config';
  const NOTICE_KEY = 'kazu-notice-dismissed';
  const CONTROL_URL = (() => {
    const meta = document.querySelector('meta[name="kazu-control"]');
    const url = meta ? meta.getAttribute('content') : '';
    return SiteConfig && SiteConfig.controlUrlOk(url) ? url : '';
  })();
  let siteCfg = { schema: 1 };
  let siteCfgText = '{"schema":1}';
  try {
    const cached = CONTROL_URL ? JSON.parse(localStorage.getItem(SITE_CONFIG_KEY)) : null;
    if (cached && cached.u === CONTROL_URL && typeof cached.t === 'string') {
      siteCfg = SiteConfig.normalize(JSON.parse(cached.t)).config;
      siteCfgText = JSON.stringify(siteCfg);
    }
  } catch (e) {}
  const siteDefaults = {};
  const siteSection = (key) => (SiteConfig && SiteConfig.isManaged(siteCfg, key) ? siteCfg[key] : null);
  const siteIntegration = (name) => { const i = siteSection('integrations'); return i && i[name] ? i[name] : null; };
  const siteIntegrationOn = (name) => { const i = siteIntegration(name); return !i || i.enabled !== false; };
  const siteSectionOff = (name) => { const s = siteSection('sections'); return !!s && s[name] === false; };
  // The last quoted value on each declaration below is the page's own default.
  function siteId(name, field, fallback) {
    siteDefaults[name + '.' + field] = fallback;
    const i = siteIntegration(name);
    return (i && i[field]) || fallback;
  }
  function siteValue(section, field, fallback) {
    siteDefaults[section + '.' + field] = fallback;
    const s = siteSection(section);
    return (s && s[field]) || fallback;
  }
  let DISCORD_ID = siteId('discord', 'userId', '346360416827473921');
  let STEAM_VANITY = siteId('steam', 'vanity', 'Kazu-Hani');

  // Keep live API names, titles and statuses emoji-free as cards populate.
  // Watching only changed text/labels avoids re-scanning the page each tick;
  // scripts, styles, URLs and the illustrated SVG scenery are left alone.
  const stripEmoji = (KazuLib && KazuLib.stripEmoji) || function (s) {
    return String(s == null ? '' : s).replace(/[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{1,2}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?)*[\u{E0020}-\u{E007F}]*|\p{Emoji_Modifier}|[\uFE0E\uFE0F]/gu, '');
  };
  function cleanEmojiText(node) {
    if (node.nodeType === 3) {
      if (node.parentElement && node.parentElement.closest('script, style')) return;
      const clean = stripEmoji(node.nodeValue);
      if (clean !== node.nodeValue) node.nodeValue = clean;
      return;
    }
    if (node.nodeType !== 1) return;
    ['alt', 'title', 'aria-label'].forEach((name) => {
      const value = node.getAttribute(name);
      if (value !== null) {
        const clean = stripEmoji(value);
        if (clean !== value) node.setAttribute(name, clean);
      }
    });
    Array.from(node.childNodes).forEach(cleanEmojiText);
  }
  cleanEmojiText(document.body);
  new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'childList') record.addedNodes.forEach(cleanEmojiText);
      else cleanEmojiText(record.target);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['alt', 'title', 'aria-label'] });

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

  // One cached UK formatter also covers a missing lib.js: the New Year
  // fireworks must follow the UK clock, not the visitor's.
  const fmtSeasonUK = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  });
  function seasonUKParts(now) {
    if (KazuLib && KazuLib.ukWallParts) return KazuLib.ukWallParts(now);
    const o = {};
    fmtSeasonUK.formatToParts(now).forEach((p) => { o[p.type] = +p.value; });
    return { year: o.year, month: o.month - 1, day: o.day, hours: o.hour % 24, minutes: o.minute, seconds: o.second || 0 };
  }

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
        bdayText = 'Today!';
        bdaySub = 'Happy birthday — turning ' + p.ageNow;
      } else {
        bdayText = p.calDays + (p.calDays === 1 ? ' day' : ' days');
        bdaySub = 'Until Turning ' + p.turning;
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
        bdayText = 'Today!';
        bdaySub = 'Happy birthday — turning ' + age;
      } else {
        bdayText = days + (days === 1 ? ' day' : ' days');
        bdaySub = 'Until Turning ' + (age + 1);
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
    checkNewYear(); // uses the real UK clock, independently of seasonal/sky previews
  }

  // ---------- Fetch timeout wrapper ----------
  // A hung API or proxy (the CORS proxy on a bad day) used to pin a card on its
  // loading line forever. AbortSignal.timeout fails the fetch fast instead,
  // landing in each loader's existing catch (error card / localStorage cache
  // / fallback quotes) — no new failure modes. Older browsers without it get
  // exactly today's behaviour. `ms` overrides the 12 s limit for one call.
  function fetchT(url, opts, ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return fetch(url, Object.assign({}, opts, { signal: AbortSignal.timeout(ms || 12000) }));
    }
    return fetch(url, opts);
  }

  // ---------- Cross-origin proxy ----------
  // Steam, Letterboxd, YouTube, MAL and zenquotes send no
  // Access-Control-Allow-Origin, so the browser can only reach them through a
  // CORS proxy. The free ones come and go (two earlier ones went key-only or left DNS,
  // api.cors.lol answers 429 when rate-limited, and api.allorigins.win times out on
  // bad days), so proxyFetch walks a list — allorigins.hexlet.app first (disableCache
  // so Steam's online state is never served stale), then api.cors.lol, then
  // api.allorigins.win — and rests any proxy that errors, 429s or 5xxs for
  // PROXY_REST_MS, instead of every poll of every card hammering it again.
  //
  // The rest MUST be shorter than Steam's 5-minute poll. A failure is stamped
  // when the request gives up, seconds after the poll started, so a 5-minute
  // rest was still running when the next poll fired: that poll found every
  // proxy resting and failed without sending anything. One bad poll became
  // ten minutes without data, which is exactly PRESENCE_KEEP_MS, so the card
  // dropped to "Offline" while Steam was open. `ms` is the per-proxy timeout.
  const PROXIES = [
    function (t) { return 'https://allorigins.hexlet.app/raw?disableCache=true&url=' + encodeURIComponent(t); },
    function (t) { return 'https://api.cors.lol/?url=' + encodeURIComponent(t); },
    function (t) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(t); },
  ];
  const PROXY_REST_MS = 4 * 60 * 1000;
  const hostRest = KazuLib && KazuLib.backoffCreate
    ? KazuLib.backoffCreate(PROXY_REST_MS)
    : { down: function () { return false; }, fail: function () {}, ok: function () {} };
  async function proxyFetch(target, ms) {
    let last = null;
    for (let i = 0; i < PROXIES.length; i++) {
      const key = 'proxy' + i;
      if (hostRest.down(key, Date.now())) continue;
      try {
        const r = await fetchT(PROXIES[i](target), { cache: 'no-store' }, ms);
        if (r.status === 429 || r.status === 403 || r.status >= 500) { hostRest.fail(key, Date.now()); last = r; continue; }
        hostRest.ok(key);
        return r;
      } catch (e) {
        hostRest.fail(key, Date.now());
      }
    }
    if (last) return last;
    throw new Error('every CORS proxy is resting or failed');
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

  // ---------- Live-card cache ----------
  // Every live card (weather, quote, Discord, Steam, MAL, Letterboxd, the
  // playlist) keeps its last good answer in localStorage. On load that copy is
  // painted in the boot task (paintCardCaches, beside the pollers at the
  // bottom; index.html's #boot-cards keeps the Right-now cards out of sight
  // until then), and the API is asked again only once the copy is older than the
  // card's poll interval (KazuLib.pollDelay): a reload inside the interval
  // sends no request, a reload after it shows the copy while the refetch runs,
  // and the renderers' signatures leave the DOM alone when the answer matches.
  // The envelope is { at, id, ...payload }: when it was fetched and the
  // account it belongs to (KazuLib.cardCacheMeta), so a copy of another
  // account is never painted. Writes only ever follow a live answer.
  let paintingFromCache = false;
  function cardCacheWrite(key, id, payload) {
    const stamp = id == null ? { at: Date.now() } : { at: Date.now(), id: String(id) };
    try { localStorage.setItem(key, JSON.stringify(Object.assign(stamp, payload))); } catch (e) {}
  }
  function cardCacheRaw(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  // The boot paint happens while #boot-cards holds the cards out of sight, so
  // no loading row was ever seen to glide from: it swaps at once. Live
  // arrivals keep popReveal's motion.
  function cardReveal(loadedEl, loadingEl) {
    if (!paintingFromCache) { popReveal(loadedEl, loadingEl); return; }
    if (loadedEl) loadedEl.classList.remove('hidden');
    if (loadingEl) loadingEl.classList.add('hidden');
  }

  // ---------- Weather ----------
  function weatherInfo(code, isDay) {
    if (code === 0) return { d: 'Clear sky' };
    if (code === 1) return { d: 'Mainly clear' };
    if (code === 2) return { d: 'Partly cloudy' };
    if (code === 3) return { d: 'Overcast' };
    if (code === 45 || code === 48) return { d: 'Foggy' };
    if (code >= 51 && code <= 57) return { d: 'Drizzle' };
    if (code >= 61 && code <= 67) return { d: 'Rain' };
    if (code >= 71 && code <= 77) return { d: 'Snow' };
    if (code >= 80 && code <= 82) return { d: 'Rain showers' };
    if (code >= 85 && code <= 86) return { d: 'Snow showers' };
    if (code >= 95) return { d: 'Thunderstorm' };
    return { d: 'Cloudy' };
  }

  let weatherDaily = null;   // Open-Meteo `daily` block for the modal forecast strip
  let weatherCurrent = null; // last good `current` snapshot, reused by "compare with your sky"
  let weatherDone = false;   // true once a fetch attempt has finished (ok or failed)

  // Weather is fetched inside the load task, so its copy is only painted
  // while fresh (and from today: see KazuLib.weatherCacheParse); an older one
  // would be on screen for a fraction of a second before the answer replaced it.
  const WEATHER_CACHE_KEY = 'kazu-weather-cache';

  function renderWeather(w, daily) {
    weatherDaily = daily || null;
    weatherCurrent = {
      code: w.weather_code, isDay: w.is_day === 1,
      tempC: w.temperature_2m, windKmh: w.wind_speed_10m,
    };
    const info = weatherInfo(w.weather_code, w.is_day === 1);
    $('liveTemp').textContent = Math.round(w.temperature_2m) + '°C';
    $('liveWeatherDesc').textContent = info.d;
    $('liveWind').textContent = 'Wind ' + Math.round(w.wind_speed_10m * 0.621371) + ' mph';
    cardReveal($('weatherLoaded'), $('weatherLoading'));
    $('weatherError').classList.add('hidden');
    weatherDone = true;
  }

  function paintWeatherCache(ms, now) {
    if (!KazuLib.weatherCacheParse || !KazuLib.ukDateIso) return 0;
    const raw = cardCacheRaw(WEATHER_CACHE_KEY);
    const meta = KazuLib.cardCacheMeta(raw, null);
    if (!meta.paint || !KazuLib.cardCacheFresh(meta.at, ms, now)) return 0;
    const copy = KazuLib.weatherCacheParse(raw, KazuLib.ukDateIso(new Date(now)));
    if (!copy) return 0;
    renderWeather(copy.current, copy.daily);
    return meta.at;
  }

  async function loadWeather() {
    weatherDone = false;
    try {
      const url = (KazuLib && KazuLib.openMeteoUrl)
        ? KazuLib.openMeteoUrl(52.414, -4.081)
        : 'https://api.open-meteo.com/v1/forecast?latitude=52.414&longitude=-4.081&current=temperature_2m,weather_code,wind_speed_10m,is_day,cloud_cover,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=Europe%2FLondon';
      const r = await fetchT(url);
      const j = await r.json();
      renderWeather(j.current, j.daily);
      cardCacheWrite(WEATHER_CACHE_KEY, null, { data: { current: j.current, daily: j.daily || null } });
    } catch (e) {
      weatherDone = true;
      $('weatherLoading').classList.add('hidden');
      $('weatherError').classList.remove('hidden');
    }
  }

  const SNOW_COLORS = ['#bfe3ff', '#a9d6ff', '#cde8ff', '#b9deff']; // Konami dragon burst only

  // Hardware flags, stable for a session. They feed the low-power verdict below.
  const PARTICLE_FLAGS = {
    coarsePointer: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
    smallScreen: Math.min(window.innerWidth, window.innerHeight) < 500,
    lowConcurrency: !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4),
    saveData: !!(navigator.connection && navigator.connection.saveData),
    lowMemory: !!(navigator.deviceMemory && navigator.deviceMemory <= 4),
    reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  const lightDevice = PARTICLE_FLAGS.coarsePointer || PARTICLE_FLAGS.smallScreen ||
    PARTICLE_FLAGS.lowConcurrency || PARTICLE_FLAGS.saveData;
  // Same for the low-power verdict (see lib.js).
  const lowPowerMode = (KazuLib && KazuLib.lowPowerMode) || function (o) {
    o = o || {};
    if (o.saveData || o.reducedMotion) return true;
    let weak = 0;
    if (o.lowMemory) weak++;
    if (o.lowConcurrency) weak++;
    if (o.coarsePointer) weak++;
    if (o.smallScreen) weak++;
    return weak >= 2;
  };

  // Low-power mode: the device can't afford the ambient layer at all, so the
  // whole class of work is skipped rather than scaled down — no particles, no
  // backdrop blur/refraction, no wheel-lerp smooth scroll, no entrance motion.
  // The body class lets style.css drop the CSS half (blur, infinite loops,
  // scroll-reveal hiding); the JS halves are guarded where they're built.
  const LOW_POWER = lowPowerMode(PARTICLE_FLAGS);
  if (LOW_POWER) document.body.classList.add('low-power');

  // ---------- Staged boot ----------
  // Everything expensive used to fire inside the same task as the script
  // parse: five API fetches, the Lanyard socket, the petal build and the
  // glass-map bake all competed with the first paint, which is what made
  // weak phones hitch on load. Boot is now a queue in priority order — hero
  // content and the clock first, then each live card's first fetch on its
  // own rung of a ladder, then the ambient layers once the main thread is
  // idle. bootGap widens the spacing on light hardware (the same flags that
  // already thin the particle counts), so a phone gets the same order with
  // more air between the steps.
  const bootGap = (ms) => Math.round(ms * (lightDevice ? 1.6 : 1));
  // requestIdleCallback where it exists (not Safari), a short timeout
  // otherwise: either way fn runs off the critical parse/paint path.
  const scheduleIdle = window.requestIdleCallback
    ? (fn, timeout) => requestIdleCallback(fn, { timeout })
    : (fn, timeout) => setTimeout(fn, Math.min(timeout || 200, 400));

  // ---------- Populate animation ----------
  // When a live card's data arrives, the "Connecting to…" row used to vanish
  // and the content snapped in, the card jumping to its new height in one
  // frame. popReveal() turns that swap into one motion beat: the card's
  // height glides from the loading height to the content height (WAAPI, so
  // the inline height cleans itself up when the animation ends) while the
  // content fades + rises via the .populated-in keyframes in style.css.
  // Same discipline as the staged boot: low-power and reduced-motion devices
  // keep the instant swap, and the glass rebake is suppressed while the
  // height animates so the expansion doesn't trigger a per-frame map rebuild
  // (one bake lands on the final size instead, via window.kazuGlassSchedule).
  const REDUCED_MOTION = true; // all motion removed, see the end of style.css
  const POP_EASE = 'cubic-bezier(.22,.9,.3,1)';

  // Is any part of `el` inside the viewport right now? Populate motion is only
  // worth running for something the reader can see, and for the below-fold
  // cards it is actively harmful: style.css gives them content-visibility:
  // auto, which skips their subtree until they near the viewport, and a CSS
  // animation started INSIDE a skipped subtree never completes, so Blink asks
  // for a fresh frame on every vsync for as long as the page is open (measured
  // ~0.07 CPU cores at idle on a 144 Hz display for five playlist rows alone).
  // Off-screen content just swaps in; it is already in place when scrolled to.
  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  // Content-only pop (no height glide): for live swaps that rewrite an
  // already-visible block, like the playlist rows replacing the static
  // snapshot. Restarts the keyframes if a run is still in flight, and takes
  // the class off again once the content has landed (the end keyframe is the
  // element's natural style, so nothing visibly changes): a finished animation
  // must not be left attached to the element.
  const popTimers = new WeakMap();
  function popRefresh(el) {
    if (!el || LOW_POWER || REDUCED_MOTION || !inViewport(el)) return;
    if (el.classList.contains('populated-in')) {
      el.classList.remove('populated-in');
      void el.offsetWidth;
    }
    el.classList.add('populated-in');
    clearTimeout(popTimers.get(el));
    popTimers.set(el, setTimeout(() => el.classList.remove('populated-in'), 600));
  }

  function popReveal(loadedEl, loadingEl) {
    if (!loadedEl) { if (loadingEl) loadingEl.classList.add('hidden'); return; }
    if (!loadedEl.classList.contains('hidden')) {
      // Later polls re-run the renderers; only the first arrival animates.
      if (loadingEl) loadingEl.classList.add('hidden');
      return;
    }
    const card = loadedEl.closest ? loadedEl.closest('.card') : null;
    const still = LOW_POWER || REDUCED_MOTION || !loadedEl.animate;
    // Only a card the reader can see gets the height glide (and so a per-frame
    // layout): one below the fold simply takes its final height.
    const glide = !still && !!card && inViewport(card);
    const h0 = glide ? card.getBoundingClientRect().height : 0;
    loadedEl.classList.remove('hidden');
    if (loadingEl) loadingEl.classList.add('hidden');
    if (still) return;
    popRefresh(loadedEl);
    if (!glide) return;
    const h1 = card.getBoundingClientRect().height;
    if (Math.abs(h1 - h0) < 2) return;
    window.__kazuPopAnim = (window.__kazuPopAnim || 0) + 1;
    let settled = false;
    const anim = card.animate(
      [{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }],
      { duration: 340, easing: POP_EASE }
    );
    const done = () => {
      if (settled) return;
      settled = true;
      window.__kazuPopAnim--;
      // The ResizeObserver was suppressed during the glide; bake the rim at
      // the final size now (no-op if the glass layer isn't running).
      if (window.kazuGlassSchedule) window.kazuGlassSchedule();
    };
    anim.onfinish = done;
    anim.oncancel = done;
    // Safety net: a suspended renderer (hidden panel/tab) can pause the WAAPI
    // timeline so neither callback fires — the glass rebake must never stay
    // suppressed, so settle on a timer too (done() is idempotent).
    setTimeout(done, 500);
  }

  // ---------- Scroll anchor ----------
  // When a card above the fold finishes loading, popReveal glides it taller --
  // and everything below it (including whatever the reader is mid-sentence
  // on) jumps down with it. Native overflow-anchor can't save us: body's
  // overflow-x: hidden suppresses it, and the smooth-scroll loop writes
  // scrollY per frame. So watch the top-level content blocks; when one that
  // sits ENTIRELY above the viewport changes height (async content arriving,
  // an image loading, a font swap, a window-resize reflow), scroll instantly
  // by the same delta so the reading point stays glued. Blocks straddling or
  // below the fold are left alone -- their growth doesn't move what you're
  // reading. The adjustment rides the smooth-scroll loop's own channel when
  // that loop exists, so an active wheel glide is adjusted rather than
  // cancelled as "external input".
  (function scrollAnchor() {
    if (!('ResizeObserver' in window)) return;
    const container = document.querySelector('.container');
    if (!container) return;
    const kids = Array.from(container.children);
    const heights = new WeakMap();
    const ro = new ResizeObserver((entries) => {
      const changed = [];
      for (const entry of entries) {
        const el = entry.target;
        const now = entry.contentRect.height;
        const prev = heights.get(el);
        heights.set(el, now);
        if (prev === undefined || Math.abs(now - prev) < 1) continue;
        changed.push({ el: el, delta: now - prev, bottom: el.getBoundingClientRect().bottom });
      }
      if (!changed.length) return;
      // The watched blocks are siblings and the callback runs post-layout, so
      // a later block's bottom already includes the growth of every block
      // above it in this batch. Walk in document order and peel the cumulative
      // delta off, testing each block's bottom as it was BEFORE the batch
      // landed -- testing the post-layout bottom directly misses big one-shot
      // swaps whose growth pushes the block's own bottom across the fold.
      changed.sort((a, b) => kids.indexOf(a.el) - kids.indexOf(b.el));
      let shift = 0, adjust = 0;
      for (const it of changed) {
        const preBottom = it.bottom - shift - it.delta;
        shift += it.delta;
        if (preBottom <= 0) adjust += it.delta;
      }
      if (!adjust) return;
      if (window.kazuScrollAdjust) window.kazuScrollAdjust(adjust);
      else window.scrollBy({ top: adjust, behavior: 'instant' });
    });
    kids.forEach((el) => ro.observe(el));
  })();

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
  const DISCORD_CACHE_KEY = 'kazu-discord-cache';

  // With `now`, a copy younger than KazuLib.PRESENCE_KEEP_MS keeps its
  // presence (the boot paint); without it, identity only, shown offline.
  function discordCacheRead(now) {
    if (KazuLib && KazuLib.discordCacheParse && KazuLib.cardCacheMeta) {
      const raw = cardCacheRaw(DISCORD_CACHE_KEY);
      return KazuLib.cardCacheMeta(raw, DISCORD_ID).paint ? KazuLib.discordCacheParse(raw, now) : null;
    }
    const parse = (KazuLib && KazuLib.discordCacheParse) || function (raw) {
      if (typeof raw !== 'string' || !raw) return null;
      try {
        const p = JSON.parse(raw);
        const data = p && (p.data || p);
        const u = data && data.discord_user;
        if (u && u.username) {
          return {
            discord_user: {
              id: typeof u.id === 'string' ? u.id : String(u.id || ''),
              username: u.username,
              global_name: (typeof u.global_name === 'string' && u.global_name) ? u.global_name : ((typeof u.display_name === 'string' && u.display_name) ? u.display_name : u.username),
              avatar: typeof u.avatar === 'string' ? u.avatar : null,
            },
            discord_status: 'offline',
            activities: [],
          };
        }
      } catch (e) {}
      return null;
    };
    try { return parse(localStorage.getItem(DISCORD_CACHE_KEY)); } catch (e) { return null; }
  }

  const DISCORD_STATIC_FALLBACK = {
    discord_user: {
      id: DISCORD_ID,
      username: 'kazu_hani',
      global_name: 'Kazu | ハニ',
      avatar: null,
    },
    discord_status: 'offline',
    activities: [],
  };

  let discordUsername = 'kazu_hani';
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

  // The Spotify bar advances in small DISCRETE steps, not a CSS glide. Any
  // running animation or transition makes the compositor and the GPU process
  // produce a frame on every vsync (144 a second on a fast display) for as long
  // as it runs, and a song playing is "as long as the page is open": measured
  // ~0.2 CPU cores for a 5px bar, against ~0.01 for stepping it. A quarter
  // second is ~0.3px on the card's bar (a 3-minute song), which the eye reads
  // as smooth; phones and low-power devices step once a second off the clock
  // tick with no extra timer at all. The timer only exists while a song is
  // playing and the tab is visible (syncSpotifyBar).
  const SPOTIFY_BAR_MS = LOW_POWER ? 1000 : 250;
  let spotifyBarTimer = 0;
  function paintSpotifyBar(now) {
    if (!spotifyTimes) return;
    const fill = $('spotifyBarFill');
    if (!fill) return;
    const dur = spotifyTimes.end - spotifyTimes.start;
    const pos = Math.min(Math.max((now == null ? Date.now() : now) - spotifyTimes.start, 0), Math.max(dur, 0));
    // transform, not width: see .spotify-bar-fill (no layout)
    fill.style.transform = 'translateX(' + ((dur > 0 ? (pos / dur) * 100 : 0) - 100).toFixed(2) + '%)';
  }
  function syncSpotifyBar() {
    const want = !!spotifyTimes && !document.hidden && SPOTIFY_BAR_MS < 1000;
    if (want && !spotifyBarTimer) spotifyBarTimer = setInterval(paintSpotifyBar, SPOTIFY_BAR_MS);
    else if (!want && spotifyBarTimer) { clearInterval(spotifyBarTimer); spotifyBarTimer = 0; }
  }

  // Advance the Spotify bar + game timer between Lanyard polls (called each second by tick)
  function updatePresenceProgress() {
    const now = Date.now();
    if (spotifyTimes) {
      const dur = spotifyTimes.end - spotifyTimes.start;
      const pos = Math.min(Math.max(now - spotifyTimes.start, 0), Math.max(dur, 0));
      paintSpotifyBar(now);
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
  // Direct first; on failure (Lanyard hiccup, or an ad blocker / DNS filter
  // blackholing api.lanyard.rest) retry once through the shared CORS proxy
  // (proxyFetch — the same one the Steam/MAL/Letterboxd cards ride) so the
  // browser talks to the proxy's domain, which blocklists don't know. The
  // WebSocket can't be proxied, so on a blocking network the 20s REST poll
  // is what keeps the card alive.
  async function loadDiscord() {
    if (lanyardWsLive || !siteIntegrationOn('discord')) return;
    const url = 'https://api.lanyard.rest/v1/users/' + DISCORD_ID;
    try {
      let j;
      try {
        const r = await fetchT(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('status ' + r.status);
        j = await r.json();
      } catch (e) {
        const r2 = await proxyFetch(url);
        if (!r2.ok) throw new Error('proxy status ' + r2.status);
        j = await r2.json();
      }
      if (!j || !j.success || !j.data || !j.data.discord_user) throw new Error('bad payload');
      if (lanyardWsLive) return; // a socket update beat this response
      renderDiscord(j.data);
      noteDiscordDesktop(j.data);
      cardCacheWrite(DISCORD_CACHE_KEY, DISCORD_ID, { data: j.data });
    } catch (e) {
      if (lanyardWsLive) return;
      // With data already on screen, stale beats an error card, but only for
      // as long as a stored presence may be shown: the copy is redrawn under
      // the same window as the boot paint, so once the last live answer is
      // more than KazuLib.PRESENCE_KEEP_MS old the card reads offline instead
      // of "playing" forever.
      const cached = discordCacheRead(Date.now());
      if (cached) {
        renderDiscord(cached);
        return;
      }
      if (discordHasData) return;
      renderDiscord(DISCORD_STATIC_FALLBACK);
    }
  }

  function paintDiscordCache(ms, now) {
    if (!siteIntegrationOn('discord') || !KazuLib.discordCacheParse) return 0;
    const raw = cardCacheRaw(DISCORD_CACHE_KEY);
    const meta = KazuLib.cardCacheMeta(raw, DISCORD_ID);
    const dc = meta.paint ? KazuLib.discordCacheParse(raw, now) : null;
    if (!dc) return 0;
    renderDiscord(dc);
    return meta.at;
  }

  // Renders one Lanyard payload. REST `data` and the WebSocket's
  // INIT_STATE / PRESENCE_UPDATE `d` share the same shape, so both feed here.
  function renderDiscord(dc) {
    const u = dc.discord_user;

    const displayName = u.global_name || u.display_name || u.username;
    lastDiscordFallbackAvatar = discordAvatarUrl(u);
    const avatarEl = $('discordAvatar');
    if (avatarEl) {
      avatarEl.src = sharedAvatarUrl || (u.avatar ? lastDiscordFallbackAvatar : 'assets/New Kazu.png');
      avatarEl.onerror = () => { avatarEl.src = 'assets/New Kazu.png'; };
    }
    $('discordName').textContent = displayName;

    discordUsername = u.username || 'kazu_hani';
    const handleEl = $('discordUsername');
    if (handleEl) {
      if (discordUsername) { handleEl.textContent = '@' + discordUsername; handleEl.classList.remove('hidden'); }
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

    // Custom status (activity type 4): text only, without server emoji images.
    const custom = (dc.activities || []).find((a) => a.type === 4);
    const hasCustom = !!(custom && stripEmoji(custom.state).trim());
    const customEl = $('discordCustom');
    if (customEl) {
      if (hasCustom) {
        $('discordCustomText').textContent = stripEmoji(custom.state);
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
        ? 'Currently offline'
        : 'Online, not in a game right now';
      $('discordIdle').classList.remove('hidden');
    } else {
      $('discordIdle').classList.add('hidden');
    }

    updatePresenceProgress();
    syncSpotifyBar(); // the 4 Hz bar timer exists only while a song is playing
    discordHasData = true;
    cardReveal($('discordLoaded'), $('discordLoading'));
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
    if (!siteIntegrationOn('discord')) return;
    if (lanyardWanted && (lanyardSocket || lanyardReconnect)) return;
    lanyardWanted = true;
    connectLanyard();
  }

  function restartLanyard() {
    if (!siteIntegrationOn('discord')) { stopLanyard(); return; }
    lanyardWanted = true;
    lanyardBackoff = 1000;
    if (lanyardHeartbeat) { clearInterval(lanyardHeartbeat); lanyardHeartbeat = null; }
    if (lanyardReconnect) { clearTimeout(lanyardReconnect); lanyardReconnect = null; }
    if (lanyardSocket) {
      const s = lanyardSocket;
      lanyardSocket = null;
      try { s.close(); } catch (e) {}
    }
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
          noteDiscordDesktop(msg.d);
          cardCacheWrite(DISCORD_CACHE_KEY, DISCORD_ID, { data: msg.d });
        } else if (!discordHasData) {
          const cached = discordCacheRead();
          renderDiscord(cached || DISCORD_STATIC_FALLBACK);
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
  // 'checking' and 'unknown' are not Steam answers: they mean the page has no
  // live answer to show (see KazuLib.steamCacheParse). 'checking' is the boot
  // paint of an expired copy while the first fetch is on its way; 'unknown' is
  // what is left after that fetch failed. Neither may say "Offline": only
  // Steam itself can say that.
  function steamStatusInfo(state) {
    if (state === 'in-game') return ['In-Game', '#90c040'];
    if (state === 'online') return ['Online', '#57cbde'];
    if (state === 'away') return ['Away', '#faa61a'];
    if (state === 'checking') return ['Checking status…', '#8b95a1'];
    if (state === 'unknown') return ['Status unavailable', '#8b95a1'];
    return ['Offline', '#9fc0d8'];
  }

  // The profile is shaped into a plain object ({ avatar, state, game, recent },
  // see KazuLib.steamCacheParse) so the same renderer draws a live answer and
  // the stored copy, and the copy holds data rather than markup.
  const STEAM_CACHE_KEY = 'kazu-steam-cache';
  // Per-proxy timeout for Steam. The profile XML is small, so a proxy that has
  // not answered in 8 s is hung (allorigins on a bad day) and the next one gets
  // its turn; the default 12 s made two hung proxies cost 24 s.
  const STEAM_PROXY_TIMEOUT_MS = 8000;
  let steamHasData = false;
  // The vanity name being fetched, '' when idle: the poll and the Discord
  // nudge never overlap for one account, but a control-panel account change
  // mid-fetch still gets its own load (see loadSteam).
  let steamInFlight = '';

  function renderSteam(p) {
    sharedAvatarUrl = p.avatar;
    $('steamAvatar').src = p.avatar;
    const discordImg = $('discordAvatar');
    if (discordImg) discordImg.src = p.avatar;

    const [statusText, statusColor] = steamStatusInfo(p.state);
    $('steamStatusText').textContent = '● ' + statusText;
    $('steamStatusText').style.color = statusColor;

    if (p.game) {
      $('steamGameName').textContent = p.game.name;
      const steamGameEl = $('steamGame');
      const gameUrl = p.game.url;
      if (gameUrl) steamGameEl.setAttribute('href', gameUrl);
      else steamGameEl.removeAttribute('href');
      steamGameEl.classList.remove('hidden');
    } else {
      $('steamGame').removeAttribute('href');
      $('steamGame').classList.add('hidden');
    }

    const recent = p.recent.map((g) => ({
      name: escapeHtml(g.name),
      logo: escapeHtml(g.logo),
      url: g.url,
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

    steamHasData = true;
    cardReveal($('steamLoaded'), $('steamLoading'));
    $('steamErr').classList.add('hidden');
  }

  function steamCacheRead(now) {
    if (!KazuLib || !KazuLib.steamCacheParse || !KazuLib.cardCacheMeta) return null;
    const raw = cardCacheRaw(STEAM_CACHE_KEY);
    return KazuLib.cardCacheMeta(raw, STEAM_VANITY).paint ? KazuLib.steamCacheParse(raw, now) : null;
  }

  function paintSteamCache(ms, now) {
    if (!siteIntegrationOn('steam') || !KazuLib.steamCacheParse) return 0;
    const raw = cardCacheRaw(STEAM_CACHE_KEY);
    const meta = KazuLib.cardCacheMeta(raw, STEAM_VANITY);
    const profile = meta.paint ? KazuLib.steamCacheParse(raw, now) : null;
    if (!profile) return 0;
    // An expired copy is refetched on the card's boot rung, so say so rather
    // than "Status unavailable" (nothing has failed yet).
    if (profile.state === 'unknown') profile.state = 'checking';
    renderSteam(profile);
    return meta.at;
  }

  async function loadSteam() {
    if (!siteIntegrationOn('steam')) return;
    const vanity = STEAM_VANITY;
    if (steamInFlight === vanity) return;
    steamInFlight = vanity;
    // `t` changes once a minute: enough that a proxy or edge cache can never
    // hand back the profile from when the PC was off (each 5-minute poll and
    // each Discord nudge gets a new URL), while every visitor inside the same
    // minute still shares one URL, so it never looks like a scraper to Valve.
    // Steam ignores the extra parameter.
    const STEAM_URL = 'https://steamcommunity.com/id/' + vanity + '/?xml=1&t=' + Math.floor(Date.now() / 60000);
    try {
      let xmlText;
      try {
        // Proxy first: steamcommunity.com sends no Access-Control-Allow-Origin,
        // so a direct browser fetch can never succeed. (Order flipped after the
        // direct attempt wasted one doomed round trip on every 5-min poll.)
        // no-store: status must track the server, not the browser HTTP cache.
        const r = await proxyFetch(STEAM_URL, STEAM_PROXY_TIMEOUT_MS);
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

      const profile = {
        avatar,
        state: onlineState,
        // Click-through to the store page: gameLink when Steam includes it,
        // else the appid recovered from the game's art URLs.
        game: currentGame ? {
          name: currentGame,
          url: steamStoreUrl(txt('gameLink', inGameEl)) || steamStoreUrl(txt('gameLogo', inGameEl) || txt('gameIcon', inGameEl)) || '',
        } : null,
        recent: games.slice(0, 3).map((g) => ({
          name: g.name,
          logo: g.logo,
          url: steamStoreUrl(g.link) || steamStoreUrl(g.logo) || '',
          hoursPlayed: g.hoursPlayed,
          hoursOnRecord: g.hoursOnRecord,
        })),
      };
      // The control panel switched accounts mid-fetch: this answer belongs to
      // the old one, and the new account's load draws the card.
      if (vanity !== STEAM_VANITY) return;
      renderSteam(profile);
      cardCacheWrite(STEAM_CACHE_KEY, vanity, { data: profile });
    } catch (e) {
      if (vanity !== STEAM_VANITY) return;
      console.warn('Steam load failed:', e);
      // Same rule as Discord: data on screen stays, redrawn from the copy. Once
      // the last live answer is too old the copy says 'unknown', which reads
      // "Status unavailable": a dead proxy is not Steam saying "offline".
      const cached = steamCacheRead(Date.now());
      if (cached) { renderSteam(cached); return; }
      if (steamHasData) return;
      $('steamLoading').classList.add('hidden');
      $('steamLoaded').classList.add('hidden');
      $('steamErr').classList.remove('hidden');
    } finally {
      if (steamInFlight === vanity) steamInFlight = '';
    }
  }

  // ---- Discord → Steam nudge ----
  // Discord reaches the page instantly over Lanyard's socket; Steam only on its
  // 5-minute poll. So when Kazu turns the PC on, Discord flips to online at once
  // and Steam lags behind for up to five minutes. When a LIVE Discord answer
  // (socket or REST, never the stored copy) shows the desktop client going from
  // not-active to active, Steam is asked once more. Discord is only the
  // trigger: what the Steam card shows still comes from Steam alone (being on
  // Discord does not mean Steam is open).
  //   - Rising edge only. The first live answer of a visit sets the baseline
  //     (the boot poll covers Steam then), and Discord's frequent other updates
  //     (Spotify, custom status, idle) are not edges, so they cost nothing.
  //   - STEAM_NUDGE_DELAY: Steam logs in after Discord on a cold boot and its
  //     public profile trails the client, so asking at once would mostly
  //     read "offline" again.
  //   - STEAM_NUDGE_COOLDOWN plus steamInFlight: at most one extra request
  //     per few minutes, so the shared, rate-limited proxies are not stormed.
  // The one timer lives only between an edge and its fetch: idle stays idle.
  const STEAM_NUDGE_DELAY = 45 * 1000;
  const STEAM_NUDGE_COOLDOWN = 3 * 60 * 1000;
  let discordDesktopSeen = null; // last live desktop flag; null until the first answer
  let steamNudgeTimer = null;
  let steamNudgeAt = 0;

  function noteDiscordDesktop(dc) {
    const desktop = !!(dc && dc.discord_status !== 'offline' && dc.active_on_discord_desktop);
    const was = discordDesktopSeen;
    discordDesktopSeen = desktop;
    if (was !== false || !desktop) return;
    if (steamNudgeTimer || Date.now() - steamNudgeAt < STEAM_NUDGE_COOLDOWN) return;
    steamNudgeTimer = setTimeout(() => {
      steamNudgeTimer = null;
      if (document.hidden) return; // the visible-again poll covers it
      steamNudgeAt = Date.now();
      loadSteam();
    }, STEAM_NUDGE_DELAY);
  }

  // ---------- MyAnimeList (Jikan) ----------
  let MAL_USER = siteId('mal', 'user', 'Kazu_Hani');
  // Entry-to-row extraction lives in lib.js; local copy keeps
  // the card working if lib.js fails to load.
  const malRow = (KazuLib && KazuLib.malRow) || function (entry) {
    const a = entry && entry.anime;
    if (!a || !(a.title_english || a.title)) return null;
    const watched = (typeof entry.episodes_watched === 'number' && entry.episodes_watched >= 0) ? entry.episodes_watched : 0;
    const total = (typeof a.episodes === 'number' && a.episodes > 0) ? a.episodes : null;
    const img = (a.images && a.images.jpg && (a.images.jpg.small_image_url || a.images.jpg.image_url)) || '';
    // Jikan's own link field is never trusted without lib.js's safeLink, so
    // the fallback builds the link from the numeric id instead.
    const id = (typeof a.mal_id === 'number' && a.mal_id > 0) ? a.mal_id : null;
    return {
      url: id ? 'https://myanimelist.net/anime/' + id : 'https://myanimelist.net',
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
    if (empty) idle.textContent = 'Not watching or reading anything right now ';
    idle.classList.toggle('hidden', !empty);
  }

  // ---- Japanese titles (AniList; fetched only while the page is in Japanese) ----
  // The rows stay English; each title carries data-ja with its native title
  // and i18n.js shows that in Japanese mode. Titles are kept in localStorage,
  // and an id AniList didn't answer for is not asked again this visit.
  const MAL_JA_KEY = 'kazu-mal-ja';
  let malJa = { anime: {}, manga: {} };
  try { if (KazuLib && KazuLib.malJaCacheParse) malJa = KazuLib.malJaCacheParse(localStorage.getItem(MAL_JA_KEY)); } catch (e) {}
  const malJaTried = new Set();
  let malJaBusy = false;
  function pageIsJapanese() {
    return !!(window.KazuI18n && typeof KazuI18n.lang === 'function' && KazuI18n.lang() === 'ja');
  }
  function malJaTitle(kind, url) {
    const id = KazuLib && KazuLib.malIdFromUrl ? KazuLib.malIdFromUrl(url) : null;
    return (id && malJa[kind][id]) || '';
  }
  function malTitleHtml(kind, x) {
    const ja = malJaTitle(kind, x.url);
    return '<div class="mal-title"' + (ja ? ' data-ja="' + escapeHtml(ja) + '"' : '') + '>' + escapeHtml(x.title) + '</div>';
  }
  async function loadMalJa() {
    if (malJaBusy || !pageIsJapanese() || !KazuLib || !KazuLib.anilistTitlesQuery) return;
    const need = (rows, kind) => rows
      .map((x) => KazuLib.malIdFromUrl(x.url))
      .filter((id) => id && !malJa[kind][id] && !malJaTried.has(kind + id));
    const a = need(malAnimeRows, 'anime'), m = need(malMangaRows, 'manga');
    const body = KazuLib.anilistTitlesQuery(a, m);
    if (!body) return;
    a.forEach((id) => malJaTried.add('anime' + id));
    m.forEach((id) => malJaTried.add('manga' + id));
    malJaBusy = true;
    try {
      const r = await fetchT('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('AniList status ' + r.status);
      const got = KazuLib.anilistTitlesParse(await r.json(), a, m);
      Object.assign(malJa.anime, got.anime);
      Object.assign(malJa.manga, got.manga);
      try { localStorage.setItem(MAL_JA_KEY, JSON.stringify(malJa)); } catch (e) {}
      malJaBusy = false;
      if (Object.keys(got.anime).length) renderMalRows(malAnimeRows);
      if (Object.keys(got.manga).length) renderMalMangaRows(malMangaRows);
    } catch (e) {
      console.warn('AniList Japanese titles failed:', e);
    } finally {
      malJaBusy = false;
    }
  }
  document.addEventListener('kazu-langchange', loadMalJa);

  function renderMalRows(rows) {
    malAnimeRows = rows;
    const sig = JSON.stringify(rows) + rows.map((x) => malJaTitle('anime', x.url)).join('|');
    if (sig !== lastMalAnimeSig) {
      lastMalAnimeSig = sig;
      $('malList').innerHTML = rows.map((x) => (
        '<a class="mal-row" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">' +
          (x.img ? '<img class="mal-cover" src="' + escapeHtml(x.img) + '" alt="" loading="lazy" decoding="async">' : '') +
          '<div class="mal-info">' +
            malTitleHtml('anime', x) +
            '<div class="mal-progress">' +
              (x.total ? '<div class="mal-bar"><span style="width:' + x.pct + '%;"></span></div>' : '') +
              '<div class="mal-eps">Ep ' + x.watched + ' / ' + (x.total || '?') + '</div>' +
            '</div>' +
          '</div>' +
        '</a>'
      )).join('');
    }
    updateMalIdle();

    cardReveal($('malLoaded'), $('malLoading'));
    $('malError').classList.add('hidden');
    if (!paintingFromCache) loadMalJa(); // the boot paint asks AniList from an idle slot instead
  }

  function renderMalMangaRows(rows) {
    malMangaRows = rows;
    const section = $('malMangaSection');
    const list = $('malMangaList');
    if (section && list) {
      const sig = JSON.stringify(rows) + rows.map((x) => malJaTitle('manga', x.url)).join('|');
      if (sig !== lastMalMangaSig) {
        lastMalMangaSig = sig;
        list.innerHTML = rows.map((x) => (
          '<a class="mal-row" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">' +
            (x.img ? '<img class="mal-cover" src="' + escapeHtml(x.img) + '" alt="" loading="lazy" decoding="async">' : '') +
            '<div class="mal-info">' +
              malTitleHtml('manga', x) +
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
    if (!paintingFromCache) loadMalJa();
  }

  function malCacheRead() {
    const parse = (KazuLib && KazuLib.malCacheParse) || function () { return null; };
    try { return parse(localStorage.getItem(MAL_CACHE_KEY)); } catch (e) { return null; }
  }

  // Live rows come from the first source that answers. Jikan stays first
  // because it is CORS-clean, but MAL has been refusing its scrape of the
  // user endpoints for long stretches (they 504 while the rest of Jikan is
  // fine). The fallback is MAL's own load.json — the endpoint myanimelist.net
  // itself uses — reached through the shared CORS proxy (proxyFetch),
  // because MAL sends no Access-Control-Allow-Origin.
  async function fetchMalRows() {
    try {
      if (hostRest.down('jikan', Date.now())) throw new Error('jikan resting');
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
      hostRest.fail('jikan', Date.now());
      console.warn('Jikan failed, trying MAL load.json via proxy:', e);
      const listUrl = 'https://myanimelist.net/animelist/' + MAL_USER + '/load.json?status=1';
      const r2 = await proxyFetch(listUrl);
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
    if (!siteIntegrationOn('mal')) return;
    try {
      const rows = await fetchMalRows();

      renderMalRows(rows);
      cardCacheWrite(MAL_CACHE_KEY, MAL_USER, { rows });
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
      if (hostRest.down('jikan', Date.now())) throw new Error('jikan resting');
      const r = await fetchT('https://api.jikan.moe/v4/users/' + MAL_USER + '/mangalist?status=reading', { cache: 'no-store' });
      if (!r.ok) throw new Error('bad status ' + r.status);
      const j = await r.json();
      return ((j && j.data) || [])
        .filter((e) => !e || !e.reading_status || e.reading_status === 'reading')
        .map(mRow)
        .filter(Boolean)
        .slice(0, 2);
    } catch (e) {
      hostRest.fail('jikan', Date.now());
      console.warn('Jikan manga failed, trying MAL mangalist load.json via proxy:', e);
      const listUrl = 'https://myanimelist.net/mangalist/' + MAL_USER + '/load.json?status=1';
      const r2 = await proxyFetch(listUrl);
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
    if (!KazuLib || !KazuLib.malMangaRow || !siteIntegrationOn('mal')) return;
    try {
      const rows = await fetchMalMangaRows();
      renderMalMangaRows(rows);
      cardCacheWrite(MAL_MANGA_CACHE_KEY, MAL_USER, { rows });
    } catch (e) {
      const cached = malMangaCacheRead();
      if (cached) renderMalMangaRows(cached);
    }
  }

  // ---- Latest finished anime with your review (top of the MAL card) ----
  // Jikan's reviews endpoint is CORS-clean and carries the review text. The
  // finish date comes from MAL's completed list (load.json, through the proxy)
  // and is optional: without it the review date is shown as "Reviewed".
  // Shown only while the review is recent (MAL_REVIEW_DAYS). No cache: a failed
  // fetch simply leaves the section hidden.
  const MAL_REVIEW_DAYS = 90;
  let lastMalReviewSig = '';
  function malDateLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    return (+m[3]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + m[1];
  }
  function renderMalReview(x) {
    const box = $('malReviewSection');
    const list = $('malReviewList');
    if (!box || !list) return;
    const age = x && x.date ? Date.now() - Date.parse(x.date + 'T00:00:00Z') : NaN;
    if (!x || !(age < MAL_REVIEW_DAYS * 86400000)) {
      lastMalReviewSig = '';
      list.innerHTML = '';
      box.classList.add('hidden');
      return;
    }
    const sig = JSON.stringify(x);
    if (sig !== lastMalReviewSig) {
      lastMalReviewSig = sig;
      list.innerHTML =
        '<a class="mal-row mal-review" href="' + escapeHtml(x.url) + '" target="_blank" rel="noopener">' +
          (x.img ? '<img class="mal-cover" src="' + escapeHtml(x.img) + '" alt="" loading="lazy" decoding="async">' : '') +
          '<div class="mal-info">' +
            '<div class="mal-title">' + escapeHtml(x.title) + '</div>' +
            '<div class="mal-review-meta">' + (x.score ? x.score + '/10 · ' : '') + (x.finished ? 'Finished ' : 'Reviewed ') + escapeHtml(malDateLabel(x.date)) + '</div>' +
            '<div class="mal-review-text">' + escapeHtml(x.text) + '</div>' +
          '</div>' +
        '</a>';
    }
    box.classList.remove('hidden');
  }

  async function loadMalReview() {
    if (!siteIntegrationOn('mal') || !KazuLib || !KazuLib.malReviewRow) return;
    try {
      if (hostRest.down('jikan', Date.now())) throw new Error('jikan resting');
      const r = await fetchT('https://api.jikan.moe/v4/users/' + MAL_USER + '/reviews', { cache: 'no-store' });
      if (!r.ok) throw new Error('bad status ' + r.status);
      const j = await r.json();
      const row = ((j && j.data) || []).map(KazuLib.malReviewRow).filter(Boolean)[0] || null;
      if (row) {
        try {
          const r2 = await proxyFetch('https://myanimelist.net/animelist/' + MAL_USER + '/load.json?status=2');
          if (r2.ok) {
            const fd = KazuLib.malFinishDate(await r2.json(), row.id);
            if (fd) { row.date = fd; row.finished = true; }
          }
        } catch (e) { /* the review date stands in */ }
      }
      renderMalReview(row);
    } catch (e) {
      hostRest.fail('jikan', Date.now());
    }
  }

  function loadMalAll() { loadMal(); loadMalManga(); loadMalReview(); }

  // One poller fetches both lists, so the card counts as fresh only while
  // BOTH copies are: the older stamp decides. The anime rows are the card
  // itself; a manga copy alone paints nothing.
  function paintMalCache(ms, now) {
    if (!siteIntegrationOn('mal') || !KazuLib.malMangaCacheParse) return 0;
    const animeRaw = cardCacheRaw(MAL_CACHE_KEY);
    const mangaRaw = cardCacheRaw(MAL_MANGA_CACHE_KEY);
    const anime = KazuLib.cardCacheMeta(animeRaw, MAL_USER);
    const manga = KazuLib.cardCacheMeta(mangaRaw, MAL_USER);
    const rows = anime.paint ? KazuLib.malCacheParse(animeRaw) : null;
    if (!rows) return 0;
    renderMalRows(rows);
    const mangaRows = manga.paint ? KazuLib.malMangaCacheParse(mangaRaw) : null;
    if (mangaRows) renderMalMangaRows(mangaRows);
    scheduleIdle(loadMalJa, 3000); // Japanese titles (a no-op in English mode)
    return mangaRows ? Math.min(anime.at, manga.at) : 0;
  }

  // ---------- Letterboxd (latest diary entry via RSS) ----------
  // Letterboxd has no public API, but every profile publishes a diary RSS
  // feed. No Access-Control-Allow-Origin there either, so it rides the same
  // CORS proxy the Steam and MAL fallbacks use. Parsing lives in lib.js
  // (regex-based, DOM-free); the last good entry is cached in
  // localStorage exactly like the MAL rows.
  let LB_USER = siteId('letterboxd', 'user', 'KazuHani');
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
              : '<div class="lb-poster lb-poster--empty"></div>') +
            '<div class="lb-info">' +
              '<div class="lb-label">Latest watch' + (entry.rewatch ? ' · rewatch' : '') + '</div>' +
              '<div class="lb-title">' + escapeHtml(entry.title) + (entry.year ? ' <span class="lb-year">' + entry.year + '</span>' : '') + '</div>' +
              (entry.stars && !entry.review ? '<div class="lb-stars">' + entry.stars + '</div>' : '') +
              (entry.watched ? '<div class="lb-watched">' + escapeHtml(entry.watched) + '</div>' : '') +
            '</div>' +
            (entry.review ? '<div class="lb-review"><div class="lb-review-head"><div class="lb-review-label">Review</div>' + (entry.stars ? '<div class="lb-stars">' + entry.stars + '</div>' : '') + '</div><div class="lb-review-text">' + escapeHtml(entry.review) + '</div></div>' : '') +
          '</a>';
      }
    }
    cardReveal($('lbLoaded'), $('lbLoading'));
    $('lbError').classList.add('hidden');
  }

  function paintLetterboxdCache(ms, now) {
    if (!siteIntegrationOn('letterboxd') || !KazuLib.letterboxdCacheParse) return 0;
    const raw = cardCacheRaw(LB_CACHE_KEY);
    const meta = KazuLib.cardCacheMeta(raw, LB_USER);
    const entry = meta.paint ? KazuLib.letterboxdCacheParse(raw) : null;
    if (!entry) return 0;
    renderLetterboxd(entry);
    return meta.at;
  }

  function lbCacheRead() {
    const parse = KazuLib && KazuLib.letterboxdCacheParse;
    if (!parse) return null;
    try { return parse(localStorage.getItem(LB_CACHE_KEY)); } catch (e) { return null; }
  }

  async function loadLetterboxd() {
    if (!KazuLib || !KazuLib.parseLetterboxdRss || !siteIntegrationOn('letterboxd')) return;
    try {
      const rss = 'https://letterboxd.com/' + LB_USER + '/rss/';
      const r = await proxyFetch(rss);
      if (!r.ok) throw new Error('proxy status ' + r.status);
      const entry = KazuLib.parseLetterboxdRss(await r.text());
      renderLetterboxd(entry);
      cardCacheWrite(LB_CACHE_KEY, LB_USER, { entry });
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
    // The strip's markup (#musicRecent / #musicTrackList) is optional, and it
    // is not in index.html at the moment: with nowhere to render, the fetch was
    // pure waste (a request every 2 minutes, forever, whose answer was thrown
    // away, and a radio wake-up on a phone each time). Look BEFORE fetching;
    // the strip switches itself back on the moment its markup returns.
    const wrap = $('musicRecent');
    const list = $('musicTrackList');
    if (!wrap || !list) return;
    try {
      const r = await fetchT('https://api.listenbrainz.org/1/user/' + encodeURIComponent(LISTENBRAINZ_USER) + '/listens?count=3');
      if (!r.ok) throw new Error('status ' + r.status);
      const j = await r.json();
      const rows = ((((j || {}).payload) || {}).listens || [])
        .map(KazuLib.listenbrainzRow)
        .filter(Boolean)
        .slice(0, 3);
      if (!rows.length) { wrap.classList.add('hidden'); return; }
      const sig = JSON.stringify(rows);
      if (sig !== lastMusicSig) {
        lastMusicSig = sig;
        list.innerHTML = rows.map((t, i) => {
          const inner =
            '<div class="music-track-num">' + (t.playingNow ? '' : String(i + 1)) + '</div>' +
            '<div class="music-track-text">' +
              '<div class="music-track-name">' + escapeHtml(t.name) + '</div>' +
              '<div class="music-track-artist">' + escapeHtml(t.artist) + '</div>' +
            '</div>';
          return t.url
            ? '<a class="music-track-row" href="' + escapeHtml(t.url) + '" target="_blank" rel="noopener">' + inner + '</a>'
            : '<div class="music-track-row">' + inner + '</div>';
        }).join('');
      }
      popReveal(wrap); // first arrival expands the strip; later polls no-op
    } catch (e) {
      // Keep the static card on failure; the playlist link is the fallback content.
    }
  }

  // ---------- YouTube Music playlist (latest additions via Atom feed) -------
  // Every public playlist publishes an Atom feed (feeds/videos.xml, newest
  // additions first) — keyless, so the "From the playlist" rows track the
  // real playlist instead of going stale: a song added in YouTube Music
  // appears here on the next poll. No CORS header on the feed, so it rides
  // the same CORS proxy as Letterboxd; parsing lives in lib.js (regex,
  // DOM-free). Failure order: localStorage cache → the static
  // snapshot rows shipped in index.html.
  let YTM_PLAYLIST_ID = siteValue('playlist', 'playlistId', 'PLEWxJlvxPVrkYhMCA1IlYwDh5bg-jf39m');
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
    if (!paintingFromCache) popRefresh(list); // live rows pop in over the static snapshot
  }

  function paintPlaylistCache(ms, now) {
    if (!KazuLib.ytPlaylistCacheParse) return 0;
    const raw = cardCacheRaw(YTM_CACHE_KEY);
    const meta = KazuLib.cardCacheMeta(raw, YTM_PLAYLIST_ID);
    const rows = meta.paint ? KazuLib.ytPlaylistCacheParse(raw) : null;
    if (!rows || !rows.length) return 0; // no copy: the static snapshot in index.html stands
    renderPlaylistTracks(rows);
    return meta.at;
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
      const r = await proxyFetch(feed);
      if (!r.ok) throw new Error('proxy status ' + r.status);
      const rows = KazuLib.parseYouTubePlaylistRss(await r.text()).slice(0, 5);
      if (!rows.length) throw new Error('feed had no usable entries');
      renderPlaylistTracks(rows);
      cardCacheWrite(YTM_CACHE_KEY, YTM_PLAYLIST_ID, { rows });
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

  // The quote of the UK day: picked by the date, so it never changes until the date does.
  const ukToday = () => (KazuLib && KazuLib.ukDateIso ? KazuLib.ukDateIso(new Date()) : new Date().toISOString().slice(0, 10));
  function showFallbackQuote() {
    const day = ukToday();
    let n = 0;
    for (let i = 0; i < day.length; i++) n = (n * 31 + day.charCodeAt(i)) >>> 0;
    const [text, author] = FALLBACK_QUOTES[n % FALLBACK_QUOTES.length];
    $('quoteText').textContent = text;
    $('quoteAuthor').textContent = '— ' + author;
    $('quoteBox').classList.add('visible');
  }

  // No network: the quote of the day is picked from FALLBACK_QUOTES by the UK
  // date, so it is on screen at the first paint (the boot paint below), the same
  // all day, and different tomorrow. The poller re-runs it so a page left open
  // across midnight changes.
  function paintQuoteCache() {
    if (siteSectionOff('quote')) return 0;
    showFallbackQuote();
    return 0;
  }

  function loadQuote() {
    if (siteSectionOff('quote')) return;
    showFallbackQuote();
  }

  // ---------- Browser-chrome colour ----------
  // There is no theme toggle: the redesign paints the page one flat canvas
  // (style.css REDESIGN; light, or dark from the system setting), so the
  // browser chrome follows that canvas and not the sky tint or the seasonal
  // colour its callers still pass in. The head's first-paint script writes the
  // tint until this runs; this corrects it and follows a change of system theme.
  const THEME_CANVAS = { light: '#F7F6F3', dark: '#111316' };
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const themeDarkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function setThemeColor() {
    const c = themeDarkMQ && themeDarkMQ.matches ? THEME_CANVAS.dark : THEME_CANVAS.light;
    if (themeColorMeta && themeColorMeta.getAttribute('content') !== c) {
      themeColorMeta.setAttribute('content', c);
    }
  }
  if (themeDarkMQ && themeDarkMQ.addEventListener) themeDarkMQ.addEventListener('change', () => setThemeColor());
  setThemeColor();

  // ---------- New Year fireworks ----------
  // One finite, silent show at UK midnight, using the existing visible-tab
  // clock tick. The first minute is a grace window for late loads/resumes;
  // sessionStorage keeps reloads from repeating it in this tab. Preview with
  // ?fireworks=1 on any date (no clock spoofing or saved latch changes).
  const NEW_YEAR_DURATION = 20000;
  const NEW_YEAR_KEY = 'kazu-new-year-celebrated';
  const FIREWORKS_PREVIEW = (() => {
    try { return new URLSearchParams(location.search).get('fireworks') === '1'; }
    catch (e) { return false; }
  })();
  let newYearCelebrated = 0, newYearPreviewPlayed = false;
  try {
    const saved = sessionStorage.getItem(NEW_YEAR_KEY);
    if (/^\d{4}$/.test(saved || '')) newYearCelebrated = +saved;
  } catch (e) {} // private browsing / blocked storage: the in-memory latch still works
  const newYearCelebrationYear = (KazuLib && KazuLib.newYearCelebrationYear) || function (w, celebratedYear) {
    if (!w || !isFinite(w.year) || w.year < 1 || w.year % 1) return null;
    return w.month === 0 && w.day === 1 && w.hours === 0 && w.minutes === 0 &&
      w.year > (celebratedYear || 0) ? w.year : null;
  };
  const fireworkSparkState = (KazuLib && KazuLib.fireworkSparkState) || function (age, angle, speed, life) {
    if (!isFinite(age) || !isFinite(angle) || !isFinite(speed) || !isFinite(life) || life <= 0) return { x: 0, y: 0, alpha: 0 };
    const t = Math.max(0, Math.min(age, life));
    const travel = speed * (1 - Math.exp(-1.25 * t)) / 1.25;
    const fade = Math.max(0, 1 - t / life);
    return { x: Math.cos(angle) * travel, y: Math.sin(angle) * travel + 22 * t * t, alpha: age < 0 ? 0 : fade * fade };
  };

  function checkNewYear() {
    if (document.hidden) return;
    const w = seasonUKParts(new Date());
    let year;
    if (FIREWORKS_PREVIEW) {
      if (newYearPreviewPlayed) return;
      newYearPreviewPlayed = true;
    } else {
      year = newYearCelebrationYear(w, newYearCelebrated);
      if (year === null) return;
      newYearCelebrated = year;
      try { sessionStorage.setItem(NEW_YEAR_KEY, String(year)); } catch (e) {}
    }
    celebrateNewYear();
  }

  function celebrateNewYear() {
    if (document.hidden || $('fireworks-canvas')) return;
    const motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (LOW_POWER || (motion && motion.matches)) return;
    let canvas = document.createElement('canvas');
    canvas.id = 'fireworks-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    document.body.appendChild(canvas);

    // All temporary DOM, listeners and the single rAF loop are removed when
    // the show ends, motion is reduced, the tab hides or the page leaves
    // (including the back/forward cache).
    let frameId = 0, w = 0, h = 0;
    function finish() {
      clearTimeout(endTimer);
      cancelAnimationFrame(frameId);
      frameId = 0;
      if (canvas) { canvas.remove(); canvas = null; }
      window.removeEventListener('resize', size);
      if (motion && motion.removeEventListener) motion.removeEventListener('change', finish);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', finish);
    }
    function onVisibility() { if (document.hidden) finish(); }
    const endTimer = setTimeout(finish, NEW_YEAR_DURATION);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', finish);
    // Half CSS resolution, capped at 30 fps. No dark overlay, full-screen
    // flashes, audio or expensive per-particle shadows; the page stays usable.
    function size() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * 0.5); canvas.height = Math.round(h * 0.5);
      ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
    }
    size();
    window.addEventListener('resize', size, { passive: true });
    if (motion && motion.addEventListener) motion.addEventListener('change', finish);
    const colors = ['#ffd99a', '#bca7ff', '#91d9ff', '#ffaccf', '#a7f0d5'];
    const shells = [];
    const count = lightDevice ? 28 : 48;
    for (let i = 0; i < 22; i++) {
      const sparks = [];
      for (let j = 0; j < count; j++) sparks.push({
        angle: j / count * Math.PI * 2 + (Math.random() - 0.5) * 0.12,
        speed: 0.16 + Math.random() * 0.18, life: 1.8 + Math.random(),
      });
      shells.push({
        at: i < 18 ? 0.25 + i * 0.72 : 15 + (i - 18) * 0.26,
        x: 0.14 + Math.random() * 0.72, y: 0.14 + Math.random() * 0.30,
        lean: (Math.random() - 0.5) * 0.12, color: colors[i % colors.length], sparks,
      });
    }
    const start = performance.now();
    let lastFrame = -Infinity;
    function frame(t) {
      if (!canvas) return;
      if (document.hidden || t - start >= NEW_YEAR_DURATION) { finish(); return; }
      frameId = requestAnimationFrame(frame);
      if (t - lastFrame < 1000 / 30) return;
      lastFrame = t;
      ctx.clearRect(0, 0, w, h);
      const elapsed = (t - start) / 1000;
      const scale = Math.min(w, h);
      for (const shell of shells) {
        const age = elapsed - shell.at - 0.9;
        if (age < -0.9 || age >= 2.8) continue;
        const x = shell.x * w, y = shell.y * h;
        ctx.strokeStyle = shell.color;
        if (age < 0) {
          const progress = 1 + age / 0.9;
          const tail = Math.max(0, progress - 0.07);
          ctx.globalAlpha = Math.min(0.8, progress * 3);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + shell.lean * w * (1 - tail), h * 1.04 + (y - h * 1.04) * (1 - (1 - tail) ** 2));
          ctx.lineTo(x + shell.lean * w * (1 - progress), h * 1.04 + (y - h * 1.04) * (1 - (1 - progress) ** 2));
          ctx.stroke();
          continue;
        }
        ctx.lineWidth = lightDevice ? 1.8 : 2.2;
        for (const spark of shell.sparks) {
          const p = fireworkSparkState(age, spark.angle, spark.speed * scale, spark.life);
          if (p.alpha <= 0) continue;
          const tail = fireworkSparkState(Math.max(0, age - 0.045), spark.angle, spark.speed * scale, spark.life);
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.moveTo(x + tail.x, y + tail.y);
          ctx.lineTo(x + p.x, y + p.y);
          ctx.stroke();
        }
      }
    }
    frameId = requestAnimationFrame(frame);
  }

  // ---------- Site control: applying the settings ----------
  // Each edit is recorded as it is made, so adopting a newer copy first puts the
  // page back exactly as index.html wrote it and then applies the new settings;
  // that is also how a section handed back to the HTML returns to its own content.
  // Nodes made after the first pass get .is-visible at once: the reveal observer
  // below only learns about the elements that exist when it starts.
  const siteUndo = [];
  let siteLate = false;

  function ovText(el, text) {
    if (!el) return;
    const old = el.textContent;
    siteUndo.push(() => { el.textContent = old; });
    el.textContent = text;
  }
  function ovAttr(el, name, value) {
    if (!el) return;
    const old = el.getAttribute(name);
    siteUndo.push(() => { if (old === null) el.removeAttribute(name); else el.setAttribute(name, old); });
    el.setAttribute(name, value);
  }
  function ovClass(el, name, on) {
    if (!el) return;
    const had = el.classList.contains(name);
    siteUndo.push(() => { el.classList.toggle(name, had); });
    el.classList.toggle(name, on);
  }
  function ovStyle(el, prop, value) {
    if (!el) return;
    const old = el.style.getPropertyValue(prop);
    siteUndo.push(() => { if (old) el.style.setProperty(prop, old); else el.style.removeProperty(prop); });
    el.style.setProperty(prop, value);
  }
  function ovChildren(el, nodes) {
    if (!el) return;
    const old = Array.from(el.childNodes);
    siteUndo.push(() => { el.textContent = ''; old.forEach((n) => el.appendChild(n)); });
    el.textContent = '';
    nodes.forEach((n) => el.appendChild(n));
  }
  function siteReset() { while (siteUndo.length) siteUndo.pop()(); }

  const SITE_GRIDS = { rightNow: '.right-now-grid', socials: '.socials-grid', pc: '.pc-specs-grid', playlist: '.music-grid', stories: '.stories-grid' };
  const siteGrid = (key) => document.querySelector(SITE_GRIDS[key]);
  const siteHeading = (key) => { const g = siteGrid(key); const h = g && g.previousElementSibling; return h && h.tagName === 'H2' ? h : null; };
  const siteEl = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function applySiteSections() {
    const sections = siteSection('sections');
    const titles = siteSection('titles');
    Object.keys(SITE_GRIDS).forEach((key) => {
      const off = !!sections && sections[key] === false;
      ovClass(siteGrid(key), 'hidden', off);
      ovClass(siteHeading(key), 'hidden', off);
      if (titles && titles[key]) ovText(siteHeading(key), titles[key]);
    });
    if (sections && sections.quote === false) ovClass($('quoteBox'), 'hidden', true);
  }

  function makeSocialTile(s) {
    const a = siteEl('a', 'social-card social-card--custom scroll-reveal' + (siteLate ? ' is-visible' : ''));
    a.setAttribute('href', s.url);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    a.style.setProperty('--brand-a', s.colorA || '#7c5cff');
    a.style.setProperty('--brand-b', s.colorB || '#4a34b8');
    a.appendChild(siteEl('span', 'social-name', s.name));
    a.appendChild(siteEl('span', 'social-handle', s.handle));
    return a;
  }

  function applySiteSocials() {
    const list = siteSection('socials');
    const grid = siteGrid('socials');
    if (!list || !grid) return;
    const existing = {};
    Array.from(grid.querySelectorAll('.social-card')).forEach((a) => {
      const m = /social-card--([a-z0-9-]+)/.exec(a.className);
      if (m) existing[m[1]] = a;
    });
    const nodes = list.map((s) => {
      const a = existing[s.id];
      if (!a) return makeSocialTile(s);
      ovAttr(a, 'href', s.url);
      ovText(a.querySelector('.social-name'), s.name);
      ovText(a.querySelector('.social-handle'), s.handle);
      return a;
    });
    ovChildren(grid, nodes);
  }

  function makeStoryLink() {
    const a = siteEl('a', 'story-link scroll-reveal' + (siteLate ? ' is-visible' : ''));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    const card = siteEl('div', 'card story-card');
    card.appendChild(siteEl('h3', 'story-title'));
    card.appendChild(siteEl('p', 'story-desc'));
    card.appendChild(siteEl('div', 'story-cta'));
    a.appendChild(card);
    return a;
  }

  function applySiteStories() {
    const list = siteSection('stories');
    const grid = siteGrid('stories');
    if (!list || !grid) return;
    const links = Array.from(grid.querySelectorAll('.story-link'));
    const template = links[0] || null;
    const nodes = list.map((s, i) => {
      const reused = !!links[i];
      const a = links[i] || (template ? template.cloneNode(true) : makeStoryLink());
      if (!reused && template) a.classList.toggle('is-visible', siteLate || template.classList.contains('is-visible'));
      const style = SiteConfig.storyStyle(s.colors);
      const card = a.querySelector('.story-card');
      const cta = a.querySelector('.story-cta');
      const w = reused
        ? { text: ovText, attr: ovAttr, style: ovStyle }
        : { text: (n, v) => { if (n) n.textContent = v; }, attr: (n, k, v) => n.setAttribute(k, v), style: (n, k, v) => { if (n) n.style.setProperty(k, v); } };
      w.attr(a, 'href', s.url);
      w.text(a.querySelector('.story-title'), s.title);
      w.text(a.querySelector('.story-desc'), s.desc);
      w.text(cta, s.cta + ' →');
      w.style(card, 'background', style.background);
      w.style(card, 'box-shadow', style.boxShadow);
      w.style(cta, 'color', style.ctaColor);
      return a;
    });
    ovChildren(grid, nodes);
  }

  function applySitePc() {
    const pc = siteSection('pc');
    if (!pc) return;
    const card = (name) => document.querySelector('.pc-spec-card--' + name);
    const graphics = card('graphics');
    if (pc.graphics && graphics) {
      const g = pc.graphics;
      ovText(graphics.querySelector('.pc-spec-maker'), g.maker);
      const strong = siteEl('strong', '', g.model);
      ovChildren(graphics.querySelector('.pc-spec-feature-name'), [document.createTextNode(g.brand ? g.brand + ' ' : ''), strong]);
    }
    [['platform', 'pc-spec-entry', 'label', 'value'], ['storage', 'pc-storage-entry', 'size', 'name'], ['build', 'pc-spec-entry', 'label', 'value']].forEach((spec) => {
      const rows = pc[spec[0]];
      const c = card(spec[0]);
      const dl = c && c.querySelector('dl');
      if (!rows || !dl) return;
      ovChildren(dl, rows.map((r) => {
        const row = siteEl('div', spec[1]);
        row.appendChild(siteEl('dt', '', r[spec[2]]));
        row.appendChild(siteEl('dd', '', r[spec[3]]));
        return row;
      }));
    });
  }

  function applySitePlaylist() {
    const p = siteSection('playlist');
    const card = document.querySelector('.music-card');
    if (!p || !card) return;
    ovText(card.querySelector('.music-playlist-name'), p.name);
    ovText(card.querySelector('.music-playlist-sub'), p.sub);
    const url = SiteConfig.playlistUrl(p.playlistId);
    card.querySelectorAll('a.pill-link').forEach((a) => ovAttr(a, 'href', url));
    // The static rows belong to the page's own playlist; another playlist shows none until its feed arrives.
    if (p.playlistId !== siteDefaults['playlist.playlistId']) {
      const list = $('musicFeatured');
      const label = list && list.querySelector('.music-recent-label');
      if (label) ovChildren(list, [label.cloneNode(true)]);
    }
  }

  function applySiteIntegrations() {
    const i = siteSection('integrations');
    if (!i) return;
    const urls = SiteConfig.profileUrls(i);
    [['discord', '.discord-card'], ['steam', '.steam-card'], ['mal', '.mal-card'], ['letterboxd', '.lb-card']].forEach((pair) => {
      if (!i[pair[0]]) return;
      const card = document.querySelector(pair[1]);
      if (!card) return;
      if (i[pair[0]].enabled === false) ovClass(card, 'hidden', true);
      ovAttr(pair[0] === 'discord' ? $('discordAddMe') : card.querySelector('a.pill-link'), 'href', urls[pair[0]]);
    });
    if (i.steam && i.steam.displayName) {
      ovText(document.querySelector('.steam-card .presence-name'), i.steam.displayName);
      ovText(document.querySelector('.steam-card .steam-fallback-title'), i.steam.displayName);
    }
  }

  function siteNoticeDismissed(n) {
    try { return localStorage.getItem(NOTICE_KEY) === SiteConfig.noticeId(n); } catch (e) { return false; }
  }

  // Not undo-recorded: it is rewritten from scratch every time, because the
  // start and end times mean it has to be re-checked as the clock moves.
  function applySiteNotice() {
    const box = $('hubBulletin');
    if (!box || !SiteConfig) return;
    const n = siteSection('notice');
    if (!n || !SiteConfig.noticeActive(n, Date.now()) || (n.dismissible && siteNoticeDismissed(n))) { box.hidden = true; return; }
    box.querySelector('.hub-bulletin-text').textContent = n.text;
    const link = box.querySelector('.hub-bulletin-link');
    const linked = !!n.linkUrl && SiteConfig.controlUrlOk(n.linkUrl) && n.linkUrl[0] !== '/';
    link.hidden = !linked;
    if (linked) { link.setAttribute('href', n.linkUrl); link.textContent = n.linkText; }
    box.querySelector('.hub-bulletin-close').hidden = !n.dismissible;
    box.className = 'hub-bulletin' + (n.tone === 'good' || n.tone === 'warn' ? ' hub-bulletin--' + n.tone : '');
    box.hidden = false;
  }
  const bulletinClose = document.querySelector('.hub-bulletin-close');
  if (bulletinClose) bulletinClose.addEventListener('click', () => {
    const n = siteSection('notice');
    if (n) { try { localStorage.setItem(NOTICE_KEY, SiteConfig.noticeId(n)); } catch (e) {} }
    $('hubBulletin').hidden = true;
  });

  function applySiteConfig() {
    if (!SiteConfig) return;
    applySiteSections();
    applySiteSocials();
    applySiteStories();
    applySitePc();
    applySitePlaylist();
    applySiteIntegrations();
    applySiteNotice();
  }

  const siteIdList = () => ({ discord: DISCORD_ID, steam: STEAM_VANITY, mal: MAL_USER, lb: LB_USER, ytm: YTM_PLAYLIST_ID });
  const SITE_INTEGRATION_FOR = { discord: 'discord', steam: 'steam', mal: 'mal', lb: 'letterboxd' };
  const SITE_CACHES = { discord: ['kazu-discord-cache'], steam: ['kazu-steam-cache'], mal: ['kazu-mal-cache', 'kazu-mal-manga-cache'], lb: ['kazu-lb-cache'], ytm: ['kazu-ytm-cache'] };

  // A new account id or a card switched on or off: drop that card's cached rows
  // and fetch it again now instead of waiting for its next poll.
  function siteChanged(beforeIds, beforeOn, hadPlaylist) {
    const reload = { discord: () => { restartLanyard(); loadDiscord(); }, steam: loadSteam, mal: loadMalAll, lb: loadLetterboxd, ytm: loadPlaylistTracks };
    const now = siteIdList();
    Object.keys(reload).forEach((k) => {
      const idChanged = beforeIds[k] !== now[k];
      const toggled = !!SITE_INTEGRATION_FOR[k] && beforeOn[k] !== siteIntegrationOn(SITE_INTEGRATION_FOR[k]);
      if (!idChanged && !toggled) return;
      if (idChanged) (SITE_CACHES[k] || []).forEach((key) => { try { localStorage.removeItem(key); } catch (e) {} });
      reload[k]();
    });
    if (hadPlaylist || siteSection('playlist')) { lastYtmSig = ''; loadPlaylistTracks(); }
  }

  function adoptSiteConfig(next, text, persist) {
    if (text === siteCfgText) { applySiteNotice(); return; }
    const beforeIds = siteIdList();
    const beforeOn = { discord: siteIntegrationOn('discord'), steam: siteIntegrationOn('steam'), mal: siteIntegrationOn('mal'), lb: siteIntegrationOn('letterboxd') };
    const hadPlaylist = !!siteSection('playlist');
    siteCfg = next;
    siteCfgText = text;
    siteReset();
    DISCORD_ID = siteId('discord', 'userId', siteDefaults['discord.userId']);
    STEAM_VANITY = siteId('steam', 'vanity', siteDefaults['steam.vanity']);
    MAL_USER = siteId('mal', 'user', siteDefaults['mal.user']);
    LB_USER = siteId('letterboxd', 'user', siteDefaults['letterboxd.user']);
    YTM_PLAYLIST_ID = siteValue('playlist', 'playlistId', siteDefaults['playlist.playlistId']);
    applySiteConfig();
    if (persist) { try { localStorage.setItem(SITE_CONFIG_KEY, JSON.stringify({ u: CONTROL_URL, t: text })); } catch (e) {} }
    if (siteLate) siteChanged(beforeIds, beforeOn, hadPlaylist);
  }

  // Polled once a minute (the pollers pause in a hidden tab). Any failure keeps
  // whatever is already applied: the page never depends on this succeeding.
  async function loadSiteControl() {
    if (!CONTROL_URL || !SiteConfig) return;
    let body = null;
    const early = window.__kazuControl;
    window.__kazuControl = null;
    try {
      body = early ? await early : null;
      if (body === null) {
        const r = await fetchT(CONTROL_URL, { cache: 'no-store' });
        body = r.ok ? await r.text() : null;
      }
    } catch (e) { body = null; }
    const parsed = body === null ? null : SiteConfig.parseStored(body);
    if (!parsed || !parsed.ok) { applySiteNotice(); return; }
    const next = SiteConfig.normalize(parsed.value || { schema: 1 }).config;
    adoptSiteConfig(next, JSON.stringify(next), true);
  }

  // The control panel's preview feeds draft settings in through here; it is never
  // persisted, and the settings still go through the same validation.
  window.KazuSiteControl = {
    apply: (raw) => { if (!SiteConfig) return; const next = SiteConfig.normalize(raw).config; adoptSiteConfig(next, JSON.stringify(next), false); },
    current: () => siteCfg
  };

  applySiteConfig();
  siteLate = true;

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
  if (!LOW_POWER && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      let batch = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealObserver.unobserve(entry.target);
        revealEl(entry.target, Math.min(batch++ * REVEAL_STAGGER, REVEAL_MAX_DELAY));
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    revealEls.forEach((el) => revealObserver.observe(el));
    // The -10% bottom margin can never trip for the last sliver of the page:
    // the footer is shorter than the margin band, so it stayed hidden forever.
    // Reaching the bottom of the document reveals whatever is left.
    const revealStragglers = () => {
      if (window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 4) return;
      revealEls.forEach((el) => {
        if (el.classList.contains('is-visible')) return;
        revealObserver.unobserve(el);
        revealEl(el, 0);
      });
    };
    window.addEventListener('scroll', revealStragglers, { passive: true });
    window.addEventListener('load', revealStragglers, { once: true });
    revealStragglers(); // a page that fits the viewport gets no scroll events
  } else {
    // Low power / no observer support: everything is simply present.
    revealEls.forEach((el) => revealEl(el, 0));
  }

  // ---------- Konami code easter egg ----------
  // ↑↑↓↓←→←→BA sends the dragon flying across the screen with a snow burst.
  // The sequence check lives in KazuLib.konamiMatch; the local
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
    if (LOW_POWER) {
      showToast('You found the dragon! ');
      konamiBusy = false;
      return;
    }
    showToast('Konami! The dragon takes flight…');
    const d = document.createElement('div');
    d.className = 'konami-dragon';
    d.innerHTML = '<img src="assets/New Kazu.png" width="64" height="64" alt="">';
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    d.addEventListener('animationend', () => { d.remove(); konamiBusy = false; });
    for (let i = 0; i < 24; i++) {
      const f = document.createElement('span');
      f.className = 'konami-flake';
      f.setAttribute('aria-hidden', 'true');
      f.textContent = '';
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
  });

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
    restartLanyard(); // re-arm the socket, reset backoff, and reconnect
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
  // cache can never answer for Discord/Steam/MAL/Letterboxd: when a poll
  // runs it goes straight to the network and the cards track the server end.
  // (The service worker ignores cross-origin requests entirely — see sw.js —
  // so there is no second cache layer in front of them either.) What a reload
  // skips is the poll itself: `paint` draws the card's own localStorage copy
  // and returns its stamp, which becomes `last` (see "Live-card cache").
  const POLLERS = [
    { fn: tick, ms: 1000, last: 0 },
    { fn: loadWeather, ms: 10 * 60 * 1000, last: 0, paint: paintWeatherCache },
    { fn: loadSiteControl, ms: 60 * 1000, last: 0 },
    // Steam before Discord: its avatar is the one both cards show, so the
    // boot paint must not start Discord's own avatar loading first.
    { fn: loadSteam, ms: 5 * 60 * 1000, last: 0, firstDelay: bootGap(2000), paint: paintSteamCache },
    { fn: loadDiscord, ms: 20 * 1000, last: 0, firstDelay: bootGap(700), paint: paintDiscordCache },
    { fn: loadMalAll, ms: 10 * 60 * 1000, last: 0, firstDelay: bootGap(3300), paint: paintMalCache },
    { fn: loadLetterboxd, ms: 30 * 60 * 1000, last: 0, firstDelay: bootGap(4600), paint: paintLetterboxdCache },
    { fn: loadPlaylistTracks, ms: 30 * 60 * 1000, last: 0, firstDelay: bootGap(5900), paint: paintPlaylistCache },
    // firstDelay ladder: only the clock and the weather fetch inside the load task now. Every other
    // card's FIRST fetch waits for its own rung, so the network burst, the
    // JSON parsing and the DOM rewrites land one at a time instead of as a
    // six-way pile-up. bootGap stretches the ladder on light hardware.
    // Intervals and payloads are unchanged — this only orders the boot.
    { fn: loadMusicRecent, ms: 2 * 60 * 1000, last: 0, firstDelay: bootGap(7200) },
    { fn: loadQuote, ms: 15 * 60 * 1000, last: 0, firstDelay: bootGap(150), paint: paintQuoteCache },
  ];
  let timers = [];

  // Inline copy in case lib.js failed to load.
  const pollDelay = (KazuLib && KazuLib.pollDelay) || function (last, ms, firstDelay, ran, now) {
    const age = now - last;
    if (last > 0 && ms > 0 && age >= 0 && age < ms) return ms - age;
    return ran ? 0 : (firstDelay > 0 ? firstDelay : 0);
  };

  // Paint every card's stored copy in the boot task, so a repeat visit opens
  // on content instead of "Connecting to..." rows. The browser has usually
  // painted the page once already (this file runs at the end of <body>), so
  // index.html's #boot-cards keeps the Right-now cards hidden until here and
  // the hold is lifted in this same task: they come into view already filled,
  // with no jump from loading-row height. A card whose copy is fresh skips its
  // first fetch (its `last` is the copy's stamp); a stale copy stays on screen
  // while its rung refetches. One bad copy never stops the others, and the
  // hold is lifted whatever happens.
  function paintCardCaches() {
    try {
      if (!KazuLib || !KazuLib.cardCacheMeta) return;
      const now = Date.now();
      paintingFromCache = true;
      for (const p of POLLERS) {
        if (!p.paint) continue;
        try { p.last = p.paint(p.ms, now) || 0; } catch (e) { p.last = 0; }
      }
    } finally {
      paintingFromCache = false;
      const hold = document.getElementById('boot-cards-hold');
      if (hold) hold.remove();
    }
  }

  function runPoller(p) { p.last = Date.now(); p.ran = true; p.fn(); }

  // Each poller waits pollDelay: due now, its boot rung, or (fresh data from
  // this visit or a stored copy) the rest of its interval, then runs every
  // interval after that. Every id lands in the same timers array (clearTimeout
  // and clearInterval are interchangeable), so the visibility pause cancels
  // pending first runs like everything else.
  function startPolling() {
    if (timers.length) return; // already running
    const now = Date.now();
    for (const p of POLLERS) {
      const wait = pollDelay(p.last, p.ms, p.firstDelay || 0, !!p.ran, now);
      const run = () => { runPoller(p); timers.push(setInterval(() => runPoller(p), p.ms)); };
      if (wait > 0) timers.push(setTimeout(run, wait));
      else run();
    }
  }
  function stopPolling() {
    timers.forEach(clearInterval);
    timers = [];
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPolling(); stopLanyard(); }
    else { startPolling(); startLanyard(); }
    syncSpotifyBar(); // no bar timer while hidden; catches up on the first visible tick
  });

  paintCardCaches();
  if (!document.hidden) {
    startPolling();
    // The socket joins the ladder too: the REST poll above already paints
    // the Discord card, so the live channel can open a beat later.
    setTimeout(() => { if (!document.hidden) startLanyard(); }, bootGap(1400));
  }
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

  // Accessibility & hardware gating (Apple Liquid Glass architecture):
  // Optical ray displacement via backdrop SVG filters consumes fill-rate and memory
  // bandwidth. We disable it completely on low-end devices, under Save-Data mode,
  // or when Reduce Motion / Reduce Transparency accessibility preferences are active.
  // Low-power mode (the main IIFE set the body class): baking per-card
  // displacement maps and re-running SVG filters against the backdrop is
  // exactly the work the mode exists to skip. style.css keeps the cards
  // readable with no backdrop-filter at all under body.low-power.
  if (document.body.classList.contains('low-power')) return;

  const hardwareFlags = {
    coarsePointer: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
    smallScreen: Math.min(window.innerWidth, window.innerHeight) < 500,
    lowConcurrency: !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4),
    saveData: !!(navigator.connection && navigator.connection.saveData),
    lowMemory: !!(navigator.deviceMemory && navigator.deviceMemory <= 4),
    reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    reducedTransparency: !!(window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches),
  };
  const lowEndHardware = (KazuLib && KazuLib.isLowEndDevice)
    ? KazuLib.isLowEndDevice(hardwareFlags)
    : (hardwareFlags.saveData || hardwareFlags.reducedMotion || hardwareFlags.reducedTransparency ||
       (hardwareFlags.lowMemory && hardwareFlags.lowConcurrency) ||
       (hardwareFlags.coarsePointer && (hardwareFlags.smallScreen || hardwareFlags.lowConcurrency)));
  if (lowEndHardware) return;

  if (hardwareFlags.reducedTransparency) return;

  const housing = document.getElementById('glass-filters');
  if (!housing) return;

  // --- Apple Liquid Glass physical parameters ---
  // Parameterized according to the reverse-engineered optical transmission pipeline:
  // - Squircle exponent n = 4.0: preserves G^2 continuous curvature along the boundary
  // - Analytical normal gradient: exact directional rate of change
  // - Convex bevel profile h(u) = sqrt(1.0 - (1.0 - u)^4): compresses light inward via Snell's Law
  // - Vibrancy saturation boost: 1.8x
  const BEVEL_RADIUS = 24; // Bevel zone width in px
  const DEPTH = 24;        // Snell's Law refraction scale in px
  const BLUR = 0;          // Crisp refraction over background scenery
  const SAT = 1.8;         // Vibrancy saturation boost

  const mapCache = new Map();

  // Bake a w×h displacement map: evaluates the superellipse squircle SDF (n = 4.0),
  // analytical normal gradient, and convex bevel profile to encode inward Snell's Law
  // refraction into Red (X) and Green (Y) channels.
  function buildMap(w, h, radius) {
    const bevel = Math.max(12, Math.min(BEVEL_RADIUS, (radius || 20) * 1.2));
    const key = w + 'x' + h + 'b' + Math.round(bevel);
    const hit = mapCache.get(key);
    if (hit) return hit;

    // Buffer Decimation / Downsampling Optimization:
    // Blurring/sampling at half resolution (0.5x) on larger cards reduces pixel workload
    // by 75% and keeps SVG data URLs compact while the GPU's hardware bilinear filter
    // smoothly interpolates the displacement gradient across the container.
    const decimate = (w > 220 || h > 220);
    const scale = decimate ? 0.5 : 1.0;
    const mapW = Math.max(32, Math.round(w * scale));
    const mapH = Math.max(32, Math.round(h * scale));
    const mapBevel = bevel * scale;

    const cv = document.createElement('canvas');
    cv.width = mapW; cv.height = mapH;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(mapW, mapH);

    // Fast neutral displacement initialization:
    // (128, 128, 128, 255) packed in little-endian 32-bit integer is 0xFF808080.
    // Flat central plateau and outer regions remain neutral with zero per-pixel memory overhead.
    const u32 = new Uint32Array(img.data.buffer);
    u32.fill(0xFF808080);
    const px = img.data;

    const halfX = mapW * 0.5, halfY = mapH * 0.5;
    const minDim = Math.min(halfX, halfY);

    for (let y = 0; y < mapH; y++) {
      const ny = (y - halfY) / halfY;
      const ny2 = ny * ny;
      const ny4 = ny2 * ny2;
      const gyBase = (ny * ny2) / halfY;
      const rowOffset = y * mapW * 4;

      for (let x = 0; x < mapW; x++) {
        const nx = (x - halfX) / halfX;
        const nx2 = nx * nx;
        const nx4 = nx2 * nx2;

        // Squircle distance field: dist = (nx^4 + ny^4)^(1/4)
        const dist = Math.sqrt(Math.sqrt(nx4 + ny4));
        const edgeDistance = (1.0 - dist) * minDim;

        // Evaluate only inside the curved convex bevel zone
        if (edgeDistance > 0.0 && edgeDistance <= mapBevel) {
          const u = 1.0 - (edgeDistance / mapBevel);
          // Analytical squircle gradient vector (divided by halfExtents for screen-space normal)
          const gx = (nx * nx2) / halfX;
          const gy = gyBase;
          const len = Math.hypot(gx, gy) || 1.0;

          // Convex squircle heightfield profile: sqrt(1.0 - (1.0 - u)^4)
          const om = 1.0 - u;
          const om2 = om * om;
          const om4 = om2 * om2;
          const disp = Math.sqrt(Math.max(0, 1.0 - om4));

          // Inward refractive vector transport
          const dx = -(gx / len) * disp;
          const dy = -(gy / len) * disp;

          const i = rowOffset + (x << 2);
          px[i]     = Math.min(255, Math.max(0, Math.round(128 + dx * 127))); // R = X displacement
          px[i + 1] = Math.min(255, Math.max(0, Math.round(128 + dy * 127))); // G = Y displacement
        }
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
    const radius = parseFloat(getComputedStyle(card.el).borderTopLeftRadius) || 20;
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

  // Every .card refracts by default — the opt-outs are the birthday tile and
  // the social tiles (solid brand gradients, nothing to refract through; the
  // socials dropped the .card class when they became brand tiles). The toast
  // joins too. Keying the selector off .card means any future card gets the
  // rim automatically.
  const cards = Array.from(
    document.querySelectorAll('.card:not(.stat-card--bday), .toast'),
  ).map((el, i) => ({ el, id: 'glass-' + i, w: 0, h: 0 }));

  function refreshAll() { cards.forEach(refresh); renderHousing(); }

  // Staged first bake: buildMap is a per-pixel SDF loop for every card size,
  // and baking every card inside the load task was the single heaviest thing
  // this page did on startup. The first pass now walks the card list in
  // ~12ms slices on idle callbacks instead; until a card's rim lands it
  // shows the stylesheet's plain frosted blur — the same look Safari and
  // Firefox always render. Size watching only starts once the first pass is
  // done; before that the bake itself measures whatever the layout is.
  let booted = false;
  let bootIndex = 0;
  let pending = false;
  function schedule() {
    if (pending || !booted || window.__kazuPopAnim) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; refreshAll(); });
  }
  window.kazuGlassSchedule = schedule; // popReveal fires one rebake when a card's expand glide finishes
  function watchResizes() {
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(schedule);
      cards.forEach((c) => ro.observe(c.el));
    } else {
      window.addEventListener('resize', schedule, { passive: true });
    }
  }
  function bootGlassStep() {
    const t0 = performance.now();
    while (bootIndex < cards.length && performance.now() - t0 < 12) {
      refresh(cards[bootIndex++]);
    }
    if (bootIndex < cards.length) {
      if (window.requestIdleCallback) requestIdleCallback(bootGlassStep);
      else setTimeout(bootGlassStep, 40);
      return;
    }
    renderHousing();
    booted = true;
    watchResizes();
    refreshAll(); // catch-up pass: no-op for measured cards, picks up any mid-boot reflow
  }
  if (window.requestIdleCallback) requestIdleCallback(bootGlassStep, { timeout: 2500 });
  else setTimeout(bootGlassStep, 250);

  // Late reflows still refresh every card at once — but only after the
  // staged first pass, otherwise the bake is already handling it.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (booted) refreshAll(); });
  window.addEventListener('load', () => { if (booted) refreshAll(); });

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
   Geometry comes from KazuLib (lib.js);
   local fallbacks keep it alive if lib.js fails.
   ========================================================================== */
(() => {
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches || window.innerWidth <= 768) return;

  const KazuLib = window.KazuLib;
  // Owned by lib.js (single source of truth); local copies below.
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
  //
  // Incremental, because the sweep used to be the heaviest thing the page did
  // at rest: it visited EVERY element (~1,000: an ancestor walk and two layout
  // reads each) after ANY DOM mutation, and the once-a-second clock text swap
  // is a mutation. Measured ~9 ms of main thread, every second, for as long as
  // the page was open: a dropped frame a second on a 144 Hz display. Now a
  // mutation only queues what it could have changed: the elements it ADDED
  // (with their subtrees) and the changed element's own ancestors (a modal
  // body is injected INTO an already-present, fixed-height panel). A pure text
  // swap queues nothing. load and resize still run one full sweep, debounced.
  const attached = new WeakSet();
  let scanRaf = 0, scanFull = false, scanResizeTimer = 0;
  const scanSelf = new Set();   // check just these elements
  const scanDeep = new Set();   // check these elements and everything inside them
  function considerScroller(el) {
    if (attached.has(el) || el.closest('.cscroll')) return;
    // Cheap reject first: only an overflowing element can need a bar. The
    // scrollHeight/clientHeight reads batch into a single layout pass (no
    // writes between them), while getComputedStyle forces a style recalc
    // PER ELEMENT — so the expensive check only runs on a handful of
    // candidates. Elements that only start overflowing later are caught by the
    // next structural mutation / load / resize scan; until then they'd have
    // shown a self-hidden bar anyway, so nothing visible changes.
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
  }
  function scan() {
    scanRaf = 0;
    if (scanFull) {
      scanFull = false;
      scanSelf.clear(); scanDeep.clear();
      document.querySelectorAll('*').forEach(considerScroller);
      return;
    }
    scanSelf.forEach((el) => { if (el.isConnected) considerScroller(el); });
    scanDeep.forEach((el) => {
      if (!el.isConnected) return;
      considerScroller(el);
      el.querySelectorAll('*').forEach(considerScroller);
    });
    scanSelf.clear(); scanDeep.clear();
  }
  const scheduleScan = (full) => {
    if (full === true) scanFull = true;
    if (!scanRaf) scanRaf = requestAnimationFrame(scan);
  };
  function onScanMutations(records) {
    let queued = false;
    for (const r of records) {
      let structural = false;
      r.addedNodes.forEach((n) => { if (n.nodeType === 1) { scanDeep.add(n); structural = true; } });
      if (!structural) r.removedNodes.forEach((n) => { if (n.nodeType === 1) structural = true; });
      if (!structural) continue; // a text swap (the clock) cannot create or move a scroller
      for (let el = r.target; el && el.nodeType === 1; el = el.parentElement) scanSelf.add(el);
      queued = true;
    }
    if (queued) scheduleScan();
  }
  if ('MutationObserver' in window) {
    new MutationObserver(onScanMutations).observe(document.body, { childList: true, subtree: true });
  }
  // First sweep once the page is idle: nothing overflows at load (the pop-up is
  // hidden) and the window bar above is already built, so it need not hold up
  // the first frames.
  if (window.requestIdleCallback) requestIdleCallback(() => scheduleScan(true), { timeout: 2000 });
  else setTimeout(() => scheduleScan(true), 300);
  window.addEventListener('load', () => scheduleScan(true));
  window.addEventListener('resize', () => {
    clearTimeout(scanResizeTimer);
    scanResizeTimer = setTimeout(() => scheduleScan(true), 150); // not once per frame of a window drag
  }, { passive: true });
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
   The maths lives in lib.js (wheelDeltaPx, smoothScrollStep);
   local fallbacks keep it alive if lib.js fails to load.
   ========================================================================== */
(() => {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Low-power mode: native scrolling is cheaper than a per-frame lerp loop.
  if (document.body.classList.contains('low-power')) return;

  const KazuLib = window.KazuLib;
  // Owned by lib.js (single source of truth); local copies below.
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

  // The header links and "Back to top" are plain #anchors; the wheel loop owns the
  // scroll position, so a native jump is overwritten. Glide through the loop instead.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('.site-header a[href^="#"], .footer-top');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute('href').slice(1);
    const el = id && id !== 'top' ? document.getElementById(id) : null;
    if (id && id !== 'top' && !el) return;
    e.preventDefault();
    const y = el ? el.getBoundingClientRect().top + window.scrollY - 16 : 0;
    if (window.kazuSmoothScrollTo) window.kazuSmoothScrollTo(y);
    else window.scrollTo({ top: y, behavior: 'smooth' });
  });

  // Scroll-anchor adjustments (layout shifts above the fold) move the resting
  // point too: pre-seed lastWritten with the value the write will produce, so
  // the scroll listener reads it as one of the loop's own writes and an
  // active glide adjusts its target instead of cancelling as external input.
  window.kazuScrollAdjust = (delta) => {
    const y = Math.min(Math.max(window.scrollY + delta, 0), maxScroll());
    targetY = Math.min(Math.max(targetY + delta, 0), maxScroll());
    lastWritten = y;
    window.scrollTo({ top: y, behavior: 'instant' });
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
