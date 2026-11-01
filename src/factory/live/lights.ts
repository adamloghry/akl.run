import { hash } from "../core/hash";
import type { DrawCtx, Features, LightColor, LightSource } from "../core/types";

const RGB: Record<LightColor, string> = {
  warm: "255,220,150",
  blue: "140,190,255",
  white: "255,255,255",
  red: "255,80,60",
  orange: "255,160,60",
  green: "120,255,140",
};

/** Queued lights are drawn at this fraction of their nominal radius (glows read small and crisp). */
const GLOW = 0.55;

const strHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
};

export class Lights {
  private sprites: Partial<Record<LightColor, CanvasImageSource>> = {};

  /** One 64 px radial sprite per colour, created on first use (never at import). */
  private sprite(c: LightColor): CanvasImageSource {
    let s = this.sprites[c];
    if (s) return s;
    if (typeof document === "undefined") {
      s = { width: 64, height: 64 } as unknown as CanvasImageSource; // Node tests: stand-in
    } else {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const g = cv.getContext("2d")!,
        gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      // bright core with a quick falloff: a crisp halo rather than a washed-out blob
      gr.addColorStop(0, `rgba(${RGB[c]},1)`);
      gr.addColorStop(0.3, `rgba(${RGB[c]},0.5)`);
      gr.addColorStop(0.65, `rgba(${RGB[c]},0.15)`);
      gr.addColorStop(1, `rgba(${RGB[c]},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      s = cv;
    }
    this.sprites[c] = s;
    return s;
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, f: Features, queued: LightSource[]): void {
    const night = d.env.night,
      z = d.view.z;
    if (night > 0) {
      g.globalAlpha = 1;
      g.fillStyle = `rgba(8,14,38,${0.5 * night})`;
      g.fillRect(0, 0, d.view.w, d.view.h);
    }
    g.globalCompositeOperation = "lighter";
    if (night > 0) {
      const on = Math.min(1, Math.max(0, (night - 0.25) * 3));
      if (on > 0) {
        for (const m of f.machines) {
          if (m.kind !== "lamp" || !d.inView(m.at.x, m.at.y, 40)) continue;
          let k = on;
          if (on < 1) k = on * (hash(strHash(m.id), (d.t * 18) | 0, 5) > 0.35 ? 1 : 0.15);
          if (k <= 0) continue;
          g.globalAlpha = k * d.env.sat;
          const x = d.sx(m.at.x),
            y = d.sy(m.at.y),
            r = 20 * z; // ~40 world px halo (about 60 px on screen at the 2.4x target zoom)
          g.drawImage(this.sprite("warm"), x - r, y - r, r * 2, r * 2);
          g.fillStyle = "#fff2c8";
          g.fillRect(x - z, y - 2 * z, 2 * z, 2 * z);
        }
      }
    }
    for (const l of queued) {
      if (l.a <= 0) continue;
      if (night <= 0 && l.color !== "white" && l.color !== "orange") continue;
      if (!d.inView(l.x, l.y, Math.max(l.r, l.cone?.len ?? 0) + 40)) continue;
      const x = d.sx(l.x),
        y = d.sy(l.y);
      if (l.cone) {
        const { ang, spread, len } = l.cone,
          L = len * z;
        g.fillStyle = `rgb(${RGB[l.color]})`;
        for (let i = 0; i < 3; i++) {
          const s = spread * (1 - i * 0.3);
          g.globalAlpha = l.a * 0.18;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(ang - s) * L, y + Math.sin(ang - s) * L);
          g.lineTo(x + Math.cos(ang + s) * L, y + Math.sin(ang + s) * L);
          g.closePath();
          g.fill();
        }
      } else {
        g.globalAlpha = l.a;
        const r = l.r * GLOW * z;
        g.drawImage(this.sprite(l.color), x - r, y - r, r * 2, r * 2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}
