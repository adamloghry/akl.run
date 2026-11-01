// core/rng.ts — ephemeral randomness for animation and events only.
// Calls Math.random at call time so capture-og's pinned LCG and tests can
// replace it. Never import from world/**.
import type { Rand } from "./types";

let override: (() => number) | null = null;
export function setRandom(fn: (() => number) | null): void {
  override = fn;
}
const next = (): number => (override ? override() : Math.random());

export const rand: Rand = {
  next,
  range: (a, b) => a + (b - a) * next(),
  int: (a, b) => a + Math.floor((b - a) * next()),
  pick: (arr) => arr[Math.floor(arr.length * next())],
  chance: (p) => next() < p,
};
