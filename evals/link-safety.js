/* Gate assertions for links that come from outside the site: APIs, the CORS
   proxies and the localStorage copies of either. A hacked or hostile source
   must never get a script URL (javascript:, data:, vbscript:) or a link to
   another host into an href, because escapeHtml alone cannot stop either.
   Two halves:
     1. every lib.js builder that turns API data into a link is fed a corpus
        of hostile values and must drop the row, fall back to a URL it builds
        itself, or return a link on the card's own https host;
     2. every place script.js writes an href is pinned to a reviewed list, so
        a new sink fails here until someone checks where its value comes from.
   Shared by tests.js and tests.html; standalone: node evals/link-safety.js.
   Zero failures is the pass threshold. */
(function (global) {
  'use strict';

  // What a compromised API or proxy could send in place of a real link, built
  // around the host the card expects so the lookalikes are realistic.
  function hostileFor(host) {
    return [
      'javascript:alert(document.domain)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      '\u0000javascript:alert(1)',
      'java\tscript:alert(1)',
      'javascript://' + host + '/%0aalert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'http://' + host + '/x',
      'https://' + host + '.evil.example/x',
      'https://evil.example/' + host + '/x',
      'https://' + host + '@evil.example/x',
      'https://user:pw@' + host + '/x',
      'https://' + host + ':8443/x',
      'https://evil.example\\@' + host + '/x',
      '//evil.example/x',
      '/x',
      '',
      null, 42, {}, ['https://' + host + '/x']
    ];
  }

  // Independent of safeLink's URL parser: a plain string check that the
  // rendered link starts with https:// and one of the card's hosts.
  function landsOn(href, hosts) {
    if (typeof href !== 'string') return false;
    for (var i = 0; i < hosts.length; i++) {
      if (href.indexOf('https://' + hosts[i] + '/') === 0) return true;
    }
    return false;
  }

  // Every href sink in script.js, as "<kind> <literal prefix>{<expression>}".
  // Each entry says why its value cannot carry a hostile link.
  var REVIEWED = [
    ['markup {escapeHtml(g.url)}', 'Steam recent games: steamStoreUrl, a fixed host plus a numeric app id (steamCacheParse rebuilds it the same way)'],
    ['markup {escapeHtml(x.url)}', 'MAL anime rows: malRow / malListRow / malCacheParse (safeLink or numeric id)'],
    ['markup {escapeHtml(x.url)}', 'MAL manga rows: malMangaRow / malMangaListRow / malMangaCacheParse'],
    ['markup {escapeHtml(entry.link)}', 'Letterboxd: parseLetterboxdRss / letterboxdCacheParse (safeLink)'],
    ['markup {escapeHtml(t.url)}', 'ListenBrainz: listenbrainzRow (safeLink, open.spotify.com only)'],
    ['markup https://music.youtube.com/watch?v={t.id}', 'YouTube playlist: 11-char id checked in parseYouTubePlaylistRss; list id checked by site-config playlistId'],
    ['markup {url}', 'liquid-glass feImage href: a canvas data:image/png URL the page draws itself'],
    ['markup {url}', 'liquid-glass feImage xlink:href: the same canvas URL'],
    ["attr {'https://open.spotify.com/track/' + dc.spotify.track_id}", 'Lanyard Spotify: fixed host, the id can only change the path (discordCacheParse keeps letters and digits only)'],
    ['attr {gameUrl}', 'Steam current game: steamStoreUrl, a fixed host plus a numeric app id (steamCacheParse rebuilds it the same way)'],
    ['attr {s.url}', 'custom social tiles: site-config httpsUrl (https, no credentials)'],
    ['attr {n.linkUrl}', 'notice link: site-config httpsUrl, then controlUrlOk'],
  ];

  function hrefSinks(source) {
    var out = [], m;
    var markup = /href="([^"']*)' \+ ([^+]+?) \+/g;
    var attr = /setAttribute\('href', ([^)]+?)\)/g;
    var prop = /\.href = ([^;]+);/g;
    var iframe = /iframe\.src = ([^;]+);/g;
    while ((m = markup.exec(source))) out.push('markup ' + m[1] + '{' + m[2] + '}');
    while ((m = attr.exec(source))) out.push('attr {' + m[1] + '}');
    while ((m = prop.exec(source))) out.push('prop {' + m[1] + '}');
    while ((m = iframe.exec(source))) out.push('iframe {' + m[1] + '}');
    return out.sort();
  }

  function run(L, source, ok, eq) {
    var MAL = L.MAL_HOSTS, LB = L.LETTERBOXD_HOSTS, SP = L.SPOTIFY_HOSTS;

    // safeLink itself: real links survive unchanged, hostile ones become ''.
    eq('link-safety: a real MAL link survives', L.safeLink('https://myanimelist.net/anime/1/Cowboy_Bebop', MAL), 'https://myanimelist.net/anime/1/Cowboy_Bebop');
    eq('link-safety: a real Letterboxd link survives', L.safeLink('https://letterboxd.com/kazuhani/film/superman-2025/', LB), 'https://letterboxd.com/kazuhani/film/superman-2025/');
    eq('link-safety: a real Spotify link survives', L.safeLink('https://open.spotify.com/track/abc123', SP), 'https://open.spotify.com/track/abc123');
    eq('link-safety: host case is normalised, not refused', L.safeLink('https://MyAnimeList.net/anime/1', MAL), 'https://myanimelist.net/anime/1');
    eq('link-safety: no host list means no link', L.safeLink('https://myanimelist.net/anime/1'), '');

    [['MAL', MAL], ['Letterboxd', LB], ['Spotify', SP]].forEach(function (pair) {
      hostileFor(pair[1][0]).forEach(function (v, i) {
        eq('link-safety: ' + pair[0] + ' hostile link ' + i + ' refused', L.safeLink(v, pair[1]), '');
      });
    });

    // Every builder, every hostile value. Each must drop the row or render a
    // link that stays on the card's own host.
    hostileFor('myanimelist.net').forEach(function (v, i) {
      var a = L.malRow({ episodes_watched: 1, anime: { mal_id: 7, url: v, title: 'Show' } });
      eq('link-safety: malRow hostile url ' + i + ' falls back to the id', a.url, 'https://myanimelist.net/anime/7');
      var m = L.malMangaRow({ chapters_read: 1, manga: { mal_id: 9, url: v, title: 'Book' } });
      eq('link-safety: malMangaRow hostile url ' + i + ' falls back to the id', m.url, 'https://myanimelist.net/manga/9');
      eq('link-safety: malCacheParse hostile url ' + i + ' → no cache', L.malCacheParse(JSON.stringify({ rows: [{ url: v, title: 't' }] })), null);
      eq('link-safety: malMangaCacheParse hostile url ' + i + ' → no cache', L.malMangaCacheParse(JSON.stringify({ rows: [{ url: v, title: 't' }] })), null);
      var listRow = L.malListRow({ anime_id: v, anime_title: 'Show' });
      ok('link-safety: malListRow hostile id ' + i + ' stays on MAL', landsOn(listRow.url, MAL) || listRow.url === 'https://myanimelist.net', listRow.url);
      var listManga = L.malMangaListRow({ manga_id: v, manga_title: 'Book' });
      ok('link-safety: malMangaListRow hostile id ' + i + ' stays on MAL', landsOn(listManga.url, MAL) || listManga.url === 'https://myanimelist.net', listManga.url);
      var steam = L.steamStoreUrl(v);
      ok('link-safety: steamStoreUrl hostile value ' + i + ' stays on the store', steam === null || /^https:\/\/store\.steampowered\.com\/app\/\d{1,9}$/.test(steam), steam);
    });

    // The Steam card's stored copy: both of its links are rebuilt from the
    // app id, never taken as stored.
    var onStore = function (u) { return u === '' || /^https:\/\/store\.steampowered\.com\/app\/\d{1,9}$/.test(u); };
    hostileFor('store.steampowered.com').forEach(function (v, i) {
      var raw = JSON.stringify({ at: 1, data: { avatar: 'https://avatars.steamstatic.com/a.jpg', state: 'online', game: { name: 'G', url: v }, recent: [{ name: 'G', url: v }] } });
      var c = L.steamCacheParse(raw, 2);
      ok('link-safety: steamCacheParse hostile link ' + i + ' stays on the store', !!c && onStore(c.game.url) && onStore(c.recent[0].url), c && [c.game.url, c.recent[0].url]);
    });

    // The Discord copy's Spotify track id is spliced into an open.spotify.com
    // path, so it must be plain letters and digits or nothing.
    hostileFor('open.spotify.com').concat(['../../x', 'abc?x=1', 'abc#x', 'abc/def', ' abc']).forEach(function (v, i) {
      var raw = JSON.stringify({ at: 1, data: { discord_user: { username: 'k' }, listening_to_spotify: true, spotify: { song: 'S', track_id: v } } });
      var sp = L.discordCacheParse(raw, 2).spotify;
      ok('link-safety: discordCacheParse hostile track id ' + i + ' dropped', !!sp && sp.track_id === null, sp && sp.track_id);
    });

    hostileFor('letterboxd.com').forEach(function (v, i) {
      if (typeof v === 'string') {
        var xml = '<rss><channel><item><letterboxd:filmTitle>Film</letterboxd:filmTitle><link>' + v + '</link></item></channel></rss>';
        var entry = L.parseLetterboxdRss(xml);
        ok('link-safety: parseLetterboxdRss hostile link ' + i + ' dropped', entry === null || landsOn(entry.link, LB), entry && entry.link);
      }
      eq('link-safety: letterboxdCacheParse hostile link ' + i + ' → no cache', L.letterboxdCacheParse(JSON.stringify({ entry: { title: 't', link: v } })), null);
    });

    hostileFor('open.spotify.com').forEach(function (v, i) {
      var row = L.listenbrainzRow({ track_metadata: { track_name: 'Song', additional_info: { spotify_id: v } } });
      eq('link-safety: listenbrainzRow hostile spotify_id ' + i + ' → no link', row.url, '');
    });

    hostileFor('www.youtube.com').forEach(function (v, i) {
      if (typeof v !== 'string') return;
      var xml = '<feed><entry><yt:videoId>' + v + '</yt:videoId><title>Song</title></entry></feed>';
      eq('link-safety: parseYouTubePlaylistRss hostile id ' + i + ' dropped', L.parseYouTubePlaylistRss(xml), []);
    });

    // The page's own fallback (used only if lib.js fails to load) must not
    // trust Jikan's url either.
    var fallback = source.slice(source.indexOf('const malRow = (KazuLib && KazuLib.malRow) ||'), source.indexOf('const malListRow ='));
    ok('link-safety: script.js malRow fallback never reads a.url', fallback.length > 0 && fallback.indexOf('a.url') === -1);

    // Every href sink in script.js is on the reviewed list, and nothing on
    // the list has gone stale.
    var expected = REVIEWED.map(function (r) { return r[0]; }).sort();
    var found = hrefSinks(source);
    var unreviewed = found.filter(function (k) { return expected.indexOf(k) === -1; });
    var stale = expected.filter(function (k) { return found.indexOf(k) === -1; });
    eq('link-safety: no unreviewed href sink in script.js', unreviewed, []);
    eq('link-safety: no stale entry on the reviewed href list', stale, []);
    eq('link-safety: href sink count matches the reviewed list', found.length, expected.length);
  }

  global.KazuLinkSafetyChecks = { run: run, hostileFor: hostileFor, hrefSinks: hrefSinks };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuLinkSafetyChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      function ok(name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ' → ' + JSON.stringify(detail))); }
      function eq(name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected), { got: actual, expected: expected }); }
      run(global.KazuLib, fs.readFileSync(path.join(root, 'script.js'), 'utf8').replace(/\r\n/g, '\n'), ok, eq);
      console.log('Link-safety eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
