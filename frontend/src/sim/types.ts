export type Direction = "up" | "right" | "down" | "left";
export type PlayerId = 1 | 2;
export type StageId = 1 | 2 | 3;
export type GameScene = "playing" | "stageClear" | "gameOver" | "completed";
export type Team = "player" | "enemy";
export type TankKind = "player" | "normal" | "fast" | "shooter" | "heavy";
export type ItemKind =
  | "star"
  | "gun"
  | "boat"
  | "helmet"
  | "shovel"
  | "life"
  | "clock"
  | "bomb";
export type RuntimeTile =
  | "empty"
  | "brick"
  | "steel"
  | "grass"
  | "ice"
  | "water"
  | "hq";
export type MapTile = RuntimeTile;

export interface PlayerInput {
  move: Direction | null;
  fireSinglePressed: boolean;
  fireRapidHeld: boolean;
  borrowLifePressed: boolean;
}

export interface GameInput {
  player1: PlayerInput;
  player2: PlayerInput;
}

export interface HalfGridPoint {
  column: number;
  row: number;
}

export interface StageSpawns {
  player1: HalfGridPoint;
  player2: HalfGridPoint;
  enemies: readonly [HalfGridPoint, HalfGridPoint, HalfGridPoint];
}

export interface StageMap {
  id: StageId;
  width: 26;
  height: 26;
  cells: readonly (readonly MapTile[])[];
  spawns: StageSpawns;
}

export interface CreateGameOptions {
  playerCount: 1 | 2;
  maps: readonly StageMap[];
  seed: number;
}

export interface PlayerSnapshot {
  id: PlayerId;
  score: number;
  respawnsRemaining: number;
  active: boolean;
  power: number;
  gunCount: 0 | 1 | 2;
  hasBoat: boolean;
  hasGunArmor: boolean;
  canBreakGrass: boolean;
  invincibleTicks: number;
}

export interface TankSnapshot {
  id: number;
  team: Team;
  playerId?: PlayerId;
  kind: TankKind;
  x: number;
  y: number;
  direction: Direction;
  armor: number;
  flashing: boolean;
  redArmor: boolean;
}

export interface BulletSnapshot {
  id: number;
  team: Team;
  ownerId: number;
  x: number;
  y: number;
  direction: Direction;
  canBreakSteel: boolean;
  canBreakGrass: boolean;
}

export interface ItemSnapshot {
  kind: ItemKind;
  column: number;
  row: number;
}

export interface GameSnapshot {
  scene: GameScene;
  stage: StageId;
  tick: number;
  players: readonly PlayerSnapshot[];
  tanks: readonly TankSnapshot[];
  bullets: readonly BulletSnapshot[];
  item: ItemSnapshot | null;
  terrain: readonly (readonly RuntimeTile[])[];
  hqAlive: boolean;
  enemiesQueued: number;
  enemiesActive: number;
  enemiesDestroyed: number;
}

export type SimulationEvent =
  | { type: "shot"; team: Team; tankId: number }
  | { type: "impact"; target: "terrain" | "tank" | "hq" | "bullet" }
  | { type: "explosion"; target: "player" | "enemy" | "hq" }
  | { type: "itemPicked"; playerId: PlayerId; item: ItemKind }
  | { type: "stageClear"; stage: StageId }
  | { type: "gameOver" }
  | { type: "completed" };

export interface TickResult {
  snapshot: GameSnapshot;
  events: readonly SimulationEvent[];
}

export interface Game {
  tick(input: GameInput): TickResult;
  getSnapshot(): GameSnapshot;
}
