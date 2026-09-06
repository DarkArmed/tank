import { describe, expect, it } from "vitest";
import { createGame, type GameSnapshot, type PlayerSnapshot, type RuntimeTile } from "./sim";

describe("temporary simulation integration stub", () => {
  it("returns isolated public snapshot copies", () => {
    const game = createGame({ playerCount: 1, maps: [], seed: 42 });
    const first = game.getSnapshot();
    (first.players as PlayerSnapshot[])[0] = { ...first.players[0], score: 999 };
    (first.terrain as RuntimeTile[][])[0][0] = "brick";
    const second: GameSnapshot = game.getSnapshot();
    expect(second.players[0].score).toBe(0);
    expect(second.terrain[0][0]).toBe("empty");
  });
});
