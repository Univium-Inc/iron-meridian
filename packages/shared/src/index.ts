// Public surface of @iron/shared: the entire simulation, config, and math.
// Zero DOM dependencies. Imported identically by the server (tsx / tsup) and the
// client (Vite).

export * from "./math";
export * from "./math/rng";
export * from "./config";
export * from "./sim/commands";
export * from "./sim/world";
export * from "./sim/hash";
export * from "./sim/sim";
