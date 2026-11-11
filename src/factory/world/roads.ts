// The road network (lattice.ts): one node per chunk where the 3-wide N-S highway (tile columns 14-16)
// meets the 2-wide E-W connector (rows 15-16). Every N-S edge is paved, 1/4 of E-W edges at random
// (salt 521), plus the E-W edges that join the rest (salt 520 order). Lattice index = chunk coords.
import { CH } from "../core/types";
import { memo, type Network } from "./lattice";

/** Highway columns and connector rows within a chunk (tile offsets). */
export const ROAD_COL = 14; // 3 wide: 14..16
export const ROAD_ROW = 15; // 2 tall: 15..16
export const MAX_BRIDGE = 6; // tiles (~220 m): enough for the Ship Canal at its narrowest, nothing like Lake Union

export interface RoadNet {
  /** Paved N-S edge from node (cx, cy) to (cx, cy + 1). */
  ns(cx: number, cy: number): boolean;
  /** Paved E-W edge from node (cx, cy) to (cx + 1, cy). */
  ew(cx: number, cy: number): boolean;
  /** Paved edges off a spanning tree: the only roads biters may break (the rest stays connected). */
  spareNs(cx: number, cy: number): boolean;
  spareEw(cx: number, cy: number): boolean;
}

const net = memo(
  {
    col: (cx) => cx * CH + ROAD_COL,
    row: (cy) => cy * CH + ROAD_ROW,
    w: 3,
    h: 2,
    maxBridge: MAX_BRIDGE,
  },
  { pick: 521, join: 520, share: 0.25 },
);

const wrap = (n: Network): RoadNet => ({ ns: n.v, ew: n.h, spareNs: n.spareV, spareEw: n.spareH });
const wrapped = new WeakMap<Network, RoadNet>();

/** The paved road network for `seed` (memoised; a pure function of the seed). */
export function roadNet(seed: number): RoadNet {
  const n = net(seed);
  let r = wrapped.get(n);
  if (!r) wrapped.set(n, (r = wrap(n)));
  return r;
}
