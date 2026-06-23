# AI Worker 与设置持久化模块逻辑

更新日期：2026-06-23

## 参考来源

- `yyjhao/HTML5-Gomoku`：MIT，可参考 AI Worker、悔棋同步、设置持久化模式。
- `sen-ltd/gomoku-ai`：MIT，可参考简单语言/主题切换状态。

## 学到的逻辑

AI Worker：

- AI 玩家持有一个 Worker。
- 主线程通过消息初始化 AI 的颜色和难度。
- 玩家落子后，主线程向 Worker 发送 watch 消息。
- AI 回合时，主线程发送 compute 消息。
- Worker 计算完成后返回决策点。
- 如果用户悔棋或重开，主线程需要取消旧决策。

悔棋同步：

- 悔棋不只要撤销 UI 棋盘。
- AI 内部状态也必须撤销。
- 如果 AI 正在计算，悔棋后旧结果不能落子。
- 参考项目通过 cancel 计数忽略旧 decision；我们应使用 `requestId` 更清晰。

设置持久化：

- 参考项目把模式、颜色、难度存到 localStorage。
- 初始化时读取配置并应用到 UI。
- 设置变化时立即写入存储。

## 我们要采用的设计

AI Worker 消息：

- `ai:init`
- `ai:sync`
- `ai:move-request`
- `ai:move-result`
- `ai:cancel`
- `ai:error`

每个 AI 请求必须带：

- `requestId`
- `boardVersion`
- `roomId` 或本地游戏 ID
- `player`
- `difficulty`

客户端只接受同时满足以下条件的 AI 结果：

- `requestId` 是当前请求。
- `boardVersion` 仍然是当前版本。
- 对局状态仍是 AI 回合。
- 返回点仍为空位。

持久化设置：

- `preferredLocale`
- `theme`
- `aiDifficulty`
- `playerColor`
- `soundEnabled`
- `lastMode`

存储策略：

- 非敏感偏好用 localStorage。
- 语言和主题可同步写 cookie，减少首屏闪烁。
- 登录用户未来可同步到服务器。

## 黑暗模式和语言偏好的特殊要求

- 根路径默认英语，但用户手动切换后要记住选择。
- 主题默认跟随系统；用户手动切换后覆盖系统。
- 阿拉伯语使用 RTL 页面方向，但棋盘坐标不反转。
- Worker 内部不处理 UI 语言，只返回结构化 reason，由主线程翻译。

## 不复制边界

- 不复制 `yyjhao/HTML5-Gomoku` 的 Worker 代码结构。
- 借鉴消息流和取消思路，用 TypeScript Worker 重写。
