import type { Game } from "../sim";

export const TANK_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N",
] as const;
export type TankLetter = (typeof TANK_LETTERS)[number];
export type PlayerChoice = "one" | "two" | "construction";
export type PauseReason = "manual" | "blur" | "controllerDisconnected";

export type AppScene =
  | { readonly type: "tankSelect"; readonly selected: TankLetter }
  | {
      readonly type: "playerSelect";
      readonly tank: TankLetter;
      readonly selected: PlayerChoice;
      readonly message: string | null;
    }
  | {
      readonly type: "game";
      readonly tank: TankLetter;
      readonly playerCount: 1 | 2;
      readonly game: Game;
    }
  | {
      readonly type: "paused";
      readonly tank: TankLetter;
      readonly playerCount: 1 | 2;
      readonly game: Game;
      readonly reason: PauseReason;
    };

const PLAYER_CHOICES: readonly PlayerChoice[] = ["one", "two", "construction"];

export class AppMachine {
  scene: AppScene = { type: "tankSelect", selected: "A" };

  moveMenu(delta: -1 | 1): boolean {
    if (this.scene.type === "tankSelect") {
      const index = TANK_LETTERS.indexOf(this.scene.selected);
      const selected = TANK_LETTERS[wrap(index + delta, TANK_LETTERS.length)];
      this.scene = { type: "tankSelect", selected };
      return true;
    }
    if (this.scene.type === "playerSelect") {
      const index = PLAYER_CHOICES.indexOf(this.scene.selected);
      this.scene = {
        ...this.scene,
        selected: PLAYER_CHOICES[wrap(index + delta, PLAYER_CHOICES.length)],
        message: null,
      };
      return true;
    }
    return false;
  }

  confirm(connectedGamepads: number, createGame: (players: 1 | 2) => Game): "none" | "open" | "start" | "blocked" {
    if (this.scene.type === "tankSelect") {
      this.scene = {
        type: "playerSelect",
        tank: this.scene.selected,
        selected: "one",
        message: null,
      };
      return "open";
    }
    if (this.scene.type !== "playerSelect") return "none";
    if (this.scene.selected === "construction") return "none";
    const playerCount = this.scene.selected === "one" ? 1 : 2;
    if (playerCount === 2 && connectedGamepads < 2) {
      this.scene = { ...this.scene, message: "CONNECT 2 CONTROLLERS" };
      return "blocked";
    }
    this.scene = {
      type: "game",
      tank: this.scene.tank,
      playerCount,
      game: createGame(playerCount),
    };
    return "start";
  }

  pause(reason: PauseReason): boolean {
    if (this.scene.type === "paused") {
      if (reason === "controllerDisconnected" && this.scene.reason !== reason) {
        this.scene = { ...this.scene, reason };
        return true;
      }
      return false;
    }
    if (this.scene.type !== "game") return false;
    this.scene = { ...this.scene, type: "paused", reason };
    return true;
  }

  resume(controllersReady: boolean): boolean {
    if (this.scene.type !== "paused" || !controllersReady) return false;
    const { tank, playerCount, game } = this.scene;
    this.scene = { type: "game", tank, playerCount, game };
    return true;
  }

  returnToTankSelect(): void {
    this.scene = { type: "tankSelect", selected: "A" };
  }
}

function wrap(value: number, length: number): number {
  return (value + length) % length;
}
