import { describe, it, expect } from "vitest";
import { Belts } from "../../../src/factory/live/belts";
import { Inserters } from "../../../src/factory/live/inserters";
import { Machines } from "../../../src/factory/live/machines";
import { Water } from "../../../src/factory/live/water";
import { Bots } from "../../../src/factory/live/bots";
import { seqRand, testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";
import { fakeContext } from "../../fakes/canvas";
import type { Features, MachineKind } from "../../../src/factory/core/types";

const belt = {
  id: "b:0,0:0",
  pts: [
    { x: 3, y: 3 },
    { x: 63, y: 3 },
  ],
  lanes: [["#b9c3cc"], ["#e09457"]] as [string[], string[]],
};
const kinds: MachineKind[] = [
  "furnace",
  "boiler",
  "engine",
  "drill",
  "assembler",
  "pumpjack",
  "chem",
  "flare",
  "lab",
  "accumulator",
  "roboport",
  "radar",
  "spawner",
  "worm",
  "lamp",
  "chest",
];
const feats = (): Partial<Features> => ({
  belts: [belt],
  inserters: [{ id: "i:0,0:0", at: { x: 9, y: 9 }, dir: 1, fast: false, beltId: belt.id, stationId: null }],
  machines: kinds.map((k, i) => ({ id: `m:0,0:${i}`, kind: k, at: { x: 20 + i * 20, y: 40 }, w: 2, h: 2 })),
  shore: Array.from({ length: 20 }, (_, i) => ({ x: i * 6 + 3, y: 120 })),
  solar: [{ id: "s:0,0:0", rect: { x: 0, y: 150, w: 54, h: 54 } }],
});

describe("live machines", () => {
  it("belt items advance unless jammed", () => {
    const b = new Belts(),
      ctx = testCtx(fakeWorld(feats()));
    ctx.run((c) => b.update(c), 1);
    const p1 = b.phase(belt.id);
    expect(p1).toBeGreaterThan(0);
    b.jam(belt.id, true);
    ctx.run((c) => b.update(c), 1);
    expect(b.phase(belt.id)).toBe(p1);
    expect(b.isJammed(belt.id)).toBe(true);
  });
  it("inserters idle when their belt is jammed", () => {
    const b = new Belts(),
      ins = new Inserters(),
      ctx = testCtx(fakeWorld(feats()));
    ctx.live = { spawn: () => {}, isJammed: (id) => b.isJammed(id), jam: (id, on) => b.jam(id, on) };
    b.jam(belt.id, true);
    ctx.run((c) => ins.update(c), 1);
    expect(ins.arm("i:0,0:0")).toBe(-1);
  });
  it("inserters swing within [-1,1] and reach both ends on a free belt", () => {
    const ins = new Inserters(),
      ctx = testCtx(fakeWorld(feats())),
      seen: number[] = [];
    ctx.run((c) => {
      ins.update(c);
      seen.push(ins.arm("i:0,0:0"));
    }, 5);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(Math.min(...seen)).toBeLessThan(-0.95);
    expect(Math.max(...seen)).toBeGreaterThan(0.95);
  });
  it("station inserters idle until a train is stopped there", () => {
    const f = feats();
    f.inserters = [{ id: "i:s", at: { x: 9, y: 9 }, dir: 1, fast: false, beltId: null, stationId: "st:1" }];
    const ins = new Inserters(),
      ctx = testCtx(fakeWorld(f)),
      arms: number[] = [];
    ctx.run((c) => {
      ins.update(c);
      arms.push(ins.arm("i:s"));
    }, 3);
    expect(arms.every((a) => a === -1)).toBe(true);
    ins.setBusyStations(new Set(["st:1"]));
    arms.length = 0;
    ctx.run((c) => {
      ins.update(c);
      arms.push(ins.arm("i:s"));
    }, 3);
    expect(Math.max(...arms)).toBeGreaterThan(0.95);
  });
  it("every system updates and draws all kinds; furnaces emit embers and lights", () => {
    // seqRand([0.01]): every chance() roll succeeds, so embers are deterministic
    const ctx = testCtx(fakeWorld(feats()), { rand: seqRand([0.01]) });
    const systems = [new Belts(), new Inserters(), new Machines(), new Water(), new Bots()];
    ctx.run((c) => systems.forEach((s) => s.update(c)), 2);
    const d = testDrawCtx();
    for (const s of systems) s.draw(fakeContext(), d, ctx.view);
    expect(ctx.spawned.some(([k]) => k === "ember")).toBe(true);
    expect(d.lights.length).toBeGreaterThan(0);
  });
  it("lights are gated off by day", () => {
    const ctx = testCtx(fakeWorld(feats())),
      m = new Machines(),
      d = testDrawCtx();
    d.env.night = 0;
    ctx.run((c) => m.update(c), 1);
    m.draw(fakeContext(), d, ctx.view);
    expect(d.lights.length).toBe(0);
  });
  // The furnace mouth is the only R() fill whose style is rgba(255,140,40,a); starved => a = 0.20.
  const furnaceFills = (jam: boolean, belts = [belt]) => {
    const f = feats();
    f.belts = belts;
    f.machines = [{ id: "m:f", kind: "furnace", at: { x: 30, y: 10 }, w: 2, h: 2 }];
    const ctx = testCtx(fakeWorld(f)),
      m = new Machines(),
      d = testDrawCtx(),
      g = fakeContext();
    if (jam) ctx.jams.set(belt.id, true);
    ctx.run((c) => m.update(c), 0.5);
    m.draw(g, d, ctx.view);
    return {
      styles: g.calls.filter((c) => c[0] === "set:fillStyle").map((c) => String(c[1])),
      lights: d.lights.length,
    };
  };
  it("furnace with a jammed belt within 18 px is dark (alpha .20, no light)", () => {
    // belt segment (3,3)-(63,3) passes 7 px from the furnace but has no vertex within 18 px of x=30
    const dark = furnaceFills(true);
    expect(dark.styles).toContain("rgba(255,140,40,0.20)");
    expect(dark.lights).toBe(0);
    const lit = furnaceFills(false);
    expect(lit.styles).not.toContain("rgba(255,140,40,0.20)");
    expect(lit.lights).toBe(1);
  });
  it("bots appear (>0) but never exceed 10 over a long run", () => {
    const ctx = testCtx(fakeWorld(feats())),
      bots = new Bots();
    let max = 0;
    ctx.run((c) => {
      c.stats.bots = 0;
      bots.update(c);
      max = Math.max(max, c.stats.bots);
      expect(c.stats.bots).toBeLessThanOrEqual(10);
    }, 60);
    expect(max).toBeGreaterThan(0);
  });
  it("exactly nine fish, all in water, even when half of each shore point is land", () => {
    const world = fakeWorld(feats());
    world.isLandPx = (_x, y) => y < 120;
    const ctx = testCtx(world),
      w = new Water();
    ctx.run((c) => w.update(c), 30);
    expect(w.fish().length).toBe(9);
    for (const f of w.fish()) expect(world.isLandPx(f.x, f.y)).toBe(false);
  });
  it("forgets state for entities unseen for more than 10 s", () => {
    const world = fakeWorld(feats()),
      ctx = testCtx(world),
      m = new Machines(),
      ins = new Inserters();
    ctx.run((c) => (m.update(c), ins.update(c)), 1);
    expect(m.tracked()).toBe(kinds.length);
    expect(ins.tracked()).toBe(1);
    world.features = { ...world.features, machines: [], inserters: [] };
    ctx.run((c) => (m.update(c), ins.update(c)), 9);
    expect(m.tracked()).toBe(kinds.length);
    ctx.run((c) => (m.update(c), ins.update(c)), 2);
    expect(m.tracked()).toBe(0);
    expect(ins.tracked()).toBe(0);
  });
});
