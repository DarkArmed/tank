import type { AppScene, PauseReason } from "../state/AppMachine";
import { TANK_LETTERS } from "../state/AppMachine";
import type {
  Direction,
  GameSnapshot,
  ItemKind,
  RuntimeTile,
  TankSnapshot,
} from "../sim";
import { drawText, measureText } from "./bitmapFont";

export const FRAME_WIDTH = 256;
export const FRAME_HEIGHT = 240;
const FIELD_SIZE = 208;
const FIELD_Y = 16;

const COLORS = {
  black: "#0b0a0f",
  nearBlack: "#17141f",
  cream: "#f4e6a2",
  white: "#fff6d6",
  gray: "#8c8793",
  darkGray: "#514c58",
  orange: "#e57a32",
  red: "#d84838",
  yellow: "#f2c84b",
  green: "#589642",
  water: "#315d9b",
  ice: "#9bd4d3",
  player1: "#f2c84b",
  player2: "#6bc5e8",
  enemy: "#d95b4f",
} as const;

export function configureCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas 2D is unavailable");
  context.imageSmoothingEnabled = false;
  return context;
}

export function integerScale(viewportWidth: number, viewportHeight: number): number {
  return Math.max(1, Math.floor(Math.min(viewportWidth / FRAME_WIDTH, viewportHeight / FRAME_HEIGHT)));
}

export function resizeCanvas(canvas: HTMLCanvasElement, viewportWidth: number, viewportHeight: number): number {
  const scale = integerScale(viewportWidth, viewportHeight);
  canvas.style.width = `${FRAME_WIDTH * scale}px`;
  canvas.style.height = `${FRAME_HEIGHT * scale}px`;
  return scale;
}

export function renderApp(context: CanvasRenderingContext2D, scene: AppScene): void {
  context.fillStyle = COLORS.black;
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  if (scene.type === "tankSelect") {
    renderTankSelect(context, scene.selected);
  } else if (scene.type === "playerSelect") {
    renderPlayerSelect(context, scene.tank, scene.selected, scene.message);
  } else {
    renderGame(context, scene.game.getSnapshot());
    if (scene.type === "paused") renderPause(context, scene.reason);
  }
}

function renderTankSelect(context: CanvasRenderingContext2D, selected: string): void {
  drawCentered(context, "01→14", 18, COLORS.orange, 2);
  drawCentered(context, "SELECT TANK", 42, COLORS.cream, 1);
  TANK_LETTERS.forEach((letter, index) => {
    const column = index < 7 ? 0 : 1;
    const row = index % 7;
    const x = 43 + column * 112;
    const y = 70 + row * 20;
    drawText(context, letter === selected ? ">" : " ", x - 12, y, COLORS.yellow);
    drawText(context, `TANK ${letter}`, x, y, letter === selected ? COLORS.white : COLORS.gray);
  });
  drawCentered(context, "W S  SELECT   ENTER  START", 220, COLORS.darkGray);
}

function renderPlayerSelect(
  context: CanvasRenderingContext2D,
  tank: string,
  selected: "one" | "two" | "construction",
  message: string | null,
): void {
  drawCentered(context, `TANK ${tank}`, 38, COLORS.orange, 2);
  const options = [
    ["one", "1 PLAYER"],
    ["two", "2 PLAYERS"],
    ["construction", "CONSTRUCTION"],
  ] as const;
  options.forEach(([value, label], index) => {
    const y = 94 + index * 28;
    drawText(context, selected === value ? ">" : " ", 51, y, COLORS.yellow);
    drawText(context, label, 71, y, selected === value ? COLORS.white : COLORS.gray);
  });
  if (message !== null) drawCentered(context, message, 194, COLORS.red);
  drawCentered(context, "ENTER  START", 220, COLORS.darkGray);
}

function renderGame(context: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
  context.fillStyle = COLORS.nearBlack;
  context.fillRect(0, 0, FIELD_SIZE, FRAME_HEIGHT);
  for (let row = 0; row < 26; row += 1) {
    for (let column = 0; column < 26; column += 1) {
      const tile = snapshot.terrain[row]?.[column] ?? "empty";
      drawGround(context, tile, column * 8, FIELD_Y + row * 8);
    }
  }
  for (let row = 0; row < 26; row += 1) {
    for (let column = 0; column < 26; column += 1) {
      const tile = snapshot.terrain[row]?.[column] ?? "empty";
      if (tile !== "grass") {
        drawSolidTerrain(context, tile, column * 8, FIELD_Y + row * 8, snapshot.hqAlive);
      }
    }
  }
  if (snapshot.item !== null) drawItem(context, snapshot.item.kind, snapshot.item.column * 8, FIELD_Y + snapshot.item.row * 8);
  for (const tank of snapshot.tanks) drawTank(context, tank, tank.x, FIELD_Y + tank.y);
  for (const bullet of snapshot.bullets) {
    context.fillStyle = bullet.team === "player" ? COLORS.white : COLORS.red;
    context.fillRect(Math.round(bullet.x), FIELD_Y + Math.round(bullet.y), 4, 4);
  }
  for (const player of snapshot.players) {
    if (player.invincibleTicks > 0 && snapshot.tick % 8 < 4) {
      const tank = snapshot.tanks.find((candidate) => candidate.playerId === player.id);
      if (tank !== undefined) {
        context.strokeStyle = COLORS.white;
        context.strokeRect(Math.round(tank.x) - 1, FIELD_Y + Math.round(tank.y) - 1, 18, 18);
      }
    }
  }
  for (let row = 0; row < 26; row += 1) {
    for (let column = 0; column < 26; column += 1) {
      if (snapshot.terrain[row]?.[column] === "grass") drawGrass(context, column * 8, FIELD_Y + row * 8);
    }
  }
  renderHud(context, snapshot);
  if (snapshot.scene !== "playing") renderScenePrompt(context, snapshot);
}

function drawGround(context: CanvasRenderingContext2D, tile: RuntimeTile, x: number, y: number): void {
  context.fillStyle = tile === "ice" ? COLORS.ice : COLORS.nearBlack;
  context.fillRect(x, y, 8, 8);
  if (tile === "ice") {
    context.fillStyle = "#d9ffff";
    context.fillRect(x + 1, y + 1, 4, 1);
    context.fillRect(x + 5, y + 5, 2, 1);
  }
}

function drawSolidTerrain(
  context: CanvasRenderingContext2D,
  tile: RuntimeTile,
  x: number,
  y: number,
  hqAlive: boolean,
): void {
  if (tile === "brick") {
    context.fillStyle = COLORS.orange;
    context.fillRect(x, y, 8, 8);
    context.fillStyle = "#7d3526";
    context.fillRect(x, y + 3, 8, 1);
    context.fillRect(x + 3, y, 1, 3);
    context.fillRect(x + 5, y + 4, 1, 4);
  } else if (tile === "steel") {
    context.fillStyle = COLORS.gray;
    context.fillRect(x, y, 8, 8);
    context.fillStyle = "#d7d2d7";
    context.fillRect(x + 1, y + 1, 5, 1);
    context.fillRect(x + 1, y + 1, 1, 5);
    context.fillStyle = "#38333d";
    context.fillRect(x + 6, y + 2, 1, 5);
    context.fillRect(x + 2, y + 6, 5, 1);
  } else if (tile === "water") {
    context.fillStyle = COLORS.water;
    context.fillRect(x, y, 8, 8);
    context.fillStyle = "#6c9bd0";
    context.fillRect(x + 1, y + 2, 5, 1);
    context.fillRect(x + 3, y + 6, 4, 1);
  } else if (tile === "hq") {
    context.fillStyle = hqAlive ? COLORS.cream : COLORS.red;
    context.fillRect(x + 1, y + 1, 6, 6);
    context.fillStyle = COLORS.black;
    if (hqAlive) {
      context.fillRect(x + 3, y + 3, 2, 4);
    } else {
      context.fillRect(x + 2, y + 2, 2, 2);
      context.fillRect(x + 5, y + 5, 2, 2);
    }
  }
}

function drawGrass(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = COLORS.green;
  context.fillRect(x + 1, y, 2, 6);
  context.fillRect(x + 5, y + 2, 2, 6);
  context.fillStyle = "#82bc52";
  context.fillRect(x + 2, y + 2, 1, 5);
  context.fillRect(x + 4, y, 1, 7);
}

function drawTank(context: CanvasRenderingContext2D, tank: TankSnapshot, rawX: number, rawY: number): void {
  const x = Math.round(rawX);
  const y = Math.round(rawY);
  const color = tank.playerId === 1 ? COLORS.player1 : tank.playerId === 2 ? COLORS.player2 : COLORS.enemy;
  context.fillStyle = color;
  context.fillRect(x, y + 1, 4, 14);
  context.fillRect(x + 12, y + 1, 4, 14);
  context.fillRect(x + 4, y + 3, 8, 10);
  context.fillStyle = tank.redArmor ? COLORS.white : COLORS.black;
  context.fillRect(x + 6, y + 5, 4, 4);
  drawBarrel(context, tank.direction, x, y, color);
  if (tank.flashing && tank.id % 2 === 0) {
    context.fillStyle = COLORS.white;
    context.fillRect(x + 1, y + 2, 2, 2);
  }
}

function drawBarrel(context: CanvasRenderingContext2D, direction: Direction, x: number, y: number, color: string): void {
  context.fillStyle = color;
  if (direction === "up") context.fillRect(x + 7, y, 2, 7);
  else if (direction === "down") context.fillRect(x + 7, y + 9, 2, 7);
  else if (direction === "left") context.fillRect(x, y + 7, 7, 2);
  else context.fillRect(x + 9, y + 7, 7, 2);
}

function drawItem(context: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number): void {
  const labels: Record<ItemKind, string> = {
    star: "S", gun: "G", boat: "B", helmet: "H", shovel: "V", life: "1", clock: "C", bomb: "X",
  };
  context.fillStyle = COLORS.white;
  context.fillRect(x, y, 16, 16);
  context.fillStyle = COLORS.red;
  context.fillRect(x + 2, y + 2, 12, 12);
  drawText(context, labels[kind], x + 5, y + 5, COLORS.white);
}

function renderHud(context: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
  context.fillStyle = "#d8d1bd";
  context.fillRect(208, 0, 48, 240);
  drawText(context, "ST", 216, 14, COLORS.black);
  drawText(context, String(snapshot.stage), 237, 14, COLORS.red);
  snapshot.players.forEach((player, index) => {
    const y = 46 + index * 38;
    drawText(context, `${player.id}P`, 214, y, index === 0 ? "#835c12" : "#176282");
    drawText(context, String(player.score).padStart(5, "0"), 214, y + 10, COLORS.black);
    drawText(context, `L ${player.respawnsRemaining}`, 214, y + 20, COLORS.black);
  });
  drawText(context, "ENEMY", 212, 137, COLORS.black);
  drawText(context, String(snapshot.enemiesQueued + snapshot.enemiesActive).padStart(2, "0"), 224, 149, COLORS.red, 2);
  drawText(context, "KILL", 214, 179, COLORS.black);
  drawText(context, String(snapshot.enemiesDestroyed).padStart(2, "0"), 222, 191, COLORS.black, 2);
}

function renderScenePrompt(context: CanvasRenderingContext2D, snapshot: GameSnapshot): void {
  if (snapshot.scene === "playing") return;
  const labels = { stageClear: "STAGE CLEAR", gameOver: "GAME OVER", completed: "ALL CLEAR" } as const;
  context.fillStyle = "#09080dcc";
  context.fillRect(20, 102, 168, 32);
  drawCenteredIn(context, labels[snapshot.scene], 20, 188, 113, snapshot.scene === "gameOver" ? COLORS.red : COLORS.white);
}

function renderPause(context: CanvasRenderingContext2D, reason: PauseReason): void {
  const message = reason === "controllerDisconnected" ? "RECONNECT CONTROLLER" : reason === "blur" ? "WINDOW PAUSED" : "PAUSED";
  context.fillStyle = "#09080de6";
  context.fillRect(12, 91, 184, 57);
  drawCenteredIn(context, message, 12, 196, 102, COLORS.yellow);
  drawCenteredIn(context, "PRESS START", 12, 196, 126, COLORS.white);
}

function drawCentered(context: CanvasRenderingContext2D, text: string, y: number, color: string, scale = 1): void {
  drawText(context, text, Math.floor((FRAME_WIDTH - measureText(text, scale)) / 2), y, color, scale);
}

function drawCenteredIn(context: CanvasRenderingContext2D, text: string, left: number, right: number, y: number, color: string): void {
  drawText(context, text, Math.floor(left + (right - left - measureText(text)) / 2), y, color);
}
