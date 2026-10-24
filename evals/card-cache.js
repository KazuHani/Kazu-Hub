/* Gate assertions for the live-card cache (see "Live-card cache" in script.js
   and lib.js). Every live card keeps its last good answer in localStorage; a
   repeat visit paints it in the boot task (the Right-now cards held out of
   sight until then by index.html's #boot-cards) and only asks the API again
   once the copy is older than the card's poll interval. What this pins:
     1. lib.js: the envelope reader (cardCacheMeta), the scheduler maths
        (cardCacheFresh, pollDelay), the presence window and the sanitising
        parsers for the Discord, Steam, weather and quote copies;
     2. the real scheduler (paintCardCaches, runPoller, startPolling) sliced
        out of script.js and run against a fake clock: a fresh copy sends no
        request until it is due, a stale one refetches on its boot rung, a
        hidden tab resumes on the exact due time;
     2b. index.html's #boot-cards hold, run against stubs: the Right-now cards
        stay hidden from the first paint (which comes before script.js runs)
        until the boot paint lifts it, so a repeat visit never jumps;
     3. script.js wiring: each loader writes its copy (with its account id)
        only after a live answer, no renderer writes one, every card's paint is
        on a poller, the boot paint runs before polling starts;
     4. browser only (tests.html): the real page opened with seeded copies
        paints every card at load and sends none of their API requests.
   Shared by tests.js and tests.html; standalone: node evals/card-cache.js.
   Zero failures is the pass threshold. */
(function (global) {
  'use strict';

  function between(source, from, to) {
    var a = source.indexOf(from);
    if (a < 0) return null;
    var b = source.indexOf(to, a + from.length);
    return b > a ? source.slice(a, b) : null;
  }

  var MIN = 60 * 1000;

  // The page's own account ids (script.js defaults; index.html names no
  // control-panel store, so nothing overrides them).
  var IDS = { discord: '346360416827473921', steam: 'Kazu-Hani', mal: 'Kazu_Hani', lb: 'KazuHani', ytm: 'PLEWxJlvxPVrkYhMCA1IlYwDh5bg-jf39m' };

  // Realistic copies of every card, as the loaders write them, stamped `at`.
  function fixtures(L, at) {
    var today = L.ukDateIso(new Date(at));
    var p = today.split('-'), days = [];
    for (var i = 0; i < 5; i++) {
      var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + i));
      days.push(d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2));
    }
    var s = function (o) { return JSON.stringify(o); };
    return {
      'kazu-discord-cache': s({ at: at, id: IDS.discord, data: {
        discord_user: { id: IDS.discord, username: 'kazu_hani', global_name: 'Kazu | ハニ', avatar: null },
        discord_status: 'online', active_on_discord_desktop: true,
        activities: [{ type: 0, name: 'Mini Cozy Room: Lo-Fi', timestamps: { start: at - 70 * MIN } }],
        listening_to_spotify: false, spotify: null } }),
      'kazu-steam-cache': s({ at: at, id: IDS.steam, data: {
        avatar: 'https://avatars.steamstatic.com/cache-check_full.jpg', state: 'online', game: null,
        recent: [{ name: 'Mini Cozy Room: Lo-Fi', logo: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2297490/capsule_184x69.jpg', url: 'https://store.steampowered.com/app/2297490', hoursPlayed: 12.5, hoursOnRecord: 40 }] } }),
      'kazu-mal-cache': s({ at: at, id: IDS.mal, rows: [{ url: 'https://myanimelist.net/anime/59062', title: 'Gachiakuta', watched: 10, total: 24, pct: 42, img: '' }] }),
      'kazu-mal-manga-cache': s({ at: at, id: IDS.mal, rows: [] }),
      'kazu-lb-cache': s({ at: at, id: IDS.lb, entry: { title: 'The Odyssey', year: '2026', rating: 5, stars: '★★★★★', link: 'https://letterboxd.com/kazuhani/film/the-odyssey-2026/', poster: '', watched: '21 Jul 2026', rewatch: false } }),
      'kazu-ytm-cache': s({ at: at, id: IDS.ytm, rows: [{ id: 'ejUr_Uunvjc', title: 'Cache Check Song', artist: 'Cache Check Artist' }] }),
      'kazu-weather-cache': s({ at: at, data: {
        current: { weather_code: 3, temperature_2m: 11.2, wind_speed_10m: 18, is_day: 1, cloud_cover: 90, wind_direction_10m: 250 },
        daily: { time: days, weather_code: [3, 61, 2, 1, 3], temperature_2m_max: [13, 12, 14, 15, 12], temperature_2m_min: [7, 6, 8, 9, 7], precipitation_probability_max: [20, 80, 10, 5, 30] } } }),
      'kazu-quote-cache': s({ at: at, quote: { q: 'Little things make big days.', a: 'Unknown' } })
    };
  }

  function run(L, source, ok, eq, opts) {
    opts = opts || {};
    var NOW = Date.UTC(2026, 9, 24, 14, 0, 0);

    // ---- 1a. the envelope ----
    eq('card cache: nothing stored -> nothing to paint', [L.cardCacheMeta(null, 'a'), L.cardCacheMeta('', 'a')], [{ paint: false, at: 0 }, { paint: false, at: 0 }]);
    eq('card cache: corrupt, array or scalar copies -> nothing to paint', ['{nope', '[1,2]', '42', '"x"', 'null'].map(function (r) { return L.cardCacheMeta(r, 'a').paint; }), [false, false, false, false, false]);
    eq('card cache: a copy of this account is painted and carries its stamp', L.cardCacheMeta(JSON.stringify({ at: 5, id: 'a', rows: [] }), 'a'), { paint: true, at: 5 });
    eq('card cache: a copy of ANOTHER account is never painted', L.cardCacheMeta(JSON.stringify({ at: 5, id: 'b', rows: [] }), 'a'), { paint: false, at: 0 });
    eq('card cache: a numeric account id matches its string form', L.cardCacheMeta(JSON.stringify({ at: 5, id: '346' }), 346), { paint: true, at: 5 });
    eq('card cache: an unnamed (pre-id) copy is painted but never stands in for a fetch', L.cardCacheMeta(JSON.stringify({ at: 5, rows: [] }), 'a'), { paint: true, at: 0 });
    eq('card cache: a non-string id counts as unnamed', L.cardCacheMeta(JSON.stringify({ at: 5, id: 7 }), 'a'), { paint: true, at: 0 });
    eq('card cache: a card with no account (weather, quote) owns any copy', L.cardCacheMeta(JSON.stringify({ at: 5, id: 'whatever' }), null), { paint: true, at: 5 });
    eq('card cache: a missing, negative or non-number stamp reads as 0', [{ id: 'a' }, { at: -4, id: 'a' }, { at: '9', id: 'a' }, { at: null, id: 'a' }].map(function (p) { return L.cardCacheMeta(JSON.stringify(p), 'a').at; }), [0, 0, 0, 0]);

    // ---- 1b. freshness and the poll scheduler ----
    eq('card cache: fresh only strictly inside the interval', [
      L.cardCacheFresh(NOW - 1, 1000, NOW), L.cardCacheFresh(NOW - 999, 1000, NOW), L.cardCacheFresh(NOW - 1000, 1000, NOW),
      L.cardCacheFresh(NOW, 1000, NOW), L.cardCacheFresh(0, 1000, NOW), L.cardCacheFresh(NOW - 1, 0, NOW)
    ], [true, true, false, true, false, false]);
    eq('card cache: a stamp in the future (clock moved back) is never fresh', L.cardCacheFresh(NOW + 5000, 60000, NOW), false);
    eq('poll: never fetched -> now, or on its boot rung', [L.pollDelay(0, 5000, 0, false, NOW), L.pollDelay(0, 5000, 2000, false, NOW)], [0, 2000]);
    eq('poll: fresh data waits out exactly the rest of its interval', [L.pollDelay(NOW - 60000, 300000, 2000, false, NOW), L.pollDelay(NOW - 60000, 300000, 2000, true, NOW)], [240000, 240000]);
    eq('poll: stale data on a first run waits for its rung (the boot never piles up)', L.pollDelay(NOW - 400000, 300000, 2000, false, NOW), 2000);
    eq('poll: stale data after a run this visit is due now', L.pollDelay(NOW - 400000, 300000, 2000, true, NOW), 0);
    eq('poll: due exactly at the interval, not a millisecond later', [L.pollDelay(NOW - 300000, 300000, 0, true, NOW), L.pollDelay(NOW - 299999, 300000, 0, true, NOW)], [0, 1]);
    eq('poll: a future stamp is due (never a wait longer than the interval)', L.pollDelay(NOW + 999999, 300000, 0, true, NOW), 0);
    (function () {
      var bad = [];
      [1000, 20000, 300000, 1800000].forEach(function (ms) {
        for (var age = -2 * ms; age <= 2 * ms; age += ms / 8) {
          [0, 700].forEach(function (rung) {
            [false, true].forEach(function (ran) {
              var d = L.pollDelay(NOW - age, ms, rung, ran, NOW);
              var fresh = age >= 0 && age < ms;
              var want = fresh ? ms - age : (ran ? 0 : rung);
              if (d !== want || d < 0 || d > Math.max(ms, rung)) bad.push([ms, age, rung, ran, d]);
            });
          });
        }
      });
      eq('poll: sweep of ages, intervals, rungs: wait is the remainder when fresh, else 0 or the rung', bad, []);
    })();

    // The inline fallback script.js keeps for a missing lib.js agrees with lib.js.
    var fallbackSrc = between(source, 'const pollDelay = (KazuLib && KazuLib.pollDelay) || ', '\n  };');
    ok('poll: script.js keeps an inline pollDelay fallback', !!fallbackSrc);
    if (fallbackSrc) {
      var fallback = new Function('KazuLib', 'return ' + fallbackSrc.slice('const pollDelay = (KazuLib && KazuLib.pollDelay) || '.length) + '\n  };')(null);
      var drift = [];
      [[0, 5000, 0, false], [0, 5000, 2000, false], [NOW - 1, 5000, 0, true], [NOW - 5000, 5000, 700, false], [NOW - 5000, 5000, 700, true], [NOW + 9, 5000, 700, false], [NOW - 60000, 300000, 2000, false]].forEach(function (c) {
        var a = fallback(c[0], c[1], c[2], c[3], NOW), b = L.pollDelay(c[0], c[1], c[2], c[3], NOW);
        if (a !== b) drift.push([c, a, b]);
      });
      eq('poll: the inline fallback matches KazuLib.pollDelay', drift, []);
    }

    // ---- 1c. Discord presence window ----
    var K = L.PRESENCE_KEEP_MS;
    eq('presence: the window is 10 minutes', K, 10 * MIN);
    var lanyard = {
      discord_user: { id: '1', username: 'kazu_hani', global_name: 'Kazu', avatar: 'abc' },
      discord_status: 'dnd', active_on_discord_mobile: true, active_on_discord_desktop: 'yes',
      activities: [
        { type: 4, state: 'busy', name: 'Custom Status' },
        { type: 0, name: 'Game', details: 'Level 3', state: 'Solo', timestamps: { start: NOW - 5 * MIN }, assets: { large_image: 'mp:external/abc/x.png', small_image: 'bad "quote"' }, application_id: '123456789' },
        { type: 2, name: 'Spotify' },
        { type: 0, name: 'Bad', application_id: 'javascript:1', timestamps: { start: 'soon' } }
      ],
      listening_to_spotify: true,
      spotify: { song: 'Song', artist: 'Artist', album_art_url: 'https://i.scdn.co/image/ab67616d0000b273', track_id: '4uLU6hMCjMI75M1A2tKUQC', timestamps: { start: NOW - 60000, end: NOW + 120000 } }
    };
    var fresh = L.discordCacheParse(JSON.stringify({ at: NOW - 2 * MIN, id: '1', data: lanyard }), NOW);
    eq('presence: inside the window the copy comes back as it was left', [fresh.discord_status, fresh.active_on_discord_mobile, fresh.active_on_discord_desktop, fresh.listening_to_spotify], ['dnd', true, undefined, true]);
    eq('presence: only playing (0) and custom status (4) activities survive, each field checked', fresh.activities, [
      { type: 4, name: 'Custom Status', state: 'busy' },
      { type: 0, name: 'Game', details: 'Level 3', state: 'Solo', timestamps: { start: NOW - 5 * MIN }, assets: { large_image: 'mp:external/abc/x.png' }, application_id: '123456789' },
      { type: 0, name: 'Bad' }
    ]);
    eq('presence: Spotify comes back with its timestamps', fresh.spotify, { song: 'Song', artist: 'Artist', album_art_url: 'https://i.scdn.co/image/ab67616d0000b273', track_id: '4uLU6hMCjMI75M1A2tKUQC', timestamps: { start: NOW - 60000, end: NOW + 120000 } });
    var edge = L.discordCacheParse(JSON.stringify({ at: NOW - K, data: lanyard }), NOW);
    eq('presence: at the window edge the copy is identity only, offline', [edge.discord_status, edge.activities, edge.spotify, edge.discord_user.username], ['offline', [], undefined, 'kazu_hani']);
    eq('presence: one ms inside the edge it is still kept', L.discordCacheParse(JSON.stringify({ at: NOW - K + 1, data: lanyard }), NOW).discord_status, 'dnd');
    eq('presence: a future stamp, or no clock, is offline', [L.discordCacheParse(JSON.stringify({ at: NOW + 1000, data: lanyard }), NOW).discord_status, L.discordCacheParse(JSON.stringify({ at: NOW, data: lanyard })).discord_status], ['offline', 'offline']);
    var odd = JSON.parse(JSON.stringify(lanyard));
    odd.discord_status = 'invisible';
    odd.spotify.track_id = '../../evil';
    odd.spotify.album_art_url = 'http://i.scdn.co/x';
    odd.spotify.timestamps = { start: NOW, end: NOW - 1 };
    var oddCopy = L.discordCacheParse(JSON.stringify({ at: NOW - MIN, data: odd }), NOW);
    eq('presence: unknown status -> offline; a track id that is not plain letters and digits, http art and backwards times are dropped', [oddCopy.discord_status, oddCopy.spotify.track_id, oddCopy.spotify.album_art_url, oddCopy.spotify.timestamps], ['offline', null, '', null]);
    eq('presence: Spotify without a song is not a song', L.discordCacheParse(JSON.stringify({ at: NOW - MIN, data: Object.assign({}, lanyard, { spotify: { artist: 'x' } }) }), NOW).listening_to_spotify, undefined);

    // ---- 1d. Steam ----
    var steamProfile = { avatar: 'https://avatars.steamstatic.com/x_full.jpg', state: 'in-game', game: { name: 'Elden Ring', url: 'https://store.steampowered.com/app/1245620' },
      recent: [{ name: 'Elden Ring', logo: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/capsule_184x69.jpg', url: 'https://store.steampowered.com/app/1245620', hoursPlayed: 3.5, hoursOnRecord: 120 }] };
    var steamRaw = function (data, at) { return JSON.stringify({ at: at, id: 'Kazu-Hani', data: data }); };
    eq('steam copy: round-trips inside the presence window', L.steamCacheParse(steamRaw(steamProfile, NOW - MIN), NOW), steamProfile);
    eq('steam copy: past the window the status is offline and the game is dropped; the library stays', (function () { var c = L.steamCacheParse(steamRaw(steamProfile, NOW - K), NOW); return [c.state, c.game, c.recent.length, c.avatar]; })(), ['offline', null, 1, steamProfile.avatar]);
    eq('steam copy: without a clock, offline', L.steamCacheParse(steamRaw(steamProfile, NOW - MIN)).state, 'offline');
    eq('steam copy: store links are rebuilt from the app id', L.steamCacheParse(steamRaw(Object.assign({}, steamProfile, { game: { name: 'G', url: 'https://evil.example/app/730/x' }, recent: [{ name: 'G', url: 'javascript:alert(1)//app/1' }] }), NOW - MIN), NOW), { avatar: steamProfile.avatar, state: 'in-game', game: { name: 'G', url: 'https://store.steampowered.com/app/730' }, recent: [{ name: 'G', logo: '', url: 'https://store.steampowered.com/app/1', hoursPlayed: 0, hoursOnRecord: 0 }] });
    eq('steam copy: http or missing avatar, missing library, nameless row -> no copy', [
      L.steamCacheParse(steamRaw(Object.assign({}, steamProfile, { avatar: 'http://x/y.jpg' }), NOW), NOW),
      L.steamCacheParse(steamRaw(Object.assign({}, steamProfile, { avatar: '' }), NOW), NOW),
      L.steamCacheParse(steamRaw(Object.assign({}, steamProfile, { recent: null }), NOW), NOW),
      L.steamCacheParse(steamRaw(Object.assign({}, steamProfile, { recent: [{ name: '' }] }), NOW), NOW),
      L.steamCacheParse('{nope', NOW), L.steamCacheParse(null, NOW)
    ], [null, null, null, null, null, null]);
    eq('steam copy: unknown state -> offline, at most three rows, bad hours -> 0, markup in a logo -> no logo', (function () {
      var c = L.steamCacheParse(steamRaw(Object.assign({}, steamProfile, { state: 'snooze', recent: [1, 2, 3, 4].map(function (i) { return { name: 'G' + i, logo: 'https://x/"><img src=x onerror=alert(1)>', hoursPlayed: -1, hoursOnRecord: 'many' }; }) }), NOW), NOW);
      return [c.state, c.recent.length, c.recent[0].hoursPlayed, c.recent[0].hoursOnRecord, c.recent[0].logo];
    })(), ['offline', 3, 0, 0, '']);

    // ---- 1e. weather ----
    var fx = fixtures(L, NOW);
    var wx = L.weatherCacheParse(fx['kazu-weather-cache'], L.ukDateIso(new Date(NOW)));
    eq('weather copy: round-trips when its first day is today', [wx && wx.current.temperature_2m, wx && wx.daily.time.length, wx && wx.daily.precipitation_probability_max[1]], [11.2, 5, 80]);
    eq('weather copy: yesterday\'s forecast is refused (its first row would be labelled Today)', L.weatherCacheParse(fx['kazu-weather-cache'], '2026-10-25'), null);
    eq('weather copy: no day given -> no day check', !!L.weatherCacheParse(fx['kazu-weather-cache']), true);
    var wbad = function (mut) { var p = JSON.parse(fx['kazu-weather-cache']); mut(p.data); return L.weatherCacheParse(JSON.stringify(p)); };
    eq('weather copy: a non-number reading, is_day not 0/1, a bad day, 17 days -> no copy', [
      wbad(function (d) { d.current.temperature_2m = '11'; }), wbad(function (d) { d.current.is_day = 2; }),
      wbad(function (d) { d.daily.time[2] = 'tomorrow'; }), wbad(function (d) { d.daily.time = new Array(17).fill('2026-10-24'); }),
      wbad(function (d) { delete d.current; })
    ], [null, null, null, null, null]);
    eq('weather copy: optional readings and odd daily values become null', (function () { var c = wbad(function (d) { d.current.cloud_cover = 'lots'; d.daily.temperature_2m_max[0] = 'hot'; delete d.daily.weather_code; }); return [c.current.cloud_cover, c.daily.temperature_2m_max[0], c.daily.weather_code]; })(), [null, null, [null, null, null, null, null]]);
    eq('ukDateIso: the UK date, across both clock changes', [
      L.ukDateIso(new Date(Date.UTC(2026, 2, 29, 0, 30))), L.ukDateIso(new Date(Date.UTC(2026, 9, 24, 23, 30))),
      L.ukDateIso(new Date(Date.UTC(2026, 9, 25, 23, 30))), L.ukDateIso(new Date(Date.UTC(2026, 11, 31, 23, 59)))
    ], ['2026-03-29', '2026-10-25', '2026-10-25', '2026-12-31']);

    // ---- 1f. quote ----
    eq('quote copy: round-trips', L.quoteCacheParse(fx['kazu-quote-cache']), { q: 'Little things make big days.', a: 'Unknown' });
    eq('quote copy: a missing author reads Unknown; no text, non-text or 1000+ chars -> no copy', [
      L.quoteCacheParse(JSON.stringify({ quote: { q: ' Go. ' } })), L.quoteCacheParse(JSON.stringify({ quote: { q: '  ' } })),
      L.quoteCacheParse(JSON.stringify({ quote: { q: 5 } })), L.quoteCacheParse(JSON.stringify({ quote: { q: new Array(1002).join('x') } })), L.quoteCacheParse('{nope')
    ], [{ q: 'Go.', a: 'Unknown' }, null, null, null, null]);

    // ---- 1g. every fixture parses (they double as the browser check's seed) ----
    var at = NOW - MIN;
    var seed = fixtures(L, at);
    eq('fixtures: every card\'s copy is painted and owned', [
      L.cardCacheMeta(seed['kazu-discord-cache'], IDS.discord), L.cardCacheMeta(seed['kazu-steam-cache'], IDS.steam), L.cardCacheMeta(seed['kazu-mal-cache'], IDS.mal),
      L.cardCacheMeta(seed['kazu-mal-manga-cache'], IDS.mal), L.cardCacheMeta(seed['kazu-lb-cache'], IDS.lb), L.cardCacheMeta(seed['kazu-ytm-cache'], IDS.ytm),
      L.cardCacheMeta(seed['kazu-weather-cache'], null), L.cardCacheMeta(seed['kazu-quote-cache'], null)
    ].map(function (m) { return m.paint && m.at === at; }), [true, true, true, true, true, true, true, true]);
    ok('fixtures: every payload parses', !!(L.discordCacheParse(seed['kazu-discord-cache'], NOW) && L.steamCacheParse(seed['kazu-steam-cache'], NOW) && L.malCacheParse(seed['kazu-mal-cache']) &&
      L.malMangaCacheParse(seed['kazu-mal-manga-cache']) && L.letterboxdCacheParse(seed['kazu-lb-cache']) && L.ytPlaylistCacheParse(seed['kazu-ytm-cache']) &&
      L.weatherCacheParse(seed['kazu-weather-cache'], L.ukDateIso(new Date(at))) && L.quoteCacheParse(seed['kazu-quote-cache'])));

    // ---- 2. the real scheduler against a fake clock ----
    var sched = between(source, '  let timers = [];', "  document.addEventListener('visibilitychange'");
    ok('scheduler: the poller block is where the slice expects it', !!sched && sched.indexOf('function startPolling()') !== -1 && sched.indexOf('function paintCardCaches()') !== -1);
    if (sched) {
      var world = function (pollers, start, opts2) {
        opts2 = opts2 || {};
        var now = start, queue = [], next = 1, api = null;
        var timer = function (repeat) { return function (fn, ms) { var id = next++; queue.push({ id: id, fn: fn, at: now + (ms || 0), every: repeat ? ms : 0 }); return id; }; };
        var clear = function (id) { queue = queue.filter(function (q) { return q.id !== id; }); };
        pollers.forEach(function (p) {
          p.runs = [];
          var fetch = p.fn;
          p.fn = function () { p.runs.push(now - start); if (fetch) fetch(); };
          if (p.paintWith !== undefined) {
            var v = p.paintWith;
            p.paint = function (ms, t) { p.paintedWhile = api.painting(); p.paintArgs = [ms, t]; if (v instanceof Error) throw v; return v; };
          }
        });
        var hold = { removed: 0, remove: function () { this.removed++; } };
        var doc = { getElementById: function (id) { return id === 'boot-cards-hold' && !hold.removed ? hold : null; } };
        api = new Function('KazuLib', 'POLLERS', 'Date', 'setTimeout', 'setInterval', 'clearInterval', 'document',
          'var paintingFromCache = false;\n' + sched + '\nreturn { paintCardCaches: paintCardCaches, startPolling: startPolling, stopPolling: stopPolling, painting: function () { return paintingFromCache; }, timers: function () { return timers.length; } };')(
          opts2.lib === undefined ? L : opts2.lib, pollers, { now: function () { return now; } }, timer(false), timer(true), clear, doc);
        return {
          api: api,
          hold: hold,
          advance: function (ms) {
            var end = now + ms;
            for (;;) {
              var due = queue.filter(function (q) { return q.at <= end; }).sort(function (a, b) { return a.at - b.at || a.id - b.id; })[0];
              if (!due) break;
              now = due.at;
              if (due.every) due.at += due.every; else clear(due.id);
              due.fn();
            }
            now = end;
          },
          pending: function () { return queue.length; }
        };
      };
      var T = Date.UTC(2026, 9, 24, 12, 0, 0);
      var P = function (o) { return Object.assign({ last: 0 }, o); };

      // A cold visit: no copies. The clock-like poller runs at once, the card on its rung.
      var cold = [P({ ms: 1000 }), P({ ms: 300000, firstDelay: 2000, paintWith: 0 })];
      var w1 = world(cold, T);
      w1.api.paintCardCaches();
      w1.api.startPolling();
      w1.advance(610000);
      eq('scheduler: cold visit -> the tick runs at once, the card on its rung, then every interval', [cold[0].runs.length, cold[1].runs], [611, [2000, 302000, 602000]]);

      // A repeat visit with a fresh copy (1 min old, 5 min interval): no request until it is due.
      var warm = [P({ ms: 300000, firstDelay: 2000, paintWith: T - 60000 })];
      var w2 = world(warm, T);
      w2.api.paintCardCaches();
      eq('scheduler: the paint runs with the boot flag up, gets the interval and the clock, and the flag drops after', [warm[0].paintedWhile, warm[0].paintArgs, w2.api.painting()], [true, [300000, T], false]);
      w2.api.startPolling();
      w2.advance(239999);
      eq('scheduler: fresh copy -> no request before it is due', warm[0].runs, []);
      w2.advance(300001);
      eq('scheduler: ...then exactly when the copy turns 5 minutes old, and every 5 minutes after', warm[0].runs, [240000, 540000]);

      // A stale copy (7 min old): painted, refetched on its rung, not in the load task.
      var stale = [P({ ms: 300000, firstDelay: 2000, paintWith: T - 420000 })];
      var w3 = world(stale, T);
      w3.api.paintCardCaches();
      w3.api.startPolling();
      eq('scheduler: stale copy -> nothing inside the load task', stale[0].runs, []);
      w3.advance(2000);
      eq('scheduler: ...the refetch rides its boot rung', stale[0].runs, [2000]);

      // An unowned copy (paint returns 0) and a paint that throws fall back to the rung; the
      // others still paint.
      var mixed = [P({ ms: 60000, firstDelay: 700, paintWith: new Error('bad copy') }), P({ ms: 60000, firstDelay: 900, paintWith: 0 }), P({ ms: 60000, firstDelay: 1100, paintWith: T - 1000 })];
      var w4 = world(mixed, T);
      w4.api.paintCardCaches();
      eq('scheduler: the #boot-cards hold is lifted by the paint, in the same task, even after a throwing paint', w4.hold.removed, 1);
      w4.api.startPolling();
      w4.advance(60000);
      eq('scheduler: a throwing paint -> rung; an unowned copy -> rung; a fresh one waits; the flag never sticks', [mixed[0].runs, mixed[1].runs, mixed[2].runs, w4.api.painting()], [[700], [900], [59000], false]);
      var noLib = world([P({ ms: 60000, firstDelay: 700, paintWith: T - 1000 })], T, { lib: null });
      noLib.api.paintCardCaches();
      eq('scheduler: without lib.js nothing is painted, and the hold is still lifted', [noLib.hold.removed, noLib.api.painting()], [1, false]);

      // A hidden tab: polling stops, and on return a fresh card waits for its real due
      // time (not a whole new interval from the moment the tab came back).
      var tab = [P({ ms: 600000 })];
      var w5 = world(tab, T);
      w5.api.paintCardCaches();
      w5.api.startPolling();
      w5.advance(100000);
      w5.api.stopPolling();
      eq('scheduler: hidden -> every timer is cleared', [w5.pending(), w5.api.timers()], [0, 0]);
      w5.advance(100000);
      w5.api.startPolling();
      w5.advance(399999);
      eq('scheduler: back inside the interval -> nothing yet', tab[0].runs, [0]);
      w5.advance(1);
      eq('scheduler: ...then on the original due time (10 min after the last run)', tab[0].runs, [0, 600000]);
      w5.api.stopPolling();
      w5.advance(1200000);
      w5.api.startPolling();
      eq('scheduler: back after the interval -> due at once', tab[0].runs, [0, 600000, 1800000]);

      // A fresh copy whose tab is hidden before it falls due comes back on its rung, not at once.
      var away = [P({ ms: 300000, firstDelay: 2000, paintWith: T - 60000 })];
      var w6 = world(away, T);
      w6.api.paintCardCaches();
      w6.api.startPolling();
      w6.advance(30000);
      w6.api.stopPolling();
      w6.advance(600000);
      w6.api.startPolling();
      w6.advance(1999);
      eq('scheduler: a card that never ran this visit returns on its rung', away[0].runs, []);
      w6.advance(1);
      eq('scheduler: ...and runs there', away[0].runs, [632000]);

      var twice = [P({ ms: 1000 })];
      var w7 = world(twice, T);
      w7.api.startPolling();
      w7.api.startPolling();
      w7.advance(3000);
      eq('scheduler: starting twice never doubles the timers', twice[0].runs, [0, 1000, 2000, 3000]);
    }

    // ---- 2b. the #boot-cards hold (index.html), run against stubs ----
    // The page is painted before script.js runs, so a repeat visit would show the
    // loading rows and then jump to full height. The hold hides the Right-now cards
    // from the first paint whenever a card copy exists; script.js lifts it.
    if (opts.html) {
      var bootM = /<script id="boot-cards">([\s\S]*?)<\/script>/.exec(opts.html);
      ok('hold: #boot-cards is an inline, synchronous script in <head>, before the stylesheet', !!bootM && opts.html.indexOf('<script id="boot-cards">') < opts.html.indexOf('</head>') &&
        opts.html.indexOf('<script id="boot-cards">') < opts.html.indexOf('<link rel="stylesheet" href="style.css') && !/<script[^>]*id="boot-cards"[^>]*(async|defer|type=|src=)/.test(opts.html));
      if (bootM) {
        var boot = function (store, throws) {
          var head = { kids: [], appendChild: function (n) { n.parentNode = head; head.kids.push(n); }, removeChild: function (n) { head.kids.splice(head.kids.indexOf(n), 1); n.parentNode = null; } };
          var timers = [];
          var doc = { head: head, createElement: function (tag) { return { tagName: tag, id: '', textContent: '', parentNode: null }; } };
          var ls = { getItem: function (k) { if (throws) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; } };
          new Function('document', 'localStorage', 'setTimeout', bootM[1])(doc, ls, function (fn, ms) { timers.push({ fn: fn, ms: ms }); });
          return { head: head, timers: timers };
        };
        var none = boot({});
        eq('hold: a first visit (no copies) holds nothing and sets no timer', [none.head.kids.length, none.timers.length], [0, 0]);
        var other = boot({ 'kazu-weather-cache': '{}', 'kazu-quote-cache': '{}', 'kazu-ytm-cache': '{}', 'kazu-site-config': '{}' });
        eq('hold: copies outside the Right-now grid hold nothing', other.head.kids.length, 0);
        ['kazu-discord-cache', 'kazu-steam-cache', 'kazu-mal-cache', 'kazu-lb-cache'].forEach(function (k) {
          var s = {}; s[k] = '{"at":1}';
          var b = boot(s);
          eq('hold: a ' + k + ' copy hides the Right-now cards with one style element and an 8 s failsafe', [b.head.kids.length, b.head.kids[0] && b.head.kids[0].id, b.head.kids[0] && b.head.kids[0].textContent, b.timers.length, b.timers[0] && b.timers[0].ms], [1, 'boot-cards-hold', '.right-now-grid > .card { visibility: hidden; }', 1, 8000]);
        });
        var all = boot({ 'kazu-discord-cache': '1', 'kazu-steam-cache': '1', 'kazu-mal-cache': '1', 'kazu-lb-cache': '1' });
        eq('hold: several copies still add exactly one hold', all.head.kids.length, 1);
        all.timers[0].fn();
        eq('hold: the failsafe lifts it if script.js never does', all.head.kids.length, 0);
        all.timers[0].fn();
        eq('hold: ...and a second lift (script.js got there first) is harmless', all.head.kids.length, 0);
        var blocked = boot({ 'kazu-discord-cache': '1' }, true);
        eq('hold: blocked storage never throws and holds nothing', blocked.head.kids.length, 0);
        var heldKeys = (/var keys = \[([^\]]*)\]/.exec(bootM[1]) || [])[1];
        var cardKeys = ['DISCORD', 'STEAM', 'MAL', 'LB'].map(function (k) { var m = new RegExp('const ' + k + "_CACHE_KEY = '([a-z-]+)'").exec(source); return m ? "'" + m[1] + "'" : null; });
        eq('hold: it watches exactly the Right-now cards\' cache keys from script.js', (heldKeys || '').split(', '), cardKeys);
        ok('hold: index.html cards are direct children of .right-now-grid (the rule\'s selector)', /<section class="right-now-grid">\s*(?:<!--[\s\S]*?-->\s*)?<div class="card discord-card/.test(opts.html));
      }
    }

    // ---- 3. script.js wiring ----
    var writes = [
      ['Discord REST', 'cardCacheWrite(DISCORD_CACHE_KEY, DISCORD_ID, { data: j.data });'],
      ['Discord socket', 'cardCacheWrite(DISCORD_CACHE_KEY, DISCORD_ID, { data: msg.d });'],
      ['Steam', 'cardCacheWrite(STEAM_CACHE_KEY, STEAM_VANITY, { data: profile });'],
      ['MAL anime', 'cardCacheWrite(MAL_CACHE_KEY, MAL_USER, { rows });'],
      ['MAL manga', 'cardCacheWrite(MAL_MANGA_CACHE_KEY, MAL_USER, { rows });'],
      ['Letterboxd', 'cardCacheWrite(LB_CACHE_KEY, LB_USER, { entry });'],
      ['playlist', 'cardCacheWrite(YTM_CACHE_KEY, YTM_PLAYLIST_ID, { rows });'],
      ['weather', 'cardCacheWrite(WEATHER_CACHE_KEY, null, { data: { current: j.current, daily: j.daily || null } });'],
      ['quote', "cardCacheWrite(QUOTE_CACHE_KEY, null, { quote: { q: q.q, a: q.a || 'Unknown' } });"]
    ];
    writes.forEach(function (w) { ok('wiring: ' + w[0] + ' writes its copy, stamped with its account, after a live answer', source.indexOf(w[1]) !== -1); });
    eq('wiring: nothing else writes a card copy', (source.match(/cardCacheWrite\(/g) || []).length, writes.length + 1);
    ok('wiring: no card copy is written around the stamp helper', !/localStorage\.setItem\(\s*(?:DISCORD|STEAM|MAL|MAL_MANGA|LB|YTM|WEATHER|QUOTE)_CACHE_KEY/.test(source) && !/setItem\('kazu-(?:discord|steam|mal|mal-manga|lb|ytm|weather|quote)-cache'/.test(source));
    ['renderDiscord', 'renderSteam', 'renderMalRows', 'renderMalMangaRows', 'renderLetterboxd', 'renderPlaylistTracks', 'renderWeather', 'renderQuote'].forEach(function (fn) {
      var body = between(source, '  function ' + fn + '(', '\n  }\n');
      ok('wiring: ' + fn + ' never writes a copy (a render from the copy would re-stamp it as fresh)', !!body && body.indexOf('cardCacheWrite') === -1 && body.indexOf('localStorage') === -1);
    });
    ['renderDiscord', 'renderSteam', 'renderMalRows', 'renderLetterboxd', 'renderWeather'].forEach(function (fn) {
      var body = between(source, '  function ' + fn + '(', '\n  }\n');
      ok('wiring: ' + fn + ' reveals through cardReveal (instant at boot, popReveal live)', !!body && body.indexOf('cardReveal(') !== -1 && body.indexOf('popReveal(') === -1);
    });
    var reveal = between(source, '  function cardReveal(', '\n  }\n');
    ok('wiring: cardReveal swaps at once while painting and defers to popReveal otherwise', !!reveal && reveal.indexOf('if (!paintingFromCache) { popReveal(loadedEl, loadingEl); return; }') !== -1);
    ok('wiring: the playlist pop and the AniList fetch stay out of the boot paint', source.indexOf('if (!paintingFromCache) popRefresh(list);') !== -1 && (source.match(/if \(!paintingFromCache\) loadMalJa\(\)/g) || []).length === 2 && source.indexOf('scheduleIdle(loadMalJa, 3000);') !== -1);
    ok('wiring: the boot paint builds no particles; the idle slot picks the sky from the painted weather', /if \(!paintingFromCache\) \{\s*if \(!ATMOSPHERE_OVERRIDE\) setAtmosphere/.test(source) && source.indexOf("setAtmosphere(ATMOSPHERE_OVERRIDE || (weatherCurrent ? atmosphereMode(weatherCurrent.code, weatherCurrent.isDay) : 'blossom'));") !== -1);

    var pollers = between(source, '  const POLLERS = [', '\n  ];');
    var wired = pollers ? (pollers.match(/paint: (\w+)/g) || []).map(function (s) { return s.slice(7); }).sort() : [];
    var defined = (source.match(/function (paint\w+Cache)\(ms, now\)/g) || []).map(function (s) { return s.slice(9, s.indexOf('(')); }).sort();
    eq('wiring: every card paint is on a poller, and every poller paint exists', wired, defined);
    eq('wiring: the seven live sections each paint', defined, ['paintDiscordCache', 'paintLetterboxdCache', 'paintMalCache', 'paintPlaylistCache', 'paintQuoteCache', 'paintSteamCache', 'paintWeatherCache']);
    ok('wiring: Steam paints before Discord (the avatar both cards show)', !!pollers && pollers.indexOf('paint: paintSteamCache') < pollers.indexOf('paint: paintDiscordCache'));
    ok('wiring: the boot paint runs in the load task, right before polling first starts', source.indexOf('\n  paintCardCaches();\n  if (!document.hidden) {\n    startPolling();') !== -1 && (source.match(/\bpaintCardCaches\(\);/g) || []).length === 1);
    ok('wiring: the quote and the weather paint only a fresh copy (a stale one is certain to be replaced)', /function paintQuoteCache[\s\S]*?meta\.paint && KazuLib\.cardCacheFresh\(meta\.at, ms, now\)/.test(source) && /function paintWeatherCache[\s\S]*?!KazuLib\.cardCacheFresh\(meta\.at, ms, now\)/.test(source));
    ok('wiring: a failed refetch keeps the card, redrawn from its copy under the presence window',source.indexOf('const cached = discordCacheRead(Date.now());') !== -1 && source.indexOf('const cached = steamCacheRead(Date.now());') !== -1);
    var siteCaches = between(source, 'const SITE_CACHES = ', ';');
    ok('wiring: a changed account id drops every account-keyed copy, Steam included', !!siteCaches && ['kazu-discord-cache', 'kazu-steam-cache', 'kazu-mal-cache', 'kazu-mal-manga-cache', 'kazu-lb-cache', 'kazu-ytm-cache'].every(function (k) { return siteCaches.indexOf("'" + k + "'") !== -1; }));

    // Every localStorage key the page uses is on AGENTS.md's list (so a new one cannot collide unseen).
    if (opts.docs) {
      var listed = between(opts.docs, '**localStorage keys in use:**', 'Don\'t collide') || '';
      ok('docs: AGENTS.md still has its localStorage key list', listed.length > 0);
      var keys = (source.match(/'kazu-[a-z-]+'/g) || []).map(function (k) { return k.slice(1, -1); }).filter(function (k, i, a) { return a.indexOf(k) === i && k !== 'kazu-langchange'; });
      eq('docs: every kazu-* localStorage key in script.js is listed in AGENTS.md', keys.filter(function (k) { return listed.indexOf('`' + k + '`') === -1; }), []);
    }
  }

  // ---- 4. browser only: the real page with seeded copies ----
  // Opens index.html in a hidden frame twice. With fresh copies (2 s old,
  // inside every interval, Discord's 20 s included) every card is painted by
  // the time the page has loaded, and no API request for those cards goes out
  // before the quote's rung has passed. With 2-hour-old copies the cards still paint at once,
  // Discord and Steam read offline, and the weather (fetched at load) is left
  // to its live answer. The visitor's own copies are put back afterwards.
  var API = /api\.lanyard\.rest\/v1|steamcommunity\.com|proxy\.cors\.sh|api\.cors\.lol|api\.jikan\.moe|letterboxd\.com|youtube\.com\/feeds|zenquotes\.io|api\.open-meteo\.com/;
  function live(L, doc, ok, eq, wait) {
    var store = window.localStorage, KEYS = Object.keys(fixtures(L, Date.now()));
    var saved = {};
    KEYS.forEach(function (k) { saved[k] = store.getItem(k); });
    function restore() { KEYS.forEach(function (k) { if (saved[k] === null) store.removeItem(k); else store.setItem(k, saved[k]); }); }
    function open(age) {
      var seed = fixtures(L, Date.now() - age);
      KEYS.forEach(function (k) { store.setItem(k, seed[k]); });
      return new Promise(function (resolve, reject) {
        var f = doc.createElement('iframe');
        f.style.cssText = 'position:absolute;left:-9999px;top:0;width:1100px;height:900px;border:0';
        var timer = setTimeout(function () { reject(new Error('frame timeout')); }, 15000);
        f.onload = function () { clearTimeout(timer); resolve(f); };
        f.src = 'index.html?weather=none&cachecheck=' + age;
        doc.body.appendChild(f);
      });
    }
    function shown(d, id) { var el = d.getElementById(id); return !!el && !el.classList.contains('hidden'); }
    function text(d, sel) { var el = d.querySelector(sel); return el ? el.textContent.trim() : null; }
    var frame = null;
    return open(2000).then(function (f) {
      frame = f;
      var d = f.contentDocument;
      eq('cache live: a repeat visit opens on every card, no loading row', ['discordLoaded', 'steamLoaded', 'malLoaded', 'lbLoaded', 'weatherLoaded'].map(function (id) { return shown(d, id); })
        .concat(['discordLoading', 'steamLoading', 'malLoading', 'lbLoading', 'weatherLoading'].map(function (id) { return !shown(d, id); })), [true, true, true, true, true, true, true, true, true, true]);
      eq('cache live: each card shows its copy', [text(d, '#discordName'), text(d, '#discordStatusText'), text(d, '#discordGameName'), text(d, '#steamStatusText'), text(d, '.recent-game-name'),
        text(d, '#malList .mal-title'), text(d, '.lb-title'), text(d, '#liveTemp'), text(d, '#quoteText'), text(d, '#musicFeatured .music-track-name')],
        ['Kazu | ハニ', '● Online', 'Mini Cozy Room: Lo-Fi', '● Online', 'Mini Cozy Room: Lo-Fi', 'Gachiakuta', 'The Odyssey 2026', '11°C', 'Little things make big days.', 'Cache Check Song']);
      ok('cache live: the quote is showing', d.getElementById('quoteBox').classList.contains('visible'));
      eq('cache live: the #boot-cards hold was lifted by the paint and the cards are visible', [d.getElementById('boot-cards-hold'), f.contentWindow.getComputedStyle(d.querySelector('.right-now-grid > .discord-card')).visibility], [null, 'visible']);
      return new Promise(function (resolve) { setTimeout(resolve, wait); });
    }).then(function () {
      var hits = frame.contentWindow.performance.getEntriesByType('resource').map(function (e) { return e.name; }).filter(function (n) { return API.test(n); });
      eq('cache live: fresh copies send none of their API requests (' + Math.round(wait / 1000) + ' s, past every boot rung)', hits, []);
      frame.parentNode.removeChild(frame);
      frame = null;
      return open(120 * MIN);
    }).then(function (f) {
      frame = f;
      var d = f.contentDocument;
      eq('cache live: old copies still paint at once, presence reads offline, weather waits for its live answer', [
        shown(d, 'discordLoaded'), text(d, '#discordStatusText'), shown(d, 'discordGame'), shown(d, 'steamLoaded'), text(d, '#steamStatusText'),
        shown(d, 'malLoaded'), shown(d, 'lbLoaded'), shown(d, 'weatherLoading')
      ], [true, '● Offline', false, true, '● Offline', true, true, true]);
    }).then(function () {
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
      restore();
    }, function (e) {
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
      restore();
      throw e;
    });
  }

  global.KazuCardCacheChecks = { run: run, live: live, fixtures: fixtures, IDS: IDS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuCardCacheChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      function ok(name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ' → ' + JSON.stringify(detail))); }
      function eq(name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected), { got: actual, expected: expected }); }
      run(global.KazuLib, fs.readFileSync(path.join(root, 'script.js'), 'utf8').replace(/\r\n/g, '\n'), ok, eq, {
        docs: fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n'),
        html: fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n')
      });
      console.log('Card-cache eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
