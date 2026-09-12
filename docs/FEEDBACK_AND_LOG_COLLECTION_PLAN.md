# Feedback 页面与日志采集/增量拉取需求计划

更新日期：2026-09-12
状态：需求计划，尚未实施

## 1. 目标

新增一个面向所有访客的 Feedback 页面，让用户可以提交问题或建议，并在知情、可控的前提下附带当前浏览器会话的诊断日志和一张截图。服务器把每次反馈及其附件写入独立目录；运维人员可通过受保护的 API 和本地同步工具拉取日志与反馈附件，工具只下载本地尚不存在或校验不一致的文件。

本需求包含四条完整链路：

1. 浏览器在网站运行期间生成有限、脱敏、可预览的诊断日志。
2. 用户在 `/{locale}/feedback` 填写反馈，可选联系方式、日志和截图后提交。
3. 服务器校验并把一次反馈原子地写入专属目录。
4. 管理员通过鉴权 API 获取 artifact 清单，并用本地命令增量同步未下载文件。

## 2. 用户故事

- 作为普通用户，我可以填写反馈正文，不注册也能提交。
- 作为愿意配合排障的用户，我可以在提交前查看将要上传的日志，并自主决定是否附带。
- 作为用户，我可以选择填写邮箱，也可以完全不提供联系方式。
- 作为用户，我可以上传一张能够说明问题的截图，并在提交前移除它。
- 作为维护者，我可以从服务器拉取新反馈、客户端日志和服务端运行日志，不需要重复下载已经完整保存到本地的文件。
- 作为维护者，我可以验证下载文件未损坏，并在同步中断后安全续跑。

## 3. 范围与默认决策

### 3.1 Feedback 页面

- 新页面路径：`/{locale}/feedback`，根路径 `/feedback` 按现有 locale cookie/default locale 规则重定向。
- 首页和 Profile 页提供可发现的 Feedback 入口；页面支持 English、中文、Français、Español、Русский、العربية，并继承浅色/黑暗模式和 RTL。
- 表单字段：
  - `message`：必填，trim 后 10～5000 个 Unicode 字符。
  - `email`：可选，最多 254 个字符；仅做基础格式校验，不发送验证邮件。
  - `includeLogs`：可选且默认不勾选；勾选前必须在旁边明确说明日志内容、大小和隐私边界。
  - `screenshot`：可选，最多 1 张，只接受 PNG/JPEG/WebP，最大 5 MiB。
- 页面显示当前应用版本、日志条目数/字节数、日志预览、清空日志和移除截图操作。
- 提交成功后显示不可猜测的 `feedbackId`，用于后续沟通；失败时保留正文和邮箱，允许重试，不自动重复上传。

### 3.2 浏览器诊断日志

新增统一的 client logger，不直接把任意 `console.log` 全量上传。记录范围限定为：

- 应用启动、应用版本、locale、主题、当前路由类型。
- 页面模式切换以及 Socket.IO 连接、断开、重连和协议错误。
- API 请求失败、未捕获异常和未处理 Promise rejection。
- 关键操作的结果码与耗时；不记录反馈正文、聊天正文、认证 token、完整邀请链接、邮箱、IP 或截图内容。

日志采用结构化 JSON Lines，建议字段为：

```json
{"timestamp":"2026-09-12T12:00:00.000Z","level":"error","event":"socket.connect_error","message":"xhr poll error","context":{"appVersion":"abc1234","locale":"zh"}}
```

约束：

- 浏览器内使用固定容量 ring buffer，默认最多 500 条或 256 KiB，达到任一上限即淘汰最旧记录。
- 日志只覆盖当前 tab 会话；首版不跨日长期保存在浏览器中。刷新恢复如确有排障价值，可使用 `sessionStorage`，但同样受容量上限约束。
- 写入前统一执行 key/value 脱敏：屏蔽 `token`、`authorization`、`email`、cookie、URL 查询参数及类似密钥字段。
- 错误 stack 限长，并移除明显的 token/邮箱模式；所有 context 必须来自白名单字段，不能序列化任意对象。
- 用户取消“附带日志”时，请求中不发送日志字段；清空后只记录一条新的 `diagnostics.cleared` 状态。

### 3.3 反馈存储

默认根目录为 `data/feedback/submissions`，可用 `GOMOKU_FEEDBACK_DIR` 覆盖。每条反馈使用不可猜测 ID 和独立目录：

```text
data/feedback/submissions/
  2026/
    09/
      <feedbackId>/
        metadata.json
        client-log.jsonl       # 仅在用户选择附带时存在
        screenshot.png         # 仅在用户上传时存在；扩展名由校验后的真实类型决定
```

`metadata.json` 至少包含 schemaVersion、feedbackId、receivedAt、message、email（缺省为 null）、appVersion、locale、attachment 清单、每个 artifact 的字节数和 SHA-256。文件名不使用用户输入。

写入流程先落到同一文件系统下的 `<feedbackId>.tmp` 目录，所有文件写入并校验成功后再原子 rename 为最终目录。失败时不得留下可被清单 API 视为完整提交的数据。反馈目录、运行日志和同步状态必须加入 `.gitignore`，不得进入 Git。

### 3.4 服务端运行日志

除用户主动附带的客户端日志外，自定义 Node server 增加结构化运行日志，默认目录为 `data/runtime-logs`，可用 `GOMOKU_RUNTIME_LOG_DIR` 覆盖。

- 记录服务启动/停止、请求错误、反馈接收结果、Socket.IO 服务级错误和未捕获异常；不写 token、反馈正文、邮箱、聊天正文或截图内容。
- 按 UTC 日期和大小轮转，例如 `2026-09-12/server-<instanceId>-0001.jsonl`；单文件建议上限 10 MiB。
- 轮转后的文件视为 immutable artifact；正在写入的 `.active` 文件不出现在导出清单中，轮转完成后原子改名为 `.jsonl`。
- stdout/stderr 继续保留供 systemd/journald 使用，文件日志只保存排障所需的结构化事件。

## 4. HTTP/API 契约

### 4.1 提交反馈

`POST /api/feedback`

- Content-Type：`multipart/form-data`。
- Part：`message`、可选 `email`、可选 `clientLog`、可选 `screenshot`、`appVersion`、`locale`。
- 服务端不能信任浏览器声明的 MIME、扩展名、大小或 appVersion；截图须检查 magic bytes、限制解码后的像素尺寸，并解码后重新编码为安全图片和安全文件名，防止伪装格式、polyglot 与解压炸弹。
- 整个请求最大 6 MiB；message、email、clientLog 和 screenshot 另设独立限制。使用流式 multipart parser，超限立即停止读取并清理临时目录，不把附件整体读入内存。
- 成功：`201 { "feedbackId": "...", "receivedAt": "..." }`。
- 校验失败：`400/413/415` 和稳定错误码；限流：`429` 与 `Retry-After`；内部错误：`500`，不得暴露磁盘路径或 stack。
- 按可信 client address 限流，建议每 IP 每 10 分钟 5 次、每天 20 次；沿用 `GOMOKU_TRUST_PROXY` 的地址解析规则。
- 只接受同源浏览器请求（校验 `Origin`/`Sec-Fetch-Site`），不设置宽松 CORS；脚本化 smoke 可在测试环境使用明确允许的 origin。

### 4.2 Artifact 清单

`GET /api/admin/log-artifacts?cursor=<opaque>&limit=100&kind=all`

- `kind` 支持 `feedback`、`client-log`、`runtime-log`、`screenshot`、`all`。
- 响应只列已完整落盘且不可变的 artifact：

```json
{
  "items": [
    {
      "artifactId": "opaque-id",
      "kind": "client-log",
      "feedbackId": "optional-id",
      "createdAt": "2026-09-12T12:00:00.000Z",
      "relativePath": "feedback/2026/09/<feedbackId>/client-log.jsonl",
      "size": 12345,
      "sha256": "..."
    }
  ],
  "nextCursor": "opaque-or-null",
  "hasMore": false
}
```

- 排序键固定为 `(createdAt, artifactId)`，cursor 为服务端生成的不透明值；不得只用时间戳，否则同毫秒 artifact 会漏项。
- 清单不返回反馈正文、邮箱或真实服务器绝对路径。

### 4.3 下载单个 Artifact

`GET /api/admin/log-artifacts/:artifactId`

- 通过服务端索引解析 artifact，禁止把 URL 参数拼接为文件路径，防止目录穿越。
- 返回 `Content-Length`、`ETag: "sha256:<digest>"`、`Digest`/自定义 SHA-256 响应头和 `Content-Disposition: attachment`。
- 支持流式下载；首版可不支持 Range，但必须能被本地工具幂等重试。

### 4.4 管理接口鉴权

- 两个 `/api/admin/log-artifacts*` 接口必须要求 `Authorization: Bearer <GOMOKU_LOG_EXPORT_TOKEN>`。
- 环境变量未配置时，管理接口默认不可用并返回 `503`，不能降级为匿名访问。
- token 使用 timing-safe comparison；日志中不能输出 token。生产环境只允许 HTTPS，并在 OpenResty 层追加请求速率限制。
- Feedback 提交接口保持匿名；管理接口与注册账号 token 是不同的权限域。

## 5. 本地增量同步工具

新增命令：

```bash
npm run sync:feedback -- --base-url https://example.com --output <local-directory>
```

token 只从 `GOMOKU_LOG_EXPORT_TOKEN` 环境变量读取，不接受命令行明文参数，以免进入 shell history 和进程列表。

同步算法：

1. 读取输出目录内的 `.gomoku-log-sync.json`；该文件只是加速索引，不是唯一真相。
2. 分页请求 artifact 清单。对每项规范化 `relativePath`，确认最终路径仍位于指定输出目录内。
3. 若本地目标存在、size 相同且本地状态记录的 SHA-256 相同，则跳过。
4. 若状态缺失或不一致，计算本地文件 SHA-256；匹配则补写状态并跳过，不匹配则重新下载。
5. 下载到同目录 `<filename>.part`，完成后校验 size 与 SHA-256；校验通过才原子 rename。校验失败删除 `.part` 并报告错误，不覆盖已有文件。
6. 每个 artifact 成功后原子更新状态文件，记录 artifactId、relativePath、size、sha256、downloadedAt；中途退出后下次可继续。
7. 完成后输出 scanned/downloaded/skipped/repaired/failed 计数；任一下载或校验失败时进程返回非零退出码。

“只抓本地没下载过”的判定因此为：本地文件实际存在且内容 hash 与服务器清单一致才算已下载。仅凭 cursor、时间戳或状态文件记录不足以跳过。

## 6. 安全、隐私与滥用防护

- 页面必须明确说明日志和截图会被发送给维护者；日志可预览、可清空、可不附带。
- 邮箱仅用于反馈联系，不公开、不写入普通运行日志、不出现在 artifact 清单；后续隐私政策需说明用途与保留期限。
- 文本按纯文本保存和展示；未来若做后台查看页，必须转义输出，不能渲染用户 HTML。
- 服务器校验文件签名和大小；拒绝 SVG、HTML、压缩包及可执行内容。下载响应使用 `X-Content-Type-Options: nosniff`。
- feedbackId、artifactId 均使用加密安全随机值；外部响应不暴露目录结构、IP、内部错误或连续数据库 ID。
- 提交限流、请求超时、并发上限和最小磁盘剩余量保护必须在落盘前执行；磁盘空间不足时安全失败并产生脱敏告警。
- 不提供匿名“列出全部反馈/日志”的 API；所有管理读取路径都必须鉴权并写审计事件。
- 建议默认保留：服务端运行日志 30 天、反馈及附件 180 天。具体清理策略通过环境配置，清理任务只删除已完成目录并记录数量，不跟随符号链接。

## 7. 实施阶段

### F0：契约和存储基础

- 新增 feedback/log artifact 类型、校验器、路径规范化和 SHA-256 工具。
- 新增临时目录原子提交、artifact 索引/扫描与损坏目录隔离逻辑。
- 配置数据目录、上传限制、导出 token 和保留期限；同步 `.gitignore` 与部署示例。
- 先写存储、路径穿越、损坏文件和边界值单元测试。

### F1：客户端诊断日志

- 实现 ring buffer、白名单 context、脱敏、容量淘汰和 JSONL 导出。
- 接入 app boot、路由/模式、API、Socket.IO、`window.error` 和 `unhandledrejection`。
- 为脱敏、容量、异常序列化和 session 恢复增加测试。

### F2：Feedback API 与页面

- 在 custom online server 中接入流式 multipart 解析、提交限流和 FeedbackStore。
- 实现六语页面、入口、表单状态、日志预览、截图预览、上传进度/防重复提交和成功回执。
- 补齐 API 集成测试、字典一致性测试、键盘/读屏、移动端和 RTL 验证。

### F3：运行日志与受保护导出

- 实现服务端 JSONL logger、轮转和 active/immutable 边界。
- 实现 artifact 清单分页、鉴权、下载流、hash/size header 和审计事件。
- 覆盖未配置 token、错误 token、分页同时间戳、目录穿越、active 文件隐藏和大文件流式下载测试。

### F4：增量同步工具与端到端验收

- 新增 `tools/sync-feedback-artifacts.ts` 和 `npm run sync:feedback`。
- 测试首次全量下载、二次零下载、本地文件缺失、hash 损坏、`.part` 中断、分页续跑和非法 relativePath。
- 在临时生产构建上完成匿名提交 → 专属目录落盘 → 管理清单 → 首次同步 → 二次零下载的闭环 smoke。

### F5：部署与运维收口

- 更新 systemd/OpenResty 示例、环境变量说明、备份/权限/容量监控和保留策略。
- 生产目录建议权限为仅服务用户可写、仅服务用户和指定运维用户可读。
- 部署后验证 HTTPS、管理接口匿名拒绝、反馈限流、磁盘告警和真实增量同步。

## 8. 验收标准

功能验收：

- 六种语言都能打开 Feedback 页面，正文为唯一必填项。
- 不填邮箱、不附日志、不附截图可以成功提交。
- 选择日志后可以预览且上传内容与预览一致；取消后服务器目录中没有 client log。
- 合法截图成功保存；伪造 MIME、超限文件和不支持格式被拒绝且无残留临时目录。
- 每次成功提交只生成一个独立、完整目录，metadata 中附件 size/hash 与实际文件一致。
- 管理 API 无 token/错误 token 均不能列出或下载任何 artifact。
- 首次同步下载全部匹配项；立即二次同步 `downloaded=0`；删除一个本地文件后只补下载该文件；篡改一个文件后只修复该文件。
- 正在写入的运行日志和未完成反馈不会进入清单。

质量门禁：

- 新增单元/集成测试与 smoke 全部通过。
- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`、`git diff --check` 通过。
- 对 Feedback 页面做桌面、390×844 移动端和阿拉伯语 RTL 人工视觉检查。
- 安全测试覆盖上传炸弹的大小门限、文件签名伪造、目录穿越、token 缺失/错误、限流和日志脱敏。

## 9. 非目标与后续项

首版不包含：

- 面向公众的反馈列表、状态查询或截图访问。
- 邮件自动回复、工单系统、后台管理 UI、评论往返或反馈状态流转。
- 视频/任意文件上传、自动截屏、后台持续上传日志或跨设备日志合并。
- 把聊天正文、完整对局棋谱、认证信息或用户输入无差别写入诊断日志。
- 多实例共享 artifact 索引。部署多实例前需把文件存储迁移到对象存储/数据库，或保证单写实例与共享一致性。

后续若需要后台工单流，可在不改变已发布反馈提交契约的前提下，为 metadata 增加独立状态投影；不要原地改写用户原始提交和附件。
