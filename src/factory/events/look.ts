import { T, type CamHint, type DrawCtx, type EventMachine, type Pt, type SimCtx } from "../core/types";

const LINGER_S = 14;
const RIPPLE_S = 0.8;

/** Canvas click: log the tile, hint the camera to the point for 14 s, and ripple orange at the click. */
export class Look implements EventMachine {
  readonly name = "look";
  private pending: Pt | null = null; // set by request(), consumed on the next update
  private at: Pt | null = null; // last clicked world point
  private linger = 0; // seconds left on the camera hint
  private ripple = 0; // seconds left on the ripple

  /** Called by the page on canvas click (world px). */
  request(p: Pt): void {
    this.pending = p;
  }

  update(ctx: SimCtx): void {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.at = p;
      this.linger = LINGER_S;
      this.ripple = RIPPLE_S;
      ctx.emit(`camera → tile (${Math.floor(p.x / T)},${Math.floor(p.y / T)})`);
      return;
    }
    this.ripple = Math.max(0, this.ripple - ctx.dt);
    if (this.linger > 0) this.linger = Math.max(0, this.linger - ctx.dt);
  }

  draw(g: CanvasRenderingContext2D, d: DrawCtx): void {
    if (!this.at || this.ripple <= 0 || !d.inView(this.at.x, this.at.y, 40)) return;
    const q = 1 - this.ripple / RIPPLE_S;
    const x = d.sx(this.at.x);
    const y = d.sy(this.at.y);
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const r = Math.min(1, Math.max(0, q - k * 0.15));
      g.strokeStyle = `rgba(255,150,40,${((1 - q) * (1 - k * 0.25)).toFixed(2)})`;
      g.beginPath();
      g.arc(x, y, (4 + 16 * r) * d.view.z, 0, Math.PI * 2);
      g.stroke();
    }
  }

  camHint(): CamHint | null {
    return this.linger > 0 && this.at ? { target: this.at, priority: 10 } : null;
  }

  reset(): void {
    this.pending = null;
    this.at = null;
    this.linger = 0;
    this.ripple = 0;
  }

  state(): string {
    return this.linger > 0 ? "looking" : "idle";
  }
}
