import { CONFIG } from "./constants";
import type { HalfGridPoint, MapTile, StageId, StageMap } from "./types";

const TILES = new Set<MapTile>(["empty", "brick", "steel", "grass", "ice", "water", "hq"]);
const PASSABLE_SPAWN_TILES = new Set<MapTile>(["empty", "grass", "ice"]);

function fail(stage: number, field: string, detail: string): never {
  throw new Error(`stage ${stage} ${field}: ${detail}`);
}

function validatePoint(stage: number, field: string, point: HalfGridPoint, cells: readonly (readonly MapTile[])[]): void {
  if (!point || !Number.isInteger(point.column) || !Number.isInteger(point.row)) {
    fail(stage, field, "column and row must be integers");
  }
  const lastSpawnOrigin = CONFIG.fieldHalfTiles - 2;
  if (point.column < 0 || point.column > lastSpawnOrigin || point.row < 0 || point.row > lastSpawnOrigin) {
    fail(stage, field, "16x16 spawn must fit inside the 26x26 map");
  }
  for (let row = point.row; row < point.row + 2; row += 1) {
    for (let column = point.column; column < point.column + 2; column += 1) {
      if (!PASSABLE_SPAWN_TILES.has(cells[row][column])) {
        fail(stage, field, `spawn covers non-passable cell (${column}, ${row})`);
      }
    }
  }
}

export function validateStageMaps(maps: readonly StageMap[]): void {
  if (maps.length !== 3) {
    throw new Error(`maps: expected exactly stages 1, 2, and 3; received ${maps.length}`);
  }

  const ids = new Set<number>();
  for (const map of maps) {
    const stage = Number(map?.id ?? 0);
    if (stage !== 1 && stage !== 2 && stage !== 3) {
      fail(stage, "id", "must be 1, 2, or 3");
    }
    if (ids.has(stage)) {
      fail(stage, "id", "is duplicated");
    }
    ids.add(stage);
    if (map.width !== CONFIG.fieldHalfTiles || map.height !== CONFIG.fieldHalfTiles) {
      fail(stage, "dimensions", `expected 26x26, received ${map.width}x${map.height}`);
    }
    if (!Array.isArray(map.cells) || map.cells.length !== CONFIG.fieldHalfTiles) {
      fail(stage, "cells", "must contain exactly 26 rows");
    }
    map.cells.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== CONFIG.fieldHalfTiles) {
        fail(stage, `cells[${rowIndex}]`, "must contain exactly 26 tiles");
      }
      (row as readonly MapTile[]).forEach((tile: MapTile, columnIndex: number) => {
        if (!TILES.has(tile)) {
          fail(stage, `cells[${rowIndex}][${columnIndex}]`, `unknown tile ${String(tile)}`);
        }
      });
    });

    const hqCells: string[] = [];
    map.cells.forEach((row: readonly MapTile[], rowIndex: number) => row.forEach((tile: MapTile, columnIndex: number) => {
      if (tile === "hq") hqCells.push(`${columnIndex},${rowIndex}`);
    }));
    const expectedHq = new Set<string>();
    for (let row = CONFIG.hq.row; row < CONFIG.hq.row + CONFIG.hq.halfTileHeight; row += 1) {
      for (let column = CONFIG.hq.column; column < CONFIG.hq.column + CONFIG.hq.halfTileWidth; column += 1) {
        expectedHq.add(`${column},${row}`);
      }
    }
    if (hqCells.length !== 4 || hqCells.some((cell) => !expectedHq.has(cell))) {
      fail(stage, "cells", "hq must be the 2x2 half-grid area at columns 12-13 and rows 24-25");
    }

    if (!map.spawns || !Array.isArray(map.spawns.enemies) || map.spawns.enemies.length !== 3) {
      fail(stage, "spawns.enemies", "must contain exactly three points");
    }
    validatePoint(stage, "spawns.player1", map.spawns.player1, map.cells);
    validatePoint(stage, "spawns.player2", map.spawns.player2, map.cells);
    map.spawns.enemies.forEach((point, index) => validatePoint(stage, `spawns.enemies[${index}]`, point, map.cells));

    const playerKeys = [map.spawns.player1, map.spawns.player2].map((point) => `${point.column},${point.row}`);
    if (new Set(playerKeys).size !== playerKeys.length) {
      fail(stage, "spawns", "player spawn points must be distinct");
    }
    const enemyKeys = map.spawns.enemies.map((point) => `${point.column},${point.row}`);
    if (new Set(enemyKeys).size !== enemyKeys.length) {
      fail(stage, "spawns.enemies", "enemy spawn points must be distinct");
    }
  }

  for (const expected of [1, 2, 3] as const satisfies readonly StageId[]) {
    if (!ids.has(expected)) fail(expected, "id", "stage is missing");
  }
}
