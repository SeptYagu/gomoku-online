# 不公开房间创建/加入交互解耦（Round 1 独立审查缺陷闭环）交接单

交付日期：2026-09-16
对应提交主题：`fix(lobby): resolve round 1 review findings for unlisted room creation disambiguation`

---

## 1. 交付背景与审查缺陷闭环

在对 `bb3be08` 的 Round 1 独立审查（详见 [`docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md`](docs/handoff/2026-09-16-workbuddy-code-review-unlisted-room-round1-handoff.md)）中，WorkBuddy 指出 4 项 P3 缺陷及 1 项字距残余观察。本提交已全部完成闭环修复与自动化守门强化：

### P3-1: `joinExistingRoom` 6 语种文案死键消除
- **根因**：原版本将加入卡片与分隔带混同，导致为加入卡片准备的 `labels.joinExistingRoom` 键未被消费。
- **修复**：在 `LobbyMatchmaking.tsx` 的 `.lobby-friend-join-card` 中增设可见小标题 `<h3 className="lobby-friend-subtitle">{labels.joinExistingRoom}</h3>`，6 语种文案全面接入渲染，消灭死键。

### P3-2: 读屏用户无障碍语义与属性关联补齐
- **根因**：
  1. 创建按钮缺乏与 `.lobby-friend-hint` 说明文案的程序化关联，聚焦时无法听到自动分配随机码的说明。
  2. 分隔带文字整块被 `aria-hidden="true"` 移出无障碍树。
  3. 加入卡片表单缺乏无障碍可达的标签。
- **修复**：
  1. 使用 `useId()` 为提示文案生成唯一 ID，创建按钮绑定 `aria-describedby={createUnlistedHintId}`，无障碍树中创建按钮计算出完整描述。
  2. 移除 `.lobby-friend-divider` 上的 `aria-hidden="true"`，保留文字在无障碍树中的可达性（纯装饰线仍由 `::before`/`::after` 伪元素呈现）。
  3. 加入卡片小标题挂载 `id={joinExistingHeadingId}`，加入表单绑定 `aria-labelledby={joinExistingHeadingId}`。

### P3-3: UI 结构分离与无障碍绑定的自动化回归守门
- **根因**：原版本缺少组件级结构断言与展开态烟测断言，组件结构回退到基准时无自动化测试报警。
- **修复**：
  1. **单元测试守门**：新增 `src/components/online/lobby/LobbyMatchmaking.test.ts`，利用 `react-dom/server` 在 Node 环境渲染组件，针对卡片分离、死键消除、`aria-describedby` 关联、`aria-labelledby` 绑定、DOM 几何顺序（`createBtn < divider < joinInput`）及 6 语种渲染进行硬性断言；任何结构性回退都将直接阻断门禁 3。
  2. **端到端烟测守门**：在 `tools/smoke-lobby-ui.ts` 中新增 `assertFriendsSectionStructure` 断言函数，并在桌面大厅展开 `friends` 面板及 390px RTL 移动端大厅分别执行校验，确保展开态下文本非空、DOM 顺序合规、且无横向溢出。

### P3-4: `createUnlistedRoomHint` 文案口径与免责声明对齐
- **根因**：原 en/fr/es/ru/zh/ar 文案包含 "private / 专属 / приватную / privé / privado / خاصًا" 用词，与同面板的 `unlistedRoomNotice`（“这不是访问保护”）产生安全心智冲突。
- **修复**：全部 6 语种统一去除访问保护暗示词，中性描述为“分配随机房间码与邀请/分享链接”：
  - `en`: `"Allocates a random room code and a share link."`
  - `zh`: `"系统将自动分配随机房间码与邀请链接。"`
  - `fr`: `"Attribue un code aléatoire et un lien d'invitation."`
  - `es`: `"Asigna un código aleatorio y un enlace de invitación."`
  - `ru`: `"Генерирует случайный код и ссылку-приглашение."`
  - `ar`: `"يخصص رمز غرفة عشوائيًا ورابط دعوة."`

### 残余观察闭环: 分隔带字距规范性
- 移除 `src/app/globals.css` 中 `.lobby-friend-divider` 的 `letter-spacing: 0.04em;`，遵循全局字距惯例，杜绝特定字体环境下的连写排版风险。

---

## 2. 变更文件清单

| 文件 | 变更性质 | 说明 |
|---|---|---|
| `src/i18n/dictionaries.ts` | 修改 | 6 语种 `createUnlistedRoomHint` 去私有化中性表述 |
| `src/components/online/lobby/LobbyMatchmaking.tsx` | 修改 | 接入 `joinExistingRoom` 标题，补齐 `aria-describedby` 与 `aria-labelledby`，移除 divider 的 `aria-hidden` |
| `src/components/online/lobby/LobbyMatchmaking.test.ts` | 新增 | 3 项单元测试，守门卡片结构、无障碍绑定与 DOM 顺序 |
| `src/app/globals.css` | 修改 | 增加 `.lobby-friend-join-header` 与 `.lobby-friend-subtitle` 样式，移除字距属性 |
| `tools/smoke-lobby-ui.ts` | 修改 | 新增 `assertFriendsSectionStructure`，并在桌面及 390px RTL 展开态断言 |
| `STATUS.md` | 修改 | 更新最新阶段交付提交与里程碑记录 |
| `docs/handoff/INDEX.md` | 修改 | 追加本次缺陷修复交接单索引 |

---

## 3. 本地门禁验证数据（全绿通过）

| 门禁项 | 命令 | 检查结果 | 详细指标 |
|---|---|---|---|
| 门禁 1: 类型检查 | `npx tsc --noEmit` | **PASS (0 errors)** | 严格类型推导，无逆变与缺少属性 |
| 门禁 2: 规范扫描 | `npm run lint` | **PASS (0 errors, 0 warnings)** | 遵循 ESLint 与 React 19 规范 |
| 门禁 3: 单元测试 | `npm test` | **PASS (29 suites / 248 tests)** | 29 套测试套件 248 项用例 100% 通过（新增 LobbyMatchmaking 3 项测试全绿） |
| 门禁 4: 生产构建 | `npm run build` | **PASS (11 static pages)** | Next.js 16.2.9 预渲染与打包完全成功 |
