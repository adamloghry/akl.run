import { describe, it, expect } from "vitest";
import { makeRecipeCtx, World } from "../../../src/factory/world/world";
import { paintCommon, paintTerrain } from "../../../src/factory/world/terrain";
import { pairedOutpostPure } from "../../../src/factory/world/pairing";
import { RECIPES } from "../../../src/factory/world/recipes/index";
import { DOWNTOWN } from "../../../src/factory/world/geo";
import {
  CH,
  CPX,
  DIRS,
  T,
  type DistrictKind,
  type Features,
  type Rect,
} from "../../../src/factory/core/types";
import { fakeCanvas } from "../../fakes/canvas";

const SEED = 0xa85b492a;
const dcx = Math.floor(DOWNTOWN[0] / CH),
  dcy = Math.floor(DOWNTOWN[1] / CH);
const world = () => new World(SEED, { canvasFactory: fakeCanvas });

function landChunk(w: World): [number, number] {
  for (let r = 0; r < 30; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && w.landFracAt(dcx + dx, dcy + dy) >= 0.9) {
          const [x, y] = [dcx + dx, dcy + dy];
          // no nest next door, so an 'outpost' override here is the unpaired kind
          if (
            [
              [0, -1],
              [1, 0],
              [0, 1],
              [-1, 0],
            ].every(([a, b]) => w.kindAt(x + a, y + b) !== "nest")
          )
            return [x, y];
        }
  throw new Error("no land chunk");
}

function run(kind: DistrictKind, cx: number, cy: number) {
  const w = world();
  const { ctx, raster, base } = makeRecipeCtx(w, cx, cy, kind);
  paintTerrain(ctx, base);
  paintCommon(ctx, base);
  RECIPES[kind](ctx);
  return { raster, f: ctx.feat.features };
}
const inChunk = (cx: number, cy: number, r: Rect) =>
  r.x >= cx * CPX && r.y >= cy * CPX && r.x + r.w <= (cx + 1) * CPX && r.y + r.h <= (cy + 1) * CPX;
const count = (f: Features, k: string) => f.machines.filter((m) => m.kind === k).length;
const pt = (x: number, y: number): Rect => ({ x, y, w: 0, h: 0 });
const allInside = (f: Features, cx: number, cy: number) => {
  for (const m of f.machines) {
    expect(inChunk(cx, cy, pt(m.at.x, m.at.y)), `${m.kind} ${m.id}`).toBe(true);
    const hw = (m.w * T) / 2,
      hh = (m.h * T) / 2;
    expect(
      inChunk(cx, cy, { x: m.at.x - hw, y: m.at.y - hh, w: 2 * hw, h: 2 * hh }),
      `${m.kind} ${m.id} extent`,
    ).toBe(true);
  }
  for (const b of f.belts) for (const p of b.pts) expect(inChunk(cx, cy, pt(p.x, p.y))).toBe(true);
  for (const i of f.inserters) expect(inChunk(cx, cy, pt(i.at.x, i.at.y))).toBe(true);
  for (const s of f.solar) expect(inChunk(cx, cy, s.rect)).toBe(true);
  for (const s of f.silos) expect(inChunk(cx, cy, s.pad)).toBe(true);
  for (const n of f.nests) expect(inChunk(cx, cy, n.rect)).toBe(true);
  for (const o of f.outposts) {
    expect(inChunk(cx, cy, o.rect)).toBe(true);
    for (const wl of o.wall) expect(inChunk(cx, cy, wl.rect)).toBe(true);
  }
};

describe("recipes B", () => {
  const [cx, cy] = landChunk(world());
  for (const kind of ["nest", "outpost", "labs", "solar", "oil", "silo"] as const) {
    it(`${kind} is deterministic and inside its chunk`, () => {
      const a = run(kind, cx, cy),
        b = run(kind, cx, cy);
      expect(Buffer.from(a.raster.data).equals(Buffer.from(b.raster.data))).toBe(true);
      expect(JSON.stringify(a.f)).toBe(JSON.stringify(b.f));
      allInside(a.f, cx, cy);
    });
  }
  it("labs: 4 labs and a belt", () => {
    const { f } = run("labs", cx, cy);
    expect(count(f, "lab")).toBe(4);
    expect(f.belts.length).toBeGreaterThanOrEqual(1);
  });
  it("solar: field and 10 accumulators", () => {
    const { f } = run("solar", cx, cy);
    expect(f.solar.length).toBe(1);
    expect(count(f, "accumulator")).toBeGreaterThanOrEqual(10);
  });
  it("oil: pumpjacks, refinery, flare, chem plants, tanks", () => {
    const { f } = run("oil", cx, cy);
    expect(count(f, "pumpjack")).toBe(3);
    expect(count(f, "refinery")).toBe(1);
    expect(count(f, "flare")).toBe(1);
    expect(count(f, "chem")).toBe(2);
    expect(count(f, "tank")).toBe(3);
  });
  it("silo: site with pad, centre and 4 lights", () => {
    const { f } = run("silo", cx, cy);
    expect(f.silos.length).toBe(1);
    expect(f.silos[0].lights.length).toBe(4);
    expect(inChunk(cx, cy, f.silos[0].pad)).toBe(true);
  });
  it("nest: site with 2 spawners and 2 worms", () => {
    const { f } = run("nest", cx, cy);
    expect(f.nests.length).toBe(1);
    expect(f.nests[0].spawners.length).toBe(2);
    expect(f.nests[0].worms.length).toBe(2);
    expect(count(f, "spawner")).toBe(2);
    expect(count(f, "worm")).toBe(2);
  });
  it("unpaired outpost has no OutpostSite", () => {
    expect(run("outpost", cx, cy).f.outposts.length).toBe(0);
  });
  it("paired outposts face their nest with a full wall ring and 5 turrets (several seeds)", () => {
    let checked = 0,
      minWall = Infinity;
    for (const seed of [SEED, 1, 2, 3, 4, 5, 6, 7]) {
      const w = new World(seed, { canvasFactory: fakeCanvas });
      let perSeed = 0;
      for (let y = dcy - 40; y <= dcy + 40 && perSeed < 5; y++)
        for (let x = dcx - 25; x <= dcx + 25 && perSeed < 5; x++) {
          if (w.kindAt(x, y) !== "nest") continue;
          const p = pairedOutpostPure(x, y, seed)!;
          const { features: f } = w.paintRaster(p.cx, p.cy);
          expect(f.outposts.length).toBe(1);
          const o = f.outposts[0];
          minWall = Math.min(minWall, o.wall.length);
          expect(o.wall.length, `seed ${seed} nest ${x},${y}`).toBeGreaterThanOrEqual(20);
          expect(o.turrets.length).toBe(5);
          expect(inChunk(p.cx, p.cy, o.rect)).toBe(true);
          const d = DIRS[o.facing];
          // an outpost shared by two nests faces whichever pairs with it first; it must be a paired nest
          const [fx, fy] = [p.cx + d[0], p.cy + d[1]];
          expect(w.kindAt(fx, fy)).toBe("nest");
          expect(pairedOutpostPure(fx, fy, seed)).toEqual(p);
          perSeed++;
          checked++;
        }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
    expect(minWall).toBeGreaterThanOrEqual(20);
  });
});
