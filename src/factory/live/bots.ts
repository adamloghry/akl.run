// live/bots.ts — yellow logistic bots shuttling between on-screen structures.
import type { DrawCtx, Features, LiveSystem, Pt, SimCtx } from "../core/types";

const MAX_BOTS = 10;
const MIX = ["#b9c3cc", "#e09457", "#3a3a3a", "#d8463c", "#3fa34d", "#3a7bd5"];
const STOPS = new Set(["chest", "assembler", "roboport"]);

interface Bot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  v: number;
  item: string | null;
  ph: number;
}

export class Bots implements LiveSystem {
  readonly name = "bots";
  private bots: Bot[] = [];

  update(ctx: SimCtx): void {
    const v = ctx.cam.view,
      m = 40,
      x1 = v.x0 + v.w / v.z,
      y1 = v.y0 + v.h / v.z,
      r = ctx.rand,
      stops: Pt[] = ctx.view.machines
        .filter(
          (q) =>
            STOPS.has(q.kind) && q.at.x > v.x0 - m && q.at.x < x1 + m && q.at.y > v.y0 - m && q.at.y < y1 + m,
        )
        .map((q) => q.at);
    if (stops.length < 2) {
      this.bots = [];
      return;
    }
    if (this.bots.length < MAX_BOTS && r.chance(ctx.dt * 0.6)) {
      const a = r.pick(stops),
        b = r.pick(stops);
      this.bots.push({
        x: a.x,
        y: a.y,
        tx: b.x,
        ty: b.y,
        v: 16 + r.range(0, 10),
        item: r.chance(0.6) ? r.pick(MIX) : null,
        ph: r.range(0, 6),
      });
    }
    for (const b of this.bots) {
      const dx = b.tx - b.x,
        dy = b.ty - b.y,
        dist = Math.hypot(dx, dy);
      if (dist < 2) {
        const e = r.pick(stops);
        b.tx = e.x;
        b.ty = e.y;
        b.item = r.chance(0.5) ? null : r.pick(MIX);
      } else {
        b.x += (dx / dist) * b.v * ctx.dt;
        b.y += (dy / dist) * b.v * ctx.dt;
      }
      b.ph += ctx.dt * 4;
    }
    ctx.stats.bots += this.bots.length;
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, _f: Features): void {
    const z = d.view.z;
    for (const b of this.bots) {
      if (!d.inView(b.x, b.y, 6)) continue;
      const bob = Math.sin(b.ph) * 0.6;
      g.fillStyle = "rgba(0,0,0,.25)";
      g.fillRect(d.sx(b.x + 1.5), d.sy(b.y + 3), 2.5 * z, 1.5 * z);
      g.fillStyle = "#e8c23a";
      g.fillRect(d.sx(b.x - 1), d.sy(b.y - 1 + bob), 2.5 * z, 2.5 * z);
      if (b.item) {
        g.fillStyle = b.item;
        g.fillRect(d.sx(b.x - 0.5), d.sy(b.y + 1.8 + bob), 1.6 * z, 1.6 * z);
      }
    }
  }

  reset(): void {
    this.bots = [];
  }
}
