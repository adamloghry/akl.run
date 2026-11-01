// Storage district (handoff 6.1): a concrete yard clipped to free land holding an 8x4 chest grid
// (chests side by side along x, every second row along y), lamps at the yard corners.
// Salts: none of its own (650-659 reserved).
import { T, type Recipe } from "../../core/types";
import { CHEST, CONCRETE } from "../palette";
import * as S from "../sprites";

export const storage: Recipe = (ctx) => {
  // anchor of the 8 x 7 chest box with the most free chest tiles; ties go to the one nearest the middle
  let best = { n: -1, x: ctx.ox + 12, y: ctx.oy + 12, d: 0 };
  for (let y = ctx.oy + 2; y <= ctx.oy + 32 - 9; y++)
    for (let x = ctx.ox + 2; x <= ctx.ox + 32 - 10; x++) {
      let n = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) if (ctx.free(x + i, y + j * 2, 1, 1)) n++;
      const d = Math.abs(x - (ctx.ox + 12)) + Math.abs(y - (ctx.oy + 12));
      if (n > best.n || (n === best.n && d < best.d)) best = { n, x, y, d };
    }
  const { x: gx, y: gy } = best;
  // yard: grid box plus a two-tile margin, painted on free tiles only
  const yx = gx - 2,
    yy = gy - 2,
    yw = 12,
    yh = 11;
  for (let j = 0; j < yh; j++)
    for (let i = 0; i < yw; i++) {
      const x = yx + i,
        y = yy + j;
      if (!ctx.free(x, y, 1, 1)) continue;
      ctx.tr(x, y, 1, 1, CONCRETE.base);
      if (i % 2 === 0) ctx.p(x, y, 0, 0, 1, T, CONCRETE.seam);
      if (j % 2 === 0) ctx.p(x, y, 0, 0, T, 1, CONCRETE.seam);
    }
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 8; i++) {
      const x = gx + i,
        y = gy + j * 2;
      if (!ctx.free(x, y, 1, 1)) continue;
      S.chest(ctx, x, y, j === 0 ? CHEST.gold : CHEST.iron);
      ctx.reserve(x, y, 1, 1);
      ctx.feat.machine("chest", x, y, 1, 1);
    }
  for (const [x, y] of [
    [yx, yy],
    [yx + yw - 1, yy],
    [yx, yy + yh - 1],
    [yx + yw - 1, yy + yh - 1],
  ])
    if (ctx.free(x, y, 1, 1)) {
      S.lamp(ctx, x, y);
      ctx.reserve(x, y, 1, 1);
      ctx.feat.machine("lamp", x, y, 1, 1);
    }
  ctx.reserve(yx, yy, yw, yh);
};
