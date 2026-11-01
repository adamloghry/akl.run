import { describe, it, expect } from "vitest";
import { Cam } from "../../src/factory/camera";
import { fakeWorld } from "../fakes/world";
import { seqRand } from "../fakes/ctx";
import { DOWNTOWN } from "../../src/factory/world/geo";
import { CH, CPX, T } from "../../src/factory/core/types";

const dcx = Math.floor(DOWNTOWN[0] / CH),
  dcy = Math.floor(DOWNTOWN[1] / CH);
describe("Cam", () => {
  it("starts downtown with desktop zoom and formats geo", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: false });
    expect(c.x).toBeCloseTo(DOWNTOWN[0] * T, 0);
    expect(c.geo()).toMatch(/^47\.\d{4}° N · 122\.\d{4}° W · 2\.4×$/);
  });
  it("prefers a POI chunk", () => {
    const w = fakeWorld({}, { [`${dcx + 2},${dcy}`]: "silo" });
    const c = new Cam(w, seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.update(0.05, 0, []);
    expect(Math.floor(c.target().x / CPX)).toBe(dcx + 2);
  });
  it("holds and pulls toward an event target with a zoom offset", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    const target = { x: c.x + 500, y: c.y };
    for (let i = 0; i < 200; i++)
      c.update(0.05, i * 0.05, [{ target, hold: true, priority: 5, zoomOffset: 0.06 }]);
    expect(Math.abs(c.x - target.x)).toBeLessThan(20);
    expect(c.zoom).toBeGreaterThan(2.4);
  });
  it("lookAt lingers", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    const p = { x: c.x - 300, y: c.y + 100 };
    c.lookAt(p);
    for (let i = 0; i < 100; i++) c.update(0.1, i * 0.1, []);
    expect(c.target()).toEqual(p);
  });
  it("pinned camera does not move", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.pinned = true;
    const x = c.x;
    for (let i = 0; i < 50; i++) c.update(0.1, i, []);
    expect(c.x).toBe(x);
  });
  it("phone base zoom is 2.0", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: true });
    expect(c.geo()).toMatch(/ · 2\.0×$/);
  });
  it("setPhone recomputes zoom and view, including while pinned", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.pinned = true;
    const x = c.x,
      y = c.y;
    c.setPhone(true);
    expect(c.zoom).toBe(2.0);
    expect(c.view.z).toBe(2.0);
    expect(c.view.x0).toBeCloseTo(x - 1440 / 4, 5);
    expect(c.x).toBe(x);
    expect(c.y).toBe(y);
    c.setPhone(false);
    expect(c.zoom).toBe(2.4);
    expect(c.view.z).toBe(2.4);
  });
  it("searches outward for a preferred kind beyond the 3-chunk scan", () => {
    // camera ends up at chunk (8,13); silo at (4,10) is 4 chunks away, a decoy is adjacent
    const w = fakeWorld({}, { "4,10": "silo", "7,12": "labs" });
    const c = new Cam(w, seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.lookAt({ x: 8.5 * CPX, y: 13.5 * CPX });
    for (let i = 0; i < 130; i++) c.update(0.1, i * 0.1, []);
    expect(Math.floor(c.x / CPX)).toBe(8);
    expect(Math.floor(c.y / CPX)).toBe(13);
    c.prefer("silo");
    for (let i = 0; i < 60; i++) c.update(0.1, 13 + i * 0.1, []);
    expect(Math.floor(c.target().x / CPX)).toBe(4);
    expect(Math.floor(c.target().y / CPX)).toBe(10);
  });
  it("falls back to the normal choice when the preferred kind is absent", () => {
    const w = fakeWorld({}, { [`${dcx + 1},${dcy}`]: "labs" });
    const c = new Cam(w, seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.prefer("silo");
    c.update(0.05, 0, []);
    expect(c.recentKinds()).toEqual(["labs"]);
  });
  it("prefer is one-shot: cleared when chosen and on reset", () => {
    const w = fakeWorld({}, { [`${dcx + 2},${dcy}`]: "silo" });
    const c = new Cam(w, seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.prefer("silo");
    expect(c.preference()).toBe("silo");
    c.update(0.05, 0, []);
    expect(c.recentKinds()).toEqual(["silo"]);
    expect(c.preference()).toBeNull();
    c.prefer("silo");
    c.reset();
    expect(c.preference()).toBeNull();
  });
  it("event target override suppresses waypoint picks while active", () => {
    const w = fakeWorld({}, { [`${dcx + 2},${dcy}`]: "silo" });
    const c = new Cam(w, seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    const target = { x: c.x + 400, y: c.y + 100 };
    for (let i = 0; i < 400; i++) {
      c.update(0.05, i * 0.05, [{ target, priority: 3 }]);
      expect(c.target()).toEqual(target);
    }
    expect(c.recentKinds()).toEqual([]);
  });
  it("avoids repeating any of the last 4 waypoint kinds", () => {
    const w = fakeWorld(
      {},
      {
        [`${dcx - 1},${dcy}`]: "mine",
        [`${dcx + 1},${dcy}`]: "smelt",
        [`${dcx - 1},${dcy + 1}`]: "asm",
        [`${dcx + 1},${dcy + 1}`]: "power",
        [`${dcx},${dcy + 1}`]: "hub",
      },
    );
    const c = new Cam(w, seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    const picks: string[] = [];
    for (let i = 0; i < 1200; i++) {
      c.update(0.5, i * 0.5, []);
      const last = c.recentKinds().at(-1);
      if (last && last !== picks.at(-1)) picks.push(last);
    }
    expect(picks.length).toBeGreaterThan(8);
    for (let i = 0; i < picks.length; i++)
      expect(new Set(picks.slice(i, i + 5)).size).toBe(picks.slice(i, i + 5).length);
  });
  it("reset returns to downtown", () => {
    const c = new Cam(fakeWorld(), seqRand(), { phone: false });
    c.setViewport(1440, 900, 1);
    c.lookAt({ x: c.x + 900, y: c.y - 400 });
    for (let i = 0; i < 100; i++) c.update(0.1, i * 0.1, []);
    expect(Math.abs(c.x - DOWNTOWN[0] * T)).toBeGreaterThan(100);
    c.reset();
    expect(c.x).toBeCloseTo(DOWNTOWN[0] * T, 5);
    expect(c.y).toBeCloseTo(DOWNTOWN[1] * T, 5);
    expect(c.target()).toEqual({ x: DOWNTOWN[0] * T, y: DOWNTOWN[1] * T });
  });
});
