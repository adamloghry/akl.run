import type { DrawCtx, Features, LiveSystem, ParticleKind, ParticleOpts, SimCtx } from "../core/types";

const POOLED: readonly ParticleKind[] = ["smoke", "steam", "puff", "dust"];
export const CAPS: Record<ParticleKind, number> = {
  smoke: 400,
  steam: 400,
  puff: 400,
  dust: 400, // these four share one pool of 400
  ember: 200,
  splat: 120,
  corpse: 60,
  tracer: 40,
  ripple: 20,
  spark: 40,
};
const poolOf = (k: ParticleKind): ParticleKind => (POOLED.includes(k) ? "smoke" : k);

interface P {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  x2: number;
  y2: number;
  init: boolean; // defaults needing randomness are filled on first update
  o: ParticleOpts;
}

export class Particles implements LiveSystem {
  readonly name = "particles";
  private ps: P[] = [];
  private pool = new Map<ParticleKind, number>();

  spawn(k: ParticleKind, x: number, y: number, o: ParticleOpts = {}): void {
    const pk = poolOf(k);
    const n = this.pool.get(pk) ?? 0;
    if (n >= CAPS[k]) return;
    this.pool.set(pk, n + 1);
    this.ps.push({
      kind: k,
      x,
      y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      age: 0,
      life: o.life ?? 1,
      size: o.size ?? 1,
      color: o.color ?? "",
      x2: o.x2 ?? x,
      y2: o.y2 ?? y,
      init: false,
      o,
    });
  }

  count(k?: ParticleKind): number {
    if (k === undefined) return this.ps.length;
    let n = 0;
    for (const p of this.ps) if (p.kind === k) n++;
    return n;
  }

  update(ctx: SimCtx): void {
    const dt = ctx.dt;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      if (!p.init) {
        p.init = true;
        this.initDefaults(p, ctx);
      }
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      switch (p.kind) {
        case "smoke":
        case "steam":
        case "puff":
        case "dust":
          p.vy *= 1 - dt * 0.3;
          p.size += dt * 1.1;
          break;
        case "splat":
          p.vy += 30 * dt;
          break;
      }
      if (p.age > p.life) {
        const pk = poolOf(p.kind);
        this.pool.set(pk, (this.pool.get(pk) ?? 1) - 1);
        this.ps[i] = this.ps[this.ps.length - 1];
        this.ps.pop();
      }
    }
  }

  private initDefaults(p: P, ctx: SimCtx): void {
    const r = ctx.rand,
      o = p.o;
    switch (p.kind) {
      case "smoke":
        p.vx = o.vx ?? 3 + r.next() * 2;
        p.vy = o.vy ?? -4 - r.next() * 3;
        p.life = o.life ?? 8 + r.next() * 6;
        p.size = o.size ?? 1.5 + r.next();
        break;
      case "steam":
        p.vx = o.vx ?? 1 + r.next() * 2;
        p.vy = o.vy ?? -6 - r.next() * 3;
        p.life = o.life ?? 2.5 + r.next() * 1.5;
        p.size = o.size ?? 1.2 + r.next() * 0.5;
        break;
      case "puff":
        p.vx = o.vx ?? 4;
        p.vy = o.vy ?? -5;
        p.life = o.life ?? 1.6;
        p.size = o.size ?? 0.8;
        break;
      case "dust":
        p.vx = o.vx ?? r.range(-3, 3);
        p.vy = o.vy ?? r.range(-3, 0);
        p.life = o.life ?? 1.2;
        p.size = o.size ?? 1;
        break;
      case "ember":
        p.vx = o.vx ?? r.range(-4, 4);
        p.vy = o.vy ?? r.range(-9, -3);
        p.life = o.life ?? r.range(0.6, 1);
        p.size = 1;
        break;
      case "splat":
        p.vx = o.vx ?? r.range(-6, 6);
        p.vy = o.vy ?? r.range(-10, -2);
        p.life = o.life ?? 4;
        p.size = o.size ?? 6;
        break;
      case "corpse":
        p.life = o.life ?? 30;
        p.size = o.size ?? 5;
        break;
      case "tracer":
        p.life = o.life ?? 0.07;
        break;
      case "ripple":
        p.life = o.life ?? 0.8;
        p.size = o.size ?? 5;
        break;
      case "spark":
        p.vx = o.vx ?? r.range(-12, 12);
        p.vy = o.vy ?? r.range(-12, 12);
        p.life = o.life ?? 0.2;
        p.size = 1;
        break;
    }
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, _f?: Features): void {
    const z = d.view.z;
    for (const p of this.ps) {
      const fade = p.life > 0 ? Math.min(1, Math.max(0, 1 - p.age / p.life)) : 0;
      const sx = d.sx(p.x),
        sy = d.sy(p.y);
      if (p.kind === "tracer") {
        if (!d.inView(p.x, p.y, 8) && !d.inView(p.x2, p.y2, 8)) continue;
        g.globalAlpha = fade;
        g.strokeStyle = p.color || "#ffe8a0";
        g.lineWidth = Math.max(1, z * 0.5);
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(d.sx(p.x2), d.sy(p.y2));
        g.stroke();
        continue;
      }
      if (!d.inView(p.x, p.y, 8 + p.size)) continue;
      const s = p.size * z;
      switch (p.kind) {
        case "smoke":
        case "steam":
        case "puff":
        case "dust": {
          const base = p.kind === "steam" ? 0.3 : p.kind === "dust" ? 0.35 : p.kind === "puff" ? 0.4 : 0.28;
          g.globalAlpha = base * Math.min(1, p.age * 4) * fade;
          g.fillStyle =
            p.color || (p.kind === "steam" ? "#dfe8ee" : p.kind === "dust" ? "#8a7a5a" : "#9a9a96");
          g.beginPath();
          g.arc(sx, sy, s, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case "ember":
          g.globalAlpha = fade;
          g.fillStyle = p.color || "#ffb347";
          g.fillRect(sx, sy, Math.max(1, z), Math.max(1, z));
          break;
        case "splat":
          g.globalAlpha = fade * 0.8;
          g.fillStyle = p.color || "#6c8a2c";
          g.fillRect(sx - s / 2, sy - s / 2, s, s);
          break;
        case "corpse":
          g.globalAlpha = fade * 0.9;
          g.fillStyle = p.color || "#4a5a24";
          g.fillRect(sx - s / 2, sy - s / 2, s, s / 2);
          break;
        case "ripple": {
          const k = p.age / p.life;
          g.globalAlpha = fade * 0.5;
          g.strokeStyle = p.color || "#9cc4d4";
          g.lineWidth = Math.max(1, z * 0.5);
          g.beginPath();
          g.arc(sx, sy, (1 + p.size * k) * z, 0, Math.PI * 2);
          g.stroke();
          break;
        }
        case "spark":
          g.globalAlpha = fade;
          g.fillStyle = p.color || "#ffffff";
          g.fillRect(sx, sy, Math.max(1, z), Math.max(1, z));
          break;
      }
    }
    g.globalAlpha = 1;
  }

  reset(): void {
    this.ps.length = 0;
    this.pool.clear();
  }
}
