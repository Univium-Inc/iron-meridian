import { describe, it, expect } from "vitest";
import { generateMap, Tile, type GameMap, type MapSizeId } from "../src";
import { HashWriter } from "../src/sim/hash";

const SIZES: MapSizeId[] = ["small", "medium", "large"];

// Full structural hash of a generated map (tiles, elevation, objectives, cover points).
function hashMap(m: GameMap): number {
  const w = new HashWriter();
  w.uint32(m.w);
  w.uint32(m.h);
  for (let i = 0; i < m.tiles.length; i++) w.byte(m.tiles[i]!);
  for (let i = 0; i < m.elevation.length; i++) w.byte(m.elevation[i]!);
  w.uint32(m.objectives.length);
  for (const o of m.objectives) {
    w.uint32(o.tx);
    w.uint32(o.ty);
    w.byte(o.sector);
  }
  w.uint32(m.coverPoints.length);
  for (const c of m.coverPoints) {
    w.posCm(c.x);
    w.posCm(c.y);
    w.angleByte(c.facing);
  }
  return w.digest();
}

// Count passable-tile connected components via flood fill (4-connected).
function countLandComponents(m: GameMap): { components: number; unreachable: number } {
  const n = m.w * m.h;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let components = 0;
  let firstComponentSize = 0;
  let totalPassable = 0;
  for (let i = 0; i < n; i++) if ((m.tiles[i] as Tile) !== Tile.Water) totalPassable++;

  let largest = 0;
  for (let start = 0; start < n; start++) {
    if (seen[start] || (m.tiles[start] as Tile) === Tile.Water) continue;
    components++;
    let size = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      const cx = cur % m.w;
      const cy = (cur / m.w) | 0;
      const nbrs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const;
      for (const [dx, dy] of nbrs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const ni = ny * m.w + nx;
        if (seen[ni] || (m.tiles[ni] as Tile) === Tile.Water) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    if (components === 1) firstComponentSize = size;
    if (size > largest) largest = size;
  }
  void firstComponentSize;
  return { components, unreachable: totalPassable - largest };
}

describe("map generation", () => {
  it("is deterministic: same seed and size gives an identical map", () => {
    for (const size of SIZES) {
      const a = generateMap(4242, size);
      const b = generateMap(4242, size);
      expect(hashMap(a)).toBe(hashMap(b));
    }
  });

  it("differs by seed", () => {
    for (const size of SIZES) {
      const a = generateMap(1, size);
      const b = generateMap(2, size);
      expect(hashMap(a)).not.toBe(hashMap(b));
    }
  });

  it("produces the requested dimensions and a world in units", () => {
    const large = generateMap(7, "large");
    expect(large.w).toBe(256);
    expect(large.h).toBe(160);
    expect(large.worldW).toBe(256 * 40);
    expect(large.worldH).toBe(160 * 40);
  });

  it("places the expected feature set", () => {
    for (const size of SIZES) {
      const m = generateMap(99, size);
      expect(m.objectives.length).toBeGreaterThanOrEqual(size === "small" ? 4 : 6);
      expect(m.sectors.length).toBeGreaterThanOrEqual(2);
      expect(m.crossings.length).toBeGreaterThanOrEqual(2);
      expect(m.coverPoints.length).toBeGreaterThan(0);
      // Rivers exist (some water) and are bridged (some bridge tiles).
      let water = 0;
      let bridge = 0;
      for (let i = 0; i < m.tiles.length; i++) {
        if ((m.tiles[i] as Tile) === Tile.Water) water++;
        if ((m.tiles[i] as Tile) === Tile.Bridge) bridge++;
      }
      expect(water).toBeGreaterThan(0);
      expect(bridge).toBeGreaterThan(0);
    }
  });

  it("has no unreachable land tiles on any size (across several seeds)", () => {
    for (const size of SIZES) {
      for (const seed of [1, 2, 3, 7, 13, 101, 999]) {
        const m = generateMap(seed, size);
        const { unreachable } = countLandComponents(m);
        expect(unreachable).toBe(0);
      }
    }
  });

  it("objectives sit on passable tiles", () => {
    for (const size of SIZES) {
      const m = generateMap(55, size);
      for (const o of m.objectives) {
        expect((m.tiles[o.ty * m.w + o.tx] as Tile) !== Tile.Water).toBe(true);
      }
    }
  });
});
