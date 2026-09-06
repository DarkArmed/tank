import { describe, expect, it } from "vitest";
import { DirectionResolver } from "./direction";
import { GamepadSlots, sampleGamepad } from "./gamepads";
import { InputManager } from "./InputManager";
import type { PadSample } from "./types";

const sample = (index: number, overrides: Partial<PadSample> = {}): PadSample => ({
  index,
  id: `pad-${index}`,
  mapping: "standard",
  directions: { up: false, right: false, down: false, left: false },
  fireSingle: false,
  fireRapid: false,
  select: false,
  start: false,
  ...overrides,
});

describe("DirectionResolver", () => {
  it("uses the most recently pressed held direction", () => {
    const resolver = new DirectionResolver();
    resolver.set("keyboard:up", "up", true);
    resolver.set("keyboard:left", "left", true);
    expect(resolver.resolve()).toBe("left");
    resolver.set("keyboard:left", "left", false);
    expect(resolver.resolve()).toBe("up");
  });
});

describe("GamepadSlots", () => {
  it("assigns by connection order and reports disconnects", () => {
    const slots = new GamepadSlots();
    expect(slots.update([sample(4), sample(2)]).slots.map((pad) => pad?.index)).toEqual([2, 4]);
    const update = slots.update([sample(4)]);
    expect(update.disconnectedSlots).toEqual([0]);
    expect(update.slots.map((pad) => pad?.index ?? null)).toEqual([null, 4]);
  });

  it("lets a replacement device occupy an empty slot", () => {
    const slots = new GamepadSlots();
    slots.update([sample(0)]);
    const replacement = sample(7, { id: "replacement" });
    const update = slots.update([replacement]);
    expect(update.disconnectedSlots).toEqual([0]);
    expect(update.slots[0]?.id).toBe("replacement");
  });
});

describe("InputManager", () => {
  it("ignores keyboard auto-repeat for edge actions", () => {
    const input = new InputManager();
    const event = (code: string, repeat: boolean) => ({
      code,
      repeat,
      preventDefault: () => undefined,
    }) as unknown as KeyboardEvent;
    input.onKeyDown(event("KeyJ", false));
    input.onKeyDown(event("KeyJ", true));
    expect(input.pollSamples([]).game.player1.fireSinglePressed).toBe(true);
    expect(input.pollSamples([]).game.player1.fireSinglePressed).toBe(false);
  });

  it("merges controller one into 1P and assigns controller two only to 2P", () => {
    const input = new InputManager();
    const frame = input.pollSamples([
      sample(0, { directions: { up: true, right: false, down: false, left: false }, fireSingle: true }),
      sample(1, { directions: { up: false, right: true, down: false, left: false }, fireRapid: true }),
    ]);
    expect(frame.game.player1.move).toBe("up");
    expect(frame.game.player1.fireSinglePressed).toBe(true);
    expect(frame.game.player2.move).toBe("right");
    expect(frame.game.player2.fireRapidHeld).toBe(true);
  });

  it("emits gamepad menu and single-fire actions only on their press edge", () => {
    const input = new InputManager();
    const held = sample(0, {
      directions: { up: false, right: false, down: true, left: false },
      fireSingle: true,
      start: true,
    });
    const first = input.pollSamples([held]);
    const second = input.pollSamples([held]);
    expect(first.menu.downPressed).toBe(true);
    expect(first.menu.confirmPressed).toBe(true);
    expect(first.game.player1.fireSinglePressed).toBe(true);
    expect(second.menu.downPressed).toBe(false);
    expect(second.menu.confirmPressed).toBe(false);
    expect(second.game.player1.fireSinglePressed).toBe(false);
  });

  it("does not recreate held gamepad edges after pause input is cleared", () => {
    const input = new InputManager();
    const held = sample(0, { start: true });
    expect(input.pollSamples([held]).gamepadStartPressed[0]).toBe(true);
    input.clear();
    expect(input.pollSamples([held]).gamepadStartPressed[0]).toBe(false);
    input.pollSamples([sample(0)]);
    expect(input.pollSamples([held]).gamepadStartPressed[0]).toBe(true);
  });
});

describe("sampleGamepad", () => {
  const button = (value = 0): GamepadButton => ({ pressed: value > 0.5, touched: false, value });
  const pad = (
    mapping: GamepadMappingType,
    buttons: readonly GamepadButton[],
    axes: readonly number[],
  ): Gamepad => ({
    axes,
    buttons,
    connected: true,
    hapticActuators: [],
    id: "USB FC controller",
    index: 3,
    mapping,
    timestamp: 1,
    vibrationActuator: null,
  } as unknown as Gamepad);

  it("reads standard d-pad and menu buttons", () => {
    const buttons = Array.from({ length: 16 }, () => button());
    buttons[0] = button(1);
    buttons[8] = button(1);
    buttons[9] = button(1);
    buttons[14] = button(1);
    const sampled = sampleGamepad(pad("standard", buttons, [0, 0]));
    expect(sampled.fireSingle).toBe(true);
    expect(sampled.select).toBe(true);
    expect(sampled.start).toBe(true);
    expect(sampled.directions.left).toBe(true);
  });

  it("reads common USB FC axes and four-button fallback", () => {
    const buttons = [button(), button(1), button(1), button(1)];
    const sampled = sampleGamepad(pad("", buttons, [1, -1]));
    expect(sampled.fireRapid).toBe(true);
    expect(sampled.select).toBe(true);
    expect(sampled.start).toBe(true);
    expect(sampled.directions.up).toBe(true);
    expect(sampled.directions.right).toBe(true);
  });
});
