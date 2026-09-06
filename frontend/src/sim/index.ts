import { Simulation } from "./game";
import type { CreateGameOptions, Game } from "./types";

export type {
  BulletSnapshot,
  CreateGameOptions,
  Direction,
  Game,
  GameInput,
  GameScene,
  GameSnapshot,
  HalfGridPoint,
  ItemKind,
  ItemSnapshot,
  MapTile,
  PlayerId,
  PlayerInput,
  PlayerSnapshot,
  RuntimeTile,
  SimulationEvent,
  StageId,
  StageMap,
  StageSpawns,
  TankKind,
  TankSnapshot,
  Team,
  TickResult,
} from "./types";

export function createGame(options: CreateGameOptions): Game {
  return new Simulation(options);
}
