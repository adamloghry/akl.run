import {
  CPX,
  T,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type EventMachine,
  type HubSite,
  type Pt,
  type RoadSeg,
  type RailSeg,
  type SimCtx,
} from "../core/types";

// A cargo pod drops beside a hub on its own schedule (not tied to the silo): a short fiery re-entry,
// then a striped chute that drifts it down onto open land next to the pad while its shadow grows.

type Phase = "idle" | "seek" | "entry" | "chute" | "landed";

const FIRST_S = 90; // first drop after a fresh start / reset
const EVERY_MIN = 90;
const EVERY_MAX = 180;
const SEEK_RETRY = 6; // s between looks for a hub on screen while seeking
const SEEK_MAX = 60; // give up and reschedule after this long without one
const START_H = 220; // px above the landing spot where re-entry starts
const CHUTE_H = 160; // height at which the chute opens
const ENTRY_SPEED = 45; // px/s
const CHUTE_SPEED = 14; // px/s
const POP_S = 0.5; // chute opening
const DRIFT = 0.12; // px east per px of height: drifts west onto the spot
const LANDED_S = 8;
const FADE_S = 1.5;
const OUTSIDE = 3 * T; // landing spots sit this far outside the hub pad
const CLEAR = 9; // px of land needed around the spot (pod + collapsed chute)
const RAIL_GAP = 10; // px from any rail
const ROAD_GAP = 6; // px beyond a road's half-width
const START_SLACK = 40; // px the re-entry point may sit above the view's top (the camera glides up to it)
// In flight the pod outranks a raid (8) for its ~13 s, but not a train arrival (8.5), a launch (9) or
// look (10); it never starts while anything at raid level or above is steering the camera.
const CAM_PRIORITY = 8.2;
const START_BLOCK = 8;

const WHITE = "#f4f7f8",
  ORANGE = "#e8792b",
  LINES = "rgba(230,230,225,.75)";

const segDist = (p: Pt, r: RailSeg | RoadSeg): number => {
  const dx = r.b.x - r.a.x,
    dy = r.b.y - r.a.y;
  const l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((p.x - r.a.x) * dx + (p.y - r.a.y) * dy) / l2));
  return Math.hypot(r.a.x + dx * u - p.x, r.a.y + dy * u - p.y);
};

export class Drop implements EventMachine {
  readonly name = "drop";
  /** `rivals`: machines that steer the camera at START_BLOCK or above; no drop starts while one is. */
  constructor(private readonly rivals: readonly EventMachine[] = []) {}
  private phase: Phase = "idle";
  private timer = FIRST_S; // s until the next drop is due (idle) / until the next look (seek)
  private sought = 0; // s spent seeking
  private t = 0; // s in the current phase
  private h = 0; // height above the spot (px)
  private spot: Pt | null = null;
  private hub: { cx: number; cy: number; epoch: number } | null = null;

  state(): string {
    return this.phase;
  }

  wants(): DistrictKind | null {
    return this.phase === "seek" ? "hub" : null;
  }

  reset(): void {
    this.phase = "idle";
    this.timer = FIRST_S;
    this.sought = 0;
    this.t = 0;
    this.h = 0;
    this.spot = null;
    this.hub = null;
  }

  camHint(): CamHint | null {
    const s = this.spot;
    if (!s) return null;
    // frame the pod and its landing spot together; after touchdown, linger briefly on the spot
    if (this.phase === "entry" || this.phase === "chute")
      return { target: { x: s.x + this.h * DRIFT * 0.5, y: s.y - this.h / 2 }, priority: CAM_PRIORITY };
    if (this.phase === "landed" && this.t < 3) return { target: s, priority: CAM_PRIORITY };
    return null;
  }

  update(ctx: SimCtx): void {
    const dt = ctx.dt;
    if (this.hub && ctx.world.epoch(this.hub.cx, this.hub.cy) !== this.hub.epoch) {
      // the hub's chunk was evicted mid-drop: drop the pod silently, try again later
      this.reset();
      this.timer = ctx.rand.range(EVERY_MIN, EVERY_MAX);
      return;
    }
    this.t += dt;
    switch (this.phase) {
      case "idle":
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = "seek";
          this.sought = 0;
          this.timer = 0;
        }
        break;
      case "seek":
        this.sought += dt;
        this.timer -= dt;
        if (this.timer > 0) break;
        this.timer = SEEK_RETRY;
        if (!this.outranked() && this.tryStart(ctx)) break;
        if (this.sought > SEEK_MAX) this.schedule(ctx);
        break;
      case "entry":
        this.h -= ENTRY_SPEED * dt;
        if (this.t % 0.15 < dt) {
          const p = this.pod(0);
          ctx.live.spawn("smoke", p.x, p.y - 8, { vx: ctx.rand.range(-2, 2), vy: -2, life: 1.6, size: 1 });
        }
        if (this.h <= CHUTE_H) this.enter("chute");
        break;
      case "chute": {
        // ease from re-entry speed to the chute's terminal speed while it opens
        const k = Math.min(1, this.t / POP_S);
        this.h -= (ENTRY_SPEED + (CHUTE_SPEED - ENTRY_SPEED) * k) * dt;
        if (this.h > 0) break;
        this.h = 0;
        this.enter("landed");
        ctx.stats.science++;
        ctx.emit("cargo pod recovered · 1 space-science-pack");
        const s = this.spot!;
        for (let i = 0; i < 8; i++)
          ctx.live.spawn("dust", s.x + ctx.rand.range(-5, 5), s.y, {
            vx: ctx.rand.range(-3, 3),
            vy: -1,
            life: 1.5,
            size: 1.3,
          });
        break;
      }
      case "landed":
        if (this.t > LANDED_S) this.schedule(ctx);
        break;
    }
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.t = 0;
  }

  private schedule(ctx: SimCtx): void {
    this.reset();
    this.timer = ctx.rand.range(EVERY_MIN, EVERY_MAX);
  }

  private outranked(): boolean {
    return this.rivals.some((m) => {
      const h = m.camHint();
      return !!h?.target && h.priority >= START_BLOCK;
    });
  }

  /** Pick open land beside a hub whose whole drop is (about) on screen; start re-entry there. */
  private tryStart(ctx: SimCtx): boolean {
    const v = ctx.cam.view;
    const x0 = v.x0 + 30,
      x1 = v.x0 + v.w / v.z - 30,
      y1 = v.y0 + v.h / v.z - 30;
    const spots: Array<{ hub: HubSite; at: Pt }> = [];
    for (const hub of ctx.view.hubs)
      for (const at of this.candidates(hub)) {
        if (at.x < x0 || at.x > x1 || at.y > y1 || at.y - START_H < v.y0 - START_SLACK) continue;
        if (this.usable(ctx, hub, at)) spots.push({ hub, at });
      }
    if (!spots.length) return false;
    const { hub, at } = ctx.rand.pick(spots);
    this.spot = at;
    this.hub = { cx: hub.cx, cy: hub.cy, epoch: ctx.world.epoch(hub.cx, hub.cy) };
    this.h = START_H;
    this.enter("entry");
    ctx.emit("cargo pod re-entering · tracking…");
    return true;
  }

  /** Points on all four sides of the pad, OUTSIDE px beyond its edge. */
  private candidates(hub: HubSite): Pt[] {
    const r = hub.rect,
      out: Pt[] = [];
    for (const f of [0.25, 0.5, 0.75]) {
      out.push({ x: r.x - OUTSIDE, y: r.y + r.h * f });
      out.push({ x: r.x + r.w + OUTSIDE, y: r.y + r.h * f });
      out.push({ x: r.x + r.w * f, y: r.y - OUTSIDE });
      out.push({ x: r.x + r.w * f, y: r.y + r.h + OUTSIDE });
    }
    return out;
  }

  /** On land all round, off the construction lot and other pads, clear of rails and roads, resident. */
  private usable(ctx: SimCtx, hub: HubSite, at: Pt): boolean {
    if (!ctx.world.isResident(Math.floor(at.x / CPX), Math.floor(at.y / CPX))) return false;
    for (const [dx, dy] of [
      [0, 0],
      [-CLEAR, 0],
      [CLEAR, 0],
      [0, -CLEAR],
      [0, CLEAR],
      [CLEAR + 4, 0], // the collapsed chute lies east of the pod
    ])
      if (!ctx.world.isLandPx(at.x + dx, at.y + dy)) return false;
    const inside = (r: { x: number; y: number; w: number; h: number }, m: number) =>
      at.x >= r.x - m && at.x <= r.x + r.w + m && at.y >= r.y - m && at.y <= r.y + r.h + m;
    if (inside(hub.lot, T)) return false;
    for (const h of ctx.view.hubs) if (inside(h.rect, T)) return false;
    for (const r of ctx.view.rails) if (segDist(at, r) < RAIL_GAP) return false;
    for (const r of ctx.view.roads) if (segDist(at, r) < (r.width * T) / 2 + ROAD_GAP) return false;
    return true;
  }

  /** The pod's bottom-centre at sim time offset `sway` phase (world px). */
  private pod(swayT: number): Pt {
    const s = this.spot!;
    const sway = this.phase === "chute" ? Math.sin(swayT * 1.4) * 1.2 * Math.min(1, this.h / 40) : 0;
    return { x: s.x + this.h * DRIFT + sway, y: s.y - this.h };
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    const s = this.spot;
    if (!s || this.phase === "idle" || this.phase === "seek") return;
    if (!d.inView(s.x, s.y - this.h / 2, START_H)) return;
    const p = this.pod(d.t);
    const night = d.env.night;
    g.save();
    g.translate(d.sx(0), d.sy(0));
    g.scale(d.view.z, d.view.z);
    if (this.phase === "landed" && this.t > LANDED_S - FADE_S)
      g.globalAlpha = Math.max(0, (LANDED_S - this.t) / FADE_S);

    // ground shadow: grows and darkens as the pod comes down
    const near = 1 - Math.min(1, this.h / START_H);
    g.fillStyle = `rgba(0,0,0,${(0.12 + 0.2 * near).toFixed(2)})`;
    g.beginPath();
    g.ellipse(s.x, s.y, 3 + 5 * near, 1.2 + 1.3 * near, 0, 0, 7);
    g.fill();

    if (this.phase === "entry") {
      // re-entry: a hot streak above the falling pod
      g.fillStyle = "rgba(255,120,40,.45)";
      g.fillRect(p.x - 2, p.y - 30, 4, 24);
      g.fillStyle = "#ff9a3a";
      g.fillRect(p.x - 1.5, p.y - 18, 3, 12);
      g.fillStyle = "#fff1b0";
      g.fillRect(p.x - 1, p.y - 10, 2, 5);
      d.light({ x: p.x, y: p.y - 3, r: 36, color: "orange", a: 0.9 });
    }
    if (this.phase === "chute") this.canopy(g, p, Math.min(1, this.t / POP_S));
    if (this.phase === "landed") {
      const k = Math.min(1, this.t / 0.8);
      if (k < 1) this.canopy(g, { x: p.x + 6 * k, y: p.y + 12 * k }, 1 - k);
      else {
        // the collapsed chute, lying east of the pod
        for (let i = 0; i < 5; i++) {
          g.fillStyle = i & 1 ? ORANGE : WHITE;
          g.fillRect(p.x + 3 + i * 2, p.y - 2, 2, 1);
          g.fillRect(p.x + 4 + i * 2, p.y - 1, 2, 1);
        }
      }
    }

    // the pod: a small capsule with a dark heat shield and a red band
    g.fillStyle = "#c9ced3";
    g.fillRect(p.x - 2.5, p.y - 6, 5, 6);
    g.fillStyle = "#eef1f3";
    g.fillRect(p.x - 2.5, p.y - 6, 1.5, 6);
    g.fillStyle = "#c0392b";
    g.fillRect(p.x - 2.5, p.y - 4.5, 5, 1);
    g.fillStyle = "#3a3d42";
    g.fillRect(p.x - 2.5, p.y - 1, 5, 1);
    if (night > 0.25 && this.phase !== "entry" && Math.floor(d.t * 1.5) % 2 === 0)
      d.light({ x: p.x, y: p.y - 6, r: 10, color: "red", a: 0.7 });
    g.restore();
  }

  /** Striped chute over the pod at (x, bottom y); `s` 0..1 is how far it has opened. */
  private canopy(g: CanvasRenderingContext2D, p: Pt, s: number): void {
    if (s <= 0) return;
    g.strokeStyle = LINES;
    g.lineWidth = 0.4;
    g.beginPath();
    for (const ex of [-8, -3, 3, 8]) {
      g.moveTo(p.x + ex * s, p.y - 15);
      g.lineTo(p.x + Math.sign(ex) * 1.5, p.y - 6);
    }
    g.stroke();
    const rows: ReadonlyArray<readonly [number, number, number]> = [
      [-19, 4, 1],
      [-18, 6.5, 1],
      [-17, 8, 2],
    ];
    for (const [dy, half, h] of rows)
      for (let k = -4; k < 4; k++) {
        const a = Math.max(k * 2, -half),
          b = Math.min(k * 2 + 2, half);
        if (b <= a) continue;
        g.fillStyle = k & 1 ? ORANGE : WHITE;
        g.fillRect(p.x + a * s, p.y + dy, (b - a) * s, h);
      }
  }
}
