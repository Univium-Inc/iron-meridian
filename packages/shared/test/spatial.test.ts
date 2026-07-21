import { describe, it, expect } from "vitest";
import { RNG, SpatialHash, type SpatialItem } from "../src";

describe("spatial hash", () => {
  it("matches brute force for random radius queries", () => {
    const rng = new RNG(4242);
    const items: SpatialItem[] = [];
    for (let i = 0; i < 800; i++) {
      items.push({ id: i, x: rng.range(0, 10240), y: rng.range(0, 6400) });
    }
    const hash = new SpatialHash(64);
    hash.rebuild(items);

    for (let q = 0; q < 200; q++) {
      const qx = rng.range(0, 10240);
      const qy = rng.range(0, 6400);
      const r = rng.range(10, 400);

      const fromHash = new Set(hash.queryRadius(qx, qy, r));
      const brute = new Set<number>();
      const r2 = r * r;
      for (const it of items) {
        const dx = it.x - qx;
        const dy = it.y - qy;
        if (dx * dx + dy * dy <= r2) brute.add(it.id);
      }

      expect(fromHash.size).toBe(brute.size);
      for (const id of brute) expect(fromHash.has(id)).toBe(true);
    }
  });

  it("handles rebuild and reflects moved items", () => {
    const hash = new SpatialHash(50);
    hash.rebuild([{ id: 1, x: 10, y: 10 }]);
    expect(hash.queryRadius(10, 10, 5)).toEqual([1]);
    // Move the item far away and rebuild.
    hash.rebuild([{ id: 1, x: 5000, y: 5000 }]);
    expect(hash.queryRadius(10, 10, 5)).toEqual([]);
    expect(hash.queryRadius(5000, 5000, 5)).toEqual([1]);
  });
});
