import type { Rand } from "./core/types";

/** Ambient filler: the previous engine's LOGS list plus the handoff 6.3 additions. */
export const AMBIENT: readonly string[] = [
  "inserter#4 → furnace: iron-plate ×2",
  "train L-7 departed · 6 cars",
  "bot#11 delivered copper-cable",
  "radar scanned sector (12,-3)",
  "solar field at 98% · accumulators charging",
  "belt#2 throughput 14.8/s",
  "rocket silo: assembling part 61/100",
  "lamp grid online · 0 faults",
  "boiler#2 steam 165°C · engines 3/3",
  "drill cluster D-4: 212 ore remaining",
  "signal S-9 → green",
  "complex C-1 crafting: electronic-circuit",
  "pumpjack PJ-2 yield 71%",
  "refinery: advanced-oil-processing · 2 cycles",
  "logistic network: 1,204 iron-plate in storage",
  "roboport RP-1 charging 4 bots",
  "offshore pump OP-1: 1200/s",
  "circuit: inserter#9 enabled (iron-plate < 400)",
  "chem plant CP-1: plastic-bar ×2",
  "furnace row F-2: 7/7 heating",
  "fish spotted off OP-1 · 9 in school",
  "storage yard: 61% full",
  "assembler A-1-3: iron-gear-wheel ×4",
];

const RECENT = 20;

export class Journal {
  private readonly ol: HTMLOListElement | null;
  private readonly gap: number;
  private ring: number;
  private readonly queue: string[] = [];
  private readonly released: string[] = [];
  private lastRelease = -Infinity;
  private nextAmbient: number | null = null;
  private lastAmbient = "";

  constructor(ol: HTMLOListElement | null, opts: { ring?: number; gap?: number } = {}) {
    this.ol = ol;
    this.ring = opts.ring ?? 6;
    this.gap = opts.gap ?? 0.9;
  }

  runStart(seedHex: string, href: string): void {
    const ol = this.ol;
    if (!ol) return;
    ol.querySelectorAll("[data-log-static]").forEach((n) => n.remove());
    ol.querySelectorAll("[data-log-run]").forEach((n) => n.remove());
    const li = document.createElement("li");
    li.className = "log-line log-line--comment";
    li.setAttribute("data-log-run", "");
    const a = document.createElement("a");
    a.className = "permalink";
    a.href = href;
    a.textContent = seedHex;
    li.append(
      "# factory simulator run started · seed ",
      a,
      " · r to reroll · m to minimize · click the map to look around",
    );
    const pin = ol.querySelector("[data-log-pinned]");
    if (pin) pin.after(li);
    else ol.prepend(li);
  }

  /** Forget the previous run's timers and queued lines (a new Sim restarts its clock at 0). */
  reset(): void {
    this.queue.length = 0;
    this.lastRelease = -Infinity;
    this.nextAmbient = null;
    this.lastAmbient = "";
    this.released.length = 0;
    this.ol?.querySelectorAll("li:not(.log-line--comment)").forEach((n) => n.remove());
  }

  emit(text: string): void {
    this.queue.push(text);
  }

  setRing(n: number): void {
    this.ring = n;
    this.trim(null);
  }

  recent(): string[] {
    return this.released.slice();
  }

  tick(t: number, stamp: () => string, ambientOK: boolean, rand: Rand): void {
    if (t - this.lastRelease < this.gap) return;
    if (this.queue.length) {
      this.release(this.queue.shift()!, t, stamp, rand);
      return;
    }
    if (!ambientOK) return;
    if (this.nextAmbient === null) this.nextAmbient = t + rand.range(2.4, 5);
    if (t < this.nextAmbient) return;
    if (this.ol?.matches(":focus-within")) {
      this.nextAmbient = t + rand.range(2.4, 5);
      return;
    }
    const pick = rand.pick(AMBIENT.filter((l) => l !== this.lastAmbient));
    this.lastAmbient = pick;
    this.release(pick, t, stamp, rand);
  }

  private release(msg: string, t: number, stamp: () => string, rand: Rand): void {
    this.lastRelease = t;
    this.nextAmbient = t + rand.range(2.4, 5);
    this.released.push(msg);
    if (this.released.length > RECENT) this.released.shift();
    const ol = this.ol;
    if (!ol) return;
    const li = document.createElement("li");
    li.className = "log-line";
    const s = document.createElement("span");
    s.className = "stamp";
    s.textContent = stamp();
    li.append(s, "  " + msg);
    ol.append(li);
    this.trim(li);
  }

  /** Evict the oldest event lines beyond the ring, never the focused one nor the line just added. */
  private trim(keep: Element | null): void {
    const ol = this.ol;
    if (!ol) return;
    const active = document.activeElement;
    const lines = [...ol.querySelectorAll("li:not(.log-line--comment)")];
    let excess = lines.length - this.ring;
    for (const li of lines) {
      if (excess <= 0) break;
      if (li === keep || li === active || li.contains(active)) continue;
      li.remove();
      excess--;
    }
  }
}
