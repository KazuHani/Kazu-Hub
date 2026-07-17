# Kazu Hub

Personal hub of Kazu Hani — Arctic Dragon ❄️🐉. Live at
**[kazuhani.github.io/Kazu-Hub](https://kazuhani.github.io/Kazu-Hub/)**.

Vanilla HTML/CSS/JS. No framework, no build step, no dependencies.

## What's on the page

- Live stat strip: UK time, Aberystwyth weather, age, next-birthday countdown.
  Each card opens a detail pop-up: timezone/DST explainer, an interactive 3D UK
  wind globe, life stats with a "life in weeks" canvas, and a birthday
  countdown with Google Calendar / .ics export.
- "Right now": live Discord presence (via [Lanyard](https://github.com/Phineas/lanyard))
  and Steam status with recently played games.
- YouTube Music playlist, socials, and in-progress stories.
- Dark/light theme (saved to localStorage), seasonal modes (birthday,
  Christmas, pride), snowfall, and a liquid-glass refraction effect on
  Chromium.

## Run it locally

It's a static site — open `index.html` directly, or serve the folder:

```
python -m http.server 8000
# → http://localhost:8000
```

## Season previews

Force any seasonal theme on any date with a query param (comma-combinable):

- `?season=birthday` — party hat + confetti
- `?season=christmas` — festive palette + tree
- `?season=pride` — aro-ace halo
- `?season=all` or `?season=birthday,christmas`

## Tests

`lib.js` holds all the deterministic maths (UK wall clock, DST, age, birthday
countdown, calendar export, HTML escaping) and is DOM-free, so it runs in two
places:

- **Browser:** open `tests.html`
- **Headless:** `node tests.js` (no dependencies)

CI (`.github/workflows/test.yml`) runs `node tests.js` on every push under
three timezones (UTC, UTC+14, UTC-7) to prove the UK wall-clock maths is
machine-independent.

## Editing notes

- CSS/JS are cache-busted by query string — bump `?v=` in `index.html` (and
  `tests.html` for `lib.js`) after editing `style.css`, `script.js`, or
  `lib.js`.
- Timezone rule: anything birthday/age-related runs in the Europe/London
  wall-clock frame via `KazuLib.ukWallParts`. Don't reintroduce visitor-local
  `Date` getters for those paths.
