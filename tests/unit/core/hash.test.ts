import { describe, it, expect } from "vitest";
import { hash, noise, chunkRng } from "../../../src/factory/core/hash";

describe("hash", () => {
  it("is deterministic and in [0,1)", () => {
    for (let i = 0; i < 1000; i++) {
      const v = hash(i, -i * 7, 12345);
      expect(v).toBe(hash(i, -i * 7, 12345));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("matches the previous engine's hash bit-for-bit (akl:31)", () => {
    const akl = (x: number, y: number, s: number) => {
      let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1274126177);
      n = Math.imul(n ^ (n >>> 13), 1103515245);
      n ^= n >>> 16;
      return (n >>> 0) / 4294967296;
    };
    for (let i = -50; i < 50; i++) expect(hash(i, i * 3, 99)).toBe(akl(i, i * 3, 99));
  });
  it("noise is smooth and bounded", () => {
    const a = noise(10, 10, 1),
      b = noise(10.01, 10, 1);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });
  it("chunkRng is sequential and reproducible", () => {
    const r1 = chunkRng(3, -4, 777),
      r2 = chunkRng(3, -4, 777);
    const s1 = [r1(), r1(), r1()],
      s2 = [r2(), r2(), r2()];
    expect(s1).toEqual(s2);
    expect(new Set(s1).size).toBe(3);
  });
});
