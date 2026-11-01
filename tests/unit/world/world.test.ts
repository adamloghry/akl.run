import { describe, it, expect } from "vitest";
import { World } from "../../../src/factory/world/world";
import { CENTRAL_BOX, DOWNTOWN } from "../../../src/factory/world/geo";
import { CH, CPX } from "../../../src/factory/core/types";
import { fakeCanvas } from "../../fakes/canvas";

const dcx = Math.floor(DOWNTOWN[0] / CH),
  dcy = Math.floor(DOWNTOWN[1] / CH);
const W = (seed: number, cap = 256) => new World(seed, { cap, canvasFactory: fakeCanvas });
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => Buffer.from(a).equals(Buffer.from(b));

describe("World determinism", () => {
  for (const seed of [0xa85b492a, 1, 0xdeadbeef]) {
    it(`two worlds paint identical chunks (seed ${seed.toString(16)})`, () => {
      const a = W(seed),
        b = W(seed);
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const ra = a.paintRaster(dcx + dx, dcy + dy),
            rb = b.paintRaster(dcx + dx, dcy + dy);
          expect(same(ra.raster.data, rb.raster.data)).toBe(true);
          expect(JSON.stringify(ra.features)).toBe(JSON.stringify(rb.features));
        }
    });
  }
  it("order independence", () => {
    const a = W(7),
      b = W(7);
    b.paintRaster(dcx + 5, dcy);
    b.paintRaster(dcx - 2, dcy + 1);
    expect(same(a.paintRaster(dcx, dcy).raster.data, b.paintRaster(dcx, dcy).raster.data)).toBe(true);
  });
  it("kindAt agrees with paintRaster", () => {
    const w = W(3);
    for (let i = 0; i < 40; i++) {
      const cx = dcx - 10 + (i % 20),
        cy = dcy - 5 + Math.floor(i / 4);
      expect(w.paintRaster(cx, cy).kind).toBe(w.kindAt(cx, cy));
    }
  });
});
describe("placement", () => {
  it("every kind appears over a large area; nests have no hub within 2 and a paired adjacent outpost", () => {
    const w = W(0xa85b492a),
      seen = new Set<string>();
    for (let cy = dcy - 40; cy <= dcy + 40; cy++)
      for (let cx = dcx - 25; cx <= dcx + 25; cx++) {
        const k = w.kindAt(cx, cy);
        seen.add(k);
        if (k !== "nest") continue;
        for (let y = -2; y <= 2; y++)
          for (let x = -2; x <= 2; x++) expect(w.kindAt(cx + x, cy + y)).not.toBe("hub");
      }
    for (const k of [
      "wild",
      "outpost",
      "mine",
      "smelt",
      "asm",
      "power",
      "hub",
      "labs",
      "solar",
      "oil",
      "storage",
      "silo",
      "nest",
    ])
      expect(seen.has(k), k).toBe(true);
  });
  it("nest features: NestSite present; its outpost chunk is adjacent, kind 'outpost', has an OutpostSite; both rects inside their chunk", () => {
    const w = W(0xa85b492a);
    const inside = (cx: number, cy: number, r: { x: number; y: number; w: number; h: number }) =>
      r.x >= cx * CPX && r.y >= cy * CPX && r.x + r.w <= (cx + 1) * CPX && r.y + r.h <= (cy + 1) * CPX;
    let nests = 0;
    for (let cy = dcy - 40; cy <= dcy + 40; cy++)
      for (let cx = dcx - 25; cx <= dcx + 25; cx++) {
        if (w.kindAt(cx, cy) !== "nest") continue;
        nests++;
        const nest = w.paintRaster(cx, cy).features.nests;
        expect(nest.length).toBe(1);
        const o = nest[0].outpost;
        expect(Math.abs(o.cx - cx) + Math.abs(o.cy - cy)).toBe(1);
        expect(w.kindAt(o.cx, o.cy)).toBe("outpost");
        const sites = w.paintRaster(o.cx, o.cy).features.outposts;
        expect(sites.length).toBe(1);
        expect(sites[0].wall.length).toBeGreaterThanOrEqual(20);
        expect(sites[0].turrets.length).toBe(5);
        expect(inside(cx, cy, nest[0].rect)).toBe(true);
        expect(inside(o.cx, o.cy, sites[0].rect)).toBe(true);
      }
    expect(nests).toBeGreaterThan(0);
  });
});
describe("reachable area around downtown", () => {
  // Events find sites within Chebyshev 4 of the camera, whose waypoints stay inside CENTRAL_BOX.
  const x0 = Math.floor(CENTRAL_BOX.tx0 / CH) - 4,
    x1 = Math.floor(CENTRAL_BOX.tx1 / CH) + 4,
    y0 = Math.floor(CENTRAL_BOX.ty0 / CH) - 4,
    y1 = Math.floor(CENTRAL_BOX.ty1 / CH) + 4;
  const seeds = [0xa85b492a, ...Array.from({ length: 19 }, (_, i) => i + 1)];
  const survey = (seed: number) => {
    const w = W(seed),
      count: Record<string, number> = {};
    let pairedNest = false;
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = w.kindAt(cx, cy);
        count[k] = (count[k] ?? 0) + 1;
        if (k === "nest")
          for (const [dx, dy] of [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
          ])
            if (w.kindAt(cx + dx, cy + dy) === "outpost" && w.landFracAt(cx + dx, cy + dy) >= 0.6) {
              const inArea = cx + dx >= x0 && cx + dx <= x1 && cy + dy >= y0 && cy + dy <= y1;
              if (inArea) pairedNest = true;
            }
      }
    return { count, pairedNest };
  };
  it("reliably holds a hub, a silo and a nest with its outpost (>= 18 of 20 seeds)", () => {
    let ok = 0;
    for (const seed of seeds) {
      const { count, pairedNest } = survey(seed);
      if (count.hub > 0 && count.silo > 0 && pairedNest) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(18);
  });
  it("stays varied: no industrial kind exceeds 40% of non-wild chunks", () => {
    for (const seed of seeds) {
      const { count } = survey(seed);
      const nonWild = Object.entries(count).filter(([k]) => k !== "wild");
      const total = nonWild.reduce((n, [, v]) => n + v, 0);
      for (const [k, v] of nonWild) {
        if (k === "outpost" || k === "mine") continue;
        expect(v / total, `${k} seed ${seed}`).toBeLessThanOrEqual(0.4);
      }
    }
  });
});
describe("LRU, generation, epoch, query", () => {
  it("is a true LRU with a cap", () => {
    const w = W(1, 3);
    w.chunk(dcx, dcy);
    w.chunk(dcx + 1, dcy);
    w.chunk(dcx + 2, dcy);
    w.peek(dcx, dcy);
    w.chunk(dcx + 3, dcy);
    expect(w.isResident(dcx, dcy)).toBe(true);
    expect(w.isResident(dcx + 1, dcy)).toBe(false);
    expect(w.size()).toBe(3);
  });
  it("bumps generation and epoch; overlay tokens go stale", () => {
    const w = W(1, 1);
    w.chunk(dcx, dcy);
    const g0 = w.generation;
    const tok = w.saveRect({ x: dcx * CPX + 10, y: dcy * CPX + 10, w: 20, h: 20 })!;
    expect(tok).not.toBeNull();
    w.chunk(dcx + 1, dcy);
    expect(w.generation).toBeGreaterThan(g0);
    expect(w.restore(tok)).toBe(false);
    w.chunk(dcx, dcy);
    expect(w.paint(tok, () => {})).toBe(false);
  });
  it("query returns resident features only and is memoised", () => {
    const w = W(1);
    const r = { x: (dcx - 1) * CPX, y: (dcy - 1) * CPX, w: 3 * CPX, h: 3 * CPX };
    const count = (f: ReturnType<World["query"]>) =>
      f.machines.length + f.rails.length + f.shore.length + f.roads.length;
    const q0 = w.query(r);
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) w.chunk(dcx + x, dcy + y);
    const q1 = w.query(r);
    expect(w.query(r)).toBe(q1);
    expect(count(q1)).toBeGreaterThan(count(q0));
  });
  it("joins rail and road segments across chunk seams", () => {
    const w = W(1);
    let raw = 0;
    // the mainline is column 44 mod 64, i.e. in every odd chunk column; stack a few chunks of it
    const cxs = dcx % 2 ? dcx : dcx + 1;
    for (let cy = dcy - 2; cy <= dcy + 2; cy++) {
      raw += w.paintRaster(cxs, cy).features.rails.length;
      w.chunk(cxs, cy);
    }
    const q = w.query({ x: cxs * CPX, y: (dcy - 2) * CPX, w: CPX, h: 5 * CPX });
    expect(raw).toBeGreaterThan(1);
    expect(q.rails.length).toBeLessThan(raw);
  });
  it("paintRaster is fast (median of 15 < 3 ms)", () => {
    const w = W(1),
      times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      w.paintRaster(dcx + i, dcy);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[7]).toBeLessThan(3);
  });
});

describe("World.dispose", () => {
  it("evicts every chunk, zeroes every canvas and empties the caches", () => {
    const made: HTMLCanvasElement[] = [];
    const w = new World(5, {
      cap: 16,
      canvasFactory: () => {
        const c = fakeCanvas();
        made.push(c);
        return c;
      },
    });
    for (let i = 0; i < 4; i++) w.chunk(dcx + i, dcy);
    expect(w.size()).toBe(4);
    w.dispose();
    expect(w.size()).toBe(0);
    expect(made.length).toBe(4);
    for (const c of made) {
      expect(c.width).toBe(0);
      expect(c.height).toBe(0);
    }
  });
});
