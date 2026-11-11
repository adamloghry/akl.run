// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { Journal, AMBIENT } from "../../src/factory/journal";
import { seqRand } from "../fakes/ctx";

let ol: HTMLOListElement;
function li(cls: string, attr: string, ...kids: Array<string | Node>): HTMLLIElement {
  const el = document.createElement("li");
  el.className = cls;
  el.setAttribute(attr, "");
  el.append(...kids);
  return el;
}
beforeEach(() => {
  document.body.replaceChildren();
  ol = document.createElement("ol");
  ol.setAttribute("data-log", "");
  const a = document.createElement("a");
  a.className = "permalink";
  a.href = "https://www.youtube.com/watch?v=oF1zCD7NwNY";
  a.textContent = "watch the 2026 trailer";
  ol.append(
    li("log-line log-line--comment", "data-log-pinned", "# you should play factorio! → ", a),
    li("log-line log-line--comment", "data-log-static", "note: javascript required to run the factory"),
  );
  document.body.append(ol);
});
const events = () => [...ol.querySelectorAll("li:not(.log-line--comment)")].map((l) => l.textContent!);
const msg = (s: string) => s.split("  ")[1];

describe("Journal", () => {
  it("run-start replaces the static note and keeps the pin first", () => {
    const j = new Journal(ol, { ring: 6 });
    j.runStart("0x00c0ffee", "?seed=0x00c0ffee");
    expect(ol.querySelector("[data-log-static]")).toBeNull();
    expect(ol.children[0].hasAttribute("data-log-pinned")).toBe(true);
    expect(ol.children[1].textContent).toBe(
      "# ?seed=0x00c0ffee · r to reroll · m for project list · s to superminimize this window",
    );
    expect(ol.children[1].querySelector("a.permalink")!.getAttribute("href")).toBe("?seed=0x00c0ffee");
    j.runStart("0x1", "?seed=0x1");
    expect(ol.querySelectorAll(".log-line--comment").length).toBe(2);
  });
  it("releases at most one line per 0.9 s and stamps it", () => {
    const j = new Journal(ol, { ring: 6 });
    j.runStart("0x1", "?seed=0x1");
    j.emit("a");
    j.emit("b");
    j.emit("c");
    const r = seqRand();
    j.tick(0, () => "12:00:00", false, r);
    j.tick(0.5, () => "12:00:00", false, r);
    expect(events()).toEqual(["12:00:00  a"]);
    j.tick(0.95, () => "12:00:01", false, r);
    expect(events().length).toBe(2);
    expect(ol.querySelector("li:not(.log-line--comment) .stamp")!.textContent).toBe("12:00:00");
  });
  it("keeps a ring of N event lines after the two comments", () => {
    const j = new Journal(ol, { ring: 4 });
    j.runStart("0x1", "?seed=0x1");
    for (let i = 0; i < 10; i++) j.emit("e" + i);
    for (let i = 0; i < 10; i++) j.tick(i, () => "s", false, seqRand());
    expect(events().map(msg)).toEqual(["e6", "e7", "e8", "e9"]);
    expect(ol.querySelectorAll(".log-line--comment").length).toBe(2);
  });
  it("ambient only when allowed and the queue is empty; never the same twice running", () => {
    const j = new Journal(ol, { ring: 6 });
    j.runStart("0x1", "?seed=0x1");
    const r = seqRand(7);
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 0.1;
      j.tick(t, () => "s", true, r);
    }
    const lines = events().map(msg);
    expect(lines.length).toBeGreaterThan(0);
    for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    for (const l of lines) expect(AMBIENT).toContain(l);
  });
  it("no ambient when not allowed", () => {
    const j = new Journal(ol, { ring: 6 });
    j.runStart("0x1", "?seed=0x1");
    for (let i = 0; i < 100; i++) j.tick(i, () => "s", false, seqRand());
    expect(events()).toEqual([]);
  });
  it("never parses message text as HTML", () => {
    const j = new Journal(ol, { ring: 6 });
    j.runStart("0x1", "?seed=0x1");
    j.emit("<b>x</b>");
    j.tick(0, () => "s", false, seqRand());
    expect(ol.querySelector("b")).toBeNull();
    expect(events()[0]).toContain("<b>x</b>");
  });
  it("does not evict a focused line", () => {
    const j = new Journal(ol, { ring: 1 });
    j.runStart("0x1", "?seed=0x1");
    j.emit("a");
    j.tick(0, () => "s", false, seqRand());
    const first = ol.querySelector("li:not(.log-line--comment)") as HTMLElement;
    first.tabIndex = -1;
    first.focus();
    j.emit("b");
    j.tick(1, () => "s", false, seqRand());
    expect(ol.contains(first)).toBe(true);
  });
  it("recent() keeps the last 20 and works without a DOM", () => {
    const j = new Journal(null, { ring: 6 });
    for (let i = 0; i < 30; i++) {
      j.emit("x" + i);
      j.tick(i, () => "s", false, seqRand());
    }
    expect(j.recent().length).toBe(20);
    expect(j.recent()[19]).toBe("x29");
  });
  it("reset clears the old run's timers and queue so a fresh clock is not muted", () => {
    const j = new Journal(ol, { ring: 6 });
    const r = seqRand(7);
    j.runStart("0x00000001", "?seed=0x00000001");
    j.emit("old-1");
    j.emit("old-2");
    for (let t = 0; t <= 200; t += 1) j.tick(t, () => "00:00:00", true, r);
    j.emit("stale"); // still queued when the run is replaced
    j.runStart("0x00000002", "?seed=0x00000002");
    j.reset();
    j.emit("fresh");
    j.tick(1, () => "00:00:01", true, r);
    expect(events().map(msg)).toContain("fresh");
    expect(events().map(msg)).not.toContain("stale");
  });
  it("reset removes the previous run's ring lines and recent buffer, keeps comments", () => {
    const j = new Journal(ol, { ring: 6 });
    const r = seqRand(3);
    j.runStart("0x00000001", "?seed=0x00000001");
    j.emit("old-1");
    for (let t = 0; t <= 20; t += 1) j.tick(t, () => "00:00:00", true, r);
    expect(events().length).toBeGreaterThan(0);
    j.reset();
    expect(events().length).toBe(0);
    expect(j.recent().length).toBe(0);
    expect(ol.querySelectorAll(".log-line--comment").length).toBeGreaterThan(0);
  });
  it("ambient pick terminates on a constant Rand and never repeats consecutively", () => {
    const j = new Journal(ol, { ring: 100 });
    const r = seqRand([0]);
    for (let t = 0; t < 400; t += 1) j.tick(t, () => "s", true, r);
    const got = j.recent();
    expect(got.length).toBeGreaterThan(5);
    for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
  });
});
