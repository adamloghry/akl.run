import { describe, it, expect } from "vitest";
import { Silo } from "../../../src/factory/events/silo";
import { testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";
import { fakeContext } from "../../fakes/canvas";

const site = {
  id: "s:0,0:0",
  cx: 0,
  cy: 0,
  pad: { x: 60, y: 60, w: 72, h: 72 },
  at: { x: 96, y: 96 },
  lights: [
    { x: 72, y: 72 },
    { x: 120, y: 72 },
    { x: 72, y: 120 },
    { x: 120, y: 120 },
  ],
};
const step = (m: Silo, ctx: ReturnType<typeof testCtx>) => {
  ctx.dt = 0.05;
  ctx.t += 0.05;
  m.update(ctx);
};
const run = (m: Silo, ctx: ReturnType<typeof testCtx>, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) step(m, ctx);
};

describe("Silo", () => {
  it("runs parts → ready → launch → pod → recovered with exact lines", () => {
    const w = fakeWorld({ silos: [site] }, { "0,0": "silo" }),
      silo = new Silo(),
      ctx = testCtx(w);
    run(silo, ctx, 120);
    expect(ctx.lines).toEqual([
      "rocket silo: 100/100 parts · launch sequence started (T-10)",
      "rocket launched · payload: satellite",
      "cargo pod re-entering · tracking…",
      "cargo pod recovered · 1 space-science-pack",
    ]);
    expect(ctx.stats.rockets).toBe(1);
    expect(ctx.stats.science).toBe(1);
    expect(ctx.stats.parts).toBeLessThan(10);
  });
  it("holds at 100 parts and wants a silo when none exists", () => {
    const w = fakeWorld({}, {}),
      silo = new Silo(),
      ctx = testCtx(w);
    run(silo, ctx, 120);
    expect(ctx.lines).toEqual([]);
    expect(silo.state()).toBe("build");
    expect(ctx.stats.parts).toBe(100);
    expect(silo.wants()).toBe("silo");
  });
  it("resets silently when the silo chunk is evicted during ready", () => {
    const w = fakeWorld({ silos: [site] }, { "0,0": "silo" }),
      silo = new Silo(),
      ctx = testCtx(w);
    while (silo.state() !== "ready") step(silo, ctx);
    const n = ctx.lines.length;
    w.evict(0, 0);
    run(silo, ctx, 20);
    expect(ctx.lines.length).toBe(n);
    expect(silo.state()).toBe("build");
    expect(ctx.stats.parts).toBe(100);
  });
  it("draws in every state", () => {
    const w = fakeWorld({ silos: [site] }, { "0,0": "silo" }),
      silo = new Silo(),
      ctx = testCtx(w),
      d = testDrawCtx();
    const seen = new Set<string>();
    for (let i = 0; i < 2400; i++) {
      step(silo, ctx);
      seen.add(silo.state());
      if (i % 10 === 0) {
        silo.draw(fakeContext(), d);
        silo.camHint();
      }
    }
    expect([...seen].sort()).toEqual(["build", "gone", "landed", "launch", "pod", "ready"]);
  });
});
