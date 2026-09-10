import type { GameInput, PlayerInput } from "../sim";
import { EMPTY_GAME_INPUT } from "./types";

export class GameInputLatch {
  private current: GameInput = EMPTY_GAME_INPUT;
  private player1SinglePressed = false;
  private player1BorrowPressed = false;
  private player2SinglePressed = false;
  private player2BorrowPressed = false;

  capture(input: GameInput): void {
    this.current = input;
    this.player1SinglePressed ||= input.player1.fireSinglePressed;
    this.player1BorrowPressed ||= input.player1.borrowLifePressed;
    this.player2SinglePressed ||= input.player2.fireSinglePressed;
    this.player2BorrowPressed ||= input.player2.borrowLifePressed;
  }

  consumeTick(): GameInput {
    const result: GameInput = {
      player1: withLatchedEdges(
        this.current.player1,
        this.player1SinglePressed,
        this.player1BorrowPressed,
      ),
      player2: withLatchedEdges(
        this.current.player2,
        this.player2SinglePressed,
        this.player2BorrowPressed,
      ),
    };
    this.player1SinglePressed = false;
    this.player1BorrowPressed = false;
    this.player2SinglePressed = false;
    this.player2BorrowPressed = false;
    return result;
  }

  clear(): void {
    this.current = EMPTY_GAME_INPUT;
    this.player1SinglePressed = false;
    this.player1BorrowPressed = false;
    this.player2SinglePressed = false;
    this.player2BorrowPressed = false;
  }
}

function withLatchedEdges(
  current: PlayerInput,
  fireSinglePressed: boolean,
  borrowLifePressed: boolean,
): PlayerInput {
  return {
    ...current,
    fireSinglePressed,
    borrowLifePressed,
  };
}
