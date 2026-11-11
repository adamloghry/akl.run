// Colour constants for the world layer. No logic. Ported from the previous mapgen.js (PAL) and the
// handoff engine reference (ITEM and per-structure literals).

export const PAL = {
  water: ["#122c38", "#14303c", "#173743", "#1a3e4c"],
  grass: ["#3a4620", "#404d22", "#465425", "#4c5a28", "#52602c"],
  dirt: ["#5c4c2e", "#665434", "#6f5c39"],
  sand: ["#8a7748", "#94804f", "#9c8853"],
  ore: [
    ["#5d7787", "#7e99ab", "#a5bac7"],
    ["#a3603a", "#c67f50", "#e0a06b"],
    ["#242424", "#3a3a3a", "#555550"],
    ["#8c8268", "#a89f83", "#c2b997"],
  ],
};

export const ITEM = {
  iron: "#b9c3cc",
  copper: "#e09457",
  circuit: "#3fa34d",
  gear: "#8d949a",
  ore: "#6f7f91",
  coal: "#2c2c2c",
  red: "#c0392b",
  plastic: "#e8e8e8",
};

export const BELT = { base: "#2e2f31", inner: "#3a3b3e" };
export const INSERTER = { base: "#34363a", core: "#1f2022", fastCore: "#1f2c44" };
export const FURNACE = {
  base: "#6b625a",
  body: "#7a7066",
  mouth: "#2a2420",
  lit: "#ff8a2a",
  lintel: "#5c544c",
};
export const ASSEMBLER = { base: "#3f4b5c", body: "#4f5d70", trim: "#d9a23a", core: "#2b333d" };
export const DRILL = { base: "#4e5358", body: "#5a6068", core: "#2f3337", trim: "#d7b64b" };
export const POLE = { stem: "#6e5a3a", arm: "#8c7a52", bigBody: "#4a4d52", bigStem: "#6b6f75" };
export const LAMP = { stem: "#8a8f94", head: "#c9ced2" };
export const CHEST = {
  iron: "#7f8a92",
  gold: "#c9a227",
  ironFill: "#8c9398",
  goldFill: "#e3bd3a",
  slot: "#2a2a2a",
};
export const CONCRETE = { base: "#5f6468", seam: "#575b5f" };
export const WALL = { base: "#8e969c", seam: "#6b7378", top: "#b4bcc1" };
export const TURRET = { base: "#5b6064", body: "#6a6f73", barrel: "#3a3e42" };
export const PIPE = { body: "#8a8f95", hi: "#aab0b6" };
export const RAIL = { bed: "#6a625a", tie: "#4e3d2a", steel: "#b4b8bc" };
export const ROAD = { asphalt: "#4b4a45", edge: "#5a5952", dash: "#d9b420", dashEW: "#8a8780" };
export const BRIDGE = { deck: "#6e604c", seam: "#5a4e3d", rail: "#a89d86", shadow: "#0f2a35" };
export const ROBOPORT = {
  base: "#4c5055",
  body: "#5d6166",
  mast: "#3a3d41",
  light: "#2f3236",
  ant: "#8a9096",
};
export const SILO = {
  base: "#4a4f55",
  body: "#3e4348",
  slot: "#2b2f33",
  hazardA: "#e0b73a",
  hazardB: "#1f2124",
};
export const PUMPJACK = { base: "#4c4f54", body: "#5a5e63", post: "#7a7f85" };
export const REFINERY = { base: "#55595e", body: "#656a70", stack: "#4f545a" };
export const CHEM = { base: "#4a5a4a", body: "#5c6e5a", core: "#2f3f2e" };
export const TANK = { base: "#6b7075", body: "#8a9096", hi: "#a6acb2" };
export const SOLAR = { base: "#1b2a40", body: "#223a5c", grid: "#2f4e78" };
export const ACCUMULATOR = { base: "#4f5861", body: "#5c6670" };
export const LAB = { base: "#c9ced2", body: "#dfe3e6", core: "#9aa3ab" };
export const RADAR = { base: "#4d5258", body: "#555a60", core: "#3a3e43" };
export const BOILER = { base: "#5b5248", body: "#6a6057", mouth: "#2a2420" };
export const ENGINE = { base: "#6d7278", body: "#7c8187", core: "#5a5f65" };
export const OFFSHORE = { body: "#4d7a9a", core: "#2d5a7a" };
export const SPAWNER = { rim: "#8a3f4a", body: "#a65a5a", spot: "#d58a7a" };
export const WORM = { body: "#b86a60", mouth: "#5a2a30" };
export const TREE = {
  light: ["#2f4a26", "#3f6232"],
  dark: ["#223a1c", "#2f5228"],
  shade: "#1d2d16",
  dead: "#4a3a30",
};
export const ROCK = { body: "#6d6a62", hi: "#8c8a82" };
export const CREEP = { a: "#5e3a36", b: "#6b433d", speckle: "#7a4a44" };
