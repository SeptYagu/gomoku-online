# 用户反馈系统 (Feedback) 源码实现 · Round 2 审查缺陷闭环交付

> **交付日期**：2026-09-18  
> **关联复查报告**：[`docs/handoff/2026-09-18-feedback-workbuddy-code-review-round2-handoff.md`](2026-09-18-feedback-workbuddy-code-review-round2-handoff.md) (Commit: `8b3e165`)  
> **基准 SHA**：`861ad25a0d6d46132410891843ff349ecdc47a33`  
> **交付状态**：3 项审查缺陷（2×P2, 1×P3）100% 闭环，本地四道门禁全绿，准备派发 Round 3 复审。

---

## 1. 缺陷修复对照与闭环证明

### 1.1 P2-1 修复 ≥128 KiB 及 10 MiB 超限报文 TCP RST 导致 413 不可观测缺陷（P2）
- **根因**：原实现在体长超出 64 KiB 时，立即在 `data` 事件中执行 `request.pause()` 并 reject，导致 413 响应先于客户端上行完成发出。随后 `response.once("finish", () => request.destroy())` 在响应刚刷出时立即销毁 socket，而此时接收队列中仍有客户端在途数据，内核向对端发送 TCP RST，导致客户端未读完的响应字节被丢弃，表现为 0 字节与 `ECONNRESET`。
- **修复措施**：
  - 重构 `readFeedbackJsonBody`（`src/server/feedback-api.ts`）：当 `bytesRead > maxBytes` 时，置位 `isExceeded = true` 并停止累加 `body` 字符串（严格保护内存上限在 64 KiB 以内），但不中断流，继续自然排空至 `end`（同时设有 15 MiB 硬上限防护 `MAX_FEEDBACK_DRAIN_BYTES` 防范慢速攻击）。
  - 在 `request.on("end")` 事件触发时，才 reject 抛出 `PayloadTooLargeError`。
  - 移除原 `response.once("finish", () => request.destroy())`，由 Node HTTP 服务端在完成 413 写出后依据 `Connection: close` 正常关闭连接。此时客户端已完成整个报文发送，接收缓冲区清空，TCP 以正常的 FIN 挥手结束，彻底消除 RST 截断。
- **守门验证**：
  - 在 `src/server/feedback-api.test.ts` 中新增多重集成断言：
    - `65536 字节进入字段校验 (400)` vs `65537 字节精准返回 413`（边界精确性）；
    - `1 MiB 报文` 返回 413 且解析有效 JSON；
    - `10 MiB 报文` 返回 413 且无任何连接重置；
    - 原始 `node:net` socket 持续上行 1 MiB（以 256 KiB/片分片持续推送），客户端完整读取 `HTTP/1.1 413 Payload Too Large`。

### 1.2 P2-2 修复 chunk 边界切裂多字节 UTF-8 字符导致落盘内容静默损坏（`U+FFFD`）缺陷（P2）
- **根因**：Round 1 重构中移除了 `request.setEncoding("utf8")`，改在 `request.on("data")` 中对接收到的原始 Buffer 逐片调用 `.toString()`。当网络切片边界刚好落在 3 字节 CJK 字符、4 字节 Emoji 或 2 字节重音字符中间时，前后两个切片各自将半截字符独立解码为 `\uFFFD`（Unicode 替换字符），且因该字符为合法 JSON 文本，系统静默落盘损坏数据而无任何报错。
- **修复措施**：
  - 在 `readFeedbackJsonBody` 初始化时恢复调用 `request.setEncoding("utf8")`，交由 Node.js 内置的 `StringDecoder` 跨 chunk 缓冲并重组不完整多字节序列；
  - 维持物理字节计数：在 `data` 回调中使用 `Buffer.byteLength(chunk, "utf8")` 对重组后的 UTF-8 字符串进行精确字节累加，兼顾字符完整性与 64 KiB 物理字节守门。
- **守门验证**：
  - 新增针对性守门测试：使用 `node:net` socket，构造 100 个 CJK 汉字 `测`（UTF-8 编码为 `0xE6 0xB5 0x8B`），故意在第 11 个字符的首字节 `0xE6` 处切片并发送第一片，延迟 50ms 后发送包含剩余两字节 `0xB5 0x8B` 及后续正文的第二片。
  - 实测落盘文件：正文长度恰好为 100，与源字符串 100% 逐字符相等，`\uFFFD` 计数严格为 0。

### 1.3 P3-1 补齐 MiB 级报文与真实 Socket 持续上行守门覆盖（P3）
- **根因**：原有单测与 smoke 脚本仅使用 66~70 KiB 报文测试超限，无法覆盖 128 KiB~10 MiB 真实上行竞态区间。
- **修复措施**：
  - `src/server/feedback-api.test.ts` 扩充 5 项新测试，用例数从 10 项增加至 15 项，全面覆盖 64 KiB 精确边界、1 MiB、10 MiB 以及分片 socket 持续流式传输；
  - `tools/smoke-feedback.ts` 将超限测试体量提升至 1 MiB (`1024 * 1024 + 100`)。

---

## 2. 既有模块零回归保证

- 保持 `/api/account/register` 的旧有通用 `readJsonBody(request)`（4096 字节 + `request.destroy`）完全未动；
- 运行 `src/server/accounts.test.ts`（17 项单测）全部通过，契约 100% 零回归。

---

## 3. 本地工程门禁验证

| 门禁项目 | 命令 | 执行结果 |
| :--- | :--- | :--- |
| **TypeScript 严格类型检查** | `npx tsc --noEmit` | **0 错误** |
| **ESLint 规范扫描** | `npm run lint` | **0 错误，0 警告** |
| **Vitest 单元与路由测试** | `npm test` | **35 套 / 329 项全绿** (新增 5 项针对性守门) |
| **Next.js 生产构建** | `npm run build` | **18/18 静态预渲染全部通过** (SSG 0 警告) |
