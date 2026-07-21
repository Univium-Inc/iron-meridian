// The authoritative simulation.
//
// Fixed timestep, deterministic. Contract (kept stable for every later milestone):
//   1. Callers push commands with applyCommand between ticks.
//   2. tick() first applies all queued commands in the exact order received, then
//      advances the world by exactly one fixed step (DT), then increments the tick
//      counter. This ordering is what makes replay from a command log exact.
//   3. hash() returns a digest of the full world using network quantization.
//
// The M0 body simulates wandering movers so the determinism harness has real changing
// state to certify. M1 onward extends World and the step logic; this contract does not
// change.

import { clamp, TWO_PI } from "../math";
import {
  SCAFFOLD_MOVER_COUNT,
  SCAFFOLD_MOVER_SPEED,
  SCAFFOLD_MOVER_TURN,
  SCAFFOLD_WORLD_H,
  SCAFFOLD_WORLD_W,
} from "../config/scaffold";
import { DT } from "../config/pacing";
import type { Command } from "./commands";
import { HashWriter } from "./hash";
import { createWorld, type Mover, type World } from "./world";

export class Simulation {
  readonly world: World;
  private queue: Command[] = [];

  constructor(seed: number) {
    this.world = createWorld(seed);
    this.spawnInitialMovers();
  }

  // Queue a command to be applied at the start of the next tick.
  applyCommand(cmd: Command): void {
    this.queue.push(cmd);
  }

  // Advance the simulation by exactly one fixed step.
  tick(): void {
    // 1. Apply queued commands in order.
    for (const cmd of this.queue) this.runCommand(cmd);
    this.queue.length = 0;

    // 2. Step the world.
    this.step();

    // 3. Advance the tick counter.
    this.world.tick++;
  }

  // Run n ticks (convenience for harnesses and tests).
  run(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  // 32 bit FNV-1a digest of the full world under network quantization.
  hash(): number {
    const w = new HashWriter();
    w.uint32(this.world.tick);
    w.uint32(this.world.rng.ustate);
    w.uint32(this.world.nextId);
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

  private spawnInitialMovers(): void {
    const w = this.world;
    for (let i = 0; i < SCAFFOLD_MOVER_COUNT; i++) {
      this.addMover(
        w.rng.range(0, SCAFFOLD_WORLD_W),
        w.rng.range(0, SCAFFOLD_WORLD_H),
        w.rng.range(0, TWO_PI),
      );
    }
  }

  private addMover(x: number, y: number, heading: number): Mover {
    const w = this.world;
    const m: Mover = {
      id: w.nextId++,
      x,
      y,
      vx: Math.cos(heading) * SCAFFOLD_MOVER_SPEED,
      vy: Math.sin(heading) * SCAFFOLD_MOVER_SPEED,
      heading,
    };
    w.movers.push(m);
    return m;
  }

  private runCommand(cmd: Command): void {
    switch (cmd.t) {
      case "spawnMover": {
        const heading = this.world.rng.range(0, TWO_PI);
        this.addMover(cmd.x, cmd.y, heading);
        break;
      }
      case "nudgeMover": {
        const m = this.world.movers.find((mm) => mm.id === cmd.id);
        if (m) {
          m.vx += cmd.dvx;
          m.vy += cmd.dvy;
          m.heading = Math.atan2(m.vy, m.vx);
        }
        break;
      }
    }
  }

  private step(): void {
    const w = this.world;
    for (const m of w.movers) {
      // Wander: nudge heading by a seeded amount, re-derive velocity, integrate.
      const turn = (w.rng.next() - 0.5) * 2 * SCAFFOLD_MOVER_TURN;
      m.heading += turn;
      const speed = Math.hypot(m.vx, m.vy) || SCAFFOLD_MOVER_SPEED;
      m.vx = Math.cos(m.heading) * speed;
      m.vy = Math.sin(m.heading) * speed;
      m.x += m.vx * DT;
      m.y += m.vy * DT;

      // Bounce off the scaffold world bounds so movers stay in play.
      if (m.x < 0 || m.x > SCAFFOLD_WORLD_W) {
        m.x = clamp(m.x, 0, SCAFFOLD_WORLD_W);
        m.heading = Math.PI - m.heading;
        m.vx = -m.vx;
      }
      if (m.y < 0 || m.y > SCAFFOLD_WORLD_H) {
        m.y = clamp(m.y, 0, SCAFFOLD_WORLD_H);
        m.heading = -m.heading;
        m.vy = -m.vy;
      }
    }
  }
}
