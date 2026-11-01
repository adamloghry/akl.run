import type { CamHint, DrawCtx, EventMachine, SimCtx } from "../core/types";

/** Lightning storms: while it rains, a strike every 18–48 s flashes the frame (env.flash) and is half-logged. */
export class Storm implements EventMachine {
  readonly name = "storm";
  private nextBolt = -1; // seconds to the next strike; < 0 = not armed
  private raining = false;

  update(ctx: SimCtx): void {
    const env = ctx.env;
    env.flash = Math.max(0, env.flash - ctx.dt * 6);
    this.raining = env.raining;
    if (!env.raining) {
      this.nextBolt = -1;
      return;
    }
    if (this.nextBolt < 0) this.nextBolt = ctx.rand.range(18, 48);
    this.nextBolt -= ctx.dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = ctx.rand.range(18, 48);
      env.flash = 1;
      if (ctx.rand.chance(0.5))
        ctx.emit(`storm: lightning strike · grid at ${Math.round(env.sat * 100)}%, no faults`);
    }
  }

  // The full-frame flash is composited from env.flash; the machine paints nothing of its own.
  draw(_g: CanvasRenderingContext2D, _d: DrawCtx): void {}

  camHint(): CamHint | null {
    return null;
  }

  reset(): void {
    this.nextBolt = -1;
    this.raining = false;
  }

  state(): string {
    return this.raining ? "storm" : "clear";
  }
}
