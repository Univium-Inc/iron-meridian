// World state container.
//
// The world is plain serializable data: no methods, no class instances beyond the RNG
// (whose state is a plain number). Everything needed to reproduce or hash a match lives
// here. Systems in the simulation read and mutate this structure; nothing else holds
// game state. M1 replaces the scaffold movers with the tile map and real entities.

import { RNG } from "../math/rng";

// M0 placeholder entity: wanders the scaffold world using the RNG.
export interface Mover {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
}

export interface World {
  // Integer tick counter. The sim never reads wall clock time.
  tick: number;
  // Deterministic RNG. Its state is part of the world and is hashed.
  rng: RNG;
  // Monotonic entity id allocator.
  nextId: number;
  // Scaffold entities (M0 only).
  movers: Mover[];
}

export function createWorld(seed: number): World {
  return {
    tick: 0,
    rng: new RNG(seed),
    nextId: 1,
    movers: [],
  };
}
