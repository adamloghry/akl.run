// Outpost district (spec 6.1, ref:207-217, akl:126). Salts: 660-669 (none used; layout is deterministic).
// Paired (a 4-neighbour nest pairs with this chunk): 21x21 wall ring, concrete interior, 5 turrets,
// 4 ammo chests, radar, small roboport, 2 lamps, a big pole, registered as an OutpostSite.
// Unpaired: the previous engine's small walled outpost with no OutpostSite.
import {
  DIRS,
  tileCentre,
  tileRect,
  type Dir,
  type Pt,
  type Recipe,
  type RecipeCtx,
  type WallSeg,
} from "../../core/types";
import { pairedOutpostPure } from "../pairing";
import * as S from "../sprites";
import { CHEST } from "../palette";

const RING = 21;

/** Ring origin offsets: the classic nine first (they win ties), then every other offset in the 12 x 12 slack. */
const RING_CANDS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [
    [0, 0],
    [11, 0],
    [0, 11],
    [11, 11],
    [5, 5],
    [0, 5],
    [11, 5],
    [5, 0],
    [5, 11],
  ];
  for (let dy = 0; dy <= 11; dy++)
    for (let dx = 0; dx <= 11; dx++) if (!out.some(([a, b]) => a === dx && b === dy)) out.push([dx, dy]);
  return out;
})();

/** Offsets within +-9 tiles, nearest first (pure; computed once). */
const NUDGE: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let ny = -9; ny <= 9; ny++) for (let nx = -9; nx <= 9; nx++) out.push([nx, ny]);
  return out.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2) || a[1] - b[1] || a[0] - b[0]);
})();

/**
 * Origin (tile) of the w x w square, among a fixed candidate list, with the best score. The score is the
 * land count (sampled) of the square, or with `ring` the number of FREE perimeter tiles (land and not
 * reserved), so a wall ring steers clear of roads and rails where it can.
 */
function bestOrigin(
  ctx: RecipeCtx,
  w: number,
  cands: readonly (readonly [number, number])[],
  ring = false,
): Pt {
  let best = { x: ctx.ox, y: ctx.oy },
    bn = -1;
  for (const [dx, dy] of cands) {
    let n = 0;
    const x0 = ctx.ox + dx,
      y0 = ctx.oy + dy;
    if (ring) {
      for (let i = 0; i < w; i++) {
        if (ctx.free(x0 + i, y0, 1, 1)) n++;
        if (ctx.free(x0 + i, y0 + w - 1, 1, 1)) n++;
      }
      for (let j = 1; j < w - 1; j++) {
        if (ctx.free(x0, y0 + j, 1, 1)) n++;
        if (ctx.free(x0 + w - 1, y0 + j, 1, 1)) n++;
      }
    } else {
      for (let j = 0; j < w; j += 2) for (let i = 0; i < w; i += 2) if (ctx.land(x0 + i, y0 + j)) n++;
    }
    if (n > bn) {
      bn = n;
      best = { x: ctx.ox + dx, y: ctx.oy + dy };
    }
  }
  return best;
}

/** Paint a wall tile run (skipped where water or other structures are) and report whether it was placed. */
function wallRun(ctx: RecipeCtx, x: number, y: number, w: number, h: number): boolean {
  if (!ctx.free(x, y, w, h)) return false;
  ctx.reserve(x, y, w, h);
  S.wall(ctx, x, y, w, h);
  return true;
}

function paired(ctx: RecipeCtx): Dir | null {
  for (let d = 0; d < 4; d++) {
    // N, E, S, W order
    const [dx, dy] = [DIRS[3], DIRS[0], DIRS[1], DIRS[2]][d];
    const nx = ctx.cx + dx,
      ny = ctx.cy + dy;
    if (ctx.kindAt(nx, ny) !== "nest") continue;
    const p = pairedOutpostPure(nx, ny, ctx.seed);
    if (p && p.cx === ctx.cx && p.cy === ctx.cy) return ([3, 0, 1, 2] as const)[d];
  }
  return null;
}

function military(ctx: RecipeCtx, facing: Dir): void {
  const o = bestOrigin(ctx, RING, RING_CANDS, true);
  const { x, y } = o;
  // interior first so walls and gates sit on top of the pad
  for (let j = 1; j < RING - 1; j++)
    for (let i = 1; i < RING - 1; i++)
      if (ctx.free(x + i, y + j, 1, 1)) {
        S.concrete(ctx, x + i, y + j, 1, 1);
      }
  const wall: WallSeg[] = [];
  const run = (rx: number, ry: number, w: number, h: number) => {
    if (wallRun(ctx, rx, ry, w, h)) wall.push(ctx.feat.wall(rx, ry, w, h));
  };
  for (let i = 0; i < RING; i += 3) {
    const w = Math.min(3, RING - i);
    run(x + i, y, w, 1);
    run(x + i, y + RING - 1, w, 1);
  }
  for (let j = 1; j < RING - 1; j += 3) {
    const h = Math.min(3, RING - 1 - j);
    run(x, y + j, 1, h);
    run(x + RING - 1, y + j, 1, h);
  }
  // Try the nominal spot, then nearby ones (lamps/poles from paintCommon may occupy it).
  const place = (
    rx: number,
    ry: number,
    w: number,
    h: number,
    paint: (tx: number, ty: number) => void,
  ): Pt | null => {
    for (const [nx, ny] of NUDGE) {
      const tx = x + rx + nx,
        ty = y + ry + ny;
      if (rx + nx < 1 || ry + ny < 1 || rx + nx + w > RING - 1 || ry + ny + h > RING - 1) continue;
      if (!ctx.free(tx, ty, w, h)) continue;
      ctx.reserve(tx, ty, w, h);
      paint(tx, ty);
      return { x: tx, y: ty };
    }
    return null;
  };
  const turrets: Pt[] = [];
  for (const [rx, ry] of [
    [2, 2],
    [17, 2],
    [2, 17],
    [17, 17],
    [9, 9],
  ]) {
    const p = place(rx, ry, 2, 2, (tx, ty) => S.turret(ctx, tx, ty));
    if (p) {
      ctx.feat.machine("turret", p.x, p.y, 2, 2);
      turrets.push(tileCentre(p.x, p.y, 2, 2));
    }
  }
  for (let i = 0; i < 4; i++) {
    const p = place(4 + i * 2, 6, 1, 1, (tx, ty) => S.chest(ctx, tx, ty, i % 2 ? CHEST.gold : CHEST.iron));
    if (p) ctx.feat.machine("chest", p.x, p.y, 1, 1);
  }
  let radar = tileCentre(x + 5, y + 13, 3, 3);
  const rp = place(4, 12, 3, 3, (tx, ty) => S.radar(ctx, tx, ty));
  if (rp) {
    ctx.feat.machine("radar", rp.x, rp.y, 3, 3);
    radar = tileCentre(rp.x, rp.y, 3, 3);
  }
  let roboport = tileCentre(x + 12, y + 5, 2, 2);
  const bp = place(12, 5, 2, 2, (tx, ty) => S.smallRoboport(ctx, tx, ty));
  if (bp) {
    ctx.feat.machine("roboport", bp.x, bp.y, 2, 2);
    roboport = tileCentre(bp.x, bp.y, 2, 2);
  }
  for (const [rx, ry] of [
    [9, 4],
    [9, 15],
  ]) {
    const p = place(rx, ry, 1, 1, (tx, ty) => S.lamp(ctx, tx, ty));
    if (p) ctx.feat.machine("lamp", p.x, p.y, 1, 1);
  }
  const gp = place(10, 13, 2, 2, (tx, ty) => S.bigPole(ctx, tx, ty));
  if (gp) ctx.feat.machine("bigpole", gp.x, gp.y, 2, 2);
  ctx.feat.outpost({ rect: tileRect(x, y, RING, RING), wall, turrets, radar, roboport, facing });
}

/** Legacy small walled outpost: 14x14 wall with a gap in the south side, 4 corner turrets. */
function small(ctx: RecipeCtx): void {
  const W = 14;
  const { x, y } = bestOrigin(ctx, W, [
    [1, 1],
    [17, 1],
    [1, 17],
    [17, 17],
    [1, 9],
    [17, 9],
    [9, 1],
    [9, 17],
  ]);
  let land = 0;
  for (let j = 0; j < W; j += 2)
    for (let i = 0; i < W; i += 2) if (ctx.land(x + i, y + j) && ctx.shoreDist(x + i, y + j) >= 2) land++;
  if (land < 40) return;
  wallRun(ctx, x, y, W, 1);
  wallRun(ctx, x, y + W - 1, 5, 1);
  wallRun(ctx, x + 9, y + W - 1, 5, 1);
  wallRun(ctx, x, y + 1, 1, W - 2);
  wallRun(ctx, x + W - 1, y + 1, 1, W - 2);
  for (const [rx, ry] of [
    [1, 1],
    [W - 3, 1],
    [1, W - 3],
    [W - 3, W - 3],
  ])
    if (ctx.free(x + rx, y + ry, 2, 2)) {
      ctx.reserve(x + rx, y + ry, 2, 2);
      S.turret(ctx, x + rx, y + ry);
      ctx.feat.machine("turret", x + rx, y + ry, 2, 2);
    }
  if (ctx.free(x + 6, y + 6, 1, 1)) {
    ctx.reserve(x + 6, y + 6, 1, 1);
    S.lamp(ctx, x + 6, y + 6);
    ctx.feat.machine("lamp", x + 6, y + 6, 1, 1);
  }
}

export const outpost: Recipe = (ctx) => {
  const facing = paired(ctx);
  if (facing === null) small(ctx);
  else military(ctx, facing);
};
