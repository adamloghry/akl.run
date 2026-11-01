// One line per kind: Tasks 15/16 replace their own lines with the real recipes.
import type { DistrictKind, Recipe } from "../../core/types";
import { asm } from "./asm";
import { hub } from "./hub";
import { labs } from "./labs";
import { mine } from "./mine";
import { nest } from "./nest";
import { oil } from "./oil";
import { outpost } from "./outpost";
import { power } from "./power";
import { silo } from "./silo";
import { smelt } from "./smelt";
import { solar } from "./solar";
import { storage } from "./storage";

const none: Recipe = () => {};

export const RECIPES: Record<DistrictKind, Recipe> = {
  wild: none,
  outpost,
  mine,
  smelt,
  asm,
  power,
  hub,
  nest,
  labs,
  solar,
  oil,
  storage,
  silo,
};
