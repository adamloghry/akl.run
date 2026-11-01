// Nest district (spec 6.1, ref:207-217). Salts: 670-679 (670 start slot, 671 creep shade, 672 dead trees, 673 creep edge).
// Creep tint over the chunk's land, 2 spawners, 2 worms, dead trees; everything stays
// inside the chunk. The paired outpost comes from the pure pairing module.
import { type Pt, type Recipe, type RecipeCtx } from "../../core/types";
import { pairedOutpostPure } from "../pairing";
import * as S from "../sprites";

/** First free w x h block scanning a coarse grid from a hashed start slot (then a fine scan). */
function spot(ctx: RecipeCtx, w: number, h: number, start: number): Pt | null {
  const xs = [4, 10, 17, 23],
    n = xs.length * xs.length;
  for (let k = 0; k < n; k++) {
    const s = (start + k) % n;
    const x = ctx.ox + xs[s % 4],
      y = ctx.oy + xs[Math.floor(s / 4)];
    if (ctx.free(x, y, w, h)) return { x, y };
  }
  for (let j = 1; j < 31 - h; j++)
    for (let i = 1; i < 31 - w; i++)
      if (ctx.free(ctx.ox + i, ctx.oy + j, w, h)) return { x: ctx.ox + i, y: ctx.oy + j };
  return null;
}

export const nest: Recipe = (ctx) => {
  // creep over free land, a soft-edged blob (full coverage in the middle, ragged toward the edges)
  for (let j = 0; j < 32; j++)
    for (let i = 0; i < 32; i++) {
      const x = ctx.ox + i,
        y = ctx.oy + j;
      const d = Math.hypot(i - 15.5, j - 15.5) / 18;
      if (d > 0.75 + ctx.h(673, x, y) * 0.35 || !ctx.free(x, y, 1, 1)) continue;
      S.creep(ctx, x, y, ctx.h(671, x, y));
    }
  const start = Math.floor(ctx.h(670) * 16);
  const spawners: Pt[] = [],
    worms: Pt[] = [];
  for (let k = 0; k < 2; k++) {
    const p = spot(ctx, 3, 3, start + k * 5);
    if (!p) continue;
    ctx.reserve(p.x, p.y, 3, 3);
    S.spawner(ctx, p.x, p.y);
    spawners.push(ctx.feat.machine("spawner", p.x, p.y, 3, 3).at);
  }
  for (let k = 0; k < 2; k++) {
    const p = spot(ctx, 2, 2, start + 3 + k * 7);
    if (!p) continue;
    ctx.reserve(p.x, p.y, 2, 2);
    S.worm(ctx, p.x, p.y);
    worms.push(ctx.feat.machine("worm", p.x, p.y, 2, 2).at);
  }
  for (let j = 0; j < 32; j++)
    for (let i = 0; i < 32; i++) {
      const x = ctx.ox + i,
        y = ctx.oy + j;
      if (ctx.h(672, x, y) > 0.97 && ctx.free(x, y, 1, 1)) {
        ctx.reserve(x, y, 1, 1);
        S.deadTree(ctx, x, y);
      }
    }
  // nest rect: bounding box of its inhabitants plus a margin, clamped to the chunk
  const pts = [...spawners, ...worms];
  const cxp = ctx.cx * 192,
    cyp = ctx.cy * 192;
  let x0 = cxp + 64,
    y0 = cyp + 64,
    x1 = cxp + 128,
    y1 = cyp + 128;
  if (pts.length) {
    x0 = Math.min(...pts.map((p) => p.x)) - 24;
    y0 = Math.min(...pts.map((p) => p.y)) - 24;
    x1 = Math.max(...pts.map((p) => p.x)) + 24;
    y1 = Math.max(...pts.map((p) => p.y)) + 24;
  }
  x0 = Math.max(cxp, x0);
  y0 = Math.max(cyp, y0);
  x1 = Math.min(cxp + 192, x1);
  y1 = Math.min(cyp + 192, y1);
  // The fallback is only reachable when the nest kind is forced on an unpaired chunk (tests); in the
  // world a nest chunk always has a pairing.
  const outpost = pairedOutpostPure(ctx.cx, ctx.cy, ctx.seed) ?? { cx: ctx.cx + 1, cy: ctx.cy };
  ctx.feat.nest({ rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, spawners, worms, outpost });
};
