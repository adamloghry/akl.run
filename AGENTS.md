# AGENTS.md

Project hub at https://akl.run (and https://factory.akl.run). An Astro 7 static
site (SSG): a centred "window" listing a few projects, laid over a live,
infinite pixel-art factory drawn on a full-viewport canvas. The factory is an
engine written as TypeScript modules in `src/factory/`, bundled by Vite into
one hashed module. `npm run build` (or `nix build`) produces the deployable
output; there is no server-side runtime. The design lives in
`docs/handoff/README.md` (the handoff, the product spec) and
`docs/superpowers/specs/2026-11-01-akl-run-design.md` (decisions that override
or extend it); the build plan is in `docs/superpowers/plans/`.

## Layout

- `src/pages/index.astro` — the page: markup + head only. The hub (`.hub`,
  `#hub-window`, `data-windows`) sits inside `<main id="windows">`; four
  project rows ship, three more are commented out until their routes exist.
  `<html class="factory">` is the single state carrier (see "Page states").
  No inline `<script>` and no inline `style=` / `<style>` — see CSP below.
  Void elements are written without a trailing slash, as Astro emits them.
  Resist splitting it into components.
  - Head order is: meta/title/canonical/OG/Twitter, favicons, font preloads,
    **`boot.js`**, `rel=me`, JSON-LD, the hashed module `<script>`, and the
    hashed stylesheet `<link>` **last**. That order is what Astro 7's
    compiler emits (`$$renderHead` renders just before `</head>`, processed
    scripts render in place); `boot.js` still runs before first paint and the
    stylesheet is render-blocking wherever it sits. Don't fight it — the
    golden check will tell you if it moves.
  - `boot.js` is `<script is:inline src={asset('assets/js/boot.js')}></script>`.
    **`is:inline` is mandatory**: Astro 7's compiler turns a `<script
src={expr}>` with no other attribute into a *processed* script and
    silently drops the `src`. It is a plain synchronous file because it must
    run before first paint (processed scripts are `type="module"`, i.e.
    deferred): it adds `html.factory` when the host is `factory.*` or the
    hash is `#factory`, and `html.js` always.
  - The engine entry is exactly `<script src="../factory/page.ts"></script>`,
    the **only** processed script. Any extra attribute makes Astro treat it
    as unprocessed/inline. It builds to one `dist/_astro/*.js` module.
- `src/styles/main.css` — the whole design (tokens, fonts, desktop/phone
  split at 760 px, factory mode, motion, `.shade/.term/.status/.log*/.hudf`).
  Imported in the `index.astro` frontmatter and emitted as a hashed
  `<link rel="stylesheet">` (`inlineStylesheets: "never"`).
- `src/lib/asset.ts` — `asset(path)` appends `?v=<first 8 hex of the file's
SHA-256>` for fixed-URL files under `public/`. Only `boot.js` uses it
  now; link any new fixed-URL `public/` script/style through it and never
  hand-write a `?v=`. (The fonts are preloaded at fixed URLs without `?v=`
  so the `<link rel=preload>` and `@font-face` URLs match exactly.)
- `public/` — served verbatim at the site root: `robots.txt`, `humans.txt`,
  `llms.txt`, `_headers`, favicons, `assets/js/boot.js`, `assets/fonts/`
  (JetBrains Mono Regular/Bold, Newsreader 16pt Regular/Italic; sources and
  licences in `humans.txt`), and `images/og.png` (the social card, an
  absolute-URL `<meta>` target — don't move it without updating the tags).
  `@astrojs/sitemap` generates `/sitemap-index.xml` + `sitemap-0.xml`.
- `golden/` — the byte-pinned output snapshot (see below).
- `tests/` — `unit/` (Vitest), `fakes/` (test doubles), `e2e/` (Playwright
  harness, own `package.json`). `nix/` — flake modules (`checks.nix`,
  `golden.nix`, `treefmt.nix`). `dist/` — build output (gitignored).
  `tmp/` — local scratch and design screenshots (gitignored).

### Engine modules (`src/factory/`)

| module | responsibility |
|---|---|
| `core/hash.ts` | `hash(x,y,s)`, `vnoise`, `noise`, `chunkRng(cx,cy,seed)` (sequential `rnd()` over `hash(cx,cy,seed+1000+k++)`) |
| `core/rng.ts` | ephemeral RNG (`rand.next/range/int/pick/chance`); calls `Math.random` at call time so tests and the OG pin can replace it; `setRandom()` |
| `core/clock.ts` | sim clock: accumulated rAF `dt` clamped to 0.1 s, `speed` multiplier (test aid), `step()` for fixed steps |
| `core/raster.ts` | pure RGBA `Raster` (`rect` source-over, `px`, discs/ellipses as spans) + `makePaint` helpers; no Canvas2D |
| `core/types.ts` | the frozen contracts (`Features`, `RecipeCtx`, `SimCtx`, `EventMachine`, `Stats`, `T=6`, `CH=32`, `CPX=192`, `AP=3`, …) |
| `world/geo.ts` | Seattle polygon, land mask, shore distance, tile↔lat/lon, `DOWNTOWN`, `CENTRAL_BOX` |
| `world/palette.ts`, `sprites.ts` | colours; structure painters drawing onto a `Raster` |
| `world/terrain.ts` | `chunkBase`, `baseKind` (kind dice), ground painting, shared rail/road corridors |
| `world/recipes/*.ts` | one recipe per district kind: `wild mine smelt asm power hub outpost nest labs solar oil storage silo` (+ `bank.ts` shared helpers) |
| `world/pairing.ts` | pure nest/outpost pairing (`nestCandidate`, `pairedOutpost`) |
| `world/overlay.ts` | the one sanctioned Canvas2D user in `world/`: epoch-checked `saveRect`/`paint`/`restore` (the construction lot) |
| `world/world.ts` | `World(seed, {cap, canvasFactory})`: `kindAt`, `paintRaster`, `chunk`/`peek` (true LRU), `epoch`, `generation`, `query(rect)` (seam-joined rails/roads), `findSite(kind, from, maxChunks)` |
| `live/*.ts` | per-frame layer over the chunk blits, view-culled: `belts inserters machines water particles bots lights rain`; `live/index.ts` exposes the push APIs events use |
| `events/*.ts` | one machine per file: `raid spider storm lot silo trains car jams power radar research look`; `events/index.ts` builds them (`makeMachines`) |
| `sim.ts` | owns World, Cam, Live, the machines, env and stats; `step(dt)`, `draw()`, `stillFrame()` |
| `camera.ts` | `Cam`: POI waypoints, event holds, zoom breathing, `lookAt`, `prefer`, `geo()` |
| `journal.ts` | the DOM log ring (`textContent` only) and the ambient list |
| `page.ts` | entry: modes, keys, readout/stats, pauses, DPR, reduced motion, `?seed=`/`?time=`, `window.__mapgen` |

**Why Vite bundling now** (the previous engine shipped one plain `mapgen.js`): ~200 KB of
engine across ~50 modules needs real modules and Node-side tests, and hashed
filenames give cache-busting that `?v=` cannot give module imports.

**Module-scope rule:** no module calls `core/rng`, touches the DOM or creates
a canvas at import time (sprites such as the light glow are created lazily on
first draw). That keeps every module importable in Vitest and keeps the
ephemeral RNG's first call inside `Sim` construction, which the OG pin
depends on.

## CSP and `_headers`

`public/_headers` is THE source of truth for security headers (the head has
no http-equiv security `<meta>`). It is kept byte-identical to the predecessor site's policy.
`script-src` is just `'self'`; there is no `connect-src`, so `default-src
'self'` governs it — the page makes no third-party requests at all (rain is
computed locally, see "Day, night, weather"). Adding any fetch target means
adding a `connect-src`, deliberately.

- Any inline `<script>` (or `<style>` / `style=`, which `style-src 'self'`
  forbids) added to `index.astro` is **silently blocked by the browser**,
  not caught by Astro. Hence `inlineStylesheets: "never"` and
  `vite.build.assetsInlineLimit: 0` in `astro.config.mjs`, and hence
  `boot.js` being an external file. JS may set `canvas.width/height`,
  classes and attributes; it must not write `el.style` (the CSSOM would
  pass the CSP, but nothing here needs it).
- The nix check **`csp-output`** (`nix/checks.nix`) turns that trap into a
  build failure: it fails if any built `*.html` contains `<style`, ` style=`
  or a `<script>` without `src` that isn't `application/ld+json`, if
  `index.html` lacks `boot.js?v=`, or unless it contains exactly one
  `<script type="module" src="/_astro/`. It is line-based, so it won't catch
  a tag split across lines or a tab before `style=`; keep tags on one line.
- `application/ld+json` (the JSON-LD `Person` block, with `"url":
  "https://akl.dev/"` and `"mainEntityOfPage": "https://akl.run/"`) is the
  one exemption: CSP's inline-script check runs inside "prepare the script
  element" *after* the MIME-type check, which returns early for non-JS
  types, so `script-src` doesn't apply to it. Re-verify against the
  production policy (load the build, minus `frame-ancestors`, and check the
  console) if `_headers` changes; the e2e `csp` check does this.
- If Cloudflare zone-level email obfuscation is ever enabled, its injected
  decode script is served from `/cdn-cgi/…` — same origin, so `'self'`
  permits it. A local serve can't exercise that; it is stated, not tested.
- Every source is `'self'`: the fonts are self-hosted under
  `public/assets/fonts/`, so there is no Google Fonts host in `style-src` or
  `font-src` (the handoff's demo pages load them from Google; the site does
  not). Adding any third-party host is a deliberate change: regenerate
  golden afterwards (`_headers` is in the manifest).

## Dev environment

Nix flake using devenv; plain Node also works.

- `nix develop --impure` enters the devShell (`--impure` because devenv's
  flake integration reads env vars at eval time). `.envrc` runs `use flake .
  --impure`, so `direnv allow` does the same on `cd`. Inside: `dev`,
  `build`, `preview` wrap the npm scripts; `devenv up` runs the dev server
  as a managed process.
- npm scripts: `dev`, `build`, `preview`, `check` (`astro check`), `test`
  (`vitest run`, the unit suite).
- Without nix: `npm install && npm run dev` with Node >= 22.23.4 (Astro 7.4's floor). That
  `engines` floor is Astro 7.4's own minimum, kept so a non-nix contributor
  gets a working install; `astro build` hard-fails below it. The nix
  toolchain pins Node 24 (`nodejs_24`), one major ahead; that gap is
  intentional. **Golden and `og.png` must come from the Node 24 toolchain.**
- `nix build` builds the site into `result/` via `pkgs.importNpmLock` against
  `package-lock.json` (no npm hash to maintain).
- `nix flake check --impure` runs six checks: `build`, `astro-check`,
  `treefmt`, `golden-output`, `unit` (a `buildNpmPackage` running `npm test`
  with `CI=1` against the locked deps; no network) and `csp-output`.
- Entering the devShell installs a pre-commit hook running `treefmt`. It only
  exists after you've entered the shell once; committing without ever doing
  so gets no hook and no error. The hook's config, `.pre-commit-config.yaml`,
  is a gitignored symlink into the Nix store; if the store path was
  garbage-collected `git commit` fails with a plain "config not found" —
  re-enter the devenv shell.
- **`git add` new files before checking with nix.** Flakes only see
  git-tracked files, so an unstaged new file is invisible to `nix build` and
  to `golden-output` and both read as passing. If something isn't showing up
  in `dist/` under nix, check `git status` first. (Run `git add -A` before
  `nix flake check` after regenerating golden for the same reason.)
- `nix fmt` (treefmt: nixfmt + prettier, printWidth 110) formats nix, JSON,
  workflows and `src/**`, `tests/**`. It deliberately excludes
  `src/pages/index.astro` (with `compressHTML: false` its source whitespace
  is the deployed bytes), `astro.config.mjs`, `public/assets/**`,
  `public/_headers`, `golden/**`, `docs/**`, `**/package-lock.json`,
  binaries and `*.md`. The reasoning is inline in `nix/treefmt.nix`; keep it
  there when editing the list. It must be idempotent: run it twice.
- `AGENTS.md` and `CLAUDE.md` (which just points here) are repo tooling and
  not shipped; only `public/` and the rendered pages ship.

## Output is byte-pinned

`golden/` holds a snapshot of the build output: the four generated files
(`index.html`, `404.html`, `sitemap-index.xml`, `sitemap-0.xml`) verbatim, plus
`manifest.sha256` covering every file in `dist/` by hash — the `public/`
passthrough (including `og.png`) **and the hashed `_astro/*` files**. The
`golden-output` check diffs a fresh build against it.

This is deliberate friction. Any intentional change to the deployed bytes
fails the check until you regenerate:

    npm run build
    nix run .#update-golden
    git add -A          # nix only sees tracked files

and commit `golden/` with the source change, so every change to the deployed
bytes is visible in review.

The snapshot is stable because the output is deterministic: Astro/Vite's
`_astro/` filenames are content hashes, so they change only when their bytes
do (this replaces the predecessor's "no hashed assets" rule); the sitemap emits no
`<lastmod>`; and `asset()`'s `?v=` is a content hash. A dated sitemap entry
or any build-time timestamp would break this.

**Regenerate only from a `dist/` built on Node 24 with the locked deps** (the
flake's toolchain). Another Node, or `npm install` that re-resolved the lock,
can emit different bundle bytes and must not be snapshotted — build with
`nix build` and `nix run .#update-golden -- result` if in doubt. A golden
failure after touching the compiler/bundler, or after a Node/Astro/Vite bump,
is usually that kind of change: check that the diff is only hashes and
whitespace before re-baselining. Because the engine bundle is in the
manifest, **any edit to `src/factory/**`, `src/styles/**` or `index.astro`
changes golden.**

## Deploy

- **Cloudflare Pages' Git integration deploys the site**, running `npm
  clean-install && npm run build` on Cloudflare's image, outside nix, and
  publishing `dist/`. Pushes to `trunk` go to production; other branches get
  previews. It must be a **Pages** project, not a Worker: a Workers Builds
  project runs `npx wrangler deploy` after the build.
- **`wrangler.jsonc` must stay.** Its `pages_build_output_dir` marks the repo
  as Pages, so a stray `wrangler deploy` refuses instead of autoconfiguring:
  without it wrangler runs `astro add cloudflare` and rebuilds with the
  adapter, which prerenders inside workerd, where `asset()` can't read
  `public/`, and the build fails. Never add the Cloudflare adapter; there is
  no server-side runtime.
- **`404.html`** (`src/pages/404.astro`) is what Pages serves, with status
  404, for any path with no file. It reuses `main.css` and the hub window
  chrome but loads neither `boot.js` nor the engine. Every URL in it is
  root-absolute because it answers at arbitrary depths. Without it Pages
  would treat the site as an SPA and answer every unknown path with
  `index.html` and a 200.
- **One Pages project, two custom domains: `akl.run` and `factory.akl.run`.**
  No redirects. Both serve the same build; `boot.js` starts factory mode when
  `location.hostname` matches `^factory\.` (or the hash is `#factory`), with
  no hub flash. `<link rel="canonical">`, OG URLs and the sitemap stay
  `https://akl.run/` on both. Adding the project and domains is dashboard work
  the owner does; nothing in the repo needs to know about it.
- Its Node comes from `.node-version` (`24`, matching the flake). Without it
  the image default (22.16 as of Oct 2026) is below the `engines` floor and
  `astro build` fails. Keep it in step with `nodejs_24`.
- That build is npm, not nix, so a green `nix flake check` doesn't prove the
  deploy; they read the same `package-lock.json`, so only toolchain drift
  splits them.
- `.github/workflows/nix.yml` runs `nix flake check --impure
  --no-update-lock-file` and builds the devenv shell on every push
  (`flake.lock` is committed so it fails loudly instead of re-resolving).
- No allowlist step: everything under `public/` ships.
- `renovate.json` configures dependency updates (npm, GitHub Actions,
  `flake.lock`) but only acts once the Renovate bot is installed.
- **Deploying without CI:** `nix run .#deploy` builds nothing itself; it
  publishes `./result` (else `./dist`, or the directory you name) with
  wrangler, tagged with the branch and commit. It needs
  `CLOUDFLARE_API_TOKEN` (Pages:Edit), `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_PROJECT_NAME`. Prefer `nix build` first. Like the image tooling
  it is an `app`, so wrangler never enters the build closure.

## Page states

State `factory` (a class on `<html>`) is the only state carrier; `.is-minimized`
is not used. `boot.js` sets it before first paint. It minimises the hub
(`opacity/transform/visibility` transition + `inert` on `.hub`, with focus
moved to the readout first if it was inside) and shows `.fg` (`[data-restore]`),
`.prod` (`[data-prod]`, shown only at >= 1100 px wide; it would meet `.fg` below that) and the journal. `[data-readout]`
mirrors it with `aria-pressed` (its `aria-label` is constant, and it has
`aria-controls="hub-window"`). Toggles: the `factory` row (`[data-minimize]`),
the readout, and `m`; `% fg` restores and moves focus to the `factory` link.
The first row's whole surface is one stretched `<a>`; the word *Factorio*
in it is a second, raised `<a>`. JS-off: the four project links work and the
readout, hint and journal stay hidden. The first frame on a `factory.*` host is
already factory mode.

## Engine ("Map generator")

`window.__mapgen` is the only global. Everything below lives in
`src/factory/`; hooks into the markup are all null-guarded so a missing hook
degrades rather than throws (`#map`, `[data-windows]`, `[data-log]`,
`[data-log-static]`, `[data-readout]` + `[data-readout-text]`, `[data-minimize]`,
`[data-restore]`, `[data-prod] [data-stat]`). `page.ts` wraps start-up in a
try/catch and the frame step in a log-once-and-stop catch, so an engine error
leaves the hub fully usable.

**Chunk = pixels + features.** The world is an infinite grid of 32×32-tile
chunks (tile 6 px, 192 px per chunk, plus a 3-tile apron for neighbour
lookups). `World.paintRaster(cx, cy)` is the canvas-free core: it paints a
pure-TS `Raster` through a `RecipeCtx` and returns `{ raster, features, kind }`.
`World.chunk()` = `paintRaster` + an injected `canvasFactory()` +
`putImageData` + LRU insert. Every feature (belts, inserters, machines, rails,
stations, roads, solar fields, shore tiles, and the nest/outpost/hub/silo
sites) carries a stable id like `b:12,-3:4`, so `live/` and `events/` key
ephemeral state by id. `World.query(rect)` merges the features of *resident*
chunks (rails and roads joined across seams, memoised on rect + `generation`);
nothing outside `world/` holds a chunk. `World.kindAt(cx, cy)` is pure and
raster-free: what a chunk *will* be, generated or not — camera and event site
searches use it for never-painted chunks. Painters work in fractional tile
units through `tr()`, which rounds to whole pixels (min 1 px) the same way on
both sides of a seam; there is no anti-aliasing, so chunk bytes are identical
across browsers.

**`rnd()`/salt order is sacred.** `chunkRng` is `hash(cx, cy, seed + 1000 +
k++)`, and the named salts (`seed + n`) are: `1` water/sand noise, `2`
grass/dirt noise, `3` trees, `4`/`8` ore noise, `5` ore kind, `500` the
industrial die (16 faces), `504` silo override (1/8), `510` nest roll (1/4),
`520`/`521` road flags, `610` furnace variant, `670`–`673` nest creep/spawners,
`680` labs, `690`/`691` solar, `700`/`701` oil. Adding, removing or reordering
an `rnd()` call, or changing a salt, changes every chunk of every seed and
invalidates every shared `?seed=` permalink; pixel-art painters are frozen
alongside it. If the sequence must change, re-approve the look, don't diff it.

**Kind dice (retuned, and why).** A chunk is ≈ 1.2 km and Seattle has only
about 200 land chunks, yet events need specific districts (hub, silo, nest +
outpost) inside the *reachable area*: `CENTRAL_BOX` (47.59–47.62 N,
122.30–122.36 W, ≈ 3.7×2.7 chunks) plus Chebyshev distance 4 around the
camera. `baseKind` (terrain.ts): land fraction < .35 → `wild`; .35 ≤ land
< .6 → `mine` if ore > 90 else `outpost`; land ≥ .6 → one of 16 die faces
(`smelt asm power hub asm smelt mine asm labs solar oil storage power smelt asm
hub`), overridden to `silo` 1/8 of the time, and to `mine` if ore > 180 (or
> 60 on a `mine` face); remaining `mine` faces become `asm`. Hubs are 2 of 16
faces. A unit test requires hub, silo and a nest+outpost pair within reach on
≥ 18 of 20 seeds, and no industrial kind above 40% of non-wild chunks. These
numbers changed the world for every seed once, before the look was frozen;
now they are frozen too.

**Nest/outpost pairing** (`world/pairing.ts`, pure and bounded). A chunk with
land ≥ .6 whose base kind is not `hub`, `silo` or `mine` is a *nest candidate*
when `hash(…, seed+510) < 1/4` and no chunk within Chebyshev 2 has base kind
`hub` (base kinds only, so no recursion; the handoff's "≥ 12 chunks from a
hub" is 2 because a larger radius would exclude all of Seattle). The nest's
outpost is, among its 4 neighbours with land ≥ .6 that are not themselves
candidates, the one nearest downtown (ties N, E, S, W); that chunk's kind
becomes `outpost` facing the nest. A chunk answers "am I a paired outpost?"
by checking its four neighbours. Both sites fit inside their own chunk. The
outpost carries its own small roboport (repair bots); the spidertron is the
nearest hub's, and the spider patrol only runs with a hub and an outpost
within 4 chunks.

**Chunk cache = true LRU.** `peek`/`chunk` re-insert on a hit; eviction takes
the oldest and zeroes the canvas `width/height` (iOS memory) and bumps
`generation`. Caps 256 desktop / 128 phone, switched on the media-query flip.
`draw()` generates missing visible chunks nearest-first under a ~6 ms/frame
budget (always at least one) plus at most one ring chunk beyond the view; the
first draw of every new `Sim` (load, reroll, reduced-motion flip) has an infinite budget so the page never opens half-painted.

**Live layer.** `live/*` draws the animated things over the chunk blits,
view-culled, and exposes push APIs (`particles.spawn`, `lights.add`, bots)
for events. Caps: smoke 400, embers 200, splats 120, corpses 60, tracers 40,
ripples 20, logistic bots 10, construction bots 9, biters 24 (+ up to 4 idle ones per visible nest: draw-only wanderers near the spawners, owned by `events/raid.ts`, `ctx.rand` only, never in `threats`, pruned when the nest leaves view).

**Event machines.** Each `events/<name>.ts` implements `EventMachine`
(`update`, `draw`, `camHint`, optional `wants`, `reset`, `state`). *Slow* state
(pollution, silo parts, lot idle timer, research, accumulators, jam/radar/storm
timers) accumulates globally, independent of the camera. A machine binds to a
*site* only when a visible phase is about to start: `World.findSite(kind,
camera, 4)` searches `kindAt` outward up to 4 chunks (raid → nest and its
outpost; lot, spider, car → hub; silo → silo); if none, it re-arms with a
short retry and `wants()` biases the camera toward the kind it needs. Trains
have no site of their own; stations sit only on hubs the rail mainline (tile
column 44 mod 64) crosses, so after 40 s without an arrival `trains` visits
the nearest such hub within 4 chunks (target priority 1, up to 45 s; 8.5 while
a train brakes into it, above a raid fight) and marks a hub with no station,
or with one no train reaches within 12 s, as unserved. Each step
a bound machine compares the site chunk's `epoch`; if the chunk was evicted it
`reset()`s silently (no journal line) and keeps its accumulator. The
construction lot paints through `world/overlay.ts` tokens, which are no-ops
after eviction, so stale pixels can never be restored; the regenerated chunk
is the pure empty lot. Event timing and motion use `core/rng` + the sim clock
only; they never touch the chunk salt sequence.

**Camera** (`camera.ts`). Starts at downtown (47.607 N, 122.335 W) and, every
9–15 s, picks a waypoint: the nearest chunk of each non-`wild` kind within
3 chunks *and inside `CENTRAL_BOX`* (not one of the last 4 kinds), else a
random ≥ 60%-land point in the box, else downtown. `prefer(kind)` (one-shot)
biases the pick toward a needed kind, searching the box farther out; machines
with a non-null `wants()` take turns at it, the turn passing on every waypoint
pick (`Cam.picks`), so a kind the camera cannot find never starves the others. Event `camHint`s override with a target and/or
`hold`, and add zoom offsets; zoom is 2.4 desktop / 2.0 phone with ±4%
breathing; `lookAt` lingers 14 s. If event coverage ever fails, widen the
waypoint region rather than loosening the acceptance.

**Journal** (`journal.ts`). `[data-log]` holds two pinned comment lines (the
Factorio trailer link, then the run-start line with the `?seed=` permalink,
which also removes the no-JS note) and a ring of 6 event lines (4 on phone)
built with DOM APIs (`textContent`, never HTML strings). Comment lines wrap (`pre-wrap`); event lines stay one line with an ellipsis. At 761-1180 px the panel keeps its width and sits above the readout (`bottom: 84px`, no 320 px inset); under 560 px tall in that band it is dropped. `emit()` queues and
releases ≤ 1 line / 0.9 s off the sim clock; ambient lines (2.4–5 s apart,
never the same twice running) fill silence only and defer while `[data-log]`
has focus-within. A line holding keyboard focus is never evicted. Because
scheduling uses the sim clock, a pinned clock yields exactly the two comment
lines. `Journal.reset()` (called whenever a new `Sim` replaces the old one:
reroll, reduced-motion flip) drops the queue, timers, the recent buffer and the previous run's ring
lines (comments stay), since the new sim clock restarts at 0.

**Still mode = reduced motion = the OG path.** When `prefers-reduced-motion:
reduce` matches, `page.ts` builds the `Sim` with a no-op `emit` and a
seed-derived LCG (not `Math.random`), and `sim.stillFrame()` generates the
view, pins the camera and runs 360 steps at `dt = 0.05` once, then draws.
Redraws (resize, click-to-look, the 60 s night/rain refresh) re-draw the
current state without re-running the pre-steps, so font/resize timing can't
change the pixels. `capture-og` reaches this path by launching chromium with
`--force-prefers-reduced-motion`; it is the same code a reduced-motion visitor
gets. The change listener rebuilds the sim both ways.

**Keys, pauses, sizing.** `r` rerolls (new random seed, fresh `Sim`, camera
to downtown, `history.replaceState`, new run-start line); `m` toggles the
mode; clicking the canvas requests a look. Shortcuts are ignored with
Ctrl/Meta/Alt/Shift, on repeat/IME composition and inside inputs or
contenteditable (WCAG 2.1.4). Phone has no reroll (no keyboard); don't add a
button. `isRunning()` = not hidden, not off-screen (IntersectionObserver), not
idle (120 s without input, **hub mode only**: factory mode is meant to be watched and never idle-pauses) and not reduced; a 1 s watchdog re-kicks a missing
or stalled (> 1.5 s) rAF, which is load-bearing on mobile. Phone caps at ~30
fps. Backing store = CSS size × `devicePixelRatio` capped by
`min(2, sqrt(4e6 / (cssW·cssH)))`, quantised to an integer divisor of the
real ratio (0.75 floor below ratio 1.5); resizes debounce 100 ms. The readout
(`lat° N · lon° W · zoom×`) refreshes ≤ 2 Hz and `[data-prod]` ≤ 1 Hz.

**Day, night, weather.** Night comes from `Intl` in America/Los_Angeles (full
dark 21:00–05:00, ramping 19–21 and 05–07), cached and refreshed every 60 s.
Rain is not live weather: `rainNow()` hashes the LA date and 3-hour window
against that month's `RAIN_P` (NOAA SEA normals × .6), so it is a pure
function of the date and needs no network.

**Query params.** `?seed=` matches `/^(0x)?[0-9a-fA-F]{1,8}$/` (base 16);
otherwise random per load. `?time=day|dusk|night` pins the night level and
`?time=cycle` runs a 160 s loop (42% day, 8% dusk, 40% night, 10% dawn);
unknown values are ignored.

**`window.__mapgen`:** `seed`, `seedHex`, `world`, `cam`, `sim`, `state`
(`running hidden offscreen idle reduced factory W H dpr frames t rain`),
`events` (last 20 journal lines), `machines` (state name per machine),
`speed` (**a get/set accessor**, the sim-clock multiplier, default 1 — assign
to it, don't call it), `reroll()`, `minimize(bool)`, `setMode('hub'|'factory')`,
`renderNow()`, `stats()`, `lookAt(x, y)`, `World`, `Cam`, `T`, `CH`, `perf()`
(`frames first firstDraw n avg p95 max chunks`) and `resetPerf()`. Speeds
above 1 are for smoke runs only: chunk generation lags the camera and
under-samples sites.

**Determinism boundary.** `world/**` may use `core/hash` and must never import
`core/rng` or `core/clock` nor mention `Math.random`, `Date` or `performance`.
`tests/unit/boundary.test.ts` scans every `src/factory/world/**` file with
token-bounded regexes (so `update` doesn't false-positive). A chunk is a pure
function of `(cx, cy, seed)`: `tests/unit/world/` checks that independent
`World` instances give byte-equal `paintRaster` buffers for every kind across
seeds, and the e2e `determinism` check does it in a browser (on
`paintRaster` buffers, not live canvases — the construction lot legitimately
repaints those). `live/`, `events/` and `camera.ts` use only `core/rng` +
`core/clock`.

## Tests

- **Unit** — `npm test` (`vitest run`, `tests/unit/**/*.test.ts`, node
  environment; DOM tests opt in with `// @vitest-environment jsdom`). Test
  doubles in `tests/fakes/`: `world.ts` (a hand-built `WorldQuery` +
  overlay), `ctx.ts` (a `SimCtx`), `canvas.ts` (a recording fake 2D
  context/canvas), so the world, live layer, event machines, camera and
  journal are each tested against the contracts alone. Event machines are
  driven through full cycles with a fake clock/RNG and asserted on their exact
  journal lines. The suite also holds the `paintRaster` perf guard, the
  boundary scan, the placement/reachability tests and page-level jsdom tests.
  It runs in `nix flake check` as the `unit` check.
- **Build** — `nix flake check --impure` (see Dev environment).
- **Acceptance (e2e)** — `tests/e2e/`: plain Node + `playwright-core`, own
  `package.json`/lock, **outside nix** and gitignored `node_modules`, so it
  never enters the flake source or the Cloudflare build.

      npm run build
      (cd tests/e2e && npm install)
      node tests/e2e/run.mjs [check...]    # default: every check except coverage

  It serves `dist/` with the `/*` block of `public/_headers` applied and maps
  `akl.run` and `factory.akl.run` to it. `CHROMIUM=/path/to/chromium` picks a
  browser (otherwise it runs `nix build nixpkgs#chromium` once and caches the
  path in `tmp/.chromium-path`); `PORT` defaults to 4329. Checks: `shots`
  (screenshots to `tmp/shots/`, to be compared by eye with the design targets
  in `tmp/design_handoff_akl_run/screenshots/`; worlds differ by design),
  `csp` (zero console violations in both states), `layout`, `a11y`, `jsoff`,
  `reduced`, `perf` (≤ 8 ms average frame at 1440×900 DPR 2, first draw
  < 150 ms, chunks ≤ cap), `determinism`, `host` (`factory.akl.run` paints
  factory mode at `load`), and the opt-in **`coverage`**: 6 real minutes at
  speed 1, 1440×900, on `factory.akl.run/?seed=0xa85b492a` (event timing stays
  random; about 1 world in 10 has no nest-and-outpost pair near the box and so
  never raids, which `world.test.ts` bounds at ≤ 2 of 20), asserting every handoff section-9 item-7
  line appears (train, signal, belt jam, blueprint, raid start/end, radar,
  research within 3 minutes; launch and pod recovery within 6; it polls every
  5 s, so each deadline allows 5 s of slack). Run it after touching the dice,
  the camera or any event machine; if it fails, tune retry timing and POI
  bias, not the acceptance.
- **What `layout` asserts, and why rfc.akl.run is 3 lines at 390 px.** At
  1440/1200/800 every project description is one line (no wrap); at ≤ 760 px
  descriptions wrap rather than ellipsise, nothing clips, and the
  `rfc.akl.run` description (the longest, ~100 characters) is 2 lines at 520 px
  and **3 lines at 390 px**. The handoff says "two lines ≤ 760", but at 390 the
  text column is only 268 px (390 − 2·20 page − 2·16 hub − 36 icon − 14 gap) at
  14.5 px real Newsreader, which genuinely needs 3 lines — and the design's own
  screenshot (`hub-phone-390.png`) wraps it to 3 as well. CSS and copy were
  left as designed; the check pins the actual behaviour. Also: no horizontal
  scroll at any width, and at 360×640 the window never starts above the top
  (an over-tall window scrolls).

## Image tooling

Three flake **apps** (`capture-og`, `optimize-og`, `update-golden`) plus
`deploy`. The image tools are deliberately not in `packages.default`, `checks`
or the devShell, so chromium (hundreds of MiB) never lands in CI or the Pages
artifact; they're fetched only when someone runs them.

    npm run build                       # capture-og reads dist/, so build first
    nix run .#capture-og                # re-render + optimise public/images/og.png
    nix run .#capture-og -- 0x1234abcd dist path/to/out.png    # args optional
    nix run .#optimize-og               # re-compress an existing PNG in place

- **`capture-og`** copies `dist/` to a throwaway directory, injects a pin
  script at the very start of `<head>` of that copy only (so it runs before
  `boot.js` and the bundled engine), serves it, and screenshots headless
  chromium at 1200×630, DPR 1, `TZ=America/Los_Angeles`, with
  `--force-prefers-reduced-motion` (still mode, above), then pngquants and
  oxipngs the result. The pins: the rAF timestamp and `performance.now()` →
  constants; `Date` → 12:00 PDT (full daylight, log stamps, the seasonal rain
  window); `Math.random` → a seeded LCG; plus a stylesheet that disables CSS
  animation/transition so the rise-in can't depend on timing. None of this is
  ever injected into the shipped page (inline script/style would break the
  CSP). It also forces desktop hover/pointer types via `--blink-settings`.
  Default seed `0xa85b492a`, hub state, day. Output is **byte-reproducible**:
  same build in, same bytes out (run it twice and compare `sha256sum`).
  `og.png` is in the golden manifest, so regenerate golden after recapturing.
- **`optimize-og`** is just the compression half (`pngquant` → `oxipng`);
  the map is flat-shaded pixel art over a small palette, so a 256-colour
  quantise is visually lossless.
- `optimize-og` is exposed on all systems; `capture-og` is Linux-only
  (guarded by `optionalAttrs pkgs.stdenv.isLinux`).
- `golden-output` covers `dist/` only and says nothing about these apps. A
  newer nixpkgs may ship a different chromium or pngquant that changes the
  PNG's bytes; that's expected, not a bug in the pins.

## Conventions

- Preserve the JSON-LD and Open Graph / Twitter Card `<meta>` tags in
  `index.astro`'s head when editing it. Security headers live in `_headers`.
- No inline `<script>`, `<style>` or `style=` in emitted HTML (see CSP); the
  engine and `page.ts` set only `canvas.width/height`, classes and attributes.
- Void elements in `index.astro` have no trailing slash (`<meta charset="utf-8">`),
  because that's what Astro 7's compiler emits; source and output then agree
  by construction.
- DOM text is built with `createElement` + `textContent`, never by assigning
  HTML strings; every DOM hook is null-guarded.
- Dark only. Copy, colours, sizes and timings follow the handoff unless the
  design doc overrides it.
- Palette and contrast: the tokens in `main.css` match the handoff, including
  `--faint` `#8b987b` (4.53:1 on `--water`, above WCAG 1.4.3 AA; it was
  lightened from `#7d8a6c` at 3.77:1 — don't drift back). Contrast is a
  two-layer story: text sits on a translucent dark shade panel (`.shade`),
  light text also carries a `text-shadow`, and the canvas paints a subtle, symmetric
  edge vignette in `Sim.scrim()` (<= 0.25 alpha, no left bias, no night/rain term; the night overlay
  already darkens). The true
  backdrop is the live map under a 50% shade, so the AA numbers hold against
  `--water` but are thinner over the brightest tiles (ore, sand, pale
  rooftops). Factory-mode chrome (`.fg`, `.prod`) carries only a 1 px ring
  shadow. Don't remove the shade or the shadow to "clean up" the look.
- Prettier is `printWidth: 110` for `src/**`, `tests/**`. Run `nix fmt`
  before committing.

## Adding a project row / a district / an event

- **Project row:** `src/pages/index.astro` (the `<li>`; icon inline, `&amp;`), `public/llms.txt`,
  `tests/unit/page-markup.test.ts` (row count/links), `tests/e2e/checks/{a11y,jsoff,layout}.mjs` (row
  counts, description wrapping), then rebuild and regenerate `golden/` and `public/images/og.png`.
- **District kind:** the union in `core/types.ts`, a recipe in `world/recipes/<kind>.ts` registered in
  `recipes/index.ts`, the kind dice `DICE` in `world/terrain.ts` (this **re-rolls every seed**, so
  regenerate golden and the OG card), palette/sprites for its look, and the module/kind tables in this
  file and the handoff-derived docs.
- **Event machine:** one file in `events/`, register it in `events/index.ts` (`makeMachines`), add a unit
  test under `tests/unit/events/`, extend the module table here, and run `e2e coverage` once.

## Adding a page

No sitemap entry to add (`@astrojs/sitemap` picks up routes). Add it to
`public/llms.txt` if significant, `git add` the new file before checking with
nix, then rebuild and regenerate golden.

## Local preview

    npm run dev          # or `dev` / `devenv up` in the devShell
    npm run build && npm run preview

`?seed=0x…`, `?time=night` and `#factory` are handy while developing.
