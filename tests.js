/* ============================================================================
   tests.js — headless gate tests for lib.js (mirror of tests.html).
   ----------------------------------------------------------------------------
   lib.js is DOM-free, so the same assertions that tests.html runs in the
   browser run here under plain Node: no dependencies, no network, <1s.
   The GitHub Action (.github/workflows/test.yml) runs this file under several
   TZ values to prove the UK wall-clock maths is timezone-independent.

   Run locally:  node tests.js
   Exit code 0 = all passed, 1 = at least one failure.
   ========================================================================== */
'use strict';

require('./lib.js');
const L = globalThis.KazuLib;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, '→', detail); }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}

ok('KazuLib loaded', !!L);

// ---- escapeHtml (guards innerHTML interpolation of API strings) ----
eq('escapes all five specials', L.escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
eq('leaves safe text alone', L.escapeHtml('Baldur’s Gate 3'), 'Baldur’s Gate 3');
eq('handles non-strings', L.escapeHtml(null), '');
eq('escapes ampersand first', L.escapeHtml('a&b<c'), 'a&amp;b&lt;c');

// ---- UK wall-clock frame (machine/timezone independent) ----
eq('ukWallParts: BST is UTC+1', (function () { const w = L.ukWallParts(new Date(Date.UTC(2026, 6, 15, 23, 30))); return [w.year, w.month, w.day, w.hours, w.minutes]; })(), [2026, 6, 16, 0, 30]);
eq('ukWallParts: GMT is UTC+0', (function () { const w = L.ukWallParts(new Date(Date.UTC(2026, 0, 15, 23, 30))); return [w.year, w.month, w.day, w.hours, w.minutes]; })(), [2026, 0, 15, 23, 30]);

// ---- UK DST ----
const marF = L.nextUkDstTransition(new Date(Date.UTC(2026, 0, 15)));
eq('next DST from Jan 2026 → forward', marF.direction, 'forward');
ok('forward date = Sun 29 Mar 2026', marF.date.getUTCMonth() === 2 && marF.date.getUTCDate() === 29, marF.date.toUTCString());
const octB = L.nextUkDstTransition(new Date(Date.UTC(2026, 5, 15)));
eq('next DST from Jun 2026 → back', octB.direction, 'back');
ok('back date = Sun 25 Oct 2026', octB.date.getUTCMonth() === 9 && octB.date.getUTCDate() === 25, octB.date.toUTCString());
const nxt = L.nextUkDstTransition(new Date(Date.UTC(2026, 10, 15)));
ok('after Oct → forward Mar 2027', nxt.direction === 'forward' && nxt.date.getUTCFullYear() === 2027, nxt.date.toUTCString());
ok('July is BST', L.isUkBST(new Date(Date.UTC(2026, 6, 1))) === true);
ok('January is not BST', L.isUkBST(new Date(Date.UTC(2026, 0, 1))) === false);

// ---- Birthday countdown ----
const p = L.birthdayCountdownParts(new Date(Date.UTC(2026, 5, 27, 12, 0, 0))); // 27 Jun 2026, noon UTC
eq('calendar days to birthday = 135', p.calDays, 135);
eq('turning 25', p.turning, 25);
eq('ageNow 24 on 27 Jun 2026', p.ageNow, 24);
ok('isToday true on 9 Nov 2026', L.birthdayCountdownParts(new Date(Date.UTC(2026, 10, 9, 9, 0, 0))).isToday === true);

// UK wall-clock boundaries: the same instants must give the same answer
// on any machine, in any timezone.
const eve = L.birthdayCountdownParts(new Date(Date.UTC(2026, 10, 8, 23, 30))); // 8 Nov 23:30 UK
ok('birthday eve: not today, 1 day left', eve.isToday === false && eve.calDays === 1, JSON.stringify(eve));
const onDay = L.birthdayCountdownParts(new Date(Date.UTC(2026, 10, 9, 0, 30))); // 9 Nov 00:30 UK
ok('on the day: isToday, 0 days, ageNow 25', onDay.isToday === true && onDay.calDays === 0 && onDay.ageNow === 25, JSON.stringify(onDay));
const summerEdge = L.birthdayCountdownParts(new Date(Date.UTC(2026, 5, 27, 23, 30))); // = 28 Jun 00:30 BST
eq('28 Jun BST: 134 days left', summerEdge.calDays, 134);

// ---- Age ----
const a = L.ageBreakdown(new Date(Date.UTC(2026, 5, 27, 12, 0, 0)));
eq('age years on 27 Jun 2026 = 24', a.years, 24);
eq('breakdown = 24y 7m 18d', [a.years, a.months, a.days], [24, 7, 18]);
ok('totalDays > 8000', a.totalDays > 8000, a.totalDays);
ok('next milestone is a future multiple of 1000', a.nextMilestoneDays % 1000 === 0 && a.nextMilestoneDays > a.totalDays, a.nextMilestoneDays);
ok('lifeWeeksLived ≈ totalDays/7', Math.abs(L.lifeWeeksLived(new Date(Date.UTC(2026, 5, 27))) - Math.floor(a.totalDays / 7)) <= 1);
eq('still 24 at 8 Nov 23:30 UK', L.ageBreakdown(new Date(Date.UTC(2026, 10, 8, 23, 30))).years, 24);
eq('25 at 9 Nov 00:30 UK', L.ageBreakdown(new Date(Date.UTC(2026, 10, 9, 0, 30))).years, 25);

// ---- Star sign + birth facts ----
const f = L.birthFacts();
eq('star sign = Scorpio', f.starSign, 'Scorpio');
eq('born on a Friday', f.weekday, 'Friday');
eq('zodiac Nov 25 = Sagittarius', L.zodiac(10, 25).name, 'Sagittarius');
eq('zodiac Jan 1 = Capricorn', L.zodiac(0, 1).name, 'Capricorn');

// ---- ICS ----
const ics = L.buildBirthdayICS({ summary: 'Test BD' });
ok('ICS wrapped in VCALENDAR', /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/.test(ics));
ok('ICS DTSTART all-day …1109', /DTSTART;VALUE=DATE:\d{4}1109/.test(ics));
ok('ICS DTEND next day …1110', /DTEND;VALUE=DATE:\d{4}1110/.test(ics));
ok('ICS yearly recurrence', /RRULE:FREQ=YEARLY/.test(ics));
ok('ICS 1-day-before alarm', /BEGIN:VALARM[\s\S]*TRIGGER:-P1D[\s\S]*END:VALARM/.test(ics));
ok('ICS uses CRLF line endings', ics.indexOf('\r\n') > -1);

// ---- Google Calendar URL ----
const g = L.googleCalendarUrl({ summary: 'Kazu BD', date: new Date(Date.UTC(2026, 10, 9)), details: 'hi' });
ok('Google action=TEMPLATE', g.indexOf('action=TEMPLATE') > -1);
ok('Google dates 20261109/20261110', g.indexOf('dates=20261109/20261110') > -1, g);
ok('Google yearly recurrence', g.indexOf('FREQ%3DYEARLY') > -1, g);

// ---- nullschool URL ----
ok('nullschool orthographic, UK-centred', L.nullschoolUrl({ lon: -2.5, lat: 54.5, zoom: 2800 }).indexOf('orthographic=-2.50,54.50,2800') > -1);

console.log('---');
console.log('TZ=' + (process.env.TZ || '(system default)') + ': ' +
  (fail === 0 ? ('ALL ' + pass + ' PASSED') : (pass + ' passed, ' + fail + ' FAILED')));
process.exit(fail ? 1 : 0);
