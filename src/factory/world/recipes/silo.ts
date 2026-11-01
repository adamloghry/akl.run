// Silo district (ref:181-187). Salts: 710-719 (none used; the layout is a pure function of the land).
// 9x9 silo with a hazard-stripe border on a 13x13 concrete pad with 4 corner pad lamps.
import { tileCentre, tileRect, type Recipe } from "../../core/types";
import * as S from "../sprites";

const PAD = 13;

export const silo: Recipe = (ctx) => {
  // preferred spot west of the highway, then every in-chunk position nearest first
  const cands: [number, number, number][] = [];
  for (let j = 0; j <= 32 - PAD; j++)
    for (let i = 0; i <= 32 - PAD; i++) cands.push([i, j, Math.hypot(i - 1, j - 9)]);
  cands.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  for (const [i, j] of cands) {
    const x = ctx.ox + i,
      y = ctx.oy + j;
    if (!ctx.free(x, y, PAD, PAD)) continue;
    ctx.reserve(x, y, PAD, PAD);
    S.concrete(ctx, x, y, PAD, PAD);
    S.silo(ctx, x + 2, y + 2);
    const lights = [
      [0, 0],
      [PAD - 1, 0],
      [0, PAD - 1],
      [PAD - 1, PAD - 1],
    ].map(([dx, dy]) => {
      S.lamp(ctx, x + dx, y + dy);
      return ctx.feat.machine("lamp", x + dx, y + dy, 1, 1).at;
    });
    ctx.feat.silo({ pad: tileRect(x, y, PAD, PAD), at: tileCentre(x + 2, y + 2, 9, 9), lights });
    return;
  }
};
