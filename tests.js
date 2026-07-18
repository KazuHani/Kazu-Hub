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

// ---- atmosphereMode (weather-reactive particles) ----
eq('drizzle 51 → rain', L.atmosphereMode(51), 'rain');
eq('rain 61 → rain', L.atmosphereMode(61), 'rain');
eq('showers 80 → rain', L.atmosphereMode(80), 'rain');
eq('thunderstorm 95 → rain', L.atmosphereMode(95), 'rain');
eq('snow 71 → snow-heavy', L.atmosphereMode(71), 'snow-heavy');
eq('heavy snow 75 → snow-heavy', L.atmosphereMode(75), 'snow-heavy');
eq('snow showers 86 → snow-heavy', L.atmosphereMode(86), 'snow-heavy');
eq('clear 0 → snow', L.atmosphereMode(0), 'snow');
eq('overcast 3 → snow', L.atmosphereMode(3), 'snow');
eq('fog 45 → snow', L.atmosphereMode(45), 'snow');
eq('garbage → snow', L.atmosphereMode('abc'), 'snow');
eq('null → snow', L.atmosphereMode(null), 'snow');
// aurora: clear or mainly clear, after dark only
eq('clear 0 + night → aurora', L.atmosphereMode(0, false), 'aurora');
eq('mainly clear 1 + night → aurora', L.atmosphereMode(1, false), 'aurora');
eq('clear 0 + day → snow', L.atmosphereMode(0, true), 'snow');
eq('clear 0 + isDay omitted → snow (legacy)', L.atmosphereMode(0), 'snow');
eq('rain 61 + night → still rain', L.atmosphereMode(61, false), 'rain');
eq('snow 71 + night → still snow-heavy', L.atmosphereMode(71, false), 'snow-heavy');
eq('overcast 3 + night → snow', L.atmosphereMode(3, false), 'snow');

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

console.log('---');
console.log('TZ=' + (process.env.TZ || '(system default)') + ': ' +
  (fail === 0 ? ('ALL ' + pass + ' PASSED') : (pass + ' passed, ' + fail + ' FAILED')));
process.exit(fail ? 1 : 0);
