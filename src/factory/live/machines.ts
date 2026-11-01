// live/machines.ts — per-kind animation drawn over the pre-rendered chunks, plus
// the particles and night lights the machines emit. Timers advance in update();
// everything else is a pure function of the draw clock and the stable id.
import type { DrawCtx, Features, LiveSystem, Machine, Pt, SimCtx } from "../core/types";

const FORGET_AFTER = 10;
const TAU = Math.PI * 2;
const LAB_COLS = ["#d8463c", "#3fa34d", "#3a7bd5", "#8e44ad", "#f0b054"];
const JAM_RADIUS = 18;

/** Distance from point (px,py) to segment a-b. */
function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l2 = dx * dx + dy * dy,
    u = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - (a.x + u * dx), py - (a.y + u * dy));
}

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

interface MState {
  ph: number; // 0..2π, from the id
  seen: number;
  starved: boolean; // furnace: a belt within 18 px is jammed
  puffIn: number; // engine steam timer
  blinkIn: number; // assembler: seconds until next stripe blink
  blink: number; // assembler: seconds of blink remaining
}

export class Machines implements LiveSystem {
  readonly name = "machines";
  private state = new Map<string, MState>();

  /** Number of machines with live per-entity state (test accessor). */
  tracked(): number {
    return this.state.size;
  }

  private get(m: Machine, t: number): MState {
    let s = this.state.get(m.id);
    if (!s) {
      s = {
        ph: strHash(m.id) * TAU,
        seen: t,
        starved: false,
        puffIn: strHash(m.id + "p") * 0.5,
        blinkIn: 3 + strHash(m.id + "b") * 4,
        blink: 0,
      };
      this.state.set(m.id, s);
    }
    s.seen = t;
    return s;
  }

  update(ctx: SimCtx): void {
    const v = ctx.cam.view,
      x1 = v.x0 + v.w / v.z,
      y1 = v.y0 + v.h / v.z,
      vis = (x: number, y: number, m: number) => x > v.x0 - m && x < x1 + m && y > v.y0 - m && y < y1 + m;
    // jammed belt polylines, for furnace starvation
    const jammed: Pt[][] = [];
    for (const b of ctx.view.belts) if (ctx.live.isJammed(b.id)) jammed.push(b.pts);
    const r = ctx.rand;
    for (const m of ctx.view.machines) {
      const s = this.get(m, ctx.t),
        { x, y } = m.at,
        hw = m.w * 3,
        hh = m.h * 3;
      if (m.kind === "furnace")
        s.starved = jammed.some((pts) =>
          pts.some((p, i) => segDist(x, y, i ? pts[i - 1] : p, p) <= JAM_RADIUS),
        );
      if (!vis(x, y, 30)) continue;
      switch (m.kind) {
        case "furnace":
          if (s.starved) break;
          if (r.chance(0.05)) ctx.live.spawn("smoke", x, y - hh, { vx: 2, vy: -3, life: 2.5, size: 0.9 });
          if (r.chance(0.06))
            ctx.live.spawn("ember", x + r.range(-1, 1), y + 1, {
              vx: r.range(-2, 2),
              vy: -8 - r.range(0, 6),
              life: 0.6 + r.range(0, 0.4),
              size: 1,
              color: "#ffb347",
            });
          break;
        case "engine":
          s.puffIn -= ctx.dt;
          if (s.puffIn <= 0) {
            s.puffIn = 0.35 + r.range(0, 0.2);
            ctx.live.spawn("steam", x - hw + 2, y - hh, { vx: 1.5, vy: -5, life: 0.9, size: 0.8 });
          }
          break;
        case "drill":
          if (r.chance(0.02))
            ctx.live.spawn("dust", x + r.range(-4, 4), y + 6, { vx: 1, vy: -1.5, life: 1.2, size: 0.8 });
          break;
        case "assembler":
          if (s.blink > 0) s.blink = Math.max(0, s.blink - ctx.dt);
          s.blinkIn -= ctx.dt;
          if (s.blinkIn <= 0) {
            s.blinkIn = 3 + r.range(0, 4);
            s.blink = 0.18;
          }
          break;
        default:
      }
    }
    for (const [id, s] of this.state) if (ctx.t - s.seen > FORGET_AFTER) this.state.delete(id);
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void {
    const z = d.view.z,
      t = d.t,
      night = d.env.night;
    const R = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(d.sx(x), d.sy(y), w * z, h * z);
    };
    const L = (x1: number, y1: number, x2: number, y2: number, c: string, lw: number) => {
      g.strokeStyle = c;
      g.lineWidth = lw * z;
      g.beginPath();
      g.moveTo(d.sx(x1), d.sy(y1));
      g.lineTo(d.sx(x2), d.sy(y2));
      g.stroke();
    };
    const glow = (m: Machine, r: number, color: "orange" | "green" | "blue", a: number) => {
      // Lights pass draws after the night overlay; by day they'd add glow over nothing.
      if (night > 0.05) d.light({ x: m.at.x, y: m.at.y, r, color, a: Math.min(1, a * night) });
    };

    for (const m of f.machines) {
      const { x: cx, y: cy } = m.at,
        hw = m.w * 3,
        hh = m.h * 3,
        x0 = cx - hw;
      if (!d.inView(cx, cy, Math.max(hw, hh) + 40)) continue;
      const s = this.state.get(m.id),
        ph = s?.ph ?? 0;
      switch (m.kind) {
        case "furnace": {
          const starved = s?.starved ?? false,
            a = starved ? 0.2 : 0.55 + Math.sin(t * 6 + ph) * 0.25;
          R(cx - 3, cy, 6, 4, `rgba(255,140,40,${a.toFixed(2)})`);
          if (!starved) {
            if (Math.sin(t * 12 + ph * 7) > 0.4)
              R(cx - 2 + (((t * 20 + ph) % 4) | 0), cy - 1, 1, 1, "#ffe3a0");
            glow(m, 28, "orange", a);
          }
          break;
        }
        case "boiler":
          R(cx - 3, cy, 6, 4, `rgba(255,120,30,${(0.5 + Math.sin(t * 5 + ph) * 0.2).toFixed(2)})`);
          R(cx - 1, cy + 1, 2, 2, `rgba(255,220,120,${(0.4 + Math.sin(t * 13 + ph * 2) * 0.3).toFixed(2)})`);
          glow(m, 24, "orange", 0.5);
          break;
        case "engine": {
          const p = (Math.sin(t * 7 + ph) + 1) / 2,
            run = Math.max(0, m.w * 6 - 16),
            a = t * 7 + ph,
            fx = x0 + m.w * 6 - 4;
          R(x0 + 4 + p * run, cy - 2, 6, 4, "#b9bec4");
          R(x0 + 6 + p * run, cy - 1, 2, 2, "#2b2e32");
          L(
            fx - Math.cos(a) * 2.5,
            cy - Math.sin(a) * 2.5,
            fx + Math.cos(a) * 2.5,
            cy + Math.sin(a) * 2.5,
            "#2b2e32",
            1,
          );
          break;
        }
        case "drill": {
          const a = t * 5 + ph;
          for (let k = 0; k < 2; k++) {
            const b = a + k * 1.57;
            L(
              cx - Math.cos(b) * 3,
              cy - Math.sin(b) * 3,
              cx + Math.cos(b) * 3,
              cy + Math.sin(b) * 3,
              "#d7b64b",
              1.2,
            );
          }
          break;
        }
        case "assembler": {
          const an = t * 3 + ph;
          for (let k = 0; k < 4; k++)
            R(
              cx + Math.cos(an + k * 1.57) * 2.2 - 0.5,
              cy + Math.sin(an + k * 1.57) * 2.2 - 0.5,
              1.2,
              1.2,
              "#9fb0c4",
            );
          if (s && s.blink > 0) R(cx - hw + 1, cy - hh + 1, hw * 2 - 2, 2, "rgba(255,255,255,.8)");
          break;
        }
        case "pumpjack": {
          const a = Math.sin(t * 1.8 + ph) * 0.5;
          L(cx - 7, cy + 1 + a * 4, cx + 7, cy + 1 - a * 4, "#8f949a", 2);
          R(cx + 6, cy - 1 - a * 4, 3, 3, "#d9a23a");
          L(cx - 7, cy + 1 + a * 4, cx - 7, cy + 7, "#555", 1);
          break;
        }
        case "chem":
          R(cx - 4, cy - 4, 8, 8, `rgba(120,220,120,${(0.35 + Math.sin(t * 4 + ph) * 0.2).toFixed(2)})`);
          R(cx - 3 + (((t * 6 + ph) % 6) | 0), cy - 3, 1, 1, "rgba(200,255,200,.6)");
          glow(m, 20, "green", 0.45);
          break;
        case "flare": {
          const fl = 2 + Math.sin(t * 25 + ph) * 1 + Math.sin(t * 7) * 0.6;
          g.fillStyle = "rgba(255,160,50,.8)";
          g.beginPath();
          g.moveTo(d.sx(cx - 1.5), d.sy(cy - hh));
          g.lineTo(d.sx(cx), d.sy(cy - hh - fl * 2));
          g.lineTo(d.sx(cx + 1.5), d.sy(cy - hh));
          g.fill();
          R(cx - 0.5, cy - hh - fl, 1, fl, "#fff1b0");
          glow(m, 40, "orange", 0.55 + Math.sin(t * 25 + ph) * 0.15);
          break;
        }
        case "lab":
          for (let k = 0; k < 4; k++) {
            const a = ph + t + k * 1.57;
            R(cx + Math.cos(a) * 4 - 1, cy + Math.sin(a) * 2.5 - 2, 2, 4, LAB_COLS[(k + ((cx / 6) | 0)) % 5]);
          }
          break;
        case "accumulator": {
          R(cx - 3, cy - 3, 6, 6, "#2d3338");
          const lvl = Math.max(
            0,
            Math.min(6, d.env.acc * 6 + (night > 0.5 ? Math.sin(t * 4 + ph) * 0.3 : 0)),
          );
          R(cx - 3, cy + 3 - lvl, 6, lvl, d.env.acc > 0.3 ? "#4fb3ff" : "#ff6a3a");
          break;
        }
        case "roboport": {
          const on = ((t * 2) | 0) % 2;
          R(cx - hw + 5, cy + hh - 8, 2, 2, on ? "#4fb3ff" : "#1f3a55");
          R(cx + hw - 7, cy + hh - 8, 2, 2, on ? "#1f3a55" : "#4fb3ff");
          R(cx - 1, cy - hh + 2, 2, 2, `rgba(79,179,255,${(0.4 + Math.sin(t * 5) * 0.3).toFixed(2)})`);
          glow(m, 16, "blue", 0.4);
          break;
        }
        case "radar": {
          const ang = t * 1.6 + ph,
            sx = d.sx(cx),
            sy = d.sy(cy - 2);
          L(cx, cy - 2, cx + Math.cos(ang) * 5, cy - 2 + Math.sin(ang) * 3, "#cfd4d8", 1.5);
          g.fillStyle = "rgba(120,230,160,.08)";
          g.beginPath();
          g.moveTo(sx, sy);
          g.arc(sx, sy, 40 * z, ang - 0.4, ang);
          g.fill();
          break;
        }
        case "spawner": {
          const k = 1 + Math.sin(t * 2 + ph) * 0.08;
          g.fillStyle = "#6b3f5e";
          g.beginPath();
          g.ellipse(d.sx(cx), d.sy(cy), hw * k * z, hh * 0.8 * k * z, 0, 0, TAU);
          g.fill();
          R(cx - hw * 0.4, cy - hh * 0.4, hw * 0.4, 1.5, "#a8719a");
          break;
        }
        case "worm": {
          const nod = Math.sin(t * 2.4 + ph) * 1.5;
          R(cx - 1.5, cy - 2 + nod, 3, 6 - nod, "#5c4a2e");
          R(cx - 2, cy - 3 + nod, 4, 2, "#8a7a4c");
          break;
        }
        default:
      }
    }

    // solar glint: a diagonal band sweeping each field by day
    if (night < 0.5) {
      g.fillStyle = "rgba(255,255,255,.12)";
      for (const s of f.solar) {
        const r = s.rect;
        if (!d.inView(r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h))) continue;
        const band = ((t * 30) % (r.w + r.h + 60)) - 30;
        for (let gy = 0; gy + 18 <= r.h; gy += 18)
          for (let gx = 0; gx + 18 <= r.w; gx += 18)
            if (Math.abs(gx + gy - band) < 8)
              g.fillRect(d.sx(r.x + gx + 1), d.sy(r.y + gy + 1), 16 * z, 16 * z);
      }
    }
  }

  reset(): void {
    this.state.clear();
  }
}
