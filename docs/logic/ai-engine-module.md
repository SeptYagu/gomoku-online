# AI 引擎模块逻辑

更新日期：2026-06-23

## 参考来源

- `sen-ltd/gomoku-ai`：MIT，可迁移或改写 AI 逻辑并保留署名。
- `yyjhao/HTML5-Gomoku`：MIT，可参考 Worker、nega-scout、缓存和候选排序。
- `gkoos/gomoku`：本地未见 LICENSE 文件，暂只作为后期强 AI 思路参考，不复制源码。

## 学到的逻辑

`sen-ltd/gomoku-ai` 的 AI 结构适合阶段 1/6：

- 难度分层：Easy、Medium、Hard。
- Easy 可以从候选点里随机选。
- Medium/Hard 使用 minimax。
- 使用 alpha-beta pruning。
- 候选点只取已有棋子周围半径 2 的空位。
- 空棋盘优先中心点。
- 棋盘评估用“己方棋型分 - 对手棋型分 × 防守系数”。
- 棋型评分按连子数和开放端数量区分。
- 先对候选点排序，提高 alpha-beta 剪枝效率。
- 测试覆盖立即取胜、阻挡对手四连、返回合法空位。

`yyjhao/HTML5-Gomoku` 的 AI 提供更老但有价值的思路：

- AI 在 Web Worker 中运行，避免阻塞 UI。
- Worker 维护内部棋盘和分数队列。
- 每次落子后增量更新候选点评分。
- 搜索使用 nega-scout / null-window 风格优化。
- 使用缓存避免重复局面计算。
- 悔棋时通知 Worker remove，保持内部状态一致。

## 我们要采用的阶段策略

阶段 1：

- Easy：从附近候选点随机选，但优先立即赢和阻挡对手立即赢。
- Normal：棋型评分，不做深搜索或只做浅层搜索。
- AI 可以先在主线程跑，但每次响应要足够快。

阶段 2/3：

- 引入 Web Worker 承担 Normal/Hard 搜索。
- AI 请求必须可取消，避免用户重开或悔棋后旧结果落到新棋盘。

阶段 6：

- Hard：minimax + alpha-beta。
- 候选点半径 2。
- 棋型评分和移动排序。
- 可选 transposition table。
- 可选 iterative deepening。
- 后续再评估 bitboard/Zobrist。

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

## 棋型评分建议

初始权重：

- 五连：100000。
- 活四：10000。
- 冲四：1000。
- 活三：1000。
- 眠三：100。
- 活二：100。
- 单子：低权重，更多用于中心和连通性偏好。

防守偏好：

- 对手威胁乘以 1.1 或更高，让 AI 更愿意防守。
- 立即胜利优先于防守。
- 对手立即胜利威胁必须强制阻挡，除非己方也有立即胜利。

## 性能约束

- AI 不能阻塞 UI。
- Easy/Normal 目标响应低于 300ms。
- Hard 可以显示 thinking 状态，但要有超时兜底。
- 移动端默认不要跑太深。

## MIT 署名要求

如果迁移或大幅改写 `sen-ltd/gomoku-ai` 或 `yyjhao/HTML5-Gomoku` 的 AI 代码，需要保留：

- 原项目名。
- 作者信息。
- MIT 许可证文本或第三方声明。
- 来源链接。

## 不复制边界

- 暂不复制 `gkoos/gomoku` 源码，除非后续确认仓库许可证文件。
- 所有 AI 代码最终要转为 TypeScript，并适配我们的 `Board`、`Point`、`Stone` 类型。
