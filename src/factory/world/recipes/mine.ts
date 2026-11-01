// Mine district (akl:111-112, ref:103-114): lines of 2x2 drills on ore either side of an output belt,
// with poles in the gaps between drills. Up to three lines, best ore coverage first.
// Salts: none of its own (600-609 reserved).
import type { Color, OreKind, Recipe, RecipeCtx } from "../../core/types";
import { ITEM, PAL } from "../palette";
import * as S from "../sprites";

const ORE_COLOR: Record<OreKind, Color> = {
  iron: ITEM.ore,
  copper: ITEM.copper,
  coal: ITEM.coal,
  stone: PAL.ore[3][1],
};

/** A drill fits at (x, y) when its tiles are free and at least three of four sit on ore. */
function drillOk(ctx: RecipeCtx, x: number, y: number): boolean {
  if (!ctx.free(x, y, 2, 2)) return false;
  let n = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (ctx.ore(x + i, y + j)) n++;
  return n >= 3;
}

interface Line {
  by: number;
  xs: number[]; // drill columns in the run
  top: boolean[];
  bottom: boolean[];
  score: number;
}

function bestLine(ctx: RecipeCtx): Line | null {
  const x1 = ctx.ox + 32;
  let best: Line | null = null;
  for (let by = ctx.oy + 2; by < ctx.oy + 30; by++) {
    let cur: Line | null = null;
    const close = () => {
      if (cur && cur.score >= 2 && (!best || cur.score > best.score)) best = cur;
      cur = null;
    };
    let x = ctx.ox;
    while (x + 2 <= x1) {
      const beltOk = ctx.free(x, by, 3, 1) || (x + 2 === x1 && ctx.free(x, by, 2, 1));
      const t = beltOk && drillOk(ctx, x, by - 2),
        b = beltOk && drillOk(ctx, x, by + 1);
      if (t || b) {
        cur ??= { by, xs: [], top: [], bottom: [], score: 0 };
        cur.xs.push(x);
        cur.top.push(t);
        cur.bottom.push(b);
        cur.score += +t + +b;
        x += 3;
      } else {
        close();
        x++;
      }
    }
    close();
  }
  return best;
}

export const mine: Recipe = (ctx) => {
  for (let n = 0; n < 3; n++) {
    const line = bestLine(ctx);
    if (!line) return;
    const { by, xs } = line;
    const xa = xs[0],
      xb = xs[xs.length - 1] + 1;
    // dominant ore under the first drills sets the belt colour
    let kind: OreKind = "iron";
    for (let i = 0; i < 4; i++) {
      const o = ctx.ore(xa + (i & 1), by + (line.top[0] ? -2 : 1) + (i >> 1));
      if (o) {
        kind = o;
        break;
      }
    }
    const tiles: [number, number][] = [];
    for (let x = xa; x <= xb; x++) {
      tiles.push([x, by]);
      S.belt(ctx, x, by, 0);
    }
    ctx.reserve(xa, by, xb - xa + 1, 1);
    const c = ORE_COLOR[kind];
    ctx.feat.belt(tiles, [[c], [c, c]]);
    xs.forEach((x, i) => {
      for (const [on, y] of [
        [line.top[i], by - 2],
        [line.bottom[i], by + 1],
      ] as const) {
        if (!on) continue;
        S.drill(ctx, x, y);
        ctx.reserve(x, y, 2, 2);
        ctx.feat.machine("drill", x, y, 2, 2);
      }
      const py = line.top[i] ? by - 1 : by + 1;
      if (i < xs.length - 1 && i % 2 === 0 && ctx.free(x + 2, py, 1, 1)) {
        S.pole(ctx, x + 2, py);
        ctx.reserve(x + 2, py, 1, 1);
        ctx.feat.machine("pole", x + 2, py, 1, 1);
      }
    });
  }
};
