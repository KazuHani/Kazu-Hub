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
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
