import { CPX, type CamHint, type DrawCtx, type EventMachine, type Pt, type SimCtx } from "../core/types";

const PERIOD_S = 18;
const RING_S = 2.2;
const RING_MAX_PX = 110;

/** Every 18 s a radar (machine or outpost) charts a random sector within 3 chunks and pings a ring. */
export class Radar implements EventMachine {
  readonly name = "radar";
  private timer = PERIOD_S;
  private ring = 0; // seconds left on the expanding ring
  private at: Pt | null = null; // ring origin (world px)

  update(ctx: SimCtx): void {
    if (this.ring > 0) this.ring = Math.max(0, this.ring - ctx.dt);
    this.timer -= ctx.dt;
    if (this.timer > 0) return;
    this.timer += PERIOD_S;
    const radars: Pt[] = [
      ...ctx.view.machines.filter((m) => m.kind === "radar").map((m) => m.at),
      ...ctx.view.outposts.map((o) => o.radar),
    ];
    if (radars.length === 0) return;
    const at = ctx.rand.pick(radars);
    const ccx = Math.floor(at.x / CPX);
    const ccy = Math.floor(at.y / CPX);
    const x = ccx + ctx.rand.int(-3, 4);
    const y = ccy + ctx.rand.int(-3, 4);
    const n = (Math.abs(ccx * 7 + ccy * 13) % 9) + 1;
    this.at = at;
    this.ring = RING_S;
    ctx.emit(`radar RD-${n} charted sector (${x},${y})`);
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    if (!this.at || this.ring <= 0 || !d.inView(this.at.x, this.at.y, RING_MAX_PX)) return;
    const p = 1 - this.ring / RING_S;
    g.strokeStyle = `rgba(120,230,160,${((1 - p) * 0.6).toFixed(2)})`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(d.sx(this.at.x), d.sy(this.at.y), p * RING_MAX_PX * d.view.z, 0, Math.PI * 2);
    g.stroke();
  }

  camHint(): CamHint | null {
    return null;
  }

  reset(): void {
    this.timer = PERIOD_S;
    this.ring = 0;
    this.at = null;
  }

  state(): string {
    return this.ring > 0 ? "ping" : "idle";
  }
}
