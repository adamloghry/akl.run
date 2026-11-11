// Pure chunk terrain: land mask / ore field (no pixels), kind dice, ground painting and the
// shared rail + road corridors. Ported from the previous mapgen.js (akl:61-107).
import { hash, noise, vnoise } from "../core/hash";
import { AP, CH, T, type DistrictKind, type OreKind, type RecipeCtx } from "../core/types";
import { landMask } from "./geo";
import { BRIDGE, PAL, RAIL, ROAD } from "./palette";
import { ROAD_COL, ROAD_ROW, roadNet } from "./roads";
import * as S from "./sprites";

export interface ChunkBase {
  cx: number;
  cy: number;
  S: number;
  mask: Uint8Array;
  dist: Uint8Array;
  landFrac: number;
  oreCount: number;
  ore(tx: number, ty: number): OreKind | null;
}

const ORES: readonly OreKind[] = ["iron", "copper", "coal", "stone"];

/** Ore index 1..4 at world tile (x, y) given its shore distance d (akl:oreAt); 0 = none. */
function oreIndex(x: number, y: number, d: number, s: number): number {
  if (d < 3) return 0;
  if (vnoise(x, y, 7, s + 4) <= (vnoise(x, y, 60, s + 8) > 0.62 ? 0.58 : 0.86)) return 0;
  return 1 + Math.floor(hash(Math.floor(x / 14), Math.floor(y / 14), s + 5) * 4);
}

export function chunkBase(cx: number, cy: number, seed: number): ChunkBase {
  const { S: size, mask, dist, landFrac } = landMask(cx, cy);
  const ox = cx * CH,
    oy = cy * CH;
  const ore = (tx: number, ty: number): OreKind | null => {
    const i = tx - ox + AP,
      j = ty - oy + AP;
    if (i < 0 || j < 0 || i >= size || j >= size) return null;
    const o = oreIndex(tx, ty, dist[j * size + i], seed);
    return o ? ORES[o - 1] : null;
  };
  let oreCount = 0;
  for (let j = 0; j < CH; j++)
    for (let i = 0; i < CH; i++)
      if (oreIndex(ox + i, oy + j, dist[(j + AP) * size + i + AP], seed)) oreCount++;
  return { cx, cy, S: size, mask, dist, landFrac, oreCount, ore };
}

const DICE: readonly DistrictKind[] = [
  "smelt",
  "asm",
  "power",
  "hub",
  "asm",
  "smelt",
  "mine",
  "asm",
  "labs",
  "solar",
  "oil",
  "storage",
  "power",
  "smelt",
  "asm",
  "hub",
];

/*
 * Kind selection (pure, hash-based). Salts (seed + n) used by the world:
 *   1 water/sand noise   2 grass-vs-dirt noise   3 tree noise
 *   4, 8 ore vnoise      5 ore kind hash
 *   500 industrial die (16 faces)   504 silo override (1/8 of industrial chunks)
 *   506 forest override (1/10 of industrial chunks without a mine's ore are left wild)
 *   510 nest roll (1/4, in world.ts)   520/521 road joiner order / E-W pick (roads.ts)
 *   530 road rubble   531 which nest arm biters break first (terrain.paintCommon)
 * Bands: landFrac < .35 wild; .35 <= landFrac < .6 mine (ore > 90) or outpost; >= .6 industrial.
 */
const FOREST_P = 1 / 10;
/** Steps 1-2 of kind selection: land fraction, ore and the hashed die (no nest/outpost overrides). */
export function baseKind(b: ChunkBase, seed: number): DistrictKind {
  if (b.landFrac < 0.35) return "wild";
  if (b.landFrac < 0.6) return b.oreCount > 90 ? "mine" : "outpost";
  let pick = DICE[Math.floor(hash(b.cx, b.cy, seed + 500) * 16)];
  if (hash(b.cx, b.cy, seed + 504) < 1 / 8) pick = "silo";
  if (b.oreCount > 180 || (b.oreCount > 60 && pick === "mine")) return "mine";
  if (hash(b.cx, b.cy, seed + 506) < FOREST_P) return "wild";
  return pick === "mine" ? "asm" : pick;
}

/** akl `clear`: land, not reserved, at least `need` tiles from water, optionally ore-free. */
function clear(ctx: RecipeCtx, c: number, r: number, w: number, h: number, need: number, allowOre: boolean) {
  if (!ctx.free(c, r, w, h)) return false;
  for (let y = r; y < r + h; y++)
    for (let x = c; x < c + w; x++) {
      if (ctx.shoreDist(x, y) < need) return false;
      if (!allowOre && ctx.ore(x, y)) return false;
    }
  return true;
}

export function paintTerrain(ctx: RecipeCtx, b: ChunkBase): void {
  const s = ctx.seed,
    ox = ctx.ox,
    oy = ctx.oy;
  for (let j = 0; j < CH; j++)
    for (let i = 0; i < CH; i++) {
      const x = ox + i,
        y = oy + j,
        ai = (j + AP) * b.S + i + AP,
        n = noise(x, y, s + 1),
        h2 = hash(x + 7717, y + 3391, s),
        d = b.dist[ai];
      if (!b.mask[ai]) {
        ctx.tr(x, y, 1, 1, PAL.water[Math.min(3, (n * 4.6) | 0)]);
        if (h2 < 0.018) ctx.p(x, y, Math.floor(((h2 * 300) % 1) * 6), 3, 5, 2, "#26586b");
        if (b.mask[ai - 1] || b.mask[ai + 1] || b.mask[ai - b.S] || b.mask[ai + b.S]) ctx.feat.shore(x, y);
        continue;
      }
      if (d <= 2) {
        const k = Math.min(2, (n * 3) | 0);
        ctx.tr(x, y, 1, 1, d === 1 ? PAL.sand[k] : h2 < 0.5 ? PAL.sand[0] : PAL.dirt[k]);
        continue;
      }
      const g = noise(x, y, s + 2),
        o = oreIndex(x, y, d, s);
      if (o) {
        const P = PAL.ore[o - 1];
        ctx.tr(x, y, 1, 1, "#463d24");
        ctx.p(x, y, 0, 0, 3, 3, P[1]);
        ctx.p(x, y, 3, 3, 3, 3, P[1]);
        ctx.p(x, y, 3, 0, 3, 3, P[h2 < 0.5 ? 0 : 2]);
        ctx.p(x, y, 0, 3, 3, 3, P[0]);
        if (h2 > 0.6) ctx.p(x, y, 2, 2, 2, 2, P[2]);
        continue;
      }
      ctx.tr(
        x,
        y,
        1,
        1,
        g < 0.3 ? PAL.dirt[Math.min(2, (n * 3) | 0)] : PAL.grass[Math.min(4, (n * 5.4) | 0)],
      );
      if (g >= 0.3) {
        const tn = noise(x, y, s + 3);
        if (tn > 0.34) S.tree(ctx, x, y, tn > 0.58);
        else if (h2 > 0.994) S.rock(ctx, x, y);
      } else if (h2 > 0.985) S.deadTree(ctx, x, y);
    }
}

/** The rail mainline's tile column at or after tile column X0 (col 44 mod 64, N-S). */
export const mainlineCol = (X0: number): number => X0 + ((((44 - X0) % 64) + 64) % 64);

/** Rail mainline (col 44 mod 64, N-S) and this chunk's share of the connected road network (roads.ts). */
export function paintCommon(ctx: RecipeCtx): void {
  const X0 = ctx.ox,
    Y0 = ctx.oy;
  const lamp = (c: number, r: number) => {
    if (!clear(ctx, c, r, 1, 1, 2, true)) return;
    ctx.reserve(c, r, 1, 1);
    S.lamp(ctx, c, r);
    ctx.feat.machine("lamp", c, r, 1, 1);
  };
  const pole = (c: number, r: number) => {
    if (!clear(ctx, c, r, 1, 1, 2, true)) return;
    ctx.reserve(c, r, 1, 1);
    S.pole(ctx, c, r);
    ctx.feat.machine("pole", c, r, 1, 1);
  };

  // rail mainline first: everything else avoids it
  const rcol = mainlineCol(X0);
  const railRows = new Set<number>();
  if (rcol < X0 + CH) {
    let start = -1;
    for (let j = 0; j <= CH; j++) {
      const r = Y0 + j,
        ok = j < CH && clear(ctx, rcol, r, 1, 1, 2, true);
      if (ok && start < 0) start = r;
      if (!ok && start >= 0) {
        if (r - start >= 8) {
          ctx.feat.rail([rcol, start], [rcol, r - 1], `rail:${rcol}`);
          for (let q = start; q < r; q++) {
            ctx.reserve(rcol, q, 1, 1);
            S.rail(ctx, rcol, q, true);
            railRows.add(q);
          }
        }
        start = -1;
      }
    }
  }

  // Roads follow the connected network in roads.ts: a 3-wide N-S highway and 2-wide E-W connectors,
  // short bridges where they cross water, level crossings over the mainline, and a broken stretch
  // where a road runs into a biter nest. Every paved tile is reserved before any recipe runs.
  const net = roadNet(ctx.seed),
    { cx, cy } = ctx;
  const roadV = X0 + ROAD_COL,
    roadH = Y0 + ROAD_ROW;
  const nsAt = (j: number) =>
    j < ROAD_ROW
      ? net.ns(cx, cy - 1)
      : j < ROAD_ROW + 2
        ? net.ns(cx, cy - 1) || net.ns(cx, cy)
        : net.ns(cx, cy);
  const ewAt = (i: number) =>
    i < ROAD_COL
      ? net.ew(cx - 1, cy)
      : i < ROAD_COL + 3
        ? net.ew(cx - 1, cy) || net.ew(cx, cy)
        : net.ew(cx, cy);
  // Biters break one arm of the junction in a nest chunk (salt 531 picks which to try first), and only
  // an arm whose edge is spare (off the network's spanning tree), so every other road still connects.
  const arms = [
    { spare: net.spareNs(cx, cy - 1), ns: true, lo: 4, hi: 8 },
    { spare: net.spareNs(cx, cy), ns: true, lo: 23, hi: 27 },
    { spare: net.spareEw(cx - 1, cy), ns: false, lo: 3, hi: 7 },
    { spare: net.spareEw(cx, cy), ns: false, lo: 24, hi: 28 },
  ];
  let cut: (typeof arms)[number] | undefined;
  if (ctx.kind === "nest") {
    const k0 = Math.floor(ctx.h(531) * 4);
    for (let k = 0; k < 4 && !cut; k++) if (arms[(k0 + k) % 4].spare) cut = arms[(k0 + k) % 4];
  }
  const broken = (ns: boolean, n: number) => !!cut && cut.ns === ns && n >= cut.lo && n <= cut.hi;
  const bridged = new Set<string>();
  const rubble = (x: number, y: number) => {
    ctx.reserve(x, y, 1, 1);
    S.creep(ctx, x, y, ctx.h(671, x, y));
    const h = ctx.h(530, x, y);
    if (h < 0.55) ctx.p(x, y, Math.floor(h * 7), Math.floor(((h * 31) % 1) * 4), 3, 2, ROAD.asphalt);
    if (h > 0.8) ctx.p(x, y, 1, 3, 2, 2, ROAD.edge);
  };
  const deck = (x: number, y: number, w: number, h: number) => {
    ctx.tr(x, y, w, h, BRIDGE.deck);
    for (let k = 0; k < w; k++) for (let q = 0; q < h; q++) bridged.add(`${x + k},${y + q}`);
  };

  // N-S highway (it also paints the node block where the two meet)
  let start = -1;
  for (let j = 0; j <= CH; j++) {
    const r = Y0 + j,
      want = j < CH && nsAt(j),
      on = want && !broken(true, j);
    if (want && !on) for (let k = 0; k < 3; k++) rubble(roadV + k, r);
    if (on) {
      if (start < 0) start = r;
      ctx.reserve(roadV, r, 3, 1);
      if (!ctx.land(roadV, r) || !ctx.land(roadV + 1, r) || !ctx.land(roadV + 2, r)) {
        deck(roadV, r, 3, 1);
        ctx.p(roadV, r, 0, 5, 18, 1, BRIDGE.seam);
        ctx.p(roadV, r, 0, 0, 1, 6, BRIDGE.rail);
        ctx.p(roadV, r, 17, 0, 1, 6, BRIDGE.rail);
        ctx.p(roadV, r, 18, 1, 1, 5, BRIDGE.shadow);
        continue;
      }
      ctx.tr(roadV, r, 3, 1, ROAD.asphalt);
      ctx.p(roadV, r, 0, 0, 1, 6, ROAD.edge);
      ctx.p(roadV, r, 17, 0, 1, 6, ROAD.edge);
      if (j % 2 === 0 && (j < ROAD_ROW || j > ROAD_ROW + 1)) ctx.p(roadV, r, 9, 1, 1, 4, ROAD.dash);
      if (j % 16 === 4) lamp(roadV - 1, r);
      if (j % 16 === 11) lamp(roadV + 3, r);
      if (j % 9 === 2) pole(roadV + 3, r);
    } else if (start >= 0) {
      ctx.feat.road([roadV + 1, start], [roadV + 1, r - 1], 3);
      start = -1;
    }
  }

  // E-W connector: runs through the node block (already paved) and over the mainline on a crossing
  start = -1;
  for (let i = 0; i <= CH; i++) {
    const c = X0 + i,
      want = i < CH && ewAt(i),
      on = want && !broken(false, i),
      node = i >= ROAD_COL && i < ROAD_COL + 3 && nsAt(ROAD_ROW);
    if (want && !on) for (let k = 0; k < 2; k++) rubble(c, roadH + k);
    if (on) {
      if (start < 0) start = c;
      if (node) continue;
      if (!ctx.land(c, roadH) || !ctx.land(c, roadH + 1)) {
        ctx.reserve(c, roadH, 1, 2);
        deck(c, roadH, 1, 2);
        ctx.p(c, roadH, 5, 0, 1, 12, BRIDGE.seam);
        ctx.p(c, roadH, 0, 0, 6, 1, BRIDGE.rail);
        ctx.p(c, roadH, 0, 11, 6, 1, BRIDGE.rail);
        ctx.p(c, roadH, 0, 12, 6, 1, BRIDGE.shadow);
        continue;
      }
      for (let k = 0; k < 2; k++) {
        const y = roadH + k,
          crossing = c === rcol && railRows.has(y);
        ctx.reserve(c, y, 1, 1);
        ctx.tr(c, y, 1, 1, ROAD.asphalt);
        if (crossing) {
          ctx.p(c, y, 1, 0, 1, 6, RAIL.steel);
          ctx.p(c, y, 4, 0, 1, 6, RAIL.steel);
        }
      }
      if (c !== rcol || !railRows.has(roadH)) ctx.p(c, roadH, 0, 0, 6, 1, ROAD.edge);
      if (i % 2 === 0 && c !== rcol) ctx.p(c, roadH, 2, 6, 3, 1, ROAD.dashEW);
      if (i % 16 === 4) lamp(c, roadH - 1);
    } else if (start >= 0) {
      ctx.feat.road([start, roadH + 0.5], [c - 1, roadH + 0.5], 2);
      start = -1;
    }
  }

  // no shore foam on top of a bridge deck
  if (bridged.size) {
    const sh = ctx.feat.features.shore;
    for (let k = sh.length - 1; k >= 0; k--)
      if (bridged.has(`${Math.floor(sh[k].x / T)},${Math.floor(sh[k].y / T)}`)) sh.splice(k, 1);
  }
}
