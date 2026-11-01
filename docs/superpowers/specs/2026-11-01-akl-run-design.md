# akl.run — design

**Date:** 2026-11-01
**Status:** approved in brainstorming; adversarially reviewed and revised
**Authority:** `docs/handoff/README.md` (the Claude Design handoff, "the handoff") is the product spec: page content, DOM contract, visual spec, engine behaviour, acceptance. **This document records only the decisions that override or extend it**, mostly because akl.run is a new repository rather than an edit of akl.io's landing page. Where the two disagree, this document wins; where this document is silent, the handoff applies verbatim.

Companion material:

| path | tracked | what |
|---|---|---|
| `docs/handoff/README.md` | yes | the handoff spec (§ references below point here) |
| `docs/handoff/reference/engine-reference.js` | yes | mock engine — behaviour reference for every event machine and painter, not drop-in code |
| `docs/handoff/reference/*.dc.html`, `canvas.json` | yes | final design boards as exported |
| `docs/handoff/demo/*.html` | yes | working prototypes (open from disk) |
| `tmp/design_handoff_akl_run/screenshots/*.png` | **no** (8 MB, `tmp/` is gitignored) | pixel targets for §9 acceptance; local only |
| `../akl.io` | sibling repo | source of the infinite chunk engine, page driver, nix tooling |

---

## 1. Scope

Build all of the handoff in one pass: the hub page **and** the full §6 engine rework (new district kinds, live layer, event state machines, camera, still mode). akl.run is a brand-new deployment, so there are no published `?seed=` permalinks or production bytes to preserve; the new `rnd()`/salt sequence is simply the first one.

Out of scope: anything blog-related (it does not exist in this repo), akl.io's own future, Cloudflare dashboard work (owner adds the Pages project and the `akl.run` + `factory.akl.run` custom domains).

## 2. Repository shape (handoff §0.3 → shape A)

Seed from `../akl.io`, **copying** (not forking history):

- keep, adapted: `flake.nix` (+ `flake.lock`), `nix/treefmt.nix`, `nix/golden.nix`, `.envrc`, `.node-version` (24), `.github/workflows/nix.yml`, `renovate.json`, `tsconfig.json`, `src/lib/asset.ts`, `public/_headers` (byte-identical), `public/favicon.{ico,svg}`, `public/apple-touch-icon.png`, `public/assets/fonts/JetBrainsMono-Bold.woff2`, `CLAUDE.md` (→ "See AGENTS.md").
- rename `akl-io` → `akl-run` / "akl.io personal site" → "akl.run project hub" in package name, flake description, derivation `pname`.
- drop: everything blog (`src/content*`, `src/layouts`, `src/components`, `src/pages/blog`, `rss.xml.js`, `blog*.{css,js}`), deps `@astrojs/mdx`, `@astrojs/rss`, `@astrojs/markdown-remark`, the draft-regex block and `markdown:` block in `astro.config.mjs`, `public/assets/js/mapgen.js`, `public/assets/css/main.css` (both replaced, see §3).
- `public/_headers`: unchanged. Its Google Fonts allowances become unused (they existed for the blog); leave them — the handoff says the CSP should not change, and removing them is a separate, deliberate tightening the owner can do later.
- `.gitignore`: akl.io's, plus `tmp/` (already present) and `coverage/`.
- `AGENTS.md`: rewritten for akl.run. Carry over akl.io's still-true sections (CSP/`_headers`, dev env, golden, deploy, conventions, image tooling) edited for this repo; replace "Map generator" with handoff §8's text adapted to the module layout in §4; add "Tests" (§7) and "Deploy: two custom domains" (handoff §0.5). Remove all blog sections.

Work happens on branch `claude/akl-run` off `trunk`; nothing is committed to `trunk`. Push/PR only on the owner's request.

## 3. Build pipeline (overrides handoff §0.2 file list)

| handoff says | this repo does | why |
|---|---|---|
| `public/assets/js/mapgen.js` (plain, no bundler) | `src/factory/**/*.ts`, entry `src/factory/page.ts`, imported by a processed `<script>` in `index.astro`; Astro/Vite emits one hashed module `dist/_astro/*.js` | ~200 KB of engine needs real modules and Node-side tests; hashed filenames give cache-busting that `?v=` cannot for module imports |
| `public/assets/css/main.css` | `src/styles/main.css`, imported in `index.astro` frontmatter; emitted as hashed `<link rel="stylesheet">` | consistency with the JS; same cache story |
| `public/assets/js/boot.js` | **same** — plain file in `public/`, linked as `<script is:inline src={asset('assets/js/boot.js')}></script>`, sync, early in `<head>` | must run before first paint; processed scripts are `type="module"` (deferred). **`is:inline` is mandatory**: Astro 7's compiler turns a `<script src={expr}>` with no other attribute into a *processed* script and silently drops the `src` (verified against `@astrojs/compiler-rs` 0.5.2; akl.io's tag only survived because of `defer`) |
| fonts in `public/assets/fonts/` | **same**, fixed URLs, no `?v=` | `<link rel=preload>` and `@font-face` URLs must match exactly |

`astro.config.mjs`:

```js
export default defineConfig({
  site: "https://akl.run",
  compressHTML: false,
  integrations: [sitemap()],
  build: { inlineStylesheets: "never" },        // CSP: no <style>
  vite: { build: { assetsInlineLimit: 0 } },     // CSP: no data:/inline fallbacks
});
```

CSP check: the emitted page must contain no inline `<script>` other than `application/ld+json`, no `<style>`, no `style=`, and **must** contain `boot.js?v=` and exactly one `<script type="module" src="/_astro/`. A build-output check (§7.2) asserts this, so the "fails silently in the browser" trap becomes a build failure.

The engine entry is the **only** processed script: `<script src="../factory/page.ts"></script>` with no other attribute (any extra attribute makes Astro treat it as unprocessed/inline).

Head order (handoff §3.3, adjusted to what Astro 7 actually emits — the compiler renders `$$renderHead` immediately before `</head>`, and processed scripts render in place): meta/title/canonical/OG/Twitter → font preloads → `boot.js` (sync) → `rel=me` → JSON-LD → hashed module `<script type="module">` → hashed stylesheet `<link>` (last). boot.js still runs before the stylesheet and before first paint; the stylesheet being last in `<head>` is harmless (render-blocking either way). Authors of `index.astro` and the golden must not fight this order.

**Golden.** `golden/` holds `index.html`, `sitemap-index.xml`, `sitemap-0.xml` verbatim plus `manifest.sha256` over all of `dist/` (including `_astro/*`). Hashed names are content-derived, so the snapshot moves only when bytes do. `nix/golden.nix` is adjusted to the new file list (no `rss.xml`). AGENTS.md's old "hashed asset would break this" warning is replaced by this explanation.

Golden is regenerated from a `dist/` built with the locked deps on Node 24 (the flake's toolchain); a `dist/` from another Node/lock can differ and must not be snapshotted. AGENTS.md says so.

**Formatter.** treefmt/prettier now covers `src/factory/**`, `src/styles/**`, `src/lib/**`, `tests/**`, nix, JSON, workflows. Still excluded: `src/pages/index.astro`, `astro.config.mjs`, `public/assets/**`, `public/_headers`, `golden/**`, `*.md`, binaries, and `**/package-lock.json` (the root-only glob would miss `tests/e2e/package-lock.json`). Prettier config: `printWidth: 110` (the pixel painters are dense).

**Dependencies.** dev: `astro`, `@astrojs/check`, `@astrojs/sitemap`, `typescript`, `vitest`, `jsdom` (journal/page DOM tests). No runtime deps. Playwright lives in `tests/e2e/` with its own `package.json`/lock, outside the npm tree used by nix/Cloudflare (see §7.3); `tests/e2e/node_modules` is gitignored and therefore never enters the flake source.

## 4. Engine architecture

### 4.1 Core idea: a chunk yields pixels **and** features

The akl.io engine is an infinite, pure chunk world; the reference engine is a fixed world with exactly one nest, outpost, lot, silo. To run the reference's event machines on an infinite world, chunk generation returns structured features alongside its canvas:

```ts
interface Chunk {
  cx: number; cy: number; kind: DistrictKind;
  canvas: HTMLCanvasElement;                      // from an injected CanvasFactory; painted once from the raster
  features: Features;                             // world-pixel coordinates; every feature has a stable id
}
interface Features {
  belts: BeltPath[];          // polyline + lane item mix
  inserters: Inserter[];      // pos, dir, fast?, beltRef, stationNear?
  furnaces: Pt[]; boilers: Pt[]; engines: Pt[]; drills: Pt[]; assemblers: Pt[];
  pumpjacks: Pt[]; chemPlants: Pt[]; labs: Pt[]; accumulators: Pt[];
  solarFields: Rect[]; flares: Pt[]; lamps: Pt[]; poles: Pt[];
  rails: RailSeg[]; stations: Station[]; roads: RoadSeg[];
  shore: Pt[];                // shore-adjacent water tiles (foam, fish)
  sites: {
    nest?: { spawners: Pt[]; worms: Pt[]; rect: Rect };
    outpost?: { wall: WallSeg[]; turrets: Pt[]; radar: Pt; facing: Dir; rect: Rect };
    hub?: { roboport: Pt; lot: Rect; chests: Pt[]; carPark: Pt; spiderPark: Pt };
    silo?: { pad: Rect; lights: Pt[] };
    radar?: Pt;
  };
}
```

(Sketch only — the full, frozen definitions are written in `core/types.ts` as the first serial step; see §4.3.1.)

**Stable ids.** Every feature carries `id: string` derived from `(cx, cy, kind, index)` (e.g. `"b:12,-3:4"`), so `live/` and `events/` can key per-entity ephemeral state (belt item phase, jam flag, inserter phase, wall damage) in `Map<id, State>` across frames and re-queries. Per-entity ephemeral state for evicted chunks is pruned when `World.generation` changes.

`World.query(rect)` returns the merged features of all *resident* chunks intersecting `rect` (cross-chunk rails and roads already joined, as akl.io does for rails; belts are chunk-local by construction). It is memoised on `(chunk-aligned rect, World.generation)` where `generation` increments on every chunk insert/evict, so a steady frame allocates nothing. Nothing outside `world/` ever holds a `Chunk`; consumers hold feature values and re-query.

**`World.kindAt(cx, cy)`** — pure, raster-free, cached in its own large map (kind + land fraction only, no pixels): what district kind a chunk *will* be, generated or not. The camera's POI picker and event site search use it to find sites that have never been painted; `query` is for what is on screen.

### 4.2 Pure raster for chunk painting

Chunk recipes paint into a `Raster` — a pure-TS RGBA buffer (`Uint8ClampedArray`) with exactly: `rect(x, y, w, h, rgba)` (source-over with alpha), `px(x, y, rgba)`, and helpers built on those (`disc`, `ellipse`, `ring` as rect spans; `stripe`, `dashH/V`). No Canvas2D in `world/`. The finished raster is blitted once with `putImageData` onto the chunk canvas.

Consequences: (a) chunks are pixel-art crisp with no anti-aliasing; (b) chunk bytes are identical across browsers, not just within one; (c) the determinism test runs in Vitest on raw buffers with no native canvas dependency. The live layer (§4.4) still uses Canvas2D freely.

**Snapping rule (one rule, everywhere).** `Raster.rect` takes integer device pixels. Painters work in fractional *tile* units through one helper, `tr(tx, ty, w, h)` → `x0 = round(tx·6)`, `y0 = round(ty·6)`, `x1 = max(x0+1, round((tx+w)·6))`, `y1 = max(y0+1, round((ty+h)·6))`. So akl.io's `.25`-tile (1.5 px) rail ties become 2 px, consistently on both sides of a chunk seam (coordinates are chunk-local but tile-aligned, so rounding never differs across a seam). Ellipses/discs (spawners, worms, tanks, turrets) are scanline spans with the same rounding. The look change is accepted; it is re-approved anyway.

**Raster-level API for tests.** `World.paintRaster(cx, cy): { raster, features, kind }` is the canvas-free core; `World.chunk(cx, cy)` = `paintRaster` + `canvasFactory()` + `putImageData` + LRU. `canvasFactory` is injected (`document.createElement('canvas')` in the page, a fake in tests), so Vitest never needs `ImageData` or a native canvas.

**Perf guard.** A unit test asserts one `paintRaster` of the densest kind takes ≤ 3 ms median in Node (catches a slow blend loop early; first frame is ~30 chunks under 150 ms).

Chunk size: 32×32 tiles, tile 6 px, plus akl.io's 3-tile apron for neighbour lookups. LRU cap 256 desktop / 128 phone; eviction zeroes canvas dimensions (iOS memory).

### 4.3 Module layout (`src/factory/`)

| module | responsibility | may import |
|---|---|---|
| `core/hash.ts` | `hash(x,y,s)`, `noise`, `fbm`, `chunkRng(cx,cy,seed)` → sequential `rnd()` over `hash(cx,cy,seed+1000+k++)` | — |
| `core/rng.ts` | ephemeral RNG: `rand()`, `range(a,b)`, `pick(arr)`; calls `Math.random` **at call time** (so the OG pin script and tests can replace it); `setRandom(fn)` for tests | — |
| `core/clock.ts` | sim clock (accumulated rAF dt, clamp 0.1 s), speed multiplier for tests | — |
| `core/raster.ts` | §4.2 | — |
| `core/types.ts` | `Pt`, `Rect`, `Features`, `DistrictKind`, … | — |
| `world/geo.ts` | Seattle polygon (from akl.io `GEO`), land mask, shore distance, tile↔lat/long mapping (handoff §6.6 range) | core |
| `world/palette.ts` | colour constants, ported from the reference "structures" section | — |
| `world/sprites.ts` | structure painters on a `Raster` (`furnace`, `assembler`, `drill`, `pole`, `lamp`, `chest`, `concrete`, `wall`, `turret`, `pipe`, `rail`, `station`, `spawner`, `worm`, `roboport`, `silo`, `lab`, `pumpjack`, `refinery`, `chemPlant`, `tank`, `solar`, `accumulator`, `radar`, `boiler`, `engine`) | core, palette |
| `world/recipes/<kind>.ts` | one per district kind: `wild mine smelt asm power hub outpost nest labs solar oil storage silo`; signature `(ctx: RecipeCtx) => void` where `ctx` carries `raster`, `rnd`, land mask, shore field, and a `features` builder | core, sprites |
| `world/world.ts` | `World(seed, {canvasFactory, cap})`: `kindAt`, kind selection, recipe dispatch, **the sacred `rnd()`/salt order (lives only here and in recipes, called in a fixed order)**, LRU, `paintRaster`, `chunk`, `peek`, `query(rect)`, `generation`, seam merges, road strips between `smelt`/`hub`, nest/outpost placement (§4.5.1) | core, geo, recipes |
| `world/overlay.ts` | **the one sanctioned Canvas2D user in `world/`**: `saveRect(rect) → Token`, `paint(rect, fn(g: CanvasRenderingContext2D))`, `restore(token)`; a token records `(cx, cy, epoch)` and `restore`/`paint` are no-ops if that chunk has since been evicted (`epoch` bumps on (re)generation). Used by the construction lot. | world |
| `live/*.ts` | per-frame layer over chunk blits, view-culled: `belts` (items, chevrons, jams), `inserters`, `machines` (furnace glow/embers, boilers, engines, drills, assemblers, pumpjacks, chem, flare, labs, solar glint, accumulators, roboport), `water` (sparkle, foam, fish), `particles` (smoke, embers, splats, corpses, tracers, ripples; §6.8 caps in one pool), `bots` (logistic), `lights` (night overlay + `lighter` sprite pass), `rain` (+ lightning flash). Exposes **push APIs** that `events/` call: `particles.spawn(kind, …)`, `lights.add(LightSource)` (per-frame list, cleared each frame — turret flash, laser, floodlights, headlights), `bots.fly(BotTask)`. Sprites (radial glow etc.) are created **lazily on first draw**, never at module scope, so importing any module in Vitest is side-effect free. | core, `world.query` |
| `events/<name>.ts` | one machine per file: `raid lot silo trains belts power radar research spider car storm look`; common interface §4.5 | core, live, `world.query` |
| `events/index.ts` | registry + stats aggregation | events |
| `sim.ts` | owns `World`, `Cam`, live layer, events; `step(dt)`, `draw(ctx, view)`, `still()` (360 × 0.05 s pre-steps, camera pinned, ambient suppressed), `stats()` | all of the above |
| `camera.ts` | POI waypoints (one per district kind within ~3 chunks, else random ≥ 60% land), linger 9–15 s, easing, event holds, zoom breathing + event offsets, `lookAt(x,y)` (14 s linger), `geo()` | core, `world.query` |
| `journal.ts` | DOM ring: pinned line, run-start line (with `?seed=` permalink), ring of 6/4, emit queue ≤ 1 line / 0.9 s off the sim clock, ambient filler 2.4–5 s never repeating, `textContent` only, focus-safe eviction (akl.io rule) | core |
| `page.ts` | entry: reads `html.factory`, wires toggles (`[data-minimize]`, `[data-restore]`, readout, `m`), `r` reroll, keyboard guards, canvas click → `look`, readout ≤ 2 Hz, `[data-prod]` ≤ 1 Hz, pauses (hidden/offscreen/idle 120 s/reduced motion), watchdog, DPR quantisation, phone 30 fps cap, media-query flips, `?seed=`, `?time=`, `window.__mapgen` | everything |

Files stay focused: any module > ~600 lines is split.

Module-scope rule: no module calls `core/rng`, touches the DOM, or creates a canvas at import time. The ephemeral RNG's first call happens in `Sim` construction, so `capture-og`'s seeded `Math.random` sees a stable call order.

#### 4.3.1 Frozen contracts (`core/types.ts`, written first, serially)

Before any parallel work, one task writes `core/types.ts` in full and it is then frozen (changes go through the integrator). It must define at least: `Pt`, `Rect`, `Dir`, `DistrictKind`; every feature type with `id` — `BeltPath { id, pts: Pt[] (flow order), lanes: [ItemColor[], ItemColor[]] }`, `Inserter { id, at, dir, fast, beltId?, stationId? }`, `RailSeg { id, a, b, lineId }`, `Station { id, at, lineId, s }`, `RoadSeg`, `WallSeg { id, rect }`, `Machine { id, at, kind }` (furnace/boiler/engine/drill/assembler/pumpjack/chem/lab/accumulator/flare/lamp/pole/roboport/radar/turret), `SolarField`, `Sites`; `Features`; `RecipeCtx { cx, cy, seed, rnd, raster, tr, land(tx,ty), shore(tx,ty), feat: FeatureBuilder }`; `FeatureBuilder` (one `add<Type>` per feature list, assigns ids); `View { x, y, w, h, zoom, dpr }`; `LightSource { x, y, r, color, alpha, kind }`; `ParticleKind`; `BotTask`; `Emit = (text: string, opts?: { comment?: boolean }) => void`; `SimCtx { world: WorldQuery, cam: CamReadonly, emit, rand, t, dt, night, raining, phone, live: LivePush, stats: StatsSink }`; `CamHint { target?: Pt, hold?: boolean, zoomOffset?: number, priority: number }`; `EventMachine` (§4.5); `Stats` (handoff §6.6 shape). **Stats ownership:** each machine and live subsystem writes its own fields into a shared `StatsSink` each step (`bots` from `live/bots` + event bots, `trains` from `events/trains`, `threats` from `raid`, …); `sim.stats()` snapshots it.

### 4.4 Rendering per frame

`draw()` = blit visible chunk canvases (generate missing ones nearest-first under a ~6 ms budget; first frame unbounded — akl.io rule) → live layer → event overlays (ghosts, biters, rocket, pod, bots, lasers) → night overlay `rgba(8,14,38,.5·night)` → lights pass (`lighter`, one 64 px radial sprite) → rain/lightning → screen-space vignette/scrim (akl.io). Everything view-culled. Particle caps per handoff §6.8.

### 4.5 Event machines on an infinite world

```ts
interface EventMachine {
  name: string;
  update(ctx: SimCtx): void;               // ctx: world, overlay, cam, live, env, stats, emit, rand, t, dt, view features
  draw(g: CanvasRenderingContext2D, d: DrawCtx): void;
  camHint(): CamHint | null;               // hold / zoom offset / glide target
  wants?(): DistrictKind | null;           // kind it is waiting for; camera biases its POIs toward it
  reset(): void;                           // seed reroll, site lost
  state(): string;                         // for tests and __mapgen.machines
}
```

**Global accumulators, local sites.** Each machine's *slow* state accumulates globally, independent of the camera: pollution (raid), silo parts, the lot's idle timer, research, power/accumulators, belt-jam timer, radar timer, storm timer. A machine binds to a **site** only when a *visible phase* is about to begin (raid spawn, lot ghost, silo ready, train spawn, car drive, spider patrol). Binding: search with `World.kindAt` (not `query`) outward from the camera for the nearest qualifying site within **4 chunks**; if found, the machine emits its `camHint` (glide target + hold) and starts the phase once the site's chunk is resident; if none, it re-arms with a short retry (10–20 s) and biases the camera's next POI toward the needed kind. Site needs: raid → nest + its outpost; lot, spider, car → hub; silo → silo; radar → any radar; trains → rails + ≥ 1 station in view margin; belts jam → any belt path in view.

**Losing a site.** Each step a bound machine checks its site's chunk `epoch`; if evicted, it `reset()`s silently (no journal line) and keeps its global accumulator.

**Construction lot pixels.** Built entities are painted via `world/overlay.ts` (`saveRect` → `paint` per entity → `restore` on deconstruction). Tokens are epoch-checked, so a lot whose chunk was evicted and regenerated can never restore stale pixels; the regenerated chunk is the pure empty lot.

#### 4.5.1 Nest / outpost / hub placement (pure, in `world.ts`)

1. **Base kind** first: akl.io's selection from land fraction, ore and hashed die (`wild outpost mine smelt asm power hub`), extended with `labs solar oil storage silo`. Bands: land < .35 `wild`; .35 ≤ land < .6 `mine` (ore count > 90) else `outpost`; land ≥ .6 industrial (16-face die, salt 500; `silo` override when `hash(salt 504) < 1/8`; ore count > 180, or > 60 on a `mine` face, gives `mine`; other `mine` faces become `asm`). Computed by `kindAt` from land fraction + hashes only.
2. **Nest override:** a chunk with land ≥ .6 whose base kind is not `hub`, `silo` or `mine` becomes `nest` when `hash(cx,cy,seed+salt_nest) < 1/4` (salt 510) **and** no chunk within Chebyshev distance 2 has base kind `hub` (base kinds only → no recursion). The handoff's "≥ ~12 chunks from a hub" is reduced to 2, because hubs are ~1 in 8 land chunks and a larger radius would exclude all of Seattle. Why these numbers: a chunk is ≈ 1.2 km and Seattle has only ≈ 200 land chunks, while events need specific districts (hub, silo, nest + outpost) within reach of the downtown camera (CENTRAL_BOX plus Chebyshev 4), so the dice are tuned for density near downtown (a test checks ≥ 18 of 20 seeds).
3. **Outpost pairing:** the nest picks, among its 4 neighbours with land ≥ 60% that are not themselves nest candidates (so two nests may share one outpost), the one nearest the downtown anchor (ties by fixed order N, E, S, W); that chunk's kind becomes `outpost` with `facing` toward the nest. A chunk asks "am I a paired outpost?" by checking its 4 neighbours' nest status — pure, bounded.
4. Both nest and outpost content fit inside their own chunk (handoff §6.8).
5. **Bots and spidertron in remote raids:** repair bots come from the outpost's own small roboport (added to the outpost recipe); spidertron S-1 is the nearest hub's within 4 chunks — if none, the "spidertron responding" line is skipped (it is already conditional in the handoff). Spider patrol only runs when a hub and an outpost are both within 4 chunks of each other.

Coverage expectation (§7.3 item 7) is verified empirically at speed 1; if a 6-minute run misses a line, tune the retry/POI bias, not the acceptance.

**Parameters** are the handoff §6.3 table's values. Identifiers (`N-1`, `O-1`, `ST-2`, `L-7`, `B-3`, …) derive from chunk coordinates or counters.

### 4.6 Determinism boundary

- `world/**` may use `core/hash` and must **never** import `core/rng` or `core/clock`, nor reference `Math.random`, `Date`, or `performance` — enforced by a Vitest test that scans `src/factory/world/**` with token-bounded, case-sensitive regexes (`/\bMath\.random\b/`, `/\bDate\b/`, `/\bperformance\b/`, `/from\s+["'][^"']*core\/(rng|clock)["']/`), so identifiers like `update` don't false-positive.
- Chunk = pure function of `(cx, cy, seed)`. Test: two independent `new World(seed)` instances produce byte-equal `paintRaster` buffers for a grid of chunks covering every district kind, for several seeds.
- `live/`, `events/`, `camera.ts` use only `core/rng` + `core/clock`.

#### 4.6.1 Still mode (reduced motion and OG)

`still` is selected when `prefers-reduced-motion: reduce` matches. `capture-og` selects it by launching chromium with `--force-prefers-reduced-motion` (added to the flake app) — the OG path *is* the reduced-motion path, as the handoff intends. On entering still: `sim.still()` runs 360 × `dt = 0.05` pre-steps **once per (seed, mode entry)**, camera pinned, ambient journal suppressed, then draws. Later redraws (resize, click-to-look, night/rain change) re-draw the current sim state **without** re-running the pre-steps, so ResizeObserver/font-load timing cannot change the OG bytes. The pins (`Math.random` LCG, constant rAF/`performance.now`, fixed `Date`) make the pre-steps deterministic because no rng call happens before `Sim` construction (§4.3 module-scope rule) and the pre-step loop does not read the wall clock.
- The `rnd()`/salt order in `world.ts` + recipes is frozen once the look is approved; AGENTS.md says so.

### 4.7 `window.__mapgen`

akl.io's members (`seed seedHex world cam state reroll() minimize(b) renderNow() World Cam T CH perf() resetPerf()`) plus handoff §6.8's `events` (last 20 lines), `stats()`, `lookAt(x,y)`, `setMode('hub'|'factory')`, plus `speed(k)` (sim-clock multiplier, test aid, default 1) and `machines` (state names per machine, for tests).

### 4.8 Query parameters

`?seed=` (akl.io grammar), `?time=day|dusk|night|cycle` (handoff §6.5). Unknown values ignored.

## 5. Page

- `src/pages/index.astro`: the handoff §3.1 markup verbatim (rows 5–7 in a JSX comment), §3.3 head with §3's head order; JSON-LD Person block **kept** with `"url": "https://akl.dev/"` and `"mainEntityOfPage": "https://akl.run/"`. No inline script/style. Void elements without trailing slash. Formatter-excluded.
- State class `factory` on `<html>` (handoff §2.1) is the **only** state carrier: `.is-minimized` is not used anywhere (CSS and JS both key off `html.factory`). `inert` on `.hub` only. `aria-controls` on the readout points at the hub section (give `.hub` `id="hub-window"` and `data-windows`; `#windows` keeps its id on `<main>`). Minimise: if focus is inside `.hub`, move it to the readout first. Restore via `% fg`: focus moves to the `factory` link (handoff §9 item 4); via readout or `m`: focus stays put.
- `src/styles/main.css`: handoff §4 tokens, fonts (§4.2), desktop (§4.3), phone (§4.4), factory mode (§4.5), motion (§4.6), plus akl.io's `.shade/.term/.status/.log*/.permalink/.hudf/rise` rules adapted. Selectors key off `html.factory` / `html.js`.
- Fonts: add `JetBrainsMono-Regular.woff2` (from the JetBrains Mono release matching the existing Bold) and `Newsreader-16pt-Regular.woff2`, `Newsreader-16pt-Italic.woff2` (static 16pt optical-size instances, Latin subset, from the upstream Newsreader OFL release / google/fonts repo, subset with `pyftsubset` if the upstream file is not already Latin-only). Record source URLs + licence in `humans.txt` and AGENTS.md.
- `public/llms.txt`, `humans.txt`, `robots.txt` per handoff §7 (`robots.txt` sitemap: `https://akl.run/sitemap-index.xml`).
- `public/images/og.png` via `nix run .#capture-og` (hub, day, `?seed=0xa85b492a`, 1200×630). `capture-og`'s pin script is injected at the very top of `<head>`, before `boot.js` and the module script, so it pins the bundled engine too; the app gains `--force-prefers-reduced-motion` (§4.6.1). Reproducibility check: two consecutive runs hash identically.

## 6. Error handling and degradation

- All DOM hooks null-guarded (akl.io rule): a missing hook degrades, never throws.
- Engine start wrapped so an exception in `sim` init leaves the hub fully usable (links are plain anchors) and logs once to the console; the readout stays `hidden`.
- JS-off, reduced motion, `factory.*` host behaviour exactly per handoff §2.1.
- ES2020 floor as akl.io; Vite `build.target: 'es2020'`.

## 7. Verification

### 7.1 Unit (Vitest, `npm test` = `vitest run`, part of `nix flake check` as check `unit`)
The `unit` check is its own `buildNpmPackage` (same `importNpmLock` deps as `build`, like `astro-check`) with `buildPhase = "CI=1 npm test"` and an empty install; no network is needed because all deps come from the lock. DOM tests use `// @vitest-environment jsdom` per file; everything else runs in the `node` environment.
- `raster`: rect/alpha blend correctness, snapping rule (§4.2), disc/ellipse spans; `paintRaster` perf guard.
- `world`: determinism (§4.6) across seeds and every district kind; LRU true-LRU order and cap; `generation`/`epoch` bumps; `query` memo and seam-crossing merges; `kindAt` agrees with `paintRaster(...).kind`; placement rules (§4.5.1: nest density, no hub within 3, paired outpost adjacent and facing, both inside their chunk); overlay token no-op after eviction; the import-boundary scan.
- `journal`: queue rate ≤ 1/0.9 s; ambient never repeats consecutively; pinned + run-start never evicted; ring sizes 6/4; `textContent` only (jsdom).
- each event machine with fake clock/RNG and a stub world: full state cycles and their exact journal lines (raid start → engage → spider → repelled count → repair; lot ghost → build → standing → decon; silo build → ready → launch → pod → recovered; belts jam/clear; brownout threshold; research loop; storm 50% logging; look).
- camera: waypoint selection prefers POIs; holds during raid/silo; zoom offsets ease.

### 7.2 Build (`nix flake check --impure`)
`build`, `astro-check`, `treefmt`, `golden-output`, `unit`, plus `csp-output`: a check over the built package that fails if `dist/**/*.html` contains `<style`, ` style=`, or a `<script>` without `src` whose `type` is not `application/ld+json`, or if `index.html` lacks `boot.js?v=` or does not contain exactly one `<script type="module" src="/_astro/`.

### 7.3 Acceptance (Playwright, `tests/e2e/`, own `package.json`, run outside nix: `cd tests/e2e && npm i && node run.mjs`)
Serves `dist/` with `_headers` applied (port akl.io's `tmp/pw/csp-serve.py` idea) and covers handoff §9:
1. screenshots at 1440×900, 1200×720, 800×700, 390×844, 360×640, plus factory mode, night, factory-host start → written to `tmp/shots/`, compared **by eye** with `tmp/design_handoff_akl_run/screenshots/` (worlds differ by design; layout must match);
2. zero CSP violations in hub and factory states;
3. description one line ≥ 761 px / two lines ≤ 760 px; no horizontal scroll; over-tall scrolls;
4. tab order and focus moves (handoff §9 item 4);
5. JS-off; 6. reduced motion;
7. event coverage at **speed 1**, 6 real minutes, 1440×900: all handoff §9 item-7 lines appear within 3 / 6 minutes (`speed(k)` is for fast unit-ish smoke runs only; at k > 1 chunk generation lags the camera and under-samples sites, so it cannot validate this item);
8. perf at 1440×900 DPR 2: ≤ 8 ms average frame (at speed 1), first frame < 150 ms, chunk count ≤ cap;
9. determinism in-browser: two fresh `new __mapgen.World(seed)` instances' `paintRaster` buffers byte-equal for a few chunks (not live chunk canvases, which the construction lot legitimately repaints); two same-seed loads show the same first frame terrain;
11. host rule via Chromium `--host-resolver-rules="MAP factory.akl.run 127.0.0.1:<port>, MAP akl.run 127.0.0.1:<port>"`: first screenshot at `load` on `factory.akl.run` shows factory mode, no hub frame.

Look approval (the handoff's "re-approve from scratch") is the owner's: the run ends with the screenshot set presented for review.

## 8. Execution notes

- Serial foundation first: repo scaffold (builds an empty page), `core/` (hash, rng, clock, raster) and the **frozen `core/types.ts`** (§4.3.1), plus stub `World`/`LivePush`/`SimCtx` test doubles in `tests/fakes/` so every stream can test against the contracts without the others.
- Then parallelisable: `world/` recipes+sprites, `live/`, `events/`, `camera`/`journal`, page markup + CSS + fonts + metadata, tooling (nix checks, golden, e2e harness). Interfaces in §4 are the contracts between streams.
- `world.ts` integration (kind selection + salt order) and `sim.ts`/`page.ts` integration are serial, after their inputs land.
- `golden/` and `og.png` are regenerated last, once.
