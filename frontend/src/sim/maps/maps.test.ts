import { describe, expect, it } from "vitest";

import stage1 from "./stage-1.json";
import stage2 from "./stage-2.json";
import stage3 from "./stage-3.json";

const maps = [stage1, stage2, stage3] as const;
const allowedTiles = new Set([
  "empty",
  "brick",
  "steel",
  "grass",
  "ice",
  "water",
  "hq",
]);
const passableSpawnTiles = new Set(["empty", "grass", "ice"]);
const expectedHqCells = [
  [12, 24],
  [13, 24],
  [12, 25],
  [13, 25],
];

describe("published stage maps", () => {
  it("provides exactly stages 1, 2, and 3 in order", () => {
    expect(maps.map((map) => map.id)).toEqual([1, 2, 3]);
  });

  it.each([...maps])(
    "stage $id satisfies the 26x26 half-grid contract",
    (map) => {
      expect(map.width).toBe(26);
      expect(map.height).toBe(26);
      expect(map.cells).toHaveLength(26);

      for (const row of map.cells) {
        expect(row).toHaveLength(26);
        for (const tile of row) {
          expect(allowedTiles.has(tile)).toBe(true);
        }
      }

      const hqCells = map.cells.flatMap((row, rowIndex) =>
        row.flatMap((tile, columnIndex) =>
          tile === "hq" ? [[columnIndex, rowIndex]] : [],
        ),
      );
      expect(hqCells).toEqual(expectedHqCells);

      const playerSpawns = [map.spawns.player1, map.spawns.player2];
      const enemySpawns = map.spawns.enemies;
      expect(new Set(playerSpawns.map(pointKey)).size).toBe(2);
      expect(new Set(enemySpawns.map(pointKey)).size).toBe(3);

      for (const spawn of [...playerSpawns, ...enemySpawns]) {
        expect(spawn.column).toBeGreaterThanOrEqual(0);
        expect(spawn.row).toBeGreaterThanOrEqual(0);
        expect(spawn.column).toBeLessThanOrEqual(24);
        expect(spawn.row).toBeLessThanOrEqual(24);

        for (let rowOffset = 0; rowOffset < 2; rowOffset += 1) {
          for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
            const tile = map.cells[spawn.row + rowOffset]![
              spawn.column + columnOffset
            ];
            expect(passableSpawnTiles.has(tile)).toBe(true);
          }
        }
      }
    },
  );
});

function pointKey(point: { column: number; row: number }): string {
  return `${point.column},${point.row}`;
}
