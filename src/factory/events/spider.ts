import {
  CPX,
  DIRS,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type EventMachine,
  type Pt,
  type SimCtx,
} from "../core/types";
import { chunkRect, siteNum, type Raid } from "./raid";

export type SpiderState = "parked" | "patrol-out" | "at-outpost" | "patrol-back" | "responding";

const SPEED = 20;
const NEAR = 3;
const LEGS = 8;
const WAIT_RESIDENT = 20;

interface Foot {
  a: number; // angle of its rest point around the body
  x: number;
  y: number;
  lift: number;
}
interface HubBound {
  cx: number;
  cy: number;
  epoch: number;
  park: Pt;
  centre: Pt;
}

/** S-1: parks at the nearest hub, patrols to an outpost every 70–110 s, rushes to raids. */
export class Spider implements EventMachine {
  readonly name = "spider";
  private st: SpiderState = "parked";
  private hub: HubBound | null = null;
  private x = 0;
  private y = 0;
  private tx = 0;
  private ty = 0;
  private dest: { cx: number; cy: number } | null = null; // outpost chunk being visited
  private timer = 0;
  private retry = 0;
  private pending: { target: Pt; waited: number } | null = null;
  private want: DistrictKind | null = null;
  private moving = false;
  private foot: Foot[] = [];

  constructor(private readonly raid: Raid) {
    raid.attachSpider(this);
  }

  /** Read-only view of the leg feet (lift is seconds of raise remaining). */
  feet(): ReadonlyArray<{ readonly lift: number }> {
    return this.foot;
  }

  position(): Pt | null {
    return this.hub ? { x: this.x, y: this.y } : null;
  }
  state(): SpiderState {
    return this.st;
  }
  wants(): DistrictKind | null {
    return this.want;
  }
  camHint(): CamHint | null {
    return this.pending ? { target: this.pending.target, priority: 4 } : null;
  }

  reset(): void {
    this.st = "parked";
    this.hub = null;
    this.dest = null;
    this.pending = null;
    this.foot = [];
    this.moving = false;
  }

  update(ctx: SimCtx): void {
    this.retry = Math.max(0, this.retry - ctx.dt);
    if (!this.hub) {
      this.tryBind(ctx);
      return;
    }
    const h = this.hub;
    if (ctx.world.epoch(h.cx, h.cy) !== h.epoch) {
      this.reset();
      return;
    }
    const dt = ctx.dt;
    const rd = this.raid.active();

    if (this.st === "parked") {
      this.timer -= dt;
      if (rd && Math.max(Math.abs(rd.site.cx - h.cx), Math.abs(rd.site.cy - h.cy)) <= 4) {
        const r = rd.site.rect;
        this.goto(r.x + r.w / 2, r.y + r.h / 2, rd.site.facing, r.w / 2 - 16);
        this.dest = { cx: rd.site.cx, cy: rd.site.cy };
        this.st = "responding";
        ctx.emit(`spidertron S-1 responding → O-${siteNum(rd.site.cx, rd.site.cy)}`);
      } else if (this.timer <= 0) {
        this.patrol(ctx);
      }
    }

    this.moving = false;
    if (this.st !== "parked") {
      const dx = this.tx - this.x,
        dy = this.ty - this.y,
        d = Math.hypot(dx, dy);
      if (d > NEAR) {
        this.x += (dx / d) * SPEED * dt;
        this.y += (dy / d) * SPEED * dt;
        this.moving = true;
      } else if (this.st === "patrol-out") {
        this.st = "at-outpost";
      } else if (this.st === "patrol-back") {
        this.st = "parked";
        this.timer = ctx.rand.range(70, 110);
        this.dest = null;
        ctx.emit("spidertron S-1 returned to hub");
      }
      if (!this.moving && (this.st === "at-outpost" || this.st === "responding")) {
        const here = this.dest && rd && rd.site.cx === this.dest.cx && rd.site.cy === this.dest.cy;
        if (!here) {
          this.st = "patrol-back";
          this.tx = h.park.x;
          this.ty = h.park.y;
        }
      }
    }
    this.stepFeet(dt);
  }

  private goto(cx: number, cy: number, facing: 0 | 1 | 2 | 3, inset: number): void {
    const d = DIRS[facing];
    this.tx = cx + d[0] * inset;
    this.ty = cy + d[1] * inset;
  }

  private patrol(ctx: SimCtx): void {
    const h = this.hub!;
    const site = ctx.world.findSite("outpost", h.centre, 4);
    if (!site) {
      this.timer = ctx.rand.range(10, 20);
      return;
    }
    let target = site.centre;
    if (ctx.world.isResident(site.cx, site.cy)) {
      const o = ctx.world
        .query(chunkRect(site.cx, site.cy))
        .outposts.find((s) => s.cx === site.cx && s.cy === site.cy);
      if (o) {
        const d = DIRS[o.facing];
        target = {
          x: o.rect.x + o.rect.w / 2 + d[0] * (o.rect.w / 2 - 16),
          y: o.rect.y + o.rect.h / 2 + d[1] * (o.rect.h / 2 - 16),
        };
      }
    }
    this.tx = target.x;
    this.ty = target.y;
    this.dest = { cx: site.cx, cy: site.cy };
    this.st = "patrol-out";
    ctx.emit(`spidertron S-1 → outpost O-${siteNum(site.cx, site.cy)} (ammo resupply)`);
  }

  private tryBind(ctx: SimCtx): void {
    if (this.retry > 0) return;
    const w = ctx.world;
    const site = w.findSite("hub", { x: ctx.cam.x, y: ctx.cam.y }, 4);
    if (!site) {
      this.want = "hub";
      this.pending = null;
      this.retry = ctx.rand.range(10, 20);
      return;
    }
    this.want = null;
    if (!w.isResident(site.cx, site.cy)) {
      const waited = (this.pending?.waited ?? 0) + ctx.dt;
      if (waited > WAIT_RESIDENT) {
        this.pending = null;
        this.retry = ctx.rand.range(10, 20);
      } else this.pending = { target: site.centre, waited };
      return;
    }
    this.pending = null;
    const hub = w.query(chunkRect(site.cx, site.cy)).hubs.find((s) => s.cx === site.cx && s.cy === site.cy);
    if (!hub) {
      this.retry = ctx.rand.range(10, 20);
      return;
    }
    this.hub = {
      cx: site.cx,
      cy: site.cy,
      epoch: w.epoch(site.cx, site.cy),
      park: { ...hub.spiderPark },
      centre: { x: (site.cx + 0.5) * CPX, y: (site.cy + 0.5) * CPX },
    };
    this.st = "parked";
    this.x = this.tx = hub.spiderPark.x;
    this.y = this.ty = hub.spiderPark.y;
    this.timer = ctx.rand.range(70, 110);
    this.foot = Array.from({ length: LEGS }, (_, i) => {
      const a = (i / LEGS) * Math.PI * 2;
      return { a, x: this.x + Math.cos(a) * 9, y: this.y + Math.sin(a) * 7, lift: 0 };
    });
  }

  /** Feet re-plant when they trail more than 7 px behind their rest point (lift 0.18 s). */
  private stepFeet(dt: number): void {
    const sign = this.moving ? Math.sign(this.tx - this.x) || 1 : 0;
    for (const f of this.foot) {
      f.lift = Math.max(0, f.lift - dt);
      const hx = this.x + Math.cos(f.a) * 9,
        hy = this.y + Math.sin(f.a) * 7;
      if (Math.hypot(hx - f.x, hy - f.y) > 7) {
        f.x = hx + 4 * sign;
        f.y = hy;
        f.lift = 0.18;
      }
    }
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    if (!this.hub || !d.inView(this.x, this.y, 20)) return;
    const z = d.view.z;
    const { x, y } = this;
    g.save();
    g.translate(d.sx(0), d.sy(0));
    g.scale(z, z);
    g.strokeStyle = "#2f3a2f";
    g.lineWidth = 0.9;
    for (const f of this.foot) {
      const kx = (x + f.x) / 2 + Math.cos(f.a) * 3,
        ky = (y + f.y) / 2 - 4 - f.lift * 15;
      g.beginPath();
      g.moveTo(x, y - 2);
      g.lineTo(kx, ky);
      g.lineTo(f.x, f.y - f.lift * 8);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,.25)";
    g.fillRect(x - 3, y + 2, 7, 2);
    g.fillStyle = "#3d4f3b";
    g.fillRect(x - 3, y - 5, 6, 6);
    g.fillStyle = "#9ad1ff";
    g.fillRect(x - 2, y - 4, 1, 1);
    g.fillRect(x + 1, y - 4, 1, 1);
    g.fillStyle = "#e0b73a";
    g.fillRect(x - 1, y - 1, 2, 1);
    g.restore();
  }
}
