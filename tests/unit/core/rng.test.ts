import { describe, it, expect, afterEach } from "vitest";
import { rand, setRandom } from "../../../src/factory/core/rng";

afterEach(() => setRandom(null));
describe("ephemeral rng", () => {
  it("reads Math.random at call time", () => {
    const orig = Math.random;
    Math.random = () => 0.5;
    try {
      expect(rand.next()).toBe(0.5);
    } finally {
      Math.random = orig;
    }
  });
  it("setRandom overrides", () => {
    setRandom(() => 0.25);
    expect(rand.next()).toBe(0.25);
    expect(rand.range(10, 20)).toBe(12.5);
    expect(rand.int(0, 4)).toBe(1);
    expect(rand.pick(["a", "b", "c", "d"])).toBe("b");
    expect(rand.chance(0.3)).toBe(true);
    expect(rand.chance(0.2)).toBe(false);
  });
});
