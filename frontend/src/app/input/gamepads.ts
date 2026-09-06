import type { Direction } from "../sim";
import type { PadSample } from "./types";

interface Slot {
  signature: string | null;
  index: number | null;
}

export interface SlotUpdate {
  readonly slots: readonly [PadSample | null, PadSample | null];
  readonly disconnectedSlots: readonly number[];
}

export class GamepadSlots {
  private readonly state: [Slot, Slot] = [
    { signature: null, index: null },
    { signature: null, index: null },
  ];

  update(samples: readonly PadSample[]): SlotUpdate {
    const remaining = new Map(samples.map((sample) => [sample.index, sample]));
    const assigned: [PadSample | null, PadSample | null] = [null, null];
    const disconnected: number[] = [];

    for (let slot = 0; slot < this.state.length; slot += 1) {
      const previous = this.state[slot];
      if (previous.index === null) continue;
      const sameIndex = remaining.get(previous.index);
      if (sameIndex !== undefined && signatureOf(sameIndex) === previous.signature) {
        assigned[slot] = sameIndex;
        remaining.delete(sameIndex.index);
      } else {
        disconnected.push(slot);
        previous.index = null;
      }
    }

    for (let slot = 0; slot < this.state.length; slot += 1) {
      if (assigned[slot] !== null || this.state[slot].signature === null) continue;
      const match = [...remaining.values()].find(
        (sample) => signatureOf(sample) === this.state[slot].signature,
      );
      if (match !== undefined) {
        assigned[slot] = match;
        this.state[slot].index = match.index;
        remaining.delete(match.index);
      }
    }

    for (let slot = 0; slot < this.state.length; slot += 1) {
      if (assigned[slot] !== null) continue;
      const next = [...remaining.values()].sort((a, b) => a.index - b.index)[0];
      if (next === undefined) break;
      assigned[slot] = next;
      this.state[slot] = { signature: signatureOf(next), index: next.index };
      remaining.delete(next.index);
    }

    return { slots: assigned, disconnectedSlots: disconnected };
  }

  clearCurrentAssignments(): void {
    for (const slot of this.state) slot.index = null;
  }
}

function signatureOf(sample: PadSample): string {
  return `${sample.id}\u0000${sample.mapping}`;
}

function pressed(button: GamepadButton | undefined): boolean {
  return button?.pressed === true || (button?.value ?? 0) > 0.5;
}

function axisNegative(value: number | undefined): boolean {
  return (value ?? 0) < -0.5;
}

function axisPositive(value: number | undefined): boolean {
  return (value ?? 0) > 0.5;
}

export function sampleGamepad(gamepad: Gamepad): PadSample {
  const standard = gamepad.mapping === "standard";
  const directions: Record<Direction, boolean> = {
    up: pressed(gamepad.buttons[12]) || axisNegative(gamepad.axes[1]),
    right: pressed(gamepad.buttons[15]) || axisPositive(gamepad.axes[0]),
    down: pressed(gamepad.buttons[13]) || axisPositive(gamepad.axes[1]),
    left: pressed(gamepad.buttons[14]) || axisNegative(gamepad.axes[0]),
  };

  return {
    index: gamepad.index,
    id: gamepad.id,
    mapping: gamepad.mapping,
    directions,
    fireSingle: pressed(gamepad.buttons[0]),
    fireRapid: pressed(gamepad.buttons[1]),
    select: standard
      ? pressed(gamepad.buttons[8])
      : pressed(gamepad.buttons[2]) || pressed(gamepad.buttons[8]),
    start: standard
      ? pressed(gamepad.buttons[9])
      : pressed(gamepad.buttons[3]) || pressed(gamepad.buttons[9]),
  };
}
