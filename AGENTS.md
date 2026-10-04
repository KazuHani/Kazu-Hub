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
the shared CORS proxy, `proxy.cors.sh`), and the latest Letterboxd diary entry (RSS via the same
proxy); a YouTube Music playlist card whose "From the playlist" rows update
themselves from the playlist's Atom feed (`feeds/videos.xml`, via the same
proxy, newest additions first), plus an optional ListenBrainz "recently played" strip (its markup is currently absent, and the page does not even fetch while it is);
socials; and in-progress stories. It is installable as a PWA-lite (manifest +
`sw.js` offline shell), a single time-of-day-reactive palette (a soft
slate blue that lightens towards midday and dims towards sunset/night,
driven by `KazuLib.skyTint` on the UK clock — there is no theme toggle),
seasonal themes (birthday, Christmas, pride, and an October Halloween theme),
a weather-reactive cherry-blossom atmosphere (petals
detach from the branches and drift down-wind; the layer is anchored to the
top of the page, so it scrolls away with the hero), a "moonlit sakura"
scenery layer (SVG branches from the page edges plus a sun-by-day /
moon-by-night sky body arcing left→right on the UK clock; hidden during
the Christmas season), and custom scrollbars. The blossom branches and the
falling petals only appear during Japan's cherry-blossom season (20 March to
10 May, on the UK date; see "Cherry-blossom season" below); the sun and
moon stay all year. On desktop only, the live UK weather is also drawn behind
the page as rain, snow, wind streaks and clouds that combine when the
weather does (see "Live weather layers" below); mobile never gets it. Each
evening a static orange-to-violet sunset gradient sits behind the sky (see
"Sunset sky" below); it shows on every device.

## Code layout

- `index.html` — the whole page. Loads `style.css?v=78`,
  `lib.js?v=38`, `script.js?v=82` (version query strings; see cache-busting
  below). Inline JSON-LD schema and the `#boot-tint` first-paint script
  (see "First paint" below) in the `<head>`.
- `lib.js` (~1400 lines) — **pure, DOM-free helpers**, exposed as the global
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
- `script.js` (~4100 lines) — all DOM behaviour: stat cards and modals,
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
- `style.css` (~2500 lines) — all styling, including seasonal and
  weather-atmosphere variants and the sakura scenery layer.
- `sw.js` — service worker. Network-first for navigations, cache-first for
  same-origin versioned assets, cross-origin requests (live APIs, fonts)
  untouched. Precache list mirrors the `?v=` URLs from `index.html`.
  (`weather-fx.js` is deliberately absent: phones would download it on install.)
- `tests.js` — headless gate tests for `lib.js` and `weather-fx.js`, plain Node, no dependencies.
- `tests.html` — the same assertions run in the browser (open the file).
- `evals/adblock-filters.js` — periodic eval (network, plain Node, no
  dependencies): downloads the public ad-block cosmetic lists and fails if any
  of their generic hide rules would hide a class or id the page uses (see
  "Ad-block safe class names" below). Its pure parser is also exercised by
  `tests.js`.
- `evals/perf-guards.js` — gate assertions (deterministic, no browser) for
  the rules in "Performance rules" below: source pins plus the real code
  sliced out of `script.js` and run against fakes. Shared by `tests.js` and
  `tests.html`; also runs alone (`node evals/perf-guards.js`).
- `evals/perf.js` — periodic eval (real Chrome over the DevTools protocol,
  plain Node >= 22, no dependencies, no network): idle CPU per process, style
  recalcs and layouts per second, scroll, hover and pop-up frame pacing and
  load (FCP / LCP / TBT / bytes), on desktop / tablet / phone profiles with every
  API mocked. See "Performance
  rules". Usage is in its header; its pure statistics helpers are exercised by
  `tests.js`.
- `404.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest` — static
  plumbing. `assets/` holds images/icons.
- `.github/workflows/test.yml` — the gate CI (see Testing).
- `.github/workflows/perf.yml` — the weekly / manual perf eval (idle budgets
  on desktop, tablet and phone, software GPU). Never runs on push or PR, so it
  cannot block a deploy; a failure means something started costing real CPU at
  rest (see "Performance rules").

## Run locally

Static site — open `index.html` directly, or serve the folder:

```
python -m http.server 8000
# → http://localhost:8000
```

Preview/dev affordances built into the page:

- `?season=birthday|christmas|pride|sakura|halloween|all` (comma-combinable) forces
  seasonal themes on any date. The `?season=` param wins over the dev panel.
  `sakura` (the blossom branches + petals) is only ever forced ON: a param
  that doesn't name it leaves the blossoms on the calendar.
- `?atmosphere=rain|blossom|blossom-heavy|aurora|none` forces the particle mode.
  `blossom` / `blossom-heavy` also bring the branches back out of season, so
  the preview looks like the real in-season page. It previews the OLDER
  atmosphere: on desktop it also keeps the live weather layers off.
- `?time=HH:MM` (UK wall time, e.g. `?time=18:20`) moves the whole sky to that
  time: sun/moon position, the time-of-day tint, the sunset gradient, and the
  cloud colours. The on-page clock stays real. Handy for previewing sunset:
  today's is ~18:20, and it varies by season (`KazuLib.sunTimesUK`).
- `?weather=rain,wind,clouds,snow,storm,all,none` (comma-combinable, each with
  an optional strength, e.g. `rain:1,clouds:0.4`) forces the desktop weather
  layers on any real weather; `none` forces a clear sky. Still desktop-only:
  a phone or a window under 769px shows nothing. Widen the window and it
  starts without a reload.
- `?fireworks=1` previews the 20-second New Year fireworks on
  any date, once per page load. It doesn't change the real celebration latch.
- Typing `kazudev` anywhere on the page opens a dev settings panel with
  per-season Auto/On/Off overrides (Birthday, Christmas, Pride, Sakura, Halloween)
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

## Performance rules (load-bearing)

`node evals/perf.js` measures what the page costs in a real browser (Chrome
over the DevTools protocol; usage is in the file header). Its first run found
the page burning a full CPU core at rest and missing every scroll frame on a
throttled phone; idle now sits around 0.01 cores. These rules keep it there,
and `evals/perf-guards.js` pins every one in the gate lane (the guards fail on
the pre-optimisation code, which is the point).

- **Idle must be idle.** At rest the page does one style recalc and one layout
  a second (the clock). `perf.js --budget` fails on any running transition,
  more than 6 recalcs or layouts a second, or more than 4 long tasks a minute.
  Idle runs are unthrottled on purpose: the DevTools CPU throttle itself burns
  renderer CPU, which would drown the number idle exists to measure. Use
  `--quick` to iterate (a fake UK clock rolls a minute 2 s after load) and
  `--css` / `--js` / `--pre` to try a fix in the page before writing it.
- **No invisible or always-on animation.** Any running CSS animation or
  transition, even compositor-only, even a 5px progress bar, makes the
  compositor and GPU process produce a frame on every vsync (144 a second on a
  fast display): about 0.19 CPU cores each, measured on a bare test page. The
  seasonal loops (petals, rain drops, aurora, Christmas lights, the Pride halo)
  are allowed because they ARE the feature and run only in season; the
  allow-list is pinned in `perf-guards.js`, so a new infinite loop must be
  added there on purpose. The Pride halo's spin used to sit on the base rule and
  ran all year at opacity 0 (~0.3 cores). Where a loop can afford a lower frame
  rate it is limited: the halo is a uniform rotation on `steps(420)` (30 steps a
  second, under a degree each: identical to the eye, ~35-57% less GPU work, because
  the compositor skips drawing frames where nothing changed), and the birthday
  balloons skip draws inside a ~100 fps ceiling (`BALLOON_MIN_FRAME_MS`). `steps()`
  is only valid on a LINEAR animation; on an eased one (the aurora ribbons, the
  petals' sway) it would flatten the easing, so those stay smooth. For a small,
  long-lived indicator
  prefer discrete steps: the Spotify bar steps four times a second off a timer
  that exists only while a song plays and the tab is visible, and
  `.spotify-bar-fill` is a `transform`, never a width.
- **Never transition an inherited custom property** (or anything else that
  restyles the whole document per frame). The sky tint was a 90 s transition on
  `--bg-h/s/l/glow`, retargeted every minute, so one was always running: every
  frame restyled ~1,000 nodes (the meadow's ~35 `color-mix()` tokens and ~500
  SVG nodes included) and repainted the gradient behind every frosted card. A
  throttled phone missed 200 of 201 scroll frames; now 1 of 1,171.
- **Sky tint cadence.** `stepSky` (called from the 1 Hz `tick`, so it pauses
  with a hidden tab and owns no timer) writes the tint every `TINT_STEP_MS`
  (10 s) and moves the sun/moon every `BODY_STEP_MS` (60 s). It waits for the
  page to be at rest (`SKY_QUIET_MS` after the last scroll, no pop-up flight, no
  card height glide), writes nothing when the tint is unchanged (deep night),
  and feeds fractional UK minutes (`skyClock`) so each step lands on the exact
  point of the day's curve. One step moves the canvas colour by under a quarter
  of one 8-bit level at the fastest hour of the year (`perf-guards.js` sweeps
  both palettes across the year), which is why it reads as the old glide.
- **No page-wide DOM sweeps from observers.** A `MutationObserver` callback
  receives records: queue only what they name. The custom-scrollbar host scan
  used to visit every element after every mutation, and the clock's text swap
  is a mutation (~9 ms of main thread every second, a dropped frame a second
  at 144 Hz). Text swaps now queue nothing; load and resize run one debounced
  full sweep.
- **No CSS animation on off-screen `content-visibility: auto` content.** The
  below-fold cards are skipped until they near the viewport, and an animation
  started inside a skipped subtree never completes: Blink requests a frame on
  every vsync for as long as the page is open (measured +0.07 cores for five
  playlist rows). `popRefresh` / `popReveal` animate only what `inViewport`
  says is on screen and take the class off after the run.
- **The boot path stays short.** The render-blocking `<head>` script computes
  the UK clock by arithmetic (no `Intl`), and `#boot-power` (first thing in
  `<body>`, a copy of `KazuLib.lowPowerMode` over the same six flags, swept over
  all 64 combinations by `tests.js`) settles `body.low-power` before anything
  paints. Before it existed, every phone started the entrance animations and
  frosted glass it was about to cancel: the profile picture, title and stat
  cards sat at opacity 0 behind those animations, so first contentful paint
  waited for `script.js`. Phone FCP is ~26% earlier (4x-throttled profile,
  median of 11) and main-thread task time at load halved. Resource hints follow
  the boot ladder: full `preconnect` only for hosts used in the first seconds
  (an idle preconnected socket is dropped after ~10 s), `dns-prefetch` for the
  rest, none for hosts the page never fetches (`corsproxy.io` and ListenBrainz
  were there long after the code stopped using them).
- **Fonts ride two requests so the heading's face can be subset.** Fraunces
  italic is used by exactly one element, the h1 "Kazu Hani", and the full latin
  file is 81.5 KB (about half of all font bytes on a cold load). Google Fonts
  subsets a whole request by `text=`, so it has its own `<link>` cut to that
  heading's nine characters (6.7 KB, same glyphs and optical-size axis, measured
  identical to three decimals at 42/54/80px and in the live page). If the h1
  text ever changes, change `text=` too: `perf-guards.js` compares them, and
  any character outside the subset falls through to Fredoka.
- **Phones are low-power by construction.** `lowPowerMode` counts a coarse
  pointer and a small screen as two weak signals, and every phone has both, so
  every phone runs in low-power mode: no particles, no backdrop blur, no glass
  refraction, no entrance or scroll-reveal motion, no wheel-lerp. What phones
  keep: the sky tint and sunset, the meadow, the pop-up card fly-out, hover and
  press feedback. Tablets and narrow desktop windows get the full effects with
  the mobile layout. (`particleCount`'s phone density tier is therefore dead
  code.) Changing that is a product decision, not an optimisation. (The
  comment on `lowPowerMode` in `lib.js` says a weak phone needs three signals,
  but the code trips on two.)

## New Year (UK midnight)

The existing visible-tab clock tick checks `newYearCelebrationYear` using
the real Europe/London date. At 12:00 AM on 1 January it starts a finite,
silent 20-second fireworks show. The first
minute allows a page opened/resumed just after midnight to join in; later
visits don't trigger a delayed celebration. The `kazu-new-year-celebrated`
**sessionStorage** key prevents repeats on reload within a tab, with an
in-memory fallback when storage is blocked. Sky-time/season previews never
trigger it; `?fireworks=1` is a separate preview.

Reduced-motion and low-power devices skip the show. The
canvas uses half CSS resolution and at most 30 fps; spark motion is analytic
in `KazuLib.fireworkSparkState`, mirrored in `script.js`. Completion,
visibility loss and pagehide remove temporary DOM, rAF, timers and listeners.
`evals/new-year-fireworks.js` runs timing, lifecycle and paint-budget checks
in both gate suites and standalone (`node evals/new-year-fireworks.js`).

## Halloween (October)

Halloween follows the Europe/London date from 1 October through 31 October,
including a page left open across UK midnight. `?season=halloween` previews it
on any date; the dev panel has a Halloween Auto/On/Off row stored under the
existing `kazu-dev-seasons` key. URL previews win over saved settings, and
Christmas takes palette priority when both are forced on.

The plum sky uses `skyTint(minutes, dayOfYear, 'halloween')`: hue and saturation
change, while daylight, lightness, sunset and weather timing stay the same.
The inline boot script resolves the same date and overrides before first paint.
`html.season-halloween` represents the effective palette; `body.season-halloween`
records the requested season. Static SVG bats and profile pumpkins show with
the effective palette, and the meadow becomes an autumn field with three
jack-o'-lanterns. Their faces, halos and pools use the cottage's existing
`--m-lit` switch. All artwork remains static on phones and low-power devices.

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
  It is a compact copy of `KazuLib.skyTint` + `hslToHex` + the UK-clock read
  (done by BST arithmetic, not `Intl`: the first `Intl` object in a page pays
  ICU's one-off start-up, ~25 ms on a fast phone and ~100 ms on a mid one, and
  this script blocks first paint; a sweep pins it to `KazuLib.ukWallParts`
  across every clock-change minute of 2024-2032);
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
- **Sunset sky.** `<div class="sunset-sky">` (first child of `<body>`, so the
  sun, moon and branches paint over it) is an orange evening gradient whose
  strength is `--sunset` and whose palette mix is `--sunset-late`, both from
  `KazuLib.sunsetGlow` (evening only, no sunrise version): it eases in 110
  minutes before the day's sunset, is full from sunset for 12 minutes, and is
  gone 85 minutes later; the palette crossfades from golden orange to
  rose/violet from 10 minutes before to 40 after. `script.js` writes the two
  variables on every 10-second tint step (in `applySkyTint`, see "Sky tint
  cadence" below), and the inline `#boot-tint`
  script carries a compact copy so a page opened at dusk starts with the
  sunset in place; the year-wide sweep in `tests.js` pins the two. It is
  static CSS (no transition, no animation; the value steps under 0.5% per
  step), so it shows on phones and in low-power mode too; only Christmas hides it.
  Changing the timing means editing `sunsetGlow` AND the matching numbers in
  the boot script. The gradient stops live in `style.css` (`.sunset-sky`).
- **Meadow footer (a grassy field with a house).** The last thing on the
  page is a full-bleed illustrated field: cottage, trees, picket fences, a
  path and wildflowers, with the credit line resting on the grass. It is one
  decorative inline SVG (`<footer class="footer meadow">`, a sibling AFTER
  `.container` so it can run edge to edge; 1440x340 view box, the hills extend
  far past both sides so any width fills; the page scales it between 860px and
  1800px and centres it, phones see the middle). Every colour is a `--mf-*`
  token in `style.css` ("MEADOW FOOTER"), a `color-mix()` of a day (`--d-*`)
  and a night (`--n-*`) value: `--m-day` comes from the live sky tint
  (`--bg-l`, plus a little `--sunset`), the window lights are their own "dark enough" switch
  (`--m-lit`: off all day and through the sunset itself, easing on from about
  20 minutes after sunset to fully on by about 55, off again within an hour of
  sunrise; when on the glass turns amber, each pane gets a bright centre, the
  windows, attic and door lantern get halos and warm light pools on the grass;
  `tests.js` reads the thresholds out of `style.css` and pins the timing for
  every season, and without `color-mix()` the panes and pools still light up), `--m-warm` folds the sunset
  orange in, the pink blossom on the big tree only shows in blossom season
  (`html:not(.no-sakura)`), and Christmas repaints it as a snowy field. Static
  paint (no animation), shown on every device. It is `content-visibility: auto`
  so it costs nothing at load (~535 SVG nodes at the end of a long page; phone
  first contentful paint is ~28% earlier with it skipped), with a placeholder
  height computed from the art's own width clamp and aspect ratio so it never
  shifts when it renders (`perf-guards.js` ties the two together). It is `z-index: 0` so the fixed
  back-to-top button (inside `.container`, z-index 1) stays on top. To change
  the art, edit the SVG in `index.html`; every class it uses must be styled and
  no fill may be hard-coded except the flowers (tests enforce both). `tests.html`
  also runs live checks against the real page (day/dusk/night colours, layout,
  phone width, button stacking).
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
  - *Nothing pops.* Each layer's intensity eases at 0.4/s, and on top of that
    every raindrop, flake and cloud has its own fade factor (`stepFades`;
    drops/flakes 0.8 s, clouds 2 s): a particle that becomes active ramps in,
    one that is retired (a layer easing out, the governor stepping down)
    keeps moving while it ramps out. Rain and snow stay batched by drawing in
    2 depth x 3 fade-alpha buckets. Wind speed eases (12 km/h per second),
    a reversed wind swings round through vertical (0.6/s), wind streaks keep
    the direction they were born with, the frame rate follows what is
    visible, cloud sprites are built before the fade starts, and a resize
    keeps the fade state. `tests.js` traces every particle's fade factor
    through a scripted storm/drizzle/downpour/snow/clear sequence and fails
    if any particle changes faster than its fade rate. Measured in a real
    browser: painted alpha ramps 0 -> full over ~4 s with no step above 4% of
    the final value.
  - *Clouds scroll with the page.* They draw to their own canvas
    (`.weather-fx--clouds`, `position: absolute`, viewport-tall at the top like
    the sky scenery) so they stay put and scroll away with the hero, natively
    smooth; rain, snow and wind stay on the fixed canvas.
  - The canvas is inserted between `.sakura-scene` and `.atmosphere`, so
    clouds pass in front of the sun/moon and rain falls in front of the
    branches while petals stay on top. New always-on visuals in this layer
    must keep the same rules: no timers, batched paths, an op budget test.
- **Social tiles are solid brand tiles.** `.social-card` is deliberately NOT
  a `.card` member (no glass/refraction — nothing to refract through). The
  design hangs off two custom properties: each network gets a
  `.social-card--<name>` rule in style.css with `--brand-a` (centre, lighter)
  and `--brand-b` (edge, darker); the bevel, gloss, badge and hover are all
  inherited. To add a social: copy a tile in index.html, swap href / mark /
  name / handle, add one modifier rule — then bump the tile count in the
  structural assertions in tests.js and tests.html.
- **Ad-block safe class names.** uBlock Origin / Adblock Plus apply generic
  cosmetic rules from EasyList and Fanboy's lists to every site, and they hide
  by class name. The logo wrapper on each social tile used to be
  `.social-badge`, which Fanboy's Social Blocking list hides (`##.social-badge`),
  so for visitors with an ad blocker (seen on Firefox) every logo vanished and
  the tiles collapsed to name + handle. It is `.social-mark` now. Keep new
  class names near social/share/ad vocabulary off those lists: run
  `node evals/adblock-filters.js` (the eval checks the live lists and exits 1
  on a hit inside the Socials section; `node evals/adblock-filters.js <folder>`
  checks another revision), and `tests.js` pins the known offenders
  (`social-badge`, `social-badges`, `social-follow`, `social-profiles`,
  `social-share`, `social-widget`).
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

## Emoji-free content

User-facing text and metadata contain no emojis. `KazuLib.stripEmoji` removes
emoji sequences from live text and labels via the targeted DOM observer in
`script.js`, with a matching inline fallback. Discord custom emoji images are
not rendered. Blossom particles use CSS petal shapes, forecasts use condition
text, and the Konami dragon uses the existing profile image. Keep both test
lanes and `node evals/emoji-free.js` passing when adding new UI copy.
