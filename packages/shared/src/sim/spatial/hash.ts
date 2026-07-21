// Uniform-grid spatial hash for O(1) proximity queries.
//
// Every proximity query in the sim (targeting, separation, cover search, capture-zone
// occupancy) goes through this instead of scanning all entities, so there are no O(n^2)
// loops. Rebuilt each tick from current positions. Bucketing is by a fixed cell size in
// world units; queries visit only the cells overlapping the query circle.

export interface SpatialItem {
  id: number;
  x: number;
  y: number;
}

export class SpatialHash {
  private readonly cellSize: number;
  private readonly invCell: number;
  private buckets = new Map<number, SpatialItem[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;
  }

  private key(cx: number, cy: number): number {
    // Pack signed cell coords into one number. World is bounded and small enough that
    // cell coordinates fit comfortably; the offset keeps them non-negative.
    return (cy + 0x8000) * 0x10000 + (cx + 0x8000);
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(item: SpatialItem): void {
    const cx = Math.floor(item.x * this.invCell);
    const cy = Math.floor(item.y * this.invCell);
    const k = this.key(cx, cy);
    let bucket = this.buckets.get(k);
    if (!bucket) {
      bucket = [];
      this.buckets.set(k, bucket);
    }
    bucket.push(item);
  }

  rebuild(items: Iterable<SpatialItem>): void {
    this.clear();
    for (const it of items) this.insert(it);
  }

  // Invoke cb for every item whose center is within `radius` of (x, y). Returns the count
  // visited that passed the radius test. Allocation free.
  forEachInRadius(
    x: number,
    y: number,
    radius: number,
    cb: (item: SpatialItem) => void,
  ): void {
    const r2 = radius * radius;
    const minCx = Math.floor((x - radius) * this.invCell);
    const maxCx = Math.floor((x + radius) * this.invCell);
    const minCy = Math.floor((y - radius) * this.invCell);
    const maxCy = Math.floor((y + radius) * this.invCell);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const it = bucket[i]!;
          const dx = it.x - x;
          const dy = it.y - y;
          if (dx * dx + dy * dy <= r2) cb(it);
        }
      }
    }
  }

  // Collect ids within radius into a fresh array (convenience for non-hot paths).
  queryRadius(x: number, y: number, radius: number): number[] {
    const out: number[] = [];
    this.forEachInRadius(x, y, radius, (it) => out.push(it.id));
    return out;
  }
}
