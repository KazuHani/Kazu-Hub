// Contract for site-config.json, shared by the Kazu Hub site and its control panel.
// This file is copied byte for byte into both projects (npm run sync-site), so edit
// it in the control panel project only. It runs in browsers and Node: no DOM access.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KazuSiteConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA = 1;

  var SECTION_KEYS = ['quote', 'rightNow', 'socials', 'pc', 'playlist', 'stories'];
  var TITLE_KEYS = ['rightNow', 'socials', 'pc', 'playlist', 'stories'];
  var SEASON_KEYS = ['birthday', 'christmas', 'pride', 'sakura', 'halloween'];
  var BUILTIN_SOCIALS = ['x', 'instagram', 'youtube', 'reddit', 'tiktok', 'mal', 'letterboxd'];
  var TONES = ['info', 'good', 'warn'];
  var MANAGED_KEYS = ['notice', 'sections', 'titles', 'seasons', 'effects', 'footer', 'integrations', 'socials', 'playlist', 'stories', 'pc'];
  var KNOWN_KEYS = ['schema', 'updatedAt'].concat(MANAGED_KEYS);

  var LIMITS = {
    noticeText: 200, noticeLink: 40, title: 40, credit: 80,
    socials: 16, socialName: 24, socialHandle: 40, socialMark: 4,
    stories: 12, storyTitle: 60, storyDesc: 220, storyCta: 24,
    playlistName: 60, playlistSub: 60,
    pcRows: 8, pcShort: 40, pcLabel: 30, pcValue: 80, pcSize: 16, pcMarkTop: 24, pcMarkBottom: 12,
    steamName: 40, url: 2048
  };

  var ID_PATTERNS = {
    discordUserId: /^\d{17,20}$/,
    steamVanity: /^[A-Za-z0-9_-]{2,32}$/,
    malUser: /^[A-Za-z0-9_-]{2,16}$/,
    letterboxdUser: /^[A-Za-z0-9_]{2,15}$/,
    playlistId: /^[A-Za-z0-9_-]{10,64}$/,
    socialId: /^[a-z0-9][a-z0-9-]{0,23}$/
  };

  var EMOJI_RE = null;
  try {
    EMOJI_RE = new RegExp('[#*0-9]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{1,2}|\\p{Extended_Pictographic}(?:[\\uFE0E\\uFE0F]|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:[\\uFE0E\\uFE0F]|\\p{Emoji_Modifier})?)*[\\u{E0020}-\\u{E007F}]*|\\p{Emoji_Modifier}|[\\uFE0E\\uFE0F]', 'gu');
  } catch (e) { EMOJI_RE = null; }

  // Zero-width and bidi override characters can disguise a link or a name.
  var HIDDEN_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

  function Ctx(strict) { this.strict = !!strict; this.problems = []; }
  Ctx.prototype.add = function (path, level, code, message) {
    this.problems.push({ path: path, level: level, code: code, message: message });
  };
  Ctx.prototype.error = function (path, code, message) { this.add(path, 'error', code, message); };
  Ctx.prototype.warn = function (path, code, message) { this.add(path, 'warn', code, message); };

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function checkKeys(ctx, path, obj, allowed) {
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) ctx.warn(join(path, k), 'unknown-key', 'The setting "' + k + '" is not used and was ignored.');
    });
  }

  function join(path, key) { return path ? path + '.' + key : key; }

  // Returns the cleaned string, or null when the value cannot be used.
  function text(ctx, path, value, max, opts) {
    opts = opts || {};
    if (value === undefined || value === null) {
      if (opts.required) { ctx.error(path, 'required', 'This is required.'); return null; }
      return opts.fallback === undefined ? '' : opts.fallback;
    }
    if (typeof value !== 'string') { ctx.error(path, 'type', 'This needs to be text.'); return null; }
    var s = value;
    if (s.normalize) s = s.normalize('NFC');
    var before = s;
    s = s.replace(HIDDEN_RE, '');
    if (s !== before) ctx.warn(path, 'hidden-chars', 'Hidden formatting characters were removed.');
    if (EMOJI_RE) {
      before = s;
      s = s.replace(EMOJI_RE, '');
      if (s !== before) ctx.warn(path, 'emoji', 'Emoji were removed because the site shows none.');
    }
    s = s.replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (!s) {
      if (opts.required) { ctx.error(path, 'required', 'This is required.'); return null; }
      return opts.fallback === undefined ? '' : opts.fallback;
    }
    if (s.length > max) {
      if (ctx.strict) { ctx.error(path, 'too-long', 'Keep this to ' + max + ' characters or fewer (now ' + s.length + ').'); return null; }
      ctx.warn(path, 'truncated', 'This was shortened to ' + max + ' characters.');
      s = s.slice(0, max).replace(/ $/, '');
    }
    return s;
  }

  function bool(ctx, path, value, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'boolean') { ctx.error(path, 'type', 'This needs to be on or off.'); return fallback; }
    return value;
  }

  function pick(ctx, path, value, allowed, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
      ctx.error(path, 'choice', 'Choose one of: ' + allowed.join(', ') + '.');
      return fallback;
    }
    return value;
  }

  // https links only, no embedded credentials. Returns the normalised href or null.
  function httpsUrl(ctx, path, value, opts) {
    opts = opts || {};
    if (value === undefined || value === null || value === '') {
      if (opts.required) { ctx.error(path, 'required', 'This is required.'); return null; }
      return '';
    }
    if (typeof value !== 'string') { ctx.error(path, 'type', 'This needs to be a link.'); return null; }
    var s = value.replace(HIDDEN_RE, '').replace(/^\s+|\s+$/g, '');
    if (!s) {
      if (opts.required) { ctx.error(path, 'required', 'This is required.'); return null; }
      return '';
    }
    if (s.length > LIMITS.url) { ctx.error(path, 'too-long', 'This link is too long.'); return null; }
    if (/\s/.test(s)) { ctx.error(path, 'url-invalid', 'Links cannot contain spaces.'); return null; }
    var u;
    try { u = new URL(s); } catch (e) { ctx.error(path, 'url-invalid', 'Enter a full link that starts with https://'); return null; }
    if (u.protocol !== 'https:') { ctx.error(path, 'url-scheme', 'Only https:// links are allowed.'); return null; }
    if (u.username || u.password) { ctx.error(path, 'url-credentials', 'Links cannot contain a username or password.'); return null; }
    if (!u.hostname || u.hostname.indexOf('.') === -1) { ctx.error(path, 'url-invalid', 'Enter a full link that starts with https://'); return null; }
    return u.href;
  }

  function assetPath(ctx, path, value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || !/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif|avif|svg)$/.test(value) || /(^|\/)\.+(\/|$)/.test(value)) {
      ctx.error(path, 'asset-path', 'Use an image from the site\'s assets folder, like assets/Sisu.jpg.');
      return null;
    }
    return value;
  }

  function hexColor(ctx, path, value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
      ctx.error(path, 'color', 'Use a six digit hex color like #5cc6ff.');
      return fallback;
    }
    return value.toLowerCase();
  }

  function isoDate(ctx, path, value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || isNaN(Date.parse(value))) {
      ctx.error(path, 'date', 'Use a date and time like 2026-10-10T19:00:00Z.');
      return null;
    }
    return new Date(Date.parse(value)).toISOString();
  }

  function idField(ctx, path, value, pattern, message) {
    if (value === undefined || value === null || value === '') { ctx.error(path, 'required', 'This is required.'); return null; }
    if (typeof value !== 'string' || !pattern.test(value)) { ctx.error(path, 'id-format', message); return null; }
    return value;
  }

  function list(ctx, path, value, max) {
    if (!Array.isArray(value)) { ctx.error(path, 'type', 'This needs to be a list.'); return null; }
    if (value.length > max) {
      ctx.error(path, 'count-max', 'Up to ' + max + ' items are allowed.');
      return value.slice(0, max);
    }
    return value;
  }

  function section(ctx, path, value) {
    if (!isPlainObject(value)) { ctx.error(path, 'type', 'This section is not in the expected format and was ignored.'); return null; }
    return value;
  }

  // ---- sections ----------------------------------------------------------

  function normNotice(ctx, raw) {
    var o = section(ctx, 'notice', raw); if (!o) return undefined;
    checkKeys(ctx, 'notice', o, ['enabled', 'text', 'linkText', 'linkUrl', 'tone', 'startsAt', 'endsAt', 'dismissible']);
    var enabled = bool(ctx, 'notice.enabled', o.enabled, false);
    var t = text(ctx, 'notice.text', o.text, LIMITS.noticeText, { required: enabled });
    var linkText = text(ctx, 'notice.linkText', o.linkText, LIMITS.noticeLink);
    var linkUrl = httpsUrl(ctx, 'notice.linkUrl', o.linkUrl);
    if (linkText === null) linkText = '';
    if (linkUrl === null) linkUrl = '';
    if (linkUrl && !linkText) ctx.error('notice.linkText', 'required', 'Add the words for the link, or clear the link address.');
    if (linkText && !linkUrl) { ctx.warn('notice.linkUrl', 'link-incomplete', 'The link words need a link address, so no link will show.'); linkText = ''; }
    var startsAt = isoDate(ctx, 'notice.startsAt', o.startsAt);
    var endsAt = isoDate(ctx, 'notice.endsAt', o.endsAt);
    if (startsAt === null) startsAt = '';
    if (endsAt === null) endsAt = '';
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) ctx.error('notice.endsAt', 'range', 'The end must come after the start.');
    return {
      enabled: enabled,
      text: t === null ? '' : t,
      linkText: linkText,
      linkUrl: linkUrl,
      tone: pick(ctx, 'notice.tone', o.tone, TONES, 'info'),
      startsAt: startsAt,
      endsAt: endsAt,
      dismissible: bool(ctx, 'notice.dismissible', o.dismissible, true)
    };
  }

  function normFlags(ctx, path, raw, keys) {
    var o = section(ctx, path, raw); if (!o) return undefined;
    checkKeys(ctx, path, o, keys);
    var out = {};
    keys.forEach(function (k) {
      if (!has(o, k)) return;
      if (typeof o[k] !== 'boolean') { ctx.error(join(path, k), 'type', 'This needs to be on or off.'); return; }
      out[k] = o[k];
    });
    return out;
  }

  function normTitles(ctx, raw) {
    var o = section(ctx, 'titles', raw); if (!o) return undefined;
    checkKeys(ctx, 'titles', o, TITLE_KEYS);
    var out = {};
    TITLE_KEYS.forEach(function (k) {
      if (!has(o, k)) return;
      var t = text(ctx, join('titles', k), o[k], LIMITS.title, { required: true });
      if (t !== null) out[k] = t;
    });
    return out;
  }

  function normSeasons(ctx, raw) {
    var o = section(ctx, 'seasons', raw); if (!o) return undefined;
    checkKeys(ctx, 'seasons', o, SEASON_KEYS);
    var out = {};
    SEASON_KEYS.forEach(function (k) {
      if (!has(o, k)) return;
      out[k] = pick(ctx, join('seasons', k), o[k], ['auto', 'on', 'off'], 'auto');
    });
    return out;
  }

  function normFooter(ctx, raw) {
    var o = section(ctx, 'footer', raw); if (!o) return undefined;
    checkKeys(ctx, 'footer', o, ['credit']);
    var out = {};
    if (has(o, 'credit')) {
      var c = text(ctx, 'footer.credit', o.credit, LIMITS.credit, { required: true });
      if (c !== null) out.credit = c;
    }
    return out;
  }

  function normIntegrations(ctx, raw) {
    var o = section(ctx, 'integrations', raw); if (!o) return undefined;
    checkKeys(ctx, 'integrations', o, ['discord', 'steam', 'mal', 'letterboxd']);
    var out = {};
    var specs = {
      discord: [['userId', 'discordUserId', 'Discord user IDs are 17 to 20 digits.']],
      steam: [['vanity', 'steamVanity', 'Steam profile names use 2 to 32 letters, numbers, dashes or underscores.']],
      mal: [['user', 'malUser', 'MyAnimeList usernames use 2 to 16 letters, numbers, dashes or underscores.']],
      letterboxd: [['user', 'letterboxdUser', 'Letterboxd usernames use 2 to 15 letters, numbers or underscores.']]
    };
    Object.keys(specs).forEach(function (name) {
      if (!has(o, name)) return;
      var p = 'integrations.' + name;
      var s = section(ctx, p, o[name]); if (!s) return;
      var allowed = ['enabled', 'displayName'].concat(specs[name].map(function (f) { return f[0]; }));
      checkKeys(ctx, p, s, name === 'steam' ? allowed : allowed.filter(function (k) { return k !== 'displayName'; }));
      var item = { enabled: bool(ctx, p + '.enabled', s.enabled, true) };
      var ok = true;
      specs[name].forEach(function (f) {
        var v = idField(ctx, p + '.' + f[0], s[f[0]], ID_PATTERNS[f[1]], f[2]);
        if (v === null) ok = false; else item[f[0]] = v;
      });
      if (name === 'steam' && has(s, 'displayName')) {
        var dn = text(ctx, p + '.displayName', s.displayName, LIMITS.steamName);
        if (dn) item.displayName = dn;
      }
      if (ok) out[name] = item;
    });
    return out;
  }

  function normSocials(ctx, raw) {
    var arr = list(ctx, 'socials', raw, LIMITS.socials); if (!arr) return undefined;
    var out = [], seen = {};
    arr.forEach(function (it, i) {
      var p = 'socials[' + i + ']';
      var s = section(ctx, p, it); if (!s) return;
      checkKeys(ctx, p, s, ['id', 'name', 'handle', 'url', 'colorA', 'colorB', 'mark']);
      var id = typeof s.id === 'string' && ID_PATTERNS.socialId.test(s.id) ? s.id : null;
      if (!id) { ctx.error(p + '.id', 'id-format', 'Ids use lowercase letters, numbers and dashes, up to 24 characters.'); return; }
      if (seen[id]) { ctx.error(p + '.id', 'duplicate-id', 'Another social already uses this id.'); return; }
      var name = text(ctx, p + '.name', s.name, LIMITS.socialName, { required: true });
      var handle = text(ctx, p + '.handle', s.handle, LIMITS.socialHandle);
      var url = httpsUrl(ctx, p + '.url', s.url, { required: true });
      if (name === null || url === null) return;
      seen[id] = true;
      var item = { id: id, name: name, handle: handle === null ? '' : handle, url: url };
      if (BUILTIN_SOCIALS.indexOf(id) === -1) {
        item.colorA = hexColor(ctx, p + '.colorA', s.colorA, '#7c5cff');
        item.colorB = hexColor(ctx, p + '.colorB', s.colorB, '#4a34b8');
        var mark = text(ctx, p + '.mark', s.mark, LIMITS.socialMark);
        item.mark = mark || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?';
      }
      out.push(item);
    });
    return out;
  }

  function normPlaylist(ctx, raw) {
    var o = section(ctx, 'playlist', raw); if (!o) return undefined;
    checkKeys(ctx, 'playlist', o, ['name', 'sub', 'playlistId', 'cover']);
    var id = idField(ctx, 'playlist.playlistId', o.playlistId, ID_PATTERNS.playlistId, 'A YouTube playlist id looks like PLxxxxxxxxxxxxxxxx.');
    var name = text(ctx, 'playlist.name', o.name, LIMITS.playlistName, { required: true });
    var sub = text(ctx, 'playlist.sub', o.sub, LIMITS.playlistSub);
    var cover = assetPath(ctx, 'playlist.cover', o.cover);
    if (id === null || name === null) return undefined;
    return { name: name, sub: sub === null ? '' : sub, playlistId: id, cover: cover === null ? '' : cover };
  }

  function normStories(ctx, raw) {
    var arr = list(ctx, 'stories', raw, LIMITS.stories); if (!arr) return undefined;
    var out = [];
    arr.forEach(function (it, i) {
      var p = 'stories[' + i + ']';
      var s = section(ctx, p, it); if (!s) return;
      checkKeys(ctx, p, s, ['title', 'desc', 'url', 'cta', 'colors']);
      var title = text(ctx, p + '.title', s.title, LIMITS.storyTitle, { required: true });
      var desc = text(ctx, p + '.desc', s.desc, LIMITS.storyDesc);
      var url = httpsUrl(ctx, p + '.url', s.url, { required: true });
      var cta = text(ctx, p + '.cta', s.cta, LIMITS.storyCta, { fallback: 'Read now' });
      var colors = ['#7c1d2b', '#b3324a', '#d9536b'];
      if (s.colors !== undefined && s.colors !== null) {
        if (!Array.isArray(s.colors) || s.colors.length !== 3) ctx.error(p + '.colors', 'color', 'Give three colors: dark, middle and light.');
        else colors = s.colors.map(function (c, j) { return hexColor(ctx, p + '.colors[' + j + ']', c, colors[j]); });
      }
      if (title === null || url === null) return;
      out.push({ title: title, desc: desc === null ? '' : desc, url: url, cta: cta === null ? 'Read now' : cta, colors: colors });
    });
    return out;
  }

  function rows(ctx, path, raw, keyA, keyB, maxA, maxB) {
    var arr = list(ctx, path, raw, LIMITS.pcRows); if (!arr) return undefined;
    var out = [];
    arr.forEach(function (it, i) {
      var p = path + '[' + i + ']';
      var s = section(ctx, p, it); if (!s) return;
      checkKeys(ctx, p, s, [keyA, keyB]);
      var a = text(ctx, p + '.' + keyA, s[keyA], maxA, { required: true });
      var b = text(ctx, p + '.' + keyB, s[keyB], maxB, { required: true });
      if (a !== null && b !== null) { var r = {}; r[keyA] = a; r[keyB] = b; out.push(r); }
    });
    return out;
  }

  function normPc(ctx, raw) {
    var o = section(ctx, 'pc', raw); if (!o) return undefined;
    checkKeys(ctx, 'pc', o, ['graphics', 'platform', 'storage', 'build']);
    var out = {};
    if (has(o, 'graphics')) {
      var g = section(ctx, 'pc.graphics', o.graphics);
      if (g) {
        checkKeys(ctx, 'pc.graphics', g, ['maker', 'brand', 'model', 'markTop', 'markBottom']);
        var model = text(ctx, 'pc.graphics.model', g.model, LIMITS.pcShort, { required: true });
        var maker = text(ctx, 'pc.graphics.maker', g.maker, LIMITS.pcShort);
        var brand = text(ctx, 'pc.graphics.brand', g.brand, LIMITS.pcShort);
        var top = text(ctx, 'pc.graphics.markTop', g.markTop, LIMITS.pcMarkTop);
        var bottom = text(ctx, 'pc.graphics.markBottom', g.markBottom, LIMITS.pcMarkBottom);
        if (model !== null) {
          out.graphics = { maker: maker || '', brand: brand || '', model: model, markTop: top || '', markBottom: bottom || '' };
        }
      }
    }
    if (has(o, 'platform')) { var pl = rows(ctx, 'pc.platform', o.platform, 'label', 'value', LIMITS.pcLabel, LIMITS.pcValue); if (pl) out.platform = pl; }
    if (has(o, 'storage')) { var st = rows(ctx, 'pc.storage', o.storage, 'size', 'name', LIMITS.pcSize, LIMITS.pcValue); if (st) out.storage = st; }
    if (has(o, 'build')) { var bu = rows(ctx, 'pc.build', o.build, 'label', 'value', LIMITS.pcLabel, LIMITS.pcValue); if (bu) out.build = bu; }
    return out;
  }

  // Returns { config, problems }. config only ever holds validated values.
  // strict (the control panel) turns over-long text into errors; the site
  // runs lenient and shortens it instead.
  function normalize(raw, opts) {
    var ctx = new Ctx(opts && opts.strict);
    var config = { schema: SCHEMA };
    if (!isPlainObject(raw)) {
      ctx.error('', 'root', 'The settings file must be a JSON object.');
      return { config: config, problems: ctx.problems };
    }
    if (raw.schema !== undefined && raw.schema !== SCHEMA) {
      var newer = typeof raw.schema === 'number' && raw.schema > SCHEMA;
      ctx.error('schema', newer ? 'schema-newer' : 'schema', newer
        ? 'This file was made by a newer control panel than this site understands.'
        : 'The schema number must be ' + SCHEMA + '.');
      return { config: config, problems: ctx.problems };
    }
    checkKeys(ctx, '', raw, KNOWN_KEYS);
    if (has(raw, 'updatedAt')) {
      var u = isoDate(ctx, 'updatedAt', raw.updatedAt);
      if (u) config.updatedAt = u;
    }
    var v;
    if (has(raw, 'notice') && (v = normNotice(ctx, raw.notice))) config.notice = v;
    if (has(raw, 'sections') && (v = normFlags(ctx, 'sections', raw.sections, SECTION_KEYS))) config.sections = v;
    if (has(raw, 'titles') && (v = normTitles(ctx, raw.titles))) config.titles = v;
    if (has(raw, 'seasons') && (v = normSeasons(ctx, raw.seasons))) config.seasons = v;
    if (has(raw, 'effects') && (v = normFlags(ctx, 'effects', raw.effects, ['weather', 'particles']))) config.effects = v;
    if (has(raw, 'footer') && (v = normFooter(ctx, raw.footer))) config.footer = v;
    if (has(raw, 'integrations') && (v = normIntegrations(ctx, raw.integrations))) config.integrations = v;
    if (has(raw, 'socials') && (v = normSocials(ctx, raw.socials))) config.socials = v;
    if (has(raw, 'playlist') && (v = normPlaylist(ctx, raw.playlist))) config.playlist = v;
    if (has(raw, 'stories') && (v = normStories(ctx, raw.stories))) config.stories = v;
    if (has(raw, 'pc') && (v = normPc(ctx, raw.pc))) config.pc = v;
    return { config: config, problems: ctx.problems };
  }

  function errorsOf(problems) {
    return problems.filter(function (p) { return p.level === 'error'; });
  }

  function stringify(config) {
    return JSON.stringify(config, null, 2) + '\n';
  }

  function noticeActive(notice, nowMs) {
    if (!notice || !notice.enabled || !notice.text) return false;
    if (notice.startsAt && nowMs < Date.parse(notice.startsAt)) return false;
    if (notice.endsAt && nowMs >= Date.parse(notice.endsAt)) return false;
    return true;
  }

  // Changes whenever the visible words change, so a dismissed notice returns
  // when the owner rewrites it.
  function noticeId(notice) {
    var s = [notice.text, notice.linkText, notice.linkUrl, notice.tone].join('|');
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function profileUrls(integrations) {
    var i = integrations || {};
    var out = {};
    if (i.discord) out.discord = 'https://discord.com/users/' + i.discord.userId;
    if (i.steam) out.steam = 'https://steamcommunity.com/id/' + i.steam.vanity + '/';
    if (i.mal) out.mal = 'https://myanimelist.net/animelist/' + i.mal.user;
    if (i.letterboxd) out.letterboxd = 'https://letterboxd.com/' + i.letterboxd.user + '/';
    return out;
  }

  function playlistUrl(playlistId) {
    return 'https://music.youtube.com/playlist?list=' + playlistId;
  }

  function rgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function storyStyle(colors) {
    return {
      background: 'linear-gradient(150deg,' + rgba(colors[0], 0.66) + ' 0%,' + rgba(colors[1], 0.55) + ' 55%,' + rgba(colors[2], 0.5) + ' 100%)',
      boxShadow: '0 16px 38px ' + rgba(colors[0], 0.32) + ', var(--glint)',
      ctaColor: colors[0]
    };
  }

  function isManaged(config, key) {
    return !!config && Object.prototype.hasOwnProperty.call(config, key);
  }

  // Firebase hands back the stored text as a JSON string literal; other hosts may
  // return the object itself. A value of null means nothing has been saved yet.
  function parseStored(body) {
    var v;
    try { v = JSON.parse(body); } catch (e) { return { ok: false, value: null, reason: 'not-json' }; }
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (e2) { return { ok: false, value: null, reason: 'not-json' }; }
    }
    if (v === null) return { ok: true, value: null };
    if (!isPlainObject(v)) return { ok: false, value: null, reason: 'not-object' };
    return { ok: true, value: v };
  }

  // The site only ever fetches settings from an https address, or from a path on
  // its own origin (which is how the control panel's preview feeds it).
  function controlUrlOk(url) {
    if (typeof url !== 'string' || /\s/.test(url)) return false;
    if (/^\/(?!\/)/.test(url)) return true;
    try {
      var u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password && u.hostname.indexOf('.') !== -1;
    } catch (e) { return false; }
  }

  return {
    SCHEMA: SCHEMA,
    LIMITS: LIMITS,
    ID_PATTERNS: ID_PATTERNS,
    SECTION_KEYS: SECTION_KEYS,
    TITLE_KEYS: TITLE_KEYS,
    SEASON_KEYS: SEASON_KEYS,
    BUILTIN_SOCIALS: BUILTIN_SOCIALS,
    TONES: TONES,
    MANAGED_KEYS: MANAGED_KEYS,
    normalize: normalize,
    errorsOf: errorsOf,
    stringify: stringify,
    noticeActive: noticeActive,
    noticeId: noticeId,
    profileUrls: profileUrls,
    playlistUrl: playlistUrl,
    storyStyle: storyStyle,
    isManaged: isManaged,
    parseStored: parseStored,
    controlUrlOk: controlUrlOk
  };
});
