import { describe, it, expect } from "vitest";
import { Raster, parseColor, makePaint } from "../../../src/factory/core/raster";

const px = (r: Raster, x: number, y: number) =>
  Array.from(r.data.slice((y * r.w + x) * 4, (y * r.w + x) * 4 + 4));

describe("parseColor", () => {
  it("parses forms", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255, 255]);
    expect(parseColor("#102030")).toEqual([16, 32, 48, 255]);
    expect(parseColor("#10203080")).toEqual([16, 32, 48, 128]);
    expect(parseColor("rgba(1,2,3,.5)")).toEqual([1, 2, 3, 128]);
  });
});
describe("Raster", () => {
  it("fills and clips integer rects", () => {
    const r = new Raster(4, 4);
    r.rect(-1, -1, 3, 3, "#ff0000");
    expect(px(r, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(r, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(px(r, 2, 2)).toEqual([0, 0, 0, 0]);
  });
  it("blends source-over", () => {
    const r = new Raster(1, 1);
    r.rect(0, 0, 1, 1, "#000000");
    r.rect(0, 0, 1, 1, "#ffffff", 0.5);
    expect(px(r, 0, 0)).toEqual([128, 128, 128, 255]);
  });
  it("blends onto a transparent pixel without darkening", () => {
    const r = new Raster(1, 1);
    r.rect(0, 0, 1, 1, "#ffffff", 0.5);
    expect(px(r, 0, 0)).toEqual([255, 255, 255, 128]);
  });
  it("blends translucent over translucent", () => {
    const r = new Raster(1, 1);
    r.rect(0, 0, 1, 1, "#ff0000", 0.5);
    r.rect(0, 0, 1, 1, "#0000ff", 0.5);
    const [pr, , pb, pa] = px(r, 0, 0);
    expect(Math.abs(pa - 191)).toBeLessThanOrEqual(1);
    expect(Math.abs(pr - 85)).toBeLessThanOrEqual(1);
    expect(Math.abs(pb - 170)).toBeLessThanOrEqual(1);
  });
});
describe("Paint snapping", () => {
  it("rounds tile edges and keeps ≥1px", () => {
    const r = new Raster(192, 192);
    const p = makePaint(r, 320, 0); // chunk cx=10 → ox = 320 tiles
    // legacy rail tie: x 6.3→6 .. 11.7→12 ; y 0.9→1 .. 2.4→2
    p.tr(320 + 1.05, 0.15, 0.9, 0.25, "#00ff00");
    expect(px(r, 6, 1)).toEqual([0, 255, 0, 255]);
    expect(px(r, 11, 1)).toEqual([0, 255, 0, 255]);
    expect(px(r, 12, 1)).toEqual([0, 0, 0, 0]);
    expect(px(r, 6, 2)).toEqual([0, 0, 0, 0]);
  });
  it("p() paints exact pixels inside a tile", () => {
    const r = new Raster(192, 192);
    const p = makePaint(r, 0, 0);
    p.p(2, 3, 1, 2, 2, 1, "#0000ff");
    expect(px(r, 13, 20)).toEqual([0, 0, 255, 255]);
    expect(px(r, 14, 20)).toEqual([0, 0, 255, 255]);
    expect(px(r, 15, 20)).toEqual([0, 0, 0, 0]);
  });
  it("disc is symmetric", () => {
    const r = new Raster(32, 32);
    const p = makePaint(r, 0, 0);
    p.disc(16 / 6, 16 / 6, 5, "#ffffff");
    expect(px(r, 12, 16)[3]).toBe(255);
    expect(px(r, 19, 16)[3]).toBe(255);
    expect(px(r, 16, 12)[3]).toBe(255);
    expect(px(r, 22, 16)[3]).toBe(0);
  });
  it("ellipse with fractional radius is symmetric", () => {
    const r = new Raster(32, 32);
    const p = makePaint(r, 0, 0);
    p.ellipse(16 / 6, 16 / 6, 4.6, 3.4, "#fff");
    const cols: number[] = [];
    for (let x = 0; x < 32; x++) if (px(r, x, 16)[3] > 0) cols.push(x);
    const mid = (cols[0] + cols[cols.length - 1]) / 2;
    for (const x of cols) expect(cols).toContain(2 * mid - x);
    let rows = 0;
    for (let y = 0; y < 32; y++) if (px(r, 16, y)[3] > 0) rows++;
    expect(rows).toBe(2 * Math.round(3.4));
  });
});
