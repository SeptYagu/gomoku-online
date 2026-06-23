# 规则引擎模块逻辑

更新日期：2026-06-23

## 参考来源

- `sen-ltd/gomoku-ai`：MIT，可迁移或改写规则逻辑并保留署名。
- `scheng20/gomoku-online`：无仓库级 LICENSE，只参考胜负检测对比，不复制实现。

## 关键文件和证据

`sen-ltd/gomoku-ai`：

- `.research/sen-ltd-gomoku-ai/src/gomoku.js:6-9`：棋盘常量。
- `.research/sen-ltd-gomoku-ai/src/gomoku.js:12-27`：棋盘创建、不可变落子、合法落子。
- `.research/sen-ltd-gomoku-ai/src/gomoku.js:33-59`：`checkWin` 和方向计数。
- `.research/sen-ltd-gomoku-ai/src/gomoku.js:64-93`：`getWinLine` 和连续线收集。
- `.research/sen-ltd-gomoku-ai/src/gomoku.js:96-149`：满盘、空位、附近候选点。
- `.research/sen-ltd-gomoku-ai/tests/gomoku.test.js:23-199`：规则测试。
- `.research/sen-ltd-gomoku-ai/LICENSE:1-13`：MIT 许可证。

对比项目：

- `.research/scheng20-gomoku-online/server/game.js:1-95`：19x19 全盘行列斜线正则扫描。
- `.research/scheng20-gomoku-online/server/package.json:11-12`：server 子包 license metadata，但仓库无顶层 LICENSE。

本项目现状：

- `src/game/types.ts:1-20`：`Stone`、`Cell`、`Board`、`Point`、`GameStatus`、`Move`。
- `src/game/board.ts:3-92`：15x15、边界判断、不可变落子、胜线检测。
- `src/game/board.test.ts:5-59`：当前基础测试。

## sen-ltd 规则实现细节

数据表示：

- board 是 `number[][]`。
- 固定 15x15。
- 坐标是 0-based：`board[row][col]`。
- `EMPTY = 0`。
- `BLACK = 1`。
- `WHITE = 2`。

函数职责：

- `createBoard()`：每行创建独立数组，全部填 `EMPTY`。
- `placeStone(board,row,col,player)`：复制每一行后写入棋子，返回新 board。
- `isValidMove(board,row,col)`：检查坐标在 15x15 内且目标为空。
- `isFull(board)`：双循环，只要发现空位就返回 false。
- `getEmptyCells(board)`：按行优先返回所有空位。
- `getNearbyCells(board,radius=2)`：已有棋子周围 Chebyshev 半径范围内的空位；空盘返回中心。

注意：

- `placeStone` 不做越界和占位校验，调用方必须先校验。
- `isValidMove` 使用固定 `BOARD_SIZE`，不是动态 board 长度。

## checkWin / getWinLine

两者都围绕最后一步扫描四个方向：

- 横向 `[0,1]`
- 纵向 `[1,0]`
- 右下斜线 `[1,1]`
- 左下斜线 `[1,-1]`

`checkWin`：

- 从最后一步开始，`count = 1`。
- 向正方向统计连续同色。
- 向反方向统计连续同色。
- 任意方向 `count >= 5` 即胜。

`getWinLine`：

- 从最后一步开始收集坐标。
- 正方向 `push`。
- 反方向 `unshift`。
- 返回整条连续线。
- 六连时返回 6 个坐标，不截断。

重要契约：

- 它们假设原点已经是该玩家棋子。
- 函数本身不验证 `board[row][col] === player`。
- 我们项目后续应补这个保护，避免空点或对手点误判。

## 测试覆盖与缺口

sen-ltd 已覆盖：

- 创建 15x15。
- 初始全空。
- 落子值正确。
- 落子不改变原 board。
- 合法空位。
- 占位不合法。
- 负坐标和等于 `BOARD_SIZE` 越界。
- 横、竖、两条斜线五连。
- 四连不胜。
- 六连仍胜。
- 传入对手玩家不误判。
- 胜线存在、为空、包含最后落子。
- 空盘/一子/满盘。
- 附近候选点空盘中心、候选全为空、半径约束。

缺口：

- `getEmptyCells` 未测。
- 胜线顺序和精确坐标未测。
- 六连 `getWinLine` 行为未测。
- 最后一步在连续线中间的场景不足。
- 边角五连、右边界、底边界斜线不足。
- 有空洞的棋形不应胜未测。
- 原点为空但两侧相连的契约风险未测。
- `placeStone` 越界/占位无保护未测。
- `getNearbyCells` 多棋子去重、角落裁剪、半径 0/负数/超大半径未测。

## scheng20 对比

scheng20 实现：

- 固定 `size = 19`。
- 行扫描：每行 join 成字符串，再用 `x` 拼接避免跨行误判。
- 列扫描：转置后复用行扫描。
- 两条斜线：从每个格子起取最多 5 个字符。
- 用正则找 `1` 或 `2` 的五连。

不采用理由：

- 尺寸是 19，不符合我们 15x15。
- 全盘扫描比分最后一步增量扫描更粗。
- 只返回 boolean，不返回赢家和胜线。
- 硬编码 `1/2`，不适配我们的 `Stone` 类型。
- 不适合后续禁手、Swap2、服务端权威状态。
- 授权不清晰，不能复制。

## 本项目当前映射

已具备：

- `BOARD_SIZE = 15`。
- `createBoard`。
- `cloneBoard`。
- `isInBounds`。
- `getCell`。
- `placeStone`，并且比 sen-ltd 更强：会抛出越界/占位错误。
- `isBoardFull`。
- `getOpponent`。

需要改进：

- 当前 `checkWin` 返回 `Point[] | null`，合并了 boolean 和胜线语义。
- 当前六连会 `slice(0,5)`，可能在最后一步位于一端时截掉最后落子。
- 应明确胜线返回整线，或返回包含 lastMove 的五子窗口。
- 应验证 `lastMove` 上确实是该 stone。

待补齐：

- `isValidMove(board, point): boolean`
- `getEmptyCells(board): Point[]`
- `getLegalMoves(board): Point[]`
- `getNearbyMoves(board, radius): Point[]`
- `getWinLine(board,lastMove,stone): Point[] | null`
- `hasWon(board,lastMove,stone): boolean`
- `getGameResult(board,lastMove,stone): GameStatus`

## TypeScript API 建议

```ts
export function isValidMove(board: Board, point: Point): boolean;
export function getEmptyCells(board: Board): Point[];
export function getNearbyMoves(board: Board, radius?: number): Point[];
export function getWinLine(board: Board, lastMove: Point, stone: Stone): Point[] | null;
export function hasWon(board: Board, lastMove: Point, stone: Stone): boolean;
export function getGameResult(board: Board, lastMove: Point, stone: Stone): GameStatus;
```

## 测试清单

- 独立行数组。
- 越界落子。
- 占位落子。
- 合法落子 boolean。
- 横、竖、两条斜线。
- 黑白双方。
- 边角胜利。
- 最后一步在线头、线中、线尾。
- 四连 false。
- 空洞 false。
- 原点为空 false。
- 原点是对手棋 false。
- 六连 true 且胜线包含 lastMove。
- 满盘平局。
- 空位数量和坐标。
- 附近候选中心、半径 0/1/2、角落裁剪、多棋子去重、全为空且棋盘内。
- 序列化 round trip。

## 许可证边界

`sen-ltd/gomoku-ai` 是 MIT。

如果迁移或实质性改写规则代码，需要保留：

- 项目名：`gomoku-ai`
- 作者：SEN LLC / SEN 合同会社
- 许可证：MIT
- 来源：https://github.com/sen-ltd/gomoku-ai

`scheng20/gomoku-online` 授权不清晰：

- 不复制 `server/game.js`。
- 只作为“全盘正则扫描方案”的反例/对比。
