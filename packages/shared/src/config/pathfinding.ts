// Pathfinding tuning.

// Coarse sector block size in tiles for hierarchical A*. The coarse graph has
// ceil(w/SECTOR_BLOCK) x ceil(h/SECTOR_BLOCK) nodes; on Large that is 16x10 = 160 nodes,
// so the coarse search is trivially fast and the refined grid search is confined to a
// narrow corridor of these sectors.
export const SECTOR_BLOCK = 16;

// Diagonal step cost multiplier (sqrt 2) used by the grid A*.
export const DIAG_COST = 1.41421356;

// Waypoint arrival radius in world units, used by movers and unit movement.
export const WAYPOINT_RADIUS = 14;

// Maximum number of fresh path computations allowed per simulation tick. Path requests
// beyond this wait for a later tick, so a burst of simultaneous repaths (for example all
// units retasked at once) is amortized instead of spiking a single tick. Deterministic
// because entities are always processed in id order.
export const PATHS_PER_TICK = 4;
