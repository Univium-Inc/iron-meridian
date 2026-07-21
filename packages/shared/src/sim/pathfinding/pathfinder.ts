// Hierarchical pathfinding for squads and vehicles.
//
// Strategy (satisfies the "hierarchical A*" requirement and the 10ms/route budget on
// Large):
//   1. A coarse sector graph (SECTOR_BLOCK tiles per cell) is precomputed once per map:
//      which sectors are passable and which sector borders can be crossed.
//   2. A per-query coarse A* over sectors yields a corridor (the sector path plus a one
//      sector apron).
//   3. A grid A* refines inside that corridor only, so the frontier stays a narrow band
//      instead of the whole map. If corridor refinement fails (coarse adjacency can over
//      approximate intra-sector connectivity), it falls back to an unconstrained grid A*.
//
// All working buffers are allocated once per map and reset with a generation stamp, so a
// search costs time proportional to the tiles it actually explores, not the map size.
// This is what lets 500 Large routes each stay well under budget.

import { clamp } from "../../math";
import { MOVE_COST_INF, MOVE_COST_VEH, TILE, Tile } from "../../config/map";
import { DIAG_COST, SECTOR_BLOCK } from "../../config/pathfinding";
import type { GameMap } from "../map/types";
import { MinHeap } from "./heap";

export interface Point {
  x: number;
  y: number;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export class Pathfinder {
  private map: GameMap;
  private w: number;
  private h: number;
  private n: number;

  // Grid search buffers (reused, generation-stamped).
  private gCost: Float64Array;
  private fCost: Float64Array;
  private came: Int32Array;
  private seenGen: Uint32Array;
  private closedGen: Uint32Array;
  private gen = 0;
  private heap: MinHeap;

  // Coarse sector graph.
  private sw: number;
  private sh: number;
  private sectorPassable: Uint8Array;
  private crossRight: Uint8Array; // sector s can cross to s+1 (east)
  private crossDown: Uint8Array; // sector s can cross to s+sw (south)
  private corridor: Uint8Array; // per sector, 1 if in the current corridor
  private sGCost: Float64Array;
  private sCame: Int32Array;
  private sSeenGen: Uint32Array;
  private sGen = 0;
  private sHeapKeys: Float64Array;
  private sHeap: MinHeap;

  constructor(map: GameMap) {
    this.map = map;
    this.w = map.w;
    this.h = map.h;
    this.n = map.w * map.h;

    this.gCost = new Float64Array(this.n);
    this.fCost = new Float64Array(this.n);
    this.came = new Int32Array(this.n);
    this.seenGen = new Uint32Array(this.n);
    this.closedGen = new Uint32Array(this.n);
    this.heap = new MinHeap(this.n, this.fCost);

    this.sw = Math.ceil(this.w / SECTOR_BLOCK);
    this.sh = Math.ceil(this.h / SECTOR_BLOCK);
    const sn = this.sw * this.sh;
    this.sectorPassable = new Uint8Array(sn);
    this.crossRight = new Uint8Array(sn);
    this.crossDown = new Uint8Array(sn);
    this.corridor = new Uint8Array(sn);
    this.sGCost = new Float64Array(sn);
    this.sCame = new Int32Array(sn);
    this.sSeenGen = new Uint32Array(sn);
    this.sHeapKeys = new Float64Array(sn);
    this.sHeap = new MinHeap(sn, this.sHeapKeys);

    this.buildSectorGraph();
  }

  private tileType(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return Tile.Water;
    return this.map.tiles[ty * this.w + tx] as Tile;
  }

  private passable(tx: number, ty: number): boolean {
    return this.tileType(tx, ty) !== Tile.Water;
  }

  private moveCost(tx: number, ty: number, inf: boolean): number {
    return (inf ? MOVE_COST_INF : MOVE_COST_VEH)[this.tileType(tx, ty)]!;
  }

  private sectorIndex(tx: number, ty: number): number {
    return ((ty / SECTOR_BLOCK) | 0) * this.sw + ((tx / SECTOR_BLOCK) | 0);
  }

  private buildSectorGraph(): void {
    const { w, h } = this;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        if (!this.passable(tx, ty)) continue;
        const s = this.sectorIndex(tx, ty);
        this.sectorPassable[s] = 1;
        // East border crossing.
        if (tx + 1 < w && this.passable(tx + 1, ty)) {
          const s2 = this.sectorIndex(tx + 1, ty);
          if (s2 === s + 1) this.crossRight[s] = 1;
        }
        // South border crossing.
        if (ty + 1 < h && this.passable(tx, ty + 1)) {
          const s2 = this.sectorIndex(tx, ty + 1);
          if (s2 === s + this.sw) this.crossDown[s] = 1;
        }
      }
    }
  }

  // Coarse A* over the sector graph. Fills this.corridor with the sector path plus a one
  // sector apron. Returns false if no coarse path exists.
  private buildCorridor(startTile: number, goalTile: number): boolean {
    const sw = this.sw;
    const sh = this.sh;
    const sn = sw * sh;
    const start = this.sectorIndex(startTile % this.w, (startTile / this.w) | 0);
    const goal = this.sectorIndex(goalTile % this.w, (goalTile / this.w) | 0);

    this.corridor.fill(0);
    if (!this.sectorPassable[start] || !this.sectorPassable[goal]) return false;

    this.sGen++;
    const gen = this.sGen;
    const gx = goal % sw;
    const gy = (goal / sw) | 0;
    this.sHeap.clear();
    this.sGCost[start] = 0;
    this.sSeenGen[start] = gen;
    this.sCame[start] = -1;
    this.sHeapKeys[start] = 0;
    this.sHeap.push(start);

    let found = false;
    while (this.sHeap.length) {
      const cur = this.sHeap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % sw;
      const cy = (cur / sw) | 0;
      const g = this.sGCost[cur]!;
      // 4-connected sector moves gated by border-crossing flags.
      // East
      if (cx + 1 < sw && this.crossRight[cur]) this.relaxSector(cur, cur + 1, g, gen, gx, gy, sw);
      // West
      if (cx - 1 >= 0 && this.crossRight[cur - 1]) this.relaxSector(cur, cur - 1, g, gen, gx, gy, sw);
      // South
      if (cy + 1 < sh && this.crossDown[cur]) this.relaxSector(cur, cur + sw, g, gen, gx, gy, sw);
      // North
      if (cy - 1 >= 0 && this.crossDown[cur - sw]) this.relaxSector(cur, cur - sw, g, gen, gx, gy, sw);
    }

    if (!found) return false;

    // Walk the sector path back and paint it plus a one sector apron into the corridor.
    let c = goal;
    while (c !== -1) {
      this.paintCorridor(c, sw, sh, sn);
      c = this.sCame[c]!;
    }
    return true;
  }

  private relaxSector(
    cur: number,
    next: number,
    g: number,
    gen: number,
    gx: number,
    gy: number,
    sw: number,
  ): void {
    if (!this.sectorPassable[next]) return;
    const ng = g + 1;
    if (this.sSeenGen[next] === gen && this.sGCost[next]! <= ng) return;
    this.sGCost[next] = ng;
    this.sCame[next] = cur;
    this.sSeenGen[next] = gen;
    const nx = next % sw;
    const ny = (next / sw) | 0;
    this.sHeapKeys[next] = ng + Math.abs(nx - gx) + Math.abs(ny - gy);
    this.sHeap.push(next);
  }

  private paintCorridor(s: number, sw: number, sh: number, sn: number): void {
    const sx = s % sw;
    const sy = (s / sw) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
        const ns = ny * sw + nx;
        if (ns >= 0 && ns < sn) this.corridor[ns] = 1;
      }
    }
  }

  // Snap a tile to the nearest passable tile (bounded spiral). Ported from the mockup.
  private nearestPassable(tx: number, ty: number): [number, number] {
    if (this.passable(tx, ty)) return [tx, ty];
    for (let r = 1; r < 16; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.passable(tx + dx, ty + dy)) {
            return [clamp(tx + dx, 0, this.w - 1), clamp(ty + dy, 0, this.h - 1)];
          }
        }
      }
    }
    return [clamp(tx, 0, this.w - 1), clamp(ty, 0, this.h - 1)];
  }

  // Find a path from world (x0,y0) to (x1,y1). Returns a list of world-space waypoints,
  // or null if unreachable. `inf` selects the infantry cost table (vs vehicle).
  findPath(x0: number, y0: number, x1: number, y1: number, inf: boolean): Point[] | null {
    const [sx, sy] = this.nearestPassable(Math.floor(x0 / TILE), Math.floor(y0 / TILE));
    const [gx, gy] = this.nearestPassable(Math.floor(x1 / TILE), Math.floor(y1 / TILE));
    const si = sy * this.w + sx;
    const gi = gy * this.w + gx;
    if (si === gi) {
      return [{ x: clamp(x1, 8, this.map.worldW - 8), y: clamp(y1, 8, this.map.worldH - 8) }];
    }

    const hasCorridor = this.buildCorridor(si, gi);
    let raw = this.gridSearch(sx, sy, gx, gy, inf, hasCorridor);
    if (!raw && hasCorridor) {
      // Corridor was too tight; retry unconstrained.
      raw = this.gridSearch(sx, sy, gx, gy, inf, false);
    }
    if (!raw) return null;

    // Convert tile path to world waypoints, append the true destination, then smooth.
    const pts: Point[] = raw.map((i) => ({
      x: (i % this.w) * TILE + TILE / 2,
      y: ((i / this.w) | 0) * TILE + TILE / 2,
    }));
    const destX = clamp(x1, 8, this.map.worldW - 8);
    const destY = clamp(y1, 8, this.map.worldH - 8);
    if (this.passable(Math.floor(destX / TILE), Math.floor(destY / TILE))) {
      pts.push({ x: destX, y: destY });
    }
    return this.smooth(pts);
  }

  private gridSearch(
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    inf: boolean,
    useCorridor: boolean,
  ): number[] | null {
    const { w, n } = this;
    const si = sy * w + sx;
    const gi = gy * w + gx;
    this.gen++;
    const gen = this.gen;

    this.heap.clear();
    this.gCost[si] = 0;
    this.fCost[si] = this.octile(sx, sy, gx, gy);
    this.seenGen[si] = gen;
    this.came[si] = -1;
    this.heap.push(si);

    let iter = 0;
    const maxIter = n; // generous; generation stamping keeps real cost proportional to explored nodes
    while (this.heap.length && iter++ < maxIter) {
      const cur = this.heap.pop();
      if (cur === gi) return this.reconstruct(cur, si);
      if (this.closedGen[cur] === gen) continue;
      this.closedGen[cur] = gen;

      const cx = cur % w;
      const cy = (cur / w) | 0;
      const cg = this.gCost[cur]!;

      for (let k = 0; k < 8; k++) {
        const dx = NEIGHBORS[k]![0];
        const dy = NEIGHBORS[k]![1];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
        if (!this.passable(nx, ny)) continue;
        if (useCorridor && !this.corridor[this.sectorIndex(nx, ny)]) continue;
        // No cutting corners through water.
        if (dx !== 0 && dy !== 0) {
          if (!this.passable(cx + dx, cy) || !this.passable(cx, cy + dy)) continue;
        }
        const ni = ny * w + nx;
        if (this.closedGen[ni] === gen) continue;
        const stepBase = this.moveCost(nx, ny, inf);
        const step = dx !== 0 && dy !== 0 ? stepBase * DIAG_COST : stepBase;
        const ng = cg + step;
        if (this.seenGen[ni] === gen && this.gCost[ni]! <= ng) continue;
        this.gCost[ni] = ng;
        this.came[ni] = cur;
        this.seenGen[ni] = gen;
        this.fCost[ni] = ng + this.octile(nx, ny, gx, gy) * 10;
        this.heap.push(ni);
      }
    }
    return null;
  }

  // Octile heuristic scaled to the cheapest tile cost, admissible for our cost tables.
  private octile(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return (dx + dy) + (DIAG_COST - 2) * Math.min(dx, dy);
  }

  private reconstruct(goal: number, start: number): number[] {
    const rev: number[] = [];
    let c = goal;
    while (c !== -1 && c !== start) {
      rev.push(c);
      c = this.came[c]!;
    }
    rev.push(start);
    rev.reverse();
    return rev;
  }

  // Straight-line passability between two world points (for string-pull smoothing).
  private clearLine(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / (TILE * 0.45)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (this.tileType(Math.floor(x / TILE), Math.floor(y / TILE)) === Tile.Water) return false;
    }
    return true;
  }

  // String-pull: drop intermediate waypoints that have clear line of sight. Ported from
  // the mockup's smoothing.
  private smooth(pts: Point[]): Point[] {
    if (pts.length <= 2) return pts;
    const out: Point[] = [pts[0]!];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.clearLine(pts[anchor]!.x, pts[anchor]!.y, pts[i]!.x, pts[i]!.y)) {
        out.push(pts[i - 1]!);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]!);
    return out;
  }
}
