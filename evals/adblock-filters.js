#!/usr/bin/env node
/* ============================================================================
   evals/adblock-filters.js -- periodic eval: does an ad blocker hide our UI?
   ----------------------------------------------------------------------------
   Why this exists: EasyList / Fanboy's Social Blocking list ship a generic
   cosmetic rule `##.social-badge`, which uBlock Origin and Adblock Plus apply
   to EVERY site. The social tiles' logo wrapper was called `.social-badge`, so
   for those users every logo vanished and the tiles collapsed to name +
   handle (Firefox with an ad blocker; the page looked fine everywhere else).
   tests.js pins the names we know are hit; this eval checks the LIVE lists so
   the next unlucky class name is caught before a visitor sees it.

   What it does (network, no dependencies, Node 18+ for global fetch):
     1. Downloads the big public cosmetic lists (EasyList, Fanboy Social,
        Fanboy Annoyance, uBlock "annoyances").
     2. Parses their GENERIC hide rules (`##selector`, no domain prefix) whose
        selector is plain tag / .class / #id parts, plus [class*=...] style
        substring rules.
     3. Collects every class and id the page can render: attributes in
        index.html plus every `.class` / `#id` selector in style.css.
     4. Reports every rule that would hide one of them.

   Pass threshold: ZERO hits inside the Socials section (fails the run, exit
   1). Hits elsewhere on the page are listed as warnings (exit 0) because
   generic words like `.banner` or `.popup` are sometimes unavoidable, but they
   are worth a look. Run:  node evals/adblock-filters.js [folder]
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

// Optional first argument: a folder holding index.html + style.css to check
// instead of the repo root (used to prove the eval catches an old revision).
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const LISTS = [
  ['easylist', 'https://easylist.to/easylist/easylist.txt'],
  ['fanboy-social', 'https://easylist.to/easylist/fanboy-social.txt'],
  ['fanboy-annoyance', 'https://easylist.to/easylist/fanboy-annoyance.txt'],
  ['ubo-annoyances-others', 'https://ublockorigin.github.io/uAssets/filters/annoyances-others.txt'],
];

// ---- Pure helpers (exported for evals/adblock-filters.test.js) ---------------

// One generic hide rule -> { tag, classes, ids, attrs } or null when the
// selector is anything fancier than compound simple selectors (combinators,
// pseudo-classes, :has(), ...). Skipping those is deliberate: they need a full
// selector engine, and the simple ones are what actually bite (`.social-badge`).
function parseSelector(sel) {
  sel = sel.trim();
  if (!sel || /[\s>+~,:()]/.test(sel.replace(/\[[^\]]*\]/g, ''))) return null;
  const out = { tag: null, classes: [], ids: [], attrs: [] };
  let rest = sel;
  const tag = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(rest);
  if (tag) { out.tag = tag[0].toLowerCase(); rest = rest.slice(tag[0].length); }
  const re = /^(?:\.([_a-zA-Z][-_a-zA-Z0-9]*)|#([_a-zA-Z][-_a-zA-Z0-9]*)|\[\s*(class|id)\s*([*^$~|]?=)\s*["']?([^"'\]]+?)["']?\s*(?:[is])?\s*\])/;
  while (rest.length) {
    const m = re.exec(rest);
    if (!m) return null;
    if (m[1]) out.classes.push(m[1]);
    else if (m[2]) out.ids.push(m[2]);
    else out.attrs.push({ name: m[3], op: m[4], value: m[5] });
    rest = rest.slice(m[0].length);
  }
  if (!out.tag && !out.classes.length && !out.ids.length && !out.attrs.length) return null;
  return out;
}

// Adblock list text -> array of { line, selector, rule } for GENERIC hide rules
// only. `##sel` counts; `domain.com##sel`, `#@#` exceptions, `#?#`/`#$#`
// procedural rules and `##^` HTML filters do not.
function genericHideRules(text) {
  const rules = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.startsWith('##') || raw.startsWith('##^') || raw.startsWith('###+js')) return;
    const selector = raw.slice(2);
    const rule = parseSelector(selector);
    if (rule) rules.push({ line: i + 1, selector, rule });
  });
  return rules;
}

// Does the rule hide an element with this tag / class list / id?
function ruleHides(rule, el) {
  if (rule.tag && rule.tag !== el.tag) return false;
  if (!rule.classes.every((c) => el.classes.includes(c))) return false;
  if (!rule.ids.every((d) => el.id === d)) return false;
  return rule.attrs.every((a) => {
    const hay = a.name === 'id' ? [el.id || ''] : el.classes;
    const v = a.value;
    if (a.op === '=') return a.name === 'id' ? hay[0] === v : el.classes.join(' ') === v;
    if (a.op === '*=') return hay.join(' ').includes(v);
    if (a.op === '^=') return hay.join(' ').startsWith(v);
    if (a.op === '$=') return hay.join(' ').endsWith(v);
    if (a.op === '~=') return hay.includes(v);
    return false;
  });
}

// index.html -> [{ tag, classes, id, section }] one per element with a class or
// id. `section` is true inside <section class="socials-grid">...</section>.
function elementsIn(html) {
  const els = [];
  const start = html.indexOf('<section class="socials-grid">');
  const end = start === -1 ? -1 : html.indexOf('</section>', start);
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const cls = /\bclass\s*=\s*"([^"]*)"/.exec(m[2]);
    const id = /\bid\s*=\s*"([^"]*)"/.exec(m[2]);
    if (!cls && !id) continue;
    els.push({
      tag: m[1].toLowerCase(),
      classes: cls ? cls[1].split(/\s+/).filter(Boolean) : [],
      id: id ? id[1] : '',
      section: start !== -1 && m.index > start && m.index < end,
    });
  }
  return els;
}

// style.css -> synthetic single-class / single-id elements, so classes that
// script.js adds at runtime (never in index.html) are checked as well.
function cssElements(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '{}');
  const seen = new Set();
  const els = [];
  let m;
  const re = /([.#])([_a-zA-Z][-_a-zA-Z0-9]*)/g;
  while ((m = re.exec(stripped))) {
    const key = m[1] + m[2];
    if (seen.has(key)) continue;
    seen.add(key);
    els.push(m[1] === '.' ? { tag: '*', classes: [m[2]], id: '', section: /^social/.test(m[2]) }
                          : { tag: '*', classes: [], id: m[2], section: false });
  }
  return els;
}

// Tag-agnostic match for synthetic CSS elements (their tag is unknown).
// A tag-only rule (`##AD-SLOT`) says nothing about a class name, so it is only
// ever tested against real elements from index.html, never the CSS ones.
function hits(rules, els) {
  const found = [];
  rules.forEach((r) => {
    const tagOnly = !r.rule.classes.length && !r.rule.ids.length && !r.rule.attrs.length;
    els.forEach((el) => {
      if (tagOnly && el.tag === '*') return;
      const probe = el.tag === '*' ? Object.assign({}, el, { tag: r.rule.tag }) : el;
      if (ruleHides(r.rule, probe)) found.push({ selector: r.selector, line: r.line, el });
    });
  });
  return found;
}

module.exports = { parseSelector, genericHideRules, ruleHides, elementsIn, cssElements, hits };

// ---- CLI ---------------------------------------------------------------------
async function main() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const els = elementsIn(html).concat(cssElements(css));
  let bad = 0, warn = 0, fetched = 0;

  for (const [name, url] of LISTS) {
    let text;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
      fetched++;
    } catch (e) {
      console.log('SKIP  ' + name + ': could not download (' + e.message + ')');
      continue;
    }
    const rules = genericHideRules(text);
    const found = hits(rules, els);
    console.log('LIST  ' + name + ': ' + rules.length + ' generic rules parsed, ' + found.length + ' hit(s)');
    const shown = new Set();   // the same rule hits every tile; say it once
    found.forEach((h) => {
      const what = h.el.classes.length ? '.' + h.el.classes.join('.') : '#' + h.el.id;
      const key = h.selector + ' ' + what + ' ' + h.el.section;
      if (shown.has(key)) return;
      shown.add(key);
      const tag = h.el.section ? 'FAIL' : 'warn';
      if (h.el.section) bad++; else warn++;
      console.log('  ' + tag + '  ' + h.selector + '  (line ' + h.line + ')  hides ' + what + (h.el.section ? '  [socials section]' : ''));
    });
  }

  if (fetched === 0) { console.log('\nNo list could be downloaded; nothing was checked.'); process.exit(2); }
  console.log('\n' + (bad ? 'FAILED' : 'PASSED') + ': ' + bad + ' hit(s) in the Socials section, ' + warn + ' warning(s) elsewhere.');
  process.exit(bad ? 1 : 0);
}

if (require.main === module) main();
