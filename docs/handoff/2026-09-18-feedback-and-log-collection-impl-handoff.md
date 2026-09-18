# 用户反馈系统 (Feedback) 源码实现与待审交付

- **交付日期**：2026-09-18
- **责任主体**：主开发智能体（Antigravity）
- **对应方案**：[`docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md`](../FEEDBACK_AND_LOG_COLLECTION_PLAN.md)
- **阶段目标**：落实用户针对反馈收集的最新决策，开发极简、扁平落盘、免注册、零外部重型依赖的 Feedback 页面与后端存储。

---

## 1. 核心需求与实现原则

根据用户最新决策与此前需求审查结论：
1. **扁平化存储**：彻底取消原多层年月嵌套子目录，所有反馈报告存放在服务器本地单一 `data/feedback/` 目录下；
2. **时间戳与 ID 命名**：每份文件严格以 `${YYYYMMDD-HHmmss}-${feedbackId}.json` 命名，时间戳基于 UTC 时区 14 位紧凑格式，文件名按字母正序天然等价于提交时间正序；
3. **首版纯文本 JSON**：取消图片/截图上传支持，接口从 `multipart/form-data` 切换为标准的 `application/json`（上限 64 KiB），零外部重型原生依赖（如 sharp/jimp），从根源杜绝 EXIF/GPS 隐私泄露；
4. **免注册与隐私隔离**：用户无需注册登录即可匿名提交，可选填写联系邮箱；`.gitignore` 严格忽略 `data/feedback/`，防范任何用户反馈数据进入版本库；
5. **多语言与 RTL / 深色模式**：6 种官方语言（en, zh, fr, es, ru, ar）100% 支持，阿拉伯语 RTL 排版镜像适配，完全兼容 27 项主题 CSS 变量（零闪烁）。

---

## 2. 变更文件与模块清单

| 文件路径 | 变更类型 | 说明 |
| :--- | :--- | :--- |
| `docs/FEEDBACK_AND_LOG_COLLECTION_PLAN.md` | 修改 | 将扁平存储、纯文本、原子落盘、接口契约固化为正式方案规范 |
| `.gitignore` | 修改 | 追加 `data/feedback/`，物理隔离用户反馈落盘文件 |
| `src/server/feedback-store.ts` | **新建** | `FeedbackStore` 核心实现：原子写入（`.tmp-*` -> `renameSync`）、UTC 紧凑时间戳命名、输入校验（1~5000字、邮箱长度与格式）、安全目录自建与坏文件容忍 |
| `src/server/feedback-store.test.ts` | **新建** | 8 项全方位单元测试（覆盖单文件扁平命名、无子目录、邮箱为空/非法、超长截断、原子写入零残留、坏文件跳过等） |
| `src/server/room-store.ts` | 修改 | 实例化并导出全局单例 `feedbackStore` |
| `src/server/online-server.ts` | 修改 | 挂载 `feedbackLimiter`（10分钟5次限流）、注册 `POST /api/feedback`（64 KiB 请求体流式读取与限制、400/405/429/201 契约处理） |
| `src/i18n/dictionaries.ts` | 修改 | 新增 `FeedbackDictionary` 类型，并在 en/zh/fr/es/ru/ar 全部 6 种语言中 100% 补齐字段 |
| `src/app/[locale]/feedback/page.tsx` | **新建** | `/{locale}/feedback` 动态路由，支持 `generateStaticParams()` SSG 预渲染 |
| `src/app/(root)/feedback/page.tsx` | **新建** | `/feedback` 根路径动态重定向（基于 cookie/defaultLocale） |
| `src/components/feedback/FeedbackPage.tsx` | **新建** | 反馈表单与提交回执客户端组件（实时字符计数、提交状态、错误横幅、反馈编号展示与复制、返回对局） |
| `src/app/globals.css` | 修改 | 补齐反馈页面样式（`.feedback-page-shell`, `.feedback-card`, `.feedback-form`, RTL 镜像图标与暗色模式变量） |
| `src/components/GameShell.tsx` | 修改 | 在顶部操作栏（`top-actions`）与页脚版本号区挂载反馈入口链接 |
| `src/app/[locale]/page.tsx` | 修改 | 向 `GameShell` 透传 `feedbackDictionary` |
| `tools/smoke-feedback.ts` | **新建** | 反馈接口自动化冒烟脚本（校验 201 成功、400 空消息拦截、400 邮箱格式拦截、405 方法拦截） |
| `package.json` | 修改 | 增加 `"smoke:feedback": "tsx tools/smoke-feedback.ts"` 脚本 |

---

## 3. 本地门禁验证情况

四道本地门禁按序执行，**全绿通过**：

1. `npx tsc --noEmit`：**0 错误**（严格类型检查无报错）。
2. `npm run lint`：**0 错误 0 警告**（ESLint 代码规范全绿）。
3. `npm test`：**34 套测试 / 314 项用例 100% 全部通过**（包含 `feedback-store.test.ts` 8 项测试以及全仓所有原有测试）。
4. `npm run build`：**打包预渲染 100% 成功**（18/18 静态页面生成，包含 `● /[locale]/feedback` 全部 6 语种 SSG 预渲染，零 Bailout）。
5. `npm run smoke:feedback http://127.0.0.1:3000`：**4/4 自动化烟测通过**，实测在 `data/feedback/` 生成合规命名的 JSON 报告且 `.gitignore` 保护生效。

---

## 4. 后续步骤

1. 提交并推送至 `origin/main`（Push for Review）；
2. 依据 `AGENTS.md` 触发 WorkBuddy 独立代码审查（Round 1）。
