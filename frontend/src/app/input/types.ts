import type { Direction, GameInput } from "../sim";

export interface MenuActions {
  readonly upPressed: boolean;
  readonly downPressed: boolean;
  readonly confirmPressed: boolean;
  readonly selectPressed: boolean;
}

export interface InputFrame {
  readonly menu: MenuActions;
  readonly game: GameInput;
  readonly keyboardStartPressed: boolean;
  readonly gamepadStartPressed: readonly [boolean, boolean];
  readonly connectedGamepads: number;
  readonly assignedSlots: readonly [boolean, boolean];
  readonly disconnectedSlots: readonly number[];
  readonly usedGamepadSlots: readonly number[];
}

export interface PadSample {
  readonly index: number;
  readonly id: string;
  readonly mapping: GamepadMappingType;
  readonly directions: Readonly<Record<Direction, boolean>>;
  readonly fireSingle: boolean;
  readonly fireRapid: boolean;
  readonly select: boolean;
  readonly start: boolean;
}

export const EMPTY_GAME_INPUT: GameInput = {
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
};
