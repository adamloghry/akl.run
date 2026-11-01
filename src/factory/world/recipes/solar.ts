// Solar district (ref:153-160). Salts: 690-699 (690 field row jitter, 691 accumulator scan start).
// 8x4 grid of 3x3 panels (one SolarField covering the grid) plus 10 accumulators (2x2) below it.
// Panels and accumulators are only placed where ctx.free; the highway cuts a gap through the grid.
import type { Pt, Recipe } from "../../core/types";
import * as S from "../sprites";

export const solar: Recipe = (ctx) => {
  const gx = ctx.ox + 2,
    gy = ctx.oy + 3 + Math.floor(ctx.h(690) * 3);
  let placed = 0;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 8; c++) {
      const x = gx + c * 3,
        y = gy + r * 3;
      if (!ctx.free(x, y, 3, 3)) continue;
      ctx.reserve(x, y, 3, 3);
      S.solarPanel(ctx, x, y);
      placed++;
    }
  if (placed) ctx.feat.solar(gx, gy, 24, 12);
  // accumulators: scan 2x2 slots on a 3-tile grid below the field, then anywhere else free
  const slots: Pt[] = [];
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) slots.push({ x: ctx.ox + 1 + i * 3, y: ctx.oy + 17 + j * 3 });
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 10; i++) slots.push({ x: ctx.ox + 1 + i * 3, y: ctx.oy + 1 + j * 3 });
  const start = Math.floor(ctx.h(691) * 10);
  let acc = 0;
  for (let k = 0; k < slots.length && acc < 10; k++) {
    const s = slots[k < 10 ? (k + start) % 10 : k];
    if (!ctx.free(s.x, s.y, 2, 2)) continue;
    ctx.reserve(s.x, s.y, 2, 2);
    S.accumulator(ctx, s.x, s.y);
    ctx.feat.machine("accumulator", s.x, s.y, 2, 2);
    acc++;
  }
};
