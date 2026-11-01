// Overlay token API: save / paint / restore pixels of a resident chunk canvas.
// The only Canvas2D user in world/.
import { CPX, type OverlayToken, type Rect, type WorldOverlay } from "../core/types";

export interface OverlayHost {
  /** Resident chunk canvas and epoch for (cx, cy), without touching LRU order. */
  lookup(cx: number, cy: number): { canvas: HTMLCanvasElement; epoch: number } | undefined;
}

interface Saved {
  img: ImageData;
  lx: number;
  ly: number;
}

export function createOverlay(host: OverlayHost): WorldOverlay {
  const saved = new WeakMap<OverlayToken, Saved>();
  const live = (tok: OverlayToken) => {
    const r = host.lookup(tok.cx, tok.cy);
    return r && r.epoch === tok.epoch ? r : undefined;
  };
  return {
    saveRect(r: Rect): OverlayToken | null {
      const cx = Math.floor(r.x / CPX),
        cy = Math.floor(r.y / CPX);
      const hit = host.lookup(cx, cy);
      if (!hit) return null;
      const lx = Math.max(0, Math.floor(r.x - cx * CPX)),
        ly = Math.max(0, Math.floor(r.y - cy * CPX));
      const w = Math.max(1, Math.min(CPX - lx, Math.ceil(r.x + r.w - cx * CPX) - lx)),
        h = Math.max(1, Math.min(CPX - ly, Math.ceil(r.y + r.h - cy * CPX) - ly));
      const g = hit.canvas.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      const tok: OverlayToken = { cx, cy, epoch: hit.epoch, rect: { x: r.x, y: r.y, w: r.w, h: r.h } };
      saved.set(tok, { img: g.getImageData(lx, ly, w, h), lx, ly });
      return tok;
    },
    paint(tok, fn) {
      const hit = live(tok);
      const g = hit?.canvas.getContext("2d", { willReadFrequently: true });
      if (!hit || !g) return false;
      fn(g, tok.cx * CPX, tok.cy * CPX);
      return true;
    },
    restore(tok) {
      const hit = live(tok);
      const s = saved.get(tok);
      const g = hit?.canvas.getContext("2d", { willReadFrequently: true });
      if (!hit || !s || !g) return false;
      g.putImageData(s.img, s.lx, s.ly);
      return true;
    },
  };
}
