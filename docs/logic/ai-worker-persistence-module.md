# AI Worker 与设置持久化模块逻辑

更新日期：2026-06-25

## 参考来源

- `yyjhao/HTML5-Gomoku`：MIT，可参考 AI Worker、悔棋同步、设置持久化模式。
- `sen-ltd/gomoku-ai`：MIT，可参考简单语言/主题切换状态。

## 关键文件和证据

`yyjhao/HTML5-Gomoku`：

- `.research/yyjhao-HTML5-Gomoku/js/Player.js:2-19`：`Player` 基类。
- `.research/yyjhao-HTML5-Gomoku/js/Player.js:21-33`：`HumanPlayer`。
- `.research/yyjhao-HTML5-Gomoku/js/Player.js:35-69`：`AIPlayer` 创建 Worker、注册消息、发送 `ini`。
- `.research/yyjhao-HTML5-Gomoku/js/Player.js:74-118`：AI 回合、`watch`、开局快捷落子、`compute`。
- `.research/yyjhao-HTML5-Gomoku/js/Game.js:34-50`：`update` 和 `progress`。
- `.research/yyjhao-HTML5-Gomoku/js/Game.js:52-72`：`setGo`。
- `.research/yyjhao-HTML5-Gomoku/js/Game.js:75-100`：`undo`。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:1-16`：Worker 消息入口。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:18-45`：`mapPoint`、`map`、`scorequeue`、`boardBuf`。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:92-239`：增量评分。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:262-364`：nega-scout 搜索和 `decision`。
- `.research/yyjhao-HTML5-Gomoku/js/storage.js:1-33`：localStorage records 封装。
- `.research/yyjhao-HTML5-Gomoku/js/storage.js:35-58`：持久化项。
- `.research/yyjhao-HTML5-Gomoku/js/interface.js:28-50`：新开局 terminate 旧 worker。
- `.research/yyjhao-HTML5-Gomoku/license.txt:1-11`：MIT，Yao Yujian。

本项目现状：

- `src/game/types.ts:1-20`：当前 `Stone`、`Board`、`Point`、`Move`。
- `src/components/GameShell.tsx:15-69`：当前只有本地双人状态、落子和重开，无 AI Worker/持久化。

## Player / AIPlayer 协作

`Player` 基类：

- 持有 `color`。
- `myTurn()` 设置当前颜色、提示文字和棋子颜色。
- `setGo(r,c)` 调用 `game.setGo(r,c,this.color)`。
- `watch()` 是空函数，供 AI 覆盖。

`HumanPlayer`：

- 回合开始时调用基类逻辑。
- 调用 `game.toHuman(color)` 开启棋盘点击。
- 如果对手是 AI，提示改成 Your turn。

`AIPlayer`：

- 构造时创建 `new Worker("js/ai-worker.js")`。
- 注册 `worker.onmessage`。
- 发送初始化消息：
  - `type: "ini"`
  - `color`
  - `mode`

AI 回合：

- 禁用棋盘点击。
- 显示 Thinking。
- 调用 `move()`。

开局特判：

- 第 0 手直接下中心 `7,7`。
- 第 1 手在中心周围 3x3 随机尝试。
- 之后发送 `type: "compute"` 给 Worker。

Worker 返回：

- `starting`：主线程 `computing = true`。
- `decision`：主线程 `computing = false`。
- 如果 `cancel > 0`，递减并忽略结果。
- 否则调用 `setGo` 落子。

## Game 流程

`setGo(r,c,color)`：

- 是唯一落子入口。
- 检查游戏进行中。
- 检查目标是否已占用。
- 写 history。
- 高亮棋盘。
- 实际落子。
- 判断 draw/win。
- 未结束则调用 `update()`。

`update(r,c,color)`：

- `rounds++`。
- `board.updateMap(r,c,color)`。
- 通知黑白双方 `watch(r,c,color)`。
- `setTimeout(progress, 0)` 切回合。

`progress()`：

- 根据当前颜色调用另一方 `myTurn()`。
- 当前颜色真正由对应 `Player.myTurn()` 设置。

`undo()`：

- 撤销棋盘。
- 对每个撤销点通知双方 `watch(r,c,"remove")`。
- 如果 AI 正在计算，给该 AI 的 `cancel++`。
- 新开局时直接 terminate 旧 worker，再创建新玩家。

风险：

- `cancel` 不是 Worker 级取消。
- Worker 旧 compute 仍会消耗 CPU。
- `watch remove` 可能要等旧 compute 结束后才处理。
- 如果 `compute` 已发但 `starting` 未回，`computing` 仍 false，undo 可能不会增加 cancel。

## Worker 内部状态

`map`：

- 15x15 的 `mapPoint`。
- 每个点含 `r/c`、`set`、`score`、`info[4]`。

`scorequeue`：

- 保存所有点。
- 每次 `watch` 后按 score 排序。
- 已占用点排后面。
- 搜索只取前 N 个候选。

`boardBuf`：

- `ArrayBuffer(255)` + `Uint8Array`。
- 实际使用前 225 个格子。
- 落子写 `num + 2`。
- 撤销写 0。
- 转字符串作为 cache key。

`_updateMap()`：

- 对落子影响的四个方向、每个长度 5 的窗口增量更新。
- 维护窗口双方棋子数量。
- 如果窗口只有一方棋子，按棋子数给窗口内 5 个点加/减分。
- `scores = [0,1,10,2000,4000,100000000000]`。
- `coe = [-2,1]`，把对手威胁和己方机会纳入同一总分。

搜索：

- `simulate` / `desimulate` 临时落子和撤子。
- `nega` 做 nega-scout / alpha-beta。
- `ai.move()` 清空 cache，发 `starting`，搜 top 20，发 `decision`。

## storage.js 持久化模式

`gameData`：

- `prefix: "yyjhao.gomoku."`
- `records`
- `addRecord(name, defaultVal, applyFunc)`
- `ini()`
- `apply()`

`addRecord`：

- 保存默认值。
- 用 `Object.defineProperty` 定义 getter/setter。
- getter 读 `localStorage[prefix + name]`。
- setter 先执行 `applyFunc(val)`，再写 localStorage。

持久化项：

- `firstTime`
- `mode`
- `color`
- `level`

问题：

- 隐式全局。
- 没有类型转换。
- 没有 schema。
- 没有版本迁移。
- 没有异常处理。
- 写入前先更新 UI，可能造成 UI 和存储不一致。

## 当前实现问题

- 全局变量多。
- 旧式原型继承和 jQuery Mobile。
- 无模块边界。
- 无 TypeScript 类型。
- 取消语义脆弱。
- 无 `requestId`。
- 无 `boardVersion`。
- Worker 状态依赖增量 watch 顺序，缺少完整 sync board 纠偏。
- 悔棋没有同步减少 rounds。
- `ai-worker.js:329` 有疑似笔误 `tmp.score.set`。
- cache key 未显式纳入 depth/player/window。
- storage 不适合 Next/React/SSR。

## 本项目采用方案

### Worker 消息协议

主线程到 Worker：

```ts
type AiWorkerRequest = {
  board: Board;
  moves: Move[];
  aiStone: Stone;
  difficulty: AiDifficulty;
  timeLimitMs: number;
  rootCandidateShard?: {
    index: number;
    total: number;
  };
};
```

Worker 到主线程：

```ts
type AiWorkerResponse = {
  type: "best" | "done";
  point: Point | null;
  score?: number;
  completedDepth?: number;
  nodes?: number;
  source?: AiMoveSource;
};
```

当前采用每次请求传完整棋盘的 stateless Worker 协议，不依赖 Worker 内部增量 watch 状态。旧请求取消通过主线程终止 Worker 池和 `aiRequestId` 双保险实现。

并行 Worker 池：

- Normal：1 个 Worker。
- Hard：最多 2 个 Worker。
- Expert：最多 3 个 Worker。
- Insane：最多 4 个 Worker。
- 实际数量受 `navigator.hardwareConcurrency` 限制，并保留至少 1 个逻辑核心给 UI。
- 多 Worker 时，主线程给每个 Worker 传 `rootCandidateShard`。
- Worker 调用 `chooseAiMoveResult()`，主线程按 `score`、`completedDepth`、`nodes` 和中心距离合并。
- `best` 消息持续刷新页面硬超时可用的 best-so-far。

### 正确性规则

每次发起 AI 请求时递增 `aiRequestIdRef`。

主线程只接受同时满足：

- 当前返回属于最新 `aiRequestIdRef`。
- 当前仍是 playing。
- 当前轮到该 AI/player。
- 返回点通过 `placeStone()` 规则引擎校验。

取消路径：

- undo。
- reset。
- mode change。
- difficulty change。
- first-player change。
- component unmount。

这些路径会递增 `aiRequestIdRef`、清空 thinking 状态、终止当前 Worker 池并清理硬超时定时器。正确性依靠 request id 和落子规则校验；终止 Worker 池主要用于及时释放 CPU。

### 设置持久化

使用 versioned schema，不使用散落 property setter。

推荐 key：

- `gomoku-online.settings.v1`

字段：

- `schemaVersion`
- `preferredLocale`
- `theme`: `system | light | dark`
- `aiDifficulty`: `easy | normal | hard`
- `playerColor`: `black | white`
- `soundEnabled`
- `lastMode`: `local | ai | online`

存储：

- 非敏感偏好放 localStorage。
- 语言和主题同步 cookie，便于 SSR 和防闪烁。
- 登录后可同步到服务器 profile。

## 实现任务清单

- 定义 `AiWorkerIn` / `AiWorkerOut` 类型。
- 实现 AI Worker 初始化、同步、请求、取消。
- GameShell 增加 `gameId` 和 `boardVersion`。
- AI 请求生成 `requestId`。
- 主线程拒绝旧结果。
- 设置持久化加 schema 校验。
- 语言/主题写 cookie + localStorage。
- 新开局 terminate 或重置 worker。

## 测试清单

- AI 旧 request 不会落到新棋盘。
- undo 后旧结果被拒绝。
- reset 后旧结果被拒绝。
- 返回占位点被拒绝。
- boardVersion 不匹配被拒绝。
- Worker error 不破坏 UI。
- 设置缺字段能 fallback 默认值。
- schemaVersion 迁移可用。
- localStorage 异常时不崩溃。

## 许可证边界

`yyjhao/HTML5-Gomoku` 是 MIT：

- 作者：Yao Yujian
- 来源：https://github.com/yyjhao/HTML5-Gomoku

`sen-ltd/gomoku-ai` 是 MIT：

- 作者：SEN LLC / SEN 合同会社
- 来源：https://github.com/sen-ltd/gomoku-ai

如果复制、迁移或大幅改写相关代码，需要在 `THIRD_PARTY_NOTICES.md` 或许可证文件中保留版权和 MIT 许可文本。
