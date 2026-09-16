# 对局持久化、语言平滑切换与外观保持方案设计

更新日期：2026-09-16  
状态：方案设计与规划（Round 1 审查缺陷闭环版）

---

## 1. 目标与问题背景

### 1.1 现状与用户痛点
当前在线五子棋项目在用户体验上存在以下两个关联的痛点：
1. **刷新网页或切换语言丢局**：
   - 本地双人对战（Local）和人机对战（AI）的状态保存在 React 运行时状态（`GameShell.tsx`）中。用户一旦刷新浏览器或切换页面语言，组件卸载重载导致对局状态清空，棋盘重置为空盘。
2. **切换语言跳回首页且丢失联机对局（Bug 定位）**：
   - 在 `src/components/LocaleSwitcher.tsx:30` 中，语言链接写死了 `href={`/${locale}`}`。
   - 当用户在子页面（例如个人主页 `/[locale]/profile/[playerId]`）切换语言时，会被强制导航回首页 `/[newLocale]`。
   - 当用户在进行在线对局（`/[locale]?room=XXXXXX`）时切换语言，查询参数 `?room=...` 被完全抹除。
   - 因为 URL 中失去了房间标识，页面重新挂载后启动模式从 `room` 跌落回默认的 `local`，导致玩家断开房间且看不到正在进行的联机对局，产生“在线数据全丢了”的假象。
3. **切换语言导致暗色外观主题被剥离（P2-1 根因）**：
   - 在 Next.js App Router 软导航切语言时，React 重渲染根布局 `<html>` 节点，非受控的 `data-theme` 属性被移除；且 `<head>` 内的 `ThemeScript` 不会在客户端软导航时重新执行，导致暗色界面翻转回默认浅色且无法自愈。

### 1.2 预期目标
1. **全模式对局防丢（刷新 & 切换语言）**：
   - **双人本地对战**：刷新或切换语言后，完整恢复棋盘、所有落子历史与当前轮次。
   - **人机对战**：刷新或切换语言后，完整恢复落子历史、AI 难度与先后手设置；若在 AI 思考期间刷新，恢复后自动唤醒 Web Worker 重新开始思考，实现无感续弈。
   - **在线好友房**：修正语言切换时的 URL 保留逻辑，配合现有的 60 秒服务端断线宽限期与 `room:rejoin` 机制，实现刷新与切语言均不脱离房间。
2. **语言与外观设置完备保留**：
   - 外观主题（`light` / `dark`）在刷新、切换语言和跨会话访问时始终保持，软导航切语言时持续保持暗色，首屏无样式闪烁（FOUC）。
   - 切换语言时保留当前路径（Pathname）与查询参数（Search Params），并在 Storage 与 Cookie 中同步持久化，再次访问根目录 `/` 时精准直达目标语言。

---

## 2. 根因剖析与架构解法

### 2.1 语言切换跳回首页的根因与 SSG 安全读取（P3-1 闭环）
`src/components/LocaleSwitcher.tsx` 现有实现：
```tsx
// 现有代码：硬编码了仅包含语言代码的根路径
<Link
  href={`/${locale}`}
  onClick={() => persistLocale(locale)}
>
```
由于缺少对当前 `pathname` 和 `searchParams` 的提取与替换，导致用户当前路由上下文被无条件丢弃。

**SSG 契约与解法**：
- `src/app/[locale]/page.tsx` 是带有 `generateStaticParams` 的 SSG 静态预渲染路由。如果在预渲染树中裸调 `useSearchParams()`，会触发 Next.js 的 `BailoutToCSRError` 导致构建（门禁 4）失败。
- 引入纯函数 `computeLocaleSwitchHref(pathname, search, targetLocale)`：
  - `pathname` 通过 SSG 安全的 `usePathname()` 获取；
  - `search` 在客户端渲染环境从 `window.location.search` 读取（或在链接点击/客户端挂载时动态注入），彻底规避 SSG Bailout；
  - 识别并替换开头的 `/${currentLocale}` 语言前缀为 `/${targetLocale}`，保持后续路径（如 `/profile/xxx`）不变；
  - 继承现有的查询字符串（如 `?room=AB12CD`）；
  - 生成目标 URL：`/${targetLocale}/subpath?room=AB12CD`。

### 2.2 本地与人机对战易失性根因
在 `GameShell.tsx` 中，`board`、`moves`、`status`、`nextPlayer` 均为 `useState` 内存状态，页面卸载即消亡。

**解法（基于纯函数回放的极简持久化）**：
- **存储选型**：使用 `sessionStorage`（键名：`gomoku-active-game`）。
  - *为什么是 sessionStorage*：提供标签页隔离能力（单浏览器多开不冲突），并在关闭标签页时自然销毁，最贴合“防误触刷新/切换语言”的使用预期。
- **单一真源设计**：
  - 严禁保存庞大的二维 `board` 数组或冗余的派生状态；
  - 仅需保存最小落子列表 `moves: Move[]` 以及元配置；
  - 恢复时调用纯函数 `replayMoves(moves)`，几毫秒内确定性回放得到完全一致的棋盘与胜负判决。

---

## 3. 详细设计与数据契约

### 3.1 对局持久化数据结构与运行时校验（Session Schema & Validation）
在 `src/components/hooks/game-persistence.ts`（新建独立模块）中定义：

```ts
export type StoredLocalGameSession = {
  mode: "local";
  moves: Move[];
  updatedAt: number;
};

export type StoredAiGameSession = {
  mode: "ai";
  moves: Move[];
  aiDifficulty: AiDifficulty;
  firstPlayer: FirstPlayer;
  openingSeed: number;
  updatedAt: number;
};

export type StoredActiveGame = StoredLocalGameSession | StoredAiGameSession;
```

**防御性运行时校验契约（消除占点崩溃风险）**：
- 在从 `sessionStorage` 反序列化数据时，执行严格的数据完整性校验：
  1. 验证对象结构与 `mode` 字段；
  2. 验证 `moves` 为数组，且每个落子的 `row`/`col` 严格在 `0..14` 范围内；
  3. 验证 `stone` 属于 `"black" | "white"`，且相邻落子颜色交替、`moveNumber` 从 1 开始单调递增；
  4. 校验不通过或数据损坏时，**静默丢弃损坏记录并安全回退为初始空局**，绝不将非法落子传给底层 `placeStone` 避免页面抛错崩溃。

### 3.2 启动与水合安全：实例级求值粒度（P2-2 闭环）
为规避现有 `client-boot-state.ts` 中模块级单例闭包（`let cache`）在软导航切语言时产生陈旧缓存的问题，建立明确的挂载求值契约：
1. **实例级快照粒度**：启动模式与活跃对局快照统一基于 `room-state-utils.ts:158-173` 的 `useBootSnapshot` 模式（使用 `useRef` 隔离实例缓存），**按 `GameShell` 每次组件挂载（包含初次首屏与切语言软导航重挂载）重新求值**；
2. **启动模式判定优先级**：
   - 优先级 1：当前 URL 带有 `?room=` $\rightarrow$ 强制启动为 `"room"`；
   - 优先级 2：`sessionStorage` 存在通过校验的活跃单机对局 $\rightarrow$ 启动为对应模式（`"ai"` 或 `"local"`）；
   - 优先级 3：默认兜底 $\rightarrow$ `"local"`。

### 3.3 各模式对局恢复时序流与 AI 自愈握手（P3-3 闭环）

#### A. 双人本地对战（Local）
1. `GameShell` 挂载，检测到 Storage 存在有效的 `StoredLocalGameSession` 且当前模式为 `local`；
2. 通过 `replayMoves(session.moves)` 还原 `board`；
3. 计算 `lastMove`，通过 `getGameResult` 计算 `status`；
4. 若对局未结束，`nextPlayer = getOpponent(lastMove.stone)`，玩家可直接落子。

#### B. 人机对战（AI）与首帧设置注入
1. **接口契约扩展（首帧注入）**：
   - `useAiGame` 扩充入参接口，支持在初始化时接受恢复的配置项：
     ```ts
     export type UseAiGameOptions = {
       mode: GameMode;
       moves: Move[];
       initialAiDifficulty?: AiDifficulty;
       initialFirstPlayer?: FirstPlayer;
       initialOpeningSeed?: number;
       onCommitGameState: ...;
       onResetGame: ...;
     };
     ```
   - `useAiGame` 内部的 `aiDifficulty`、`firstPlayer` 与 `openingSeedRef` 在**首帧渲染**时直接以恢复的值初始化，严禁在挂载后依赖无守卫的 `setState`，保证 `aiStone` 与人类颜色自首帧起 100% 准确；
2. **AI 自愈握手显式传参（Self-Healing Handshake）**：
   - 挂载恢复后，判断当前最后一手落子与胜负状态；
   - 若 `status.state === "playing"` 且当前轮到 AI 落子（例如人类落子后立即刷新，或在 AI 思考中被刷新）；
   - 握手调用必须**显式传入恢复后的目标参数**：
     `commitAiTurn(board, moves, restoredDifficulty, restoredFirstPlayer)`；
   - 严禁省略参数导致回退到 Hook 内部的默认值，确保 AI 以正确的棋子颜色与思考时限接续计算。

#### C. 在线好友房（Online Room）
1. 语言切换时，`computeLocaleSwitchHref` 将 `?room=CODE` 完好透传至新语言 URL；
2. 路由导航完成，`useBootGameMode` 实例级快照识别到 `?room=` 保持 `room` 工作区激活；
3. `useRoomSocket` 读取 `sessionStorage` 中的 `gomoku-room-session`，自动发起 `room:rejoin`；
4. 服务端由于 60 秒宽限期未超时，无缝回写 `room:state`，对局继续。

### 3.4 状态机控制流与存储清理矩阵（P3-2 闭环）
为避免将清理逻辑片面绑定在“确认弹窗”而导致无弹窗分支（如 `direct`）产生脏数据复活，建立与 `interaction-guards.ts` 严格对齐的清理矩阵：

| 控制流入口 | 分支场景 / 决策 | 对局存储清理策略 | 目标 Key 归属 |
|---|---|---|---|
| `completeModeChange("room")` | `direct` 或弹窗确认后切入联机大厅 | 立即清除单机/人机活跃对局存储，防止后续刷新复活旧局顶掉联机大厅 | `gomoku-active-game` |
| `completeModeChange("ai")` | `direct` 或弹窗确认后切入人机 | 清除本地对局存储；若无匹配的人机存储则初始化新局 | `gomoku-active-game` |
| `completeModeChange("local")` | `direct` 或弹窗确认后切入本地 | 清除人机对局存储；若无匹配的本地存储则初始化新局 | `gomoku-active-game` |
| `resetGame` / `handleAiReset` | 点击“重置棋盘 / 再来一局” | 立即清除当前模式的活跃对局存储，重置为空盘 | `gomoku-active-game` |
| `leaveRoom` | 退出联机房间 | 仅清除联机 Session（`gomoku-room-session`）与 URL，不影响已隔离的单机状态 | `gomoku-room-session` |

---

## 4. 语言与外观设置契约

### 4.1 外观设置（Theme Mode）与软导航防剥离（P2-1 闭环）
- **存储介质**：`localStorage`（Key: `gomoku-theme`）。
- **软导航防剥离机制（新补实现项）**：
  1. 在 `DocumentLocaleSync.tsx`（或专属主题保持 Hook）中，监听 `locale` 路由切换与组件挂载事件；
  2. 软导航重挂载后，自动从 `localStorage` 读取当前主题并在客户端立即执行 `document.documentElement.dataset.theme = theme`，补齐 React 重建 `<html>` 时丢失的 `data-theme` 属性；
  3. 在 `src/app/globals.css` 中配置 `@media (prefers-color-scheme: dark)` 兜底样式，即使在属性绑定的微秒级间隙，暗色背景与文字也能无缝衔接，杜绝翻白闪烁；
  4. 首屏加载依然受 `<head>` 内的 `ThemeScript.tsx` 阻塞保护。

### 4.2 语言设置（Locale Mode）
- **双写持久化**：
  - `localStorage`（Key: `gomoku-locale`）：用于客户端状态感知；
  - `document.cookie`（Key: `gomoku-locale`，`Max-Age=365天`，`Path=/`）：供 Next.js 服务端在用户访问根路径 `/` 时由 `(root)/page.tsx` 读取并 307 重定向。
- **路由无损切换**：
  - `LocaleSwitcher` 计算包含当前路径和所有参数的 targetHref；
  - 切换语言不会跳回根路径，不丢弃对局与查询参数。

---

## 5. 验证与回归测试计划

### 5.1 自动化单元测试（增补 P2-1/P2-2/P3-3 守门项）
1. `computeLocaleSwitchHref` 纯函数测试：
   - 首页 `/zh` 切换到 `/en` $\rightarrow$ `/en`；
   - 子路径 `/zh/profile/p1` 切换到 `/en` $\rightarrow$ `/en/profile/p1`；
   - 带参路径 `/zh?room=ABC` 切换到 `/en` $\rightarrow$ `/en?room=ABC`；
   - 复杂参数 `/zh/profile/p1?tab=history&room=ABC` 切换到 `/fr` $\rightarrow$ `/fr/profile/p1?tab=history&room=ABC`。
2. `game-persistence` 序列化、校验与回退测试：
   - 非法或损坏的 storage 容错丢弃并回退默认局；
   - 坐标越界、颜色交替异常的防御性拦截；
   - `replayMoves` 状态完全一致性比对。
3. `client-boot-state` 启动与软导航测试（P2-2 守门）：
   - 验证实例级缓存按挂载求值；
   - 模拟软导航重新挂载，断言若缓存退化为模块级则测试必定失败。
4. `useAiGame` 首帧注入与自愈握手测试（P3-3 守门）：
   - 覆盖 `firstPlayer: "ai"` 场景，断言恢复后 AI 执黑先手落子颜色完全正确；
   - 验证 `initialAiDifficulty` 与 `initialOpeningSeed` 首帧注入有效性。
5. 外观主题软导航保持测试（P2-1 守门）：
   - 模拟切语言软导航后 `DocumentLocaleSync` 正确回写 `document.documentElement.dataset.theme`。

### 5.2 本地工程门禁验证
1. `npx tsc --noEmit`：0 错误；
2. `npm run lint`：0 错误 0 警告；
3. `npm test`：全测试通过（包含新增测试用例）；
4. `npm run build`：生产构建通过（验证 SSG 路由零 Bailout 报错）；
5. `npm run verify:online`：在线联机时序烟测全绿。

### 5.3 关键场景手工与真机 CDP 走查
1. **场景 1**：本地双人对战走 5 步 $\rightarrow$ 刷新网页 $\rightarrow$ 验证 5 步依然存在、黑白轮次正确、落子可继续。
2. **场景 2**：人机对战人类落子 $\rightarrow$ AI 倒计时中立即按 F5 刷新 $\rightarrow$ 验证页面恢复且 AI 自动继续思考落子。
3. **场景 3（P3-3 实测）**：人机对战选择 AI 先手（执黑），玩家落子后在 AI 思考中切换语言 $\rightarrow$ 验证页面保持在人机模式、AI 依然执黑且自动落黑子，文本变为新语言。
4. **场景 4**：在个人主页 `/zh/profile/[id]` 切换为英文 $\rightarrow$ 验证跳转到 `/en/profile/[id]`，未跳回首页。
5. **场景 5**：在线好友房正在下棋中切换语言 $\rightarrow$ 验证房间号未丢、无缝重连成功，对局继续。
6. **场景 6（P2-1 独立复核）**：暗色模式下（含生产构建）切换语言 $\rightarrow$ 以 CDP 探针高频采样，验证 `data-theme` 全程恒为 `dark`，背景色恒为暗色 `rgb(18, 20, 23)`，零浅色白屏闪烁。
