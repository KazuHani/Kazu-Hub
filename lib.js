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

  // ---- Links from API data -------------------------------------------------
  // escapeHtml keeps a value inside its attribute, but it cannot make a hostile
  // link safe: href="javascript:..." is valid markup, and so is a phishing page
  // on another host. Every link that arrives from an API, a CORS proxy or a
  // localStorage copy of one passes through here before it can reach an href:
  // parsed by the WHATWG URL parser (the same one the browser follows), https
  // only, default port, no username/password, and the host must be one the
  // card expects. Returns the normalised href, or '' so the caller falls back
  // to a URL it builds itself (or drops the row).
  var MAL_HOSTS = ['myanimelist.net'];
  var LETTERBOXD_HOSTS = ['letterboxd.com'];
  var SPOTIFY_HOSTS = ['open.spotify.com'];
  function safeLink(url, hosts) {
    if (typeof url !== 'string' || !url || !Array.isArray(hosts)) return '';
    var u;
    try { u = new URL(url); } catch (e) { return ''; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
    return hosts.indexOf(u.hostname) === -1 ? '' : u.href;
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

  // Remove emoji sequences from displayed text, including joined characters,
  // skin tones, flags and keycaps, while preserving ordinary numbers/symbols.
  function stripEmoji(s) {
    return String(s == null ? '' : s).replace(/[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{1,2}|\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|\p{Emoji_Modifier})?)*[\u{E0020}-\u{E007F}]*|\p{Emoji_Modifier}|[\uFE0E\uFE0F]/gu, '');
  }

  // ---- New Year celebration -----------------------------------------------
  // The first UK minute of 1 January catches both a live midnight tick and a
  // tab opened/resumed just after it. A year latch prevents repeat shows;
  // neither visitor-local midnight nor a sky-time preview can trigger it.
  function newYearCelebrationYear(w, celebratedYear) {
    if (!w || !isFinite(w.year) || w.year < 1 || w.year % 1) return null;
    return w.month === 0 && w.day === 1 && w.hours === 0 && w.minutes === 0 &&
      w.year > (celebratedYear || 0) ? w.year : null;
  }

  // Analytic spark motion: radial velocity eases under drag, gravity curves
  // the trails downward, and each spark fades smoothly to zero. Seconds and
  // CSS pixels, independent of frame rate (also mirrored in script.js).
  function fireworkSparkState(age, angle, speed, life) {
    if (!isFinite(age) || !isFinite(angle) || !isFinite(speed) || !isFinite(life) || life <= 0) return { x: 0, y: 0, alpha: 0 };
    var t = Math.max(0, Math.min(age, life));
    var travel = speed * (1 - Math.exp(-1.25 * t)) / 1.25;
    var fade = Math.max(0, 1 - t / life);
    return { x: Math.cos(angle) * travel, y: Math.sin(angle) * travel + 22 * t * t, alpha: age < 0 ? 0 : fade * fade };
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
    var idx = (day <= cutoffs[m - 1]) ? (m - 1) : m;
    return { name: names[idx], glyph: '' };
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
      '&current=temperature_2m,weather_code,wind_speed_10m,is_day,cloud_cover,wind_direction_10m';
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

  // Whole-effect kill switch for devices that can't afford the ambient layer
  // at all — where particleCount merely lightens the drift, this takes the
  // petals, glass blur/refraction, wheel-lerp and entrance animations away
  // entirely (script.js mirrors the verdict onto body.low-power, and
  // style.css does the rest). True when the visitor asked for it (save-data,
  // reduced motion) or when at least two weakness signals stack up — a weak
  // phone trips lowConcurrency + coarsePointer + smallScreen together, while
  // any single signal alone still gets the full page at reduced density.
  // `o` flags: saveData, reducedMotion, lowMemory, lowConcurrency,
  // coarsePointer, smallScreen.
  function lowPowerMode(o) {
    o = o || {};
    if (o.saveData || o.reducedMotion) return true;
    var weak = 0;
    if (o.lowMemory) weak++;
    if (o.lowConcurrency) weak++;
    if (o.coarsePointer) weak++;
    if (o.smallScreen) weak++;
    return weak >= 2;
  }

  // Should the live weather layers (weather-fx.js: rain, snow, wind, clouds)
  // run for this visitor? Desktop only, and only when nothing says the page
  // should stay quiet. Phones and tablets never get it (coarse primary
  // pointer, no hover, a mobile UA, or a mobile-width window), nor do
  // visitors who asked for less motion or data, nor weak hardware
  // (lowPowerMode). Missing flags read as "not set", so a bare desktop is
  // allowed; script.js passes every flag explicitly and never loads the
  // file when this says no. `o` flags: coarsePointer, hoverNone, narrow,
  // uaMobile, reducedMotion, saveData, lowPower.
  function weatherFxAllowed(o) {
    o = o || {};
    if (o.coarsePointer || o.hoverNone || o.narrow || o.uaMobile) return false;
    if (o.reducedMotion || o.saveData || o.lowPower) return false;
    return true;
  }

  // ---- Apple Liquid Glass Optical Physics ---------------------------------
  // Mathematical models reverse-engineered from Apple's dielectric lens shader
  // (visionOS / macOS / iOS Liquid Glass).
  // 1. Squircle SDF (degree n = 4.0): preserves G^2 continuous curvature along
  //    container boundaries, eliminating lighting creases and unnatural light
  //    concentration where straight edges meet circular quarter-arcs.
  // 2. Analytical surface normal gradient: exact directional derivative in
  //    screen space (normalized to unit length).
  // 3. Convex bevel heightfield profile: h(u) = sqrt(1 - (1 - u)^4) compresses
  //    incident light inward via Snell's Law and smoothly plateaus into the flat
  //    interior so text remains crystal clear.
  // 4. Low-end device gating: disables heavy refractive SVG displacement maps
  //    on constrained hardware to preserve 60/120 FPS.
  function isLowEndDevice(o) {
    o = o || {};
    if (o.saveData || o.reducedMotion || o.reducedTransparency) return true;
    if (o.lowMemory && o.lowConcurrency) return true;
    if (o.coarsePointer && (o.smallScreen || o.lowConcurrency)) return true;
    if (o.lowMemory && o.smallScreen) return true;
    return false;
  }

  function squircleSDF(nx, ny, n) {
    n = +n || 4.0;
    var ax = Math.abs(+nx || 0), ay = Math.abs(+ny || 0);
    var ax2 = ax * ax, ay2 = ay * ay;
    var sum = (ax2 * ax2) + (ay2 * ay2);
    if (sum <= 0) return 0;
    return Math.sqrt(Math.sqrt(sum));
  }

  function squircleGrad(nx, ny, halfW, halfH, n) {
    n = +n || 4.0;
    halfW = +halfW || 1;
    halfH = +halfH || 1;
    var x = +nx || 0, y = +ny || 0;
    var gx = (x * x * x) / halfW;
    var gy = (y * y * y) / halfH;
    var len = Math.hypot ? Math.hypot(gx, gy) : Math.sqrt(gx * gx + gy * gy);
    if (!len) return [0, 0];
    return [gx / len, gy / len];
  }

  function liquidGlassBevel(edgeDistance, bevelRadius) {
    var ed = +edgeDistance, br = +bevelRadius;
    if (!isFinite(ed) || !isFinite(br) || ed <= 0 || br <= 0) return 0;
    if (ed >= br) return 0;
    var u = 1.0 - (ed / br);
    if (u <= 0) return 0;
    if (u >= 1) u = 1;
    var om = 1.0 - u;
    var om2 = om * om;
    var om4 = om2 * om2;
    return Math.sqrt(Math.max(0, 1.0 - om4));
  }

  function liquidGlassDisplacement(x, y, w, h, bevelRadius, n) {
    w = +w || 1; h = +h || 1;
    bevelRadius = +bevelRadius || 24;
    n = +n || 4.0;
    var halfX = w * 0.5, halfY = h * 0.5;
    var minDim = Math.min(halfX, halfY);
    var nx = ((+x || 0) - halfX) / halfX;
    var ny = ((+y || 0) - halfY) / halfY;
    var dist = squircleSDF(nx, ny, n);
    var edgeDistance = (1.0 - dist) * minDim;
    if (edgeDistance <= 0 || edgeDistance > bevelRadius) {
      return [128, 128];
    }
    var dispAmount = liquidGlassBevel(edgeDistance, bevelRadius);
    var grad = squircleGrad(nx, ny, halfX, halfY, n);
    var dx = -grad[0] * dispAmount;
    var dy = -grad[1] * dispAmount;
    return [
      Math.min(255, Math.max(0, Math.round(128 + dx * 127))),
      Math.min(255, Math.max(0, Math.round(128 + dy * 127)))
    ];
  }

  // Scales a petal's existing one-viewport fall time to the remaining page
  // distance. This keeps the same terminal velocity on a long document while
  // ensuring the petal crosses the footer plus a small exit pad before its
  // animation loops back to the branch.
  function petalFallDuration(pageHeight, spawnY, viewportHeight, baseSeconds, exitPad) {
    var view = +viewportHeight;
    var base = +baseSeconds;
    if (!isFinite(view) || view <= 0 || !isFinite(base) || base <= 0) return 0;
    var page = +pageHeight;
    var spawn = +spawnY;
    var pad = +exitPad;
    if (!isFinite(page) || page < view) page = view;
    if (!isFinite(spawn)) spawn = 0;
    if (!isFinite(pad) || pad < 0) pad = 0;
    var reference = view * 1.12;
    var distance = Math.max(reference, page - spawn + pad);
    return Math.round(base * distance / reference * 100) / 100;
  }

  // ---- Sky body (sun/moon arc) ---------------------------------------------
  // The scenery layer's celestial body: the sun by day, the moon by night,
  // both travelling the same arc — rising from beyond the left edge of the
  // page, climbing to the top of the sky, setting beyond the right edge.
  // Timed to the Europe/London wall clock (script.js feeds in ukWallParts).

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

  // A point on the sky body's 0..1 journey from sunrise to sunset. It is
  // shared by the live sun/moon position and the dev guide so the drawn curve
  // can never drift away from the real path.
  // The arc is one sine that does not stop at the horizon points (x = 6% and
  // 94%, y = 52%): it keeps sinking past them until both ends are fully
  // off-screen, so the body slides in from beyond the left edge and out past
  // the right edge instead of popping in and out mid-sky. The journey p in
  // [0, 1] is stretched over that longer curve by SKY_ARC_OVERSHOOT (extra
  // curve on each side, as a fraction of the 6%..94% span): 0.16 puts the
  // ends at x = -8.08% / 108.08%, clear of the widest sun disc (~6% of the
  // viewport at the narrowest width it is shown), at y ≈ 68% (the curve is
  // already ~59% high at the screen edge itself). The crest (p = 0.5) is
  // unchanged: dead centre, behind the profile picture.
  // `alt` is the true height on the drawn arc: 1 at the crest, 0 at the
  // horizon points, negative on the off-screen tails.
  // `crestY` is optional: the page supplies the profile picture's live
  // centre, placing the noon sun / midnight moon directly behind it.
  var SKY_ARC_OVERSHOOT = 0.16;
  function skyArcPoint(progress, crestY) {
    var p = +progress;
    if (isNaN(p)) return null;
    p = Math.min(1, Math.max(0, p));
    var crest = crestY == null ? 19 : +crestY;
    if (isNaN(crest)) crest = 19;
    crest = Math.min(52, Math.max(0, crest));
    var q = -SKY_ARC_OVERSHOOT + p * (1 + 2 * SKY_ARC_OVERSHOOT);
    var alt = Math.sin(Math.PI * q);
    return {
      x: +(6 + q * 88).toFixed(2),
      y: +(52 - alt * (52 - crest)).toFixed(2),
      alt: +alt.toFixed(3),
    };
  }

  // Where the sky body sits at `ukMinutes` (minutes since UK midnight).
  // Returns { body, x, y, alt, low }: x/y are % offsets inside the scenery
  // layer, alt the 0..1 height along the arc (1 = top of the sky), low flags
  // near-horizon positions for golden-hour styling. Junk time input yields
  // null so the page keeps whatever it is already showing.
  function skyBodyState(ukMinutes, dayOfYear, crestY) {
    var t = +ukMinutes;
    if (isNaN(t)) return null;
    t = ((t % 1440) + 1440) % 1440;
    var st = sunTimesUK(dayOfYear);
    var dayLen = st.set - st.rise;
    var isSun = t >= st.rise && t < st.set;
    // Piecewise progress, re-anchored to the CLOCK: the crest (p = 0.5, dead
    // centre behind the profile picture) is hit at exactly 12:00 by the sun
    // and 00:00 by the moon, while sunrise/sunset still pin the horizons.
    // (The raw midpoint of the approximate rise/set times wanders up to ~75
    // minutes off clock noon across the year, which is what used to leave
    // the body visibly off-centre at midday/midnight.)
    var p;
    if (isSun) {
      p = t < 720 ? 0.5 * (t - st.rise) / (720 - st.rise)
                  : 0.5 + 0.5 * (t - 720) / (st.set - 720);
    } else {
      var u = (((t - st.set) % 1440) + 1440) % 1440; // 0 at sunset, climbing through the night
      var uMid = 1440 - st.set;                       // midnight's offset into the night
      p = u < uMid ? 0.5 * u / uMid
                   : 0.5 + 0.5 * (u - uMid) / (1440 - dayLen - uMid);
    }
    var point = skyArcPoint(p, crestY);
    return {
      body: isSun ? 'sun' : 'moon',
      x: point.x,
      y: point.y,
      alt: point.alt,
      low: point.alt < 0.28,
    };
  }

  // Time-of-day page tint: a soft slate-blue palette that breathes with the
  // UK day. Lightness rides the sun (0% AMOLED black in deep night, 36% soft
  // daylight at midday), while a gaussian blush around sunrise/sunset warms
  // the hue from blue towards indigo-violet. `glow` (max of the two factors)
  // scales the decorative gradient layers in --page-bg so the night sky can
  // reach TRUE black, and `glowX` tracks the sun's horizontal position (pinned
  // to the rising horizon before dawn, the setting horizon after dusk) so
  // script.js can park a faint orange glow where the sun crosses.
  // script.js writes h/s/l/glow onto CSS custom properties once a minute
  // (registered @property transitions glide each step). Junk time input
  // yields null so the page keeps its current tint.
  // Halloween changes only the hue/saturation; light and sky timing stay real.
  function skyTint(ukMinutes, dayOfYear, season) {
    var t = +ukMinutes;
    if (isNaN(t)) return null;
    t = ((t % 1440) + 1440) % 1440;
    var st = sunTimesUK(dayOfYear);
    var day = 0;
    if (t > st.rise && t < st.set) {
      day = Math.sin(Math.PI * (t - st.rise) / (st.set - st.rise));
    }
    // 60-minute-sigma bell around each horizon crossing.
    function bell(c) {
      var d = Math.abs(t - c);
      d = Math.min(d, 1440 - d);
      return Math.exp(-(d * d) / 7200); // 2 * 60^2
    }
    var dusk = Math.max(bell(st.rise), bell(st.set));
    // Sun's progress along its day arc (clock-anchored like skyBodyState),
    // clamped to the horizons outside daylight so the pre-dawn glow sits on
    // the rising (left) side and the post-sunset glow on the setting (right).
    var sunP;
    if (t <= st.rise) sunP = 0;
    else if (t >= st.set) sunP = 1;
    else sunP = t < 720 ? 0.5 * (t - st.rise) / (720 - st.rise)
                        : 0.5 + 0.5 * (t - 720) / (st.set - 720);
    return {
      h: +(season === 'halloween' ? 275 + 8 * dusk : 215 + 22 * dusk).toFixed(2),
      s: +(season === 'halloween' ? 28 + 6 * dusk : 33 + 9 * dusk).toFixed(2),
      l: +(36 * day).toFixed(2),         // 0% AMOLED black night -> 36% gentle daylight
      daylight: +day.toFixed(4),
      dusk: +dusk.toFixed(4),
      glow: +Math.max(day, dusk).toFixed(4),   // 0 at deep night -> gradient layers fade out
      glowX: +(6 + sunP * 88).toFixed(2),      // horizon glow anchor, % across the scenery
    };
  }

  // ---- Sunset sky --------------------------------------------------------
  // The orange sunset gradient behind the page (style.css .sunset-sky). Only
  // the evening: it eases in SUNSET_LEAD minutes before the day's sunset as
  // the sun sinks towards the horizon, holds full strength from sunset for
  // SUNSET_HOLD minutes, then fades out over SUNSET_FADE minutes of twilight.
  // Returns { glow, late }, both 0..1:
  //   glow  overall strength of the gradient layer
  //   late  which palette: 0 = golden/orange (sun still up), 1 = rose/violet
  //         afterglow (sun gone); it crossfades from 10 minutes before sunset
  //         to 40 minutes after, so the sky warms, then deepens.
  // script.js writes these to --sunset / --sunset-late once a minute; the
  // inline #boot-tint script in index.html carries a compact copy so the very
  // first paint is already right (tests.js pins the two over a year-wide
  // sweep). Junk time input yields null.
  var SUNSET_LEAD = 110, SUNSET_HOLD = 12, SUNSET_FADE = 85;
  function smoothstep01(x) {
    x = x < 0 ? 0 : (x > 1 ? 1 : x);
    return x * x * (3 - 2 * x);
  }
  function sunsetGlow(ukMinutes, dayOfYear) {
    var t = +ukMinutes;
    if (isNaN(t)) return null;
    t = ((t % 1440) + 1440) % 1440;
    var dt = t - sunTimesUK(dayOfYear).set; // minutes after sunset (negative before)
    var glow;
    if (dt < -SUNSET_LEAD || dt > SUNSET_HOLD + SUNSET_FADE) glow = 0;
    else if (dt < 0) glow = smoothstep01((dt + SUNSET_LEAD) / SUNSET_LEAD);
    else if (dt <= SUNSET_HOLD) glow = 1;
    else glow = 1 - smoothstep01((dt - SUNSET_HOLD) / SUNSET_FADE);
    return { glow: +glow.toFixed(3), late: +smoothstep01((dt + 10) / 50).toFixed(3) };
  }

  // Dev preview: ?time=HH:MM moves the sky (sun/moon, tint, sunset) to that UK
  // wall-clock time; the on-page clock stays real. Returns minutes since UK
  // midnight, or null when the query string has no valid time. The same
  // pattern lives in the #boot-tint script (tests.js checks they agree).
  function timeOverrideParse(search) {
    var m = /[?&]time=(\d{1,2}):(\d{2})(?:[&#]|$)/.exec(String(search == null ? '' : search));
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  // hsl -> '#rrggbb' for the theme-color meta (which the bg tint follows).
  function hslToHex(h, s, l) {
    h = ((+h % 360) + 360) % 360;
    s = Math.min(100, Math.max(0, +s)) / 100;
    l = Math.min(100, Math.max(0, +l)) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    function hex(v) {
      var n = Math.round((v + m) * 255);
      return (n < 16 ? '0' : '') + n.toString(16);
    }
    return '#' + hex(r) + hex(g) + hex(b);
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
      url: safeLink(a.url, MAL_HOSTS) || (a.mal_id ? 'https://myanimelist.net/anime/' + a.mal_id : 'https://myanimelist.net'),
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

  // ---- Japanese titles for the MAL card (AniList) --------------------------
  // In Japanese mode the MAL card shows each show's native title. MAL's own
  // feeds carry none (load.json's title_localized is null; Jikan's user list
  // omits title_japanese), so they come from AniList's public GraphQL API,
  // which indexes every entry by its MAL id: one POST for every row, no key,
  // CORS-clean. Rows keep only their url, so the id is read back out of it.
  function malIdFromUrl(url) {
    var m = /^https:\/\/myanimelist\.net\/(?:anime|manga)\/(\d+)(?:[\/?#]|$)/.exec(String(url || ''));
    var id = m ? parseInt(m[1], 10) : 0;
    return id > 0 ? id : null;
  }
  function malIdList(ids) {
    var out = [];
    (ids || []).forEach(function (id) { if (typeof id === 'number' && id > 0 && id % 1 === 0 && out.indexOf(id) === -1) out.push(id); });
    return out.slice(0, 50); // one AniList page
  }
  // The POST body for AniList, or null when there is nothing to ask for. Each
  // half is only sent when it has ids: an empty idMal_in is ignored by
  // AniList and would return 50 unrelated shows.
  function anilistTitlesQuery(animeIds, mangaIds) {
    var a = malIdList(animeIds), m = malIdList(mangaIds);
    if (!a.length && !m.length) return null;
    var vars = [], parts = [], variables = {};
    if (a.length) { vars.push('$a: [Int]'); parts.push('a: Page(perPage: 50) { media(idMal_in: $a, type: ANIME) { idMal title { native } } }'); variables.a = a; }
    if (m.length) { vars.push('$m: [Int]'); parts.push('m: Page(perPage: 50) { media(idMal_in: $m, type: MANGA) { idMal title { native } } }'); variables.m = m; }
    return { query: 'query (' + vars.join(', ') + ') { ' + parts.join(' ') + ' }', variables: variables };
  }
  // AniList's answer -> { anime: { malId: native }, manga: {...} }, keeping
  // only ids that were asked for and titles that are real, short strings.
  function anilistTitlesParse(json, animeIds, mangaIds) {
    var out = { anime: {}, manga: {} };
    var data = json && json.data;
    function take(page, ids, into) {
      var want = malIdList(ids);
      var list = page && Array.isArray(page.media) ? page.media : [];
      list.forEach(function (x) {
        var id = x && x.idMal, t = x && x.title && x.title.native;
        if (want.indexOf(id) === -1 || typeof t !== 'string') return;
        t = t.replace(/\s+/g, ' ').trim();
        if (t && t.length <= 200) into[id] = t;
      });
    }
    if (data) { take(data.a, animeIds, out.anime); take(data.m, mangaIds, out.manga); }
    return out;
  }
  // localStorage copy of the titles ('kazu-mal-ja'), so Japanese visitors see
  // them at once on the next load. Sanitised, at most 100 per kind.
  function malJaCacheParse(raw) {
    var out = { anime: {}, manga: {} };
    var j = null;
    try { j = JSON.parse(raw); } catch (e) { return out; }
    ['anime', 'manga'].forEach(function (k) {
      var src = j && typeof j[k] === 'object' ? j[k] : null;
      if (!src) return;
      var keys = Object.keys(src).filter(function (id) { return /^\d+$/.test(id) && typeof src[id] === 'string' && src[id] && src[id].length <= 200; });
      keys.slice(-100).forEach(function (id) { out[k][id] = src[id]; });
    });
    return out;
  }

  // ---- Discord presence (localStorage fallback when Lanyard is down) --------
  // Reads the stored Discord presence snapshot (written after every successful
  // fetch or WebSocket update). When Lanyard is unreachable or blocked, the
  // card renders the last good profile instead of an error state. Forces
  // status to offline so stale presence is never represented as active.
  function discordCacheParse(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    var data = payload && (payload.data || payload);
    var u = data && data.discord_user;
    if (!u || typeof u !== 'object') return null;
    if (typeof u.username !== 'string' || !u.username) return null;
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
      var url = safeLink(r.url, MAL_HOSTS);
      if (!url) return null;
      var total = (typeof r.total === 'number' && r.total > 0) ? r.total : null;
      var watched = (typeof r.watched === 'number' && r.watched >= 0) ? r.watched : 0;
      rows.push({
        url: url,
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
      url: safeLink(m.url, MAL_HOSTS) || (m.mal_id ? 'https://myanimelist.net/manga/' + m.mal_id : 'https://myanimelist.net'),
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
      var url = safeLink(r.url, MAL_HOSTS);
      if (!url) return null;
      var total = (typeof r.total === 'number' && r.total > 0) ? r.total : null;
      var read = (typeof r.read === 'number' && r.read >= 0) ? r.read : 0;
      rows.push({
        url: url,
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
    var link = safeLink(rssPick(item, 'link'), LETTERBOXD_HOSTS);
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
    var link = safeLink(e2.link, LETTERBOXD_HOSTS);
    if (!link) return null;
    var rating = (typeof e2.rating === 'number' && e2.rating > 0 && e2.rating <= 5) ? e2.rating : null;
    return {
      title: e2.title,
      year: (typeof e2.year === 'string' && /^\d{4}$/.test(e2.year)) ? e2.year : null,
      rating: rating,
      stars: ratingStars(rating),
      link: link,
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
      url: safeLink(info.spotify_id, SPOTIFY_HOSTS),
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

  // ---- Cherry-blossom season (sakura) ---------------------------------------
  // The blossom branches and the falling petals belong to the time of year
  // when Japan's cherry trees flower: first blooms in Kyushu and Tokyo around
  // 20 March, the front reaching Tohoku in mid-April and Hokkaido in the
  // first days of May, the last petals gone by about 10 May. (Okinawa's
  // January/February bloom is a different tree and is left out on purpose.)
  // Inclusive on both ends. `month` is 0-indexed like BIRTH; the page passes
  // the UK wall date, like the birthday season. The same two numbers live in
  // the inline #boot-tint script in index.html (it sets html.no-sakura before
  // first paint); tests.js fails if the two disagree on any day of the year.
  var SAKURA_FIRST = 2 * 100 + 20; // 20 March  (month * 100 + day)
  var SAKURA_LAST = 4 * 100 + 10;  // 10 May
  function sakuraInBloom(month, day) {
    var m = +month, d = +day;
    if (isNaN(m) || isNaN(d)) return false;
    var key = m * 100 + d;
    return key >= SAKURA_FIRST && key <= SAKURA_LAST;
  }

  // Season-trigger overrides from the dev panel. Each season is 'auto'
  // (follow the clock — the default, never stored), 'on' (forced live), or
  // 'off' (forced dark). Unknown keys and values are ignored, so a
  // hand-edited localStorage blob can never wedge the seasons.
  var DEV_SEASON_KEYS = ['birthday', 'christmas', 'pride', 'sakura', 'halloween'];
  function seasonDevApply(state, overrides) {
    var s = state || {};
    var out = { birthday: !!s.birthday, christmas: !!s.christmas, pride: !!s.pride, sakura: !!s.sakura, halloween: !!s.halloween };
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

  // Single-value mode used by non-season dev switches. Auto is the safe
  // default for missing, malformed, or unknown localStorage values.
  function devModeParse(raw) {
    return raw === 'on' || raw === 'off' || raw === 'auto' ? raw : 'auto';
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

  // ---- Christmas frost: snow on each card's top edge, frost in its corners --
  // One border-image per card (style.css: "Christmas: frozen cards"). Every
  // card clips its own content (overflow: hidden; the below-fold ones also have
  // content-visibility: auto), and a border-image is the one thing CSS paints
  // outside such a box, so it is how the snow can sit ON the card and ride
  // along with hover lifts and scroll reveals. It is a 9-slice: the corners
  // (frost, the ends of the snow) keep their exact shape and the straight edges
  // (the middle of the snow, the edge haze, the icy rim) stretch, so a card
  // that changes height never distorts, and the page regenerates it when the
  // width changes for real. The middle slice is never drawn: frost lives at
  // the edges and corners only, so it never sits behind the middle of the text.
  // Seeded: every card gets its own snow line and frost, and a reload draws the
  // same picture. Pure and DOM-free, gate-tested in evals/christmas-frost.js.
  var FROST_RISE = 13;   // px the snow stands above the card's top edge
  var FROST_SIDE = 3;    // px the snow may overhang either side
  function frostRng(seed) { // mulberry32: tiny, fast, good enough for scenery
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function frostNum(v) { return String(Math.round(v * 10) / 10); }

  // How far the corner frost reaches into a w x h card (px). Both corners of a
  // side must fit inside it, or the browser shrinks the whole border-image.
  function frostReach(w, h) {
    var r = Math.round(Math.min(w, h) * 0.4);
    return r < 30 ? 30 : (r > 92 ? 92 : r);
  }

  // The surface of a rounded rect's top edge at image x (outer edge, y down).
  function frostTopY(x, x0, x1, y0, r) {
    var dx = 0;
    if (x < x0 + r) dx = x0 + r - x;
    else if (x > x1 - r) dx = x - (x1 - r);
    else return y0;
    if (dx >= r) return y0 + r;
    return y0 + r - Math.sqrt(r * r - dx * dx);
  }

  // One frost fern, the way frost grows on a cold pane: a gently curving stem
  // with fine barbs on both sides, close together and swept forward at about
  // 60 degrees (ice is hexagonal), longest at the base and shrinking towards
  // the tip; now and then a barb grows into a small fern of its own. Points go
  // into lines[depth] as polylines, in the corner's own frame.
  function frostGrow(rng, x, y, th, len, depth, lines) {
    var n = Math.max(1, Math.round(len / 4)), seg = len / n;
    var curl = (rng() - 0.5) * (depth === 0 ? 0.07 : 0.03);
    var pts = [x, y], dirs = [], i;
    for (i = 0; i < n; i++) {
      th += curl + (rng() - 0.5) * (depth === 0 ? 0.14 : 0.06);
      dirs.push(th);
      x += Math.cos(th) * seg; y += Math.sin(th) * seg;
      pts.push(x, y);
    }
    lines[depth].push(pts);
    if (depth >= 2 || len < 5) return;
    var gap = depth === 0 ? 2.7 : 2.3;
    var sweep = 0.98 + rng() * 0.2;
    var maxBarb = depth === 0 ? Math.min(13, len * 0.32) : Math.min(4.2, len * 0.38);
    for (var t = gap * 1.6; t < len * 0.95; t += gap * (0.8 + rng() * 0.4)) {
      var k = Math.min(n - 1, Math.floor(t / seg)), f = t / seg - k;
      var px = pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * f;
      var py = pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * f;
      var base = maxBarb * (1 - 0.85 * t / len);
      for (var side = -1; side <= 1; side += 2) {
        if (rng() < 0.14) continue; // a missing barb here and there
        var bl = base * (0.7 + rng() * 0.55), a = dirs[k] + side * (sweep + (rng() - 0.5) * 0.18);
        if (bl < 1.1) continue;
        if (depth === 0 && bl > 6 && rng() < 0.12) { frostGrow(rng, px, py, a, bl * 1.7, 1, lines); continue; }
        lines[depth + 1].push([px, py, px + Math.cos(a) * bl, py + Math.sin(a) * bl]);
      }
    }
  }

  // All crystals for one corner, `amt` 0..1 (how frozen), in a frame where the
  // corner is (0, 0) and the card lies towards +x, +y. Ferns start on the frame
  // (both edges, and one from the corner itself) and grow inwards.
  function frostCorner(rng, amt, reach, r, lines) {
    var stems = Math.round(1 + amt * 6), i;
    frostGrow(rng, r * 0.32, r * 0.32, Math.PI / 4 + (rng() - 0.5) * 0.5, reach * amt * (0.5 + rng() * 0.3), 0, lines);
    for (i = 0; i < stems; i++) {
      var d = r * 0.5 + Math.pow(rng(), 1.25) * Math.max(0, reach * 0.74 - r * 0.5);
      var e = d < r ? r - Math.sqrt(r * r - (r - d) * (r - d)) : 0; // the inside of the rounded corner
      var len = reach * amt * (0.32 + rng() * 0.45) * (1 - 0.5 * d / reach);
      if (len < 5) continue;
      if (rng() < 0.5) frostGrow(rng, d, e + 0.6, Math.PI / 2 - (rng() - 0.35) * 0.9, len, 0, lines); // from the top edge
      else frostGrow(rng, e + 0.6, d, (rng() - 0.35) * 0.9, len, 0, lines);                              // from the side edge
    }
  }

  // Polylines -> compact path data, mapped into the image by (ox, oy, sx, sy).
  function frostPath(lines, ox, oy, sx, sy) {
    var out = '', i, j, p;
    for (i = 0; i < lines.length; i++) {
      p = lines[i];
      out += 'M' + frostNum(ox + sx * p[0]) + ' ' + frostNum(oy + sy * p[1]) + 'l';
      for (j = 2; j < p.length; j += 2) {
        out += (j > 2 ? ' ' : '') + frostNum(sx * (p[j] - p[j - 2])) + ' ' + frostNum(sy * (p[j + 1] - p[j - 1]));
      }
    }
    return out;
  }

  // The snow along the top: a drift sitting on the edge, level-ish with a soft
  // grain (long gentle swells plus small lumps), rounding off over the corners
  // in chunky ends, plus the soft shadow it casts onto the card below it.
  function frostSnow(rng, x0, x1, y0, r) {
    var xs = x0 + r * (0.24 + rng() * 0.14), xe = x1 - r * (0.24 + rng() * 0.14);
    var knots = [], x;
    for (x = xs; ; x += 34 + rng() * 50) { knots.push([Math.min(x, xe), 6.2 + rng() * 5.8]); if (x >= xe) break; }
    function swell(px) { // cosine-eased between the knots
      for (var j = 1; j < knots.length; j++) {
        if (px <= knots[j][0]) {
          var a = knots[j - 1], b = knots[j], u = b[0] > a[0] ? (px - a[0]) / (b[0] - a[0]) : 0;
          return a[1] + (b[1] - a[1]) * (1 - Math.cos(u * Math.PI)) / 2;
        }
      }
      return knots[knots.length - 1][1];
    }
    var taper = r * 1.2 + 5, pts = [];
    for (x = xs; x < xe - 4; x += 6 + rng() * 6) {
      var dEnd = Math.min(x - xs, xe - x);
      var s = dEnd >= taper ? 1 : 0.42 + 0.58 * Math.sin((dEnd / taper) * Math.PI / 2);
      var t = (swell(x) + (rng() - 0.5) * 1.5) * s;
      var top = frostTopY(x, x0, x1, y0, r);
      if (top - t < 1) t = top - 1;
      pts.push([x, top - t]);
    }
    var tEnd = frostTopY(xe, x0, x1, y0, r);
    var endT = Math.min(swell(xe) * 0.42, tEnd - 1);
    pts.push([xe, tEnd - endT]);
    var b0 = frostTopY(xs, x0, x1, y0, r) + 0.7, b1 = tEnd + 0.7;
    var c0 = Math.max(2.4, (b0 - pts[0][1]) * 0.62), c1 = Math.max(2.4, (b1 - pts[pts.length - 1][1]) * 0.62);
    // top contour: Catmull-Rom through the points, as cubic Beziers, with a
    // rounded cap at each end
    var d = 'M' + frostNum(xs) + ' ' + frostNum(b0) + 'C' + frostNum(xs - c0) + ' ' + frostNum(b0 - 0.3) + ' ' + frostNum(xs - c0 * 0.8) + ' ' + frostNum(pts[0][1]) + ' ' + frostNum(pts[0][0]) + ' ' + frostNum(pts[0][1]);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
      d += 'C' + frostNum(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + frostNum(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        frostNum(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + frostNum(p2[1] - (p3[1] - p1[1]) / 6) + ' ' +
        frostNum(p2[0]) + ' ' + frostNum(p2[1]);
    }
    var last = pts[pts.length - 1];
    d += 'C' + frostNum(xe + c1 * 0.8) + ' ' + frostNum(last[1]) + ' ' + frostNum(xe + c1) + ' ' + frostNum(b1 - 0.3) + ' ' + frostNum(xe) + ' ' + frostNum(b1);
    // bottom contour: back along the card's own edge (arc, straight, arc)
    var under = [], bx;
    for (bx = xe; bx > Math.max(x1 - r, xs); bx -= 1.5) under.push([bx, frostTopY(bx, x0, x1, y0, r) + 0.7]);
    if (x1 - r > x0 + r) { under.push([x1 - r, y0 + 0.7]); under.push([x0 + r, y0 + 0.7]); }
    for (bx = Math.min(x0 + r, xe); bx > xs; bx -= 1.5) under.push([bx, frostTopY(bx, x0, x1, y0, r) + 0.7]);
    for (i = 0; i < under.length; i++) d += 'L' + frostNum(under[i][0]) + ' ' + frostNum(under[i][1]);
    d += 'Z';
    // where the snow meets the card: the same edge, a little lower
    var shade = '', first = true;
    for (bx = xs + 1; bx <= xe - 1; bx += (bx < x0 + r || bx > x1 - r) ? 1.5 : Math.max(1.5, (x1 - r) - bx)) {
      shade += (first ? 'M' : 'L') + frostNum(bx) + ' ' + frostNum(frostTopY(bx, x0, x1, y0, r) + 1.8);
      first = false;
    }
    return { d: d, shade: shade };
  }

  // The whole picture for one card. o = { w, h, r, seed } (px, border box).
  // Returns { svg, slice, width, outset, reach } or null for unusable input:
  // slice / width / outset are the four-side border-image values (t r b l).
  function frostCard(o) {
    o = o || {};
    var w = Math.round(+o.w), h = Math.round(+o.h), r = +o.r;
    if (!(w >= 60 && w <= 4000 && h >= 60 && h <= 4000)) return null;
    if (!(r >= 0)) r = 22;
    r = Math.min(r, 40, w / 2, h / 2);
    var seed = Math.floor(Math.abs(+o.seed || 0)) % 4294967296;
    var rng = frostRng(seed * 2654435761 + 977);
    var reach = frostReach(w, h);
    var IW = w + 2 * FROST_SIDE, IH = h + FROST_RISE;
    var x0 = FROST_SIDE, y0 = FROST_RISE, x1 = x0 + w, y1 = y0 + h;

    // How frozen each corner is: the bottom ones most (the cold sinks), one
    // of them most of all; the top ones lightly, under the snow.
    var amt = { tl: 0.3 + rng() * 0.3, tr: 0.3 + rng() * 0.3, bl: 0.45 + rng() * 0.3, br: 0.45 + rng() * 0.3 };
    amt[rng() < 0.5 ? 'bl' : 'br'] = 0.85 + rng() * 0.15;
    var corners = [['tl', x0, y0, 1, 1], ['tr', x1, y0, -1, 1], ['br', x1, y1, -1, -1], ['bl', x0, y1, 1, -1]];
    var crystal = ['', '', ''], defs = '', haze = '', fade = '', i;
    var full = 'x="0" y="0" width="' + IW + '" height="' + IH + '"';
    for (i = 0; i < corners.length; i++) {
      var c = corners[i], lines = [[], [], []], at = 'gradientUnits="userSpaceOnUse" cx="' + c[1] + '" cy="' + c[2] + '"';
      frostCorner(rng, amt[c[0]], reach, r, lines);
      for (var k = 0; k < 3; k++) crystal[k] += frostPath(lines[k], c[1], c[2], c[3], c[4]);
      defs += '<radialGradient id="h' + c[0] + '" ' + at + ' r="' + frostNum(reach * (0.55 + 0.4 * amt[c[0]])) + '">' +
        '<stop offset="0" stop-color="#eef7ff" stop-opacity="' + frostNum(0.22 * amt[c[0]] + 0.04) + '"/><stop offset="1" stop-color="#eef7ff" stop-opacity="0"/></radialGradient>' +
        // the crystals fade out before the edge of their corner square: past it
        // is the undrawn middle, and a crystal must never stop at a hard line
        '<radialGradient id="f' + c[0] + '" ' + at + ' r="' + reach + '">' +
        '<stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
      haze += '<rect ' + full + ' fill="url(#h' + c[0] + ')"/>';
      fade += '<rect ' + full + ' fill="url(#f' + c[0] + ')"/>';
    }
    var snow = frostSnow(rng, x0, x1, y0, r);
    var rect = 'x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="' + frostNum(r) + '"';
    // frosted haze along every edge, thickest at the glass rim (one gradient
    // per side, from the inside (clear) to the edge; uniform along the edge,
    // so it stretches). The vector is x1 y1 x2 y2 in the band's own box.
    var band = 11, edges = [
      ['L', '1 0 0 0', x0, y0, band, h], ['R', '0 0 1 0', x1 - band, y0, band, h],
      ['T', '0 1 0 0', x0, y0, w, band], ['B', '0 0 0 1', x0, y1 - band, w, band]
    ];
    edges.forEach(function (e) {
      var v = e[1].split(' ');
      defs += '<linearGradient id="e' + e[0] + '" x1="' + v[0] + '" y1="' + v[1] + '" x2="' + v[2] + '" y2="' + v[3] + '">' +
        '<stop offset="0" stop-color="#e6f3ff" stop-opacity="0"/><stop offset="1" stop-color="#e6f3ff" stop-opacity=".15"/></linearGradient>';
      haze += '<rect x="' + e[2] + '" y="' + e[3] + '" width="' + e[4] + '" height="' + e[5] + '" fill="url(#e' + e[0] + ')"/>';
    });
    // preserveAspectRatio none: a flying copy's edge piece (frostFlightPieces)
    // shows the picture stretched along one axis, as border-image stretch does;
    // at natural size (every border-image) it changes nothing
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + IW + '" height="' + IH + '" viewBox="0 0 ' + IW + ' ' + IH + '" preserveAspectRatio="none">' +
      '<defs>' +
      '<clipPath id="c"><rect ' + rect + '/></clipPath>' +
      '<mask id="m" maskUnits="userSpaceOnUse" ' + full + '>' + fade + '</mask>' +
      '<linearGradient id="s" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="' + (y0 + 2) + '"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f5f9fc"/><stop offset=".86" stop-color="#dde9f3"/><stop offset="1" stop-color="#bdd0e1"/></linearGradient>' +
      defs + '</defs>' +
      '<g clip-path="url(#c)">' + haze +
      '<g mask="url(#m)" fill="none" stroke="#f2f9ff" stroke-linecap="round">' +
      '<path d="' + crystal[0] + '" stroke-width=".85" stroke-opacity=".6"/>' +
      '<path d="' + crystal[1] + '" stroke-width=".55" stroke-opacity=".42"/>' +
      '<path d="' + crystal[2] + '" stroke-width=".45" stroke-opacity=".32"/>' +
      '</g>' +
      '<path d="' + snow.shade + '" fill="none" stroke="#04140c" stroke-opacity=".1" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="' + snow.shade + '" fill="none" stroke="#04140c" stroke-opacity=".14" stroke-width="2.2" stroke-linecap="round"/>' +
      '</g>' +
      // the icy rim, just inside the glass edge
      '<rect x="' + frostNum(x0 + 0.6) + '" y="' + frostNum(y0 + 0.6) + '" width="' + frostNum(w - 1.2) + '" height="' + frostNum(h - 1.2) + '" rx="' + frostNum(Math.max(0, r - 0.6)) + '" fill="none" stroke="#e4f3ff" stroke-opacity=".4" stroke-width="1.2"/>' +
      '<path d="' + snow.d + '" fill="url(#s)" stroke="#5f86a6" stroke-opacity=".28" stroke-width=".7"/>' +
      '</svg>';
    return {
      svg: svg,
      reach: reach,
      slice: [FROST_RISE + reach, FROST_SIDE + reach, reach, FROST_SIDE + reach],
      width: [FROST_RISE + reach, FROST_SIDE + reach, reach, FROST_SIDE + reach],
      outset: [FROST_RISE, FROST_SIDE, 0, FROST_SIDE],
      // how far in from the outside of the picture each side draws anything
      // between its corners (t r b l): the snow and the haze band (+1px of
      // anti-aliasing). The crystals and corner haze fade out within reach of
      // their corner, which is where the edge slices start, so past this depth
      // an edge slice is empty and a flying copy can leave it out
      depth: [FROST_RISE + band + 1, FROST_SIDE + band + 1, band + 1, FROST_SIDE + band + 1]
    };
  }

  // ---- Chiikawa peek (Japanese mode) -------------------------------------
  // Chiikawa hides behind the profile picture while the page is in Japanese
  // and peeks out over its rim now and then. How it shows:
  //   'off'   English page: not rendered at all.
  //   'still' reduced motion: parked in the peeking pose, no motion.
  //   'move'  one-shot peek animations, re-armed by a timer (no infinite CSS loop).
  // Low-power still moves: every phone trips it (coarse pointer + small
  // screen), and a peek is one composited transform on a 92px image for 3.4 s
  // every 7-12 s, with no timer while hidden or scrolled away.
  function chiikawaPeekMode(o) {
    o = o || {};
    if (o.lang !== 'ja') return 'off';
    return o.reducedMotion ? 'still' : 'move';
  }
  // Wait before peek number n (0 = the first after the page turns Japanese).
  // The first waits out the profile picture's entrance pop (~1 s); later ones
  // are spaced 7-12 s apart so it reads as a visit, not a loop. r in [0, 1).
  var CHIIKAWA_FIRST_MS = 1200, CHIIKAWA_GAP_MS = 7000, CHIIKAWA_JITTER_MS = 5000;
  function chiikawaPeekDelay(n, r) {
    if (!(n > 0)) return CHIIKAWA_FIRST_MS;
    r = +r;
    if (!(r >= 0)) r = 0;
    if (r >= 1) r = 0.999;
    return Math.round(CHIIKAWA_GAP_MS + r * CHIIKAWA_JITTER_MS);
  }

  // A frostCard result as one CSS border-image value (the image as a data URI
  // with only the characters a url() needs escaped, so it stays small).
  function frostBorderImage(f) {
    if (!f || typeof f.svg !== 'string') return '';
    var uri = 'data:image/svg+xml,' + f.svg.replace(/"/g, "'").replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
    return 'url("' + uri + '") ' + f.slice.join(' ') + ' / ' + f.width.join('px ') + 'px / ' + f.outset.join('px ') + 'px stretch';
  }

  // A frost picture's border-image on a box, cut into its eight drawn pieces
  // (four corners, four edges; the middle is never drawn), so a flying copy
  // can be moved by transform alone and stay on the compositor with the
  // pop-up it rides. f = { w, h, slice, outset }: the size the picture was
  // drawn for and its frostCard slice / outset (t r b l); box = { left, top,
  // width, height } in px. Each piece is { sx, sy, sw, sh }: the part of the
  // image (natural size, w + left/right outset by h + top/bottom outset),
  // and { x, y, kx, ky }: where its top-left lands and how much it is stretched,
  // i.e. transform: translate(x, y) scale(kx, ky) from origin 0 0. Corners are
  // never stretched; edges stretch along their length only (border-image
  // stretch). Every value is linear in the box, so a straight-line box path
  // interpolates to the exact border-image on every frame. A box smaller than
  // the picture's two corners gives an edge a negative stretch: the caller
  // keeps such a picture invisible until it fits. Each corner bleeds
  // FROST_BLEED px into the edges beside it: two layers meeting at a
  // fractional pixel each anti-alias it and the background shows through as
  // a hairline, so the corner covers the seam with the same image column the
  // edge starts with.
  var FROST_BLEED = 1;
  function frostPieces(f, box) {
    var t = f.slice[0], r = f.slice[1], b = f.slice[2], l = f.slice[3];
    var iw = f.w + f.outset[1] + f.outset[3], ih = f.h + f.outset[0] + f.outset[2];
    var ax = box.left - f.outset[3], ay = box.top - f.outset[0];
    var aw = box.width + f.outset[1] + f.outset[3], ah = box.height + f.outset[0] + f.outset[2];
    var mw = iw - l - r, mh = ih - t - b; // the image's edge runs
    var dw = aw - l - r, dh = ah - t - b; // the same runs on the box
    // edges keep only the depth that has anything drawn (f.depth, from
    // frostCard), anchored on the outside: the rest is empty, and a flying
    // copy would otherwise composite all of it every frame
    var depth = f.depth || f.slice;
    var et = Math.min(t, depth[0]), er = Math.min(r, depth[1]), eb = Math.min(b, depth[2]), el = Math.min(l, depth[3]);
    var e = FROST_BLEED;
    function piece(sx, sy, sw, sh, x, y, w, h) {
      return { sx: sx, sy: sy, sw: sw, sh: sh, x: x, y: y, kx: w / sw, ky: h / sh };
    }
    // a corner: natural size, grown by the bleed toward its two edges
    function corner(sx, sy, sw, sh, x, y, inX, inY) {
      return piece(sx - (inX < 0 ? e : 0), sy - (inY < 0 ? e : 0), sw + e, sh + e, x - (inX < 0 ? e : 0), y - (inY < 0 ? e : 0), sw + e, sh + e);
    }
    return [
      corner(0, 0, l, t, ax, ay, 1, 1),                                 // top-left
      piece(l, 0, mw, et, ax + l, ay, dw, et),                          // top (the snow)
      corner(iw - r, 0, r, t, ax + aw - r, ay, -1, 1),                  // top-right
      piece(iw - er, t, er, mh, ax + aw - er, ay + t, er, dh),          // right
      corner(iw - r, ih - b, r, b, ax + aw - r, ay + ah - b, -1, -1),   // bottom-right
      piece(l, ih - eb, mw, eb, ax + l, ay + ah - eb, dw, eb),          // bottom
      corner(0, ih - b, l, b, ax, ay + ah - b, 1, -1),                  // bottom-left
      piece(0, t, el, mh, ax, ay + t, el, dh)                           // left
    ];
  }

  // How each piece of a flying copy is laid out and moved (script.js
  // frostFly), for a flight between two boxes. A piece is laid out at the
  // larger of its two end sizes, its slice of the picture stretched to fit by
  // background-size, and only ever scaled down from there: the compositor
  // rasterizes an animated layer at its largest scale, so an edge laid out at
  // the card's size and stretched 4.7x to the pop-up's was rastered at ~14x
  // on a 3x phone (perf.js modal, phone, Christmas Day: 17 missed frames a
  // run that way, 11 this way).
  // Per piece: { w, h } the layout size, { bw, bh } background-size, { bx, by }
  // background-position, and ends [at a, at b], each { x, y, kx, ky } for
  // transform: translate(x, y) scale(kx, ky) from origin 0 0. |kx|, |ky| <= 1.
  function frostFlightPieces(f, a, b) {
    var iw = f.w + f.outset[1] + f.outset[3], ih = f.h + f.outset[0] + f.outset[2];
    var pa = frostPieces(f, a), pb = frostPieces(f, b);
    return pa.map(function (p, i) {
      var q = pb[i];
      var w = Math.max(Math.abs(p.sw * p.kx), Math.abs(q.sw * q.kx)), h = Math.max(Math.abs(p.sh * p.ky), Math.abs(q.sh * q.ky));
      var fx = w / p.sw, fy = h / p.sh; // picture px to layout px
      return {
        w: w, h: h, bw: iw * fx, bh: ih * fy, bx: -p.sx * fx, by: -p.sy * fy,
        ends: [{ x: p.x, y: p.y, kx: p.kx / fx, ky: p.ky / fy }, { x: q.x, y: q.y, kx: q.kx / fx, ky: q.ky / fy }]
      };
    });
  }

  // Pop-up motion. The panel used to fly by transform: scale(sx, sy) from the
  // card's box, which squashes everything it paints: the corners turn into
  // flat ellipses (on phones, where the radius was not compensated, almost
  // square) and the shape only matches the card at the two ends. Instead the
  // panel keeps its real size and two things move together: a translate that
  // carries its top-left corner along the path, and a clip-path inset that
  // trims it down to the box on that path, with true round corners going from
  // the card's radius to the panel's. Every frame is then a real rounded box,
  // the card at one end, the panel at the other. A scale is only used for an
  // axis where the card is bigger than the panel (a clip cannot grow a box),
  // and the radius is divided by it so the corners stay round.
  // from / to: { left, top, width, height } (viewport px). r0 / r1: the card's
  // and the panel's corner radius. Returns the [card, panel] keyframes, or null
  // for unusable boxes.
  function modalMorphFrames(from, to, r0, r1) {
    var ok = function (b) { return b && isFinite(b.left) && isFinite(b.top) && b.width > 0 && b.height > 0 && isFinite(b.width) && isFinite(b.height); };
    if (!ok(from) || !ok(to)) return null;
    r0 = Math.max(0, +r0 || 0); r1 = Math.max(0, +r1 || 0);
    var n = function (v) { return +(+v).toFixed(3); };
    var sx = Math.max(1, from.width / to.width), sy = Math.max(1, from.height / to.height);
    var right = to.width - from.width / sx, bottom = to.height - from.height / sy;
    var rr = Math.min(r0, from.width / 2, from.height / 2);
    return [
      {
        transform: 'translate(' + n(from.left - to.left) + 'px, ' + n(from.top - to.top) + 'px) scale(' + n(sx) + ', ' + n(sy) + ')',
        clipPath: 'inset(0px ' + n(right) + 'px ' + n(bottom) + 'px 0px round ' + n(rr / sx) + 'px / ' + n(rr / sy) + 'px)'
      },
      {
        transform: 'translate(0px, 0px) scale(1, 1)',
        clipPath: 'inset(0px 0px 0px 0px round ' + n(r1) + 'px / ' + n(r1) + 'px)'
      }
    ];
  }

  // The outer (drop) shadows of a computed box-shadow list, inset ones
  // dropped: the clip-path that shapes a flying pop-up also cuts its drop
  // shadow off, so a shadow-only box carries it instead. '' when none.
  function outerShadows(css) {
    if (!css || css === 'none') return '';
    var parts = [], depth = 0, start = 0;
    for (var i = 0; i < css.length; i++) {
      var ch = css.charAt(i);
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { parts.push(css.slice(start, i)); start = i + 1; }
    }
    parts.push(css.slice(start));
    return parts.map(function (s) { return s.trim(); }).filter(function (s) { return s && !/\binset\b/.test(s); }).join(', ');
  }

  global.KazuLib = {
    modalMorphFrames: modalMorphFrames,
    outerShadows: outerShadows,
    BIRTH: BIRTH,
    TIMEZONE: TIMEZONE,
    escapeHtml: escapeHtml,
    safeLink: safeLink,
    MAL_HOSTS: MAL_HOSTS,
    LETTERBOXD_HOSTS: LETTERBOXD_HOSTS,
    SPOTIFY_HOSTS: SPOTIFY_HOSTS,
    stripEmoji: stripEmoji,
    ukWallParts: ukWallParts,
    newYearCelebrationYear: newYearCelebrationYear,
    fireworkSparkState: fireworkSparkState,
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
    lowPowerMode: lowPowerMode,
    isLowEndDevice: isLowEndDevice,
    squircleSDF: squircleSDF,
    squircleGrad: squircleGrad,
    liquidGlassBevel: liquidGlassBevel,
    liquidGlassDisplacement: liquidGlassDisplacement,
    petalFallDuration: petalFallDuration,
    sunTimesUK: sunTimesUK,
    skyArcPoint: skyArcPoint,
    skyBodyState: skyBodyState,
    skyTint: skyTint,
    hslToHex: hslToHex,
    steamAppId: steamAppId,
    steamStoreUrl: steamStoreUrl,
    steamIsSoftware: steamIsSoftware,
    steamHoursText: steamHoursText,
    discordCacheParse: discordCacheParse,
    malRow: malRow,
    malListRow: malListRow,
    malCacheParse: malCacheParse,
    malMangaRow: malMangaRow,
    malMangaListRow: malMangaListRow,
    malMangaCacheParse: malMangaCacheParse,
    malIdFromUrl: malIdFromUrl,
    anilistTitlesQuery: anilistTitlesQuery,
    anilistTitlesParse: anilistTitlesParse,
    malJaCacheParse: malJaCacheParse,
    ratingStars: ratingStars,
    letterboxdWatchedLabel: letterboxdWatchedLabel,
    parseLetterboxdRss: parseLetterboxdRss,
    letterboxdCacheParse: letterboxdCacheParse,
    listenbrainzRow: listenbrainzRow,
    xmlText: xmlText,
    ytArtistName: ytArtistName,
    parseYouTubePlaylistRss: parseYouTubePlaylistRss,
    ytPlaylistCacheParse: ytPlaylistCacheParse,
    forecastRows: forecastRows,
    konamiMatch: konamiMatch,
    devCodeMatch: devCodeMatch,
    sakuraInBloom: sakuraInBloom,
    sunsetGlow: sunsetGlow,
    timeOverrideParse: timeOverrideParse,
    weatherFxAllowed: weatherFxAllowed,
    seasonDevApply: seasonDevApply,
    seasonDevParse: seasonDevParse,
    devModeParse: devModeParse,
    balloonDriftStep: balloonDriftStep,
    ropeStep: ropeStep,
    scrollThumbGeometry: scrollThumbGeometry,
    scrollThumbScrollY: scrollThumbScrollY,
    wheelDeltaPx: wheelDeltaPx,
    smoothScrollStep: smoothScrollStep,
    FROST_RISE: FROST_RISE,
    FROST_SIDE: FROST_SIDE,
    frostReach: frostReach,
    frostCard: frostCard,
    frostBorderImage: frostBorderImage,
    chiikawaPeekMode: chiikawaPeekMode,
    chiikawaPeekDelay: chiikawaPeekDelay,
    frostPieces: frostPieces,
    frostFlightPieces: frostFlightPieces,
    FROST_BLEED: FROST_BLEED,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
