// Labs district (spec 6.1, ref:153-160). Salts: 680-689 (680 picks the first belt row).
// 4 labs (3x3), each fed by an inserter from a science belt (red/green/blue mix). Belts run in two
// clusters either side of the N-S highway; every placement is checked with ctx.free.
import { ITEM } from "../palette";
import type { Dir, Recipe } from "../../core/types";
import * as S from "../sprites";

const SCIENCE: [string[], string[]] = [
  [ITEM.red, ITEM.gear, ITEM.red],
  [ITEM.circuit, ITEM.copper, ITEM.circuit],
];

export const labs: Recipe = (ctx) => {
  const rows = [14, 8, 20, 4, 25];
  const r0 = Math.floor(ctx.h(680) * rows.length);
  const clusters: [number, number][] = [
    [2, 13],
    [17, 30],
  ];
  let placed = 0,
    side = 0;
  for (let k = 0; k < rows.length && placed < 4; k++) {
    const row = ctx.oy + rows[(r0 + k) % rows.length];
    for (const [a, b] of clusters) {
      if (placed >= 4) break;
      const x0 = ctx.ox + a,
        len = b - a + 1;
      if (!ctx.free(x0, row, len, 1)) continue;
      const above = side++ % 2 === 0;
      const ly = above ? row - 4 : row + 2; // lab top row; inserter sits between lab and belt
      const iy = above ? row - 1 : row + 1;
      const mine: number[] = [];
      for (const off of [0, 4, 8]) {
        if (placed + mine.length >= 4) break;
        if (ctx.free(x0 + off, ly, 3, 3) && ctx.free(x0 + off + 1, iy, 1, 1)) {
          ctx.reserve(x0 + off, ly, 3, 3);
          ctx.reserve(x0 + off + 1, iy, 1, 1);
          mine.push(off);
        }
      }
      if (!mine.length) continue;
      ctx.reserve(x0, row, len, 1);
      const tiles: [number, number][] = [];
      for (let i = 0; i < len; i++) {
        S.belt(ctx, x0 + i, row, 0);
        tiles.push([x0 + i, row]);
      }
      const belt = ctx.feat.belt(tiles, SCIENCE);
      const dir: Dir = above ? 3 : 1;
      for (const off of mine) {
        S.lab(ctx, x0 + off, ly);
        ctx.feat.machine("lab", x0 + off, ly, 3, 3);
        S.inserterBase(ctx, x0 + off + 1, iy, false);
        ctx.feat.inserter(x0 + off + 1, iy, dir, false, belt.id);
      }
      placed += mine.length;
      if (ctx.free(x0 + len - 1, row + (above ? 1 : -1), 1, 1)) {
        const py = row + (above ? 1 : -1);
        ctx.reserve(x0 + len - 1, py, 1, 1);
        S.pole(ctx, x0 + len - 1, py);
        ctx.feat.machine("pole", x0 + len - 1, py, 1, 1);
      }
    }
  }
};
