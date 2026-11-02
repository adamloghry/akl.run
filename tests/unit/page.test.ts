// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fakeContext } from "../fakes/canvas";
import { Sim } from "../../src/factory/sim";

const built = existsSync("dist/index.html");

type Mapgen = {
  sim: { step(dt: number): void; draw(...a: unknown[]): unknown };
  renderNow(): void;
  setMode(m: "hub" | "factory"): void;
  state: { factory: boolean; frames: number; idle: boolean; running: boolean };
};
const w = window as unknown as { __mapgen?: Mapgen };

let pump: (n?: number) => void;
let pending: () => number;
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const key = (k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

beforeAll(async () => {
  if (!built) return;
  const parsed = new DOMParser().parseFromString(readFileSync("dist/index.html", "utf8"), "text/html");
  document.documentElement.replaceWith(parsed.documentElement);
  const g = fakeContext();
  HTMLCanvasElement.prototype.getContext = (() => g) as never;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  let cbs: FrameRequestCallback[] = [];
  let now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cbs.push(cb);
    return cbs.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  pending = () => cbs.length;
  pump = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const run = cbs;
      cbs = [];
      now += 33;
      for (const cb of run) cb(now);
    }
  };
  await import("../../src/factory/page.ts");
});

describe.skipIf(!built)("page driver", () => {
  it("unhides the readout after the first frame", () => {
    expect($("[data-readout]").hidden).toBe(true);
    pump();
    expect($("[data-readout]").hidden).toBe(false);
    expect(document.documentElement.classList.contains("ready")).toBe(true);
    expect(document.documentElement.classList.contains("js")).toBe(true);
  });
  it("m toggles factory mode and aria-pressed; ctrl+m does nothing", () => {
    const root = document.documentElement;
    key("m", { ctrlKey: true });
    expect(root.classList.contains("factory")).toBe(false);
    key("m");
    expect(root.classList.contains("factory")).toBe(true);
    expect($("[data-readout]").getAttribute("aria-pressed")).toBe("true");
    key("m");
    expect(root.classList.contains("factory")).toBe(false);
    expect($("[data-readout]").getAttribute("aria-pressed")).toBe("false");
  });
  it("minimize and restore clicks move focus", () => {
    const root = document.documentElement;
    const hub = $("#hub-window") as HTMLElement & { inert: boolean };
    $("[data-minimize]").focus();
    $("[data-minimize]").click();
    expect(root.classList.contains("factory")).toBe(true);
    expect(hub.inert).toBe(true);
    expect(document.activeElement).toBe($("[data-readout]"));
    $("[data-restore]").click();
    expect(root.classList.contains("factory")).toBe(false);
    expect(hub.inert).toBe(false);
    expect(document.activeElement).toBe($("[data-minimize]"));
  });
  it("journal holds the pin and the run-start comment", () => {
    const lines = [...document.querySelectorAll("[data-log] .log-line--comment")];
    expect(lines.length).toBe(2);
    expect(lines[0].hasAttribute("data-log-pinned")).toBe(true);
    expect(lines[1].textContent).toMatch(/^# \?seed=0x[0-9a-f]{8} · /);
    expect(document.querySelector("[data-log-static]")).toBeNull();
  });
  it("__mapgen.setMode and the frame loop work", () => {
    w.__mapgen!.setMode("factory");
    expect(w.__mapgen!.state.factory).toBe(true);
    w.__mapgen!.setMode("hub");
    expect(document.documentElement.classList.contains("factory")).toBe(false);
    pump(5);
    expect(w.__mapgen!.state.frames).toBeGreaterThan(1);
  });
  it("does not touch Intl per frame (night is cached for the 60 s block)", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    pump(120);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("idle-pauses after 120 s in hub mode only; factory mode never idles", () => {
    const real = performance.now.bind(performance);
    let skew = 0;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => real() + skew);
    w.__mapgen!.setMode("hub");
    pump(2);
    skew = 130000;
    pump(2);
    expect(w.__mapgen!.state.idle).toBe(true);
    w.__mapgen!.setMode("factory");
    expect(w.__mapgen!.state.idle).toBe(false);
    skew = 400000;
    pump(4);
    const st = w.__mapgen!.state;
    expect(st.idle).toBe(false);
    expect(st.running).toBe(true);
    w.__mapgen!.setMode("hub");
    spy.mockRestore();
    pump(2);
  });
  it("reroll does not mute the journal (the new sim's clock restarts at 0)", () => {
    pump(400); // ~13 s of sim time: the old run's lastRelease is well ahead of a fresh clock
    const events = () => [...document.querySelectorAll("[data-log] li:not(.log-line--comment)")];
    expect(events().length).toBeGreaterThan(0);
    for (const li of events()) li.setAttribute("data-old", "");
    key("r");
    pump(200); // ~6.6 s, past the first ambient delay (2.4-5 s)
    expect(events().some((li) => !li.hasAttribute("data-old"))).toBe(true);
  });
  it("every new world's first draw has an unbounded chunk budget", () => {
    pump(5);
    const spy = vi.spyOn(Sim.prototype, "draw");
    key("r");
    pump(1);
    expect(spy.mock.calls[0][4]).toBe(Infinity);
    pump(1);
    expect(spy.mock.calls[1][4]).not.toBe(Infinity);
    spy.mockRestore();
  });
  it("a throw in step logs once, stops the loop and leaves the hub usable", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = w.__mapgen!;
    const orig = m.sim.step.bind(m.sim);
    m.sim.step = () => {
      throw new Error("boom");
    };
    pump(3);
    expect(err).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(0);
    pump(5);
    expect(err).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(0);
    m.sim.step = orig;
    key("m");
    expect(document.documentElement.classList.contains("factory")).toBe(true);
    key("m");
    expect(document.documentElement.classList.contains("factory")).toBe(false);
    err.mockRestore();
  });
  it("once dead, renderNow and resize trigger no further errors", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = w.__mapgen!;
    m.sim.draw = () => {
      throw new Error("draw boom");
    };
    expect(() => m.renderNow()).not.toThrow();
    window.dispatchEvent(new Event("resize"));
    await new Promise((r) => setTimeout(r, 150));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
