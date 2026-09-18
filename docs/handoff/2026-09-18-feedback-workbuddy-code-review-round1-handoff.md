# 用户反馈系统 (Feedback) 扁平化存储与纯文本 JSON 协议 · 独立代码审查 Round 1 报告

> **审查日期**：2026-09-18
> **审查轮次**：Round 1（源码实现首轮复查）
> **被审 HEAD**：`8657f299c4523f1326b1bc112f2bd2f3eaadf952`
> **基准提交**：`861ad25a0d6d46132410891843ff349ecdc47a33`
> **审查范围**：`git diff 861ad25a..8657f299`（18 文件，+1451/−240）
> **判定结论**：**未通过**（0×P0，**1×P1**，**1×P2**，**3×P3**，需修复闭环）

---

## 一、审查基本信息与通过项简述

- 版本核对：`git pull --ff-only` 后 HEAD = `8657f299c4523f1326b1bc112f2bd2f3eaadf952`（与指定被审 SHA 一致），基准 `861ad25a`，工作区干净；本轮未修改任何产品代码/正式测试，临时探针文件已全部删除，`git status --porcelain` 为空。
- 四道门禁独立复跑**全绿**：`npx tsc --noEmit` 0 错误、`npm run lint` 0 错误 0 警告、`npm test` **34 套 / 314 例全绿**、`npm run build` **18/18 静态页通过**（`/[locale]/feedback` = `● (SSG)` ×6 语种）。首次 `build` 报 `EPERM ... .next/server/app/(root)/feedback`，清理残留 `.next` 后即全绿，判定为已知的陈旧构建产物假红，非本轮缺陷。
- 存储契约与页面交付**主体正确**：40 并发提交实测 40 个命名合规文件、0 个 `.tmp-` 残留、0 个不可解析 JSON；`/en|zh|fr|es|ru|ar/feedback` 全部 200 且 `dir`/`lang` 正确（`ar` = `rtl`）、`/feedback` 307 继承 cookie、`/xx/feedback` 404；201/400（空/超长/邮箱非法/空体/数组体）/405（`Allow: POST`）均符合契约且错误消息不泄露磁盘路径。
- 独立验证：自建 **3 组端到端探针**（真实生产构建 + 真实 HTTP + 真实落盘，共 20+ 项负向/边界/并发场景）。其中**限流、64 KiB 超限、`locale` 校准**三项被成功证伪（见 §二），其余场景符合预期。

---

## 二、审查发现与缺陷清单

### P1-1 限流守门 `if (!feedbackLimiter.consume(...))` 恒为 false，429 分支为**死代码**，10 分钟 5 次 IP 限流完全失效

**严重级别**：P1（核心功能错误，无规避方案：限流是本任务明文验收项，且失效后单一 IP 可无限量落盘）

**文件与行号**
- `src/server/online-server.ts:251` — `if (!feedbackLimiter.consume(clientKey)) {`（缺陷点）
- `src/server/online-server.ts:22-25` — `feedbackLimiter` 定义
- `src/server/rate-limit.ts:42-59` — `consume(key): RateLimitResult` 返回**对象** `{ allowed, remaining, retryAfterMs }`
- `src/server/online-server.ts:87-97` — 同类限流器的**正确**用法参照（`accountRegistrationLimiter.consume(...)` 后判 `.allowed`）

**触发条件**：同一客户端 IP 在 10 分钟窗口内提交第 6 次及以后的 `POST /api/feedback`。

**实际行为**：`consume()` 返回的对象是**恒定真值**，`!object === false`，`429` 分支永不可达。实测同一 IP 连续 8 次合法提交**全部返回 `201`**，`429` 计数 **0**（期望 req#6/#7/#8 返回 429），并**实际落盘 8 个 JSON 文件**；20 次调用的守门复现探针中 `allowed=false` 自第 6 次起恒为 false，而守门判定 20 次**全部为 false（0 次 429）**。

**期望行为**：第 6 次起返回 `429 {"error":"Too many feedback submissions. Please try again later."}`（方案 `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:109`），后续请求不落盘。

**根因**：把返回 `RateLimitResult` 结构的 `consume()` 当作 `boolean` 使用（未读取 `.allowed`）。`tsc --noEmit` 与 `npm run lint` 无法拦截——对象真值化是合法 TS，`eslint.config.mjs` 仅继承 `eslint-config-next` 默认规则集，未启用 `@typescript-eslint/no-unnecessary-condition`；且全仓**不存在任何 `/api/feedback` 路由层测试**，该失效在门禁中完全不可见。

**影响范围**：`POST /api/feedback` 的防刷与防磁盘灌满能力完全丧失。单一 IP 可持续无限量写入 `data/feedback/`（每文件约数百字节），既是任务验收项的直接失败，也是一条可被利用的磁盘耗尽路径。注意：本缺陷不影响 `feedbackLimiter` 类本身（`src/server/rate-limit.test.ts:9-12` 对类行为的断言是正确的），纯属**接线错误**。

**复现方法/运行证据**
```bash
# 证据 1：类级守门复现（npx tsx，20 次 consume）
req#1..5  allowed=true  | handler treats as 429? false
req#6..20 allowed=false | handler treats as 429? false
Total 429 emitted by the handler's guard across 20 requests: 0   (should be 15)

# 证据 2：真实生产服务端到端（PORT=3311 npx tsx src/server/online-server.ts，真实 HTTP）
req#1..req#8 -> 全部 HTTP 201 {"ok":true,"feedbackId":"fb_..."}
-> 429 count = 0 (expected 3 ; req#6,#7,#8)
-> files persisted after 8 requests = 8
```

**修复建议**：改为读取结果对象，并与 `accountRegistrationLimiter` 的既有写法保持一致（含 `retry-after` 头）：
```ts
const rateLimit = feedbackLimiter.consume(clientKey);
if (!rateLimit.allowed) {
  writeJson(response, 429, { error: "Too many feedback submissions. Please try again later." },
    { "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) });
  return;
}
```

**修复后验收标准**：同一 IP 第 6 次提交返回 `429` 且 `retry-after > 0`，`data/feedback/` 仅新增 5 个文件；窗口过期后（`retryAfterMs` 归零）恢复 `201`。**必须新增一条路由/集成级守门用例并实测变红**（见 P3-5），仅靠类级单测无法覆盖此接线错误。

---

### P2-1 请求体超 64 KiB 时直接 `request.destroy()` 摧毁连接，客户端**收不到任何 HTTP 状态**，规格要求的 `413 Payload Too Large` 永不返回

**严重级别**：P2（特定场景契约错误；客户端行为降级为不可区分的网络错误，且超限响应完全不可观测）

**文件与行号**
- `src/server/online-server.ts:338-340` — `if (body.length > maxBytes) { request.destroy(new Error("Request body too large")); }`
- `src/server/online-server.ts:256` — `readJsonBody<FeedbackRequestBody>(request, 64 * 1024)`（64 KiB 上限传入点）
- `src/server/online-server.ts:230-232` — `void processFeedbackApiRequest(...).catch(() => writeJson(response, 500, ...))`（该 500 落点**不可达**）

**触发条件**：`Content-Type: application/json`，请求体字符串长度 > 65536（如 `{"message":"<70 KiB 内容>"}`）。

**实际行为**：`request.destroy(err)` 摧毁底层 socket，随后 `readJsonBody` 的 `request.on("error", reject)` 触发 `reject`，经 `.catch` 试图 `writeJson(response, 500, ...)`——但此时 socket 已销毁，响应**无法送达**。客户端侧观测结果：
- 体长 65536 → `HTTP 400`（说明守门为严格大于，边界自洽）；
- 体长 65537 → **`UND_ERR_SOCKET`（连接被重置，无任何状态码）**；
- 约 70 KiB → **`UND_ERR_SOCKET`**；
- 约 10 MiB → **`ECONNRESET`**。

即超限请求的 HTTP 契约是「连接被掐断」，而非任何 4xx/5xx 状态。服务进程未崩溃（后续 `GET /api/rooms` → `200`），但 `.catch` 中的 500 分支与方案 `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:128` 定义的「内部异常：500」在本路径上均为死代码。

**期望行为**：方案 `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:107` 明文规定「超限立即返回 `413 Payload Too Large` 并断开连接」，`docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:196` 的验收项为「超过 64 KiB 的非法大报文**被拒绝**」。应返回可观测的 `413` 状态码后再关闭连接。

**根因**：`readJsonBody` 是**从既有账户接口复用**的通用读取函数（本次仅新增 `maxBytes` 形参），其超限策略自古以来就是 `request.destroy()`——对 4 KiB 上限的账户接口而言影响有限，但本次把上限放大到 64 KiB 并作为对外验收契约后，该策略的缺陷被放大成可观测的契约违约。**注意：`request.destroy()` 摧毁的是 socket，`ServerResponse` 已无可用传输层，任何补救性 `writeJson` 都必然失败**，因此这不是「改个状态码」就能修的，必须更换为「先 `writeHead(413)` + `end()`，再主动关闭连接」的响应优先策略（必要时对 `request` 仅 `pause()`/`resume()` 排空而非 `destroy()`）。

**影响范围**：所有超过 64 KiB 的反馈提交（含恶意大报文与将来放宽前端校验后的正常长文本）。前端 `FeedbackPage.tsx:80-82` 的 `catch` 会把该情况归并为 `errorGeneric`「提交失败，请稍后重试」，用户无法得知是「内容过大」还是「网络故障」，无法自我纠正。同时该路径使 §二 P3-3 中「字节上限未真正生效」的问题无法被 413 语义掩盖或补偿。

**复现方法/运行证据**（对真实生产服务端执行，`PORT=3313`）
```
[B] Body-size boundary probe (spec: >64KiB -> 413 Payload Too Large)
  B1 ~5KB (under limit, valid): HTTP 201 {...}
  B2 ~70KiB (over limit):  NETWORK ERROR -> UND_ERR_SOCKET
  B3 ~10MiB (far over limit): NETWORK ERROR -> ECONNRESET
[C] Liveness check after oversized bodies
  GET /api/rooms -> HTTP 200 (server ALIVE)
[E] 64 KiB boundary
  body.length == 65536: HTTP 400 {"error":"Feedback message cannot exceed 5000 characters."}
  body.length == 65537: NETWORK ERROR UND_ERR_SOCKET
```

**修复建议**：在 `readJsonBody` 中引入独立的「超限」信号（如 reject 一个带 `code: "PAYLOAD_TOO_LARGE"` 的可辨识错误，或返回 `{ tooLarge: true }`），在 `processFeedbackApiRequest` 内显式判别后 `writeJson(response, 413, { error: "Payload too large" })` 并正常结束响应；避免在响应写出前 `destroy()` socket。若需保留既有账户接口的默认 4096 行为，请确保改动不改变其现状（否则会构成对 `/api/account/register` 的连带回归）。

**修复后验收标准**：体长 65537 与 10 MiB 均返回 `413`（而非连接重置），响应体为 JSON 且不含内部路径/堆栈；服务进程存活；`/api/account/register` 的既有超限行为与 4 KiB 上限不受影响。

---

### P3-3 64 KiB 上限按 **UTF-16 code unit** 计数而非字节，3 字节字符下实际放行约 192 KB

**严重级别**：P3（限流边界与文档契约不符；DoS 防护仍为有界，但上限被放大至约 3 倍）

**文件与行号**：`src/server/online-server.ts:335-341`（`body += chunk` 后判 `body.length > maxBytes`）、`:256`（`64 * 1024`）

**触发条件**：请求体含大量多字节字符（CJK / emoji）且字节数 > 64 KiB、code unit 数 ≤ 65536。

**实际行为**：`readJsonBody` 先 `request.setEncoding("utf8")`，`body` 为字符串，`body.length` 统计的是 **UTF-16 code unit**。实测载荷 `{"message":"测"×22000}`：code unit = 22014、UTF-8 字节 = **66014（已超 64 KiB）**，但**顺利通过体积守门**（响应为 `400 "Feedback message cannot exceed 5000 characters."`，证明报文被完整读取解析而非被体积守门拦截）。按此语义，最坏情况下（4 字节 emoji）实际可放行约 **256 KB**。

**期望行为**：`docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:107` 与 `:7` 的契约均为「请求体安全上限 **64 KiB**」（字节语义），用于「严格防范超大 JSON 报文攻击」。

**根因**：`body.length`（字符数）被当作字节数使用；未使用 `Buffer.byteLength(chunk)` 或对 `chunk` 做字节累加。

**影响范围**：体积上限事实上被放宽约 3 倍。由于仍有明确上界，DoS 防护并未失效，故定级 P3；但这是本任务明文验收项「支持 64 KiB 上限」的语义偏差，且与 P2-1 叠加后「超限」路径完全不可观测。

**复现方法/运行证据**
```
3-byte CJK payload: codeUnits=22014 utf8Bytes=66014 (>65536 bytes)
CJK 66014 bytes / 22014 units: HTTP 400 {"error":"Feedback message cannot exceed 5000 characters."}
```

**修复建议**：改为字节累加，例如在 `data` 回调中用 `receivedBytes += Buffer.byteLength(chunk, "utf8")`（或取消 `setEncoding` 直接以 Buffer 累加后统一 `toString("utf8")`），并以字节数对照 `maxBytes`。

**修复后验收标准**：上述 66014 字节载荷触发与 P2-1 一致的超限路径（413），而 65536 字节以内载荷正常进入字段校验。

---

### P3-4 `locale` 未按 6 语种白名单校准，任意超长伪造值（含 `<script>`）原样落盘

**严重级别**：P3（数据质量与契约偏差；当前无消费方读回该字段，故不构成 XSS）

**文件与行号**：`src/server/online-server.ts:293` — `const locale = typeof body.locale === "string" ? body.locale.trim() : undefined;`

**触发条件**：提交 `POST /api/feedback` 且 `locale` 为任意非空字符串。

**实际行为**：实测提交 `locale = "X".repeat(3000) + "<script>"` 返回 **`HTTP 201`**，该 3011 字符原始串被**逐字写入磁盘**：
```json
{ "feedbackId": "fb_RhA86N4Z", "message": "locale probe",
  "locale": "XXXX...(3000 个 X)...<script>", ... }
```
仅受 P2-1/P3-3 的报文体积上限约束，无长度上限、无枚举校验。

**期望行为**：方案 `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:113` 明文规定「`locale` 选填，**自动校准为已知 6 语种之一**」（`en|zh|fr|es|ru|ar`，超范围应回退默认或记 `unknown`）。

**根因**：仅做 `typeof === "string"` + `trim()` 类型校验，未复用既有 `isLocale()`（`src/i18n/config.ts`，仓库内已有该守卫）做白名单归一化。注意 `FeedbackStore` 内部亦仅做 `input.locale?.trim() || "unknown"` 兜底（`src/server/feedback-store.ts:86`），双层均无枚举校验。

**影响范围**：运维端按方案 `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:19/28` 的「`ls data/feedback` 直观查阅」设计审查反馈时，`locale` 字段不可信 / 不可聚合统计；同时形成一条向磁盘写入近 64 KiB 无用字符串的低成本路径（放大 P1-1 的磁盘占用）。因该字段目前无任何读回渲染方（`listFeedbacks()` 全仓无生产调用方，仅测试引用），**不构成存储型 XSS**。

**复现方法/运行证据**：`POST with bogus 3000-char locale -> HTTP 201`，随后直接读取落盘文件确认 `locale` 字段为 3011 字符原始串（见上）。

**修复建议**：在 `src/server/online-server.ts:293` 引入白名单归一化，例如 `const locale = isLocale(trimmed) ? trimmed : "unknown";`（或统一在 `FeedbackStore.saveFeedback` 内收敛，使两条入口一致）。

**修复后验收标准**：非法 / 超长 `locale` 无法进入落盘记录（落为 `"unknown"` 或默认语种），6 个合法语种值可原样保存；补一条断言非法值被归一化的用例。

---

### P3-5 测试有效性缺陷：`/api/feedback` **路由层零测试**，`smoke:feedback` 缺 429 与体积上限断言，交付文档却声称已覆盖 429

**严重级别**：P3（测试有效性缺陷：断言缺失 / 覆盖缺失，直接导致 P1-1 通过全部四道门禁）

**文件与行号**
- `src/server/feedback-store.test.ts`（8 例）— 仅覆盖 `FeedbackStore` 类，**从未 import 任何 HTTP 层**
- `src/server/online-server.ts` — 本次新增 106 行路由逻辑，仓库内**不存在** `src/server/online-server*.test.ts`
- `tools/smoke-feedback.ts:14-60` — 仅断言 `201` / `400`(空消息) / `400`(邮箱非法) / `405`，**无 429 断言、无超 64 KiB 断言**
- `STATUS.md:28` — 声称「`npm run smoke:feedback`：全部通过（覆盖无头 Chrome CDP 恢复与反馈 API **201/400/405/429**）」（与 `tools/smoke-feedback.ts` 实际断言不符）
- `docs/handoff/2026-09-18-feedback-and-log-collection-impl-handoff.md:30` — 声称「400/405/429/201 契约处理」

**触发条件**：任何一次「破坏路由层接线（限流判定、体积守门、字段校验）后运行四道门禁」。

**实际行为**：`grep -rl "api/feedback" src/ --include=*.test.ts` → **NONE**。全仓仅 `FeedbackPage.tsx`、`online-server.ts`、`tools/smoke-feedback.ts` 三处提及该路由，且 smoke 脚本不属于 `npm test`。因此 P1-1 这类**纯接线错误**（`consume()` 返回对象却被当真值取反）在 `tsc` / `lint` / `vitest` / `build` 四道门禁下**全部为绿**——本次审查已实测：含 P1-1 的提交 `8657f299` 四道门禁 100% 全绿。

**期望行为**：本任务验收标准第 2 条明文要求「正确返回 201/400/405/**429**」与「支持 **64 KiB 上限**」。至少应存在一条覆盖 `429` 与超限路径的**可自动执行**守门用例；`smoke-feedback.ts` 至少应补齐 `429` 与超 64 KiB 两项断言。

**根因**：存储层单测（`FeedbackStore`）与真实契约（HTTP 状态码）之间缺少集成桥接；且 `npm test` 不执行 `tools/smoke-*.ts`，验收标准第 2 条的「429」在自动化上落空。

**影响范围**：验收标准第 2 条事实上**无任何自动化守门**；P1-1 / P2-1 / P3-3 / P3-4 四类缺陷均可无痛回归。这是本次审查能够发现 P1 而在门禁中不可见的直接原因。

**复现方法/运行证据**
```
$ npm test        -> Test Files 34 passed (34) / Tests 314 passed (314)
$ npx tsc --noEmit -> 0 错误 ;  $ npm run lint -> 0 错误 0 警告
$ npm run build   -> 18/18 静态页通过
（以上全部在含 P1-1 的待审提交 8657f299 上全绿）
$ grep -rl "api/feedback" src/ --include=*.test.ts
NONE
```

**修复建议**：① 对 `tools/smoke-feedback.ts` 补齐「同 IP 连续 6 次 → 第 6 次 429」与「>64 KiB → 413」两条断言，并让其在 CI/门禁中可被调用；② 更优解是新增路由层测试（直接调用导出后的 `processFeedbackApiRequest`，或以 `IncomingMessage` mock 驱动），对 429/413/400 做状态码级断言。**修复后必须实测「回退 P1-1 修复 → 新用例变红」**，以证明守门真实有效。

**修复后验收标准**：回退 P1-1/P2-1 的修复代码后，新增用例**变红**；恢复修复后全绿；`npm test` 套数相应增加。

---

## 三、待确认风险与未验证项

1. **暗色主题与 RTL 镜像仅有静态层证据，未做浏览器计算样式级验证（未验证项）**
   - 未验证内容：`/{locale}/feedback` 在 `data-theme="dark"` 下的实际渲染是否「零翻白」，以及 `ar` 下 `text-align: end` / `justify-content: flex-end` 的实际镜像效果。
   - 无法执行的/未执行的原因：仓库内不存在面向 `/[locale]/feedback` 的浏览器 E2E 套件；本轮以 HTTP 取回 SSG HTML 与压缩后 CSS 做静态取证（已确认 `:root[data-theme=dark]` 块重新定义了 `--ink`/`--panel` 等变量、`[dir=rtl] .feedback-back-icon` 与 `:root[data-theme=dark] .feedback-error-banner` 规则确实进入产物、新样式全部使用 CSS 变量与逻辑属性 `text-align:end`/`justify-content:flex-end`，未使用硬编码 `left/right`）。
   - 需要什么条件才能验证：真实浏览器（CDP 无头 Chrome）加载该页面后读取 `getComputedStyle` 的 `background-color`/`color`，并做 RTL 布局盒模型断言。
   - 残余风险：**低**。未发现具体反例；但「零翻白」这一验收表述本身尚无自动化守门。

2. **`FeedbackStore` 在构造函数中即 `ensureDirectory()`（`src/server/feedback-store.ts:45`），是模块导入期的文件系统副作用（建议项，不定级为缺陷）**
   - 说明：`src/server/room-store.ts:19-21` 在模块顶层实例化 `feedbackStore`，因此**任何 import 该模块的进程都会在 cwd 创建 `data/feedback/`**。同仓的 `AccountStore` / `GameRecordStore`（`src/server/jsonl-file.ts`）均在**首次写入时**才建目录，本类是唯一例外。
   - 未定级理由：`mkdirSync(recursive)` 幂等且每进程仅执行一次，在只读 cwd 环境下的差异仅为「启动即失败」vs「首次落盘时失败」，对当前部署形态无可复现的实际影响，故不按 P3 阻断。若后续需要只读部署或纯净导入，建议下沉为惰性创建。

3. 未复跑项说明：本轮已独立复跑四道门禁（tsc / lint / vitest / build）并全部复现作者声称的结果；未重复执行 `npm run verify:online`、`smoke:lobby`、`smoke:matchmaking` 等与本次变更无连带的联机烟测。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序（按依赖与影响面）**

1. **P1-1（阻塞级，优先）**：修正 `src/server/online-server.ts:251` 读取 `.allowed` 并补 `retry-after`；随后立即执行 P3-5 的守门用例补强。
2. **P3-5（与 P1-1 强绑定）**：补齐 `429` 与 `>64 KiB` 的自动化断言，并**实测回退 P1-1 后变红**——否则 P1 的修复无法被证明有效。
3. **P2-1 + P3-3（同一路径，建议一次性改完）**：将 `readJsonBody` 的超限策略由 `request.destroy()` 改为「可辨识超限信号 + 显式 413 响应」，同时把体积累加改为**字节**语义（`Buffer.byteLength`），并确保 `/api/account/register` 的 4 KiB 既有行为零回归。
4. **P3-4**：`locale` 白名单归一化（复用 `isLocale()`），并补一条非法值归一化断言。

**复审验收标准（需逐条给出可复现证据）**

- [ ] 同一 IP 连续 6 次 `POST /api/feedback`：第 1–5 次 `201` 且落盘，第 6 次 `429` 且 `retry-after > 0`，`data/feedback/` 仅新增 5 个文件；窗口过后恢复 `201`。
- [ ] `>64 KiB` 请求体（分别用纯 ASCII 65537 字节与 3 字节 CJK 66014 字节）返回 `413` JSON，且**无连接重置**；服务进程存活；`data/feedback/` 无新增文件与无 `.tmp-` 残留。
- [ ] 超限修复后，`/api/account/register` 的 4 KiB 上限与 `409/400/201` 契约零回归（有对照证据）。
- [ ] 非法 / 超长 `locale` 不再原样落盘；6 个合法语种值原样保存。
- [ ] 新增路由层守门用例：回退 P1-1 与 P2-1 的修复代码后**实测变红**，恢复后全绿；`npm test` 套数/用例数相应增长。
- [ ] 四道门禁全绿（tsc 0 错误 / lint 0 错误 0 警告 / vitest 全绿 / build 18/18），且 `smoke:feedback` 补齐 429 与超限断言后可在本地一键执行通过。
- [ ] 修正 `STATUS.md:28` 与交付 handoff 中「覆盖 201/400/405/429」的表述，使其与脚本实际断言一致（本轮以缺陷证据形式记录，非独立文书缺陷）。
