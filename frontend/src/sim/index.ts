import { Simulation } from "./game";
import stage1 from "./maps/stage-1.json";
import stage2 from "./maps/stage-2.json";
import stage3 from "./maps/stage-3.json";
import type { CreateGameOptions, Game, StageMap } from "./types";

export const publishedStageMaps = [stage1, stage2, stage3] as unknown as readonly StageMap[];

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
