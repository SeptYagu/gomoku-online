# WorkBuddy 独立审查 Round 5 复查（对局持久化 / 语言切换 / 外观保持 实现交付终审）

> 审查日期：2026-09-16 · 审查轮次：Round 5（实现交付复查终审）· 结论：**审查通过（PASS）**

---

## 一、版本与核验确认

- **待审提交**：`0197cee`（与基准锚点 `9763c09` 保持一致，无分叉，工作区干净）。
- **审查范围**：`9763c09..0197cee` 全量 29 文件（+2352/−124），逐文件阅读；重点核验 Round 4 P3-1 修复提交（`GameShell.tsx` / `useAiGame.ts` / `tools/smoke-persistence.ts`）。

---

## 二、P3-1 缺陷闭环核验

修复采用 Round 4 建议方案 1+3 组合，代码追踪确认 100% 闭环：
- `src/components/hooks/useAiGame.ts:125-143`：`pendingAiResolveRef` 在 `cancelAiTurn`/请求接管时主动 settle 未决 Promise 为 `null`，卸载清理改调 `cancelAiTurn()` 复位 `isAiThinking`/倒计时/调度器——原「`await` 永不返回」死锁根因消除；
- `src/components/GameShell.tsx:178-196`：恢复 effect 新增 cleanup（cancel + 复位 `hasRestoredBootRef`/`hasHealedRef`），StrictMode Mount 2 干净重恢复恰一次搜索；
- 被取消搜索的 `null` 结果不会误判 draw：`commitAiTurn` 先经 `aiRequestIdRef` 失效判定才落子/判和；
- deps 精简为 `[isHydrated, bootActiveGame, bootMode]` 安全：`useBootSnapshot` 经 `cacheRef` 挂载级缓存，`bootActiveGame`/`bootMode` 引用稳定，正常对局中 cleanup 不会反复触发取消 AI 搜索。

---

## 三、门禁与独立验证结果

- **四道本地门禁**：全绿（tsc 0 错、lint 0/0、build 11 页预渲染通过；Vitest 31 套 / 282 例单测全绿）。
- **独立验证 1**：`npm run smoke:persistence` 5/5 通过——S-F 在 dev（tsx 直启，StrictMode 生效）实测切语言恢复后 AI 恰落 1 子（stones=2）且按钮解锁。
- **独立验证 2**（负向竞态探针）：自建 CDP 探针，在 **AI 搜索进行中**（mode-pill disabled 确定性信号）点击切语言软导航重挂载，连续采样 6s 断言——stones 恒为 2（无双落子）、按钮解锁、未出现取消搜索导致的 draw 误判。

---

## 四、终审结论

**判定：无 P0~P3 缺陷，无实质性待确认风险，审查通过（PASS）。**
