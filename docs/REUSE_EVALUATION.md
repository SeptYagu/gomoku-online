# 阶段 0：可复用项目评估

更新日期：2026-06-23

## 结论

采用“现代自有骨架 + 合法复用 MIT 逻辑 + 参考无许可证项目架构”的路线。

不建议直接 fork 一个旧项目作为主仓库，原因是：

- 目标网站需要广告合规、SEO 内容、移动端体验、未来账号/排行榜/匹配系统，旧项目大多只是 demo。
- 最贴近在线对战的项目没有明确仓库级 LICENSE，不能直接复制代码。
- 可合法复用的 MIT 项目多集中在单机棋盘和 AI，适合作为规则/AI 模块参考或迁移。
- 自己搭现代 TypeScript 骨架更利于后续维护、测试、广告组件和部署。

## 候选项目

### scheng20/gomoku-online

地址：https://github.com/scheng20/gomoku-online

定位：

- React + Node + Express + Socket.IO 的在线五子棋。
- 有创建房间、加入房间、6 位房间码、实时落子同步。

优点：

- 和我们的好友房阶段非常接近。
- 房间和 Socket.IO 事件设计值得参考。
- README 展示的用户路径清楚：创建房间、复制房间码、两人开始。

风险：

- 仓库根目录没有 LICENSE 文件。
- 客户端 `package.json` 标记 private，没有明确代码许可证。
- 技术栈较旧：React 17、Create React App、Bootstrap。

使用方式：

- 只参考产品路径和房间事件模型。
- 不直接复制源码。

### minh100/Gomoku

地址：https://github.com/minh100/Gomoku

定位：

- MERN + Socket.IO 的在线五子棋。
- 有账号、房间列表、私密房、排行榜、评分、离开惩罚。

优点：

- 覆盖我们阶段 3 的账号、排行榜、房间列表和惩罚机制。
- 产品范围比 scheng20 更完整。

风险：

- 仓库根目录没有 LICENSE 文件。
- 技术栈较旧：React 17、CRA、Mongo/Mongoose、旧 Tailwind 兼容包。
- 功能较多，不适合直接作为轻量 MVP 起点。

使用方式：

- 只参考数据模型和用户流程。
- 不直接复制源码。

### sen-ltd/gomoku-ai

地址：https://github.com/sen-ltd/gomoku-ai

定位：

- MIT 许可的浏览器五子棋 AI 项目。
- 零依赖，Canvas 棋盘，带 Node 内置测试。

优点：

- 有明确 MIT LICENSE。
- 结构小：`gomoku.js`、`ai.js`、`main.js`、`i18n.js`。
- 规则、AI、测试拆分清楚。
- AI 有 minimax + alpha-beta pruning、候选点半径过滤、棋型评分。
- 适合迁移成我们的 TypeScript `src/game` 模块。

风险：

- 不是在线对战项目。
- UI 是原生 DOM/Canvas，不是 React/Next。
- 需要转换为 TypeScript 并适配服务端权威状态。

使用方式：

- 作为阶段 1/阶段 6 的规则和 AI 主要参考/可复用来源。
- 若复制或改写实质代码，需要保留 MIT 许可证和署名。

### gkoos/gomoku

地址：https://github.com/gkoos/gomoku

定位：

- Vite + vanilla JavaScript 的响应式五子棋 AI。
- README 声称 MIT，AI 较强，含 Web Worker 和较复杂搜索优化。

优点：

- AI 功能很完整：Web Worker、bitboard、transposition table、Zobrist hashing、iterative deepening。
- 适合作为 Hard AI 后期参考。

风险：

- 本地克隆未看到 LICENSE 文件，只有 README 中提到 MIT。
- `ai-worker.js` 体量大，阶段 0/1 直接引入会过重。
- 复杂 AI 不应成为 MVP 的前置阻塞。

使用方式：

- 后期 Hard AI 参考。
- 在明确许可证前不复制源码。

### dotamir/react-gomoku

地址：https://github.com/dotamir/react-gomoku

定位：

- React + TypeScript 的简单五子棋。

优点：

- 使用 TypeScript，比纯 JS 更接近目标。
- 可参考组件拆分。

风险：

- 没有 LICENSE 文件。
- 技术栈非常旧：React 16、TypeScript 3、Redux、Bootstrap 4。

使用方式：

- 只参考，不复制源码。

### yyjhao/HTML5-Gomoku

地址：https://github.com/yyjhao/HTML5-Gomoku

定位：

- MIT 许可的 HTML5 五子棋 AI。
- 支持移动端和 Web Worker。

优点：

- 有 MIT license 文件。
- AI 走 nega-scout + hash cache + Web Worker。
- 历史较久，说明方向稳定。

风险：

- 代码年代较老，使用 jQuery Mobile。
- UI 和工程体系不适合直接接入现代 Next 项目。

使用方式：

- 可作为 AI Worker 设计参考。
- 若使用代码，需要保留 MIT 许可证和署名。

## 阶段 0 技术决策

主工程采用：

- Next.js + React + TypeScript。
- 棋盘组件先用 CSS Grid 实现稳定原型，后续如移动端手感不够再改 Canvas。
- 游戏规则放在 `src/game`，与 UI 解耦。
- 在线对战服务后续使用 Socket.IO，但阶段 0 只预留目录和事件设计文档。
- 广告组件后续统一封装，阶段 0 不接真实广告。
- 默认语言为 English，并必须支持联合国六种官方语言：English、中文、Français、Español、Русский、العربية。
- i18n 需要从基础架构开始接入，所有 UI、广告合规页和 SEO 内容页都进入翻译体系。
- 阿拉伯语必须支持 RTL 排版，但棋盘坐标和落子逻辑保持一致。
- 浅色/黑暗模式是基础体验要求，使用主题 token 统一控制，不作为后期皮肤功能处理。

复用策略：

- 阶段 1：优先迁移/改写 `sen-ltd/gomoku-ai` 的规则测试思路和简单 AI。
- 阶段 2：参考 `scheng20/gomoku-online` 的房间码和 Socket.IO 房间流程，自写服务端权威状态。
- 阶段 3：参考 `minh100/Gomoku` 的排行榜、房间列表、私密房和离开惩罚设计，自写数据模型。
- 阶段 6：参考 `sen-ltd/gomoku-ai` 与 `gkoos/gomoku` 的 Hard AI 思路，逐步增强。

## 阶段 0 交付标准

- 仓库有现代 Web 项目骨架。
- 首页不是营销页，而是可进入游戏的第一屏。
- 有 15x15 空棋盘组件。
- 有规则模块接口和基础测试。
- 有默认英语和六种语言路由/字典规划。
- 有浅色/黑暗模式主题架构规划。
- 有复用边界记录，避免无许可证代码进入仓库。
- 本地 `npm run lint`、`npm test`、`npm run build` 可以通过。
