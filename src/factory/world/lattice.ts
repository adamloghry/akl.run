// A connected transport network on a lattice, shared by roads.ts and rails.ts. Node (i, j) is the
// w x h tile block at (col(i), row(j)). A vertical edge joins (i, j) and (i, j + 1), a horizontal
// edge joins (i, j) and (i + 1, j). An edge is passable when both nodes are land and no water run
// along it is longer than `maxBridge` tiles (that run is painted as a short bridge). Only the largest
// passable component is kept, so every paved piece reaches every other. Which edges are paved is
// per seed: every vertical edge, a random share of horizontal ones, then (Kruskal, lowest hash first)
// any horizontal edge that joins two still-separate parts. Pure: geography + hash.
import { hash } from "../core/hash";
import { LAND_TILES, landAtTile } from "./geo";

export interface LatticeSpec {
  /** Left tile column of node column i, and top tile row of node row j. */
  col(i: number): number;
  row(j: number): number;
  w: number;
  h: number;
  maxBridge: number;
}

export interface Lattice {
  /** Passable edges in the largest component, keyed "i,j", in row-major order. */
  v: Set<string>;
  h: Set<string>;
}

export interface Network {
  /** Paved vertical edge (i, j) -> (i, j + 1) and horizontal edge (i, j) -> (i + 1, j). */
  v(i: number, j: number): boolean;
  h(i: number, j: number): boolean;
  /** Paved edges off a spanning tree: removing any or all of them keeps the network connected. */
  spareV(i: number, j: number): boolean;
  spareH(i: number, j: number): boolean;
}

export const key = (i: number, j: number) => `${i},${j}`;

export class UnionFind {
  private parent = new Map<string, string>();
  find(k: string): string {
    let p = this.parent.get(k) ?? k;
    if (p !== k) {
      p = this.find(p);
      this.parent.set(k, p);
    }
    return p;
  }
  union(a: string, b: string): boolean {
    const ra = this.find(a),
      rb = this.find(b);
    if (ra === rb) return false;
    this.parent.set(rb, ra);
    return true;
  }
}

/** Longest run of consecutive `true` from `wet(k)` for k in [a, b]. */
function longestRun(a: number, b: number, wet: (k: number) => boolean): number {
  let run = 0,
    best = 0;
  for (let k = a; k <= b; k++) {
    run = wet(k) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** First and last lattice index whose span can touch [t0, t1] (tiles), with a one-node margin. */
function range(at: (n: number) => number, t0: number, t1: number): [number, number] {
  let lo = 0;
  while (at(lo) > t0) lo--;
  while (at(lo + 1) <= t0) lo++;
  let hi = lo;
  while (at(hi) < t1) hi++;
  return [lo - 1, hi + 1];
}

export function buildLattice(spec: LatticeSpec): Lattice {
  const { col, row, w, h, maxBridge } = spec;
  const [i0, i1] = range(col, LAND_TILES.tx0, LAND_TILES.tx1),
    [j0, j1] = range(row, LAND_TILES.ty0, LAND_TILES.ty1);
  const land = (x0: number, y0: number, nx: number, ny: number) => {
    for (let y = y0; y < y0 + ny; y++) for (let x = x0; x < x0 + nx; x++) if (!landAtTile(x, y)) return false;
    return true;
  };
  const node = new Set<string>();
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) if (land(col(i), row(j), w, h)) node.add(key(i, j));
  const vAll: [number, number][] = [],
    hAll: [number, number][] = [];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (!node.has(key(i, j))) continue;
      if (node.has(key(i, j + 1))) {
        const x = col(i);
        if (longestRun(row(j) + h, row(j + 1) - 1, (y) => !land(x, y, w, 1)) <= maxBridge) vAll.push([i, j]);
      }
      if (node.has(key(i + 1, j))) {
        const y = row(j);
        if (longestRun(col(i) + w, col(i + 1) - 1, (x) => !land(x, y, 1, h)) <= maxBridge) hAll.push([i, j]);
      }
    }
  // components over every passable edge; keep the largest (ties: first found in row-major order)
  const uf = new UnionFind();
  for (const [i, j] of vAll) uf.union(key(i, j), key(i, j + 1));
  for (const [i, j] of hAll) uf.union(key(i, j), key(i + 1, j));
  const size = new Map<string, number>();
  let main = "",
    best = 0;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = key(i, j);
      if (!node.has(k)) continue;
      const r = uf.find(k),
        n = (size.get(r) ?? 0) + 1;
      size.set(r, n);
      if (n > best) {
        best = n;
        main = r;
      }
    }
  const inMain = ([i, j]: [number, number]) => uf.find(key(i, j)) === main;
  return {
    v: new Set(vAll.filter(inMain).map(([i, j]) => key(i, j))),
    h: new Set(hAll.filter(inMain).map(([i, j]) => key(i, j))),
  };
}

/** The paved network for one seed: salts pick the random horizontal share and the joiner order. */
export function pave(L: Lattice, seed: number, o: { pick: number; join: number; share: number }): Network {
  const hs = new Set<string>();
  const uf = new UnionFind();
  for (const k of L.v) {
    const [i, j] = k.split(",").map(Number);
    uf.union(k, key(i, j + 1));
  }
  const joiners: [number, number, number][] = [];
  for (const k of L.h) {
    const [i, j] = k.split(",").map(Number);
    if (hash(i, j, seed + o.pick) < o.share) {
      hs.add(k);
      uf.union(k, key(i + 1, j));
    } else joiners.push([i, j, hash(i, j, seed + o.join)]);
  }
  joiners.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  for (const [i, j] of joiners) if (uf.union(key(i, j), key(i + 1, j))) hs.add(key(i, j));
  // spanning tree (vertical edges first, then horizontal, each in row-major order); the rest is spare
  const tree = new UnionFind(),
    spareV = new Set<string>(),
    spareH = new Set<string>();
  for (const k of L.v) {
    const [i, j] = k.split(",").map(Number);
    if (!tree.union(k, key(i, j + 1))) spareV.add(k);
  }
  for (const k of L.h) {
    if (!hs.has(k)) continue;
    const [i, j] = k.split(",").map(Number);
    if (!tree.union(k, key(i + 1, j))) spareH.add(k);
  }
  return {
    v: (i, j) => L.v.has(key(i, j)),
    h: (i, j) => hs.has(key(i, j)),
    spareV: (i, j) => spareV.has(key(i, j)),
    spareH: (i, j) => spareH.has(key(i, j)),
  };
}

/** Memoise per-seed networks over a lazily built lattice (keeps the last four seeds). */
export function memo(spec: LatticeSpec, o: { pick: number; join: number; share: number }) {
  let L: Lattice | null = null;
  const nets = new Map<number, Network>();
  return (seed: number): Network => {
    const hit = nets.get(seed);
    if (hit) return hit;
    L ??= buildLattice(spec);
    const net = pave(L, seed, o);
    if (nets.size >= 4) nets.delete(nets.keys().next().value!);
    nets.set(seed, net);
    return net;
  };
}
