// Page driver: hub/factory state, keys, readout, production stats, journal, the frame loop and its
// pauses, DPR quantisation, reduced motion, and window.__mapgen. Runs once at load.
import { Cam } from "./camera";
import { Clock } from "./core/clock";
import { hash } from "./core/hash";
import { rand } from "./core/rng";
import { CH, T, type Rand } from "./core/types";
import { Journal } from "./journal";
import { Sim } from "./sim";
import { World } from "./world/world";

const PHONE_MQ = "(max-width: 760px)";
const RM_MQ = "(prefers-reduced-motion: reduce)";
const IDLE_MS = 120000;
const NIGHT_MS = 60000;
const BUDGET = 6;

// ---- time of day and weather (ported, America/Los_Angeles) ----

const nightNow = (): number => {
  try {
    const hr =
      parseInt(
        new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          hour12: false,
          timeZone: "America/Los_Angeles",
        }).format(new Date()),
        10,
      ) % 24;
    return hr >= 21 || hr < 5 ? 1 : hr >= 19 ? (hr - 18) / 3 : hr < 7 ? (7 - hr) / 3 : 0;
  } catch {
    return 0;
  }
};

// Each 3-hour window rains with a probability set by the month (NOAA SEA normals scaled by .6),
// hashed from the date so every visitor sees the same sky at the same time.
const RAIN_P = [0.35, 0.35, 0.33, 0.29, 0.2, 0.16, 0.08, 0.08, 0.15, 0.25, 0.37, 0.35];
const rainNow = (): boolean => {
  try {
    const o: Record<string, number> = {};
    for (const pt of new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
      timeZone: "America/Los_Angeles",
    }).formatToParts(new Date()))
      o[pt.type] = parseInt(pt.value, 10);
    return hash(o.year * 400 + o.month * 32 + o.day, ((o.hour % 24) / 3) | 0, 0x7a1d) < RAIN_P[o.month - 1];
  } catch {
    return false;
  }
};

/** ?time=cycle: a 160 s loop, 42% day, 8% dusk ramp, 40% night, 10% dawn. */
const cycleNight = (t: number): number => {
  const p = (t % 160) / 160;
  if (p < 0.42) return 0;
  if (p < 0.5) return (p - 0.42) / 0.08;
  if (p < 0.9) return 1;
  return 1 - (p - 0.9) / 0.1;
};

const stamp = (): string => {
  const d = new Date();
  const hh = (n: number) => String(n).padStart(2, "0");
  return `${hh(d.getHours())}:${hh(d.getMinutes())}:${hh(d.getSeconds())}`;
};

const toHex = (s: number): string => "0x" + (s >>> 0).toString(16).padStart(8, "0");

/** Deterministic LCG for still mode, so the reduced-motion frame depends only on the seed. */
function lcg(seed: number): Rand {
  let s = seed >>> 0;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor((b - a) * next()),
    pick: (arr) => arr[Math.floor(arr.length * next())],
    chance: (p) => next() < p,
  };
}

function init(): void {
  const canvas = document.getElementById("map") as HTMLCanvasElement | null;
  const ctx = canvas?.getContext?.("2d") ?? null;
  const root = document.documentElement;
  root.classList.add("js");
  const q = <E extends Element = HTMLElement>(s: string) => document.querySelector<E>(s);
  const hubWin = q("[data-windows]");
  const logEl = q<HTMLOListElement>("[data-log]");
  const readout = q("[data-readout]");
  const readoutText = q("[data-readout-text]") ?? readout;
  const minimizeEl = q("[data-minimize]");
  const journalEl = q("[data-journal]");
  const statEls = [...document.querySelectorAll<HTMLElement>("[data-prod] [data-stat]")];
  if (!canvas || !ctx) return;

  const mm = (s: string) =>
    window.matchMedia ? window.matchMedia(s) : ({ matches: false } as Partial<MediaQueryList>);
  const mqPhone = mm(PHONE_MQ) as MediaQueryList;
  const mqRM = mm(RM_MQ) as MediaQueryList;

  // ---- parameters ----
  const params = new URLSearchParams(location.search);
  let seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const qs = params.get("seed");
  if (qs && /^(0x)?[0-9a-fA-F]{1,8}$/.test(qs)) seed = parseInt(qs, 16) >>> 0;
  const timeParam = params.get("time");
  const fixedNight = timeParam === "day" ? 0 : timeParam === "dusk" ? 0.5 : timeParam === "night" ? 1 : null;
  const cycling = timeParam === "cycle";

  // ---- state ----
  const bootStart = performance.now();
  const clock = new Clock();
  const journal = new Journal(logEl, { ring: mqPhone.matches ? 4 : 6 });
  let reduced = !!mqRM.matches;
  let rain = rainNow();
  let sim!: Sim;
  let W = 0,
    H = 0,
    dpr = 1,
    bw = 0,
    bh = 0;
  let raf = 0,
    lastKick = 0,
    lastAct = performance.now(),
    prevDrawn = -1e9;
  let hidden = document.hidden,
    offscreen = false,
    idle = false,
    dead = false;
  let frames = 0,
    fresh = true, // the current Sim has not drawn yet: its first draw builds every visible chunk
    shown = false,
    lastReadout = -1e9,
    lastStats = -1e9,
    lastNight = performance.now();
  const perf = { n: 0, sum: 0, max: 0, first: 0, firstDraw: 0, ring: new Float32Array(1024) };

  // Intl is costly, so the wall-clock night is cached and refreshed with the 60 s weather block;
  // only ?time=cycle evaluates per frame.
  let nightCache = nightNow();
  const nightFor = (): number => (cycling ? cycleNight(clock.t) : (fixedNight ?? nightCache));
  const applyEnv = (): void => {
    sim.env.night = nightFor();
    sim.env.raining = rain;
  };

  // ---- hub / factory / superminimized ----
  const isFactory = (): boolean => root.classList.contains("factory");
  const isSuper = (): boolean => root.classList.contains("superminimized");
  /** Before hiding `el`, move focus out of it to the readout (or just drop it). */
  const evacuate = (el: Element | null): void => {
    if (!el?.contains(document.activeElement)) return;
    if (readout) {
      readout.hidden = false;
      shown = true;
      readout.focus();
    } else (document.activeElement as HTMLElement).blur();
  };
  const setInert = (el: Element | null, on: boolean): void => {
    if (!el) return;
    const h = el as HTMLElement & { inert?: boolean };
    const native: boolean = "inert" in (h as object);
    h.inert = on;
    if (!native) {
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    }
  };
  /** Superminimize: the journal goes too (factory mode only; leaving factory mode clears it). */
  function setSuper(on: boolean): void {
    if (on && !isFactory()) setMode("factory");
    if (on) evacuate(journalEl);
    root.classList.toggle("superminimized", on);
    setInert(journalEl, on);
  }
  function setMode(mode: "hub" | "factory"): void {
    const on = mode === "factory";
    if (on) evacuate(hubWin);
    else if (isSuper()) setSuper(false);
    root.classList.toggle("factory", on);
    setInert(hubWin, on);
    readout?.setAttribute("aria-pressed", on ? "true" : "false");
    if (on && idle) {
      idle = false;
      wake();
    }
    if (!on) lastAct = performance.now();
  }
  setMode(isFactory() ? "factory" : "hub");

  // ---- sizing ----
  /** Backing store = CSS size x capped DPR, always following the CSS size. Returns true when it changed. */
  function size(): boolean {
    const r = canvas!.getBoundingClientRect();
    const cw = Math.round(r.width) || window.innerWidth,
      ch = Math.round(r.height) || window.innerHeight;
    if (cw < 2 || ch < 2) return false;
    const dr = window.devicePixelRatio || 1,
      dcap = Math.min(2, Math.sqrt(4e6 / (cw * ch)));
    let d = dr <= dcap ? dr : dr / Math.ceil(dr / dcap); // integer divisor of the device ratio
    if (dr < 1.5) d = Math.max(0.75, d);
    const nw = Math.round(cw * d),
      nh = Math.round(ch * d);
    if (nw === bw && nh === bh && cw === W && ch === H) return false;
    bw = canvas!.width = nw;
    bh = canvas!.height = nh;
    W = cw;
    H = ch;
    dpr = d;
    sim?.setViewport(W, H, dpr);
    return true;
  }

  // ---- run ----
  function makeSim(): void {
    sim?.world.dispose(); // release the old world's chunk canvases
    const still = reduced;
    sim = new Sim({
      seed,
      phone: mqPhone.matches,
      emit: still ? () => {} : (l) => journal.emit(l),
      rand: still ? lcg(seed) : rand,
    });
    clock.resetPrev();
    clock.t = 0;
    if (W) sim.setViewport(W, H, dpr);
    applyEnv();
    lastNight = performance.now();
    if (still) sim.stillFrame();
    journal.reset();
    fresh = true;
  }
  function newRun(): void {
    const hex = toHex(seed);
    makeSim();
    journal.runStart(hex, "?seed=" + hex);
    prevDrawn = -1e9;
  }

  // ---- frame ----
  function readoutNow(): void {
    if (!readoutText) return;
    const s = sim.cam.geo();
    if (readoutText.textContent !== s) readoutText.textContent = s;
    lastReadout = performance.now();
  }
  function statsNow(): void {
    const st = sim.stats() as unknown as Record<string, number | string>;
    for (const el of statEls) {
      const k = el.getAttribute("data-stat") ?? "";
      if (k in st) {
        const v = String(st[k]);
        if (el.textContent !== v) el.textContent = v;
      }
    }
    lastStats = performance.now();
  }
  function afterDraw(ms: number): void {
    frames++;
    if (frames === 1) {
      perf.firstDraw = ms;
      perf.first = performance.now() - bootStart;
      try {
        performance.mark("mapgen:first-frame");
      } catch {
        /* optional */
      }
      root.classList.add("ready");
    } else {
      perf.n++;
      perf.sum += ms;
      if (ms > perf.max) perf.max = ms;
      perf.ring[perf.n & 1023] = ms;
    }
    if (!shown) {
      shown = true;
      if (readout) readout.hidden = false;
    }
  }
  function renderNow(): void {
    if (dead || !sim || !W) return;
    const t0 = performance.now();
    sim.draw(ctx!, W, H, dpr, Infinity);
    fresh = false;
    afterDraw(performance.now() - t0);
    readoutNow();
    statsNow();
  }
  function step(now: number): void {
    const t0 = performance.now();
    const dt = clock.tick(now);
    if (t0 - lastNight > NIGHT_MS) {
      lastNight = t0;
      rain = rainNow();
      nightCache = nightNow();
    }
    sim.env.night = nightFor();
    sim.env.raining = rain;
    sim.step(dt);
    sim.draw(ctx!, W, H, dpr, fresh ? Infinity : BUDGET);
    fresh = false;
    afterDraw(performance.now() - t0);
    journal.tick(sim.clock.t, stamp, !sim.still, rand);
    const pn = performance.now();
    if (pn - lastReadout >= 500) readoutNow();
    if (pn - lastStats >= 1000) statsNow();
  }
  // The idle pause is a hub-only courtesy: in factory mode the page is meant to be watched.
  const isRunning = (): boolean => !dead && !hidden && !offscreen && (!idle || isFactory()) && !reduced;
  function frame(now: number): void {
    raf = 0;
    lastKick = performance.now();
    if (!isRunning()) return;
    if (!isFactory() && lastKick - lastAct > IDLE_MS) {
      idle = true;
      return;
    }
    raf = requestAnimationFrame(frame);
    if (mqPhone.matches && now - prevDrawn < 30) return; // 30 fps cap; rAF stamps jitter
    prevDrawn = now;
    try {
      step(now);
    } catch (err) {
      // a throwing step/draw would otherwise repeat every frame: log once, stop, keep the hub usable
      dead = true;
      stop();
      console.error("akl.run: factory loop stopped after an error; the hub stays usable", err);
    }
  }
  function wake(): void {
    if (!raf && isRunning() && W) {
      clock.resetPrev();
      raf = requestAnimationFrame(frame);
    }
  }
  function stop(): void {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  const redrawIfStill = (): void => {
    if (!dead && (reduced || !isRunning())) renderNow();
  };

  function reroll(): void {
    seed = (Math.random() * 0xffffffff) >>> 0;
    try {
      const p = new URLSearchParams(location.search);
      p.set("seed", toHex(seed));
      history.replaceState(null, "", location.pathname + "?" + p.toString() + location.hash);
    } catch {
      /* sandboxed */
    }
    newRun();
    readoutNow();
    redrawIfStill();
    wake();
  }

  // ---- init ----
  size();
  newRun();
  readoutNow();
  statsNow();
  if (W && reduced) renderNow();

  // ---- events ----
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || e.isComposing) return;
    const el = e.target as HTMLElement | null;
    if (el?.tagName && /^(input|textarea|select)$/i.test(el.tagName)) return;
    if (el?.isContentEditable) return;
    const k = (e.key || "").toLowerCase();
    if (k === "r") reroll();
    else if (k === "m") setMode(isFactory() ? "hub" : "factory");
    else if (k === "s") setSuper(!(isFactory() && isSuper()));
  });
  minimizeEl?.addEventListener("click", (e) => {
    e.preventDefault();
    setMode("factory");
  });
  readout?.addEventListener("click", () => setMode(isFactory() ? "hub" : "factory"));
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const v = sim.cam.view;
    const kx = r.width ? W / r.width : 1,
      ky = r.height ? H / r.height : 1;
    sim.m.look.request({
      x: v.x0 + ((e.clientX - r.left) * kx) / v.z,
      y: v.y0 + ((e.clientY - r.top) * ky) / v.z,
    });
    if (reduced) renderNow();
  });
  for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"])
    window.addEventListener(
      ev,
      () => {
        lastAct = performance.now();
        if (idle) {
          idle = false;
          wake();
        }
      },
      { passive: true },
    );
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (hidden) stop();
    else {
      lastAct = performance.now();
      idle = false;
      wake();
    }
  });
  if (window.IntersectionObserver)
    new IntersectionObserver((es) => {
      offscreen = !es[es.length - 1].isIntersecting;
      if (offscreen) stop();
      else {
        lastAct = performance.now();
        idle = false;
        wake();
      }
    }).observe(canvas);
  let rz: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (size()) renderNow();
      wake();
    }, 100);
  });
  mqPhone.addEventListener?.("change", () => {
    sim.setPhone(mqPhone.matches);
    journal.setRing(mqPhone.matches ? 4 : 6);
    redrawIfStill();
  });
  mqRM.addEventListener?.("change", () => {
    reduced = mqRM.matches;
    stop();
    makeSim();
    if (reduced) renderNow();
    else wake();
  });
  setInterval(() => {
    if (!reduced) return;
    nightCache = nightNow();
    const n = nightFor(),
      r = rainNow();
    if (n !== sim.env.night || r !== rain) {
      rain = r;
      applyEnv();
      renderNow();
    }
  }, NIGHT_MS);
  // watchdog: some browsers swallow or throttle the first rAF, so re-kick a stalled loop
  setInterval(() => {
    if (!isRunning()) return;
    if (!raf) wake();
    else if (performance.now() - lastKick > 1500) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  }, 1000);
  wake();

  const api = {
    get seed() {
      return seed;
    },
    get seedHex() {
      return toHex(seed);
    },
    get world() {
      return sim.world;
    },
    get cam() {
      return sim.cam;
    },
    get sim() {
      return sim;
    },
    get state() {
      return {
        running: isRunning(),
        hidden,
        offscreen,
        idle,
        reduced,
        factory: isFactory(),
        superminimized: isSuper(),
        W,
        H,
        dpr,
        frames,
        t: sim.clock.t,
        rain,
      };
    },
    get events() {
      return journal.recent();
    },
    get machines() {
      return Object.fromEntries(sim.m.all.map((m) => [m.name, m.state()]));
    },
    get speed() {
      return clock.speed;
    },
    set speed(k: number) {
      clock.speed = k;
    },
    reroll,
    minimize: (b: boolean) => setMode(b ? "factory" : "hub"),
    setMode: (m: "hub" | "factory") => setMode(m),
    superminimize: (b: boolean) => setSuper(b),
    renderNow,
    World,
    Cam,
    T,
    CH,
    stats: () => sim.stats(),
    lookAt: (x: number, y: number) => sim.cam.lookAt({ x, y }),
    perf() {
      const a = Array.from(perf.ring)
        .filter((x) => x)
        .sort((x, y) => x - y);
      return {
        frames,
        first: perf.first,
        firstDraw: perf.firstDraw,
        n: perf.n,
        avg: perf.n ? perf.sum / perf.n : 0,
        p95: a.length ? a[Math.floor(a.length * 0.95)] : 0,
        max: perf.max,
        chunks: sim.world.size(),
      };
    },
    resetPerf() {
      perf.n = 0;
      perf.sum = 0;
      perf.max = 0;
      perf.ring.fill(0);
    },
  };
  (window as unknown as { __mapgen: typeof api }).__mapgen = api;
}

function boot(): void {
  try {
    init();
  } catch (err) {
    console.error("akl.run: factory failed to start; the hub stays usable", err);
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
