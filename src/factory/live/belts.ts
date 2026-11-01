// live/belts.ts — scrolling chevrons and items along BeltPath features.
// A belt is a pure function of its accumulated `phase` (distance travelled), so
// a jammed belt simply stops advancing. Ephemeral state is keyed by feature id.
import type { BeltPath, DrawCtx, Features, LiveSystem, Pt, SimCtx } from "../core/types";

const SPEED = 9; // px/s, chevrons and items
const CHEVRON_GAP = 6;
const ITEM_GAP = 7; // nominal item spacing (>= 3.2 always)
const LANE_OFF = 1.5;
const FORGET_AFTER = 10; // seconds unseen

interface BeltState {
  phase: number;
  len: number;
  cum: number[]; // cumulative length at each point
  seen: number;
}

function measure(pts: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y));
  return cum;
}

/** Position and unit direction at distance s along the path. */
function posAt(pts: Pt[], cum: number[], s: number, out: { x: number; y: number; dx: number; dy: number }) {
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1],
    b = pts[i],
    seg = cum[i] - cum[i - 1] || 1,
    u = (s - cum[i - 1]) / seg;
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.dx = Math.sign(b.x - a.x);
  out.dy = Math.sign(b.y - a.y);
}

export class Belts implements LiveSystem {
  readonly name = "belts";
  private state = new Map<string, BeltState>();
  private jammed = new Set<string>();
  private tmp = { x: 0, y: 0, dx: 0, dy: 0 };

  jam(id: string, on: boolean): void {
    if (on) this.jammed.add(id);
    else this.jammed.delete(id);
  }
  isJammed(id: string): boolean {
    return this.jammed.has(id);
  }
  /** Distance the belt's contents have travelled (test accessor). */
  phase(id: string): number {
    return this.state.get(id)?.phase ?? 0;
  }

  private ensure(b: BeltPath, t: number): BeltState {
    let s = this.state.get(b.id);
    if (!s) {
      const cum = measure(b.pts);
      s = { phase: 0, len: cum[cum.length - 1], cum, seen: t };
      this.state.set(b.id, s);
    }
    s.seen = t;
    return s;
  }

  update(ctx: SimCtx): void {
    for (const b of ctx.view.belts) {
      const s = this.ensure(b, ctx.t);
      if (!this.jammed.has(b.id)) s.phase += SPEED * ctx.dt;
    }
    for (const [id, s] of this.state) if (ctx.t - s.seen > FORGET_AFTER) this.state.delete(id);
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void {
    const z = d.view.z,
      p = this.tmp;
    for (const b of f.belts) {
      const s = this.state.get(b.id);
      if (!s || b.pts.length < 2 || s.len <= 0) continue;
      // chevrons
      g.fillStyle = "#d7b64b";
      const off = s.phase % CHEVRON_GAP;
      for (let k = off; k < s.len; k += CHEVRON_GAP) {
        posAt(b.pts, s.cum, k, p);
        if (!d.inView(p.x, p.y, 6)) continue;
        if (p.dx !== 0) g.fillRect(d.sx(p.x - 0.5), d.sy(p.y - 1), z, 2 * z);
        else g.fillRect(d.sx(p.x - 1), d.sy(p.y - 0.5), 2 * z, z);
      }
      // items, alternating lanes
      const n = Math.max(1, Math.floor(s.len / ITEM_GAP)),
        gap = s.len / n;
      for (let i = 0; i < n; i++) {
        const lane = i & 1,
          cols = b.lanes[lane],
          col = cols.length ? cols[(i >> 1) % cols.length] : "#b9c3cc";
        posAt(b.pts, s.cum, (i * gap + s.phase) % s.len, p);
        // left of flow (screen coords, y down) is (dy, -dx)
        const sgn = lane === 0 ? 1 : -1,
          x = p.x + p.dy * LANE_OFF * sgn,
          y = p.y - p.dx * LANE_OFF * sgn;
        if (!d.inView(x, y, 4)) continue;
        g.fillStyle = col;
        g.fillRect(d.sx(x - 1), d.sy(y - 1), 2 * z, 2 * z);
        g.fillStyle = "rgba(255,255,255,.35)";
        g.fillRect(d.sx(x - 1), d.sy(y - 1), z, z);
      }
    }
  }

  reset(): void {
    this.state.clear();
    this.jammed.clear();
  }
}
