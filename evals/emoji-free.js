/* Shared deterministic gates for emoji-free authored and live content.
   Standalone: node evals/emoji-free.js. Zero failures is the pass threshold. */
(function (global) {
  'use strict';
  function run(L, source, authored, ok, eq) {
    var cases = [
      ['Hello \u{1F44B}\u{1F3FD}', 'Hello '],
      ['Family \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', 'Family '],
      ['UK \u{1F1EC}\u{1F1E7}', 'UK '], ['1\uFE0F\u20E3', ''],
      ['Kazu | ハニ \u{1F35C}', 'Kazu | ハニ '],
      ['32 GB, 13°C, ★★★½, →, #1', '32 GB, 13°C, ★★★½, →, #1'],
      [null, ''], [123, '123']
    ];
    var section = source.slice(source.indexOf('  const stripEmoji ='), source.indexOf('  function cleanEmojiText'));
    var fallback = new Function('KazuLib', section + '\nreturn stripEmoji;')(null);
    cases.forEach(function (c, i) {
      eq('emoji-free text case ' + i, L.stripEmoji(c[0]), c[1]);
      eq('emoji-free fallback case ' + i, fallback(c[0]), c[1]);
    });
    var cleanerSource = source.slice(source.indexOf('  function cleanEmojiText'), source.indexOf('  cleanEmojiText(document.body);'));
    var clean = new Function('stripEmoji', cleanerSource + '\nreturn cleanEmojiText;')(L.stripEmoji);
    var node = { nodeType: 3, nodeValue: 'Live \u{1F35C}', parentElement: { closest: function () { return null; } } };
    clean(node);
    eq('live API text is cleaned', node.nodeValue, 'Live ');
    var attrs = { alt: 'Artist \u{1F3B5}', title: 'Track \u{1F3B5}', 'aria-label': 'Play \u{1F3B5}' };
    var element = { nodeType: 1, childNodes: [node], getAttribute: function (key) { return attrs[key] || null; }, setAttribute: function (key, value) { attrs[key] = value; } };
    clean(element);
    eq('live accessible labels are cleaned', attrs, { alt: 'Artist ', title: 'Track ', 'aria-label': 'Play ' });
    node.parentElement.closest = function () { return {}; }; node.nodeValue = 'Script \u{1F35C}'; clean(node);
    eq('cleaning never alters script/style source', node.nodeValue, 'Script \u{1F35C}');
    authored.forEach(function (file) {
      eq('authored page has no emoji: ' + file.name, L.stripEmoji(file.text), file.text);
    });
    ok('offline banner uses the requested wording', source.indexOf("? 'Currently offline'") !== -1 && source.indexOf('catch me later') === -1);
    ok('Discord custom emoji images are never fetched', source.indexOf('cdn.discordapp.com/emojis/') === -1);
    ok('live text and accessible labels are cleaned when changed', source.indexOf('record.addedNodes.forEach(cleanEmojiText)') !== -1 && source.indexOf("attributeFilter: ['alt', 'title', 'aria-label']") !== -1);
  }
  global.KazuEmojiChecks = { run: run };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.KazuEmojiChecks;
    if (require.main === module) {
      var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
      require(path.join(root, 'lib.js'));
      var pass = 0, fail = 0;
      function ok(name, value) { value ? pass++ : fail++; console.log((value ? 'PASS ' : 'FAIL ') + name); }
      function eq(name, actual, expected) { ok(name, JSON.stringify(actual) === JSON.stringify(expected)); }
      var source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
      var files = ['index.html', 'script.js', 'style.css', '404.html', 'site.webmanifest'].map(function (name) { return { name: name, text: fs.readFileSync(path.join(root, name), 'utf8') }; });
      run(global.KazuLib, source, files, ok, eq);
      console.log('Emoji-free eval: ' + pass + ' passed, ' + fail + ' failed');
      process.exitCode = fail ? 1 : 0;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
