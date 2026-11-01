import {
  CPX,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type EventMachine,
  type Pt,
  type SimCtx,
  type SiloSite,
} from "../core/types";

type Phase = "build" | "ready" | "launch" | "gone" | "pod" | "landed";

const PARTS_RATE = 1.5;
const WAIT_MAX = 20;
const FALL_SPEED = 14; // px/s
const DRIFT = 2.2; // px/s west
const FALL_HEIGHT = 280; // px above the landing spot where the pod appears
const LAND_DX = 44; // landing spot east of the silo centre (beside the pad)
const LAND_DY = 20;

interface Pod {
  x: number;
  y: number;
  landed: boolean;
}

export class Silo implements EventMachine {
  readonly name = "silo";
  private phase: Phase = "build";
  private parts = 0;
  private t = 0; // time in the current phase
  private p = 0; // launch progress 0..1
  private retry = 0; // seconds until the next bind attempt (>0 = cooling down)
  private site: SiloSite | null = null;
  private epoch = 0;
  private pending: { cx: number; cy: number; centre: Pt } | null = null;
  private waited = 0;
  private pod: Pod | null = null;
  private ignited = false;

  state(): string {
    return this.phase;
  }

  wants(): DistrictKind | null {
    return this.phase === "build" && this.parts >= 100 && !this.site ? "silo" : null;
  }

  reset(): void {
    // the rocket already flew: start the next one from scratch; otherwise keep the parts
    if (this.phase === "gone" || this.phase === "pod" || this.phase === "landed") this.parts = 0;
    this.phase = "build";
    this.t = 0;
    this.p = 0;
    this.retry = 0;
    this.site = null;
    this.pending = null;
    this.waited = 0;
    this.pod = null;
    this.ignited = false;
  }

  camHint(): CamHint | null {
    if (this.site && (this.phase === "ready" || this.phase === "launch"))
      return {
        target: this.site.at,
        hold: true,
        priority: 9,
        ...(this.phase === "launch" ? { zoomOffset: -0.12 } : {}),
      };
    if (this.phase === "pod" && this.pod) return { target: { x: this.pod.x, y: this.pod.y }, priority: 6 };
    if (this.pending) return { target: this.pending.centre, priority: 5 };
    return null;
  }

  update(ctx: SimCtx): void {
    const dt = ctx.dt;
    if (this.phase === "build") this.parts = Math.min(100, this.parts + dt * PARTS_RATE);
    else if (this.site && ctx.world.epoch(this.site.cx, this.site.cy) !== this.epoch) return this.reset();
    ctx.stats.parts = Math.floor(this.parts);
    this.t += dt;
    switch (this.phase) {
      case "build":
        if (this.parts >= 100) this.tryBind(ctx);
        break;
      case "ready":
        if (this.t > 10) {
          this.phase = "launch";
          this.t = 0;
          this.p = 0;
        }
        break;
      case "launch":
        this.updateLaunch(ctx);
        break;
      case "gone":
        if (this.t > 9) this.startPod(ctx);
        break;
      case "pod":
        this.updatePod(ctx);
        break;
      case "landed":
        if (this.t > 6) this.reset(); // parts go back to 0 from "landed"
        break;
    }
  }

  private tryBind(ctx: SimCtx): void {
    if (this.retry > 0) {
      this.retry -= ctx.dt;
      return;
    }
    if (!this.pending) {
      const s = ctx.world.findSite("silo", { x: ctx.cam.x, y: ctx.cam.y }, 4);
      if (!s) {
        this.retry = ctx.rand.range(10, 20);
        return;
      }
      this.pending = { cx: s.cx, cy: s.cy, centre: s.centre };
      this.waited = 0;
    }
    const p = this.pending;
    if (!ctx.world.isResident(p.cx, p.cy)) {
      this.waited += ctx.dt;
      if (this.waited > WAIT_MAX) {
        this.pending = null;
        this.retry = ctx.rand.range(10, 20);
      }
      return;
    }
    const rect = { x: p.cx * CPX, y: p.cy * CPX, w: CPX, h: CPX };
    const site = ctx.world.query(rect).silos.find((s) => s.cx === p.cx && s.cy === p.cy);
    this.pending = null;
    if (!site) {
      this.retry = ctx.rand.range(10, 20);
      return;
    }
    this.site = site;
    this.epoch = ctx.world.epoch(site.cx, site.cy);
    this.phase = "ready";
    this.t = 0;
    ctx.emit("rocket silo: 100/100 parts · launch sequence started (T-10)");
  }

  private updateLaunch(ctx: SimCtx): void {
    const s = this.site!;
    this.p = Math.min(1, this.t / 7);
    if (!this.ignited) {
      this.ignited = true;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.live.spawn("smoke", s.at.x + Math.cos(a) * ctx.rand.range(6, 15), s.at.y + 3 + Math.sin(a) * 3, {
          vx: Math.cos(a) * ctx.rand.range(6, 14) + ctx.rand.range(-4, 4),
          vy: -3 - ctx.rand.range(0, 6),
          life: ctx.rand.range(6, 10),
          size: ctx.rand.range(3, 5),
        });
      }
    }
    if (this.p < 0.5 && ctx.rand.chance(ctx.dt * 20))
      ctx.live.spawn("puff", s.at.x + ctx.rand.range(-2, 2), s.at.y - this.p * this.p * 520 + 14, {
        vx: ctx.rand.range(-3, 3),
        vy: 2,
        life: 2.5,
        size: 1.2,
      });
    if (this.p >= 1) {
      this.phase = "gone";
      this.t = 0;
      ctx.stats.rockets++;
      ctx.emit("rocket launched · payload: satellite");
    }
  }

  private startPod(ctx: SimCtx): void {
    const s = this.site!;
    const landX = s.at.x + LAND_DX;
    this.pod = {
      x: landX + (DRIFT * FALL_HEIGHT) / FALL_SPEED,
      y: s.at.y + LAND_DY - FALL_HEIGHT,
      landed: false,
    };
    this.phase = "pod";
    this.t = 0;
    ctx.emit("cargo pod re-entering · tracking…");
  }

  private updatePod(ctx: SimCtx): void {
    const pod = this.pod!,
      landY = this.site!.at.y + LAND_DY;
    pod.y += FALL_SPEED * ctx.dt;
    pod.x -= DRIFT * ctx.dt;
    if (pod.y < landY) return;
    pod.y = landY;
    pod.landed = true;
    this.phase = "landed";
    this.t = 0;
    ctx.stats.science++;
    ctx.emit("cargo pod recovered · 1 space-science-pack");
    for (let k = 0; k < 8; k++)
      ctx.live.spawn("dust", pod.x + ctx.rand.range(-4, 4), pod.y, {
        vx: ctx.rand.range(-3, 3),
        vy: -1,
        life: 1.5,
        size: 1.3,
      });
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    const s = this.site;
    if (!s) return;
    const x = s.at.x,
      y = s.at.y;
    if (!d.inView(x, y, 700)) return;
    const night = d.env.night;
    if (night > 0.05 && this.phase !== "build")
      for (const l of s.lights) d.light({ x: l.x, y: l.y, r: 80, color: "white", a: night });
    if (this.phase === "ready") {
      const on = Math.floor(this.t * 2) % 2 === 0;
      if (on) for (const l of s.lights) d.light({ x: l.x, y: l.y, r: 14, color: "red", a: 0.8 });
    }
    g.save();
    g.translate(d.sx(0), d.sy(0));
    g.scale(d.view.z, d.view.z);
    const open =
      this.phase === "ready"
        ? Math.min(1, this.t / 3)
        : this.phase === "launch" || this.phase === "gone" || this.phase === "pod" || this.phase === "landed"
          ? 1
          : 0;
    g.fillStyle = "#1a1d20";
    g.fillRect(x - 9, y - 21, 18 * open, 42);
    g.fillStyle = "#5a6066";
    g.fillRect(x - 9 + 18 * open, y - 21, 18 * (1 - open), 42);
    if (this.phase === "build") {
      g.fillStyle = "#2b2f33";
      g.fillRect(x - 12, y + 24, 24, 2);
      g.fillStyle = "#3fa34d";
      g.fillRect(x - 12, y + 24, (24 * this.parts) / 100, 2);
    }
    if (this.phase === "ready") {
      const on = Math.floor(this.t * 2) % 2 === 0;
      g.fillStyle = on ? "#ff4a3a" : "#5a1a14";
      for (const l of s.lights) g.fillRect(l.x - 1, l.y - 1, 2, 2);
    }
    if (this.phase === "ready" || this.phase === "launch") {
      const launching = this.phase === "launch";
      const ry = launching ? y - this.p * this.p * 520 : y;
      const fl = launching ? 10 + Math.sin(d.t * 40) * 3 : this.t > 8 ? 3 + Math.sin(d.t * 40) : 0;
      if (fl) {
        g.fillStyle = "rgba(255,150,40,.35)";
        g.beginPath();
        g.ellipse(x, ry + 12, 4, fl, 0, 0, 7);
        g.fill();
        g.fillStyle = "#ff7a1e";
        g.beginPath();
        g.moveTo(x - 2, ry + 11);
        g.lineTo(x, ry + 11 + fl);
        g.lineTo(x + 2, ry + 11);
        g.fill();
        g.fillStyle = "#fff1b0";
        g.beginPath();
        g.moveTo(x - 1, ry + 11);
        g.lineTo(x, ry + 11 + fl * 0.5);
        g.lineTo(x + 1, ry + 11);
        g.fill();
        d.light({ x, y: ry + 12, r: 60, color: "orange", a: 0.9 });
      }
      g.fillStyle = "#dfe3e6";
      g.fillRect(x - 2.5, ry - 11, 5, 22);
      g.fillStyle = "#f4f7f8";
      g.fillRect(x - 2.5, ry - 11, 2, 22);
      g.fillStyle = "#c0392b";
      g.beginPath();
      g.moveTo(x - 3, ry - 11);
      g.lineTo(x, ry - 17);
      g.lineTo(x + 3, ry - 11);
      g.fill();
      g.fillRect(x - 4, ry + 8, 2, 4);
      g.fillRect(x + 2, ry + 8, 2, 4);
    }
    const pod = this.pod;
    if (pod && !pod.landed) {
      g.strokeStyle = "#f4f7f8";
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(pod.x, pod.y - 7, 6, Math.PI, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(pod.x - 6, pod.y - 7);
      g.lineTo(pod.x, pod.y);
      g.lineTo(pod.x + 6, pod.y - 7);
      g.stroke();
      g.fillStyle = "#dfe3e6";
      g.fillRect(pod.x - 1.5, pod.y - 1, 3, 3);
      g.fillStyle = "#c0392b";
      g.fillRect(pod.x - 1.5, pod.y - 1, 3, 1);
    } else if (pod) {
      g.fillStyle = "#dfe3e6";
      g.fillRect(pod.x - 1.5, pod.y - 1, 3, 3);
      g.fillStyle = "rgba(244,247,248,.7)";
      g.fillRect(pod.x + 2, pod.y - 2, 6, 3);
    }
    g.restore();
  }
}
