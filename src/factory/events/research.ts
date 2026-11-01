import type { CamHint, DrawCtx, EventMachine, SimCtx } from "../core/types";

const ITEMS = [
  "automation-2",
  "advanced-material-processing",
  "railway",
  "solar-energy",
  "oil-processing",
  "robotics",
  "rocket-silo",
] as const;
const SECONDS_PER_ITEM = 48;

/** Cycles research items at 48 s each, logging completions and the next start. */
export class Research implements EventMachine {
  readonly name = "research";
  private index = 0;
  private elapsed = 0; // seconds into the current item

  update(ctx: SimCtx): void {
    this.elapsed += ctx.dt;
    if (this.elapsed >= SECONDS_PER_ITEM) {
      ctx.emit(`research complete: ${ITEMS[this.index]}`);
      this.index = (this.index + 1) % ITEMS.length;
      this.elapsed -= SECONDS_PER_ITEM;
      ctx.emit(`research started: ${ITEMS[this.index]}`);
    }
    const pct = Math.floor((this.elapsed / SECONDS_PER_ITEM) * 100);
    ctx.stats.research = `${ITEMS[this.index]} ${pct}%`;
  }

  draw(_g: CanvasRenderingContext2D, _d: DrawCtx): void {
    // No visuals of its own.
  }

  camHint(): CamHint | null {
    return null;
  }

  reset(): void {
    this.index = 0;
    this.elapsed = 0;
  }

  state(): string {
    return ITEMS[this.index];
  }
}
