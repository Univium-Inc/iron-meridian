// Public surface of @iron/shared: the entire simulation, config, and math.
// Zero DOM dependencies. Imported identically by the server (tsx / tsup) and the
// client (Vite).

export * from "./math";
export * from "./math/rng";
export * from "./config";
export * from "./config/map";
export * from "./config/pathfinding";

// Map
export * from "./sim/map/types";
export * from "./sim/map/mapgen";

// Pathfinding and spatial queries
export * from "./sim/pathfinding/heap";
export * from "./sim/pathfinding/pathfinder";
export * from "./sim/pathfinding/flowfield";
export * from "./sim/spatial/hash";

// Simulation
export * from "./sim/commands";
export * from "./sim/world";
export * from "./sim/hash";
export * from "./sim/sim";
