import { describe, it, expect } from "vitest";
import { World } from "../../../src/factory/world/world";
import { LAND_TILES, landAtTile } from "../../../src/factory/world/geo";
import { MAX_BRIDGE, roadNet } from "../../../src/factory/world/roads";
import { mainlineX, railNet, RAIL_ROW } from "../../../src/factory/world/rails";
import { CH, T, type Pt } from "../../../src/factory/core/types";

type Seg = { a: Pt; b: Pt };
import { fakeCanvas } from "../../fakes/canvas";

const SEEDS = [0xa85b492a, 1, 2, 3, 0xdeadbeef];
const cx0 = Math.floor(LAND_TILES.tx0 / CH) - 1,
  cy0 = Math.floor(LAND_TILES.ty0 / CH) - 1,
  cx1 = Math.floor(LAND_TILES.tx1 / CH) + 1,
  cy1 = Math.floor(LAND_TILES.ty1 / CH) + 1;

/** Every painted road and rail segment of every land chunk, plus the chunks that are nests. */
function paintAll(seed: number) {
  const w = new World(seed, { cap: 16, canvasFactory: fakeCanvas });
  const segs: Seg[] = [],
    rails: Seg[] = [];
  const nests = new Set<string>();
  for (let cy = cy0; cy <= cy1; cy++)
    for (let cx = cx0; cx <= cx1; cx++) {
      const { features, kind } = w.paintRaster(cx, cy);
      segs.push(...features.roads);
      rails.push(...features.rails);
      if (kind === "nest") nests.add(`${cx},${cy}`);
    }
  return { segs, rails, nests };
}
const painted = new Map<number, ReturnType<typeof paintAll>>();
const paintOnce = (seed: number) => painted.get(seed) ?? painted.set(seed, paintAll(seed)).get(seed)!;

/** Components of the painted segments: touching collinear runs and crossing perpendicular ones join. */
function components(segs: Seg[]): number {
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const span = (s: Seg) => ({
    v: s.a.x === s.b.x,
    x0: Math.min(s.a.x, s.b.x),
    x1: Math.max(s.a.x, s.b.x),
    y0: Math.min(s.a.y, s.b.y),
    y1: Math.max(s.a.y, s.b.y),
  });
  const sp = segs.map(span);
  const near = (a: ReturnType<typeof span>, b: ReturnType<typeof span>) =>
    a.x0 <= b.x1 + 2 * T && b.x0 <= a.x1 + 2 * T && a.y0 <= b.y1 + 2 * T && b.y0 <= a.y1 + 2 * T;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) if (near(sp[i], sp[j])) parent[find(i)] = find(j);
  return new Set(segs.map((_, i) => find(i))).size;
}

describe("road and rail networks", () => {
  it("the paved lattice is one connected graph for every seed", () => {
    for (const seed of SEEDS) {
      const net = roadNet(seed);
      const seen = new Set<string>(),
        nodes: string[] = [];
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++)
          if (net.ns(cx, cy) || net.ns(cx, cy - 1) || net.ew(cx, cy) || net.ew(cx - 1, cy))
            nodes.push(`${cx},${cy}`);
      expect(nodes.length, `seed ${seed}`).toBeGreaterThan(100);
      const stack = [nodes[0]];
      seen.add(nodes[0]);
      while (stack.length) {
        const [cx, cy] = stack.pop()!.split(",").map(Number);
        const next: [boolean, number, number][] = [
          [net.ns(cx, cy), cx, cy + 1],
          [net.ns(cx, cy - 1), cx, cy - 1],
          [net.ew(cx, cy), cx + 1, cy],
          [net.ew(cx - 1, cy), cx - 1, cy],
        ];
        for (const [ok, x, y] of next) {
          const k = `${x},${y}`;
          if (ok && !seen.has(k)) {
            seen.add(k);
            stack.push(k);
          }
        }
      }
      expect(seen.size, `seed ${seed}`).toBe(nodes.length);
    }
  });

  it("painted roads form one network even where biters broke a road", () => {
    for (const seed of SEEDS) {
      const { segs, nests } = paintOnce(seed);
      expect(nests.size, `seed ${seed}`).toBeGreaterThan(0);
      expect(components(segs), `seed ${seed}`).toBe(1);
    }
  });

  it("bridges exist but are short: no paved edge crosses more than MAX_BRIDGE tiles of water", () => {
    expect(MAX_BRIDGE).toBeLessThanOrEqual(6);
    const net = roadNet(SEEDS[0]);
    let bridges = 0;
    const longest = (n: number, wet: (k: number) => boolean) => {
      let run = 0,
        best = 0;
      for (let k = 0; k < n; k++) best = Math.max(best, (run = wet(k) ? run + 1 : 0));
      return best;
    };
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const x = cx * CH + 14,
          y = cy * CH + 15;
        if (net.ns(cx, cy)) {
          const r = longest(CH + 2, (k) => [0, 1, 2].some((i) => !landAtTile(x + i, y + k)));
          expect(r, `ns ${cx},${cy}`).toBeLessThanOrEqual(MAX_BRIDGE);
          if (r) bridges++;
        }
        if (net.ew(cx, cy)) {
          const r = longest(CH + 3, (k) => [0, 1].some((j) => !landAtTile(x + k, y + j)));
          expect(r, `ew ${cx},${cy}`).toBeLessThanOrEqual(MAX_BRIDGE);
          if (r) bridges++;
        }
      }
    expect(bridges).toBeGreaterThan(0);
  });

  it("painted rails form one network: mainlines joined by E-W links, no orphan track", () => {
    for (const seed of SEEDS) {
      const { rails } = paintOnce(seed);
      expect(
        rails.some((r) => r.a.y === r.b.y),
        `seed ${seed}: an E-W link`,
      ).toBe(true);
      expect(components(rails), `seed ${seed}`).toBe(1);
    }
  });

  it("rail bridges are short too", () => {
    const net = railNet(SEEDS[0]);
    let bridges = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let m = -2; m <= 8; m++) {
        const x = mainlineX(m),
          y = cy * CH + RAIL_ROW;
        let run = 0,
          best = 0;
        if (net.v(m, cy))
          for (let k = 1; k < CH; k++) best = Math.max(best, (run = landAtTile(x, y + k) ? 0 : run + 1));
        if (net.h(m, cy)) {
          run = 0;
          for (let k = 1; k < mainlineX(m + 1) - x; k++)
            best = Math.max(best, (run = landAtTile(x + k, y) ? 0 : run + 1));
        }
        expect(best, `rail ${m},${cy}`).toBeLessThanOrEqual(MAX_BRIDGE);
        if (best) bridges++;
      }
    expect(bridges).toBeGreaterThan(0);
  });
});
