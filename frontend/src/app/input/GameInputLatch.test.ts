import { describe, expect, it } from "vitest";
import { FixedStepLoop, TICK_MS } from "../loop/FixedStepLoop";
import type { GameInput } from "../sim";
import { GameInputLatch } from "./GameInputLatch";

const input = (single: boolean, borrow = false): GameInput => ({
  player1: {
    move: null,
    fireSinglePressed: single,
    fireRapidHeld: false,
    borrowLifePressed: borrow,
  },
  player2: {
    move: null,
    fireSinglePressed: false,
    fireRapidHeld: false,
    borrowLifePressed: false,
  },
});

describe("GameInputLatch", () => {
  it("holds pressed edges across a zero-tick render frame", () => {
    const loop = new FixedStepLoop();
    const latch = new GameInputLatch();
    const ticks: GameInput[] = [];
    loop.advance(0, false, () => ticks.push(latch.consumeTick()));

    latch.capture(input(true, true));
    expect(loop.advance(TICK_MS / 2, false, () => ticks.push(latch.consumeTick()))).toBe(0);
    latch.capture(input(false, false));
    expect(loop.advance(TICK_MS, false, () => ticks.push(latch.consumeTick()))).toBe(1);

    expect(ticks[0].player1.fireSinglePressed).toBe(true);
    expect(ticks[0].player1.borrowLifePressed).toBe(true);
  });

  it("delivers a latched edge only to the first catch-up tick", () => {
    const latch = new GameInputLatch();
    latch.capture(input(true));
    expect(latch.consumeTick().player1.fireSinglePressed).toBe(true);
    expect(latch.consumeTick().player1.fireSinglePressed).toBe(false);
  });

  it("uses the latest held state while preserving earlier edges", () => {
    const latch = new GameInputLatch();
    latch.capture(input(true));
    const latest = input(false);
    latest.player1.move = "left";
    latest.player1.fireRapidHeld = true;
    latch.capture(latest);
    const consumed = latch.consumeTick();
    expect(consumed.player1.fireSinglePressed).toBe(true);
    expect(consumed.player1.move).toBe("left");
    expect(consumed.player1.fireRapidHeld).toBe(true);
  });
});
