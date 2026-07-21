// Map configuration: sizes, tile types, elevation, and terrain movement tables.
//
// Ported and generalized from the mockup (reference/iron-meridian.html), which used a
// single fixed 64x40 map. Production supports three lobby-selectable sizes at 40px
// tiles. Large is the flagship (256x160 tiles = 10240x6400 world units).

// World units per tile. One tile is 40 units on a side (the mockup's TILE).
export const TILE = 40;

// Tile types. Order matters: the movement tables below are indexed by these values.
export enum Tile {
  Grass = 0,
  Forest = 1,
  Town = 2,
  Road = 3,
  Water = 4,
  Bridge = 5,
}

export const TILE_COUNT = 6;

// Elevation levels. Higher ground blocks line of sight to what is behind it, grants a
// spotting bonus, and enables hull-down (all consumed by the combat milestone, M2).
export enum Elevation {
  Lowland = 0,
  Plateau = 1,
  Ridge = 2,
}

// Spotting range bonus per elevation step above the target, applied in M2.
export const ELEVATION_SPOT_BONUS = 0.15;

// Lobby-selectable map sizes, in tiles.
export type MapSizeId = "small" | "medium" | "large";

export interface MapSizeSpec {
  id: MapSizeId;
  w: number;
  h: number;
  rivers: number; // number of meandering rivers
  objectives: number; // named objectives to place
  forests: number; // forest blobs to grow
}

export const MAP_SIZES: Record<MapSizeId, MapSizeSpec> = {
  small: { id: "small", w: 96, h: 60, rivers: 2, objectives: 5, forests: 14 },
  medium: { id: "medium", w: 160, h: 100, rivers: 2, objectives: 7, forests: 26 },
  large: { id: "large", w: 256, h: 160, rivers: 3, objectives: 11, forests: 48 },
};

// Pathfinding cost per tile, per movement class. Water is impassable (handled as a hard
// block, not a cost). Roads and bridges are cheap, forests and towns are slow (more so
// for vehicles). Ported from the mockup's tileCost().
// Indexed by Tile. Water entry is a placeholder; callers treat Water as impassable.
export const MOVE_COST_INF: readonly number[] = [10, 12, 11, 8, 9999, 8];
export const MOVE_COST_VEH: readonly number[] = [10, 22, 18, 7, 9999, 7];

// Movement speed multiplier per tile, per movement class (used by unit movement in M2,
// and by the M1 mover demo). Ported from the mockup's SPD_INF / SPD_VEH.
export const SPD_INF: readonly number[] = [1, 0.85, 0.9, 1.18, 0, 1.18];
export const SPD_VEH: readonly number[] = [1, 0.45, 0.5, 1.35, 0, 1.35];

export function isPassableTile(t: Tile): boolean {
  return t !== Tile.Water;
}
