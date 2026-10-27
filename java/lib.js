/* ============================================================================
   lib.js — pure, DOM-free helpers for Kazu Hub.
   ----------------------------------------------------------------------------
   Single source of truth for the birth config plus the deterministic
   calculations behind the cards and the sky (UK time and DST, birthday
   countdown, sun and sky maths, card caches, API shaping). No `document`,
   no `fetch` — so it is reusable by script.js and runs under plain Node.
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

  // ---- Low-end devices -----------------------------------------------------
  // Gates the heavy refractive SVG displacement maps (script.js) off on
  // constrained hardware to keep the page at 60/120 FPS.
  function isLowEndDevice(o) {
    o = o || {};
    if (o.saveData || o.reducedMotion || o.reducedTransparency) return true;
    if (o.lowMemory && o.lowConcurrency) return true;
    if (o.coarsePointer && (o.smallScreen || o.lowConcurrency)) return true;
    if (o.lowMemory && o.smallScreen) return true;
    return false;
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
  function skyTint(ukMinutes, dayOfYear) {
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
      h: +(215 + 22 * dusk).toFixed(2),
      s: +(33 + 9 * dusk).toFixed(2),
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
  // first paint is already right (keep the two in step). Junk time input
  // yields null.
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
  // pattern lives in the #boot-tint script (keep them in step).
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

  // ---- Live-card cache: paint the last copy at once, refetch only when due ----
  // Every live card keeps its last good answer in localStorage, stamped
  // { at, id, ...payload }: `at` is when it was fetched (Date.now()) and `id`
  // the account the card shows (Discord user id, Steam vanity, MAL user,
  // Letterboxd user, playlist id). On load script.js paints that copy in its
  // boot task, then asks the API again only once the copy is older than
  // the card's own poll interval (pollDelay). A reload inside the interval
  // costs no request at all, and a reload after it never shows anything older
  // than a tab left open would have.
  //
  // cardCacheMeta reads the envelope only; each card's *CacheParse reads and
  // sanitises the payload. `id` null means the card has no account (weather,
  // the quote). Returns:
  //   { paint: false, at: 0 }  nothing usable, or a copy of ANOTHER account
  //                            (the control panel changed the id since);
  //   { paint: true, at: 0 }   usable but unowned (written before copies named
  //                            their account) or unstamped: paint it, but it
  //                            never stands in for a fetch;
  //   { paint: true, at: ms }  paint it; fresh while younger than the interval.
  function cardCacheMeta(raw, id) {
    var p = null;
    if (typeof raw === 'string' && raw) { try { p = JSON.parse(raw); } catch (e) { p = null; } }
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { paint: false, at: 0 };
    var named = typeof p.id === 'string';
    var owned = id == null || (named && p.id === String(id));
    if (!owned && named) return { paint: false, at: 0 };
    var at = (typeof p.at === 'number' && isFinite(p.at) && p.at > 0) ? p.at : 0;
    return { paint: true, at: owned ? at : 0 };
  }

  // Is data fetched at `at` still inside its poll interval? A stamp in the
  // future (the clock moved back since) never counts as fresh.
  function cardCacheFresh(at, ms, now) {
    var age = now - at;
    return at > 0 && ms > 0 && age >= 0 && age < ms;
  }

  // How long a poller waits before its next run when polling (re)starts: on
  // page load, and when a hidden tab comes back.
  //   last        when its data was last fetched, this visit or the stored
  //               copy's stamp (0 = never)
  //   ms          its poll interval
  //   firstDelay  its rung on the staged-boot ladder (0 = none)
  //   ran         has it run yet in this page visit?
  // Fresh data waits out the rest of its interval. Anything older is due now,
  // except that a card's first run of the visit still waits for its rung, so
  // the boot never piles every fetch into one task.
  function pollDelay(last, ms, firstDelay, ran, now) {
    if (cardCacheFresh(last, ms, now)) return ms - (now - last);
    return ran ? 0 : (firstDelay > 0 ? firstDelay : 0);
  }

  // A stored status (Discord presence, Steam's online state and game) is
  // painted as it was for this long. A reload a few minutes later almost
  // always finds the same presence, so the card comes up exactly as it was
  // left; past this the copy is more likely wrong than right, and it is shown
  // offline with no activity until the live answer lands (about a second).
  var PRESENCE_KEEP_MS = 10 * 60 * 1000;
  function presenceKept(payload, now) {
    return typeof now === 'number' && !!payload && typeof payload.at === 'number' &&
      now - payload.at >= 0 && now - payload.at < PRESENCE_KEEP_MS;
  }

  // A stored string the card prints, or '' (wrong type, or long enough to be junk).
  function cacheText(v, max) {
    return (typeof v === 'string' && v.length <= (max || 300)) ? v : '';
  }
  // A stored image address: https only, or ''. Images are never links, but a
  // copy in localStorage is still checked like one.
  function cacheImage(v) {
    return (typeof v === 'string' && v.length <= 2048 && /^https:\/\/[^\s"'<>]+$/.test(v)) ? v : '';
  }
  function cacheTime(v) {
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  }

  // ---- Discord presence (localStorage copy) ---------------------------------
  // Reads the stored Lanyard payload (written after every live REST answer or
  // WebSocket update). Without `now`, or once the copy is older than
  // PRESENCE_KEEP_MS, only the identity survives and the status is forced to
  // offline, so stale presence is never represented as active: that is the
  // copy the card falls back to while Lanyard is unreachable. With `now` and a
  // copy inside the window, the presence comes back too (status, platform,
  // game, custom status, Spotify), each field type-checked: the Spotify track
  // id is spliced into a link, so it must be plain letters and digits.
  var DISCORD_STATUSES = { online: 1, idle: 1, dnd: 1, offline: 1 };
  function discordActivityCopy(a) {
    if (!a || (a.type !== 0 && a.type !== 4)) return null;
    var out = { type: a.type };
    ['name', 'details', 'state'].forEach(function (k) { var v = cacheText(a[k]); if (v) out[k] = v; });
    var start = cacheTime(a.timestamps && a.timestamps.start);
    if (start) out.timestamps = { start: start };
    if (a.assets && typeof a.assets === 'object') {
      var assets = {};
      ['large_image', 'small_image'].forEach(function (k) { var v = cacheText(a.assets[k], 1024); if (v && !/[\s"'<>]/.test(v)) assets[k] = v; });
      if (assets.large_image || assets.small_image) out.assets = assets;
    }
    if (typeof a.application_id === 'string' && /^\d{1,25}$/.test(a.application_id)) out.application_id = a.application_id;
    return out;
  }
  function discordCacheParse(raw, now) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    var data = payload && (payload.data || payload);
    var u = data && data.discord_user;
    if (!u || typeof u !== 'object') return null;
    if (typeof u.username !== 'string' || !u.username) return null;
    var out = {
      discord_user: {
        id: typeof u.id === 'string' ? u.id : String(u.id || ''),
        username: u.username,
        global_name: (typeof u.global_name === 'string' && u.global_name) ? u.global_name : ((typeof u.display_name === 'string' && u.display_name) ? u.display_name : u.username),
        avatar: typeof u.avatar === 'string' ? u.avatar : null,
      },
      discord_status: 'offline',
      activities: [],
    };
    if (!presenceKept(payload, now)) return out;
    out.discord_status = DISCORD_STATUSES[data.discord_status] ? data.discord_status : 'offline';
    ['active_on_discord_mobile', 'active_on_discord_desktop', 'active_on_discord_web'].forEach(function (k) {
      if (data[k] === true) out[k] = true;
    });
    out.activities = (Array.isArray(data.activities) ? data.activities : [])
      .slice(0, 10).map(discordActivityCopy).filter(Boolean);
    var sp = data.spotify;
    var song = sp && typeof sp === 'object' ? cacheText(sp.song) : '';
    if (data.listening_to_spotify === true && song) {
      var ts = sp.timestamps || {};
      var start = cacheTime(ts.start), end = cacheTime(ts.end);
      out.listening_to_spotify = true;
      out.spotify = {
        song: song,
        artist: cacheText(sp.artist),
        album_art_url: cacheImage(sp.album_art_url),
        track_id: (typeof sp.track_id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(sp.track_id)) ? sp.track_id : null,
        timestamps: (start && end && end > start) ? { start: start, end: end } : null,
      };
    }
    return out;
  }

  // ---- Steam profile (localStorage copy) ------------------------------------
  // The Steam card's last good profile in the shape script.js builds from the
  // profile XML: { avatar, state, game: { name, url } | null, recent: [{ name,
  // logo, url, hoursPlayed, hoursOnRecord }] }. Store links are rebuilt from
  // the app id (steamStoreUrl: a fixed host plus digits), images must be https,
  // and the hours line is recomputed from numbers at render, so nothing stored
  // reaches the page as markup or as a foreign link. Status and the current
  // game follow PRESENCE_KEEP_MS like Discord's. Same contract as
  // malCacheParse otherwise: the sanitised profile, or null.
  var STEAM_STATES = { 'in-game': 1, online: 1, away: 1, offline: 1 };
  function steamCacheParse(raw, now) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    var d = payload && payload.data;
    if (!d || typeof d !== 'object') return null;
    var avatar = cacheImage(d.avatar);
    if (!avatar || !Array.isArray(d.recent)) return null;
    var recent = [];
    for (var i = 0; i < d.recent.length && i < 3; i++) {
      var g = d.recent[i];
      var name = g && cacheText(g.name, 200);
      if (!name) return null;
      recent.push({
        name: name,
        logo: cacheImage(g.logo),
        url: steamStoreUrl(g.url) || '',
        hoursPlayed: (typeof g.hoursPlayed === 'number' && g.hoursPlayed >= 0) ? g.hoursPlayed : 0,
        hoursOnRecord: (typeof g.hoursOnRecord === 'number' && g.hoursOnRecord >= 0) ? g.hoursOnRecord : 0,
      });
    }
    var live = presenceKept(payload, now);
    var gameName = live && d.game ? cacheText(d.game.name, 200) : '';
    return {
      avatar: avatar,
      state: live && STEAM_STATES[d.state] ? d.state : 'offline',
      game: gameName ? { name: gameName, url: steamStoreUrl(d.game.url) || '' } : null,
      recent: recent,
    };
  }

  // ---- Weather (localStorage copy) ------------------------------------------
  // The Open-Meteo answer the weather card was drawn from, numbers only. The
  // forecast's first row is labelled "Today" (forecastRows), so a copy whose
  // first day is not today's UK date is refused outright: past midnight it
  // would put yesterday's forecast under today's name. Returns { current,
  // daily } in Open-Meteo's own field names, or null.
  var WEATHER_DAILY_KEYS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'];
  function weatherCacheParse(raw, todayIso) {
    if (typeof raw !== 'string' || !raw) return null;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) { return null; }
    var d = payload && payload.data;
    var c = d && d.current;
    if (!c || typeof c !== 'object') return null;
    var num = function (v) { return typeof v === 'number' && isFinite(v); };
    if (!num(c.weather_code) || !num(c.temperature_2m) || !num(c.wind_speed_10m) || (c.is_day !== 0 && c.is_day !== 1)) return null;
    var current = {
      weather_code: c.weather_code, temperature_2m: c.temperature_2m, wind_speed_10m: c.wind_speed_10m, is_day: c.is_day,
      cloud_cover: num(c.cloud_cover) ? c.cloud_cover : null,
      wind_direction_10m: num(c.wind_direction_10m) ? c.wind_direction_10m : null,
    };
    var dl = d.daily;
    var time = dl && Array.isArray(dl.time) ? dl.time : null;
    if (!time || !time.length || time.length > 16) return null;
    for (var i = 0; i < time.length; i++) if (typeof time[i] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(time[i])) return null;
    if (typeof todayIso === 'string' && time[0] !== todayIso) return null;
    var daily = { time: time.slice() };
    WEATHER_DAILY_KEYS.forEach(function (k) {
      daily[k] = time.map(function (_, j) { var v = Array.isArray(dl[k]) ? dl[k][j] : null; return num(v) ? v : null; });
    });
    return { current: current, daily: daily };
  }

  // Today's date on the UK clock as 'YYYY-MM-DD' (Open-Meteo's daily.time is
  // asked for in Europe/London, so this is the day its first row is).
  function ukDateIso(date) {
    var w = ukWallParts(date);
    return w.year + '-' + pad(w.month + 1) + '-' + pad(w.day);
  }

  // ---- Failure memory for flaky hosts ---------------------------------------
  // The free CORS proxies and Jikan fail in long stretches (DNS gone, 429 after
  // a burst, 12 s timeouts). Without memory every poll of every card retried
  // them, which is what earned the 429s and a console full of errors. down()
  // says whether a key is still resting; fail() rests it for `ms`; ok() clears
  // it. Time is passed in so the maths is testable.
  function backoffCreate(ms) {
    var until = {};
    return {
      down: function (key, now) { return (until[key] || 0) > now; },
      fail: function (key, now) { until[key] = now + ms; },
      ok: function (key) { delete until[key]; },
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
  // The review text, when the entry has one: the description's <p> blocks after
  // the poster, minus the "Watched on ..." line Letterboxd writes for a plain
  // log and the spoiler notice. Tags stripped, entities decoded, capped.
  function letterboxdReview(desc) {
    var paras = String(desc || '').match(/<p>[\s\S]*?<\/p>/g) || [];
    var out = [];
    for (var i = 0; i < paras.length; i++) {
      var p = paras[i];
      if (/<img\b/.test(p)) continue;
      var txt = p.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;/g, "'")
        .replace(/\s+/g, ' ').trim();
      if (!txt || /^Watched on /i.test(txt) || /^This review may contain spoilers/i.test(txt)) continue;
      out.push(txt);
    }
    var s = out.join(' ');
    return s.length > 320 ? s.slice(0, 317).replace(/\s+\S*$/, '') + '...' : s;
  }

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
      review: letterboxdReview(desc),
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
      review: typeof e2.review === 'string' ? e2.review.slice(0, 330) : '',
    };
  }

  // ---- Latest finished anime with your review --------------------------------
  // One entry of Jikan's /users/{user}/reviews (anime only, spoilers skipped),
  // shaped for the top of the MAL card. `date` is the review date as a
  // 'YYYY-MM-DD' string; script.js swaps in the finish date when MAL's list has it.
  function malReviewRow(item) {
    if (!item || item.type !== 'anime' || item.is_spoiler) return null;
    var entry = item.entry || {};
    var url = safeLink(entry.url, MAL_HOSTS);
    var id = malIdFromUrl(url);
    var title = typeof entry.title === 'string' ? entry.title.trim() : '';
    var text = typeof item.review === 'string' ? item.review.replace(/\s+/g, ' ').trim() : '';
    if (!url || !id || !title || !text) return null;
    var img = '';
    var jpg = entry.images && entry.images.jpg;
    if (jpg && typeof jpg.image_url === 'string' && /^https:\/\/cdn\.myanimelist\.net\//.test(jpg.image_url)) img = jpg.image_url;
    var score = (typeof item.score === 'number' && item.score >= 1 && item.score <= 10) ? Math.round(item.score) : null;
    var d = /^(\d{4}-\d{2}-\d{2})/.exec(String(item.date || ''));
    return {
      id: id, url: url, title: title, img: img, score: score,
      text: text.length > 320 ? text.slice(0, 317).replace(/\s+\S*$/, '') + '...' : text,
      date: d ? d[1] : ''
    };
  }

  // The finish date of one anime from MAL's completed list (load.json, status 2):
  // finish_date_string is "mm-dd-yy". Returns 'YYYY-MM-DD' or '' (not found, no
  // date, or unreadable).
  function malFinishDate(list, id) {
    if (!Array.isArray(list)) return '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.anime_id !== id) continue;
      var m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(String(e.finish_date_string || ''));
      if (!m) return '';
      var mon = +m[1], day = +m[2];
      if (mon > 12 && day <= 12) { mon = +m[2]; day = +m[1]; }
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return '';
      return (2000 + +m[3]) + '-' + pad(mon) + '-' + pad(day);
    }
    return '';
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
  // the UK wall date. The same two numbers live in
  // the inline #boot-tint script in index.html (it sets html.no-sakura before
  // first paint); keep the two in step.
  var SAKURA_FIRST = 2 * 100 + 20; // 20 March  (month * 100 + day)
  var SAKURA_LAST = 4 * 100 + 10;  // 10 May
  function sakuraInBloom(month, day) {
    var m = +month, d = +day;
    if (isNaN(m) || isNaN(d)) return false;
    var key = m * 100 + d;
    return key >= SAKURA_FIRST && key <= SAKURA_LAST;
  }

  // Season-trigger overrides from the dev panel. Each season (only sakura is left) is 'auto'
  // (follow the clock — the default, never stored), 'on' (forced live), or
  // 'off' (forced dark). Unknown keys and values are ignored, so a
  // hand-edited localStorage blob can never wedge the seasons.
  var DEV_SEASON_KEYS = ['sakura'];
  function seasonDevApply(state, overrides) {
    var s = state || {};
    var out = { sakura: !!s.sakura };
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

  // ---- Custom scrollbar geometry -------------------------------------------
  // Pure maths behind the JS-built page scroller (see the custom-scrollbar
  // IIFE in script.js). scrollThumbGeometry maps the document's scroll state
  // onto the on-screen track; scrollThumbScrollY is the inverse mapping used
  // while dragging the thumb. Kept DOM-free; edge cases are the min thumb
  // size, clamping and "nothing to scroll".
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
    safeLink: safeLink,
    stripEmoji: stripEmoji,
    ukWallParts: ukWallParts,
    newYearCelebrationYear: newYearCelebrationYear,
    fireworkSparkState: fireworkSparkState,
    isUkBST: isUkBST,
    birthdayCountdownParts: birthdayCountdownParts,
    openMeteoUrl: openMeteoUrl,
    atmosphereMode: atmosphereMode,
    particleCount: particleCount,
    lowPowerMode: lowPowerMode,
    isLowEndDevice: isLowEndDevice,
    petalFallDuration: petalFallDuration,
    skyArcPoint: skyArcPoint,
    skyBodyState: skyBodyState,
    skyTint: skyTint,
    hslToHex: hslToHex,
    steamStoreUrl: steamStoreUrl,
    steamIsSoftware: steamIsSoftware,
    steamHoursText: steamHoursText,
    cardCacheMeta: cardCacheMeta,
    cardCacheFresh: cardCacheFresh,
    pollDelay: pollDelay,
    PRESENCE_KEEP_MS: PRESENCE_KEEP_MS,
    discordCacheParse: discordCacheParse,
    steamCacheParse: steamCacheParse,
    weatherCacheParse: weatherCacheParse,
    ukDateIso: ukDateIso,
    backoffCreate: backoffCreate,
    malRow: malRow,
    malListRow: malListRow,
    malCacheParse: malCacheParse,
    malMangaRow: malMangaRow,
    malMangaListRow: malMangaListRow,
    malMangaCacheParse: malMangaCacheParse,
    malIdFromUrl: malIdFromUrl,
    malReviewRow: malReviewRow,
    malFinishDate: malFinishDate,
    anilistTitlesQuery: anilistTitlesQuery,
    anilistTitlesParse: anilistTitlesParse,
    malJaCacheParse: malJaCacheParse,
    parseLetterboxdRss: parseLetterboxdRss,
    letterboxdCacheParse: letterboxdCacheParse,
    listenbrainzRow: listenbrainzRow,
    xmlText: xmlText,
    parseYouTubePlaylistRss: parseYouTubePlaylistRss,
    ytPlaylistCacheParse: ytPlaylistCacheParse,
    konamiMatch: konamiMatch,
    devCodeMatch: devCodeMatch,
    sakuraInBloom: sakuraInBloom,
    sunsetGlow: sunsetGlow,
    timeOverrideParse: timeOverrideParse,
    weatherFxAllowed: weatherFxAllowed,
    seasonDevApply: seasonDevApply,
    seasonDevParse: seasonDevParse,
    devModeParse: devModeParse,
    scrollThumbGeometry: scrollThumbGeometry,
    scrollThumbScrollY: scrollThumbScrollY,
    wheelDeltaPx: wheelDeltaPx,
    smoothScrollStep: smoothScrollStep,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
