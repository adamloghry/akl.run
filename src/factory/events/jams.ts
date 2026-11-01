import type { BeltPath, CamHint, DrawCtx, EventMachine, SimCtx } from "../core/types";

/** Flavour number for a belt id `b:${cx},${cy}:${n}` (1..9, derived from its chunk). */
function beltNum(id: string): number {
  const [cx, cy] = id.split(":")[1].split(",").map(Number);
  return (Math.abs(cx * 7 + cy * 13) % 9) + 1;
}

/** Every 45–85 s one visible belt stalls for 6–10 s; the live system draws the jam via ctx.live. */
export class Jams implements EventMachine {
  readonly name = "jams";
  private timer = -1; // seconds until the next jam; -1 = not yet scheduled
  private left = 0; // seconds left on the current jam
  private jammed: BeltPath | null = null;
  private unjam: string | null = null; // belt left jammed by reset(); cleared on the next update

  update(ctx: SimCtx): void {
    if (this.unjam !== null) {
      ctx.live.jam(this.unjam, false);
      this.unjam = null;
    }
    if (this.timer < 0) this.timer = ctx.rand.range(45, 85);
    if (this.jammed) {
      this.left -= ctx.dt;
      if (this.left > 0) return;
      // Clear the belt even if it has left the view.
      ctx.live.jam(this.jammed.id, false);
      ctx.emit(`belt B-${beltNum(this.jammed.id)} cleared · inserters resumed`);
      this.jammed = null;
      this.timer = ctx.rand.range(45, 85);
      return;
    }
    this.timer -= ctx.dt;
    if (this.timer > 0) return;
    const belts = ctx.view.belts;
    if (belts.length === 0) {
      this.timer = ctx.rand.range(45, 85);
      return;
    }
    const belt = ctx.rand.pick(belts);
    const waiting = ctx.view.inserters.filter((i) => i.beltId === belt.id).length;
    ctx.live.jam(belt.id, true);
    ctx.emit(`belt B-${beltNum(belt.id)} backed up · ${waiting} inserters waiting`);
    this.jammed = belt;
    this.left = ctx.rand.range(6, 10);
  }

  draw(_g: CanvasRenderingContext2D, _d: DrawCtx): void {
    // Jam visuals are drawn by the live belt system from ctx.live.isJammed.
  }

  camHint(): CamHint | null {
    return null;
  }

  reset(): void {
    // reset() takes no ctx, so the live jam is cleared by the next update().
    if (this.jammed) this.unjam = this.jammed.id;
    this.timer = -1;
    this.left = 0;
    this.jammed = null;
  }

  state(): string {
    return this.jammed ? "jammed" : "flowing";
  }
}
