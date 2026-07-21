// Central configuration surface.
//
// Mirrors the mockup's single CFG object idea, but split into typed modules so every
// tunable number lives under src/config with a comment explaining it, and logic files
// import named constants instead of hardcoding values. Balance milestones add units,
// weapons, stamina, morale, map sizes, and reinforcement tables here.

export * from "./pacing";
export * from "./scaffold";

// Default faction identity, easily rethemed for a pitch (see the mockup CFG).
export const FACTIONS = {
  blue: { id: 1 as const, name: "NORTHERN COALITION" },
  red: { id: 2 as const, name: "VARDAN PACT" },
} as const;

// Default match seed used by the mockup. A real match seeds per room.
export const DEFAULT_SEED = 1337;
