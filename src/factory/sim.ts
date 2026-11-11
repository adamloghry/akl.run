// The simulation aggregate: world, camera, live layer, event machines, environment and stats,
// plus the per-frame draw pipeline. No DOM access, no module-scope side effects.
import { Cam } from "./camera";
import { Clock } from "./core/clock";
import { rand as defaultRand } from "./core/rng";
import {
  CPX,
  STEP_COUNTERS,
  emptyStats,
  type CamHint,
  type DistrictKind,
  type DrawCtx,
  type Emit,
  type Env,
  type LightSource,
  type Rand,
  type Rect,
  type SimCtx,
  type Stats,
  type View,
} from "./core/types";
import { makeMachines } from "./events/index";
import { Live } from "./live/index";
import { World } from "./world/world";

const STILL_STEPS = 360;
const STILL_DT = 0.05;

export class Sim {
  readonly world: World;
  readonly cam: Cam;
  readonly live = new Live();
  readonly m = makeMachines();
  readonly env: Env = { night: 0, raining: false, sat: 1, acc: 1, flash: 0 };
  readonly clock = new Clock();
  still = false;

  private readonly statsObj: Stats = emptyStats();
  private readonly emit: Emit;
  private readonly rand: Rand;
  private phone: boolean;
  private readonly ctx: SimCtx;
  private vw = 1440;
  private vh = 900;
  private dpr = 1;
  private stilled = false;
  private wantTurn = 0; // which of the machines currently wanting a district gets the next preferred waypoint

  constructor(opts: {
    seed: number;
    phone: boolean;
    canvasFactory?: () => HTMLCanvasElement;
    emit: Emit;
    rand?: Rand;
  }) {
    this.emit = opts.emit;
    this.rand = opts.rand ?? defaultRand;
    this.phone = opts.phone;
    this.world = new World(opts.seed, {
      cap: opts.phone ? 128 : 256,
      canvasFactory: opts.canvasFactory,
    });
    this.cam = new Cam(this.world, this.rand, { phone: opts.phone });
    this.cam.setViewport(this.vw, this.vh, this.dpr);
    this.ctx = {
      world: this.world,
      overlay: this.world,
      cam: this.cam,
      live: this.live,
      env: this.env,
      stats: this.statsObj,
      emit: this.emit,
      rand: this.rand,
      t: 0,
      dt: 0,
      phone: this.phone,
      still: false,
      view: this.world.query({ x: 0, y: 0, w: 0, h: 0 }),
    };
  }

  setPhone(phone: boolean): void {
    this.phone = phone;
    this.ctx.phone = phone;
    this.cam.setPhone(phone);
    this.world.setCap(phone ? 128 : 256);
  }

  setViewport(w: number, h: number, dpr: number): void {
    if (w === this.vw && h === this.vh && dpr === this.dpr) return;
    this.vw = w;
    this.vh = h;
    this.dpr = dpr;
    this.cam.setViewport(w, h, dpr);
  }

  stats(): Stats {
    return { ...this.statsObj };
  }

  /** World-px rect of the current view, grown by `margin` px on every side. */
  private viewRect(margin: number): Rect {
    const v = this.cam.view;
    return {
      x: v.x0 - margin,
      y: v.y0 - margin,
      w: v.w / v.z + margin * 2,
      h: v.h / v.z + margin * 2,
    };
  }

  step(dt: number): void {
    const s = this.statsObj;
    for (const k of STEP_COUNTERS) s[k] = 0;
    const c = this.ctx;
    this.clock.step(dt);
    c.t = this.clock.t;
    c.dt = dt;
    c.still = this.still;
    c.view = this.world.query(this.viewRect(CPX));
    this.live.update(c);
    for (const m of this.m.all) m.update(c);
    this.live.inserters.setBusyStations(this.m.trains.busyStations());
    const hints: CamHint[] = [];
    const wants: DistrictKind[] = [];
    for (const m of this.m.all) {
      const h = m.camHint();
      if (h) hints.push(h);
      const w = m.wants?.();
      if (w) wants.push(w);
    }
    // wanting machines take turns: every waypoint pick passes the turn on, so a kind the camera
    // cannot find never starves the others
    const want = wants.length ? wants[this.wantTurn % wants.length] : null;
    const picks = this.cam.picks;
    this.cam.prefer(want);
    this.cam.update(dt, c.t, hints);
    if (want !== null && this.cam.picks !== picks) this.wantTurn++;
  }

  /** Generate visible chunks nearest-first under the budget (at least one if any is missing). */
  private ensure(budgetMs: number): number {
    const v = this.cam.view;
    const timed = budgetMs !== Infinity;
    const t0 = timed ? performance.now() : 0;
    const x1 = v.x0 + v.w / v.z,
      y1 = v.y0 + v.h / v.z;
    const cx0 = Math.floor(v.x0 / CPX),
      cx1 = Math.floor(x1 / CPX),
      cy0 = Math.floor(v.y0 / CPX),
      cy1 = Math.floor(y1 / CPX);
    const mx = this.cam.x / CPX - 0.5,
      my = this.cam.y / CPX - 0.5;
    const want: Array<{ cx: number; cy: number; d: number }> = [];
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        if (!this.world.peek(cx, cy)) want.push({ cx, cy, d: (cx - mx) ** 2 + (cy - my) ** 2 });
    want.sort((a, b) => a.d - b.d);
    let generated = 0;
    for (const w of want) {
      if (generated > 0 && timed && performance.now() - t0 >= budgetMs) break;
      this.world.chunk(w.cx, w.cy);
      generated++;
    }
    // At most one ring chunk beyond the view, nearest first, only when the view is complete.
    if (generated === want.length && (!timed || performance.now() - t0 < budgetMs)) {
      let best: { cx: number; cy: number; d: number } | null = null;
      for (let cy = cy0 - 1; cy <= cy1 + 1; cy++)
        for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
          if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
          if (this.world.peek(cx, cy)) continue;
          const d = (cx - mx) ** 2 + (cy - my) ** 2;
          if (!best || d < best.d) best = { cx, cy, d };
        }
      if (best) {
        this.world.chunk(best.cx, best.cy);
        generated++;
      }
    }
    return generated;
  }

  draw(
    g: CanvasRenderingContext2D,
    W: number,
    H: number,
    dpr: number,
    budgetMs: number,
  ): { generated: number; ms: number } {
    const t0 = performance.now();
    this.setViewport(W, H, dpr);
    const generated = this.ensure(budgetMs);
    const view: View = this.cam.view;
    const z = view.z;
    const env = this.env;
    const queued: LightSource[] = [];
    const sx = (wx: number) => (wx - view.x0) * z;
    const sy = (wy: number) => (wy - view.y0) * z;
    const d: DrawCtx = {
      view,
      t: this.clock.t,
      env,
      sx,
      sy,
      inView: (wx, wy, margin = 0) => {
        const x = sx(wx),
          y = sy(wy),
          m = margin * z;
        return x > -m && x < W + m && y > -m && y < H + m;
      },
      light: (l) => void queued.push(l),
    };

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#0b1217";
    g.fillRect(0, 0, W, H);

    const x1 = view.x0 + W / z,
      y1 = view.y0 + H / z;
    const cx0 = Math.floor(view.x0 / CPX),
      cx1 = Math.floor(x1 / CPX),
      cy0 = Math.floor(view.y0 / CPX),
      cy1 = Math.floor(y1 / CPX);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.world.peek(cx, cy);
        if (!c) continue;
        const ax = Math.round(sx(cx * CPX)),
          ay = Math.round(sy(cy * CPX));
        g.drawImage(
          c.canvas,
          ax,
          ay,
          Math.round(sx((cx + 1) * CPX)) - ax,
          Math.round(sy((cy + 1) * CPX)) - ay,
        );
      }

    const f = this.world.query(this.viewRect(40));
    this.live.drawBelow(g, d, f);
    for (const m of this.m.all) m.draw(g, d);
    this.live.drawAbove(g, d, f);
    this.live.drawLights(g, d, f, queued);
    this.live.drawRain(g, d, f);
    this.scrim(g, W, H);
    return { generated, ms: performance.now() - t0 };
  }

  /** A subtle, symmetric edge vignette (the night overlay already darkens; no left bias, no weather term). */
  private scrim(g: CanvasRenderingContext2D, W: number, H: number): void {
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  /** Pre-simulate 18 s of world time with the camera pinned (once per sim). No wall-clock reads. */
  stillFrame(): void {
    if (this.stilled) return;
    this.stilled = true;
    this.still = true;
    this.cam.pinned = true;
    this.ensure(Infinity);
    for (let i = 0; i < STILL_STEPS; i++) this.step(STILL_DT);
  }
}
