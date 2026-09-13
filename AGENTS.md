# AGENTS.md

> 本文件是本仓库智能体（AI Coding Agent）的核心行为准则、工程红线与协作协议中枢。
> 状态记录与历史档案已完全外置，本文件仅保留纯粹的**规则（Rules）**与**流程（Workflows）**。

---

## 1. 核心技术红线与工程规范

### 1.1 核心选型与服务架构
- **技术栈**：Next.js 16 (App Router) + React 19 + TypeScript (ESM) + Socket.IO 4.x + Vitest。
- **服务统一入口**：全栈开发与生产均通过 `src/server/online-server.ts` 联合托管 Next.js 与 Socket.IO 服务。**严禁**随意绕过自定义服务直接运行 `next dev`，否则会导致 WebSocket 握手与长连接失效。
- **外部依赖控制**：严禁未经评估引入任何第三方重量级 UI 组件库、全局状态管理库或外部数学/物理引擎。

### 1.2 架构职责分层与纯函数红线
- `src/game/`（纯函数博弈核心领域）：
  - 五子棋胜负判定、禁手判决（长连、三三、四四）、AI $\alpha\text{-}\beta$ 剪枝搜索模型、开局库匹配必须保持为**纯计算函数**；
  - 严禁在核心算法内引入 React Hook、DOM 操作或全局可变单例状态；
  - AI 思考计算必须通过 `src/game/ai-worker-pool.ts` 复用池调度，严禁未经池化管理直接 `new Worker()`，杜绝内存与线程泄露。
- `src/server/`（网络通信与房间契约）：
  - 负责房间生命周期、匹配池、在线 Presence 聚合与防刷安全；
  - 大厅与房间数据广播必须遵循**单调递增版本号机制**（`lobbyVersion` / `lobbyActivity.version`），客户端按 `incoming === current + 1` 增量消费，检测到跳号时触发全量 resync，严禁假设网络包必定保序到达；
  - 严格遵守访客身份防冒充校验、心跳看门狗与断线 60 秒宽限重连时序。
- `src/components/`（表现层与状态控制）：
  - 业务状态与网络订阅统一收敛于专用 Hook（如 `useFriendRoom.ts`），UI 组件原则上为接收 Props 渲染的纯组件；
  - **React 19 渲染安全**：严禁在 `useEffect` 中缺少依赖守卫直接 `setState` 造成无限重渲染；
  - **无障碍访问（A11y）**：模态弹窗与对局交互必须支持 Escape 关闭与 Tab 焦点循环，且严禁组件挂载时强夺用户正在输入的表单焦点。
- `src/i18n/`（六语种国际化与布局契约）：
  - 严格支持 `["en", "zh", "fr", "es", "ru", "ar"]` 6 种官方语言，任何新增或改动文案必须在 `src/i18n/dictionaries.ts` 中同步补齐，严禁在 TSX 中内联硬编码文本；
  - 样式设计必须严格兼容阿拉伯语（`ar`）的 **RTL（从右向左）镜像排版**，严禁使用硬编码的 `left`/`right` 破坏布局。
- `tools/`（评测与烟测体系）：
  - 保持工具链独立与可用性（`tools/engine-arena.ts`、`tools/smoke-*.ts`），用于 AI 棋力回归与端到端网络场景验证。

---

## 2. 状态获取与交接流程

- **开始任务前的状态读取（Context Bootstrapping）**：
  - 必须首先查看根目录 [`STATUS.md`](STATUS.md) 掌握项目当前所处阶段、基线指标与已知技术债；
  - 查看 [`docs/handoff/INDEX.md`](docs/handoff/INDEX.md) 检索最新一期交接文档（如存在审查报告，以最新一篇为准），快速对齐上下文与已知陷阱。
- **任务完成时的交接沉淀（Handoff Artifacts）**：
  - 阶段交付时，在 `docs/handoff/` 目录下生成标准命名文档（格式：`YYYY-MM-DD-<feature-or-fix>-handoff.md`）；
  - 在 [`docs/handoff/INDEX.md`](docs/handoff/INDEX.md) 顶部追加该交接单记录，并同步刷新 [`STATUS.md`](STATUS.md) 中的最新指标与里程碑。

---

## 3. 本地工程门禁与 Git 同步协议

- **前置同步（Pull First）**：
  - 开始任何代码开发、修复或重构前，必须首先执行 `git pull --ff-only`，确保本地分支与远端保持实时同步；
  - 若工作区存在未提交改动，严禁自动 stash 或丢弃，先向用户报告当前状态。
- **本地门禁验证（Gate Baseline，四道硬指标）**：
  任何代码交付、提交或推送前，必须在本地终端依次完整运行并全绿通过以下四道门禁：
  1. `npx tsc --noEmit`：0 错误（TypeScript 严格类型检查，杜绝使用 `any` 绕过逆变）
  2. `npm run lint`：0 错误 0 警告（ESLint 全量代码规范扫描）
  3. `npm test`：全部通过（Vitest 单元测试套件全绿）
  4. `npm run build`：0 报错（Next.js 生产构建与页面预渲染完全通过）
  - *注：若涉及联机大厅/核心房间逻辑修改，推荐额外运行 `npm run verify:online`。*
- **提交与推送（Push on Delivery）**：
  - 门禁全绿后，仅暂存属于本任务的文件；
  - 执行符合 Conventional Commits 规范的语义化提交（如 `feat(...)`、`fix(...)`、`docs(...)`）；
  - 立即执行 `git push origin <branch>` 推送至远端，向用户汇报提交哈希与变更简报。

---

## 4. 双智能体协同与代码审查闭环（Antigravity ↔ WorkBuddy）

当主开发智能体（Antigravity）完成功能开发或缺陷修复并推送到 Git 后，自动触发 WorkBuddy 独立审查，形成免人工干预的代码质量自愈闭环：

### 4.1 审查派发规则（Dispatch Protocol）
- **目标目录**：仓库根目录 `D:\OneDrive\AiPrograms\gomoku-online`。
- **派发方式**：调用 WorkBuddy 工具或 CLI，**必须显式绑定参数 `--cwd "D:\OneDrive\AiPrograms\gomoku-online"`（或 MCP 入参 `"cwd": "D:\\OneDrive\\AiPrograms\\gomoku-online"`）**，严禁仅在提示词中描述路径而漏传工作区参数。
- **调度策略**：模型选择（优先 `deepseek-v4.1-flash`，备用 `glm-5.3-flash`）、网络重试与执行权限自动遵循 `workbuddy-bridge` 插件规则。

### 4.2 独立审查员提示词规范（Reviewer Prompt Reference）
代码审查提示词已外置并收敛于 WorkBuddy 技能基座的标准规范文件中，项目内仅做路径引用：
- **规范模板文件**：`C:\Users\12915\.gemini\config\plugins\workbuddy-plugin\skills\workbuddy-bridge\code-review-prompt.md`

**派发调用约定**：
1. 派发给 WorkBuddy 的任务提示词必须读取上述模板文件，**仅允许将模板中的占位符严格替换为当前任务真实上下文**：
   - `{GOAL}`：本次任务的核心目标简报
   - `{ACCEPTANCE_CRITERIA}`：本次任务的验收标准
   - `{BASE_SHA}`：本次修改前的基准 Commit SHA
   - `{HEAD_SHA}`：Antigravity 提交并推送的待审 Commit SHA
   - `{SCOPE}`：本次修改涉及的模块与文件范围
   - `{KNOWN_LIMITATIONS}`：本次任务已知限制或技术边界（若无则填“无”）
2. **严禁在模板之外额外添加任何自定义或非标准提示词**，审查员必须严格依据规范执行代码阅读、证伪验证、缺陷分级与交付流转。
3. **审查文档去噪与问题导向契约**：审查交接单（Handoff）禁止大篇幅堆砌“通过项列表”、“正常调用链推导”或“全部通过用例的详细日志”。通过项严格控制在 10 行以内极简概括，全文 90% 以上篇幅必须聚焦于有问题的部分（P0~P3 缺陷与具体修复证据）。

### 4.3 反馈决策与自愈循环（Resolution Loop）
1. **唤醒与判断**：
   - **分支 A（审查通过）**：WorkBuddy 简要回复确认通过且无新增缺陷 handoff ➔ 审查闭环完成，向用户汇报最终成果，流程结束。
   - **分支 B（发现缺陷）**：WorkBuddy 发现问题并推送了新 handoff ➔ 主智能体执行 `git pull --ff-only` 同步交接文档 ➔ 根据 handoff 修复代码并补充测试 ➔ 本地门禁全绿 ➔ `git commit` & `git push` ➔ 再次派发 WorkBuddy 复审（轮次计数 `N = N + 1`）。
2. **安全熔断（Safeguard）**：
   - 最大自动循环次数为 **3 轮**。若达到 3 轮仍存在分歧或未闭环，自动中断循环，整理双方论据向用户汇报，由用户裁决。

---

## 5. 常用命令速查

```bash
# 开发环境
npm run dev             # 启动全栈联机开发服务 (Next.js + Socket.IO, http://localhost:3000)

# 本地工程门禁 (按序执行)
npx tsc --noEmit        # 门禁 1: TypeScript 类型检查 (0 错误)
npm run lint            # 门禁 2: ESLint 规范扫描 (0 错误 0 警告)
npm test                # 门禁 3: Vitest 单元测试套件 (全通过)
npm run build           # 门禁 4: Next.js 生产构建打包 (全通过)

# 算法评测与在线自动化烟测
npm run arena           # 五子棋引擎天梯对抗评测
npm run verify:online   # 在线房间与时序自动化烟测
npm run smoke:lobby     # 大厅 Presence 与增量同步烟测
npm run smoke:matchmaking # 在线匹配队列烟测
```
