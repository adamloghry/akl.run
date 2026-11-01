import {
  CPX,
  DIRS,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type EventMachine,
  type OutpostSite,
  type Pt,
  type Rect,
  type SimCtx,
  type SiteRef,
} from "../core/types";

/** Lets the raid ask where the spidertron is (it fires lasers within 56 px). Implemented by Spider. */
export interface SpiderSource {
  position(): Pt | null;
}

export type RaidState = "calm" | "inbound" | "fight" | "repair" | "cooldown";

const MAX_BITERS = 24;
const TURRET_RANGE = 66;
const SPIDER_RANGE = 56;
const RAID_TIMEOUT = 60;
const WAIT_RESIDENT = 20;
const CAM_PRI_WAIT = 5;

export const chunkRect = (cx: number, cy: number): Rect => ({ x: cx * CPX, y: cy * CPX, w: CPX, h: CPX });
/** Flavour id 1..9 for a chunk (not unique). */
export const siteNum = (cx: number, cy: number): number => (Math.abs(cx * 7 + cy * 13) % 9) + 1;

interface Biter {
  x: number;
  y: number;
  hp: number;
  big: boolean;
  ph: number;
  v: number;
  wig: number;
  tx: number;
  ty: number;
  att: number;
}
/** Draw-only ambient biter loitering by a visible nest. Never counted in `threats`, never fights. */
interface IdleBiter {
  x: number;
  y: number;
  tx: number;
  ty: number;
  hx: number;
  hy: number;
  ph: number;
  wait: number;
  big: boolean;
}
const IDLE_PER_NEST = 4;
const IDLE_SPEED = 3.5; // px/s, a slow crawl
const IDLE_ROAM = 16; // px around its spawner
interface TurretRt {
  x: number;
  y: number;
  cd: number;
  flash: number;
  recoil: number;
  ang: number;
}
interface WallRt {
  rect: Rect;
  dmg: number;
}
interface Bot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  hover: number;
  home: boolean;
}
/** Value copies of the geometry a raid needs; never references into world features. */
interface Bound {
  nestCx: number;
  nestCy: number;
  nestEpoch: number;
  cx: number;
  cy: number;
  epoch: number;
  site: OutpostSite;
  spawners: Pt[];
  nestCentre: Pt;
  walls: WallRt[];
  facingWalls: WallRt[];
  turrets: TurretRt[];
}

function drawBiter(g: CanvasRenderingContext2D, x: number, y: number, big: boolean, ph: number): void {
  const sz = big ? 6 : 4;
  const l = Math.sin(ph) * 2;
  g.strokeStyle = big ? "#2b3350" : "#4a2a30";
  g.lineWidth = 0.9;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(x, y - 1);
    g.lineTo(x + s * (sz / 2 + 2), y - 2 + l * s);
    g.moveTo(x, y);
    g.lineTo(x + s * (sz / 2 + 2.5), y + 0.5 - l * s);
    g.moveTo(x, y + 1);
    g.lineTo(x + s * (sz / 2 + 2), y + 2.5 + l * s);
  }
  g.stroke();
  g.fillStyle = big ? "#6f7fb8" : "#c47a86";
  g.beginPath();
  g.ellipse(x, y, sz / 2, (sz / 2) * 0.8, 0, 0, 7);
  g.fill();
  g.fillStyle = big ? "#a3afd8" : "#e8a8b0";
  g.fillRect(x - sz / 4, y - sz / 2 + 0.5, sz / 2, 1);
  g.fillStyle = "#2a1a1a";
  g.fillRect(x - sz / 2 - 0.5, y - 0.5, 1.5, 1);
}

export class Raid implements EventMachine {
  readonly name = "raid";
  private spiderSrc: SpiderSource | null = null;
  /** Called by Spider's constructor so the lasers can find it. */
  attachSpider(s: SpiderSource): void {
    this.spiderSrc = s;
  }
  get spider(): SpiderSource | null {
    return this.spiderSrc;
  }

  private st: RaidState = "calm";
  private pollution = 0;
  private cooldown = 0;
  private retry = 0;
  private pending: { site: SiteRef; target: Pt; waited: number } | null = null;
  private want: DistrictKind | null = null;
  private bound: Bound | null = null;
  private biters: Biter[] = [];
  private idleBiters = new Map<string, IdleBiter[]>(); // by nest id; ephemeral, pruned when the nest leaves view
  private bots: Bot[] = [];
  private n = 0; // biters launched
  private killed = 0;
  private wallDmg = 0;
  private engaged = false; // fight has begun (turret fired or wall hit)
  private announced = false; // the "turret engaging" line was emitted
  private raidT = 0;
  private repairT = 0;
  private laserCd = 0;

  state(): RaidState {
    return this.st;
  }
  /**
   * The raid in progress, or null. `site.wall` is intentionally empty: the wall geometry is
   * copied by value into the raid's own runtime state; consumers use cx/cy/rect/facing only.
   */
  active(): { site: OutpostSite; biters: number } | null {
    if (!this.bound || (this.st !== "inbound" && this.st !== "fight")) return null;
    return { site: this.bound.site, biters: this.biters.length };
  }
  wants(): DistrictKind | null {
    return this.want;
  }

  camHint(): CamHint | null {
    const b = this.bound;
    if (b && (this.st === "inbound" || this.st === "fight")) {
      const r = b.site.rect;
      return {
        target: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
        hold: true,
        zoomOffset: 0.06,
        priority: 8,
      };
    }
    if (this.pending) return { target: this.pending.target, priority: CAM_PRI_WAIT };
    return null;
  }

  reset(): void {
    if (this.bound) {
      this.pollution = 0.2;
      this.cooldown = 20;
      this.st = "cooldown";
    } else {
      this.st = "calm";
    }
    this.bound = null;
    this.pending = null;
    this.retry = 0;
    this.biters = [];
    this.idleBiters.clear();
    this.bots = [];
    this.n = this.killed = this.wallDmg = 0;
    this.engaged = this.announced = false;
    this.raidT = this.repairT = this.laserCd = 0;
  }

  /** Up to IDLE_PER_NEST slow wanderers near each visible nest's spawners (ctx.rand only). */
  private updateIdle(ctx: SimCtx): void {
    const seen = new Set<string>();
    for (const n of ctx.view.nests) {
      seen.add(n.id);
      const src = n.spawners.length
        ? n.spawners
        : [{ x: n.rect.x + n.rect.w / 2, y: n.rect.y + n.rect.h / 2 }];
      let list = this.idleBiters.get(n.id);
      if (!list) this.idleBiters.set(n.id, (list = []));
      const want = Math.min(IDLE_PER_NEST, 2 * src.length);
      while (list.length < want) {
        const h = src[list.length % src.length];
        const x = h.x + ctx.rand.range(-IDLE_ROAM, IDLE_ROAM),
          y = h.y + ctx.rand.range(-IDLE_ROAM, IDLE_ROAM);
        list.push({
          x,
          y,
          tx: x,
          ty: y,
          hx: h.x,
          hy: h.y,
          ph: ctx.rand.range(0, 6.28),
          wait: ctx.rand.range(0, 3),
          big: ctx.rand.chance(0.2),
        });
      }
      for (const b of list) {
        const dx = b.tx - b.x,
          dy = b.ty - b.y,
          d = Math.hypot(dx, dy);
        if (d > 1) {
          b.x += (dx / d) * IDLE_SPEED * ctx.dt;
          b.y += (dy / d) * IDLE_SPEED * ctx.dt;
          b.ph += ctx.dt * 6;
        } else if ((b.wait -= ctx.dt) <= 0) {
          b.wait = ctx.rand.range(1.5, 4);
          b.tx = b.hx + ctx.rand.range(-IDLE_ROAM, IDLE_ROAM);
          b.ty = b.hy + ctx.rand.range(-IDLE_ROAM, IDLE_ROAM);
        }
      }
    }
    for (const k of [...this.idleBiters.keys()]) if (!seen.has(k)) this.idleBiters.delete(k);
  }

  /** Test aid: idle biter count per visible nest id. */
  idleCounts(): Record<string, number> {
    return Object.fromEntries([...this.idleBiters].map(([k, v]) => [k, v.length]));
  }

  update(ctx: SimCtx): void {
    this.updateIdle(ctx);
    const dt = ctx.dt;
    let chem = 0;
    for (const m of ctx.view.machines) if (m.kind === "chem") chem++;
    this.pollution = Math.min(3, this.pollution + 0.018 * (1 + 0.1 * Math.min(10, chem)) * dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.retry = Math.max(0, this.retry - dt);

    const b = this.bound;
    if (b) {
      const alive = ctx.world.epoch(b.cx, b.cy) === b.epoch;
      const nestAlive =
        this.st === "repair" || this.st === "cooldown" || ctx.world.epoch(b.nestCx, b.nestCy) === b.nestEpoch;
      if (!alive || !nestAlive) {
        this.reset();
        return;
      }
    }

    if (this.st === "cooldown" && this.cooldown <= 0 && !this.bound) this.st = "calm";
    if (this.st === "calm" && this.cooldown <= 0 && this.pollution >= 1) this.tryLaunch(ctx);

    if (this.st === "inbound" || this.st === "fight") this.simFight(ctx);
    else if (this.st === "repair") this.simRepair(ctx);
  }

  private giveUp(ctx: SimCtx): void {
    this.pending = null;
    this.retry = ctx.rand.range(10, 20);
  }

  private tryLaunch(ctx: SimCtx): void {
    if (this.retry > 0) return;
    const w = ctx.world;
    const site = this.pending?.site ?? w.findSite("nest", { x: ctx.cam.x, y: ctx.cam.y }, 4);
    if (!site) {
      this.want = "nest";
      this.giveUp(ctx);
      return;
    }
    this.want = null;
    // Resolve geometry once both chunks are resident; otherwise wait (<= 20 s) with a camera hint.
    let nestSite = null as ReturnType<typeof w.query>["nests"][number] | null;
    let outpost = null as OutpostSite | null;
    let target: Pt = site.centre;
    if (w.isResident(site.cx, site.cy)) {
      nestSite =
        w.query(chunkRect(site.cx, site.cy)).nests.find((n) => n.cx === site.cx && n.cy === site.cy) ?? null;
      if (!nestSite) return this.giveUp(ctx);
      const oc = nestSite.outpost;
      if (w.isResident(oc.cx, oc.cy)) {
        outpost =
          w.query(chunkRect(oc.cx, oc.cy)).outposts.find((o) => o.cx === oc.cx && o.cy === oc.cy) ?? null;
        if (!outpost) return this.giveUp(ctx);
      } else {
        target = { x: (oc.cx + 0.5) * CPX, y: (oc.cy + 0.5) * CPX };
      }
    }
    if (!nestSite || !outpost) {
      const waited = (this.pending?.waited ?? 0) + ctx.dt;
      if (waited > WAIT_RESIDENT) return this.giveUp(ctx);
      this.pending = { site, target, waited };
      return;
    }
    this.pending = null;
    this.launch(ctx, nestSite.cx, nestSite.cy, nestSite.spawners, nestSite.rect, outpost);
  }

  private launch(
    ctx: SimCtx,
    ncx: number,
    ncy: number,
    spawners: Pt[],
    nestRect: Rect,
    o: OutpostSite,
  ): void {
    const rnd = () => ctx.rand.next();
    const w = ctx.world;
    const r = o.rect;
    const d = DIRS[o.facing];
    const sideDist = (rc: Rect): number =>
      d[0] > 0
        ? Math.abs(rc.x + rc.w / 2 - (r.x + r.w))
        : d[0] < 0
          ? Math.abs(rc.x + rc.w / 2 - r.x)
          : d[1] > 0
            ? Math.abs(rc.y + rc.h / 2 - (r.y + r.h))
            : Math.abs(rc.y + rc.h / 2 - r.y);
    const walls: WallRt[] = o.wall.map((s) => ({ rect: { ...s.rect }, dmg: 0 }));
    const facing = walls.filter((s) => sideDist(s.rect) <= 9);
    const nestCentre = { x: nestRect.x + nestRect.w / 2, y: nestRect.y + nestRect.h / 2 };
    const src = spawners.length ? spawners.map((p) => ({ ...p })) : [nestCentre];
    this.bound = {
      nestCx: ncx,
      nestCy: ncy,
      nestEpoch: w.epoch(ncx, ncy),
      cx: o.cx,
      cy: o.cy,
      epoch: w.epoch(o.cx, o.cy),
      site: { ...o, rect: { ...o.rect }, wall: [], turrets: o.turrets.map((p) => ({ ...p })) },
      spawners: src,
      nestCentre,
      walls,
      facingWalls: facing.length ? facing : walls,
      turrets: o.turrets.map((p) => ({ x: p.x, y: p.y, cd: 0, flash: 0, recoil: 0, ang: 0 })),
    };
    this.n = Math.min(MAX_BITERS, 8 + Math.min(10, Math.floor(5 * this.pollution)));
    this.pollution = 0.2;
    this.killed = this.wallDmg = 0;
    this.engaged = this.announced = false;
    this.raidT = this.laserCd = 0;
    this.biters = [];
    for (let i = 0; i < this.n; i++) {
      const sp = src[i % src.length];
      const big = rnd() < 0.22;
      const side = rnd();
      this.biters.push({
        x: sp.x + 10 + rnd() * 30,
        y: sp.y + rnd() * 30 - 15,
        hp: big ? 9 : 4,
        big,
        ph: rnd() * 6,
        v: (big ? 11 : 15) + rnd() * 3,
        wig: rnd() * 6,
        tx: d[0] > 0 ? r.x + r.w + 2 : d[0] < 0 ? r.x - 2 : r.x + 8 + side * (r.w - 16),
        ty: d[1] > 0 ? r.y + r.h + 2 : d[1] < 0 ? r.y - 2 : r.y + 8 + side * (r.h - 16),
        att: 0,
      });
    }
    this.st = "inbound";
    ctx.emit(
      `pollution cloud reached nest N-${siteNum(ncx, ncy)} · ${this.n} biters inbound → outpost O-${siteNum(o.cx, o.cy)}`,
    );
  }

  private simFight(ctx: SimCtx): void {
    const b = this.bound!;
    const dt = ctx.dt;
    const t = ctx.t;
    const rnd = () => ctx.rand.next();
    const live = ctx.live;

    for (const bt of this.biters) {
      bt.ph += dt * 10;
      const dx = bt.tx - bt.x,
        dy = bt.ty - bt.y,
        dist = Math.hypot(dx, dy);
      if (dist > 4) {
        bt.x += ((dx / dist) * bt.v + Math.sin(t * 3 + bt.wig) * 4) * dt;
        bt.y += ((dy / dist) * bt.v + Math.cos(t * 2.3 + bt.wig) * 4) * dt;
      } else {
        bt.att += dt;
        if (bt.att > 0.7) {
          bt.att = 0;
          let seg: WallRt | null = null,
            bd = Infinity;
          for (const s of b.facingWalls) {
            if (s.dmg >= 3) continue;
            const sd = Math.hypot(s.rect.x + s.rect.w / 2 - bt.x, s.rect.y + s.rect.h / 2 - bt.y);
            if (sd < bd) {
              bd = sd;
              seg = s;
            }
          }
          if (seg) {
            if (!seg.dmg) this.wallDmg++;
            seg.dmg++;
            live.spawn("spark", seg.rect.x + seg.rect.w / 2, seg.rect.y + seg.rect.h / 2, {
              life: 0.25,
              color: "#ff503c",
            });
            this.engaged = true;
          }
        }
      }
    }

    for (let i = 0; i < b.turrets.length; i++) {
      const tu = b.turrets[i];
      tu.cd -= dt;
      tu.flash -= dt;
      tu.recoil = Math.max(0, tu.recoil - dt * 12);
      let best: Biter | null = null,
        bd = TURRET_RANGE,
        inRange = 0;
      for (const bt of this.biters) {
        const dd = Math.hypot(bt.x - tu.x, bt.y - tu.y);
        if (dd < TURRET_RANGE) inRange++;
        if (dd < bd) {
          bd = dd;
          best = bt;
        }
      }
      if (best) {
        tu.ang = Math.atan2(best.y - tu.y, best.x - tu.x);
        if (tu.cd <= 0) {
          tu.cd = 0.3 + rnd() * 0.12;
          tu.flash = 0.06;
          tu.recoil = 2;
          live.spawn("tracer", tu.x, tu.y, { x2: best.x, y2: best.y, life: 0.07, color: "#ffe68c" });
          live.spawn("ember", tu.x + Math.cos(tu.ang + 1.57) * 3, tu.y + Math.sin(tu.ang + 1.57) * 3, {
            vx: Math.cos(tu.ang + 1.9) * 14,
            vy: Math.sin(tu.ang + 1.9) * 14,
            life: 0.35,
            color: "#e0b73a",
          });
          best.hp -= 1;
          this.engaged = true;
          if (!this.announced) {
            this.announced = true;
            ctx.emit(`turret T-${i + 1} engaging · ${inRange} hostiles in range`);
          }
        }
      } else tu.ang += dt * 0.3;
    }

    // spidertron lasers
    this.laserCd -= dt;
    const sp = this.spider?.position() ?? null;
    if (sp && this.laserCd <= 0) {
      let best: Biter | null = null,
        bd = SPIDER_RANGE;
      for (const bt of this.biters) {
        const dd = Math.hypot(bt.x - sp.x, bt.y - sp.y);
        if (dd < bd) {
          bd = dd;
          best = bt;
        }
      }
      if (best) {
        this.laserCd = 0.5;
        live.spawn("tracer", sp.x, sp.y - 3, { x2: best.x, y2: best.y, life: 0.1, color: "#78c8ff" });
        best.hp -= 2;
      }
    }

    for (let i = this.biters.length - 1; i >= 0; i--) {
      const bt = this.biters[i];
      if (bt.hp > 0) continue;
      live.spawn("corpse", bt.x, bt.y, { size: bt.big ? 5 : 4 });
      for (let k = 0; k < 6; k++)
        live.spawn("splat", bt.x, bt.y, {
          vx: rnd() * 30 - 15,
          vy: -rnd() * 20,
          color: bt.big ? "#5c6f9a" : "#a84a4a",
        });
      this.biters.splice(i, 1);
      this.killed++;
    }

    if (this.engaged) this.st = "fight";
    ctx.stats.threats += this.biters.length;
    this.raidT += dt;
    if (this.biters.length === 0 || this.raidT > RAID_TIMEOUT) this.endFight(ctx);
  }

  private endFight(ctx: SimCtx): void {
    const b = this.bound!;
    this.biters = [];
    this.cooldown = ctx.rand.range(40, 70);
    ctx.stats.repelled += this.killed;
    ctx.emit(`defense: ${this.killed}/${this.n} biters repelled · wall segments damaged: ${this.wallDmg}`);
    if (this.wallDmg > 0) {
      ctx.emit(`construction bots repairing wall (${this.wallDmg})`);
      const hurt = b.walls.filter((s) => s.dmg > 0);
      const rp = b.site.roboport;
      this.bots = [];
      for (let i = 0; i < Math.min(4, this.wallDmg); i++) {
        const s = hurt[i % hurt.length].rect;
        this.bots.push({
          x: rp.x,
          y: rp.y,
          tx: s.x + s.w / 2,
          ty: s.y + s.h / 2,
          hover: 0,
          home: false,
        });
      }
      this.repairT = 0;
      this.st = "repair";
    } else {
      this.finish();
    }
  }

  private finish(): void {
    this.bound = null;
    this.bots = [];
    this.st = this.cooldown > 0 ? "cooldown" : "calm";
  }

  private simRepair(ctx: SimCtx): void {
    const b = this.bound!;
    const dt = ctx.dt;
    this.repairT += dt;
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const bot = this.bots[i];
      const dx = bot.tx - bot.x,
        dy = bot.ty - bot.y,
        d = Math.hypot(dx, dy);
      if (d > 2) {
        bot.x += (dx / d) * 24 * dt;
        bot.y += (dy / d) * 24 * dt;
      } else if (bot.home) {
        this.bots.splice(i, 1);
      } else {
        bot.hover += dt;
        if (bot.hover > 1.5) {
          for (const w of b.walls) w.dmg = 0;
          bot.home = true;
          bot.tx = b.site.roboport.x;
          bot.ty = b.site.roboport.y;
        }
      }
    }
    ctx.stats.bots += this.bots.length;
    if (this.bots.length === 0 || this.repairT > 40) {
      for (const w of b.walls) w.dmg = 0;
      this.finish();
    }
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    if (this.idleBiters.size) {
      g.save();
      g.translate(d.sx(0), d.sy(0));
      g.scale(d.view.z, d.view.z);
      for (const list of this.idleBiters.values())
        for (const bt of list) if (d.inView(bt.x, bt.y, 8)) drawBiter(g, bt.x, bt.y, bt.big, bt.ph);
      g.restore();
    }
    const b = this.bound;
    if (!b) return;
    const z = d.view.z;
    g.save();
    g.translate(d.sx(0), d.sy(0));
    g.scale(z, z);
    const t = d.t;
    // wall cracks
    for (const w of b.walls) {
      if (!w.dmg) continue;
      const cx = w.rect.x + w.rect.w / 2,
        cy = w.rect.y + w.rect.h / 2;
      if (!d.inView(cx, cy, 12)) continue;
      g.fillStyle = "#3a2a24";
      g.fillRect(cx - 2, cy - 2, 2, 2);
      g.fillRect(cx, cy, 2, 1);
      if (w.dmg > 1) g.fillRect(cx + 1, cy - 2, 1, 2);
    }
    // biters
    for (const bt of this.biters) if (d.inView(bt.x, bt.y, 8)) drawBiter(g, bt.x, bt.y, bt.big, bt.ph);
    // turrets (head, barrel, muzzle flash)
    for (const tu of b.turrets) {
      if (!d.inView(tu.x, tu.y, 10)) continue;
      g.fillStyle = "#8a9095";
      g.beginPath();
      g.arc(tu.x, tu.y, 3, 0, 7);
      g.fill();
      const bl = 6 - tu.recoil;
      g.strokeStyle = "#2d3034";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(tu.x, tu.y);
      g.lineTo(tu.x + Math.cos(tu.ang) * bl, tu.y + Math.sin(tu.ang) * bl);
      g.stroke();
      if (tu.flash > 0) {
        g.fillStyle = "#fff3b0";
        g.fillRect(tu.x + Math.cos(tu.ang) * 6 - 1, tu.y + Math.sin(tu.ang) * 6 - 1, 2.5, 2.5);
        d.light({ x: tu.x, y: tu.y, r: 22, color: "orange", a: 0.8 });
      }
    }
    // construction bots
    for (const bot of this.bots) {
      if (!d.inView(bot.x, bot.y, 6)) continue;
      g.fillStyle = "rgba(0,0,0,.25)";
      g.fillRect(bot.x + 1.5, bot.y + 3, 2.5, 1.5);
      g.fillStyle = "#4fb3ff";
      g.fillRect(bot.x - 1, bot.y - 1, 2.5, 2.5);
      if (bot.hover > 0 && !bot.home) {
        g.strokeStyle = "rgba(120,200,255,.7)";
        g.lineWidth = 0.8;
        g.beginPath();
        g.arc(bot.x, bot.y, 3 + Math.sin(t * 12), 0, 7);
        g.stroke();
        g.strokeStyle = "rgba(120,200,255,.9)";
        g.beginPath();
        g.moveTo(bot.x, bot.y);
        g.lineTo(bot.x + Math.cos(t * 20) * 3, bot.y + 4 + Math.sin(t * 20) * 1.5);
        g.stroke();
      }
    }
    g.restore();
  }
}
