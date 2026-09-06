import { describe, expect, it } from "vitest";
import { CONFIG } from "./constants";
import { Simulation } from "./game";
import { createGame } from "./index";
import { makeMaps, NO_INPUT } from "./test-fixtures";
import type { Direction, GameInput, ItemKind, ItemSnapshot, RuntimeTile, SimulationEvent, TankKind, Team } from "./types";

interface TestPlayer {
  id: 1 | 2;
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

interface TestTank {
  id: number;
  team: Team;
  playerId?: 1 | 2;
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

interface TestBullet {
  id: number;
  team: Team;
  ownerId: number;
  ownerPlayerId?: 1 | 2;
  x: number;
  y: number;
  direction: Direction;
  speedPerTick: number;
  canBreakSteel: boolean;
  canBreakGrass: boolean;
  highPower: boolean;
}

interface TestEnemyBlueprint {
  kind: Exclude<TankKind, "player">;
  armor: number;
  flashing: boolean;
}

interface Internals {
  players: TestPlayer[];
  tanks: TestTank[];
  bullets: TestBullet[];
  terrain: RuntimeTile[][];
  scene: "playing" | "stageClear" | "gameOver" | "completed";
  sceneTicks: number;
  enemiesDestroyed: number;
  enemyQueue: TestEnemyBlueprint[];
  hqAlive: boolean;
  item: ItemSnapshot | null;
  clockTicks: number;
  shovelTicks: number;
  advanceBullets(events: SimulationEvent[]): void;
  collectItem(events: SimulationEvent[]): void;
  applyItem(player: TestPlayer, item: ItemKind, events: SimulationEvent[]): void;
  advanceEffectsAndCooldowns(): void;
  damagePlayer(tank: TestTank, hitCount: number, events: SimulationEvent[]): void;
  destroyPlayerTank(tank: TestTank, events: SimulationEvent[]): void;
  advanceRespawns(): void;
  addScore(player: TestPlayer, score: number): void;
  tryMoveTank(tank: TestTank, direction: Direction, distance: number): boolean;
  startStage(stage: 1 | 2 | 3, initial: boolean): void;
}

function access(game: Simulation): Internals {
  return game as unknown as Internals;
}

function newGame(playerCount: 1 | 2 = 1, seed = 7): Simulation {
  return new Simulation({ playerCount, maps: makeMaps(), seed });
}

function tank(overrides: Partial<TestTank> & Pick<TestTank, "id" | "team" | "kind" | "x" | "y">): TestTank {
  return {
    direction: "right",
    armor: 0,
    flashing: false,
    redArmor: false,
    fireCooldownTicks: 0,
    aiDecisionTicks: 0,
    slideDirection: null,
    slideTicks: 0,
    movedLastTick: false,
    strandedOnWater: false,
    ...overrides,
  };
}

function bullet(overrides: Partial<TestBullet> & Pick<TestBullet, "id" | "team" | "ownerId" | "x" | "y">): TestBullet {
  return {
    direction: "right",
    speedPerTick: 2,
    canBreakSteel: false,
    canBreakGrass: false,
    highPower: false,
    ...overrides,
  };
}

function playerTank(id: number, playerId: 1 | 2, x: number, y: number): TestTank {
  return tank({ id, team: "player", playerId, kind: "player", x, y });
}

describe("public simulation contract", () => {
  it("starts a deterministic stage with players and the first three enemies", () => {
    const first = createGame({ playerCount: 2, maps: makeMaps(), seed: 123 });
    const second = createGame({ playerCount: 2, maps: makeMaps(), seed: 123 });
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    expect(first.getSnapshot()).toMatchObject({ stage: 1, scene: "playing", enemiesActive: 3, enemiesQueued: 17, enemiesDestroyed: 0 });

    const inputs: GameInput[] = Array.from({ length: 240 }, (_, index) => ({
      player1: { ...NO_INPUT.player1, move: index % 40 < 20 ? "left" : "right", fireRapidHeld: index % 11 === 0 },
      player2: NO_INPUT.player2,
    }));
    expect(inputs.map((input) => first.tick(input))).toEqual(inputs.map((input) => second.tick(input)));
  });

  it("returns detached snapshots and does not replay events from getSnapshot", () => {
    const maps = makeMaps();
    const game = createGame({ playerCount: 1, maps, seed: 1 });
    const snapshot = game.getSnapshot();
    (snapshot.terrain[0] as RuntimeTile[])[0] = "steel";
    (snapshot.players[0] as unknown as { score: number }).score = 999;
    expect(game.getSnapshot().terrain[0][0]).toBe("empty");
    expect(game.getSnapshot().players[0].score).toBe(0);
    expect(game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, fireSinglePressed: true } }).events).toContainEqual({ type: "shot", team: "player", tankId: 1 });
    expect(game.getSnapshot().tick).toBe(1);

    (maps[1].cells[0] as RuntimeTile[])[0] = "steel";
    access(game as Simulation).startStage(2, false);
    expect(game.getSnapshot().terrain[0][0]).toBe("empty");
  });

  it("rejects invalid runtime options with descriptive errors", () => {
    expect(() => new Simulation({ playerCount: 3 as unknown as 1, maps: makeMaps(), seed: 1 })).toThrow(/playerCount/);
    expect(() => new Simulation({ playerCount: 1, maps: makeMaps(), seed: Number.NaN })).toThrow(/seed/);
  });

  it("moves one pixel per tick, turns when blocked, slides for 0.5 seconds, and gates water by boat", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [playerTank(1, 1, 64, 176)];
    state.terrain[22][10] = "brick";
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, move: "right" } });
    expect(game.getSnapshot().tanks[0]).toMatchObject({ x: 64, direction: "right" });

    state.terrain[22][10] = "empty";
    state.terrain[22][8] = "ice";
    state.terrain[22][9] = "ice";
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, move: "left" } });
    const releasedAt = game.getSnapshot().tanks[0].x;
    game.tick(NO_INPUT);
    expect(game.getSnapshot().tanks[0].x).toBeLessThan(releasedAt);
    for (let tick = 0; tick < 30; tick += 1) game.tick(NO_INPUT);
    const stoppedAt = game.getSnapshot().tanks[0].x;
    game.tick(NO_INPUT);
    expect(game.getSnapshot().tanks[0].x).toBe(stoppedAt);

    state.tanks[0].x = 64;
    state.tanks[0].y = 160;
    state.tanks[0].slideTicks = 0;
    state.tanks[0].slideDirection = null;
    state.terrain[20][10] = "water";
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, move: "right" } });
    expect(state.tanks[0].x).toBe(64);
    state.players[0].hasBoat = true;
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, move: "right" } });
    expect(state.tanks[0].x).toBe(65);
  });

  it("enforces player shot cooldown and simultaneous bullet limits", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [playerTank(1, 1, 80, 160)];
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, fireRapidHeld: true } });
    expect(game.getSnapshot().bullets).toHaveLength(1);
    for (let tick = 0; tick < CONFIG.playerShotCooldownTicks; tick += 1) game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, fireRapidHeld: true } });
    expect(game.getSnapshot().bullets.length).toBeLessThanOrEqual(1);
    state.players[0].power = 3;
    state.tanks[0].fireCooldownTicks = 0;
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, fireSinglePressed: true } });
    expect(game.getSnapshot().bullets.length).toBeLessThanOrEqual(2);
  });

  it("lets overlapping spawns separate but rejects movement deeper into a blocking tank", () => {
    const game = newGame();
    const state = access(game);
    const first = tank({ id: 10, team: "enemy", kind: "normal", x: 80, y: 80 });
    const second = tank({ id: 11, team: "enemy", kind: "normal", x: 80, y: 80 });
    state.tanks = [first, second];
    expect(state.tryMoveTank(first, "left", 1)).toBe(true);
    expect(first.x).toBe(79);
    expect(state.tryMoveTank(first, "right", 1)).toBe(false);
    expect(first.x).toBe(79);
  });

  it("aims and shoots immediately when an enemy decision sees an unobstructed player", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [
      playerTank(1, 1, 64, 160),
      tank({ id: 10, team: "enemy", kind: "normal", x: 64, y: 80, direction: "left" }),
    ];
    const result = game.tick(NO_INPUT);
    expect(result.snapshot.tanks.find((candidate) => candidate.id === 10)?.direction).toBe("down");
    expect(result.events).toContainEqual({ type: "shot", team: "enemy", tankId: 10 });
  });
});

describe("BI-01 through BI-08 terrain interactions", () => {
  it("BI-01/02 destroys one brick half or both hit-face halves", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [];
    state.terrain[10][10] = "brick";
    state.terrain[11][10] = "brick";
    state.bullets = [bullet({ id: 20, team: "player", ownerId: 1, x: 77, y: 82, speedPerTick: 1 })];
    state.advanceBullets([]);
    expect([state.terrain[10][10], state.terrain[11][10]]).toEqual(["empty", "brick"]);
    state.terrain[10][10] = "brick";
    state.bullets = [bullet({ id: 21, team: "player", ownerId: 1, x: 77, y: 82, speedPerTick: 1, highPower: true, canBreakSteel: true })];
    state.advanceBullets([]);
    expect([state.terrain[10][10], state.terrain[11][10]]).toEqual(["empty", "empty"]);
  });

  it("BI-03/04 only steel-capable bullets destroy steel", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [];
    state.terrain[10][10] = "steel";
    state.bullets = [bullet({ id: 20, team: "player", ownerId: 1, x: 77, y: 82, speedPerTick: 1 })];
    state.advanceBullets([]);
    expect(state.terrain[10][10]).toBe("steel");
    state.bullets = [bullet({ id: 21, team: "player", ownerId: 1, x: 77, y: 82, speedPerTick: 1, canBreakSteel: true })];
    state.advanceBullets([]);
    expect(state.terrain[10][10]).toBe("empty");
  });

  it("BI-05/06/07 passes grass and water, only clearing grass with the gun ability", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [];
    state.terrain[10][10] = "grass";
    state.terrain[10][11] = "water";
    state.bullets = [bullet({ id: 20, team: "player", ownerId: 1, x: 77, y: 82, speedPerTick: 12 })];
    state.advanceBullets([]);
    expect(state.terrain[10][10]).toBe("grass");
    expect(state.terrain[10][11]).toBe("water");
    state.bullets = [bullet({ id: 21, team: "player", ownerId: 1, x: 77, y: 82, speedPerTick: 12, canBreakGrass: true })];
    state.advanceBullets([]);
    expect(state.terrain[10][10]).toBe("empty");
    expect(state.terrain[10][11]).toBe("water");
  });

  it("BI-08 destroys headquarters for either team", () => {
    for (const team of ["player", "enemy"] as const) {
      const game = newGame();
      const state = access(game);
      state.tanks = [];
      state.bullets = [bullet({ id: 20, team, ownerId: 1, x: 92, y: 198, speedPerTick: 2 })];
      const events: SimulationEvent[] = [];
      state.advanceBullets(events);
      expect(state.hqAlive).toBe(false);
      expect(events).toContainEqual({ type: "explosion", target: "hq" });
    }
  });
});

describe("BI-09 through BI-21 entity interactions", () => {
  it("BI-09/10 destroys unarmored enemies and cumulatively removes armor", () => {
    const game = newGame();
    const state = access(game);
    const owner = playerTank(1, 1, 0, 80);
    const enemy = tank({ id: 10, team: "enemy", kind: "heavy", x: 80, y: 80, armor: 3, redArmor: true });
    state.tanks = [owner, enemy];
    state.bullets = [80, 84, 88].map((y, index) => bullet({ id: 21 + index, team: "player", ownerId: 1, x: 75, y }));
    state.advanceBullets([]);
    expect(state.tanks.find((candidate) => candidate.id === 10)?.armor).toBe(0);
    state.bullets = [bullet({ id: 30, team: "player", ownerId: 1, x: 75, y: 92 })];
    state.advanceBullets([]);
    expect(state.tanks.some((candidate) => candidate.id === 10)).toBe(false);
    expect(state.players[0].score).toBe(400);
  });

  it("BI-11/12/18/19 applies invincibility, then boat, gun armor, power armor, and death", () => {
    const game = newGame();
    const state = access(game);
    const player = state.players[0];
    const target = playerTank(1, 1, 80, 80);
    state.tanks = [target];
    player.invincibleTicks = 1;
    player.hasBoat = true;
    player.hasGunArmor = true;
    player.power = 4;
    state.damagePlayer(target, 1, []);
    expect(player).toMatchObject({ hasBoat: true, hasGunArmor: true, power: 4 });
    player.invincibleTicks = 0;
    state.damagePlayer(target, 3, []);
    expect(player).toMatchObject({ hasBoat: false, hasGunArmor: false, power: 3 });
    state.damagePlayer(target, 1, []);
    expect(state.tanks).toHaveLength(0);
    expect(player.respawnTicks).toBe(CONFIG.respawnDelayTicks);
  });

  it("BI-13/14/16 lets bullets pass allies and items", () => {
    const game = newGame(2);
    const state = access(game);
    state.tanks = [playerTank(1, 1, 0, 80), playerTank(2, 2, 80, 80), tank({ id: 3, team: "enemy", kind: "normal", x: 80, y: 120 })];
    state.item = { kind: "star", column: 5, row: 10 };
    state.bullets = [
      bullet({ id: 20, team: "player", ownerId: 1, x: 75, y: 86 }),
      bullet({ id: 21, team: "enemy", ownerId: 3, x: 75, y: 126 }),
      bullet({ id: 22, team: "player", ownerId: 1, x: 37, y: 82 }),
    ];
    state.advanceBullets([]);
    expect(state.tanks).toHaveLength(3);
    expect(state.bullets).toHaveLength(3);
    expect(state.item).toEqual({ kind: "star", column: 5, row: 10 });
  });

  it("BI-15 removes both bullets for every team pairing", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [];
    state.bullets = [
      bullet({ id: 20, team: "player", ownerId: 1, x: 78, y: 80, direction: "right" }),
      bullet({ id: 21, team: "enemy", ownerId: 2, x: 82, y: 80, direction: "left" }),
    ];
    const events: SimulationEvent[] = [];
    state.advanceBullets(events);
    expect(state.bullets).toHaveLength(0);
    expect(events.filter((event) => event.type === "impact" && event.target === "bullet")).toHaveLength(2);
  });

  it("BI-15 does not collide separated bullets merely because their tick paths overlap at different times", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [];
    state.bullets = [
      bullet({ id: 20, team: "player", ownerId: 1, x: 60, y: 80, direction: "right", speedPerTick: 3 }),
      bullet({ id: 21, team: "player", ownerId: 2, x: 65, y: 80, direction: "right", speedPerTick: 3 }),
    ];
    state.advanceBullets([]);
    expect(state.bullets).toHaveLength(2);
  });

  it("BI-17 removes a bullet at the field boundary", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [];
    state.bullets = [bullet({ id: 20, team: "player", ownerId: 1, x: 204, y: 80, direction: "right" })];
    state.advanceBullets([]);
    expect(state.bullets).toHaveLength(0);
  });

  it("BI-20 gives headquarters failure priority over the final enemy", () => {
    const game = newGame();
    const state = access(game);
    state.enemiesDestroyed = 19;
    state.enemyQueue = [];
    state.tanks = [playerTank(1, 1, 0, 80), tank({ id: 10, team: "enemy", kind: "normal", x: 80, y: 80 })];
    state.bullets = [
      bullet({ id: 20, team: "player", ownerId: 1, x: 75, y: 86 }),
      bullet({ id: 21, team: "enemy", ownerId: 10, x: 92, y: 198 }),
    ];
    state.advanceBullets([]);
    game.tick(NO_INPUT);
    expect(game.getSnapshot()).toMatchObject({ scene: "gameOver", hqAlive: false, enemiesDestroyed: 20 });
  });

  it("BI-21 consumes every contacting bullet and applies cumulative damage without transfer", () => {
    const game = newGame(2);
    const state = access(game);
    const enemy = tank({ id: 10, team: "enemy", kind: "heavy", x: 80, y: 80, armor: 3 });
    state.tanks = [playerTank(1, 1, 0, 80), playerTank(2, 2, 0, 96), enemy];
    state.bullets = [80, 84, 88, 92].map((y, index) => bullet({
      id: 20 + index,
      team: "player",
      ownerId: index % 2 === 0 ? 2 : 1,
      x: 75,
      y,
    }));
    state.advanceBullets([]);
    expect(state.tanks.some((candidate) => candidate.id === 10)).toBe(false);
    expect(state.bullets).toHaveLength(0);
    expect(state.players[0].score).toBe(400);
    expect(state.players[1].score).toBe(0);
    expect(state.enemiesDestroyed).toBe(1);
  });

  it("keeps score attribution when the shooter is destroyed in the same tick", () => {
    const game = newGame();
    const state = access(game);
    state.players[0].respawnsRemaining = 0;
    state.tanks = [
      playerTank(1, 1, 80, 80),
      tank({ id: 10, team: "enemy", kind: "normal", x: 120, y: 80 }),
    ];
    state.bullets = [
      bullet({ id: 20, team: "enemy", ownerId: 10, x: 97, y: 86, direction: "left" }),
      bullet({ id: 21, team: "player", ownerId: 1, ownerPlayerId: 1, x: 115, y: 86, direction: "right" }),
    ];
    state.advanceBullets([]);
    expect(state.tanks).toHaveLength(0);
    expect(state.players[0].score).toBe(100);
  });

  it("settles the same facts identically regardless of entity array order", () => {
    const first = newGame();
    const second = newGame();
    for (const game of [first, second]) {
      const state = access(game);
      state.tanks = [playerTank(1, 1, 0, 80), tank({ id: 10, team: "enemy", kind: "normal", x: 80, y: 80, armor: 1 })];
      state.bullets = [
        bullet({ id: 20, team: "player", ownerId: 1, ownerPlayerId: 1, x: 75, y: 80 }),
        bullet({ id: 21, team: "player", ownerId: 1, ownerPlayerId: 1, x: 75, y: 88 }),
      ];
    }
    access(second).tanks.reverse();
    access(second).bullets.reverse();
    access(first).advanceBullets([]);
    access(second).advanceBullets([]);
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
  });
});

describe("items, lives, enemies, and stage state", () => {
  it("implements every player item and awards item score", () => {
    const game = newGame();
    const state = access(game);
    state.tanks = [playerTank(1, 1, 64, 176)];
    state.item = { kind: "star", column: 8, row: 22 };
    const events: SimulationEvent[] = [];
    state.collectItem(events);
    expect(state.players[0]).toMatchObject({ score: 500, power: 3 });
    expect(events).toContainEqual({ type: "itemPicked", playerId: 1, item: "star" });

    state.applyItem(state.players[0], "gun", []);
    state.applyItem(state.players[0], "gun", []);
    state.players[0].power = 3;
    state.applyItem(state.players[0], "gun", []);
    state.applyItem(state.players[0], "boat", []);
    state.applyItem(state.players[0], "helmet", []);
    state.applyItem(state.players[0], "life", []);
    state.applyItem(state.players[0], "clock", []);
    state.applyItem(state.players[0], "shovel", []);
    expect(state.players[0]).toMatchObject({ power: 3, gunCount: 2, hasGunArmor: true, canBreakGrass: true, hasBoat: true, invincibleTicks: 600, respawnsRemaining: 4 });
    expect(state.clockTicks).toBe(600);
    expect(state.shovelTicks).toBe(1200);
    expect(state.terrain[23].slice(11, 15)).toEqual(["steel", "steel", "steel", "steel"]);

    const enemy = tank({ id: 10, team: "enemy", kind: "normal", x: 80, y: 80, flashing: true });
    state.tanks.push(enemy);
    state.bullets = [bullet({ id: 30, team: "enemy", ownerId: 10, x: 120, y: 120 })];
    state.applyItem(state.players[0], "bomb", events);
    expect(state.tanks.some((candidate) => candidate.id === 10)).toBe(false);
    expect(state.enemiesDestroyed).toBe(1);
    expect(state.item).toBeNull();
    expect(state.bullets).toHaveLength(1);
  });

  it("gives an exactly tied item contact to 1P and ignores enemies", () => {
    const game = newGame(2);
    const state = access(game);
    state.tanks = [
      playerTank(1, 1, 64, 80),
      playerTank(2, 2, 64, 80),
      tank({ id: 3, team: "enemy", kind: "normal", x: 64, y: 80 }),
    ];
    state.item = { kind: "life", column: 8, row: 10 };
    state.collectItem([]);
    expect(state.players[0]).toMatchObject({ score: 500, respawnsRemaining: 4 });
    expect(state.players[1]).toMatchObject({ score: 0, respawnsRemaining: 3 });
  });

  it("marks spawn ordinals 4, 11, and 18 as flashing in a 20-enemy stage queue", () => {
    const game = newGame();
    const state = access(game);
    const active = state.tanks.filter((candidate) => candidate.team === "enemy");
    expect(active).toHaveLength(3);
    expect(active.every((enemy) => !enemy.flashing)).toBe(true);
    expect(state.enemyQueue.map((enemy, index) => enemy.flashing ? index + 4 : null).filter(Boolean)).toEqual([4, 11, 18]);
    const kinds = [...active.map((enemy) => enemy.kind), ...state.enemyQueue.map((enemy) => enemy.kind)];
    expect(kinds).toHaveLength(20);
    expect(kinds.filter((kind) => kind === "normal")).toHaveLength(8);
    expect(kinds.filter((kind) => kind === "fast")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "shooter")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "heavy")).toHaveLength(4);
  });

  it("refreshes timed items and restores the map-defined headquarters surround", () => {
    const ring = [
      ...[11, 12, 13, 14].map((column) => ({ column, row: 23, tile: "brick" as const })),
      { column: 11, row: 24, tile: "brick" as const },
      { column: 14, row: 24, tile: "brick" as const },
      { column: 11, row: 25, tile: "brick" as const },
      { column: 14, row: 25, tile: "brick" as const },
    ];
    const game = new Simulation({ playerCount: 1, maps: makeMaps(ring), seed: 1 });
    const state = access(game);
    state.applyItem(state.players[0], "shovel", []);
    state.terrain[23][11] = "empty";
    state.applyItem(state.players[0], "shovel", []);
    expect(state.terrain[23][11]).toBe("steel");
    for (let tick = 0; tick < CONFIG.shovelTicks; tick += 1) state.advanceEffectsAndCooldowns();
    expect(state.terrain[23].slice(11, 15)).toEqual(["brick", "brick", "brick", "brick"]);
  });

  it("preserves an active player's equipment and freely returns an eliminated teammate across stages", () => {
    const game = newGame(2);
    const state = access(game);
    state.players[0].power = 6;
    state.players[0].hasBoat = true;
    state.players[1].score = 900;
    state.players[1].power = 5;
    state.players[1].respawnsRemaining = 0;
    state.players[1].eliminated = true;
    state.tanks = state.tanks.filter((candidate) => candidate.playerId !== 2);
    state.startStage(2, false);
    expect(state.players[0]).toMatchObject({ power: 6, hasBoat: true, respawnsRemaining: 3 });
    expect(state.players[1]).toMatchObject({ score: 900, power: 2, hasBoat: false, respawnsRemaining: 0, eliminated: false });
    expect(game.getSnapshot()).toMatchObject({ stage: 2, scene: "playing" });
  });

  it("breaks score thresholds repeatedly", () => {
    const game = newGame();
    const state = access(game);
    state.addScore(state.players[0], 40_000);
    expect(state.players[0]).toMatchObject({ score: 40_000, respawnsRemaining: 5, nextLifeScore: 60_000 });
  });

  it("respawns after one second and supports repeated-player borrow semantics", () => {
    const game = newGame(2);
    const state = access(game);
    state.tanks = [playerTank(1, 1, 64, 176), playerTank(2, 2, 128, 176)];
    state.destroyPlayerTank(state.tanks[0], []);
    for (let tick = 0; tick < 60; tick += 1) state.advanceRespawns();
    expect(state.players[0]).toMatchObject({ respawnsRemaining: 2, invincibleTicks: 180, eliminated: false });
    expect(state.tanks.some((candidate) => candidate.playerId === 1)).toBe(true);

    const returned = state.tanks.find((candidate) => candidate.playerId === 1)!;
    state.players[0].respawnsRemaining = 0;
    state.destroyPlayerTank(returned, []);
    for (let tick = 0; tick < 60; tick += 1) state.advanceRespawns();
    expect(state.players[0].eliminated).toBe(true);
    const lenderLives = state.players[1].respawnsRemaining;
    game.tick({ ...NO_INPUT, player1: { ...NO_INPUT.player1, borrowLifePressed: true } });
    expect(state.players[1].respawnsRemaining).toBe(lenderLives - 1);
    expect(state.players[0]).toMatchObject({ eliminated: false, power: 2, respawnsRemaining: 0, invincibleTicks: 179 });
  });

  it("spawns at most the configured enemy limit every two seconds", () => {
    const game = newGame();
    const state = access(game);
    state.clockTicks = 1_000;
    expect(game.getSnapshot().enemiesActive).toBe(3);
    for (let tick = 0; tick < 120; tick += 1) game.tick(NO_INPUT);
    expect(game.getSnapshot().enemiesActive).toBeLessThanOrEqual(4);
    expect(game.getSnapshot().enemiesQueued).toBeLessThanOrEqual(16);
    expect(state.enemyQueue.length + game.getSnapshot().enemiesActive + game.getSnapshot().enemiesDestroyed).toBe(20);
  });

  it("can destroy twenty enemies through collision settlement and enter stage clear", () => {
    const game = newGame();
    const state = access(game);
    const owner = playerTank(1, 1, 0, 80);
    state.tanks = [owner];
    state.enemyQueue = [];
    for (let ordinal = 1; ordinal <= 20; ordinal += 1) {
      const enemy = tank({ id: 100 + ordinal, team: "enemy", kind: "normal", x: 80, y: 80, flashing: ordinal === 4 });
      state.tanks.push(enemy);
      state.bullets = [bullet({ id: 200 + ordinal, team: "player", ownerId: 1, ownerPlayerId: 1, x: 75, y: 86 })];
      state.advanceBullets([]);
      if (ordinal === 4) expect(state.item).not.toBeNull();
    }
    const result = game.tick(NO_INPUT);
    expect(result.snapshot).toMatchObject({ enemiesDestroyed: 20, enemiesActive: 0, enemiesQueued: 0, scene: "stageClear" });
    expect(result.events).toContainEqual({ type: "stageClear", stage: 1 });
    expect(result.snapshot.players[0].score).toBe(2_000);
  });

  it("holds game over for two seconds and emits the terminal event once", () => {
    const game = newGame();
    const state = access(game);
    state.hqAlive = false;
    expect(game.tick(NO_INPUT)).toMatchObject({ snapshot: { scene: "gameOver" }, events: [] });
    let result = game.tick(NO_INPUT);
    for (let tick = 1; tick < CONFIG.gameOverTicks; tick += 1) result = game.tick(NO_INPUT);
    expect(result.events).toEqual([{ type: "gameOver" }]);
    expect(game.tick(NO_INPUT).events).toEqual([]);
  });

  it("runs stage-clear timing through all three stages and emits completion after the final screen", () => {
    const game = newGame();
    const state = access(game);
    for (const stage of [1, 2, 3]) {
      state.tanks = state.tanks.filter((candidate) => candidate.team === "player");
      state.enemyQueue = [];
      state.enemiesDestroyed = 20;
      const cleared = game.tick(NO_INPUT);
      expect(cleared.events).toContainEqual({ type: "stageClear", stage });
      expect(cleared.snapshot.scene).toBe("stageClear");
      for (let tick = 0; tick < 120; tick += 1) game.tick(NO_INPUT);
      if (stage < 3) expect(game.getSnapshot()).toMatchObject({ stage: stage + 1, scene: "playing" });
    }
    expect(game.getSnapshot().scene).toBe("completed");
    let completion: readonly SimulationEvent[] = [];
    for (let tick = 0; tick < 180; tick += 1) completion = game.tick(NO_INPUT).events;
    expect(completion).toContainEqual({ type: "completed" });
  });
});
