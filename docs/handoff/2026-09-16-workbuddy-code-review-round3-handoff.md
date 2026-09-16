# 独立代码审查 Round 3 复查交接单（对局持久化 / 语言平滑切换 / 外观保持 技术设计方案）

> 审查日期：2026-09-16
> 审查员：WorkBuddy 独立代码审查员
> 被审 HEAD：`8148e81`（`docs(plan): resolve round 2 review findings for game persistence plan`）
> 基准提交：`29058c0`（`fix(lobby): resolve round 3 review findings for unlisted room creation disambiguation`）
> 实际审查范围：`git diff 29058c0..8148e81`（10 文件 / +792 −8，**全部 `.md`，零源码改动**）；复查增量重点：`c7a5ae3..8148e81`（方案文档 §1.1/§2.1/§3.2/§3.4/§4.1/§5.1/§5.3 重写）
> 判定结论：**审查未通过**（0×P0 / 0×P1 / 0×P2 / **2×P3**）

---

## 一、审查基本信息与通过项简述

- **版本确认**：`git pull --ff-only` 后 HEAD = `8148e81d0303b4a0789710c497df6be7ec1f14b3`，与派发单一致；工作区干净；审查方未做任何 checkout/reset/rebase，结论严格对应 `8148e81`。
- **通过项（极简）**：Round 2 六项缺陷在文本契约层面逐项闭环——P2-1 `resolveCurrentTheme()` 与 `ThemeScript.tsx:3`/`ThemeToggle.tsx:36-38` 语义一致；P3-1 兜底选择器限定 `:root:not([data-theme])`（本轮 A/B 实测未被反向劫持）；P3-3 三阶段读取流与 Next 16.2.9 SSG 约束相符（`usePathname` 不进 `prerender-legacy` 抛错路径）；P3-4 拆为"模式切换 / 单模式内重开"两条正交规则；P3-5 引入 `gomoku-selected-workspace` 四级优先级。仅两处残留见 P3-1/P3-2。
- **独立验证 1（真机 CDP，生产构建 + `online-server.ts`，探针脚本置于仓库外临时目录）**：注入式 A/B 证伪方案 §4.1 新增的兜底 CSS 块（见 P3-1）。
- **独立验证 2（机制取证，决定性支持 Round 2 P3-2 判为已闭环）**：`data-theme` 剥离经 `removeAttributeNode` 由 React 提交期 mutation 遍历触发（唯一一条事件；栈为 `react-dom` 递归遍历），与页面树替换**落在同一 MutationObserver 批次**（属性变更 `{t:1329.6, old:"dark"→null}` 与 `body` childList `{t:1329.6, n:4}` 同刻）；在该提交之后回写可 100% 存活（180 帧零缺失帧），而不回写的对照组第 1 帧即 `has:false / bg=rgb(246,247,242)`。⇒ 方案规定的 `useLayoutEffect`（同在提交内、晚于 mutation 阶段、早于绘制）在机制上可成立。
- **测试审查**：§5.1/§5.3 新增守门方向与真实风险一一对应，未发现同义反复、无效 mock 或假阳性断言（1 项可行性存疑见 §三）。

---

## 二、审查发现与缺陷清单

### P3-1：§4.1 新增兜底 CSS 代码块的变量集不属于本仓库主题变量——按字面落地会在兜底窗口内渲染"暗底 + 浅色主题文字"的破版画面

- **文件与行号**：方案 [`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:215-237`](../GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md)（§4.1「CSS 兜底限定选择器」代码块）；权威定义对照 `src/app/globals.css:35-67`（`:root[data-theme="dark"]`）与 `:1-33`（浅色基座）。
- **触发条件**：系统偏好暗色 + `localStorage` 无主题记录（即方案 §5.3 场景 6a 的前提），且 `data-theme` 属性处于缺失窗口（该兜底存在的唯一意义所在）。
- **实际行为（本轮真机实测，生产构建 `/en`，`Emulation.setEmulatedMedia{dark}`，空 `localStorage`，同一页面注入最小样式后 `removeAttribute('data-theme')`）**：

  | 注入样式 | `body` background | `body` color | `color-scheme` | `--ink` | `--board` | `--panel` |
  |---|---|---|---|---|---|---|
  | 无兜底（仅剥离属性） | `rgb(246,247,242)` | `rgb(24,33,47)` | light | `#18212f` | `#d9a95f` | `#fff` |
  | **方案 §4.1 块（字面注入）** | `rgb(18,20,23)` | **`rgb(24,33,47)`** | **light** | **`#18212f`** | **`#d9a95f`** | `#1a1d22` |
  | `globals.css:35-67` 声明集 + 同一选择器 | `rgb(18,20,23)` | `rgb(237,242,247)` | dark | `#edf2f7` | `#9f6b36` | `#1b2027` |

  即：方案块只把背景压暗，文字仍是浅色主题的 `#18212f`（对 `#121417` 的对比度 ≈ **1.14:1**，远低于 WCAG 4.5:1，等同不可读）；棋盘 `#d9a95f`、面板 `#1a1d22`、强调色 `#d4a359` 均为**另一套色板**（权威暗色值分别为 `#9f6b36`/`#1b2027`/`#45b39d`），且未声明 `color-scheme: dark`。
- **期望行为**：兜底窗口内呈现与 `:root[data-theme="dark"]` 等价的暗色主题（文字、棋盘、面板、强调色、`color-scheme` 全量一致），而非仅背景变暗。
- **根因**：该块 12 个变量中有 **8 个在本仓库不存在**（`--card`、`--card-subtle`、`--border`、`--border-subtle`、`--text`、`--text-subtle`、`--text-muted`、`--accent-hover`；`grep` 全量检索 `src/` 命中 0），同时**漏掉 `globals.css:35-67` 实际声明的 27 项声明**（`color-scheme`、`--ink`、`--muted`、`--line`、`--line-strong`、`--panel-soft`、`--bg-radial-a/b`、`--accent-deep`、`--accent-ink`、`--hover`、11 项 `--board*`、`--black-stone`、`--white-stone`、`--white-stone-line`、`--last-move`、`--win-line`、`--ad-surface`、`--panel-shadow`）。该块显然不是从本仓库主题派生的，实现方若按字面复制，会向 `globals.css` 引入 8 项死声明与一套外来色值。
- **影响范围**：验收标准 4（"属性缺失窗口零闪烁"）的可视结果面。一旦该窗口被绘制，画面比"浅色帧"更糟（暗底深字不可读 + 浅色棋盘）；反之若实现按权威色板落地，兜底即真正等价于暗色主题。**Round 2 P3-1 的"选择器作用域"修复本身经本轮 A/B 确认正确**（显式 `data-theme="light"` + 系统暗色下 `body` 背景恒为 `rgb(246,247,242)`，未被劫持），本项只针对**声明集**。
- **复现方法**（可复跑）：生产服务起于任意端口 → 打开 `/en` → `Emulation.setEmulatedMedia{prefers-color-scheme:"dark"}` → 注入方案 §4.1 代码块 → `document.documentElement.removeAttribute('data-theme')` → 读 `getComputedStyle(document.body).color/.backgroundColor` 与 `documentElement` 的 `color-scheme`、`--ink`、`--board`。
- **修复建议**：把该块替换为"与 `:root[data-theme="dark"]` 完全等价的声明集"（含 `color-scheme: dark`），即整体复制 `globals.css:35-67`；若担心维护重复，可在实现期抽公共声明或加注释指向权威块，但**不得保留不存在的变量名**。同步把 §5.1 用例 A 的断言由"背景色恒为暗色"扩展为"`background` + `color` + `color-scheme` + `--ink`/`--board`/`--panel`/`--accent` 逐项等于权威暗色值"。
- **修复后验收标准**：属性缺失窗口内上述取值与 `:root[data-theme="dark"]` 逐项一致；同时保留"显式浅色 + 系统暗色不被劫持"（沿用 Round 2 P3-1 的 A/B 口径）。

### P3-2：§3.2 的工作区写入点覆盖不到"经 `?room=` 直接进房"的入口，而 §3.4 矩阵已断言 `leaveRoom` 后工作区为 `room`——该路径退房后刷新/切语言会跌落 `local`

- **文件与行号**：方案 `:112-121`（§3.2 写入规则 + 四级优先级）、`:174-181`（§3.4 矩阵 `leaveRoom` 行「保持 `"room"`（停留在联机大厅）」）；代码事实 `src/components/client-boot-state.ts:36-63`（启动模式仅由 `?room=` 推导，且带模块级粘性缓存）、`src/components/GameShell.tsx:50-52`（`mode = modeOverride ?? bootMode`，`modeOverride` 为内存 state）、`:113-118`（`completeModeChange("room")` 仅 `setMode` 后提前 return）、`src/components/hooks/useRoomSocket.ts:405-454`（`leaveRoom` 成功回调内 `clearRoomUrl()`，只清 room session 与 URL）。
- **触发条件**：用户**未经模式标签**进入房间——打开邀请/分享链接 `/en?room=ABC`（§3.2 优先级 1 命中 `room`，但从不调用 `completeModeChange`）→ 对局结束或点"退出房间"（`leaveRoom` 抹除 URL `?room=`）→ 随后刷新或切换语言（组件重挂载、实例级快照重算）。
- **实际行为（按方案文本推演）**：`gomoku-selected-workspace` 从未被写入 `"room"`（§3.2 的写入点仅列 `completeModeChange` / 模式标签）⇒ 重挂载后优先级 1 不成立（URL 已无 `?room=`）、优先级 2 不成立（已退房、无活跃单机对局）、优先级 3 取到缺失或陈旧值（如 `"local"`）⇒ 落下优先级 4 `local`：用户被送进单机空盘，`friendRoom.enabled`（由 `mode === "room"` 门控）随之关闭，大厅 Presence/聊天订阅被拆除——与 §3.4 矩阵 `leaveRoom` 行的断言正好相反。
- **期望行为**：与 §1.2「联机大厅 0 手未建房时切语言或刷新依然保留在大厅工作区」一致——只要用户当前处于联机工作区（**含经链接进房后退房者**），工作区记录都应为 `room`。
- **根因**：§3.2 把工作区键的写入锚定在"用户显式进入模式"的 UI 回调上，但 `room` 工作区存在第二个激活入口——URL `?room=` 的启动解析（`client-boot-state.ts:61-63`）；而 §3.4 矩阵按"键已被写入 `room`"来描述 `leaveRoom` 行，两处契约不自洽。
- **影响范围**：邀请/分享链接入口这一整类用户，在"退房 → 刷新/切语言"路径上失去大厅保活。相对现状，**切换语言**这一子路径构成行为回归：现状会因 `client-boot-state.ts:52-54` 的模块级粘性缓存而保留 `room`，本轮 §3.2 改为实例级重算后该缓存不再兜底。不涉及任何数据丢失（退房前对局已结束/已主动放弃）。
- **复现/验证证据**：全仓检索 `completeModeChange` 仅由 `handleModeChange`（`GameShell.tsx:338/348/358/432`）与确认弹窗收敛路径（`:147/180/211`）触发，启动/URL 路径不经过；`useRoomSocket.ts:447` 的 `leaveRoom` 仅调 `clearRoomUrl()`，不写任何工作区键。
- **修复建议**：在 §3.2 增写"启动解析命中 `room`（URL `?room=`）或房间加入成功时，同步写入 `gomoku-selected-workspace = "room"`"；把 §3.4 矩阵 `leaveRoom` 行由含糊的"保持"改为显式"写入并保持 `room`"；§5.1.3 增补守门用例——"经 `?room=` 进房 → 退房 → 软导航重挂载后工作区仍为 `room`"（该用例把写入点退回仅 `completeModeChange` 时必定失败）。
- **修复后验收标准**：不点击任何模式标签、仅经 `?room=` 进房并退房后，刷新与切换语言均停留在联机大厅（`friendRoom.enabled === true`、未跌落本地空盘）；§3.4 矩阵每行的"写入/保持"语义唯一且与 §3.2 一致。

---

## 三、待确认风险与未验证项

1. **未验证（方案尚未实现）**：`computeLocaleSwitchHref`、`game-persistence.ts`、四级启动优先级、`useLayoutEffect` 回写均为待实现契约，无法对其运行时行为做端到端证伪。本轮独立验证对象是方案所依赖的**现存**机制（主题剥离的调用路径与相位、回写存活、媒体兜底作用域）。P3-1 属可静态判定的契约事实，P3-2 属控制流契约缺口。
2. **残余风险（P3-2 的机制前提）**：本轮"`useLayoutEffect` 可消灭无属性帧"的结论依赖两个实测前提——剥离发生在与页面树替换**同一提交的 mutation 阶段**，且 `DocumentLocaleSync` 位于该提交内。若实现期把回写放进被动 `useEffect`，或把 `DocumentLocaleSync` 移出 `[locale]` 页面树，该结论失效。建议实现后按 §5.3 场景 6a/6b 复跑并作为验收前置。
3. **待确认风险（§2.1 阶段 3 的落地方式）**：阶段 3 只规定"点击时实时读取 `window.location.search`"，未规定该实时值如何用于**本次导航**（`<Link>` 原生导航使用 `href` 属性；要真正透传实时值需 `preventDefault()` + `router.push(liveHref)` 或等价手段）。若实现方仅在 `onClick` 中"读而不用"，则"挂载后查询串又发生变化"这一窄窗口仍会丢参数。建议实现期把该细节写死（方案或代码注释）。
4. **非阻塞观察（不计入缺陷）**：§5.3 场景 4（"在个人主页 `/zh/profile/[id]` 切换为英文"）当前**无可执行入口**——`<Link>` 仅存在于 `LocaleSwitcher.tsx`，而 `LocaleSwitcher` 仅被 `GameShell.tsx:322` 渲染，`src/app/[locale]/profile/[playerId]/page.tsx` 走 `PlayerProfilePage`（无语言切换控件）。该验收意义可由 §5.1.1 纯函数用例 + "首页 `?room=` 保留"等价覆盖；若坚持保留该走查项，需在实现期同步为该页加入入口。
5. **未验证（环境限制）**：在线好友房"切语言后 60s 宽限内无缝重连"仍属双客户端 + 服务端时序场景，本轮未实测（沿用 Round 1/2 结论：`DISCONNECT_GRACE_MS` 与 `room:rejoin` 路径未改动）。
6. **未验证（测试可行性）**：§5.1 的守门项 3/4/5 为 Hook/组件级运行时断言，而本仓 `vitest.config.ts` 为 `environment: "node"` 且未引入 jsdom/`@testing-library`（`src/**/*.test.ts` 纯 Node 用例）。实现期需明确这些守门落在哪一层（新增 DOM 测试环境，或改为 `tools/smoke-*.ts` 的 CDP 真机门禁），否则 §5.1 的三项守门可能无法真实建立。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**：P3-1（与 §5.1 用例 A 同处，一次改完）→ P3-2（决定 §3.2 与 §3.4 是否自洽）。

**本轮架构结论**：方案在架构与技术逻辑层面已收敛——SSG 安全读取契约成立、四道门禁承诺可满足、时序/存储模型自洽、无 P0/P1/P2 级漏洞或时序死锁；两项 P3 均为**可在实现阶段一次性吸收的契约细节**（一处是伪代码声明集，一处是写入点覆盖范围）。依 `AGENTS.md §4.3 分支 C`（纯技术方案审查第 3 轮强制收敛定稿，严禁对非阻塞建议反复纠缠），主控可判定方案收敛并直接推进源码实现，把上述两项修复并入实现与守门用例，无需再发起文档复审轮次。

**若仍复审，验收标准**：
1. §4.1 兜底块的声明集与 `globals.css:35-67` 逐项等价（含 `color-scheme: dark`），且不再出现本仓库不存在的变量名；§5.1 用例 A 的断言扩展到 `color`/`color-scheme`/`--ink`/`--board`；
2. §3.2 明确"启动解析命中 `room` 或房间加入成功即写入 `gomoku-selected-workspace`"，§3.4 矩阵 `leaveRoom` 行语义与之一致，并附"`?room=` 进房 → 退房 → 重挂载仍为 `room`"的守门用例；
3. §2.1 阶段 3 的实时值落地方式写死；
4. §5.1 明确三项 Hook/组件级守门的运行环境或改挂 CDP 真机门禁。
