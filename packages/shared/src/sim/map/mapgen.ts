// Deterministic procedural map generation.
//
// Same (seed, size) always yields an identical GameMap, so both players in a match get
// the same terrain and replays reproduce it exactly. Generation uses its own RNG seeded
// from the match seed, independent of the simulation's runtime RNG.
//
// Pipeline: elevation, rivers, bridges and roads, towns, forests, objectives and
// sectors, cover-point extraction, then a connectivity-repair pass that guarantees no
// passable tile is unreachable (rivers are the only impassable terrain, bridges cross
// them, and repair carves a crossing for any land pocket that generation left isolated).

import { RNG } from "../../math/rng";
import { clamp, TWO_PI } from "../../math";
import {
  Elevation,
  MAP_SIZES,
  TILE,
  Tile,
  type MapSizeId,
} from "../../config/map";
import type {
  CoverPoint,
  Crossing,
  GameMap,
  Objective,
  Sector,
} from "./types";

const OBJECTIVE_NAMES = [
  "ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT",
  "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA",
];

const SECTOR_NAMES = ["NORTH", "UPPER", "CENTRAL", "LOWER", "SOUTH"];

// Internal mutable builder.
interface Builder {
  rng: RNG;
  w: number;
  h: number;
  tiles: Uint8Array;
  elev: Uint8Array;
  riverCols: number[][]; // per river, the water column at each row
}

function get(b: Builder, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= b.w || ty >= b.h) return Tile.Water;
  return b.tiles[ty * b.w + tx] as Tile;
}
function set(b: Builder, tx: number, ty: number, t: Tile): void {
  if (tx < 0 || ty < 0 || tx >= b.w || ty >= b.h) return;
  b.tiles[ty * b.w + tx] = t;
}
function passable(b: Builder, tx: number, ty: number): boolean {
  return get(b, tx, ty) !== Tile.Water;
}

// ---- elevation ----
function genElevation(b: Builder): void {
  b.elev.fill(Elevation.Lowland);
  const area = b.w * b.h;
  const plateaus = 2 + Math.floor((area / 15000));
  for (let p = 0; p < plateaus; p++) {
    growBlob(b, Elevation.Plateau, 40 + b.rng.int(80));
  }
  // Ridges are smaller and tend to sit on plateau ground (raised spines).
  const ridges = 2 + Math.floor(area / 22000);
  for (let r = 0; r < ridges; r++) {
    growRidge(b, 18 + b.rng.int(34));
  }
}

function growBlob(b: Builder, level: Elevation, steps: number): void {
  let tx = 3 + b.rng.int(b.w - 6);
  let ty = 3 + b.rng.int(b.h - 6);
  for (let s = 0; s < steps; s++) {
    if (tx >= 0 && ty >= 0 && tx < b.w && ty < b.h) {
      b.elev[ty * b.w + tx] = level;
    }
    tx = clamp(tx + b.rng.int(3) - 1, 1, b.w - 2);
    ty = clamp(ty + b.rng.int(3) - 1, 1, b.h - 2);
  }
}

function growRidge(b: Builder, steps: number): void {
  // Bias the walk in one direction so ridges read as spines rather than blobs.
  let tx = 3 + b.rng.int(b.w - 6);
  let ty = 3 + b.rng.int(b.h - 6);
  const dirx = b.rng.next() < 0.5 ? 1 : -1;
  const diry = b.rng.next() < 0.5 ? 1 : -1;
  for (let s = 0; s < steps; s++) {
    if (tx >= 0 && ty >= 0 && tx < b.w && ty < b.h) {
      const i = ty * b.w + tx;
      b.elev[i] = Elevation.Ridge;
      // Widen slightly to a plateau apron.
      if (get(b, tx + 1, ty) !== Tile.Water && b.elev[i + 1]! < Elevation.Plateau) {
        b.elev[i + 1] = Elevation.Plateau;
      }
    }
    tx = clamp(tx + (b.rng.next() < 0.7 ? dirx : b.rng.int(3) - 1), 1, b.w - 2);
    ty = clamp(ty + (b.rng.next() < 0.5 ? diry : b.rng.int(3) - 1), 1, b.h - 2);
  }
}

// ---- rivers ----
function genRivers(b: Builder, count: number): void {
  b.riverCols = [];
  for (let r = 0; r < count; r++) {
    const baseCol = Math.round((b.w * (r + 1)) / (count + 1));
    const amp1 = 3 + b.rng.range(0, b.w * 0.03);
    const amp2 = 2 + b.rng.range(0, b.w * 0.02);
    const f1 = 0.12 + b.rng.range(0, 0.12);
    const f2 = 0.05 + b.rng.range(0, 0.08);
    const p1 = b.rng.range(0, TWO_PI);
    const p2 = b.rng.range(0, TWO_PI);
    const cols: number[] = [];
    for (let y = 0; y < b.h; y++) {
      const col = clamp(
        Math.round(baseCol + amp1 * Math.sin(y * f1 + p1) + amp2 * Math.sin(y * f2 + p2)),
        1,
        b.w - 2,
      );
      cols.push(col);
      set(b, col, y, Tile.Water);
      set(b, col + 1, y, Tile.Water);
      if (b.rng.next() < 0.35) set(b, col - 1, y, Tile.Water);
    }
    b.riverCols.push(cols);
  }
}

// ---- bridges and roads ----
function genBridgesAndRoads(b: Builder): Crossing[] {
  const crossings: Crossing[] = [];
  // Number of crossing rows scales with height (at least 2 per river for connectivity).
  const bridgeRowCount = clamp(Math.round(b.h / 40), 2, 4);
  const bridgeRows: number[] = [];
  for (let k = 0; k < bridgeRowCount; k++) {
    bridgeRows.push(Math.round((b.h * (k + 0.5)) / bridgeRowCount));
  }

  // Horizontal roads across each bridge row, bridging any water they cross.
  for (const by of bridgeRows) {
    for (let x = 0; x < b.w; x++) {
      if (get(b, x, by) === Tile.Water) {
        set(b, x, by, Tile.Bridge);
        if (get(b, x, by + 1) === Tile.Water) set(b, x, by + 1, Tile.Bridge);
      } else {
        set(b, x, by, Tile.Road);
      }
    }
    // Record a crossing per river at this row.
    for (const cols of b.riverCols) {
      const cx = cols[by]!;
      crossings.push({
        x: (cx + 1) * TILE,
        y: (by + 0.5) * TILE,
        tx: cx,
        ty: by,
        sector: 0,
      });
    }
  }

  // Vertical connector roads: a couple of columns per inter-river band.
  const bandEdges = [0, ...b.riverCols.map((c) => c[Math.floor(b.h / 2)]!), b.w - 1];
  bandEdges.sort((a, c) => a - c);
  for (let i = 0; i < bandEdges.length - 1; i++) {
    const lo = bandEdges[i]! + 2;
    const hi = bandEdges[i + 1]! - 2;
    if (hi - lo < 4) continue;
    const vx = Math.round((lo + hi) / 2);
    for (let y = 0; y < b.h; y++) {
      if (get(b, vx, y) === Tile.Grass) set(b, vx, y, Tile.Road);
    }
  }
  return crossings;
}

// ---- towns ----
function genTowns(b: Builder, crossings: Crossing[]): void {
  // Town clusters hug each crossing on both banks.
  for (const c of crossings) {
    const cluster = 10 + b.rng.int(16);
    for (let n = 0; n < cluster; n++) {
      const side = n % 2 === 0 ? -1 : 1;
      const tx = c.tx + side * (2 + b.rng.int(5));
      const ty = c.ty - 3 + b.rng.int(8);
      if (get(b, tx, ty) === Tile.Grass) set(b, tx, ty, Tile.Town);
    }
  }
  // A few rear villages for cover and objective anchors.
  const villages = clamp(Math.round((b.w * b.h) / 6000), 3, 10);
  for (let v = 0; v < villages; v++) {
    const cx = 4 + b.rng.int(b.w - 8);
    const cy = 4 + b.rng.int(b.h - 8);
    if (get(b, cx, cy) !== Tile.Grass) continue;
    const cluster = 6 + b.rng.int(10);
    for (let n = 0; n < cluster; n++) {
      const tx = cx - 2 + b.rng.int(5);
      const ty = cy - 2 + b.rng.int(5);
      if (get(b, tx, ty) === Tile.Grass) set(b, tx, ty, Tile.Town);
    }
  }
}

// ---- forests ----
function genForests(b: Builder, count: number): void {
  for (let f = 0; f < count; f++) {
    let tx = 3 + b.rng.int(b.w - 6);
    let ty = 3 + b.rng.int(b.h - 6);
    const steps = 22 + b.rng.int(28);
    for (let s = 0; s < steps; s++) {
      if (get(b, tx, ty) === Tile.Grass) set(b, tx, ty, Tile.Forest);
      tx = clamp(tx + b.rng.int(3) - 1, 1, b.w - 2);
      ty = clamp(ty + b.rng.int(3) - 1, 1, b.h - 2);
    }
  }
}

// ---- connectivity repair (guarantees no unreachable land) ----
function repairConnectivity(b: Builder): void {
  const n = b.w * b.h;
  const comp = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  let compCount = 0;
  const compSize: number[] = [];

  for (let start = 0; start < n; start++) {
    if (comp[start]! >= 0) continue;
    if ((b.tiles[start] as Tile) === Tile.Water) continue;
    const id = compCount++;
    let size = 0;
    stack.push(start);
    comp[start] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      const cx = cur % b.w;
      const cy = (cur / b.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
        const ni = ny * b.w + nx;
        if (comp[ni]! >= 0) continue;
        if ((b.tiles[ni] as Tile) === Tile.Water) continue;
        comp[ni] = id;
        stack.push(ni);
      }
    }
    compSize.push(size);
  }

  if (compCount <= 1) return;

  // Largest component is the mainland.
  let main = 0;
  for (let i = 1; i < compCount; i++) if (compSize[i]! > compSize[main]!) main = i;

  // For every other component, carve a straight causeway to the nearest mainland tile.
  for (let cid = 0; cid < compCount; cid++) {
    if (cid === main) continue;
    // Pick a representative tile of this component (first in row-major order).
    let rep = -1;
    for (let i = 0; i < n; i++) {
      if (comp[i] === cid) {
        rep = i;
        break;
      }
    }
    if (rep < 0) continue;
    const rx = rep % b.w;
    const ry = (rep / b.w) | 0;

    // Nearest mainland tile (bounded spiral search).
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (comp[i] !== main) continue;
      const mx = i % b.w;
      const my = (i / b.w) | 0;
      const d = (mx - rx) * (mx - rx) + (my - ry) * (my - ry);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) continue;
    carveCauseway(b, rx, ry, best % b.w, (best / b.w) | 0);
  }
}

// Carve a passable line between two tiles, bridging water and roading land.
function carveCauseway(b: Builder, x0: number, y0: number, x1: number, y1: number): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // Guard against pathological loops.
  for (let guard = 0; guard < b.w + b.h + 4; guard++) {
    const t = get(b, x, y);
    if (t === Tile.Water) set(b, x, y, Tile.Bridge);
    else if (t === Tile.Grass) set(b, x, y, Tile.Road);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// ---- objectives, sectors ----
function genSectors(b: Builder): Sector[] {
  const bands = clamp(Math.round(b.h / 45), 2, SECTOR_NAMES.length);
  const sectors: Sector[] = [];
  for (let i = 0; i < bands; i++) {
    const cy = ((i + 0.5) / bands) * b.h;
    sectors.push({
      id: i,
      name: SECTOR_NAMES[Math.round((i * (SECTOR_NAMES.length - 1)) / (bands - 1))]!,
      x: (b.w / 2) * TILE,
      y: cy * TILE,
    });
  }
  return sectors;
}

function sectorOf(sectors: Sector[], b: Builder, ty: number): number {
  const bands = sectors.length;
  return clamp(Math.floor((ty / b.h) * bands), 0, bands - 1);
}

function genObjectives(
  b: Builder,
  crossings: Crossing[],
  sectors: Sector[],
  count: number,
): Objective[] {
  const objectives: Objective[] = [];
  const minSepTiles = Math.max(8, Math.floor(Math.min(b.w, b.h) / 6));
  const minSep2 = minSepTiles * minSepTiles;

  const tooClose = (tx: number, ty: number): boolean => {
    for (const o of objectives) {
      const d = (o.tx - tx) * (o.tx - tx) + (o.ty - ty) * (o.ty - ty);
      if (d < minSep2) return true;
    }
    return false;
  };

  const add = (
    tx: number,
    ty: number,
    kind: Objective["kind"],
  ): void => {
    if (objectives.length >= count) return;
    if (tx < 2 || ty < 2 || tx >= b.w - 2 || ty >= b.h - 2) return;
    if (tooClose(tx, ty)) return;
    const sector = sectorOf(sectors, b, ty);
    objectives.push({
      id: objectives.length,
      name: OBJECTIVE_NAMES[objectives.length]!,
      kind,
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      r: 140,
      tx,
      ty,
      sector,
      owner: 0,
      cap: 0,
    });
  };

  // Priority 1: central crossings.
  const midRow = Math.floor(b.h / 2);
  const sortedCrossings = [...crossings].sort(
    (a, c) => Math.abs(a.ty - midRow) - Math.abs(c.ty - midRow),
  );
  for (const c of sortedCrossings) add(c.tx, c.ty, "crossing");

  // Priority 2: high ground (ridge tiles).
  if (objectives.length < count) {
    const ridges: number[] = [];
    for (let i = 0; i < b.w * b.h; i++) {
      if (b.elev[i] === Elevation.Ridge && (b.tiles[i] as Tile) !== Tile.Water) {
        ridges.push(i);
      }
    }
    // Deterministic spread: sample evenly across the collected ridge tiles.
    for (let k = 0; k < ridges.length && objectives.length < count; k++) {
      const step = Math.max(1, Math.floor(ridges.length / (count + 1)));
      if (k % step !== 0) continue;
      const i = ridges[k]!;
      add(i % b.w, (i / b.w) | 0, "highground");
    }
  }

  // Priority 3: towns.
  if (objectives.length < count) {
    for (let i = 0; i < b.w * b.h && objectives.length < count; i++) {
      if ((b.tiles[i] as Tile) === Tile.Town) {
        // Only consider town-cluster centers (surrounded by town on several sides).
        const tx = i % b.w;
        const ty = (i / b.w) | 0;
        let townN = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (get(b, tx + dx, ty + dy) === Tile.Town) townN++;
        if (townN >= 5) add(tx, ty, "town");
      }
    }
  }

  // Fallback: fill any remainder on open passable ground on a coarse grid.
  if (objectives.length < count) {
    for (let gy = 3; gy < b.h - 3 && objectives.length < count; gy += minSepTiles) {
      for (let gx = 3; gx < b.w - 3 && objectives.length < count; gx += minSepTiles) {
        if (passable(b, gx, gy)) add(gx, gy, "town");
      }
    }
  }

  return objectives;
}

// ---- cover point extraction ----
function extractCoverPoints(b: Builder): CoverPoint[] {
  const cover: CoverPoint[] = [];
  const w = b.w;
  const h = b.h;

  // Sample building edges and treelines: a tile of Town/Forest adjacent to open ground
  // registers a cover node on its edge, facing the open side. Sampling keeps the count
  // proportional to map area rather than exploding on large maps.
  const sampleEvery = 2;
  for (let ty = 1; ty < h - 1; ty++) {
    for (let tx = 1; tx < w - 1; tx++) {
      const t = get(b, tx, ty);
      if (t !== Tile.Town && t !== Tile.Forest) continue;
      if (((tx * 7 + ty * 13) % sampleEvery) !== 0) continue;
      // Find an adjacent open (grass/road) tile: that is the exposed side.
      let ox = 0;
      let oy = 0;
      let found = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nt = get(b, tx + dx, ty + dy);
        if (nt === Tile.Grass || nt === Tile.Road) {
          ox = dx;
          oy = dy;
          found = true;
          break;
        }
      }
      if (!found) continue;
      cover.push({
        x: (tx + 0.5 + ox * 0.4) * TILE,
        y: (ty + 0.5 + oy * 0.4) * TILE,
        // Facing points from the cover toward the open side it protects against.
        facing: Math.atan2(oy, ox),
        quality: t === Tile.Town ? 0.9 : 0.5,
        kind: t === Tile.Town ? "building" : "treeline",
      });
    }
  }

  // Sparse rock clusters on open high ground: cover-only features (no tile change).
  const rocks = clamp(Math.round((w * h) / 5000), 4, 40);
  for (let r = 0; r < rocks; r++) {
    const tx = 2 + b.rng.int(w - 4);
    const ty = 2 + b.rng.int(h - 4);
    if (get(b, tx, ty) !== Tile.Grass) continue;
    if (b.elev[ty * w + tx]! < Elevation.Plateau) continue;
    cover.push({
      x: (tx + 0.5) * TILE,
      y: (ty + 0.5) * TILE,
      facing: b.rng.range(0, TWO_PI),
      quality: 0.6,
      kind: "rock",
    });
  }

  return cover;
}

export function generateMap(seed: number, size: MapSizeId): GameMap {
  const spec = MAP_SIZES[size];
  const b: Builder = {
    rng: new RNG(seed),
    w: spec.w,
    h: spec.h,
    tiles: new Uint8Array(spec.w * spec.h).fill(Tile.Grass),
    elev: new Uint8Array(spec.w * spec.h).fill(Elevation.Lowland),
    riverCols: [],
  };

  genElevation(b);
  genRivers(b, spec.rivers);
  const crossings = genBridgesAndRoads(b);
  genTowns(b, crossings);
  genForests(b, spec.forests);
  repairConnectivity(b);

  const sectors = genSectors(b);
  for (const c of crossings) c.sector = sectorOf(sectors, b, c.ty);
  const objectives = genObjectives(b, crossings, sectors, spec.objectives);
  const coverPoints = extractCoverPoints(b);

  return {
    seed,
    size,
    w: b.w,
    h: b.h,
    tile: TILE,
    worldW: b.w * TILE,
    worldH: b.h * TILE,
    tiles: b.tiles,
    elevation: b.elev,
    objectives,
    sectors,
    crossings,
    coverPoints,
  };
}
