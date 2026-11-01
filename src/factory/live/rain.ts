import { hash } from "../core/hash";
import type { DrawCtx, Features, LiveSystem, SimCtx } from "../core/types";

export class Rain implements LiveSystem {
  readonly name = "rain";
  update(_ctx: SimCtx): void {}

  draw(g: CanvasRenderingContext2D, d: DrawCtx, _f?: Features): void {
    const { w, h } = d.view,
      t = d.t;
    if (d.env.raining) {
      g.globalAlpha = 1;
      const u = Math.min(1, Math.max(0, (d.env.night - 0.2) / 0.3)),
        k = u * u * (3 - 2 * u), // smoothstep over night [0.2, 0.5]
        mix = (a: number, b: number) => +(a + (b - a) * k).toFixed(4);
      g.fillStyle = `rgba(${mix(30, 20)},${mix(40, 40)},${mix(60, 70)},${mix(0.12, 0.18)})`;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(200,220,240,.28)";
      g.lineWidth = 1;
      g.beginPath();
      const n = Math.min(260, ((w * h) / 4200) | 0);
      for (let i = 0; i < n; i++) {
        const x = ((hash(i, 7, 2) * w + t * 60 * (1 + hash(i, 1, 2))) % (w + 40)) - 20,
          y = ((hash(i, 9, 3) * h + t * (420 + hash(i, 3, 4) * 220)) % (h + 40)) - 20;
        g.moveTo(x, y);
        g.lineTo(x - 2, y + 9);
      }
      g.stroke();
    }
    if (d.env.flash > 0) {
      g.globalAlpha = Math.min(0.55, d.env.flash);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
  }

  reset(): void {}
}
