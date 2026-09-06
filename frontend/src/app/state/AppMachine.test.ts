import { describe, expect, it } from "vitest";
import type { Game } from "../sim";
import { createGame, publishedStageMaps } from "../sim";
import { AppMachine } from "./AppMachine";

const factory = (players: 1 | 2): Game => createGame({ playerCount: players, maps: publishedStageMaps, seed: 1 });

describe("AppMachine menus", () => {
  it("wraps through all TANK A-N choices", () => {
    const machine = new AppMachine();
    machine.moveMenu(-1);
    expect(machine.scene).toEqual({ type: "tankSelect", selected: "N" });
    machine.moveMenu(1);
    expect(machine.scene).toEqual({ type: "tankSelect", selected: "A" });
  });

  it("opens player select and leaves CONSTRUCTION confirmation inert", () => {
    const machine = new AppMachine();
    expect(machine.confirm(0, factory)).toBe("open");
    machine.moveMenu(1);
    machine.moveMenu(1);
    const before = machine.scene;
    expect(machine.confirm(2, factory)).toBe("none");
    expect(machine.scene).toEqual(before);
  });

  it("blocks two player start without two controllers", () => {
    const machine = new AppMachine();
    machine.confirm(0, factory);
    machine.moveMenu(1);
    expect(machine.confirm(1, factory)).toBe("blocked");
    expect(machine.scene.type).toBe("playerSelect");
    if (machine.scene.type === "playerSelect") {
      expect(machine.scene.message).toBe("CONNECT 2 CONTROLLERS");
    }
  });

  it("starts two player play and supports pause/resume gating", () => {
    const machine = new AppMachine();
    machine.confirm(0, factory);
    machine.moveMenu(1);
    expect(machine.confirm(2, factory)).toBe("start");
    expect(machine.scene.type).toBe("game");
    expect(machine.pause("controllerDisconnected")).toBe(true);
    expect(machine.resume(false)).toBe(false);
    expect(machine.resume(true)).toBe(true);
  });

  it("changes an existing manual pause into a disconnect pause", () => {
    const machine = new AppMachine();
    machine.confirm(0, factory);
    machine.confirm(0, factory);
    machine.pause("manual");
    expect(machine.pause("controllerDisconnected")).toBe(true);
    expect(machine.scene.type).toBe("paused");
    if (machine.scene.type === "paused") {
      expect(machine.scene.reason).toBe("controllerDisconnected");
    }
  });
});
