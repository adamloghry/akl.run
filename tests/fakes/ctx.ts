import {
  emptyStats,
  type CamState,
  type DrawCtx,
  type Env,
  type LightSource,
  type LivePush,
  type ParticleKind,
  type Rand,
  type SimCtx,
} from "../../src/factory/core/types";
import { fakeWorld, type FakeWorld } from "./world";

/** Deterministic Rand from a fixed sequence (cycled) or a seeded LCG. */
export function seqRand(seq: number[] | number = 42): Rand {
  let i = 0,
    s = typeof seq === "number" ? seq >>> 0 : 0;
  const next = Array.isArray(seq)
    ? () => seq[i++ % seq.length]
    : () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor((b - a) * next()),
    pick: (arr) => arr[Math.floor(arr.length * next())],
    chance: (p) => next() < p,
  };
}

export interface TestCtx extends SimCtx {
  lines: string[];
  spawned: Array<[ParticleKind, number, number]>;
  jams: Map<string, boolean>;
  world: FakeWorld;
  overlay: FakeWorld;
  /** Advance by `seconds` in steps of `dt`, calling update each step. */
  run(update: (c: SimCtx) => void, seconds: number, dt?: number): void;
}

export function testCtx(world: FakeWorld = fakeWorld(), opts: Partial<SimCtx> = {}): TestCtx {
  const lines: string[] = [];
  const spawned: Array<[ParticleKind, number, number]> = [];
  const jams = new Map<string, boolean>();
  const live: LivePush = {
    spawn: (k, x, y) => void spawned.push([k, x, y]),
    jam: (id, on) => void jams.set(id, on),
    isJammed: (id) => jams.get(id) === true,
  };
  const cam: CamState = {
    x: 96,
    y: 96,
    zoom: 2.4,
    view: { x0: -204, y0: -91, w: 1440, h: 900, z: 2.4, dpr: 1 },
  };
  const env: Env = { night: 0, raining: false, sat: 1, acc: 1, flash: 0 };
  const ctx: TestCtx = {
    world,
    overlay: world,
    cam,
    live,
    env,
    stats: emptyStats(),
    emit: (s) => void lines.push(s),
    rand: seqRand(),
    t: 0,
    dt: 0.05,
    phone: false,
    still: false,
    view: world.features,
    lines,
    spawned,
    jams,
    run(update, seconds, dt = 0.05) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        ctx.dt = dt;
        ctx.t += dt;
        ctx.view = world.query({ x: 0, y: 0, w: 0, h: 0 });
        update(ctx);
      }
    },
    ...opts,
  } as TestCtx;
  return ctx;
}

export function testDrawCtx(): DrawCtx & { lights: LightSource[] } {
  const lights: LightSource[] = [];
  const view = { x0: 0, y0: 0, w: 1440, h: 900, z: 2.4, dpr: 1 };
  return {
    view,
    t: 0,
    env: { night: 1, raining: false, sat: 1, acc: 1, flash: 0 },
    lights,
    sx: (x) => (x - view.x0) * view.z,
    sy: (y) => (y - view.y0) * view.z,
    inView: () => true,
    light: (l) => void lights.push(l),
  };
}
