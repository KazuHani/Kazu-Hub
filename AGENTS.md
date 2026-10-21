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

- `index.html` — the whole page. Loads `style.css?v=94`,
  `lib.js?v=42`, `site-config.js?v=1`, `i18n.js?v=3`, `script.js?v=90` (version
  query strings; see cache-busting below). Inline JSON-LD schema, the
  `#boot-tint` first-paint script (see "First paint" below) and the
  `#boot-lang` script (see "Language switch" below) in the `<head>`.
- `lib.js` (~1400 lines) — **pure, DOM-free helpers**, exposed as the global
  `KazuLib` (works in browser and Node). Single source of truth for the birth
  config (`BIRTH = { year: 2001, month: 10, day: 9 }`, month 0-indexed), the
  Europe/London wall-clock frame, UK DST maths, age/birthday calculations
  (including the playful equivalents in `ageBreakdown`: full moons, Sun laps,
  years asleep, breaths), calendar export (`.ics`, Google Calendar URL), HTML
  escaping, Steam/MAL data shaping, dev-code matching, scrollbar thumb
  geometry, the Christmas frost pictures (`frostCard`, `frostBorderImage`; see
  "Christmas" below), and the sun/moon sky-arc maths (`sunTimesUK`, `skyBodyState`).
  The arc (`skyArcPoint`) is one sine that runs on past the horizon points
  until both ends are off-screen (`SKY_ARC_OVERSHOOT`, x = -8.08% .. 108.08%),
  so the body slides in and out through the page edges and the sun<->moon
  hand-overs happen off-screen. `script.js` keeps an inline fallback copy of
  `skyArcPoint`; the gate tests run it against `lib.js` so they cannot drift.
- `site-config.js` — the contract for the control panel's settings (`KazuSiteConfig`):
  validates and normalises everything the page will accept from the online store
  (links must be https, ids are pattern-checked, text is stripped of emoji and hidden
  characters, unknown keys are dropped). Pure and DOM-free, loaded after `lib.js`,
  versioned `?v=1`, precached. It is **byte-identical to `shared/site-config.js` in
  the control panel project**: edit it there and copy it here, never the other way.
  See "Control panel" below.
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
- `evals/christmas.js` — gate assertions for the Christmas theme (see
  "Christmas" below): `frostCard`'s geometry and determinism, the festive
  snowfall rule, the frost wiring sliced out of `script.js` and run against fake
  observers, the static decorations, and the footer credit's contrast at every
  hour. Shared by `tests.js` and `tests.html` (which adds live frame checks);
  also runs alone (`node evals/christmas.js`).
- `evals/modal-motion.js` — gate assertions for the pop-up motion (see
  "Pop-up motion" below). Shared by `tests.js` and `tests.html` (which adds
  live frame sweeps); also runs alone (`node evals/modal-motion.js`).
- `i18n.js` — the English / Japanese switch (`KazuI18n`). Pure, DOM-free
  translation core (phrase table + rules for text `script.js` composes) plus
  a thin DOM shell that only runs while Japanese is on. Loaded after
  `site-config.js` and before `script.js`, versioned `?v=1`, precached. See
  "Language switch" below.
- `evals/i18n.js` — gate assertions for the language switch: every visible
  string and label in `index.html` has Japanese (or is a name on `KEEP`), the
  run-time text families read out of `script.js` all translate, a table of
  composed strings, the DOM translator against fake nodes, and `#boot-lang`
  against `pickLang`. Shared by `tests.js` and `tests.html`; also runs alone
  (`node evals/i18n.js`).
- `evals/phone-type.js` — gate assertions for phone text that grows with the
  screen, page and pop-ups (see "Phone text" below). Shared by `tests.js` and
  `tests.html` (which measures every rule in a phone frame); also runs alone
  (`node evals/phone-type.js`).
- `evals/link-safety.js` — gate assertions for links from outside the site
  (see "API links" below): a hostile corpus (`javascript:`, `data:`, http
  downgrades, lookalike hosts, credentials, odd ports) through every lib.js
  builder that makes a link, plus a pin on every href sink in `script.js`.
  Shared by `tests.js` and `tests.html`; also runs alone
  (`node evals/link-safety.js`).
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
  seasonal loops (petals, rain drops, aurora, the Pride halo)
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

## Christmas (25 December)

Christmas is the visitor-local 25 December (`seasonState`), previewed with
`?season=christmas` or the dev panel. It owns the palette (pine, cranberry,
gold; `body.season-christmas`) and on top of it the page freezes over:

- **Frozen cards.** Every card and social tile gets snow lying along its top
  edge, frost ferns growing in from its corners, a frosted haze and an icy rim.
  It is one CSS border-image per card: `KazuLib.frostCard({ w, h, r, seed })`
  draws the SVG and `frostBorderImage` turns it into the `--xf` value that
  `html body.season-christmas .xmas-frost` uses. A border-image is the only paint
  CSS allows outside a box that clips its own content (every card is
  `overflow: hidden`, the below-fold ones `content-visibility: auto`), which is
  how the snow sits ON the card (13px proud, `FROST_RISE`) and lifts with it on
  hover. It is a 9-slice: corners keep their shape, straight edges stretch, the
  middle is never drawn (frost stays at the edges, never behind the middle of
  the text). Seeded by the card's place on the page, so no two cards match and a
  reload draws the same frost. `script.js` ("Christmas frost") draws a card when
  it nears the viewport (IntersectionObserver, 600px margin), one card per idle
  slice (`scheduleIdle`), and redraws only on a real width change (over 8%) or
  a card grown too short for its corners (ResizeObserver). Cards the control
  panel rebuilds are picked up by `frostRescan` from `applySiteConfig`. Grid row
  gaps and section-title margins open up while the season is live so the snow
  never touches the card above. Static paint: shown on phones and in low-power
  mode too. `border-width: 0` keeps every card's layout as it was.
- **Frozen pop-ups.** A stat tile's pop-up keeps the snow on top: `openModal`
  calls `frostModal(modalPanel, seed)` once the panel is laid out and before
  the fly-in, so the panel grows out of the (hidden) card already wearing its
  snow. Drawn at once, not in an idle slice (one picture per click, needed on
  the first frame), seeded per pop-up (101 + its index in `MODALS`), and
  size-watched while open; `closeModal` calls `frostModal(null)` and the snow
  rides the panel back onto the card. On phones (`max-width: 560px`) the
  overlay starts 23px down and the panel's `dvh` cap shrinks to match, because
  a real phone's `vh` is taller than its `dvh` and a tall pop-up otherwise
  sits 10px from the top with its snow cut off.
- **Snow in flight.** The pop-up is clipped to a true-size box in flight (see
  "Pop-up motion" below), and a border-image under a clip-path would be cut
  off, so it cannot wear its own snow while flying. `flyModal` calls `frostFly`: the panel's own frost
  is hidden (`border-image-source: none` inline) and a `.frost-flight` layer
  over it carries two true-size copies, the card's picture and the panel's.
  Each copy is its 9-slice cut into eight pieces (`KazuLib.frostPieces`: four
  corners at natural size, four edges stretched along their length only, the
  middle never drawn), every piece one slice of the picture as a background,
  moved by `transform: translate() scale()` alone with the panel's duration
  and easing. `KazuLib.frostFlightPieces` lays each piece out at the larger of
  its two end sizes (its slice stretched to fit by `background-size`, which
  is why the frost SVG has `preserveAspectRatio="none"`; at natural size,
  i.e. every border-image, that changes nothing) and only ever scales it down:
  the compositor rasterizes an animated layer at its largest scale, and an
  edge laid out at the card's size and scaled up 4.7x was rastered ~14x on a
  3x phone. Edges are cropped to `depth` (from `frostCard`: the snow and the
  11px haze band, +1px), because between the corners nothing is drawn deeper
  (crystals and corner haze fade out within `reach` of their corner; tests.html
  renders pictures at 3x and checks those pixels are all transparent). Each
  picture's url() is parsed once, in a rule in the layer's own `<style>` that
  its eight pieces share: as an inherited custom property every piece
  re-tokenized the ~18 KB data URI and a phone's take-off style pass went from
  ~5 ms to ~30 ms. Every piece's position and stretch are linear
  in the box, so the straight-line box path interpolates to the exact
  border-image on every frame: the snow keeps 13px and the corners stay
  whole. Transform-only means the copies run on the compositor, like the
  panel's own flight (transform + `clip-path`, which Chrome 152 composites:
  checked by blocking the main thread mid-flight, where a `left`-animated
  control froze and the panel and snow kept growing together). So the snow
  cannot lag the box when the main thread is busy, and nothing repaints per
  frame. Each corner bleeds `FROST_BLEED` (1px) into its edges: two layers
  meeting at a fractional pixel each anti-alias it and the background showed
  through as a hairline. They cross-fade on the box's
  own progress (same easing), so open and close mirror by shape: the panel's
  picture fades in only once the box is at least two of its corners
  (`2 * reach`) each way (any smaller and the browser shrinks the whole
  9-slice, snow and all), then the card's fades out. The picture being flown
  to sits underneath, so one copy is always whole and the snow never thins,
  with no blend mode. `frostLand` (on the flight's finish, and before any new
  flight) removes the layer and restores the panel's own frost. The layer is a
  0x0 anchor with `contain: size layout style`: no screen-sized box and no
  `plus-lighter`/`isolation`, which measured as an offscreen pass every frame.
  Cost (`node evals/perf.js --scenarios modal --date 2026-12-25T12:00:00Z`,
  missed frames a run, against the same build with `frostFly` disabled,
  three runs each, 2026-10-16): desktop the same (72 vs 73 on a loaded
  machine, 35 vs 36 on a quiet one); phone 5 vs 10. The phone cost is one
  longer take-off frame per flight (painting the 16 new pieces on a
  4x-throttled CPU); the flight itself keeps running on the compositor. Tried
  and measured: building the second copy a frame later would save at most ~2
  (one copy alone measured 9), and a lighter SVG for the edge pieces ~1 (not
  worth editing the data URI); laying pieces out at their larger end took it
  from 17 to 11, cropping the edges to their depth to ~10.
  The earlier main-thread copies cost nothing on a phone, but froze in exactly
  those heavy take-off frames, so the snow lagged the box at the start of
  every flight. The copies follow the same
  straight-line box as the clipped panel, so they sit exactly on it (tests.html
  checks every 10ms against the clipped box, not the panel's bounding rect).
- **Snowfall (desktop only).** `KazuWeatherFx.layersFor(w, { festive: true })`
  adds a light snow (`FESTIVE_SNOW`, 0.32) whatever the sky is doing, unless it
  is really raining (rain and snow never share the canvas) or already snowing
  harder; it invents no cloud. `applySeasons` flips `christmasLive` and re-syncs.
  Same canvas, same guards and budget as real snow; phones get none.
- **Decorations.** String lights along the top of the page (`.xmas-garland`,
  static SVG, steady bulbs, no twinkle loop; the centre hook sits over the
  profile picture), and in the footer a snowman, a wreath on the cottage door
  and lights under the eaves (`.mf-christmas`, its colours are day/night
  `--mf-*` tokens like the rest of the field). There is deliberately no
  Christmas tree and no Santa hat on the avatar: the owner removed both
  (2026-10-14), and a gate test keeps them out.
- **The footer at night** stays snow (moonlit blue-grey `--n-*` overrides), and
  the credit line switches ink at 65% daylight (`--m-ink`): dark on bright snow,
  light over a deeper bottom shade once it is darker. The switch point is where
  both pass WCAG AA; `evals/christmas.js` sweeps the whole day.
- **Phones** keep the pine cards in low-power mode
  (`body.low-power.season-christmas` outranks the slate low-power fill).
- **Cost** (`node evals/perf.js --date 2026-12-25T12:00:00Z`): frost, lights
  and footer add nothing measurable at idle on desktop. Desktop idles like any
  snowy day (~0.21 cores, the weather canvas; 5 recalcs a second, inside the
  idle budget; no running CSS animations, since the tree and its twinkle loop
  are gone). Phone load on Christmas Day: TBT ~140 ms vs ~120 ms without the
  frost (it was ~280 ms before the frost moved to idle slices).
- **Known gap** (unchanged): the Christmas palette and decorations are applied
  by `script.js`, so 25 December shows the blue tint for a moment first.

## Pop-up motion

A stat tile opens into its pop-up and closes back onto it (`flyModal` in
`script.js`). Up to 2026-10-16 this was a `transform: scale(sx, sy)` FLIP: a
360px-wide phone pop-up scaled to a half-width card was about 0.47 x 0.17, so
its corners became flat ellipses (desktop animated `border-radius` to
compensate; phones skipped that for speed and went almost square), and the
shape only matched the card at the two ends.

- **Morph, not scale.** `KazuLib.modalMorphFrames(from, to, cardR, panelR)`
  returns two keyframes: the panel keeps its real size, a translate carries its
  top-left corner along the path and a `clip-path: inset(... round r)` trims it
  to the box on that path, the radius going from the card's to the panel's.
  Every frame is a real rounded box, the card exactly at one end and the panel
  exactly at the other, on every device. A scale appears only for an axis where
  the card is bigger than the panel (a clip cannot grow a box), with the radius
  divided by it. The content keeps its real size and fades in as the box opens.
  Both the panel and the shadow box have `transform-origin: 0 0`; the maths
  assumes it.
- **Shadow.** The clip cuts the drop shadow off, so `flightShadow` puts a
  shadow-only box (`.modal-flight-shadow`, the panel's outer shadows from
  `KazuLib.outerShadows`, inset glint dropped) under the panel, flown by
  transform alone. `flightShadowLand` removes it when the flight finishes or a
  new one starts.
- **No page shift.** `body.modal-open { overflow: hidden }` used to drop the
  native scrollbar where one shows (touch with classic bars, no-JS), widening
  the page 15px and moving the card under the pop-up as it took off.
  `html { scrollbar-gutter: stable }` keeps the gutter; no effect with
  `html.has-cscroll` (no native bar) or overlay scrollbars.
- **Phone text:** see "Phone text" below.
- **Cost** (`node evals/perf.js --scenarios modal --date 2026-12-25T12:00:00Z`,
  vs the scale FLIP): desktop 41 to 36 missed frames, phone 3 to 3.
- **Tests.** `evals/modal-motion.js` (shared by `tests.js` and `tests.html`,
  also `node evals/modal-motion.js`) walks the keyframes the way the browser
  interpolates them (exact card and panel at the ends, straight-line path,
  round corners every step), checks the shadow parsing, pins the wiring and
  the CSS. `tests.html` freezes real flights every 10ms on desktop and phone
  (`shapeSweep`): round corners, exact card and panel ends, shadow box on the
  clipped box.

## Phone text

On phones (`max-width: 560px`) text grows with the screen. Every fixed size B
becomes `clamp(B, B/3.2 vw, 1.3B)`: B (the old phone size) at 320px and below,
B x width / 320 above that (17% bigger at 375px), capped at 30% from 416px.
Sizes already written in `vw` (the title, stat values, headlines) already grew
and are left alone.

- **Two generated blocks at the end of `style.css`.** "Page text": one
  `body <selector>` rule for every fixed px font-size in the main phone block
  (before its modal rules). "Pop-up text": one `.modal-overlay .modal-panel
  <class>` rule for every text class the pop-ups render, which outranks the
  per-pop-up phone overrides (age, countdown). Both come after everything they
  override. Changing a base size in the main phone block means changing its
  rule too; `evals/phone-type.js` re-derives the list and fails otherwise.
- **Columns that hold growing text grow with it.** The PC storage size column
  is `clamp(72px, 22.5vw, 93.6px)`: "240 GB" at 20px is 65px in Fredoka but
  69px in the fallback font shown until Fredoka loads, which already spilled
  the old fixed 68px column.
- **`100vw`** excludes a classic scrollbar, because the gutter is reserved
  (`scrollbar-gutter: stable`, see "Pop-up motion"). Phones have overlay
  scrollbars, so there it is the screen width.
- **Tests.** `evals/phone-type.js`: every rule keeps the formula, the page
  block covers exactly the main block's fixed sizes with the same bases, the
  pop-up block covers every pop-up text class, the order, the storage column.
  Its sources are normalised to LF (a Windows checkout has CRLF files).
  `tests.html` reads every growing rule the phone frame actually loaded,
  measures it on the page against `100vw`, and checks that no text spills
  sideways (page and pop-ups) and the page never scrolls sideways.

## Conventions and gotchas

These are load-bearing; read before editing.

- **Cache busting.** CSS/JS are versioned by query string. After editing
  `style.css`, `script.js`, `lib.js` or `site-config.js`: bump the `?v=` in `index.html` (and
  in `tests.html` for `lib.js`, `site-config.js` and the fetched sources), keep the matching entries in `sw.js`'s
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
  (`html:not(.no-sakura)`), and Christmas repaints it as a snowy field (moonlit
  snow by night, with a snowman, a door wreath and eave lights). Static
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
- **API links.** Escaping cannot make a hostile link safe (`href="javascript:..."`
  is valid markup), so any link that arrives from an API, a CORS proxy or a
  localStorage copy goes through `KazuLib.safeLink(url, hosts)` in the lib.js
  builder that shapes it: https only, default port, no credentials, host on the
  card's list (`MAL_HOSTS`, `LETTERBOXD_HOSTS`, `SPOTIFY_HOSTS`). A refused link
  falls back to a URL built from a validated id, or the row is dropped. Links
  built from a fixed host plus a checked id (Steam app ids, YouTube video ids)
  need no list. Adding an href sink to `script.js` fails `evals/link-safety.js`
  until it is added to that file's reviewed list with the reason it is safe.
- **Style.** Plain ES5-ish in `lib.js` (`var`, function expressions, IIFE
  attaching to a global), modern JS (arrow functions, `const`/`let`) in
  `script.js` and `sw.js`. Heavy header-comment banners explain intent at the
  top of each file and each section; match that density. 2-space indent.
- **Service worker.** `sw.js` must never serve stale content while online:
  network-first for pages, versioned-URL cache-first for assets, and live
  APIs always fetched fresh. Preserve that strategy.
- **localStorage keys in use:** `kazu-dev-seasons`, `kazu-discord-cache`,
  `kazu-mal-cache`, `kazu-mal-manga-cache`, `kazu-lb-cache`, `kazu-ytm-cache`,
  `kazu-site-config`, `kazu-notice-dismissed`, `kazu-lang`, `kazu-mal-ja`. Don't collide.

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

## Control panel (settings changed without a deploy)

The owner edits some content in a local control panel (a separate project, "Backend
Of Kazu Hub") and it goes live in seconds, with no commit. The panel saves a small
settings document to a Firebase Realtime Database; the page reads it on every load.

- **The address** is `<meta name="kazu-control" content="...">` in `index.html`. The
  panel writes it. Empty means the page is exactly what `index.html` says (no fetch,
  no cache, nothing changes). `#boot-control` in `<head>` starts the download before
  the stylesheet arrives; `loadSiteControl` in `script.js` takes the result over and
  polls once a minute with the other pollers. Only `https://` addresses or a path on
  this origin are ever fetched.
- **Precedence: a managed section overrides the HTML.** A section the panel manages
  is present in the settings (socials, stories, pc, playlist, integrations, titles,
  sections, seasons, effects, footer, notice). For those, the live page shows the
  settings and ignores what `index.html` says, **so editing the HTML for a managed
  section will not change the live site.** Sections the panel does not manage are
  untouched and `index.html` stays their source. Ask the owner before assuming the
  HTML is what visitors see. The HTML is still the default and the no-JS fallback,
  so keep it correct.
- **Structure the hook depends on.** It finds things by these class names, so renaming
  them silently turns that block of settings into a no-op: `.socials-grid` and
  `.social-card--<id>` (+ `.social-name`, `.social-handle`), `.stories-grid` and
  `.story-link` / `.story-card` / `.story-title` / `.story-desc` / `.story-cta`,
  `.pc-spec-card--graphics|platform|storage|build`, `.music-card` and its
  `.music-playlist-name|sub`, `.right-now-grid`, `.discord-card|steam-card|mal-card|lb-card`,
  `.meadow-credit`, the `h2.section-title` just before each grid, and `#hubBulletin`.
- **Declarations the panel's importer reads.** `DISCORD_ID`, `STEAM_VANITY`, `MAL_USER`,
  `LB_USER` and `YTM_PLAYLIST_ID` are `let`s set through `siteId(...)` / `siteValue(...)`.
  The last quoted value on each line is the page's own default and the importer reads
  it, so keep that shape (`evals/site-control.js` pins it).
- **Safety rules.** Settings never reach `innerHTML`: text goes in through `textContent`,
  links only after `KazuSiteConfig` has checked them, colors as validated hex. Any failure
  (offline, bad data, newer schema, blocked storage) leaves the page as it is. The last
  good copy is cached in `localStorage` (`kazu-site-config`) so a repeat visit applies it
  before the first paint, and the inline `#boot-tint` script reads its season overrides
  from the same cache.
- **Undo.** Every edit the hook makes is recorded (`ovText`, `ovAttr`, `ovClass`,
  `ovStyle`, `ovChildren`) and reverted before a newer copy is applied, so handing a
  section back to the HTML restores it exactly.
- **Tests.** `evals/site-control.js` (shared by `tests.js` and `tests.html`) runs the
  contract, the source pins and the real cache and first-paint logic against fakes.
- **Privacy.** Every visit makes one request to the Firebase host named in the meta tag.

## Language switch (English / Japanese)

A pill at the top right of the page (`.lang-switch`, first thing in
`.container`) switches between English and 日本語. **English is the page's own
language and the default**; Japanese is a layer that `i18n.js` puts on top, so
`index.html` and `script.js` stay plain English and know nothing about it.

- **How text gets translated.** `KazuI18n.translate(text)` returns Japanese or
  `null`: an exact phrase table first (`PHRASES`, keys whitespace-collapsed
  with straight apostrophes), then `RULES` for text `script.js` builds at run
  time (the clock goes 24-hour, en-GB dates become `2026年10月19日(月)`,
  countdowns, Steam hours, MAL progress, Discord timers, toasts), and
  `"A · B"` is translated part by part. Anything unknown stays English, so live
  content and control-panel text are never mangled.
- **The DOM shell.** Switching to Japanese walks `<body>` once (text nodes plus
  `title` / `aria-label` / `alt` / `placeholder`) and connects a
  MutationObserver that translates whatever `script.js` writes afterwards
  (callbacks run before the next paint, so no English flashes). Every swap is
  recorded; switching back puts the exact originals back (keeping any fresh
  English `script.js` wrote meanwhile), reverses stray Japanese phrases, and
  disconnects the observer. **The English page runs none of it.**
- **Never translated:** `SKIP_SELECTOR` in `i18n.js` (live names and titles:
  Discord / Steam / Spotify fields, game, anime, film and song titles, the quote,
  story titles, the dev panel) and anything marked `translate="no"`. Put new
  live-content elements there. Product names (the PC parts), brand kickers
  (DISCORD, STEAM, YOUTUBE MUSIC), handles, song, film and story titles stay
  English on purpose: that is how Japanese sites write them.
- **Live data with its own Japanese: `data-ja`.** An element with
  `data-ja="..."` and a single text node shows that text in Japanese mode, even
  inside `SKIP_SELECTOR`, and is restored on English. The MAL card uses it:
  `script.js` asks AniList's public GraphQL API (`graphql.anilist.co`, no key,
  CORS-clean) for each row's native title by MAL id, one POST for every anime
  and manga row (`KazuLib.anilistTitlesQuery` / `anilistTitlesParse`; ids come
  out of the row url via `malIdFromUrl`). It only asks while the page is in
  Japanese, and again on `kazu-langchange` (fired by `i18n.js` on every
  switch). Titles are kept in `kazu-mal-ja` (at most 100 per kind,
  `malJaCacheParse`); an id AniList doesn't answer for is not asked again that
  visit. MAL's own feeds carry no Japanese title (`load.json`'s
  `title_localized` is null), hence AniList.
- **The quote.** zenquotes is English only, so Japanese mode shows a quote
  from `QUOTES` in `i18n.js` (`[English, Japanese, author in Japanese]`):
  the quote's own translation when it is one of `FALLBACK_QUOTES`, otherwise
  `QUOTES[hash(text) % n]`, the same pick every time for the same English.
  `createQuoteSync` keeps text and author paired and puts the latest English
  back on a switch. A gate test fails if a `FALLBACK_QUOTES` line in
  `script.js` has no row in `QUOTES`. Japanese quotes are upright in 「」.
- **Japanese labels run longer.** Header pills (`.pill-link`) and `.retry-btn`
  are `white-space: nowrap; flex-shrink: 0` so プロフィール → and 再試行 never
  break over two lines; gate-tested.
- **The choice** is saved as `kazu-lang`; `?lang=ja|en` wins for one load without
  saving. With neither, the **device language** decides: the first entry in
  `navigator.languages` (falling back to `navigator.language`) whose primary
  subtag is `en` or `ja` (`deviceLang`), else English. So `ja-JP` gets
  Japanese, `['fr-FR', 'ja']` gets Japanese, `['en-GB', 'ja']` and `de-DE`
  get English. The device pick is never saved; only a tap on the switch is,
  so a saved choice always beats the device. Order: `?lang=` > `kazu-lang` >
  device > English (`pickLang(search, stored, langs)`).
  `#boot-lang` in `<head>` reads the same choice before first paint: it
  sets `<html lang="ja">` and `html.i18n-pending` (page text hidden) until
  `i18n.js` has run, with a 3 s failsafe. A gate test sweeps it against
  `pickLang` over query x saved value x device languages x blocked storage.
- **Adding or changing copy.** Add the Japanese line to `PHRASES` (or a rule for
  composed text). Names, brands and product models go on `KEEP` in
  `evals/i18n.js` instead. The gate fails on any visible string or label in
  `index.html` that has neither, and on a new weather condition, status,
  pop-up title or empty state in `script.js` without Japanese. Japanese values
  must be unique (switching back looks them up in reverse) and emoji-free.
- **Colours follow the palette.** The switch (and the announcement strip's
  default tone) paint with `--chip-bg`, `--chip-bd` and `--on-accent`, set in
  every palette block that sets `--accent` (default `body`,
  `body.season-christmas`, `html.season-halloween body`). `--chip-bg` is the
  card colour made near-solid (alpha >= .85) because the switch has no blur;
  `--on-accent` is the dark label on the accent-filled pressed button. A new
  palette must set all three: `evals/i18n.js` finds every `--accent` block and
  fails if one is missing or if the idle or pressed label drops under 4.5:1.
- **Layout notes.** The birthday pop-up head puts the age first in Japanese;
  its counter (歳) comes from a `html[lang="ja"]` `::after` rule in `style.css`.
  Zodiac signs, weekdays and fonts need nothing else: the page's fonts have no
  kana, so browsers fall back per glyph to the system Japanese font
  (`<html lang="ja">` makes them pick Japanese glyph forms).
- **Chiikawa peek (Japanese only).** `assets/chiikawa.webp` (trimmed from
  `assets/Chiikawa.png`, 192px wide for 2x) sits dead centre behind the
  profile picture (`.chiikawa-peek`, `z-index: 0` under `.pfp`'s `1`), tilted
  -38deg toward the upper left, clear of the Halloween pumpkins and the party
  hat. `display: none` unless `<html lang="ja">`, and `loading="lazy"`, so the
  English page never downloads it. A peek is the one-shot `chiikawaPeek`
  keyframes (3.4 s: slide out along the tilt, wobble, hold, slide back);
  `initChiikawaPeek` in `script.js` adds `.is-peeking`, drops it on
  `animationend` and re-arms a timer: first peek 1.2 s after the page turns
  Japanese (after the picture's entrance pop), then every 7-12 s
  (`KazuLib.chiikawaPeekDelay`). No timer while the tab is hidden or the
  picture is scrolled away (IntersectionObserver). Never an infinite CSS loop
  (perf guards). `KazuLib.chiikawaPeekMode`: reduced motion parks it in the
  peek pose (`.is-still`); low-power still animates on purpose, because every
  phone trips low-power and the peek is one composited transform. Gates:
  `evals/chiikawa.js` (helpers, markup, CSS, and the real loop sliced out of
  `script.js` against fake timers).
- **Not translated by design:** the quote (English source text), song, game,
  anime and story titles, and announcement text from the control panel unless
  it matches a known phrase.

## Emoji-free content

User-facing text and metadata contain no emojis. `KazuLib.stripEmoji` removes
emoji sequences from live text and labels via the targeted DOM observer in
`script.js`, with a matching inline fallback. Discord custom emoji images are
not rendered. Blossom particles use CSS petal shapes, forecasts use condition
text, and the Konami dragon uses the existing profile image. Keep both test
lanes and `node evals/emoji-free.js` passing when adding new UI copy.
