# 不公开房间创建与加入交互解耦及文案歧义消除交接单

交付日期：2026-09-16
对应提交主题：`fix(lobby): disambiguate unlisted room creation and join flow`

---

## 1. 交付目标与背景

### 1.1 问题现象与根因
- **用户反馈**：在在线大厅点击“与好友游玩”（Play with friends）时，用户误以为可以在输入框中输入自定义房间号或字段，再点击“创建不公开列出房间”以创建指定房间号的房间；但点击后输入框内容被忽略，系统仍随机生成 6 位字母数字房间号。
- **架构与事实核验**：
  - 本项目所有房间（公开与不公开）统一由服务端 `RoomStateMachine.createRoom()` 权威分配随机 6 位房间码（`createRoomCode()`，使用 `crypto.randomInt` 采样 `A-Z2-9` 字符集）。
  - 服务端 `CreateRoomInput` 与 Socket 事件 `room:create` 从未设计、也从未接收过自定义房间码字段；房间号是单进程状态机的唯一规范主键。
- **视觉与心智模型歧义根因**：
  - `LobbyMatchmaking.tsx` 的 `.lobby-friend-actions` 将【创建不公开列出房间】按钮与【房间链接、房间码或 @标识】输入框放置在同一 Grid 容器内，形成并排混排；
  - 展开标题副文案 `createOrJoin` 仅描述“创建不公开列出房间，或输入链接、房间码、@标识。”，未明确说明创建动作会自动分配随机码，使输入框极易被误解为创建房间的可选输入参数。

### 1.2 修复策略（经用户明确裁决）
- 采纳**优化 UI 布局与多语言文案解耦**方案：
  - 将创建不公开房间（自动生成随机房间码）与加入已有房间（输入目标房间码/链接）在视觉、DOM 结构与文案层面彻底分块隔离；
  - 保持服务端状态机、Socket 协议与自动化烟测选择器完全兼容。

---

## 2. 关键变更与落地内容

### 2.1 多语言文案契约同步扩充 (`src/i18n/dictionaries.ts`)
在 6 种官方语言（`en`, `zh`, `fr`, `es`, `ru`, `ar`）中保持字母序同步新增与精细化调整：
1. **`createOrJoin`（副标题）**：
   - `zh`: `"创建自动生成随机房间码的不公开房间，或输入链接、房间码、@标识加入。"`
   - `en`: `"Create an unlisted room with a random code, or enter a link, code, or @handle."`
   - `fr`: `"Créez un salon avec un code aléatoire ou entrez un lien, un code ou un @identifiant."`
   - `es`: `"Crea una sala con código aleatorio o introduce un enlace, código o @identificador."`
   - `ru`: `"Создайте комнату со случайным кодом или введите ссылку, код либо @идентификатор."`
   - `ar`: `"أنشئ غرفة برمز عشوائي، أو أدخل رابطًا أو رمزًا أو @معرّفًا للانضمام."`
2. **`createUnlistedRoomHint`（创建提示）**：
   - 明确告知用户：系统将自动分配专属随机房间码与分享链接，不公开列入大厅。
3. **`joinExistingRoom` 与 `orJoinExisting`（区段分隔文案）**：
   - 提供独立的分隔与加入指示文案，切断输入框与创建按钮的归属联想。
4. **单测严格守门**：`src/i18n/dictionaries.test.ts` 3 项测试全部通过（6 语种同构、占位符一致、零空文案）。

### 2.2 表现层面板分块卡片重构 (`src/components/online/lobby/LobbyMatchmaking.tsx`)
- 将原本单行混排的 `.lobby-friend-actions` 拆分为两大语义清晰的独立卡片：
  - **创建卡片 (`.lobby-friend-create-card`)**：包含 `[Wifi] 创建不公开列出房间` 按钮（保留 `data-lobby-action="create-unlisted"`）与 `.lobby-friend-hint` 说明文本；
  - **视觉分隔带 (`.lobby-friend-divider`)**：带横线的“或者”语义标识（`aria-hidden="true"`）；
  - **加入卡片 (`.lobby-friend-join-card`)**：容纳独立的加入表单（`form.lobby-join-form`），包含 `joinTarget` 输入框与 `[LogIn] 加入房间` 提交按钮。
- **完全兼容测试基线**：保留全部 `data-lobby-section="friends"`、`data-lobby-action="create-unlisted"` 及 input 查找语义。

### 2.3 样式系统与 RTL 支持 (`src/app/globals.css`)
- `.lobby-friend-actions` 改为 `display: flex; flex-direction: column; gap: 12px;` 纵向流；
- 增加卡片容器、微文本提示与带线分隔带样式，全部使用 CSS 语义变量（`--muted`, `--line` 等）；
- 无任何物理 `left`/`right` 属性，100% 兼容阿拉伯语 RTL 镜像布局；
- 移动端自适应响应式无冲突。

---

## 3. 本地门禁验证数据（全绿通过）

| 门禁项 | 命令 | 检查结果 | 详细指标 |
| :--- | :--- | :--- | :--- |
| **门禁 1** | `npx tsc --noEmit` | ✅ 0 错误 | TypeScript 严格模式检查通过 |
| **门禁 2** | `npm run lint` | ✅ 0 错误 0 警告 | ESLint 代码规范全绿 |
| **门禁 3** | `npm test` | ✅ 100% 通过 | 28 个测试套件 / 245 项用例全绿（含 6 语种同构测试） |
| **门禁 4** | `npm run build` | ✅ 构建成功 | Next.js 16.2.9 生产构建成功，11 个页面静态预渲染正常 |

---

## 4. 遗留技术债与下一步建议

- 当前房间码生成仍为 6 字符随机大写短码。若未来产品明确需要支持“自定义房间号/靓号房间”（Custom Room Code），需在服务端扩展 `CreateRoomInput` 增加参数校验、保留词过滤、敏感词拦截及占用冲突处理机制。
