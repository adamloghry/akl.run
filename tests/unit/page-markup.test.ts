// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const built = existsSync("dist/index.html");
let doc: Document;
beforeAll(() => {
  if (built) doc = new DOMParser().parseFromString(readFileSync("dist/index.html", "utf8"), "text/html");
});
describe.skipIf(!built)("index.html contract", () => {
  it("has the hooks", () => {
    for (const s of [
      "#map",
      "main#windows",
      "#hub-window[data-windows]",
      "[data-minimize]",
      "[data-restore]",
      "[data-readout][hidden]",
      "[data-readout-text]",
      "[data-log]",
      "[data-log-pinned]",
      "[data-log-static]",
      "[data-prod]",
    ])
      expect(doc.querySelector(s), s).not.toBeNull();
    for (const k of ["power", "trains", "bots", "threats", "rockets", "research"])
      expect(doc.querySelector(`[data-prod] [data-stat=${k}]`), k).not.toBeNull();
  });
  it("lists the four live projects in order with the spec's link order", () => {
    const names = [...doc.querySelectorAll(".project-name")].map((e) => e.textContent);
    expect(names).toEqual(["factory", "16384.dev", "rfc.akl.run", "enchilada.dev"]);
    const links = [...doc.querySelectorAll("#hub-window a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "https://akl.dev/",
      "#factory",
      "https://factorio.com/",
      "https://16384.dev/",
      "https://rfc.akl.run/",
      "https://enchilada.dev/",
    ]);
  });
  it("readout controls the hub", () => {
    expect(doc.querySelector("[data-readout]")!.getAttribute("aria-controls")).toBe("hub-window");
  });
  it("head metadata", () => {
    expect(doc.title).toBe("akl.run");
    expect(doc.querySelector("link[rel=canonical]")!.getAttribute("href")).toBe("https://akl.run/");
    expect(doc.querySelector('meta[property="og:image"]')!.getAttribute("content")).toBe(
      "https://akl.run/images/og.png",
    );
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld.url).toBe("https://akl.dev/");
    expect(ld.mainEntityOfPage).toBe("https://akl.run/");
    expect(doc.querySelectorAll("link[rel=preload][as=font]").length).toBe(4);
  });
  it("no inline style or script", () => {
    expect(doc.querySelector("style")).toBeNull();
    expect(doc.querySelector("[style]")).toBeNull();
    for (const s of doc.querySelectorAll("script:not([src])"))
      expect(s.getAttribute("type")).toBe("application/ld+json");
  });
});
