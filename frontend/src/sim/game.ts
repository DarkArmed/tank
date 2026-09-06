import { CONFIG } from "./constants";
import { validateStageMaps } from "./map-validation";
import { DeterministicRandom } from "./random";
import type {
  CreateGameOptions,
  Direction,
  Game,
  GameInput,
  GameScene,
  GameSnapshot,
  ItemKind,
  ItemSnapshot,
  MapTile,
  PlayerId,
  PlayerSnapshot,
  RuntimeTile,
  SimulationEvent,
  StageId,
  StageMap,
  TankKind,
  TankSnapshot,
  Team,
  TickResult,
} from "./types";

interface PlayerState {
  id: PlayerId;
  score: number;
  nextLifeScore: number;
  respawnsRemaining: number;
  respawnTicks: number | null;
  eliminated: boolean;
  power: number;
  gunCount: 0 | 1 | 2;
  hasBoat: boolean;
  hasGunArmor: boolean;
  canBreakGrass: boolean;
  invincibleTicks: number;
}

interface TankState {
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
  fireCooldownTicks: number;
  aiDecisionTicks: number;
  slideDirection: Direction | null;
  slideTicks: number;
  movedLastTick: boolean;
  strandedOnWater: boolean;
}

interface BulletState {
  id: number;
  team: Team;
  ownerId: number;
  ownerPlayerId?: PlayerId;
  x: number;
  y: number;
  direction: Direction;
  speedPerTick: number;
  canBreakSteel: boolean;
  canBreakGrass: boolean;
  highPower: boolean;
}

interface EnemyBlueprint {
  kind: Exclude<TankKind, "player">;
  armor: number;
  flashing: boolean;
}

interface ShovelCell {
  column: number;
  row: number;
  tile: RuntimeTile;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BulletPath {
  bullet: BulletState;
  positions: readonly Rect[];
  duration: number;
  endX: number;
  endY: number;
  collision: BulletCollision | null;
  grass: readonly TilePoint[];
}

type BulletCollision =
  | { type: "boundary" }
  | { type: "terrain"; tile: "brick" | "steel"; column: number; row: number }
  | { type: "hq" }
  | { type: "tank"; tankId: number };

interface TilePoint {
  column: number;
  row: number;
}

function directionVector(direction: Direction): readonly [number, number] {
  switch (direction) {
    case "up": return [0, -1];
    case "right": return [1, 0];
    case "down": return [0, 1];
    case "left": return [-1, 0];
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function tankRect(tank: TankState, x = tank.x, y = tank.y): Rect {
  return { x, y, width: CONFIG.tankPixels, height: CONFIG.tankPixels };
}

function pointKey(point: TilePoint): string {
  return `${point.column},${point.row}`;
}

function resetTankEquipment(player: PlayerState): void {
  player.power = CONFIG.initialPlayerPower;
  player.gunCount = 0;
  player.hasBoat = false;
  player.hasGunArmor = false;
  player.canBreakGrass = false;
  player.invincibleTicks = 0;
}

function cloneItem(item: ItemSnapshot | null): ItemSnapshot | null {
  return item ? { ...item } : null;
}

function cloneStageMap(map: StageMap): StageMap {
  return {
    id: map.id,
    width: map.width,
    height: map.height,
    cells: map.cells.map((row) => [...row]),
    spawns: {
      player1: { ...map.spawns.player1 },
      player2: { ...map.spawns.player2 },
      enemies: map.spawns.enemies.map((point) => ({ ...point })) as [
        { column: number; row: number },
        { column: number; row: number },
        { column: number; row: number },
      ],
    },
  };
}

export class Simulation implements Game {
  private readonly playerCount: 1 | 2;
  private readonly maps: ReadonlyMap<StageId, StageMap>;
  private readonly random: DeterministicRandom;
  private players: PlayerState[];
  private tanks: TankState[] = [];
  private bullets: BulletState[] = [];
  private terrain: RuntimeTile[][] = [];
  private scene: GameScene = "playing";
  private stage: StageId = 1;
  private tickCount = 0;
  private hqAlive = true;
  private enemyQueue: EnemyBlueprint[] = [];
  private enemiesDestroyed = 0;
  private enemySpawnTicks = CONFIG.enemySpawnIntervalTicks;
  private item: ItemSnapshot | null = null;
  private clockTicks = 0;
  private shovelTicks = 0;
  private shovelRestore: ShovelCell[] = [];
  private sceneTicks = 0;
  private nextEntityId = 1;

  constructor(options: CreateGameOptions) {
    if (options.playerCount !== 1 && options.playerCount !== 2) {
      throw new Error(`playerCount: expected 1 or 2; received ${String(options.playerCount)}`);
    }
    if (!Number.isFinite(options.seed)) throw new Error("seed: must be a finite number");
    validateStageMaps(options.maps);
    this.playerCount = options.playerCount;
    this.maps = new Map(options.maps.map((map) => [map.id, cloneStageMap(map)]));
    this.random = new DeterministicRandom(options.seed);
    this.players = Array.from({ length: options.playerCount }, (_, index): PlayerState => ({
      id: (index + 1) as PlayerId,
      score: 0,
      nextLifeScore: CONFIG.scoreLifeThreshold,
      respawnsRemaining: CONFIG.initialRespawns,
      respawnTicks: null,
      eliminated: false,
      power: CONFIG.initialPlayerPower,
      gunCount: 0,
      hasBoat: false,
      hasGunArmor: false,
      canBreakGrass: false,
      invincibleTicks: 0,
    }));
    this.startStage(1, true);
  }

  tick(input: GameInput): TickResult {
    this.tickCount += 1;
    const events: SimulationEvent[] = [];

    if (this.scene === "gameOver" || this.scene === "completed") {
      this.advanceTerminalScene(events);
      return { snapshot: this.getSnapshot(), events };
    }

    const respawningAtTickStart = new Set(this.players.filter((player) => player.respawnTicks !== null).map((player) => player.id));
    this.applyBorrowRequests(input);
    const enemyIntent = this.createEnemyIntent();
    this.movePlayerTanks(input);
    this.moveEnemyTanks(enemyIntent.moves);
    this.firePlayerTanks(input, events);
    this.fireEnemyTanks(enemyIntent.shoots, events);
    this.advanceBullets(events);
    this.advanceEffectsAndCooldowns();
    this.collectItem(events);
    this.advanceRespawns(respawningAtTickStart);
    if (this.scene === "playing") this.advanceEnemySpawns();
    this.updateScene(events);

    return { snapshot: this.getSnapshot(), events };
  }

  getSnapshot(): GameSnapshot {
    const players: PlayerSnapshot[] = this.players.map((player) => ({
      id: player.id,
      score: player.score,
      respawnsRemaining: player.respawnsRemaining,
      active: this.playerTank(player.id) !== undefined,
      power: player.power,
      gunCount: player.gunCount,
      hasBoat: player.hasBoat,
      hasGunArmor: player.hasGunArmor,
      canBreakGrass: player.canBreakGrass,
      invincibleTicks: player.invincibleTicks,
    }));
    const tanks: TankSnapshot[] = this.sortedTanks().map((tank) => {
      const snapshot: TankSnapshot = {
        id: tank.id,
        team: tank.team,
        kind: tank.kind,
        x: tank.x,
        y: tank.y,
        direction: tank.direction,
        armor: tank.armor,
        flashing: tank.flashing,
        redArmor: tank.redArmor,
      };
      if (tank.playerId !== undefined) snapshot.playerId = tank.playerId;
      return snapshot;
    });
    return {
      scene: this.scene,
      stage: this.stage,
      tick: this.tickCount,
      players,
      tanks,
      bullets: [...this.bullets].sort((a, b) => a.id - b.id).map((bullet) => ({
        id: bullet.id,
        team: bullet.team,
        ownerId: bullet.ownerId,
        x: bullet.x,
        y: bullet.y,
        direction: bullet.direction,
        canBreakSteel: bullet.canBreakSteel,
        canBreakGrass: bullet.canBreakGrass,
      })),
      item: cloneItem(this.item),
      terrain: this.terrain.map((row) => [...row]),
      hqAlive: this.hqAlive,
      enemiesQueued: this.enemyQueue.length,
      enemiesActive: this.enemyTanks().length,
      enemiesDestroyed: this.enemiesDestroyed,
    };
  }

  private startStage(stage: StageId, initial: boolean): void {
    const map = this.maps.get(stage);
    if (!map) throw new Error(`stage ${stage} map is unavailable`);
    this.stage = stage;
    this.scene = "playing";
    this.sceneTicks = 0;
    this.terrain = map.cells.map((row) => [...row]);
    this.hqAlive = true;
    this.bullets = [];
    this.tanks = [];
    this.item = null;
    this.clockTicks = 0;
    this.shovelTicks = 0;
    this.shovelRestore = [];
    this.enemiesDestroyed = 0;
    this.enemySpawnTicks = CONFIG.enemySpawnIntervalTicks;

    for (const player of this.players) {
      const wasEliminated = player.eliminated;
      const wasWaitingToRespawn = player.respawnTicks !== null;
      player.respawnTicks = null;
      player.eliminated = false;
      player.invincibleTicks = 0;
      if (!initial && wasEliminated) {
        resetTankEquipment(player);
        player.respawnsRemaining = 0;
      } else if (!initial && wasWaitingToRespawn) {
        resetTankEquipment(player);
        if (player.respawnsRemaining > 0) player.respawnsRemaining -= 1;
      }
      this.spawnPlayer(player.id, false);
    }

    this.enemyQueue = this.createEnemyQueue(stage);
    for (const point of map.spawns.enemies) {
      const blueprint = this.enemyQueue.shift();
      if (blueprint) this.spawnEnemy(blueprint, point.column, point.row);
    }
  }

  private createEnemyQueue(stage: StageId): EnemyBlueprint[] {
    const setup = CONFIG.stageEnemies[stage];
    const kinds: Exclude<TankKind, "player">[] = [];
    for (const kind of ["normal", "fast", "shooter", "heavy"] as const) {
      for (let count = 0; count < setup[kind]; count += 1) kinds.push(kind);
    }
    return this.random.shuffle(kinds).map((kind, index) => {
      let armor = 0;
      if (kind === "heavy") armor = CONFIG.heavyArmorLayers;
      else if (this.random.next() < setup.armorChance) armor = this.random.integer(CONFIG.randomArmorLayerCount) + 1;
      const ordinal = index + 1;
      return {
        kind,
        armor,
        flashing: CONFIG.flashingSpawnOrdinals.includes(ordinal),
      };
    });
  }

  private spawnPlayer(playerId: PlayerId, invincible: boolean): void {
    const player = this.player(playerId);
    const map = this.maps.get(this.stage)!;
    const point = playerId === 1 ? map.spawns.player1 : map.spawns.player2;
    if (invincible) player.invincibleTicks = CONFIG.spawnInvincibilityTicks;
    player.eliminated = false;
    player.respawnTicks = null;
    this.tanks.push({
      id: this.allocateId(),
      team: "player",
      playerId,
      kind: "player",
      x: point.column * CONFIG.halfTilePixels,
      y: point.row * CONFIG.halfTilePixels,
      direction: "up",
      armor: 0,
      flashing: false,
      redArmor: false,
      fireCooldownTicks: 0,
      aiDecisionTicks: 0,
      slideDirection: null,
      slideTicks: 0,
      movedLastTick: false,
      strandedOnWater: false,
    });
  }

  private spawnEnemy(blueprint: EnemyBlueprint, column: number, row: number): void {
    this.tanks.push({
      id: this.allocateId(),
      team: "enemy",
      kind: blueprint.kind,
      x: column * CONFIG.halfTilePixels,
      y: row * CONFIG.halfTilePixels,
      direction: "down",
      armor: blueprint.armor,
      flashing: blueprint.flashing,
      redArmor: false,
      fireCooldownTicks: 0,
      aiDecisionTicks: 0,
      slideDirection: null,
      slideTicks: 0,
      movedLastTick: false,
      strandedOnWater: false,
    });
  }

  private applyBorrowRequests(input: GameInput): void {
    if (this.playerCount !== 2) return;
    for (const borrower of this.players) {
      const requested = borrower.id === 1 ? input.player1.borrowLifePressed : input.player2.borrowLifePressed;
      if (!requested || !borrower.eliminated) continue;
      const lender = this.player(borrower.id === 1 ? 2 : 1);
      if (!this.playerTank(lender.id) || lender.respawnsRemaining < 1) continue;
      lender.respawnsRemaining -= 1;
      resetTankEquipment(borrower);
      borrower.respawnsRemaining = 0;
      this.spawnPlayer(borrower.id, true);
    }
  }

  private movePlayerTanks(input: GameInput): void {
    for (const tank of this.sortedTanks().filter((candidate) => candidate.team === "player")) {
      const playerInput = tank.playerId === 1 ? input.player1 : input.player2;
      let direction = playerInput.move;
      let distance = CONFIG.playerSpeedPerTick;
      if (direction) {
        if (tank.direction !== direction) this.alignForTurn(tank, direction);
        tank.direction = direction;
        tank.slideDirection = null;
        tank.slideTicks = 0;
      } else if (tank.slideDirection === null && tank.movedLastTick && this.tankTouchesTile(tank, "ice")) {
        tank.slideDirection = tank.direction;
        tank.slideTicks = CONFIG.iceSlideTicks;
      }
      if (!direction && tank.slideDirection && tank.slideTicks > 0) {
        direction = tank.slideDirection;
        distance *= tank.slideTicks / CONFIG.iceSlideTicks;
      }
      const moved = direction !== null && this.tryMoveTank(tank, direction, distance);
      tank.movedLastTick = playerInput.move !== null && moved;
      if (playerInput.move === null && tank.slideTicks > 0) {
        tank.slideTicks -= 1;
        if (tank.slideTicks === 0) tank.slideDirection = null;
      }
      if (tank.strandedOnWater && !this.tankTouchesTile(tank, "water")) tank.strandedOnWater = false;
    }
  }

  private moveEnemyTanks(moves: ReadonlyMap<number, Direction>): void {
    if (this.clockTicks > 0) return;
    for (const tank of this.enemyTanks()) {
      const direction = moves.get(tank.id) ?? tank.direction;
      if (tank.direction !== direction) this.alignForTurn(tank, direction);
      tank.direction = direction;
      this.tryMoveTank(tank, direction, CONFIG.enemy[tank.kind as Exclude<TankKind, "player">].speedPerTick);
    }
  }

  private alignForTurn(tank: TankState, direction: Direction): void {
    const changesAxis = (direction === "up" || direction === "down") !== (tank.direction === "up" || tank.direction === "down");
    if (!changesAxis) return;
    if (direction === "up" || direction === "down") {
      const aligned = Math.round(tank.x / CONFIG.halfTilePixels) * CONFIG.halfTilePixels;
      if (Math.abs(aligned - tank.x) <= CONFIG.turnAlignmentTolerancePixels && !this.tankBlocked(tank, aligned, tank.y)) tank.x = aligned;
    } else {
      const aligned = Math.round(tank.y / CONFIG.halfTilePixels) * CONFIG.halfTilePixels;
      if (Math.abs(aligned - tank.y) <= CONFIG.turnAlignmentTolerancePixels && !this.tankBlocked(tank, tank.x, aligned)) tank.y = aligned;
    }
  }

  private tryMoveTank(tank: TankState, direction: Direction, distance: number): boolean {
    const [dx, dy] = directionVector(direction);
    const steps = Math.max(1, Math.ceil(distance));
    const step = distance / steps;
    let moved = false;
    for (let index = 0; index < steps; index += 1) {
      const x = tank.x + dx * step;
      const y = tank.y + dy * step;
      if (this.tankBlocked(tank, x, y)) break;
      tank.x = x;
      tank.y = y;
      moved = true;
    }
    return moved;
  }

  private tankBlocked(tank: TankState, x: number, y: number): boolean {
    const candidate = tankRect(tank, x, y);
    if (x < 0 || y < 0 || x + CONFIG.tankPixels > CONFIG.fieldPixels || y + CONFIG.tankPixels > CONFIG.fieldPixels) return true;
    for (const point of this.tilesForRect(candidate)) {
      const tile = this.terrain[point.row][point.column];
      if (tile === "brick" || tile === "steel" || tile === "hq") return true;
      if (tile === "water" && !this.canTankEnterWater(tank)) return true;
    }
    const current = tankRect(tank);
    for (const other of this.sortedTanks()) {
      if (other.id === tank.id || (tank.team === "player" && other.team === "player")) continue;
      const otherRect = tankRect(other);
      const nextOverlap = overlapArea(candidate, otherRect);
      if (nextOverlap > 0 && nextOverlap >= overlapArea(current, otherRect)) return true;
    }
    return false;
  }

  private canTankEnterWater(tank: TankState): boolean {
    if (tank.team === "enemy") return false;
    const player = this.player(tank.playerId!);
    return player.hasBoat || tank.strandedOnWater;
  }

  private createEnemyIntent(): { moves: ReadonlyMap<number, Direction>; shoots: ReadonlySet<number> } {
    const moves = new Map<number, Direction>();
    const shoots = new Set<number>();
    if (this.clockTicks > 0) return { moves, shoots };
    for (const tank of this.enemyTanks()) {
      if (tank.aiDecisionTicks > 0) {
        moves.set(tank.id, tank.direction);
        continue;
      }
      const targetDirection = this.straightTargetDirection(tank);
      const direction = targetDirection ?? (["down", "down", "up", "right", "left"] as const)[this.random.integer(5)];
      moves.set(tank.id, direction);
      if (tank.fireCooldownTicks <= 0 && (targetDirection !== null || this.random.next() < CONFIG.enemyRandomShotChance)) shoots.add(tank.id);
      tank.aiDecisionTicks = CONFIG.enemyDecisionTicks;
    }
    return { moves, shoots };
  }

  private straightTargetDirection(enemy: TankState): Direction | null {
    const targets: Rect[] = this.players.flatMap((player) => {
      const tank = this.playerTank(player.id);
      return tank ? [tankRect(tank)] : [];
    });
    if (this.hqAlive) targets.push({
      x: CONFIG.hq.column * CONFIG.halfTilePixels,
      y: CONFIG.hq.row * CONFIG.halfTilePixels,
      width: CONFIG.hq.halfTileWidth * CONFIG.halfTilePixels,
      height: CONFIG.hq.halfTileHeight * CONFIG.halfTilePixels,
    });
    const centerX = enemy.x + CONFIG.tankPixels / 2;
    const centerY = enemy.y + CONFIG.tankPixels / 2;
    for (const target of targets) {
      const targetX = target.x + target.width / 2;
      const targetY = target.y + target.height / 2;
      const vertical = Math.abs(targetX - centerX) < CONFIG.tankPixels / 2;
      const horizontal = Math.abs(targetY - centerY) < CONFIG.tankPixels / 2;
      if (!vertical && !horizontal) continue;
      const corridor: Rect = vertical
        ? { x: Math.min(centerX, targetX) - 1, y: Math.min(centerY, targetY), width: 2, height: Math.abs(targetY - centerY) }
        : { x: Math.min(centerX, targetX), y: Math.min(centerY, targetY) - 1, width: Math.abs(targetX - centerX), height: 2 };
      if (this.tilesForRect(corridor).every((point) => {
        const tile = this.terrain[point.row]?.[point.column];
        return tile === "empty" || tile === "grass" || tile === "ice" || tile === "water" || tile === "hq";
      })) {
        if (vertical) return targetY < centerY ? "up" : "down";
        return targetX < centerX ? "left" : "right";
      }
    }
    return null;
  }

  private firePlayerTanks(input: GameInput, events: SimulationEvent[]): void {
    for (const tank of this.sortedTanks().filter((candidate) => candidate.team === "player")) {
      const playerInput = tank.playerId === 1 ? input.player1 : input.player2;
      if (!playerInput.fireSinglePressed && !playerInput.fireRapidHeld) continue;
      const player = this.player(tank.playerId!);
      const bulletLimit = player.power >= CONFIG.playerMultiBulletPower ? 2 : 1;
      if (tank.fireCooldownTicks > 0 || this.bullets.filter((bullet) => bullet.ownerId === tank.id).length >= bulletLimit) continue;
      this.spawnBullet(
        tank,
        player.power >= CONFIG.playerFastBulletPower ? CONFIG.playerFastBulletSpeedPerTick : CONFIG.playerSlowBulletSpeedPerTick,
        player.power >= CONFIG.playerTerrainPower,
        player.canBreakGrass,
      );
      tank.fireCooldownTicks = CONFIG.playerShotCooldownTicks;
      events.push({ type: "shot", team: "player", tankId: tank.id });
    }
  }

  private fireEnemyTanks(shoots: ReadonlySet<number>, events: SimulationEvent[]): void {
    if (this.clockTicks > 0) return;
    for (const tank of this.enemyTanks()) {
      if (!shoots.has(tank.id) || tank.fireCooldownTicks > 0 || this.bullets.some((bullet) => bullet.ownerId === tank.id)) continue;
      const config = CONFIG.enemy[tank.kind as Exclude<TankKind, "player">];
      this.spawnBullet(tank, config.bulletSpeedPerTick, false, false);
      tank.fireCooldownTicks = config.shotCooldownTicks;
      events.push({ type: "shot", team: "enemy", tankId: tank.id });
    }
  }

  private spawnBullet(tank: TankState, speedPerTick: number, highPower: boolean, canBreakGrass: boolean): void {
    const positions: Record<Direction, readonly [number, number]> = {
      up: [tank.x + (CONFIG.tankPixels - CONFIG.bulletPixels) / 2, tank.y - CONFIG.bulletPixels],
      right: [tank.x + CONFIG.tankPixels, tank.y + (CONFIG.tankPixels - CONFIG.bulletPixels) / 2],
      down: [tank.x + (CONFIG.tankPixels - CONFIG.bulletPixels) / 2, tank.y + CONFIG.tankPixels],
      left: [tank.x - CONFIG.bulletPixels, tank.y + (CONFIG.tankPixels - CONFIG.bulletPixels) / 2],
    };
    const [x, y] = positions[tank.direction];
    this.bullets.push({
      id: this.allocateId(),
      team: tank.team,
      ownerId: tank.id,
      ...(tank.playerId === undefined ? {} : { ownerPlayerId: tank.playerId }),
      x,
      y,
      direction: tank.direction,
      speedPerTick,
      canBreakSteel: highPower,
      canBreakGrass,
      highPower,
    });
  }

  private advanceBullets(events: SimulationEvent[]): void {
    const paths = [...this.bullets].sort((a, b) => a.id - b.id).map((bullet) => this.traceBullet(bullet));
    const collidedBullets = new Set<number>();
    for (let first = 0; first < paths.length; first += 1) {
      for (let second = first + 1; second < paths.length; second += 1) {
        if (this.pathsOverlap(paths[first], paths[second])) {
          collidedBullets.add(paths[first].bullet.id);
          collidedBullets.add(paths[second].bullet.id);
        }
      }
    }

    const removed = new Set<number>(collidedBullets);
    const tankHits = new Map<number, BulletState[]>();
    let hqHit = false;
    for (const path of paths) {
      const bullet = path.bullet;
      if (collidedBullets.has(bullet.id)) continue;
      for (const point of path.grass) {
        if (bullet.canBreakGrass && this.terrain[point.row][point.column] === "grass") this.terrain[point.row][point.column] = "empty";
      }
      if (!path.collision) {
        bullet.x = path.endX;
        bullet.y = path.endY;
        continue;
      }
      removed.add(bullet.id);
      if (path.collision.type === "terrain") {
        this.resolveTerrainHit(bullet, path.collision);
        events.push({ type: "impact", target: "terrain" });
      } else if (path.collision.type === "hq") {
        hqHit = true;
        events.push({ type: "impact", target: "hq" });
      } else if (path.collision.type === "tank") {
        const hits = tankHits.get(path.collision.tankId) ?? [];
        hits.push(bullet);
        tankHits.set(path.collision.tankId, hits);
        events.push({ type: "impact", target: "tank" });
      }
    }
    for (let index = 0; index < collidedBullets.size; index += 1) {
      events.push({ type: "impact", target: "bullet" });
    }

    for (const [tankId, hits] of [...tankHits.entries()].sort(([a], [b]) => a - b)) {
      const tank = this.tanks.find((candidate) => candidate.id === tankId);
      if (!tank) continue;
      if (tank.team === "enemy") this.damageEnemy(tank, hits, events);
      else this.damagePlayer(tank, hits.length, events);
    }
    if (hqHit && this.hqAlive) {
      this.hqAlive = false;
      for (let row = CONFIG.hq.row; row < CONFIG.hq.row + CONFIG.hq.halfTileHeight; row += 1) {
        for (let column = CONFIG.hq.column; column < CONFIG.hq.column + CONFIG.hq.halfTileWidth; column += 1) {
          this.terrain[row][column] = "empty";
        }
      }
      events.push({ type: "explosion", target: "hq" });
    }
    this.bullets = this.bullets.filter((bullet) => !removed.has(bullet.id));
  }

  private traceBullet(bullet: BulletState): BulletPath {
    const [dx, dy] = directionVector(bullet.direction);
    const steps = Math.max(1, Math.ceil(bullet.speedPerTick));
    const step = bullet.speedPerTick / steps;
    let x = bullet.x;
    let y = bullet.y;
    const positions: Rect[] = [{ x, y, width: CONFIG.bulletPixels, height: CONFIG.bulletPixels }];
    const grass = new Map<string, TilePoint>();
    let collision: BulletCollision | null = null;
    for (let index = 0; index < steps; index += 1) {
      x += dx * step;
      y += dy * step;
      const rect = { x, y, width: CONFIG.bulletPixels, height: CONFIG.bulletPixels };
      positions.push(rect);
      if (this.bulletReachedBoundary(bullet.direction, x, y)) {
        collision = { type: "boundary" };
        break;
      }
      const points = this.tilesForRect(rect);
      const grassPoint = {
        column: Math.floor((x + CONFIG.bulletPixels / 2) / CONFIG.halfTilePixels),
        row: Math.floor((y + CONFIG.bulletPixels / 2) / CONFIG.halfTilePixels),
      };
      if (this.terrain[grassPoint.row]?.[grassPoint.column] === "grass") grass.set(pointKey(grassPoint), grassPoint);
      const solid = points.find((point) => {
        const tile = this.terrain[point.row][point.column];
        return tile === "brick" || tile === "steel" || tile === "hq";
      });
      if (solid) {
        const tile = this.terrain[solid.row][solid.column];
        if (tile === "hq") collision = { type: "hq" };
        else if (tile === "brick" || tile === "steel") collision = { type: "terrain", tile, column: solid.column, row: solid.row };
        break;
      }
      const target = this.sortedTanks().find((tank) => this.bulletCanHitTank(bullet, tank) && overlaps(rect, tankRect(tank)));
      if (target) {
        collision = { type: "tank", tankId: target.id };
        break;
      }
    }
    return { bullet, positions, duration: (positions.length - 1) / steps, endX: x, endY: y, collision, grass: [...grass.values()] };
  }

  private pathsOverlap(first: BulletPath, second: BulletPath): boolean {
    const samples = 6;
    for (let sample = 0; sample <= samples; sample += 1) {
      const time = sample / samples;
      if (time > first.duration || time > second.duration) continue;
      if (overlaps(this.bulletRectAt(first.bullet, time), this.bulletRectAt(second.bullet, time))) return true;
    }
    return false;
  }

  private bulletReachedBoundary(direction: Direction, x: number, y: number): boolean {
    switch (direction) {
      case "up": return y <= 0;
      case "right": return x + CONFIG.bulletPixels >= CONFIG.fieldPixels;
      case "down": return y + CONFIG.bulletPixels >= CONFIG.fieldPixels;
      case "left": return x <= 0;
    }
  }

  private bulletRectAt(bullet: BulletState, time: number): Rect {
    const [dx, dy] = directionVector(bullet.direction);
    return {
      x: bullet.x + dx * bullet.speedPerTick * time,
      y: bullet.y + dy * bullet.speedPerTick * time,
      width: CONFIG.bulletPixels,
      height: CONFIG.bulletPixels,
    };
  }

  private bulletCanHitTank(bullet: BulletState, tank: TankState): boolean {
    if (tank.id === bullet.ownerId) return false;
    return bullet.team !== tank.team;
  }

  private resolveTerrainHit(bullet: BulletState, collision: Extract<BulletCollision, { type: "terrain" }>): void {
    if (collision.tile === "steel" && !bullet.canBreakSteel) return;
    this.terrain[collision.row][collision.column] = "empty";
    if (collision.tile !== "brick" || !bullet.highPower) return;
    const other = bullet.direction === "up" || bullet.direction === "down"
      ? { column: collision.column % 2 === 0 ? collision.column + 1 : collision.column - 1, row: collision.row }
      : { column: collision.column, row: collision.row % 2 === 0 ? collision.row + 1 : collision.row - 1 };
    if (this.terrain[other.row]?.[other.column] === "brick") this.terrain[other.row][other.column] = "empty";
  }

  private damageEnemy(tank: TankState, hits: readonly BulletState[], events: SimulationEvent[]): void {
    if (hits.length <= tank.armor) {
      tank.armor -= hits.length;
      tank.redArmor = false;
      return;
    }
    const scoringPlayer = hits
      .map((bullet) => bullet.ownerPlayerId ?? this.tanks.find((candidate) => candidate.id === bullet.ownerId)?.playerId)
      .filter((id): id is PlayerId => id !== undefined)
      .sort((a, b) => a - b)[0];
    if (scoringPlayer) this.addScore(this.player(scoringPlayer), CONFIG.enemy[tank.kind as Exclude<TankKind, "player">].score);
    this.tanks = this.tanks.filter((candidate) => candidate.id !== tank.id);
    this.enemiesDestroyed += 1;
    events.push({ type: "explosion", target: "enemy" });
    if (tank.flashing) this.spawnItem();
  }

  private damagePlayer(tank: TankState, hitCount: number, events: SimulationEvent[]): void {
    const player = this.player(tank.playerId!);
    if (player.invincibleTicks > 0) return;
    for (let hit = 0; hit < hitCount; hit += 1) {
      if (player.hasBoat) {
        player.hasBoat = false;
        if (this.tankTouchesTile(tank, "water")) tank.strandedOnWater = true;
      } else if (player.hasGunArmor) {
        player.hasGunArmor = false;
      } else if (player.power >= CONFIG.playerTerrainPower) {
        player.power = CONFIG.playerPowerAfterArmorHit;
      } else {
        this.destroyPlayerTank(tank, events);
        return;
      }
    }
  }

  private destroyPlayerTank(tank: TankState, events: SimulationEvent[]): void {
    const player = this.player(tank.playerId!);
    this.tanks = this.tanks.filter((candidate) => candidate.id !== tank.id);
    resetTankEquipment(player);
    player.respawnTicks = CONFIG.respawnDelayTicks;
    player.eliminated = false;
    events.push({ type: "explosion", target: "player" });
  }

  private collectItem(events: SimulationEvent[]): void {
    if (!this.item) return;
    const itemRect: Rect = {
      x: this.item.column * CONFIG.halfTilePixels,
      y: this.item.row * CONFIG.halfTilePixels,
      width: CONFIG.itemPixels,
      height: CONFIG.itemPixels,
    };
    const contacts = this.sortedTanks()
      .filter((tank) => tank.team === "player" && overlaps(tankRect(tank), itemRect))
      .map((tank) => ({
        tank,
        distance: Math.hypot(
          tank.x + CONFIG.tankPixels / 2 - (itemRect.x + CONFIG.itemPixels / 2),
          tank.y + CONFIG.tankPixels / 2 - (itemRect.y + CONFIG.itemPixels / 2),
        ),
      }))
      .sort((a, b) => a.distance - b.distance || a.tank.playerId! - b.tank.playerId!);
    if (contacts.length === 0) return;
    const item = this.item.kind;
    const player = this.player(contacts[0].tank.playerId!);
    this.item = null;
    this.addScore(player, CONFIG.itemScore);
    this.applyItem(player, item, events);
    events.push({ type: "itemPicked", playerId: player.id, item });
  }

  private applyItem(player: PlayerState, item: ItemKind, events: SimulationEvent[]): void {
    switch (item) {
      case "star":
        player.power += 1;
        break;
      case "gun":
        if (player.gunCount < 2) {
          player.power = Math.max(CONFIG.playerTerrainPower, player.power);
          player.gunCount = (player.gunCount + 1) as 1 | 2;
        }
        player.hasGunArmor = true;
        if (player.gunCount === 2) player.canBreakGrass = true;
        break;
      case "boat":
        player.hasBoat = true;
        break;
      case "helmet":
        player.invincibleTicks = CONFIG.helmetTicks;
        break;
      case "shovel":
        this.activateShovel();
        break;
      case "life":
        player.respawnsRemaining += 1;
        break;
      case "clock":
        this.clockTicks = CONFIG.clockTicks;
        break;
      case "bomb":
        this.activateBomb(events);
        break;
    }
  }

  private activateShovel(): void {
    if (this.shovelTicks === 0) {
      const map = this.maps.get(this.stage)!;
      this.shovelRestore = this.hqRing().map(({ column, row }) => ({ column, row, tile: map.cells[row][column] }));
    }
    for (const { column, row } of this.hqRing()) this.terrain[row][column] = "steel";
    this.shovelTicks = CONFIG.shovelTicks;
  }

  private activateBomb(events: SimulationEvent[]): void {
    const enemies = this.enemyTanks();
    if (enemies.length === 0) return;
    const enemyIds = new Set(enemies.map((enemy) => enemy.id));
    this.tanks = this.tanks.filter((tank) => !enemyIds.has(tank.id));
    this.enemiesDestroyed += enemies.length;
    for (const _enemy of enemies) events.push({ type: "explosion", target: "enemy" });
  }

  private spawnItem(): void {
    const map = this.maps.get(this.stage)!;
    const spawnRects = [map.spawns.player1, map.spawns.player2, ...map.spawns.enemies].map((point): Rect => ({
      x: point.column * CONFIG.halfTilePixels,
      y: point.row * CONFIG.halfTilePixels,
      width: CONFIG.itemPixels,
      height: CONFIG.itemPixels,
    }));
    const candidates: TilePoint[] = [];
    const lastItemOrigin = CONFIG.fieldHalfTiles - CONFIG.itemPixels / CONFIG.halfTilePixels;
    for (let row = 0; row <= lastItemOrigin; row += 1) {
      for (let column = 0; column <= lastItemOrigin; column += 1) {
        const rect = {
          x: column * CONFIG.halfTilePixels,
          y: row * CONFIG.halfTilePixels,
          width: CONFIG.itemPixels,
          height: CONFIG.itemPixels,
        };
        const tiles = this.tilesForRect(rect).map((point) => this.terrain[point.row][point.column]);
        if (!tiles.every((tile) => tile === "empty" || tile === "grass" || tile === "ice")) continue;
        if (spawnRects.some((spawn) => overlaps(rect, spawn))) continue;
        if (this.tanks.some((tank) => overlaps(rect, tankRect(tank)))) continue;
        candidates.push({ column, row });
      }
    }
    if (candidates.length === 0) {
      this.item = null;
      return;
    }
    const point = candidates[this.random.integer(candidates.length)];
    this.item = { kind: CONFIG.itemKinds[this.random.integer(CONFIG.itemKinds.length)], ...point };
  }

  private advanceEffectsAndCooldowns(): void {
    for (const tank of this.tanks) {
      if (tank.fireCooldownTicks > 0) tank.fireCooldownTicks -= 1;
      if (tank.aiDecisionTicks > 0) tank.aiDecisionTicks -= 1;
    }
    for (const player of this.players) if (player.invincibleTicks > 0) player.invincibleTicks -= 1;
    if (this.clockTicks > 0) this.clockTicks -= 1;
    if (this.shovelTicks > 0) {
      this.shovelTicks -= 1;
      if (this.shovelTicks === 0) {
        for (const cell of this.shovelRestore) this.terrain[cell.row][cell.column] = cell.tile;
        this.shovelRestore = [];
      }
    }
  }

  private advanceRespawns(eligiblePlayers?: ReadonlySet<PlayerId>): void {
    for (const player of this.players) {
      if (player.respawnTicks === null) continue;
      if (eligiblePlayers && !eligiblePlayers.has(player.id)) continue;
      player.respawnTicks -= 1;
      if (player.respawnTicks > 0) continue;
      player.respawnTicks = null;
      if (player.respawnsRemaining > 0) {
        player.respawnsRemaining -= 1;
        this.spawnPlayer(player.id, true);
      } else {
        player.eliminated = true;
      }
    }
  }

  private advanceEnemySpawns(): void {
    if (this.enemyQueue.length === 0) return;
    this.enemySpawnTicks -= 1;
    if (this.enemySpawnTicks > 0) return;
    this.enemySpawnTicks = CONFIG.enemySpawnIntervalTicks;
    const limit = CONFIG.enemyActiveLimit[this.playerCount];
    const available = Math.min(3, limit - this.enemyTanks().length, this.enemyQueue.length);
    const spawns = this.maps.get(this.stage)!.spawns.enemies;
    for (let index = 0; index < available; index += 1) {
      this.spawnEnemy(this.enemyQueue.shift()!, spawns[index].column, spawns[index].row);
    }
  }

  private updateScene(events: SimulationEvent[]): void {
    if (!this.hqAlive || !this.anyPlayerCanContinue()) {
      this.scene = "gameOver";
      this.sceneTicks = CONFIG.gameOverTicks;
      return;
    }
    if (this.scene === "playing" && this.enemiesDestroyed >= CONFIG.enemyCount && this.enemyTanks().length === 0) {
      this.scene = "stageClear";
      this.sceneTicks = CONFIG.stageClearTicks;
      this.item = null;
      events.push({ type: "stageClear", stage: this.stage });
      return;
    }
    if (this.scene !== "stageClear") return;
    this.sceneTicks -= 1;
    if (this.sceneTicks > 0) return;
    if (this.stage < 3) {
      this.startStage((this.stage + 1) as StageId, false);
    } else {
      this.scene = "completed";
      this.sceneTicks = CONFIG.completedTicks;
    }
  }

  private advanceTerminalScene(events: SimulationEvent[]): void {
    if (this.sceneTicks > 0) this.sceneTicks -= 1;
    if (this.sceneTicks !== 0) return;
    if (this.scene === "gameOver") events.push({ type: "gameOver" });
    else events.push({ type: "completed" });
    this.sceneTicks = -1;
  }

  private anyPlayerCanContinue(): boolean {
    if (this.players.some((player) => this.playerTank(player.id) !== undefined || player.respawnsRemaining > 0)) return true;
    return false;
  }

  private addScore(player: PlayerState, score: number): void {
    player.score += score;
    let gainedLife = false;
    while (player.score >= player.nextLifeScore) {
      player.respawnsRemaining += 1;
      player.nextLifeScore += CONFIG.scoreLifeThreshold;
      gainedLife = true;
    }
    if (gainedLife && player.eliminated) {
      player.eliminated = false;
      player.respawnTicks = CONFIG.respawnDelayTicks;
    }
  }

  private tankTouchesTile(tank: TankState, tile: MapTile): boolean {
    return this.tilesForRect(tankRect(tank)).some((point) => this.terrain[point.row][point.column] === tile);
  }

  private tilesForRect(rect: Rect): TilePoint[] {
    if (rect.width <= 0 || rect.height <= 0) return [];
    const firstColumn = Math.max(0, Math.floor(rect.x / CONFIG.halfTilePixels));
    const lastColumn = Math.min(CONFIG.fieldHalfTiles - 1, Math.floor((rect.x + rect.width - 0.000_001) / CONFIG.halfTilePixels));
    const firstRow = Math.max(0, Math.floor(rect.y / CONFIG.halfTilePixels));
    const lastRow = Math.min(CONFIG.fieldHalfTiles - 1, Math.floor((rect.y + rect.height - 0.000_001) / CONFIG.halfTilePixels));
    const points: TilePoint[] = [];
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) points.push({ column, row });
    }
    return points;
  }

  private hqRing(): TilePoint[] {
    const result: TilePoint[] = [];
    const firstColumn = CONFIG.hq.column - 1;
    const lastColumn = CONFIG.hq.column + CONFIG.hq.halfTileWidth;
    const firstRow = CONFIG.hq.row - 1;
    const lastRow = CONFIG.hq.row + CONFIG.hq.halfTileHeight - 1;
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const insideHq = column >= CONFIG.hq.column
          && column < CONFIG.hq.column + CONFIG.hq.halfTileWidth
          && row >= CONFIG.hq.row;
        if (insideHq) continue;
        result.push({ column, row });
      }
    }
    return result;
  }

  private player(id: PlayerId): PlayerState {
    const player = this.players.find((candidate) => candidate.id === id);
    if (!player) throw new Error(`player ${id} is not participating`);
    return player;
  }

  private playerTank(id: PlayerId): TankState | undefined {
    return this.tanks.find((tank) => tank.playerId === id);
  }

  private enemyTanks(): TankState[] {
    return this.sortedTanks().filter((tank) => tank.team === "enemy");
  }

  private sortedTanks(): TankState[] {
    return [...this.tanks].sort((a, b) => a.id - b.id);
  }

  private allocateId(): number {
    const id = this.nextEntityId;
    this.nextEntityId += 1;
    return id;
  }
}
