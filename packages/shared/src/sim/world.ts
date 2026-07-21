// World state container.
//
// Plain serializable data plus the RNG (whose state is a plain number). From M1 the
// world owns the generated GameMap. Real entities (vehicles and 5-man squads) arrive in
// M2; M1 keeps lightweight "movers" that navigate the real map with the pathfinder, so
// the tick loop exercises map generation and pathfinding end to end.

import { RNG } from "../math/rng";
import { generateMap } from "./map/mapgen";
import type { GameMap } from "./map/types";
import type { MapSizeId } from "../config/map";

export interface Waypoint {
  x: number;
  y: number;
}

// M1 placeholder entity: navigates the real map toward random destinations.
export interface Mover {
  id: number;
  x: number;
  y: number;
  heading: number;
  inf: boolean; // infantry movement class (vs vehicle)
  path: Waypoint[]; // remaining world-space waypoints
}

export interface World {
  tick: number;
  rng: RNG;
  nextId: number;
  map: GameMap;
  movers: Mover[];
}

export function createWorld(seed: number, size: MapSizeId): World {
  return {
    tick: 0,
    // Runtime RNG is independent of the map generator's internal RNG, so map layout is
    // stable regardless of how much runtime randomness is later consumed.
    rng: new RNG(seed),
    nextId: 1,
    map: generateMap(seed, size),
    movers: [],
  };
}
