# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single static HTML/CSS/JS personal "hub" page (linktree-style) for Kazu Hani: live clock/weather/age stats, live Discord and Steam presence, a YouTube Music playlist card, socials, and story links. No build step, no package manager, no framework — three files: [index.html](index.html), [script.js](script.js), [style.css](style.css).

## Running locally

There's no build/lint/test tooling. Serve the directory with any static server and open it in a browser, e.g.:

```
python -m http.server 5500
```

(matches the `.claude/launch.json` debug config — opens at `http://localhost:5500`). Opening `index.html` directly via `file://` mostly works too, but `fetch()` calls to the APIs below behave more reliably over `http://`.

## Architecture

Everything lives in one IIFE in [script.js](script.js). Key things to know before editing:

- **Three live external data sources**, each independently polled and individually fault-tolerant (failures fall back to a "loading"/"offline" UI state rather than throwing):
  - **Clock/age/birthday** — pure client-side, recomputed every second via `tick()`. Timezone, birth date, and countdown logic are hardcoded at the top of the file (`BIRTH_YEAR`/`BIRTH_MONTH`/`BIRTH_DAY`/`TIMEZONE`).
  - **Weather** — `loadWeather()` hits the Open-Meteo API (hardcoded lat/long), polled every 10 min.
  - **Discord presence** — `loadDiscord()` hits the Lanyard API (`DISCORD_ID` constant) every 20s. Drives avatar, status dot/color, custom status, "playing now" / Spotify "now listening" info-pills, and a smoothly-interpolated Spotify progress bar / game elapsed-time (`updatePresenceProgress()`, ticked every second between polls using cached timestamps).
  - **Steam presence** — `loadSteam()` fetches the Steam community XML profile (`STEAM_VANITY` constant) every 5 min, with a CORS-proxy fallback (`corsproxy.io`) if the direct fetch fails, then parses it with `DOMParser`. Steam's avatar wins and is shared onto the Discord card (`sharedAvatarUrl`) if both are present.
  - Quotes (`loadQuote()`) hit zenquotes.io once on load, falling back to a local `FALLBACK_QUOTES` array on failure.
- **Seasonal theming** is date-driven (`seasonState()`): a birthday confetti+hat mode (Nov 9), a Christmas palette + tree (Dec 25), and a pride halo (all of June). All three can be previewed on any date via the `?season=birthday|christmas|pride|all` query param (comma-combinable), handled by `SEASON_OVERRIDE`. Season classes are applied to `<body>` every tick so a page left open transitions correctly at midnight.
- **Theme (dark/light)** is a CSS-variable swap on `body[data-theme]` (see the variable blocks near the top of [style.css](style.css)), toggled by the orb button and persisted to `localStorage` (`kazu-dark`).
- **Scroll-reveal animations** use one shared `IntersectionObserver` over all `.scroll-reveal` elements (falls back to instantly visible if `IntersectionObserver` is unsupported or `prefers-reduced-motion` is set); the page-load hero entrance is pure CSS (`animation-fill-mode: both`) so there's no flash before JS runs.
- IDs in [index.html](index.html) and lookups via the `$()` helper in [script.js](script.js) are tightly coupled — most elements are toggled with `.hidden` between a `*Loading`/`*Loaded`/`*Err` state per data source.

## Editing the playlist card

The static YouTube Music card in [index.html](index.html) is hand-maintained (no API) — comments inline in the HTML mark the exact spots to edit: cover image (`assets/playlist.jpg`), the two playlist link hrefs, and the playlist/song text.
