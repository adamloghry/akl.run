import type { EventMachine } from "../core/types";
import { Car } from "./car";
import { Drop } from "./drop";
import { Jams } from "./jams";
import { Look } from "./look";
import { Lot } from "./lot";
import { Power } from "./power";
import { Radar } from "./radar";
import { Raid } from "./raid";
import { Research } from "./research";
import { Silo } from "./silo";
import { Spider } from "./spider";
import { Storm } from "./storm";
import { Trains } from "./trains";

/** One instance of every event machine. `all` is in update/draw order; machines wanting a district take turns (Sim.step). */
export function makeMachines() {
  const raid = new Raid();
  const spider = new Spider(raid);
  const storm = new Storm();
  const lot = new Lot();
  const silo = new Silo();
  const trains = new Trains();
  const car = new Car();
  const jams = new Jams();
  const power = new Power();
  const radar = new Radar();
  const research = new Research();
  const look = new Look();
  const drop = new Drop([raid, silo, trains, look]);
  const all: EventMachine[] = [
    raid,
    spider,
    storm,
    lot,
    silo,
    drop,
    trains,
    car,
    jams,
    power,
    radar,
    research,
    look,
  ];
  return { all, raid, spider, storm, lot, silo, drop, trains, car, jams, power, radar, research, look };
}
