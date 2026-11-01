import { describe, it, expect } from "vitest";
import { Raid } from "../../../src/factory/events/raid";
import { Spider } from "../../../src/factory/events/spider";
import { Storm } from "../../../src/factory/events/storm";
import { testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";
import { fakeContext } from "../../fakes/canvas";
import { CPX } from "../../../src/factory/core/types";

function world() {
  const outpost = {
    id: "o:0,0:0",
    cx: 0,
    cy: 0,
    rect: { x: 30, y: 30, w: 126, h: 126 },
    wall: [],
    turrets: [],
    radar: { x: 90, y: 90 },
    roboport: { x: 60, y: 60 },
    facing: 0 as const,
  };
  const hub = {
    id: "h:0,1:0",
    cx: 0,
    cy: 1,
    rect: { x: 30, y: CPX + 30, w: 120, h: 120 },
    roboport: { x: 50, y: CPX + 50 },
    lot: { x: 60, y: CPX + 60, w: 72, h: 60 },
    chests: [],
    carPark: { x: 140, y: CPX + 140 },
    spiderPark: { x: 100, y: CPX + 100 },
  };
  const nest = {
    id: "n:1,0:0",
    cx: 1,
    cy: 0,
    rect: { x: CPX + 40, y: 40, w: 60, h: 60 },
    spawners: [{ x: CPX + 70, y: 70 }],
    worms: [],
    outpost: { cx: 0, cy: 0 },
  };
  return fakeWorld(
    { outposts: [outpost], hubs: [hub], nests: [nest] },
    { "0,0": "outpost", "0,1": "hub", "1,0": "nest" },
  );
}

describe("Spider", () => {
  it("patrols to the outpost and returns", () => {
    const s = new Spider(new Raid()),
      ctx = testCtx(world());
    ctx.run((c) => s.update(c), 240);
    const a = ctx.lines.findIndex((l) => /^spidertron S-1 → outpost O-\d \(ammo resupply\)$/.test(l));
    const b = ctx.lines.findIndex((l) => l === "spidertron S-1 returned to hub");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(s.position()).not.toBeNull();
  });
  it("every foot's lift returns to 0 within 0.2 s of a re-plant", () => {
    const s = new Spider(new Raid()),
      ctx = testCtx(world());
    let replants = 0,
      sinceLift = 0;
    for (let i = 0; i < 4800; i++) {
      ctx.dt = 0.05;
      ctx.t += 0.05;
      s.update(ctx);
      const lifted = s.feet().some((f) => f.lift > 0);
      if (lifted) {
        if (sinceLift === 0) replants++;
        sinceLift += 0.05;
        expect(sinceLift).toBeLessThanOrEqual(0.2 + 1e-9);
        // a fresh re-plant resets the window; lifts never exceed .18
        for (const f of s.feet()) expect(f.lift).toBeLessThanOrEqual(0.18);
      } else sinceLift = 0;
    }
    expect(replants).toBeGreaterThan(0);
    expect(s.feet().every((f) => f.lift === 0)).toBe(true);
  });
  it("resets silently when the hub chunk is evicted", () => {
    const w = world(),
      s = new Spider(new Raid()),
      ctx = testCtx(w);
    ctx.run((c) => s.update(c), 10);
    expect(s.position()).not.toBeNull();
    const n = ctx.lines.length;
    w.evict(0, 1);
    ctx.run((c) => s.update(c), 5);
    expect(ctx.lines.length).toBe(n);
    expect(s.position()).toBeNull();
    expect(s.state()).toBe("parked");
  });
  it("responds to a raid and stays until it ends", () => {
    const raid = new Raid(),
      s = new Spider(raid),
      ctx = testCtx(world());
    // A raid starts ~55 s in (before the first 70 s patrol); the spider is parked and responds.
    ctx.run((c) => {
      raid.update(c);
      s.update(c);
    }, 150);
    const i = ctx.lines.findIndex((l) => /^spidertron S-1 responding → O-\d$/.test(l));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ctx.lines.findIndex((l) => /biters inbound/.test(l))).toBeLessThan(i);
    expect(ctx.lines.some((l) => /^defense: /.test(l))).toBe(true);
    expect(ctx.lines.indexOf("spidertron S-1 returned to hub")).toBeGreaterThan(i);
  });
  it("draws in every state", () => {
    const s = new Spider(new Raid()),
      ctx = testCtx(world()),
      d = testDrawCtx();
    s.draw(fakeContext(), d);
    for (let i = 0; i < 40; i++) {
      ctx.run((c) => s.update(c), 6);
      s.draw(fakeContext(), d);
    }
  });
});

describe("Storm", () => {
  it("strikes while raining", () => {
    const st = new Storm(),
      ctx = testCtx(world());
    ctx.env.raining = true;
    let peak = 0,
      afterPeak = -1,
      sinceMax = 0;
    ctx.run((c) => {
      st.update(c);
      if (c.env.flash >= 1) {
        peak = 1;
        sinceMax = 0;
      } else if (peak) {
        sinceMax += c.dt;
        if (sinceMax >= 1 && afterPeak < 0) afterPeak = c.env.flash;
      }
    }, 300);
    expect(ctx.lines.some((l) => /^storm: lightning strike · grid at \d+%, no faults$/.test(l))).toBe(true);
    expect(peak).toBe(1);
    expect(afterPeak).toBeLessThan(0.05);
    expect(st.state()).toBe("storm");
    st.draw(fakeContext(), testDrawCtx());
  });
  it("is silent when not raining", () => {
    const st = new Storm(),
      ctx = testCtx(world());
    ctx.env.flash = 1;
    ctx.run((c) => st.update(c), 300);
    expect(ctx.lines).toEqual([]);
    expect(ctx.env.flash).toBe(0);
    expect(st.state()).toBe("clear");
    st.draw(fakeContext(), testDrawCtx());
  });
});
