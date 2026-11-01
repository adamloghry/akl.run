import { describe, it, expect } from "vitest";
import { Raster, makePaint } from "../../../src/factory/core/raster";
import * as S from "../../../src/factory/world/sprites";

const SIZES: Array<[string, number, number]> = [
  ["furnace", 2, 2],
  ["assembler", 3, 3],
  ["drill", 2, 2],
  ["turret", 2, 2],
  ["roboport", 4, 4],
  ["silo", 9, 9],
  ["lab", 3, 3],
  ["pumpjack", 3, 3],
  ["refinery", 5, 5],
  ["chemPlant", 3, 3],
  ["tank", 3, 3],
  ["solarPanel", 3, 3],
  ["accumulator", 2, 2],
  ["radar", 3, 3],
  ["spawner", 3, 3],
  ["worm", 2, 2],
];
describe("sprites", () => {
  for (const [name, w, h] of SIZES) {
    it(`${name} paints inside its ${w}×${h} footprint (chimneys/antennae may rise ≤ 1.5 tiles)`, () => {
      const r = new Raster(192, 192);
      const p = makePaint(r, 0, 0);
      (S as unknown as Record<string, (p: unknown, x: number, y: number) => void>)[name](p, 10, 10);
      let painted = 0;
      for (let y = 0; y < 192; y++)
        for (let x = 0; x < 192; x++) {
          if (r.data[(y * 192 + x) * 4 + 3] === 0) continue;
          const tx = x / 6,
            ty = y / 6;
          const ok = tx >= 9.5 && tx < 10 + w + 0.5 && ty >= 8.5 && ty < 10 + h + 0.5;
          expect(ok, `${name} pixel at ${x},${y}`).toBe(true);
          painted++;
        }
      expect(painted).toBeGreaterThan(w * h * 6);
    });
  }
  it("is deterministic", () => {
    const a = new Raster(192, 192),
      b = new Raster(192, 192);
    S.refinery(makePaint(a, 0, 0), 3, 3);
    S.refinery(makePaint(b, 0, 0), 3, 3);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
});
