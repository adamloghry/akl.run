# akl.run — project hub on the factory (implementation spec)

**Date:** 2026-10-25
**Status:** approved design; this document is the authority for implementation
**Audience:** the agent(s) implementing akl.run from the akl.io repository. Read this whole file, then `AGENTS.md`, then the files named in §1.3, before changing anything.

**Companion material** (same folder):

| path | what |
|---|---|
| `demo/hub-desktop.html` | **working prototype** — the final hub over the live mock engine; `m`, the readout button and the `factory` row toggle factory mode; click the map to look around. Opens from disk, no server. Append `?start=factory` to simulate loading on `factory.akl.run` (the demo also honours a real `factory.*` hostname). Its inline styles are the design editor's and must become `main.css` classes in the real page (CSP). |
| `demo/factory-mode-night.html` | same page, starting in factory mode, at night |
| `demo/hub-phone.html` | the 390×844 layout |
| `screenshots/*.png` | pixel targets rendered from the demos (see §9 for the list) |
| `reference/Main.dc.html`, `Factory.dc.html`, `Phone.dc.html`, `World.dc.html` | the four final Claude Design boards as exported (markup, icon SVGs, inline styles) |
| `reference/canvas.json` | the canvas index (board layout + notes) |
| `reference/engine-reference.js` | the mock engine's JavaScript: event state machines, camera, lights, weather. A behaviour reference, **not** drop-in code (see §6.0). |

Design canvas (Claude Design): "akl.run — factory hub", page *Final — handoff*. The *Explorations* page holds 28 rejected option boards; ignore them.

---

## 0. Mission and scope

### 0.1 What is being built
**akl.run** is a new site: a project hub ("things I build, and where they live") rendered as one centred window over the live pixel-art factory that currently backs akl.io's landing page. Picking the first entry, `factory`, minimises the window into **factory mode**: the journal (`% journalctl -u factory -f`), a production readout and a return chip appear over the running world. The factory engine, its world, keys and seed permalinks carry over from akl.io; the identity content (ASCII banner, name, contact icon bar, `ls -l` listing) does **not** — akl.io keeps being the person's site and is linked from the hub's top-right.

### 0.2 Scope boundary — read twice
You are taking over **only the landing page** of the akl.io repository to make akl.run. In scope:

- `src/pages/index.astro` — the page.
- `public/assets/css/main.css` — the page's stylesheet.
- `public/assets/js/mapgen.js` — the engine + page driver; `public/assets/js/boot.js` — new, sets the start state before first paint (§2.1).
- `public/_headers` (only if a header must change; the CSP should not).
- `public/images/og.png` (regenerated), `public/favicon.*`/`apple-touch-icon.png` (only if you are given new marks — otherwise keep),
- `public/llms.txt`, `public/humans.txt`, `public/robots.txt` — rewritten for akl.run.
- `public/assets/fonts/` — add Newsreader (self-hosted); keep JetBrains Mono.
- `golden/` — regenerated after the above (it is a byte snapshot of the output; see `AGENTS.md` "Output is byte-pinned").
- `AGENTS.md` — the "Map generator" section and the layout notes that describe the landing page (§8 gives replacement text).

**Out of scope — do not touch:** everything under `src/content/`, `src/layouts/BlogLayout.astro`, `src/components/`, `src/pages/blog/**`, `src/pages/rss.xml.js`, `public/assets/css/blog.css`, `public/assets/js/blog.js`, `blog-theme.js`, `src/content.config.ts`, `astro.config.mjs` site URL semantics beyond what §0.3 says, the nix/devenv/CI setup, `renovate.json`. If a blog file appears in your diff, you have gone wrong.

### 0.3 Where akl.run lives (decide with the owner before the first commit)
Two workable shapes; the owner picks. Everything in this spec is identical under both.

- **A. New repository seeded from this one (recommended).** Copy the repo, delete the blog (`src/content`, `src/layouts`, `src/components`, `src/pages/blog`, `src/pages/rss.xml.js`, `blog.css`, `blog.js`, `blog-theme.js`, `src/content.config.ts`), set `site: 'https://akl.run'` in `astro.config.mjs`, point a new Cloudflare Pages project at it. akl.io then gets its own (future) landing page decided separately.
- **B. This repository, this landing page, re-pointed to akl.run.** The blog keeps living at akl.io/blog via whatever routing the owner chooses; `index.astro` becomes akl.run. Canonical/OG/JSON-LD URLs change to akl.run for the landing page only.

Under either shape, canonical is `https://akl.run/`, and the page title is `akl.run`.

### 0.5 Two hostnames, one build
The same static output is served on **two** Cloudflare Pages custom domains:

| host | initial state | purpose |
|---|---|---|
| `akl.run` | **hub** | the project list; `factory` row / `m` / readout minimise into factory mode |
| `factory.akl.run` | **factory** | the factory alone; `% fg` / `m` / readout still restore the hub (same page, different starting state) |

Nothing differs in HTML or CSS between the hosts: the starting state is chosen at runtime from `location.hostname` (§2.1). Both domains point at the same Pages project; no redirect rules, no second build. `<link rel="canonical">` stays `https://akl.run/` on both (the factory host is an alternate view, not separate content); `og:url` likewise. `robots.txt` allows both. The `?seed=` permalink is host-agnostic.

### 0.4 Working method (from `AGENTS.md`, condensed)
- Branch off `trunk`; never commit to `trunk`. Cloudflare Pages previews every branch.
- `npm install && npm run build` (Node ≥ 22.22; `.node-version` is 24). `nix develop --impure` gives the full shell; `nix flake check --impure` runs build, `astro check`, treefmt and `golden-output`.
- **No inline `<script>`, no inline `style=` / `<style>` in `index.astro`.** CSP is `script-src 'self'; style-src 'self' https://fonts.googleapis.com`. An inline style silently does nothing in the browser and fails no build. Presentation *attributes* on SVG (`fill`, `opacity`, `stroke-width`) are fine.
- `index.astro` is excluded from the formatter on purpose (`compressHTML: false` → source whitespace ships). Void elements without trailing slash.
- After any output change: `npm run build && nix run .#update-golden`, commit `golden/` with the change.
- OG image: `npm run build && nix run .#capture-og` (Linux only), commit the PNG.
- Preserve JSON-LD and OG/Twitter meta blocks in the head (edit values, keep the blocks).
- Headless screenshots for self-checks: `node tmp/pw/shot.mjs <url> <out.png> <w> <h> [reducedMotion] [jsOff] [waitMs]` if `tmp/pw/` still exists; otherwise a 20-line Playwright script. Do not run Playwright inside the nix sandbox.

---

## 1. Decisions (settled — do not reopen)

| Question | Decision |
|---|---|
| Page content | One centred window: `akl.run` title, a house-icon chip top-right linking to akl.dev (icon only, no label), seven whole-row project links (pixel icon · name · one serif line). |
| Removed from the old landing page | ASCII banners, `ADAM K. LOGHRY / Engineer in Seattle` ident, contact icon bar, `% cat`/`% ls -l` command lines, the caret line, the always-visible journal panel. |
| Index numbers, status words, years, tags | None. |
| `me → akl.io` row | None; the top-right house chip (→ https://akl.dev/, the person's homepage) is the only link out to the person. |
| `factory` row | The row minimises into factory mode. The word *Factorio* inside its description is a separate link to https://factorio.com/. |
| Descriptions | Exactly one line at ≥ 761px (`nowrap` + ellipsis); wrap to two lines at ≤ 760px. |
| Factory-mode voice | Unchanged terminal register: `% journalctl -u factory -f`, `% fg ← akl.run`, production readout, lat/long readout. |
| Journal opener | A **pinned** comment `# you should play factorio! → watch the 2026 trailer` linking to https://www.youtube.com/watch?v=oF1zCD7NwNY, then the run-start comment, then the ring. |
| Fonts | Self-hosted: JetBrains Mono (already present, Bold; add Regular) and **Newsreader** (OFL) for descriptions. No request to Google Fonts from this page. |
| Panel opacity | Hub window `rgba(4, 9, 8, .9)` (the old `--shade` at .5 was too transparent for a text-heavy panel). Factory-mode panels keep `--shade`. |
| Rows whose destination is not live yet | `hollow`, `external-memory`, `eternal-blue`: ship **commented out** in `index.astro` (the repo already does this for 16384.dev), uncomment when the routes exist. |
| Colour scheme | Dark only. |
| Readout | Still the minimize toggle; reads central-Seattle coordinates (the visible world is anchored on 47.6062 N, 122.3321 W). |
| Start state | `akl.run` → hub; `factory.akl.run` (any `factory.*` host) or `#factory` → factory, set before first paint by a tiny sync `boot.js` (§2.1). Same build, two custom domains. |
| Keys | `m` toggles factory mode; `r` rerolls (kept; still advertised in the run-start line). Existing WCAG 2.1.4 guards. |
| Mouse | Click on the map sends the camera there (new, harmless on touch). |

## 2. Page states

| state | hub window | journal | `% fg` chip | production readout | lat/long readout |
|---|---|---|---|---|---|
| **hub** (default) | visible | hidden | hidden | hidden | visible, `aria-pressed=false` |
| **factory** | minimised (`.is-minimized` + `inert`) | visible | visible | visible ≥ 761px | visible, `aria-pressed=true` |

### 2.1 Initial state
```
startInFactory = /^factory\./i.test(location.hostname)        // factory.akl.run (and factory.<preview-host>)
              || location.hash === '#factory'                   // deep link from anywhere
```
Otherwise the page starts in **hub**. The URL is not rewritten on later toggles (no `history.pushState`; `#factory`/`#hub` hrefs on the two toggles are `preventDefault`ed as today).

**No hub flash on `factory.akl.run`.** `mapgen.js` is `defer`red, so the hub would paint for a frame before JS minimises it. Add `public/assets/js/boot.js` — a 3-line synchronous script in `<head>` *before* the stylesheet link — that sets the class:
```js
if (/^factory\./i.test(location.hostname) || location.hash === '#factory') document.documentElement.classList.add('factory');
document.documentElement.classList.add('js');
```
CSS keys the factory state off `html.factory` (not `body.factory`; replace that in §3.1 notes accordingly), and `mapgen.js` reads the class on start instead of re-deciding. The `rise` entry animation plays on the factory-mode panels in that case and not on the hub. CSP is unaffected (`script-src 'self'`); the file is ~150 bytes and must not be inlined.

JS-off on `factory.akl.run` degrades to the hub (the class is never set) — acceptable; the hub links still work. Reduced motion on `factory.akl.run`: start minimised with no transition, one still frame, the two journal comment lines.

Transitions between states are the existing ones (`.shade` opacity/transform .35s with `visibility` deferred; `rise` replays on restore). When minimising, if focus is inside the window move it to the readout first. **Do not** add/remove the window from the DOM (the prototype does, because the design editor has no transitions); `aria-controls="windows"` must always resolve.

Entering factory: click/Enter on the `factory` row (`[data-minimize]`), click on the readout, `m`, or loading on `factory.akl.run` / with `#factory` (§2.1).
Leaving factory: click/Enter on `% fg` (`[data-restore]`), click on the readout, `m`.

Keyboard guards (unchanged from today): single key, no Ctrl/Meta/Alt/Shift, not on repeat or during IME composition, not when focus is in `input|textarea|select` or a `contenteditable`.

JS-off: the seven links work; `[data-minimize]` is an `<a href="#factory">` that does nothing harmful; the italic hint is hidden (see §3.3); the readout stays `hidden`; the journal panel keeps the static `note: javascript required to run the factory` line and is hidden in hub state by CSS, so a JS-off visitor sees the hub only.

Reduced motion: no `rise`, no transitions, engine paints one still frame (§6.7), journal shows the two comment lines only.

## 3. DOM contract

### 3.1 Markup
Hooks the JS depends on are the `data-*` attributes and ids; class names are yours but keep one tab stop per destination.

```html
<canvas id="map" aria-hidden="true"></canvas>
<main class="page" id="windows" data-windows>
  <section class="shade hub">
    <header class="hub-head">
      <h1 class="hub-title">akl.run</h1>
      <a class="home" href="https://akl.dev/" title="akl.dev" aria-label="akl.dev (home)">
        <svg class="home-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></a>
    </header>
    <ul class="projects" role="list">
      <li class="project project--factory">
        <div class="project-row">
          <svg class="icon icon--factory" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false">…</svg>
          <span class="project-text">
            <a class="project-name project-name--stretch" href="#factory" data-minimize title="minimize this window and watch the factory">factory</a>
            <span class="project-desc">A busy factory in a web page, inspired by <a class="out" href="https://factorio.com/">Factorio</a>. <em class="hint hint--desktop">Press m to minimize this window and watch it run.</em><em class="hint hint--touch">Tap to minimize this window and watch it run.</em></span>
          </span>
        </div>
      </li>
      <li class="project"><a class="project-row" href="https://16384.dev/">
        <svg class="icon icon--code" …>…</svg>
        <span class="project-text"><span class="project-name">16384.dev</span><span class="project-desc">Source code behind various projects, including this website and others.</span></span>
      </a></li>
      <li class="project"><a class="project-row" href="https://rarp.org/">…rarp.org…</a></li>
      <li class="project"><a class="project-row" href="https://enchilada.dev/">…enchilada.dev…</a></li>
      {/* Hidden until the routes exist. Restore by uncommenting.
      <li class="project"><a class="project-row" href="https://16384.dev/hollow">…hollow…</a></li>
      <li class="project"><a class="project-row" href="https://16384.dev/external-memory">…external-memory…</a></li>
      <li class="project"><a class="project-row" href="https://eternal-blue.akl.run/">…eternal-blue…</a></li>
      */}
    </ul>
  </section>

  <a class="shade fg" href="#hub" data-restore>% fg   ← akl.run</a>
  <p class="shade prod" data-prod>power <b data-stat="power">100</b>% · trains <b data-stat="trains">3</b> · bots <b data-stat="bots">0</b> · threats <b data-stat="threats">0</b> · rockets <b data-stat="rockets">0</b> · research <b data-stat="research">—</b></p>

  <section class="shade term status" aria-label="factory log">
    <p class="cmd">% journalctl -u factory -f</p>
    <ol class="log" data-log aria-live="off">
      <li class="log-line log-line--comment" data-log-pinned># you should play factorio! → <a class="permalink" href="https://www.youtube.com/watch?v=oF1zCD7NwNY">watch the 2026 trailer</a></li>
      <li class="log-line log-line--comment" data-log-static>note: javascript required to run the factory</li>
    </ol>
  </section>
</main>
<button type="button" class="hudf" data-readout aria-controls="windows" aria-pressed="false" aria-label="minimize windows" hidden><span aria-hidden="true" data-readout-text></span></button>
```

Rules:
- `.project { position: relative }`; `.project-name--stretch::after { content: ""; position: absolute; inset: 0 }` makes the whole factory row clickable from one `<a>`; `.out { position: relative; z-index: 1 }` keeps the Factorio link above it. Tab order in that row: `factory`, then `Factorio`.
- Rows 2–7 are a single `<a class="project-row">` each (the row *is* the link). No `::after` needed.
- `.hint--touch` is shown and `.hint--desktop` hidden at ≤ 760px (and vice versa). Both hidden when `html:not(.js)` — set `document.documentElement.classList.add('js')` first thing in `mapgen.js`. (Alternative: hide both until `.js`; either is fine.)
- The journal panel, `% fg` and `[data-prod]` are visible only in factory state (`[data-windows].is-minimized ~`-style selectors won't work since they're inside `#windows`; use `#windows.is-minimized .status { … }`, or put the factory-state class on `<html>`/`<body>`). Note the hub `.hub` must still fade out under `.is-minimized`, so a root-level class `html.factory` (set by `boot.js` on load, toggled by `mapgen.js`) driving both is simplest: `html.factory .hub { opacity:0; visibility:hidden; transform:… }` and `html:not(.factory) .status, html:not(.factory) .fg, html:not(.factory) .prod { display:none }`. Keep `inert` on `.hub` (not on all of `#windows`, which now also holds the factory-mode panels) — `data-windows` can move to the hub section if that is cleaner; keep `aria-controls` pointing at whatever carries the minimised state.
- `[data-log-pinned]` is never evicted; `[data-log-static]` is removed by JS before the first push (as today). Ring: 6 event lines on desktop, 4 on phone, after the two comments.
- `[data-prod]` is updated ≤ 1 Hz from `onStats` (§6.6); hidden ≤ 760px.
- The run-start line is a comment (starts with `# `): no stamp, `--faint`, opacity .7; it keeps the `?seed=` `<a class="permalink">`.

### 3.2 Hooks summary (JS ↔ markup)
`#map`, `#windows [data-windows]`, `[data-minimize]`, `[data-restore]`, `[data-readout]` (+ `[data-readout-text]`), `[data-log]`, `[data-log-pinned]`, `[data-log-static]`, `[data-prod] [data-stat=name]`. All null-guarded in JS, as today.

### 3.3 Head
```
<title>akl.run</title>
<meta name="description" content="Projects by Adam Loghry, running on top of a small factory.">
<link rel="canonical" href="https://akl.run/">
<meta name="theme-color" content="#14303c"> <meta name="color-scheme" content="dark">
og:type website · og:url https://akl.run/ · og:title akl.run · og:description (same) · og:image https://akl.run/images/og.png · og:locale en_US
twitter:card summary_large_image · twitter:title/description/image as above
<link rel="preload" href="/assets/fonts/JetBrainsMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/JetBrainsMono-Bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/Newsreader-16pt-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/Newsreader-16pt-Italic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href={asset('assets/css/main.css')}>
<link href="https://hachyderm.io/@akl" rel="me">   (keep — rel=me verification is per-page and harmless)
JSON-LD: keep the Person block, with "url": "https://akl.dev/" (the person's homepage), and add "mainEntityOfPage": "https://akl.run/". Owner may drop it entirely; default is keep.
<script src={asset('assets/js/boot.js')}></script>   (sync, in <head> before the stylesheet; see §2.1)
<script src={asset('assets/js/mapgen.js')} defer></script>
```

## 4. Visual spec

### 4.1 Tokens (`main.css :root`) — keep the existing set, add:
| token | value | use |
|---|---|---|
| `--panel` | `rgba(4, 9, 8, .9)` | hub window background |
| `--serif` | `Newsreader, Georgia, "Times New Roman", serif` | descriptions |
| `--desc` | `#c9d2b8` | description text (≈ 10:1 on `--panel`) |
| `--rule` | `rgba(233, 236, 220, .1)` | row dividers |
| `--rule-strong` | `rgba(233, 236, 220, .18)` | header rule |
| `--chip-border` | `rgba(233, 236, 220, .16)` | `.home` border |
| `--accent-wash` | `rgba(240, 176, 84, .06)` | row hover fill |

Existing tokens in use: `--water #14303c`, `--fg #e9ecdc`, `--dim #b9c4a6`, `--faint #8b987b`, `--link #f0b054`, `--link-hover #ffd694`, `--permalink #a8b58a`, `--shade rgba(3,8,6,.5)`, `--edge #0a0f12`, `--mono`.

### 4.2 Fonts
```
@font-face { font-family: "JetBrains Mono"; src: url(/assets/fonts/JetBrainsMono-Regular.woff2) format("woff2"); font-weight: 400; font-display: optional; }
@font-face { font-family: "JetBrains Mono"; src: url(/assets/fonts/JetBrainsMono-Bold.woff2) format("woff2"); font-weight: 700; font-display: optional; }
@font-face { font-family: Newsreader; src: url(/assets/fonts/Newsreader-16pt-Regular.woff2) format("woff2"); font-weight: 400; font-style: normal; font-display: optional; }
@font-face { font-family: Newsreader; src: url(/assets/fonts/Newsreader-16pt-Italic.woff2) format("woff2"); font-weight: 400; font-style: italic; font-display: optional; }
```
Newsreader: SIL OFL 1.1 (Production Type, via Google Fonts). Use the static 16pt optical-size instances, Latin subset, woff2 (each ≈ 20–30 KB). `font-display: optional` matches the banner font's existing policy (no late swap); the system fallbacks are chosen for close metrics. The whole page's base `font-family` becomes `"JetBrains Mono", var(--mono)` (today only the banners used the webfont; names/chips/readout now do too — that is why Regular is added).

### 4.3 Layout — desktop (≥ 761px)
- `.page`: `position: relative; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 40px; font: 14px/1.4 "JetBrains Mono", var(--mono); color: var(--fg)`. No `text-shadow` inside the hub window (its panel is opaque enough); keep `text-shadow` on the factory-mode panels and the readout as today.
- `.hub`: `width: 900px; max-width: 100%; padding: 22px 34px 18px; background: var(--panel); border-radius: 4px; box-shadow: 0 0 0 1px rgba(233,236,220,.08), 0 10px 30px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 4px; animation: rise .6s ease-out backwards`.
- `.hub-head`: `display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--rule-strong)`.
- `.hub-title`: `font-size: 22px; font-weight: 400; letter-spacing: .02em; margin: 0`.
- `.home`: icon only, no text. `display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; color: var(--dim); border: 1px solid var(--chip-border); border-radius: 3px`. Hover: `color: var(--link-hover); border-color: rgba(240,176,84,.5); background: rgba(240,176,84,.08); text-decoration: none`. Icon 16px, stroke 2 (Lucide "house"); `aria-label="akl.dev (home)"` and `title` carry the name. Hit area 32px (≥ 24px WCAG target).
- `.projects`: `list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column`.
- `.project-row`: `display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 18px; align-items: center; padding: 11px 10px; margin: 0 -10px; color: var(--fg); border-bottom: 1px solid var(--rule)`; last row no border. Hover: `background: var(--accent-wash)`; `.project-row:hover .project-name { color: var(--link-hover) }`. Focus-visible on the link: `outline: 2px solid var(--link-hover); outline-offset: 2px`.
- `.icon`: `width: 44px; height: 44px; shape-rendering: crispEdges`.
- `.project-text`: `display: flex; flex-direction: column; gap: 2px; min-width: 0`.
- `.project-name`: `font-size: 16px; font-weight: 700; color: var(--link)`.
- `.project-desc`: `font: 400 15.5px/1.35 var(--serif); color: var(--desc); white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. `.out`: `color: var(--desc); text-decoration: underline; text-decoration-color: rgba(240,176,84,.55); text-underline-offset: 2px`; hover `color: var(--link-hover)`. `.hint`: `font-style: italic` (Newsreader Italic).
- Readout button: unchanged (`right: 40px; bottom: 37px; 12px; letter-spacing .08em; --dim; ≥24px hit area`).
- Width check: at 1440 the longest description (rarp.org, 101 chars) fits in the 900px window with ~40px to spare at 15.5px Newsreader. Below ~1000px viewport it starts to ellipsise — accepted, because at ≤ 760px it wraps instead.

### 4.4 Layout — phone (≤ 760px)
- `.page { padding: 20px }`; `.hub { padding: 16px 16px 8px; gap: 2px }`; `.hub-title { font-size: 19px }`; `.home` unchanged (32px square, 16px icon).
- `.project-row { grid-template-columns: 36px minmax(0,1fr); gap: 14px; align-items: start; padding: 11px 8px; margin: 0 -8px }`; `.icon { width: 36px; height: 36px }`; `.project-name { font-size: 15px }`; `.project-desc { white-space: normal; font-size: 14.5px; line-height: 1.35; text-wrap: pretty }`.
- Show `.hint--touch`, hide `.hint--desktop`.
- Readout: `right: 12px; bottom: 15px; font-size: 11px; padding: 10px 8px` (≥ 44px tall hit area).
- `[data-prod]` hidden. Journal ring 4.

### 4.5 Factory mode
- `.fg`: `position: fixed; left: 28px; top: 24px; padding: 7px 12px; font-size: 12px; letter-spacing: .06em; color: var(--dim); background: var(--shade); border-radius: 4px; box-shadow: 0 0 0 1px rgba(233,236,220,.06)`; hover `--link-hover`. Phone: `left: 14px; top: 16px; font-size: 11px; padding: 8px 12px`.
- `.prod`: `position: fixed; right: 28px; top: 24px; same chrome; display: flex; gap: 1.6ch; font-size: 12px; letter-spacing: .04em; color: var(--dim)`; values (`b`) in `--fg`, weight 400. Hidden ≤ 760px.
- `.status` (journal): bottom-centred — `position: fixed; left: 0; right: 0; bottom: 44px; display: flex; justify-content: center; padding: 0 320px 0 48px; pointer-events: none`, inner panel `pointer-events: auto; width: 820px; max-width: 100%; padding: 14px 20px 14px 16px; gap: 6px; background: var(--shade); border-radius: 4px; box-shadow: 0 0 0 1px rgba(233,236,220,.06), 0 10px 30px rgba(0,0,0,.35)`. Phone: `bottom: 56px; padding: 0 20px`. (Keep today's 761–1180px rule that lifts the journal clear of the readout; below 560px tall in that band drop the journal.)
- `.cmd` 13px `--dim`. `.log-line`: `padding-left: 2ch; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`; event text `#a7b394` with the `HH:MM:SS` stamp in `--faint` followed by two spaces; opacity ramp via `:nth-last-child` as today but for a ring of 6 (`.45 + .55·(i+1)/6`: .54 .63 .73 .82 .91 1); comments `.7` in `--faint`, never ramped. Phone: 11px, no left padding.
- Readout text format: `47.6062° N · 122.3321° W · 2.4×`.

### 4.6 Motion
`rise` (.6s ease-out, delays: hub 0, factory panels .4s, readout .6s/.5s phone) as today; minimise transition .35s; `prefers-reduced-motion: reduce` disables all of it.

## 5. Project list (content final; copy belongs to the owner)

| # | name | href | description | icon class |
|---|---|---|---|---|
| 1 | factory | `#factory` (data-minimize) | A busy factory in a web page, inspired by **[Factorio](https://factorio.com/)**. *Press m to minimize this window and watch it run.* (touch: *Tap to minimize this window and watch it run.*) | `icon--factory` |
| 2 | 16384.dev | https://16384.dev/ | Source code behind various projects, including this website and others. | `icon--code` |
| 3 | rarp.org | https://rarp.org/ | RFCs are cool, more engineers should read them. This is ~all of them, with ISO Plain Language variants. | `icon--rfc` |
| 4 | enchilada.dev | https://enchilada.dev/ | I have been trying to make an end-to-end agentic software factory, with varying degrees of success. | `icon--enchilada` |
| 5 | hollow | https://16384.dev/hollow (commented out) | Content-addressed static site generation in Rust & Nix. Every page a Merkle leaf with pure rebuilds. | `icon--hollow` |
| 6 | external-memory | https://16384.dev/external-memory (commented out) | A personal knowledge store: put things in, get them back, clip what matters. | `icon--memory` |
| 7 | eternal-blue | https://eternal-blue.akl.run/ (commented out) | Analyzing Seattle Sounders FC across the whole MLS era, on the pitch and in the front office. | `icon--eternal` |

Write `&` as `&amp;` in Astro source. The order is fixed; do not sort.

### 5.1 Icons (inline SVG, 12×12 pixel art; copy verbatim)
All seven, as they appear in the final board. Attributes only — no `style`. The eternal-blue mark is an original shield with a Space Needle silhouette in the club's green/blue, not the club crest.

**factory (furnace)**

```html
<svg class="icon icon--factory" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="1" y="4" width="10" height="7" fill="#6b625a"></rect><rect x="2" y="5" width="8" height="5" fill="#7a7066"></rect><rect x="4" y="7" width="4" height="2" fill="#ff8c28"></rect><rect x="5" y="7" width="1" height="1" fill="#ffe3a0"></rect><rect x="8" y="1" width="2" height="3" fill="#4a4f55"></rect><rect x="7" y="0" width="1" height="1" fill="#cfcfc8"></rect><rect x="2" y="11" width="8" height="1" fill="#2e2f31"></rect><rect x="3" y="11" width="1" height="1" fill="#d7b64b"></rect><rect x="6" y="11" width="1" height="1" fill="#d7b64b"></rect><rect x="9" y="11" width="1" height="1" fill="#d7b64b"></rect></svg>
```

**16384.dev (code)**

```html
<svg class="icon icon--code" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="0" y="1" width="12" height="10" fill="#1f2428"/><rect x="0" y="1" width="12" height="1" fill="#3a4046"/><rect x="1" y="1" width="1" height="1" fill="#6b7378"/><rect x="3" y="1" width="1" height="1" fill="#6b7378"/><rect x="3" y="4" width="1" height="1" fill="#5ad1d1"/><rect x="2" y="5" width="1" height="1" fill="#5ad1d1"/><rect x="1" y="6" width="1" height="1" fill="#5ad1d1"/><rect x="2" y="7" width="1" height="1" fill="#5ad1d1"/><rect x="3" y="8" width="1" height="1" fill="#5ad1d1"/><rect x="7" y="3" width="1" height="1" fill="#e9ecdc"/><rect x="6" y="4" width="1" height="2" fill="#e9ecdc"/><rect x="5" y="6" width="1" height="2" fill="#e9ecdc"/><rect x="4" y="8" width="1" height="1" fill="#e9ecdc"/><rect x="8" y="4" width="1" height="1" fill="#5ad1d1"/><rect x="9" y="5" width="1" height="1" fill="#5ad1d1"/><rect x="10" y="6" width="1" height="1" fill="#5ad1d1"/><rect x="9" y="7" width="1" height="1" fill="#5ad1d1"/><rect x="8" y="8" width="1" height="1" fill="#5ad1d1"/><rect x="5" y="10" width="2" height="1" fill="#3fa34d"/></svg>
```

**rarp.org (document)**

```html
<svg class="icon icon--rfc" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="2" y="1" width="7" height="10" fill="#dfe3e6"></rect><rect x="9" y="3" width="1" height="8" fill="#dfe3e6"></rect><rect x="8" y="1" width="1" height="2" fill="#9aa3ab"></rect><rect x="9" y="2" width="1" height="1" fill="#9aa3ab"></rect><rect x="3" y="3" width="4" height="1" fill="#6b7378"></rect><rect x="3" y="5" width="5" height="1" fill="#6b7378"></rect><rect x="3" y="7" width="3" height="1" fill="#6b7378"></rect><rect x="3" y="9" width="5" height="1" fill="#c67f50"></rect></svg>
```

**enchilada.dev**

```html
<svg class="icon icon--enchilada" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="0" y="9" width="12" height="2" fill="#dfe3e6"/><rect x="1" y="11" width="10" height="1" fill="#9aa3ab"/><rect x="1" y="5" width="10" height="4" fill="#d9a96a"/><rect x="1" y="5" width="1" height="4" fill="#b8864a"/><rect x="10" y="5" width="1" height="4" fill="#b8864a"/><rect x="2" y="8" width="8" height="1" fill="#b8864a"/><rect x="2" y="4" width="8" height="2" fill="#b23a2a"/><rect x="3" y="6" width="1" height="1" fill="#b23a2a"/><rect x="7" y="6" width="1" height="1" fill="#b23a2a"/><rect x="9" y="6" width="1" height="1" fill="#b23a2a"/><rect x="4" y="4" width="1" height="1" fill="#f4d67a"/><rect x="8" y="4" width="1" height="1" fill="#f4d67a"/><rect x="6" y="5" width="1" height="1" fill="#f4d67a"/><rect x="5" y="3" width="1" height="1" fill="#3fa34d"/><rect x="2" y="3" width="1" height="1" fill="#3fa34d"/><rect x="3" y="1" width="1" height="1" fill="#cfcfc8" opacity=".55"/><rect x="8" y="0" width="1" height="2" fill="#cfcfc8" opacity=".4"/></svg>
```

**hollow (merkle tree)**

```html
<svg class="icon icon--hollow" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="5" y="1" width="2" height="2" fill="#dfe3e6"></rect><rect x="4" y="3" width="1" height="1" fill="#5ad1d1"></rect><rect x="7" y="3" width="1" height="1" fill="#5ad1d1"></rect><rect x="3" y="4" width="1" height="1" fill="#5ad1d1"></rect><rect x="8" y="4" width="1" height="1" fill="#5ad1d1"></rect><rect x="2" y="5" width="2" height="2" fill="#dfe3e6"></rect><rect x="8" y="5" width="2" height="2" fill="#dfe3e6"></rect><rect x="2" y="7" width="1" height="1" fill="#5ad1d1"></rect><rect x="4" y="7" width="1" height="1" fill="#5ad1d1"></rect><rect x="7" y="7" width="1" height="1" fill="#5ad1d1"></rect><rect x="10" y="7" width="1" height="1" fill="#5ad1d1"></rect><rect x="1" y="8" width="1" height="1" fill="#5ad1d1"></rect><rect x="1" y="9" width="2" height="2" fill="#9aa3ab"></rect><rect x="4" y="9" width="2" height="2" fill="#9aa3ab"></rect><rect x="7" y="9" width="2" height="2" fill="#9aa3ab"></rect><rect x="10" y="9" width="2" height="2" fill="#9aa3ab"></rect></svg>
```

**external-memory (ghost in the shell)**

```html
<svg class="icon icon--memory" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="1" y="0" width="10" height="12" fill="#141c22"/><rect x="0" y="1" width="12" height="10" fill="#141c22"/><rect x="1" y="2" width="3" height="1" fill="#2a6e78"/><rect x="1" y="2" width="1" height="4" fill="#2a6e78"/><rect x="8" y="9" width="3" height="1" fill="#2a6e78"/><rect x="10" y="6" width="1" height="4" fill="#2a6e78"/><rect x="9" y="1" width="2" height="1" fill="#2a6e78"/><rect x="1" y="10" width="2" height="1" fill="#2a6e78"/><rect x="5" y="1" width="2" height="1" fill="#3fa8b4"/><rect x="4" y="2" width="4" height="4" fill="#3fa8b4"/><rect x="5" y="6" width="2" height="1" fill="#3fa8b4"/><rect x="3" y="7" width="6" height="2" fill="#3fa8b4"/><rect x="2" y="8" width="8" height="2" fill="#2f8691"/><rect x="5" y="3" width="2" height="2" fill="#bff6f6"/><rect x="2" y="5" width="8" height="1" fill="#bff6f6" opacity=".25"/><rect x="8" y="4" width="1" height="1" fill="#e9ecdc"/><rect x="8" y="5" width="1" height="1" fill="#e9ecdc"/><rect x="9" y="4" width="1" height="2" fill="#5ad1d1" opacity=".5"/></svg>
```

**eternal-blue (shield + Space Needle)**

```html
<svg class="icon icon--eternal" viewBox="0 0 12 12" width="44" height="44" aria-hidden="true" focusable="false"><rect x="1" y="1" width="10" height="7" fill="#5d9741"></rect><rect x="2" y="8" width="8" height="2" fill="#5d9741"></rect><rect x="3" y="10" width="6" height="1" fill="#5d9741"></rect><rect x="4" y="11" width="4" height="1" fill="#5d9741"></rect><rect x="2" y="2" width="8" height="5" fill="#236192"></rect><rect x="3" y="7" width="6" height="2" fill="#7ab35a"></rect><rect x="5" y="2" width="2" height="1" fill="#ffffff"></rect><rect x="4" y="3" width="4" height="1" fill="#ffffff"></rect><rect x="5" y="4" width="2" height="5" fill="#ffffff"></rect><rect x="4" y="8" width="1" height="1" fill="#ffffff"></rect><rect x="7" y="8" width="1" height="1" fill="#ffffff"></rect></svg>
```


## 6. Engine (`public/assets/js/mapgen.js`)

### 6.0 What changes and what doesn't
Keep everything `AGENTS.md` documents about the engine: infinite 32×32-tile chunks (tile 6px) pre-rendered on first sight, chunk content a pure function of `(cx, cy, seed)` via `hash(cx, cy, seed+salt)`, true-LRU chunk cache (256 desktop / 128 phone), the Seattle land polygon, camera glide between waypoints, pauses (hidden tab, off-screen, 120 s idle, watchdog), DPR quantisation, local date-hashed rain, `Intl`-based night, `window.__mapgen`, OG determinism rules.

What changes: the **live layer** gets more entities and a set of event state machines that write the journal; chunk recipes gain new district kinds (which changes the `rnd()`/salt sequence — the look is re-approved from scratch, not diffed, and all old `?seed=` permalinks change; accepted). The mock engine in `reference/engine-reference.js` implements every machine below on a *fixed* hand-placed world; port the behaviour, not the world. Function names in parentheses point into that file.

### 6.1 New chunk recipes (district kinds)
Existing: `wild outpost mine smelt asm power hub`. Add/extend:
- `nest` — creep ground tint (`#5e3a36/#6b433d` with `#7a4a44` speckle), 2 spawners (pink ellipses, pulsing ±8%), 2 worms (nodding), dead trees. Only on land ≥ ~12 chunks from any `hub`; roughly 1 per 40 chunks; deterministic from the chunk hash.
- `outpost` — extend the existing kind: 21×21 wall ring (`#8e969c` tiles with seams), concrete interior, 5 gun turrets (4 corners + centre), 4 ammo chests, a radar block, 2 lamps, a big pole. Placed by chunks adjacent (toward the base) to a `nest`.
- `hub` — concrete pad 30×26, roboport (4×4, antenna, two charge lights), 4×4 logistic-chest grid + a 12-chest row, a **12×10 construction lot** left empty, spidertron parked.
- `labs` — 4 labs (3×3, white) on a science belt; `solar` — 8×4 panel grid + 10 accumulators; `oil` — tar patch, 3 pumpjacks, refinery (5×5, 3 stacks, one flare), 2 chem plants, 3 tanks, pipes; `storage` — concrete yard with an 8×4 chest grid; `silo` — add hazard-stripe border and 4 pad lamps.
- Roads: a 2-tile concrete strip under the big-pole line between `smelt` and `hub` chunks; lamps at district corners.
Rendering details for every entity (colours, sub-tile pixels) are in the reference file's "structures" section (`furnace`, `assembler`, `drill`, `pole`, `lamp`, `chest`, `concrete`, `wall`, `turret`, `pipeH/V`, `railLine`, `station`, spawner/worm drawing). Copy the palette.

### 6.2 Live layer (drawn every frame over the chunk blits; view-cull everything)
- **Belts** (`simBelts`, `drawDyn`): chevrons scroll at 9 px/s; items are 2×2 with a 1px highlight, spaced ≥ 3.2 px, per-lane colour mixes (ore+coal; iron+copper; red/green/blue science; circuits; gears; plastic). A jammed path stops.
- **Inserters**: two-phase swing — phase `w = (t·k + φ) mod 2`, arm offset `-cos(wπ)` for `w<1` (outbound, item drawn on the hand in the adjacent belt's colour) and `cos((w−1)π)` back; `k` 1.4 (normal, yellow) / 2.2 (fast, blue). Idle (arm at −1) when their belt path is jammed or, for station inserters (within 34 px of a station), when no train is stopped there.
- **Furnaces**: mouth glow `.55 ± .25` pulse; embers (1px, `#ffb347`, 0.6–1 s, 6% per frame per visible furnace); chimney puffs; dark (`.2`) while the ore line is jammed.
- **Boilers**: firebox flicker. **Steam engines**: piston + flywheel + exhaust puff every .35–.55 s. **Drills**: 4-spoke rotating bit + dust puffs. **Assemblers**: rotating 4-pixel gear + 0.18 s white stripe blink every 3–7 s. **Pumpjacks**: walking beam (`sin φ`, 1.8 rad/s). **Chem plants**: green pulse + a moving bright pixel. **Refinery flare**: flickering flame. **Labs**: 4 flasks on an elliptical carousel. **Solar**: diagonal glint band sweeping the field by day. **Accumulators**: charge bar (blue > 30%, else red) from `power.acc`. **Roboport**: alternating blue charge lights, pulsing antenna. **Bots**: yellow logistic bots (≤ 10) between structures with item pixels and a shadow pixel; blue construction bots; red deconstruction bots.
- **Trains** (`simTrains`): up to 3; loco smoke puff every .16 s behind the head; brake dust at stations; cargo wagons show 3 item pixels that empty over the 4.5 s stop; headlight cone at night. Block signals every 150 px and 70 px before each station: red when any car of a train on that line is within `len+60` px past the signal.
- **Water**: sparkle pixels, shore foam (wobbling 3×1 pixels on shore-adjacent water, `sin(1.6t + …) > .2`), **9 fish** near shore (2 px/s wander, turn at land, 25% jump with a ripple ring every 2–7 s).
- **Car**: parked at the hub; every 25–55 s drives the road to the smelter (or back) accelerating to 44 px/s; headlights at night; dust.
- **Spidertron**: parked at the hub; 8 legs with stepping gait (a foot re-plants when > 7 px behind its rest point, lift 0.18 s); walks at 20 px/s.
- **Night lights** (`drawLights`): after the night overlay (`rgba(8,14,38, .5·night)`), with `globalCompositeOperation = 'lighter'` and one pre-rendered 64px radial sprite: lamps (60px; switch on through `night .25→.58` with per-lamp hash flicker), furnaces (28), boilers (24), chem plants, flare, silo floodlights (4 × 80 when ready/launching) and launch bloom, train and car headlight cones, turret muzzle glow, laser hits, spidertron. Brownout multiplies lamp alpha by `power.sat`.
- **Rain** (existing schedule): streaks in screen space plus a blue tint; by day a lighter tint (`rgba(30,40,60,.12)`); lightning (§6.3).

### 6.3 Event state machines (each `emit()`s journal lines; the queue releases ≤ 1 line per 0.9 s; ambient lines only when the queue is empty)
Parameter values are the mock's; keep them unless they look wrong in the infinite world.

| machine | states / rule | journal lines |
|---|---|---|
| **Raid** (`simRaid`) | `pollution += 0.018·(1 + 0.1·chem)` per s. When `pollution ≥ 1` and `cooldown ≤ 0`: spawn `8 + min(10, ⌊5·pollution⌋)` biters just east of a nest (22% "big": hp 9, speed 11; else hp 4, speed 15), `pollution = .2`. Each walks (sine wiggle ±4 px/s) to its own point on the outpost's facing wall. Turrets: range 66 px, nearest target, cadence .30–.42 s, tracer .07 s, muzzle flash .06 s, recoil, brass ember; 1 damage. Spidertron within 56 px fires a laser (2 dmg, .5 s). Death: 6 splatter pixels + corpse fading over 30 s. At the wall: every .7 s hit the nearest segment with < 3 damage (crack overlay); count *distinct* damaged segments. End when no raiders remain or after 60 s → `cooldown = 40–70 s`, up to 4 repair bots fly from the roboport, hover 1.5 s, clear all damage. Camera: glide to the outpost, zoom +6%, hold while active and in view. | `pollution cloud reached nest N-1 · 13 biters inbound → outpost O-1` · `turret T-2 engaging · 13 hostiles in range` · `spidertron S-1 responding → O-1` (if parked) · `defense: 13/13 biters repelled · wall segments damaged: 4` · `construction bots repairing wall (4)` |
| **Construction lot** (`simLot`) | idle 25–45 s → **ghost** 2.5 s (dashed blue outlines with marching dashes, 18% blue fill) → **build**: 5 blue bots from the roboport, one entity each, hover 1.1 s with a welding arc, then the entity is painted into the chunk canvas + white flash → **standing** 50–80 s → **decon**: red X overlays, 5 red bots remove entities in .8 s each (restore ground from an ImageData saved at start) → idle. 14 entities: 6 assemblers, 6 inserters, 1 belt, 1 lamp. | `blueprint placed: 14 ghosts · 5 construction bots dispatched` · `construction complete · assembly block A-2 online` · `deconstruction planned: A-2 (upgrading to assembler-3)` · `deconstruction complete · 14 entities returned to storage` |
| **Silo** (`simSilo`) | **build**: parts 0→100 at 1.5/s (green bar under the silo) → **ready** 10 s: doors slide open over 3 s, 4 red pad lights blink at 2 Hz, floodlights at night, engine flicker after 8 s → **launch** 7 s: `y −= p²·520`, smoke ring (24 puffs) on ignition, exhaust puffs while `p < .5`, camera zoom −12% → **gone**: after 9 s a cargo pod re-enters under a parachute (14 px/s down, 2.2 px/s west drift), lands beside the pad with dust, sits 6 s → parts reset. Camera holds for ready/launch and glides back for the pod (16 s). | `rocket silo: 100/100 parts · launch sequence started (T-10)` · `rocket launched · payload: satellite` · `cargo pod re-entering · tracking…` · `cargo pod recovered · 1 space-science-pack` |
| **Trains** | stop 4.5 s at each station; open lines reverse/respawn off-screen. Signal flips are logged at 20% sampling. | `train L-7 arrived · ST-2 ore unload` · `signal S-9 → red` |
| **Belt jam** | every 45–85 s one random path stalls for 6–10 s. | `belt B-3 backed up · 5 inserters waiting` · `belt B-3 cleared · inserters resumed` |
| **Power** | `acc` drains .012/s while `night > .5`, recharges .02/s otherwise; at `acc ≤ .15` (and ≥ 20 s since the last) a 3.5 s brownout: `sat = .62 ± .08·sin(30t)` dims the lamps. | `power: accumulators 14% · brownout · steam engines to full load` |
| **Radar** | dish 1.6 rad/s with a faint 40 px sector; every 18 s a 2.2 s expanding ring to 110 px. | `radar RD-1 charted sector (x,y)` |
| **Research** | 48 s per item through `automation-2, advanced-material-processing, railway, solar-energy, oil-processing, robotics, rocket-silo` (loops). Percent feeds the production readout. | `research complete: …` · `research started: …` |
| **Spidertron patrol** | every 70–110 s: hub → outpost → hub at 20 px/s (stays at the outpost while a raid is active). | `spidertron S-1 → outpost O-1 (ammo resupply)` · `spidertron S-1 returned to hub` |
| **Car** | see §6.2 | `car C-1 → hub` / `car C-1 → smelter` |
| **Storm** | while raining: lightning every 18–48 s (full-frame white flash decaying at 6/s), 50% logged. | `storm: lightning strike · grid at 100%, no faults` |
| **Click-to-look** | canvas click → camera target = that world point, 14 s linger, orange ripple. | `camera → tile (x,y)` |
| **Ambient** | existing list + `pumpjack PJ-2 yield 71%`, `refinery: advanced-oil-processing · 2 cycles`, `logistic network: 1,204 iron-plate in storage`, `roboport RP-1 charging 4 bots`, `offshore pump OP-1: 1200/s`, `circuit: inserter#9 enabled (iron-plate < 400)`, `chem plant CP-1: plastic-bar ×2`, `furnace row F-2: 7/7 heating`, `fish spotted off OP-1 · 9 in school`, `storage yard: 61% full`, `assembler A-1-3: iron-gear-wheel ×4`. Scheduled off the rAF clock every 2.4–5 s, never the same twice running. | — |
| **Run-start** (comment) | on load and on `r`. | `# factory simulator run started · seed 0x… · r to reroll · m to minimize · click the map to look around` (keep the `?seed=` permalink) |

Identifiers like `N-1`, `O-1`, `ST-2`, `L-7`, `B-3` are flavour; derive them from chunk coords or counters, they need not be globally unique.

### 6.4 Camera (`simCam`)
Waypoints prefer points of interest (one per district kind within ~3 chunks) over random land; linger 9–15 s; ease factor `1 − e^(−0.32·dt)` (0.9 while an event is pulling); hold while a raid is active in view or the silo is ready/launching; zoom breathing `±4%·sin(0.11t)` plus event offsets (−12% launch, +6% raid) eased at 0.8/s. Today's "slow to a crawl when a rocket or train is on screen" becomes these holds.

### 6.5 Time of day
`night ∈ [0,1]` from the existing `nightNow()`. Add a dev aid `?time=cycle` (160 s loop: 42% day, 8% dusk ramp, 40% night, 10% dawn) — not default. Accept `?time=day|dusk|night` for screenshots.

### 6.6 Stats and readout
`onStats` ≤ 1 Hz: `{ power: round(sat·100), trains, bots, threats (non-idle biters), science, rockets, repelled, built, parts, research: "<name> <pct>%" }` → `[data-prod]`. Readout ≤ 2 Hz from `cam.geo()`; adjust the geo mapping so the camera's reachable range reads 47.59–47.62 N / 122.30–122.36 W.

### 6.7 Still frame = reduced motion = OG
`still` mode: pre-simulate 360 steps at `dt = 0.05` (18 s of world time, camera pinned, no ambient log), draw once; redraw on resize and click. Use it for `prefers-reduced-motion: reduce` and for `capture-og` (with the existing `Math.random`/`Date`/`performance.now` pins — note the pins make the 360 pre-steps deterministic too).

### 6.8 Budgets, caps, determinism
- ≤ 8 ms average frame at 1440×900 DPR 2 headless (mock: ~3 ms at DPR 1 with ~600 belt tiles and ~60 particles); first frame < 150 ms; phone 30 fps cap.
- Caps: smoke 400, embers 200, splats 120, corpses 60, tracers 40, ripples 20, logistic bots 10, construction bots 9, biters 24 (+4 idle).
- Everything above is **ephemeral**: `Math.random` + rAF clock only. Chunk canvases stay pure in `(cx, cy, seed)`; the construction lot paints into its chunk canvas and restores from a saved ImageData, which is fine because the chunk regenerates identically after eviction (the lot is empty in the pure state).
- Entities that straddle chunk seams (rails, belts, roads) already merge at draw time; nests/outposts must fit inside one chunk.
- `rnd()`/salt order inside `World.chunk()` is the new sacred sequence once the look is approved. Add the determinism test from `AGENTS.md` (two `World(seed).chunk(cx,cy)` byte-equal) to your self-checks.
- `window.__mapgen` gains `events` (last 20 lines), `stats()`, `lookAt(x,y)`, `setMode('hub'|'factory')`.

## 7. Other files
- `public/_headers`: unchanged. Nothing new fetches; the Google Fonts hosts stay in the CSP for the blog only. `boot.js` is same-origin so it passes `script-src 'self'`.
- `public/assets/js/boot.js`: new (§2.1).
- `public/llms.txt`: rewrite as akl.run — what the page is, the seven projects with one line each, keys (`m`, `r`), click-to-look, `?seed=`, link to akl.dev for the person.
- `public/humans.txt`: credit Newsreader (Production Type, OFL 1.1) and JetBrains Mono (OFL 1.1); remove the Simple Icons credit (no brand marks remain); keep the Seattle polygon data credit.
- `public/robots.txt`: allow all, sitemap URL for akl.run.
- `public/images/og.png`: regenerate (hub state, day, `?seed=0xa85b492a`, 1200×630). Check the 900px window fits at 630 tall with the current padding; if not, the OG capture may pass a viewport-specific class — but prefer that the real layout simply fits (it does at 900×~560).
- Remove from `main.css`: `.banner*`, `.ident`, `.name`, `.place`, `.bar`, `.slot*`, `.ls*`, `.tile*`, `.caret`, the 102-column banner `clamp()` rule and its comment. Keep `.shade`, `.term`, `.status`, `.log*`, `.permalink`, `.hudf`, `rise`, minimise rules.
- `golden/`: regenerate; expect `index.html`, `manifest.sha256` (and sitemap if the site URL changed) to change.

## 8. `AGENTS.md` — text to merge
Replace the "Layout" bullet about `index.astro` ("the page: DOM contract markup + head only") with the §3 contract summary, and replace the opening of "Map generator" with:

> **Page.** akl.run is a project hub over the factory. `.hub` (inside `#windows`) is the centred window: title, house chip (→ akl.dev), seven project rows. State `factory` (class on `<html>`, set before first paint by `boot.js` when the host is `factory.*` or the hash is `#factory`, mirrored by `aria-pressed` on `[data-readout]`) minimises the hub (`opacity/transform/visibility` transition + `inert`, focus moved to the readout) and shows `.fg` (`[data-restore]`), `.prod` (`[data-prod]`, desktop only) and the journal. Toggles: the `factory` row (`[data-minimize]`), the readout, `m`. The first row's whole surface is one stretched `<a>`; the word *Factorio* in it is a second, raised `<a>`. Rows 2–7 are single `<a>`s. Three rows ship commented out until their routes exist.
>
> **Journal.** `[data-log]` holds two pinned comment lines (the Factorio trailer link, the run-start line with the `?seed=` permalink) and a ring of 6 (phone 4) event lines built with DOM APIs. Lines come from the event machines (raid, construction/deconstruction, silo + cargo pod, trains/signals, belt jams, brownouts, radar, research, spidertron, car, storms, click-to-look) and an ambient list; `emit()` queues at ≤ 1 line / 0.9 s and ambient lines only fill silence. All scheduling is off the rAF clock, so a pinned clock yields exactly the two comments (OG determinism).
>
> **Events are ephemeral; chunks are not.** Event timing and entity motion use `Math.random` and the rAF clock. Chunk content remains `hash(cx, cy, seed+salt)`; the construction lot paints into and restores its chunk canvas, which is safe because the pure state is the empty lot. The `rnd()`/salt order inside `World.chunk()` is sacred — adding a placement means re-approving the look and invalidating `?seed=` permalinks.
>
> **Still frame.** `still` pre-simulates 18 s of world time with the camera pinned and draws once; it is the reduced-motion path and the OG capture path.

Then amend the Camera bullet (POI waypoints, event holds, zoom offsets), the Log bullet (ring of 6, pinned comment, queue), the Keys bullet (`m` also from the row and `fg`; click-to-look), the Perf bullet (§6.8 caps), and the `window.__mapgen` bullet (new members). Keep every other bullet.

## 9. Acceptance
Screenshots to match (rendered from the demos; in `screenshots/`):
`hub-desktop-1440.png`, `hub-desktop-1200.png`, `hub-desktop-800.png`, `hub-desktop-factory-mode-after-m.png` (day, 12 s after `m`), `factory-mode-night-1440.png`, `hub-phone-390.png`, `hub-phone-390-factory-mode.png`, `factory-host-start-1440.png` (what `factory.akl.run` shows 3 s after load, day).

Checklist:
1. `npm run build`, `nix flake check --impure` pass; `golden/` regenerated and committed; `og.png` regenerated and byte-reproducible across two `capture-og` runs.
2. Served from `dist/` with `_headers` applied: zero CSP violations in the console in both states.
3. Layout matches the targets at 1440×900, 1200×720, 800×700, 390×844, 360×640; descriptions one line ≥ 761px, two lines ≤ 760px; no horizontal scroll at any width; the window never clips (over-tall scrolls).
4. Tab order: house chip (akl.dev), `factory`, `Factorio`, `16384.dev`, `rarp.org`, `enchilada.dev`, readout. Enter on `factory` enters factory mode and focus lands on the readout; `m` toggles; Enter on `% fg` restores and focus returns to the `factory` link.
5. JS-off: seven links work, hint hidden, readout hidden, journal hidden; nothing dead or broken.
6. Reduced motion: no animation, one world frame, journal shows only the two comment lines.
7. Within 3 minutes of a fresh load at 1440×900 the journal has logged at least one each of: train arrival, signal flip, belt jam, blueprint placed, raid start and end, radar chart, research line; within 6 minutes a launch and a cargo-pod recovery.
8. Perf: ≤ 8 ms average frame at 1440×900 DPR 2 headless; first frame < 150 ms; phone capped at 30 fps; chunk LRU holds.
9. Determinism: two `new __mapgen.World(seed).chunk(cx, cy)` canvases byte-equal via `getImageData`; two loads with the same `?seed=` show the same world (events may differ).
10. `llms.txt`, `humans.txt`, `robots.txt`, head metadata, JSON-LD updated; `AGENTS.md` merged per §8; no blog file touched.
11. Host rule: served with `Host: factory.akl.run` (or any `factory.*` hostname, e.g. a `/etc/hosts` alias of the preview) the page's first painted frame is factory mode — no hub flash (check with a Playwright trace or `page.screenshot` at `load`); `% fg` restores the hub; `m` toggles. Served as `akl.run` it starts in hub. `akl.run/#factory` starts in factory.

## 10. Open items (owner)
- Repo shape A vs B (§0.3). Either way, add `factory.akl.run` as a second custom domain on the Pages project (§0.5).
- What akl.io/ serves after the move (the owner is moving his homepage to akl.dev; out of scope here).
- Un-comment `hollow`, `external-memory`, `eternal-blue` when live.
- JSON-LD: keep (default) or drop on akl.run.
