import { describe, expect, it } from "vitest";
import { Drop } from "../../../src/factory/events/drop";
import { tileRect, type HubSite, type Pt, type RailSeg } from "../../../src/factory/core/types";
import { fakeContext } from "../../fakes/canvas";
import { seqRand, testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";

// Pad at px (42, 42)–(162, 126), well inside the test view (x -174..366, y -61..254).
const hub: HubSite = {
  id: "h:0,0",
  cx: 0,
  cy: 0,
  rect: tileRect(7, 7, 20, 14),
  roboport: { x: 60, y: 60 },
  lot: tileRect(60, 60, 12, 10),
  chests: [],
  carPark: { x: 100, y: 100 },
  spiderPark: { x: 120, y: 110 },
};
const LINES = ["cargo pod re-entering · tracking…", "cargo pod recovered · 1 space-science-pack"];

/** Run until the pod lands, recording the landing spot (the camera target right after touchdown). */
function runToLanding(m: Drop, ctx: ReturnType<typeof testCtx>, seconds: number): Pt | null {
  let spot: Pt | null = null;
  ctx.run((c) => {
    m.update(c);
    if (!spot && m.state() === "landed") spot = m.camHint()?.target ?? null;
  }, seconds);
  return spot;
}

describe("Drop", () => {
  it("drops a pod beside an on-screen hub on its own timer, with exact lines", () => {
    const ctx = testCtx(fakeWorld({ hubs: [hub] }, { "0,0": "hub" }));
    const m = new Drop();
    const seen = new Set<string>();
    ctx.run((c) => {
      m.update(c);
      seen.add(m.state());
    }, 150);
    expect(ctx.lines).toEqual(LINES);
    expect(ctx.stats.science).toBe(1);
    expect([...seen]).toEqual(expect.arrayContaining(["idle", "entry", "chute", "landed"]));
    expect(m.state()).toBe("idle"); // rescheduled after the pod faded out
  });

  it("is quiet before its first drop (still frames and the OG card never see one)", () => {
    const ctx = testCtx(fakeWorld({ hubs: [hub] }, { "0,0": "hub" }));
    const m = new Drop();
    ctx.run((c) => m.update(c), 60);
    expect(ctx.lines).toEqual([]);
    expect(m.state()).toBe("idle");
  });

  it("lands only on land, off the pad and clear of rails", () => {
    // water everywhere west of x = 100; a rail runs N-S just outside the pad's east edge
    const rail: RailSeg = { id: "r", a: { x: 180, y: -500 }, b: { x: 180, y: 500 }, lineId: "rail:30" };
    const w = fakeWorld({ hubs: [hub], rails: [rail] }, { "0,0": "hub" });
    w.isLandPx = (x) => x >= 100;
    for (let seed = 0; seed < 6; seed++) {
      const ctx = testCtx(w, { rand: seqRand(seed + 7) });
      const m = new Drop();
      const spot = runToLanding(m, ctx, 120);
      expect(spot).not.toBeNull();
      expect(spot!.x - 9).toBeGreaterThanOrEqual(100); // land all round
      expect(Math.abs(spot!.x - 180)).toBeGreaterThanOrEqual(10); // off the rail
      const r = hub.rect;
      const onPad = spot!.x >= r.x && spot!.x <= r.x + r.w && spot!.y >= r.y && spot!.y <= r.y + r.h;
      expect(onPad).toBe(false);
    }
  });

  it("never lands on a road, and starts low enough on screen for its re-entry to be seen", () => {
    // a 3-wide E-W road along the pad's south side
    const road = { id: "rd", a: { x: -300, y: 144 }, b: { x: 500, y: 144 }, width: 3 };
    const w = fakeWorld({ hubs: [hub], roads: [road] }, { "0,0": "hub" });
    for (let seed = 0; seed < 6; seed++) {
      const ctx = testCtx(w, { rand: seqRand(seed + 3) });
      const m = new Drop();
      const spot = runToLanding(m, ctx, 120);
      expect(spot).not.toBeNull();
      expect(Math.abs(spot!.y - 144)).toBeGreaterThanOrEqual(9 + 6);
      expect(spot!.y - 220).toBeGreaterThanOrEqual(ctx.cam.view.y0 - 40);
    }
  });

  it("waits while a higher-priority event (a raid, a launch) is steering the camera", () => {
    let busy = true;
    const rival = {
      name: "raid",
      update() {},
      draw() {},
      reset() {},
      state: () => (busy ? "fight" : "idle"),
      camHint: () => (busy ? { target: { x: 0, y: 0 }, hold: true, priority: 8 } : null),
    };
    const ctx = testCtx(fakeWorld({ hubs: [hub] }, { "0,0": "hub" }));
    const m = new Drop([rival]);
    ctx.run((c) => m.update(c), 110);
    expect(ctx.lines).toEqual([]);
    expect(m.state()).toBe("seek");
    busy = false;
    let pri = 0;
    ctx.run((c) => {
      m.update(c);
      if (m.state() === "chute") pri = m.camHint()!.priority;
    }, 30);
    expect(ctx.lines).toEqual(LINES);
    // once falling it holds the camera over a raid (8) but yields to a train arrival (8.5) and up
    expect(pri).toBeGreaterThan(8);
    expect(pri).toBeLessThan(8.5);
  });

  it("with no usable hub on screen it asks the camera for one, then gives up and reschedules", () => {
    const ctx = testCtx(fakeWorld({ hubs: [hub] }, { "0,0": "hub" }));
    ctx.world.isLandPx = () => false; // every spot is water
    const m = new Drop();
    let wanted = false;
    ctx.run((c) => {
      m.update(c);
      if (m.wants() === "hub") wanted = true;
    }, 160);
    expect(wanted).toBe(true);
    expect(ctx.lines).toEqual([]);
    expect(m.state()).toBe("idle");
  });

  it("resets silently when the hub's chunk is evicted mid-drop", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub" });
    const ctx = testCtx(w);
    const m = new Drop();
    ctx.run((c) => m.update(c), 92);
    expect(m.state()).toMatch(/^(entry|chute)$/);
    w.evict(0, 0);
    ctx.run((c) => m.update(c), 30);
    expect(ctx.lines).toEqual([LINES[0]]);
    expect(m.state()).toBe("idle");
    expect(m.camHint()).toBeNull();
  });

  it("draws in every state, day and night, and lights the re-entry", () => {
    const ctx = testCtx(fakeWorld({ hubs: [hub] }, { "0,0": "hub" }));
    const m = new Drop();
    const d = testDrawCtx();
    const lit = new Set<string>();
    ctx.run((c) => {
      m.update(c);
      d.env.night = c.t % 2 < 1 ? 0 : 1;
      d.lights.length = 0;
      m.draw(fakeContext(), d);
      for (const l of d.lights) lit.add(`${m.state()}:${l.color}`);
    }, 150);
    expect(lit.has("entry:orange")).toBe(true);
    expect(lit.has("chute:red")).toBe(true);
  });
});
