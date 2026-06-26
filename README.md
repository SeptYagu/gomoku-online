# Gomoku Online

五子棋在线对弈网站。目标是先做一个打开即玩的轻量对弈体验，再逐步加入好友房、随机匹配、排行榜、SEO 内容和广告变现。

默认语言为 English，并必须支持联合国六种官方语言：English、中文、Français、Español、Русский、العربية。网站也必须支持浅色/黑暗模式切换。

## 当前状态

当前功能基线：

- Next.js + React + TypeScript 项目骨架已建立。
- 15x15 棋盘、本地双人模式、悔棋、重开、终局锁定和胜线标记已实现。
- 默认 English，并支持 English、中文、Français、Español、Русский、العربية 六语言路由和字典。
- 阿拉伯语页面支持 RTL，棋盘保持 LTR。
- 浅色/黑暗模式切换和本地持久化已实现。
- 人机模式支持 Normal、Hard、Expert、Insane 四档。
- 浏览器端强档 AI 使用 Worker 根候选分片并行搜索，超时返回 best-so-far。
- 当前运行时开局库来自 `data/openings/generated/standard-26-insane-8ply-1s.sgf`，覆盖标准 26 开局、每条 8 手。
- `tools/engine-arena.ts` 可用于引擎对战评测，`tools/generate-opening-book.ts` 可用于生成 SGF 开局库。
- 好友房 MVP 已接入 Socket.IO：支持创建房间、邀请链接、加入房间、双方准备、实时落子、认输、断线提示、刷新恢复和房主重开。
- 好友房对局使用服务端权威状态机，客户端只提交落子坐标和上一手 `moveSeq`。

下一轮建议：

- 继续公开测试准备：邀请试玩，记录移动端误触、断线恢复和在线服务稳定性问题。
- 补多语言 metadata、canonical/alternate 和 sitemap 基础 SEO。
- 为在线房间继续补 Redis Adapter、更稳固的重连 token 和多实例共享状态。
- 继续细化移动端好友房手感和小屏视觉回归。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:3000
```

`npm run dev` 默认启动带 Socket.IO 的自定义 Next server。只需要调试纯 Next dev server 时使用：

```bash
npm run dev:next
```

PowerShell 指定端口示例：

```powershell
$env:PORT='3010'; npm run dev:online
```

## 生产运行

公开测试网址：

```text
http://gomoku.yagu.ddns-ip.net
```

生产部署必须先构建，再启动带 Socket.IO 的自定义 server：

```bash
npm run build
npm start
```

不要用 `npm run start:next` 或直接 `next start` 部署好友房版本；这两种方式不会挂载 `/socket.io`，浏览器会出现 `xhr poll error` 或 `/socket.io` 404。

如果前面有 Nginx/OpenResty 反向代理，确认 `/socket.io/` 和普通页面都代理到同一个 Node 端口，并保留 WebSocket upgrade：

```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 60s;
}

location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

推送 GitHub 后等待 90 秒，再用同一条命令确认真实服务器页面、`/api/version`、Socket.IO polling 入口和 WebSocket upgrade：

```bash
npm run verify:online -- http://gomoku.yagu.ddns-ip.net <expected-version>
```

其中 `<expected-version>` 是页面底部 `version:` 后面的短提交号；也可以省略，只检查当前线上能否返回版本。

部署后也可以跑双客户端三局好友房冒烟，确认创建、加入、ready 自动开局、重开换先、落子同步、悔棋允许/拒绝/禁止连续请求和认输收尾：

```bash
npm run smoke:online-room -- http://gomoku.yagu.ddns-ip.net
```

分享链接改动可用系统 Chrome 做真实页面冒烟：

```bash
npm run smoke:share-url -- http://gomoku.yagu.ddns-ip.net
```

阶段 3 大厅/房间列表通道可跑 REST + Socket.IO 冒烟，确认 `/api/rooms` 和 lobby 增量事件都可用：

```bash
npm run smoke:lobby -- http://gomoku.yagu.ddns-ip.net
```

随机匹配可跑 Socket.IO 冒烟，确认第一个玩家创建等待房、第二个玩家加入同房、第三个玩家不会超员、取消匹配会关闭单人等待房：

```bash
npm run smoke:matchmaking -- http://gomoku.yagu.ddns-ip.net
```

房间列表 UI 可用系统 Chrome 做真实页面冒烟，确认列表里的 Join / Watch 按钮能进入对应房间：

```bash
npm run smoke:lobby-ui -- http://gomoku.yagu.ddns-ip.net
```

房间聊天频道可跑 Socket.IO 冒烟，确认玩家/观战者发言、房内广播、频率限制和非成员拒绝：

```bash
npm run smoke:room-chat -- http://gomoku.yagu.ddns-ip.net
```

公共聊天频道可跑 Socket.IO 冒烟，确认大厅公共消息广播、频率限制和消息校验：

```bash
npm run smoke:public-chat -- http://gomoku.yagu.ddns-ip.net
```

用户状态频道可跑 Socket.IO + REST 冒烟，确认大厅在线用户、房间中、对局中和观战中状态：

```bash
npm run smoke:presence -- http://gomoku.yagu.ddns-ip.net
```

在线棋谱提交可跑 Socket.IO 冒烟，确认双方提交后从 partial 合并为 verified，重复提交不会产生重复记录：

```bash
npm run smoke:game-records -- http://gomoku.yagu.ddns-ip.net
```

Profile / Game records 读回可跑 Socket.IO + REST 冒烟，确认在线对局提交后当前玩家资料能读到胜负统计和最近棋谱：

```bash
npm run smoke:profile-records -- http://gomoku.yagu.ddns-ip.net
```

Profile 页面入口可跑浏览器冒烟，确认注册玩家正式 Profile 页面和 Game records 可从 URL 读回：

```bash
npm run smoke:profile-page -- http://gomoku.yagu.ddns-ip.net
```

排行榜可跑 Socket.IO + REST 冒烟，确认一局 verified 在线棋谱会进入总榜、今日榜和连胜榜：

```bash
npm run smoke:leaderboard -- http://gomoku.yagu.ddns-ip.net
```

账号身份第一版可跑 REST + Socket.IO 冒烟，确认注册账号、账号 token、注册玩家对局棋谱、Profile 和排行榜身份归属：

```bash
npm run smoke:account -- http://gomoku.yagu.ddns-ip.net
```

房间生命周期可跑 Socket.IO 冒烟，确认重复创建会关闭旧房、观战者可补空位、对局中断线 60 秒后判负：

```bash
npm run smoke:room-lifecycle -- http://gomoku.yagu.ddns-ip.net
```

## 验证命令

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

## 引擎对战评测

可以用 arena 让候选引擎和历史基线自动对弈，默认双方都使用 `insane`，并交替先后手：

```bash
npm run arena -- --games 100 --baseline HEAD^ --candidate current --difficulty insane
```

要评测浏览器多 Worker 版本，用 `current-parallel` 作为候选引擎；Windows PowerShell 通过 `npm.cmd` 传 `HEAD^` 时可能被转义，建议直接写明确提交号：

```bash
npm run arena -- --games 10 --baseline 09ea4e5 --candidate current-parallel --difficulty insane
```

随机开局会更早进入搜索，完整 30 秒疯狂档可能跑很久；需要快速采样时可以显式给每步设置评测预算：

```bash
npm run arena -- --games 20 --baseline 09ea4e5 --candidate current-parallel --difficulty insane --random-openings 2 --time-limit-ms 250
```

结果会写入 `.arena-results/latest.json`。报告包含总胜率、先后手胜负、每盘棋谱，以及胜方前 8 手开局线的中心相对坐标汇总，可用于判断优化是否有效并沉淀自有开局库。

默认不预置随机开局，让双方自然使用自己的开局库。需要扩大样本时可以加 `--random-openings 2`，但这会让早盘更早进入搜索，疯狂档耗时会明显增加。

## AI 思考预算

AI 的时间是最大预算，不会固定等待。开局库、必胜/必挡、或搜索提前完成时会立即返回；复杂局面超时后返回当前已完成搜索里的最佳走法。

- Normal：1 秒
- Hard：5 秒
- Expert：10 秒
- Insane：30 秒

浏览器端会按用户设备核心数启用 AI Worker 池。Normal 保持 1 个 Worker；Hard/Expert/Insane 最多使用 2/3/4 个 Worker，并且会保留至少 1 个逻辑核心给页面交互。并行策略是根候选分片搜索：每个 Worker 搜索一部分候选点，主线程按搜索分数、完成深度和节点数合并结果；超时仍使用 best-so-far。

## 开局库推演

开局库推演使用 SGF，不自定义棋谱语法。SGF 根节点使用 `GM[4]` 表示 Gomoku/Renju，`SZ[15]` 表示 15 路棋盘，棋步使用 `B[..]` / `W[..]`。

默认脚本从标准 26 开局前三手出发，每步给当前引擎 1 秒，推演到 8 手并输出 SGF：

```bash
npm run opening-book -- --plies 8 --time-limit-ms 1000 --output data/openings/generated/standard-26-insane-8ply-1s.sgf
```

当前已实装的简单开局库：

- SGF 源资产：`data/openings/generated/standard-26-insane-8ply-1s.sgf`
- 运行时数据：`src/game/opening-book.ts`
- 覆盖：标准 26 开局，每条 8 手。
- 运行时只使用这一套生成库；Normal/Hard/Expert/Insane 分别最多使用 2/4/6/8 手。

快速冒烟可以限制开局数量和时间：

```bash
npm run opening-book -- --limit 2 --plies 5 --time-limit-ms 100 --output .arena-results/opening-book-smoke.sgf
```

## 项目文档

- `WEBSITE_BUILD_PLAN.md`：总体搭建计划。
- `docs/REUSE_EVALUATION.md`：可复用项目评估和许可证边界。
- `docs/STAGE_0_REPORT.md`：阶段 0 执行报告。
- `docs/STAGE_1_REPORT.md`：阶段 1 本地可玩增强执行报告。
- `docs/STAGE_2_REPORT.md`：阶段 2 好友房在线对战执行报告。
- `docs/STAGE_3_PLAN.md`：阶段 3 大厅、观战、聊天、随机匹配、排行榜计划。
- `docs/STAGE_3_PROGRESS.md`：阶段 3 小步骤进度记录。
- `docs/M3_PUBLIC_TEST_PLAN.md`：M3 公开测试执行清单。
- `docs/M3_PUBLIC_TEST_LOG.md`：M3 公开测试问题记录。
- `docs/STANDARD_RESEARCH_WORKFLOW.md`：以后参考项目研究和子代理分工的标准流程。
- `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`：主控、实现子代理、验证子代理的标准开发流程。
- `docs/HANDOFF.md`：当前任务交接文档，方便新窗口接手。
- `docs/logic/`：按模块记录从参考项目提取出的实现逻辑。

## 复用原则

- 商业发布优先，不把 GPL/AGPL 引擎、WASM、权重或数据库资产打包进前端。
- 当前人机引擎为项目内自写 TypeScript 实现，可继续闭源商用；最高档保留更深搜索、更高节点预算和更深分层开局库，但不引入 GPL 外部引擎。
- 无明确许可证的项目只参考产品路径、架构和事件设计，不复制代码。
- MIT 许可项目可迁移/改写代码，但需要保留许可证和署名。
- APK 仅作为体验参考，不进入源码仓库。
