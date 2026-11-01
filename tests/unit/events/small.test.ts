import { describe, it, expect } from "vitest";
import { Jams } from "../../../src/factory/events/jams";
import { Power } from "../../../src/factory/events/power";
import { Radar } from "../../../src/factory/events/radar";
import { Research } from "../../../src/factory/events/research";
import { Look } from "../../../src/factory/events/look";
import { testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";
import { fakeContext } from "../../fakes/canvas";

describe("Jams", () => {
  it("jams then clears a visible belt with exact lines", () => {
    const belt = {
      id: "b:0,0:0",
      pts: [
        { x: 3, y: 3 },
        { x: 63, y: 3 },
      ],
      lanes: [["#fff"], ["#fff"]] as [string[], string[]],
    };
    const ins = [0, 1, 2].map((i) => ({
      id: `i:0,0:${i}`,
      at: { x: 9 + i * 6, y: 9 },
      dir: 3 as const,
      fast: false,
      beltId: belt.id,
      stationId: null,
    }));
    const ctx = testCtx(fakeWorld({ belts: [belt], inserters: ins })),
      m = new Jams();
    ctx.run((c) => m.update(c), 100);
    expect(ctx.lines[0]).toMatch(/^belt B-\d backed up · 3 inserters waiting$/);
    expect(ctx.lines[1]).toMatch(/^belt B-\d cleared · inserters resumed$/);
    expect(ctx.jams.get(belt.id)).toBe(false);
    m.draw(fakeContext(), testDrawCtx());
  });
  it("reset() clears a live jam on the next update", () => {
    const belt = {
      id: "b:0,0:0",
      pts: [
        { x: 3, y: 3 },
        { x: 63, y: 3 },
      ],
      lanes: [["#fff"], ["#fff"]] as [string[], string[]],
    };
    const ctx = testCtx(fakeWorld({ belts: [belt] })),
      m = new Jams();
    for (let i = 0; i < 2000 && ctx.jams.get(belt.id) !== true; i++) ctx.run((c) => m.update(c), 0.05);
    expect(ctx.jams.get(belt.id)).toBe(true);
    m.reset();
    ctx.run((c) => m.update(c), 0.05);
    expect(ctx.jams.get(belt.id)).toBe(false);
  });
});
describe("Power", () => {
  it("browns out at night when accumulators run low", () => {
    const ctx = testCtx(),
      m = new Power();
    ctx.env.night = 1;
    ctx.run((c) => m.update(c), 80);
    expect(
      ctx.lines.some((l) => /^power: accumulators \d+% · brownout · steam engines to full load$/.test(l)),
    ).toBe(true);
    expect(ctx.stats.power).toBeLessThanOrEqual(100);
  });
});
describe("Research", () => {
  it("completes and starts items every 48 s", () => {
    const ctx = testCtx(),
      m = new Research();
    ctx.run((c) => m.update(c), 100);
    expect(ctx.lines).toEqual([
      "research complete: automation-2",
      "research started: advanced-material-processing",
      "research complete: advanced-material-processing",
      "research started: railway",
    ]);
    expect(ctx.stats.research).toMatch(/^railway \d+%$/);
  });
});
describe("Radar", () => {
  it("charts every 18 s when a radar is visible", () => {
    const ctx = testCtx(
        fakeWorld({ machines: [{ id: "r:0,0:0", kind: "radar", at: { x: 50, y: 50 }, w: 3, h: 3 }] }),
      ),
      m = new Radar();
    ctx.run((c) => m.update(c), 40);
    expect(ctx.lines.filter((l) => /^radar RD-\d charted sector \(-?\d+,-?\d+\)$/.test(l)).length).toBe(2);
    m.draw(fakeContext(), testDrawCtx());
  });
});
describe("Look", () => {
  it("logs and hints for 14 s", () => {
    const ctx = testCtx(),
      m = new Look();
    m.request({ x: 120, y: 66 });
    ctx.run((c) => m.update(c), 1);
    expect(ctx.lines).toEqual(["camera → tile (20,11)"]);
    expect(m.camHint()!.target).toEqual({ x: 120, y: 66 });
    ctx.run((c) => m.update(c), 14);
    expect(m.camHint()).toBeNull();
    m.draw(fakeContext(), testDrawCtx());
  });
});
