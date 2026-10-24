/* ============================================================================
   Asset version gates: every place that names a versioned asset agrees, and
   both test runners load the same gate modules. Shared by tests.js and
   tests.html; run standalone:  node evals/asset-versions.js
   ----------------------------------------------------------------------------
   The PR #15 merge (85259ac, 24 Oct 2026) resolved its conflicts by taking
   old copies from the PR branch, and nothing failed for the version lines:
   sw.js precached script.js?v=92 and lib.js?v=44 while index.html loaded v93
   and v45 (a returning visitor's offline shell held the wrong files),
   AGENTS.md named the old versions, and tests.html loaded a deleted
   evals/phone-type.js in place of evals/fluid-layout.js (its source checks
   stopped at a ReferenceError). What is pinned:
     - every versioned asset index.html loads is in sw.js's PRECACHE at the
       same ?v=, and PRECACHE holds no other version of anything;
     - tests.html loads lib.js, site-config.js and i18n.js, and fetches
       style.css and script.js, at index.html's versions; weather-fx.js
       (never in index.html) at script.js's WEATHER_FX_SRC version;
     - AGENTS.md's "Loads ..." line names index.html's versions;
     - tests.html loads every evals/ module tests.js runs (NODE_ONLY aside),
       and nothing else from evals/;
     - (Node only) every local script and stylesheet the two pages load
       exists on disk.
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  // Run by tests.js only: they fetch the network or drive Chrome, and their
  // pure helpers are exercised in Node.
  var NODE_ONLY = ['adblock-filters.js', 'perf.js'];

  function clean(s) { return String(s || '').replace(/\r\n/g, '\n'); }
  function versioned(text, re) {
    var out = {}, m;
    while ((m = re.exec(text))) out[m[1]] = m[2];
    return out;
  }
  function list(o) { return Object.keys(o).sort().map(function (k) { return k + '?v=' + o[k]; }).join(', '); }

  // src: { html, sw, testsHtml, testsJs, script, docs, exists? (path -> bool) }
  function run(src, ok) {
    var html = clean(src.html), sw = clean(src.sw), th = clean(src.testsHtml), tj = clean(src.testsJs), script = clean(src.script), docs = clean(src.docs);

    // ---- index.html <-> sw.js ----
    var page = versioned(html, /<(?:script|link)[^>]*?(?:src|href)="([\w.-]+\.(?:js|css))\?v=(\d+)"/g);
    var pre = versioned(sw, /'\.\/([\w./-]+\.(?:js|css))\?v=(\d+)'/g);
    ok('versions: index.html loads its styles and scripts with a ?v= (style.css, lib.js, script.js among them)',
      !!(page['style.css'] && page['lib.js'] && page['script.js']), list(page));
    var missing = Object.keys(page).filter(function (k) { return pre[k] !== page[k]; });
    ok('versions: sw.js precaches every versioned asset at the version index.html loads', !missing.length,
      missing.map(function (k) { return k + ' page v' + page[k] + ', precache ' + (pre[k] ? 'v' + pre[k] : 'none'); }).join('; '));
    var stale = Object.keys(pre).filter(function (k) { return page[k] !== pre[k]; });
    ok('versions: sw.js precaches no version index.html does not load', !stale.length,
      stale.map(function (k) { return k + '?v=' + pre[k]; }).join(', '));

    // ---- tests.html ----
    var tags = versioned(th, /<script src="([\w.-]+\.js)\?v=(\d+)"/g);
    var fetched = versioned(th, /fetch\('([\w.-]+\.(?:js|css))\?v=(\d+)'/g);
    var wrong = [];
    ['lib.js', 'site-config.js', 'i18n.js'].forEach(function (k) { if (tags[k] !== page[k]) wrong.push('<script> ' + k + ' v' + tags[k] + ' vs page v' + page[k]); });
    ['style.css', 'script.js'].forEach(function (k) { if (fetched[k] !== page[k]) wrong.push('fetch ' + k + ' v' + fetched[k] + ' vs page v' + page[k]); });
    var fx = /const WEATHER_FX_SRC = 'weather-fx\.js\?v=(\d+)';/.exec(script);
    if (!fx) wrong.push('no WEATHER_FX_SRC in script.js');
    else {
      if (tags['weather-fx.js'] !== fx[1]) wrong.push('<script> weather-fx.js v' + tags['weather-fx.js'] + ' vs WEATHER_FX_SRC v' + fx[1]);
      if (fetched['weather-fx.js'] !== fx[1]) wrong.push('fetch weather-fx.js v' + fetched['weather-fx.js'] + ' vs WEATHER_FX_SRC v' + fx[1]);
    }
    ok('versions: tests.html loads and fetches the page\'s scripts and styles at the versions the page uses', !wrong.length, wrong.join('; '));

    // ---- AGENTS.md ----
    var line = /Loads `style\.css\?v=(\d+)`,\s+`lib\.js\?v=(\d+)`, `site-config\.js\?v=(\d+)`, `i18n\.js\?v=(\d+)`, `script\.js\?v=(\d+)`/.exec(docs);
    var named = line ? { 'style.css': line[1], 'lib.js': line[2], 'site-config.js': line[3], 'i18n.js': line[4], 'script.js': line[5] } : null;
    ok('versions: AGENTS.md names the versions index.html loads', !!named && Object.keys(named).every(function (k) { return named[k] === page[k]; }),
      named ? 'docs ' + list(named) + ' / page ' + list(page) : 'no "Loads `style.css?v=..`" line');

    // ---- the two runners load the same gate modules ----
    var req = versioned(tj, /require\('\.\/evals\/([\w-]+\.js)'\)()/g), loaded = versioned(th, /<script src="evals\/([\w-]+\.js)(?:\?v=\d+)?"()/g);
    var notLoaded = Object.keys(req).filter(function (k) { return NODE_ONLY.indexOf(k) === -1 && !(k in loaded); });
    var extra = Object.keys(loaded).filter(function (k) { return !(k in req); });
    ok('runners: tests.html loads every evals/ module tests.js runs (except the Node-only ' + NODE_ONLY.join(', ') + ')', !notLoaded.length, notLoaded.join(', '));
    ok('runners: tests.html loads no evals/ module tests.js does not run', !extra.length, extra.join(', '));

    // ---- files on disk ----
    if (src.exists) {
      var gone = [];
      [['index.html', html], ['tests.html', th]].forEach(function (p) {
        var re = /<(?:script|link)[^>]*?(?:src|href)="([\w./-]+\.(?:js|css))(?:\?v=\d+)?"/g, m;
        while ((m = re.exec(p[1]))) if (!src.exists(m[1])) gone.push(p[0] + ': ' + m[1]);
      });
      ok('files: every local script and stylesheet index.html and tests.html load exists', !gone.length, gone.join(', '));
    }
  }

  global.KazuAssetVersionChecks = { run: run, NODE_ONLY: NODE_ONLY };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuAssetVersionChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      var read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8'); };
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      run({ html: read('index.html'), sw: read('sw.js'), testsHtml: read('tests.html'), testsJs: read('tests.js'), script: read('script.js'), docs: read('AGENTS.md'),
        exists: function (f) { return fs.existsSync(path.join(root, f)); } }, okFn);
      console.log('Asset versions eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
