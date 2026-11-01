import { describe, it, expect } from "vitest";
import { Sim } from "../../src/factory/sim";
import { fakeCanvas, fakeContext } from "../fakes/canvas";
import { seqRand } from "../fakes/ctx";

describe("Sim", () => {
  it("steps and draws a simulated minute; stats are sane", () => {
    const lines: string[] = [];
    const s = new Sim({
      seed: 0xa85b492a,
      phone: false,
      canvasFactory: fakeCanvas,
      emit: (l) => lines.push(l),
      rand: seqRand(9),
    });
    const g = fakeContext();
    s.draw(g, 1440, 900, 1, Infinity);
    for (let i = 0; i < 1200; i++) {
      s.step(0.05);
      if (i % 20 === 0) s.draw(g, 1440, 900, 1, 6);
    }
    const st = s.stats();
    expect(st.trains).toBeLessThanOrEqual(3);
    expect(st.research).toMatch(/ \d+%$/);
  });
  it("machines wanting a district take turns at the camera's preference", () => {
    const s = new Sim({
      seed: 0xa85b492a,
      phone: false,
      canvasFactory: fakeCanvas,
      emit: () => {},
      rand: seqRand(3),
    });
    for (const m of s.m.all) m.wants = () => null;
    s.m.all[0].wants = () => "silo";
    s.m.all[1].wants = () => "hub";
    const chosen: string[] = [];
    const prefer = s.cam.prefer.bind(s.cam);
    s.cam.prefer = (k) => {
      prefer(k);
      if (k && chosen[chosen.length - 1] !== k) chosen.push(k);
    };
    const g = fakeContext();
    for (let i = 0; i < 1200; i++) {
      s.step(0.05);
      if (i % 20 === 0) s.draw(g, 1440, 900, 1, Infinity);
    }
    // the first machine does not starve the second: both kinds are offered, alternately
    expect(chosen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(chosen)).toEqual(new Set(["silo", "hub"]));
  });
  it("stillFrame is deterministic under a pinned rand", () => {
    const run = () => {
      const s = new Sim({
        seed: 1,
        phone: false,
        canvasFactory: fakeCanvas,
        emit: () => {},
        rand: seqRand(5),
      });
      s.stillFrame();
      return [s.cam.x, s.cam.y, JSON.stringify(s.stats())];
    };
    expect(run()).toEqual(run());
  });
});
