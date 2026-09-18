# 用户反馈系统 (Feedback) Round 1 缺陷闭环 · 独立代码审查 Round 2 复查报告

> **审查日期**：2026-09-18
> **审查轮次**：Round 2（源码修复复查）
> **被审 HEAD**：`5a55ac642ad902996bd02175de7b4ace24e31cb2`
> **基准提交**：`861ad25a0d6d46132410891843ff349ecdc47a33`
> **本轮修复增量**：`8657f299c4523f1326b1bc112f2bd2f3eaadf952..5a55ac642ad902996bd02175de7b4ace24e31cb2`（9 文件，+879/−111）
> **全量审查范围**：`git diff 861ad25a..5a55ac64`（22 文件，+2218/−239）
> **判定结论**：**未通过**（0×P0，0×P1，**2×P2**，**1×P3**，需修复闭环）

---

## 一、审查基本信息与通过项简述

- 版本核对：`git pull --ff-only` 后 HEAD = `5a55ac64...`（与指定被审 SHA **一致**），基准 `861ad25a`，工作区干净；本轮未修改任何产品代码/正式测试，全部临时探针文件已删除，`git status --porcelain` 为空。
- 门禁复跑：`npx tsc --noEmit` 0 错误；`npm run lint` 0 错误 0 警告；`npm test` **35 套 / 324 例全绿**；`npm run build` **18/18 页面**通过（`/[locale]/feedback` = `● (SSG)` ×6）。
- Round 1 缺陷闭环：**P1-1 已真正闭环**（真实生产服务端实测同 IP 前 5 次 `201`、第 6 次 `429` 且 `retry-after=600`、`data/feedback` 仅新增 5 个文件，`consume().allowed` 判定生效）；**P3-3 / P3-4 / P3-5 已闭环**（64 KiB 严格按 UTF-8 字节：65536 → 400、65537 → 413；真实服务端伪造 `locale`（3000×X + `<script>`）与 `zh-CN` 均落 `"unknown"`、`ar` 原样保留；`feedback-api.test.ts` 10 例路由级用例 + `smoke:feedback` 已补齐 413/429/`retry-after` 断言并两次实跑通过）；`/api/account/register` 零回归（实测 `200`）。**P2-1 仅部分闭环**（见 P2-1）。
- 独立验证：自建 5 组探针（真实生产服务端 + 独立 Node HTTP 服务端 + 原始 `net` socket 客户端，共 60+ 次请求）。其中 **2 项成功证伪**（见 §二），慢速 4 KiB 分片上传、客户端半途 RST 断开、64 KiB 精确边界、locale 归一化等场景均符合预期、无异常。

---

## 二、审查发现与缺陷清单

### P2-1 Round 1 `P2-1` 未闭环：≥128 KiB 超限报文仍以 TCP RST 收场，客户端拿到 **0 字节响应**，规格要求的 `413` 依旧不可观测

**严重级别**：P2（本轮修复的明文验收标准未达成：Round 1 §四 要求「体长 65537 与 **10 MiB** 均返回 `413`（而非连接重置）」。防护本身（不落盘）仍有效、服务进程存活，故未升级至 P1）

**文件与行号**
- `src/server/feedback-api.ts:131-139`（缺陷点：`response.once("finish", () => { request.destroy(); });` + `writeJson(response, 413, ...)` + `request.resume()`）
- `src/server/feedback-api.ts:47-53`（`request.pause()` 后 `reject(new PayloadTooLargeError(...))`，决定了响应先于请求体结束而发生）
- `src/server/feedback-api.test.ts:149-165`（守门用例体长仅 `MAX_FEEDBACK_BODY_BYTES + 100` = 70,694 字节，恰好落在可稳定送达区间内）
- `tools/smoke-feedback.ts:78-91`（同上，仅 66 KiB）

**触发条件**：`POST /api/feedback`，请求体总长 > 64 KiB 且**客户端在服务端读完前 64 KiB 后仍继续上行**（即总长越大越必然；实测总长 ≥128 KiB 时在标准 Node HTTP 服务端上 100% 复现）。

**实际行为**（证据见下）：客户端**收不到任何 HTTP 状态行**（`bytes=0`），以 `ECONNRESET` 结束；服务端不落盘、不崩溃。即 Round 1 报告的「连接被掐断、`413` 永不返回」缺陷在 128 KiB~10 MiB 区间**依然存在**。

**期望行为**：`docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:107` 的 `413 Payload Too Large` 对**任意**超限报文均可送达；Round 1 复审验收标准「65537 与 10 MiB 均返回 413（而非连接重置）」。

**根因**：`readFeedbackJsonBody` 在累计超过 64 KiB 的那一刹那 `request.pause()` 并 reject，使 413 响应**必然早于请求体结束**（这正是 `413` 语义允许的）。但随后注册的 `response.once("finish", () => request.destroy())` 在响应刚刷出（尚未被客户端读取）时**立刻销毁 socket**；此时接收缓冲区内仍有客户端未送达/未读走的数据，内核以 **RST** 结束连接，客户端 TCP 栈丢弃了尚未读走的 413 响应字节 —— 实测 `bytes=0`、`firstLine=""`。
注意：这**不是**把 `destroy()` 删掉就能修的——`connection: close` 下 Node 在响应 `finish` 后本就会走 `socket.destroySoon()`，同样会在客户端仍在上传时销毁 socket。要稳定送达，必须主动做「**延迟关闭（lingering close）**」：`res.end()` 后仅关闭写方向、并在有界时间内继续读并丢弃对端数据，或干脆把请求体**读到 `end`（丢弃不解析）后再回写 413**。nginx 的 `lingering_close` 正是为此存在的标准手法。

**影响范围**：64 KiB 体积守门这一「严格防范超大 JSON 报文攻击」的验收项（`docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md:107`）在最需要它的**大报文场景**下产出不可观测的传输层错误；客户端无法区分「内容过大」与「网络故障」（前端 `FeedbackPage.tsx:80-82` 会归并为 `errorGeneric`，无法自我纠正）。磁盘防护与进程存活未受影响。

**复现方法/运行证据**
```bash
# 证据 1（独立 Node HTTP 服务端 + 生产 handler，fetch 客户端，3 次连跑结果完全一致）
body=67584  -> HTTP 413 {"error":"Payload too large"}
body=98304  -> HTTP 413 {"error":"Payload too large"}
body=131072 -> NETWORK ERROR: fetch failed | cause.code=ECONNRESET
body=196608 -> NETWORK ERROR: fetch failed | cause.code=ECONNRESET
body=262144 -> NETWORK ERROR: fetch failed | cause.code=ECONNRESET
body=524288 -> NETWORK ERROR: fetch failed | cause.code=ECONNRESET
body=1048576 -> NETWORK ERROR: fetch failed | cause.code=ECONNRESET
body=10485760 -> NETWORK ERROR: fetch failed | cause.code=ECONNRESET      # 3/3 轮同上

# 证据 2（真实 net socket 持续上行 5 MiB，256 KiB/片，5 次）
rep1..rep5: firstLine="" bytes=0 uploadCompleted=false sockErr=ECONNRESET   # 5/5 零字节响应

# 证据 3（真实生产服务端，PORT=3317，GOMOKU_TRUST_PROXY=1 逐请求换 XFF 规避限流干扰）
body=131072 -> 413 x7/8   body=1048576 -> 413 x7/8（各 1 次 ECONNRESET）   # 竞态存在且在真实服务端可复现
```
```bash
# 对照组（证明不是「必然失败」，而是请求体是否已结束的竞态）
慢速客户端（4 KiB/片、5 ms 间隔）70 KiB / 128 KiB / 256 KiB / 1 MiB × 3 次 -> 全部 HTTP 413 Payload Too Large，无 socket 错误
```

**修复建议**
1. 移除 `response.once("finish", () => request.destroy())`；改为**响应优先 + 延迟关闭**：`writeJson(response, 413, ..., { connection: "close" })` → `request.resume()` 继续排空 → 在 `request` 的 `end`/`close` 或一个有界超时（如 2~5 s，`timer.unref()`）之后才 `response.socket?.destroy()`。
2. 或者更简单直接：**读到 `end` 再回写**——保留 `bytesRead` 字节计数，超限后停止缓冲但继续 `resume()` 排空至 `end`（可另设一个绝对硬上限，如 2 MiB，超过才强制断开），随后 `writeJson(413)`。这样响应发出时客户端已无在途上行数据，`413` 必然可读。
3. 无论采用哪种，**不得改动 `/api/account/register` 复用的旧 `readJsonBody`**（`src/server/online-server.ts:235-261`，4 KiB + `destroy()` 既有行为须零回归）。

**修复后验收标准**
- `65537` / `128 KiB` / `1 MiB` / `10 MiB` 四档全部返回 `413` JSON，且**用真实 `net` socket 客户端持续分片上行（≤256 KiB/片）时仍能读到完整状态行**（当前实测 `bytes=0`）；服务进程存活、`data/feedback/` 无新增文件、无 `.tmp-` 残留。
- 新增一条 ≥1 MiB 的 413 用例（见 P3-1），修复前必须实测变红。
- `/api/account/register` 的 4 KiB 上限与 `201/400/409` 契约零回归。

---

### P2-2 本轮重写的请求体读取在 **chunk 边界切裂多字节 UTF-8 字符**，落盘反馈正文静默损坏（3 字节字符变 `U+FFFD`）

**严重级别**：P2（数据完整性回归：Round 1 代码用 `request.setEncoding("utf8")` 对该场景免疫，本轮重写后失效；触发条件在真实网络下高概率命中，且**无任何错误上抛**，属「特定场景下功能错误 + 明显回归」）

**文件与行号**
- `src/server/feedback-api.ts:43-57`（缺陷点：`request.on("data", (chunk: Buffer | string) => { ... body += chunk.toString(); })`，**全程未调用 `request.setEncoding`，也未使用 `StringDecoder`**）
- 对照：`src/server/online-server.ts:235-246`（Round 1 及既有账户接口**正确**写法：`request.setEncoding("utf8")` + `body += chunk`）

**触发条件**：请求体的某个 stream chunk 边界落在多字节 UTF-8 序列内部（CJK 3 字节、emoji 4 字节、俄语/西语重音 2 字节）。真实网络上大 body 必然被切成多个 chunk，CJK 正文的边界命中概率极高（3 字节字符下单个边界命中概率 2/3）。

**实际行为**：`chunk.toString()`（默认 utf8）对每个 chunk **独立解码**：被切裂的字符，前一片尾部的部分字节 → `U+FFFD`，后一片头部的续字节 → 各 `U+FFFD`。由于 `U+FFFD` 是合法 JSON 字符，**`JSON.parse` 不报错、HTTP 返回 `201`、校验全过**，损坏内容被静默写入磁盘。实测（真实生产服务端，`{"message":"测"×100}` 分两次 TCP 写、切点落在第 11 个「测」中间）：
```
HTTP/1.1 201 Created
stored message length=102 (客户端发送 100 个字符)
U+FFFD count = 3
byte-identical to source = false
```

**期望行为**：落盘 `message` 与客户端提交内容**逐字符一致**（6 语种中的 `zh`/`ru`/`ar` 及含重音、emoji 的正文均属常态输入）。

**根因**：Round 1 的 `readJsonBody` 依赖 `request.setEncoding("utf8")`（底层 `StringDecoder`，会跨 chunk 缓存不完整序列）。本轮为改造体积守门而重写为「不 setEncoding + 逐 chunk `Buffer.toString()`」，字节计数正确了（P3-3 修复有效），但**丢掉了跨 chunk 的字符重组能力**，形成一处与 P3-3 同源但方向相反的新回归。

**影响范围**：所有非 ASCII 反馈正文在真实网络下静默损坏（中文为用户 6 官方语种之一）。该字段是本任务的核心交付物（`listFeedbacks()` / `data/feedback/` 是人审与统计的数据源），损坏后**不可恢复、无法察觉**，且现有全部守门用例（测试与 smoke 均用 ASCII 或单次 `write` 的短报文）对此零覆盖。

**复现方法/运行证据**
```bash
# 真实生产服务端（PORT=3317，原始 net socket 两次 write，切点在第 11 个「测」字节序列中间）
POST /api/feedback  body = {"message":"测"×100}   ->  HTTP/1.1 201 Created
落盘文件 20260918-212022-fb_Nvc3IR14.json:
  message 长度 = 102（应为 100）
  替换字符 U+FFFD 计数 = 3（应为 0）
  与源串逐字符相等 = false

# 独立 handler 服务端复现同一结果（U+FFFD 计数 3、长度 102、identical=false）
```
```bash
# 对照组（反证「非 ASCII 本身没问题，只有切裂才有问题」）
同一服务端，CJK 报文一次性单 write 发出 -> 201 且落盘正文与源串完全一致
```

**修复建议**：恢复跨 chunk 解码能力，同时保留 P3-3 的字节语义（二者并不冲突）：
```ts
request.setEncoding("utf8");                       // StringDecoder 负责跨 chunk 重组
request.on("data", (chunk: string) => {
  bytesRead += Buffer.byteLength(chunk, "utf8");   // 体积仍按 UTF-8 物理字节计
  if (bytesRead > maxBytes) { ...reject 413... }
  body += chunk;
});
```
或保留 Buffer 累加（`chunks.push(chunk)`）并在 `end` 时用 `Buffer.concat(chunks).toString("utf8")` 一次性解码（切片即便切裂字符也能正确解码）。

**修复后验收标准**
- 用原始 `net` socket 把含 CJK/emoji 的报文**切在字符字节序列中间**分两次写入：服务端落盘正文与源串**逐字符相等**（`U+FFFD` 计数 0）。
- 64 KiB 字节边界语义不回归：65536 字节 → 字段校验分支（400）、65537 字节 → 413。
- 新增一条「分片写入 + 非 ASCII 正文」的守门用例（当前实现下必须变红）。

---

### P3-1 守门用例覆盖区间小于验收标准：413 用例仅取 `MAX+100`，无法覆盖验收明文要求的 MiB 级报文

**严重级别**：P3（测试有效性缺陷：断言覆盖缺失，正是 P2-1 逃过全部门禁的直接原因）

**文件与行号**
- `src/server/feedback-api.test.ts:149-165`（`const oversized = "a".repeat(MAX_FEEDBACK_BODY_BYTES + 100);`）
- `tools/smoke-feedback.ts:78-91`（`"x".repeat(66 * 1024)`）

**触发条件**：在 P2-1 未修复的当前代码上运行 `npm test` / `npm run smoke:feedback`。

**实际行为**：两条「413 守门」全部**通过**（70,694 / 67,584 字节落在可稳定送达区间），而 Round 1 复审验收标准点名的 10 MiB 及 128 KiB~1 MiB 区间实测 `ECONNRESET`（`bytes=0`）——即 P2-1 这类「超限路径再次退化为连接重置」的回归可再次无痛穿透四道门禁。
另一处：两条用例都用 `fetch` 发送一次性小体积 body（可整体塞进 socket 发送缓冲），**天然无法触发**「服务端响应早于客户端上行结束」的竞态，因此对 RST 送达失败不敏感。

**期望行为**：验收标准第 3 条（「>64 KiB 物理字节超限返回规范 413，无 socket reset」）至少有一条 MiB 级断言与一条能触发竞态的客户端断言。

**根因**：用例规模沿用了「刚好越界」的最小构造，未对齐 Round 1 §四 明文写入的 `10 MiB` 验收档位；且测试客户端模型（单次 `fetch` + 内存 body）与真实上行时序不同。

**影响范围**：`413` 契约与「无连接重置」在自动化上无有效守门；P2-1 的残留缺陷无法被任何门禁发现。

**修复建议**：①`feedback-api.test.ts` 增补 ≥1 MiB（建议 1 MiB 与 10 MiB 两档）的 413 断言；②增补一条基于 `node:net` 的原始 socket 用例：以 ≤256 KiB 分片**持续写入** ≥1 MiB，断言**读到 `HTTP/1.1 413` 状态行**（当前实现下必然变红，`bytes=0`）；③`tools/smoke-feedback.ts` 的超限档位从 66 KiB 提升到 ≥1 MiB。

**修复后验收标准**：在 P2-1 修复前，新增用例**实测变红**（连接重置/零字节响应）；P2-1 修复后全绿；`npm test` 用例数相应增长。

---

## 三、待确认风险与未验证项

1. **暗色主题与 RTL 镜像仍无浏览器计算样式级证据（承接 Round 1，本轮未新增 CSS 改动）**
   - 未验证内容：`/{locale}/feedback` 在 `data-theme="dark"` 下的实际渲染是否零翻白、`ar` 下 `text-align:end` / `justify-content:flex-end` 的实际镜像效果。
   - 原因：仓库内无面向该页面的浏览器 E2E 套件；本轮修复增量（`8657f29..5a55ac64`）未触碰 `globals.css` / `FeedbackPage.tsx`。
   - 残余风险：**低**（无具体反例）；如需关门，需 CDP 无头 Chrome 读取 `getComputedStyle`。
2. **`readFeedbackJsonBody` 无独立的请求体读取超时**
   - 说明：慢速上行（slow-loris）会令 promise 长时间挂起。已核验 Node 默认 `server.requestTimeout = 300_000ms` 对上收整段请求体生效，故资源可被有界回收；该形态与既有 `/api/account/register` 一致，非本轮新增风险，不定级。
3. **未复跑项**：`npm run verify:online`、`smoke:lobby`、`smoke:matchmaking`（与本轮变更无连带）。`smoke:feedback` 已实跑两次（首跑全绿 + 复跑走限流分支全绿）。

---

## 四、推荐修复顺序与复审验收标准

**修复顺序**
1. **P2-2（优先，数据损坏且改动最小）**：`src/server/feedback-api.ts:43-57` 恢复 `setEncoding("utf8")` 或改为 `Buffer.concat` 后统一解码，字节计数改用 `Buffer.byteLength(chunk, "utf8")`；补「分片写入 + CJK」守门用例。
2. **P2-1**：`src/server/feedback-api.ts:131-139` 去掉 `finish → request.destroy()`，改为「响应优先 + 排空至 `end`（或有界延迟关闭）后释放连接」；确保 `/api/account/register` 零改动。
3. **P3-1**：同步把 413 用例档位提到 ≥1 MiB 并引入原始 socket 持续上行断言（与 P2-1 强绑定，须实测「修复前变红 → 修复后全绿」）。

**复审验收标准（需逐条给出可复现证据）**
- [ ] `>64 KiB` 报文在 `65537 / 128 KiB / 1 MiB / 10 MiB` 四档均返回 `413` JSON；用**原始 socket 分片持续上行（≤256 KiB/片）**仍能读到 `HTTP/1.1 413`（当前实测 `bytes=0`、`ECONNRESET`）。
- [ ] 非 ASCII 正文在 **chunk 边界切裂字符** 的写入方式下落盘内容与源串逐字符一致（`U+FFFD` 计数 0）；64 KiB 字节边界（65536/65537）语义与 locale 归一化不回归。
- [ ] 新增 ≥1 MiB 413 用例与分片 CJK 用例，**在修复前实测变红**，修复后全绿；`npm test` 套数/用例数增长。
- [ ] 四道门禁全绿（tsc 0 错误 / lint 0 错误 0 警告 / vitest 全绿 / build 18/18）；`smoke:feedback` 两次连跑通过。
- [ ] `/api/account/register` 4 KiB 上限与 `201/400/409` 契约零回归（附对照证据）。

> **附（非阻塞建议，不计入缺陷）**：本轮 `docs/handoff/INDEX.md` 的「阶段交付文档列表（倒序排列）」表格**表头行被数据行替换**，导致该表失去表头。本轮已顺势补回表头，供后续登记渲染正常。
