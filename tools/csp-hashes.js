/* Keeps the Content-Security-Policy in index.html in step with its inline scripts.
   The policy (a <meta http-equiv> at the top of <head>) lets an inline script
   run only if its SHA-256 is listed in script-src. Editing #boot-control,
   #boot-tint, #boot-cards, #boot-handlers, #boot-lang, #boot-power or
   #sw-register changes the hash, and the browser then refuses to run it.
     node tools/csp-hashes.js          check: exit 1 if any hash is missing or stale
     node tools/csp-hashes.js --fix    rewrite script-src in index.html
   Hashing matches the browser: line endings to LF, then SHA-256 over UTF-8. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'index.html');
const META_RE = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)">/;
// Comments are matched first so a <script> inside one is skipped.
const TOKEN_RE = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const JS_TYPES = ['', 'text/javascript', 'application/javascript', 'module'];

function inlineScripts(html) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(html))) {
    if (m[1] === undefined) continue; // a comment
    if (/\ssrc\s*=/.test(' ' + m[1])) continue;
    const type = (/\stype\s*=\s*"([^"]*)"/.exec(' ' + m[1]) || [])[1];
    if (!JS_TYPES.includes(String(type || '').trim().toLowerCase())) continue; // JSON-LD never runs
    out.push({ id: (/\sid\s*=\s*"([^"]*)"/.exec(' ' + m[1]) || [])[1] || '(no id)', text: m[2].replace(/\r\n?/g, '\n') });
  }
  return out;
}

const hash = (t) => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";

const html = fs.readFileSync(FILE, 'utf8');
const meta = META_RE.exec(html);
if (!meta) { console.error('No Content-Security-Policy meta in index.html'); process.exit(1); }

const scripts = inlineScripts(html);
const want = ["'self'"].concat(scripts.map((s) => hash(s.text)));
const parts = meta[1].split(';').map((p) => p.trim());
const current = (parts.find((p) => /^script-src(\s|$)/i.test(p)) || '').split(/\s+/).slice(1);

const missing = scripts.filter((s) => !current.includes(hash(s.text))).map((s) => '#' + s.id);
const stale = current.filter((w) => !want.includes(w));

if (process.argv.includes('--fix')) {
  const next = parts.map((p) => (/^script-src(\s|$)/i.test(p) ? 'script-src ' + want.join(' ') : p)).join('; ');
  if (next === meta[1]) console.log('CSP hashes already match every inline script.');
  else {
    fs.writeFileSync(FILE, html.replace(meta[0], meta[0].replace(meta[1], next)));
    console.log('Rewrote script-src in index.html for: ' + scripts.map((s) => '#' + s.id).join(', '));
  }
} else if (missing.length || stale.length) {
  if (missing.length) console.error('Inline scripts without a hash in script-src: ' + missing.join(', '));
  if (stale.length) console.error('Stale hashes in script-src: ' + stale.length);
  console.error('Run: node tools/csp-hashes.js --fix');
  process.exit(1);
} else {
  console.log('CSP OK: ' + scripts.length + ' inline scripts, all hashed.');
}
