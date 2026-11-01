import type { CamHint, DrawCtx, EventMachine, SimCtx } from "../core/types";

const BROWNOUT_S = 3.5;
const COOLDOWN_S = 20;

/** Night drains the accumulators; a low charge triggers a 3.5 s brownout that dims the lamps. */
export class Power implements EventMachine {
  readonly name = "power";
  private brown = 0; // seconds left in the current brownout
  private since = Infinity; // seconds since the last brownout started

  update(ctx: SimCtx): void {
    const { env, dt } = ctx;
    const rate = env.night > 0.5 ? -0.012 : 0.02;
    env.acc = Math.min(1, Math.max(0, env.acc + rate * dt));
    this.since += dt;
    if (this.brown <= 0 && env.acc <= 0.15 && this.since >= COOLDOWN_S) {
      this.brown = BROWNOUT_S;
      this.since = 0;
      ctx.emit(`power: accumulators ${Math.round(env.acc * 100)}% · brownout · steam engines to full load`);
    }
    if (this.brown > 0) {
      this.brown -= dt;
      env.sat = this.brown > 0 ? 0.62 + 0.08 * Math.sin(30 * ctx.t) : 1;
    } else {
      env.sat = 1;
    }
    ctx.stats.power = Math.round(env.sat * 100);
  }

  draw(_g: CanvasRenderingContext2D, _d: DrawCtx): void {
    // Lamp dimming is applied through env.sat by the lamp systems.
  }

  camHint(): CamHint | null {
    return null;
  }

  reset(): void {
    this.brown = 0;
    this.since = Infinity;
  }

  state(): string {
    return this.brown > 0 ? "brownout" : "ok";
  }
}
