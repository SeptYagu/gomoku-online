# 联机对战命名规范、排行榜搜索框修复、账号登录与防冒名 · Round 1 审查缺陷闭环交接单

> 基准提交：`b2c6383`　前序待审提交：`5c03b7b`　Round 1 审查报告提交：`e6b1cf1`
> 本轮目标：针对 WorkBuddy Round 1 独立代码审查指出的 4 项缺陷（0×P0 / 0×P1 / **2×P2** / **2×P3**）实施 100% 深度闭环修复，补齐高确定性守门单测，四道本地门禁全绿，推进 Round 2 复审。

---

## 一、缺陷修复与闭环核销总览

| 缺陷编号 | 级别 | 缺陷简述与根因 | 核心修复措施与受影响文件 | 守门单测与验证结果 |
| :--- | :---: | :--- | :--- | :--- |
| **P2-1** | **P2** | `createAccount` 异步密码分支引入 TOCTOU 竞态：在查重（`hasDisplayName`/`playerIdByPublicHandle.has`）与写入 Map 之间插入 `await hashPassword` 让出点，并发同名注册双双成功并共用同一代号，导致唯一性不变量破坏与代号遮蔽 | 在 `src/server/accounts.ts` 的 `createAccount` 异步密码分支中，在 `await hashPassword(...)` 完成后的**同一同步写入 tick** 中立即重新执行 `this.hasDisplayName(displayName)` 与 `this.playerIdByPublicHandle.has(publicHandle)` 重复查重；若已被并发占用立即返回 `duplicate-name` 或 `duplicate-handle`，并加入 `accountId` 碰撞自愈循环 | 新增 `accounts.test.ts` 并发守门用例：`Promise.all` 两个同名同密码注册请求，断言**恰好一个 `ok: true`、另一个返回 `duplicate-name`**；断言 `findByDisplayName` 与 `findByPublicHandle` 指向胜出账号，无任何代号覆盖。回退二次校验该单测确定性变红 |
| **P2-2** | **P2** | 保留名守门与生效名长度口径不一致，24 字符注册名可被截断绕过冒用：守门谓词使用未截断的 `canonicalizePlayerName`，而访客生效名经 `normalizeDisplayName` 截断为 24 字符；访客提交 24 字符名 + 任意追加字符时，守门判未保留，生效名截回注册名冒充成功 | ①在 `canonicalizePlayerName` 末尾补充 `.slice(0, MAX_PLAYER_NAME_LENGTH)` 保持 24 字符统一截断口径，并将 `.toLocaleLowerCase()` 收敛为跨环境一致的 `.toLowerCase()`；②在 `resolvePlayerIdentity` 守门点将 `input.playerName` 先经 `normalizeDisplayName` 规范化后再进入 `canonicalizePlayerName` | 新增 `accounts.test.ts` 防冒用守门用例：注册 24 字符全长账号后，以该名追加 "ZZZ"（27 字符）提交 `resolvePlayerIdentity`，断言 `error.code === "name-reserved"` 且 `isNameReserved` 判真；并断言两规范化函数在超长输入下口径严格等价。回退截断该单测确定性变红 |
| **P3-1** | **P3** | 登录令牌输入框承诺的 "recovery" 通道在 UI 上不可达：`OnlineLobbyView.tsx` 提交按钮 `disabled` 与 `onSubmit` 早返回硬编码要求 identifier 非空，只填令牌无法提交（服务端路径 A 端到端不可达）；且已有密码账号不接受令牌作凭据，占位文案属超范围承诺 | ①在 `OnlineLobbyView.tsx` 中放宽提交门限：`loginToken` 非空即允许提交（`disabled = loading || (!loginIdentifier.trim() && !loginToken.trim())`），`identifier` 留空时向服务端传递 `{ token: loginToken.trim() }`，端到端打通服务端纯令牌路径 A；②收敛 6 语种 `accountTokenPlaceholder` 文案，准确描述为“原设备令牌 (用于令牌登录或认领无密码账号)” | 新增 `accounts.test.ts` 纯令牌登录测试：空标识符 + 有效令牌成功登录并返回 session 快照；空标识符 + 无效令牌返回 `account-token-invalid`。前端提交按钮与表单早返回门禁已打通 |
| **P3-2** | **P3** | `guestSessionError` 消息键为死键：消费侧 `room-state-utils.ts` 已声明并消费，但提供侧 `GameShell.tsx` 未装配且 `dictionaries.ts` 未声明，导致 5 种非英文语种下会话失效提示回退英文且分支不可达 | ①在 `src/i18n/dictionaries.ts` 的 `GameDictionary["room"]` 中声明 `guestSessionError: string;`，并在 6 语种（`en`, `zh`, `fr`, `es`, `ru`, `ar`）中全量补齐地道翻译；②在 `room-state-utils.ts` 中导出强类型装配函数 `buildRoomMessages`；③在 `GameShell.tsx` 中使用 `buildRoomMessages(dictionary.room)` 完成全量提供侧装配 | 新增 `room-state-utils.test.ts` 穿透单测：遍历全部 6 语种字典，断言 `guestSessionError` 存在且非空，经 `buildRoomMessages` 组装后传入 `resolveRoomErrorMessage`，验证其 100% 返回本地化文案且绝不回退服务端英文；若 `GameShell` 或装配函数缺键，TypeScript 编译直接失败 |

---

## 二、修改文件与代码改动清单

```
 M src/components/GameShell.tsx                   # 引入 buildRoomMessages 强类型完成 9 键全量装配
 M src/components/hooks/room-state-utils.test.ts  # 新增 P3-2 6 语种字典穿透装配与错误映射测试
 M src/components/hooks/room-state-utils.ts       # 导出 RoomMessageKeys 与 buildRoomMessages 组装工具
 M src/components/online/OnlineLobbyView.tsx      # 放开纯令牌提交门限，identifier 留空可命中路径 A
 M src/i18n/dictionaries.ts                       # 6 语种补齐 guestSessionError，收敛 accountTokenPlaceholder
 M src/server/accounts.test.ts                    # 新增 P2-1 并发竞态、P2-2 24 字符截断、P3-1 纯令牌登录守门测试
 M src/server/accounts.ts                         # P2-1 密码分支查重收进单一写入 tick；P2-2 截断与小写收敛
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
   # Tests:      355 passed (355)
   # Duration:   8.46s (100% 稳定全绿，无任何 flake 或假红)
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

- **当前状态**：Antigravity 主开发智能体已 100% 闭环核销 Round 1 的全部 4 项缺陷（2×P2 / 2×P3），自动化测试套件扩充至 355 例，本地门禁全量通过。
- **下一步动作**：
  1. 提交并推送修复代码至远端分支；
  2. 依据协作协议与命令硬门槛，调用 WorkBuddy CLI 发起 Round 2 独立对抗性代码复查（保持 `--base-sha b2c6383` 锚定基准不漂移）；
  3. 挂起等待 WorkBuddy Round 2 复查判定。
