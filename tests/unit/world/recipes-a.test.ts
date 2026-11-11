import { describe, it, expect } from "vitest";
import { World, makeRecipeCtx } from "../../../src/factory/world/world";
import { paintCommon, paintTerrain } from "../../../src/factory/world/terrain";
import { RECIPES } from "../../../src/factory/world/recipes/index";
import { DOWNTOWN } from "../../../src/factory/world/geo";
import { CH, CPX, type DistrictKind, type Features } from "../../../src/factory/core/types";
import { fakeCanvas } from "../../fakes/canvas";

const SEED = 0xa85b492a;
const dcx = Math.floor(DOWNTOWN[0] / CH),
  dcy = Math.floor(DOWNTOWN[1] / CH);
const world = new World(SEED, { canvasFactory: fakeCanvas });

/** Chunks searched outward (rings) from downtown that satisfy `ok`. */
function chunks(ok: (cx: number, cy: number) => boolean, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < 40 && out.length < n; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = dcx + dx,
          cy = dcy + dy;
        if (out.length < n && ok(cx, cy)) out.push([cx, cy]);
      }
  return out;
}
const landy = (cx: number, cy: number) => world.landFracAt(cx, cy) >= 0.9;

function run(kind: DistrictKind, cx: number, cy: number) {
  const { ctx, raster, base } = makeRecipeCtx(world, cx, cy, kind);
  paintTerrain(ctx, base);
  paintCommon(ctx);
  RECIPES[kind](ctx);
  return { f: ctx.feat.features, data: raster.data };
}
const count = (f: Features, kind: string) => f.machines.filter((m) => m.kind === kind).length;
const inside = (f: Features, cx: number, cy: number) => {
  const x0 = cx * CPX,
    y0 = cy * CPX;
  const ok = (p: { x: number; y: number }) => p.x >= x0 && p.x < x0 + CPX && p.y >= y0 && p.y < y0 + CPX;
  return (
    f.machines.every((m) => ok(m.at)) &&
    f.belts.every((b) => b.pts.every(ok)) &&
    f.inserters.every((i) => ok(i.at)) &&
    f.stations.every((s) => ok(s.at)) &&
    f.hubs.every((h) => ok(h.roboport) && h.chests.every(ok))
  );
};
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => Buffer.from(a).equals(Buffer.from(b));

const specs: [DistrictKind, (cx: number, cy: number) => boolean, (f: Features) => void][] = [
  [
    "mine",
    (cx, cy) => landy(cx, cy) && world.baseOf(cx, cy).oreCount > 60,
    (f) => {
      expect(count(f, "drill")).toBeGreaterThanOrEqual(4);
      expect(f.belts.length).toBeGreaterThanOrEqual(1);
    },
  ],
  [
    "smelt",
    landy,
    (f) => {
      expect(count(f, "furnace")).toBeGreaterThanOrEqual(6);
      expect(f.belts.length).toBeGreaterThanOrEqual(2);
      expect(f.inserters.length).toBeGreaterThanOrEqual(6);
    },
  ],
  [
    "asm",
    landy,
    (f) => {
      expect(count(f, "assembler")).toBeGreaterThanOrEqual(4);
      expect(f.belts.length).toBeGreaterThanOrEqual(2);
      expect(f.inserters.length).toBeGreaterThanOrEqual(4);
    },
  ],
  [
    "power",
    landy,
    (f) => {
      expect(count(f, "boiler")).toBeGreaterThanOrEqual(1);
      expect(count(f, "engine")).toBeGreaterThanOrEqual(2);
    },
  ],
  [
    "hub",
    landy,
    (f) => {
      expect(f.hubs).toHaveLength(1);
      const h = f.hubs[0];
      expect(h.lot.x).toBeGreaterThanOrEqual(h.rect.x);
      expect(h.lot.y).toBeGreaterThanOrEqual(h.rect.y);
      expect(h.lot.x + h.lot.w).toBeLessThanOrEqual(h.rect.x + h.rect.w);
      expect(h.lot.y + h.lot.h).toBeLessThanOrEqual(h.rect.y + h.rect.h);
      expect(count(f, "roboport")).toBe(1);
      expect(count(f, "chest")).toBeGreaterThanOrEqual(28);
    },
  ],
  [
    "storage",
    landy,
    (f) => {
      expect(count(f, "chest")).toBeGreaterThanOrEqual(32);
    },
  ],
];

describe("recipes A", () => {
  for (const [kind, pick, check] of specs) {
    describe(kind, () => {
      const cs = chunks(pick, 4);
      it("finds test chunks", () => expect(cs.length).toBe(4));
      for (const [cx, cy] of cs) {
        it(`required features and containment in chunk ${cx},${cy}`, () => {
          const { f } = run(kind, cx, cy);
          check(f);
          expect(inside(f, cx, cy)).toBe(true);
          if (kind === "hub") {
            // the platform needs the mainline column inside the pad and a free 2x6 strip beside it; any
            // chunk whose pad holds the mainline on this land-heavy terrain must register a station
            const h = f.hubs[0],
              rail = f.rails[0];
            const crosses = rail && rail.a.x >= h.rect.x + 2 * 6 && rail.a.x < h.rect.x + h.rect.w;
            if (crosses) expect(f.stations.length).toBeGreaterThanOrEqual(1);
          }
        });
        it(`is deterministic in chunk ${cx},${cy}`, () => {
          const a = run(kind, cx, cy),
            b = run(kind, cx, cy);
          expect(same(a.data, b.data)).toBe(true);
          expect(JSON.stringify(a.f)).toBe(JSON.stringify(b.f));
        });
      }
      it("copes with partly-water chunks", () => {
        for (const [cx, cy] of chunks(
          (x, y) => world.landFracAt(x, y) >= 0.6 && world.landFracAt(x, y) < 0.85,
          6,
        )) {
          const { f } = run(kind, cx, cy);
          expect(inside(f, cx, cy)).toBe(true);
        }
      });
    });
  }
  it("hub registers a station when the rail mainline crosses the chunk", () => {
    const odd = chunks((cx, cy) => landy(cx, cy) && Math.abs(cx) % 2 === 1, 4);
    let stations = 0;
    for (const [cx, cy] of odd) stations += run("hub", cx, cy).f.stations.length;
    expect(stations).toBeGreaterThan(0);
  });
  it("every real hub chunk yields exactly one HubSite with its lot inside the chunk", () => {
    let checked = 0;
    for (const seed of [SEED, 1, 2, 0xdeadbeef, 0x1234567]) {
      const w = new World(seed, { canvasFactory: fakeCanvas });
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++) {
          const cx = dcx + dx,
            cy = dcy + dy;
          if (w.kindAt(cx, cy) !== "hub") continue;
          checked++;
          const { features } = w.paintRaster(cx, cy);
          expect(features.hubs).toHaveLength(1);
          const l = features.hubs[0].lot;
          expect(l.x).toBeGreaterThanOrEqual(cx * CPX);
          expect(l.y).toBeGreaterThanOrEqual(cy * CPX);
          expect(l.x + l.w).toBeLessThanOrEqual((cx + 1) * CPX);
          expect(l.y + l.h).toBeLessThanOrEqual((cy + 1) * CPX);
        }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });
  it("power places an offshore pump on a coastal chunk", () => {
    let pumps = 0;
    for (const [cx, cy] of chunks(
      (x, y) => world.landFracAt(x, y) >= 0.6 && world.landFracAt(x, y) < 0.85,
      30,
    ))
      pumps += count(run("power", cx, cy).f, "offshore");
    expect(pumps).toBeGreaterThan(0);
  });
});
