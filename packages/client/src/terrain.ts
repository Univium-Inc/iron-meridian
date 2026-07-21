// Terrain baking for the client.
//
// The map is baked once to an offscreen canvas (a few pixels per tile) and then blitted
// scaled to the viewport. This keeps rendering cheap on Large (256x160 tiles) without a
// per-frame per-tile loop. Real per-chunk baking at world resolution with camera and
// zoom arrives with the renderer work in M3 and the perf pass in M7; M1 shows a fitted
// overview to prove generation.

import { Elevation, Tile, type GameMap } from "@iron/shared";

// Palette derived from the mockup (reference/iron-meridian.html).
const TILE_COLOR: Record<number, string> = {
  [Tile.Grass]: "#4a6a44",
  [Tile.Forest]: "#2f5033",
  [Tile.Town]: "#7d7466",
  [Tile.Road]: "#655e49",
  [Tile.Water]: "#2b5a84",
  [Tile.Bridge]: "#6e5638",
};

const PX_PER_TILE = 4;

export interface BakedTerrain {
  canvas: HTMLCanvasElement;
  pxPerTile: number;
}

export function bakeTerrain(map: GameMap): BakedTerrain {
  const canvas = document.createElement("canvas");
  canvas.width = map.w * PX_PER_TILE;
  canvas.height = map.h * PX_PER_TILE;
  const g = canvas.getContext("2d")!;

  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const i = ty * map.w + tx;
      const t = map.tiles[i]!;
      g.fillStyle = TILE_COLOR[t] ?? "#000";
      g.fillRect(tx * PX_PER_TILE, ty * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE);
      // Elevation highlight: plateau and ridge read as raised ground.
      const e = map.elevation[i]!;
      if (t !== Tile.Water && e !== Elevation.Lowland) {
        g.fillStyle =
          e === Elevation.Ridge ? "rgba(232,220,180,0.20)" : "rgba(220,220,200,0.10)";
        g.fillRect(tx * PX_PER_TILE, ty * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE);
      }
    }
  }

  return { canvas, pxPerTile: PX_PER_TILE };
}
