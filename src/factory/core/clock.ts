// core/clock.ts — accumulated simulation clock. dt is clamped so a stalled
// tab never teleports anything; speed is a test aid (__mapgen.speed).
export class Clock {
  t = 0;
  speed = 1;
  private prev: number | null = null;
  /** Feed a rAF timestamp (ms); returns dt in seconds (0 on the first call). */
  tick(nowMs: number): number {
    const raw = this.prev === null ? 0 : (nowMs - this.prev) / 1000;
    this.prev = nowMs;
    const dt = Math.min(Math.max(raw, 0), 0.1) * this.speed;
    this.t += dt;
    return dt;
  }
  /** Advance by a fixed step (still-mode pre-steps, tests). */
  step(dt: number): number {
    this.t += dt;
    return dt;
  }
  resetPrev(): void {
    this.prev = null;
  }
}
