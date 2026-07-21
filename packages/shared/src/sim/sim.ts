// The authoritative simulation.
//
// Fixed timestep, deterministic. Contract (stable across every milestone):
//   1. Callers push commands with applyCommand between ticks.
//   2. tick() applies all queued commands in the exact order received, then advances the
//      world by exactly one fixed step (DT), then increments the tick counter.
//   3. hash() returns a digest of the dynamic world state using network quantization.
//
// M1 drives "movers" that navigate the generated map with the pathfinder. M2 replaces
// them with vehicles and squads; the contract above does not change.

import { clamp, TWO_PI } from "../math";
import { SCAFFOLD_MOVER_COUNT, SCAFFOLD_MOVER_SPEED } from "../config/scaffold";
import { DT } from "../config/pacing";
import { PATHS_PER_TICK, WAYPOINT_RADIUS } from "../config/pathfinding";
import { SPD_INF, SPD_VEH, TILE, Tile, type MapSizeId } from "../config/map";
import type { Command } from "./commands";
import { HashWriter } from "./hash";
import { Pathfinder } from "./pathfinding/pathfinder";
import { createWorld, type Mover, type World } from "./world";
import { tileAtPx } from "./map/types";

export class Simulation {
  readonly world: World;
  readonly pathfinder: Pathfinder;
  private queue: Command[] = [];

  constructor(seed: number, size: MapSizeId = "large") {
    this.world = createWorld(seed, size);
    this.pathfinder = new Pathfinder(this.world.map);
    this.spawnInitialMovers();
  }

  applyCommand(cmd: Command): void {
    this.queue.push(cmd);
  }

  tick(): void {
    for (const cmd of this.queue) this.runCommand(cmd);
    this.queue.length = 0;
    this.step();
    this.world.tick++;
  }

  run(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  hash(): number {
    const w = new HashWriter();
    w.uint32(this.world.tick);
    w.uint32(this.world.rng.ustate);
    w.uint32(this.world.nextId);
    w.uint32(this.world.map.seed);
    w.uint32(this.world.movers.length);
    for (const m of this.world.movers) {
      w.uint32(m.id);
      w.posCm(m.x);
      w.posCm(m.y);
      w.angleByte(m.heading);
    }
    return w.digest();
  }

  // ---- internals ----

  private randomPassableWorldPoint(): { x: number; y: number } {
    const map = this.world.map;
    const rng = this.world.rng;
    for (let attempt = 0; attempt < 32; attempt++) {
      const tx = rng.int(map.w);
      const ty = rng.int(map.h);
      if ((map.tiles[ty * map.w + tx] as Tile) !== Tile.Water) {
        return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
    // Fallback: map center.
    return { x: map.worldW / 2, y: map.worldH / 2 };
  }

  private spawnInitialMovers(): void {
    for (let i = 0; i < SCAFFOLD_MOVER_COUNT; i++) {
      const p = this.randomPassableWorldPoint();
      this.addMover(p.x, p.y, this.world.rng.next() < 0.5);
    }
  }

  private addMover(x: number, y: number, inf: boolean): Mover {
    const w = this.world;
    const m: Mover = {
      id: w.nextId++,
      x,
      y,
      heading: w.rng.range(0, TWO_PI),
      inf,
      path: [],
    };
    w.movers.push(m);
    return m;
  }

  private runCommand(cmd: Command): void {
    switch (cmd.t) {
      case "spawnMover": {
        this.addMover(cmd.x, cmd.y, this.world.rng.next() < 0.5);
        break;
      }
      case "nudgeMover": {
        const m = this.world.movers.find((mm) => mm.id === cmd.id);
        if (m) {
          // Jolt the mover and force a fresh destination on the next step.
          m.x = clamp(m.x + cmd.dvx, 8, this.world.map.worldW - 8);
          m.y = clamp(m.y + cmd.dvy, 8, this.world.map.worldH - 8);
          m.path.length = 0;
        }
        break;
      }
    }
  }

  private step(): void {
    const map = this.world.map;
    let pathBudget = PATHS_PER_TICK;
    for (const m of this.world.movers) {
      if (m.path.length === 0 && pathBudget > 0) {
        pathBudget--;
        const dest = this.randomPassableWorldPoint();
        const path = this.pathfinder.findPath(m.x, m.y, dest.x, dest.y, m.inf);
        if (path) m.path = path;
        // If no path this tick, leave empty and try a new destination next tick.
      }

      if (m.path.length > 0) {
        const wp = m.path[0]!;
        const dx = wp.x - m.x;
        const dy = wp.y - m.y;
        const d = Math.hypot(dx, dy);
        m.heading = Math.atan2(dy, dx);
        const tile = tileAtPx(map, m.x, m.y) as Tile;
        const terr = (m.inf ? SPD_INF : SPD_VEH)[tile] || 1;
        const speed = SCAFFOLD_MOVER_SPEED * terr;
        const stepLen = Math.min(d, speed * DT);
        if (d > 0.0001) {
          m.x += (dx / d) * stepLen;
          m.y += (dy / d) * stepLen;
        }
        if (d < WAYPOINT_RADIUS) m.path.shift();
      }
    }
  }
}
