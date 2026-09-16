# 不公开房间创建/加入交互解耦（Round 3 复查缺陷闭环）交接单

交付日期：2026-09-16
对应提交主题：`fix(lobby): resolve round 3 review findings for unlisted room creation disambiguation`

---

## 1. 交付背景与审查缺陷闭环

在对 `bca7674` 的 Round 3 独立复查（详见 [`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round3-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round3-handoff.md)）中，WorkBuddy 确认全部产品代码功能、无障碍层级（`h1` → `h2`）及真机取证均完全符合预期，仅指出 1 项测试守门收窄缺陷（P3-1）。本提交已完成闭环：

### P3-1: `orJoinExisting` 分隔带单字连接词断言作用域收窄至子树
- **根因**：Round 2 将 `orJoinExisting` 收敛为单字连接词后，`LobbyMatchmaking.test.ts` 的整文档 `toContain` 断言在 `zh`（“或”）和 `ar`（“أو”）语种下命中常驻折叠副标题 `createOrJoin`，导致删除分隔带 `<span>` 后断言恒真（守门失效）。
- **修复**：
  1. 将测试中的断言收窄为对 `<div class="lobby-friend-divider" aria-hidden="true"><span>([^<]*)</span></div>` 元素内容的精确正则捕获与等值比较。
  2. 扩展至全部 6 种官方语言（`en`, `zh`, `fr`, `es`, `ru`, `ar`）全量遍历，并兼容 `renderToString` 的 HTML 实体转义（如单引号 `&#x27;`）。
- **变异探针证伪证据**：
  - 在 `LobbyMatchmaking.tsx` 中临时移除 `<span>{labels.orJoinExisting}</span>` 后运行 `npm test`，测试用例立即红灯失败（`AssertionError: expected null to be truthy`，2/3 失败）；
  - 恢复 `<span>` 后测试立即全绿通过，证实断言具备严格的回归阻断能力。

---

## 2. 变更文件清单

| 文件 | 变更性质 | 说明 |
|---|---|---|
| `src/components/online/lobby/LobbyMatchmaking.test.ts` | 修改 | 分隔带连接词断言收窄为子树捕获，覆盖 6 语种与 HTML 实体转义 |
| `STATUS.md` | 修改 | 校准 `STATUS.md:11` 被审交付回填与里程碑记录 |
| `docs/handoff/INDEX.md` | 修改 | 追加本次交接单索引 |

---

## 3. 本地门禁验证数据（全绿通过）

| 门禁项 | 命令 | 检查结果 | 详细指标 |
|---|---|---|---|
| 门禁 1: 类型检查 | `npx tsc --noEmit` | **PASS (0 errors)** | 严格类型推导，无逆变与缺少属性 |
| 门禁 2: 规范扫描 | `npm run lint` | **PASS (0 errors, 0 warnings)** | 遵循 ESLint 与 React 19 规范 |
| 门禁 3: 单元测试 | `npm test` | **PASS (29 suites / 248 tests)** | 29 套测试套件 248 项用例 100% 通过（变异探针证伪有效） |
| 门禁 4: 生产构建 | `npm run build` | **PASS (11 static pages)** | Next.js 16.2.9 预渲染与打包完全成功 |
