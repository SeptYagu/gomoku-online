# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名 · Round 2 审查缺陷闭环交接单

> 基准提交：`b2c6383`　待审提交：`eac1b95`　Round 2 审查报告提交：`b019f61` / `f85bbe7`
> 本轮目标：针对 WorkBuddy Round 2 独立代码审查指出的 2 项缺陷（0×P0 / 0×P1 / **1×P2** / **1×P3**）实施 100% 深度闭环修复，补齐高确定性守门单测，优化测试环境适配，四道本地门禁全绿，推进 Round 3 复审。

---

## 一、缺陷修复与闭环核销总览

| 缺陷编号 | 级别 | 缺陷简述与根因 | 核心修复措施与受影响文件 | 守门单测与验证结果 |
| :--- | :---: | :--- | :--- | :--- |
| **P2-1** | **P2** | `canonicalizePlayerName` 非幂等 + 守门点二次规范化：`.slice(0, 24)` 位于 `.toLowerCase()` 之前，导致末位含展开字符（如 `U+0130` `İ` 展开为 `i\u0307`，长度 24 变 25）在二次规范化时组合点被截断，`canon(canon(x)) !== canon(x)`。24 单元末位 `İ` 的注册名在守门点双重规范化时发散，访客可完整冒用该名入座 | 在 `src/server/accounts.ts` 中调整 `canonicalizePlayerName` 顺序，使 `.toLowerCase()` 先于 `.slice(0, MAX_PLAYER_NAME_LENGTH)` 执行。展开后的字符先全部转为小写再截断，对任意输入天然恒等，彻底消除二次规范化发散漏洞 | 新增 `accounts.test.ts` 守门用例：①在包含 `U+0130`、大写、全角等丰富语料库上断言 `canon(canon(x)) === canon(x)` 恒成立；②注册 24 单元末位 `U+0130` 的名字，访客以该名提交 `resolvePlayerIdentity` 断言 `error.code === "name-reserved"`。回退顺序此二断言确定性变红 |
| **P3-1** | **P3** | 并发二次查重把自动派生代号冲突误判为 `duplicate-handle`：异步密码分支在 `await hashPassword` 之后二次查重直接拒绝了未指定代号的并发请求，与先落库后再注册的「自动追加后缀」兜底语义不一致 | 在 `src/server/accounts.ts` 的 `createAccount` 异步写入 tick 中，仅当用户显式提供了 `requestedHandle` 时才保留直接查重拒绝语义；若用户未指定代号，则在 `accountId` 碰撞自愈循环完成后重新调用 `createAvailablePublicHandle(displayName, accountId)` 派生可用代号（如追加 `_suffix`），再写入 Map 与落盘 | 新增 `accounts.test.ts` 守门用例：并发提交两个不同显示名但具有相同代号基名（`Dana!` 与 `Dana?`）且未指定代号的注册请求，断言两者均 `ok: true` 且分配到互不冲突的代号（`dana` 与 `dana_suffix`）；同时断言显式同代号并发仍返回 `duplicate-handle`。回退重算后该单测确定性变红 |
| **环境优化** | **-** | Vitest 在特定 runner/pool 下对 `react` mock 的 CJS/ESM 兼容性：`useRoomChat.test.ts` 的 `vi.mock("react")` 仅提供了解构导出，在部分环境可能因未导出 `default` 导致 `useState` 报空 | 在 `src/components/hooks/useRoomChat.test.ts` 中为 mock 对象同时挂载 `default` 属性，确保无论是 ESM 解构导入还是 CJS 命名空间访问均 100% 稳定运行 | 实测在默认 runner 与 `--pool=vmForks` 下全量套件 35/35 均稳定通过（357/357 PASS，0 flake） |

---

## 二、修改文件与代码改动清单

```
 M src/components/hooks/useRoomChat.test.ts # 补齐 mock react 的 default 属性，消除跨 pool 环境敏感性
 M src/server/accounts.test.ts              # 新增 P2-1 幂等与 U+0130 冒用守门、P3-1 自动代号重派生守门测试
 M src/server/accounts.ts                   # 调整 toLowerCase 与 slice 顺序保证幂等；非显式代号并发冲突时重算派生代号
```

---

## 三、本地工程门禁复验结果（四道硬指标全绿）

依据工程红线与复审要求，在提交前对全量仓库依次执行四道本地门禁验证：

1. **TypeScript 编译检查**：
   ```bash
   npx tsc --noEmit
   # Exit code: 0（0 错误，严格类型系统推导完全通过）
   ```
2. **ESLint 规范扫描**：
   ```bash
   npm run lint
   # Exit code: 0（0 错误，0 警告，React 19 渲染与 Hooks 规则扫描全绿）
   ```
3. **Vitest 单元测试套件**：
   ```bash
   npm test
   # Test Files: 35 passed (35)
   # Tests:      357 passed (357)
   # Duration:   6.81s (100% 稳定全绿，无任何 flake 或假红)
   # 验证覆盖：默认 runner 与 --pool=vmForks 均实跑 35/35 套件全部通过
   ```
4. **Next.js 生产构建**：
   ```bash
   npm run build
   # Exit code: 0（18/18 页面静态优化与 SSG 预渲染完全成功）
   # ○ (Static) /_not-found, /icon.svg
   # ● (SSG)    /[locale], /[locale]/feedback (6 语种全部静态生成成功)
   # ƒ (Dynamic) /, /[locale]/profile/[playerId], /api/version, /feedback
   ```

---

## 四、双智能体审查闭环状态与交接推进

- **当前状态**：Antigravity 主开发智能体已 100% 闭环核销 Round 2 的全部 2 项缺陷（1×P2 / 1×P3），测试套件扩充至 357 例，本地门禁全量通过。
- **下一步动作**：
  1. 提交并推送修复代码至远端分支；
  2. 依协作协议与命令硬门槛，调用 WorkBuddy CLI 发起 Round 3 独立对抗性代码复查（保持基准 `--base-sha b2c6383` 锚定基准不漂移）；
  3. 挂起等待 WorkBuddy Round 3 复查判定。
