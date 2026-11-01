// Shared row-bank layout used by the smelter and assembly districts: an input belt row with machine
// rows on both sides (inner input inserter, machine, outer output inserter, outer product belt).
// Salts: none (callers' paint callbacks may use their own).
import type { Color, MachineKind, RecipeCtx } from "../../core/types";
import * as S from "../sprites";

export interface BankSpec {
  kind: MachineKind;
  mw: number; // machine width / height in tiles
  mh: number;
  gap: number; // columns between machines (pole column)
  paint(ctx: RecipeCtx, x: number, y: number): void;
  inLanes: [Color[], Color[]];
  outLanes: [Color[], Color[]];
  maxBlocks: number;
  minMachines: number; // a block below this is not worth placing
}

interface Slot {
  x: number;
  top: boolean;
  bottom: boolean;
}
interface Run {
  by: number;
  slots: Slot[];
  score: number;
}

/** Rows (relative to the input belt row `by`): inner inserters by∓1, machines, outer inserters, plate belts. */
export function bank(ctx: RecipeCtx, s: BankSpec): void {
  const { mw, mh } = s,
    step = mw + s.gap;
  const x1 = ctx.ox + 32;
  const topBelt = (by: number) => by - 3 - mh,
    botBelt = (by: number) => by + 3 + mh;
  const findRun = (): Run | null => {
    let best: Run | null = null;
    for (let by = ctx.oy + 1; by < ctx.oy + 31; by++) {
      let slots: Slot[] = [];
      const close = () => {
        const score = slots.reduce((n, q) => n + +q.top + +q.bottom, 0);
        if (score >= s.minMachines && (!best || score > best.score)) best = { by, slots, score };
        slots = [];
      };
      let x = ctx.ox;
      while (x + mw <= x1) {
        let ok = ctx.free(x, by, mw, 1);
        for (let k = mw; ok && k < step; k++) ok = x + k >= x1 || ctx.free(x + k, by, 1, 1);
        const span = Math.min(step, x1 - x);
        const top =
          ok &&
          ctx.free(x, by - 2 - mh, mw, mh + 2) &&
          ctx.free(x, topBelt(by), span, 1) &&
          by - 3 - mh >= ctx.oy;
        const bottom =
          ok &&
          ctx.free(x, by + 1, mw, mh + 2) &&
          ctx.free(x, botBelt(by), span, 1) &&
          botBelt(by) < ctx.oy + 32;
        if (top || bottom) {
          slots.push({ x, top, bottom });
          x += step;
        } else {
          if (slots.length) close();
          x++;
        }
      }
      if (slots.length) close();
    }
    return best;
  };

  for (let block = 0; block < s.maxBlocks; block++) {
    const run = findRun();
    if (!run) return;
    const { by, slots } = run;
    const xa = slots[0].x,
      xb = slots[slots.length - 1].x + mw - 1;
    const beltRow = (row: number, xs: number, xe: number, lanes: [Color[], Color[]]) => {
      const tiles: [number, number][] = [];
      for (let x = xs; x <= xe; x++) {
        tiles.push([x, row]);
        S.belt(ctx, x, row, 0);
      }
      ctx.reserve(xs, row, xe - xs + 1, 1);
      return ctx.feat.belt(tiles, lanes);
    };
    const input = beltRow(by, xa, xb, s.inLanes);
    for (const side of [0, 1] as const) {
      const dir = side === 0 ? 3 : 1;
      const row = side === 0 ? topBelt(by) : botBelt(by);
      const inner = side === 0 ? by - 1 : by + 1;
      const outer = side === 0 ? by - 2 - mh : by + 2 + mh;
      const my = side === 0 ? by - 1 - mh : by + 2;
      const has = (q: Slot) => (side === 0 ? q.top : q.bottom);
      for (let i = 0; i < slots.length; ) {
        if (!has(slots[i])) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < slots.length && has(slots[j + 1])) j++;
        const out = beltRow(row, slots[i].x, slots[j].x + mw - 1, s.outLanes);
        for (let k = i; k <= j; k++) {
          const q = slots[k],
            ix = q.x + ((mw - 1) >> 1);
          s.paint(ctx, q.x, my);
          ctx.reserve(q.x, my, mw, mh);
          ctx.feat.machine(s.kind, q.x, my, mw, mh);
          S.inserterBase(ctx, ix, inner, false);
          ctx.feat.inserter(ix, inner, dir, false, input.id);
          S.inserterBase(ctx, ix, outer, true);
          ctx.feat.inserter(ix, outer, dir, true, out.id);
          ctx.reserve(ix, inner, 1, 1);
          ctx.reserve(ix, outer, 1, 1);
          const px = q.x + mw;
          if (k < slots.length - 1 && k % 2 === 0 && ctx.free(px, inner, 1, 1)) {
            S.pole(ctx, px, inner);
            ctx.reserve(px, inner, 1, 1);
            ctx.feat.machine("pole", px, inner, 1, 1);
          }
        }
        i = j + 1;
      }
    }
  }
}
