// Assembly district (akl:114-118, ref:103-114): a plate bus through the middle with assembler rows on
// both sides, input and output inserters and outer product belts. Reuses the smelter row-bank layout.
// Salts: none of its own (620-629 reserved).
import type { Recipe } from "../../core/types";
import { ITEM } from "../palette";
import * as S from "../sprites";
import { bank } from "./bank";

export const asm: Recipe = (ctx) =>
  bank(ctx, {
    kind: "assembler",
    mw: 3,
    mh: 3,
    gap: 1,
    paint: S.assembler,
    inLanes: [[ITEM.iron], [ITEM.iron, ITEM.copper]],
    outLanes: [[ITEM.circuit], [ITEM.gear, ITEM.circuit]],
    maxBlocks: 2,
    minMachines: 2,
  });
