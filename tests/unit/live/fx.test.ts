import { describe, it, expect } from "vitest";
import { Particles, CAPS } from "../../../src/factory/live/particles";
import { Lights } from "../../../src/factory/live/lights";
import { Rain } from "../../../src/factory/live/rain";
import { testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeContext } from "../../fakes/canvas";
import { emptyFeatures } from "../../../src/factory/core/types";

describe("Particles", () => {
  it("respects caps and expires", () => {
    const p = new Particles(),
      ctx = testCtx();
    for (let i = 0; i < 1000; i++) p.spawn("ember", 0, 0, { life: 0.5 });
    expect(p.count("ember")).toBe(CAPS.ember);
    for (let i = 0; i < 20; i++) {
      ctx.dt = 0.05;
      p.update(ctx);
    }
    expect(p.count("ember")).toBe(0);
  });
  it("smoke/steam/puff/dust share one 400 pool", () => {
    const p = new Particles();
    for (let i = 0; i < 300; i++) p.spawn("smoke", 0, 0);
    for (let i = 0; i < 300; i++) p.spawn("steam", 0, 0);
    expect(p.count()).toBe(400);
  });
  it("enforces spark 40, ripple 20, tracer 40 caps", () => {
    const p = new Particles();
    for (const [k, cap] of [
      ["spark", 40],
      ["ripple", 20],
      ["tracer", 40],
    ] as const) {
      for (let i = 0; i < 1000; i++) p.spawn(k, 0, 0);
      expect(p.count(k)).toBe(cap);
    }
  });
  it("draws every kind without throwing", () => {
    const p = new Particles(),
      ctx = testCtx();
    for (const k of [
      "smoke",
      "steam",
      "ember",
      "dust",
      "splat",
      "corpse",
      "tracer",
      "ripple",
      "puff",
      "spark",
    ] as const)
      p.spawn(k, 10, 10, { x2: 20, y2: 20 });
    p.update(ctx);
    p.draw(fakeContext(), testDrawCtx(), emptyFeatures());
    p.reset();
    expect(p.count()).toBe(0);
  });
});
describe("Lights", () => {
  it("draws lamps at night, nothing by day", () => {
    const L = new Lights(),
      d = testDrawCtx();
    const f = emptyFeatures();
    f.machines.push({ id: "l:0,0:0", kind: "lamp", at: { x: 10, y: 10 }, w: 1, h: 1 });
    const g = fakeContext();
    L.draw(g, d, f, []);
    expect(g.calls.filter((c) => c[0] === "drawImage").length).toBeGreaterThan(0);
    d.env.night = 0;
    const g2 = fakeContext();
    L.draw(g2, d, f, []);
    expect(g2.calls.filter((c) => c[0] === "drawImage").length).toBe(0);
  });
  it("shows white/orange queued flashes by day only", () => {
    const L = new Lights(),
      d = testDrawCtx();
    d.env.night = 0;
    const g = fakeContext();
    L.draw(g, d, emptyFeatures(), [
      { x: 5, y: 5, r: 10, color: "white", a: 1 },
      { x: 5, y: 5, r: 10, color: "warm", a: 1 },
    ]);
    expect(g.calls.filter((c) => c[0] === "drawImage").length).toBe(1);
  });
});
const lampFeatures = () => {
  const f = emptyFeatures();
  f.machines.push({ id: "l:0,0:0", kind: "lamp", at: { x: 10, y: 10 }, w: 1, h: 1 });
  return f;
};
const idxOf = (calls: Array<unknown[]>, name: string, from = 0) =>
  calls.findIndex((c, i) => i >= from && c[0] === name);
describe("Lights numerics", () => {
  it("lamp ramp: none at night .25, present at .6", () => {
    const L = new Lights(),
      d = testDrawCtx();
    d.env.night = 0.25;
    const g = fakeContext();
    L.draw(g, d, lampFeatures(), []);
    expect(g.calls.filter((c) => c[0] === "drawImage").length).toBe(0);
    d.env.night = 0.6;
    const g2 = fakeContext();
    L.draw(g2, d, lampFeatures(), []);
    expect(g2.calls.filter((c) => c[0] === "drawImage").length).toBe(1);
  });
  it("lamp alpha is k*sat", () => {
    const L = new Lights(),
      d = testDrawCtx();
    d.env.night = 1;
    d.env.sat = 0.5;
    const g = fakeContext();
    L.draw(g, d, lampFeatures(), []);
    const i = idxOf(g.calls, "drawImage");
    expect(i).toBeGreaterThan(0);
    expect(g.calls[i - 1]).toEqual(["set:globalAlpha", 0.5]);
  });
  it("night overlay alpha is .5*night", () => {
    const L = new Lights(),
      d = testDrawCtx();
    d.env.night = 0.8;
    const g = fakeContext();
    L.draw(g, d, emptyFeatures(), []);
    const i = idxOf(g.calls, "fillRect");
    expect(g.calls[i - 1]).toEqual(["set:fillStyle", "rgba(8,14,38,0.4)"]);
  });
  it("culls cone lights by max(r, cone.len)", () => {
    const L = new Lights(),
      d = testDrawCtx(),
      margins: number[] = [];
    d.inView = (_x, _y, m) => (margins.push(m ?? 0), true);
    d.env.night = 1;
    L.draw(fakeContext(), d, emptyFeatures(), [
      { x: 0, y: 0, r: 10, color: "white", a: 1, cone: { ang: 0, spread: 0.3, len: 200 } },
    ]);
    expect(Math.max(...margins)).toBeGreaterThanOrEqual(200);
  });
});
const rgba = (v: unknown): number[] => /rgba\(([^)]+)\)/.exec(String(v))![1].split(",").map(Number);
describe("Rain numerics", () => {
  const firstFill = (night: number, raining: boolean, flash = 0) => {
    const d = testDrawCtx();
    d.env.night = night;
    d.env.raining = raining;
    d.env.flash = flash;
    const g = fakeContext();
    new Rain().draw(g, d, emptyFeatures());
    return g.calls;
  };
  it("day tint is rgba(30,40,60,.12)", () => {
    const c = firstFill(0, true),
      i = idxOf(c, "fillRect");
    expect(rgba(c[i - 1][1])).toEqual([30, 40, 60, 0.12]);
  });
  it("night tint is rgba(20,40,70,.18)", () => {
    const c = firstFill(1, true),
      i = idxOf(c, "fillRect");
    expect(rgba(c[i - 1][1])).toEqual([20, 40, 70, 0.18]);
  });
  it("tint lerps smoothly at night .35 (no pop)", () => {
    const c = firstFill(0.35, true),
      i = idxOf(c, "fillRect"),
      m = rgba(c[i - 1][1]);
    expect(m[0]).toBeCloseTo(25, 5);
    expect(m[1]).toBeCloseTo(40, 5);
    expect(m[2]).toBeCloseTo(65, 5);
    expect(m[3]).toBeCloseTo(0.15, 5);
  });
  it("flash is full-frame white, capped at alpha .55", () => {
    const c = firstFill(0, false, 0.7),
      i = idxOf(c, "fillRect");
    expect(c[i][3]).toBe(1440);
    expect(c[i - 1]).toEqual(["set:fillStyle", "#fff"]);
    expect(c[i - 2]).toEqual(["set:globalAlpha", 0.55]);
  });
});
describe("Rain", () => {
  it("draws only when raining or flashing", () => {
    const r = new Rain(),
      ctx = testCtx(),
      d = testDrawCtx();
    d.env.raining = false;
    d.env.flash = 0;
    const g = fakeContext();
    r.update(ctx);
    r.draw(g, d, emptyFeatures());
    expect(g.calls.filter((c) => c[0] === "fillRect").length).toBe(0);
    d.env.raining = true;
    ctx.env.raining = true;
    const g2 = fakeContext();
    r.update(ctx);
    r.draw(g2, d, emptyFeatures());
    expect(g2.calls.length).toBeGreaterThan(0);
    d.env.raining = false;
    d.env.flash = 0.5;
    const g3 = fakeContext();
    r.draw(g3, d, emptyFeatures());
    expect(g3.calls.filter((c) => c[0] === "fillRect").length).toBe(1);
  });
});
