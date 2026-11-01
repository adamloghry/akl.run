import {
  CH,
  CPX,
  T,
  type CamHint,
  type CamState,
  type DistrictKind,
  type Pt,
  type Rand,
  type View,
  type WorldQuery,
} from "./core/types";
import { CENTRAL_BOX, DOWNTOWN, toGeo } from "./world/geo";

const SCAN = 3; // chunks
const RECENT = 4; // waypoint kinds remembered

/** The roaming camera: POI waypoints, event holds, look-at linger. World px throughout. */
export class Cam implements CamState {
  x = DOWNTOWN[0] * T;
  y = DOWNTOWN[1] * T;
  zoom: number;
  view: View;
  pinned = false;

  private base: number;
  private tx = this.x;
  private ty = this.y;
  private linger = 0;
  private zOff = 0;
  private vw = 1;
  private vh = 1;
  private dpr = 1;
  private recent: DistrictKind[] = [];
  private pref: DistrictKind | null = null;
  /** Waypoints picked so far (whether or not a preference was honoured). */
  picks = 0;

  constructor(
    private world: WorldQuery,
    private rand: Rand,
    opts: { phone: boolean },
  ) {
    this.base = opts.phone ? 2.0 : 2.4;
    this.zoom = this.base;
    this.view = this.makeView();
  }

  setPhone(phone: boolean): void {
    this.base = phone ? 2.0 : 2.4;
    if (this.pinned) {
      this.zoom = this.base;
      this.view = this.makeView();
    }
  }

  setViewport(w: number, h: number, dpr: number): void {
    this.vw = w;
    this.vh = h;
    this.dpr = dpr;
    this.view = this.makeView();
  }

  lookAt(p: Pt): void {
    this.tx = p.x;
    this.ty = p.y;
    this.linger = 14;
  }

  /** One-shot bias toward a district kind; cleared when a preferred waypoint is chosen. */
  prefer(kind: DistrictKind | null): void {
    this.pref = kind;
  }

  preference(): DistrictKind | null {
    return this.pref;
  }

  /** Kinds of the last few waypoints, oldest first (read-only copy). */
  recentKinds(): DistrictKind[] {
    return [...this.recent];
  }

  reset(): void {
    this.x = this.tx = DOWNTOWN[0] * T;
    this.y = this.ty = DOWNTOWN[1] * T;
    this.linger = 0;
    this.zOff = 0;
    this.recent = [];
    this.pref = null;
    this.zoom = this.base;
    this.view = this.makeView();
  }

  geo(): string {
    const [lon, lat] = toGeo(this.x / T, this.y / T);
    return `${lat.toFixed(4)}° N · ${(-lon).toFixed(4)}° W · ${this.zoom.toFixed(1)}×`;
  }

  target(): Pt {
    return { x: this.tx, y: this.ty };
  }

  update(dt: number, t: number, hints: CamHint[]): void {
    if (this.pinned) return;
    let top: CamHint | null = null;
    let held = false;
    let zsum = 0;
    for (const h of hints) {
      if (h.hold) held = true;
      zsum += h.zoomOffset ?? 0;
      if (h.target && (!top || h.priority > top.priority)) top = h;
    }
    if (top?.target) {
      // event target override: no linger countdown, no waypoint pick
      this.tx = top.target.x;
      this.ty = top.target.y;
    } else if (!held) {
      this.linger -= dt;
      if (this.linger <= 0) {
        this.pickWaypoint();
        this.linger = this.rand.range(9, 15);
      }
    }
    const k = 1 - Math.exp(-(top?.target ? 0.9 : 0.32) * dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zOff += (zsum - this.zOff) * (1 - Math.exp(-0.8 * dt));
    this.zoom = this.base * (1 + 0.04 * Math.sin(0.11 * t) + this.zOff);
    this.view = this.makeView();
  }

  private makeView(): View {
    const z = this.zoom;
    return {
      x0: this.x - this.vw / (2 * z),
      y0: this.y - this.vh / (2 * z),
      w: this.vw,
      h: this.vh,
      z,
      dpr: this.dpr,
    };
  }

  private inBox(cx: number, cy: number): boolean {
    // chunk overlaps the box
    return (
      (cx + 1) * CH > CENTRAL_BOX.tx0 &&
      cx * CH < CENTRAL_BOX.tx1 &&
      (cy + 1) * CH > CENTRAL_BOX.ty0 &&
      cy * CH < CENTRAL_BOX.ty1
    );
  }

  /** Nearest chunk of `kind` within CENTRAL_BOX, searching outward by Chebyshev ring. */
  private searchKind(
    kind: DistrictKind,
    ccx: number,
    ccy: number,
  ): { cx: number; cy: number; d: number } | null {
    const { tx0, ty0, tx1, ty1 } = CENTRAL_BOX;
    const maxR =
      Math.ceil(Math.max(tx1 - tx0, ty1 - ty0) / CH) +
      Math.max(Math.abs(ccx - Math.floor(DOWNTOWN[0] / CH)), Math.abs(ccy - Math.floor(DOWNTOWN[1] / CH)));
    for (let r = SCAN + 1; r <= maxR; r++) {
      let best: { cx: number; cy: number; d: number } | null = null;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const cx = ccx + dx,
            cy = ccy + dy;
          if (!this.inBox(cx, cy) || this.world.kindAt(cx, cy) !== kind) continue;
          const d = dx * dx + dy * dy;
          if (!best || d < best.d) best = { cx, cy, d };
        }
      if (best) return best;
    }
    return null;
  }

  private pickWaypoint(): void {
    this.picks++;
    const ccx = Math.floor(this.x / CPX),
      ccy = Math.floor(this.y / CPX);
    const best = new Map<DistrictKind, { cx: number; cy: number; d: number }>();
    for (let dy = -SCAN; dy <= SCAN; dy++)
      for (let dx = -SCAN; dx <= SCAN; dx++) {
        if (!dx && !dy) continue;
        const cx = ccx + dx,
          cy = ccy + dy;
        if (!this.inBox(cx, cy)) continue;
        const kind = this.world.kindAt(cx, cy);
        if (kind === "wild") continue;
        const d = dx * dx + dy * dy,
          cur = best.get(kind);
        if (!cur || d < cur.d) best.set(kind, { cx, cy, d });
      }
    // The world is infinite, so no clamp is needed on waypoints.
    let pick: DistrictKind | null = null;
    if (this.pref && !best.has(this.pref)) {
      const far = this.searchKind(this.pref, ccx, ccy);
      if (far) best.set(this.pref, far);
    }
    if (this.pref && best.has(this.pref)) {
      pick = this.pref;
      this.pref = null;
    } else {
      const fresh = [...best.keys()].filter((k) => !this.recent.includes(k));
      if (fresh.length) pick = this.rand.pick(fresh);
    }
    if (pick) {
      const b = best.get(pick)!;
      this.tx = (b.cx + 0.5) * CPX;
      this.ty = (b.cy + 0.5) * CPX;
      this.recent.push(pick);
      if (this.recent.length > RECENT) this.recent.shift();
      return;
    }
    const { tx0, ty0, tx1, ty1 } = CENTRAL_BOX;
    for (let i = 0; i < 40; i++) {
      const tx = this.rand.range(tx0, tx1),
        ty = this.rand.range(ty0, ty1);
      if (this.world.landFracAt(Math.floor(tx / CH), Math.floor(ty / CH)) >= 0.6) {
        this.tx = tx * T;
        this.ty = ty * T;
        return;
      }
    }
    this.tx = DOWNTOWN[0] * T;
    this.ty = DOWNTOWN[1] * T;
  }
}
