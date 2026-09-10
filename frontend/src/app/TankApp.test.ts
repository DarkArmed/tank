import { describe, expect, it } from "vitest";
import { startPressedForPlayers } from "./input/activePlayers";
import { EMPTY_GAME_INPUT, type InputFrame } from "./input/types";

const frame = (keyboard: boolean, first: boolean, second: boolean): InputFrame => ({
  menu: { upPressed: false, downPressed: false, confirmPressed: false, selectPressed: false },
  game: EMPTY_GAME_INPUT,
  keyboardStartPressed: keyboard,
  gamepadStartPressed: [first, second],
  connectedGamepads: 2,
  assignedSlots: [true, true],
  disconnectedSlots: [],
  usedGamepadSlots: [],
});

describe("active player pause input", () => {
  it("ignores controller two in a one-player game", () => {
    expect(startPressedForPlayers(frame(false, false, true), 1)).toBe(false);
    expect(startPressedForPlayers(frame(false, true, false), 1)).toBe(true);
    expect(startPressedForPlayers(frame(true, false, false), 1)).toBe(true);
  });

  it("accepts either assigned controller in a two-player game", () => {
    expect(startPressedForPlayers(frame(false, false, true), 2)).toBe(true);
  });
});
