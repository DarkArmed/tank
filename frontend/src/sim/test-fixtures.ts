import type { GameInput, MapTile, StageId, StageMap } from "./types";

export const NO_INPUT: GameInput = {
  player1: { move: null, fireSinglePressed: false, fireRapidHeld: false, borrowLifePressed: false },
  player2: { move: null, fireSinglePressed: false, fireRapidHeld: false, borrowLifePressed: false },
};

export function makeMap(id: StageId, edits: readonly { column: number; row: number; tile: MapTile }[] = []): StageMap {
  const cells: MapTile[][] = Array.from({ length: 26 }, () => Array.from({ length: 26 }, () => "empty" as MapTile));
  for (let row = 24; row <= 25; row += 1) {
    for (let column = 12; column <= 13; column += 1) cells[row][column] = "hq";
  }
  for (const edit of edits) cells[edit.row][edit.column] = edit.tile;
  return {
    id,
    width: 26,
    height: 26,
    cells,
    spawns: {
      player1: { column: 8, row: 22 },
      player2: { column: 16, row: 22 },
      enemies: [{ column: 0, row: 0 }, { column: 12, row: 0 }, { column: 24, row: 0 }],
    },
  };
}

export function makeMaps(edits: readonly { column: number; row: number; tile: MapTile }[] = []): readonly StageMap[] {
  return [makeMap(1, edits), makeMap(2), makeMap(3)];
}
