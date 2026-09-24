# 阶段交付与自愈交接单 —— 联机对战账号登录与防冒名（Round 3 审查缺陷闭环）

> 对应审查单：[`docs/handoff/2026-09-23-online-pvp-code-review-round3-handoff.md`](2026-09-23-online-pvp-code-review-round3-handoff.md)（审查提交 `fe36fac`，被审 `83a2aab`）  
> 修复范围：`src/server/accounts.ts`、`src/server/accounts.test.ts`、`STATUS.md`、`docs/handoff/INDEX.md`  
> 门禁状态：**四道门禁全绿（35 套 / 358 项单元测试通过，Next.js 生产构建 18/18 路由成功）**

---

## 1. 缺陷修复对照清单

### P2-1：`canonicalizePlayerName` 规范化幂等性与守门点双重规范化消除（完全闭环）

#### 根因剖析
1. **守门点双重规范化（核心发散源）**：
   在 `resolvePlayerIdentity` 中，原本执行了：
   ```ts
   const requestedName = canonicalizePlayerName(normalizeDisplayName(input.playerName));
   if (requestedName && accountStore.isNameReserved(requestedName)) { ... }
   ```
   而在 `isNameReserved(name)` 内部又执行了 `const canonical = canonicalizePlayerName(name)`。这意味着 `requestedName` 被施加了**两次**规范化（`canon(canon(x))`），而注册账号侧在 `some((acc) => canonicalizePlayerName(acc.displayName) === canonical)` 中只执行了**一次**规范化（`canon(x)`）。一旦输入存在非幂等字符序列，两侧计算结果即发生发散，导致 `isNameReserved` 返回 `false`，访客绕过守门成功冒名。
2. **NFKC 与格式字符剥离时序**：
   原本 `\p{Cf}` 等格式字符的正则剥离发生在 `normalize("NFKC")` 之后。当输入含有处于基字符与组合附加符之间的格式字符（如 ZWJ `\u200D`）时，首次 NFKC 无法跨越格式字符合成，随后剥离格式字符产出分解序列；第二次运行 NFKC 时才执行合成，产生长度与内容变化。

#### 修复实施
1. **主选方案：守门点单一规范化契约（`src/server/accounts.ts:910-917`）**：
   重构 `resolvePlayerIdentity` 守门逻辑，直接将 `normalizeDisplayName(input.playerName)` 透传给 `accountStore.isNameReserved(requestedName)`，显式解除外部预先 `canonicalizePlayerName`：
   ```ts
   // Gate contract: pass normalizeDisplayName output to isNameReserved (do NOT pre-canonicalize here;
   // isNameReserved applies canonicalizePlayerName once internally, perfectly matching the account store's
   // single-pass canonicalization on acc.displayName)
   const requestedName = normalizeDisplayName(input.playerName);
   if (requestedName && accountStore.isNameReserved(requestedName)) {
     return failure("name-reserved", "This display name is registered to an account. Please sign in to use this name.");
   }
   ```
   使守门侧与账号侧比对双方恒处于「单次规范化」同一基准线（`canon(normalizeDisplayName(input)) === canon(normalizeDisplayName(stored))`），从根本上消除任何由于幂等性差异导致的守门发散。
2. **纵深防御：`canonicalizePlayerName` 剥离时序前置与有界固定点收敛（`src/server/accounts.ts:140-163`）**：
   将 `\p{Cf}` 剥离置于 `normalize("NFKC")` 之前，并在尾部增加 2 次固定点迭代收敛保护（检测到 `next === current` 立即提前退出），彻底吸收次级合成与大小写映射展开，确保在各类复杂 Unicode 字符（含格式控制符 + 组合附加符、希腊语大小写等）上的幂等性。
3. **导出 `normalizeDisplayName` 并增补对抗性单元测试（`src/server/accounts.ts:1016`、`src/server/accounts.test.ts:1008-1044`）**：
   - 在 `accounts.test.ts` 中针对 WorkBuddy Round 3 报告指出的对抗性语料构建独立用例：
     `"a\u200D\u0301bcdefghij"`、`"alice\u200D\u030C"`、`"a\u03AA\u0301b"`、`"A".repeat(23) + "\u0130"`、`"A".repeat(24) + "ZZZ"`。
   - 逐一断言：`accountStore.isNameReserved(raw)` 为 `true`，`accountStore.isNameReserved(registeredName)` 为 `true`，`accountStore.isNameReserved(canon(raw))` 为 `true`。
   - 访客以逐字节相同名称提交 `resolvePlayerIdentity` 时，统一且确定性返回 `{ ok: false, error: { code: "name-reserved" } }`。
   - 变异验证：回退守门单次规范化并采用旧版 canon 时，用例确定性变红（访客冒名成功）。

---

## 2. 本地工程门禁验证数据

- **门禁 1：TypeScript 编译检查 (`npx tsc --noEmit`)**：
  0 错误，严格类型无降级。
- **门禁 2：代码规范扫描 (`npm run lint`)**：
  0 错误，0 警告。
- **门禁 3：Vitest 单元测试 (`npm test`)**：
  35 个测试套件，358 项测试用例全部通过（100% 全绿，0 flake）。
- **门禁 4：Next.js 生产构建 (`npm run build`)**：
  18/18 路由预渲染成功（所有多语言及反馈静态页面均保持 SSG）。
- **前序闭环保留状态**：
  `U+0130` 窗口拦截保留、P3-1 并发自动代号重派生用例（`accounts.test.ts:1046-1076`）保持通过、无新缺陷引入。

---

## 3. 交付物与提交基准

- **基准 Commit SHA**：`b2c6383`（全功能审查锚点）
- **直接父提交**：`fe36fac`（Round 3 独立代码审查记录）
- **待审改动文件**：
  - `src/server/accounts.ts`：守门点调整为单次规范化，`canonicalizePlayerName` 优化并导出 `normalizeDisplayName`
  - `src/server/accounts.test.ts`：增补对抗性冒名拦截单测（358 项全绿）
  - `docs/handoff/2026-09-24-online-pvp-auth-and-leaderboard-code-review-round3-remediation-handoff.md`：本交接文档
  - `docs/handoff/INDEX.md`：索引登记
  - `STATUS.md`：动态事实基准更新
