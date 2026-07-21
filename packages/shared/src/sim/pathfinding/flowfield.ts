// Flow field for large group moves toward a common destination.
//
// Instead of 20 squads each running a full grid A* to the same objective, one flow field
// is built once from the goal: a Dijkstra integration field over passable tiles gives
// every tile a cost-to-goal, and each tile stores the neighbor that most reduces that
// cost. Any number of units then just follow the arrow at their tile. Following the field
// from any reachable tile provably reaches the goal (each step strictly lowers the
// integration cost).

import { MOVE_COST_INF, MOVE_COST_VEH, TILE, Tile } from "../../config/map";
import { DIAG_COST } from "../../config/pathfinding";
import { MinHeap } from "./heap";
import type { GameMap } from "../map/types";

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

export class FlowField {
  readonly map: GameMap;
  readonly goalTx: number;
  readonly goalTy: number;
  // Cost to reach the goal from each tile (Infinity if unreachable or water).
  readonly cost: Float64Array;
  // Best next tile index toward the goal for each tile (-1 for goal/unreachable).
  readonly next: Int32Array;

  constructor(map: GameMap, goalTx: number, goalTy: number, inf: boolean) {
    this.map = map;
    this.goalTx = goalTx;
    this.goalTy = goalTy;
    const w = map.w;
    const h = map.h;
    const n = w * h;
    const costTable = inf ? MOVE_COST_INF : MOVE_COST_VEH;

    this.cost = new Float64Array(n).fill(Infinity);
    this.next = new Int32Array(n).fill(-1);

    const tileType = (tx: number, ty: number): Tile => map.tiles[ty * w + tx] as Tile;
    const passable = (tx: number, ty: number): boolean => tileType(tx, ty) !== Tile.Water;

    if (!passable(goalTx, goalTy)) return;

    const gi = goalTy * w + goalTx;
    const keys = this.cost; // heap keyed directly by integration cost
    const heap = new MinHeap(n, keys);
    const closed = new Uint8Array(n);
    this.cost[gi] = 0;
    heap.push(gi);

    while (heap.length) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % w;
      const cy = (cur / w) | 0;
      const cg = this.cost[cur]!;

      // Expand to neighbors; we build the field outward from the goal, so an edge from a
      // neighbor INTO cur means the neighbor's best next tile is cur.
      for (let k = 0; k < 8; k++) {
        const dx = NEIGHBORS[k]![0];
        const dy = NEIGHBORS[k]![1];
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!passable(nx, ny)) continue;
        // No cutting corners through water.
        if (dx !== 0 && dy !== 0) {
          if (!passable(cx + dx, cy) || !passable(cx, cy + dy)) continue;
        }
        const ni = ny * w + nx;
        if (closed[ni]) continue;
        // Cost to move from neighbor onto cur (cost of entering cur), symmetric enough
        // for a movement field.
        const stepBase = costTable[tileType(cx, cy)]!;
        const step = dx !== 0 && dy !== 0 ? stepBase * DIAG_COST : stepBase;
        const ng = cg + step;
        if (ng < this.cost[ni]!) {
          this.cost[ni] = ng;
          this.next[ni] = cur;
          heap.push(ni);
        }
      }
    }
  }

  reachable(tx: number, ty: number): boolean {
    return this.cost[ty * this.map.w + tx]! < Infinity;
  }

  // Unit direction to follow from a world position, or null at the goal / unreachable.
  sample(x: number, y: number): { dx: number; dy: number } | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return null;
    const i = ty * this.map.w + tx;
    const nx = this.next[i]!;
    if (nx < 0) return null;
    const tox = (nx % this.map.w) * TILE + TILE / 2;
    const toy = ((nx / this.map.w) | 0) * TILE + TILE / 2;
    const ddx = tox - x;
    const ddy = toy - y;
    const d = Math.hypot(ddx, ddy) || 1;
    return { dx: ddx / d, dy: ddy / d };
  }
}
