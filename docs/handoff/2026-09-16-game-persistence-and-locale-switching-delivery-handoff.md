# 对局持久化、语言平滑切换与外观保持交付交接单

- **交付日期**：2026-09-16
- **交付主题**：对局持久化、语言平滑切换与外观保持实现落地（Code Implementation & Test Suites）
- **基准方案文档**：[`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md`](../GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md)
- **前驱定稿交付**：`9763c09 docs(plan): finalize game persistence design plan upon round 3 convergence`
- **交付类型**：**核心功能与架构代码交付（Implementation Delivery）**

---

## 1. 核心交付成果与改动范围

针对玩家刷新浏览器丢局、切换语言跳回首页且丢失房间号脱离联机房间、以及切换语言导致暗色外观主题被剥离翻白等痛点，全面完成代码落地：

### 1.1 路由与语言导航解耦 (`src/lib/locale-navigation.ts` + `src/components/LocaleSwitcher.tsx`)
- 实现纯函数 `computeLocaleSwitchHref(pathname, search, targetLocale)`，将 `/${currentLocale}` 规范替换为 `/${targetLocale}`，完整保留子路由与全部查询字符串；
- `LocaleSwitcher` 采用三阶段执行流：
  1. 首帧与 SSG 静态构建使用 `usePathname()` 纯路径输出，0 CSR Bailout 风险；
  2. 客户端水合通过 `useSyncExternalStore` 读取 `window.location.search` 响应式更新链接；
  3. 交互点击通过 `handleLocaleClick` 检测实时差异并通过 `router.push` 即刻跳转，并写入 `localStorage` 与 `cookie` 双持久化。

### 1.2 外观主题零白屏与预绘制回写 (`src/lib/theme.ts`, `globals.css`, `DocumentLocaleSync.tsx`)
- 提取并导出权威主题源 `resolveCurrentTheme(): ThemeMode`（`stored ?? matchMedia`），与 `ThemeScript.tsx` 同源统一；
- 引入 SSR 安全的 `useIsomorphicLayoutEffect`，在 `DocumentLocaleSync` 中于 DOM 变更后、绘制（Paint）前同步检查并回写 `document.documentElement.dataset.theme`，100% 杜绝软导航无属性帧导致的白屏；
- 在 `globals.css` 中注入 `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { ... } }`，声明集 100% 严格对齐 `globals.css:35-67` 权威 27 项暗色属性（含 `color-scheme: dark`），消灭伪代码外部变量与反向劫持。

### 1.3 对局与工作区持久化核心 (`src/lib/game-persistence.ts`)
- 基于 `sessionStorage` 建立 `gomoku-active-game` 与 `gomoku-selected-workspace` 持久化；
- 实现运行时防御性校验函数 `isValidActiveGame`，严格核验落子坐标（`0..14` 整数且不重叠）、黑先手与颜色交替规则、步数单调自增、AI 难度分级与先后手有效性，异常损坏数据静默清理并安全回退。

### 1.4 启动四级优先级与实例级快照 (`src/components/client-boot-state.ts`)
- 确立四级启动解析判定优先级：URL `?room=` > 活跃单机/人机对局 > 用户选中工作区 > 默认 `local` 兜底；
- 快照读取升级为基于 `useRef` 的实例级 Hook `useBootGameMode` 与 `useBootActiveGame`，每次组件挂载（初次渲染与切语言软导航重载）按实例重新求值，杜绝模块级单例陈旧缓存。

### 1.5 AI 首帧注入与自愈握手 (`src/components/hooks/useAiGame.ts`)
- `useAiGame` 扩充 `initialAiDifficulty`、`initialFirstPlayer`、`initialOpeningSeed` 首帧参数注入，消除首帧颜色错乱与难度漂移；
- 导出 `getOpeningSeed()` 供落子持久化保存；
- `GameShell` 挂载恢复后，若轮到 AI 思考，通过单次 `hasHealedRef` 守卫显式调用 `aiGame.commitAiTurn(...)` 唤醒思考续弈。

### 1.6 表现层总装配与控制流清理矩阵 (`src/components/GameShell.tsx`)
- 挂载时恢复活跃对局棋盘与轮次状态；
- 落子、悔棋与 AI 结算时自动同步写入 `sessionStorage`（0 步自动清除）；
- 严格落实 §3.4 清理契约：`completeModeChange` 清除旧对局并写入新工作区；`resetGame` 仅清除当前活跃局；`leaveRoom` 显式写入并保持 `"room"` 工作区，玩家退房后刷新或切语言依然稳健停留在联机大厅。

---

## 2. 门禁基线指标（全部全绿通过）

1. **TypeScript 编译检查** (`npx tsc --noEmit`)：**0 错误**（严格类型推导，无逆变与缺少属性）。
2. **代码规范检查** (`npm run lint`)：**0 错误 0 警告**（严格遵守 React 19 Hooks 规则，无 setState-in-effect 与 render-ref-access）。
3. **单元测试** (`npm test`)：**31 个测试套件 / 274 项用例 100% 通过**（新增 `locale-navigation.test.ts` 5 项、`game-persistence.test.ts` 16 项、`client-boot-state.test.ts` 扩充至 8 项，全部全绿）。
4. **生产构建** (`npm run build`)：**构建成功**，所有多语言路由静态预渲染正常（SSG 零 Bailout，`/[locale]` 保持为 `● (SSG)`）。
