import { describe, expect, it } from "vitest";
import {
  createGame,
  publishedStageMaps,
  type GameSnapshot,
  type PlayerSnapshot,
  type RuntimeTile,
} from "./sim";

describe("published simulation integration", () => {
  it("loads all three published maps into the real simulation", () => {
    const game = createGame({ playerCount: 1, maps: publishedStageMaps, seed: 42 });
    expect(publishedStageMaps.map((map) => map.id)).toEqual([1, 2, 3]);
    expect(game.getSnapshot()).toMatchObject({ scene: "playing", stage: 1 });
  });

  it("returns isolated public snapshot copies", () => {
    const game = createGame({ playerCount: 1, maps: publishedStageMaps, seed: 42 });
    const first = game.getSnapshot();
    (first.players as PlayerSnapshot[])[0] = { ...first.players[0], score: 999 };
    (first.terrain as RuntimeTile[][])[0][0] = "brick";
    const second: GameSnapshot = game.getSnapshot();
    expect(second.players[0].score).toBe(0);
    expect(second.terrain[0][0]).toBe(publishedStageMaps[0].cells[0][0]);
  });
});
