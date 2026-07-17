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

  function birthDate() { return new Date(BIRTH.year, BIRTH.month, BIRTH.day, 0, 0, 0); }

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
    var birth = birthDate();

    var years = now.getFullYear() - birth.getFullYear();
    var months = now.getMonth() - birth.getMonth();
    var days = now.getDate() - birth.getDate();
    if (days < 0) {
      months--;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); // days in previous month
    }
    if (months < 0) { years--; months += 12; }

    var msAlive = now - birth;
    var totalDays = Math.floor(msAlive / 86400000);
    var totalWeeks = Math.floor(totalDays / 7);
    var totalHours = Math.floor(msAlive / 3600000);
    var nextMilestoneDays = (Math.floor(totalDays / 1000) + 1) * 1000;
    var nextMilestoneOn = new Date(birth.getTime() + nextMilestoneDays * 86400000);
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
    return Math.floor((now - birthDate()) / (7 * 86400000));
  }

  // ---- Birthday countdown ------------------------------------------------
  function birthdayCountdownParts(now) {
    now = now || new Date();
    var age = now.getFullYear() - BIRTH.year;
    var m = now.getMonth(), d = now.getDate();
    var hadBday = (m > BIRTH.month) || (m === BIRTH.month && d >= BIRTH.day);
    if (!hadBday) age--;

    var target = new Date(now.getFullYear(), BIRTH.month, BIRTH.day, 0, 0, 0);
    var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (todayMid > target) target = new Date(now.getFullYear() + 1, BIRTH.month, BIRTH.day, 0, 0, 0);

    var totalSec = Math.max(0, Math.floor((target - now) / 1000));
    return {
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      calDays: Math.round((target - todayMid) / 86400000), // whole calendar days, matches the card
      targetDate: target,
      turning: age + 1,
      isToday: (m === BIRTH.month && d === BIRTH.day),
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
    var birth = birthDate();
    var z = zodiac(BIRTH.month, BIRTH.day);
    return {
      starSign: z.name,
      starGlyph: z.glyph,
      weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(birth),
      dateLabel: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(birth),
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
    var date = opts.date || birthdayCountdownParts(new Date()).targetDate;
    var start = ymd(date.getFullYear(), date.getMonth(), date.getDate());
    var endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    var end = ymd(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
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
