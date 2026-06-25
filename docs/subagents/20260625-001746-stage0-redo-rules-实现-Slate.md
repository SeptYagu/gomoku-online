时间编号：20260625-001746
任务 ID：20260625-001746-stage0-redo-rules
代理角色：实现子代理
agent id：codex-gpt5-impl-slate
昵称：Slate
状态：完成
写入范围：src/game/board.ts、src/game/board.test.ts、docs/subagents/20260625-001746-stage0-redo-rules-实现-Slate.md

## 任务目标

补齐新版阶段 0 的规则模块接口和测试，使规则模块具备清晰可复用 API，并修正普通五子棋长连胜线不应截断 lastMove 的语义。

## 实际完成

- 新增 `isValidMove(board, point): boolean`。
- 新增 `getEmptyCells(board): Point[]`。
- 新增 `getLegalMoves(board): Point[]`，作为空点合法落子别名，便于阶段 1 调用。
- 新增 `getNearbyMoves(board, radius = 2): Point[]`，支持空盘中心点、已有棋子周边候选、去重、边界裁剪和半径归一。
- 新增 `getWinLine(board, lastMove, stone): Point[] | null`，验证 lastMove 必须在棋盘内且为对应棋子。
- 新增 `hasWon(board, lastMove, stone): boolean`。
- 新增 `getGameResult(board, lastMove, stone): GameStatus`。
- 修正 `checkWin`，改为委托 `getWinLine`，五连或以上获胜时返回完整连续线，不再 `slice(0, 5)` 截断长连。

## 修改文件

- `src/game/board.ts`
- `src/game/board.test.ts`
- `docs/subagents/20260625-001746-stage0-redo-rules-实现-Slate.md`

## 验证结果

- `npm test`：通过，1 个测试文件，16 个测试用例。
- `git diff --check`：通过；仅有 Git LF/CRLF 工作副本提示，无 whitespace error。

## 覆盖项

- 越界落子、占用点、合法点。
- 空点枚举和 `getLegalMoves` 别名。
- nearby 候选：空盘中心、去重、边界裁剪、占用排除、半径 0。
- 横向、纵向、两条斜线胜利。
- 四连、断点、空 lastMove、对手棋 lastMove 不误判。
- 六连和 lastMove 在线尾/线中时返回完整胜线且包含 lastMove。
- `getGameResult` 的胜负、平局、继续。

## 未覆盖项

- 未做 UI/浏览器验证，本任务只修改规则模块。
- 未运行 `npm run lint` 或 `npm run build`，派发任务只要求 `npm test` 和 `git diff --check`。
- 工作区存在其他不属于本任务范围的改动，本实现未触碰禁止范围文件。

## 交接建议

- 后续 UI 状态机可以从 `checkWin + isBoardFull` 逐步迁移到 `getGameResult`。
- 如果后续引入禁手、Renju 或 Swap2，建议不要改变当前普通五子棋 API，而是在更高层增加规则集参数或策略函数。
