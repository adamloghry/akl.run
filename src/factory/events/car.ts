import {
  CPX,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type EventMachine,
  type HubSite,
  type Pt,
  type RoadSeg,
  type SimCtx,
  type SiteRef,
} from "../core/types";

// Port of ref car (ref:294–297, 412, 450): the hub's car shuttles to the nearest smelter and back.

const MAX_SPEED = 44;
const ACCEL = 30;
const RESIDENT_WAIT = 20;
const SEARCH = 4;

const lPath = (a: Pt, b: Pt): Pt[] => [a, { x: b.x, y: a.y }, b];

/** Hub -> smelter route: via a road that connects the two when there is one, else an L (horizontal, then vertical). */
function route(from: Pt, to: Pt, roads: RoadSeg[]): Pt[] {
  const near = (p: Pt, q: Pt, r: number) => Math.hypot(p.x - q.x, p.y - q.y) <= r;
  for (const rd of roads) {
    for (const [s, e] of [
      [rd.a, rd.b],
      [rd.b, rd.a],
    ] as const) {
      if (near(s, from, 24) && near(e, to, CPX / 2))
        return [...lPath(from, s), ...lPath(s, e).slice(1), ...lPath(e, to).slice(1)];
    }
  }
  return lPath(from, to);
}

export class Car implements EventMachine {
  readonly name = "car";
  private site: SiteRef | null = null;
  private waitStart = 0;
  private rearmAt = 0;
  private hub: HubSite | null = null;
  private hubEpoch = 0;
  private smeltChunk: { cx: number; cy: number; epoch: number } | null = null;
  private needSmelt = false;
  private mode: "none" | "parked" | "driving" = "none";
  private pos: Pt = { x: 0, y: 0 };
  private heading: Pt = { x: 1, y: 0 };
  private v = 0;
  private timer = 0;
  private atHub = true;
  private out: Pt[] = [];
  private path: Pt[] = [];
  private dust = 0;

  update(ctx: SimCtx): void {
    this.needSmelt = false;
    if (!this.site) {
      if (ctx.t < this.rearmAt) return;
      const s = ctx.world.findSite("hub", { x: ctx.cam.x, y: ctx.cam.y }, SEARCH);
      if (!s) {
        this.rearmAt = ctx.t + ctx.rand.range(10, 20);
        return;
      }
      this.site = s;
      this.waitStart = ctx.t;
    }
    const { cx, cy } = this.site;
    if (!this.hub) {
      const hub = ctx.world.isResident(cx, cy)
        ? ctx.world
            .query({ x: cx * CPX, y: cy * CPX, w: CPX, h: CPX })
            .hubs.find((h) => h.cx === cx && h.cy === cy)
        : undefined;
      if (!hub) {
        if (ctx.t - this.waitStart > RESIDENT_WAIT) this.giveUp(ctx);
        return;
      }
      this.hub = hub;
      this.hubEpoch = ctx.world.epoch(cx, cy);
      this.pos = { ...hub.carPark };
      this.atHub = true;
      this.mode = "parked";
      this.timer = ctx.rand.range(25, 55);
    }
    if (ctx.world.epoch(cx, cy) !== this.hubEpoch || this.smeltGone(ctx)) {
      this.reset();
      return;
    }

    if (this.mode === "parked") {
      this.timer -= ctx.dt;
      if (this.timer <= 0) this.depart(ctx, this.hub);
    } else if (this.mode === "driving") {
      this.drive(ctx);
    }
  }

  private smeltGone(ctx: SimCtx): boolean {
    const s = this.smeltChunk;
    return !!s && ctx.world.epoch(s.cx, s.cy) !== s.epoch;
  }

  private giveUp(ctx: SimCtx): void {
    this.site = null;
    this.rearmAt = ctx.t + ctx.rand.range(10, 20);
  }

  private depart(ctx: SimCtx, hub: HubSite): void {
    if (this.atHub) {
      const sm = ctx.world.findSite("smelt", this.site!.centre, SEARCH);
      if (!sm) {
        this.needSmelt = true;
        this.timer = ctx.rand.range(25, 55);
        return;
      }
      const ep = ctx.world.epoch(sm.cx, sm.cy);
      this.smeltChunk = ep >= 0 ? { cx: sm.cx, cy: sm.cy, epoch: ep } : null;
      this.out = route(hub.carPark, sm.centre, ctx.view.roads);
      this.path = this.out.slice(1);
      ctx.emit("car C-1 → smelter");
    } else {
      this.path = this.out.slice(0, -1).reverse();
      ctx.emit("car C-1 → hub");
    }
    this.mode = "driving";
    this.v = 0;
  }

  private drive(ctx: SimCtx): void {
    let rem = 0;
    for (let i = 0, p = this.pos; i < this.path.length; p = this.path[i++])
      rem += Math.hypot(this.path[i].x - p.x, this.path[i].y - p.y);
    this.v = Math.min(MAX_SPEED, this.v + ACCEL * ctx.dt, Math.sqrt(2 * ACCEL * rem) + 3);
    let step = this.v * ctx.dt;
    while (step > 0 && this.path.length) {
      const q = this.path[0];
      const dx = q.x - this.pos.x,
        dy = q.y - this.pos.y,
        d = Math.hypot(dx, dy);
      if (d > 1e-6) this.heading = { x: dx / d, y: dy / d };
      if (d <= step) {
        this.pos = { ...q };
        this.path.shift();
        step -= d;
      } else {
        this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
        step = 0;
      }
    }
    this.dust -= ctx.dt;
    if (this.dust <= 0) {
      this.dust = 0.15;
      ctx.live.spawn("dust", this.pos.x - this.heading.x * 4, this.pos.y - this.heading.y * 4 + 1, {
        vx: ctx.rand.range(-1, 1),
        vy: -0.5,
        life: 0.8,
        size: 0.9,
      });
    }
    if (!this.path.length) {
      this.mode = "parked";
      this.v = 0;
      this.atHub = !this.atHub;
      this.timer = ctx.rand.range(25, 55);
    }
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    if (this.mode === "none") return;
    const { x, y } = this.pos;
    if (!d.inView(x, y, 40)) return;
    const z = d.view.z;
    const horiz = Math.abs(this.heading.x) >= Math.abs(this.heading.y);
    const w = horiz ? 7 : 4,
      h = horiz ? 4 : 7;
    g.fillStyle = "rgba(0,0,0,.3)";
    g.fillRect(d.sx(x - w / 2 + 0.5), d.sy(y - h / 2 + 1), w * z, h * z);
    g.fillStyle = "#b8862e";
    g.fillRect(d.sx(x - w / 2), d.sy(y - h / 2), w * z, h * z);
    g.fillStyle = "#2b2e32";
    const fx = this.heading.x,
      fy = this.heading.y;
    g.fillRect(d.sx(x - 1.5 + fx * 1), d.sy(y - 1 + fy * 1), 3 * z, 2 * z);
    if (this.mode === "driving" && d.env.night > 0.25)
      d.light({
        x: x + fx * 4,
        y: y + fy * 4,
        r: 14,
        color: "warm",
        a: 0.6,
        cone: { ang: Math.atan2(fy, fx), spread: 0.45, len: 40 },
      });
  }

  camHint(): CamHint | null {
    if (this.site && !this.hub) return { target: this.site.centre, priority: 1 };
    return null;
  }

  wants(): DistrictKind | null {
    if (!this.site) return "hub";
    return this.needSmelt ? "smelt" : null;
  }

  reset(): void {
    this.site = null;
    this.hub = null;
    this.smeltChunk = null;
    this.mode = "none";
    this.v = 0;
    this.path = [];
    this.out = [];
    this.rearmAt = 0;
  }

  state(): string {
    return this.mode;
  }
}
