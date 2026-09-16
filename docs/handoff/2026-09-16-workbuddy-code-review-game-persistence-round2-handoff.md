# 独立代码审查 Round 2 复查交接单（对局持久化 / 语言平滑切换 / 外观保持 技术设计方案）

> 审查日期：2026-09-16
> 审查员：WorkBuddy 独立代码审查员
> 被审 HEAD：`c7a5ae3`（`docs(plan): resolve round 1 review findings for game persistence plan`）
> 基准提交：`29058c0`（`fix(lobby): resolve round 3 review findings for unlisted room creation disambiguation`）
> 实际审查范围：`git diff 29058c0..c7a5ae3`（8 文件 / +495 −8，**全部为 `.md`，零源码改动**）；复查增量重点：`90237ce..c7a5ae3`
> 判定结论：**审查未通过**（0×P0 / 0×P1 / **1×P2** / **5×P3**）

---

## 一、审查基本信息与通过项简述

- **版本确认**：`git pull --ff-only` 后 HEAD 与派发单一致（`c7a5ae35375b41ced8e9310a45d364f69013f37c`），工作区干净；审查方未做任何 checkout/reset/rebase，结论严格对应 `c7a5ae3`。
- **通过项（极简）**：Round 1 的 **P2-2 已真实闭环**（§3.2 改为实例级 `useRef` 粒度，所引 `room-state-utils.ts:158-173` 的 `useBootSnapshot` 确为按挂载求值，可解软导航陈旧缓存）；**P3-3 契约已闭环**（`initialAiDifficulty/initialFirstPlayer/initialOpeningSeed` 首帧注入 + 握手显式传参，与 `useAiGame.ts:62-63/251-256/594-600` 的默认值回落路径吻合）；**Round 1 P3-1 的前提与替换方案成立**（Next 16.2.9 `dynamic-rendering.js:577-596` 确认 `useSearchParams` 在 `prerender-legacy` 抛 `BailoutToCSRError`，而 `navigation.js:126-134` 的 `usePathname` 不进入该路径）；`AGENTS.md`/模板/`STATUS.md`/`INDEX.md` 的文书变更与既有先例一致（`STATUS.md:11` 对 fix 类提交记被审产品交付 `52c17a6`）。
- **独立验证（真机 CDP 无头 Chrome，2 组、共 3 类场景，生产构建 + `online-server.ts`）**：① 在 `c7a5ae3` 上以 Round 1 承诺的复现命令重测，**剥离仍然复现**且为同一 `<html>` 节点的原地属性删除；② 导航后向 `documentElement.dataset.theme` 写入可稳定存活（证明 §4.1 的回写机制本身可行）；③ 用最小注入样式做 CSS 级 A/B，证伪 §4.1 item 3 的兜底写法（详见 P3-1）。
- **测试审查**：§5.1 新增的 5 组守门方向均非同一假设的自证；但**两组守门的断言口径不足以守住本轮实际风险**（P2-1 未覆盖系统偏好来源、P3-2 未断言"不存在已绘制的无属性帧"），已在缺陷项中给出收紧后的断言口径。

---

## 二、审查发现与缺陷清单

### P2-1：§4.1 的主题回写数据源只写 `localStorage`，漏掉「仅系统偏好为暗色」这一路 —— Round 1 P2-1 未闭环，且恰好落在 Round 1 承诺的复审复现路径上

- **文件与行号**：方案 `docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md:162`（§4.1 item 2：「自动从 `localStorage` 读取当前主题并立即执行 `document.documentElement.dataset.theme = theme`」）、`:210`（§5.3 场景 6）、`:194-195`（§5.1.5 守门）；既有实现 `src/components/ThemeScript.tsx:3`、`src/components/ThemeToggle.tsx:15-38`。
- **触发条件**：用户从未点过主题开关（`localStorage` 无 `gomoku-theme`），暗色仅来自系统偏好 `prefers-color-scheme: dark`；此时切换语言。
- **实际行为（本轮实测）**：切换前 `{"storedTheme":null,"systemDark":true,"themeAttr":"dark","bg":"rgb(18,20,23)"}`——即该场景下**存储里没有任何可读取的主题值**，暗色完全由 `ThemeScript.tsx:3` 的 `stored ?? matchMedia(...)` 分支提供。按 §4.1 item 2 字面实现（只读 `localStorage`），回写时取到 `null`（或写入字符串 `"null"`），`data-theme` 仍不为 `dark`，`body` 背景停在 `rgb(246,247,242)`，**Round 1 P2-1 的症状原样保留**。
- **期望行为**：方案的自述目标（`:28`「软导航切语言时持续保持暗色」）与 §5.3 场景 6（`:210`「暗色模式下切换语言 → `data-theme` 全程恒为 `dark`」）要求该场景必须自愈。
- **根因**：Round 1 的复现命令（`Emulation.setEmulatedMedia{dark}` + 点击语言链接）与 §5.3 场景 6 的验收路径都只注入系统偏好、不写 `localStorage`；而本轮回写契约把数据源收窄为 `localStorage`，`ThemeToggle.tsx:36-38` 的 `getStoredTheme() ?? getSystemTheme()` 语义未被继承，`matchMedia` 兜底在 §1.1.3 / §4.1 全文均未出现。
- **影响范围**：验收标准 4（外观设置持久化）中"切换语言保持暗色"在**系统偏好用户**（不点开关即为默认人群）这一整类下不成立；若实现方按字面落地，§5.3 场景 6 会判定失败，而 Round 1 handoff §4 已明确承诺"复审按该复现命令重测"。
- **复现/验证证据**（生产构建，CDP，本轮实跑）：
  1. 空 profile 启动 Chrome → `Emulation.setEmulatedMedia{prefers-color-scheme:dark}` → 打开 `/en` → 读取 `before` 得上文 `storedTheme:null / systemDark:true / themeAttr:"dark"`。
  2. 点击 `.locale-links a[lang="fr"]` → 唯一一条属性变更事件 `{t:3131, v:null, old:"dark"}` → 此后 157 帧中 154 帧 `hasAttribute('data-theme')===false`、`bg=rgb(246,247,242)`。
- **修复建议**：§4.1 item 2 明确数据源为「`localStorage` 值 ?? 系统偏好」并显式复用 `ThemeToggle.getThemeSnapshot()` 的语义（或直接以 `useSyncExternalStore` 快照回写）；§5.1.5 增补"`localStorage` 为空 + 系统偏好暗色"用例；§5.3 场景 6 注明暗色的注入方式（系统偏好 or 手选），避免实现方与审查方对同一验收项使用不同前提。
- **修复后验收标准**：清空 `localStorage` 后仅以 `Emulation.setEmulatedMedia{dark}` 进入 `/en`，点击任一语言链接，`document.documentElement.getAttribute('data-theme')` 在采样期内恒为 `dark`、`body` 背景不出现浅色值；同时保留"手选浅色 + 系统暗色"下仍为浅色（与 P3-1 修复合并验收）。

---

### P3-1：§4.1 item 3 的 `@media (prefers-color-scheme: dark)` 兜底未限定 `:not([data-theme])`，会把「手选浅色」用户在间隙内反向翻成暗色

- **文件与行号**：方案 `:163`（§4.1 item 3）；`src/app/globals.css:1-35`（`:root` 为浅色基座，暗色仅由 `:root[data-theme="dark"]` 覆盖，全文件**无** `prefers-color-scheme` 媒体查询、无 `[data-theme="light"]` 块）、`src/components/ThemeToggle.tsx:32-34,66-71`（手选浅色写入 `data-theme="light"`）。
- **触发条件**：系统偏好暗色、用户在应用内**手选浅色**（`data-theme="light"`，`localStorage="light"`）后切换语言。
- **实际行为/期望行为（本轮实测 A/B，同一 `/fr` 页面上注入最小样式）**：
  | 注入样式 | `data-theme` | `body` 背景 |
  |---|---|---|
  | 无（`data-theme="light"`） | `light` | `rgb(246, 247, 242)`（浅） |
  | `@media(dark){:root{--bg:#121417}}` | `light` | **`rgb(18, 20, 23)`（暗，被兜底劫持）** |
  | `@media(dark){:root:not([data-theme]){--bg:#121417}}` | `light` | `rgb(246, 247, 242)`（浅，正确） |
  | 同上，且移除 `data-theme` | — | `rgb(18, 20, 23)`（暗，正当兜底生效） |
  即：无作用域的媒体兜底**无法区分"未设置属性"与"显式选了浅色"**，在属性被剥离的间隙把浅色用户翻成暗色；期望行为是兜底只填补"属性缺失"窗口，不覆盖显式选择。
- **根因**：`:root` 基座即浅色、暗色靠属性覆盖（`globals.css:1/35`），因此兜底必须加"属性缺失"守卫；方案只写了"配置 `@media (prefers-color-scheme: dark)` 兜底样式"，未限定选择器。
- **影响范围**：显式浅色 + 系统暗色组合下引入**方向相反的闪烁**（本方案原本针对浅色闪烁）；若无作用域兜底与 §4.1 item 2 的 post-paint 写回叠加，该暗色帧可见时间被拉长。
- **修复建议**：兜底写法改为 `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }`（本轮 A/B 已验证该写法既不劫持显式浅色，又能在属性缺失时补暗）；§5.1.5 增补该组合的守门用例。
- **修复后验收标准**：系统暗色 + 手选浅色下切语言，采样期内 `body` 背景恒为浅色且不出现暗色帧；系统暗色 + 无存储记录下切语言，采样期内恒为暗色。

---

### P3-2：§4.1 item 2 未规定"预绘制前回写"，而实测剥离发生在导航提交的同一节点上、紧邻下一帧即按浅色绘制 —— §5.3 场景 6 的"零浅色帧"无法由现有表述保证

- **文件与行号**：方案 `:162`（「在客户端**立即**执行 `document.documentElement.dataset.theme = theme`」，未限定 effect 语义）、`:210`（§5.3 场景 6：「以 CDP 探针高频采样，验证 `data-theme` 全程恒为 `dark`」）、`:194-195`（§5.1.5 仅断言"正确回写"，未断言"不存在已绘制的无属性帧"）。
- **触发条件**：任何切语言软导航；写回若落在 **被动 effect（`useEffect`）** 语义上，其刷新时机晚于首次绘制。
- **实际行为（本轮实测，生产构建）**：属性剥离与重绘是**同一提交内**的原地变化——唯一属性事件 `{t:3131, v:null, old:"dark"}`（`markKept:true`，非节点替换），剥离后**第一帧**（`t:3131`，距上次采样 Δ≈33ms，后续帧间隔 6–17ms）即 `has:false / bg=rgb(246,247,242)`。也就是说：一旦回写不在提交前完成，就会存在已绘制的浅色帧，而 React 对被动 effect 的刷新时机不做绘制前保证。
- **期望行为**：§5.3 场景 6 要求"零浅色白屏闪烁"，属**绘制前**约束，必须由契约固定实现手段（如 layout 阶段同步回写，或不把根属性交由 React 重建）。
- **根因**：方案把机制描述为"客户端立即执行"，但"立即"在 React 语义下同时兼容 `useEffect`（绘制后）与 `useLayoutEffect`（绘制前）；同一文档 §1.1.3 又自述"非受控属性被移除"发生在重渲染提交中，两者叠加使验收项处于不可保证状态。
- **修复建议**：在 §4.1 item 2 写明"回写必须发生在浏览器绘制前"（`useLayoutEffect` 或同步写回，并禁止在被动 effect 中补属性）；§5.1.5 的断言口径收紧为"重放切语言后，**不存在**任何 `hasAttribute('data-theme')===false` 的已绘制帧"，而非仅断言最终值。
- **修复后验收标准**：按 §5.3 场景 6 高频采样，帧序列中不存在 `data-theme` 缺失的已绘制帧（`bg` 采样零浅色值），且在 `localStorage` 为空/手选浅色两种前提下均成立（与 P2-1、P3-1 合并验收）。

---

### P3-3：§2.1 未确定 `search` 的读取时机 —— Round 1 P3-1 要求的"确定的读取方式"只完成了一半

- **文件与行号**：方案 `:48-53`（§2.1：「`search` 在客户端渲染环境从 `window.location.search` 读取（**或**在链接点击/客户端挂载时动态注入）」）；`src/components/LocaleSwitcher.tsx:27-33`（语言入口是 `<Link href={...}>`）。
- **触发条件/两种字面读法的后果**：
  1. 在**首帧渲染**中读 `window.location.search`（"客户端渲染环境"的最直接读法）：未加 `typeof window` 守卫则服务端渲染阶段直接抛错（门禁 4 失败）；加了守卫则服务端 `href="/fr"`、客户端首帧 `href="/fr?room=X"`，产生**水合不一致**（运行时告警 + 属性回填），而四道门禁（`tsc`/`lint`/`test`/`build`）都不会拦住它。
  2. 仅在**点击时**注入（onClick 读 live `window.location.search`）：`<Link>` 的 `href` 属性本身仍缺参数，中键/`Ctrl`+点击/"在新标签页打开"/复制链接这些不经 onClick 的路径会丢失 `?room=` —— 正是本任务要修的故障类（`LocaleSwitcher.tsx:30` 硬编码根路径）的变体。
- **期望行为**：Round 1 handoff §4 验收项 1 明确要求"方案文本给出**确定的**读取方式与 Suspense 结论"；当前文本给出两个"或"选项且各自有不同失败模式，实现方无法据以判定。
- **根因**：为规避 SSG bailout，方案把读取时机下推到客户端，但未在"渲染期/挂载后/交互时"三者中做出唯一选择，也未说明 `href` 与查询串的关系。
- **修复建议（择一并写死）**：① 推荐——服务端/首帧渲染只算路径部分（`usePathname()` 替换语言前缀），挂载后经 effect 把 `window.location.search` 写入 state 补齐 `href`，同时在 onClick 内以 live `search` 计算导航目标作为兜底（写明首帧 HTML 不含查询串这一取舍）；② 或对 `LocaleSwitcher` 包 `<Suspense>` 后使用 `useSearchParams()`（Next 官方 SSG 安全范式，代价是该子树退化为客户端渲染，首屏 HTML 不再含语言链接）；并明确中键路径是否在范围内。
- **修复后验收标准**：方案文本给出唯一读取方式；落地后 `npm run build` 仍绿且 `/[locale]` 保持 SSG，控制台无 hydration 告警；中键打开新标签仍带 `?room=`（或方案显式声明该路径不在范围内）。

---

### P3-4：§3.4 清理矩阵对**同一代码路径**给出两种清理对象 —— `resetGame` 被 `completeModeChange` 复用，"当前模式"指代未定义，且矩阵内含不可达分支

- **文件与行号**：方案 `:146-152`（§3.4 矩阵）；`src/components/GameShell.tsx:113-133`（`completeModeChange("ai"|"local")` 内部即调用 `resetGame({ nextMode, ... })`）、`:91-107`（`resetGame`）、`:397`（本地"重置棋盘"入口）、`src/components/hooks/useAiGame.ts:341-344`（AI"再来一局"→`onResetGame`）。
- **触发条件**：实现方按矩阵落地清理逻辑。矩阵第 2/3 行按**目标模式**写（进入 `ai`：清本地存储、若无匹配人机存储则初始化新局），第 4 行按**当前模式**写（`resetGame`：清除当前模式存储、重置为空盘）——而这两行描述的是**同一次调用**（`GameShell.tsx:128`）。
- **实际行为/期望行为**：若按第 4 行实现（清 `nextMode`），则进入 `ai` 时必然清掉已有的人机 session，第 2 行"若无匹配的人机存储则初始化新局"的前提永远不成立（该分支不可达），第 2/3 行"保留目标模式存储"的语义被抹掉；若按第 2/3 行实现（清"非目标模式"），则独立触发"重置棋盘/再来一局"时会去清理**其它模式**的存储。两种实现互斥，Round 1 P3-2 要求的"每分支清理归属唯一确定"未达成。
- **根因**：矩阵把"模式切换"与"重开对局"两个语义混在同一个函数入口上表述，且"当前模式"在 `resetGame` 被 `completeModeChange` 复用后同时可指旧模式与 `nextMode`。
- **修复建议**：统一为两条互不重叠的规则并写死：(a) **模式切换**（`completeModeChange` 各分支）：失效所有 `≠ nextMode` 的 session，并按 `nextMode` **一律初始化新局**（不复用旧 session，与 `completeModeChange` 现有行为一致）；(b) **重开对局**（`resetGame`/`handleAiReset`）：仅清当前活动的 `gomoku-active-game` 并初始化空局，不触碰任何其它键；据此删除"若无匹配的…则初始化新局"这类不可达表述。
- **修复后验收标准**：矩阵中每个入口的清理对象与是否复用旧局均唯一确定；本地局进行中切到"联机"（`direct` 无弹窗分支）后整页刷新进入联机大厅；"重置棋盘/再来一局"仅清当前局；两条例外路径各有守门用例。

---

### P3-5：§3.2 启动优先级无任何一项能重建"用户已选工作区" —— 联机大厅与 0 手人机局在切语言/刷新后必然跌落 `local`

- **文件与行号**：方案 `:102-105`（§3.2 优先级 1~3）、`:148`（§3.4 进入 `room` 即清除 `gomoku-active-game`）；`src/components/GameShell.tsx:50-52`（`mode = modeOverride ?? bootMode`，`modeOverride` 为内存 `useState`）、`src/components/online/workspace-state.ts`（`isOnlineWorkspaceEnabled` 仅 `mode === "room"` 为真、`deriveGameWorkspace` 由 `mode` 决定大厅/对局盘）。
- **触发条件**：用户在**联机大厅**（已点"联机"、尚未建房/进房，URL 无 `?room=`）或**人机模式且尚未落子**（`firstPlayer:"human"`，`moves.length===0`，无人机 session）时切换语言（软导航重挂载），或在联机大厅整页刷新。
- **实际行为（按代码推演）**：重挂载后 `modeOverride` 归零 → `bootMode` 命中优先级 3 `local`（优先级 1 需 `?room=`、优先级 2 需通过校验的活跃单局 session，而进入 `room` 时已被清除；优先级列表无任何一项表达"上次选中的工作区"）→ `friendRoom.enabled=false`，大厅 Presence/聊天等 socket 订阅被拆除，用户被送回单机空盘；人机模式下已选难度/先后手一并丢失。
- **期望行为**：方案 §1.2.1 自述目标为"全模式防丢（刷新 & 切换语言）"，语言切换不应改变用户所处工作区；若有意不保活大厅，应在方案中显式声明为范围外并说明理由。
- **根因**：`modeOverride`（用户显式选择的工作区）只存在于内存，方案新增的持久化契约只覆盖"由 URL/对局数据推导出的模式"，未覆盖"用户选择的工作区"本身。
- **影响范围**：仅"无活跃对局"子状态（大厅、未开局人机）；不属于本轮引入的回归（现状同样跌落），但作为"全模式防丢"目标的契约完整性缺口需显式覆盖或显式豁免。
- **修复建议**：在 §3.2 增补一条优先级（如 `?room=` → 活跃对局 session → **上次工作区** → `local`，以独立 sessionStorage 键记录最近一次显式模式选择，`leaveRoom` 与模式切换时同步写入），或明确写出"联机大厅不参与保活"的边界与§5.3 相应用例。
- **修复后验收标准**：在大厅内切语言后仍停留在大厅（`friendRoom` 保持启用）；或方案中给出显式的范围豁免说明并被验收标准引用。

---

## 三、待确认风险与未验证项

1. **未验证（方案尚未实现）**：`computeLocaleSwitchHref`、`game-persistence.ts`、`StoredActiveGame` 均为待实现设计，无法对其运行时行为证伪；本轮独立验证对象是方案所依赖的**现存**机制（主题剥离/回写存活/媒体查询兜底）。
2. **待确认风险（AI 自愈握手的触发侧契约）**：§3.3.B 只规定了"首帧注入"与"显式传参"，未写明握手在哪一层、以何种条件触发与如何防重入。`useAiGame.ts:257-279` 的 `aiRequestIdRef` 递增可使重复触发后的旧请求自然作废（风险有限），但若触发点依赖"挂载后 setState"判断（与 `AGENTS.md §1.2` 相悖），仍可能出现握手不触发或触发两次的边界；建议实现期以一次性的 ref 守卫 + "恢复值先于握手"的顺序落地。
3. **未验证（环境限制）**：在线好友房"切语言后 60s 宽限内无缝重连"仍需两名真实客户端与服务端时序配合；本轮沿用 Round 1 的结论（常量与 `room:rejoin` 路径逐行核对无改动）。
4. **残余风险**：P3-2 关于"被动 effect 未必在绘制前刷新"的判断依赖 React 调度语义而非平台契约；本轮只证明了"剥离与下一帧之间不存在结构性缓冲"（同节点、同提交、Δt≈0–33ms）。若实现方采用绘制前写回，该风险即消除。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**：P2-1（决定 Round 1 最高级缺陷能否闭环，且本轮已给出可复跑的失败证据）→ P3-2（决定 §5.3 场景 6 是否可判过）→ P3-1（与 P2-1 同一处 CSS，合并修复）→ P3-3（决定门禁 4 与中键路径）→ P3-4 → P3-5。

**复审验收标准**：
1. §4.1 的主题回写契约明确"数据源 = 存储值 ?? 系统偏好"与"绘制前完成回写"，CSS 兜底限定为 `:root:not([data-theme])`；
2. §4.1 / §5.3 场景 6 的复现前提与断言口径写死，且能同时覆盖"系统偏好暗色"与"手选浅色 + 系统暗色"两种前提；
3. §2.1 给出唯一的 `search` 读取方式，并说明中键/复制链接路径与 SSG 输出完整性的取舍；
4. §3.4 清理矩阵按"模式切换 / 重开对局"两条互斥规则重写，删除不可达分支；§3.2 明确"用户已选工作区"是否保活；
5. 复审以实跑为准：审查方将用本单 P2-1 的复现命令（空 `localStorage` + `Emulation.setEmulatedMedia{dark}`）在生产构建下重测，并追加"手选浅色 + 系统暗色"与"大厅内切语言"两组场景。
