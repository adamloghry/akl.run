// live/water.ts — sparkle pixels, shore foam and the nine fish.
import { hash } from "../core/hash";
import type { DrawCtx, Features, LiveSystem, SimCtx } from "../core/types";

const FISH = 9;
const SPARKLES = 40;
const FISH_SPEED = 2; // px/s
const JUMP = 0.7;
const OFFVIEW_RESPAWN = 3;
const PLACE_TRIES = 8;

interface Fish {
  x: number;
  y: number;
  a: number;
  t: number; // until next decision
  jump: number; // seconds of jump left
  off: number; // seconds out of view
}
interface Sparkle {
  x: number;
  y: number;
  life: number;
}

export class Water implements LiveSystem {
  readonly name = "water";
  private school: Fish[] = [];
  private sparkles: Sparkle[] = [];

  /** Read-only view of the fish positions (test accessor). */
  fish(): ReadonlyArray<{ x: number; y: number }> {
    return this.school;
  }

  private place(f: Fish, ctx: SimCtx): boolean {
    const v = ctx.cam.view,
      x1 = v.x0 + v.w / v.z,
      y1 = v.y0 + v.h / v.z,
      near = ctx.view.shore.filter((p) => p.x > v.x0 && p.x < x1 && p.y > v.y0 && p.y < y1);
    if (!near.length) return false;
    // a shore point's neighbourhood is part land: retry until the candidate is water
    let found = false;
    for (let i = 0; i < PLACE_TRIES && !found; i++) {
      const p = ctx.rand.pick(near),
        x = p.x + ctx.rand.range(-4, 4),
        y = p.y + ctx.rand.range(-4, 4);
      if (!ctx.world.isLandPx(x, y)) {
        f.x = x;
        f.y = y;
        found = true;
      }
    }
    if (!found) return false;
    f.a = ctx.rand.range(0, Math.PI * 2);
    f.t = ctx.rand.range(2, 7);
    f.jump = 0;
    f.off = 0;
    return true;
  }

  update(ctx: SimCtx): void {
    const v = ctx.cam.view,
      x1 = v.x0 + v.w / v.z,
      y1 = v.y0 + v.h / v.z,
      r = ctx.rand;

    // sparkles on open water
    for (const s of this.sparkles) s.life -= ctx.dt;
    this.sparkles = this.sparkles.filter((s) => s.life > 0);
    for (let i = 0; i < 3 && this.sparkles.length < SPARKLES; i++) {
      const x = r.range(v.x0, x1),
        y = r.range(v.y0, y1);
      if (!ctx.world.isLandPx(x, y)) this.sparkles.push({ x, y, life: r.range(0.3, 0.8) });
    }

    // fish: fill up to nine once shore is in view
    while (this.school.length < FISH) {
      const f: Fish = { x: 0, y: 0, a: 0, t: 0, jump: 0, off: 0 };
      if (!this.place(f, ctx)) break;
      this.school.push(f);
    }
    for (const f of this.school) {
      const inV = f.x > v.x0 - 6 && f.x < x1 + 6 && f.y > v.y0 - 6 && f.y < y1 + 6;
      f.off = inV ? 0 : f.off + ctx.dt;
      if (f.off > OFFVIEW_RESPAWN && this.place(f, ctx)) continue;
      if (f.jump > 0) {
        f.jump -= ctx.dt;
        continue;
      }
      f.t -= ctx.dt;
      if (f.t <= 0) {
        f.t = r.range(2, 7);
        if (r.chance(0.25)) {
          f.jump = JUMP;
          ctx.live.spawn("ripple", f.x, f.y, { life: 1.4, color: "rgba(200,230,240,.7)" });
        } else f.a += (r.next() - 0.5) * 2.4;
      }
      const nx = f.x + Math.cos(f.a) * FISH_SPEED * ctx.dt,
        ny = f.y + Math.sin(f.a) * FISH_SPEED * ctx.dt;
      if (!ctx.world.isLandPx(nx, ny)) {
        f.x = nx;
        f.y = ny;
      } else f.a += 2.8;
    }
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void {
    const z = d.view.z,
      t = d.t;
    g.fillStyle = "rgba(190,220,230,.35)";
    for (const s of this.sparkles) {
      if (!d.inView(s.x, s.y, 2)) continue;
      g.fillRect(d.sx(s.x), d.sy(s.y), 2 * z, z);
    }
    g.fillStyle = "rgba(220,235,240,.42)";
    for (const p of f.shore) {
      if (!d.inView(p.x, p.y, 6)) continue;
      const hh = hash(p.x | 0, p.y | 0, 5) * Math.PI * 2,
        w = Math.sin(1.6 * t + hh);
      if (w > 0.2)
        g.fillRect(d.sx(p.x - 2 + ((w * 3) | 0)), d.sy(p.y - 1 + ((Math.cos(t + hh) * 1.5) | 0)), 3 * z, z);
    }
    for (const fi of this.school) {
      if (!d.inView(fi.x, fi.y, 6)) continue;
      if (fi.jump > 0) {
        const h = Math.sin((fi.jump / JUMP) * Math.PI) * 5;
        g.fillStyle = "#9fb4c0";
        g.fillRect(d.sx(fi.x - 1.5), d.sy(fi.y - h - 1), 3 * z, 1.5 * z);
      } else {
        g.fillStyle = "rgba(40,70,90,.9)";
        g.save();
        g.translate(d.sx(fi.x), d.sy(fi.y));
        g.rotate(fi.a);
        g.fillRect(-2 * z, -0.7 * z, 4 * z, 1.4 * z);
        g.fillRect(-3 * z, -1.2 * z, z, 2.4 * z);
        g.restore();
      }
    }
  }

  reset(): void {
    this.school = [];
    this.sparkles = [];
  }
}
