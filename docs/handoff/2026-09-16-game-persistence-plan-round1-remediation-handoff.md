# 对局持久化与语言平滑切换方案 Round 1 审查缺陷闭环交接单

- **交接日期**：2026-09-16
- **对应审查**：WorkBuddy Round 1 独立审查（提交 `90237ce`，交接单 [`2026-09-16-workbuddy-code-review-game-persistence-round1-handoff.md`](2026-09-16-workbuddy-code-review-game-persistence-round1-handoff.md)）
- **审查缺陷闭环**：2×P2（P2-1、P2-2）与 3×P3（P3-1、P3-2、P3-3），共 5 项全部闭环
- **核心修复文件**：[`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md`](../GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md)
- **交付类型**：**方案设计文档缺陷收敛与契约定稿（Technical Design Revision）**，源码尚未进入实现阶段。

---

## 1. 缺陷逐项闭环证明与技术对齐

### 1.1 P2-1 闭环：软导航切语言外观主题剥离问题
- **审查发现**：Next.js App Router 软导航切语言时，React 重建根布局 `<html>` 节点并剥离非受控的 `data-theme` 属性；`<head>` 内 `ThemeScript` 在客户端导航不重跑，导致暗色界面翻转回默认浅色 `rgb(246, 247, 242)`。方案原先断言“已完备、无需实现”与真机 CDP 实测相悖。
- **方案更新**：
  1. 在 §1.1、§4.1 及 §5.3 场景 6 中全面纠正，将主题软导航保持列为**新增显式实现项**；
  2. 确定在客户端组件（`DocumentLocaleSync.tsx` 或专属主题同步 Hook）中监听 `locale` 与挂载事件，主动从 `localStorage` 读取并同步回写 `document.documentElement.dataset.theme = theme`；
  3. 在 `src/app/globals.css` 增设深色系统偏好媒体查询兜底，消除任何微秒级白屏闪烁；
  4. §5.1 增设主题软导航保持测试守门，§5.3 场景 6 固化高频 CDP 采样验收标准。

### 1.2 P2-2 闭环：启动模式快照求值粒度（实例级缓存）
- **审查发现**：`client-boot-state.ts` 目前使用模块级单例闭包 `let cache`。软导航切语言时组件重挂载但 JS 模块不重新执行，导致缓存死锁在首屏模式，sessionStorage 里的活跃对局无法在切语言后被识别。
- **方案更新**：
  1. 在 §3.2 明确快照求值粒度：全面迁移为实例级 `useRef` 缓存（`useBootSnapshot` 模式），**按 `GameShell` 每次挂载（包括整页刷新与软导航切语言）重新求值**；
  2. 启动判定优先级严格固化：`?room=` $\rightarrow$ sessionStorage 活跃对局 $\rightarrow$ `local`；
  3. §5.1 增设守门测试：模拟软导航重挂载，断言缓存若退化为模块级则测试必定失败。

### 1.3 P3-1 闭环：SSG 预渲染路由下的安全路由读取
- **审查发现**：`/[locale]` 属于静态预渲染路由（`generateStaticParams`），在组件内直接裸调 `useSearchParams()` 会触发 Next.js 的 `BailoutToCSRError` 导致构建（门禁 4）失败。
- **方案更新**：
  1. 在 §2.1 确立 SSG 契约规范：`pathname` 采用 SSG 安全的 `usePathname()`；
  2. `search` 参数禁止在预渲染树中裸调 `useSearchParams()` 读取，改由客户端交互/挂载生命周期内自 `window.location.search` 获取，或通过 `<Suspense>` 隔离；
  3. 确保 `npm run build` 保持全绿且 `/[locale]` 保持为 SSG 页面（输出标 `●`）。

### 1.4 P3-2 闭环：状态机控制流与存储清理矩阵
- **审查发现**：方案原先将清理绑定在“确认弹窗”这一 UI 事件上，但 `getModeChangeDecision` 存在无需弹窗的 `direct` 路径（如 `local -> room`），导致旧对局未被清理，后续刷新产生脏对局复活。
- **方案更新**：
  1. 在 §3.4 建立完整的控制流清理矩阵，将清理锚定在 `completeModeChange` 与 `resetGame` 真实入口；
  2. 明确进入 `room`、`ai`、`local` 时分别失效非目标模式存储的规则；
  3. 规避了任何路径下的脏对局跨局复活风险。

### 1.5 P3-3 闭环：AI 自愈握手接口契约与首帧注入时序
- **审查发现**：`useAiGame` 硬编码初值 `"normal"`/`"human"`，无入参注入，调用 `commitAiTurn(board, moves)` 缺少参数会导致 AI 先手对局以默认的执白颜色与难度落子，造成棋子颜色错乱与棋局污染。
- **方案更新**：
  1. 在 §3.3.B 扩充 `useAiGame` 选项契约：`initialAiDifficulty`、`initialFirstPlayer`、`initialOpeningSeed`，首帧渲染即完成设置注入；
  2. 自愈握手调用必须显式传参：`commitAiTurn(board, moves, restoredDifficulty, restoredFirstPlayer)`；
  3. 在 §3.1 增加反序列化防御性校验，损坏或越界数据直接丢弃回退默认局，防止底层 `placeStone` 抛错崩溃；
  4. §5.1 增设 AI 先手自愈握手测试守门。

---

## 2. 本地门禁验证

1. `npx tsc --noEmit`：0 错误（TypeScript 严格检查通过）
2. `npm run lint`：0 错误，0 警告（ESLint 全量代码扫描通过）
3. `npm test`：29 个测试套件 / 248 项用例 100% 通过
4. `npm run build`：生产构建完全成功（11 个静态路由全部预渲染通过）
5. `npm run verify:online`：联机房间与时序烟测全绿

---

## 3. 下一步计划

本轮方案审查缺陷已 100% 针对性收敛闭环，派发 WorkBuddy Round 2 复核。
