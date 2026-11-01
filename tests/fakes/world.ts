import {
  CPX,
  emptyFeatures,
  type DistrictKind,
  type Features,
  type OverlayToken,
  type Pt,
  type Rect,
  type SiteRef,
  type WorldOverlay,
  type WorldQuery,
} from "../../src/factory/core/types";
import { fakeContext } from "./canvas";

/** Stub WorldQuery + WorldOverlay driven by hand-built Features. `kinds` keys are "cx,cy". */
export interface FakeWorld extends WorldQuery, WorldOverlay {
  features: Features;
  kinds: Map<string, DistrictKind>;
  resident: Set<string>;
  epochs: Map<string, number>;
  generation: number;
  evict(cx: number, cy: number): void;
  painted: number;
  restored: number;
}
const key = (cx: number, cy: number) => `${cx},${cy}`;

export function fakeWorld(
  features: Partial<Features> = {},
  kinds: Record<string, DistrictKind> = {},
): FakeWorld {
  const w: FakeWorld = {
    seed: 1,
    generation: 0,
    features: { ...emptyFeatures(), ...features },
    kinds: new Map(Object.entries(kinds)),
    resident: new Set(Object.keys(kinds)),
    epochs: new Map(),
    painted: 0,
    restored: 0,
    query: (_r: Rect) => w.features,
    kindAt: (cx, cy) => w.kinds.get(key(cx, cy)) ?? "wild",
    landFracAt: () => 1,
    isLandPx: () => true,
    isResident: (cx, cy) => w.resident.has(key(cx, cy)),
    epoch: (cx, cy) => (w.resident.has(key(cx, cy)) ? (w.epochs.get(key(cx, cy)) ?? 0) : -1),
    findSite(kind: DistrictKind, from: Pt, maxChunks: number): SiteRef | null {
      const fcx = Math.floor(from.x / CPX),
        fcy = Math.floor(from.y / CPX);
      let best: SiteRef | null = null;
      for (const [k, v] of w.kinds) {
        if (v !== kind) continue;
        const [cx, cy] = k.split(",").map(Number);
        const dist = Math.max(Math.abs(cx - fcx), Math.abs(cy - fcy));
        if (dist > maxChunks) continue;
        if (!best || dist < best.dist)
          best = { kind, cx, cy, dist, centre: { x: (cx + 0.5) * CPX, y: (cy + 0.5) * CPX } };
      }
      return best;
    },
    evict(cx, cy) {
      w.resident.delete(key(cx, cy));
      w.epochs.set(key(cx, cy), (w.epochs.get(key(cx, cy)) ?? 0) + 1);
      w.generation++;
    },
    saveRect(r: Rect): OverlayToken | null {
      const cx = Math.floor(r.x / CPX),
        cy = Math.floor(r.y / CPX);
      if (!w.resident.has(key(cx, cy))) return null;
      return { cx, cy, epoch: w.epoch(cx, cy), rect: r };
    },
    paint(tok, fn) {
      if (w.epoch(tok.cx, tok.cy) !== tok.epoch) return false;
      w.painted++;
      fn(fakeContext(), tok.cx * CPX, tok.cy * CPX);
      return true;
    },
    restore(tok) {
      if (w.epoch(tok.cx, tok.cy) !== tok.epoch) return false;
      w.restored++;
      return true;
    },
  };
  return w;
}
