# 规则引擎模块逻辑

更新日期：2026-06-23

## 参考来源

- `sen-ltd/gomoku-ai`：MIT，可迁移或改写规则逻辑并保留署名。
- `scheng20/gomoku-online`：无仓库级 LICENSE，只参考胜负检测对比，不复制实现。

## 学到的逻辑

`sen-ltd/gomoku-ai` 的规则模块值得采用：

- 15x15 棋盘。
- 棋盘状态不可变更新。
- 落子校验独立于 UI。
- 胜负检测只从最后一步向四个方向扩展。
- 满盘检测独立。
- AI 候选点可以复用附近空位搜索。
- 测试覆盖创建棋盘、落子不可变、合法落子、四方向胜负、满盘和候选点。

`scheng20/gomoku-online` 的服务端胜负检测使用全盘字符串/正则扫描。它可作为对比，但我们不采用：

- 它固定了 19x19，和我们的 15x15 不一致。
- 全盘扫描比“从最后一步扩展”更粗。
- 不适合后续禁手、Swap2、服务端权威状态扩展。

## 我们已经采用的基础

当前仓库已实现：

- `createBoard`
- `placeStone`
- `checkWin`
- `isBoardFull`
- `getOpponent`
- 15x15 默认棋盘。
- 从最后一步沿四个方向检测胜负。
- 基础单元测试。

## 下一步要补齐

规则模块：

- `isValidMove(board, point)`。
- `getLegalMoves(board)`。
- `getNearbyMoves(board, radius)`，供 AI 使用。
- `serializeBoard` / `deserializeBoard`，供服务端存储和断线恢复。
- `applyMove(gameState, moveIntent)`，服务端权威入口。
- `getGameResult(board, lastMove, ruleset)`。

规则集：

- `standard`：普通五子棋，五连或以上胜。
- `renju-lite`：预留禁手检测，不在 MVP 默认开启。
- `swap2`：后续公平模式。

测试边界：

- 横、竖、两条斜线。
- 六连普通规则仍算胜。
- 已占位不能落子。
- 越界不能落子。
- 最后一步不是当前棋子时不误判。
- 满盘无胜为平局。
- `getNearbyMoves` 空棋盘返回中心点。

## 数据表示建议

客户端 UI 可以继续用二维数组：

- 易读。
- 适合 React 渲染。
- 测试清晰。

服务端存储可以增加压缩表示：

- 225 长度字符串或小整数数组。
- 方便存数据库、做对局复盘和断线恢复。

## MIT 署名要求

如果后续直接迁移或大幅改写 `sen-ltd/gomoku-ai` 的规则代码，需要在第三方声明中保留：

- 项目名：`gomoku-ai`
- 作者：SEN LLC / SEN 合同会社
- 许可证：MIT
- 来源：https://github.com/sen-ltd/gomoku-ai

## 不复制边界

- 不复制 `scheng20/gomoku-online` 的胜负检测代码。
- 可使用 `sen-ltd/gomoku-ai` 的 MIT 规则逻辑，但要转成 TypeScript、本项目类型和测试风格。
