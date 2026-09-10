import type { Direction, GameInput, PlayerInput } from "../sim";
import { DirectionResolver, setPadDirections } from "./direction";
import { GamepadSlots, sampleGamepad } from "./gamepads";
import type { InputFrame, PadSample } from "./types";

const DIRECTION_KEYS: Readonly<Record<string, Direction>> = {
  KeyW: "up",
  KeyD: "right",
  KeyS: "down",
  KeyA: "left",
};

interface DigitalState {
  fireSingle: boolean;
  fireRapid: boolean;
  select: boolean;
  start: boolean;
  up: boolean;
  down: boolean;
}

type EdgeButton = "fireSingle" | "select" | "start";

const EMPTY_DIGITAL = (): DigitalState => ({
  fireSingle: false,
  fireRapid: false,
  select: false,
  start: false,
  up: false,
  down: false,
});

export class InputManager {
  private readonly slots = new GamepadSlots();
  private readonly directions = [new DirectionResolver(), new DirectionResolver()];
  private readonly keyboardHeld = new Set<string>();
  private keyboardPressed = new Set<string>();
  private previousPads: [DigitalState, DigitalState] = [EMPTY_DIGITAL(), EMPTY_DIGITAL()];
  private readonly suppressedPadEdges: [Set<EdgeButton>, Set<EdgeButton>] = [new Set(), new Set()];

  readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!isHandledKey(event.code)) return;
    event.preventDefault();
    if (event.repeat || this.keyboardHeld.has(event.code)) return;
    this.keyboardHeld.add(event.code);
    this.keyboardPressed.add(event.code);
    const direction = DIRECTION_KEYS[event.code];
    if (direction !== undefined) {
      this.directions[0].set(`key:${event.code}`, direction, true);
    }
  };

  readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!isHandledKey(event.code)) return;
    event.preventDefault();
    this.keyboardHeld.delete(event.code);
    const direction = DIRECTION_KEYS[event.code];
    if (direction !== undefined) {
      this.directions[0].set(`key:${event.code}`, direction, false);
    }
  };

  poll(gamepads: readonly (Gamepad | null)[]): InputFrame {
    const samples = gamepads.filter((pad): pad is Gamepad => pad !== null).map(sampleGamepad);
    return this.pollSamples(samples);
  }

  pollSamples(samples: readonly PadSample[]): InputFrame {
    const update = this.slots.update(samples);
    const padEdges = update.slots.map((sample, slot) => this.readPad(slot, sample)) as [
      ReturnType<InputManager["readPad"]>,
      ReturnType<InputManager["readPad"]>,
    ];

    const keySingle = this.keyboardPressed.has("KeyJ");
    const keySelect = this.keyboardPressed.has("KeyU");
    const keyStart = this.keyboardPressed.has("Enter");
    const keyUp = this.keyboardPressed.has("KeyW");
    const keyDown = this.keyboardPressed.has("KeyS");

    const player1: PlayerInput = {
      move: this.directions[0].resolve(),
      fireSinglePressed: keySingle || padEdges[0].singlePressed,
      fireRapidHeld: this.keyboardHeld.has("KeyK") || padEdges[0].rapidHeld,
      borrowLifePressed: keySelect || padEdges[0].selectPressed,
    };
    const player2: PlayerInput = {
      move: this.directions[1].resolve(),
      fireSinglePressed: padEdges[1].singlePressed,
      fireRapidHeld: padEdges[1].rapidHeld,
      borrowLifePressed: padEdges[1].selectPressed,
    };
    const game: GameInput = { player1, player2 };
    const usedGamepadSlots = padEdges.flatMap((edge, index) => (edge.used ? [index] : []));

    this.keyboardPressed = new Set();
    return {
      menu: {
        upPressed: keyUp || padEdges[0].upPressed,
        downPressed: keyDown || padEdges[0].downPressed,
        confirmPressed: keyStart || padEdges[0].startPressed,
        selectPressed: keySelect || padEdges[0].selectPressed,
      },
      game,
      keyboardStartPressed: keyStart,
      gamepadStartPressed: [padEdges[0].startPressed, padEdges[1].startPressed],
      connectedGamepads: samples.length,
      assignedSlots: [update.slots[0] !== null, update.slots[1] !== null],
      disconnectedSlots: update.disconnectedSlots,
      usedGamepadSlots,
    };
  }

  clear(): void {
    this.keyboardHeld.clear();
    this.keyboardPressed.clear();
    for (const direction of this.directions) direction.clear();
    for (let slot = 0; slot < this.previousPads.length; slot += 1) {
      for (const button of ["fireSingle", "select", "start"] as const) {
        if (this.previousPads[slot][button]) this.suppressedPadEdges[slot].add(button);
      }
    }
    this.previousPads = [EMPTY_DIGITAL(), EMPTY_DIGITAL()];
  }

  private readPad(slot: number, sample: PadSample | null) {
    const previous = this.previousPads[slot];
    if (sample === null) {
      this.directions[slot].clearPrefix(`pad${slot}:`);
      this.previousPads[slot] = EMPTY_DIGITAL();
      return {
        singlePressed: false,
        rapidHeld: false,
        selectPressed: false,
        startPressed: false,
        upPressed: false,
        downPressed: false,
        used: false,
      };
    }
    setPadDirections(this.directions[slot], slot, sample.directions);
    const current: DigitalState = {
      fireSingle: sample.fireSingle,
      fireRapid: sample.fireRapid,
      select: sample.select,
      start: sample.start,
      up: sample.directions.up,
      down: sample.directions.down,
    };
    for (const button of ["fireSingle", "select", "start"] as const) {
      if (!current[button]) this.suppressedPadEdges[slot].delete(button);
    }
    const pressedEdge = (button: EdgeButton): boolean =>
      current[button] && !previous[button] && !this.suppressedPadEdges[slot].has(button);
    this.previousPads[slot] = current;
    const directionUsed = Object.values(sample.directions).some(Boolean);
    return {
      singlePressed: pressedEdge("fireSingle"),
      rapidHeld: current.fireRapid,
      selectPressed: pressedEdge("select"),
      startPressed: pressedEdge("start"),
      upPressed: current.up && !previous.up,
      downPressed: current.down && !previous.down,
      used:
        directionUsed || current.fireSingle || current.fireRapid || current.select || current.start,
    };
  }
}

function isHandledKey(code: string): boolean {
  return code in DIRECTION_KEYS || ["KeyJ", "KeyK", "KeyU", "Enter"].includes(code);
}
