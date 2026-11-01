import type {
  DrawCtx,
  Features,
  LightSource,
  LivePush,
  ParticleKind,
  ParticleOpts,
  SimCtx,
} from "../core/types";
import { Belts } from "./belts";
import { Bots } from "./bots";
import { Inserters } from "./inserters";
import { Lights } from "./lights";
import { Machines } from "./machines";
import { Particles } from "./particles";
import { Rain } from "./rain";
import { Water } from "./water";

/** The ambient live layer: one object the sim and the event machines talk to. */
export class Live implements LivePush {
  readonly particles = new Particles();
  readonly lights = new Lights();
  readonly rain = new Rain();
  readonly belts = new Belts();
  readonly inserters = new Inserters();
  readonly machines = new Machines();
  readonly water = new Water();
  readonly bots = new Bots();

  spawn(k: ParticleKind, x: number, y: number, o?: ParticleOpts): void {
    this.particles.spawn(k, x, y, o);
  }
  jam(id: string, on: boolean): void {
    this.belts.jam(id, on);
  }
  isJammed(id: string): boolean {
    return this.belts.isJammed(id);
  }

  update(ctx: SimCtx): void {
    this.belts.update(ctx);
    this.inserters.update(ctx);
    this.machines.update(ctx);
    this.water.update(ctx);
    this.bots.update(ctx);
    this.particles.update(ctx);
  }

  /** Everything under the event machines: belts, inserters, machines, water, bots, particles. */
  drawBelow(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void {
    this.belts.draw(g, d, f);
    this.inserters.draw(g, d, f);
    this.machines.draw(g, d, f);
    this.water.draw(g, d, f);
    this.bots.draw(g, d, f);
    this.particles.draw(g, d, f);
  }

  drawLights(g: CanvasRenderingContext2D, d: DrawCtx, f: Features, queued: LightSource[]): void {
    this.lights.draw(g, d, f, queued);
  }

  drawRain(g: CanvasRenderingContext2D, d: DrawCtx, f: Features): void {
    this.rain.draw(g, d, f);
  }

  reset(): void {
    this.belts.reset();
    this.inserters.reset();
    this.machines.reset();
    this.water.reset();
    this.bots.reset();
    this.particles.reset();
    this.rain.reset();
  }
}
