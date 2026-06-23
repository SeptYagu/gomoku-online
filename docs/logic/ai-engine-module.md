# AI 引擎模块逻辑

更新日期：2026-06-23

## 参考来源

- `sen-ltd/gomoku-ai`：MIT，可迁移或改写 AI 逻辑并保留署名。
- `yyjhao/HTML5-Gomoku`：MIT，可参考 Worker、nega-scout、缓存和候选排序。
- `gkoos/gomoku`：本地未见 LICENSE 文件，暂只作为后期强 AI 思路参考，不复制源码。

## 关键文件和证据

`sen-ltd/gomoku-ai`：

- `.research/sen-ltd-gomoku-ai/src/ai.js:13-17`：难度配置。
- `.research/sen-ltd-gomoku-ai/src/ai.js:23-48`：`getAIMove`。
- `.research/sen-ltd-gomoku-ai/src/ai.js:54-96`：`minimax`。
- `.research/sen-ltd-gomoku-ai/src/ai.js:98-109`：terminal 检查。
- `.research/sen-ltd-gomoku-ai/src/ai.js:115-200`：评估函数、棋型评分、移动排序。
- `.research/sen-ltd-gomoku-ai/src/gomoku.js:120-149`：`getNearbyCells` 候选点。
- `.research/sen-ltd-gomoku-ai/tests/ai.test.js:19-123`：AI 测试。
- `.research/sen-ltd-gomoku-ai/LICENSE:1`：MIT，SEN LLC / SEN 合同会社。

`yyjhao/HTML5-Gomoku`：

- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:1-82`：Worker 消息和难度。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:92-239`：增量评分。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:251-258`：候选队列排序。
- `.research/yyjhao-HTML5-Gomoku/js/ai-worker.js:260-364`：cache + nega-scout 搜索。
- `.research/yyjhao-HTML5-Gomoku/license.txt:1`：MIT，Yao Yujian。

## sen-ltd AI 细节

难度配置：

- `easy`：`depth = 1`，随机。
- `medium`：`depth = 2`。
- `hard`：`depth = 4`。
- 未知难度默认 hard。

`getAIMove`：

- 先调用 `getNearbyCells(board, 2)` 生成候选。
- 若候选为空，兜底中心点。
- Easy 从候选点随机。
- Medium/Hard 先 `sortMoves`。
- 对每个候选点假落子。
- 调用 `minimax(depth - 1, false, player, -Infinity, Infinity)`。
- 选最高分。

`minimax`：

- `player` 始终代表 AI，也就是最大化方。
- `isMax` 表示当前层是否轮到 AI。
- 先调用 `isTerminal` 扫全盘任意五连。
- 因为 `isTerminal` 不返回赢家，所以用 `isMax` 推断上一手是谁：
  - `isMax = true`：上一手是对手，对手刚赢，负分。
  - `isMax = false`：上一手是 AI，AI 刚赢，正分。
- 分数加减 `depth`，偏向更快赢、更晚输。
- 深度为 0 或满盘时用 `evaluateBoard`。

搜索细节：

- 最大层落 AI 子。
- 发现 AI 立即胜利，直接返回 `100000 + depth`。
- 最小层落对手子。
- 发现对手立即胜利，直接返回 `-100000 - depth`。
- 每层按当前行动方排序候选。
- 更新 alpha/beta。
- `beta <= alpha` 时剪枝。

## 棋盘评估

`evaluateBoard`：

- `scoreBoard(player) - scoreBoard(opponent) * 1.1`
- 乘以 1.1 表示轻微防守偏置。

`scoreBoard`：

- 扫四个方向：
  - 横
  - 竖
  - 右下斜
  - 左下斜

`scoreLine`：

- 找连续同色 run。
- 每个方向里的 run 起点只计一次。
- 统计 run 两端是否为空。
- 只识别连续棋形，不识别跳三、跳四、复杂双威胁。

初始权重：

- 五连：100000。
- 活四：10000。
- 冲四：1000。
- 闭四：100。
- 活三：1000。
- 眠三：100。
- 活二：100。
- 单子：低正分。

## 候选点策略

`getNearbyCells(board, 2)`：

- 收集所有已有棋子。
- 对每个棋子扫描半径 2 的方形区域。
- 只保留空点。
- Set 去重。
- 空棋盘返回中心点。

效果：

- 15x15 全盘最多 225 空点。
- 第一手后候选通常从 224 降到中心周围 24 个。
- 中盘只搜索棋群附近的战斗区域。

代价：

- 放弃远离棋群的战略点。
- 对阶段 1/6 可接受，因为五子棋直接威胁通常发生在已有棋形附近。

## alpha-beta 与移动排序

alpha-beta 效率取决于好棋先搜。

sen-ltd 做法：

- 顶层和每个 minimax 节点都排序。
- 最大层优先搜 AI 高分点，提高 alpha。
- 最小层按对手视角排序，优先搜对手高威胁点，降低 beta。
- 即时胜利检测提前返回。

成本：

- 排序会产生 `候选数 × evaluateBoard` 的额外开销。
- 深度 3-4 时通常能换来更大剪枝收益。

## tests 覆盖与缺口

已覆盖：

- `scorePattern` 五连最高。
- 活四 > 冲四 > 闭四。
- 活三 > 眠三。
- 活二和单子为正。
- 空盘评估为 0。
- 单子对己方为正。
- 五连局面高分。
- 双方各一子接近 0。
- Easy 返回合法空位。
- Medium 返回合法空位。
- Hard 立即取胜。
- Hard 阻挡边线四连。
- Hard 返回当前空位。

缺口：

- 竖线/斜线即时取胜和阻挡。
- 双冲、双活三。
- 满盘。
- 未知难度 fallback。
- 随机可控性。
- 性能预算。
- Worker 取消。
- 超时 best-so-far。

## yyjhao 可学习点

yyjhao 的 AI：

- 放在 Web Worker 中。
- 通过 `ini`、`watch`、`compute` 消息维护内部棋盘。
- 维护 `scorequeue`。
- 每次 `watch` 后排序。
- `_updateMap` 围绕落子增量更新多个 5 格窗口评分。
- 用 board buffer 字符串做 cache key。
- 搜索是 negamax + nega-scout / null-window 风格。
- 只从排序队列取前若干候选控制分支。

可学习：

- Worker 隔离。
- 请求取消。
- 增量评估。
- transposition table。
- Top-N 候选。
- PVS / NegaScout。

不采用：

- 不复制旧式全局可变 JS。
- 阶段 6 在 TypeScript 版本稳定后逐项吸收思想。

## 阶段实现建议

阶段 1 Easy：

- 空盘中心。
- 先找己方一步胜。
- 再找对手一步胜并阻挡。
- 否则在半径 2 候选里随机。
- 注入 RNG，方便测试。
- 目标 < 50ms。

阶段 1 Normal：

- 先处理必胜/必挡。
- 用一层棋型评分选最高分。
- 性能允许时做 depth 2。
- 目标 < 150ms，最差 < 300ms。
- 候选限制 Top 24-32。

阶段 6 Hard：

- Worker 内运行。
- depth 3-4 minimax/negamax。
- alpha-beta。
- 移动排序。
- 半径 2 候选。
- Top 16-32。
- `requestId` 防旧请求落子。
- 超时返回 best-so-far。
- 桌面 1-2s 内出结果。
- 移动端降深或 500-1000ms fallback Normal。

增强顺序：

- baseline minimax。
- transposition table / Zobrist。
- iterative deepening。
- PVS / NegaScout。
- 增量评估。

## 推荐 API

```ts
type AiDifficulty = "easy" | "normal" | "hard";

type AiRequest = {
  board: Board;
  player: Stone;
  difficulty: AiDifficulty;
  requestId: string;
};

type AiResult = {
  requestId: string;
  move: Point;
  score?: number;
  reason?: "win" | "block" | "search" | "fallback";
};
```

## 测试清单

- 所有方向立即取胜。
- 所有方向阻挡。
- 己方可赢时优先赢，而不是挡。
- 返回空位且不越界。
- 空盘中心。
- 未知难度 fallback。
- 活四/冲四/活三权重。
- 候选点半径和去重。
- alpha-beta 与排序不改变最优结果。
- Hard 超时返回合法 best-so-far。
- Worker 旧请求不会落到新棋盘。
- 中盘局面记录候选数、节点数和耗时。

## 许可证边界

如果迁移或大幅改写 `sen-ltd/gomoku-ai`：

- 项目名：`sen-ltd/gomoku-ai`
- 许可证：MIT
- 作者：SEN LLC / SEN 合同会社
- 来源：https://github.com/sen-ltd/gomoku-ai

如果吸收 `yyjhao/HTML5-Gomoku` 实现代码：

- 项目名：`yyjhao/HTML5-Gomoku`
- 许可证：MIT
- 作者：Yao Yujian
- 来源：https://github.com/yyjhao/HTML5-Gomoku

`gkoos/gomoku`：

- 本地未见 LICENSE 文件。
- 暂不复制源码。
- 只保留强 AI 方向参考。
