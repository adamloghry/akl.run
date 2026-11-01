// live/inserters.ts — two-phase swinging arms; idle when their belt is jammed
// or their station has no train stopped.
import {
  DIRS,
  type DrawCtx,
  type Features,
  type Inserter,
  type LiveSystem,
  type SimCtx,
} from "../core/types";

const REACH = 4.5;
const FORGET_AFTER = 10;

/** Small string hash -> [0, 1). */
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

interface InsState {
  phi: number;
  arm: number;
  carrying: boolean;
  colour: string;
  seen: number;
}

export class Inserters implements LiveSystem {
  readonly name = "inserters";
  private state = new Map<string, InsState>();
  private busy = new Set<string>();

  /** Station ids with a train currently stopped. */
  setBusyStations(ids: Set<string>): void {
    this.busy = ids;
  }
  /** Arm extension, -1 (pick-up) … 1 (drop); -1 while idle. */
  arm(id: string): number {
    return this.state.get(id)?.arm ?? -1;
  }

  /** Number of inserters with live per-entity state (test accessor). */
  tracked(): number {
    return this.state.size;
  }

  update(ctx: SimCtx): void {
    const lane0 = new Map<string, string>();
    for (const b of ctx.view.belts) lane0.set(b.id, b.lanes[0][0] ?? "#b9c3cc");
    for (const it of ctx.view.inserters) {
      let s = this.state.get(it.id);
      if (!s) {
        s = { phi: strHash(it.id) * 2, arm: -1, carrying: false, colour: "#b9c3cc", seen: ctx.t };
        this.state.set(it.id, s);
      }
      s.seen = ctx.t;
      s.colour = (it.beltId && lane0.get(it.beltId)) || s.colour;
      const idle =
        (it.beltId !== null && ctx.live.isJammed(it.beltId)) ||
        (it.stationId !== null && !this.busy.has(it.stationId));
      if (idle) {
        s.arm = -1;
        s.carrying = false;
        continue;
      }
      const w = (ctx.t * (it.fast ? 2.2 : 1.4) + s.phi) % 2;
      s.carrying = w < 1;
      s.arm = w < 1 ? -Math.cos(w * Math.PI) : Math.cos((w - 1) * Math.PI);
    }
    for (const [id, s] of this.state) if (ctx.t - s.seen > FORGET_AFTER) this.state.delete(id);
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void {
    const z = d.view.z;
    for (const it of f.inserters as Inserter[]) {
      const s = this.state.get(it.id);
      if (!s || !d.inView(it.at.x, it.at.y, 8)) continue;
      const dir = DIRS[it.dir],
        ex = it.at.x + dir[0] * s.arm * REACH,
        ey = it.at.y + dir[1] * s.arm * REACH;
      g.strokeStyle = it.fast ? "#3a7bd5" : "#d9a23a";
      g.lineWidth = z;
      g.beginPath();
      g.moveTo(d.sx(it.at.x), d.sy(it.at.y));
      g.lineTo(d.sx(ex), d.sy(ey));
      g.stroke();
      g.fillStyle = "#e8e8e8";
      g.fillRect(d.sx(ex - 1), d.sy(ey - 1), 2 * z, 2 * z);
      if (s.carrying) {
        g.fillStyle = s.colour;
        g.fillRect(d.sx(ex - 1), d.sy(ey - 1), 2 * z, 2 * z);
      }
    }
  }

  reset(): void {
    this.state.clear();
    this.busy = new Set();
  }
}
