# 当前架构

本文档描述仓库中已经实现的系统。规范性技术设计仍以 `docs/DESIGN.md` 为准。

## 运行形态

项目当前是一个纯浏览器静态前端：React 负责挂载应用，Vite 负责开发与构建，Canvas 2D 绘制完整游戏画面，Web Audio API 在浏览器内合成音效。没有后端、API、数据库、网络通信或持久化。

前端入口是 `frontend/src/main.tsx`，应用根组件是 `frontend/src/app/TankApp.tsx`。

## 模块

| 模块 | 路径 | 当前职责 |
| --- | --- | --- |
| 应用壳 | `frontend/src/app/` | 管理玩法选择、人数选择、游戏、暂停与返回菜单；创建模拟实例并调度固定步长循环 |
| 输入 | `frontend/src/app/input/` | 把键盘、标准 Gamepad 和 USB FC fallback 转换成统一菜单动作与 `GameInput` |
| 循环 | `frontend/src/app/loop/` | 用 `requestAnimationFrame` 累积时间，以 60 tick/s 推进模拟，单帧最多补算 5 tick |
| 绘制 | `frontend/src/app/renderer/` | 从应用场景和只读 `GameSnapshot` 绘制 256×240 Canvas、HUD 与提示 |
| 音频 | `frontend/src/app/audio/` | 消费 `SimulationEvent[]`，使用 Web Audio 合成短音效 |
| 模拟 | `frontend/src/sim/` | 维护确定性战斗状态，执行移动、碰撞、射击、AI、道具、计分、复活和三关状态机 |
| 地图 | `frontend/src/sim/maps/` | 保存第 1～3 关的 26×26 半格 JSON 数据及结构测试 |

## 依赖与数据流

`TankApp` 通过 `frontend/src/app/sim.ts` 这一薄入口只访问 `frontend/src/sim/index.ts` 的公开导出。模拟入口同时加载并公开三张发布地图；应用创建新局时传入这三张地图、人数和随机 seed。

每个动画帧中，输入模块先产生统一输入；固定步长循环调用 `Game.tick()`；返回的完整快照供绘制器读取，一次性事件交给音频模块。模拟层不访问 React、DOM、Canvas、Web Audio、Gamepad API 或浏览器时钟。

模拟发出最终 `gameOver` 或 `completed` 事件后，应用壳销毁当前局引用并返回 `TANK A`～`TANK N` 玩法选择页。

## 公共接口与数据

模拟层唯一入口为 `frontend/src/sim/index.ts`：

- `createGame(options)` 创建实现 `Game` 接口的确定性模拟实例。
- `publishedStageMaps` 提供按 1、2、3 排列的发布地图，只作为 `createGame` 的输入。
- `Game.tick(input)` 推进一个固定 tick，返回 `GameSnapshot` 和本 tick 的 `SimulationEvent[]`。
- `Game.getSnapshot()` 返回不推进状态的只读副本。

运行时核心数据包括玩家、坦克、子弹、当前道具、26×26 可变地形、总部状态、敌人队列、计时器与确定性随机源状态。地图在创建新局时完成结构校验；非法地图直接抛错。

## 构建与验证

前端依赖由 `frontend/package-lock.json` 锁定。常用命令在 `frontend/` 下执行：

- `npm run dev`：启动 Vite 开发服务器。
- `npm run typecheck`：执行 TypeScript 静态检查。
- `npm test`：运行 Vitest。
- `npm run build`：类型检查后生成 `frontend/dist/` 静态产物。
