// Pixel-art structure painters. Pure functions over Paint; (tx, ty) is the top-left tile.
// Static bases only: animated parts (chevrons, arms, flames, dishes, beams) are drawn live elsewhere.
import type { Color, Dir, Paint } from "../core/types";
import * as C from "./palette";

// ---- logistics ----

export function belt(p: Paint, tx: number, ty: number, dir: Dir): void {
  p.tr(tx, ty, 1, 1, C.BELT.base);
  const v = dir % 2 === 1;
  p.p(tx, ty, v ? 1 : 0, v ? 0 : 1, v ? 4 : 6, 4, C.BELT.inner);
}
export function inserterBase(p: Paint, tx: number, ty: number, fast: boolean): void {
  p.tr(tx, ty, 1, 1, C.INSERTER.base);
  p.p(tx, ty, 2, 2, 2, 2, fast ? C.INSERTER.fastCore : C.INSERTER.core);
}
export function pole(p: Paint, tx: number, ty: number): void {
  p.p(tx, ty, 2, 1, 2, 5, C.POLE.stem);
  p.p(tx, ty, 1, 1, 4, 1, C.POLE.arm);
}
export function bigPole(p: Paint, tx: number, ty: number): void {
  p.p(tx, ty, 3, 3, 6, 6, C.POLE.bigBody);
  p.p(tx, ty, 5, 1, 2, 10, C.POLE.bigStem);
}
export function lamp(p: Paint, tx: number, ty: number): void {
  p.p(tx, ty, 2, 2, 2, 4, C.LAMP.stem);
  p.p(tx, ty, 1, 1, 4, 2, C.LAMP.head);
}
export function chest(p: Paint, tx: number, ty: number, color: Color = C.CHEST.iron): void {
  p.tr(tx, ty, 1, 1, color);
  p.p(tx, ty, 1, 1, 4, 4, color === C.CHEST.gold ? C.CHEST.goldFill : C.CHEST.ironFill);
  p.p(tx, ty, 1, 3, 4, 1, C.CHEST.slot);
}
export function concrete(p: Paint, tx: number, ty: number, w: number, h: number): void {
  p.tr(tx, ty, w, h, C.CONCRETE.base);
  for (let i = 0; i < w; i += 2) p.p(tx + i, ty, 0, 0, 1, h * 6, C.CONCRETE.seam);
  for (let j = 0; j < h; j += 2) p.p(tx, ty + j, 0, 0, w * 6, 1, C.CONCRETE.seam);
}
export function pipeH(p: Paint, tx: number, ty: number, len: number): void {
  p.p(tx, ty, 0, 2, len * 6, 2, C.PIPE.body);
  p.p(tx, ty, 0, 2, len * 6, 1, C.PIPE.hi);
}
export function pipeV(p: Paint, tx: number, ty: number, len: number): void {
  p.p(tx, ty, 2, 0, 2, len * 6, C.PIPE.body);
  p.p(tx, ty, 2, 0, 1, len * 6, C.PIPE.hi);
}
/** One tile of track: bed, two ties, two steel rails. */
export function rail(p: Paint, tx: number, ty: number, vertical: boolean): void {
  p.tr(tx, ty, 1, 1, C.RAIL.bed);
  for (const o of [0, 3]) {
    if (vertical) p.p(tx, ty, 0, o, 6, 1, C.RAIL.tie);
    else p.p(tx, ty, o, 0, 1, 6, C.RAIL.tie);
  }
  for (const o of [1, 4]) {
    if (vertical) p.p(tx, ty, o, 0, 1, 6, C.RAIL.steel);
    else p.p(tx, ty, 0, o, 6, 1, C.RAIL.steel);
  }
}
/** Platform 2 wide x 6 tall (vertical) or 6 wide x 2 tall: concrete, inserter bases on the track side, chests outside. */
export function station(p: Paint, tx: number, ty: number, vertical: boolean): void {
  concrete(p, tx, ty, vertical ? 2 : 6, vertical ? 6 : 2);
  for (let k = 1; k < 6; k += 2) {
    const [ix, iy] = vertical ? [tx, ty + k] : [tx + k, ty];
    inserterBase(p, ix, iy, true);
    chest(p, vertical ? ix + 1 : ix, vertical ? iy : iy + 1, C.CHEST.iron);
  }
}
export function roboport(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 4, 4, C.ROBOPORT.base);
  p.p(tx, ty, 2, 2, 20, 20, C.ROBOPORT.body);
  p.p(tx, ty, 10, 3, 4, 10, C.ROBOPORT.mast);
  p.p(tx, ty, 11, -5, 2, 6, C.ROBOPORT.ant);
  p.p(tx, ty, 4, 15, 4, 4, C.ROBOPORT.light);
  p.p(tx, ty, 16, 15, 4, 4, C.ROBOPORT.light);
}
export function smallRoboport(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 2, 2, C.ROBOPORT.base);
  p.p(tx, ty, 1, 1, 10, 10, C.ROBOPORT.body);
  p.p(tx, ty, 5, 1, 2, 5, C.ROBOPORT.mast);
  p.p(tx, ty, 5, -4, 2, 5, C.ROBOPORT.ant);
  p.p(tx, ty, 2, 8, 2, 2, C.ROBOPORT.light);
  p.p(tx, ty, 8, 8, 2, 2, C.ROBOPORT.light);
}

// ---- industry ----

export function furnace(p: Paint, tx: number, ty: number, lit = false): void {
  p.tr(tx, ty, 2, 2, C.FURNACE.base);
  p.p(tx, ty, 1, 1, 10, 10, C.FURNACE.body);
  p.p(tx, ty, 3, 6, 6, 4, lit ? C.FURNACE.lit : C.FURNACE.mouth);
  p.p(tx, ty, 2, 1, 8, 2, C.FURNACE.lintel);
}
export function assembler(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.ASSEMBLER.base);
  p.p(tx, ty, 1, 1, 16, 16, C.ASSEMBLER.body);
  p.p(tx, ty, 1, 1, 16, 2, C.ASSEMBLER.trim);
  p.p(tx, ty, 6, 6, 6, 6, C.ASSEMBLER.core);
}
export function drill(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 2, 2, C.DRILL.base);
  p.p(tx, ty, 1, 1, 10, 10, C.DRILL.body);
  p.p(tx, ty, 3, 3, 6, 6, C.DRILL.core);
  p.p(tx, ty, 1, 10, 10, 1, C.DRILL.trim);
}
export function lab(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.LAB.base);
  p.p(tx, ty, 1, 1, 16, 16, C.LAB.body);
  p.p(tx, ty, 3, 3, 12, 12, C.LAB.core);
}
export function pumpjack(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.PUMPJACK.base);
  p.p(tx, ty, 2, 10, 14, 6, C.PUMPJACK.body);
  p.p(tx, ty, 8, 3, 2, 8, C.PUMPJACK.post);
}
export function refinery(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 5, 5, C.REFINERY.base);
  p.p(tx, ty, 2, 2, 26, 26, C.REFINERY.body);
  for (const x of [4, 12, 20]) p.p(tx, ty, x, 4, 6, 22, C.REFINERY.stack);
}
export function chemPlant(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.CHEM.base);
  p.p(tx, ty, 2, 2, 14, 14, C.CHEM.body);
  p.p(tx, ty, 5, 5, 8, 8, C.CHEM.core);
}
export function tank(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.TANK.base);
  p.p(tx, ty, 2, 2, 14, 14, C.TANK.body);
  p.p(tx, ty, 4, 4, 10, 10, C.TANK.base);
  p.p(tx, ty, 5, 5, 3, 3, C.TANK.hi);
}
export function solarPanel(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.SOLAR.base);
  p.p(tx, ty, 1, 1, 16, 16, C.SOLAR.body);
  for (let k = 0; k < 3; k++) {
    p.p(tx, ty, 1 + k * 6, 1, 1, 16, C.SOLAR.grid);
    p.p(tx, ty, 1, 1 + k * 6, 16, 1, C.SOLAR.grid);
  }
}
export function accumulator(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 2, 2, C.ACCUMULATOR.base);
  p.p(tx, ty, 2, 2, 8, 8, C.ACCUMULATOR.body);
}
export function radar(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 3, C.RADAR.base);
  p.p(tx, ty, 2, 2, 14, 14, C.RADAR.body);
  p.p(tx, ty, 6, 10, 6, 6, C.RADAR.core);
}
export function boiler(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 3, 2, C.BOILER.base);
  p.p(tx, ty, 2, 2, 14, 8, C.BOILER.body);
  p.p(tx, ty, 6, 6, 6, 4, C.BOILER.mouth);
}
/** 3 wide x 5 tall by default; `horizontal` gives the 5 x 3 layout used by the reference mock. */
export function steamEngine(p: Paint, tx: number, ty: number, horizontal = false): void {
  const [w, h] = horizontal ? [5, 3] : [3, 5];
  p.tr(tx, ty, w, h, C.ENGINE.base);
  p.p(tx, ty, 2, 2, w * 6 - 4, h * 6 - 4, C.ENGINE.body);
  if (horizontal) p.p(tx, ty, 4, 6, 22, 6, C.ENGINE.core);
  else p.p(tx, ty, 6, 4, 6, 22, C.ENGINE.core);
}
export function offshorePump(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 1, 2, C.OFFSHORE.body);
  p.p(tx, ty, 1, 2, 4, 8, C.OFFSHORE.core);
}

// ---- military ----

export function wall(p: Paint, tx: number, ty: number, w = 1, h = 1): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      p.tr(tx + i, ty + j, 1, 1, C.WALL.base);
      p.p(tx + i, ty + j, 0, 3, 6, 1, C.WALL.seam);
      p.p(tx + i, ty + j, 3, 0, 1, 3, C.WALL.seam);
      p.p(tx + i, ty + j, 0, 0, 6, 1, C.WALL.top);
    }
}
export function turret(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 2, 2, C.TURRET.base);
  p.p(tx, ty, 2, 2, 8, 8, C.TURRET.body);
  p.p(tx, ty, 5, 5, 2, 2, C.TURRET.barrel);
}
export function silo(p: Paint, tx: number, ty: number): void {
  p.tr(tx, ty, 9, 9, C.SILO.base);
  p.p(tx, ty, 3, 3, 48, 48, C.SILO.body);
  p.p(tx, ty, 18, 6, 18, 42, C.SILO.slot);
  for (let i = 0; i < 27; i++) {
    const c = i % 2 ? C.SILO.hazardA : C.SILO.hazardB;
    p.p(tx, ty, i * 2, 0, 2, 2, c);
    p.p(tx, ty, i * 2, 52, 2, 2, c);
    p.p(tx, ty, 0, i * 2, 2, 2, c);
    p.p(tx, ty, 52, i * 2, 2, 2, c);
  }
}
export function spawner(p: Paint, tx: number, ty: number): void {
  const cx = tx + 1.5,
    cy = ty + 1.5;
  p.ellipse(cx, cy, 9, 8, C.SPAWNER.rim);
  p.ellipse(cx - 2 / 6, cy - 2 / 6, 6, 5, C.SPAWNER.body);
  p.ellipse(cx + 3 / 6, cy + 1 / 6, 3, 3, C.SPAWNER.spot);
  p.ellipse(cx - 6 / 6, cy + 3 / 6, 2, 2, C.SPAWNER.spot);
}
export function worm(p: Paint, tx: number, ty: number): void {
  p.ellipse(tx + 1, ty + 1, 6, 5, C.WORM.body);
  p.ellipse(tx + 1, ty + 1, 2, 2, C.WORM.mouth);
}

// ---- nature ----

export function tree(p: Paint, tx: number, ty: number, dark: boolean): void {
  const [a, b] = dark ? C.TREE.dark : C.TREE.light;
  p.p(tx, ty, 0, 0, 6, 5, a);
  p.p(tx, ty, 1, 0, 3, 3, b);
  p.p(tx, ty, 2, 5, 2, 1, C.TREE.shade);
  p.p(tx, ty, 5, 4, 1, 1, C.TREE.shade);
}
export function deadTree(p: Paint, tx: number, ty: number): void {
  p.p(tx, ty, 2, 1, 2, 5, C.TREE.dead);
  p.p(tx, ty, 1, 2, 1, 1, C.TREE.dead);
  p.p(tx, ty, 4, 1, 1, 1, C.TREE.dead);
}
export function rock(p: Paint, tx: number, ty: number): void {
  p.p(tx, ty, 1, 2, 4, 3, C.ROCK.body);
  p.p(tx, ty, 1, 2, 2, 1, C.ROCK.hi);
}
/** Nest ground tint; `h` is the tile hash in [0,1) (selects shade and speckle). */
export function creep(p: Paint, tx: number, ty: number, h: number): void {
  p.tr(tx, ty, 1, 1, h < 0.5 ? C.CREEP.a : C.CREEP.b);
  if (h > 0.8) p.p(tx, ty, 2, 2, 2, 2, C.CREEP.speckle);
}
