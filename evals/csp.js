/* Gate assertions for the Content-Security-Policy in index.html.
   The policy (a <meta http-equiv> at the top of <head>) lets a script run only
   if it comes from this origin or is one of the inline scripts whose SHA-256 it
   lists. A planted <script>, an onclick="..." attribute or a javascript: link
   is then blocked by the browser even if a future bug lets one into the page.
   The price: editing an inline script changes its hash, and the browser blocks
   it until the policy is updated. This file is the guard. It hashes every
   inline script the way the browser does (line endings normalised to LF, as
   the HTML parser does, then SHA-256 over UTF-8) and fails, naming the script
   and its new hash, the moment one drifts.
     Fix a drift:  node evals/csp.js --fix   (rewrites the hashes in index.html)
   Shared by tests.js and tests.html; standalone: node evals/csp.js.
   Zero failures is the pass threshold. */
(function (global) {
  'use strict';

  var META_RE = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;
  // Comments are matched first so a <script> inside one is skipped, and a
  // script's own text is consumed whole so '<!--' inside it is not a comment.
  var TOKEN_RE = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  var JS_TYPES = ['', 'text/javascript', 'application/javascript', 'module'];

  function lineOf(html, index) { return html.slice(0, index).split('\n').length; }

  // Every inline <script> the browser would run: no src, and a JavaScript type
  // (JSON-LD and other data blocks never run, so CSP ignores them).
  function inlineScripts(html) {
    var out = [], m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(html))) {
      if (m[1] === undefined) continue; // a comment
      var attrs = m[1];
      if (/\ssrc\s*=/.test(' ' + attrs)) continue;
      var type = (/\stype\s*=\s*"([^"]*)"/.exec(' ' + attrs) || [])[1];
      if (JS_TYPES.indexOf(String(type || '').trim().toLowerCase()) === -1) continue;
      out.push({
        id: (/\sid\s*=\s*"([^"]*)"/.exec(' ' + attrs) || [])[1] || '',
        line: lineOf(html, m.index),
        text: m[2].replace(/\r\n?/g, '\n')
      });
    }
    return out;
  }

  function stripComments(html) { return html.replace(/<!--[\s\S]*?-->/g, ''); }

  function parsePolicy(content) {
    var out = {};
    String(content || '').split(';').forEach(function (part) {
      var words = part.trim().split(/\s+/).filter(Boolean);
      if (words.length) out[words[0].toLowerCase()] = words.slice(1);
    });
    return out;
  }

  // The script-src the policy should carry: 'self' plus every inline script's
  // hash, in document order.
  function expectedScriptSrc(html, sha256) {
    return ["'self'"].concat(inlineScripts(html).map(function (s) { return "'sha256-" + sha256(s.text) + "'"; }));
  }

  function run(html, shipped, sha256, ok, eq) {
    var plain = stripComments(html);
    var metas = plain.match(new RegExp(META_RE.source, 'g')) || [];
    eq('csp: index.html carries exactly one policy meta', metas.length, 1);
    var meta = META_RE.exec(plain);
    var policy = parsePolicy(meta && meta[1]);
    var firstScript = plain.search(/<script\b/i);
    ok('csp: the policy sits above every <script> (a meta policy only covers what follows it)', !!meta && firstScript !== -1 && plain.indexOf(meta[0]) < firstScript);

    var src = policy['script-src'] || [];
    ok("csp: script-src allows 'self'", src.indexOf("'self'") !== -1, src.join(' '));
    eq("csp: script-src holds only 'self' and sha256 hashes (no unsafe-inline, unsafe-eval, unsafe-hashes, hosts or schemes)",
      src.filter(function (w) { return w !== "'self'" && !/^'sha256-[A-Za-z0-9+\/]{43}='$/.test(w); }), []);
    eq("csp: object-src is 'none'", policy['object-src'], ["'none'"]);
    eq("csp: base-uri is 'self'", policy['base-uri'], ["'self'"]);
    eq('csp: no directive a meta policy ignores (frame-ancestors, report-uri, sandbox)',
      Object.keys(policy).filter(function (k) { return ['frame-ancestors', 'report-uri', 'sandbox'].indexOf(k) !== -1; }), []);

    // The drift guard. Each mismatch names the script and the hash it needs.
    var scripts = inlineScripts(html);
    ok('csp: index.html still has its inline boot scripts', scripts.length >= 5, scripts.length);
    eq('csp: every inline script has an id (so a drift names it)',
      scripts.filter(function (s) { return !s.id; }).map(function (s) { return 'line ' + s.line; }), []);
    var want = scripts.map(function (s) { return { name: '#' + s.id + ' (line ' + s.line + ')', hash: "'sha256-" + sha256(s.text) + "'" }; });
    eq('csp: every inline script hash is in script-src (if not: node evals/csp.js --fix)',
      want.filter(function (w) { return src.indexOf(w.hash) === -1; }).map(function (w) { return w.name + ' needs ' + w.hash; }), []);
    var wanted = want.map(function (w) { return w.hash; });
    eq('csp: no stale hash left in script-src (if not: node evals/csp.js --fix)',
      src.filter(function (w) { return w !== "'self'" && wanted.indexOf(w) === -1; }), []);

    // What the policy is there to stop must not be in the page itself, or the
    // browser would block the site's own markup.
    var markup = plain.replace(TOKEN_RE, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    eq('csp: no inline event handler attribute (onload=, onerror=, onclick=...) in index.html',
      (markup.match(/<[a-zA-Z][^>]*?\son[a-z]+\s*=/g) || []).map(function (t) { return t.slice(0, 80); }), []);
    eq('csp: no javascript: URL in index.html', (markup.match(/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi) || []), []);
    eq('csp: every external script is same-origin (script-src allows no other host)',
      (plain.match(/<script\b[^>]*\ssrc="([^"]*)"/g) || []).filter(function (t) { return /src="(?:[a-z]+:|\/\/)/i.test(t); }), []);

    // The JavaScript the page runs must not need what the policy forbids.
    shipped.forEach(function (f) {
      var code = f.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
      eq('csp: ' + f.name + ' never needs eval, new Function, string timers, inline handlers or javascript: URLs',
        code.match(/\beval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\(\s*['"`]|setAttribute\(\s*['"]on|['"`]javascript:/g) || [], []);
    });
    var fx = shipped.filter(function (f) { return f.name === 'script.js'; })[0];
    if (fx) ok('csp: the one script script.js injects (weather-fx.js) is a same-origin relative path', /const WEATHER_FX_SRC = '[A-Za-z0-9_-]+\.js\?v=\d+';/.test(fx.text));

    // The two handlers that left the markup still exist, in the hashed script.
    var handlers = scripts.filter(function (s) { return s.id === 'boot-handlers'; })[0];
    ok('csp: #boot-handlers flips the font stylesheets to all media on load', !!handlers && handlers.text.indexOf("t.hasAttribute('data-font')) t.media = 'all'") !== -1);
    ok('csp: #boot-handlers hides a music cover that fails to load', !!handlers && handlers.text.indexOf("t.classList.contains('music-cover')) t.style.display = 'none'") !== -1);
    // The <noscript> copies stay plain render-blocking links on purpose.
    var fontLinks = plain.replace(/<noscript>[\s\S]*?<\/noscript>/g, '').match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g) || [];
    ok('csp: both font links load as print and are marked data-font, and #boot-handlers comes before them',
      fontLinks.length === 2 && fontLinks.every(function (l) { return / media="print" data-font>$/.test(l); }) &&
      plain.indexOf('<script id="boot-handlers">') !== -1 && plain.indexOf('<script id="boot-handlers">') < plain.indexOf(fontLinks[0]));
  }

  global.KazuCspChecks = { run: run, inlineScripts: inlineScripts, parsePolicy: parsePolicy, expectedScriptSrc: expectedScriptSrc };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuCspChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), crypto = require('crypto'), root = path.join(__dirname, '..');
      var sha256 = function (t) { return crypto.createHash('sha256').update(t, 'utf8').digest('base64'); };
      var file = path.join(root, 'index.html');
      var html = fs.readFileSync(file, 'utf8');
      if (process.argv.indexOf('--fix') !== -1) {
        var m = META_RE.exec(html);
        if (!m) { console.log('No Content-Security-Policy meta in index.html: nothing to fix.'); process.exitCode = 1; return; }
        var parts = m[1].split(';').map(function (p) { return p.trim(); });
        var next = parts.map(function (p) { return /^script-src\s/i.test(p) || p === 'script-src' ? 'script-src ' + expectedScriptSrc(html, sha256).join(' ') : p; }).join('; ');
        if (next === m[1]) console.log('CSP hashes already match every inline script.');
        else { fs.writeFileSync(file, html.replace(m[0], m[0].replace(m[1], next))); console.log('Rewrote script-src in index.html: ' + inlineScripts(html).map(function (s) { return '#' + s.id; }).join(', ')); }
        return;
      }
      var pass = 0, fail = 0;
      function ok(name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ' → ' + JSON.stringify(detail))); }
      function eq(name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected), { got: actual, expected: expected }); }
      var shipped = ['lib.js', 'site-config.js', 'i18n.js', 'script.js', 'weather-fx.js', 'sw.js'].map(function (name) {
        return { name: name, text: fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n') };
      });
      run(html, shipped, sha256, ok, eq);
      console.log('CSP eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
