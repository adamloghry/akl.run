// The infinite world: pure kind selection, per-chunk painting through a RecipeCtx, a true-LRU
// chunk cache, memoised feature queries with rail/road seam joins, and site search.
import { chunkRng, hash } from "../core/hash";
import { makePaint, Raster } from "../core/raster";
import {
  AP,
  CH,
  CPX,
  T,
  emptyFeatures,
  tileCentre,
  tileRect,
  type BeltPath,
  type Dir,
  type DistrictKind,
  type Features,
  type FeatureBuilder,
  type Inserter,
  type OverlayToken,
  type Pt,
  type RailSeg,
  type RecipeCtx,
  type Rect,
  type RoadSeg,
  type SiteRef,
  type WorldOverlay,
  type WorldQuery,
} from "../core/types";
import { inLandTile } from "./geo";
import { createOverlay } from "./overlay";
import { NEIGH, pairedOutpost } from "./pairing";
import { RECIPES } from "./recipes/index";
import { baseKind, chunkBase, paintCommon, paintTerrain, type ChunkBase } from "./terrain";

// ---- nest / outpost pairing (moved to pairing.ts; re-exported to keep the public API) ----

export { pairedOutpost, nestCandidate } from "./pairing";

// ---- feature builder ----

function makeFeatureBuilder(cx: number, cy: number): FeatureBuilder {
  const features = emptyFeatures();
  const counters: Record<string, number> = {};
  const id = (prefix: string) => {
    const n = counters[prefix] ?? 0;
    counters[prefix] = n + 1;
    return `${prefix}:${cx},${cy}:${n}`;
  };
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) <= 34;
  return {
    features,
    machine(kind, tx, ty, w, h) {
      const m = { id: id("m"), kind, at: tileCentre(tx, ty, w, h), w, h };
      features.machines.push(m);
      return m;
    },
    belt(tiles, lanes) {
      const b: BeltPath = {
        id: id("b"),
        pts: tiles.map(([x, y]) => tileCentre(x, y)),
        lanes,
      };
      features.belts.push(b);
      return b;
    },
    inserter(tx, ty, dir: Dir, fast, beltId) {
      const at = tileCentre(tx, ty);
      const i: Inserter = {
        id: id("i"),
        at,
        dir,
        fast,
        beltId,
        stationId: features.stations.find((s) => near(s.at, at))?.id ?? null,
      };
      features.inserters.push(i);
      return i;
    },
    rail(a, b, lineId) {
      const r = { id: id("r"), a: tileCentre(a[0], a[1]), b: tileCentre(b[0], b[1]), lineId };
      features.rails.push(r);
      return r;
    },
    station(tx, ty, lineId, vertical) {
      const s = { id: id("st"), at: tileCentre(tx, ty), lineId, vertical };
      features.stations.push(s);
      for (const i of features.inserters) if (i.stationId === null && near(s.at, i.at)) i.stationId = s.id;
      return s;
    },
    road(a, b, width) {
      const r = { id: id("rd"), a: tileCentre(a[0], a[1]), b: tileCentre(b[0], b[1]), width };
      features.roads.push(r);
      return r;
    },
    wall(tx, ty, w, h) {
      // Walls are stored by the OutpostSite that owns them, not in Features.
      return { id: id("w"), rect: tileRect(tx, ty, w, h) };
    },
    solar(tx, ty, w, h) {
      const s = { id: id("s"), rect: tileRect(tx, ty, w, h) };
      features.solar.push(s);
      return s;
    },
    shore(tx, ty) {
      features.shore.push(tileCentre(tx, ty));
    },
    nest(s) {
      const n = { id: id("n"), cx, cy, ...s };
      features.nests.push(n);
      return n;
    },
    outpost(s) {
      const o = { id: id("o"), cx, cy, ...s };
      features.outposts.push(o);
      return o;
    },
    hub(s) {
      const h = { id: id("h"), cx, cy, ...s };
      features.hubs.push(h);
      return h;
    },
    silo(s) {
      const o = { id: id("si"), cx, cy, ...s };
      features.silos.push(o);
      return o;
    },
  };
}

// ---- RecipeCtx ----

export function makeRecipeCtx(
  world: World,
  cx: number,
  cy: number,
  kindOverride?: DistrictKind,
): { ctx: RecipeCtx; raster: Raster; base: ChunkBase } {
  const seed = world.seed,
    base = world.baseOf(cx, cy),
    ox = cx * CH,
    oy = cy * CH;
  const raster = new Raster(CPX, CPX);
  const paint = makePaint(raster, ox, oy);
  const feat = makeFeatureBuilder(cx, cy);
  const rnd = chunkRng(cx, cy, seed);
  const reserved = new Uint8Array(CH * CH);
  const ai = (tx: number, ty: number) => {
    const i = tx - ox + AP,
      j = ty - oy + AP;
    return i < 0 || j < 0 || i >= base.S || j >= base.S ? -1 : j * base.S + i;
  };
  const land = (tx: number, ty: number) => {
    const i = ai(tx, ty);
    return i >= 0 && base.mask[i] === 1;
  };
  const ctx: RecipeCtx = {
    ...paint,
    cx,
    cy,
    seed,
    ox,
    oy,
    kind: kindOverride ?? world.kindAt(cx, cy),
    landFrac: base.landFrac,
    rnd,
    h: (salt, x = cx, y = cy) => hash(x, y, seed + salt),
    land,
    shoreDist(tx, ty) {
      const i = ai(tx, ty);
      return i < 0 ? 0 : base.dist[i];
    },
    ore: (tx, ty) => base.ore(tx, ty),
    free(tx, ty, w, h) {
      if (tx < ox || ty < oy || tx + w > ox + CH || ty + h > oy + CH) return false;
      for (let y = ty; y < ty + h; y++)
        for (let x = tx; x < tx + w; x++) if (!land(x, y) || reserved[(y - oy) * CH + x - ox]) return false;
      return true;
    },
    reserve(tx, ty, w, h) {
      for (let y = Math.max(ty, oy); y < Math.min(ty + h, oy + CH); y++)
        for (let x = Math.max(tx, ox); x < Math.min(tx + w, ox + CH); x++)
          reserved[(y - oy) * CH + x - ox] = 1;
    },
    feat,
    kindAt: (x, y) => world.kindAt(x, y),
  };
  return { ctx, raster, base };
}

// ---- query helpers ----

type Seg = RailSeg | RoadSeg;
/** Merge collinear segments (same group key) whose intervals touch or overlap (gap <= one tile). */
function joinSegs<S extends Seg>(segs: S[], group: (s: S) => string): S[] {
  const out: S[] = [];
  const byGroup = new Map<string, S[]>();
  for (const s of segs) {
    const k = group(s);
    const g = byGroup.get(k);
    if (g) g.push(s);
    else byGroup.set(k, [s]);
  }
  for (const g of byGroup.values()) {
    const work: S[] = g.slice();
    for (let again = true; again; ) {
      again = false;
      outer: for (let i = 0; i < work.length; i++)
        for (let j = i + 1; j < work.length; j++) {
          const a = work[i],
            b = work[j];
          const va = a.a.x === a.b.x,
            vb = b.a.x === b.b.x;
          if (va !== vb) continue;
          if (va ? a.a.x !== b.a.x : a.a.y !== b.a.y) continue;
          const [a0, a1] = va
            ? [Math.min(a.a.y, a.b.y), Math.max(a.a.y, a.b.y)]
            : [Math.min(a.a.x, a.b.x), Math.max(a.a.x, a.b.x)];
          const [b0, b1] = va
            ? [Math.min(b.a.y, b.b.y), Math.max(b.a.y, b.b.y)]
            : [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)];
          if (Math.max(a0, b0) - Math.min(a1, b1) > T + 1e-6) continue;
          const lo = Math.min(a0, b0),
            hi = Math.max(a1, b1);
          work[i] = {
            ...a,
            a: va ? { x: a.a.x, y: lo } : { x: lo, y: a.a.y },
            b: va ? { x: a.a.x, y: hi } : { x: hi, y: a.a.y },
          };
          work.splice(j, 1);
          again = true;
          break outer;
        }
    }
    out.push(...work);
  }
  return out;
}

interface Entry {
  canvas: HTMLCanvasElement;
  kind: DistrictKind;
  features: Features;
  epoch: number;
}
type Cache<V> = Map<string, V>;
const key = (cx: number, cy: number) => `${cx},${cy}`;
function setFifo<V>(m: Cache<V>, k: string, v: V, cap: number) {
  m.set(k, v);
  if (m.size > cap) m.delete(m.keys().next().value as string);
}

export class World implements WorldQuery, WorldOverlay {
  readonly seed: number;
  generation = 0;
  cap: number;
  private readonly canvasFactory: () => HTMLCanvasElement;
  private readonly chunks = new Map<string, Entry>();
  private epochSeq = 0;
  private readonly kinds: Cache<DistrictKind> = new Map();
  private readonly bases: Cache<{ kind: DistrictKind; landFrac: number }> = new Map();
  private readonly chunkBases: Cache<ChunkBase> = new Map();
  private readonly queries: Cache<Features> = new Map();
  private readonly overlay: WorldOverlay;

  constructor(seed: number, opts: { cap?: number; canvasFactory?: () => HTMLCanvasElement } = {}) {
    this.seed = seed;
    this.cap = opts.cap ?? 256;
    this.canvasFactory = opts.canvasFactory ?? (() => document.createElement("canvas"));
    this.overlay = createOverlay({
      lookup: (cx, cy) => {
        const e = this.chunks.get(key(cx, cy));
        return e && { canvas: e.canvas, epoch: e.epoch };
      },
    });
  }

  /** Shared land mask / ore field of a chunk (small FIFO cache; chunk painting reuses kind-probe work). */
  baseOf(cx: number, cy: number): ChunkBase {
    const k = key(cx, cy);
    let b = this.chunkBases.get(k);
    if (!b) {
      b = chunkBase(cx, cy, this.seed);
      setFifo(this.chunkBases, k, b, 64);
    }
    return b;
  }
  private baseInfo(cx: number, cy: number) {
    const k = key(cx, cy);
    let v = this.bases.get(k);
    if (!v) {
      const b = this.baseOf(cx, cy);
      v = { kind: baseKind(b, this.seed), landFrac: b.landFrac };
      setFifo(this.bases, k, v, 4096);
    }
    return v;
  }
  private readonly baseKindAt = (cx: number, cy: number) => this.baseInfo(cx, cy).kind;
  landFracAt(cx: number, cy: number): number {
    return this.baseInfo(cx, cy).landFrac;
  }
  private readonly landFracFn = (cx: number, cy: number) => this.landFracAt(cx, cy);

  kindAt(cx: number, cy: number): DistrictKind {
    const k = key(cx, cy);
    const hit = this.kinds.get(k);
    if (hit) return hit;
    let kind: DistrictKind = this.baseKindAt(cx, cy);
    let paired = false;
    for (const [dx, dy] of NEIGH) {
      const p = pairedOutpost(cx + dx, cy + dy, this.seed, this.baseKindAt, this.landFracFn);
      if (p && p.cx === cx && p.cy === cy) paired = true;
    }
    if (paired) kind = "outpost";
    else if (pairedOutpost(cx, cy, this.seed, this.baseKindAt, this.landFracFn)) kind = "nest";
    setFifo(this.kinds, k, kind, 4096);
    return kind;
  }

  isLandPx(wx: number, wy: number): boolean {
    return inLandTile(wx / T, wy / T);
  }

  paintRaster(cx: number, cy: number): { raster: Raster; features: Features; kind: DistrictKind } {
    const { ctx, raster, base } = makeRecipeCtx(this, cx, cy);
    paintTerrain(ctx, base);
    paintCommon(ctx);
    RECIPES[ctx.kind](ctx);
    return { raster, features: ctx.feat.features, kind: ctx.kind };
  }

  private touch(k: string): Entry | undefined {
    const e = this.chunks.get(k);
    if (e) {
      this.chunks.delete(k);
      this.chunks.set(k, e);
    }
    return e;
  }
  private evictTo(n: number) {
    while (this.chunks.size > n) {
      const [k, e] = this.chunks.entries().next().value as [string, Entry];
      this.chunks.delete(k);
      e.canvas.width = 0;
      e.canvas.height = 0;
      this.generation++;
    }
  }

  chunk(cx: number, cy: number): { canvas: HTMLCanvasElement; kind: DistrictKind } {
    const k = key(cx, cy);
    const hit = this.touch(k);
    if (hit) return hit;
    const { raster, features, kind } = this.paintRaster(cx, cy);
    const canvas = this.canvasFactory();
    canvas.width = CPX;
    canvas.height = CPX;
    if (typeof ImageData !== "undefined")
      canvas
        .getContext("2d", { willReadFrequently: true })
        ?.putImageData(new ImageData(raster.data as Uint8ClampedArray<ArrayBuffer>, CPX, CPX), 0, 0);
    this.evictTo(Math.max(0, this.cap - 1));
    const e: Entry = { canvas, kind, features, epoch: ++this.epochSeq };
    this.chunks.set(k, e);
    this.generation++;
    return e;
  }
  peek(cx: number, cy: number): { canvas: HTMLCanvasElement; kind: DistrictKind } | undefined {
    return this.touch(key(cx, cy));
  }
  isResident(cx: number, cy: number): boolean {
    return this.chunks.has(key(cx, cy));
  }
  epoch(cx: number, cy: number): number {
    return this.chunks.get(key(cx, cy))?.epoch ?? -1;
  }
  setCap(n: number): void {
    this.cap = Math.max(1, n);
    this.evictTo(this.cap);
  }
  /** Release everything: evict all chunks (zeroing their canvases) and drop the memo caches. */
  dispose(): void {
    this.evictTo(0);
    this.kinds.clear();
    this.bases.clear();
    this.chunkBases.clear();
    this.queries.clear();
  }
  size(): number {
    return this.chunks.size;
  }

  query(r: Rect): Features {
    const cx0 = Math.floor(r.x / CPX),
      cy0 = Math.floor(r.y / CPX);
    const cx1 = Math.max(cx0, Math.ceil((r.x + r.w) / CPX) - 1),
      cy1 = Math.max(cy0, Math.ceil((r.y + r.h) / CPX) - 1);
    const mk = `${cx0},${cy0},${cx1},${cy1}@${this.generation}`;
    const hit = this.queries.get(mk);
    if (hit) return hit;
    const out = emptyFeatures();
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const e = this.chunks.get(key(cx, cy));
        if (!e) continue;
        const f = e.features;
        out.belts.push(...f.belts);
        out.inserters.push(...f.inserters);
        out.machines.push(...f.machines);
        out.rails.push(...f.rails);
        out.stations.push(...f.stations);
        out.roads.push(...f.roads);
        out.solar.push(...f.solar);
        out.shore.push(...f.shore);
        out.nests.push(...f.nests);
        out.outposts.push(...f.outposts);
        out.hubs.push(...f.hubs);
        out.silos.push(...f.silos);
      }
    out.rails = joinSegs(out.rails, (s) => s.lineId);
    out.roads = joinSegs(out.roads, (s) => String(s.width));
    setFifo(this.queries, mk, out, 4);
    return out;
  }

  findSite(kind: DistrictKind, from: Pt, maxChunks: number): SiteRef | null {
    const fx = Math.floor(from.x / CPX),
      fy = Math.floor(from.y / CPX);
    for (let ring = 0; ring <= maxChunks; ring++) {
      let best: SiteRef | null = null,
        bd = Infinity;
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const cx = fx + dx,
            cy = fy + dy;
          if (this.kindAt(cx, cy) !== kind) continue;
          const centre = { x: (cx + 0.5) * CPX, y: (cy + 0.5) * CPX };
          const d = Math.hypot(centre.x - from.x, centre.y - from.y);
          if (d < bd) {
            bd = d;
            best = { kind, cx, cy, centre, dist: ring };
          }
        }
      if (best) return best;
    }
    return null;
  }

  saveRect(r: Rect): OverlayToken | null {
    return this.overlay.saveRect(r);
  }
  paint(tok: OverlayToken, fn: (g: CanvasRenderingContext2D, ox: number, oy: number) => void): boolean {
    return this.overlay.paint(tok, fn);
  }
  restore(tok: OverlayToken): boolean {
    return this.overlay.restore(tok);
  }
}
