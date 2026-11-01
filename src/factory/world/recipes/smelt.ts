// Smelter district (akl:113, ref:103-114): an ore belt through the middle with furnace rows on both
// sides (input inserter from the ore belt, output inserter onto an outer plate belt).
// The row-bank layout is shared with the assembly district (see bank.ts).
// Salts: 610 furnace lit dice (ctx.h).
import type { Recipe } from "../../core/types";
import { ITEM } from "../palette";
import * as S from "../sprites";
import { bank } from "./bank";

export const smelt: Recipe = (ctx) =>
  bank(ctx, {
    kind: "furnace",
    mw: 2,
    mh: 2,
    gap: 1,
    paint: (c, x, y) => S.furnace(c, x, y, c.h(610, x, y) < 0.55),
    inLanes: [[ITEM.ore], [ITEM.ore, ITEM.coal]],
    outLanes: [[ITEM.iron], [ITEM.iron, ITEM.copper]],
    maxBlocks: 2,
    minMachines: 3,
  });
