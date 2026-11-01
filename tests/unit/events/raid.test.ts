import { describe, it, expect } from "vitest";
import { Raid } from "../../../src/factory/events/raid";
import { testCtx, testDrawCtx, seqRand } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";
import { fakeContext } from "../../fakes/canvas";
import { CPX } from "../../../src/factory/core/types";

function world() {
  const nest = {
    id: "n:1,0:0",
    cx: 1,
    cy: 0,
    rect: { x: CPX + 40, y: 40, w: 60, h: 60 },
    spawners: [{ x: CPX + 70, y: 70 }],
    worms: [],
    outpost: { cx: 0, cy: 0 },
  };
  const wall = Array.from({ length: 8 }, (_, i) => ({
    id: `w:0,0:${i}`,
    rect: { x: 150, y: 40 + i * 12, w: 6, h: 12 },
  }));
  const outpost = {
    id: "o:0,0:0",
    cx: 0,
    cy: 0,
    rect: { x: 30, y: 30, w: 126, h: 126 },
    wall,
    turrets: [
      { x: 140, y: 60 },
      { x: 140, y: 120 },
    ],
    radar: { x: 90, y: 90 },
    roboport: { x: 60, y: 60 },
    facing: 0 as const,
  };
  return fakeWorld({ nests: [nest], outposts: [outpost] }, { "0,0": "outpost", "1,0": "nest" });
}
const step = (r: Raid, ctx: ReturnType<typeof testCtx>, n: number) => {
  for (let i = 0; i < n; i++) {
    ctx.dt = 0.05;
    ctx.t += 0.05;
    ctx.stats.threats = 0;
    r.update(ctx);
  }
};
describe("Raid", () => {
  it("full cycle emits the exact sequence", () => {
    const r = new Raid(),
      ctx = testCtx(world(), { rand: seqRand(3) });
    step(r, ctx, 4000);
    const i0 = ctx.lines.findIndex((l) =>
      /^pollution cloud reached nest N-\d · \d+ biters inbound → outpost O-\d$/.test(l),
    );
    expect(i0).toBeGreaterThanOrEqual(0);
    const rest = ctx.lines.slice(i0);
    expect(rest.some((l) => /^turret T-\d engaging · \d+ hostiles in range$/.test(l))).toBe(true);
    expect(rest.some((l) => /^defense: \d+\/\d+ biters repelled · wall segments damaged: \d+$/.test(l))).toBe(
      true,
    );
    expect(ctx.stats.repelled).toBeGreaterThan(0);
    const def = rest.findIndex((l) => l.startsWith("defense: "));
    const d = Number(rest[def].match(/damaged: (\d+)$/)![1]);
    if (d > 0) expect(rest[def + 1]).toBe(`construction bots repairing wall (${d})`);
    else expect(rest[def + 1]).not.toMatch(/^construction bots/);
  });
  it("spawn count follows 8 + min(10, floor(5*pollution)), 8..18", () => {
    const r = new Raid(),
      ctx = testCtx(world(), { rand: seqRand(3) });
    step(r, ctx, 4000);
    const m = ctx.lines.map((l) => l.match(/ · (\d+) biters inbound/)).find((x) => x)!;
    const n = Number(m[1]);
    expect(n).toBeGreaterThanOrEqual(13); // launches at pollution >= 1 => 8 + floor(5)
    expect(n).toBeLessThanOrEqual(18);
  });
  it("resets silently when the outpost chunk is evicted mid-raid", () => {
    const w = world(),
      r = new Raid(),
      ctx = testCtx(w);
    while (r.state() !== "fight" && r.state() !== "inbound") step(r, ctx, 20);
    const n = ctx.lines.length;
    w.evict(0, 0);
    step(r, ctx, 100);
    expect(ctx.lines.length).toBe(n);
    expect(["calm", "cooldown"]).toContain(r.state());
  });
  it("draws in every state and never exceeds 24 biters", () => {
    const r = new Raid(),
      ctx = testCtx(world()),
      d = testDrawCtx();
    for (let i = 0; i < 4000; i++) {
      step(r, ctx, 1);
      expect(ctx.stats.threats).toBeLessThanOrEqual(24);
      if (i % 50 === 0) r.draw(fakeContext(), d);
    }
  });
});

describe("Raid idle biters", () => {
  const nestOf = (id: string, cx: number, spawners: number) => ({
    id,
    cx,
    cy: 0,
    rect: { x: cx * CPX + 40, y: 40, w: 60, h: 60 },
    spawners: Array.from({ length: spawners }, (_, i) => ({ x: cx * CPX + 60 + i * 10, y: 70 })),
    worms: [],
    outpost: { cx: 0, cy: 0 },
  });
  it("keeps at most 4 per visible nest, never as threats, pruned when the nest leaves view", () => {
    const w = fakeWorld({ nests: [nestOf("a", 1, 5), nestOf("b", 3, 1)] }, { "1,0": "nest", "3,0": "nest" });
    const ctx = testCtx(w, { rand: seqRand(5) });
    const r = new Raid();
    for (let i = 0; i < 400; i++) {
      ctx.dt = 0.05;
      ctx.t += 0.05;
      ctx.stats.threats = 0;
      r.update(ctx);
      expect(ctx.stats.threats).toBe(0);
    }
    const c = r.idleCounts();
    expect(c.a).toBe(4);
    expect(c.b).toBeGreaterThan(0);
    expect(c.b).toBeLessThanOrEqual(4);
    ctx.view = { ...ctx.view, nests: [ctx.view.nests[0]] };
    r.update(ctx);
    expect(Object.keys(r.idleCounts())).toEqual(["a"]);
    const g = fakeContext();
    r.draw(g, testDrawCtx());
    expect(g.calls.length).toBeGreaterThan(0);
  });
});
