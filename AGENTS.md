# AGENTS.md — Kazu Hub

Guidance for AI coding agents working in this repository. Read this first.

## Project overview

Kazu Hub is a personal hub page for Kazu Hani ("Arctic Dragon ❄️🐉"), deployed
as a static site on GitHub Pages at `https://kazuhani.github.io/Kazu-Hub/`
(repo: `KazuHani/Kazu-Hub`, default branch `Main`).

Stack: **vanilla HTML/CSS/JS only. No framework, no build step, no package
manager, no dependencies.** There is no `package.json`, `pyproject.toml`, or
any other manifest — do not add one. The only tooling is Node (used solely to
run the headless test file) and a static file server for local preview.

The page shows: live stat cards (UK time, Aberystwyth weather, age, birthday
countdown) with detail pop-ups; a "right now" section with live Discord
presence (Lanyard, WebSocket + REST fallback), Steam status, MyAnimeList
watching/reading (Jikan, falling back to MAL list endpoints through
`corsproxy.io`), and the latest Letterboxd diary entry (RSS via the same
proxy); a YouTube Music playlist card whose "From the playlist" rows update
themselves from the playlist's Atom feed (`feeds/videos.xml`, via the same
proxy, newest additions first), plus a ListenBrainz "recently played" strip;
socials; and in-progress stories. It is installable as a PWA-lite (manifest +
`sw.js` offline shell), a single time-of-day-reactive palette (a soft
slate blue that lightens towards midday and dims towards sunset/night,
driven by `KazuLib.skyTint` on the UK clock — there is no theme toggle),
seasonal themes (birthday,
Christmas, pride), a weather-reactive cherry-blossom atmosphere (petals
detach from the branches and drift down-wind; the layer is anchored to the
top of the page, so it scrolls away with the hero), a "moonlit sakura"
scenery layer (SVG branches from the page edges plus a sun-by-day /
moon-by-night sky body arcing left→right on the UK clock; hidden during
the Christmas season), and custom scrollbars. The blossom branches and the
falling petals only appear during Japan's cherry-blossom season (20 March to
10 May, on the UK date; see "Cherry-blossom season" below); the sun and
moon stay all year. On desktop only, the live UK weather is also drawn behind
the page as rain, snow, wind streaks and clouds that combine when the
weather does (see "Live weather layers" below); mobile never gets it.

## Code layout

- `index.html` (~850 lines) — the whole page. Loads `style.css?v=55`,
  `lib.js?v=34`, `script.js?v=65` (version query strings; see cache-busting
  below). Inline JSON-LD schema and the `#boot-tint` first-paint script
  (see "First paint" below) in the `<head>`.
- `lib.js` (~930 lines) — **pure, DOM-free helpers**, exposed as the global
  `KazuLib` (works in browser and Node). Single source of truth for the birth
  config (`BIRTH = { year: 2001, month: 10, day: 9 }`, month 0-indexed), the
  Europe/London wall-clock frame, UK DST maths, age/birthday calculations
  (including the playful equivalents in `ageBreakdown`: full moons, Sun laps,
  years asleep, breaths), calendar export (`.ics`, Google Calendar URL), HTML
  escaping, Steam/MAL data shaping, dev-code matching, scrollbar thumb
  geometry, and the sun/moon sky-arc maths (`sunTimesUK`, `skyBodyState`).
  The arc (`skyArcPoint`) is one sine that runs on past the horizon points
  until both ends are off-screen (`SKY_ARC_OVERSHOOT`, x = -8.08% .. 108.08%),
  so the body slides in and out through the page edges and the sun<->moon
  hand-overs happen off-screen. `script.js` keeps an inline fallback copy of
  `skyArcPoint`; the gate tests run it against `lib.js` so they cannot drift.
- `script.js` (~2400 lines) — all DOM behaviour: stat cards and modals,
  particles/atmosphere, themes and seasons, live API integrations (Lanyard,
  Steam, Jikan/MAL, Letterboxd, YouTube playlist feed, ListenBrainz,
  ZenQuotes), custom scrollbars,
  the `kazudev` dev panel. It consumes `KazuLib` but keeps inline fallbacks
  for the lib helpers it needs, so the page still works if `lib.js` fails to
  load. User-facing IDs (`DISCORD_ID`, `STEAM_VANITY`, `MAL_USER`, `LB_USER`,
  `LISTENBRAINZ_USER`) are constants near the top of each section.
- `weather-fx.js` — the live weather layers (rain, snow, wind, clouds) on one
  background canvas, **desktop only and loaded on demand**: never a static
  `<script>` tag and never precached, `script.js` injects it after
  `KazuLib.weatherFxAllowed` says yes (see "Live weather layers" below).
  Pure, DOM-free core (weather -> layers, quality governor, seeded particle
  physics, colours) exposed as `KazuWeatherFx`, plus a thin DOM shell at the
  bottom. Versioned by the `WEATHER_FX_SRC` constant in `script.js`.
- `style.css` (~1440 lines) — all styling, including seasonal and
  weather-atmosphere variants and the sakura scenery layer.
- `sw.js` — service worker. Network-first for navigations, cache-first for
  same-origin versioned assets, cross-origin requests (live APIs, fonts)
  untouched. Precache list mirrors the `?v=` URLs from `index.html`.
  (`weather-fx.js` is deliberately absent: phones would download it on install.)
- `tests.js` — headless gate tests for `lib.js` and `weather-fx.js`, plain Node, no dependencies.
- `tests.html` — the same assertions run in the browser (open the file).
- `404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest` — static
  plumbing. `assets/` holds images/icons.
- `.github/workflows/test.yml` — the only CI (see Testing).

## Run locally

Static site — open `index.html` directly, or serve the folder:

```
python -m http.server 8000
# → http://localhost:8000
```

Preview/dev affordances built into the page:

- `?season=birthday|christmas|pride|sakura|all` (comma-combinable) forces
  seasonal themes on any date. The `?season=` param wins over the dev panel.
  `sakura` (the blossom branches + petals) is only ever forced ON: a param
  that doesn't name it leaves the blossoms on the calendar.
- `?atmosphere=rain|blossom|blossom-heavy|aurora|none` forces the particle mode.
  `blossom` / `blossom-heavy` also bring the branches back out of season, so
  the preview looks like the real in-season page. It previews the OLDER
  atmosphere: on desktop it also keeps the live weather layers off.
- `?weather=rain,wind,clouds,snow,storm,all,none` (comma-combinable, each with
  an optional strength, e.g. `rain:1,clouds:0.4`) forces the desktop weather
  layers on any real weather; `none` forces a clear sky. Still desktop-only:
  a phone or a window under 769px shows nothing. Widen the window and it
  starts without a reload.
- Typing `kazudev` anywhere on the page opens a dev settings panel with
  per-season Auto/On/Off overrides (Birthday, Christmas, Pride, Sakura)
  persisted to localStorage. Typing it again or Esc closes it.

## Testing

`lib.js` is deliberately DOM-free so it can be tested in two places:

- **Headless:** `node tests.js` — no dependencies, no network, <1s.
  Exit code 0 = pass, 1 = at least one failure.
- **Browser:** open `tests.html` — same assertions.

CI (`.github/workflows/test.yml`, "gate tests") runs `node tests.js` on every
push to `Main` and on PRs, under three timezones (`TZ=UTC`,
`TZ=Pacific/Kiritimati`, `TZ=America/Los_Angeles`) to prove the UK wall-clock
maths is machine-independent. Keep the suite passing under all three; any new
deterministic helper in `lib.js` needs matching assertions in both `tests.js`
and `tests.html`.

There is no test framework — assertions are hand-rolled `ok`/`eq` helpers.
Follow that pattern.

## Conventions and gotchas

These are load-bearing; read before editing.

- **Cache busting.** CSS/JS are versioned by query string. After editing
  `style.css`, `script.js`, or `lib.js`: bump the `?v=` in `index.html` (and
  in `tests.html` for `lib.js`), keep the matching entries in `sw.js`'s
  `PRECACHE` list in sync, and bump `CACHE` in `sw.js` if `sw.js` itself
  changes.
- **Staged boot & populate animation.** Startup work runs in priority order,
  not all at once: first API fetches ride the `firstDelay` ladder in the
  `POLLERS` array (stretch gaps via `bootGap`), heavy layers wait for
  `scheduleIdle`, and the glass-map bake runs in idle slices. When a live
  card's data arrives, swap its loading row out through `popReveal(loadedEl,
  loadingEl)` — never raw `classList` toggles — so the content fades/rises in
  and the card's height glides to fit. Both paths must stay free for
  low-power (`LOW_POWER`) and reduced-motion devices (instant swap).
  Any new always-on animated layer (infinite CSS loops, canvas rAF) must
  register with `fxWatch(el)` so it pauses off-screen via `.fx-paused`.
- **First paint = live tint (no night-black flash).** `script.js` runs at the
  end of `<body>`, so anything it writes lands AFTER the first paint. The
  inline `<script id="boot-tint">` in `<head>` therefore writes the
  time-of-day palette itself before the first paint: `--bg-h/s/l/glow` on
  `<html>`, the `#boot-canvas` `<style>` colour, and the `theme-color` meta.
  It is a compact copy of `KazuLib.skyTint` + `hslToHex` + the UK-clock read;
  `tests.js`/`tests.html` run the real script against stubs and compare it to
  `lib.js` across a year-wide sweep, so if you change the tint maths in
  `lib.js` you MUST change the boot script to match (the sweep fails
  otherwise). It also raises `html.sky-pending`, which hides `.sky-body`
  until `updateSkyBody`'s first snap places it (`script.js` lifts the class;
  an 8s timeout is the failsafe). Any new state that `script.js` sets on
  load and that changes the look of the first screen belongs in the same
  boot script or it will flash. Known gap: on Dec 25 the Christmas palette
  is still applied by `script.js` (`body.season-christmas`), so that one day
  shows the blue tint briefly before the pine palette.
- **Cherry-blossom season.** The branches (`.sakura-branch`) and the petal
  modes (`blossom`, `blossom-heavy`) only exist from 20 March to 10 May
  inclusive (first blooms in Kyushu/Tokyo to the last Hokkaido petals),
  judged on the UK date. Rain and aurora are weather and unaffected; the
  sun/moon share the `.sakura-scene` layer, so hide branches, never the
  layer. The window is `SAKURA_FIRST` / `SAKURA_LAST` in `lib.js`
  (`sakuraInBloom`) and the matching numbers in the `#boot-tint` script
  (`md < 220 || md > 410`); a year-wide gate test fails if they disagree.
  `html.no-sakura` is set by the boot script before first paint and kept in
  sync by `applySeasons` (dev overrides, page left open across the edges);
  `setAtmosphere` gates the petal modes on the same flag and re-runs when it
  flips. Sakura is a fourth dev-panel season (`seasonDevApply` keys). Snowy
  weather out of season shows a clear sky, not petals.
- **Live weather layers (desktop only).** `weather-fx.js` draws rain, snow,
  wind streaks and clouds from the UK weather `script.js` already fetches
  (Open-Meteo now also asks for `cloud_cover` and `wind_direction_10m`).
  Layers combine only when the weather says so: rain and snow come from one
  weather code so they never overlap, precipitation implies cloud, cloud
  needs >= 25% cover, wind starts at 32 km/h (20 mph) and full strength is
  80 km/h; a westerly blows left to right. All of that lives in
  `KazuWeatherFx.layersFor` and is table-tested; change the rules there.
  - *Not for mobile.* Three independent guards: (1) `KazuLib.weatherFxAllowed`
    refuses coarse pointers, no-hover devices, a mobile UA, a window <= 768px,
    reduced motion, save-data and `lowPower`, and `script.js` never even
    requests the file for those visitors; (2) the CSS media query + `body.low-power`
    rule hide `.weather-fx` regardless; (3) media-query `change` listeners
    stop the layers live if the window narrows. Phones keep the older DOM
    rain drops / snow petals exactly as before. On desktop the canvas owns
    rain and snow, so `setAtmosphere` turns its `rain` and `blossom-heavy`
    modes into `none` there (`weatherFxOwnsPrecip`), and hands them back if the
    file fails to load.
  - *Performance budget.* One fixed canvas at half resolution behind the
    content, ~570 canvas calls per frame worst case (gate-tested, with a
    no-NaN check), 30 fps (12 fps clouds-only, halved while scrolling), paused
    behind modals and in hidden tabs, nothing mounted at all when the sky is
    clear. A frame-time governor steps density down (1 -> .6 -> .35 -> .18)
    when the average rAF interval exceeds 28 ms, then switches the effect off
    for the session. Measured at maximum load on a 144 Hz desktop: 6.94 ms per
    frame with it running vs 6.96 ms without, 0.2 ms per drawn frame.
  - The canvas is inserted between `.sakura-scene` and `.atmosphere`, so
    clouds pass in front of the sun/moon and rain falls in front of the
    branches while petals stay on top. New always-on visuals in this layer
    must keep the same rules: no timers, batched paths, an op budget test.
- **Social tiles are solid brand tiles.** `.social-card` is deliberately NOT
  a `.card` member (no glass/refraction — nothing to refract through). The
  design hangs off two custom properties: each network gets a
  `.social-card--<name>` rule in style.css with `--brand-a` (centre, lighter)
  and `--brand-b` (edge, darker); the bevel, gloss, badge and hover are all
  inherited. To add a social: copy a tile in index.html, swap href / badge /
  name / handle, add one modifier rule — then bump the tile count in the
  structural assertions in tests.js and tests.html.
- **Timezone rule.** Anything age/birthday-related must run in the
  Europe/London wall-clock frame via `KazuLib.ukWallParts` / `ukWallMs`
  (calendar arithmetic happens in a fake-UTC frame so results are identical on
  any machine). Never reintroduce visitor-local `Date` getters for those
  paths.
- **lib.js is the single source of truth.** Deterministic maths belongs in
  `lib.js` (DOM-free, gate-tested). `script.js` consumes it via `KazuLib` with
  inline fallbacks in case the file fails to load — when you add a lib helper
  used by the page, mirror that fallback pattern.
- **HTML escaping.** API-sourced strings (Steam game names, MAL titles, etc.)
  go through `KazuLib.escapeHtml` before any `innerHTML` interpolation.
- **Style.** Plain ES5-ish in `lib.js` (`var`, function expressions, IIFE
  attaching to a global), modern JS (arrow functions, `const`/`let`) in
  `script.js` and `sw.js`. Heavy header-comment banners explain intent at the
  top of each file and each section; match that density. 2-space indent.
- **Service worker.** `sw.js` must never serve stale content while online:
  network-first for pages, versioned-URL cache-first for assets, and live
  APIs always fetched fresh. Preserve that strategy.
- **localStorage keys in use:** `kazu-dev-seasons`, `kazu-discord-cache`,
  `kazu-mal-cache`, `kazu-mal-manga-cache`, `kazu-lb-cache`, `kazu-ytm-cache`.
  Don't collide.

## Working agreements (from CLAUDE.md)

The repo carries a `CLAUDE.md` with the owner's working rules; the ones that
bind agent work here:

- Tests ship with the change, in the same commit. "I'll add tests later" is
  not acceptable. Gate tests must stay deterministic, local, free, and fast.
- Vanilla by default. No frameworks, no new dependencies, no build tooling.
  Check for an existing library/pattern before writing custom code; don't
  recreate what exists.
- Deterministic work (date maths, transforms, escaping) goes in code with
  tests, not in ad-hoc reasoning.
- Safety: never commit secrets (check `.gitignore` if `.env` is ever touched);
  no destructive ops (`rm -rf`, `git reset --hard`, force push) or skipping
  hooks without explicit confirmation; no binaries or compiled outputs in the
  repo.
- When done, commit and push (the owner's `.claude/settings.local.json`
  pre-allows `git add/commit/push`), and state what needs restarting — for
  this site, a push to `Main` redeploys GitHub Pages automatically; nothing
  else restarts.

## Deployment

Push to `Main` → GitHub Pages serves the repo root as-is. There is no build,
no bundler, no environment variables, no server-side component. Cache-busting
bumps (above) are the entire "release process" for CSS/JS changes.
