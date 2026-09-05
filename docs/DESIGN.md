# 烟山90坦克技术设计

状态：待用户确认

对应需求：p001

适用范围：当前 `01→14` 里程碑；第 1～3 关

---

## 1. 文档职责与效力

本文档是项目唯一的规范性技术设计标准，只规定技术栈、模块边界、公共接口、数据结构、运行机制和集成方式。

- 玩家可见行为、玩法规则、数值、操作语义和验收结果只以 p001 为准。
- Task 只定义范围、依赖和验证，不得复制或覆盖本文档。
- `ARCHITECTURE.md` 只在代码产生后描述真实架构，不作为目标设计来源。
- ADR 只记录长期技术决策的背景；有效结论必须同步到本文档。
- 若实现需要改变公共接口、数据模型、模块边界或运行机制，必须先修订本文档并等待用户确认。
- 若实现发现玩法缺口，必须回到 PRD；不得在本文档或代码中新增需求。

---

## 2. 技术栈与运行形态

- TypeScript、React、Vite。
- Canvas 2D 绘制全部游戏画面，React 只组织页面、Canvas 生命周期和应用场景。
- Vitest 负责单元测试和必要集成测试，TypeScript Compiler 负责类型检查。
- 浏览器 `requestAnimationFrame` 驱动显示，模拟层使用固定步长。
- Web Audio API 合成原创 8 位风格音效。
- 第一版是单前端静态应用，不包含后端、API、数据库、网络通信或持久化。
- 不引入全局状态框架、物理引擎、游戏引擎、CSS 框架或素材运行时依赖。

---

## 3. 模块与依赖

```text
浏览器键盘 / Gamepad API
          │
          ▼
   app/input adapters ──► GameInput
                              │
                              ▼
                    固定步长 loop ──► sim.tick
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                         GameSnapshot          SimulationEvent[]
                              │                       │
                              ▼                       ▼
                         Canvas renderer         audio adapter
```

| 模块 | 目录 | 职责 |
| --- | --- | --- |
| 应用壳 | `frontend/src/app/` | 菜单、人数选择、暂停、设备状态、循环调度和模拟实例生命周期 |
| 输入 | `frontend/src/app/input/` | 键盘与控制器适配、设备分配、方向冲突解析和边沿动作 |
| 绘制 | `frontend/src/app/renderer/` | 只读快照绘制、整数倍缩放和场景提示 |
| 音频 | `frontend/src/app/audio/` | 将模拟事件映射为 Web Audio 合成音效 |
| 模拟 | `frontend/src/sim/` | 战斗状态、规则、碰撞、AI、随机性、计分和关卡状态机 |
| 地图 | `frontend/src/sim/maps/` | 第 1～3 关静态地图数据 |

依赖约束：

- `app` 可以导入 `sim/index.ts`，不得深层导入模拟内部文件。
- `sim` 不得访问 React、DOM、Canvas、Web Audio、Gamepad API 或浏览器时间。
- `renderer` 和 `audio` 只消费模拟公开结果，不修改模拟状态或重算玩法规则。
- `sim` 从 `sim/maps` 读取地图；地图文件不包含运行时代码。

---

## 4. 坐标、时间和随机性

### 4.1 坐标

- Canvas 内部帧缓冲为 256×240。
- 模拟坐标以 208×208 战场左上角为原点，与 Canvas 上的显示偏移解耦。
- 地形使用 26×26 半格，每格 8×8 像素；16×16 大格对应 2×2 半格。
- 坦克碰撞盒为 16×16，子弹碰撞盒为 4×4。
- 内部位置允许小数；碰撞使用原值，绘制时取整到最近像素。

### 4.2 固定步长

- 模拟固定为 60 tick/s。
- 应用循环累加实际时间，每次调用 `tick` 只推进一个 tick。
- 单个渲染帧最多补算 5 tick，超过部分丢弃，避免恢复页面后长时间追帧。
- 暂停时不累加模拟时间，也不调用 `tick`。
- 所有玩法持续时间和冷却在模拟内部转换为整数 tick；换算值集中配置。

### 4.3 确定性随机

- `createGame` 必须接收随机 seed；应用每次新局生成 seed，测试固定 seed。
- 模拟层只能使用状态内的确定性伪随机源，不调用 `Math.random()`。
- 相同地图、seed 和输入序列必须产生相同快照与事件序列。

---

## 5. 模拟层公共接口

`frontend/src/sim/index.ts` 是唯一公开入口，导出下列契约。

```ts
export type Direction = "up" | "right" | "down" | "left";
export type PlayerId = 1 | 2;
export type StageId = 1 | 2 | 3;
export type GameScene = "playing" | "stageClear" | "gameOver" | "completed";

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
  playerCount: 1 | 2;
  maps: readonly StageMap[];
  seed: number;
}

export interface TickResult {
  snapshot: GameSnapshot;
  events: readonly SimulationEvent[];
}

export interface Game {
  tick(input: GameInput): TickResult;
  getSnapshot(): GameSnapshot;
}

export function createGame(options: CreateGameOptions): Game;
```

约束：

- 输入适配层先把多方向按键解析为单一 `move`，模拟层不接收浏览器按键码。
- `Pressed` 字段只在按下边沿出现的第一个 tick 为 `true`；`Held` 字段在持续按住期间为 `true`。
- `tick` 返回推进后的完整快照和本 tick 新产生的事件。
- `getSnapshot` 不推进状态，也不重复返回历史事件。
- 所有公开数组和对象均为只读副本；调用方修改结果不能影响内部状态。

### 5.1 快照

```ts
export type Team = "player" | "enemy";
export type TankKind = "player" | "normal" | "fast" | "shooter" | "heavy";
export type ItemKind =
  | "star" | "gun" | "boat" | "helmet"
  | "shovel" | "life" | "clock" | "bomb";
export type RuntimeTile =
  | "empty" | "brick" | "steel" | "grass"
  | "ice" | "water" | "hq";

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
```

### 5.2 模拟事件

```ts
export type SimulationEvent =
  | { type: "shot"; team: Team; tankId: number }
  | { type: "impact"; target: "terrain" | "tank" | "hq" | "bullet" }
  | { type: "explosion"; target: "player" | "enemy" | "hq" }
  | { type: "itemPicked"; playerId: PlayerId; item: ItemKind }
  | { type: "stageClear"; stage: StageId }
  | { type: "gameOver" }
  | { type: "completed" };
```

- 事件只描述已经发生的事实，不携带音频文件名或绘制指令。
- 应用层不能通过比较相邻快照推断一次性音效事件。

---

## 6. 地图格式

地图必须直接保存 26×26 半格，避免 13×13 大格无法无损表达总部围墙和半格砖块。

```ts
export type MapTile =
  | "empty" | "brick" | "steel" | "grass"
  | "ice" | "water" | "hq";

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
```

地图约束：

- 文件为 `stage-1.json`、`stage-2.json`、`stage-3.json`，各包含 26 行、每行 26 个 tile。
- `id` 与文件名一致且不重复；加载时必须恰好提供 1、2、3 三张地图。
- `hq` 必须构成底部中央的单个 16×16 总部，即一个连续 2×2 半格区域。
- 出生点记录坦克 16×16 碰撞盒的左上半格坐标，必须位于地图内。
- 三个敌人出生点互不重复；两个玩家出生点互不重复；所有出生点覆盖的 2×2 半格必须可通行。
- 总部外围完全由地图 cell 表达，不由模拟层隐式生成。
- 地图加载失败时抛出包含关卡号和具体字段的错误，不自动修复。
- 网上截图不进入仓库；t003 只提交转录后的 JSON。t005 的未来观察若改变布局，先更新 PRD，再修改地图数据。

---

## 7. 模拟运行机制

### 7.1 内部状态

模拟使用单一可变 `GameState`，包含：

- 场景、关卡和 tick。
- 玩家进度、坦克、子弹和当前道具。
- 26×26 可变地形和总部状态。
- 敌人队列、在场数、击毁数和刷新计时。
- 射击冷却、道具效果、复活和过渡计时。
- 确定性随机源状态与递增实体 ID。

内部状态不得通过公共 API 直接暴露。

### 7.2 单 tick 管线

每个 tick 严格按以下阶段执行：

1. 将 `GameInput` 转换为玩家意图。
2. 依据当前状态和随机源生成敌人意图。
3. 计算坦克移动候选和地形、边界、坦克接触事实。
4. 生成新子弹并推进所有子弹，收集碰撞事实。
5. 收集道具接触、效果到期、复活和刷新事实。
6. 稳定排序并结算所有事实。
7. 计算计分、敌人队列和场景转换。
8. 生成只读快照与本 tick 事件。

同 tick 事件必须先收集后结算；数组插入顺序不能改变胜负、伤害或归属。排序键依次为事件阶段、实体 ID 和目标 ID。

### 7.3 移动和碰撞

- 坦克、子弹和道具使用轴对齐碰撞盒。
- 单 tick 位移拆成不超过 1 像素的子步，避免穿过 8×8 地形。
- 地形查询只读取 26×26 运行时网格。
- 碰撞检测只产生接触事实，规则解析器统一修改生命、地形、分数和场景。
- 出生重叠时，候选移动只有在减少重叠面积时才允许穿过对应坦克阻挡。

### 7.4 规则解析和配置

- 移动、伤害、防护、地形破坏、道具、计分、复活、AI 和场景结果全部以 p001 为准。
- 玩法数值集中在 `constants.ts` 的单一只读配置中；配置字段名称表达语义，不散落魔法数字。
- 8 种玩家道具使用显式 `ItemKind` 分发；当前模拟不实现敌人拾取分支。
- 会恢复地形的效果保存激活前的所需半格状态，不从绘制结果反推。
- 需求没有规定且会改变玩家行为、数值或胜负的情况必须回到 PRD。

---

## 8. 应用壳、菜单和输入

### 8.1 应用状态

应用壳维护以下状态：

```ts
type TankLetter =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G"
  | "H" | "I" | "J" | "K" | "L" | "M" | "N";

type AppScene =
  | { type: "tankSelect"; selected: TankLetter }
  | { type: "playerSelect"; tank: TankLetter; selected: "one" | "two" | "construction" }
  | { type: "game"; tank: TankLetter; playerCount: 1 | 2; game: Game }
  | { type: "paused"; previous: "game"; reason: "manual" | "blur" | "controllerDisconnected" };
```

- `TankLetter` 只用于菜单展示；当前 A～N 不改变模拟配置。
- 第一阶段不建立第二组状态。SELECT 事件被输入层识别，但在 `tankSelect` 中不产生状态变化。
- `construction` 确认不产生状态变化。
- 双人开始前由应用壳检查控制器数量；模拟层不访问设备状态。

### 8.2 输入适配

- 键盘、标准 Gamepad 映射和 USB FC fallback 各自实现适配器，输出统一动作。
- 控制器按当前连接顺序分配为控制器 1、2；断线恢复时优先复用原槽位，替代设备可占用空槽位。
- 1P 合并键盘与控制器 1；2P 只读取控制器 2。
- 每个方向记录最近一次按下序号，多个方向同时保持时选择序号最大的方向。
- 浏览器键盘自动重复不得重复产生单发、借命、确认或暂停边沿。
- 失焦、卸载或暂停时清空按键和手柄缓存。
- 输入模块负责菜单动作和游戏动作映射，不实现战斗规则。

### 8.3 暂停

- 暂停由应用壳控制：停止模拟 tick，但仍绘制最近快照和暂停提示。
- 手动暂停、失焦和活动控制器断开共用同一暂停机制。
- 恢复必须收到有效 START/Enter 边沿；恢复帧不把同一按键传给模拟。

---

## 9. 绘制与音频

### 9.1 Canvas

- Canvas 属性固定 `width=256`、`height=240`。
- CSS 使用视口能容纳的最大正整数倍率；小于内部尺寸时保持 1 倍并允许裁切或滚动。
- 设置 `image-rendering: pixelated`，关闭 Canvas `imageSmoothingEnabled`。
- 不按设备像素比改变内部帧缓冲。

### 9.2 绘制顺序

每帧只读取一个完整快照，顺序为：

1. 背景、空地和冰面。
2. 砖、钢板、河流与总部。
3. 道具。
4. 坦克。
5. 子弹、出生和无敌效果。
6. 草地覆盖层。
7. HUD、过渡和暂停提示。

菜单由应用壳直接绘制，不构造伪造的模拟快照。

### 9.3 音频

- 音频模块订阅 `SimulationEvent[]`，用短波形、包络和噪声合成音效。
- 不加载原作采样或音乐文件。
- 浏览器尚未授权音频时缓存“已解锁”状态，但不延迟重放历史事件。
- 音频失败不得中断模拟或绘制。

---

## 10. Task 边界和集成

| Task | 写入范围 | 责任 |
| --- | --- | --- |
| t001 | `frontend/src/sim/`，排除 `maps/` | 模拟、公开 API、地图校验器和规则测试 |
| t002 | `frontend/` 中除 `src/sim/` 外 | 工程、菜单、输入、循环、绘制和音频 |
| t003 | `frontend/src/sim/maps/` | 第 1～3 关 JSON 与地图结构验证 |

- t001、t002、t003 可以独立实施；真实端到端集成需要三者全部存在。
- t002 在 t001 未就绪时可以在 `app/` 内使用符合第 5 节的最小 stub，集成前必须删除。
- t003 不依赖 t005；它按当前批准的临时参考完成地图。t005 只负责未来独立复核。
- t004、t005 不修改实现代码。
- t006 开始前必须先补全 p001 的第二组需求并修订本文档；当前代码不得预建敌人拾取体系或第二组分支。
- 跨越 Task 写入范围的修改必须先获得用户同意。

---

## 11. 错误处理与验证

### 11.1 错误处理

- 非法地图和内部不变量错误立即抛出描述性异常，开发与测试中直接失败。
- 输入、Gamepad 或 Web Audio 的暂时异常不得修改模拟状态。
- 第一版不做遥测、远程日志或错误上报。

### 11.2 自动测试

模拟层必须覆盖：

- 地图验证、半格碰撞和可破坏地形。
- p001 的移动、射击、防护、道具、敌人、计分、复活、借命和场景规则。
- BI-01～BI-21 当前采用规则。
- 相同 seed 和输入的确定性。
- 同 tick 结算不依赖实体数组顺序。

应用层必须覆盖：

- 玩法选择、人数选择、CONSTRUCTION 无响应和第一阶段 SELECT 无响应。
- 键盘、标准手柄、FC fallback、设备分配和方向优先级。
- 失焦、手动暂停、控制器断开和恢复。
- 固定步长在不同渲染帧率下推进一致。
- Canvas 内部尺寸、整数倍缩放和事件到音效的映射。

最终自动验证：

1. TypeScript Compiler 通过。
2. Vitest 全部通过。
3. Vite 生产构建通过。
4. 实际启动后完成玩法选择、人数选择、进入战斗及一次过关或失败流程。
5. 第 1～3 关全部可加载并连续切换。

---

## 12. 设计变更流程

1. 玩家可见需求变化先更新 p001 并由用户确认。
2. 技术设计变化先更新本文档并由用户确认。
3. 用户分配 Task 后才允许修改对应代码范围。
4. 实现产生真实架构后创建或更新 `docs/ARCHITECTURE.md`。
5. Task、ADR、代码注释和聊天记录不得成为另一套技术标准。
