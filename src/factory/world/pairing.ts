// Pure nest / outpost pairing (spec 4.5.1), shared by world.ts and the nest/outpost recipes.
// Imports only terrain/geo/core so recipes can use it without a cycle through world.ts.
import { hash } from "../core/hash";
import { CH, type DistrictKind } from "../core/types";
import { DOWNTOWN } from "./geo";
import { baseKind, chunkBase } from "./terrain";

export const NEIGH: readonly (readonly [number, number])[] = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

export function nestCandidate(
  cx: number,
  cy: number,
  seed: number,
  kindAtBase: (cx: number, cy: number) => DistrictKind,
  landFracAt: (cx: number, cy: number) => number,
): boolean {
  const k = kindAtBase(cx, cy);
  if (k === "hub" || k === "silo" || k === "mine" || landFracAt(cx, cy) < 0.6) return false;
  if (hash(cx, cy, seed + 510) >= 1 / 4) return false;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) if (kindAtBase(cx + dx, cy + dy) === "hub") return false;
  return true;
}

/**
 * The chunk that serves as the outpost of the nest at (cx, cy), or null when that chunk is not a
 * nest. Candidates are 4-neighbours with land >= .6 that are not themselves nest candidates;
 * the one nearest downtown wins, ties N, E, S, W.
 */
export function pairedOutpost(
  cx: number,
  cy: number,
  seed: number,
  kindAtBase: (cx: number, cy: number) => DistrictKind,
  landFracAt: (cx: number, cy: number) => number,
): { cx: number; cy: number } | null {
  if (!nestCandidate(cx, cy, seed, kindAtBase, landFracAt)) return null;
  let best: { cx: number; cy: number } | null = null,
    bd = Infinity;
  for (const [dx, dy] of NEIGH) {
    const nx = cx + dx,
      ny = cy + dy;
    if (landFracAt(nx, ny) < 0.6 || nestCandidate(nx, ny, seed, kindAtBase, landFracAt)) continue;
    const d = Math.hypot((nx + 0.5) * CH - DOWNTOWN[0], (ny + 0.5) * CH - DOWNTOWN[1]);
    if (d < bd) {
      bd = d;
      best = { cx: nx, cy: ny };
    }
  }
  return best;
}

/** Uncached pairing for recipes: derives base kinds and land fractions straight from the seed. */
export function pairedOutpostPure(cx: number, cy: number, seed: number): { cx: number; cy: number } | null {
  return pairedOutpost(
    cx,
    cy,
    seed,
    (x, y) => baseKind(chunkBase(x, y, seed), seed),
    (x, y) => chunkBase(x, y, seed).landFrac,
  );
}
