// M0 scaffold constants.
//
// These drive the placeholder "mover" entities that exist only so the determinism
// harness exercises the RNG, command queue, fixed tick, and state hash against real
// changing state. The world milestone (M1) replaces this with the real tile map and
// entities, at which point this file goes away. Kept in config (not inline) to model
// the project rule: no magic numbers in logic files.

// Scaffold world bounds, in world units.
export const SCAFFOLD_WORLD_W = 4000;
export const SCAFFOLD_WORLD_H = 2500;

// Number of wandering movers spawned at match start.
export const SCAFFOLD_MOVER_COUNT = 24;

// Constant forward speed of a mover, world units per second.
export const SCAFFOLD_MOVER_SPEED = 60;

// Maximum heading change per tick from the RNG, radians. Gives a legible wander.
export const SCAFFOLD_MOVER_TURN = 0.35;
