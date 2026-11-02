import {
  CH,
  CPX,
  T,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type EventMachine,
  type Pt,
  type RailSeg,
  type SimCtx,
  type Station,
} from "../core/types";
import { mainlineCol } from "../world/terrain";

// Port of ref simTrains / akl train code, generalised to up to 3 trains (one per line).

const MAX_TRAINS = 3;
const CRUISE = 3.4 * T; // px/s
const ACCEL = 14; // px/s²
const BRAKE = 14; // px/s²
const STOP_TIME = 4.5;
const END_WAIT = 2; // s at a buffer stop before heading back
const MIN_LINE = 28 * T;
const SIGNAL_EVERY = 150;
const SIGNAL_BEFORE_STATION = 70;
const SIGNAL_REACH = 60;
const SPAWN_MARGIN = 2 * T;
const OFF_VIEW_DESPAWN = 2;
const CAR_GAP = 0.35 * T;
/** Seconds without an arrival before the camera visits a station (hubs on the mainline), how far it looks, how long it stays. */
const VISIT_AFTER = 40;
const VISIT_SEARCH = 4; // chunks
const VISIT_MAX = 45;
const VISIT_NEAR = 40; // px: the camera has arrived at the station
const VISIT_IDLE = 12; // s on station with no train on its line: give up on it
/** Target priority while a train brakes into the visited station: above raid fights (8), below launch (9) and look (10). */
const ARRIVING_PRIORITY = 8.5;
/** Hold the camera while a visible train is this close to a visible station: at most HOLD_MAX s, then HOLD_COOL s off. */
const HOLD_REACH = 40 * T;
const HOLD_MAX = 25;
const HOLD_COOL = 30;
/** [length in tiles, body, trim] — loco, four wagons, loco (akl CARS). */
const CARS: ReadonlyArray<readonly [number, string, string]> = [
  [2.6, "#3a3d42", "#e0b622"],
  [2.1, "#4f6272", "#3d4b56"],
  [2.1, "#54462e", "#3e3421"],
  [2.1, "#4f6272", "#3d4b56"],
  [2.1, "#54462e", "#3e3421"],
  [2.6, "#3a3d42", "#e0b622"],
];
const CAR_OFFSETS: number[] = [];
let TRAIN_LEN = 0;
for (const [l] of CARS) {
  CAR_OFFSETS.push(TRAIN_LEN);
  TRAIN_LEN += l * T + CAR_GAP;
}
TRAIN_LEN -= CAR_GAP;

interface Signal {
  key: string;
  id: number;
  s: number;
  x: number;
  y: number;
  ang: number;
}
interface LineStation {
  id: string;
  s: number;
  at: Pt;
}
interface Line {
  key: string;
  lineId: string;
  pts: Pt[];
  cum: number[]; // cumulative arc length at each point
  L: number;
  stations: LineStation[];
  signals: Signal[];
}
interface Train {
  n: number;
  line: Line;
  s: number; // arc-length of the head
  dir: 1 | -1;
  speed: number;
  wait: number;
  last: string | null; // station id last stopped at
  puff: number;
  dust: number;
  off: number;
  epochs: Map<string, number>;
}
interface Visit {
  cx: number;
  cy: number;
  at: Pt; // chunk centre, then the station once the chunk is resident
  stationId: string | null;
  t: number;
  idle: number;
}
interface PosAng {
  x: number;
  y: number;
  ang: number;
}

/** Stable signal id 1..99 from the signal's rounded world position (not a running counter). */
export const signalNum = (x: number, y: number): number => (Math.abs(x * 31 + y * 17) % 99) + 1;
const ptKey = (p: Pt) => `${Math.round(p.x)},${Math.round(p.y)}`;
const chunkKey = (x: number, y: number) => `${Math.floor(x / CPX)},${Math.floor(y / CPX)}`;
const digit = (x: number, y: number) =>
  (Math.abs(Math.floor(x / CPX) * 7 + Math.floor(y / CPX) * 13) % 9) + 1;

/** Merge touching segments of one lineId into polylines (chains), dropping collinear mid points. */
function chainSegments(segs: RailSeg[]): Pt[][] {
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = ptKey(p);
      const l = at.get(k);
      if (l) l.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Array<boolean>(segs.length).fill(false);
  const take = (p: Pt): { next: Pt } | null => {
    for (const i of at.get(ptKey(p)) ?? []) {
      if (used[i]) continue;
      used[i] = true;
      return { next: ptKey(segs[i].a) === ptKey(p) ? segs[i].b : segs[i].a };
    }
    return null;
  };
  const chains: Pt[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const pts: Pt[] = [segs[i].a, segs[i].b];
    for (let n = take(pts[pts.length - 1]); n; n = take(pts[pts.length - 1])) pts.push(n.next);
    for (let n = take(pts[0]); n; n = take(pts[0])) pts.unshift(n.next);
    // drop zero-length and collinear interior points
    const out: Pt[] = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5) continue;
      if (out.length >= 2) {
        const a = out[out.length - 2];
        if ((a.x === q.x && q.x === p.x) || (a.y === q.y && q.y === p.y)) out.pop();
      }
      out.push(p);
    }
    if (out.length >= 2) chains.push(out);
  }
  return chains;
}

function posAt(line: Line, s: number): PosAng {
  const { pts, cum } = line;
  let i = 0;
  if (s > 0) {
    i = pts.length - 2;
    for (let k = 1; k < pts.length; k++)
      if (s <= cum[k]) {
        i = k - 1;
        break;
      }
  }
  const a = pts[i],
    b = pts[i + 1];
  const len = cum[i + 1] - cum[i] || 1;
  const ux = (b.x - a.x) / len,
    uy = (b.y - a.y) / len;
  const u = s - cum[i];
  return { x: a.x + ux * u, y: a.y + uy * u, ang: Math.atan2(uy, ux) };
}

/** Closest arc-length on the polyline to (x, y), and the distance to it. */
function project(line: Line, x: number, y: number): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  for (let i = 0; i < line.pts.length - 1; i++) {
    const a = line.pts[i],
      b = line.pts[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    const d = Math.hypot(a.x + dx * u - x, a.y + dy * u - y);
    if (d < best.d) best = { s: line.cum[i] + u * Math.sqrt(l2), d };
  }
  return best;
}

export class Trains implements EventMachine {
  readonly name = "trains";
  private lines: Line[] = [];
  private sig = "";
  private trains: Train[] = [];
  private busy = new Set<string>();
  private spawnT = 0;
  private counter = 0;
  private sigRed = new Map<string, boolean>();
  private since = 0; // seconds since the last arrival (or the last visit attempt)
  private visit: Visit | null = null;
  private unserved = new Set<string>(); // mainline hub chunks with no station, or one no train reaches
  private approaching = false; // a visible train is braking toward a visible station
  private arriving = false; // ... and that station is the one being visited
  private held = 0; // seconds approaches have held the camera since the last arrival or cooldown
  private cool = 0; // seconds until approaches may hold the camera again

  update(ctx: SimCtx): void {
    this.rebuild(ctx);
    this.busy = new Set();
    this.since += ctx.dt;
    this.updateVisit(ctx);
    this.approaching = false;
    this.arriving = false;

    // chunk eviction: a train that has touched a chunk whose epoch changed vanishes silently
    const kept = this.trains.filter((tr) => {
      const p = posAt(tr.line, tr.s);
      const k = chunkKey(p.x, p.y);
      if (!tr.epochs.has(k)) this.touch(ctx, tr, p);
      for (const [ck, ep] of tr.epochs) {
        const [cx, cy] = ck.split(",").map(Number);
        if (ctx.world.epoch(cx, cy) !== ep) return false;
      }
      return true;
    });
    if (kept.length < this.trains.length) this.spawnT = Math.max(this.spawnT, ctx.rand.range(2, 5));
    this.trains = kept;

    this.spawnT -= ctx.dt;
    if (this.trains.length < MAX_TRAINS && this.spawnT <= 0) {
      this.spawn(ctx);
      this.spawnT = ctx.rand.range(2, 6);
    }

    for (const tr of this.trains) this.step(ctx, tr);
    this.updateSignals(ctx);

    this.trains = this.trains.filter((tr) => tr.off <= OFF_VIEW_DESPAWN);
    if (this.cool > 0) this.cool -= ctx.dt;
    else if (this.approaching && (this.held += ctx.dt) >= HOLD_MAX) {
      this.held = 0;
      this.cool = HOLD_COOL;
    }
    ctx.stats.trains += this.trains.length;
  }

  /**
   * Stations only sit on hubs the mainline crosses, so the tour rarely shows an arrival by chance:
   * after VISIT_AFTER s without one, steer to the nearest such hub and stay up to VISIT_MAX s.
   */
  private updateVisit(ctx: SimCtx): void {
    const v = this.visit;
    if (!v) {
      if (this.since <= VISIT_AFTER) return;
      this.since = 0; // whether or not a station is found, try again VISIT_AFTER s from now
      const fx = Math.floor(ctx.cam.x / CPX),
        fy = Math.floor(ctx.cam.y / CPX);
      let best: { cx: number; cy: number; d: number } | null = null;
      for (let dy = -VISIT_SEARCH; dy <= VISIT_SEARCH; dy++)
        for (let dx = -VISIT_SEARCH; dx <= VISIT_SEARCH; dx++) {
          const cx = fx + dx,
            cy = fy + dy,
            d = dx * dx + dy * dy;
          if (best && d >= best.d) continue;
          if (mainlineCol(cx * CH) >= (cx + 1) * CH || this.unserved.has(`${cx},${cy}`)) continue;
          if (ctx.world.kindAt(cx, cy) === "hub") best = { cx, cy, d };
        }
      if (best)
        this.visit = {
          cx: best.cx,
          cy: best.cy,
          at: { x: (best.cx + 0.5) * CPX, y: (best.cy + 0.5) * CPX },
          stationId: null,
          t: 0,
          idle: 0,
        };
      return;
    }
    v.t += ctx.dt;
    if (v.t > VISIT_MAX) {
      this.visit = null;
      this.since = 0; // let the tour roam for VISIT_AFTER s before the next visit
      return;
    }
    if (v.stationId === null) {
      if (!ctx.world.isResident(v.cx, v.cy)) return;
      const st = ctx.world
        .query({ x: v.cx * CPX, y: v.cy * CPX, w: CPX, h: CPX })
        .stations.find((s) => Math.floor(s.at.x / CPX) === v.cx && Math.floor(s.at.y / CPX) === v.cy);
      if (!st) return this.skipVisit(v);
      v.at = st.at;
      v.stationId = st.id;
      return;
    }
    // on station: a line too short to spawn on (trains enter from off view) is never served
    if (Math.hypot(ctx.cam.x - v.at.x, ctx.cam.y - v.at.y) > VISIT_NEAR) return;
    const served = this.trains.some((tr) => tr.line.stations.some((s) => s.id === v.stationId));
    v.idle = served ? 0 : v.idle + ctx.dt;
    if (v.idle > VISIT_IDLE) this.skipVisit(v);
  }

  private skipVisit(v: Visit): void {
    this.unserved.add(`${v.cx},${v.cy}`);
    this.visit = null;
    this.since = VISIT_AFTER; // look for the next one straight away
  }

  /** Record the epoch of the chunk under `p`; non-resident chunks (epoch -1) are never recorded. */
  private touch(ctx: SimCtx, tr: Train, p: Pt): void {
    const ep = ctx.world.epoch(Math.floor(p.x / CPX), Math.floor(p.y / CPX));
    if (ep >= 0) tr.epochs.set(chunkKey(p.x, p.y), ep);
  }

  private rebuild(ctx: SimCtx): void {
    const { rails, stations } = ctx.view;
    let h = rails.length * 31 + stations.length;
    for (const r of rails) h = (Math.imul(h, 31) + r.a.x + 3 * r.a.y + 7 * r.b.x + 11 * r.b.y) | 0;
    for (const s of stations) h = (Math.imul(h, 31) + s.at.x + 3 * s.at.y) | 0;
    const sig = `${rails.length}:${stations.length}:${h}`;
    if (sig === this.sig) return;
    this.sig = sig;

    const byLine = new Map<string, RailSeg[]>();
    for (const r of rails) {
      const l = byLine.get(r.lineId);
      if (l) l.push(r);
      else byLine.set(r.lineId, [r]);
    }
    const lines: Line[] = [];
    for (const [lineId, segs] of byLine) {
      const chains = chainSegments(segs);
      chains.forEach((pts, ci) => {
        const cum = [0];
        for (let i = 1; i < pts.length; i++)
          cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        const line: Line = {
          key: chains.length > 1 ? `${lineId}#${ci}` : lineId,
          lineId,
          pts,
          cum,
          L: cum[cum.length - 1],
          stations: [],
          signals: [],
        };
        lines.push(line);
      });
    }
    // stations and signals
    const stationsOf = (st: Station) => lines.filter((l) => l.lineId === st.lineId);
    for (const st of stations)
      for (const line of stationsOf(st)) {
        const pr = project(line, st.at.x, st.at.y);
        if (pr.d <= 4) line.stations.push({ id: st.id, s: pr.s, at: st.at });
      }
    for (const line of lines) {
      line.stations.sort((a, b) => a.s - b.s);
      const at: number[] = [];
      for (let s = SIGNAL_EVERY; s < line.L; s += SIGNAL_EVERY) at.push(s);
      for (const st of line.stations) {
        if (st.s - SIGNAL_BEFORE_STATION > 0) at.push(st.s - SIGNAL_BEFORE_STATION);
        if (st.s + SIGNAL_BEFORE_STATION < line.L) at.push(st.s + SIGNAL_BEFORE_STATION);
      }
      for (const s of at) {
        const p = posAt(line, s);
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        const id = signalNum(Math.round(p.x), Math.round(p.y));
        line.signals.push({ key, id, s, x: p.x, y: p.y, ang: p.ang });
      }
    }
    // forget signals of lines that no longer exist
    const live = new Set<string>();
    for (const l of lines) for (const sg of l.signals) live.add(sg.key);
    for (const k of [...this.sigRed.keys()]) if (!live.has(k)) this.sigRed.delete(k);
    // re-attach trains to the rebuilt lines
    this.trains = this.trains.filter((tr) => {
      const p = posAt(tr.line, tr.s);
      let best: { line: Line; s: number; d: number } | null = null;
      for (const l of lines) {
        if (l.lineId !== tr.line.lineId) continue;
        const pr = project(l, p.x, p.y);
        if (!best || pr.d < best.d) best = { line: l, ...pr };
      }
      if (!best || best.d > 6) return false;
      // the rebuilt chain may be oriented the other way: keep the world direction
      const oldAng = p.ang;
      const newAng = posAt(best.line, best.s).ang;
      if (Math.cos(oldAng - newAng) < 0) tr.dir = tr.dir > 0 ? -1 : 1;
      tr.line = best.line;
      tr.s = best.s;
      return true;
    });
    this.lines = lines;
  }

  private viewRect(ctx: SimCtx, m: number) {
    const v = ctx.cam.view;
    return { x0: v.x0 - m, y0: v.y0 - m, x1: v.x0 + v.w / v.z + m, y1: v.y0 + v.h / v.z + m };
  }

  private spawn(ctx: SimCtx): void {
    const r = this.viewRect(ctx, 0);
    const inside = (p: Pt) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
    const spots: Array<{ line: Line; s: number; dir: 1 | -1 }> = [];
    for (const line of this.lines) {
      if (line.L < MIN_LINE || line.L < TRAIN_LEN + 2 * SPAWN_MARGIN) continue;
      if (this.trains.some((t) => t.line.key === line.key)) continue;
      let first = -1,
        last = -1;
      for (let s = 0; s <= line.L; s += T) {
        if (inside(posAt(line, s))) {
          if (first < 0) first = s;
          last = s;
        }
      }
      if (first < 0) continue;
      const a = first - SPAWN_MARGIN;
      if (a - TRAIN_LEN >= 0 && !inside(posAt(line, a))) spots.push({ line, s: a, dir: 1 });
      const b = last + SPAWN_MARGIN;
      if (b + TRAIN_LEN <= line.L && !inside(posAt(line, b))) spots.push({ line, s: b, dir: -1 });
    }
    if (!spots.length) return;
    const sp = ctx.rand.pick(spots);
    const p = posAt(sp.line, sp.s);
    const tr: Train = {
      n: (this.counter++ % 9) + 1,
      line: sp.line,
      s: sp.s,
      dir: sp.dir,
      speed: CRUISE,
      wait: 0,
      last: null,
      puff: 0,
      dust: 0,
      off: 0,
      epochs: new Map(),
    };
    this.touch(ctx, tr, p);
    this.trains.push(tr);
  }

  private step(ctx: SimCtx, tr: Train): void {
    const { dt } = ctx;
    const line = tr.line;
    const r = this.viewRect(ctx, 24);
    const head = posAt(line, tr.s);
    const near = head.x >= r.x0 && head.x <= r.x1 && head.y >= r.y0 && head.y <= r.y1;
    let nextStation: LineStation | null = null;

    if (tr.wait > 0) {
      tr.wait -= dt;
      tr.speed = 0;
      const st = line.stations.find((s) => s.id === tr.last);
      if (st) this.busy.add(st.id);
    } else {
      let dist = Infinity;
      for (const st of line.stations) {
        if (st.id === tr.last) continue;
        const d = (st.s - tr.s) * tr.dir;
        if (d >= -0.001 && d < dist) {
          dist = d;
          nextStation = st;
        }
      }
      if (nextStation && near && dist < HOLD_REACH) {
        const v = this.viewRect(ctx, 0);
        const { x, y } = nextStation.at;
        if (x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1) this.approaching = true;
        if (nextStation.id === this.visit?.stationId) this.arriving = true;
      }
      // A line ends where the rail does: 2 tiles from water (a terminus), or the loaded area's edge
      // (a chunk past the view, where off-view despawn gets there first). Brake into it like a station.
      const toEnd = Math.max(0, tr.dir > 0 ? line.L - tr.s : tr.s);
      let vt = Math.min(CRUISE, Math.max(2.5, Math.sqrt(2 * BRAKE * toEnd)));
      if (nextStation) vt = Math.min(vt, Math.max(2.5, Math.sqrt(2 * BRAKE * dist)));
      const before = tr.speed;
      tr.speed += Math.max(-BRAKE * dt, Math.min(ACCEL * dt, vt - tr.speed));
      const move = tr.speed * dt;
      if (move >= toEnd - 0.3 && !(nextStation && dist <= toEnd)) {
        // buffer stop: halt with the head at the rail's end, then reverse in place (same footprint)
        tr.s = tr.dir > 0 ? line.L : 0;
        tr.s -= tr.dir * TRAIN_LEN;
        tr.dir = tr.dir > 0 ? -1 : 1;
        tr.speed = 0;
        tr.wait = END_WAIT;
        tr.last = null;
      } else if (nextStation && move >= dist - 0.3) {
        tr.s = nextStation.s;
        tr.speed = 0;
        tr.wait = STOP_TIME;
        tr.last = nextStation.id;
        this.busy.add(nextStation.id);
        this.since = 0;
        this.held = 0;
        this.visit = null;
        ctx.emit(`train L-${tr.n} arrived · ST-${digit(nextStation.at.x, nextStation.at.y)} ore unload`);
        if (near)
          for (let k = 0; k < 6; k++)
            ctx.live.spawn(
              "dust",
              nextStation.at.x + ctx.rand.range(-10, 10),
              nextStation.at.y + ctx.rand.range(-3, 3),
              {
                vx: ctx.rand.range(-2, 2),
                vy: -1,
                life: 1.2,
                size: 1.2,
              },
            );
      } else {
        tr.s += tr.dir * move;
        tr.dust -= dt;
        if (nextStation && tr.speed < before && dist < 30 && tr.dust <= 0) {
          tr.dust = 0.12;
          if (near)
            ctx.live.spawn("dust", head.x, head.y, {
              vx: ctx.rand.range(-2, 2),
              vy: -0.6,
              life: 0.7,
              size: 0.9,
            });
        }
      }
    }

    tr.puff -= dt;
    if (tr.puff <= 0) {
      tr.puff = 0.16;
      const h = posAt(line, tr.s - tr.dir * 3);
      if (near)
        ctx.live.spawn("puff", h.x, h.y, {
          vx: -Math.cos(h.ang) * tr.dir * 6,
          vy: -Math.sin(h.ang) * tr.dir * 6 - 2,
          life: 1.3,
          size: 0.7,
          color: "#2b2b2b",
        });
    }

    // fully off-view timer
    const v = this.viewRect(ctx, 8);
    let visible = false;
    for (let i = 0; i < CARS.length && !visible; i++) {
      const p = posAt(line, tr.s - tr.dir * (CAR_OFFSETS[i] + (CARS[i][0] * T) / 2));
      visible = p.x >= v.x0 && p.x <= v.x1 && p.y >= v.y0 && p.y <= v.y1;
    }
    tr.off = visible ? 0 : tr.off + dt;
  }

  private updateSignals(ctx: SimCtx): void {
    for (const line of this.lines) {
      for (const sg of line.signals) {
        let red = false;
        for (const tr of this.trains) {
          if (tr.line !== line) continue;
          const d = (tr.s - sg.s) * tr.dir;
          if (d >= 0 && d < TRAIN_LEN + SIGNAL_REACH) red = true;
        }
        if (red !== (this.sigRed.get(sg.key) ?? false)) {
          this.sigRed.set(sg.key, red);
          if (ctx.rand.chance(0.2)) ctx.emit(`signal S-${sg.id} → ${red ? "red" : "green"}`);
        }
      }
    }
  }

  busyStations(): Set<string> {
    return new Set(this.busy);
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    const z = d.view.z;
    const night = d.env.night;
    // signals
    for (const line of this.lines) {
      for (const sg of line.signals) {
        if (!d.inView(sg.x, sg.y, 12)) continue;
        const px = sg.x - Math.sin(sg.ang) * 5,
          py = sg.y + Math.cos(sg.ang) * 5;
        const red = this.sigRed.get(sg.key) ?? false;
        g.fillStyle = "#3a3f44";
        g.fillRect(d.sx(px) - 0.8 * z, d.sy(py) - 1.6 * z, 1.6 * z, 3.2 * z);
        g.fillStyle = red ? "#e0341e" : "#4fcf5a";
        g.fillRect(d.sx(px) - 0.5 * z, d.sy(py) - 1.2 * z, 1 * z, 1 * z);
        if (night > 0.25) d.light({ x: px, y: py, r: 9, color: red ? "red" : "green", a: 0.5 });
      }
    }
    // trains
    for (const tr of this.trains) {
      for (let i = 0; i < CARS.length; i++) {
        const [tiles, body, trim] = CARS[i];
        const len = tiles * T;
        const c = posAt(tr.line, tr.s - tr.dir * (CAR_OFFSETS[i] + len / 2));
        if (!d.inView(c.x, c.y, len + 4)) continue;
        g.save();
        g.translate(d.sx(c.x), d.sy(c.y));
        g.rotate(c.ang);
        g.fillStyle = "rgba(0,0,0,.35)";
        g.fillRect((-len / 2 - 0.5) * z, -3.3 * z, (len + 1) * z, 6.6 * z);
        g.fillStyle = body;
        g.fillRect((-len / 2) * z, -2.3 * z, len * z, 4.6 * z);
        g.fillStyle = trim;
        g.fillRect((tr.dir > 0 ? len / 2 - 3 : -len / 2 + 0.3) * z, -2.3 * z, 2.7 * z, 4.6 * z);
        if (i > 0 && i < CARS.length - 1) {
          g.fillStyle = "#2c333a";
          g.fillRect((-len / 2 + 1.8) * z, -1.3 * z, (len - 3.6) * z, 2.6 * z);
          const items = tr.wait > 0 ? Math.ceil((3 * tr.wait) / STOP_TIME) : 3;
          g.fillStyle = "#c98a3a";
          for (let k = 0; k < items; k++)
            g.fillRect((-len / 2 + 2.6 + k * 2.4) * z, -0.5 * z, 1.2 * z, 1.2 * z);
        }
        g.restore();
      }
      if (night > 0.25) {
        const h = posAt(tr.line, tr.s);
        const ang = tr.dir > 0 ? h.ang : h.ang + Math.PI;
        d.light({
          x: h.x + Math.cos(ang) * 6,
          y: h.y + Math.sin(ang) * 6,
          r: 26,
          color: "white",
          a: 0.7,
          cone: { ang, spread: 0.5, len: 80 },
        });
      }
    }
  }

  camHint(): CamHint | null {
    // the lowest event target (ties with the car) until a train is braking into the station
    if (this.visit) return { target: this.visit.at, priority: this.arriving ? ARRIVING_PRIORITY : 1 };
    // a bare hold: pauses the waypoint tour, any event target still wins (priority only orders targets)
    return this.approaching && this.cool <= 0 ? { hold: true, priority: 0 } : null;
  }

  wants(): DistrictKind | null {
    return null;
  }

  reset(): void {
    this.trains = [];
    this.busy = new Set();
    this.spawnT = 0;
    this.sig = "";
    this.lines = [];
    this.sigRed.clear();
    this.since = 0;
    this.approaching = false;
    this.held = 0;
    this.cool = 0;
    this.visit = null;
    this.arriving = false;
    this.unserved.clear();
  }

  state(): string {
    return this.trains.length ? `running:${this.trains.length}` : "idle";
  }
}
