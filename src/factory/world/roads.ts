// The road network: a lattice with one node per chunk, where the N-S highway (tile columns 14-16)
// meets the E-W connector (tile rows 15-16). An edge between neighbouring nodes is passable when both
// nodes are land and no water run along it is longer than MAX_BRIDGE tiles (that run becomes a short
// bridge). Only the largest passable component gets roads, so every road reaches every other one.
// The land lattice is pure geography (seed-independent, built once); the seed only picks which E-W
// edges to pave: 1/4 at random (salt 521), plus, lowest salt-520 hash first, any E-W edge that joins
// two still-separate parts (Kruskal), so the paved graph spans the whole component.
import { hash } from "../core/hash";
import { CH } from "../core/types";
import { LAND_TILES, landAtTile } from "./geo";

/** Highway columns and connector rows within a chunk (tile offsets). */
export const ROAD_COL = 14; // 3 wide: 14..16
export const ROAD_ROW = 15; // 2 tall: 15..16
export const MAX_BRIDGE = 6; // tiles (~220 m): enough for the Ship Canal at its narrowest, nothing like Lake Union
const EW_P = 0.25;

interface Lattice {
  cx0: number;
  cy0: number;
  cx1: number;
  cy1: number;
  /** passable N-S edges in the main component, keyed (cx, cy) -> (cx, cy + 1) */
  ns: Set<string>;
  /** passable E-W edges in the main component, keyed (cx, cy) -> (cx + 1, cy) */
  ew: Set<string>;
}

export interface RoadNet {
  /** Paved N-S edge from node (cx, cy) to (cx, cy + 1). */
  ns(cx: number, cy: number): boolean;
  /** Paved E-W edge from node (cx, cy) to (cx + 1, cy). */
  ew(cx: number, cy: number): boolean;
  /**
   * Paved edges outside a spanning tree of the network: removing any or all of them leaves it
   * connected, so these are the only roads biters may break.
   */
  spareNs(cx: number, cy: number): boolean;
  spareEw(cx: number, cy: number): boolean;
}

const key = (cx: number, cy: number) => `${cx},${cy}`;

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

let lattice: Lattice | null = null;

function buildLattice(): Lattice {
  const cx0 = Math.floor(LAND_TILES.tx0 / CH) - 1,
    cy0 = Math.floor(LAND_TILES.ty0 / CH) - 1,
    cx1 = Math.floor(LAND_TILES.tx1 / CH) + 1,
    cy1 = Math.floor(LAND_TILES.ty1 / CH) + 1;
  const col = (cx: number) => cx * CH + ROAD_COL,
    row = (cy: number) => cy * CH + ROAD_ROW;
  const node = new Set<string>();
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      let ok = true;
      for (let j = 0; j < 2 && ok; j++)
        for (let i = 0; i < 3 && ok; i++) ok = landAtTile(col(cx) + i, row(cy) + j);
      if (ok) node.add(key(cx, cy));
    }
  const nsAll: [number, number][] = [],
    ewAll: [number, number][] = [];
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!node.has(key(cx, cy))) continue;
      if (node.has(key(cx, cy + 1))) {
        const x = col(cx);
        const wet = (y: number) => !landAtTile(x, y) || !landAtTile(x + 1, y) || !landAtTile(x + 2, y);
        if (longestRun(row(cy) + 2, row(cy + 1) - 1, wet) <= MAX_BRIDGE) nsAll.push([cx, cy]);
      }
      if (node.has(key(cx + 1, cy))) {
        const y = row(cy);
        const wet = (x: number) => !landAtTile(x, y) || !landAtTile(x, y + 1);
        if (longestRun(col(cx) + 3, col(cx + 1) - 1, wet) <= MAX_BRIDGE) ewAll.push([cx, cy]);
      }
    }
  // components over every passable edge; keep the largest (ties: first found in row-major order)
  const uf = new UnionFind();
  for (const [cx, cy] of nsAll) uf.union(key(cx, cy), key(cx, cy + 1));
  for (const [cx, cy] of ewAll) uf.union(key(cx, cy), key(cx + 1, cy));
  const size = new Map<string, number>();
  let main = "",
    best = 0;
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const k = key(cx, cy);
      if (!node.has(k)) continue;
      const r = uf.find(k),
        n = (size.get(r) ?? 0) + 1;
      size.set(r, n);
      if (n > best) {
        best = n;
        main = r;
      }
    }
  const inMain = (cx: number, cy: number) => uf.find(key(cx, cy)) === main;
  return {
    cx0,
    cy0,
    cx1,
    cy1,
    ns: new Set(nsAll.filter(([cx, cy]) => inMain(cx, cy)).map(([cx, cy]) => key(cx, cy))),
    ew: new Set(ewAll.filter(([cx, cy]) => inMain(cx, cy)).map(([cx, cy]) => key(cx, cy))),
  };
}

class UnionFind {
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

const nets = new Map<number, RoadNet>();

/** The paved network for `seed` (memoised; a pure function of the seed). */
export function roadNet(seed: number): RoadNet {
  const hit = nets.get(seed);
  if (hit) return hit;
  lattice ??= buildLattice();
  const L = lattice;
  const ew = new Set<string>();
  const uf = new UnionFind();
  for (const k of L.ns) {
    const [cx, cy] = k.split(",").map(Number);
    uf.union(k, key(cx, cy + 1));
  }
  const joiners: [number, number, number][] = [];
  for (const k of L.ew) {
    const [cx, cy] = k.split(",").map(Number);
    if (hash(cx, cy, seed + 521) < EW_P) {
      ew.add(k);
      uf.union(k, key(cx + 1, cy));
    } else joiners.push([cx, cy, hash(cx, cy, seed + 520)]);
  }
  joiners.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  for (const [cx, cy] of joiners) if (uf.union(key(cx, cy), key(cx + 1, cy))) ew.add(key(cx, cy));
  // spanning tree (N-S edges first, then E-W, each in row-major order); everything else is spare
  const tree = new UnionFind(),
    spareNs = new Set<string>(),
    spareEw = new Set<string>();
  for (const k of L.ns) {
    const [cx, cy] = k.split(",").map(Number);
    if (!tree.union(k, key(cx, cy + 1))) spareNs.add(k);
  }
  for (const k of L.ew) {
    if (!ew.has(k)) continue;
    const [cx, cy] = k.split(",").map(Number);
    if (!tree.union(k, key(cx + 1, cy))) spareEw.add(k);
  }
  const net: RoadNet = {
    ns: (cx, cy) => L.ns.has(key(cx, cy)),
    ew: (cx, cy) => ew.has(key(cx, cy)),
    spareNs: (cx, cy) => spareNs.has(key(cx, cy)),
    spareEw: (cx, cy) => spareEw.has(key(cx, cy)),
  };
  if (nets.size >= 4) nets.delete(nets.keys().next().value!);
  nets.set(seed, net);
  return net;
}
