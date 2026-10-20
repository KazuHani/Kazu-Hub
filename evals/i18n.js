/* ============================================================================
   Language switch gates (English / Japanese, i18n.js). Shared by tests.js and
   tests.html; run standalone:  node evals/i18n.js
   ----------------------------------------------------------------------------
   What is pinned and why:
     - Coverage: every visible string and accessible label in index.html is
       either translated or on the KEEP list (names, brands, product models).
       New copy without a Japanese line fails here, not in front of a visitor.
     - The run-time text families script.js builds (weather conditions,
       statuses, pop-up titles, empty states) are read out of script.js and
       must all translate, so a new condition or status can't slip through.
     - A table of composed strings (clock, dates, countdowns, Steam hours, MAL
       progress, toasts) pins the exact Japanese.
     - Safety: names, numbers and Japanese never translate (no double pass),
       Japanese phrases are unique so switching back is unambiguous, and no
       Japanese line carries an emoji.
     - The DOM translator, against fake nodes: walk, skip list, attributes,
       restore, and "script.js wrote fresh English meanwhile" survives restore.
     - Device language: with no ?lang= and no saved choice, the first English
       or Japanese entry in navigator.languages decides; a saved or ?lang=
       choice always beats it.
     - #boot-lang makes the same choice as KazuI18n.pickLang for every case
       (query x saved value x device languages x blocked storage),
       the switch markup, load order and the service worker precache.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  // Intentionally English in Japanese mode: names, brands, handles, product
  // models, song and story titles.
  var KEEP = ['English', 'Kazu Hani', 'Discord', 'Steam', 'MyAnimeList', 'Letterboxd', 'X', '@Kazu_Hani', 'Instagram',
    '@kazu_hani', 'YouTube', 'Reddit', 'u/Korat24', 'TikTok', 'MAL', 'Kazu_Hani', 'KazuHani', 'Gigabyte', 'NVIDIA GeForce',
    'RTX 4060', 'GeForce RTX', 'AMD Ryzen 5 3600', 'MSI B450 Tomahawk Max', '32 GB DDR4-3200', '2 TB', 'Western Digital HDD',
    '240 GB', 'Kingston SSD', '1 TB', 'Crucial P3 Plus M.2 PCIe 4.0 NVMe SSD', 'Cooler Master Hyper 212 Black Edition',
    'Corsair RM650, 80 Plus Gold, 650 W', 'Corsair Carbide Series 270R', 'YouTube Music'];

  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };

  function decode(s) {
    return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  // Visible text + labels of the page body, minus everything the translator
  // skips. A small tag-stack walk that understands the selectors in
  // SKIP_SELECTOR (tag, #id, .class, [translate="no"]).
  function pageStrings(html, skipSelector) {
    var sel = skipSelector.split(',').map(function (s) { return s.trim(); });
    function skips(tag, attrs) {
      var id = (/\sid="([^"]*)"/.exec(attrs) || [])[1] || '';
      var cls = ((/\sclass="([^"]*)"/.exec(attrs) || [])[1] || '').split(/\s+/);
      return sel.some(function (s) {
        if (s === '[translate="no"]') return /\stranslate="no"/.test(attrs);
        if (s.charAt(0) === '#') return s.slice(1) === id;
        if (s.charAt(0) === '.') return cls.indexOf(s.slice(1)) !== -1;
        return s === tag;
      });
    }
    var start = html.indexOf('<div class="container">');
    var end = html.indexOf('<script src=', start);
    var body = html.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');
    var out = [], stack = [], re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g, m;
    while ((m = re.exec(body))) {
      var skipping = stack.length && stack[stack.length - 1];
      if (m[4] !== undefined) {
        var t = decode(m[4]).replace(/\s+/g, ' ').trim();
        if (t && !skipping) out.push({ text: t, where: 'text' });
        continue;
      }
      var tag = m[2].toLowerCase();
      if (m[1]) { stack.pop(); continue; }
      var self = skipping || skips(tag, m[3]);
      if (!self) {
        var am, are = /\s(title|aria-label|alt|placeholder)="([^"]*)"/g;
        while ((am = are.exec(m[3]))) out.push({ text: decode(am[2]), where: am[1] });
      }
      if (!VOID[tag] && !/\/$/.test(m[3])) stack.push(self);
    }
    return out;
  }

  // ---- fake DOM for the translator ----
  function fakeText(value) { return { nodeType: 3, nodeValue: value, parentElement: null, isConnected: true }; }
  function fakeEl(attrs, kids, skip) {
    var el = { nodeType: 1, attrs: attrs || {}, childNodes: kids || [], skip: !!skip, parentElement: null, isConnected: true };
    el.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; };
    el.setAttribute = function (k, v) { el.attrs[k] = String(v); };
    el.closest = function () { for (var n = el; n; n = n.parentElement) if (n.skip) return n; return null; };
    el.childNodes.forEach(function (c) { c.parentElement = el; });
    return el;
  }

  function run(I, html, scriptSrc, css, sw, stripEmoji, ok, eq) {
    html = html.replace(/\r\n/g, '\n'); scriptSrc = scriptSrc.replace(/\r\n/g, '\n'); css = css.replace(/\r\n/g, '\n'); sw = sw.replace(/\r\n/g, '\n');
    var T = I.translate;

    // ---- coverage of index.html ----
    var strings = pageStrings(html, I.SKIP_SELECTOR);
    ok('i18n: the page walk found the page copy', strings.length > 80, strings.length);
    var missing = strings.filter(function (s) {
      return /[A-Za-z]/.test(s.text) && KEEP.indexOf(s.text) === -1 && T(s.text) === null;
    }).map(function (s) { return s.where + ': ' + s.text; });
    ok('i18n: every visible string and label in index.html has Japanese (or is a name on KEEP)', !missing.length, missing.join(' | '));
    var stale = KEEP.filter(function (k) { return !strings.some(function (s) { return s.text === k; }); });
    ok('i18n: every KEEP entry is still on the page', !stale.length, stale.join(', '));
    var keptButTranslated = KEEP.filter(function (k) { return T(k) !== null; });
    ok('i18n: no KEEP name is ever translated', !keptButTranslated.length, keptButTranslated.join(', '));

    // ---- run-time families read out of script.js ----
    function grab(re) { var out = [], m; while ((m = re.exec(scriptSrc))) out.push(m[1]); return out; }
    var families = {
      'weather conditions': grab(/return \{ d: '([^']+)' \}/g),
      'Discord statuses': grab(/^\s+\w+: \['([^']+)', '#[0-9a-f]{6}'\],$/gm),
      'Steam statuses': grab(/return \['([^']+)', '#[0-9a-f]{6}'\];/g),
      'pop-up titles': grab(/^\s+\w+: \{ title: '([^']+)'/gm),
      'pop-up empty states': grab(/<div class="forecast-empty">([^<']+)</g),
      'Discord platforms': grab(/\{ k: '\w+', t: '([^']+)' \}/g),
      'age tiles and fun units': grab(/(?:statTile|funCell)\([^,]+(?:\([^)]*\))?[^,]*, '([^']+)'\)/g),
      'countdown labels': grab(/cdCell\('\w+', [^,]+(?:\([^)]*\))?, '([^']+)'\)/g)
    };
    Object.keys(families).forEach(function (name) {
      var list = families[name];
      var bad = list.filter(function (s) { return T(s) === null; });
      ok('i18n: script.js ' + name + ' are found and all translate', list.length > 0 && !bad.length, list.length ? bad.join(', ') : 'none found: the pattern no longer matches script.js');
    });

    // ---- composed strings ----
    var cases = [
      ['02:15:04 pm', '14:15:04'], ['09:00:00 am', '09:00:00'], ['12:05:00 am', '00:05:00'], ['12:30:00 pm', '12:30:00'], ['11:59:59 pm', '23:59:59'],
      ['Mon 19 Oct 2026', '2026年10月19日(月)'], ['Mon, 19 Oct 2026', '2026年10月19日(月)'],
      ['Sunday 9 November 2025', '2025年11月9日(日)'], ['12 Mar 2027', '2027年3月12日'], ['Wed 14 Oct', '10月14日(水)'],
      ['21 days', '21日'], ['1 day', '1日'], ['10,000 days', '10,000日'],
      ['until turning 25', '25歳まで'], ['Happy birthday — turning 25', 'お誕生日おめでとう! 25歳に'],
      [' on Monday 9 November 2026', 'の誕生日 — 2026年11月9日(月)'],
      ['Wind 12 mph', '風速 12 mph'], ['Clear sky · wind 12 mph', '快晴 · 風速 12 mph'],
      ['3°C warmer where you are', 'あなたの所は3°C暖かい'], ['1°C colder where you are', 'あなたの所は1°C寒い'],
      ['5 hours ahead of the UK', 'イギリスより5時間進んでいる'], ['1 hour behind the UK', 'イギリスより1時間遅れている'],
      ['5.5 hours ahead of the UK', 'イギリスより5.5時間進んでいる'],
      [' (in 161 days) — ', ' (あと161日) — '], ['(in 1 day) —', '(あと1日) —'], ['(in 6 days) — clocks go ', '(あと6日) — 時計を1時間'],
      ['24 years, 11 months, 10 days ', '24歳11か月10日'], ['12 Mar 2027 · 1,234 to go', '2027年3月12日 · あと1,234日'],
      ['Born 9 November 2001 — a Friday', '2001年11月9日(金曜日)生まれ'],
      ['for 1h 05m', '1時間05分'], ['for 3 min', '3分'], ['for 12s', '12秒'],
      ['2.5 hrs last 2 wks · 40 hrs total', '過去2週間で2.5時間 · 合計40時間'], ['40 hrs total', '合計40時間'],
      ['Ep 3 / 12', '第3話 / 全12話'], ['Ch 5 / ?', '第5章 / 全?章'],
      ['● Online', '● オンライン'], ['● In-Game', '● ゲーム中'], ['● Do Not Disturb', '● 取り込み中'],
      ['Latest watch · rewatch', '最近観た映画 · 再鑑賞'],
      ['Copied @kazu_hani — add me on Discord!', '@kazu_hani をコピーしました。Discordで追加してね!'],
      ['Copied @kazu_hani', '@kazu_hani をコピーしました'], ['My Discord: @kazu_hani', 'Discord: @kazu_hani'],
      ['Saved kazu-birthday.ics ', 'kazu-birthday.ics を保存しました'],
      ['Wed 14 Oct · Europe/London', '10月14日(水) · Europe/London'],
      ['Not watching or reading anything right now ', '今は何も観たり読んだりしていません'],
      ['Couldn’t read your sky ', 'あなたの空を読み込めませんでした'],
      ['\n            Reading the sky…\n          ', '空を読み込み中… '], ['\n  Weather\n  ', '天気'],
      ['clocks go ', '時計を1時間'], [' 1 hour — lose an hour, BST begins ', ' — 1時間短くなり、BSTが始まります'],
      ['Turning ', ''], ['Sun', '日曜'], ['Scorpio', '蠍座'], ['Today', '今日']
    ];
    cases.forEach(function (c) { eq('i18n: "' + c[0].trim() + '"', T(c[0]), c[1]); });

    // ---- what must never translate ----
    var never = ['Kazu Hani', 'Baldur’s Gate 3', 'Fly Through the Fire', '42', '12:30', '', '   ', 'オンライン', '● オンライン',
      '風速 12 mph', 'Kazu Hani · 北極のドラゴン', 'on Tuesday', 'Online now', 'online', 'Rainy', '● —', null, 7];
    never.forEach(function (s) { eq('i18n: never translated: ' + JSON.stringify(s), T(s), null); });
    var jaValues = Object.keys(I.PHRASES).map(function (k) { return I.PHRASES[k]; });
    var twice = jaValues.filter(function (v) { return v && T(v) !== null; });
    ok('i18n: no Japanese phrase translates again (no double pass)', !twice.length, twice.join(', '));

    // ---- phrase table hygiene ----
    var seen = {}, dupes = [];
    jaValues.forEach(function (v) { if (v) { if (seen[v]) dupes.push(v); seen[v] = 1; } });
    ok('i18n: Japanese phrases are unique, so switching back is unambiguous', !dupes.length, dupes.join(', '));
    var empties = Object.keys(I.PHRASES).filter(function (k) { return I.PHRASES[k] === ''; });
    eq('i18n: only the birthday "Turning" and the age "old" fragments translate to nothing', empties.sort(), ['Turning', 'old']);
    var emoji = jaValues.filter(function (v) { return stripEmoji(v) !== v; });
    ok('i18n: no Japanese line carries an emoji', !emoji.length, emoji.join(', '));
    var unnormal = Object.keys(I.PHRASES).filter(function (k) { return k !== k.trim() || /\s\s|[‘’]/.test(k); });
    ok('i18n: phrase keys are stored normalised (trimmed, straight apostrophes)', !unnormal.length, unnormal.join(' | '));
    Object.keys(I.PHRASES).filter(function (k) { return I.PHRASES[k]; }).forEach(function (k) {
      if (I.untranslate(I.PHRASES[k]) !== k) ok('i18n: untranslate round-trips "' + k + '"', false, I.untranslate(I.PHRASES[k]));
    });
    ok('i18n: untranslate round-trips every phrase', Object.keys(I.PHRASES).every(function (k) { return !I.PHRASES[k] || I.untranslate(I.PHRASES[k]) === k; }));
    eq('i18n: untranslate keeps the edge spaces', I.untranslate(' 天気 '), ' Weather ');
    eq('i18n: untranslate leaves unknown text', I.untranslate('Kazu Hani'), null);

    // ---- pickLang ----
    eq('i18n: English by default', I.pickLang('', null), 'en');
    eq('i18n: the saved choice is used', I.pickLang('', 'ja'), 'ja');
    eq('i18n: a junk saved value falls back to English', I.pickLang('', 'fr'), 'en');
    eq('i18n: ?lang=ja wins over a saved English', I.pickLang('?lang=ja', 'en'), 'ja');
    eq('i18n: ?lang=en wins over a saved Japanese', I.pickLang('?x=1&lang=EN', 'ja'), 'en');
    eq('i18n: an unknown ?lang= is ignored', I.pickLang('?lang=de', 'ja'), 'ja');

    // ---- device language ----
    eq('i18n device: a Japanese device gets Japanese', I.pickLang('', null, ['ja-JP']), 'ja');
    eq('i18n device: a bare "ja" counts', I.deviceLang(['ja']), 'ja');
    eq('i18n device: an English device stays English', I.pickLang('', null, ['en-GB', 'ja']), 'en');
    eq('i18n device: the first language the site speaks wins (fr, ja, en)', I.pickLang('', null, ['fr-FR', 'ja', 'en-US']), 'ja');
    eq('i18n device: a device with neither falls back to English', I.pickLang('', null, ['de-DE', 'fr']), 'en');
    eq('i18n device: case and underscores are tolerated', I.deviceLang(['JA_jp']), 'ja');
    eq('i18n device: "jam" or "eng" are not Japanese or English', I.deviceLang(['jam', 'eng', 'ja']), 'ja');
    eq('i18n device: empty, missing or junk lists give null', [I.deviceLang([]), I.deviceLang(null), I.deviceLang(undefined), I.deviceLang([null, '', 42])], [null, null, null, null]);
    eq('i18n device: a saved English beats a Japanese device', I.pickLang('', 'en', ['ja-JP']), 'en');
    eq('i18n device: a saved Japanese beats an English device', I.pickLang('', 'ja', ['en-US']), 'ja');
    eq('i18n device: ?lang=en beats a Japanese device', I.pickLang('?lang=en', null, ['ja-JP']), 'en');
    eq('i18n device: a junk saved value lets the device decide', I.pickLang('', 'fr', ['ja-JP']), 'ja');
    eq('i18n device: navLangs prefers navigator.languages', I.navLangs({ languages: ['ja-JP', 'en'], language: 'en-US' }), ['ja-JP', 'en']);
    eq('i18n device: navLangs falls back to navigator.language', [I.navLangs({ language: 'ja-JP' }), I.navLangs({ languages: [], language: 'ja' })], [['ja-JP'], ['ja']]);
    eq('i18n device: navLangs copes with no navigator at all', [I.navLangs(undefined), I.navLangs({})], [[], []]);

    // ---- the DOM translator against fake nodes ----
    var tWeather = fakeText('Weather'), tName = fakeText('Online'), tTitle = fakeText(' Next birthday ');
    var named = fakeEl({}, [tName], true);
    var btn = fakeEl({ 'aria-label': 'Back to top', title: 'Kazu Hani' }, [tTitle]);
    var page = fakeEl({}, [fakeEl({}, [tWeather]), named, btn]);
    var tr = I.createTranslator(T, I.untranslate);
    tr.walk(page);
    eq('i18n dom: text nodes translate', tWeather.nodeValue, '天気');
    eq('i18n dom: edge spaces collapse next to Japanese', tTitle.nodeValue, '次の誕生日');
    eq('i18n dom: skipped subtrees (names, titles) are left alone', tName.nodeValue, 'Online');
    eq('i18n dom: labels translate, names in labels do not', [btn.attrs['aria-label'], btn.attrs.title], ['ページの先頭へ', 'Kazu Hani']);
    eq('i18n dom: three swaps recorded', tr.size(), 3);
    tr.walk(page);
    eq('i18n dom: a second walk changes nothing and records nothing', [tWeather.nodeValue, tr.size()], ['天気', 3]);
    var tLive = fakeText('21 days');
    var live = fakeEl({}, [tLive]); live.parentElement = page;
    tr.text(tLive);
    eq('i18n dom: script.js text arriving later translates', tLive.nodeValue, '21日');
    tLive.nodeValue = '20 days'; // script.js writes fresh English while Japanese is on
    tr.restore(page);
    eq('i18n dom: restore puts back the exact originals', [tWeather.nodeValue, tTitle.nodeValue, btn.attrs['aria-label']], ['Weather', ' Next birthday ', 'Back to top']);
    eq('i18n dom: restore keeps English script.js wrote meanwhile', tLive.nodeValue, '20 days');
    eq('i18n dom: restore forgets every record', tr.size(), 0);
    var orphan = fakeText('天気');
    tr.restore(fakeEl({}, [orphan]));
    eq('i18n dom: an unrecorded Japanese phrase is turned back too', orphan.nodeValue, 'Weather');
    var gone = fakeText('Weather');
    fakeEl({}, [gone]);
    tr.text(gone); gone.isConnected = false; tr.prune();
    eq('i18n dom: prune drops nodes that left the page', tr.size(), 0);

    // ---- #boot-lang agrees with pickLang ----
    var bm = /<script id="boot-lang">([\s\S]*?)<\/script>/.exec(html);
    var headEnd = html.indexOf('</head>');
    ok('i18n: #boot-lang sits in <head> and is synchronous', !!bm && html.indexOf('<script id="boot-lang">') < headEnd && !/<script[^>]*id="boot-lang"[^>]*(async|defer|type=)/.test(html));
    function boot(search, stored, throws, nav) {
      var html = { attrs: {}, classes: [], setAttribute: function (k, v) { this.attrs[k] = v; }, classList: null };
      html.classList = { add: function (c) { html.classes.push(c); }, remove: function (c) { html.classes = html.classes.filter(function (x) { return x !== c; }); } };
      var timers = [];
      var storage = { getItem: function (k) { if (throws) throw new Error('blocked'); return k === 'kazu-lang' ? stored : null; } };
      new Function('location', 'localStorage', 'document', 'setTimeout', 'navigator', bm[1])({ search: search }, storage, { documentElement: html }, function (f, ms) { timers.push([f, ms]); }, nav || {});
      return { lang: html.attrs.lang || 'en', pending: html.classes.indexOf('i18n-pending') !== -1, timers: timers, html: html };
    }
    if (bm) {
      var searches = ['', '?lang=ja', '?lang=en', '?lang=JA', '?x=1&lang=ja', '?lang=de', '?lang=jax', '?xlang=ja'];
      var stores = [null, 'ja', 'en', 'fr'];
      var navs = [{}, { language: 'ja-JP' }, { language: 'en-GB' }, { languages: ['ja-JP', 'en'] }, { languages: ['en-US', 'ja'] },
        { languages: ['fr-FR', 'ja'], language: 'fr-FR' }, { languages: ['de', 'fr'] }, { languages: [], language: 'ja' }, { languages: ['JA_jp'] },
        { languages: ['jam', 'ja'] }, { languages: [null, 'ja'] }];
      var mismatch = [];
      searches.forEach(function (s) { stores.forEach(function (st) { navs.forEach(function (n) { [false, true].forEach(function (blocked) {
        var b = boot(s, st, blocked, n), want = I.pickLang(s, blocked ? null : st, I.navLangs(n));
        if (b.lang !== want || b.pending !== (want === 'ja')) mismatch.push(s + '/' + st + '/' + JSON.stringify(n) + (blocked ? '/blocked' : '') + ' -> ' + b.lang);
      }); }); }); });
      ok('i18n: #boot-lang makes the same choice as KazuI18n.pickLang in every case', !mismatch.length, mismatch.join(', '));
      var b = boot('', 'ja');
      ok('i18n: #boot-lang has a failsafe that shows the page again', b.timers.length === 1 && b.timers[0][1] <= 3000 && (b.timers[0][0](), !b.html.classes.length));
      eq('i18n: #boot-lang survives blocked storage (English)', boot('', null, true).lang, 'en');
      eq('i18n: #boot-lang still reads the device language when storage is blocked', boot('', null, true, { languages: ['ja-JP'] }).lang, 'ja');
      eq('i18n: #boot-lang hides an English first paint on a Japanese device', boot('', null, false, { languages: ['ja-JP'] }).pending, true);
    }
    ok('i18n: the pending state hides the page text and nothing else', css.indexOf('html.i18n-pending .container, html.i18n-pending .footer { visibility: hidden; }') !== -1);

    // ---- markup, load order, precache ----
    var cont = html.indexOf('<div class="container">');
    var sw0 = html.indexOf('<div class="lang-switch"');
    ok('i18n: the switch is the first thing on the page, above the announcement and the hero', sw0 > cont && sw0 < html.indexOf('id="hubBulletin"') && sw0 < html.indexOf('<header class="hero">'));
    ok('i18n: the switch has an English and a Japanese button, English pressed by default', html.indexOf('data-lang-set="en" lang="en" aria-pressed="true">English</button>') !== -1 && html.indexOf('data-lang-set="ja" lang="ja" aria-pressed="false">日本語</button>') !== -1);
    ok('i18n: the page starts in English', /<html lang="en">/.test(html));
    var ver = (/<script src="i18n\.js\?v=(\d+)"><\/script>/.exec(html) || [])[1];
    ok('i18n: i18n.js loads after site-config.js and before script.js (its observer must be live before script.js writes)', !!ver && html.indexOf('<script src="site-config.js') < html.indexOf('<script src="i18n.js') && html.indexOf('<script src="i18n.js') < html.indexOf('<script src="script.js'));
    ok('i18n: the service worker precaches the same i18n.js version', !!ver && sw.indexOf("'./i18n.js?v=" + ver + "'") !== -1);
    ok('i18n: the switch has a 44px tap target on touch screens', /@media \(pointer: coarse\) \{ \.lang-switch-btn \{ min-height: 44px;/.test(css));
    ok('i18n: the switch runs no transition or animation at rest', !/\.lang-switch[^{]*\{[^}]*(transition|animation)/.test(css));
  }

  global.KazuI18nChecks = { run: run, pageStrings: pageStrings, KEEP: KEEP };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuI18nChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path');
      var root = path.join(__dirname, '..');
      var read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8'); };
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; if (!value) console.log('FAIL ' + name + ': ' + detail); };
      var eqFn = function (name, a, b) { okFn(name, JSON.stringify(a) === JSON.stringify(b), 'got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); };
      run(require(path.join(root, 'i18n.js')), read('index.html'), read('script.js'), read('style.css'), read('sw.js'), global.KazuLib.stripEmoji, okFn, eqFn);
      console.log('i18n eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
