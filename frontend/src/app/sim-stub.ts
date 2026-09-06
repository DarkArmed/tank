// Temporary t002-only integration stub. Delete this module and import the
// identical public contract from ../sim once t001 and t003 are integrated.
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

export interface HalfGridPoint {
  readonly column: number;
  readonly row: number;
}

export interface StageSpawns {
  readonly player1: HalfGridPoint;
  readonly player2: HalfGridPoint;
  readonly enemies: readonly [HalfGridPoint, HalfGridPoint, HalfGridPoint];
}

export interface StageMap {
  readonly id: StageId;
  readonly width: 26;
  readonly height: 26;
  readonly cells: readonly (readonly MapTile[])[];
  readonly spawns: StageSpawns;
}

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

export interface CreateGameOptions {
  readonly playerCount: 1 | 2;
  readonly maps: readonly StageMap[];
  readonly seed: number;
}

export interface PlayerSnapshot {
  readonly id: PlayerId;
  readonly score: number;
  readonly respawnsRemaining: number;
  readonly active: boolean;
  readonly power: number;
  readonly gunCount: 0 | 1 | 2;
  readonly hasBoat: boolean;
  readonly hasGunArmor: boolean;
  readonly canBreakGrass: boolean;
  readonly invincibleTicks: number;
}

export interface TankSnapshot {
  readonly id: number;
  readonly team: Team;
  readonly playerId?: PlayerId;
  readonly kind: TankKind;
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly armor: number;
  readonly flashing: boolean;
  readonly redArmor: boolean;
}

export interface BulletSnapshot {
  readonly id: number;
  readonly team: Team;
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly canBreakSteel: boolean;
  readonly canBreakGrass: boolean;
}

export interface ItemSnapshot {
  readonly kind: ItemKind;
  readonly column: number;
  readonly row: number;
}

export interface GameSnapshot {
  readonly scene: GameScene;
  readonly stage: StageId;
  readonly tick: number;
  readonly players: readonly PlayerSnapshot[];
  readonly tanks: readonly TankSnapshot[];
  readonly bullets: readonly BulletSnapshot[];
  readonly item: ItemSnapshot | null;
  readonly terrain: readonly (readonly RuntimeTile[])[];
  readonly hqAlive: boolean;
  readonly enemiesQueued: number;
  readonly enemiesActive: number;
  readonly enemiesDestroyed: number;
}

export type SimulationEvent =
  | { readonly type: "shot"; readonly team: Team; readonly tankId: number }
  | { readonly type: "impact"; readonly target: "terrain" | "tank" | "hq" | "bullet" }
  | { readonly type: "explosion"; readonly target: "player" | "enemy" | "hq" }
  | { readonly type: "itemPicked"; readonly playerId: PlayerId; readonly item: ItemKind }
  | { readonly type: "stageClear"; readonly stage: StageId }
  | { readonly type: "gameOver" }
  | { readonly type: "completed" };

export interface TickResult {
  readonly snapshot: GameSnapshot;
  readonly events: readonly SimulationEvent[];
}

export interface Game {
  tick(input: GameInput): TickResult;
  getSnapshot(): GameSnapshot;
}

const EMPTY_TERRAIN: readonly (readonly RuntimeTile[])[] = Array.from(
  { length: 26 },
  () => Array.from({ length: 26 }, () => "empty" as const),
);

export function createGame(options: CreateGameOptions): Game {
  const { playerCount } = options;
  let tick = 0;
  const players: readonly PlayerSnapshot[] = Array.from(
    { length: playerCount },
    (_, index) => ({
      id: (index + 1) as PlayerId,
      score: 0,
      respawnsRemaining: 3,
      active: true,
      power: 2,
      gunCount: 0,
      hasBoat: false,
      hasGunArmor: false,
      canBreakGrass: false,
      invincibleTicks: 0,
    }),
  );

  const snapshot = (): GameSnapshot => ({
    scene: "playing",
    stage: 1,
    tick,
    players: players.map((player) => ({ ...player })),
    tanks: players.map((player, index) => ({
      id: index + 1,
      team: "player",
      playerId: player.id,
      kind: "player",
      x: index === 0 ? 80 : 112,
      y: 184,
      direction: "up",
      armor: 0,
      flashing: false,
      redArmor: false,
    })),
    bullets: [],
    item: null,
    terrain: EMPTY_TERRAIN.map((row) => [...row]),
    hqAlive: true,
    enemiesQueued: 20,
    enemiesActive: 0,
    enemiesDestroyed: 0,
  });

  return {
    tick: (_input) => {
      tick += 1;
      return { snapshot: snapshot(), events: [] };
    },
    getSnapshot: snapshot,
  };
}
