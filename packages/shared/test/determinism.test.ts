import { describe, it, expect } from "vitest";
import { Simulation, type TimedCommand } from "../src";

// A scripted command log: perturb the world at known ticks. Replaying (same seed, same
// log) must reproduce the exact same state hash. This is the foundation for replays,
// server restart recovery, and the balance harness.
function scriptedLog(): TimedCommand[] {
  return [
    { tick: 10, cmd: { t: "spawnMover", x: 100, y: 100 } },
    { tick: 25, cmd: { t: "nudgeMover", id: 3, dvx: 40, dvy: -20 } },
    { tick: 100, cmd: { t: "spawnMover", x: 2000, y: 1500 } },
    { tick: 250, cmd: { t: "nudgeMover", id: 1, dvx: -80, dvy: 10 } },
    { tick: 999, cmd: { t: "spawnMover", x: 3500, y: 500 } },
    { tick: 5000, cmd: { t: "nudgeMover", id: 7, dvx: 15, dvy: 15 } },
  ];
}

// Run a sim for `ticks` steps, applying the command log at the correct ticks.
function runWithLog(seed: number, ticks: number, log: TimedCommand[]): number {
  const sim = new Simulation(seed, "small");
  let li = 0;
  for (let t = 0; t < ticks; t++) {
    while (li < log.length && log[li]!.tick === sim.world.tick) {
      sim.applyCommand(log[li]!.cmd);
      li++;
    }
    sim.tick();
  }
  return sim.hash();
}

const TICKS = 10000;
const SEED = 1337;

describe("determinism", () => {
  it("same seed plus same command log gives an identical hash after 10,000 ticks", () => {
    const a = runWithLog(SEED, TICKS, scriptedLog());
    const b = runWithLog(SEED, TICKS, scriptedLog());
    expect(a).toBe(b);
  });

  it("a run with no commands is also reproducible after 10,000 ticks", () => {
    const a = runWithLog(SEED, TICKS, []);
    const b = runWithLog(SEED, TICKS, []);
    expect(a).toBe(b);
  });

  it("a different seed produces a different hash", () => {
    const a = runWithLog(SEED, TICKS, scriptedLog());
    const b = runWithLog(SEED + 1, TICKS, scriptedLog());
    expect(a).not.toBe(b);
  });

  it("a different command log produces a different hash", () => {
    const withLog = runWithLog(SEED, TICKS, scriptedLog());
    const withoutLog = runWithLog(SEED, TICKS, []);
    expect(withLog).not.toBe(withoutLog);
  });

  it("the hash is stable step by step (tick, run(n)) equivalence)", () => {
    // Ticking one at a time must match ticking in a batch.
    const oneByOne = new Simulation(SEED, "small");
    for (let i = 0; i < 500; i++) oneByOne.tick();

    const batched = new Simulation(SEED, "small");
    batched.run(500);

    expect(oneByOne.hash()).toBe(batched.hash());
  });
});
