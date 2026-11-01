import { describe, it, expect } from "vitest";
import { toTile, toGeo, DOWNTOWN, landMask, inLandTile, CENTRAL_BOX } from "../../../src/factory/world/geo";
import { CH, AP } from "../../../src/factory/core/types";

describe("geo", () => {
  it("round-trips", () => {
    const [x, y] = toTile(-122.3321, 47.6062);
    const [lon, lat] = toGeo(x, y);
    expect(lon).toBeCloseTo(-122.3321, 6);
    expect(lat).toBeCloseTo(47.6062, 6);
  });
  it("downtown is land, the middle of Elliott Bay is not", () => {
    expect(inLandTile(...DOWNTOWN)).toBe(true);
    expect(inLandTile(...toTile(-122.37, 47.605))).toBe(false);
  });
  it("landMask is sized with apron and agrees with inLandTile", () => {
    const cx = Math.floor(DOWNTOWN[0] / CH),
      cy = Math.floor(DOWNTOWN[1] / CH);
    const m = landMask(cx, cy);
    expect(m.S).toBe(CH + 2 * AP);
    const tx = cx * CH + 5,
      ty = cy * CH + 7;
    expect(m.mask[(7 + AP) * m.S + 5 + AP] === 1).toBe(inLandTile(tx + 0.5, ty + 0.5));
    expect(m.landFrac).toBeGreaterThan(0);
    expect(m.landFrac).toBeLessThanOrEqual(1);
  });
  it("central box is non-empty", () => {
    expect(CENTRAL_BOX.tx1).toBeGreaterThan(CENTRAL_BOX.tx0);
    expect(CENTRAL_BOX.ty1).toBeGreaterThan(CENTRAL_BOX.ty0);
  });
});
