import { useEffect, useRef } from "react";
import { PixelAudio } from "./audio/PixelAudio";
import { startPressedForPlayers } from "./input/activePlayers";
import { InputManager } from "./input/InputManager";
import type { InputFrame } from "./input/types";
import { FixedStepLoop } from "./loop/FixedStepLoop";
import { configureCanvas, renderApp, resizeCanvas } from "./renderer/CanvasRenderer";
import { createGame, type GameInput, type PlayerInput } from "./sim";
import { AppMachine } from "./state/AppMachine";

export function TankApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = configureCanvas(canvas);
    const machine = new AppMachine();
    const input = new InputManager();
    const loop = new FixedStepLoop();
    const audio = new PixelAudio();
    const activeControllerSlots = new Set<number>();
    let animationFrame = 0;

    const resize = (): void => {
      resizeCanvas(canvas, window.innerWidth, window.innerHeight);
      renderApp(context, machine.scene);
    };

    const pauseForBlur = (): void => {
      if (machine.pause("blur")) audio.playUi("pause");
      input.clear();
      loop.reset();
      renderApp(context, machine.scene);
    };

    const unlockAudio = (): void => audio.unlock();

    const frame = (now: number): void => {
      const currentInput = input.poll(readGamepads());
      const sceneAtStart = machine.scene;

      if (sceneAtStart.type === "tankSelect" || sceneAtStart.type === "playerSelect") {
        handleMenu(machine, currentInput, audio, activeControllerSlots);
        loop.advance(now, true, () => undefined);
      } else {
        for (const slot of currentInput.usedGamepadSlots) {
          if (slot === 0 || sceneAtStart.playerCount === 2) activeControllerSlots.add(slot);
        }
        const controllerLost = currentInput.disconnectedSlots.some((slot) => activeControllerSlots.has(slot));
        if (controllerLost) {
          machine.pause("controllerDisconnected");
          input.clear();
        }

        if (machine.scene.type === "game") {
          if (startPressedForPlayers(currentInput, machine.scene.playerCount)) {
            machine.pause("manual");
            input.clear();
            audio.playUi("pause");
          } else {
            let firstTick = true;
            loop.advance(now, false, () => {
              if (machine.scene.type !== "game") return;
              const result = machine.scene.game.tick(
                firstTick ? currentInput.game : withoutPressedEdges(currentInput.game),
              );
              firstTick = false;
              audio.consume(result.events);
            });
          }
        } else if (machine.scene.type === "paused") {
          loop.advance(now, true, () => undefined);
          if (
            startPressedForPlayers(currentInput, machine.scene.playerCount) &&
            controllersReady(currentInput, activeControllerSlots)
          ) {
            machine.resume(true);
            input.clear();
            loop.reset(now);
            audio.playUi("confirm");
          }
        }
      }

      renderApp(context, machine.scene);
      animationFrame = requestAnimationFrame(frame);
    };

    window.addEventListener("keydown", input.onKeyDown, { passive: false });
    window.addEventListener("keyup", input.onKeyUp, { passive: false });
    window.addEventListener("keydown", unlockAudio, { capture: true });
    window.addEventListener("pointerdown", unlockAudio, { capture: true });
    window.addEventListener("blur", pauseForBlur);
    window.addEventListener("resize", resize);
    resize();
    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", input.onKeyDown);
      window.removeEventListener("keyup", input.onKeyUp);
      window.removeEventListener("keydown", unlockAudio, { capture: true });
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("blur", pauseForBlur);
      window.removeEventListener("resize", resize);
      audio.close();
      input.clear();
    };
  }, []);

  return (
    <main className="game-shell" aria-label="烟山 90 坦克浏览器复刻">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        width={256}
        height={240}
        aria-label="游戏画面。键盘使用 W A S D 移动，J 单发，K 连发，U 选择或借命，Enter 确认或暂停。"
        onPointerDown={(event) => event.currentTarget.focus()}
        tabIndex={0}
      />
    </main>
  );
}

function handleMenu(
  machine: AppMachine,
  input: InputFrame,
  audio: PixelAudio,
  activeControllerSlots: Set<number>,
): void {
  if (input.menu.upPressed !== input.menu.downPressed) {
    machine.moveMenu(input.menu.upPressed ? -1 : 1);
    audio.playUi("move");
  }
  // SELECT is deliberately recognized by the input adapter and ignored here
  // while the 01>14 milestone is the only available group.
  if (!input.menu.confirmPressed) return;
  const result = machine.confirm(input.connectedGamepads, (playerCount) => createGame({
    playerCount,
    maps: [],
    seed: createSeed(),
  }));
  if (result === "start") {
    activeControllerSlots.clear();
    if (machine.scene.type === "game") {
      const { playerCount } = machine.scene;
      if (playerCount === 2) {
        activeControllerSlots.add(0);
        activeControllerSlots.add(1);
      }
      for (const slot of input.usedGamepadSlots) {
        if (slot === 0 || playerCount === 2) activeControllerSlots.add(slot);
      }
    }
    audio.playUi("confirm");
  } else if (result === "open") {
    audio.playUi("confirm");
  } else if (result === "blocked") {
    audio.playUi("blocked");
  }
}

function controllersReady(input: InputFrame, activeSlots: ReadonlySet<number>): boolean {
  return [...activeSlots].every((slot) => input.assignedSlots[slot] === true);
}

function withoutPressedEdges(input: GameInput): GameInput {
  return {
    player1: withoutPlayerEdges(input.player1),
    player2: withoutPlayerEdges(input.player2),
  };
}

function withoutPlayerEdges(input: PlayerInput): PlayerInput {
  return {
    ...input,
    fireSinglePressed: false,
    borrowLifePressed: false,
  };
}

function readGamepads(): readonly (Gamepad | null)[] {
  try {
    return navigator.getGamepads?.() ?? [];
  } catch {
    return [];
  }
}

function createSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Date.now() >>> 0;
  }
}
