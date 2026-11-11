// Hub district (handoff 6.1, ref:169-180, akl:124-125): a 30x26 concrete pad clipped to free land, a
// 4x4 roboport, a 4x4 logistic-chest grid (spacing 2) and a 12-chest row, an empty 12x10 construction
// lot, a car park, a spidertron park and (if the rail mainline crosses the chunk) a station platform.
// The lot is fixed first (in the pad, else anywhere in the chunk, else shrunk to the largest free block of
// at least 8x6) and the HubSite is registered at once; every other element is placed best effort at the
// free spot nearest its reference position, none if it does not fit. Only a chunk with no free 8x6 block
// stays bare (no HubSite).
// Salts: none of its own (640-649 reserved).
import { T, tileCentre, tileRect, type Pt, type Recipe, type RecipeCtx } from "../../core/types";
import { CHEST, CONCRETE } from "../palette";
import * as S from "../sprites";

const PAD_W = 30,
  PAD_H = 26;

/** First (nearest to the preferred spot) w x h free block with top-left in the given inclusive ranges. */
function nearest(
  ctx: RecipeCtx,
  w: number,
  h: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  px: number,
  py: number,
): [number, number] | null {
  let best: [number, number] | null = null,
    bd = Infinity;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.abs(x - px) + Math.abs(y - py);
      if (d < bd && ctx.free(x, y, w, h)) {
        bd = d;
        best = [x, y];
      }
    }
  return best;
}

function concretePad(ctx: RecipeCtx, x0: number, y0: number, w: number, h: number): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i,
        y = y0 + j;
      if (!ctx.free(x, y, 1, 1)) continue;
      ctx.tr(x, y, 1, 1, CONCRETE.base);
      if (i % 2 === 0) ctx.p(x, y, 0, 0, 1, T, CONCRETE.seam);
      if (j % 2 === 0) ctx.p(x, y, 0, 0, T, 1, CONCRETE.seam);
    }
}

/** Lot placement: 12x10 nearest the nominal spot inside the pad, else anywhere in the chunk, else the
 * largest free block (at least 8x6) anywhere in the chunk. */
function findLot(
  ctx: RecipeCtx,
  px: number,
  py: number,
): { x: number; y: number; w: number; h: number } | null {
  const nx = px + 15,
    ny = py + 6;
  const inPadLot = nearest(ctx, 12, 10, px, px + PAD_W - 12, py, py + PAD_H - 10, nx, ny);
  if (inPadLot) return { x: inPadLot[0], y: inPadLot[1], w: 12, h: 10 };
  const any = (w: number, h: number) =>
    nearest(ctx, w, h, ctx.ox, ctx.ox + 32 - w, ctx.oy, ctx.oy + 32 - h, nx, ny);
  const full = any(12, 10);
  if (full) return { x: full[0], y: full[1], w: 12, h: 10 };
  const sizes: [number, number][] = [];
  for (let w = 8; w <= 12; w++) for (let h = 6; h <= 10; h++) sizes.push([w, h]);
  sizes.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
  for (const [w, h] of sizes) {
    const at = any(w, h);
    if (at) return { x: at[0], y: at[1], w, h };
  }
  return null;
}

export const hub: Recipe = (ctx) => {
  const px = ctx.ox + 1,
    py = ctx.oy + 3;
  const lot = findLot(ctx, px, py);
  if (!lot) return; // not even an 8x6 free block anywhere in the chunk
  ctx.reserve(lot.x, lot.y, lot.w, lot.h);
  concretePad(ctx, px, py, PAD_W, PAD_H);
  // From here on a HubSite always exists; everything else is best effort. Fields set below are
  // assigned on the returned (live) site object.
  const chests: Pt[] = [];
  const site = ctx.feat.hub({
    rect: tileRect(px, py, PAD_W, PAD_H),
    roboport: tileCentre(lot.x, lot.y), // fallback origin for bots: replaced if the roboport fits
    lot: tileRect(lot.x, lot.y, lot.w, lot.h),
    chests,
    carPark: tileCentre(px, py + 10, 3, 2),
    spiderPark: tileCentre(px + 6, py + 22, 4, 4),
  });

  const inPad = (x: number, y: number, w: number, h: number) =>
    x >= px && y >= py && x + w <= px + PAD_W && y + h <= py + PAD_H && ctx.free(x, y, w, h);

  // roboport
  let rx = px + 10,
    ry = py + 2,
    placedPort = false;
  {
    let bd = Infinity;
    for (let y = py; y + 4 <= py + PAD_H; y++)
      for (let x = px; x + 4 <= px + PAD_W; x++) {
        const d = Math.abs(x - (px + 10)) + Math.abs(y - (py + 2));
        if (d < bd && inPad(x, y, 4, 4)) {
          bd = d;
          rx = x;
          ry = y;
        }
      }
    placedPort = bd !== Infinity;
  }
  if (placedPort) {
    S.roboport(ctx, rx, ry);
    ctx.reserve(rx, ry, 4, 4);
    ctx.feat.machine("roboport", rx, ry, 4, 4);
    site.roboport = tileCentre(rx, ry, 4, 4);
  } else {
    // no room: bots still need an origin, so use the corner tile of the lot nearest the nominal spot
    const cx =
      Math.abs(lot.x - (px + 10)) <= Math.abs(lot.x + lot.w - 1 - (px + 10)) ? lot.x : lot.x + lot.w - 1;
    const cy =
      Math.abs(lot.y - (py + 2)) <= Math.abs(lot.y + lot.h - 1 - (py + 2)) ? lot.y : lot.y + lot.h - 1;
    site.roboport = tileCentre(cx, cy);
  }

  // station platform beside the rail mainline
  const rail = ctx.feat.features.rails.find((r) => r.a.x === r.b.x); // the mainline, not an E-W link
  if (rail) {
    const col = Math.floor(rail.a.x / T),
      y0 = Math.floor(Math.min(rail.a.y, rail.b.y) / T),
      y1 = Math.floor(Math.max(rail.a.y, rail.b.y) / T);
    let sy = -1;
    for (let y = Math.max(y0, py); y + 6 <= Math.min(y1 + 1, py + PAD_H) && sy < 0; y++)
      if (inPad(col - 2, y, 2, 6)) sy = y;
    if (sy >= 0) {
      S.station(ctx, col - 2, sy, true);
      ctx.reserve(col - 2, sy, 2, 6);
      ctx.feat.station(col, sy + 3, rail.lineId, true);
      for (let k = 1; k < 6; k += 2) ctx.feat.inserter(col - 2, sy + k, 0, true, null);
    }
  }

  // chest grid (4x4, spacing 2): the anchor with the most free chest tiles
  const addChest = (x: number, y: number, gold: boolean) => {
    S.chest(ctx, x, y, gold ? CHEST.gold : CHEST.iron);
    ctx.reserve(x, y, 1, 1);
    ctx.feat.machine("chest", x, y, 1, 1);
    chests.push(tileCentre(x, y));
  };
  {
    let best = { n: -1, x: px + 2, y: py + 7, d: 0 };
    for (let y = py + 1; y <= py + PAD_H - 7; y++)
      for (let x = px + 1; x <= px + PAD_W - 7; x++) {
        let n = 0;
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (inPad(x + i * 2, y + j * 2, 1, 1)) n++;
        const d = Math.abs(x - (px + 2)) + Math.abs(y - (py + 7));
        if (n > best.n || (n === best.n && d < best.d)) best = { n, x, y, d };
      }
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) {
        const x = best.x + i * 2,
          y = best.y + j * 2;
        if (inPad(x, y, 1, 1)) addChest(x, y, j < 2);
      }
  }
  // 12-chest row: walk right from the left edge, skipping blocked tiles
  {
    const rowAt = (y: number) => {
      const xs: number[] = [];
      for (let x = px + 1; x < px + PAD_W && xs.length < 12; x++)
        if (inPad(x, y, 1, 1) && (!xs.length || x - xs[xs.length - 1] >= 2)) xs.push(x);
      return xs;
    };
    let best: number[] = [],
      by = py + 18;
    for (let y = py + 12; y < py + PAD_H; y++) {
      const xs = rowAt(y);
      if (
        xs.length > best.length ||
        (xs.length === best.length && Math.abs(y - (py + 18)) < Math.abs(by - (py + 18)))
      ) {
        best = xs;
        by = y;
      }
    }
    for (const x of best) addChest(x, by, false);
  }

  // car park (3x2 bays) and spidertron park (4x4 ring)
  const car = nearest(ctx, 3, 2, px, px + PAD_W - 3, py, py + PAD_H - 2, px, py + 10);
  if (car) {
    site.carPark = tileCentre(car[0], car[1], 3, 2);
    ctx.p(car[0], car[1], 0, 0, 18, 1, "#8e969c");
    ctx.p(car[0], car[1] + 1, 0, 5, 18, 1, "#8e969c");
    ctx.p(car[0], car[1], 0, 0, 1, 12, "#8e969c");
    ctx.p(car[0] + 2, car[1], 5, 0, 1, 12, "#8e969c");
    ctx.p(car[0] + 1, car[1], 2, 0, 1, 12, "#8e969c");
    ctx.reserve(car[0], car[1], 3, 2);
  }
  const sp = nearest(ctx, 4, 4, px, px + PAD_W - 4, py, py + PAD_H - 4, px + 6, py + 22);
  if (sp) {
    site.spiderPark = tileCentre(sp[0], sp[1], 4, 4);
    for (const [dx, dy] of [
      [0, 0],
      [3, 0],
      [0, 3],
      [3, 3],
    ])
      ctx.p(sp[0] + dx, sp[1] + dy, 0, 0, 6, 6, "#d9a23a", 0.5);
    ctx.reserve(sp[0], sp[1], 4, 4);
  }

  for (const [x, y] of [
    [px, py],
    [px + PAD_W - 1, py],
    [px, py + PAD_H - 1],
    [px + PAD_W - 1, py + PAD_H - 1],
  ])
    if (inPad(x, y, 1, 1)) {
      S.lamp(ctx, x, y);
      ctx.reserve(x, y, 1, 1);
      ctx.feat.machine("lamp", x, y, 1, 1);
    }

  ctx.reserve(px, py, PAD_W, PAD_H);
};
