// Power district (akl:119-123, ref:115-126): steam engines over a pipe row, boilers fed by inserters
// from a coal belt, and an offshore pump piped in from the nearest shore tile (when one is close).
// Rows from the top: engines E..E+2 (at least 2; or 3x5 vertical engines E-2..E+2 as the narrow fallback), pipe E+3, boilers E+4..E+5, inserters E+6, coal belt E+7.
// Salts: none of its own (630-639 reserved).
import type { Recipe, RecipeCtx } from "../../core/types";
import { ITEM } from "../palette";
import * as S from "../sprites";

const MINW = 11,
  MAXW = 17;

interface Anchor {
  x: number;
  e: number;
  w: number;
  engines: number[];
  horizontal: boolean; // engine orientation: 5x3 over the pipe row, else 3x5 reaching up from it
  boilers: number[];
  score: number;
}

function findAnchor(ctx: RecipeCtx): Anchor | null {
  let best: Anchor | null = null;
  const x1 = ctx.ox + 32;
  for (let e = ctx.oy + 1; e <= ctx.oy + 24; e++) {
    let x = ctx.ox;
    while (x < x1) {
      if (!(ctx.free(x, e + 3, 1, 1) && ctx.free(x, e + 7, 1, 1))) {
        x++;
        continue;
      }
      let w = 1;
      while (w < MAXW && x + w < x1 && ctx.free(x + w, e + 3, 1, 1) && ctx.free(x + w, e + 7, 1, 1)) w++;
      if (w >= MINW) {
        const engines: number[] = [],
          boilers: number[] = [];
        // wide layout first; the narrow (vertical, 3x5) layout is the fallback when it holds more engines
        for (let i = 0; i < 3; i++)
          if (i * 6 + 5 <= w && ctx.free(x + i * 6, e, 5, 3)) engines.push(x + i * 6);
        let horizontal = true;
        if (engines.length < 2) {
          const vert: number[] = [];
          for (let i = 0; i < 3; i++)
            if (i * 4 + 3 <= w && ctx.free(x + i * 4, e - 2, 3, 5)) vert.push(x + i * 4);
          if (vert.length > engines.length) {
            engines.splice(0, engines.length, ...vert);
            horizontal = false;
          }
        }
        for (let i = 0; i < 4; i++)
          if (i * 4 + 3 <= w && ctx.free(x + i * 4, e + 4, 3, 2)) boilers.push(x + i * 4);
        const score = engines.length * 2 + boilers.length;
        if (engines.length >= 2 && boilers.length >= 1 && (!best || score > best.score))
          best = { x, e, w, engines, horizontal, boilers, score };
      }
      x += w;
    }
  }
  return best;
}

/** Offshore pump on the shore tile nearest the block, with an L-shaped pipe to the block's pipe row. */
function pump(ctx: RecipeCtx, a: Anchor): void {
  const pipeRow = a.e + 3;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = ctx.oy; y < ctx.oy + 31; y++)
    for (let x = ctx.ox; x < ctx.ox + 32; x++) {
      if (ctx.shoreDist(x, y) !== 1 || (x >= a.x - 1 && x <= a.x + a.w) || !ctx.free(x, y, 1, 2)) continue;
      const d = Math.abs(x - a.x) + Math.abs(y + 1 - pipeRow);
      if (d <= 24 && (!best || d < best.d)) best = { x, y, d };
    }
  if (!best) return;
  const left = best.x < a.x;
  const vx = left ? a.x - 1 : a.x + a.w; // pipe column beside the block
  const row = best.y + 1;
  const ha = left ? best.x + 1 : vx,
    hb = left ? vx : best.x - 1;
  const [va, vb] = [Math.min(row, pipeRow), Math.max(row, pipeRow)];
  if (!ctx.free(ha, row, hb - ha + 1, 1) || !ctx.free(vx, va, 1, vb - va + 1)) return;
  // the vertical leg and the horizontal leg share the corner tile; both are free by the checks above
  S.pipeH(ctx, ha, row, hb - ha + 1);
  S.pipeV(ctx, vx, va, vb - va + 1);
  ctx.reserve(ha, row, hb - ha + 1, 1);
  ctx.reserve(vx, va, 1, vb - va + 1);
  S.offshorePump(ctx, best.x, best.y);
  ctx.reserve(best.x, best.y, 1, 2);
  ctx.feat.machine("offshore", best.x, best.y, 1, 2);
}

export const power: Recipe = (ctx) => {
  const a = findAnchor(ctx);
  if (!a) return;
  const pipeRow = a.e + 3,
    beltRow = a.e + 7;
  S.pipeH(ctx, a.x, pipeRow, a.w);
  ctx.reserve(a.x, pipeRow, a.w, 1);
  const tiles: [number, number][] = [];
  for (let x = a.x; x < a.x + a.w; x++) {
    tiles.push([x, beltRow]);
    S.belt(ctx, x, beltRow, 0);
  }
  ctx.reserve(a.x, beltRow, a.w, 1);
  const coal = ctx.feat.belt(tiles, [[ITEM.coal], [ITEM.coal]]);
  for (const x of a.engines) {
    const [ew, eh, ey] = a.horizontal ? [5, 3, a.e] : [3, 5, a.e - 2];
    S.steamEngine(ctx, x, ey, a.horizontal);
    ctx.reserve(x, ey, ew, eh);
    ctx.feat.machine("engine", x, ey, ew, eh);
  }
  for (const x of a.boilers) {
    S.boiler(ctx, x, a.e + 4);
    ctx.reserve(x, a.e + 4, 3, 2);
    ctx.feat.machine("boiler", x, a.e + 4, 3, 2);
    S.inserterBase(ctx, x + 1, a.e + 6, false);
    ctx.reserve(x + 1, a.e + 6, 1, 1);
    ctx.feat.inserter(x + 1, a.e + 6, 3, false, coal.id);
  }
  // poles over the gaps between engines, then the pump
  for (let i = 0; i + 1 < a.engines.length; i++) {
    const px = a.engines[i] + (a.horizontal ? 5 : 3);
    if (ctx.free(px, a.e + 1, 1, 1)) {
      S.pole(ctx, px, a.e + 1);
      ctx.reserve(px, a.e + 1, 1, 1);
      ctx.feat.machine("pole", px, a.e + 1, 1, 1);
    }
  }
  pump(ctx, a);
};
