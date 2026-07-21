// Pacing and timestep configuration.
//
// The number one product requirement is that battles last 20 to 45 minutes. The
// tuning that enforces that (ticket pools, bleed rates, time to kill) arrives with
// the combat and operations milestones. What lives here from M0 onward is the fixed
// timestep the whole simulation and network layer are built around.

// Simulation runs at a fixed 20 ticks per second (authoritative server rate).
export const TICK_HZ = 20;

// Seconds advanced per simulation tick. Fixed. The sim never reads a wall clock.
export const DT = 1 / TICK_HZ;

// Milliseconds per tick, for the server accumulator loop.
export const TICK_MS = 1000 / TICK_HZ;

// Default match time limit in seconds (15 minutes as in the mockup). Retuned toward
// the 20 to 45 minute target during the operations milestone (M4).
export const MATCH_TIME_LIMIT_S = 900;
