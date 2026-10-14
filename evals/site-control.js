/* Shared deterministic gates for the control-panel hook: site-config.js (the
   contract), the "Site control" sections of script.js, and the markup and
   first-paint script in index.html. Standalone: node evals/site-control.js.
   Zero failures is the pass threshold. */
(function (global) {
  'use strict';

  function between(source, from, to) {
    var a = source.indexOf(from);
    var b = source.indexOf(to, a + 1);
    return a === -1 || b === -1 ? '' : source.slice(a, b);
  }

  function run(SC, source, html, swSource, ok, eq) {
    var strict = function (raw) { return SC.normalize(raw, { strict: true }); };
    var lenient = function (raw) { return SC.normalize(raw); };
    var codes = function (r) { return r.problems.map(function (p) { return p.path + ':' + p.code; }).sort(); };

    // ---- contract: what the page will accept from the store ----
    eq('site-config: an empty object is an empty config', strict({}).config, { schema: 1 });
    eq('site-config: non-objects are refused', [null, 5, 'x', []].map(function (v) { return codes(strict(v))[0]; }), [':root', ':root', ':root', ':root']);
    eq('site-config: a newer schema is ignored whole, not half-read', lenient({ schema: 2, notice: { enabled: true, text: 'x' } }).config, { schema: 1 });
    eq('site-config: unknown keys are dropped and prototype keys never copied', Object.keys(lenient(JSON.parse('{"__proto__":{"p":1},"constructor":{"x":1},"extra":1,"footer":{"credit":"Hi"}}')).config), ['schema', 'footer']);
    eq('site-config: nothing leaks onto Object.prototype', ({}).p, undefined);
    ['http://a.com/x', 'javascript:alert(1)', 'data:text/html;base64,AAAA', '//a.com/x', 'https://u:p@a.com/', 'https://a.com/x y', 'a.com'].forEach(function (bad) {
      eq('site-config: link refused: ' + bad, strict({ stories: [{ title: 'T', url: bad }] }).config.stories, []);
    });
    eq('site-config: a clean https link survives', strict({ stories: [{ title: 'T', url: 'https://example.com/a?b=1' }] }).config.stories[0].url, 'https://example.com/a?b=1');
    eq('site-config: ids that could redirect a request are refused', Object.keys(strict({ integrations: { discord: { userId: '1' }, steam: { vanity: '../../x' }, mal: { user: 'a?b' }, letterboxd: { user: 'x/y' } } }).config.integrations), []);
    eq('site-config: a good set of ids is kept', Object.keys(strict({ integrations: { discord: { userId: '346360416827473921' }, steam: { vanity: 'Kazu-Hani' }, mal: { user: 'Kazu_Hani' }, letterboxd: { user: 'KazuHani' } } }).config.integrations), ['discord', 'steam', 'mal', 'letterboxd']);
    eq('site-config: emoji and hidden characters are stripped from text', lenient({ footer: { credit: ' Kazu​  ‮Hani \u{1F409} ' } }).config.footer.credit, 'Kazu Hani');
    eq('site-config: lenient mode shortens long text, strict mode refuses it', [lenient({ footer: { credit: 'a'.repeat(200) } }).config.footer.credit.length, 'credit' in strict({ footer: { credit: 'a'.repeat(200) } }).config.footer], [SC.LIMITS.credit, false]);
    eq('site-config: playlist covers must be site assets', ['http://a.com/a.jpg', '../a.jpg', 'assets/../a.jpg', 'assets/a.exe', '/assets/a.jpg'].map(function (c) { return codes(strict({ playlist: { name: 'P', playlistId: 'PLEWxJlvxPVrk', cover: c } }))[0]; }), ['playlist.cover:asset-path', 'playlist.cover:asset-path', 'playlist.cover:asset-path', 'playlist.cover:asset-path', 'playlist.cover:asset-path']);
    eq('site-config: social ids are unique and well formed', codes(strict({ socials: [{ id: 'Bad Id', name: 'A', url: 'https://a.com' }, { id: 'ok', name: 'A', url: 'https://a.com' }, { id: 'ok', name: 'B', url: 'https://b.com' }] })), ['socials[0].id:id-format', 'socials[2].id:duplicate-id']);
    eq('site-config: built-in socials keep only text and link, custom ones get colors and a mark', [Object.keys(strict({ socials: [{ id: 'x', name: 'X', url: 'https://x.com/a', colorA: '#111111' }] }).config.socials[0]), strict({ socials: [{ id: 'mine', name: 'Mine', url: 'https://m.com' }] }).config.socials[0].mark], [['id', 'name', 'handle', 'url'], 'MIN']);
    eq('site-config: an empty list is kept (it means show none)', strict({ socials: [] }).config.socials, []);
    eq('site-config: normalising twice changes nothing', (function () { var a = lenient({ notice: { enabled: true, text: 'Hi  there' }, seasons: { halloween: 'on' }, stories: [{ title: 'T', url: 'https://t.com' }] }).config; return JSON.stringify(lenient(a).config) === JSON.stringify(a); })(), true);

    var n = { enabled: true, text: 'x', startsAt: '2026-10-10T10:00:00.000Z', endsAt: '2026-10-10T12:00:00.000Z' };
    var at = function (iso) { return Date.parse(iso); };
    eq('notice: shows only inside its window', [SC.noticeActive(n, at('2026-10-10T09:59:59Z')), SC.noticeActive(n, at('2026-10-10T10:00:00Z')), SC.noticeActive(n, at('2026-10-10T12:00:00Z'))], [false, true, false]);
    eq('notice: disabled or empty never shows', [SC.noticeActive({ enabled: false, text: 'x' }, 0), SC.noticeActive({ enabled: true, text: '' }, 0), SC.noticeActive(null, 0)], [false, false, false]);
    ok('notice: the dismissal id changes with the words but not the dates', SC.noticeId({ text: 'A', linkText: '', linkUrl: '', tone: 'info', endsAt: 'x' }) === SC.noticeId({ text: 'A', linkText: '', linkUrl: '', tone: 'info', endsAt: 'y' }) && SC.noticeId({ text: 'A', linkText: '', linkUrl: '', tone: 'info' }) !== SC.noticeId({ text: 'B', linkText: '', linkUrl: '', tone: 'info' }));
    eq('stored: Firebase string text, plain objects and empty stores all parse', [SC.parseStored(JSON.stringify(JSON.stringify({ schema: 1 }))).value, SC.parseStored('{"schema":1}').value, SC.parseStored('null').value, SC.parseStored('nope').ok, SC.parseStored('[1]').ok], [{ schema: 1 }, { schema: 1 }, null, false, false]);
    eq('control address: https or a same-origin path only', ['https://db.firebasedatabase.app/site/config.json', '/site-config.json', 'http://a.com/x', '//evil.com/x', 'javascript:1', 'https://u:p@a.com/', 'https://localhost/x', ''].map(SC.controlUrlOk), [true, true, false, false, false, false, false, false]);
    eq('story style keeps the page\'s gradient format', SC.storyStyle(['#7c1d2b', '#b3324a', '#d9536b']).background, 'linear-gradient(150deg,rgba(124,29,43,0.66) 0%,rgba(179,50,74,0.55) 55%,rgba(217,83,107,0.5) 100%)');
    eq('profile links are derived from the ids, never typed', SC.profileUrls({ discord: { userId: '346360416827473921' }, steam: { vanity: 'Kazu-Hani' }, mal: { user: 'Kazu_Hani' }, letterboxd: { user: 'KazuHani' } }), {
      discord: 'https://discord.com/users/346360416827473921', steam: 'https://steamcommunity.com/id/Kazu-Hani/',
      mal: 'https://myanimelist.net/animelist/Kazu_Hani', letterboxd: 'https://letterboxd.com/KazuHani/' });

    // ---- index.html: the hook markup ----
    var metaAt = html.indexOf('<meta name="kazu-control" content="');
    var metaValue = (/<meta name="kazu-control" content="([^"]*)">/.exec(html) || [])[1];
    ok('index.html names the store in <meta name="kazu-control">, empty or an https address', metaAt !== -1 && (metaValue === '' || /^https:\/\/[a-z0-9.-]+\.(firebasedatabase\.app|firebaseio\.com)\/site\/config\.json$/.test(metaValue)), metaValue);
    ok('the meta tag comes before the early fetch and the stylesheet', metaAt !== -1 && metaAt < html.indexOf('<script id="boot-control">') && html.indexOf('<script id="boot-control">') < html.indexOf('<link rel="stylesheet" href="style.css'));
    var bootControl = (/<script id="boot-control">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
    ok('boot-control is synchronous and only fetches https or a same-origin path with cache: no-store', !!bootControl && !/<script[^>]*id="boot-control"[^>]*(async|defer|type=)/.test(html) && bootControl.indexOf("u.indexOf('https://') === 0") !== -1 && bootControl.indexOf('cache: \'no-store\'') !== -1 && /\^\\\/\[\^\\\/\]/.test(bootControl));
    ok('boot-control never writes markup and never throws', !/innerHTML|document\.write|eval\(/.test(bootControl) && /try \{[\s\S]*\} catch \(e\) \{\}/.test(bootControl));
    ok('site-config.js loads after lib.js and before script.js', html.indexOf('<script src="lib.js') < html.indexOf('<script src="site-config.js?v=') && html.indexOf('<script src="site-config.js?v=') < html.indexOf('<script src="script.js'));
    var cfgVersion = (/site-config\.js\?v=(\d+)/.exec(html) || [])[1];
    ok('the service worker precaches the same site-config.js version', !!cfgVersion && swSource.indexOf("'./site-config.js?v=" + cfgVersion + "'") !== -1);
    ok('the announcement element exists, hidden, polite, with its link and dismiss controls', /<aside id="hubBulletin" class="hub-bulletin" role="status" hidden>[\s\S]*?hub-bulletin-text[\s\S]*?<a class="hub-bulletin-link"[^>]*hidden><\/a>[\s\S]*?<button type="button" class="hub-bulletin-close" hidden>Dismiss<\/button>/.test(html));
    ok('the announcement sits above the hero', html.indexOf('id="hubBulletin"') < html.indexOf('<header class="hero">') && html.indexOf('id="hubBulletin"') > html.indexOf('<div class="container">'));

    // ---- script.js: the hook never turns settings into markup ----
    var topBlock = between(source, '  // ---------- Site control: settings saved by the control panel', '  let DISCORD_ID');
    var applyBlock = between(source, '  // ---------- Site control: applying the settings', '  // ---------- Scroll reveal ----------');
    ok('both Site control sections exist', topBlock.length > 500 && applyBlock.length > 3000);
    var codeOnly = (topBlock + applyBlock).replace(/\/\/.*$/gm, '');
    ok('settings never reach innerHTML, insertAdjacentHTML, outerHTML, document.write, eval or new Function', !/innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(|new Function/.test(codeOnly));
    ok('the notice words go in through textContent', applyBlock.indexOf("querySelector('.hub-bulletin-text').textContent = n.text") !== -1);
    ok('links from settings are re-checked before they become an href', applyBlock.indexOf('SiteConfig.controlUrlOk(n.linkUrl)') !== -1);
    ok('the only fetch of settings goes through fetchT with cache: no-store', applyBlock.indexOf("fetchT(CONTROL_URL, { cache: 'no-store' })") !== -1 && !/\bfetch\(/.test(applyBlock));
    ok('the first apply runs before the reveal observer collects its elements', source.indexOf('\n  applySiteConfig();\n  siteLate = true;') !== -1 && source.indexOf('\n  applySiteConfig();\n  siteLate = true;') < source.indexOf('const revealEls = Array.from'));
    ok('settings are polled with the other pollers, so a hidden tab stays quiet', /\{ fn: loadSiteControl, ms: 60 \* 1000, last: 0 \}/.test(source));
    [
      ['loadDiscord', "async function loadDiscord() {\n    if (lanyardWsLive || !siteIntegrationOn('discord')) return;"],
      ['startLanyard', "function startLanyard() {\n    if (!siteIntegrationOn('discord')) return;"],
      ['restartLanyard', "function restartLanyard() {\n    if (!siteIntegrationOn('discord')) { stopLanyard(); return; }"],
      ['loadSteam', "async function loadSteam() {\n    if (!siteIntegrationOn('steam')) return;"],
      ['loadMal', "async function loadMal() {\n    if (!siteIntegrationOn('mal')) return;"],
      ['loadMalManga', "async function loadMalManga() {\n    if (!KazuLib || !KazuLib.malMangaRow || !siteIntegrationOn('mal')) return;"],
      ['loadLetterboxd', "async function loadLetterboxd() {\n    if (!KazuLib || !KazuLib.parseLetterboxdRss || !siteIntegrationOn('letterboxd')) return;"]
    ].forEach(function (pin) {
      ok(pin[0] + ' stops as soon as its card is switched off', source.indexOf(pin[1]) !== -1);
    });
    ok('the quote loader stops when the quote is hidden', source.indexOf("if (siteSectionOff('quote')) return;") !== -1);
    ok('seasons: panel overrides sit under this browser\'s dev panel', source.indexOf('Object.assign({}, siteSeasons, devSeasons)') !== -1);
    ok('effects: particles and weather layers can be switched off, previews still win', source.indexOf("if (siteEffectOff('particles') && !ATMOSPHERE_OVERRIDE) mode = 'none';") !== -1 && source.indexOf("if (siteEffectOff('weather')) return false;") !== -1);
    var ids = { DISCORD_ID: ["siteId('discord', 'userId',", '346360416827473921'], STEAM_VANITY: ["siteId('steam', 'vanity',", 'Kazu-Hani'], MAL_USER: ["siteId('mal', 'user',", 'Kazu_Hani'], LB_USER: ["siteId('letterboxd', 'user',", 'KazuHani'], YTM_PLAYLIST_ID: ["siteValue('playlist', 'playlistId',", 'PLEWxJlvxPVrkYhMCA1IlYwDh5bg-jf39m'] };
    Object.keys(ids).forEach(function (name) {
      var m = new RegExp('let ' + name + ' = ([^;\\n]*);').exec(source);
      var literals = m ? m[1].match(/'([^']*)'/g) : null;
      ok(name + ' keeps the page\'s own default as the last quoted value (the panel\'s importer reads it)', !!m && m[1].indexOf(ids[name][0]) === 0 && !!literals && literals[literals.length - 1] === "'" + ids[name][1] + "'", m && m[1]);
    });

    // ---- the real cache logic from script.js, run against fakes ----
    function topHarness(opts) {
      var o = opts || {};
      var store = o.store || {};
      var meta = o.meta === undefined ? { getAttribute: function () { return o.url === undefined ? '' : o.url; } } : o.meta;
      var fn = new Function('window', 'document', 'localStorage', topBlock +
        '\nreturn { cfg: function () { return siteCfg; }, url: CONTROL_URL, siteId: siteId, siteValue: siteValue, seasons: siteSeasonOverrides, on: siteIntegrationOn, effectOff: siteEffectOff, sectionOff: siteSectionOff, section: siteSection };');
      return fn({ KazuSiteConfig: o.noModule ? undefined : SC },
        { querySelector: function (sel) { return sel === 'meta[name="kazu-control"]' ? meta : null; } },
        { getItem: function (k) { if (o.blocked) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; } });
    }
    var URL1 = 'https://kazu-default-rtdb.europe-west1.firebasedatabase.app/site/config.json';
    var goodCache = JSON.stringify({ u: URL1, t: JSON.stringify({ schema: 1, seasons: { halloween: 'on', pride: 'auto' }, integrations: { steam: { enabled: false, vanity: 'Other-Name' } }, effects: { weather: false }, sections: { quote: false } }) });
    var withCache = topHarness({ url: URL1, store: { 'kazu-site-config': goodCache } });
    eq('cache: a saved copy for the same store is applied before anything paints', [withCache.url, withCache.section('seasons')], [URL1, { pride: 'auto', halloween: 'on' }]);
    eq('cache: only on and off seasons override the calendar', withCache.seasons(), { halloween: 'on' });
    eq('cache: ids come from settings, the page\'s own value is the fallback', [withCache.siteId('steam', 'vanity', 'Kazu-Hani'), withCache.siteId('mal', 'user', 'Kazu_Hani')], ['Other-Name', 'Kazu_Hani']);
    eq('cache: a card is on unless its settings say off', [withCache.on('steam'), withCache.on('discord')], [false, true]);
    eq('cache: effects and sections switch off only when told to', [withCache.effectOff('weather'), withCache.effectOff('particles'), withCache.sectionOff('quote'), withCache.sectionOff('socials')], [true, false, true, false]);
    eq('cache: a copy saved for a different store is ignored', topHarness({ url: 'https://other-default-rtdb.firebaseio.com/site/config.json', store: { 'kazu-site-config': goodCache } }).cfg(), { schema: 1 });
    eq('cache: with no address in the page the cache is ignored and nothing is fetched', [topHarness({ url: '', store: { 'kazu-site-config': goodCache } }).cfg(), topHarness({ url: '' }).url], [{ schema: 1 }, '']);
    eq('cache: a page without the meta tag behaves the same', topHarness({ meta: null, store: { 'kazu-site-config': goodCache } }).cfg(), { schema: 1 });
    eq('cache: damaged or blocked storage changes nothing and never throws', [topHarness({ url: URL1, store: { 'kazu-site-config': '{broken' } }).cfg(), topHarness({ url: URL1, blocked: true }).cfg(), topHarness({ url: URL1, store: { 'kazu-site-config': JSON.stringify({ u: URL1, t: '{broken' }) } }).cfg()], [{ schema: 1 }, { schema: 1 }, { schema: 1 }]);
    eq('cache: an address that is not https is refused outright', topHarness({ url: 'http://evil.example/x', store: { 'kazu-site-config': JSON.stringify({ u: 'http://evil.example/x', t: '{"schema":1,"seasons":{"halloween":"on"}}' }) } }).url, '');
    eq('without site-config.js the page runs on its own values', (function () { var h = topHarness({ url: URL1, noModule: true, store: { 'kazu-site-config': goodCache } }); return [h.url, h.cfg(), h.siteId('steam', 'vanity', 'Kazu-Hani'), h.on('steam')]; })(), ['', { schema: 1 }, 'Kazu-Hani', true]);

    // ---- the real first-paint script, run against fakes ----
    var bootSrc = (/<script id="boot-tint">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '';
    var bootFn = new Function('document', 'Date', 'Intl', 'setTimeout', 'location', 'localStorage', bootSrc);
    function boot(instantMs, o) {
      var opts = o || {}, classes = {};
      var themeMeta = { setAttribute: function () {} };
      var doc = {
        documentElement: { style: { setProperty: function () {} }, classList: { add: function (c) { classes[c] = true; }, remove: function (c) { delete classes[c]; } } },
        getElementById: function () { return { textContent: '' }; },
        querySelector: function (sel) {
          if (sel === 'meta[name="theme-color"]') return themeMeta;
          if (sel === 'meta[name="kazu-control"]') return opts.url === undefined ? null : { getAttribute: function () { return opts.url; } };
          return null;
        }
      };
      var Fake = function () { return arguments.length ? new (Function.prototype.bind.apply(Date, [null].concat([].slice.call(arguments))))() : new Date(instantMs); };
      Fake.UTC = Date.UTC;
      var storage = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(opts.store || {}, k) ? opts.store[k] : null; } };
      var threw = null;
      try { bootFn(doc, Fake, Intl, function () {}, { search: opts.search || '' }, storage); } catch (e) { threw = e; }
      return { halloween: !!classes['season-halloween'], threw: threw };
    }
    var july = Date.UTC(2026, 6, 10, 12, 0), october = Date.UTC(2026, 9, 9, 12, 0);
    var cache = function (seasons, u) { return { 'kazu-site-config': JSON.stringify({ u: u || URL1, t: JSON.stringify({ schema: 1, seasons: seasons }) }) }; };
    eq('first paint: calendar only when nothing is saved', [boot(july).halloween, boot(october).halloween], [false, true]);
    eq('first paint: a panel override of Halloween on or off is honoured from the saved copy', [boot(july, { url: URL1, store: cache({ halloween: 'on' }) }).halloween, boot(october, { url: URL1, store: cache({ halloween: 'off' }) }).halloween], [true, false]);
    eq('first paint: the saved copy is ignored for another store, a missing meta, or an empty address', [boot(july, { url: 'https://x.firebaseio.com/site/config.json', store: cache({ halloween: 'on' }) }).halloween, boot(july, { store: cache({ halloween: 'on' }) }).halloween, boot(july, { url: '', store: cache({ halloween: 'on' }) }).halloween], [false, false, false]);
    eq('first paint: this browser\'s dev setting beats the panel, and a ?season= preview beats both', [
      boot(july, { url: URL1, store: Object.assign(cache({ halloween: 'on' }), { 'kazu-dev-seasons': '{"halloween":"off"}' }) }).halloween,
      boot(july, { url: URL1, search: '?season=halloween', store: cache({ halloween: 'off' }) }).halloween,
      boot(october, { url: URL1, search: '?season=pride', store: cache({ halloween: 'on' }) }).halloween
    ], [false, true, false]);
    eq('first paint: damaged saved copies never throw and change nothing', [boot(july, { url: URL1, store: { 'kazu-site-config': '{broken' } }), boot(july, { url: URL1, store: { 'kazu-site-config': JSON.stringify({ u: URL1, t: 'nope' }) } }), boot(july, { url: URL1, store: { 'kazu-site-config': 'null' } })].map(function (r) { return [!r.threw, r.halloween]; }), [[true, false], [true, false], [true, false]]);
    ok('first paint: the boot script still has no Intl', bootSrc.indexOf('Intl') === -1);
  }

  global.KazuSiteControlChecks = { run: run };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuSiteControlChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      var pass = 0, fail = 0;
      var ok = function (name, value, detail) { if (value) pass++; else { fail++; console.log('FAIL ' + name + (detail ? ' -> ' + detail : '')); } };
      var eq = function (name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected), 'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected)); };
      var read = function (name) { return fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n'); };
      run(require(path.join(root, 'site-config.js')), read('script.js'), read('index.html'), read('sw.js'), ok, eq);
      console.log('Site control eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
