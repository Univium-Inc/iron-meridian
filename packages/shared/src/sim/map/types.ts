// Map data structures produced by generation and consumed by pathfinding, rendering,
// objectives, and combat. A GameMap is plain serializable data (typed arrays plus small
// object arrays), deterministic from a seed and map size.

import type { MapSizeId } from "../../config/map";

export type Team = 0 | 1 | 2; // 0 neutral, 1 blue, 2 red

// A capture objective (town, crossing, or high ground).
export interface Objective {
  id: number;
  name: string;
  kind: "town" | "crossing" | "highground";
  // World-space center and capture radius.
  x: number;
  y: number;
  r: number;
  // Tile coordinates of the center.
  tx: number;
  ty: number;
  sector: number; // index into GameMap.sectors
  owner: Team;
  cap: number; // capture progress in [-1, 1]: +blue, -red
}

// A named group of objectives, used by the event feed ("Contact at NORTH BRIDGE").
export interface Sector {
  id: number;
  name: string;
  // Centroid in world space, for camera jumps and pings.
  x: number;
  y: number;
}

// A discrete cover node with a facing, extracted from building edges, treelines, walls,
// and rock clusters. Infantry micro (M2) claims these near their formation slot. Dynamic
// cover (craters, wrecks) is appended at runtime during combat.
export interface CoverPoint {
  x: number;
  y: number;
  // Direction (radians) the cover faces, i.e. the side that is protected. A soldier
  // hugging this node is shielded from fire coming roughly from `facing`.
  facing: number;
  // Cover quality in [0, 1]: 1 is a hard wall, lower is a treeline or hedgerow.
  quality: number;
  kind: "building" | "treeline" | "wall" | "rock";
}

// A bridge crossing over a river (world-space center of the bridge span).
export interface Crossing {
  x: number;
  y: number;
  tx: number;
  ty: number;
  sector: number;
}

export interface GameMap {
  seed: number;
  size: MapSizeId;
  w: number; // width in tiles
  h: number; // height in tiles
  tile: number; // world units per tile (TILE)
  worldW: number;
  worldH: number;

  // Row-major tile-type grid (values from the Tile enum), length w*h.
  tiles: Uint8Array;
  // Row-major elevation grid (values from the Elevation enum), length w*h.
  elevation: Uint8Array;

  objectives: Objective[];
  sectors: Sector[];
  crossings: Crossing[];
  coverPoints: CoverPoint[];
}

// Helpers shared across map consumers.
export function tileIndex(map: GameMap, tx: number, ty: number): number {
  return ty * map.w + tx;
}

export function inBounds(map: GameMap, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < map.w && ty < map.h;
}

export function tileAt(map: GameMap, tx: number, ty: number): number {
  if (!inBounds(map, tx, ty)) return 4; // Tile.Water for out of bounds
  return map.tiles[ty * map.w + tx]!;
}

export function tileAtPx(map: GameMap, x: number, y: number): number {
  return tileAt(map, Math.floor(x / map.tile), Math.floor(y / map.tile));
}

export function elevationAt(map: GameMap, tx: number, ty: number): number {
  if (!inBounds(map, tx, ty)) return 0;
  return map.elevation[ty * map.w + tx]!;
}
