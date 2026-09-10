import { describe, expect, it } from "vitest";

import { createGame, STAGE_MAPS } from "./sim";

describe("application simulation integration", () => {
  it("starts the real simulation with the three published maps", () => {
    expect(STAGE_MAPS.map(({ id }) => id)).toEqual([1, 2, 3]);

    const game = createGame({ playerCount: 1, maps: STAGE_MAPS, seed: 42 });
    const initial = game.getSnapshot();
    const advanced = game.tick({
      player1: {
        move: null,
        fireSinglePressed: false,
        fireRapidHeld: false,
        borrowLifePressed: false,
      },
      player2: {
        move: null,
        fireSinglePressed: false,
        fireRapidHeld: false,
        borrowLifePressed: false,
      },
    }).snapshot;

    expect(initial.terrain).toEqual(STAGE_MAPS[0].cells);
    expect(initial).toMatchObject({ stage: 1, tick: 0, enemiesActive: 3, enemiesQueued: 17 });
    expect(advanced.tick).toBe(1);
  });
});
