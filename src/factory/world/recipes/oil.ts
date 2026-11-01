// Oil district (ref:188-200). Salts: 700-709 (700 tar speckle, 701 speckle jitter, 702 layout slot).
// Tar patch with 3 pumpjacks (3x3), refinery 5x5 (3 stacks, the right one a flare), 2 chem plants,
// 3 tanks and pipes. Each entity tries its preferred spot, then a few fallbacks; all via ctx.free.
import type { Pt, Recipe, RecipeCtx } from "../../core/types";
import * as S from "../sprites";

/** The preferred (chunk-relative) spot if a w x h block is free there, else the first free of `scan()`; reserves it. */
function take(
  ctx: RecipeCtx,
  w: number,
  h: number,
  preferred: readonly [number, number],
  scan: () => readonly (readonly [number, number])[],
): Pt | null {
  const try1 = (dx: number, dy: number): Pt | null => {
    const x = ctx.ox + dx,
      y = ctx.oy + dy;
    if (!ctx.free(x, y, w, h)) return null;
    ctx.reserve(x, y, w, h);
    return { x, y };
  };
  const first = try1(preferred[0], preferred[1]);
  if (first) return first;
  // the fallback list is built lazily, only when the preferred spot is taken
  for (const [dx, dy] of scan()) {
    const p = try1(dx, dy);
    if (p) return p;
  }
  return null;
}
/** Every in-chunk position, nearest to (px, py) first. */
function near(px: number, py: number, step = 1): [number, number][] {
  const out: [number, number, number][] = [];
  for (let j = 1; j < 30; j += step)
    for (let i = 1; i < 30; i += step) out.push([i, j, Math.hypot(i - px, j - py)]);
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out.map(([i, j]) => [i, j] as [number, number]);
}

export const oil: Recipe = (ctx) => {
  // tar patch on the west of the highway
  for (let j = 3; j < 14; j++)
    for (let i = 1; i < 14; i++) {
      const x = ctx.ox + i,
        y = ctx.oy + j;
      if (ctx.free(x, y, 1, 1)) ctx.tr(x, y, 1, 1, "#4a4232");
    }
  for (let k = 0; k < 40; k++) {
    const x = ctx.ox + 1 + Math.floor(ctx.h(700, k, 1) * 13),
      y = ctx.oy + 3 + Math.floor(ctx.h(701, k, 2) * 11);
    if (ctx.free(x, y, 1, 1)) ctx.p(x, y, 1, 2, 3, 2, "#2a2520");
  }
  for (let i = 0; i < 3; i++) {
    const p = take(ctx, 3, 3, [2 + i * 4, 5], () => near(2 + i * 4, 5));
    if (!p) continue;
    S.pumpjack(ctx, p.x, p.y);
    ctx.feat.machine("pumpjack", p.x, p.y, 3, 3);
  }
  if (ctx.free(ctx.ox + 2, ctx.oy + 9, 12, 1)) {
    ctx.reserve(ctx.ox + 2, ctx.oy + 9, 12, 1);
    S.pipeH(ctx, ctx.ox + 2, ctx.oy + 9, 12);
  }
  // refinery east of the highway; the third stack is the flare
  const ref = take(ctx, 5, 5, [18, 4], () => near(19, 6));
  if (ref) {
    S.refinery(ctx, ref.x, ref.y);
    ctx.feat.machine("refinery", ref.x, ref.y, 5, 5);
    ctx.feat.machine("flare", ref.x + 4, ref.y, 1, 1);
  }
  for (let i = 0; i < 2; i++) {
    const p = take(ctx, 3, 3, [24 + i * 4, 4], () => near(24 + i * 4, 4));
    if (!p) continue;
    S.chemPlant(ctx, p.x, p.y);
    ctx.feat.machine("chem", p.x, p.y, 3, 3);
  }
  for (let i = 0; i < 3; i++) {
    const p = take(ctx, 3, 3, [18 + i * 4, 12], () => near(18 + i * 4, 12));
    if (!p) continue;
    S.tank(ctx, p.x, p.y);
    ctx.feat.machine("tank", p.x, p.y, 3, 3);
  }
  if (ctx.free(ctx.ox + 18, ctx.oy + 10, 12, 1)) {
    ctx.reserve(ctx.ox + 18, ctx.oy + 10, 12, 1);
    S.pipeH(ctx, ctx.ox + 18, ctx.oy + 10, 12);
  }
  for (const [dx, dy] of [
    [2, 16],
    [10, 16],
    [20, 16],
    [28, 16],
  ])
    if (ctx.free(ctx.ox + dx, ctx.oy + dy, 1, 1)) {
      ctx.reserve(ctx.ox + dx, ctx.oy + dy, 1, 1);
      S.pole(ctx, ctx.ox + dx, ctx.oy + dy);
      ctx.feat.machine("pole", ctx.ox + dx, ctx.oy + dy, 1, 1);
    }
};
