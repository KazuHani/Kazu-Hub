# AGENTS.md — Kazu Hub

Guidance for AI coding agents working in this repository. Read this first.

## Project overview

Kazu Hub is a personal hub page for Kazu Hani ("Arctic Dragon ❄️🐉"), deployed
as a static site on GitHub Pages at `https://kazuhani.github.io/Kazu-Hub/`
(repo: `KazuHani/Kazu-Hub`, default branch `Main`).

Stack: **vanilla HTML/CSS/JS only. No framework, no build step, no package
manager, no dependencies.** There is no `package.json`, `pyproject.toml`, or
any other manifest — do not add one. The only tooling is Node (used solely to
re-hash the inline scripts, `tools/csp-hashes.js`) and a static file server for local preview.

The look is the flat editorial redesign (see "Redesign" below). The sky,
sakura, weather canvas, seasonal themes, meadow footer and dev panel were
deleted on 2026-10-27. The page shows: live stat cards (UK time, Aberystwyth weather, age, birthday
countdown); a "right now" section with live Discord
presence (Lanyard, WebSocket + REST fallback), Steam status, MyAnimeList
watching/reading (Jikan, falling back to MAL list endpoints through
the shared CORS proxy list in `proxyFetch`: `api.cors.lol`, then `api.allorigins.win`, each rested for 4 minutes after an error/429/5xx via `KazuLib.backoffCreate` (the rest must stay shorter than Steam's 5-minute poll, or the next poll finds every proxy resting and fails unsent); Jikan is rested the same way), and the latest Letterboxd diary entry (RSS via the same
proxy); a YouTube Music playlist card whose "From the playlist" rows update
themselves from the playlist's Atom feed (`feeds/videos.xml`, via the same
proxy, newest additions first), plus an optional ListenBrainz "recently played" strip (its markup is currently absent, and the page does not even fetch while it is);
socials; and in-progress stories. It is installable as a PWA-lite (manifest +
`sw.js` offline shell) and custom scrollbars.

## Code layout

- `index.html` — the whole page. Loads `style.css?v=140`,
  `java/lib.js?v=52`, `java/site-config.js?v=2`, `java/i18n.js?v=8`, `java/script.js?v=112` (version
  query strings; see cache-busting below). A Content-Security-Policy meta at the
  top of `<head>` (see "Content-Security-Policy" below), inline JSON-LD schema,
  the `#boot-cards` hold (see "Live-card cache" below), the
  `#boot-handlers` script and the `#boot-lang` script (see "Language switch"
  below) in the `<head>`.
- `java/lib.js` (~1700 lines) — **pure, DOM-free helpers**, exposed as the global
  `KazuLib` (works in browser and Node). Single source of truth for the birth
  config (`BIRTH = { year: 2001, month: 10, day: 9 }`, month 0-indexed), the
  Europe/London wall-clock frame, UK DST maths, the birthday countdown, HTML
  escaping, Steam/MAL data shaping, scrollbar thumb
  geometry and the low-power verdict.
  hand-overs happen off-screen. `java/script.js` keeps an inline fallback copy of
  `skyArcPoint`; keep the two in step.
- `java/site-config.js` — the contract for the control panel's settings (`KazuSiteConfig`):
  validates and normalises everything the page will accept from the online store
  (links must be https, ids are pattern-checked, text is stripped of emoji and hidden
  characters, unknown keys are dropped). Pure and DOM-free, loaded after `java/lib.js`,
  versioned `?v=1`, precached. It is **byte-identical to `shared/site-config.js` in
  the control panel project**: edit it there and copy it here, never the other way.
  See "Control panel" below.
- `java/script.js` — all DOM behaviour: stat cards, live API integrations (Lanyard,
  Steam, Jikan/MAL, Letterboxd, YouTube playlist feed, ListenBrainz,
  ZenQuotes), custom scrollbars. It consumes `KazuLib` but keeps inline fallbacks
  for the lib helpers it needs, so the page still works if `java/lib.js` fails to
  load. User-facing IDs (`DISCORD_ID`, `STEAM_VANITY`, `MAL_USER`, `LB_USER`,
  `LISTENBRAINZ_USER`) are constants near the top of each section.
- `style.css` — all styling; the REDESIGN block at the end is the look that ships.
- `sw.js` — service worker. Network-first for navigations, cache-first for
  same-origin versioned assets, cross-origin requests (live APIs, fonts)
  untouched. Precache list mirrors the `?v=` URLs from `index.html`.
- `java/i18n.js` — the English / Japanese switch (`KazuI18n`). Pure, DOM-free
  translation core (phrase table + rules for text `java/script.js` composes) plus
  a thin DOM shell that only runs while Japanese is on. Loaded after
  `java/site-config.js` and before `java/script.js`, versioned by `?v=` (see cache busting), precached. See
  "Language switch" below.
- `robots.txt`, `sitemap.xml`, `site.webmanifest` — static
  plumbing. `assets/` holds images/icons.
- `tools/csp-hashes.js` — checks the SHA-256 hashes of the inline scripts against the
  Content-Security-Policy in `index.html`; `--fix` rewrites them (see "Content-Security-Policy").
  The only Node tool in the repo. There are no tests, evals or CI.

## Run locally

Static site — open `index.html` directly, or serve the folder:

```
python -m http.server 8000
# → http://localhost:8000
```

Preview/dev affordances built into the page:

- `?fireworks=1` previews the 20-second New Year fireworks on
  any date, once per page load. It doesn't change the real celebration latch.

## Verification

There is no automated test suite, eval suite or CI: they were removed on 2026-10-27
because none of it is needed to run the site. To check a change, serve the
folder (see "Run locally"), load the page, read the console and exercise what you
changed. `?fireworks=1` forces the New Year show.

One script still matters: after editing an inline `<script>` in `index.html`, run
`node tools/csp-hashes.js --fix` (see "Content-Security-Policy"), or the browser
blocks that script.

## Performance rules (load-bearing)

A real-browser measurement (Chrome over the DevTools protocol) once found the page
burning a full CPU core at rest and missing every scroll frame on a throttled
phone; idle then sat around 0.01 cores. These rules keep it there. Nothing
enforces them any more, so open the Performance panel after touching animation,
observers or the boot path.

- **Idle must be idle.** At rest the page does one style recalc and one layout
  a second (the clock). The budget was: no running transition, at most 6
  recalcs or layouts a second, at most 4 long tasks a minute. Measure idle
  unthrottled on purpose: the DevTools CPU throttle itself burns renderer CPU,
  which would drown the number idle exists to measure.
- **No invisible or always-on animation.** Any running CSS animation or
  transition, even compositor-only, even a 5px progress bar, makes the
  compositor and GPU process produce a frame on every vsync (144 a second on a
  fast display): about 0.19 CPU cores each, measured on a bare test page. The
  new infinite loop needs a reason, and must never sit on a base rule while
  invisible: an invisible infinite animation still costs a frame per vsync
  (the removed Pride halo ran all year at opacity 0, ~0.3 cores).
  Where a loop can afford a lower frame rate it can be stepped: `steps(n)` is
  only valid on a LINEAR animation; on an eased one it would flatten the
  easing, so those stay smooth. For a small,
  long-lived indicator
  prefer discrete steps: the Spotify bar steps four times a second off a timer
  that exists only while a song plays and the tab is visible, and
  `.spotify-bar-fill` is a `transform`, never a width.
- **Never transition an inherited custom property** (or anything else that
  restyles the whole document per frame). The old sky tint was a 90 s transition on
  `--bg-h/s/l/glow`, retargeted every minute, so one was always running: every
  frame restyled ~1,000 nodes. A throttled phone missed 200 of 201 scroll frames.
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
  `<body>`, a copy of `KazuLib.lowPowerMode` over the same six flags; keep the two in step) settles `body.low-power` before anything
  paints. Before it existed, every phone started the entrance animations and
  frosted glass it was about to cancel: the profile picture, title and stat
  cards sat at opacity 0 behind those animations, so first contentful paint
  waited for `java/script.js`. Phone FCP is ~26% earlier (4x-throttled profile,
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
  text ever changes, change `text=` too: any character outside the subset
  falls through to Fredoka.
- **Phones are low-power by construction.** `lowPowerMode` counts a coarse
  pointer and a small screen as two weak signals, and every phone has both, so
  every phone runs in low-power mode: no particles, no backdrop blur, no glass
  refraction, no entrance or scroll-reveal motion, no wheel-lerp. What phones
  keep: hover and
  press feedback. Tablets and narrow desktop windows get the full effects with
  the mobile layout. (`particleCount`'s phone density tier is therefore dead
  code.) Changing that is a product decision, not an optimisation. (The
  comment on `lowPowerMode` in `java/lib.js` says a weak phone needs three signals,
  but the code trips on two.)

## New Year (UK midnight)

The existing visible-tab clock tick checks `newYearCelebrationYear` using
the real Europe/London date. At 12:00 AM on 1 January it starts a finite,
silent 20-second fireworks show. The first
minute allows a page opened/resumed just after midnight to join in; later
visits don't trigger a delayed celebration. The `kazu-new-year-celebrated`
**sessionStorage** key prevents repeats on reload within a tab, with an
in-memory fallback when storage is blocked. Previews never
trigger it; `?fireworks=1` is a separate preview.

Reduced-motion and low-power devices skip the show. The
canvas uses half CSS resolution and at most 30 fps; spark motion is analytic
in `KazuLib.fireworkSparkState`, mirrored in `java/script.js`. Completion,
visibility loss and pagehide remove temporary DOM, rAF, timers and listeners.

## Fluid sizing

Every text size and picture size has one rule from the smallest phone to the
widest desktop. Nothing jumps at a breakpoint, nothing gets smaller as the
window gets wider, and a large phone, a tablet and a desktop read the same
sizes. (Before, phones grew their text to 1.3x and then dropped back to the
smaller desktop sizes at 561px; the name fell from 112px to 57px at 769px; the
stat values leapt from 25px to 42px at 561px and overflowed their cards from
720px to 1090px; "Right now" sat 3 + 1 on every desktop and the socials 5 + 2.
The real-Chrome sweep counted 1158 problems on that build, 0 now.)

- **The formula.** A size that differs between a phone and a desktop is
  `clamp(B, B/3.2 vw, P)`: B on a 320px screen, `B x width / 320` above it,
  held at P (never below B) from `320 x P / B`, which is about 470px at most.
  P is the larger of the old desktop size and the old phone cap (1.3B), so
  phones keep what they had and tablets and desktops got the bigger phone
  sizes (desktop text is 10-30% larger than it was: section titles 28.6px,
  card names 23.4px, body copy 15.6-19.5px, the quote 22.1px). Small labels
  that were a fixed 11px everywhere are `clamp(11px, 3.4375vw, 13px)`.
  Paddings, gaps and radii use the same form, so cards keep their proportions.
- **Width media queries change layout only.** Columns, stacking, a border
  moving from the left to the top: never a `font-size`, and never a width or
  height for the pictures (`.pfp`, avatars, covers, social marks, the
  back-to-top button). The one reviewed exception is card-sized
  (`.pc-spec-list--build dd`, see below). The ≤560px block holds only the
  toast and touch press feedback.
- **The stat values fill their cards without container units.** Every
  padding and gap around a stat card grows in step with the window up to
  560px, so a card's inner width is 40% of the window there, and the value is
  `clamp(16px, 6.6vw, 36px)`: 16.5% of the card, room for the widest clock
  string ("00:00:00 am": 5.48em in Fredoka, 5.73em in the fallback font)
  down to 280px. The cards must NOT be size containers: a
  container re-runs style for its contents whenever its layout runs, and the
  clock re-lays out its card every second (+2 style recalcs a second at rest,
  over the idle budget; tried and measured).
- **Text sized to its own card** uses container units: the PC specs (`cqi`
  inside `.pc-spec-card`, which is below the fold and never changes at rest).
  It follows its card, so it can change where the card's width changes (the
  PC bento at 860px); it must always fit the card.
- **Grids never leave an orphan.** Stats: 2 x 2, then four across from
  1110px, where the four-up card already holds the 36px cap even with a 17px
  desktop scrollbar (so the value does not shrink when the grid splits).
  "Right now": one column, 2 x 2 from 680px. Socials: flex rows of equal
  tiles, two across with the odd last tile full width, then four with the
  last three centred from 760px ("MyAnimeList" is 113px at 19.5px, 121px in
  the fallback font; a four-up tile has 127px inside at 760px). Stories:
  `minmax(min(100%, 300px), 1fr)`, one or two across.
- **Readable floors.** 10px at 320px, 12px from 390px wide, for every text on
  the page.
- **`100vw`** excludes a classic scrollbar, because the gutter is reserved
  (`scrollbar-gutter: stable`). Phones have overlay
  scrollbars, so there it is the screen width.
- **Never** wrap the page in a size container: `container-type` gives layout
  containment, and the fixed back-to-top button inside `.container` would be
  positioned against it instead of the screen.
- **Changing a size** means changing its one rule. Keep every font-size in one of the
  existing shapes (`clamp(B, B/3.2 vw, P)`, or the card-sized `cqi` form), and after any
  layout edit look at the page from 320px to 1920px, mouse and touch, English and
  Japanese.

## Redesign (the look that ships)

The page looks like the editorial, flat redesign: a warm paper canvas
(`#F7F6F3`) or near-black (`#111316`, from `prefers-color-scheme`; there is no
toggle), Figtree for text, Fraunces (italic for the name and the wordmark,
upright for the quote and the story titles), Noto Sans JP for Japanese,
hairline rules instead of glass cards, one accent. It is the LAST block of
`style.css` ("REDESIGN"), written with CSS nesting inside `body:not(#rd)` /
`html:not(#rd)`. The `:not(#rd)` adds an id's worth of specificity, which is
how the layer beats the legacy rules above it (the base palette, per-card
glass) without `!important`; `!important` appears only where the markup has
inline colours (card titles, pills, story cards) use it. A browser without CSS nesting keeps the legacy look.

- **Do not delete the legacy rules above the block.** The page still
  relies on them. To change how the
  page looks, edit the REDESIGN block; to change a rule's meaning, edit it there
  and let it win by specificity. Every top-level rule in the block must carry
  the `:not(#rd)` prefix (a loose rule would not win by specificity).
- **Deleted, not hidden (2026-10-27):** the sunset sky, sakura scene, petals,
  weather canvas, sky tint, seasonal themes, meadow illustration, cover
  images, brand marks and the `kazudev` dev panel are gone from the code, so
  there is no `display: none` to remove to bring them back (use git history).
- **Header and anchors:** `.site-header` holds the wordmark, the section nav
  (`#now #socials #writing #playlist #pc`, which are the `h2.section-title` ids,
  in page order) and the language switch. The sections run Now, Socials,
  Writing, Playlist, PC. Nav labels have Japanese phrases in `java/i18n.js`.
- **Layout tricks the markup leans on:** each Right-now card is a CSS grid
  (`200px | content | button`) with `.card-head { display: contents }`; the
  playlist card uses grid areas (`side / open / featured`); the PC specs are two
  balanced CSS columns. Adding a card means keeping those hooks.
- **Browser chrome:** `setThemeColor` in `java/script.js` paints the meta
  `theme-color` with the canvas colour (it ignores the colour its callers pass).
## Hero (legacy rules, overridden by the redesign)

The name and the quote fill the width on phones, foldables and small tablets
and hold their full size from there to the widest desktop.

- **The name** is `clamp(40px, min(16.5vw, 16vh), 112px)`, its only size rule.
  "Kazu Hani" covers about 80% of the hero on a phone, 74% at 590px and 65% at
  768px (Fraunces' optical sizing narrows the letters as they grow), and the
  112px cap holds from 679px: 48% of the hero at 1024px, 44% at 1440px.
  `16vh` only binds on a screen wider than it is tall: a small phone held
  sideways (667 x 375) gets 60px instead of 110px, a 1280 x 600 laptop 96px.
- **The quote** is `clamp(17px, 5.3125vw, 22.1px)` and its author
  `clamp(12.5px, 3.9063vw, 16.25px)`: 22.1px / 16.25px from 416px up. The box's
  side padding opens from 6px at 320px to 26px at 600px, so long quotes use a
  phone's width.
- **The quote box** opens to `max-height: 420px`. A 320 character quote is
  352px tall at 430px, the tallest case measured.
- **Targets.** The name fills 70-86% of the hero up to 600px, 60%+ up to 768px, never
  over 86%, never smaller at a wider width; its box fits in a 5em fallback font, and a
  short screen (667 x 375, 1280 x 600) gives it at most a fifth of its height. Look at
  320px, 390px, 590px and 1200px: the name clear of the picture and the
  quote, no sideways scroll, a 320 character quote not cut off. If the
  title font is re-cut, re-measure the name's width per px of font size (it was 'TITLE_EM').

## Conventions and gotchas

These are load-bearing; read before editing.

- **Cache busting.** CSS/JS are versioned by query string. After editing
  `style.css`, `java/script.js`, `java/lib.js`, `java/i18n.js` or `java/site-config.js`: bump the `?v=` in `index.html`, keep the matching entries in `sw.js`'s
  `PRECACHE` list in sync (and the "Loads ..." line in "Code layout"), and bump `CACHE` in `sw.js` when the precache list or `sw.js` itself
  changes. Nothing checks this any more: a missed bump serves a stale file.
- **Staged boot & populate animation.** Startup work runs in priority order,
  not all at once: first API fetches ride the `firstDelay` ladder in the
  `POLLERS` array (stretch gaps via `bootGap`), heavy layers wait for
  `scheduleIdle`, and the glass-map bake runs in idle slices. When a live
  card's data arrives, swap its loading row out through `popReveal(loadedEl,
  loadingEl)` — never raw `classList` toggles — so the content fades/rises in
  and the card's height glides to fit. Both paths must stay free for
  low-power (`LOW_POWER`) and reduced-motion devices (instant swap).
  Live-card renderers call `cardReveal`, which is `popReveal` for a live
  answer and an instant swap for the boot paint from localStorage (see
  "Live-card cache").
  Any new always-on animated layer (infinite CSS loops, canvas rAF) must
  register with `fxWatch(el)` so it pauses off-screen via `.fx-paused`.
- **Social tiles are solid brand tiles.** `.social-card` is deliberately NOT
  a `.card` member (no glass/refraction — nothing to refract through). The
  design hangs off two custom properties: each network gets a
  `.social-card--<name>` rule in style.css with `--brand-a` (centre, lighter)
  and `--brand-b` (edge, darker); the bevel, gloss, badge and hover are all
  inherited. To add a social: copy a tile in index.html, swap href / mark /
  name / handle, add one modifier rule.
- **Ad-block safe class names.** uBlock Origin / Adblock Plus apply generic
  cosmetic rules from EasyList and Fanboy's lists to every site, and they hide
  by class name. The logo wrapper on each social tile used to be
  `.social-badge`, which Fanboy's Social Blocking list hides (`##.social-badge`),
  so for visitors with an ad blocker (seen on Firefox) every logo vanished and
  the tiles collapsed to name + handle. The logo marks are gone now (deleted
  2026-10-27), but keep new
  class names near social/share/ad vocabulary off those lists, and avoid the
  known offenders (`social-badge`, `social-badges`, `social-follow`,
  `social-profiles`, `social-share`, `social-widget`).
- **Timezone rule.** Anything age/birthday-related must run in the
  Europe/London wall-clock frame via `KazuLib.ukWallParts` / `ukWallMs`
  (calendar arithmetic happens in a fake-UTC frame so results are identical on
  any machine). Never reintroduce visitor-local `Date` getters for those
  paths.
- **lib.js is the single source of truth.** Deterministic maths belongs in
  `java/lib.js` (DOM-free). `java/script.js` consumes it via `KazuLib` with
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
  need no list. A new href sink in `java/script.js` must take its URL from one of those builders.
- **Style.** Plain ES5-ish in `java/lib.js` (`var`, function expressions, IIFE
  attaching to a global), modern JS (arrow functions, `const`/`let`) in
  `java/script.js` and `sw.js`. Heavy header-comment banners explain intent at the
  top of each file and each section; match that density. 2-space indent.
- **Service worker.** `sw.js` must never serve stale content while online:
  network-first for pages, versioned-URL cache-first for assets, and live
  APIs always fetched fresh. Preserve that strategy.
- **localStorage keys in use:** `kazu-new-year-celebrated`, `kazu-discord-cache`, `kazu-steam-cache`,
  `kazu-mal-cache`, `kazu-mal-manga-cache`, `kazu-lb-cache`, `kazu-ytm-cache`,
  `kazu-weather-cache`, `kazu-quote-cache`, `kazu-site-config`,
  `kazu-notice-dismissed`, `kazu-lang`, `kazu-mal-ja`. Don't collide
  (add any new key here).

## Live-card cache (repeat visits)

Every live section keeps its last good answer in localStorage and paints it on
the next visit in the boot task, so a reload opens on content instead of
"Connecting to..." rows, and the API is only asked again once that copy is
older than the card's own poll interval. Before this, every card waited for
its boot rung (0.7 s to 8.5 s, x1.6 on light hardware) plus its request, and
the proxied cards hit the rate-limited CORS proxy on every reload. Measured on
the real page (copies 2 s old): every card and the quote filled 58 ms into
the load and zero API requests in 10 s, against 10 requests and Steam / MAL /
Letterboxd still empty after 10 s on a cold visit.

| Section | Key | Refetch after | Account id in the copy |
| --- | --- | --- | --- |
| Weather | `kazu-weather-cache` | 10 min | none |
| Discord | `kazu-discord-cache` | 20 s (the socket still connects) | Discord user id |
| Steam | `kazu-steam-cache` | 5 min | vanity name |
| MyAnimeList | `kazu-mal-cache` + `kazu-mal-manga-cache` | 10 min (the older copy decides) | MAL user |
| Letterboxd | `kazu-lb-cache` | 30 min | Letterboxd user |
| Playlist | `kazu-ytm-cache` | 30 min | playlist id |
| Quote | none (picked from `FALLBACK_QUOTES` by the UK date, no network, changes only when the date does) | instant | none |

- **Envelope.** `{ at, id, ...payload }`, written only by `cardCacheWrite`
  after a live answer, never by a renderer (a render from the copy would
  re-stamp it as fresh forever; `renderDiscord` used to do exactly that).
  `KazuLib.cardCacheMeta` reads it: a copy of another account is never
  painted; a copy without an id (written before ids existed) is painted but
  never stands in for a fetch.
- **The hold (`#boot-cards`).** The browser paints the page before
  `java/script.js` (end of `<body>`) runs, on every device (first paint 236 ms vs
  boot paint 311 ms on desktop, 892 vs 1771 ms on the throttled phone), so a
  boot paint alone made the cards jump from loading-row height to full height
  after they were on screen: CLS 0.32 on a phone. When any Right-now copy
  exists, the inline `#boot-cards` head script adds a `<style
  id="boot-cards-hold">` that hides `.right-now-grid > .card`;
  `paintCardCaches` removes it in the same task as the paint (in a `finally`,
  so a failed paint or a missing lib.js still lifts it), and an 8 s timer is
  the failsafe. Hidden elements never count as a layout
  shift. Full boot ladder (16.5 s, phone / tablet / desktop), CLS
  cold -> repeat: 0.057 -> 0.059, 0.043 -> 0.040, 0.024 -> 0.028, with total
  shift halved on phone and tablet; the shift left is the quote box opening,
  which a cold visit has too (at 15 s instead of 1 s). Its key list must match
  the four Right-now cache keys.
- **Cost.** The paint itself is ~3 ms on desktop and ~20-30 ms on the 4x
  throttled phone. The first tick reads
  layout, which now lays the painted cards out inside the boot task instead of
  in later frames: total layout over the load is unchanged (601 -> 610 ms in a
  trace) but that one task grows ~120 ms on the throttled phone, so phone TBT
  in the 4.5 s load window goes ~190 -> ~300 ms while desktop TBT drops 40%
  (625 -> 377 ms). Idle budgets are met on a repeat visit.
- **Scheduling.** Each `POLLERS` entry with a `paint` draws its copy in
  `paintCardCaches` (the load task, just before polling starts) and the
  copy's stamp becomes `last`. `KazuLib.pollDelay` then decides: fresh data
  waits out the rest of its interval; stale data refetches on the card's boot
  rung (never inside the load task); after the first run, stale is due at
  once. The same rule runs when a hidden tab comes back, so a resumed card is
  due on its real due time, not a whole interval later. The renderers'
  signatures leave the DOM alone when the refetch matches the copy.
- **Presence.** A stored Discord presence and Steam status/game are painted as
  they were for `KazuLib.PRESENCE_KEEP_MS` (10 min); an older copy paints the
  identity only, shown offline, until the live answer lands. A failed refetch
  keeps the card (stale beats an error card) but redraws it from the copy
  under the same window, so a card never says "playing" forever while Lanyard
  or the proxy is down. Steam differs in one way: an expired copy is state
  `'unknown'`, never `'offline'` (Steam only arrives through a free proxy, and a
  dead proxy is not Steam saying offline). The boot paint labels it "Checking
  status…", a failed refetch "Status unavailable"; only a live answer from
  Steam may say "Offline".
- **Discord → Steam nudge.** When a live Lanyard answer shows the desktop
  client going from not-active to active (PC switched on), `noteDiscordDesktop`
  asks Steam once more 45 s later instead of waiting up to 5 minutes. Rising
  edge only, a 3-minute cooldown and a per-account in-flight lock keep it to
  at most one extra proxy request. Discord is only the trigger; the Steam card
  still shows only what Steam says.
- **Weather** is fetched inside the load task, so its copy is painted only
  while fresh and only if its first forecast day is today's UK date (the strip
  labels row one "Today").   The **quote** is also painted only while fresh: a stale one is certain to be
  swapped for a different random quote at its rung, resizing the hero.
- **Sanitising.** Every copy goes through a lib.js parser before it is drawn:
  links are rebuilt from ids (`steamStoreUrl`) or checked with `safeLink`,
  images must be https, Steam's hours line is recomputed from numbers, the
  Spotify track id must be letters and digits.
- **Adding a live card:** a lib.js `*CacheParse`, a `paint*Cache(ms, now)` that
  returns the copy's stamp (or 0), `paint:` on its poller, `cardCacheWrite`
  after the live answer, `cardReveal` in the renderer, its key in
  `SITE_CACHES` if it has an account id, its key in the list above, and (for a
  Right-now card) its key in `#boot-cards` followed by `node tools/csp-hashes.js --fix`.
## Content-Security-Policy

`index.html` carries `<meta http-equiv="Content-Security-Policy">` as the first thing
after `<meta charset>`: `script-src 'self'` plus one `'sha256-...'` per inline script,
`object-src 'none'`, `base-uri 'self'`. Nothing else (APIs, images, fonts, frames,
styles) is restricted. It is the second layer behind escaping and `safeLink` (see
"API links"): a planted `<script>`, an `onclick=` attribute, a `javascript:` link,
`eval`/`new Function` or a script from another host is refused by the browser even if
a future bug lets one into the page.

- **Editing an inline script changes its hash**, and the browser then refuses to run
  it. Run `node tools/csp-hashes.js --fix` after any edit to `#boot-control`,
  `#boot-cards`, `#boot-handlers`, `#boot-lang`, `#boot-power` or `#sw-register`; without
  `--fix` the tool only checks and names the scripts whose hash is missing. A new inline
  script needs an `id` and the same `--fix`. JSON-LD is a data block and needs no hash.
- **No inline event handlers.** `onload=`/`onerror=` attributes are blocked (allowing
  them would need `'unsafe-hashes'`, which not every browser in use supports, and
  a browser without it would never apply the fonts). `#boot-handlers`, placed before the font
  links, holds the two the page had: capturing `load`/`error` listeners on the
  document flip `link[data-font]` to `media="all"`. The listener exists before the
  elements are parsed, so none can be missed.
- **What it does not cover.** A meta policy cannot set `frame-ancestors` or reporting
  (GitHub Pages sends no custom headers). Code run over the DevTools protocol is exempt.
- **Checked:** Chrome over http, from `file://` (headless, `'self'` matches); every boot script runs with no refusal in the console.

## Working agreements (from CLAUDE.md)

The repo carries a `CLAUDE.md` with the owner's working rules; the ones that
bind agent work here:

- No automated tests or evals in this repo (removed 2026-10-27). Verify in the browser
  preview and say what you looked at.
- Vanilla by default. No frameworks, no new dependencies, no build tooling.
  Check for an existing library/pattern before writing custom code; don't
  recreate what exists.
- Deterministic work (date maths, transforms, escaping) goes in code,
  not in ad-hoc reasoning.
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
  the stylesheet arrives; `loadSiteControl` in `java/script.js` takes the result over and
  polls once a minute with the other pollers. Only `https://` addresses or a path on
  this origin are ever fetched.
- **Precedence: a managed section overrides the HTML.** A section the panel manages
  is present in the settings (socials, stories, pc, playlist, integrations, titles,
  sections, seasons, effects, footer, notice; `seasons` and `effects` no longer change anything on the page). For those, the live page shows the
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
  the `h2.section-title` just before each grid, and `#hubBulletin`.
- **Declarations the panel's importer reads.** `DISCORD_ID`, `STEAM_VANITY`, `MAL_USER`,
  `LB_USER` and `YTM_PLAYLIST_ID` are `let`s set through `siteId(...)` / `siteValue(...)`.
  The last quoted value on each line is the page's own default and the importer reads
  it, so keep that shape.
- **Safety rules.** Settings never reach `innerHTML`: text goes in through `textContent`,
  links only after `KazuSiteConfig` has checked them, colors as validated hex. Any failure
  (offline, bad data, newer schema, blocked storage) leaves the page as it is. The last
  good copy is cached in `localStorage` (`kazu-site-config`) so a repeat visit applies it
  before the first paint.
- **Undo.** Every edit the hook makes is recorded (`ovText`, `ovAttr`, `ovClass`,
  `ovStyle`, `ovChildren`) and reverted before a newer copy is applied, so handing a
  section back to the HTML restores it exactly.
- **Privacy.** Every visit makes one request to the Firebase host named in the meta tag.

## Language switch (English / Japanese)

**Switch removed.** The page is English only: there is no switch in the header, and `java/i18n.js` starts in English whatever the saved choice, `?lang=` or the device language says (see the `var start = 'en'` line at the bottom). The Japanese table, `pickLang` and the Chiikawa peek code stay; restoring the commented `pickLang(...)` call and a switch in the header brings it back. The text below is history.

A pill at the top right of the page (`.lang-switch`, first thing in
`.container`) switches between English and 日本語. **English is the page's own
language and the default**; Japanese is a layer that `java/i18n.js` puts on top, so
`index.html` and `java/script.js` stay plain English and know nothing about it.

- **How text gets translated.** `KazuI18n.translate(text)` returns Japanese or
  `null`: an exact phrase table first (`PHRASES`, keys whitespace-collapsed
  with straight apostrophes), then `RULES` for text `java/script.js` builds at run
  time (the clock goes 24-hour, en-GB dates become `2026年10月19日(月)`,
  countdowns, Steam hours, MAL progress, Discord timers, toasts), and
  `"A · B"` is translated part by part. Anything unknown stays English, so live
  content and control-panel text are never mangled.
- **The DOM shell.** Switching to Japanese walks `<body>` once (text nodes plus
  `title` / `aria-label` / `alt` / `placeholder`) and connects a
  MutationObserver that translates whatever `java/script.js` writes afterwards
  (callbacks run before the next paint, so no English flashes). Every swap is
  recorded; switching back puts the exact originals back (keeping any fresh
  English `java/script.js` wrote meanwhile), reverses stray Japanese phrases, and
  disconnects the observer. **The English page runs none of it.**
- **Never translated:** `SKIP_SELECTOR` in `java/i18n.js` (live names and titles:
  Discord / Steam / Spotify fields, game, anime, film and song titles, the quote,
  story titles, the dev panel) and anything marked `translate="no"`. Put new
  live-content elements there. Product names (the PC parts), brand kickers
  (DISCORD, STEAM, YOUTUBE MUSIC), handles, song, film and story titles stay
  English on purpose: that is how Japanese sites write them.
- **Live data with its own Japanese: `data-ja`.** An element with
  `data-ja="..."` and a single text node shows that text in Japanese mode, even
  inside `SKIP_SELECTOR`, and is restored on English. The MAL card uses it:
  `java/script.js` asks AniList's public GraphQL API (`graphql.anilist.co`, no key,
  CORS-clean) for each row's native title by MAL id, one POST for every anime
  and manga row (`KazuLib.anilistTitlesQuery` / `anilistTitlesParse`; ids come
  out of the row url via `malIdFromUrl`). It only asks while the page is in
  Japanese, and again on `kazu-langchange` (fired by `java/i18n.js` on every
  switch). Titles are kept in `kazu-mal-ja` (at most 100 per kind,
  `malJaCacheParse`); an id AniList doesn't answer for is not asked again that
  visit. MAL's own feeds carry no Japanese title (`load.json`'s
  `title_localized` is null), hence AniList.
- **The quote.** zenquotes is English only, so Japanese mode shows a quote
  from `QUOTES` in `java/i18n.js` (`[English, Japanese, author in Japanese]`):
  the quote's own translation when it is one of `FALLBACK_QUOTES`, otherwise
  `QUOTES[hash(text) % n]`, the same pick every time for the same English.
  `createQuoteSync` keeps text and author paired and puts the latest English
  back on a switch. Every `FALLBACK_QUOTES` line in
  `java/script.js` needs a row in `QUOTES`. Japanese quotes are upright in 「」.
- **Japanese labels run longer.** Header pills (`.pill-link`) and `.retry-btn`
  are `white-space: nowrap; flex-shrink: 0` so プロフィール → and 再試行 never
  break over two lines.
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
  `java/i18n.js` has run, with a 3 s failsafe. Keep it in step with
  `pickLang`.
- **Adding or changing copy.** Add the Japanese line to `PHRASES` (or a rule for
  composed text). Names, brands and product models stay English on purpose. Any other
  visible string or label in `index.html`, and any new weather condition,
  status or empty state in `java/script.js`, needs Japanese. Japanese values
  must be unique (switching back looks them up in reverse) and emoji-free.
- **Colours follow the palette.** The switch (and the announcement strip's
  default tone) paint with `--chip-bg`, `--chip-bd` and `--on-accent`, set in
  every palette block that sets `--accent` (default `body`). `--chip-bg` is the
  card colour made near-solid (alpha >= .85) because the switch has no blur;
  `--on-accent` is the dark label on the accent-filled pressed button. A new
  palette must set all three, and the idle and pressed labels must stay above 4.5:1.
- **Layout notes.** Weekdays and fonts need nothing special: the page's fonts have no
  kana, so browsers fall back per glyph to the system Japanese font
  (`<html lang="ja">` makes them pick Japanese glyph forms).
- **Not translated by design:** the quote (English source text), song, game,
  anime and story titles, and announcement text from the control panel unless
  it matches a known phrase.

## Emoji-free content

User-facing text and metadata contain no emojis. `KazuLib.stripEmoji` removes
emoji sequences from live text and labels via the targeted DOM observer in
`java/script.js`, with a matching inline fallback. Discord custom emoji images are
not rendered. Forecasts use condition
text, and the Konami dragon uses the existing profile image. Keep new UI copy emoji-free.
