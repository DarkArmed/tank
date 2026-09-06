import type { InputFrame } from "./types";

export function startPressedForPlayers(input: InputFrame, playerCount: 1 | 2): boolean {
  return input.keyboardStartPressed || input.gamepadStartPressed[0] ||
    (playerCount === 2 && input.gamepadStartPressed[1]);
}
