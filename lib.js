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

    return {
      years: years, months: months, days: days,
      totalDays: totalDays, totalWeeks: totalWeeks, totalHours: totalHours,
      nextMilestoneDays: nextMilestoneDays, nextMilestoneOn: nextMilestoneOn,
      heartbeats: heartbeats,
    };
  }

  function lifeWeeksLived(now) {
    now = now || new Date();
    return Math.floor((ukWallMs(now) - BIRTH_WALL_MS) / (7 * 86400000));
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

  // ---- Weather-reactive atmosphere ----------------------------------------
  // Maps an Open-Meteo weather code to the ambient particle mode:
  //   'rain'       drizzle / rain / showers / thunderstorm
  //   'snow-heavy' actually snowing right now (heavier than the default)
  //   'snow'       the arctic default for everything else
  function atmosphereMode(weatherCode) {
    var c = +weatherCode;
    if (isNaN(c)) return 'snow';
    if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow-heavy';
    return 'snow';
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
    lifeWeeksLived: lifeWeeksLived,
    birthdayCountdownParts: birthdayCountdownParts,
    zodiac: zodiac,
    birthFacts: birthFacts,
    buildBirthdayICS: buildBirthdayICS,
    googleCalendarUrl: googleCalendarUrl,
    nullschoolUrl: nullschoolUrl,
    atmosphereMode: atmosphereMode,
    steamAppId: steamAppId,
    steamStoreUrl: steamStoreUrl,
    malRow: malRow,
    malListRow: malListRow,
    malCacheParse: malCacheParse,
    forecastRows: forecastRows,
    konamiMatch: konamiMatch,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
