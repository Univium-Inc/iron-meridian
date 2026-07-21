// Command types.
//
// Commands are the only way to influence the simulation from outside (a player, the
// enemy bot, a replay log). This is server authoritative: clients send commands, the
// server applies them deterministically before ticking. A (seed, ordered command log)
// pair fully reconstructs any match state, which is what the determinism test, replay
// viewer, and server restart recovery all rely on.
//
// The union grows every milestone (move, attack, group orders, reinforcements, ...).
// M0 defines just enough to perturb the scaffold world.

// Spawn a new mover at a world position.
export interface SpawnMoverCommand {
  t: "spawnMover";
  x: number;
  y: number;
}

// Perturb an existing mover's velocity by (dvx, dvy).
export interface NudgeMoverCommand {
  t: "nudgeMover";
  id: number;
  dvx: number;
  dvy: number;
}

export type Command = SpawnMoverCommand | NudgeMoverCommand;

// A command paired with the tick at which it must be applied. Command logs are stored
// as these entries so replay applies each command on exactly the tick it happened.
export interface TimedCommand {
  tick: number;
  cmd: Command;
}
