/* ============================================================================
   lib.js — pure, DOM-free helpers for Kazu Hub's detail modals.
   ----------------------------------------------------------------------------
   Single source of truth for the birth config plus every deterministic
   calculation behind the four card pop-ups (timezone/DST, age, birthday
   countdown, life-in-weeks, calendar export). No `document`, no `fetch` — so
   it can be unit-tested in isolation (see tests.html) and reused by script.js.
   Exposed as `KazuLib` on the global (window in the browser, globalThis in Node).
   ========================================================================== */
(function (global) {
  'use strict';

  // 0-indexed month: 10 = November. Kazu was born 9 November 2001.
  var BIRTH = { year: 2001, month: 10, day: 9 };
  var TIMEZONE = 'Europe/London';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // Escape the five HTML-special chars so API-sourced strings (Steam game
  // names, etc.) can be interpolated into innerHTML without breaking markup
  // or injecting elements.
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- UK wall clock -------------------------------------------------------
  // Age/birthday maths run in the Europe/London wall-clock frame, not the
  // visitor's local frame: Kazu's birthday starts at midnight in the UK,
  // whatever timezone the page is viewed from. Wall-clock components come
  // from Intl; calendar arithmetic happens in a fake-UTC frame so a "day" is
  // always exactly 86400s and results are identical on any machine.
  var dtfUK = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  });

  // { year, month (0-indexed), day, hours, minutes, seconds } on the UK clock.
  function ukWallParts(date) {
    date = date || new Date();
    var parts = dtfUK.formatToParts(date);
    var o = {};
    for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
    return {
      year: +o.year, month: +o.month - 1, day: +o.day,
      hours: (+o.hour) % 24, // some ICU builds report midnight as 24
      minutes: +o.minute, seconds: +o.second,
    };
  }

  // The same instant expressed as milliseconds in the fake-UTC wall frame.
  function ukWallMs(date) {
    var w = ukWallParts(date);
    return Date.UTC(w.year, w.month, w.day, w.hours, w.minutes, w.seconds);
  }

  var BIRTH_WALL_MS = Date.UTC(BIRTH.year, BIRTH.month, BIRTH.day, 0, 0, 0);

  // ---- UK daylight saving (BST/GMT) -------------------------------------
  // UK clocks change on the last Sunday of March (forward, BST begins) and the
  // last Sunday of October (back, GMT returns). Both transitions happen at the
  // same absolute instant: 01:00 UTC.

  // Midnight-UTC of the last Sunday in the given month.
  function lastSundayOfMonth(year, monthIndex) {
    var d = new Date(Date.UTC(year, monthIndex + 1, 0)); // day 0 of next month = last day
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());         // back up to Sunday (getUTCDay 0 = Sun)
    return d;
  }

  // The exact UTC instant the UK clocks change in the given month.
  function ukTransitionInstant(year, monthIndex) {
    var s = lastSundayOfMonth(year, monthIndex);
    return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 1, 0, 0));
  }

  function isUkBST(date) {
    date = date || new Date();
    var y = date.getUTCFullYear();
    return date >= ukTransitionInstant(y, 2) && date < ukTransitionInstant(y, 9);
  }

  // The next clock change relative to `now`, with which way the clocks move.
  function nextUkDstTransition(now) {
    now = now || new Date();
    var y = now.getUTCFullYear();
    var marchForward = ukTransitionInstant(y, 2);
    var octoberBack = ukTransitionInstant(y, 9);
    if (now < marchForward) return { date: marchForward, direction: 'forward', deltaHours: 1 };
    if (now < octoberBack) return { date: octoberBack, direction: 'back', deltaHours: 1 };
    return { date: ukTransitionInstant(y + 1, 2), direction: 'forward', deltaHours: 1 };
  }

  // ---- Age ---------------------------------------------------------------
  function ageBreakdown(now) {
    now = now || new Date();
    var w = ukWallParts(now);

    var years = w.year - BIRTH.year;
    var months = w.month - BIRTH.month;
    var days = w.day - BIRTH.day;
    if (days < 0) {
      months--;
      days += new Date(Date.UTC(w.year, w.month, 0)).getUTCDate(); // days in previous month
    }
    if (months < 0) { years--; months += 12; }

    var msAlive = ukWallMs(now) - BIRTH_WALL_MS;
    var totalDays = Math.floor(msAlive / 86400000);
    var totalWeeks = Math.floor(totalDays / 7);
    var totalHours = Math.floor(msAlive / 3600000);
    var nextMilestoneDays = (Math.floor(totalDays / 1000) + 1) * 1000;
    var nextMilestoneOn = new Date(BIRTH_WALL_MS + nextMilestoneDays * 86400000); // wall frame: format with timeZone:'UTC'
    var heartbeats = Math.floor((msAlive / 60000) * 72); // ~72 bpm
    // Playful equivalents for the age pop-up — rough average rates, but
    // deterministic: same instant, same numbers, on any machine.
    var daysAlive = msAlive / 86400000;
    var orbits = daysAlive / 365.2422;                  // tropical years = laps of the Sun

    return {
      years: years, months: months, days: days,
      totalDays: totalDays, totalWeeks: totalWeeks, totalHours: totalHours,
      nextMilestoneDays: nextMilestoneDays, nextMilestoneOn: nextMilestoneOn,
      heartbeats: heartbeats,
      fullMoons: Math.floor(daysAlive / 29.530589),     // mean synodic month
      orbits: orbits,
      asleepYears: orbits / 3,                          // ~8 h/day = a third of life
      breaths: Math.floor((msAlive / 60000) * 16),      // ~16 breaths/min at rest
    };
  }

  // ---- Birthday countdown ------------------------------------------------
  function birthdayCountdownParts(now) {
    now = now || new Date();
    var w = ukWallParts(now);
    var age = w.year - BIRTH.year;
    var hadBday = (w.month > BIRTH.month) || (w.month === BIRTH.month && w.day >= BIRTH.day);
    if (!hadBday) age--;

    var target = Date.UTC(w.year, BIRTH.month, BIRTH.day, 0, 0, 0);
    var todayMid = Date.UTC(w.year, w.month, w.day);
    if (todayMid > target) target = Date.UTC(w.year + 1, BIRTH.month, BIRTH.day, 0, 0, 0);

    var totalSec = Math.max(0, Math.floor((target - ukWallMs(now)) / 1000));
    return {
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      calDays: Math.round((target - todayMid) / 86400000), // whole calendar days, matches the card
      targetDate: new Date(target), // wall frame: read with UTC getters / timeZone:'UTC'
      ageNow: age,     // current age (on the birthday itself, the age just turned)
      turning: age + 1, // age at the upcoming birthday (next year's, on the day itself)
      isToday: (w.month === BIRTH.month && w.day === BIRTH.day),
    };
  }

  // ---- Star sign + birth facts ------------------------------------------
  function zodiac(monthIndex, day) {
    var m = monthIndex + 1; // 1-based
    var cutoffs = [20, 19, 20, 20, 21, 21, 22, 23, 23, 23, 22, 22]; // last day of the "earlier" sign per month
    var names = ['Capricorn', 'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn'];
    var glyphs = ['♑', '♒', '♓', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑'];
    var idx = (day <= cutoffs[m - 1]) ? (m - 1) : m;
    return { name: names[idx], glyph: glyphs[idx] };
  }

  function birthFacts() {
    var birth = new Date(BIRTH_WALL_MS); // wall frame: format with timeZone:'UTC'
    var z = zodiac(BIRTH.month, BIRTH.day);
    return {
      starSign: z.name,
      starGlyph: z.glyph,
      weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(birth),
      dateLabel: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(birth),
    };
  }

  // ---- Calendar export ---------------------------------------------------
  function ymd(year, monthIndex, day) { return '' + year + pad(monthIndex + 1) + pad(day); }

  // A yearly, all-day VEVENT with a one-day-before reminder. CRLF line endings
  // per RFC 5545. Imports into Apple Calendar, Outlook, Google, etc.
  function buildBirthdayICS(opts) {
    opts = opts || {};
    var summary = opts.summary || "Kazu's Birthday";
    var year = opts.year || BIRTH.year;
    var start = ymd(year, BIRTH.month, BIRTH.day);
    var endDate = new Date(year, BIRTH.month, BIRTH.day + 1); // DTEND is exclusive
    var end = ymd(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    var uid = 'kazu-bday-' + ymd(BIRTH.year, BIRTH.month, BIRTH.day) + '@kazuhub';
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kazu Hub//Birthday//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + start + 'T000000Z',
      'DTSTART;VALUE=DATE:' + start,
      'DTEND;VALUE=DATE:' + end,
      'RRULE:FREQ=YEARLY',
      'SUMMARY:' + summary,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + summary,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  // Pre-filled Google Calendar event-create URL (all-day, yearly recurrence).
  function googleCalendarUrl(opts) {
    opts = opts || {};
    var summary = opts.summary || "Kazu's Birthday";
    // Wall-frame date (see birthdayCountdownParts): read via UTC getters so the
    // all-day event lands on 9 November no matter the viewer's timezone.
    var date = opts.date || birthdayCountdownParts(new Date()).targetDate;
    var start = ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    var endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    var end = ymd(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
    var params = [
      'action=TEMPLATE',
      'text=' + encodeURIComponent(summary),
      'dates=' + start + '/' + end,
      'recur=' + encodeURIComponent('RRULE:FREQ=YEARLY'),
    ];
    if (opts.details) params.push('details=' + encodeURIComponent(opts.details));
    return 'https://calendar.google.com/calendar/render?' + params.join('&');
  }

  // ---- Weather globe -----------------------------------------------------
  // earth.nullschool.net orthographic (3D globe) view, centred on the UK.
  function nullschoolUrl(opts) {
    opts = opts || {};
    var lon = (opts.lon != null ? opts.lon : -2.5);
    var lat = (opts.lat != null ? opts.lat : 54.5);
    var zoom = (opts.zoom != null ? opts.zoom : 2800);
    return 'https://earth.nullschool.net/#current/wind/surface/level/orthographic=' +
      lon.toFixed(2) + ',' + lat.toFixed(2) + ',' + zoom;
  }

  // ---- Open-Meteo request URL ----------------------------------------------
  // One builder for both weather fetches (card + "your sky" compare), so the
  // param list lives in exactly one place. includeDaily=false fetches the
  // current block only (used by the visitor-side compare call, which needs no
  // 5-day strip).
  function openMeteoUrl(lat, lon, includeDaily) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code,wind_speed_10m,is_day';
    if (includeDaily !== false) {
      url += '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&forecast_days=5&timezone=Europe%2FLondon';
    }
    return url;
  }

  // ---- Weather-reactive atmosphere ----------------------------------------
  // Maps an Open-Meteo weather code to the ambient particle mode:
  //   'rain'          drizzle / rain / showers / thunderstorm
  //   'blossom-heavy' actually snowing right now (heavier than the default)
  //   'aurora'        clear or mainly clear AFTER DARK (northern lights + stars)
  //   'blossom'       the cherry-blossom default for everything else
  // isDay comes from Open-Meteo's is_day flag (true/false); when omitted the
  // day/night split is skipped and clear skies stay on plain blossoms,
  // matching the pre-aurora behaviour.
  function atmosphereMode(weatherCode, isDay) {
    var c = +weatherCode;
    if (isNaN(c)) return 'blossom';
    if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'blossom-heavy';
    if ((c === 0 || c === 1) && isDay === false) return 'aurora';
    return 'blossom';
  }

  // Ambient particle density, scaled to the device. Every petal/drop animates
  // UNDER the liquid-glass cards, so each one keeps waking their
  // backdrop-filter — fine on a desktop GPU, real frame time on a phone. The
  // feature is untouched (it still rains/drifts petals); weak devices just
  // get a lighter drift. `o` flags: coarsePointer, smallScreen,
  // lowConcurrency, saveData — any true flag picks the reduced count.
  function particleCount(base, o) {
    var n = Math.round(+base);
    if (isNaN(n) || n <= 0) return 0;
    o = o || {};
    var light = !!(o.coarsePointer || o.smallScreen || o.lowConcurrency || o.saveData);
    if (light) n = Math.round(n * 0.6);
    return Math.min(64, Math.max(8, n));
  }

  // ---- Sky body (sun/moon arc) ---------------------------------------------
  // The scenery layer's celestial body: the sun by day, the moon by night,
  // both travelling the same arc — rising at the left edge of the page,
  // climbing to the top of the sky, setting at the right edge. Timed to the
  // Europe/London wall clock (script.js feeds in ukWallParts).

  // Approximate Aberystwyth sunrise/sunset in UK wall minutes from the day of
  // year: a sinusoid between the solstices (21 Jun ≈ 05:00–21:30, 21 Dec ≈
  // 08:15–16:00). Ambience, not an ephemeris — always within ~20 min of the
  // real almanac times. Junk input falls back to the summer solstice.
  function sunTimesUK(dayOfYear) {
    var d = Math.round(+dayOfYear);
    if (isNaN(d) || d < 1 || d > 366) d = 172;
    var w = 2 * Math.PI * (d - 172) / 365;
    return {
      rise: Math.round(397.5 - 97.5 * Math.cos(w)),
      set: Math.round(1125 + 165 * Math.cos(w)),
    };
  }

  // Where the sky body sits at `ukMinutes` (minutes since UK midnight).
  // Returns { body, x, y, alt, low }: x/y are % offsets inside the scenery
  // layer, alt the 0..1 height along the arc (1 = top of the sky), low flags
  // near-horizon positions for golden-hour styling. Junk time input yields
  // null so the page keeps whatever it is already showing.
  function skyBodyState(ukMinutes, dayOfYear) {
    var t = +ukMinutes;
    if (isNaN(t)) return null;
    t = ((t % 1440) + 1440) % 1440;
    var st = sunTimesUK(dayOfYear);
    var dayLen = st.set - st.rise;
    var isSun = t >= st.rise && t < st.set;
    var p = isSun ? (t - st.rise) / dayLen
                  : ((((t - st.set) % 1440) + 1440) % 1440) / (1440 - dayLen);
    var alt = Math.sin(Math.PI * p);
    return {
      body: isSun ? 'sun' : 'moon',
      x: +(6 + p * 88).toFixed(2),
      y: +(52 - alt * 40).toFixed(2),
      alt: +alt.toFixed(3),
      low: alt < 0.28,
    };
  }

  // ---- 5-day forecast strip ------------------------------------------------
  // Shapes an Open-Meteo `daily` block (day-aligned to Europe/London via the
  // request's timezone param) into rows for the weather modal's strip. The
  // first row is labelled 'Today'. Tolerant of missing arrays and values.
  function forecastRows(daily, limit) {
    if (!daily || !daily.time || !daily.time.length) return [];
    var n = Math.min(limit || 5, daily.time.length);
    var fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
    var rows = [];
    for (var i = 0; i < n; i++) {
      var p = String(daily.time[i]).split('-'); // 'YYYY-MM-DD': split, never Date-parse (TZ traps)
      var code = daily.weather_code ? daily.weather_code[i] : null;
      var max = daily.temperature_2m_max ? daily.temperature_2m_max[i] : null;
      var min = daily.temperature_2m_min ? daily.temperature_2m_min[i] : null;
      var precip = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
      rows.push({
        label: i === 0 ? 'Today' : fmtDay.format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]))),
        code: (typeof code === 'number') ? code : null,
        maxC: (typeof max === 'number') ? Math.round(max) : null,
        minC: (typeof min === 'number') ? Math.round(min) : null,
        precipPct: (typeof precip === 'number') ? Math.round(precip) : null,
      });
    }
    return rows;
  }

  // ---- Steam store links ---------------------------------------------------
  // Extracts the appid from any Steam URL shape (store page, community /app/
  // page, or CDN image path) and builds the canonical store page URL.
  function steamAppId(url) {
    var m = /\/apps?\/(\d{1,9})\b/.exec(String(url || ''));
    return m ? m[1] : null;
  }
  function steamStoreUrl(url) {
    var id = steamAppId(url);
    return id ? 'https://store.steampowered.com/app/' + id : null;
  }

  // ---- Steam software filter + hours line ----------------------------------
  // The profile XML carries no game/software flag, and Steam's own store API
  // mislabels tools like SteamVR and Wallpaper Engine as type "game", so no
  // remote lookup separates games from software. This hand-maintained
  // denylist of well-known software appids (each verified against the store
  // API) is the only reliable filter. steamIsSoftware accepts any Steam URL
  // shape steamAppId understands.
  var STEAM_SOFTWARE_IDS = {
    '250820': 1,   // SteamVR
    '431960': 1,   // Wallpaper Engine
    '629520': 1,   // Soundpad
    '1905180': 1,  // OBS Studio
    '431730': 1,   // Aseprite
    '365670': 1,   // Blender
    '274920': 1,   // FaceRig
    '363890': 1,   // RPG Maker MV
    '220700': 1,   // RPG Maker VX Ace
    '993090': 1,   // Lossless Scaling
    '382110': 1,   // Virtual Desktop Classic
    '908520': 1,   // fpsVR
    '1009850': 1,  // OVR Advanced Settings
    '1325860': 1,  // VTube Studio
    '1068820': 1,  // OVR Toolkit
    '1173510': 1,  // XSOverlay
    '1494460': 1,  // Desktop+
    '665300': 1,   // Stream Avatars
  };
  function steamIsSoftware(url) {
    var id = steamAppId(url);
    return id ? !!STEAM_SOFTWARE_IDS[id] : false;
  }

  // Steam's profile XML reports each mostPlayedGame's hoursPlayed (past two
  // weeks — the only recent figure Steam publishes) and hoursOnRecord (all
  // time). Renders both on one line; collapses to a single figure when they
  // agree or only one is present.
  function steamHoursText(hoursPlayed, hoursOnRecord) {
    var recent = (typeof hoursPlayed === 'number' && hoursPlayed > 0) ? hoursPlayed : 0;
    var total = (typeof hoursOnRecord === 'number' && hoursOnRecord > 0) ? hoursOnRecord : 0;
    var fmt = function (n) { return n % 1 === 0 ? String(n) : n.toFixed(1); };
    if (recent && total && Math.round(recent * 10) !== Math.round(total * 10)) {
      return fmt(recent) + ' hrs last 2 wks · ' + fmt(total) + ' hrs total';
    }
    if (total) return fmt(total) + ' hrs total';
    if (recent) return fmt(recent) + ' hrs last 2 wks';
    return 'played';
  }

  // ---- MyAnimeList (Jikan) -------------------------------------------------
  // Extracts one Jikan GET /users/{name}/animelist entry into the flat shape
  // the MAL card renders. Tolerant of missing fields (Jikan omits
  // title_english, episodes and images for some entries). Returns null when
  // the entry carries no usable anime.
  function malRow(entry) {
    var a = entry && entry.anime;
    if (!a || !(a.title_english || a.title)) return null;
    var watched = (typeof entry.episodes_watched === 'number' && entry.episodes_watched >= 0) ? entry.episodes_watched : 0;
    var total = (typeof a.episodes === 'number' && a.episodes > 0) ? a.episodes : null;
    var img = (a.images && a.images.jpg && (a.images.jpg.small_image_url || a.images.jpg.image_url)) || '';
    return {
      url: a.url || (a.mal_id ? 'https://myanimelist.net/anime/' + a.mal_id : 'https://myanimelist.net'),
      title: a.title_english || a.title,
      watched: watched,
      total: total, // null = episode count unknown (usually still airing)
      pct: total ? Math.min(100, Math.round((watched / total) * 100)) : 0,
      img: img,
    };
  }

  // Extracts one entry of MAL's own GET /animelist/{user}/load.json payload
  // into the same flat shape as malRow. That endpoint is what myanimelist.net
  // itself calls to render the list page, so it keeps answering when Jikan's
  // scrape of the same data is refused (Jikan user endpoints 504 for weeks
  // at a time). MAL sends no Access-Control-Allow-Origin, so the site reaches
  // it through the same CORS proxy the Steam card uses.
  function malListRow(entry) {
    if (!entry) return null;
    var title = entry.anime_title_eng || entry.anime_title;
    if (!title) return null;
    var id = (typeof entry.anime_id === 'number' && entry.anime_id > 0) ? entry.anime_id : null;
    var watched = (typeof entry.num_watched_episodes === 'number' && entry.num_watched_episodes >= 0) ? entry.num_watched_episodes : 0;
    var total = (typeof entry.anime_num_episodes === 'number' && entry.anime_num_episodes > 0) ? entry.anime_num_episodes : null;
    return {
      url: id ? 'https://myanimelist.net/anime/' + id : 'https://myanimelist.net',
      title: title,
      watched: watched,
      total: total, // null = episode count unknown (usually still airing)
      pct: total ? Math.min(100, Math.round((watched / total) * 100)) : 0,
      img: typeof entry.anime_image_path === 'string' ? entry.anime_image_path : '',
    };
  }

  // Reads the localStorage fallback copy of the MAL card (written after every
  // successful fetch). Jikan's user endpoints 504 whenever MyAnimeList refuses
  // its scraper, so the card renders the last good rows instead of an error
  // when the live fetch fails. Returns the sanitized rows array (possibly
  // empty) for a well-formed payload, null for anything else — a corrupt or
  // hand-edited cache must behave like no cache at all.
  function malCacheParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    if (!payload || !Array.isArray(payload.rows)) return null;
    var rows = [];
    for (var i = 0; i < payload.rows.length; i++) {
      var r = payload.rows[i];
      if (!r || typeof r.title !== 'string' || !r.title) return null;
      if (typeof r.url !== 'string' || !r.url) return null;
      var total = (typeof r.total === 'number' && r.total > 0) ? r.total : null;
      var watched = (typeof r.watched === 'number' && r.watched >= 0) ? r.watched : 0;
      rows.push({
        url: r.url,
        title: r.title,
        watched: watched,
        total: total,
        pct: total ? Math.min(100, Math.round((watched / total) * 100)) : 0,
        img: typeof r.img === 'string' ? r.img : '',
      });
    }
    return rows;
  }

  // ---- MyAnimeList manga (Jikan) -------------------------------------------
  // Same shape as malRow but for the mangalist: chapters instead of episodes.
  // `read` mirrors malRow's `watched` so the card renderer can treat both
  // kinds of rows alike.
  function malMangaRow(entry) {
    var m = entry && entry.manga;
    if (!m || !(m.title_english || m.title)) return null;
    var read = (typeof entry.chapters_read === 'number' && entry.chapters_read >= 0) ? entry.chapters_read : 0;
    var total = (typeof m.chapters === 'number' && m.chapters > 0) ? m.chapters : null;
    var img = (m.images && m.images.jpg && (m.images.jpg.small_image_url || m.images.jpg.image_url)) || '';
    return {
      url: m.url || (m.mal_id ? 'https://myanimelist.net/manga/' + m.mal_id : 'https://myanimelist.net'),
      title: m.title_english || m.title,
      read: read,
      total: total, // null = chapter count unknown (usually still publishing)
      pct: total ? Math.min(100, Math.round((read / total) * 100)) : 0,
      img: img,
    };
  }

  // MAL's own GET /mangalist/{user}/load.json fallback (see malListRow for why
  // this endpoint exists). Manga entries carry no *_title_eng field, so the
  // romaji title is the only one available.
  function malMangaListRow(entry) {
    if (!entry) return null;
    var title = entry.manga_title;
    if (!title) return null;
    var id = (typeof entry.manga_id === 'number' && entry.manga_id > 0) ? entry.manga_id : null;
    var read = (typeof entry.num_read_chapters === 'number' && entry.num_read_chapters >= 0) ? entry.num_read_chapters : 0;
    var total = (typeof entry.manga_num_chapters === 'number' && entry.manga_num_chapters > 0) ? entry.manga_num_chapters : null;
    return {
      url: id ? 'https://myanimelist.net/manga/' + id : 'https://myanimelist.net',
      title: title,
      read: read,
      total: total,
      pct: total ? Math.min(100, Math.round((read / total) * 100)) : 0,
      img: typeof entry.manga_image_path === 'string' ? entry.manga_image_path : '',
    };
  }

  // localStorage fallback copy of the manga rows (separate key from the anime
  // cache so a corrupt hand edit in one can't take out the other). Same
  // contract as malCacheParse: sanitized rows array, or null for anything
  // malformed.
  function malMangaCacheParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    if (!payload || !Array.isArray(payload.rows)) return null;
    var rows = [];
    for (var i = 0; i < payload.rows.length; i++) {
      var r = payload.rows[i];
      if (!r || typeof r.title !== 'string' || !r.title) return null;
      if (typeof r.url !== 'string' || !r.url) return null;
      var total = (typeof r.total === 'number' && r.total > 0) ? r.total : null;
      var read = (typeof r.read === 'number' && r.read >= 0) ? r.read : 0;
      rows.push({
        url: r.url,
        title: r.title,
        read: read,
        total: total,
        pct: total ? Math.min(100, Math.round((read / total) * 100)) : 0,
        img: typeof r.img === 'string' ? r.img : '',
      });
    }
    return rows;
  }

  // ---- Letterboxd (diary RSS) ----------------------------------------------
  // Letterboxd publishes a diary RSS feed at /{user}/rss/ with one <item> per
  // logged film, carrying letterboxd:* extension tags with the structured
  // bits (film title, year, member rating 0.5-5, watched date, rewatch flag).
  // The feed is parsed with regexes, not DOMParser: lib.js stays DOM-free so
  // these tests run headless in Node.

  // Numeric member rating → star glyphs: 3.5 → '★★★½'. 0/null/NaN → ''.
  function ratingStars(n) {
    n = +n;
    if (!(n > 0)) return '';
    var full = Math.floor(n);
    var s = '';
    for (var i = 0; i < full; i++) s += '★';
    if (n - full >= 0.5) s += '½';
    return s;
  }

  // '2026-07-13' → '13 Jul 2026'. String-split only (Date-parsing an ISO day
  // is a timezone trap). Anything not ISO-shaped comes back unchanged.
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function letterboxdWatchedLabel(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    return String(+m[3]) + ' ' + MONTH_SHORT[+m[2] - 1] + ' ' + m[1];
  }

  // First-tag-content helper tolerating both plain text and CDATA wrappers.
  function rssPick(item, tag) {
    var m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(item);
    if (!m) return '';
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  }

  // Extracts the most recent diary entry (first <item>) from a Letterboxd RSS
  // document. Returns null when the feed has no usable entry. Poster comes
  // from the first <img> inside the description CDATA (Letterboxd always puts
  // the film poster there); missing poster → ''.
  function parseLetterboxdRss(xml) {
    if (typeof xml !== 'string' || xml.indexOf('<item>') === -1) return null;
    var item = /<item>([\s\S]*?)<\/item>/.exec(xml)[1];
    var title = rssPick(item, 'letterboxd:filmTitle');
    var year = rssPick(item, 'letterboxd:filmYear');
    var rating = parseFloat(rssPick(item, 'letterboxd:memberRating'));
    // Older entries predate the extension tags: fall back to the item <title>,
    // shaped like "Some Film, 2024 - ★★★½" (rating suffix optional).
    if (!title) {
      var raw = rssPick(item, 'title');
      var tm = /^(.*), (\d{4})(?: - [★½]+)?$/.exec(raw);
      if (!tm) return null;
      title = tm[1];
      if (!year) year = tm[2];
    }
    if (!title) return null;
    var link = rssPick(item, 'link');
    if (!link) return null;
    var desc = rssPick(item, 'description');
    var imgM = /<img[^>]+src="([^"]+)"/.exec(desc);
    var watchedRaw = rssPick(item, 'letterboxd:watchedDate');
    return {
      title: title,
      year: /^\d{4}$/.test(year) ? year : null,
      rating: (rating > 0 && rating <= 5) ? rating : null,
      stars: ratingStars(rating),
      link: link,
      poster: imgM ? imgM[1] : '',
      watched: watchedRaw ? letterboxdWatchedLabel(watchedRaw) : '',
      rewatch: /^yes$/i.test(rssPick(item, 'letterboxd:rewatch')),
    };
  }

  // localStorage fallback copy of the Letterboxd row, same contract as
  // malCacheParse: sanitized entry or null.
  function letterboxdCacheParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    var e2 = payload && payload.entry;
    if (!e2 || typeof e2.title !== 'string' || !e2.title) return null;
    if (typeof e2.link !== 'string' || !e2.link) return null;
    var rating = (typeof e2.rating === 'number' && e2.rating > 0 && e2.rating <= 5) ? e2.rating : null;
    return {
      title: e2.title,
      year: (typeof e2.year === 'string' && /^\d{4}$/.test(e2.year)) ? e2.year : null,
      rating: rating,
      stars: ratingStars(rating),
      link: e2.link,
      poster: typeof e2.poster === 'string' ? e2.poster : '',
      watched: typeof e2.watched === 'string' ? e2.watched : '',
      rewatch: e2.rewatch === true,
    };
  }

  // ---- ListenBrainz (music card recent tracks) ------------------------------
  // Shapes one GET /1/user/{user}/listens entry into a flat row. Tolerant of
  // missing metadata; returns null when there's no track name. `url` prefers
  // the Spotify track link ListenBrainz attaches when it can match one.
  function listenbrainzRow(listen) {
    var tm = listen && listen.track_metadata;
    if (!tm || typeof tm.track_name !== 'string' || !tm.track_name) return null;
    var info = tm.additional_info || {};
    return {
      name: tm.track_name,
      artist: typeof tm.artist_name === 'string' ? tm.artist_name : '',
      playingNow: listen.playing_now === true,
      url: typeof info.spotify_id === 'string' ? info.spotify_id : '',
    };
  }

  // ---- YouTube Music playlist (Atom feed) -----------------------------------
  // Every public YouTube playlist publishes an Atom feed at
  // /feeds/videos.xml?playlist_id={id} with one <entry> per video, most
  // recently added first (YouTube caps it at 15). That feed is what keeps the
  // music card's "From the playlist" rows in step with the real playlist: add
  // a song in YouTube Music and it shows up here on the next poll. Parsed
  // with regexes like the Letterboxd feed so the tests stay headless.

  // Atom text is XML-escaped; decode it back to plain text (escapeHtml
  // re-escapes at render time, so without this '&' would show as '&amp;').
  function xmlText(s) {
    return String(s || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // Music uploads come from auto-generated/VEVO channels whose names carry
  // furniture the card doesn't want: 'Shadow Bass King - Topic' → 'Shadow
  // Bass King', 'UsherVEVO' → 'Usher'.
  function ytArtistName(name) {
    return xmlText(name).replace(/ - Topic$/i, '').replace(/VEVO$/, '').trim();
  }

  // Feed XML → flat rows { id, title, artist }, newest addition first. Rows
  // without a usable title are dropped, and the video id must match
  // YouTube's exact 11-char alphabet — it's interpolated into a href later,
  // so anything malformed/hostile is refused here instead of escaped there.
  function parseYouTubePlaylistRss(xml) {
    if (typeof xml !== 'string' || xml.indexOf('<entry>') === -1) return [];
    var entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    var rows = [];
    for (var i = 0; i < entries.length; i++) {
      var id = rssPick(entries[i], 'yt:videoId');
      var title = xmlText(rssPick(entries[i], 'title'));
      if (!/^[A-Za-z0-9_-]{11}$/.test(id) || !title) continue;
      rows.push({ id: id, title: title, artist: ytArtistName(rssPick(entries[i], 'name')) });
    }
    return rows;
  }

  // localStorage fallback copy of the playlist rows, same contract as
  // malCacheParse: sanitized rows or null.
  function ytPlaylistCacheParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    if (!payload || !Array.isArray(payload.rows)) return null;
    var rows = [];
    for (var i = 0; i < payload.rows.length; i++) {
      var r = payload.rows[i];
      if (!r || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(r.id)) return null;
      if (typeof r.title !== 'string' || !r.title) return null;
      rows.push({ id: r.id, title: r.title, artist: typeof r.artist === 'string' ? r.artist : '' });
    }
    return rows;
  }

  // ---- TTL cache freshness -------------------------------------------------
  // Shared by the weather card's localStorage snapshot (kazu-weather-cache):
  // an {at: epochMs} entry counts as fresh only inside its TTL window — and
  // never when the stamp is in the future (clock skew). Pure maths, so the
  // gate tests pin the boundaries; `now` is injectable for exactly that.
  function cacheFresh(at, ttlMs, now) {
    if (typeof at !== 'number' || typeof ttlMs !== 'number') return false;
    var t = (typeof now === 'number') ? now : Date.now();
    return t - at >= 0 && t - at < ttlMs;
  }

  // ---- Konami code easter egg ----------------------------------------------
  // The classic ↑↑↓↓←→←→BA. script.js keeps a rolling window of recent keys
  // and asks this whether the window ENDS with the code, so junk typed before
  // the sequence is fine but a wrong key inside it is not.
  var KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  function konamiMatch(recentKeys) {
    if (!recentKeys || recentKeys.length < KONAMI_CODE.length) return false;
    var start = recentKeys.length - KONAMI_CODE.length;
    for (var i = 0; i < KONAMI_CODE.length; i++) {
      if (recentKeys[start + i] !== KONAMI_CODE[i]) return false;
    }
    return true;
  }

  // ---- Dev settings panel (secret code + season overrides) -----------------
  // Typing the code word anywhere on the page opens the floating dev panel
  // (see script.js). Like konamiMatch, script.js keeps a rolling window of
  // recent single-character keys and asks whether the window ENDS with the
  // word; matching is case-insensitive so Caps Lock doesn't lock anyone out.
  var DEV_CODE = 'kazudev';
  function devCodeMatch(recentKeys) {
    if (!recentKeys || recentKeys.length < DEV_CODE.length) return false;
    var start = recentKeys.length - DEV_CODE.length;
    for (var i = 0; i < DEV_CODE.length; i++) {
      var k = recentKeys[start + i];
      if (typeof k !== 'string' || k.toLowerCase() !== DEV_CODE.charAt(i)) return false;
    }
    return true;
  }

  // Season-trigger overrides from the dev panel. Each season is 'auto'
  // (follow the clock — the default, never stored), 'on' (forced live), or
  // 'off' (forced dark). Unknown keys and values are ignored, so a
  // hand-edited localStorage blob can never wedge the seasons.
  var DEV_SEASON_KEYS = ['birthday', 'christmas', 'pride'];
  function seasonDevApply(state, overrides) {
    var s = state || {};
    var out = { birthday: !!s.birthday, christmas: !!s.christmas, pride: !!s.pride };
    overrides = overrides || {};
    for (var i = 0; i < DEV_SEASON_KEYS.length; i++) {
      var k = DEV_SEASON_KEYS[i];
      if (overrides[k] === 'on') out[k] = true;
      else if (overrides[k] === 'off') out[k] = false;
    }
    return out;
  }

  // Reads the localStorage copy of the dev-panel overrides (only 'on'/'off'
  // values are ever stored). Same contract as the other cache parsers: a
  // sanitized object (possibly empty) for a well-formed payload, null for
  // anything malformed.
  function seasonDevParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var p;
    try { p = JSON.parse(raw); } catch (e) { return null; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    var out = {};
    for (var i = 0; i < DEV_SEASON_KEYS.length; i++) {
      var k = DEV_SEASON_KEYS[i];
      if (p[k] === 'on' || p[k] === 'off') out[k] = p[k];
    }
    return out;
  }

  // ---- Birthday balloons (canvas physics core) ------------------------------
  // Pure physics for the balloon canvas; all rendering lives in script.js.
  // The balloon body is a semi-implicit Euler particle (buoyancy + drag +
  // deterministic wind gusts); the string is a verlet rope pinned at the
  // knot. DOM-free so the gate tests can pin the exact behaviour.

  // Advances the balloon one frame. b: {x, y, vx, vy} (mutated, returned).
  // o: {dt (s), t (s since activation), buoy (px/s^2), drag (1/s), windAmp
  // (px/s^2), phase}. Wind is a two-sine gust, fully deterministic: the same
  // inputs always produce the same sky. dt is clamped so a backgrounded tab
  // can't slingshot the balloon on resume. Terminal rise is buoy/drag.
  function balloonDriftStep(b, o) {
    o = o || {};
    var dt = Math.min(Math.max(+o.dt || 0.016, 0), 0.05);
    var t = +o.t || 0;
    var phase = +o.phase || 0;
    var wind = (+o.windAmp || 0) * (Math.sin(2 * Math.PI * 0.11 * t + phase) + 0.5 * Math.sin(2 * Math.PI * 0.23 * t + phase * 1.7));
    b.vx += wind * dt;
    b.vy -= (+o.buoy || 0) * dt; // screen y points down: buoyancy lifts
    var damp = Math.max(0, 1 - (+o.drag || 0) * dt);
    b.vx *= damp; b.vy *= damp;
    b.x += b.vx * dt; b.y += b.vy * dt;
    return b;
  }

  // Advances the string one frame. pts: [{x, y, px, py}, ...] where pts[0] is
  // the knot (pinned to anchor, the balloon's bottom tip). o: {dt (s),
  // gravity (px/s^2), damping (default .985), iterations (default 3),
  // segLen}. Standard verlet: free points integrate from their own history,
  // the knot is re-pinned, then the segment-length constraint relaxes a few
  // times. The trailing wiggle falls out of the physics, no keyframes needed.
  function ropeStep(pts, anchor, o) {
    o = o || {};
    var dt = Math.min(Math.max(+o.dt || 0.016, 0), 0.05);
    var grav = +o.gravity || 0;
    var damp = o.damping == null ? 0.985 : +o.damping;
    var seg = +o.segLen || 9;
    var i, p;
    for (i = 1; i < pts.length; i++) {
      p = pts[i];
      var nx = p.x + (p.x - p.px) * damp;
      var ny = p.y + (p.y - p.py) * damp + grav * dt * dt;
      p.px = p.x; p.py = p.y;
      p.x = nx; p.y = ny;
    }
    pts[0].x = anchor.x; pts[0].y = anchor.y;
    pts[0].px = anchor.x; pts[0].py = anchor.y;
    var it = o.iterations || 3;
    for (var k = 0; k < it; k++) {
      for (i = 0; i < pts.length - 1; i++) {
        var a = pts[i], c = pts[i + 1];
        var dx = c.x - a.x, dy = c.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var diff = (d - seg) / d;
        if (i === 0) { // pinned knot: the free end absorbs the full correction
          c.x -= dx * diff; c.y -= dy * diff;
        } else {
          var half = diff * 0.5;
          a.x += dx * half; a.y += dy * half;
          c.x -= dx * half; c.y -= dy * half;
        }
      }
    }
    return pts;
  }

  // ---- Custom scrollbar geometry -------------------------------------------
  // Pure maths behind the JS-built page scroller (see the custom-scrollbar
  // IIFE in script.js). scrollThumbGeometry maps the document's scroll state
  // onto the on-screen track; scrollThumbScrollY is the inverse mapping used
  // while dragging the thumb. Kept DOM-free so the gate tests can pin the
  // edge cases (min thumb size, clamping, "nothing to scroll").
  var SCROLL_MIN_THUMB = 28; // px: below this the thumb gets too fiddly to grab

  // o: { viewportH, contentH, trackH, scrollY, minThumbH? }
  // → { shown, thumbH, thumbTop, maxScroll } (thumb metrics in track px)
  function scrollThumbGeometry(o) {
    o = o || {};
    var viewportH = Math.max(0, +o.viewportH || 0);
    var contentH = Math.max(0, +o.contentH || 0);
    var trackH = Math.max(0, +o.trackH || 0);
    var maxScroll = contentH - viewportH;
    if (maxScroll <= 1 || trackH <= 0) {
      return { shown: false, thumbH: 0, thumbTop: 0, maxScroll: 0 };
    }
    var minThumbH = Math.max(10, +o.minThumbH || SCROLL_MIN_THUMB);
    var thumbH = Math.round(trackH * (viewportH / contentH));
    thumbH = Math.min(trackH, Math.max(minThumbH, thumbH));
    var scrollY = Math.min(Math.max(+o.scrollY || 0, 0), maxScroll);
    var thumbTop = Math.round((scrollY / maxScroll) * (trackH - thumbH));
    return { shown: true, thumbH: thumbH, thumbTop: thumbTop, maxScroll: maxScroll };
  }

  // o: { trackH, thumbH, thumbTop, maxScroll } → document scrollY (px),
  // clamped to the scrollable range. Dragging the thumb is the inverse of
  // rendering it, so both functions must agree on the same travel distance.
  function scrollThumbScrollY(o) {
    o = o || {};
    var maxScroll = Math.max(0, +o.maxScroll || 0);
    var travel = Math.max(0, (+o.trackH || 0) - (+o.thumbH || 0));
    if (travel <= 0 || maxScroll <= 0) return 0;
    var thumbTop = Math.min(Math.max(+o.thumbTop || 0, 0), travel);
    return (thumbTop / travel) * maxScroll;
  }

  // ---- Heavy smooth scroll ------------------------------------------------
  // Pure maths behind the wheel-lerp scroller (see the smooth-scroll IIFE in
  // script.js). wheelDeltaPx normalizes a WheelEvent delta into pixels —
  // browsers report deltaY in pixels (mode 0), lines (mode 1, Firefox), or
  // pages (mode 2). smoothScrollStep is one frame of the ease: `current`
  // closes `ease` of the remaining gap to `target` per 60fps frame, scaled
  // by the real frame delta `dtMs` so the glide's time constant is the same
  // at any refresh rate — without that, a 144Hz+ display burns through the
  // tail 2-4x faster and the scroll stops dead instead of slowing to a stop.
  // Snapping the last sub-`snap` px lets the rAF loop terminate. dtMs is
  // clamped to 100ms so a hidden-tab rAF gap can't teleport the page through
  // the whole remaining gap in one frame. Lower ease = heavier feel.
  function wheelDeltaPx(deltaY, deltaMode) {
    var d = +deltaY;
    if (isNaN(d)) return 0;
    if (deltaMode === 1) return d * 16;
    if (deltaMode === 2) return d * 800;
    return d;
  }

  function smoothScrollStep(current, target, ease, dtMs, snap) {
    var c = +current, t = +target;
    if (isNaN(c) || isNaN(t)) return 0;
    var e = +ease;
    if (isNaN(e) || e <= 0 || e > 1) e = 0.1;
    var dt = +dtMs;
    if (isNaN(dt) || dt <= 0) dt = 1000 / 60;
    if (dt > 100) dt = 100;
    var s = +snap;
    if (isNaN(s) || s <= 0) s = 0.5;
    var diff = t - c;
    if (Math.abs(diff) <= s) return t;
    // Fraction of the gap closed in dt ms when `ease` is the per-60fps rate:
    // two half-length frames compose to exactly one full-length frame.
    return c + diff * (1 - Math.pow(1 - e, dt / (1000 / 60)));
  }

  global.KazuLib = {
    BIRTH: BIRTH,
    TIMEZONE: TIMEZONE,
    escapeHtml: escapeHtml,
    ukWallParts: ukWallParts,
    lastSundayOfMonth: lastSundayOfMonth,
    ukTransitionInstant: ukTransitionInstant,
    isUkBST: isUkBST,
    nextUkDstTransition: nextUkDstTransition,
    ageBreakdown: ageBreakdown,
    birthdayCountdownParts: birthdayCountdownParts,
    zodiac: zodiac,
    birthFacts: birthFacts,
    buildBirthdayICS: buildBirthdayICS,
    googleCalendarUrl: googleCalendarUrl,
    nullschoolUrl: nullschoolUrl,
    openMeteoUrl: openMeteoUrl,
    atmosphereMode: atmosphereMode,
    particleCount: particleCount,
    sunTimesUK: sunTimesUK,
    skyBodyState: skyBodyState,
    steamAppId: steamAppId,
    steamStoreUrl: steamStoreUrl,
    steamIsSoftware: steamIsSoftware,
    steamHoursText: steamHoursText,
    malRow: malRow,
    malListRow: malListRow,
    malCacheParse: malCacheParse,
    malMangaRow: malMangaRow,
    malMangaListRow: malMangaListRow,
    malMangaCacheParse: malMangaCacheParse,
    ratingStars: ratingStars,
    letterboxdWatchedLabel: letterboxdWatchedLabel,
    parseLetterboxdRss: parseLetterboxdRss,
    letterboxdCacheParse: letterboxdCacheParse,
    listenbrainzRow: listenbrainzRow,
    xmlText: xmlText,
    ytArtistName: ytArtistName,
    parseYouTubePlaylistRss: parseYouTubePlaylistRss,
    ytPlaylistCacheParse: ytPlaylistCacheParse,
    cacheFresh: cacheFresh,
    forecastRows: forecastRows,
    konamiMatch: konamiMatch,
    devCodeMatch: devCodeMatch,
    seasonDevApply: seasonDevApply,
    seasonDevParse: seasonDevParse,
    balloonDriftStep: balloonDriftStep,
    ropeStep: ropeStep,
    scrollThumbGeometry: scrollThumbGeometry,
    scrollThumbScrollY: scrollThumbScrollY,
    wheelDeltaPx: wheelDeltaPx,
    smoothScrollStep: smoothScrollStep,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
