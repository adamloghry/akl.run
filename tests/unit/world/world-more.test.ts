import { describe, it, expect } from "vitest";
import { World, makeRecipeCtx, pairedOutpost } from "../../../src/factory/world/world";
import { baseKind, chunkBase } from "../../../src/factory/world/terrain";
import { DOWNTOWN } from "../../../src/factory/world/geo";
import { CH, CPX, T, tileCentre, type DistrictKind } from "../../../src/factory/core/types";
import { fakeCanvas, type Call } from "../../fakes/canvas";

const dcx = Math.floor(DOWNTOWN[0] / CH),
  dcy = Math.floor(DOWNTOWN[1] / CH);
const W = (seed: number, cap = 256) => new World(seed, { cap, canvasFactory: fakeCanvas });
const SEEDS = [0xa85b492a, 1, 2];

describe("findSite vs brute force", () => {
  const kinds: DistrictKind[] = ["hub", "silo", "nest", "outpost", "mine", "labs"];
  for (const seed of SEEDS)
    it(`matches a Chebyshev scan (seed ${seed.toString(16)})`, () => {
      const w = W(seed),
        ref = W(seed);
      for (const kind of kinds)
        for (const [ox, oy] of [
          [0, 0],
          [3, -2],
          [-7, 5],
        ]) {
          const cx = dcx + ox,
            cy = dcy + oy;
          const from = { x: (cx + 0.3) * CPX, y: (cy + 0.6) * CPX };
          for (const r of [0, 2, 6]) {
            let best = Infinity;
            for (let dy = -r; dy <= r; dy++)
              for (let dx = -r; dx <= r; dx++)
                if (ref.kindAt(cx + dx, cy + dy) === kind)
                  best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
            const got = w.findSite(kind, from, r);
            if (best === Infinity) expect(got, `${kind} r${r}`).toBeNull();
            else {
              expect(got, `${kind} r${r}`).not.toBeNull();
              expect(got!.kind).toBe(kind);
              expect(got!.dist).toBe(best);
              expect(Math.max(Math.abs(got!.cx - cx), Math.abs(got!.cy - cy))).toBe(best);
              expect(ref.kindAt(got!.cx, got!.cy)).toBe(kind);
            }
          }
        }
    });
  it("returns null when nothing is in range", () => {
    expect(W(1).findSite("hub", { x: -1e7, y: -1e7 }, 3)).toBeNull();
  });
});

describe("FeatureBuilder", () => {
  const fb = (cx = 5, cy = -3) => makeRecipeCtx(W(1), cx, cy, "asm").ctx.feat;
  it("converts tiles to world px and numbers ids per prefix", () => {
    const f = fb();
    const m0 = f.machine("lamp", 4, 6, 2, 3);
    const m1 = f.machine("pole", 1, 1, 1, 1);
    expect(m0.at).toEqual(tileCentre(4, 6, 2, 3));
    expect(m0.at).toEqual({ x: 5 * T, y: 7.5 * T });
    expect([m0.id, m1.id]).toEqual(["m:5,-3:0", "m:5,-3:1"]);
    const b = f.belt(
      [
        [1, 2],
        [3, 2],
      ],
      [[], []],
    );
    expect(b.id).toBe("b:5,-3:0");
    expect(b.pts).toEqual([tileCentre(1, 2), tileCentre(3, 2)]);
    expect(f.rail([1, 2], [1, 9], "L").id).toBe("r:5,-3:0");
    expect(f.rail([2, 2], [2, 9], "L").id).toBe("r:5,-3:1");
    expect(f.station(8, 8, "L", true).id).toBe("st:5,-3:0");
    expect(f.inserter(0, 0, "N" as never, false, null).id).toBe("i:5,-3:0");
    expect(f.road([0, 0], [4, 0], 3).id).toBe("rd:5,-3:0");
  });
  it("rail and road take tile coords", () => {
    const f = fb();
    const r = f.rail([2, 3], [2, 9], "L");
    expect(r.a).toEqual(tileCentre(2, 3));
    expect(r.b).toEqual(tileCentre(2, 9));
    const rd = f.road([1, 1], [6, 1], 3);
    expect(rd.a).toEqual(tileCentre(1, 1));
    expect(rd.b).toEqual(tileCentre(6, 1));
    expect(rd.width).toBe(3);
  });
  it("back-fills stationId whether the inserter comes before or after the station", () => {
    const f = fb();
    const before = f.inserter(10, 10, "N" as never, false, null);
    expect(before.stationId).toBeNull();
    const st = f.station(10, 11, "L", false);
    expect(before.stationId).toBe(st.id);
    const after = f.inserter(11, 11, "N" as never, true, null);
    expect(after.stationId).toBe(st.id);
    const far = f.inserter(10 + Math.ceil(100 / T), 11, "N" as never, false, null);
    expect(far.stationId).toBeNull();
  });
});

describe("overlay live path", () => {
  it("saveRect, paint and restore work on a resident chunk", () => {
    const w = W(1);
    const { canvas } = w.chunk(dcx, dcy);
    const g = canvas.getContext("2d") as unknown as { calls: Call[] };
    const tok = w.saveRect({ x: dcx * CPX + 10, y: dcy * CPX + 12, w: 30, h: 20 });
    expect(tok).not.toBeNull();
    let args: [number, number] | null = null;
    expect(
      w.paint(tok!, (_g, ox, oy) => {
        args = [ox, oy];
      }),
    ).toBe(true);
    expect(args).toEqual([dcx * CPX, dcy * CPX]);
    const n0 = g.calls.filter((c) => c[0] === "putImageData").length;
    expect(w.restore(tok!)).toBe(true);
    expect(g.calls.filter((c) => c[0] === "putImageData").length).toBe(n0 + 1);
  });
  it("saveRect on a non-resident chunk is null", () => {
    expect(W(1).saveRect({ x: 0, y: 0, w: 5, h: 5 })).toBeNull();
  });
});

describe("eviction", () => {
  it("zeroes the evicted canvas dimensions", () => {
    const w = W(1, 2);
    const a = w.chunk(dcx, dcy).canvas;
    expect(a.width).toBe(CPX);
    expect(a.height).toBe(CPX);
    w.chunk(dcx + 1, dcy);
    w.chunk(dcx + 2, dcy);
    expect(w.isResident(dcx, dcy)).toBe(false);
    expect(a.width).toBe(0);
    expect(a.height).toBe(0);
  });
});

describe("query memo and cached features", () => {
  it("invalidates after generation changes", () => {
    const w = W(1);
    w.chunk(dcx, dcy);
    const r = { x: dcx * CPX, y: dcy * CPX, w: CPX, h: CPX };
    const q0 = w.query(r);
    expect(w.query(r)).toBe(q0);
    w.chunk(dcx + 5, dcy);
    expect(w.query(r)).not.toBe(q0);
  });
  it("joining rails does not mutate cached per-chunk features", () => {
    const w = W(1);
    const cxs = dcx % 2 ? dcx : dcx + 1;
    for (let cy = dcy - 2; cy <= dcy + 2; cy++) w.chunk(cxs, cy);
    type E = { features: { rails: unknown[]; roads: unknown[] } };
    const entries = [...(w as unknown as { chunks: Map<string, E> }).chunks.values()];
    const snap = () => JSON.stringify(entries.map((e) => [e.features.rails, e.features.roads]));
    const before = snap();
    const q = w.query({ x: cxs * CPX, y: (dcy - 2) * CPX, w: CPX, h: 5 * CPX });
    expect(q.rails.length).toBeLessThan(entries.reduce((n, e) => n + e.features.rails.length, 0));
    expect(snap()).toBe(before);
  });
});

describe("nest / outpost pairing invariant", () => {
  for (const seed of SEEDS)
    it(`every nest has exactly one valid outpost (seed ${seed.toString(16)})`, () => {
      const w = W(seed);
      const baseCache = new Map<string, DistrictKind>();
      const kb = (x: number, y: number) => {
        const k = `${x},${y}`;
        let v = baseCache.get(k);
        if (!v) baseCache.set(k, (v = baseKind(chunkBase(x, y, seed), seed)));
        return v;
      };
      const lf = (x: number, y: number) => w.landFracAt(x, y);
      let nests = 0;
      for (let cy = dcy - 25; cy <= dcy + 25; cy++)
        for (let cx = dcx - 25; cx <= dcx + 25; cx++) {
          const p = pairedOutpost(cx, cy, seed, kb, lf);
          if (w.kindAt(cx, cy) === "nest") {
            nests++;
            expect(p, `${cx},${cy}`).not.toBeNull();
            expect(Math.abs(p!.cx - cx) + Math.abs(p!.cy - cy)).toBe(1);
            expect(w.kindAt(p!.cx, p!.cy)).toBe("outpost");
            expect(lf(p!.cx, p!.cy)).toBeGreaterThanOrEqual(0.6);
          } else expect(p, `${cx},${cy}`).toBeNull();
        }
      expect(nests).toBeGreaterThan(0);
    });
});

describe("kindAt order independence", () => {
  it("fresh worlds probed in different orders agree", () => {
    const a = W(0xa85b492a),
      b = W(0xa85b492a);
    const pts: [number, number][] = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) pts.push([dcx - 10 + x, dcy - 10 + y]);
    const ka = pts.map(([x, y]) => a.kindAt(x, y));
    const kb = new Map<number, DistrictKind>();
    for (let i = pts.length - 1; i >= 0; i--) kb.set(i, b.kindAt(pts[i][0], pts[i][1]));
    expect(pts.map((_, i) => kb.get(i))).toEqual(ka);
  });
});
