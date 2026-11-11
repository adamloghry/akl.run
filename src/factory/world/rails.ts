// The rail network (lattice.ts): N-S mainlines at tile column 44 mod 64 (every other chunk column),
// with one node per chunk at tile row RAIL_ROW, and E-W links along that row between neighbouring
// mainlines. Every passable mainline edge is laid; E-W links are laid only where they join otherwise
// separate parts (salt 541 order), so the rails form one network with as little extra track as that
// takes. Lattice index i is the mainline number m (column 64m + 44), j the chunk row.
import { CH } from "../core/types";
import { landAtTile } from "./geo";
import { memo, type Network } from "./lattice";
import { MAX_BRIDGE } from "./roads";

export const RAIL_ROW = 7; // clear of the E-W road (rows 15-16) and of every road lamp and pole row
const MAIN0 = 44,
  MAIN_EVERY = 64;

/** Mainline number of tile column x, or null when x is not a mainline column. */
export const mainlineIndex = (x: number): number | null =>
  (((x - MAIN0) % MAIN_EVERY) + MAIN_EVERY) % MAIN_EVERY === 0 ? (x - MAIN0) / MAIN_EVERY : null;
/** Tile column of mainline m. */
export const mainlineX = (m: number): number => m * MAIN_EVERY + MAIN0;

const MIN_SPUR = 4; // tiles; anything shorter is not worth a buffer stop

/** Land all round (shore distance >= 2, as the old mainline required). */
const inland = (x: number, y: number) => {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (!landAtTile(x + dx, y + dy)) return false;
  return true;
};
const spurs = new Map<string, number>();
/** Length of the inland run leaving node (m, j) along the mainline (dir 1 = south, -1 = north), or 0 if short. */
function spurLen(m: number, j: number, dir: 1 | -1): number {
  const k = `${m},${j},${dir}`;
  let n = spurs.get(k);
  if (n === undefined) {
    const x = mainlineX(m),
      y0 = j * CH + RAIL_ROW;
    n = 0;
    while (n < CH - 1 && inland(x, y0 + dir * (n + 1))) n++;
    if (n < MIN_SPUR) n = 0;
    spurs.set(k, n);
  }
  return n;
}

/**
 * Whether mainline m has track at tile row y: on a laid edge, at a junction, or on a spur. A spur is
 * the dead-end stretch a connected junction sends toward an edge that cannot be laid (too much water
 * ahead), as far as the land goes; it keeps hubs beside the water on the line without any orphan track.
 */
export function railAt(net: Network, m: number, y: number): boolean {
  const j = Math.floor((y - RAIL_ROW) / CH),
    y0 = j * CH + RAIL_ROW;
  const active = (jj: number) => net.v(m, jj - 1) || net.v(m, jj) || net.h(m - 1, jj) || net.h(m, jj);
  const south = (jj: number) => (!net.v(m, jj) && active(jj) ? spurLen(m, jj, 1) : 0);
  const north = (jj: number) => (!net.v(m, jj - 1) && active(jj) ? spurLen(m, jj, -1) : 0);
  if (y === y0) return net.v(m, j - 1) || net.v(m, j) || south(j) > 0 || north(j) > 0;
  if (net.v(m, j)) return true;
  return y - y0 <= south(j) || y0 + CH - y <= north(j + 1);
}

/** Whether row y of mainline m is the last tile of a spur (where the buffer stop goes). */
export function railEnd(net: Network, m: number, y: number): boolean {
  const j = Math.floor((y - RAIL_ROW) / CH);
  if (y === j * CH + RAIL_ROW && (net.h(m - 1, j) || net.h(m, j))) return false; // a corner, not an end
  return railAt(net, m, y) && (!railAt(net, m, y - 1) || !railAt(net, m, y + 1));
}

export const railNet: (seed: number) => Network = memo(
  {
    col: mainlineX,
    row: (cy) => cy * CH + RAIL_ROW,
    w: 1,
    h: 1,
    maxBridge: MAX_BRIDGE,
  },
  { pick: 540, join: 541, share: 0 },
);
