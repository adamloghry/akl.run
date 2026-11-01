// Pure RGBA raster that chunk recipes paint into (no Canvas2D in world/**).
// One snapping rule for every painter: see makePaint.
import { T, type Color, type Paint } from "./types";

const cache = new Map<string, [number, number, number, number]>();
export function parseColor(c: Color): [number, number, number, number] {
  const hit = cache.get(c);
  if (hit) return hit;
  let out: [number, number, number, number];
  if (c[0] === "#") {
    const h = c.slice(1);
    const full =
      h.length <= 4
        ? h
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : h;
    out = [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      full.length >= 8 ? parseInt(full.slice(6, 8), 16) : 255,
    ];
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) throw new Error(`bad colour ${c}`);
    const [r, g, b, a = "1"] = m[1].split(",").map((s) => s.trim());
    out = [+r, +g, +b, Math.round(+a * 255)];
  }
  cache.set(c, out);
  return out;
}

export class Raster {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  /** Integer-pixel rect, clipped, source-over. */
  rect(x: number, y: number, w: number, h: number, c: Color, alpha = 1): void {
    const x0 = Math.max(0, x | 0),
      y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x + w) | 0),
      y1 = Math.min(this.h, (y + h) | 0);
    if (x1 <= x0 || y1 <= y0) return;
    const [r, g, b, ca] = parseColor(c);
    const a = (ca / 255) * alpha;
    if (a <= 0) return;
    const d = this.data;
    if (a >= 1) {
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * this.w + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
          d[i + 3] = 255;
        }
      }
      return;
    }
    // Straight-alpha source-over: outA = sa + da*(1-sa); colour is weighted by
    // each side's alpha and divided by outA. Uint8ClampedArray rounds the store.
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * this.w + x0) * 4;
      for (let xx = x0; xx < x1; xx++, i += 4) {
        const da = d[i + 3] / 255;
        const k = da * (1 - a);
        const outA = a + k;
        if (outA === 0) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 0;
          continue;
        }
        d[i] = (r * a + d[i] * k) / outA;
        d[i + 1] = (g * a + d[i + 1] * k) / outA;
        d[i + 2] = (b * a + d[i + 2] * k) / outA;
        d[i + 3] = outA * 255;
      }
    }
  }
}

/** Paint surface over a chunk raster whose top-left is world tile (ox, oy). */
export function makePaint(r: Raster, ox: number, oy: number): Paint {
  const X = (tx: number) => Math.round((tx - ox) * T);
  const Y = (ty: number) => Math.round((ty - oy) * T);
  const tr: Paint["tr"] = (tx, ty, w, h, c, a = 1) => {
    const x0 = X(tx),
      y0 = Y(ty);
    const x1 = Math.max(x0 + 1, X(tx + w)),
      y1 = Math.max(y0 + 1, Y(ty + h));
    r.rect(x0, y0, x1 - x0, y1 - y0, c, a);
  };
  const p: Paint["p"] = (tx, ty, dx, dy, w, h, c, a = 1) => {
    r.rect(
      X(tx) + Math.round(dx),
      Y(ty) + Math.round(dy),
      Math.max(1, Math.round(w)),
      Math.max(1, Math.round(h)),
      c,
      a,
    );
  };
  const ellipse: Paint["ellipse"] = (tx, ty, rx0, ry0, c, a = 1) => {
    const cx = X(tx),
      cy = Y(ty);
    // Integer radii keep the scanline loop symmetric about the centre.
    const rx = Math.max(1, Math.round(rx0)),
      ry = Math.max(1, Math.round(ry0));
    for (let dy = -ry; dy < ry; dy++) {
      const yy = (dy + 0.5) / ry;
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy)));
      if (half > 0) r.rect(cx - half, cy + dy, half * 2, 1, c, a);
    }
  };
  const disc: Paint["disc"] = (tx, ty, rad, c, a = 1) => ellipse(tx, ty, rad, rad, c, a);
  return { tr, p, disc, ellipse };
}
