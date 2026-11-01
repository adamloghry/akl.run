// Frozen contract shared by every src/factory module. Only the integrator
// edits this file; workers code against it.

export const T = 6; // world px per tile
export const CH = 32; // tiles per chunk side
export const CPX = T * CH; // 192 world px per chunk side
export const AP = 3; // apron tiles around a chunk (neighbour lookups only; never painted)

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 0 = east, 1 = south, 2 = west, 3 = north. */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export type DistrictKind =
  | "wild"
  | "outpost"
  | "mine"
  | "smelt"
  | "asm"
  | "power"
  | "hub"
  | "nest"
  | "labs"
  | "solar"
  | "oil"
  | "storage"
  | "silo";

/** CSS colour: '#rgb', '#rrggbb', '#rrggbbaa' or 'rgba(r,g,b,a)'. */
export type Color = string;

export type MachineKind =
  | "furnace"
  | "boiler"
  | "engine"
  | "drill"
  | "assembler"
  | "pumpjack"
  | "chem"
  | "refinery"
  | "flare"
  | "tank"
  | "lab"
  | "accumulator"
  | "lamp"
  | "pole"
  | "bigpole"
  | "roboport"
  | "radar"
  | "turret"
  | "chest"
  | "offshore"
  | "spawner"
  | "worm";

// ---- features (all coordinates are WORLD PX; w/h on Machine are TILES) ----

/** Ids are `${prefix}:${cx},${cy}:${n}` — stable for a given (seed, chunk). */
export interface Machine {
  id: string;
  kind: MachineKind;
  at: Pt; // centre
  w: number; // tiles
  h: number; // tiles
}
export interface BeltPath {
  id: string;
  pts: Pt[]; // tile centres in flow order; consecutive points are axis-aligned
  lanes: [Color[], Color[]]; // item colour mix per lane (left, right of flow)
}
export interface Inserter {
  id: string;
  at: Pt; // tile centre
  dir: Dir; // direction items are dropped
  fast: boolean;
  beltId: string | null; // belt it picks from / drops onto
  stationId: string | null; // set when within 34 px of a station
}
export interface RailSeg {
  id: string;
  a: Pt; // centre-line endpoints; axis-aligned
  b: Pt;
  lineId: string; // segments with equal lineId are one continuous line
}
export interface Station {
  id: string;
  at: Pt; // stop point on the rail centre-line
  lineId: string;
  vertical: boolean;
}
export interface RoadSeg {
  id: string;
  a: Pt;
  b: Pt;
  width: number; // tiles
}
export interface WallSeg {
  id: string;
  rect: Rect;
}
export interface SolarField {
  id: string;
  rect: Rect;
}
export interface NestSite {
  id: string;
  cx: number;
  cy: number;
  rect: Rect;
  spawners: Pt[];
  worms: Pt[];
  outpost: { cx: number; cy: number }; // the paired outpost chunk
}
export interface OutpostSite {
  id: string;
  cx: number;
  cy: number;
  rect: Rect; // wall ring outer rect
  wall: WallSeg[];
  turrets: Pt[];
  radar: Pt;
  roboport: Pt;
  facing: Dir; // DIRS[facing] points from outpost toward its nest
}
export interface HubSite {
  id: string;
  cx: number;
  cy: number;
  rect: Rect; // concrete pad
  roboport: Pt;
  lot: Rect; // 12×10 tile construction lot, empty in the pure chunk
  chests: Pt[];
  carPark: Pt;
  spiderPark: Pt;
}
export interface SiloSite {
  id: string;
  cx: number;
  cy: number;
  pad: Rect;
  at: Pt; // silo centre
  lights: Pt[]; // 4 pad lamps
}
export interface Features {
  belts: BeltPath[];
  inserters: Inserter[];
  machines: Machine[];
  rails: RailSeg[];
  stations: Station[];
  roads: RoadSeg[];
  solar: SolarField[];
  shore: Pt[]; // centres of water tiles adjacent to land
  nests: NestSite[];
  outposts: OutpostSite[];
  hubs: HubSite[];
  silos: SiloSite[];
}
export function emptyFeatures(): Features {
  return {
    belts: [],
    inserters: [],
    machines: [],
    rails: [],
    stations: [],
    roads: [],
    solar: [],
    shore: [],
    nests: [],
    outposts: [],
    hubs: [],
    silos: [],
  };
}

/** Centre of a w×h tile block whose top-left tile is (tx, ty), in world px. */
export function tileCentre(tx: number, ty: number, w = 1, h = 1): Pt {
  return { x: (tx + w / 2) * T, y: (ty + h / 2) * T };
}
/** World-px rect of a w×h tile block. */
export function tileRect(tx: number, ty: number, w: number, h: number): Rect {
  return { x: tx * T, y: ty * T, w: w * T, h: h * T };
}

// ---- painting chunks ----

/**
 * Pixel painting surface for one chunk. Coordinates are WORLD TILES (fractional ok);
 * implementations translate to chunk-local px with the one snapping rule:
 * x0 = round((tx - ox)·T), x1 = max(x0+1, round((tx - ox + w)·T)), same for y.
 */
export interface Paint {
  /** Fill a w×h tile rect. */
  tr(tx: number, ty: number, w: number, h: number, c: Color, a?: number): void;
  /** Fill an exact pixel rect: dx,dy,w,h in px, offset from tile (tx,ty)'s top-left. */
  p(tx: number, ty: number, dx: number, dy: number, w: number, h: number, c: Color, a?: number): void;
  /** Filled disc / ellipse as scanline spans; centre in world tiles, radii in px. */
  disc(tx: number, ty: number, r: number, c: Color, a?: number): void;
  ellipse(tx: number, ty: number, rx: number, ry: number, c: Color, a?: number): void;
}

/** Builders take WORLD TILE coordinates and store WORLD PX (centres via tileCentre). */
export interface FeatureBuilder {
  machine(kind: MachineKind, tx: number, ty: number, w: number, h: number): Machine;
  belt(tiles: ReadonlyArray<readonly [number, number]>, lanes: [Color[], Color[]]): BeltPath;
  inserter(tx: number, ty: number, dir: Dir, fast: boolean, beltId: string | null): Inserter;
  rail(a: readonly [number, number], b: readonly [number, number], lineId: string): RailSeg;
  station(tx: number, ty: number, lineId: string, vertical: boolean): Station;
  road(a: readonly [number, number], b: readonly [number, number], width: number): RoadSeg;
  wall(tx: number, ty: number, w: number, h: number): WallSeg;
  solar(tx: number, ty: number, w: number, h: number): SolarField;
  shore(tx: number, ty: number): void;
  /** Site builders take world-px geometry (use tileCentre/tileRect). */
  nest(s: Omit<NestSite, "id" | "cx" | "cy">): NestSite;
  outpost(s: Omit<OutpostSite, "id" | "cx" | "cy">): OutpostSite;
  hub(s: Omit<HubSite, "id" | "cx" | "cy">): HubSite;
  silo(s: Omit<SiloSite, "id" | "cx" | "cy">): SiloSite;
  readonly features: Features;
}

export type OreKind = "iron" | "copper" | "coal" | "stone";

/** Everything a district recipe may use. All coordinates are world tiles. */
export interface RecipeCtx extends Paint {
  readonly cx: number;
  readonly cy: number;
  readonly seed: number;
  readonly ox: number; // = cx * CH (world tile of the chunk's left edge)
  readonly oy: number; // = cy * CH
  readonly kind: DistrictKind;
  readonly landFrac: number;
  /** Sequential chunk RNG. Its call order is sacred once the look is approved. */
  rnd(): number;
  /** hash(x ?? cx, y ?? cy, seed + salt) in [0, 1). */
  h(salt: number, x?: number, y?: number): number;
  land(tx: number, ty: number): boolean; // valid for tiles within the apron
  shoreDist(tx: number, ty: number): number; // tiles to nearest water, capped at 9; 0 on water
  ore(tx: number, ty: number): OreKind | null;
  free(tx: number, ty: number, w: number, h: number): boolean; // all land, none reserved, inside chunk
  reserve(tx: number, ty: number, w: number, h: number): void;
  readonly feat: FeatureBuilder;
  /** Neighbour info for pairing rules (pure, via World.kindAt). */
  kindAt(cx: number, cy: number): DistrictKind;
}
export type Recipe = (ctx: RecipeCtx) => void;

// ---- runtime ----

export interface Rand {
  next(): number; // [0, 1)
  range(a: number, b: number): number; // [a, b)
  int(a: number, b: number): number; // integer in [a, b)
  pick<V>(arr: readonly V[]): V;
  chance(p: number): boolean;
}

/** World px → CSS px: sx = (wx - x0)·z. */
export interface View {
  x0: number;
  y0: number;
  w: number; // css px
  h: number; // css px
  z: number; // css px per world px
  dpr: number;
}
export interface Env {
  night: number; // 0 day … 1 full night
  raining: boolean;
  sat: number; // power satisfaction 0..1 (brownout dims lamps)
  acc: number; // accumulator charge 0..1
  flash: number; // lightning flash 0..1, decays
}
export interface CamState {
  readonly x: number; // world px centre
  readonly y: number;
  readonly zoom: number;
  readonly view: View;
}
export interface CamHint {
  target?: Pt; // glide here
  hold?: boolean; // do not pick a new waypoint
  zoomOffset?: number; // e.g. -0.12 launch, +0.06 raid
  priority: number; // highest wins for target/hold; zoom offsets sum
}
export type LightColor = "warm" | "blue" | "white" | "red" | "orange" | "green";
export interface LightSource {
  x: number; // world px
  y: number;
  r: number; // world px radius
  color: LightColor;
  a: number; // 0..1
  cone?: { ang: number; spread: number; len: number }; // headlights: radians, radians, world px
}
export type ParticleKind =
  | "smoke"
  | "steam"
  | "ember"
  | "dust"
  | "splat"
  | "corpse"
  | "tracer"
  | "ripple"
  | "puff"
  | "spark";
export interface ParticleOpts {
  vx?: number;
  vy?: number;
  life?: number; // seconds
  size?: number; // world px
  color?: Color;
  x2?: number; // tracer end
  y2?: number;
}
export interface LivePush {
  spawn(kind: ParticleKind, x: number, y: number, o?: ParticleOpts): void;
  jam(beltId: string, on: boolean): void;
  isJammed(beltId: string): boolean;
}
export interface DrawCtx {
  view: View;
  t: number;
  env: Env;
  sx(wx: number): number;
  sy(wy: number): number;
  inView(wx: number, wy: number, margin?: number): boolean;
  /** Queue a light for this frame's lights pass (drawn after the night overlay). */
  light(l: LightSource): void;
}

export interface Stats {
  power: number; // round(sat*100)
  trains: number; // per-step counter
  bots: number; // per-step counter
  threats: number; // per-step counter
  science: number;
  rockets: number;
  repelled: number;
  built: number;
  parts: number;
  research: string; // "<name> <pct>%"
}
export function emptyStats(): Stats {
  return {
    power: 100,
    trains: 0,
    bots: 0,
    threats: 0,
    science: 0,
    rockets: 0,
    repelled: 0,
    built: 0,
    parts: 0,
    research: "—",
  };
}
/** Per-step counters the sim zeroes before every update. */
export const STEP_COUNTERS = ["trains", "bots", "threats"] as const;

export type Emit = (text: string) => void;

export interface SiteRef {
  kind: DistrictKind;
  cx: number;
  cy: number;
  centre: Pt;
  dist: number; // chunks (Chebyshev) from the search origin
}
export interface WorldQuery {
  readonly seed: number;
  readonly generation: number; // bumps on every chunk insert/evict
  query(r: Rect): Features; // resident chunks only; memoised per (chunk-aligned rect, generation)
  kindAt(cx: number, cy: number): DistrictKind; // pure; works for never-generated chunks
  landFracAt(cx: number, cy: number): number;
  isLandPx(wx: number, wy: number): boolean;
  isResident(cx: number, cy: number): boolean;
  epoch(cx: number, cy: number): number; // -1 when not resident
  findSite(kind: DistrictKind, from: Pt, maxChunks: number): SiteRef | null; // nearest by kindAt
}
export interface OverlayToken {
  readonly cx: number;
  readonly cy: number;
  readonly epoch: number;
  readonly rect: Rect;
}
export interface WorldOverlay {
  /** Save pixels under rect (world px, inside one chunk). null if that chunk is not resident. */
  saveRect(r: Rect): OverlayToken | null;
  /** Draw into the chunk canvas; fn gets the chunk's world-px origin (ox, oy): draw at (wx - ox, wy - oy). false if stale. */
  paint(tok: OverlayToken, fn: (g: CanvasRenderingContext2D, ox: number, oy: number) => void): boolean;
  restore(tok: OverlayToken): boolean;
}

export interface SimCtx {
  world: WorldQuery;
  overlay: WorldOverlay;
  cam: CamState;
  live: LivePush;
  env: Env;
  stats: Stats;
  emit: Emit;
  rand: Rand;
  t: number; // sim seconds since start
  dt: number; // seconds, ≤ 0.1
  phone: boolean;
  still: boolean;
  view: Features; // features of the view rect + 1 chunk margin, this step
}

export interface EventMachine {
  readonly name: string;
  update(ctx: SimCtx): void;
  draw(g: CanvasRenderingContext2D, d: DrawCtx): void; // g is already scaled to css px
  camHint(): CamHint | null;
  /** District kind this machine is waiting for (camera biases its next POI toward it). */
  wants?(): DistrictKind | null;
  reset(): void;
  state(): string; // e.g. 'idle', 'ghost', 'build' — for tests and __mapgen.machines
}
export interface LiveSystem {
  readonly name: string;
  update(ctx: SimCtx): void;
  draw(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void;
  reset(): void;
}
