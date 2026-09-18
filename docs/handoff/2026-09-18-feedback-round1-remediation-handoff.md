# 用户反馈系统 (Feedback) 源码实现 · Round 1 审查缺陷闭环交付

> **交付日期**：2026-09-18  
> **关联复查报告**：[`docs/handoff/2026-09-18-feedback-workbuddy-code-review-round1-handoff.md`](2026-09-18-feedback-workbuddy-code-review-round1-handoff.md) (Commit: `42daaed`)  
> **基准 SHA**：`861ad25a0d6d46132410891843ff349ecdc47a33`  
> **交付状态**：5 项审查缺陷（1×P1, 1×P2, 3×P3）100% 闭环，本地四道门禁全绿，准备派发 Round 2 复审。

---

## 1. 缺陷修复对照与闭环证明

### 1.1 P1-1 限流守门判断对象真值导致 429 失效（P1）
- **根因**：`feedbackLimiter.consume(clientKey)` 返回的是 `RateLimitResult` 对象 `{ allowed, remaining, retryAfterMs }`。原代码以 `if (!feedbackLimiter.consume(clientKey))` 作条件判定，因对象在 JS 中恒为真值，`!` 取反恒为 `false`，导致 429 限流分支变为死代码。
- **修复措施**：
  - 提炼独立路由处理模块 `src/server/feedback-api.ts`。
  - 正确提取 `const rateLimit = limiter.consume(clientKey);` 并判断 `if (!rateLimit.allowed)`。
  - 触发限流时返回 HTTP 429 状态码及 JSON 错误消息，并严格携带标准响应头 `retry-after: String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)))`。
- **守门验证**：
  - 新增路由级单测用例（`src/server/feedback-api.test.ts`）：配置 `limit: 2`，连续发送 3 次合法请求，前 2 次返回 `201`，第 3 次严格断言返回 `429`，断言响应头 `retry-after` 大于 0，且检查 store 仅落盘 2 条记录，第 3 条未写入磁盘。

### 1.2 P2-1 请求体超 64 KiB 时 `request.destroy()` 掐断 Socket 导致 413 无法送达（P2）
- **根因**：原 `readJsonBody` 在读取字节超限时直接调用 `request.destroy(err)`，摧毁底层传输 socket，导致后续任何 `ServerResponse` 写入均因 socket 已销毁而引发客户端连接被重置（`UND_ERR_SOCKET` / `ECONNRESET`），无法收到预期的 HTTP 413 响应。
- **修复措施**：
  - 在 `src/server/feedback-api.ts` 中实现专用 `readFeedbackJsonBody`。
  - 检测到体长超限时，`request.pause()` 暂停接收并抛出显式 `PayloadTooLargeError`。
  - 顶层捕获到 `PayloadTooLargeError` 后：
    - 绑定 `response.once("finish", () => { request.destroy(); });` 确保响应完全送出后再释放资源；
    - 调用 `writeJson(response, 413, { error: "Payload too large" }, { connection: "close" });` 发送规范 413 响应；
    - 调用 `request.resume()` 排空后续报文，杜绝连接管道挂起。
- **守门验证**：
  - 在 `src/server/feedback-api.test.ts` 中实测发送 70 KiB 的 ASCII 字符串，断言客户端正常接收 HTTP 413（无 socket reset 异常），且响应体返回 `{ error: "Payload too large" }`。

### 1.3 P3-3 64 KiB 上限按 UTF-16 code unit 计数导致多字节字符放宽 3 倍（P3）
- **根因**：原代码直接累加字符串 `body.length`，在遇到 CJK 或 Emoji 等多字节字符时，统计的是 UTF-16 码元数量而非 UTF-8 实际物理字节数，导致 64 KiB 实际上限被放宽至最多约 256 KB。
- **修复措施**：
  - 在流式读取 `chunk` 时，使用 `Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk, "utf8")` 计算真实 UTF-8 物理字节。
  - 维护 `bytesRead` 累加器，当且仅当 `bytesRead > MAX_FEEDBACK_BODY_BYTES (64 * 1024)` 时触发 413 截断。
- **守门验证**：
  - 在 `src/server/feedback-api.test.ts` 中构造包含 22,000 个 CJK 汉字（约 66,000 字节，但仅 22,000 码元）的报文，实测准确触发 HTTP 413 `Payload too large`，证明物理字节守门准确无误。

### 1.4 P3-4 `locale` 未做白名单校准导致超长/注入值原样落盘（P3）
- **根因**：原代码仅做 `typeof body.locale === "string"` 类型判断，未比对六语种白名单，导致任意恶意字符串（如 3000 字符的 `<script>` 注入串）被无条件原样落盘。
- **修复措施**：
  - 引入 `src/i18n/config.ts` 中的权威类型守卫 `isLocale(rawLocale)`。
  - 在 API 路由层（`feedback-api.ts`）与持久化层（`feedback-store.ts`）实施双层过滤：`rawLocale && isLocale(rawLocale) ? rawLocale : "unknown"`。
  - 只有合法命中 `["en", "zh", "fr", "es", "ru", "ar"]` 的语种方可入库，其余所有未知、超长或非法语种一律归一化为 `"unknown"`。
- **守门验证**：
  - 在 `src/server/feedback-api.test.ts` 中传入 `3000 个 X + <script>`，实测落盘文件中 `locale` 字段严格保存为 `"unknown"`；传入合法 `"fr"` 时则准确保存为 `"fr"`。

### 1.5 P3-5 `/api/feedback` 路由层零测试与 smoke 断言缺失（P3）
- **根因**：原项目测试仅覆盖了 `FeedbackStore` 纯类，缺乏针对真实 HTTP 请求生命周期与状态码的路由层测试，导致限流接线等错误能在四道门禁中漏网。
- **修复措施**：
  - 新建 `src/server/feedback-api.test.ts`：挂载真实 Node.js HTTP 原生服务，编写 10 项全生命周期集成测试，涵盖：
    1. 201 正常保存与 ID 回传
    2. 405 Method Not Allowed (非 POST 请求及 Allow 响应头)
    3. 400 空内容校验拒绝
    4. 400 超过 5000 字符文本拒绝
    5. 400 邮箱格式非法拒绝
    6. 400 非法 JSON 报文拒绝
    7. 429 频控触发、Retry-After 响应头以及落盘拒绝
    8. 413 大于 64 KiB 的 ASCII 超长报文
    9. 413 大于 64 KiB 的 CJK 多字节超长报文
    10. `locale` 语种白名单过滤与安全归一化
  - 同步强化 `tools/smoke-feedback.ts`：增补 413（超 64 KiB）与 429（频控耗尽及 `retry-after` 响应头校验）两项端到端断言，支持重复运行时的频控幂等探测。

---

## 2. 既有接口零回归保证
- 保持原 `/api/account/register` 接口对通用 `readJsonBody(request)` 的调用不变（4096 字节安全截断逻辑未被修改）。
- 既有单元测试套件 `src/server/accounts.test.ts`（17 项单测）全部通过，全流程零回归。

---

## 3. 本地工程门禁验证

| 门禁项目 | 命令 | 执行结果 |
| :--- | :--- | :--- |
| **TypeScript 严格类型检查** | `npx tsc --noEmit` | **0 错误** |
| **ESLint 规范扫描** | `npm run lint` | **0 错误，0 警告** |
| **Vitest 单元与路由测试** | `npm test` | **35 套 / 324 项全绿** (新增 1 套 10 项) |
| **Next.js 生产构建** | `npm run build` | **18/18 静态预渲染全部通过** (SSG 0 警告) |
