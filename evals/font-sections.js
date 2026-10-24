/* ============================================================================
   Font-size section gates: style.css "GLOBAL FONT SIZES" gives every section
   its own --<section>-big / --<section>-small pair that defaults to the two
   global knobs (--font-size-big, --font-size-small), so one value resizes the
   whole page and one pair resizes one section. Shared by tests.js and
   tests.html; run standalone:  node evals/font-sections.js
   ----------------------------------------------------------------------------
   What is pinned:
     - the two global knobs are plain px sizes in :root;
     - every section has a pair in :root that points at the matching global
       knob, and nothing in :root defines a pair for a section that does not
       exist;
     - every section named by a data-section attribute in index.html is one of
       those sections, and every section is on the page (the hero, the socials
       grid and the footer are hooked by class, which tests.js matches verbatim);
     - every "Right now"/Socials/PC/playlist/stories heading is tagged, so it
       follows its own section;
     - each section has a small rule and any big rule of a section reads only
       that section's own variable (no section can leak into another).
   Deterministic, local, no browser, no network. Zero failures is the threshold.
   ========================================================================== */
(function (global) {
  'use strict';

  // key -> how a rule names the section's own elements (see style.css).
  var SECTIONS = {
    'hero': '.hero', 'stats': '[data-section="stats"]', 'right-now': '[data-section="right-now"]',
    'discord': '[data-section="discord"]', 'steam': '[data-section="steam"]', 'anime': '[data-section="anime"]',
    'letterboxd': '[data-section="letterboxd"]', 'socials': '.socials-grid', 'pc': '[data-section="pc"]',
    'music': '[data-section="music"]', 'stories': '[data-section="stories"]', 'footer': '.meadow',
    'modal': '[data-section="modal"]'
  };
  // Sections hooked by class, not data-section (their opening tags are matched verbatim elsewhere).
  var BY_CLASS = { hero: 1, socials: 1, footer: 1 };

  function block(css) {
    css = css.replace(/\r\n/g, '\n');
    var a = css.indexOf('GLOBAL FONT SIZES');
    var b = css.indexOf('\nbody {\n  position: relative;', a);
    return a === -1 || b === -1 ? '' : css.slice(a, b);
  }

  function run(css, html, ok) {
    var blk = block(css);
    var rootM = /:root \{([\s\S]*?)\n\}/.exec(blk);
    var root = rootM ? rootM[1] : '';
    var decl = {};
    root.replace(/(--[a-z-]+):\s*([^;]+);/g, function (_, n, v) { decl[n] = v.trim(); return ''; });
    var keys = Object.keys(SECTIONS);

    ok('font sections: the block exists and its :root holds the two global knobs as px sizes',
      blk !== '' && /^\d+(\.\d+)?px$/.test(decl['--font-size-big'] || '') && /^\d+(\.\d+)?px$/.test(decl['--font-size-small'] || ''),
      JSON.stringify([decl['--font-size-big'], decl['--font-size-small']]));

    var badPairs = [];
    keys.forEach(function (k) {
      if (decl['--' + k + '-big'] !== 'var(--font-size-big)') badPairs.push('--' + k + '-big = ' + decl['--' + k + '-big']);
      if (decl['--' + k + '-small'] !== 'var(--font-size-small)') badPairs.push('--' + k + '-small = ' + decl['--' + k + '-small']);
    });
    ok('font sections: every section has a -big and -small pair that defaults to the global knob', badPairs.length === 0, badPairs.join(' | '));

    var stray = Object.keys(decl).filter(function (n) {
      var m = /^--(.+)-(big|small)$/.exec(n);
      return m && n.indexOf('--font-size-') !== 0 && keys.indexOf(m[1]) === -1;
    });
    ok('font sections: no pair is defined for a section that does not exist', stray.length === 0, stray.join(' | '));

    var tagged = [], re = /data-section="([^"]+)"/g, m;
    while ((m = re.exec(html))) if (tagged.indexOf(m[1]) === -1) tagged.push(m[1]);
    var unknown = tagged.filter(function (t) { return keys.indexOf(t) === -1; });
    ok('font sections: every data-section on the page is a known section', unknown.length === 0 && tagged.length > 0, unknown.join(' | '));

    var missing = keys.filter(function (k) {
      return BY_CLASS[k] ? html.indexOf('class="' + SECTIONS[k].replace(/^\./, '')) === -1 && html.indexOf(SECTIONS[k].replace(/^\./, '')) === -1
        : tagged.indexOf(k) === -1;
    });
    ok('font sections: every section is on the page', missing.length === 0, missing.join(' | '));

    var h2s = html.match(/<h2 class="section-title[^>]*>/g) || [];
    var untagged = h2s.filter(function (t) { return t.indexOf('data-section="') === -1; });
    ok('font sections: every section heading is tagged, so it follows its own section', h2s.length >= 5 && untagged.length === 0, untagged.join(' | '));

    var rules = [], rr = /([^{}]+)\{([^{}]*)\}/g, x;
    var body = blk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[\s\S]*?\n\}\n/, '');
    while ((x = rr.exec(body))) rules.push({ sel: x[1].trim(), body: x[2] });
    var noSmall = [], leaks = [], notImportant = [];
    keys.forEach(function (k) {
      var own = rules.filter(function (r) { return r.body.indexOf('--' + k + '-') !== -1; });
      if (!own.some(function (r) { return r.body.indexOf('var(--' + k + '-small)') !== -1; })) noSmall.push(k);
      own.forEach(function (r) { if (!/!important/.test(r.body)) notImportant.push(k); });
    });
    rules.forEach(function (r) {
      var v = /var\(--([a-z-]+?)-(big|small)\)/.exec(r.body);
      if (!v || v[1] === 'font-size') return;
      var base = SECTIONS[v[1]];
      r.sel.split(',').forEach(function (s) {
        s = s.trim();
        var head = s.replace(/^h2/, '');
        if (head.indexOf(base) !== 0 && head.indexOf('[data-section="' + v[1] + '"]') !== 0) leaks.push(v[1] + ' var on "' + s + '"');
      });
    });
    ok('font sections: every section has a small rule', noSmall.length === 0, noSmall.join(' | '));
    ok('font sections: each rule reads only its own section\'s variable and selects only that section', leaks.length === 0 && rules.length >= keys.length * 2, leaks.slice(0, 5).join(' | '));
    ok('font sections: the rules are !important, so they beat the component and media-query sizes', notImportant.length === 0, notImportant.join(' | '));
  }

  var api = { run: run, SECTIONS: SECTIONS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      var pass = 0, fail = 0;
      var okFn = function (name, value, detail) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name + (value ? '' : ': ' + detail)); };
      run(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), fs.readFileSync(path.join(root, 'index.html'), 'utf8'), okFn);
      console.log('Font sections eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  } else {
    global.KazuFontSections = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
