// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fakeContext } from "../fakes/canvas";

const built = existsSync("dist/index.html");
let pump: () => void;

beforeAll(async () => {
  if (!built) return;
  const parsed = new DOMParser().parseFromString(readFileSync("dist/index.html", "utf8"), "text/html");
  document.documentElement.replaceWith(parsed.documentElement);
  document.documentElement.classList.add("factory"); // what boot.js does on factory.* / #factory
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
  pump = () => {
    const run = cbs;
    cbs = [];
    now += 33;
    for (const cb of run) cb(now);
  };
  await import("../../src/factory/page.ts");
});

describe.skipIf(!built)("page starting in factory mode", () => {
  it("keeps the factory class, minimises the hub and presses the readout", () => {
    pump();
    const hub = document.getElementById("hub-window") as HTMLElement & { inert: boolean };
    expect(document.documentElement.classList.contains("factory")).toBe(true);
    expect(hub.inert).toBe(true);
    expect(document.querySelector("[data-readout]")!.getAttribute("aria-pressed")).toBe("true");
    expect((document.querySelector("[data-readout]") as HTMLElement).hidden).toBe(false);
  });
});
