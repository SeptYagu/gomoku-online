# Feedback 页面与反馈存储需求计划（精简扁平存储版）

- **更新日期**：2026-09-18
- **方案状态**：需求与技术设计方案已收敛定稿（按审查结论与用户最新决策精简更新，准备实施）
- **核心调整**：
  1. **存储扁平化**：全部反馈报告存放在 `data/feedback/` 单一目录下，单份文件直接以“时间戳 + Feedback ID”命名，彻底取消原多层年月子目录；
  2. **首版纯文本**：取消图片/截图上传支持，接口从 `multipart/form-data` 切换为标准的 `application/json`（上限 64 KiB），零外部重型依赖；
  3. **安全与隐私先行**：`.gitignore` 严格忽略 `data/feedback/`，防范用户隐私进入版本库。

---

## 1. 目标与用户价值

新增一个面向所有访客的 Feedback 页面，让用户可以随时提交问题、体验缺陷或功能建议，并在完全自愿的前提下提供联系邮箱。

整个链路保持极简、纯粹与高可靠：
1. **用户端**：在 `/{locale}/feedback` 直接填写反馈文本（必填），可选填写联系邮箱（选填），点击提交，无需注册登录；
2. **服务端**：校验合法性与频次后，将每一份反馈报告直接以独立 JSON 文件的形式原子保存到服务器本地单一的 `data/feedback/` 目录下；
3. **运维端**：维护者登录服务器即可在 `data/feedback/` 目录下通过文件名时间正序直观查阅所有历史反馈。

---

## 2. 用户故事

- 作为普通玩家，我遇到对局卡顿或规则疑惑时，可以随时进入反馈页面填写内容，无需注册即可匿名提交；
- 作为希望得到答复的玩家，我可以在表单中自愿留下联系邮箱；
- 作为普通用户，我如果不想留下任何联系方式，可以完全留空，提交不设任何阻碍；
- 作为维护者，我可以在服务器的 `data/feedback/` 目录下看到所有排好序的反馈文件，文件名即包含提交时间与编号，单文件即完整报告。

---

## 3. 详细设计与关键决策

### 3.1 页面与表单交互 (`/{locale}/feedback`)

- **路由设计**：
  - 动态多语言路由：`/{locale}/feedback`；
  - 根路径重定向：`/feedback` 继承既有的 `gomoku-locale` cookie 或回退默认语言；
  - 静态预渲染：支持 `generateStaticParams()` 覆盖 `["en", "zh", "fr", "es", "ru", "ar"]` 6 种官方语言，生产构建 SSG 0 Bailout；
  - 布局与外观：严格继承深浅色主题（27 项 CSS 变量对齐，零翻白闪烁），完整支持阿拉伯语（`ar`）的 RTL 镜像排版。
- **表单字段与规则**：
  - `message`（必填）：用户反馈正文，trim 后 1～5,000 个字符，前端提供实时字符计数；
  - `email`（可选）：联系邮箱，最多 254 字符；若填写则做基础邮箱格式校验（包含 `@`），若不填则存储为 `null`；
  - **首版无图片上传**：不设截图选择框与图片处理流程，彻底规避原生图像库（sharp/jimp）的重依赖与跨平台安装问题，规避 EXIF/GPS 泄露风险。
- **提交与回执反馈**：
  - 提交中展示 Loading 状态并锁定按钮，防止网络抖动导致的连点重复提交；
  - 提交成功后在当前页面展示感谢卡片，并明确回传生成的 `feedbackId`，同时提供“复制编号”与“返回棋盘主页”动作；
  - 提交失败时保留用户已输入的文本与邮箱，弹出友好错误提示并允许重试。
- **全局入口**：
  - 在棋盘控制栏与桌面/移动端底部导航区提供可见的“Feedback / 反馈”入口链接。

### 3.2 服务器本地存储契约 (`data/feedback/`)

按照用户最新指令，**彻底取消原有的多层年月嵌套子目录**（`submissions/YYYY/MM/<id>/`），所有报告统一扁平存放于一个文件夹内：

```text
data/feedback/
  ├── 20260918-070500-fb_k9x2m4p1.json
  ├── 20260918-081230-fb_m3y7p9q2.json
  └── 20260918-093015-fb_w1x8r5t7.json
```

1. **存储根目录**：
   - 默认路径：`data/feedback/`；
   - 环境变量覆盖：支持 `process.env.GOMOKU_FEEDBACK_DIR`，便于测试与定制部署。
2. **单文件命名规范**：
   - 格式：`${YYYYMMDD-HHmmss}-${feedbackId}.json`；
   - 示例：`20260918-070500-fb_k9x2m4p1.json`；
   - 特性：时间戳采用 UTC 时区 14 位紧凑格式（年月日-时分秒），字母字典序天然严格等价于时间正序，终端 `ls data/feedback` 或按名称排序即可按时间顺序列出。
3. **单文件结构化内容 (JSON Schema)**：
   每份文件自包含完整的反馈上下文：
   ```json
   {
     "feedbackId": "fb_k9x2m4p1",
     "receivedAt": "2026-09-18T07:05:00.000Z",
     "timestamp": 1726643100000,
     "message": "在人机 Expert 难度下第 35 手悔棋时出现棋子重绘延迟...",
     "email": "player@example.com",
     "locale": "zh",
     "appVersion": "861ad25",
     "clientAddress": "127.0.0.1"
   }
   ```
4. **原子写入与并发安全**：
   - 服务端先将内容写入同目录的临时隐藏文件（如 `.tmp-20260918-070500-fb_k9x2m4p1.json`）；
   - 数据完全 flush 落盘并通过体积校验后，调用 `fs.renameSync` 原子重命名为目标文件名；
   - 即使进程在写入瞬间意外中断或重启，也绝不会在生产目录留下半截损坏的 JSON 文件。
5. **版本控制隔离（安全红线）**：
   - `.gitignore` 必须显式追加 `data/feedback/`；
   - 确保任何开发测试或生产运行产生的真实用户反馈报告绝不进入 Git 提交。

---

## 4. HTTP API 契约

### `POST /api/feedback`

- **请求头**：`Content-Type: application/json`
- **请求体（JSON）**：
  ```json
  {
    "message": "反馈正文...",
    "email": "optional@example.com",
    "locale": "zh"
  }
  ```
- **请求体安全上限**：64 KiB（严格防范超大 JSON 报文攻击，超限立即返回 `413 Payload Too Large` 并断开连接）。
- **服务端处理时序**：
  1. 客户端地址与频率校验：通过现有的 `resolveClientAddress` 提取客户端真实 IP，经由 `FixedWindowRateLimiter` 检查（限制例如每 10 分钟最多 5 次提交），超限返回 `429 Too Many Requests`；
  2. 字段校验：
     - `message` 必填，trim 后长度须在 `1 <= length <= 5000` 范围内，否则返回 `400`；
     - `email` 选填，若存在则校验格式与 `length <= 254`，否则返回 `400`；
     - `locale` 选填，自动校准为已知 6 语种之一；
  3. 元数据组装：生成随机唯一 `feedbackId`（如 `fb_${randomBytes(6).toString("base64url")}`），注入当前服务器权威时间与 `appVersion`；
  4. 存储落地：调用 `FeedbackStore.saveFeedback()` 执行原子落盘；
  5. 响应客户端：返回 HTTP 201。
- **响应体**：
  - 成功：
    ```json
    {
      "ok": true,
      "feedbackId": "fb_k9x2m4p1",
      "receivedAt": "2026-09-18T07:05:00.000Z"
    }
    ```
  - 校验失败：`400 { "error": "Feedback message cannot be empty." }`
  - 频次超限：`429 { "error": "Too many feedback submissions. Please try again later." }`
  - 内部异常：`500 { "error": "Failed to save feedback." }`（不泄露内部磁盘路径或代码堆栈）

---

## 5. 国际化多语言与无障碍 (i18n & A11y)

在 `src/i18n/dictionaries.ts` 中新增独立的 `feedback` 字典空间，并在 `en`、`zh`、`fr`、`es`、`ru`、`ar` 6 种官方语言中 100% 补齐：

```typescript
export type FeedbackDictionary = {
  title: string;              // "用户反馈与建议" / "User Feedback" / ...
  subtitle: string;           // "告诉我们您遇到的问题或改进建议，无需注册即可提交"
  messageLabel: string;       // "问题描述或建议（必填）"
  messagePlaceholder: string; // "请详细描述您遇到的问题或建议..."
  emailLabel: string;         // "联系邮箱（可选）"
  emailPlaceholder: string;   // "选填，方便我们与您进一步沟通"
  charCount: string;          // "{current} / {max}"
  submitAction: string;       // "提交反馈"
  submitting: string;         // "正在提交..."
  successTitle: string;       // "反馈已送达"
  successDesc: string;        // "非常感谢您的反馈与支持！您的反馈编号为：{feedbackId}"
  copyFeedbackId: string;     // "复制编号"
  copiedFeedbackId: string;   // "已复制"
  backToGame: string;         // "返回对局"
  errorEmpty: string;         // "请输入反馈内容"
  errorTooLong: string;       // "反馈内容过长"
  errorGeneric: string;       // "提交失败，请稍后重试"
  rateLimited: string;        // "提交过于频繁，请稍后再试"
};
```

- **A11y 无障碍保障**：
  - 错误与成功消息挂载 `aria-live="polite"`，便于读屏软件即时提示；
  - 输入框与文本域严格绑定 `aria-describedby` 与 `aria-label`；
  - 提交状态下设置 `aria-busy="true"` 并锁定按钮焦点。

---

## 6. 实施步骤

1. **第 1 步：基础设施与安全隔离 (F0)**
   - 在 `.gitignore` 中追加 `data/feedback/`；
   - 新建 `src/server/feedback-store.ts`，实现扁平化落盘逻辑、时间戳与 ID 命名算法、临时文件原子更名与目录自动创建；
   - 新建 `src/server/feedback-store.test.ts`，针对命名规则、原子落盘、超长与空值异常进行完整单测覆盖。
2. **第 2 步：服务端 API 与限流 (F1)**
   - 在 `src/server/online-server.ts` 中注册 `POST /api/feedback`；
   - 接入 64 KiB 流式请求体上限与 JSON 解析；
   - 挂载 `feedbackRateLimiter` 实施 IP 防刷；
   - 编写 API 集成测试，验证 201 成功返回、400 边界拦截与 429 限流保护。
3. **第 3 步：多语言字典与前端页面 (F2)**
   - 在 `src/i18n/dictionaries.ts` 补齐 6 语种 `feedback` 字典包，通过 `dictionaries.test.ts` 结构一致性校验；
   - 新建 `src/app/[locale]/feedback/page.tsx` 与 `src/components/feedback/FeedbackPage.tsx`；
   - 在 `src/app/globals.css` 补充响应式与 RTL 兼容样式；
   - 在控制栏与桌面/移动端底栏挂载进入反馈页面的导航入口。
4. **第 4 步：工程门禁与端到端验证 (F3)**
   - 运行四道本地门禁（TS 类型检查、ESLint 全绿、Vitest 单元测试全绿、Next.js 生产构建 17 页面全通过）；
   - 在本地启动服务提交真实反馈，验证 `data/feedback/` 生成符合预期的扁平 JSON 文件。

---

## 7. 验收标准

1. **存储与命名**：
   - 提交反馈后，`data/feedback/` 目录下新增文件严格符合 `${YYYYMMDD-HHmmss}-${feedbackId}.json`；
   - 绝不生成任何二级或子文件夹；
   - 文件内容为合法 JSON，包含必填的 `feedbackId`、`receivedAt`、`message` 以及正确的 `email`（有则记录，无则为 null）；
   - `git status` 确认 `data/feedback/` 零未跟踪改动（受 `.gitignore` 保护）。
2. **接口健壮性**：
   - 超过 64 KiB 的非法大报文被拒绝；
   - 空文本或纯空格返回 400；
   - 短时间内连点触发 429 频次限制。
3. **页面与无障碍**：
   - 6 种官方语言均能正常打开 `/{locale}/feedback`，页面无布局错乱，阿拉伯语 RTL 排版镜像正常；
   - 提交成功后展示包含 `feedbackId` 的感谢卡片，支持返回首页；
   - 生产构建 `npm run build` 预渲染通过，不出现 SSG Bailout。
4. **工程门禁**：
   - 四道硬性门禁（`tsc`、`lint`、`test`、`build`）全部 100% 通过。
