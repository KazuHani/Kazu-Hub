/* ============================================================================
   i18n.js — the English / Japanese switch for Kazu Hub.
   ----------------------------------------------------------------------------
   English is the page's own language and the default. Japanese is a layer on
   top: nothing in index.html or script.js knows it exists.

   How it works:
     - The pure core (KazuI18n.translate) maps one piece of English text to
       Japanese: first an exact phrase table, then a short list of rules for
       text script.js builds at run time (the clock, dates, countdowns, Steam
       hours, Discord timers, toasts...). Anything it doesn't know comes back
       null and stays English, so live content (song titles, game names, the
       quote, anything the control panel adds) is never mangled.
     - The DOM shell (bottom of the file) walks the page once when Japanese
       is switched on, and a MutationObserver translates whatever script.js
       writes afterwards (observer callbacks run before the next paint, so
       English never flashes). Every swap is recorded; switching back to
       English restores the exact original text and disconnects the observer,
       so the default page pays nothing at all.
     - Elements that hold names and titles (SKIP_SELECTOR) are never touched,
       nor is anything marked translate="no". Two exceptions inside them:
         - an element carrying data-ja="..." (live data that came with its
           own Japanese, e.g. the MAL card's native titles from AniList)
           shows that text in Japanese mode;
         - the quote: zenquotes only speaks English, so Japanese mode shows
           a quote from QUOTES instead (the English quote's own translation
           when it is one of them, otherwise one picked by a hash of the
           English text, so the same quote always maps the same way).
     - The choice is kept in localStorage ('kazu-lang'); ?lang=ja|en wins for
       one page load without being saved. With neither, the device language
       decides (navigator.languages, first English or Japanese entry), and
       that is never saved, so it follows the device until the visitor picks
       one on the switch. The inline #boot-lang script in
       <head> sets <html lang> and hides the page text until this file has
       run, so a Japanese visitor never sees an English first paint.

   Pure and DOM-free down to the shell, ES5 like lib.js, so tests.js runs the
   core and the shell (against fake nodes) under plain Node.
   ========================================================================== */
(function (global) {
  'use strict';

  var LANGS = ['en', 'ja'];
  var STORE_KEY = 'kazu-lang';

  // ---- Exact phrases ------------------------------------------------------
  // Keys are English as it appears on the page, whitespace collapsed and
  // curly apostrophes straightened (normKey). Japanese values are unique
  // (except the deliberate empty ones) so a reverse lookup is unambiguous;
  // the gate tests hold both rules.
  var PHRASES = {
    // Language switch + page chrome
    'Language': '言語',
    'Dismiss': '非表示',
    'Close': '閉じる',
    'Back to top': 'ページの先頭へ',
    'New quote': '新しい名言',
    'Show another quote': '別の名言を表示',

    // Stat cards
    'UK time': 'イギリス時間',
    'Weather': '天気',
    'Reading the sky…': '空を読み込み中…',
    "Couldn't read the sky": '空を読み込めませんでした',
    'Retry': '再試行',
    'Age': '年齢',
    'years young': '歳',
    'Next birthday': '次の誕生日',
    'Today!': '今日!',
    'Time and timezones — open details': '時刻とタイムゾーン — 詳細を開く',
    'Weather — open the interactive UK wind globe': '天気 — イギリスの風の地球儀を開く',
    'Age and life stats — open details': '年齢と人生の記録 — 詳細を開く',
    'Next birthday — open countdown and add to calendar': '次の誕生日 — カウントダウンを開いてカレンダーに追加',

    // Weather conditions (script.js weatherInfo)
    'Clear sky': '快晴',
    'Mainly clear': '晴れ',
    'Partly cloudy': '晴れ時々曇り',
    'Overcast': '本曇り',
    'Foggy': '霧',
    'Drizzle': '霧雨',
    'Rain': '雨',
    'Snow': '雪',
    'Rain showers': 'にわか雨',
    'Snow showers': 'にわか雪',
    'Thunderstorm': '雷雨',
    'Cloudy': '曇り',
    'Forecast': '予報',

    // Right now: section + Discord
    'Right now': 'いま',
    'Add me': 'フレンド追加',
    'Playing now': 'プレイ中',
    'Listening on Spotify': 'Spotifyで再生中',
    'Connecting to Discord…': 'Discordに接続中…',
    "Can't reach Discord right now.": '現在Discordに接続できません。',
    'Open my Discord profile & copy my username': 'Discordのプロフィールを開いてユーザー名をコピー',
    'Click to copy my username': 'クリックでユーザー名をコピー',
    'avatar': 'アバター',
    'Online': 'オンライン',
    'Idle': '退席中',
    'Do Not Disturb': '取り込み中',
    'Offline': 'オフライン',
    'Active on mobile': 'モバイルで利用中',
    'Active on desktop': 'デスクトップで利用中',
    'Active on web': 'ウェブで利用中',
    'a game': 'ゲーム',
    'Currently offline': '現在オフライン',
    'Online, not in a game right now': 'オンライン、今はゲームをしていません',

    // Steam
    'View profile →': 'プロフィール →',
    'Recently played': '最近プレイしたゲーム',
    'Connecting to Steam…': 'Steamに接続中…',
    'My library, achievements & playtime.': 'ライブラリ、実績、プレイ時間。',
    'Steam avatar': 'Steamのアバター',
    'In-Game': 'ゲーム中',
    'Away': '離席中',

    // MyAnimeList
    'View list →': 'リストを見る →',
    'Also reading': '読んでいるもの',
    'Not watching or reading anything right now': '今は何も観たり読んだりしていません',
    'Connecting to MyAnimeList…': 'MyAnimeListに接続中…',
    "Can't reach MyAnimeList right now.": '現在MyAnimeListに接続できません。',

    // Letterboxd
    'Nothing logged lately': '最近の記録はありません',
    'Connecting to Letterboxd…': 'Letterboxdに接続中…',
    "Can't reach Letterboxd right now.": '現在Letterboxdに接続できません。',
    'Latest watch': '最近観た映画',
    'rewatch': '再鑑賞',

    // Section titles
    'Socials': 'SNS',
    'My PC': 'マイPC',
    'My playlist': 'マイプレイリスト',
    "What I'm writing": '執筆中の物語',

    // PC specs
    'PC specifications': 'PCスペック',
    'Graphics': 'グラフィックス',
    'Core platform': 'コアパーツ',
    'Processor': 'プロセッサー',
    'Motherboard': 'マザーボード',
    'Memory': 'メモリ',
    'Storage': 'ストレージ',
    'Cooling, power & case': '冷却・電源・ケース',
    'CPU cooler': 'CPUクーラー',
    'Power supply': '電源ユニット',
    'Case': 'ケース',

    // Playlist
    'Open →': '開く →',
    'Playlist': 'プレイリスト',
    'On YouTube Music': 'YouTube Musicで公開中',
    'From the playlist': 'プレイリストから',
    'Open playlist on YouTube Music': 'YouTube Musicでプレイリストを開く',
    'Playlist cover': 'プレイリストのカバー',

    // Stories
    'A tale forged in blood and old legend — read the latest chapters on Google Docs.': '血と古き伝説から鍛えられた物語。最新章はGoogleドキュメントで読めます。',
    'Where serpent-kind and humanity collide — follow the story as it unfolds on Google Docs.': '蛇の一族と人類がぶつかり合う物語。その行方をGoogleドキュメントで追いかけよう。',
    'Read now →': '今すぐ読む →',

    // Footer
    'Kazu Hani · Arctic Dragon': 'Kazu Hani · 北極のドラゴン',

    // Pop-up: time & timezones
    'Time & timezones': '時刻とタイムゾーン',
    'Your time': 'あなたの時間',
    'your device': 'あなたの端末',
    'Time difference': '時差',
    'None — same as the UK': 'なし — イギリスと同じ',
    'Right now:': '現在:',
    'British Summer Time': '英国夏時間',
    'Greenwich Mean Time': 'グリニッジ標準時',
    'Next clock change:': '次の時刻変更:',
    'clocks go': '時計を1時間',
    'forward': '進めます',
    'back': '戻します',
    '1 hour — lose an hour, BST begins': '— 1時間短くなり、BSTが始まります',
    '1 hour — gain an hour, GMT returns': '— 1時間長くなり、GMTに戻ります',

    // Pop-up: wind globe + forecast + compare
    'UK wind globe': 'イギリスの風の地球儀',
    'Live surface wind over the UK — drag to spin, scroll to zoom.': 'イギリス上空の地表風をライブ表示。ドラッグで回転、スクロールでズーム。',
    'Source: earth.nullschool.net': '出典: earth.nullschool.net',
    'Open full UK wind map': 'イギリスの風マップを全画面で開く',
    'Compare with your sky': 'あなたの空と比べる',
    'Interactive 3D wind globe of the UK': 'イギリスのインタラクティブ3D風地球儀',
    "This browser can't share your location.": 'このブラウザは位置情報を共有できません。',
    'Asking for your sky…': 'あなたの空を確認中…',
    "Couldn't read your sky": 'あなたの空を読み込めませんでした',
    'Location off — your sky stays a mystery': '位置情報オフ — あなたの空は謎のまま',
    "My sky hasn't loaded yet — retry the weather card first.": 'こちらの空がまだ読み込まれていません。先に天気カードを再試行してください。',
    'Same temperature as you': 'あなたと同じ気温',
    'Aberystwyth': 'アベリストウィス',
    'Your sky': 'あなたの空',
    'Difference': '差',
    'Forecast unavailable right now.': '現在、予報を取得できません。',
    'Loading forecast…': '予報を読み込み中…',
    'Today': '今日',

    // Pop-up: age & life stats
    'Age & life stats': '年齢と人生の記録',
    'old': '',
    'days lived': '生きた日数',
    'weeks lived': '生きた週数',
    'hours lived': '生きた時間',
    'heartbeats': '心拍',
    'Next milestone': '次の節目',
    'reached on': '到達日',
    'Star sign': '星座',
    'Life in fun units': 'おもしろ単位で見る人生',
    'full moons seen': '見た満月',
    'laps of the Sun': '太陽を回った周回',
    'years asleep': '眠っていた年数',
    'breaths taken': '呼吸の回数',

    // Pop-up: next birthday
    'Turning': '',
    "It's today — happy birthday! Turning": '今日が誕生日、おめでとう! 今日で',
    'days': '日',
    'hours': '時間',
    'mins': '分',
    'secs': '秒',
    'Add to Google Calendar': 'Googleカレンダーに追加',
    'Download .ics file': '.icsファイルをダウンロード',
    'Adds a yearly all-day event with a reminder the day before.': '毎年の終日イベントを、前日のリマインダー付きで追加します。'
  };

  var WEEKDAYS = { Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土', Sun: '日' };
  var WEEKDAY_LONG = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var SIGNS = { Aries: '牡羊座', Taurus: '牡牛座', Gemini: '双子座', Cancer: '蟹座', Leo: '獅子座', Virgo: '乙女座', Libra: '天秤座', Scorpio: '蠍座', Sagittarius: '射手座', Capricorn: '山羊座', Aquarius: '水瓶座', Pisces: '魚座' };
  // Forecast labels (short weekday) and star signs are exact phrases too.
  Object.keys(WEEKDAYS).forEach(function (k) { PHRASES[k] = WEEKDAYS[k] + '曜'; });
  Object.keys(SIGNS).forEach(function (k) { PHRASES[k] = SIGNS[k]; });

  function normKey(s) {
    return String(s).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  }

  // "Mon 19 Oct 2026", "Sunday, 9 November 2025", "12 Mar 2027", "Wed 14 Oct"
  // (en-GB Intl output, with or without the comma some ICU builds add).
  var DATE_RE = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)(?:,? (\d{4}))?$/;
  function dateJa(s) {
    var m = DATE_RE.exec(s);
    if (!m) return null;
    var mon = MONTHS.indexOf(m[3]);
    if (mon < 0) mon = MONTHS_LONG.indexOf(m[3]);
    var out = (m[4] ? m[4] + '年' : '') + (mon + 1) + '月' + (+m[2]) + '日';
    if (m[1]) out += '(' + WEEKDAYS[WEEKDAY_LONG[m[1]] || m[1]] + ')';
    return out;
  }

  // ---- Rules for text script.js composes at run time ----------------------
  // Each takes the normalised string and returns Japanese or null.
  var RULES = [
    // Clock: en-GB 12-hour "02:15:04 pm" -> 24-hour "14:15:04", the usual
    // Japanese form (午後 in front no longer fits the UK time card).
    function (s) {
      var m = /^(\d{1,2}):(\d{2}:\d{2}) ?(am|pm)$/i.exec(s);
      if (!m) return null;
      var h = (+m[1] % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
      return (h < 10 ? '0' : '') + h + ':' + m[2];
    },
    dateJa,
    // Birthday card + countdowns
    function (s) { var m = /^([\d,]+) days?$/.exec(s); return m ? m[1] + '日' : null; },
    function (s) { var m = /^until turning (\d+)$/.exec(s); return m ? m[1] + '歳まで' : null; },
    function (s) { var m = /^Happy birthday — turning (\d+)$/i.exec(s); return m ? 'お誕生日おめでとう! ' + m[1] + '歳に' : null; },
    function (s) { var m = /^on (.+)$/.exec(s); var d = m && dateJa(m[1]); return d ? 'の誕生日 — ' + d : null; },
    // Weather
    function (s) { var m = /^wind (\d+) mph$/i.exec(s); return m ? '風速 ' + m[1] + ' mph' : null; },
    function (s) {
      var m = /^(\d+)°C (warmer|colder) where you are$/.exec(s);
      return m ? 'あなたの所は' + m[1] + '°C' + (m[2] === 'warmer' ? '暖かい' : '寒い') : null;
    },
    // Time pop-up
    function (s) {
      var m = /^([\d.]+) hours? (ahead of|behind) the UK$/.exec(s);
      return m ? 'イギリスより' + m[1] + '時間' + (m[2] === 'ahead of' ? '進んでいる' : '遅れている') : null;
    },
    // "(in 6 days) — clocks go <strong>back</strong>": one text node up to the <strong>
    function (s) {
      var m = /^\(in (\d+) days?\) —( clocks go)?$/.exec(s);
      return m ? '(あと' + m[1] + '日) —' + (m[2] ? ' ' + PHRASES['clocks go'] : '') : null;
    },
    // Age pop-up
    function (s) {
      var m = /^(\d+) years?, (\d+) months?, (\d+) days?$/.exec(s);
      return m ? m[1] + '歳' + m[2] + 'か月' + m[3] + '日' : null;
    },
    function (s) { var m = /^([\d,]+) to go$/.exec(s); return m ? 'あと' + m[1] + '日' : null; },
    function (s) {
      var m = /^Born (.+) — an? (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.exec(s);
      var d = m && dateJa(m[1]);
      return d ? d + '(' + WEEKDAYS[WEEKDAY_LONG[m[2]]] + '曜日)生まれ' : null;
    },
    // Discord game timer
    function (s) {
      var m = /^for (?:(\d+)h (\d+)m|(\d+) min|(\d+)s)$/.exec(s);
      if (!m) return null;
      if (m[1]) return m[1] + '時間' + m[2] + '分';
      return m[3] ? m[3] + '分' : m[4] + '秒';
    },
    // Steam hours
    function (s) { var m = /^([\d.]+) hrs last 2 wks$/.exec(s); return m ? '過去2週間で' + m[1] + '時間' : null; },
    function (s) { var m = /^([\d.]+) hrs total$/.exec(s); return m ? '合計' + m[1] + '時間' : null; },
    // MyAnimeList progress
    function (s) {
      var m = /^(Ep|Ch) (\d+) \/ (\d+|\?)$/.exec(s);
      if (!m) return null;
      var unit = m[1] === 'Ep' ? '話' : '章';
      return '第' + m[2] + unit + ' / 全' + m[3] + unit;
    },
    // Toasts
    function (s) { var m = /^Copied (@\S+) — add me on Discord!$/.exec(s); return m ? m[1] + ' をコピーしました。Discordで追加してね!' : null; },
    function (s) { var m = /^Copied (@\S+)$/.exec(s); return m ? m[1] + ' をコピーしました' : null; },
    function (s) { var m = /^My Discord: (@\S+)$/.exec(s); return m ? 'Discord: ' + m[1] : null; },
    function (s) { var m = /^Saved (\S+\.ics)$/.exec(s); return m ? m[1] + ' を保存しました' : null; },
    // Status lines: "● Online"
    function (s) { var m = /^● (.+)$/.exec(s); var t = m && PHRASES[m[1]]; return t ? '● ' + t : null; }
  ];

  function translateKey(key) {
    if (Object.prototype.hasOwnProperty.call(PHRASES, key)) return PHRASES[key];
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i](key);
      if (r !== null && r !== undefined) return r;
    }
    // "A · B": translate each part on its own ("Clear sky · wind 12 mph",
    // "12 Mar 2027 · 1,234 to go", "Wed 14 Oct · Europe/London").
    if (key.indexOf(' · ') !== -1) {
      var parts = key.split(' · '), any = false;
      for (var j = 0; j < parts.length; j++) {
        var t = translateKey(parts[j]);
        if (t !== null) { parts[j] = t; any = true; }
      }
      return any ? parts.join(' · ') : null;
    }
    return null;
  }

  // English text -> Japanese, or null when it isn't ours to translate.
  // Text nodes sit between tags ("clocks go <strong>forward</strong> 1 hour"),
  // so a space at either end survives as one space, except where the Japanese
  // starts or ends with a kana/kanji: Japanese runs on without word spaces.
  var CJK = /[　-鿿＀-￯]/;
  function translate(text) {
    if (typeof text !== 'string' || !/[A-Za-z]/.test(text)) return null;
    var ja = translateKey(normKey(text));
    if (ja === null) return null;
    if (ja === '') return '';
    var lead = /^\s/.test(text) && !CJK.test(ja.charAt(0));
    var trail = /\s$/.test(text) && !CJK.test(ja.charAt(ja.length - 1));
    return (lead ? ' ' : '') + ja + (trail ? ' ' : '');
  }

  // Japanese phrase -> English, for text the shell didn't record (a node
  // rebuilt from a Japanese copy). Phrases only; rules aren't reversible.
  var REVERSE = null;
  function untranslate(text) {
    if (typeof text !== 'string') return null;
    if (!REVERSE) {
      REVERSE = {};
      Object.keys(PHRASES).forEach(function (k) { if (PHRASES[k]) REVERSE[PHRASES[k]] = k; });
    }
    var key = text.replace(/\s+/g, ' ').trim();
    if (!Object.prototype.hasOwnProperty.call(REVERSE, key)) return null;
    return (/^\s/.test(text) ? ' ' : '') + REVERSE[key] + (/\s$/.test(text) ? ' ' : '');
  }

  function isLang(v) { return LANGS.indexOf(v) !== -1; }
  // The device's preferred languages (navigator.languages, most preferred
  // first, e.g. ['ja-JP', 'en-US']): the first one the site speaks, by its
  // primary subtag. null when none is English or Japanese.
  function deviceLang(langs) {
    if (!langs || typeof langs.length !== 'number') return null;
    for (var i = 0; i < langs.length; i++) {
      var p = String(langs[i] || '').split(/[-_]/)[0].toLowerCase();
      if (isLang(p)) return p;
    }
    return null;
  }
  // ?lang= wins for this load, then the saved choice, then the device
  // language, then English.
  function pickLang(search, stored, langs) {
    var m = /[?&]lang=([a-z]+)/i.exec(String(search || ''));
    if (m && isLang(m[1].toLowerCase())) return m[1].toLowerCase();
    if (isLang(stored)) return stored;
    return deviceLang(langs) || 'en';
  }
  // navigator.languages where it exists, else the single navigator.language.
  function navLangs(nav) {
    if (!nav) return [];
    if (nav.languages && nav.languages.length) return nav.languages;
    return nav.language ? [nav.language] : [];
  }

  // ---- Quotes ---------------------------------------------------------------
  // [English, Japanese, author in Japanese]. Holds every FALLBACK_QUOTES entry
  // in script.js (a gate test keeps them in step); Japanese mode shows these
  // because the live quote API has no Japanese.
  var QUOTES = [
    ['The only way to do great work is to love what you do.', '偉大な仕事をする唯一の方法は、自分のしていることを愛することだ。', 'スティーブ・ジョブズ'],
    ["Believe you can and you're halfway there.", 'できると信じれば、もう半分は達成している。', 'セオドア・ルーズベルト'],
    ['It does not matter how slowly you go as long as you do not stop.', '止まりさえしなければ、どれだけゆっくり進んでもかまわない。', '孔子'],
    ["Whether you think you can or you think you can't, you're right.", 'できると思っても、できないと思っても、どちらも正しい。', 'ヘンリー・フォード'],
    ['Success is not final, failure is not fatal: it is the courage to continue that counts.', '成功は終わりではなく、失敗は致命的ではない。大切なのは続ける勇気だ。', 'ウィンストン・チャーチル'],
    ['The future belongs to those who believe in the beauty of their dreams.', '未来は、自分の夢の美しさを信じる人のものだ。', 'エレノア・ルーズベルト'],
    ['Hardships often prepare ordinary people for an extraordinary destiny.', '困難は、ふつうの人を特別な運命へと導く準備になることが多い。', 'C・S・ルイス'],
    ['It is during our darkest moments that we must focus to see the light.', 'いちばん暗いときにこそ、光を見ることに集中しなければならない。', 'アリストテレス'],
    ['Do not wait to strike till the iron is hot; make it hot by striking.', '鉄が熱くなるまで打つのを待つな。打って熱くせよ。', 'ウィリアム・バトラー・イェイツ'],
    ["You miss 100% of the shots you don't take.", '打たなかったシュートは、100%外れる。', 'ウェイン・グレツキー'],
    ['Act as if what you do makes a difference. It does.', '自分の行動が世界を変えるかのように行動しよう。実際に変えるのだから。', 'ウィリアム・ジェームズ'],
    ['Success usually comes to those who are too busy to be looking for it.', '成功はたいてい、探している暇もないほど忙しい人のもとにやってくる。', 'ヘンリー・デイヴィッド・ソロー'],
    ["Don't watch the clock; do what it does. Keep going.", '時計を見るな。時計と同じことをしよう。進み続けるんだ。', 'サム・レヴェンソン'],
    ["Everything you've ever wanted is on the other side of fear.", '望んできたものはすべて、恐怖の向こう側にある。', 'ジョージ・アデア'],
    ["Hard work beats talent when talent doesn't work hard.", '才能が努力しないとき、努力は才能に勝つ。', 'ティム・ノトキ'],
    ['Dream big and dare to fail.', '大きな夢を持ち、失敗を恐れるな。', 'ノーマン・ヴォーン'],
    ["Opportunities don't happen, you create them.", 'チャンスは起こるものではなく、自分でつくるものだ。', 'クリス・グロッサー'],
    ['I find that the harder I work, the more luck I seem to have.', '懸命に働くほど、運が味方してくれるようだ。', 'トーマス・ジェファーソン'],
    ['The only limit to our realization of tomorrow is our doubts of today.', '明日を実現するうえで唯一の限界は、今日の疑いだ。', 'フランクリン・D・ルーズベルト'],
    ['What you get by achieving your goals is not as important as what you become by achieving your goals.', '目標を達成して得るものより、目標を達成することでなれる自分のほうが大切だ。', 'ジグ・ジグラー'],
    ['You are never too old to set another goal or to dream a new dream.', '新しい目標を立てるのにも、新しい夢を見るのにも、遅すぎることはない。', 'C・S・ルイス'],
    ["It always seems impossible until it's done.", '何事も、成し遂げるまでは不可能に思えるものだ。', 'ネルソン・マンデラ'],
    ["Don't be afraid to give up the good to go for the great.", '最高を目指すために、良いものを手放すことを恐れるな。', 'ジョン・D・ロックフェラー'],
    ['The way to get started is to quit talking and begin doing.', '始めるには、話すのをやめて動き出すことだ。', 'ウォルト・ディズニー'],
    ["If you are working on something exciting that you care about, you don't have to be pushed.", '心から大切なワクワクすることに取り組んでいれば、誰かに背中を押してもらう必要はない。', 'スティーブ・ジョブズ'],
    ['Success is walking from failure to failure with no loss of enthusiasm.', '成功とは、情熱を失わずに失敗から失敗へと歩き続けることだ。', 'ウィンストン・チャーチル'],
    ['Quality is not an act, it is a habit.', '質とは一度の行いではなく、習慣である。', 'アリストテレス'],
    ['Either you run the day, or the day runs you.', '一日を動かすか、一日に動かされるかのどちらかだ。', 'ジム・ローン'],
    ['Energy and persistence conquer all things.', '気力と粘り強さは、すべてに打ち勝つ。', 'ベンジャミン・フランクリン'],
    ['Believe in yourself and all that you are.', '自分自身と、自分のすべてを信じよう。', 'クリスチャン・D・ラーソン'],
    ['Knowing yourself is the beginning of all wisdom.', '自分を知ることは、すべての知恵の始まりである。', 'アリストテレス'],
    ["You don't have to be great to start, but you have to start to be great.", '始めるのに優れている必要はないが、優れた人になるには始めなければならない。', 'ジグ・ジグラー'],
    ['Strive not to be a success, but rather to be of value.', '成功者になろうとするより、価値ある人になろうと努めよ。', 'アルベルト・アインシュタイン'],
    ['The mind is everything. What you think you become.', '心がすべてだ。人は思ったとおりの自分になる。', 'ブッダ'],
    ['Failure will never overtake me if my determination to succeed is strong enough.', '成功への決意が十分に強ければ、失敗に追いつかれることは決してない。', 'オグ・マンディーノ'],
    ['We may encounter many defeats but we must not be defeated.', '何度負けることがあっても、打ちのめされてはならない。', 'マヤ・アンジェロウ'],
    ['Imagine your life is perfect in every respect; what would it look like?', '人生があらゆる面で完璧だと想像してみよう。それはどんな姿だろう？', 'ブライアン・トレーシー'],
    ['We generate fears while we sit. We overcome them by action.', '恐れは座っている間に生まれ、行動することで乗り越えられる。', 'ヘンリー・リンク'],
    ['Whatever the mind dwells upon, it expands.', '心がとどまるものは、何であれ大きくなっていく。', 'ロバート・クーパー'],
    ['Limitations live only in our minds. If we use our imaginations, our possibilities become limitless.', '限界は心の中にしかない。想像力を使えば、可能性は無限になる。', 'ジェイミー・パオリネッティ'],
    ['You take your life in your own hands, and what happens? A terrible thing: no one to blame.', '自分の人生を自分の手に握ると何が起こるか。恐ろしいことに、誰のせいにもできなくなる。', 'エリカ・ジョング'],
    ["What's money? A man is a success if he gets up in the morning and goes to bed at night and in between does what he wants.", 'お金が何だというんだ。朝起きて夜眠り、その間に好きなことをしていれば、その人は成功者だ。', 'ボブ・ディラン'],
    ['A successful man is one who can lay a firm foundation with the bricks others have thrown at him.', '成功者とは、他人に投げつけられたレンガで確かな土台を築ける人のことだ。', 'デイヴィッド・ブリンクリー'],
    ['The road to success and the road to failure are almost exactly the same.', '成功への道と失敗への道は、ほとんどまったく同じだ。', 'コリン・R・デイヴィス'],
    ['The only place where your dream becomes impossible is in your own thinking.', '夢が不可能になる唯一の場所は、自分の頭の中だ。', 'ロバート・H・シュラー'],
    ['All progress takes place outside the comfort zone.', 'すべての進歩は、居心地のいい場所の外で起こる。', 'マイケル・ジョン・ボバック'],
    ['Push yourself, because no one else is going to do it for you.', '自分の背中は自分で押そう。ほかの誰も押してはくれないのだから。', '作者不詳'],
    ['Great things never come from comfort zones.', '偉大なことは、居心地のいい場所からは決して生まれない。', '作者不詳'],
    ['Sometimes later becomes never. Do it now.', '「あとで」は、ときに「永遠にやらない」になる。今やろう。', '作者不詳'],
    ['Little things make big days.', '小さなことが、大きな一日をつくる。', '作者不詳'],
    ["Don't stop when you're tired. Stop when you're done.", '疲れたときではなく、やり終えたときに止まろう。', '作者不詳']
  ];
  var QUOTE_INDEX = null;
  function quoteKey(text) { return normKey(String(text || '')); }
  // English quote -> { text, author } in Japanese. Known quotes get their own
  // translation; any other text gets QUOTES[hash % n], stable per text.
  function quoteJa(text) {
    if (!QUOTE_INDEX) {
      QUOTE_INDEX = {};
      QUOTES.forEach(function (q, i) { QUOTE_INDEX[quoteKey(q[0])] = i; });
    }
    var key = quoteKey(text);
    var i = Object.prototype.hasOwnProperty.call(QUOTE_INDEX, key) ? QUOTE_INDEX[key] : -1;
    if (i === -1) {
      var h = 0;
      for (var c = 0; c < key.length; c++) h = (h * 31 + key.charCodeAt(c)) >>> 0;
      i = h % QUOTES.length;
    }
    return { text: QUOTES[i][1], author: QUOTES[i][2] };
  }
  // Keeps the quote's text and author in step: Japanese mode shows the pair
  // quoteJa picks, and remembers the English underneath (including any new
  // quote script.js writes meanwhile) so English mode can put it back.
  // Works on anything with textContent, so Node can test it.
  function createQuoteSync(pick) {
    var en = null, shown = null;
    function sync(t, a) {
      if (!t || !a) return;
      var ct = t.textContent, ca = a.textContent;
      if (!en) en = { t: ct, a: ca };
      if (!shown || ct !== shown.t) en.t = ct;
      if (!shown || ca !== shown.a) en.a = ca;
      if (!String(en.t).trim()) { shown = null; return; }
      var q = pick(en.t);
      shown = { t: q.text, a: '— ' + q.author };
      if (ct !== shown.t) t.textContent = shown.t;
      if (ca !== shown.a) a.textContent = shown.a;
    }
    function restore(t, a) {
      if (t && a && en && shown) {
        if (t.textContent === shown.t) t.textContent = en.t;
        if (a.textContent === shown.a) a.textContent = en.a;
      }
      en = null; shown = null;
    }
    return { sync: sync, restore: restore };
  }

  // ---- DOM translator (works on anything node-shaped, so Node can test it) --
  var ATTRS = ['title', 'aria-label', 'alt', 'placeholder'];
  // Names and titles: live API content, the quote, product names. Never translated.
  var SKIP_SELECTOR = 'script, style, svg, [translate="no"], #quoteBox, #discordName, #discordUsername, #discordCustomText, #discordGameName, #discordGameSub, #spotifySong, #spotifyArtist, #steamGameName, .recent-game-name, .mal-title, .lb-title, .music-track-name, .music-track-artist, .music-playlist-name, .story-title, .dev-panel';

  function createTranslator(tr, untr) {
    var texts = [];   // [node, en, ja]
    var attrs = [];   // [element, name, en, ja]
    function skipped(el) { return !!(el && el.closest && el.closest(SKIP_SELECTOR)); }
    function text(node) {
      var t = tr(node.nodeValue);
      if (t === null || t === node.nodeValue) return;
      texts.push([node, node.nodeValue, t]);
      node.nodeValue = t;
    }
    function attr(el, name) {
      var v = el.getAttribute(name);
      if (v === null) return;
      var t = tr(v);
      if (t === null || t === v) return;
      attrs.push([el, name, v, t]);
      el.setAttribute(name, t);
    }
    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) { if (!skipped(node.parentElement)) text(node); return; }
      if (node.nodeType !== 1) return;
      // Live data that brought its own Japanese (data-ja): swap the element's
      // single text node, even inside the names-and-titles skip list.
      var ja = node.getAttribute('data-ja');
      var only = node.childNodes && node.childNodes.length === 1 ? node.childNodes[0] : null;
      if (ja && only && only.nodeType === 3) {
        if (only.nodeValue !== ja) { texts.push([only, only.nodeValue, ja]); only.nodeValue = ja; }
        return;
      }
      if (skipped(node)) return;
      for (var i = 0; i < ATTRS.length; i++) attr(node, ATTRS[i]);
      var kids = node.childNodes;
      for (var j = 0; j < kids.length; j++) walk(kids[j]);
    }
    function revertWalk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        var e = untr(node.nodeValue);
        if (e !== null) node.nodeValue = e;
        return;
      }
      if (node.nodeType !== 1 || skipped(node)) return;
      for (var i = 0; i < ATTRS.length; i++) {
        var v = node.getAttribute(ATTRS[i]);
        var back = v === null ? null : untr(v);
        if (back !== null) node.setAttribute(ATTRS[i], back);
      }
      var kids = node.childNodes;
      for (var j = 0; j < kids.length; j++) revertWalk(kids[j]);
    }
    // Put back every recorded original whose Japanese is still showing (if
    // script.js has since written fresh English, that stays), then catch any
    // Japanese phrase that reached the page some other way.
    function restore(root) {
      texts.forEach(function (r) { if (r[0].nodeValue === r[2]) r[0].nodeValue = r[1]; });
      attrs.forEach(function (r) { if (r[0].getAttribute(r[1]) === r[3]) r[0].setAttribute(r[1], r[2]); });
      texts = []; attrs = [];
      if (root) revertWalk(root);
    }
    // Long sessions: forget nodes that have left the page.
    function prune() {
      texts = texts.filter(function (r) { return r[0].isConnected !== false; });
      attrs = attrs.filter(function (r) { return r[0].isConnected !== false; });
    }
    function size() { return texts.length + attrs.length; }
    return { walk: walk, text: text, attr: attr, skipped: skipped, restore: restore, prune: prune, size: size };
  }

  var api = {
    LANGS: LANGS,
    STORE_KEY: STORE_KEY,
    PHRASES: PHRASES,
    SKIP_SELECTOR: SKIP_SELECTOR,
    ATTRS: ATTRS,
    translate: translate,
    untranslate: untranslate,
    pickLang: pickLang,
    QUOTES: QUOTES,
    quoteJa: quoteJa,
    createQuoteSync: createQuoteSync,
    deviceLang: deviceLang,
    navLangs: navLangs,
    createTranslator: createTranslator,
    lang: function () { return 'en'; }
  };
  global.KazuI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // ---- DOM shell ----------------------------------------------------------
  // Only on a page that carries the switch (index.html loads this file after
  // the markup); tests.html loads the core alone and must stay untouched.
  if (typeof document === 'undefined' || !document.querySelector || !document.querySelector('[data-lang-set]')) return;

  var root = document.documentElement;
  var current = 'en';
  var dom = createTranslator(translate, untranslate);
  var observer = null;
  var prunes = 0;
  var quote = createQuoteSync(quoteJa);
  function quoteEls() { return [document.getElementById('quoteText'), document.getElementById('quoteAuthor')]; }
  function inQuote(n) {
    var el = n && (n.nodeType === 1 ? n : n.parentElement);
    return !!(el && el.closest && el.closest('#quoteBox'));
  }

  function onMutations(records) {
    var quoteTouched = false;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (inQuote(r.target)) { quoteTouched = true; continue; }
      if (r.type === 'childList') {
        for (var j = 0; j < r.addedNodes.length; j++) dom.walk(r.addedNodes[j]);
      } else if (r.type === 'characterData') {
        if (!dom.skipped(r.target.parentElement)) dom.text(r.target);
      } else if (!dom.skipped(r.target)) {
        dom.attr(r.target, r.attributeName);
      }
    }
    if (quoteTouched) { var q = quoteEls(); quote.sync(q[0], q[1]); }
    if (observer) observer.takeRecords(); // our own writes, already handled
    if (++prunes >= 600) { prunes = 0; dom.prune(); }
  }

  function syncButtons() {
    var btns = document.querySelectorAll('[data-lang-set]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-lang-set') === current ? 'true' : 'false');
    }
  }

  function apply(lang) {
    current = isLang(lang) ? lang : 'en';
    root.setAttribute('lang', current);
    var q = quoteEls();
    if (current === 'ja') {
      if (document.body) dom.walk(document.body);
      quote.sync(q[0], q[1]);
      if (!observer && typeof MutationObserver !== 'undefined' && document.body) {
        observer = new MutationObserver(onMutations);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      }
    } else {
      if (observer) { observer.disconnect(); observer = null; }
      dom.restore(document.body);
      quote.restore(q[0], q[1]);
    }
    syncButtons();
    root.classList.remove('i18n-pending');
    // script.js listens to fetch what only Japanese mode needs (MAL titles).
    try { document.dispatchEvent(new CustomEvent('kazu-langchange', { detail: { lang: current } })); } catch (e) {}
  }

  function setLang(lang) {
    if (!isLang(lang) || lang === current) return;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
    apply(lang);
  }

  api.lang = function () { return current; };
  api.setLang = setLang;

  var stored = null;
  try { stored = localStorage.getItem(STORE_KEY); } catch (e) {}
  var start = pickLang(global.location && global.location.search, stored, navLangs(global.navigator));

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-lang-set]');
    if (btn) setLang(btn.getAttribute('data-lang-set'));
  });

  if (start === 'ja') apply('ja');
  else { syncButtons(); root.classList.remove('i18n-pending'); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
