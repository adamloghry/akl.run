import {
  CPX,
  T,
  type CamHint,
  type DrawCtx,
  type EventMachine,
  type HubSite,
  type OverlayToken,
  type Pt,
  type SimCtx,
} from "../core/types";

type Phase = "idle" | "ghost" | "build" | "standing" | "decon";
type EntKind = "asm" | "ins" | "belt" | "lamp";
interface Ent {
  k: EntKind;
  x: number; // world px, top-left
  y: number;
  w: number; // px
  h: number;
  built: boolean;
  claimed: boolean;
}
interface Bot {
  x: number;
  y: number;
  job: Ent | null;
  hover: number;
  mode: "build" | "decon" | "home";
}
interface Flash {
  x: number;
  y: number;
  t: number;
}

const BOTS = 5;
const SPEED = 22;
const WAIT_MAX = 20;

/** The 14 entities of the construction lot, relative to the lot's top-left (ref:301 lotEntities). */
function lotEntities(lot: { x: number; y: number }): Ent[] {
  const e: Ent[] = [];
  const add = (k: EntKind, tx: number, ty: number, tw: number, th: number) =>
    e.push({ k, x: lot.x + tx * T, y: lot.y + ty * T, w: tw * T, h: th * T, built: false, claimed: false });
  for (let i = 0; i < 3; i++) add("asm", 1 + i * 4, 1, 3, 3);
  for (let i = 0; i < 3; i++) add("ins", 2 + i * 4, 4, 1, 1);
  add("belt", 1, 5, 11, 1);
  for (let i = 0; i < 3; i++) add("ins", 2 + i * 4, 6, 1, 1);
  for (let i = 0; i < 3; i++) add("asm", 1 + i * 4, 7, 3, 3);
  add("lamp", 11, 1, 1, 1);
  return e;
}

/** Paint one finished entity into the chunk canvas (ref:303 buildEnt). */
function paintEnt(g: CanvasRenderingContext2D, e: Ent, ox: number, oy: number): void {
  const x = e.x - ox,
    y = e.y - oy;
  const R = (dx: number, dy: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x + dx, y + dy, w, h);
  };
  if (e.k === "asm") {
    R(0, 0, 18, 18, "#3f4b5c");
    R(1, 1, 16, 16, "#4f5d70");
    R(1, 1, 16, 2, "#d9a23a");
    R(6, 6, 6, 6, "#2b333d");
  } else if (e.k === "ins") {
    R(0, 0, T, T, "#34363a");
    R(2, 2, 2, 2, "#1f2022");
  } else if (e.k === "belt") {
    for (let i = 0; i < e.w / T; i++) {
      R(i * T, 0, T, T, "#2e2f31");
      R(i * T, 1, T, 4, "#3a3b3e");
    }
  } else {
    R(2, 2, 2, 4, "#8a8f94");
    R(1, 1, 4, 2, "#c9ced2");
  }
}

const centre = (e: Ent): Pt => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });

export class Lot implements EventMachine {
  readonly name = "lot";
  private phase: Phase = "idle";
  private t = -1; // <0: not armed yet
  private hub: HubSite | null = null;
  private epoch = 0;
  private tok: OverlayToken | null = null;
  private ents: Ent[] = [];
  private bots: Bot[] = [];
  private flashes: Flash[] = [];
  // a hub was found but its chunk is not resident yet
  private pending: { cx: number; cy: number; centre: Pt } | null = null;
  private waited = 0;

  state(): string {
    return this.phase;
  }

  reset(): void {
    this.phase = "idle";
    this.t = -1;
    this.hub = null;
    this.tok = null;
    this.ents = [];
    this.bots = [];
    this.flashes = [];
    this.pending = null;
    this.waited = 0;
  }

  camHint(): CamHint | null {
    return this.pending ? { target: this.pending.centre, priority: 3 } : null;
  }

  update(ctx: SimCtx): void {
    const dt = ctx.dt;
    if (this.t < 0) this.t = ctx.rand.range(25, 45);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t -= dt;
      if (this.flashes[i].t <= 0) this.flashes.splice(i, 1);
    }
    if (this.phase !== "idle") {
      const h = this.hub!;
      if (ctx.world.epoch(h.cx, h.cy) !== this.epoch) return this.reset();
    }
    this.homeBots(dt);
    this.t -= dt;
    switch (this.phase) {
      case "idle":
        this.updateIdle(ctx);
        break;
      case "ghost":
        if (this.t <= 0) this.startBuild(ctx);
        break;
      case "build":
        this.updateWork(ctx, true);
        break;
      case "standing":
        if (this.t <= 0) this.startDecon(ctx);
        break;
      case "decon":
        this.updateWork(ctx, false);
        break;
    }
    ctx.stats.bots += this.bots.length;
  }

  private updateIdle(ctx: SimCtx): void {
    if (this.t > 0) return;
    if (!this.pending) {
      const s = ctx.world.findSite("hub", { x: ctx.cam.x, y: ctx.cam.y }, 4);
      if (!s) {
        this.t = ctx.rand.range(10, 20);
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
        this.t = ctx.rand.range(10, 20);
      }
      return;
    }
    const rect = { x: p.cx * CPX, y: p.cy * CPX, w: CPX, h: CPX };
    const hub = ctx.world.query(rect).hubs.find((h) => h.cx === p.cx && h.cy === p.cy);
    this.pending = null;
    if (!hub) {
      this.t = ctx.rand.range(10, 20);
      return;
    }
    this.hub = hub;
    this.epoch = ctx.world.epoch(hub.cx, hub.cy);
    this.ents = lotEntities(hub.lot);
    this.phase = "ghost";
    this.t = 2.5;
    ctx.emit(`blueprint placed: ${this.ents.length} ghosts · ${BOTS} construction bots dispatched`);
  }

  private spawnBots(mode: "build" | "decon"): void {
    const rp = this.hub!.roboport;
    for (let i = 0; i < BOTS; i++) this.bots.push({ x: rp.x, y: rp.y, job: null, hover: 0, mode });
  }

  private startBuild(ctx: SimCtx): void {
    const tok = ctx.overlay.saveRect(this.hub!.lot);
    if (!tok) return this.reset();
    this.tok = tok;
    this.phase = "build";
    this.spawnBots("build");
  }

  private startDecon(ctx: SimCtx): void {
    this.phase = "decon";
    ctx.emit("deconstruction planned: A-2 (upgrading to assembler-3)");
    for (const e of this.ents) {
      e.built = true;
      e.claimed = false;
    }
    this.spawnBots("decon");
  }

  /** Shared bot loop: `building` paints entities in, otherwise bots remove them. */
  private updateWork(ctx: SimCtx, building: boolean): void {
    const dt = ctx.dt;
    const mode = building ? "build" : "decon";
    const hoverTime = building ? 1.1 : 0.8;
    for (const b of this.bots) {
      if (b.mode !== mode) continue;
      if (!b.job) {
        const next = this.ents.find((e) => e.built !== building && !e.claimed);
        if (!next) continue;
        next.claimed = true;
        b.job = next;
      }
      const e = b.job,
        p = centre(e);
      const dx = p.x - b.x,
        dy = p.y - b.y,
        d = Math.hypot(dx, dy);
      if (d > 2) {
        b.x += (dx / d) * SPEED * dt;
        b.y += (dy / d) * SPEED * dt;
        continue;
      }
      b.hover += dt;
      if (building && ctx.rand.chance(dt * 30))
        ctx.live.spawn("spark", p.x + ctx.rand.range(-3, 3), p.y + ctx.rand.range(-2, 2), {
          vx: ctx.rand.range(-12, 12),
          vy: ctx.rand.range(-14, -2),
          life: 0.3,
          size: 1,
          color: "#9fd6ff",
        });
      if (b.hover <= hoverTime) continue;
      b.hover = 0;
      b.job = null;
      e.claimed = false;
      this.flashes.push({ x: p.x, y: p.y, t: 0.35 });
      e.built = building;
      if (building && !ctx.overlay.paint(this.tok!, (g, ox, oy) => paintEnt(g, e, ox, oy)))
        return this.reset();
    }
    if (this.ents.some((e) => e.built !== building)) return;
    for (const b of this.bots)
      if (b.mode === mode) {
        b.mode = "home";
        b.job = null;
      }
    if (building) {
      this.phase = "standing";
      this.t = ctx.rand.range(50, 80);
      ctx.stats.built += this.ents.length;
      ctx.emit("construction complete · assembly block A-2 online");
    } else {
      if (!ctx.overlay.restore(this.tok!)) return this.reset();
      const n = this.ents.length;
      this.phase = "idle";
      this.t = ctx.rand.range(25, 45);
      this.tok = null;
      this.ents = [];
      ctx.emit(`deconstruction complete · ${n} entities returned to storage`);
    }
  }

  /** Bots done with a job fly back to the roboport and vanish. */
  private homeBots(dt: number): void {
    const rp = this.hub?.roboport;
    if (!rp) return;
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (b.mode !== "home") continue;
      const dx = rp.x - b.x,
        dy = rp.y - b.y,
        d = Math.hypot(dx, dy);
      if (d > 2) {
        b.x += (dx / d) * SPEED * dt;
        b.y += (dy / d) * SPEED * dt;
      } else this.bots.splice(i, 1);
    }
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    const hub = this.hub;
    if (!hub) return;
    const lot = hub.lot;
    if (!d.inView(lot.x + lot.w / 2, lot.y + lot.h / 2, 160)) return;
    g.save();
    g.translate(d.sx(0), d.sy(0));
    g.scale(d.view.z, d.view.z);
    if (this.phase === "ghost" || this.phase === "build") {
      g.strokeStyle = "rgba(90,170,255,.85)";
      g.lineWidth = 0.8;
      g.setLineDash([2, 1.5]);
      g.lineDashOffset = -d.t * 6;
      for (const e of this.ents) {
        if (e.built) continue;
        g.fillStyle = "rgba(90,170,255,.18)";
        g.fillRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
        g.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      }
      g.setLineDash([]);
      g.lineDashOffset = 0;
    }
    if (this.phase === "decon") {
      g.strokeStyle = "rgba(255,90,70,.8)";
      g.lineWidth = 0.8;
      for (const e of this.ents) {
        if (!e.built) continue;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + e.w, e.y + e.h);
        g.moveTo(e.x + e.w, e.y);
        g.lineTo(e.x, e.y + e.h);
        g.stroke();
      }
    }
    for (const f of this.flashes) {
      g.fillStyle = `rgba(255,255,255,${Math.min(1, f.t / 0.35).toFixed(2)})`;
      g.fillRect(f.x - 4, f.y - 4, 8, 8);
    }
    for (const b of this.bots) {
      g.fillStyle = "rgba(0,0,0,.25)";
      g.fillRect(b.x + 1.5, b.y + 3, 2.5, 1.5);
      g.fillStyle = b.mode === "decon" ? "#e85a4a" : "#4fb3ff";
      g.fillRect(b.x - 1, b.y - 1, 2.5, 2.5);
      if (b.hover > 0) {
        g.strokeStyle = "rgba(120,200,255,.7)";
        g.lineWidth = 0.8;
        g.beginPath();
        g.arc(b.x, b.y, 3 + Math.sin(d.t * 12), 0, 7);
        g.stroke();
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x + Math.cos(d.t * 20) * 3, b.y + 4 + Math.sin(d.t * 20) * 1.5);
        g.stroke();
      }
    }
    g.restore();
  }
}
