# 对局持久化与语言平滑切换方案 Round 2 审查缺陷闭环交接单

- **交接日期**：2026-09-16
- **对应审查**：WorkBuddy Round 2 独立审查（提交 `bec8acd`，交接单 [`2026-09-16-workbuddy-code-review-game-persistence-round2-handoff.md`](2026-09-16-workbuddy-code-review-game-persistence-round2-handoff.md)）
- **审查缺陷闭环**：1×P2（P2-1）与 5×P3（P3-1、P3-2、P3-3、P3-4、P3-5），共 6 项全部高标准闭环
- **核心修复文件**：[`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md`](../GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md)
- **交付类型**：**方案设计文档最终定稿（Technical Design Revision - Round 3 Final Preparation）**，源码尚未进入实现阶段。

---

## 1. 缺陷逐项闭环证明与技术对齐

### 1.1 P2-1 闭环：权威主题解析源对齐（解决仅系统暗色无存储用户丢主题问题）
- **审查发现**：Round 1 的 P2-1 方案仅描述了从 `localStorage` 读取主题。当用户从未点击过主题开关、仅依赖系统偏好 `prefers-color-scheme: dark` 时，`localStorage` 为空，按字面实现会读取到 `null`，导致暗色无法恢复，回落为默认浅色背景 `rgb(246, 247, 242)`。
- **方案更新**：
  1. 在 §4.1 明确权威主题解析源 `resolveCurrentTheme()`，与 `ThemeScript.tsx:3` 和 `ThemeToggle.tsx:36-38` 保持 100% 严格一致：
     ```ts
     const currentTheme = (stored === "light" || stored === "dark")
       ? stored
       : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
     ```
  2. 回写时始终为确定性合法值 `"light" | "dark"`，绝不传入 `null` 或字符串 `"null"`；
  3. 在 §5.1.5 和 §5.3 场景 6 中分化增设“6a（系统偏好暗色无存储）”与“6b（手选浅色 + 系统暗色）”两组真机与单元测试断言，彻底闭环。

### 1.2 P3-1 闭环：CSS 媒体兜底限定选择器 `:root:not([data-theme])`
- **审查发现**：`globals.css` 基座默认为浅色。若 `@media (prefers-color-scheme: dark)` 未限定属性选择器，在属性被剥离的间隙会把“手选浅色 + 系统偏好暗色”的用户反向劫持为暗色背景，引入相反方向的界面闪烁。
- **方案更新**：
  1. 在 §4.1 item 3 明确限定媒体查询选择器为 `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }`；
  2. 经 WorkBuddy Round 2 CDP 实验证实，`:root:not([data-theme])` 仅在 `data-theme` 属性缺失时生效，手选浅色用户持有的 `data-theme="light"` 永远不会被该媒体查询覆盖；
  3. §5.1.5 与 §5.3 场景 6b 固化该组合的反向闪烁守门断言。

### 1.3 P3-2 闭环：预绘制前回写契约（Pre-paint Layout Sync）
- **审查发现**：React 的被动 `useEffect` 在浏览器绘制（Paint）之后才异步执行，实测属性剥离与首次绘制发生在同一次提交内（间隔 0~33ms），被动 effect 无法保证“零浅色已绘制帧”。
- **方案更新**：
  1. 在 §4.1 item 2 明确将回写执行时序提升至**布局阶段（Layout Phase）**，使用 `useLayoutEffect`（或 SSR 安全的 `useIsomorphicLayoutEffect`）；
  2. `useLayoutEffect` 在 React DOM mutation 提交后、浏览器渲染管线计算屏幕像素前同步执行，确保在首次光栅化前 `data-theme` 属性已经就绪；
  3. 配合 `:root:not([data-theme])` CSS 兜底，形成预绘制阶段双重保险；
  4. §5.1.5 与 §5.3 场景 6 的断言口径收紧为“采样期内不存在任何 `hasAttribute('data-theme') === false` 的已绘制帧”。

### 1.4 P3-3 闭环：确定性的 SSG 安全路由与查询参数三阶段读取流
- **审查发现**：Round 1 方案在 §2.1 中给出了“在客户端渲染环境读取 window.location.search（或在点击/挂载时动态注入）”的模糊选项，首帧直接读引发水合告警，仅在点击读则中键/复制链接丢失参数。
- **方案更新**：
  1. 在 §2.1 剔除所有模糊选项，敲定单一确定性的三阶段流：
     - **阶段 1（SSG 预渲染）**：服务端与静态构建基于 `usePathname()` 渲染基础路径 `<Link href={`/${targetLocale}${subpath}`}>`，0 Bailout 风险，100% 保证 SSG 静态路由产物；
     - **阶段 2（客户端水合挂载后补齐）**：组件挂载后，`useEffect` 中单次读取 `window.location.search` 响应式更新 `<Link href>` 为完整带参路径，消除水合不一致警告，同时完美支持中键、Ctrl+点击、“在新标签页中打开”与右键复制链接；
     - **阶段 3（交互点击实时兜底）**：在 `onClick` 事件中实时读取最新的 `window.location.search`，确保左键常规点击瞬时参数不丢；
  2. 明确给出工程权衡说明，并在 §5.1 增设守门测试。

### 1.5 P3-4 闭环：模式切换与单模式内重开的正交解耦清理契约
- **审查发现**：现有方案在 §3.4 矩阵中把 `completeModeChange` 与 `resetGame` 混在一起，包含不可达分支（进入 AI 既说清本地又说保留 AI，实际被同一次 resetGame 清掉）。
- **方案更新**：
  1. 在 §3.4 确立两条完全正交的规则：
     - **规则 A（模式切换）**：通过 `completeModeChange(nextMode)` 触发时，清除所有非目标模式的旧 session，并一律为目标模式初始化全新空局（不复用目标模式遗留的旧 session，符合切模式即开新局的用户心智），同步更新工作区记录；
     - **规则 B（单模式内重开）**：通过 `resetGame` 或 `handleAiReset` 触发时，仅清除当前活跃模式的 `gomoku-active-game`，绝不触碰任何其他模式；
  2. 全面重写 §3.4 表格，删除不可达分支，每个控制流入口的行为唯一确定。

### 1.6 P3-5 闭环：工作区记录持久化（联机大厅与 0 手人机局防丢）
- **审查发现**：用户在联机大厅（0 手未建房，URL 无 `?room=`）或人机模式（0 手未落子，无活跃对局 session）时，切换语言或刷新后，因内存 `modeOverride` 归零，启动模式必然跌落回 `local` 单机空盘，联机 Socket 订阅被误拆除。
- **方案更新**：
  1. 在 §3.2 引入 `sessionStorage` 键 `gomoku-selected-workspace`（类型 `"local" | "ai" | "room"`）；
  2. 显式切换模式或进入工作区时同步写入该键；
  3. 扩充启动判定优先级为四级：
     - 优先级 1：URL 包含 `?room=` $\rightarrow$ 强制启动为 `"room"`；
     - 优先级 2：Storage 包含通过校验的活跃对局且 `moves.length > 0` $\rightarrow$ 恢复对应模式；
     - 优先级 3：Storage 包含有效的 `gomoku-selected-workspace` $\rightarrow$ 恢复该工作区（**使联机大厅 0 手、人机模式 0 手切语言或刷新后依然停留在原工作区，`friendRoom.enabled` 保持开启，Socket 订阅不被误拆**）；
     - 优先级 4：默认兜底 $\rightarrow$ `"local"`；
  4. 在 §5.1 增设大厅 0 手工作区保持测试，并在 §5.3 增设场景 7 验证项。

---

## 2. 本地门禁验证（零源码变更，门禁全绿）

1. `npx tsc --noEmit`：0 错误
2. `npm run lint`：0 错误，0 警告
3. `npm test`：29 个测试套件 / 248 项用例 100% 通过
4. `npm run build`：生产构建完全成功（11 个静态路由全部预渲染通过）
5. `npm run verify:online`：联机房间与时序烟测全绿

---

## 3. 下一步工作

- 按照双智能体协作规则派发 WorkBuddy 独立审查 Round 3（最终轮）。
- 若 Round 3 判定通过，或依照 Rule 11 / Branch C 判定方案收敛定稿，正式推进至代码实现与自动化测试落地阶段。
