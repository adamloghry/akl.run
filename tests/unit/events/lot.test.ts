import { describe, it, expect } from "vitest";
import { Lot } from "../../../src/factory/events/lot";
import { testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";
import { fakeContext } from "../../fakes/canvas";

const hub = {
  id: "h:0,0:0",
  cx: 0,
  cy: 0,
  rect: { x: 12, y: 12, w: 180, h: 156 },
  roboport: { x: 30, y: 30 },
  lot: { x: 60, y: 60, w: 72, h: 60 },
  chests: [],
  carPark: { x: 20, y: 150 },
  spiderPark: { x: 170, y: 150 },
};
const step = (m: Lot, ctx: ReturnType<typeof testCtx>) => {
  ctx.dt = 0.05;
  ctx.t += 0.05;
  m.update(ctx);
};
describe("Lot", () => {
  it("cycles ghost → build → standing → decon with exact lines; paints 14 and restores", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub" }),
      lot = new Lot(),
      ctx = testCtx(w);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      step(lot, ctx);
      seen.add(lot.state());
    }
    expect([...seen]).toEqual(expect.arrayContaining(["idle", "ghost", "build", "standing", "decon"]));
    expect(ctx.lines.slice(0, 4)).toEqual([
      "blueprint placed: 14 ghosts · 5 construction bots dispatched",
      "construction complete · assembly block A-2 online",
      "deconstruction planned: A-2 (upgrading to assembler-3)",
      "deconstruction complete · 14 entities returned to storage",
    ]);
    const builds = ctx.lines.filter((l) => l.startsWith("construction complete")).length;
    expect(w.painted).toBeGreaterThanOrEqual(14 * builds);
    expect(w.restored).toBeGreaterThanOrEqual(1);
    expect(ctx.stats.built).toBe(14 * builds);
  });
  it("resets silently when the hub chunk is evicted mid-build", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub" }),
      lot = new Lot(),
      ctx = testCtx(w);
    while (lot.state() !== "build") step(lot, ctx);
    const n = ctx.lines.length;
    w.evict(0, 0);
    for (let i = 0; i < 100; i++) step(lot, ctx);
    expect(ctx.lines.length).toBe(n);
    expect(lot.state()).toBe("idle");
  });
  it("draws in every state", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub" }),
      lot = new Lot(),
      ctx = testCtx(w),
      d = testDrawCtx();
    for (let i = 0; i < 4000; i++) {
      step(lot, ctx);
      if (i % 40 === 0) lot.draw(fakeContext(), d);
    }
  });
});
