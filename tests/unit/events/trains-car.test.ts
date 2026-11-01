import { describe, expect, it } from "vitest";
import { Car } from "../../../src/factory/events/car";
import { Trains } from "../../../src/factory/events/trains";
import type { CamState, HubSite, RailSeg, SimCtx, Station } from "../../../src/factory/core/types";
import { fakeContext } from "../../fakes/canvas";
import { testCtx, testDrawCtx } from "../../fakes/ctx";
import { fakeWorld } from "../../fakes/world";

const cam: CamState = {
  x: 0,
  y: 0,
  zoom: 2.4,
  view: { x0: -300, y0: -187.5, w: 1440, h: 900, z: 2.4, dpr: 1 },
};

// One vertical line "v1" at x = 0 from y = -2000 to y = 2000, as 3 pieces (shuffled, one reversed).
const rails: RailSeg[] = [
  { id: "r3", a: { x: 0, y: 2000 }, b: { x: 0, y: 700 }, lineId: "v1" },
  { id: "r1", a: { x: 0, y: -2000 }, b: { x: 0, y: -700 }, lineId: "v1" },
  { id: "r2", a: { x: 0, y: -700 }, b: { x: 0, y: 700 }, lineId: "v1" },
];
const stations: Station[] = [
  { id: "s1", at: { x: 0, y: 0 }, lineId: "v1", vertical: true },
  { id: "s2", at: { x: 0, y: 600 }, lineId: "v1", vertical: true },
];
const trainWorld = () =>
  fakeWorld(
    { rails, stations },
    { "0,-2": "wild", "0,-1": "wild", "0,0": "wild", "0,1": "wild", "-1,-1": "wild", "-1,0": "wild" },
  );

const mkCam = (): CamState => ({ ...cam, view: { ...cam.view } });
const hSeg = (id: string, y: number, x0: number, x1: number): RailSeg => ({
  id,
  a: { x: x0, y },
  b: { x: x1, y },
  lineId: id,
});
const hLine = (id: string, y: number, x0: number, x1: number): RailSeg => hSeg(id, y, x0, x1);
function multiWorld(rs: RailSeg[]) {
  const kinds: Record<string, "wild"> = {};
  for (let cx = -9; cx <= 9; cx++) for (let cy = -3; cy <= 2; cy++) kinds[`${cx},${cy}`] = "wild";
  return fakeWorld({ rails: rs }, kinds);
}

describe("Trains", () => {
  it("runs trains on a merged line: arrivals, signals, busy stations, at most 3 trains", () => {
    const ctx = testCtx(trainWorld(), { cam });
    const m = new Trains();
    let busy = false;
    let maxTrains = 0;
    let running = false;
    ctx.run((c) => {
      c.stats.trains = 0;
      m.update(c);
      maxTrains = Math.max(maxTrains, c.stats.trains);
      expect(c.stats.trains).toBeLessThanOrEqual(3);
      if (m.busyStations().size > 0) busy = true;
      if (/^running:\d$/.test(m.state())) running = true;
    }, 180);
    expect(
      ctx.lines.filter((l) => /^train L-\d arrived · ST-\d ore unload$/.test(l)).length,
    ).toBeGreaterThanOrEqual(1);
    expect(ctx.lines.filter((l) => /^signal S-\d+ → (red|green)$/.test(l)).length).toBeGreaterThanOrEqual(1);
    // signal ids are position-derived (1..99), never a climbing counter
    for (const l of ctx.lines) {
      const m = /^signal S-(\d+) /.exec(l);
      if (m) (expect(Number(m[1])).toBeGreaterThanOrEqual(1), expect(Number(m[1])).toBeLessThanOrEqual(99));
    }
    expect(busy).toBe(true);
    expect(running).toBe(true);
    expect(maxTrains).toBeGreaterThanOrEqual(1);
    // nothing but the two kinds of line is ever emitted
    for (const l of ctx.lines)
      expect(l).toMatch(/^(train L-\d arrived · ST-\d ore unload|signal S-\d+ → (red|green))$/);
    expect(ctx.spawned.some(([k]) => k === "puff")).toBe(true);
  });

  it("evicting a chunk the train touched removes it silently", () => {
    const w = trainWorld();
    const ctx = testCtx(w, { cam });
    const m = new Trains();
    const step = (c: SimCtx) => {
      c.stats.trains = 0;
      m.update(c);
    };
    // run until the first arrival
    let guard = 0;
    while (!ctx.lines.some((l) => l.startsWith("train")) && guard++ < 4000) ctx.run(step, 0.05);
    expect(ctx.lines.some((l) => l.startsWith("train"))).toBe(true);
    expect(m.state()).toMatch(/^running:/);
    w.evict(0, -2);
    w.evict(0, -1);
    w.evict(0, 0);
    const before = ctx.lines.length;
    ctx.run(step, 0.05);
    expect(m.state()).toBe("idle");
    expect(ctx.stats.trains).toBe(0);
    expect(m.busyStations().size).toBe(0);
    ctx.run(step, 1);
    // signal flips may legitimately be emitted, but no train line is
    expect(ctx.lines.slice(before).filter((l) => /^train/.test(l))).toEqual([]);
  });

  it("never runs more than 3 trains, and reaches 3 with four long lines in view", () => {
    const w = multiWorld([-100, -40, 20, 80].map((y, i) => hLine(`h${i}`, y, -1500, 1500)));
    const ctx = testCtx(w, { cam: mkCam() });
    const m = new Trains();
    let max = 0;
    ctx.run((c) => {
      c.stats.trains = 0;
      m.update(c);
      max = Math.max(max, c.stats.trains);
    }, 120);
    expect(max).toBe(3);
  });

  it("never spawns a train on a line shorter than 28 tiles", () => {
    const w = multiWorld([hLine("short", 0, 200, 360)]); // 160 px < 168
    const ctx = testCtx(w, { cam: mkCam() });
    const m = new Trains();
    ctx.run((c) => m.update(c), 90);
    expect(m.state()).toBe("idle");
    expect(ctx.spawned.some(([k]) => k === "puff")).toBe(false);
  });

  it("despawns trains within ~2.5 s of being fully off view", () => {
    const w = multiWorld([hLine("h", 0, -1500, 1500)]);
    const c0 = mkCam();
    const ctx = testCtx(w, { cam: c0 });
    const m = new Trains();
    ctx.run((c) => m.update(c), 5);
    expect(m.state()).toMatch(/^running:/);
    Object.assign(c0.view, { x0: 100000, y0: 100000 });
    ctx.run((c) => m.update(c), 2.5);
    expect(m.state()).toBe("idle");
  });

  it("reverses at the end of a short-but-valid line", () => {
    const w = multiWorld([hLine("s", 0, 200, 420)]); // 220 px, enters the view at x <= 300
    const ctx = testCtx(w, { cam: mkCam() });
    const m = new Trains();
    const g = fakeContext();
    const d = testDrawCtx();
    const seen = new Set<string>();
    ctx.run((c) => {
      m.update(c);
      d.lights.length = 0;
      m.draw(g, d);
      for (const l of d.lights) if (l.cone) seen.add(Math.cos(l.cone.ang) > 0 ? "+x" : "-x");
    }, 60);
    expect([...seen].sort()).toEqual(["+x", "-x"]);
  });

  it("draws a headlight cone at night", () => {
    const ctx = testCtx(trainWorld(), { cam });
    const m = new Trains();
    ctx.run((c) => m.update(c), 5);
    const g = fakeContext();
    const d = testDrawCtx();
    d.env.night = 1;
    m.draw(g, d);
    expect(d.lights.some((l) => l.cone !== undefined)).toBe(true);
  });

  it("keeps its world direction when the line is rebuilt with reversed orientation", () => {
    const segs = [-1500, 0].map((x, i) => hSeg(`a${i}`, 0, x, x + 1500));
    const w = multiWorld([]);
    w.features = { ...w.features, rails: segs.map((r) => ({ ...r, lineId: "h" })) };
    const ctx = testCtx(w, { cam: mkCam() });
    const m = new Trains();
    const g = fakeContext();
    const d = testDrawCtx();
    const dirOf = () => {
      d.lights.length = 0;
      m.draw(g, d);
      const l = d.lights.find((x) => x.cone);
      return l ? Math.sign(Math.cos(l.cone!.ang)) : 0;
    };
    ctx.run((c) => m.update(c), 3);
    expect(m.state()).toMatch(/^running:/);
    const before = dirOf();
    expect(before).not.toBe(0);
    const rev = [...segs].reverse().map((r) => ({ ...r, a: r.b, b: r.a, lineId: "h" }));
    w.features = { ...w.features, rails: rev };
    ctx.run((c) => m.update(c), 1);
    expect(m.state()).toMatch(/^running:/);
    expect(dirOf()).toBe(before);
  });

  it("reset() clears everything; no rails means no trains", () => {
    const ctx = testCtx(trainWorld(), { cam });
    const m = new Trains();
    ctx.run((c) => m.update(c), 5);
    expect(m.state()).toMatch(/^running:/);
    m.reset();
    expect(m.state()).toBe("idle");
    expect(m.camHint()).toBeNull();

    const empty = testCtx(fakeWorld(), { cam });
    const m2 = new Trains();
    empty.run((c) => m2.update(c), 30);
    expect(m2.state()).toBe("idle");
    expect(empty.lines).toEqual([]);
  });

  // chunk column 1 carries the mainline (tile 44); its station tile centre is x = 44 * 6 + 3
  const mainStation: Station = { id: "sm", at: { x: 267, y: 96 }, lineId: "rail:44", vertical: true };

  it("after 40 s without an arrival, visits the nearest mainline hub's station for at most 45 s", () => {
    const ctx = testCtx(fakeWorld({ stations: [mainStation] }, { "1,0": "hub", "0,0": "hub" }), {
      cam: mkCam(),
    });
    const m = new Trains();
    expect(m.wants()).toBeNull();
    ctx.run((c) => m.update(c), 39);
    expect(m.camHint()).toBeNull();
    ctx.run((c) => m.update(c), 2);
    // hub 0,0 is off the mainline; 1,0 is resident, so the target is already its station
    expect(m.camHint()).toEqual({ target: mainStation.at, priority: 1 });
    ctx.run((c) => m.update(c), 45);
    expect(m.camHint()).toBeNull();
    m.reset();
    expect(m.camHint()).toBeNull();
  });

  it("skips a mainline hub without a station, and a station no train reaches within 12 s", () => {
    const bare = testCtx(fakeWorld({}, { "1,0": "hub" }), { cam: mkCam() });
    const m = new Trains();
    bare.run((c) => m.update(c), 41);
    expect(m.camHint()).toBeNull(); // looked, found no station, nothing else in range

    const onStation = { ...mkCam(), x: mainStation.at.x, y: mainStation.at.y };
    const idle = testCtx(fakeWorld({ stations: [mainStation] }, { "1,0": "hub" }), { cam: onStation });
    const t = new Trains();
    idle.run((c) => t.update(c), 41);
    expect(t.camHint()).toEqual({ target: mainStation.at, priority: 1 });
    idle.run((c) => t.update(c), 13);
    expect(t.camHint()).toBeNull(); // no rails, so no train ever served it
    idle.run((c) => t.update(c), 60);
    expect(t.camHint()).toBeNull(); // and it is not visited again
  });

  it("holds the camera (bare hold, at most 25 s at a stretch) on a visible approach", () => {
    const ctx = testCtx(trainWorld(), { cam });
    const t = new Trains();
    let held = false;
    let run = 0;
    let arrivals = 0;
    ctx.run((c) => {
      t.update(c);
      const h = t.camHint();
      if (h) {
        held = true;
        expect(h).toEqual({ hold: true, priority: 0 });
      }
      // a hold never lasts more than 25 s in one stretch
      run = h ? run + c.dt : 0;
      expect(run).toBeLessThanOrEqual(25 + 1e-6);
      arrivals = ctx.lines.filter((l) => / arrived · /.test(l)).length;
    }, 60);
    expect(held).toBe(true);
    expect(arrivals).toBeGreaterThanOrEqual(1);
  });

  it("draws in every state without throwing", () => {
    const ctx = testCtx(trainWorld(), { cam });
    const m = new Trains();
    const g = fakeContext();
    const d = testDrawCtx();
    expect(() => m.draw(g, d)).not.toThrow();
    for (let i = 0; i < 40; i++) {
      ctx.run((c) => m.update(c), 1);
      expect(() => m.draw(g, d)).not.toThrow();
    }
    m.reset();
    expect(() => m.draw(g, d)).not.toThrow();
  });
});

const hub: HubSite = {
  id: "hub:0,0",
  cx: 0,
  cy: 0,
  rect: { x: 20, y: 20, w: 120, h: 100 },
  roboport: { x: 80, y: 60 },
  lot: { x: 30, y: 30, w: 72, h: 60 },
  chests: [],
  carPark: { x: 50, y: 40 },
  spiderPark: { x: 100, y: 100 },
};

describe("Car", () => {
  it("shuttles hub <-> smelter, alternating", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub", "1,0": "smelt" });
    const ctx = testCtx(w, { cam });
    const m = new Car();
    const states = new Set<string>();
    ctx.run((c) => {
      m.update(c);
      states.add(m.state());
    }, 200);
    expect(ctx.lines.length).toBeGreaterThanOrEqual(3);
    ctx.lines.forEach((l, i) => expect(l).toBe(i % 2 === 0 ? "car C-1 → smelter" : "car C-1 → hub"));
    expect(states.has("parked")).toBe(true);
    expect(states.has("driving")).toBe(true);
    expect(ctx.spawned.some(([k]) => k === "dust")).toBe(true);
  });

  it("stays parked when there is no smelter in range", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub" });
    const ctx = testCtx(w, { cam });
    const m = new Car();
    ctx.run((c) => m.update(c), 200);
    expect(ctx.lines).toEqual([]);
    expect(m.state()).toBe("parked");
  });

  it("with no hub there are no lines and the state is none", () => {
    const ctx = testCtx(fakeWorld(), { cam });
    const m = new Car();
    ctx.run((c) => m.update(c), 200);
    expect(ctx.lines).toEqual([]);
    expect(m.state()).toBe("none");
    expect(m.wants?.()).toBe("hub");
  });

  it("evicting the hub chunk resets silently", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub", "1,0": "smelt" });
    const ctx = testCtx(w, { cam });
    const m = new Car();
    ctx.run((c) => m.update(c), 5);
    expect(m.state()).toBe("parked");
    const before = ctx.lines.length;
    w.evict(0, 0);
    ctx.run((c) => m.update(c), 0.05);
    expect(m.state()).toBe("none");
    ctx.run((c) => m.update(c), 100);
    expect(ctx.lines.length).toBe(before);
  });

  it("draws in every state without throwing", () => {
    const w = fakeWorld({ hubs: [hub] }, { "0,0": "hub", "1,0": "smelt" });
    const ctx = testCtx(w, { cam });
    const m = new Car();
    const g = fakeContext();
    const d = testDrawCtx();
    expect(() => m.draw(g, d)).not.toThrow(); // none
    for (let i = 0; i < 120; i++) {
      ctx.run((c) => m.update(c), 1);
      expect(() => m.draw(g, d)).not.toThrow(); // parked / driving
    }
    m.reset();
    expect(() => m.draw(g, d)).not.toThrow();
  });
});
