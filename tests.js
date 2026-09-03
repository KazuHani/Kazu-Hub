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
ok('fullMoons ≈ days/29.53', Math.abs(a.fullMoons - Math.floor(a.totalDays / 29.530589)) <= 1, a.fullMoons);
ok('orbits between 24 and 25 on 27 Jun 2026', a.orbits > 24 && a.orbits < 25, a.orbits);
ok('asleepYears = orbits/3', Math.abs(a.asleepYears - a.orbits / 3) < 1e-9);
ok('breaths ≈ 16/min', Math.abs(a.breaths - a.totalHours * 60 * 16) <= 60 * 16, a.breaths);
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

// ---- atmosphereMode (weather-reactive particles) ----
eq('drizzle 51 → rain', L.atmosphereMode(51), 'rain');
eq('rain 61 → rain', L.atmosphereMode(61), 'rain');
eq('showers 80 → rain', L.atmosphereMode(80), 'rain');
eq('thunderstorm 95 → rain', L.atmosphereMode(95), 'rain');
eq('snow 71 → blossom-heavy', L.atmosphereMode(71), 'blossom-heavy');
eq('heavy snow 75 → blossom-heavy', L.atmosphereMode(75), 'blossom-heavy');
eq('snow showers 86 → blossom-heavy', L.atmosphereMode(86), 'blossom-heavy');
eq('clear 0 → blossom', L.atmosphereMode(0), 'blossom');
eq('overcast 3 → blossom', L.atmosphereMode(3), 'blossom');
eq('fog 45 → blossom', L.atmosphereMode(45), 'blossom');
eq('garbage → blossom', L.atmosphereMode('abc'), 'blossom');
eq('null → blossom', L.atmosphereMode(null), 'blossom');
// aurora: clear or mainly clear, after dark only
eq('clear 0 + night → aurora', L.atmosphereMode(0, false), 'aurora');
eq('mainly clear 1 + night → aurora', L.atmosphereMode(1, false), 'aurora');
eq('clear 0 + day → blossom', L.atmosphereMode(0, true), 'blossom');
eq('clear 0 + isDay omitted → blossom (legacy)', L.atmosphereMode(0), 'blossom');
eq('rain 61 + night → still rain', L.atmosphereMode(61, false), 'rain');
eq('snow 71 + night → still blossom-heavy', L.atmosphereMode(71, false), 'blossom-heavy');
eq('overcast 3 + night → blossom', L.atmosphereMode(3, false), 'blossom');

// ---- sunTimesUK + skyBodyState (sun/moon arc on UK wall time) ----
eq('summer solstice sun times', L.sunTimesUK(172), { rise: 300, set: 1290 });
eq('winter solstice sun times', L.sunTimesUK(355), { rise: 495, set: 960 });
eq('junk day → solstice default', L.sunTimesUK('nope'), { rise: 300, set: 1290 });
eq('out-of-range day → solstice default', L.sunTimesUK(400), { rise: 300, set: 1290 });
eq('skyArcPoint starts at the left horizon', L.skyArcPoint(0), { x: 6, y: 52, alt: 0 });
eq('skyArcPoint crests at the default profile height', L.skyArcPoint(0.5), { x: 50, y: 19, alt: 1 });
eq('skyArcPoint accepts the responsive profile height', L.skyArcPoint(0.5, 23.5), { x: 50, y: 23.5, alt: 1 });
eq('skyArcPoint ends at the right horizon', L.skyArcPoint(1), { x: 94, y: 52, alt: 0 });
eq('skyArcPoint clamps off-path progress', L.skyArcPoint(-1), { x: 6, y: 52, alt: 0 });
eq('skyArcPoint rejects junk progress', L.skyArcPoint('nope'), null);
eq('clock noon: summer sun crests dead centre behind the profile', L.skyBodyState(720, 172), { body: 'sun', x: 50, y: 19, alt: 1, low: false });
eq('clock noon: winter sun crests dead centre too', L.skyBodyState(720, 355), { body: 'sun', x: 50, y: 19, alt: 1, low: false });
eq('clock midnight: summer moon crests dead centre', L.skyBodyState(0, 172), { body: 'moon', x: 50, y: 19, alt: 1, low: false });
eq('clock midnight: winter moon crests dead centre too', L.skyBodyState(0, 355), { body: 'moon', x: 50, y: 19, alt: 1, low: false });
eq('summer 1pm: sun past the crest, descending', L.skyBodyState(780, 172), { body: 'sun', x: 54.63, y: 19.45, alt: 0.986, low: false });
eq('sunrise: left horizon, golden', L.skyBodyState(300, 172), { body: 'sun', x: 6, y: 52, alt: 0, low: true });
eq('just before sunset: right horizon, golden', L.skyBodyState(1289, 172), { body: 'sun', x: 93.92, y: 51.91, alt: 0.003, low: true });
eq('winter midday is still the sun', L.skyBodyState(727, 355), { body: 'sun', x: 51.28, y: 19.03, alt: 0.999, low: false });
eq('winter 1am: moon past the top', L.skyBodyState(60, 355), { body: 'moon', x: 55.33, y: 19.6, alt: 0.982, low: false });
eq('clock noon follows a supplied profile height', L.skyBodyState(720, 172, 23.5), { body: 'sun', x: 50, y: 23.5, alt: 1, low: false });
ok('arc travels left → right through the day', L.skyBodyState(600, 172).x < L.skyBodyState(900, 172).x);
eq('junk time → null', L.skyBodyState('abc'), null);
eq('null time coerces to UK midnight (moon)', L.skyBodyState(null).body, 'moon');

// ---- skyTint + hslToHex (time-of-day page palette) ----
eq('summer midnight: deep-night palette', L.skyTint(0, 172), { h: 215.97, s: 33.4, l: 9, daylight: 0, dusk: 0.0439 });
eq('summer solar peak: gentle daylight', L.skyTint(780, 172), { h: 215, s: 33, l: 21.99, daylight: 0.9989, dusk: 0 });
eq('sunset: indigo dusk blush at full strength', L.skyTint(1290, 172), { h: 237, s: 42, l: 9, daylight: 0, dusk: 1 });
eq('winter midday still lightens', L.skyTint(760, 355), { h: 215.09, s: 33.03, l: 21.69, daylight: 0.976, dusk: 0.0039 });
ok('night is darker than midday', L.skyTint(0, 172).l < L.skyTint(780, 172).l);
eq('junk tint time → null', L.skyTint('abc', 172), null);
eq('hslToHex primaries', [L.hslToHex(0, 100, 50), L.hslToHex(-120, 100, 50), L.hslToHex(120, 100, 50)], ['#ff0000', '#0000ff', '#00ff00']);
eq('hslToHex night base matches the inline first paint', L.hslToHex(215, 33, 9), '#0f161f');

// ---- openMeteoUrl (weather fetch URL builder) ----
ok('openMeteoUrl carries coords', L.openMeteoUrl(52.414, -4.081).indexOf('latitude=52.414&longitude=-4.081') > -1);
ok('openMeteoUrl includes daily block by default', L.openMeteoUrl(52.414, -4.081).indexOf('daily=weather_code') > -1);
ok('openMeteoUrl includes daily block when true', L.openMeteoUrl(52.414, -4.081, true).indexOf('forecast_days=5') > -1);
ok('openMeteoUrl omits daily block when false', L.openMeteoUrl(51.5, -0.12, false).indexOf('daily=') === -1);
ok('openMeteoUrl always fetches current block', L.openMeteoUrl(51.5, -0.12, false).indexOf('current=temperature_2m,weather_code,wind_speed_10m,is_day') > -1);

// ---- Steam store links ----
eq('steamAppId from CDN image URL', L.steamAppId('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/abc/capsule_184x69.jpg'), '1091500');
eq('steamAppId from community /app/ URL', L.steamAppId('https://steamcommunity.com/app/250820'), '250820');
eq('steamAppId from store URL', L.steamAppId('https://store.steampowered.com/app/2019620/GERONIMO/'), '2019620');
eq('steamAppId no match → null', L.steamAppId('https://steamcommunity.com/id/Kazu-Hani/'), null);
eq('steamAppId null → null', L.steamAppId(null), null);
eq('steamStoreUrl builds store page', L.steamStoreUrl('https://steamcommunity.com/app/1091500'), 'https://store.steampowered.com/app/1091500');
eq('steamStoreUrl garbage → null', L.steamStoreUrl('not a url'), null);

// ---- steamIsSoftware (recent-games software filter) ----
eq('steamIsSoftware flags SteamVR /app/ URL', L.steamIsSoftware('https://steamcommunity.com/app/250820'), true);
eq('steamIsSoftware flags Wallpaper Engine CDN URL', L.steamIsSoftware('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/431960/abc/capsule_184x69.jpg'), true);
eq('steamIsSoftware leaves real games alone', L.steamIsSoftware('https://steamcommunity.com/app/1091500'), false);
eq('steamIsSoftware garbage → false', L.steamIsSoftware('not a url'), false);
eq('steamIsSoftware null → false', L.steamIsSoftware(null), false);

// ---- steamHoursText (recent-games hours line) ----
eq('recent + total both shown', L.steamHoursText(19.6, 62), '19.6 hrs last 2 wks · 62 hrs total');
eq('equal hours collapse to total', L.steamHoursText(6.7, 6.7), '6.7 hrs total');
eq('total only', L.steamHoursText(0, 47), '47 hrs total');
eq('recent only', L.steamHoursText(0.2, 0), '0.2 hrs last 2 wks');
eq('no hours → played', L.steamHoursText(0, 0), 'played');
eq('non-number hours treated as zero', L.steamHoursText('19.6', null), 'played');

// ---- malRow (MyAnimeList card) ----
const malEntry = {
  watching_status: 'watching', episodes_watched: 7,
  anime: { mal_id: 1, url: 'https://myanimelist.net/anime/1/x', title: 'Cowboy Bebop', title_english: 'Cowboy Bebop', episodes: 26, images: { jpg: { small_image_url: 'https://img/s.jpg', image_url: 'https://img/l.jpg' } } },
};
const malRowFull = L.malRow(malEntry);
eq('malRow title', malRowFull.title, 'Cowboy Bebop');
eq('malRow progress 7/26 → 27%', [malRowFull.watched, malRowFull.total, malRowFull.pct], [7, 26, 27]);
eq('malRow prefers small image', malRowFull.img, 'https://img/s.jpg');
eq('malRow falls back to title', L.malRow({ episodes_watched: 2, anime: { title: 'TTGL', title_english: null, episodes: null, images: { jpg: {} } } }).title, 'TTGL');
const malNoTotal = L.malRow({ episodes_watched: 3, anime: { mal_id: 5, title: 'Ongoing Show', episodes: null } });
ok('malRow unknown total: pct 0, total null, url from mal_id', malNoTotal.total === null && malNoTotal.pct === 0 && malNoTotal.url === 'https://myanimelist.net/anime/5', JSON.stringify(malNoTotal));
eq('malRow empty → null', L.malRow({}), null);
eq('malRow null → null', L.malRow(null), null);

// ---- malListRow (MAL load.json fallback when Jikan is down) ----
const listEntry = {
  status: 1, anime_id: 31964, anime_title: 'Boku no Hero Academia', anime_title_eng: 'My Hero Academia',
  num_watched_episodes: 3, anime_num_episodes: 13, anime_image_path: 'https://cdn.myanimelist.net/r/192x272/images/anime/10/78745.jpg',
};
const listRowFull = L.malListRow(listEntry);
eq('malListRow prefers english title', listRowFull.title, 'My Hero Academia');
eq('malListRow progress 3/13 → 23%', [listRowFull.watched, listRowFull.total, listRowFull.pct], [3, 13, 23]);
eq('malListRow builds url from anime_id', listRowFull.url, 'https://myanimelist.net/anime/31964');
eq('malListRow keeps cover path', listRowFull.img, 'https://cdn.myanimelist.net/r/192x272/images/anime/10/78745.jpg');
eq('malListRow falls back to romaji title', L.malListRow({ anime_id: 1, anime_title: 'Cowboy Bebop', anime_title_eng: null }).title, 'Cowboy Bebop');
const listNoTotal = L.malListRow({ anime_id: 5, anime_title: 'Ongoing Show', anime_num_episodes: 0 });
ok('malListRow unknown total: pct 0, total null', listNoTotal.total === null && listNoTotal.pct === 0, JSON.stringify(listNoTotal));
eq('malListRow no title → null', L.malListRow({ anime_id: 5 }), null);
eq('malListRow null → null', L.malListRow(null), null);
eq('malListRow coerces bad watched/img', (function () {
  const r = L.malListRow({ anime_id: 2, anime_title: 'Show', num_watched_episodes: -1, anime_image_path: 7 });
  return [r.watched, r.img];
})(), [0, '']);

// ---- malCacheParse (localStorage fallback when Jikan is down) ----
const cacheRow = { url: 'https://myanimelist.net/anime/1/x', title: 'Cowboy Bebop', watched: 7, total: 26, pct: 27, img: 'https://img/s.jpg' };
const cacheRows = L.malCacheParse(JSON.stringify({ at: 1752700000000, rows: [cacheRow] }));
eq('malCacheParse round-trips a written payload', cacheRows, [cacheRow]);
ok('malCacheParse recomputes pct, ignores stored pct', (function () {
  const r = L.malCacheParse(JSON.stringify({ rows: [{ url: 'u', title: 't', watched: 1, total: 4, pct: 99, img: '' }] }));
  return r && r[0].pct === 25;
})());
eq('malCacheParse valid empty list → []', L.malCacheParse(JSON.stringify({ at: 1, rows: [] })), []);
eq('malCacheParse bad JSON → null', L.malCacheParse('{nope'), null);
eq('malCacheParse null → null', L.malCacheParse(null), null);
eq('malCacheParse missing rows → null', L.malCacheParse(JSON.stringify({ at: 1 })), null);
eq('malCacheParse row without title → null', L.malCacheParse(JSON.stringify({ rows: [{ url: 'u', title: '' }] })), null);
eq('malCacheParse coerces bad total/watched', (function () {
  const r = L.malCacheParse(JSON.stringify({ rows: [{ url: 'u', title: 't', watched: -3, total: 'x' }] }));
  return r && [r[0].watched, r[0].total, r[0].pct, r[0].img];
})(), [0, null, 0, '']);

// ---- malMangaRow (Jikan mangalist) ----
const mangaEntry = {
  reading_status: 'reading', chapters_read: 42,
  manga: { mal_id: 2, url: 'https://myanimelist.net/manga/2/x', title: 'Berserk', title_english: 'Berserk', chapters: null, images: { jpg: { small_image_url: 'https://img/m.jpg', image_url: 'https://img/ml.jpg' } } },
};
const mangaRowFull = L.malMangaRow(mangaEntry);
eq('malMangaRow title', mangaRowFull.title, 'Berserk');
eq('malMangaRow ongoing: read 42, total null, pct 0', [mangaRowFull.read, mangaRowFull.total, mangaRowFull.pct], [42, null, 0]);
eq('malMangaRow prefers small image', mangaRowFull.img, 'https://img/m.jpg');
eq('malMangaRow pct when total known', L.malMangaRow({ chapters_read: 50, manga: { mal_id: 3, title: 'Finished', chapters: 100 } }).pct, 50);
eq('malMangaRow builds url from mal_id', L.malMangaRow({ chapters_read: 1, manga: { mal_id: 9, title: 'Solo' } }).url, 'https://myanimelist.net/manga/9');
eq('malMangaRow falls back to title', L.malMangaRow({ chapters_read: 1, manga: { title: 'Romaji Only', title_english: null } }).title, 'Romaji Only');
eq('malMangaRow no title → null', L.malMangaRow({ chapters_read: 1, manga: { mal_id: 1 } }), null);
eq('malMangaRow null → null', L.malMangaRow(null), null);

// ---- malMangaListRow (MAL mangalist load.json fallback) ----
const mangaListEntry = {
  status: 1, manga_id: 656, manga_title: 'Vagabond',
  num_read_chapters: 100, manga_num_chapters: 327, manga_image_path: 'https://cdn.myanimelist.net/r/192x272/images/manga/1/259070.jpg',
};
const mangaListFull = L.malMangaListRow(mangaListEntry);
eq('malMangaListRow title', mangaListFull.title, 'Vagabond');
eq('malMangaListRow progress 100/327 → 31%', [mangaListFull.read, mangaListFull.total, mangaListFull.pct], [100, 327, 31]);
eq('malMangaListRow builds url from manga_id', mangaListFull.url, 'https://myanimelist.net/manga/656');
eq('malMangaListRow keeps cover path', mangaListFull.img, 'https://cdn.myanimelist.net/r/192x272/images/manga/1/259070.jpg');
const mangaListNoTotal = L.malMangaListRow({ manga_id: 5, manga_title: 'Ongoing', manga_num_chapters: 0 });
ok('malMangaListRow unknown total: pct 0, total null', mangaListNoTotal.total === null && mangaListNoTotal.pct === 0, JSON.stringify(mangaListNoTotal));
eq('malMangaListRow no title → null', L.malMangaListRow({ manga_id: 5 }), null);
eq('malMangaListRow null → null', L.malMangaListRow(null), null);
eq('malMangaListRow coerces bad read/img', (function () {
  const r = L.malMangaListRow({ manga_id: 2, manga_title: 'M', num_read_chapters: -1, manga_image_path: 7 });
  return [r.read, r.img];
})(), [0, '']);

// ---- malMangaCacheParse ----
const mangaCacheRow = { url: 'https://myanimelist.net/manga/2/x', title: 'Berserk', read: 42, total: null, pct: 0, img: 'https://img/m.jpg' };
eq('malMangaCacheParse round-trips a written payload', L.malMangaCacheParse(JSON.stringify({ at: 1752700000000, rows: [mangaCacheRow] })), [mangaCacheRow]);
ok('malMangaCacheParse recomputes pct', (function () {
  const r = L.malMangaCacheParse(JSON.stringify({ rows: [{ url: 'u', title: 't', read: 1, total: 4, pct: 99, img: '' }] }));
  return r && r[0].pct === 25;
})());
eq('malMangaCacheParse valid empty list → []', L.malMangaCacheParse(JSON.stringify({ at: 1, rows: [] })), []);
eq('malMangaCacheParse bad JSON → null', L.malMangaCacheParse('{nope'), null);
eq('malMangaCacheParse null → null', L.malMangaCacheParse(null), null);
eq('malMangaCacheParse missing rows → null', L.malMangaCacheParse(JSON.stringify({ at: 1 })), null);
eq('malMangaCacheParse row without url → null', L.malMangaCacheParse(JSON.stringify({ rows: [{ title: 't', url: '' }] })), null);

// ---- ratingStars / letterboxdWatchedLabel ----
eq('ratingStars 3.5 → ★★★½', L.ratingStars(3.5), '★★★½');
eq('ratingStars 5 → ★★★★★', L.ratingStars(5), '★★★★★');
eq('ratingStars 4 → ★★★★', L.ratingStars(4), '★★★★');
eq('ratingStars 0.5 → ½', L.ratingStars(0.5), '½');
eq('ratingStars 0 → empty', L.ratingStars(0), '');
eq('ratingStars NaN → empty', L.ratingStars('x'), '');
eq('watched label ISO → d Mmm yyyy', L.letterboxdWatchedLabel('2026-07-13'), '13 Jul 2026');
eq('watched label non-ISO passthrough', L.letterboxdWatchedLabel('someday'), 'someday');
eq('watched label empty', L.letterboxdWatchedLabel(''), '');

// ---- parseLetterboxdRss ----
const LB_RSS = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<rss version="2.0" xmlns:letterboxd="https://letterboxd.com">\n<channel>\n' +
  '<title>Letterboxd - KazuHani</title>\n' +
  '<item>\n' +
  '<title>Superman, 2025 - ★★★½</title>\n' +
  '<link>https://letterboxd.com/kazuhani/film/superman-2025/</link>\n' +
  '<letterboxd:watchedDate>2026-07-13</letterboxd:watchedDate>\n' +
  '<letterboxd:rewatch>No</letterboxd:rewatch>\n' +
  '<letterboxd:filmTitle>Superman</letterboxd:filmTitle>\n' +
  '<letterboxd:filmYear>2025</letterboxd:filmYear>\n' +
  '<letterboxd:memberRating>3.5</letterboxd:memberRating>\n' +
  '<description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/superman-2025.jpg"/></p> <p>Watched on Monday July 13, 2026.</p> ]]></description>\n' +
  '</item>\n' +
  '<item>\n' +
  '<title>Older Film, 1999</title>\n' +
  '<link>https://letterboxd.com/kazuhani/film/older-film/</link>\n' +
  '<letterboxd:watchedDate>2026-07-01</letterboxd:watchedDate>\n' +
  '</item>\n' +
  '</channel>\n</rss>';
const lbEntry = L.parseLetterboxdRss(LB_RSS);
eq('parseLetterboxdRss picks the FIRST item', lbEntry.title, 'Superman');
eq('parseLetterboxdRss year', lbEntry.year, '2025');
eq('parseLetterboxdRss rating + stars', [lbEntry.rating, lbEntry.stars], [3.5, '★★★½']);
eq('parseLetterboxdRss link', lbEntry.link, 'https://letterboxd.com/kazuhani/film/superman-2025/');
eq('parseLetterboxdRss poster from description img', lbEntry.poster, 'https://a.ltrbxd.com/resized/film-poster/superman-2025.jpg');
eq('parseLetterboxdRss watched label', lbEntry.watched, '13 Jul 2026');
eq('parseLetterboxdRss rewatch No → false', lbEntry.rewatch, false);
const lbOld = L.parseLetterboxdRss(LB_RSS.replace(/<item>[\s\S]*?<\/item>/, '')); // strip first item
eq('parseLetterboxdRss falls back to item title without extension tags', lbOld.title, 'Older Film');
eq('parseLetterboxdRss title-fallback year', lbOld.year, '1999');
eq('parseLetterboxdRss no rating → null rating, empty stars', [lbOld.rating, lbOld.stars], [null, '']);
const lbRewatch = L.parseLetterboxdRss(LB_RSS.replace('<letterboxd:rewatch>No</letterboxd:rewatch>', '<letterboxd:rewatch>Yes</letterboxd:rewatch>'));
eq('parseLetterboxdRss rewatch Yes → true', lbRewatch.rewatch, true);
eq('parseLetterboxdRss no items → null', L.parseLetterboxdRss('<rss><channel></channel></rss>'), null);
eq('parseLetterboxdRss garbage → null', L.parseLetterboxdRss('not xml'), null);
eq('parseLetterboxdRss null → null', L.parseLetterboxdRss(null), null);

// ---- letterboxdCacheParse ----
eq('letterboxdCacheParse round-trips a written entry', L.letterboxdCacheParse(JSON.stringify({ at: 1, entry: lbEntry })), lbEntry);
eq('letterboxdCacheParse bad JSON → null', L.letterboxdCacheParse('{nope'), null);
eq('letterboxdCacheParse null → null', L.letterboxdCacheParse(null), null);
eq('letterboxdCacheParse entry without title → null', L.letterboxdCacheParse(JSON.stringify({ entry: { link: 'u' } })), null);
ok('letterboxdCacheParse recomputes stars from rating', (function () {
  const r = L.letterboxdCacheParse(JSON.stringify({ entry: { title: 't', link: 'u', rating: 4.5, stars: 'wrong' } }));
  return r && r.stars === '★★★★½';
})());

// ---- listenbrainzRow ----
const lbListen = {
  playing_now: true,
  track_metadata: { track_name: 'Sisu', artist_name: 'Dragon Band', additional_info: { spotify_id: 'https://open.spotify.com/track/abc123' } },
};
const lbRow = L.listenbrainzRow(lbListen);
eq('listenbrainzRow shapes a full listen', lbRow, { name: 'Sisu', artist: 'Dragon Band', playingNow: true, url: 'https://open.spotify.com/track/abc123' });
eq('listenbrainzRow missing artist/spotify → blanks', L.listenbrainzRow({ track_metadata: { track_name: 'X' } }), { name: 'X', artist: '', playingNow: false, url: '' });
eq('listenbrainzRow no track name → null', L.listenbrainzRow({ track_metadata: { artist_name: 'A' } }), null);
eq('listenbrainzRow null → null', L.listenbrainzRow(null), null);

// ---- xmlText / ytArtistName ----
eq('xmlText decodes all five entities', L.xmlText('A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;'), 'A & B <C> "D" \'E\'');
eq('xmlText decodes zero-padded numeric apos + &apos;', L.xmlText('it&#039;s &apos;ok&apos;'), "it's 'ok'");
eq('xmlText empty → empty', L.xmlText(''), '');
eq('ytArtistName strips - Topic', L.ytArtistName('Shadow Bass King - Topic'), 'Shadow Bass King');
eq('ytArtistName strips VEVO', L.ytArtistName('UsherVEVO'), 'Usher');
eq('ytArtistName keeps a plain name', L.ytArtistName('Christina Perri'), 'Christina Perri');
eq('ytArtistName decodes entities', L.ytArtistName('Tom &amp; Jerry - Topic'), 'Tom & Jerry');

// ---- parseYouTubePlaylistRss ----
const YTM_FEED = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">\n' +
  '<title>Songs that SLAP</title>\n' +
  '<entry>\n' +
  '<yt:videoId>2nfxYkiVLNo</yt:videoId>\n' +
  '<title>I AM THUNDER</title>\n' +
  '<author><name>Shadow Bass King - Topic</name></author>\n' +
  '</entry>\n' +
  '<entry>\n' +
  '<yt:videoId>yqsJsO8H-oA</yt:videoId>\n' +
  '<title>DJ Got Us Fallin&#39; In Love &amp; More</title>\n' +
  '<author><name>UsherVEVO</name></author>\n' +
  '</entry>\n' +
  '<entry>\n' +
  '<yt:videoId>bad!!id</yt:videoId>\n' +
  '<title>Malformed id row</title>\n' +
  '<author><name>Nobody</name></author>\n' +
  '</entry>\n' +
  '<entry>\n' +
  '<yt:videoId>aaaaaaaaaaa</yt:videoId>\n' +
  '</entry>\n' +
  '</feed>';
const ytmRows = L.parseYouTubePlaylistRss(YTM_FEED);
eq('parseYouTubePlaylistRss keeps feed order, drops malformed id + missing title', ytmRows.length, 2);
eq('parseYouTubePlaylistRss first row shaped + - Topic stripped', ytmRows[0], { id: '2nfxYkiVLNo', title: 'I AM THUNDER', artist: 'Shadow Bass King' });
eq('parseYouTubePlaylistRss decodes entities + strips VEVO', ytmRows[1], { id: 'yqsJsO8H-oA', title: "DJ Got Us Fallin' In Love & More", artist: 'Usher' });
eq('parseYouTubePlaylistRss no entries → []', L.parseYouTubePlaylistRss('<feed><title>x</title></feed>'), []);
eq('parseYouTubePlaylistRss garbage → []', L.parseYouTubePlaylistRss('not xml'), []);
eq('parseYouTubePlaylistRss null → []', L.parseYouTubePlaylistRss(null), []);

// ---- ytPlaylistCacheParse ----
eq('ytPlaylistCacheParse round-trips written rows', L.ytPlaylistCacheParse(JSON.stringify({ at: 1, rows: ytmRows })), ytmRows);
eq('ytPlaylistCacheParse valid empty list → []', L.ytPlaylistCacheParse(JSON.stringify({ at: 1, rows: [] })), []);
eq('ytPlaylistCacheParse bad JSON → null', L.ytPlaylistCacheParse('{nope'), null);
eq('ytPlaylistCacheParse null → null', L.ytPlaylistCacheParse(null), null);
eq('ytPlaylistCacheParse missing rows → null', L.ytPlaylistCacheParse(JSON.stringify({ at: 1 })), null);
eq('ytPlaylistCacheParse row without title → null', L.ytPlaylistCacheParse(JSON.stringify({ rows: [{ id: '2nfxYkiVLNo' }] })), null);
eq('ytPlaylistCacheParse malformed video id → null', L.ytPlaylistCacheParse(JSON.stringify({ rows: [{ id: 'x', title: 't' }] })), null);
ok('ytPlaylistCacheParse defaults missing artist to empty', (function () {
  const r = L.ytPlaylistCacheParse(JSON.stringify({ rows: [{ id: '2nfxYkiVLNo', title: 't' }] }));
  return r && r[0].artist === '';
})());

// ---- forecastRows (weather modal 5-day strip) ----
const dailyBlock = {
  time: ['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22'],
  weather_code: [2, 61, 3, 80, 1],
  temperature_2m_max: [22.0, 19.4, 21.2, 18.7, 23.0],
  temperature_2m_min: [13.1, 12.5, 11.0, 10.2, 14.4],
  precipitation_probability_max: [63, 80, 20, 55, 10]
};
eq('forecastRows maps a full 5-day block (Today label, weekdays, rounding)', L.forecastRows(dailyBlock, 5), [
  { label: 'Today', code: 2, maxC: 22, minC: 13, precipPct: 63 },
  { label: 'Sun', code: 61, maxC: 19, minC: 13, precipPct: 80 },
  { label: 'Mon', code: 3, maxC: 21, minC: 11, precipPct: 20 },
  { label: 'Tue', code: 80, maxC: 19, minC: 10, precipPct: 55 },
  { label: 'Wed', code: 1, maxC: 23, minC: 14, precipPct: 10 }
]);
eq('forecastRows missing precip array → null pct', L.forecastRows({
  time: ['2026-07-18'], weather_code: [2], temperature_2m_max: [20], temperature_2m_min: [10]
}, 5), [{ label: 'Today', code: 2, maxC: 20, minC: 10, precipPct: null }]);
eq('forecastRows missing temps → null temps', L.forecastRows({
  time: ['2026-07-18'], weather_code: [2]
}, 5), [{ label: 'Today', code: 2, maxC: null, minC: null, precipPct: null }]);
eq('forecastRows missing weather_code → null code', L.forecastRows({
  time: ['2026-07-18'], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [5]
}, 5), [{ label: 'Today', code: null, maxC: 20, minC: 10, precipPct: 5 }]);
ok('forecastRows stops at available days when fewer than limit', (function () {
  const r = L.forecastRows({
    time: ['2026-07-18', '2026-07-19'], weather_code: [2, 3],
    temperature_2m_max: [20, 21], temperature_2m_min: [10, 11], precipitation_probability_max: [5, 6]
  }, 5);
  return r.length === 2 && r[1].label === 'Sun';
})());
eq('forecastRows null daily → []', L.forecastRows(null, 5), []);
eq('forecastRows daily without time array → []', L.forecastRows({ weather_code: [2] }, 5), []);

// ---- konamiMatch (Konami code easter egg) ----
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
ok('konamiMatch exact code → true', L.konamiMatch(KONAMI));
ok('konamiMatch code after junk keys → true', L.konamiMatch(['x', 'ArrowUp', 'q'].concat(KONAMI)));
ok('konamiMatch short window → false', !L.konamiMatch(KONAMI.slice(0, 9)));
ok('konamiMatch wrong final key → false', !L.konamiMatch(KONAMI.slice(0, 9).concat(['b'])));
ok('konamiMatch code not at the end → false', !L.konamiMatch(KONAMI.concat(['c'])));
eq('konamiMatch null → false', L.konamiMatch(null), false);

// ---- devCodeMatch (dev settings panel secret code) ----
const DEV = 'kazudev'.split('');
ok('devCodeMatch exact code → true', L.devCodeMatch(DEV));
ok('devCodeMatch code after junk keys → true', L.devCodeMatch(['x', 'ArrowUp', '1'].concat(DEV)));
ok('devCodeMatch case-insensitive (Caps Lock)', L.devCodeMatch('KAZUDEV'.split('')));
ok('devCodeMatch mixed case → true', L.devCodeMatch('KaZuDeV'.split('')));
ok('devCodeMatch short window → false', !L.devCodeMatch(DEV.slice(0, 6)));
ok('devCodeMatch wrong final key → false', !L.devCodeMatch(DEV.slice(0, 6).concat(['x'])));
ok('devCodeMatch code not at the end → false', !L.devCodeMatch(DEV.concat(['c'])));
ok('devCodeMatch non-string key → false', !L.devCodeMatch(['k', 'a', 'z', 'u', 'd', 'e', 7]));
eq('devCodeMatch null → false', L.devCodeMatch(null), false);

// ---- seasonDevApply (dev panel season-trigger overrides) ----
const clockState = { birthday: false, christmas: false, pride: true };
eq('auto passes the clock state through untouched', L.seasonDevApply(clockState, {}), clockState);
eq('on forces a season live', L.seasonDevApply(clockState, { christmas: 'on' }).christmas, true);
eq('off forces a live season dark', L.seasonDevApply(clockState, { pride: 'off' }).pride, false);
eq('mixed overrides compose', L.seasonDevApply({ birthday: true, christmas: false, pride: false }, { birthday: 'off', christmas: 'on' }), { birthday: false, christmas: true, pride: false });
eq('junk values + unknown keys are ignored', L.seasonDevApply(clockState, { birthday: 'yes', wat: 'on' }), clockState);
eq('null overrides → passthrough', L.seasonDevApply(clockState, null), clockState);
eq('null state → all seasons false', L.seasonDevApply(null, null), { birthday: false, christmas: false, pride: false });
ok('input state object is not mutated', (function () { const s = { birthday: true }; L.seasonDevApply(s, { birthday: 'off' }); return s.birthday === true; })());

// ---- seasonDevParse (localStorage copy of the overrides) ----
eq('seasonDevParse round-trips stored overrides', L.seasonDevParse('{"birthday":"on","pride":"off"}'), { birthday: 'on', pride: 'off' });
// ---- devModeParse (single-value dev-panel modes) ----
eq('devModeParse accepts auto', L.devModeParse('auto'), 'auto');
eq('devModeParse accepts on', L.devModeParse('on'), 'on');
eq('devModeParse accepts off', L.devModeParse('off'), 'off');
eq('devModeParse rejects junk to auto', L.devModeParse('maybe'), 'auto');
eq('devModeParse rejects missing to auto', L.devModeParse(null), 'auto');
eq('seasonDevParse strips auto + junk values + unknown keys', L.seasonDevParse('{"birthday":"auto","christmas":"yes","pride":"on","wat":"off"}'), { pride: 'on' });
eq('seasonDevParse all-auto → {}', L.seasonDevParse('{}'), {});
eq('seasonDevParse bad JSON → null', L.seasonDevParse('{nope'), null);
eq('seasonDevParse null → null', L.seasonDevParse(null), null);
eq('seasonDevParse empty string → null', L.seasonDevParse(''), null);
eq('seasonDevParse array payload → null', L.seasonDevParse('["on"]'), null);
eq('seasonDevParse scalar payload → null', L.seasonDevParse('"on"'), null);

// ---- balloonDriftStep (birthday balloon body physics) ----
const bb = { x: 100, y: 500, vx: 0, vy: 0 };
for (let bi = 0; bi < 1200; bi++) L.balloonDriftStep(bb, { dt: 0.016, t: bi * 0.016, buoy: 9, drag: 0.22, windAmp: 0, phase: 0 });
ok('balloon rises and settles near terminal velocity buoy/drag', bb.y < 500 && Math.abs(bb.vy + 9 / 0.22) < 2, JSON.stringify(bb));
eq('no wind → zero horizontal drift', bb.vx, 0);
const bw1 = { x: 0, y: 0, vx: 0, vy: 0 }, bw2 = { x: 0, y: 0, vx: 0, vy: 0 };
L.balloonDriftStep(bw1, { dt: 0.016, t: 3.7, buoy: 8, drag: 0.2, windAmp: 9, phase: 1.3 });
L.balloonDriftStep(bw2, { dt: 0.016, t: 3.7, buoy: 8, drag: 0.2, windAmp: 9, phase: 1.3 });
eq('wind gusts are deterministic', bw1, bw2);
const bClamped = { x: 0, y: 0, vx: 0, vy: 0 };
L.balloonDriftStep(bClamped, { dt: 999, t: 0, buoy: 9, drag: 0.22, windAmp: 40, phase: 0 });
ok('huge dt (tab switch) is clamped, no slingshot', Math.abs(bClamped.vy) <= 9 * 0.05 + 1e-9 && Math.abs(bClamped.y) < 1, JSON.stringify(bClamped));
const bNull = { x: 0, y: 0, vx: 0, vy: 0 };
L.balloonDriftStep(bNull, null);
ok('null opts → sane default frame', isFinite(bNull.x) && isFinite(bNull.y));

// ---- ropeStep (balloon string verlet physics) ----
const mkRope = (n, seg, off) => Array.from({ length: n }, (_, i) => ({ x: 100 + off, y: 100 + i * seg, px: 100 + off, py: 100 + i * seg }));
const rope = mkRope(7, 9, 60);
for (let ri = 0; ri < 400; ri++) L.ropeStep(rope, { x: 100, y: 100 }, { dt: 0.016, gravity: 1400, segLen: 9 });
ok('knot stays pinned to the anchor', rope[0].x === 100 && rope[0].y === 100);
ok('string settles hanging straight below the balloon', Math.abs(rope[6].x - 100) < 3 && Math.abs(rope[6].y - (100 + 6 * 9)) < 3, JSON.stringify(rope[6]));
ok('segment lengths hold ≈ segLen', rope.slice(1).every((p, i) => Math.abs(Math.hypot(p.x - rope[i].x, p.y - rope[i].y) - 9) < 1.5));
const rope2 = mkRope(5, 8, 0);
const anchor = { x: 40, y: 30 };
L.ropeStep(rope2, anchor, { dt: 0.016, gravity: 1400, segLen: 8 });
eq('anchor is re-pinned every step', [rope2[0].x, rope2[0].y, rope2[0].px, rope2[0].py], [40, 30, 40, 30]);
ok('rope points stay finite under zero dt', L.ropeStep(mkRope(4, 8, 5), { x: 0, y: 0 }, { dt: 0, gravity: 1400, segLen: 8 }).every((p) => isFinite(p.x) && isFinite(p.y)));

// ---- scrollThumbGeometry / scrollThumbScrollY (custom page scroller) ----
// Half-full document: thumb is half the track and travels the other half.
const gHalf = L.scrollThumbGeometry({ viewportH: 500, contentH: 1000, trackH: 400, scrollY: 0 });
eq('half-full page: thumb half the track, parked at top', [gHalf.shown, gHalf.thumbH, gHalf.thumbTop, gHalf.maxScroll], [true, 200, 0, 500]);
eq('half-full page, scrolled halfway', L.scrollThumbGeometry({ viewportH: 500, contentH: 1000, trackH: 400, scrollY: 250 }).thumbTop, 100);
eq('half-full page, scrolled to bottom', L.scrollThumbGeometry({ viewportH: 500, contentH: 1000, trackH: 400, scrollY: 500 }).thumbTop, 200);
// Nothing to scroll (or no track rendered yet): hidden, zeroed.
eq('content fits viewport → hidden', L.scrollThumbGeometry({ viewportH: 1000, contentH: 900, trackH: 400, scrollY: 0 }), { shown: false, thumbH: 0, thumbTop: 0, maxScroll: 0 });
ok('1px of overflow still counts as nothing to scroll', L.scrollThumbGeometry({ viewportH: 1000, contentH: 1001, trackH: 400, scrollY: 0 }).shown === false);
eq('zero-height track → hidden', L.scrollThumbGeometry({ viewportH: 500, contentH: 1000, trackH: 0, scrollY: 0 }).shown, false);
eq('null input → hidden', L.scrollThumbGeometry(null).shown, false);
// Very long page: the raw proportional thumb would be sub-pixel, so it clamps
// to the minimum and the travel shrinks to match.
const gLong = L.scrollThumbGeometry({ viewportH: 100, contentH: 100000, trackH: 200, scrollY: 0 });
ok('huge page: thumb clamps to the 28px minimum', gLong.thumbH === 28, gLong.thumbH);
eq('huge page, bottom: thumbTop = track - min thumb', L.scrollThumbGeometry({ viewportH: 100, contentH: 100000, trackH: 200, scrollY: 99900 }).thumbTop, 172);
// Nearly-full page: thumb never exceeds the track itself.
ok('barely-scrollable page: thumb capped at track height', L.scrollThumbGeometry({ viewportH: 999, contentH: 1001, trackH: 400, scrollY: 0 }).thumbH <= 400);
// Out-of-range scrollY is clamped both ways (bounce-back on touch platforms).
eq('negative scrollY clamps to top', L.scrollThumbGeometry({ viewportH: 500, contentH: 1000, trackH: 400, scrollY: -50 }).thumbTop, 0);
eq('over-max scrollY clamps to bottom', L.scrollThumbGeometry({ viewportH: 500, contentH: 1000, trackH: 400, scrollY: 9999 }).thumbTop, 200);
// Custom minimum thumb size wins over the default.
eq('custom minThumbH respected', L.scrollThumbGeometry({ viewportH: 100, contentH: 100000, trackH: 200, scrollY: 0, minThumbH: 50 }).thumbH, 50);

// Inverse mapping (dragging): thumb position → document scrollY.
eq('inverse: thumb at top → scrollY 0', L.scrollThumbScrollY({ trackH: 400, thumbH: 200, thumbTop: 0, maxScroll: 500 }), 0);
eq('inverse: thumb at bottom → maxScroll', L.scrollThumbScrollY({ trackH: 400, thumbH: 200, thumbTop: 200, maxScroll: 500 }), 500);
eq('inverse: halfway → half maxScroll', L.scrollThumbScrollY({ trackH: 400, thumbH: 200, thumbTop: 100, maxScroll: 500 }), 250);
eq('inverse: thumbTop beyond travel clamps', L.scrollThumbScrollY({ trackH: 400, thumbH: 200, thumbTop: 999, maxScroll: 500 }), 500);
eq('inverse: negative thumbTop clamps to 0', L.scrollThumbScrollY({ trackH: 400, thumbH: 200, thumbTop: -10, maxScroll: 500 }), 0);
eq('inverse: no travel → 0 (no NaN)', L.scrollThumbScrollY({ trackH: 200, thumbH: 200, thumbTop: 5, maxScroll: 500 }), 0);
eq('inverse: null input → 0', L.scrollThumbScrollY(null), 0);
// Round-trip: geometry then inverse returns the original scroll position,
// give or take the integer rounding of thumbTop (≤ half a thumb pixel's
// worth of document px: (934/265)/2 ≈ 1.8 here).
const rt = L.scrollThumbGeometry({ viewportH: 300, contentH: 1234, trackH: 350, scrollY: 700 });
ok('round-trip geometry → inverse ≈ original scrollY', Math.abs(L.scrollThumbScrollY({ trackH: 350, thumbH: rt.thumbH, thumbTop: rt.thumbTop, maxScroll: rt.maxScroll }) - 700) <= 2);

// ---- heavy smooth scroll (wheel lerp) ----
eq('wheel pixels pass through', L.wheelDeltaPx(120, 0), 120);
eq('wheel lines → px (Firefox)', L.wheelDeltaPx(3, 1), 48);
eq('wheel pages → px', L.wheelDeltaPx(1, 2), 800);
eq('wheel junk → 0', L.wheelDeltaPx('nope', 0), 0);
ok('smooth step closes ease of the gap in one 60fps frame', Math.abs(L.smoothScrollStep(0, 100, 0.1, 1000 / 60, 0.5) - 10) < 1e-9);
ok('smooth step missing dt behaves like one 60fps frame', Math.abs(L.smoothScrollStep(0, 100, 0.1) - 10) < 1e-9);
eq('smooth step snaps inside the threshold', L.smoothScrollStep(99.7, 100, 0.1, 1000 / 60, 0.5), 100);
ok('smooth step eases upward too', Math.abs(L.smoothScrollStep(100, 0, 0.1, 1000 / 60, 0.5) - 90) < 1e-9);
ok('smooth step bad ease falls back', Math.abs(L.smoothScrollStep(0, 100, 'x', 1000 / 60, 0.5) - 10) < 1e-9);
eq('smooth step junk input → 0', L.smoothScrollStep('a', 1, 0.1, 1000 / 60, 0.5), 0);
// Frame-rate independence: two 120Hz frames must close exactly the gap one
// 60Hz frame closes — the regression guard for the glide's soft stop.
const halfFrame = L.smoothScrollStep(0, 100, 0.1, 1000 / 120, 0.5);
ok('two half-rate frames equal one full-rate frame', Math.abs(L.smoothScrollStep(halfFrame, 100, 0.1, 1000 / 120, 0.5) - 10) < 1e-9);
// A hidden-tab rAF gap is clamped to 100ms, not applied in full.
eq('smooth step clamps a hidden-tab gap to 100ms', L.smoothScrollStep(0, 100, 0.1, 5000, 0.5), L.smoothScrollStep(0, 100, 0.1, 100, 0.5));

// ---- Music card hover visualizer (static wiring checks) ----
// Pure CSS/HTML feature, so the gate asserts the wiring is present: the
// markup in the card, the desktop-only hover gate, bars paused until hover,
// and the reduced-motion kill switch.
const fs = require('fs');
const htmlSrc = fs.readFileSync(__dirname + '/index.html', 'utf8');
const cssSrc = fs.readFileSync(__dirname + '/style.css', 'utf8');
ok('viz markup lives in the music card', htmlSrc.includes('Songs that SLAP') && htmlSrc.includes('class="music-viz" aria-hidden="true"'));
ok('hover effect gated to desktop (hover + fine pointer)', cssSrc.includes('@media (hover: hover) and (pointer: fine)') && cssSrc.includes('.music-card:hover .music-viz'));
ok('bars paused until hover, run on hover', cssSrc.includes('animation-play-state: paused') && cssSrc.includes('.music-card:hover .music-viz span { animation-play-state: running; }'));
ok('equalizer bounce keyframes exist', cssSrc.includes('@keyframes music-viz-bounce'));
ok('hover transform restated to beat .scroll-reveal.is-visible', cssSrc.includes('.music-card.scroll-reveal.is-visible:hover'));
ok('reduced motion hides the visualizer', cssSrc.includes('.music-viz { display: none; }'));
// Featured tracks fill the card's formerly empty right side: 5 real songs
// from the playlist, each linking to the track on YouTube Music.
ok('featured tracks: 5 real playlist links', htmlSrc.split('class="music-track-row" href="https://music.youtube.com/watch?v=').length - 1, 5);
ok('featured column styled (fills space, stacks on mobile)', cssSrc.includes('.music-featured {'));

// ---- PC specifications section (static wiring checks) ----
// All supplied parts stay present, grouped into four asymmetric glass cards
// that collapse to one column before the narrower span becomes cramped.
eq('PC specs use four grouped glass cards', htmlSrc.split('class="card pc-spec-card').length - 1, 4);
[
  'AMD Ryzen 5 3600',
  'Cooler Master Hyper 212 Black Edition',
  'Gigabyte',
  'NVIDIA GeForce <strong>RTX 4060</strong>',
  '32 GB DDR4-3200',
  '<dt>2 TB</dt>',
  'Western Digital HDD',
  '<dt>240 GB</dt>',
  'Kingston SSD',
  '<dt>1 TB</dt>',
  'Crucial P3 Plus M.2 PCIe 4.0 NVMe SSD',
  'Corsair RM650, 80 Plus Gold, 650 W',
  'Corsair Carbide Series 270R',
  'MSI B450 Tomahawk Max',
].forEach((spec) => ok('PC spec present: ' + spec.replace(/<[^>]+>/g, ''), htmlSrc.includes(spec)));
ok('PC specs use the asymmetric 7/5 bento', cssSrc.includes('grid-template-columns: repeat(12,minmax(0,1fr));') && cssSrc.includes('.pc-spec-card--graphics {\n  grid-column: span 7;') && cssSrc.includes('.pc-spec-card--platform { grid-column: span 5; }'));
ok('PC specs collapse to one column on compact screens', cssSrc.includes('@media (max-width: 860px)') && cssSrc.includes('.pc-spec-card { grid-column: 1 / -1; }'));

// ---- Liquid glass on the content cards (static wiring checks) ----
// The presence/music/story cards joined the glass set: translucent fills,
// glint rims, frosted backdrop, and the Chromium refraction list in script.js.
const cssFlat = cssSrc.replace(/\r/g, '');
const scriptSrc = fs.readFileSync(__dirname + '/script.js', 'utf8');
['rgba(40,40,110,.32), var(--glint)',   // discord
 'rgba(20,40,70,.32), var(--glint)',    // steam
 'rgba(20,40,100,.32), var(--glint)',   // myanimelist
 'rgba(10,16,24,.4), var(--glint)',     // letterboxd
 'rgba(255,26,26,.16), var(--glint)',   // music
 'rgba(255,26,26,.3), var(--glint)',    // music hover keeps the glint
].forEach((shadow) => ok('glass shadow wired: ' + shadow, cssFlat.includes(shadow)));
ok('story cards carry the glint inline', htmlSrc.split('var(--glint)').length - 1 === 2);
ok('story card gradients made translucent', htmlSrc.includes('rgba(124,29,43,.66)') && htmlSrc.includes('rgba(14,94,84,.66)'));
ok('presence + story cards get the frosted backdrop', cssFlat.includes('.lb-card,\n.story-card {\n  border: none;\n  -webkit-backdrop-filter: blur(6px) saturate(1.7);'));
ok('refraction keys off .card so future cards join automatically', scriptSrc.includes("querySelectorAll('.card:not(.stat-card--bday), .toast')"));
ok('social tiles are solid brand tiles (not glass .card members)', !htmlSrc.includes('class="card social-card'));
ok('every social tile carries a brand modifier', (htmlSrc.match(/class="social-card social-card--/g) || []).length === 7);
ok('brand gradient stops exist for all seven socials', ['x', 'instagram', 'youtube', 'reddit', 'tiktok', 'mal', 'letterboxd'].every((n) => cssFlat.includes('.social-card--' + n + ' ')));

// ---- Scroll reveal (static wiring checks) ----
// Everything .scroll-reveal starts hidden and fades + slides in the first
// time it enters the viewport, via an IntersectionObserver (one-shot).
ok('scroll reveal uses an IntersectionObserver', scriptSrc.includes('IntersectionObserver'));
ok('same-batch reveals stagger', scriptSrc.includes('REVEAL_STAGGER') && scriptSrc.includes('REVEAL_MAX_DELAY'));
ok('reveal resolves via .is-visible', scriptSrc.includes("classList.add('is-visible')"));
ok('reveal is one-shot (unobserve after showing)', scriptSrc.includes('unobserve'));
ok('no-observer fallback reveals everything', scriptSrc.includes("'IntersectionObserver' in window"));
// The observer's -10% bottom margin can never trip for the last sliver of the
// page (the footer is shorter than the margin band) — a scroll fallback
// reveals the stragglers once the document bottom is reached.
ok('bottom-of-page fallback reveals the stragglers', scriptSrc.includes('revealStragglers') && scriptSrc.includes('scrollHeight - 4'));
ok('off-screen fx layers pause via .fx-paused', cssFlat.includes('.fx-paused, .fx-paused *') && scriptSrc.includes("classList.toggle('fx-paused', !entry.isIntersecting)"));
ok('fx watcher covers the scenery layers + hero', scriptSrc.includes("fxWatch(document.querySelector('.sakura-scene'))") && scriptSrc.includes("fxWatch(document.querySelector('.xmas-scene'))") && scriptSrc.includes("fxWatch(document.querySelector('.hero'))") && scriptSrc.includes('fxWatch(atmosphereEl)'));
ok('petals + drops are watched individually', scriptSrc.includes("querySelectorAll('.petal').forEach(fxWatch)") && scriptSrc.includes("querySelectorAll('.drop').forEach(fxWatch)"));
ok('scroll-reveal section present in the stylesheet', cssFlat.includes('============ SCROLL REVEAL ============'));

// ---- Live API freshness (static wiring checks) ----
// Discord, Steam, MAL and Letterboxd must always reflect the server end:
// every live fetch passes cache: 'no-store' so the browser HTTP cache can
// never answer for them, and the service worker ignores cross-origin
// requests entirely (no second cache layer in front of the APIs).
const swSrc = fs.readFileSync(__dirname + '/sw.js', 'utf8');
ok('discord REST bypasses the HTTP cache', scriptSrc.includes("'https://api.lanyard.rest/v1/users/' + DISCORD_ID") && scriptSrc.includes("fetchT(url, { cache: 'no-store' })"));
ok('discord REST falls back through the CORS proxy when lanyard is unreachable', scriptSrc.includes('const r2 = await proxyFetch(url);'));
ok('steam fetches bypass the HTTP cache', scriptSrc.includes('const r = await proxyFetch(STEAM_URL);') && scriptSrc.includes("fetchT(STEAM_URL, { cache: 'no-store' })"));
ok('jikan anime + manga bypass the HTTP cache', scriptSrc.includes("'/animelist?status=watching', { cache: 'no-store' }") && scriptSrc.includes("'/mangalist?status=reading', { cache: 'no-store' }"));
ok('MAL load.json fallbacks bypass the HTTP cache', scriptSrc.split('const r2 = await proxyFetch(listUrl);').length - 1 === 2);
ok('letterboxd RSS bypasses the HTTP cache', scriptSrc.includes('const r = await proxyFetch(rss);'));
ok('youtube playlist feed bypasses the HTTP cache', scriptSrc.includes('const r = await proxyFetch(feed);'));
ok('one proxy helper feeds every cross-origin card', scriptSrc.includes("return fetchT('https://proxy.cors.sh/' + target, opts);") && !scriptSrc.includes("fetchT('https://corsproxy.io"));
ok('playlist tracks ride the poller loop', scriptSrc.includes('{ fn: loadPlaylistTracks,'));
ok('playlist card has a live-swap mount point', htmlSrc.includes('id="musicFeatured"'));
// Every live fetch rides fetchT (script.js): a 12s AbortSignal.timeout so a
// hung API/proxy fails into the loader's existing catch instead of pinning
// the card on its loading line forever.
ok('live fetches ride the timeout wrapper', !/await fetch\(/.test(scriptSrc));
ok('service worker never intercepts the live APIs', swSrc.includes('if (url.origin !== location.origin) return;'));

// ---- Music card left zone fills the card height ----
ok('left zone wrapped in .music-side', htmlSrc.includes('<div class="music-side">'));
ok('.music-side spreads cover + info', cssFlat.includes('.music-side { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-evenly; }'));
ok('cover enlarged to fill the zone', cssFlat.includes('width: 152px; height: 152px;'));

// ---- Dev settings panel (secret code: kazudev) ----
// Static wiring: the code word + matcher in the keydown listener, the
// override hook inside seasonState, localStorage persistence, and the styles.
ok('dev code wired in the keydown listener', scriptSrc.includes('devCodeMatch') && scriptSrc.includes("'kazudev'"));
ok('seasonState consults the dev overrides', scriptSrc.includes('seasonDevApply({'));
ok('dev overrides persist under kazu-dev-seasons', scriptSrc.includes("DEV_KEY = 'kazu-dev-seasons'"));
ok('panel applies changes through applySeasons', scriptSrc.includes('syncDevPanel(s)'));
ok('dev panel styles present', cssFlat.includes('.dev-panel {') && cssFlat.includes('.dev-seg button.is-active'));
ok('sky curve mode persists separately', scriptSrc.includes("DEV_CURVE_KEY = 'kazu-dev-curve'") && scriptSrc.includes('saveDevCurve'));
ok('sky curve has Auto / On / Off controls', scriptSrc.includes('data-setting="curve"') && scriptSrc.includes('aria-label="Sky curve guide mode"'));
ok('sky curve Auto / On / Off is applied', scriptSrc.includes('applySkyCurveMode') && scriptSrc.includes("devCurveMode === 'on'") && scriptSrc.includes("devCurveMode === 'off'"));
ok('sky curve keeps the guide and live body on the responsive profile centre', htmlSrc.includes('class="sky-curve-guide"') && cssFlat.includes('.sky-curve-guide__line') && scriptSrc.includes('renderSkyCurveGuide') && scriptSrc.includes('skyArcPeakY') && scriptSrc.includes('skyArcPoint(i / steps, crestY)') && scriptSrc.includes('skyBodyState(mins, doy, skyArcPeakY())') && scriptSrc.includes("window.addEventListener('resize', scheduleSkyLayout"));

// ---- Christmas theme (cozy classic: pine + cranberry + gold) ----
// The palette vars moved to a pine base with a warm gold accent, and every
// brand-coloured component gets a scoped repaint. Base rules stay untouched
// (the glass-shadow checks above guard that); these guard the overrides.
ok('christmas palette is pine-based, brown mud gone', cssFlat.includes('#071f16') && !cssFlat.includes('#14110f'));
ok('christmas accent is warm gold', cssFlat.includes('--accent: #ffd166;'));
ok('hero title repainted for christmas', cssFlat.includes('body.season-christmas .title {'));
ok('bday card repainted cranberry for christmas', cssFlat.includes('body.season-christmas .stat-card--bday {'));
ok('presence cards repainted pine for christmas', cssFlat.includes('body.season-christmas .discord-card,') && cssFlat.includes('body.season-christmas .steam-card,') && cssFlat.includes('body.season-christmas .mal-card {'));
ok('profile ring glows gold for christmas', cssFlat.includes('body.season-christmas .pfp-ring {'));
ok('tree lights twinkle with a reduced-motion kill switch', cssFlat.includes('@keyframes xmasTwinkle') && cssFlat.includes('.xmas-lights circle { animation: none; }'));
ok('tree SVG upgraded: gradients, light string, presents', htmlSrc.includes('id="xmasG1"') && htmlSrc.includes('class="xmas-lights"') && htmlSrc.includes('id="xmasStar"'));
ok('browser-chrome colour matches the new palette', scriptSrc.includes("'#071f16'") && !scriptSrc.includes("'#07251a'"));

// ---- Birthday theme (party palette, aligned hat, balloons) ----
// The day gets the hat's pink/purple/blue set across the hero + bday card,
// balloons drifting behind the content, and a hat that sits ON the avatar.
ok('birthday repaints the hero title', cssFlat.includes('body.season-birthday .title {'));
ok('birthday repaints the bday card in party pink', cssFlat.includes('body.season-birthday .stat-card--bday {'));
ok('party hat centred on the avatar top', cssFlat.includes('.party-hat {') && cssFlat.includes('left: 50%; margin-left: -30px;'));
ok('hat pom not clipped (taller viewBox)', htmlSrc.includes('class="party-hat" viewBox="0 -4 100 124"'));
ok('balloon physics wired into applySeasons', scriptSrc.includes('setBalloons(s.birthday)'));
ok('balloon canvas styled behind the content', cssFlat.includes('#balloon-canvas {') && cssFlat.includes('z-index: 0'));
ok('reduced motion skips the balloon canvas', scriptSrc.includes('function startBalloons()') && scriptSrc.includes("prefers-reduced-motion: reduce"));
ok('emoji balloons replaced by the physics canvas', !htmlSrc.includes('bday-balloons') && !cssFlat.includes('balloonRise'));

// ---- Scroll performance (static wiring checks) ----
// The liquid glass stays; the work around it shrank: render containment on
// the below-fold glass cards, aurora softness baked into the ribbons (no live
// filter), device-scaled particle density, and the Chromium refraction
// resting while the page scrolls.
eq('particleCount: desktop keeps full density', L.particleCount(46, {}), 46);
eq('particleCount: coarse pointer lightens the load', L.particleCount(46, { coarsePointer: true }), 28);
eq('particleCount: blossom-heavy scales to 29', L.particleCount(48, { saveData: true }), 29);
eq('particleCount: small screens floor at 8', L.particleCount(12, { smallScreen: true }), 8);
eq('particleCount: junk input yields nothing', L.particleCount('nope', {}), 0);
ok('particleCount exported + used with device flags', scriptSrc.includes('particleCount(46, PARTICLE_FLAGS)') && scriptSrc.includes('particleCount(30, PARTICLE_FLAGS)'));
eq('petal fall keeps its original speed for a one-viewport page', L.petalFallDuration(1000, 0, 1000, 16, 48), 16);
eq('petal fall scales to the remaining long-page distance', L.petalFallDuration(4000, 100, 1000, 16, 48), 56.4);
eq('petal fall includes an above-screen spawn', L.petalFallDuration(4000, -50, 1000, 16, 48), 58.54);
eq('petal fall rejects an unusable viewport', L.petalFallDuration(4000, 0, 0, 16, 48), 0);
ok('page-height petal runway is wired', cssFlat.includes('.atmosphere.atmosphere--page { height: var(--atmosphere-height, 100vh); }') && cssFlat.includes('var(--atmosphere-height, 100vh) - var(--spawn-y, 0px) + var(--exit-pad, 48px)'));
ok('blossom bounds follow the live page height', scriptSrc.includes("classList.toggle('atmosphere--page', pagePetals)") && scriptSrc.includes('new ResizeObserver(scheduleAtmosphereBounds).observe(pageEl)'));
ok('petals keep a fresh branch cohort and seed the full runway', scriptSrc.includes('freshAtBranch') && scriptSrc.includes('-randRange(0, fall)'));
ok('wheel hijacked non-passively', scriptSrc.includes("addEventListener('wheel'") && scriptSrc.includes('{ passive: false }'));
ok('heavy scroll gated on reduced motion + KazuLib', scriptSrc.includes('KazuLib.wheelDeltaPx') && scriptSrc.includes('KazuLib.smoothScrollStep') && scriptSrc.includes('prefers-reduced-motion'));
ok('heavy scroll feeds the real frame delta to the step', scriptSrc.includes('smoothScrollStep(window.scrollY, targetY, SMOOTH_EASE, dt, 0.5)'));
ok('to-top rides the heavy scroll loop', scriptSrc.includes('window.kazuSmoothScrollTo'));
ok('below-fold glass cards render-contained', cssFlat.includes('content-visibility: auto') && cssFlat.includes('contain-intrinsic-size: auto 420px'));
ok('aurora live blur removed', !cssFlat.includes('filter: blur(38px)'));
ok('aurora softness baked into a mask', cssFlat.includes('mask: linear-gradient(to bottom, rgba(0,0,0,0), #000 35%, #000 65%, rgba(0,0,0,0))'));
ok('refraction rests while scrolling', scriptSrc.includes("classList.add('glass-scrolling')") && cssFlat.includes('html.glass-scrolling .card:not(.stat-card--bday),'));
ok('scroll-idle swap restores the frosted base', cssFlat.includes('html.glass-scrolling .toast {'));

// ---- Low-power mode (whole-effect kill switch for weak devices) ----
// particleCount lightens the drift; lowPowerMode decides when the ambient
// layer goes away entirely (body.low-power + the JS guards).
eq('low power: save-data opts out', L.lowPowerMode({ saveData: true }), true);
eq('low power: reduced motion opts out', L.lowPowerMode({ reducedMotion: true }), true);
eq('low power: one weak signal is only light density', L.lowPowerMode({ lowConcurrency: true }), false);
eq('low power: coarse pointer alone is only light density', L.lowPowerMode({ coarsePointer: true }), false);
eq('low power: weak-phone stack trips the switch', L.lowPowerMode({ coarsePointer: true, lowConcurrency: true }), true);
eq('low power: low memory + small screen trips the switch', L.lowPowerMode({ lowMemory: true, smallScreen: true }), true);
eq('low power: desktop keeps the full page', L.lowPowerMode({}), false);
eq('low power: missing flags object keeps the full page', L.lowPowerMode(), false);
ok('lowPowerMode exported + drives the body class', scriptSrc.includes('KazuLib.lowPowerMode') && scriptSrc.includes("classList.add('low-power')"));
ok('low power stills the particle sky', scriptSrc.includes("if (LOW_POWER && !ATMOSPHERE_OVERRIDE) mode = 'none';"));
ok('low power skips the liquid-glass refraction + the wheel lerp', scriptSrc.split("document.body.classList.contains('low-power')").length - 1 >= 2);
ok('low power reveals content without the observer', scriptSrc.includes("if (!LOW_POWER && 'IntersectionObserver' in window) {"));
ok('low power drops the frosted backdrop + ambient loops', cssFlat.includes('body.low-power { --card-blur: none; }') && cssFlat.includes('body.low-power .scroll-reveal {'));

// ---- First paint: no white flash on a cold cache ----
ok('canvas colour painted inline before the stylesheet', htmlSrc.includes('<style>html{background:#0f161f') && htmlSrc.indexOf('<style>html{background:#0f161f') < htmlSrc.indexOf('<link rel="stylesheet" href="style.css'));
ok('fonts no longer render-blocking', htmlSrc.includes('rel="stylesheet" media="print" onload="this.media=\'all\'"'));

// ---- Single time-of-day palette (light theme + toggle fully removed) ----
ok('no light theme selectors or bootstrap left', !cssFlat.includes('data-theme="light"') && !htmlSrc.includes('data-theme="light"') && !scriptSrc.includes('data-theme'));
ok('theme toggle orb fully removed', !htmlSrc.includes('theme-orb') && !scriptSrc.includes('theme-orb') && !cssFlat.includes('theme-orb') && !htmlSrc.includes('kazu-dark') && !scriptSrc.includes('kazu-dark'));
ok('registered tint properties glide the background', cssFlat.includes("@property --bg-h { syntax: '<number>';") && cssFlat.includes('body[data-bg-live] {'));
ok('sky tint written from the UK clock once a minute', scriptSrc.includes('applySkyTint(mins, doy)') && scriptSrc.includes("document.body.dataset.bgLive = '1'"));
ok('page gradient built from the live tint', cssFlat.includes('calc(var(--bg-l, 9) * 1%)'));

// ---- Liquid glass: default-on + the LB ordering bug (regression guards) ----
// The effect is the .card default: any future class="card ..." section gets
// the glint rim, frosted backdrop and glint shadow with no extra CSS.
ok('glass is the .card default (bday is the opt-out)', cssFlat.includes('.card:not(.stat-card--bday) {\n  --glint:'));
ok('glint shadow defaults onto .card, bday re-pinned solid', cssFlat.includes('.card { box-shadow: var(--card-shadow), var(--glint); }') && cssFlat.includes('.stat-card--bday { box-shadow: 0 16px 34px rgba(80,110,230,.3); }'));
// The LB base rule must sit BEFORE the liquid-glass section or it overrides
// the translucent fill/glint/frost on source order — the bug that left the
// Letterboxd card solid.
const lbBase = cssFlat.indexOf('.lb-card { border-radius: 24px;');
ok('lb base rule sits before the glass section', lbBase > -1 && lbBase < cssFlat.indexOf('LIQUID GLASS'));
// Story cards are first-class .card citizens now.
ok('story cards carry the .card class', htmlSrc.split('class="card story-card"').length - 1 === 2);
// Paint containment on .story-link clipped the hover-lifted card's top edge —
// the story cards stay uncontained on purpose.
ok('story links are not paint-contained (hover-lift clips)', !/\.story-link\s*\{\s*content-visibility/.test(cssFlat));

console.log('---');
console.log('TZ=' + (process.env.TZ || '(system default)') + ': ' +
  (fail === 0 ? ('ALL ' + pass + ' PASSED') : (pass + ' passed, ' + fail + ' FAILED')));
process.exit(fail ? 1 : 0);
