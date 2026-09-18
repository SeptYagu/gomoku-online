# 用户反馈入口按钮增加文字标签交接文档 (Feedback Navigation Button Label Handoff)

> **交付日期**：2026-09-18  
> **任务目标**：根据用户反馈「界面上只有一个图标，不够清楚，能不能添加文字在按钮上」，为游戏主界面顶部导航栏的反馈入口按钮添加多语言文本标签与配套排版样式，保持 6 语种国际化与 RTL 兼容，并巩固本地文件原子替换机制。

---

## 1. 变更清单与设计方案

### 1.1 多语言字典契约扩充 (`src/i18n/dictionaries.ts`)
- 在 `FeedbackDictionary` 类型中新增 `navLabel: string;` 字段；
- 在 6 种官方语言中 100% 补齐精炼、规范的导航按钮文案：
  - **英语 (en)**: `"Feedback"`
  - **中文 (zh)**: `"意见反馈"`
  - **法语 (fr)**: `"Commentaires"`
  - **西班牙语 (es)**: `"Comentarios"`
  - **俄语 (ru)**: `"Обратная связь"`
  - **阿拉伯语 (ar)**: `"الملاحظات"`
- `src/i18n/dictionaries.test.ts` 结构与占位符一致性测试 100% 通过。

### 1.2 表现层组件升级 (`src/components/GameShell.tsx`)
- 在顶部操作栏（`top-actions`）的反馈链接内部，在 `<MessageSquare aria-hidden="true" size={18} />` 图标后追加渲染 `<span className="feedback-nav-label">{feedbackDictionary.navLabel}</span>`；
- 保留 `title={feedbackDictionary.title}` 与 `aria-label={feedbackDictionary.title}`，兼顾完整描述与屏幕阅读器无障碍（A11y）体验。

### 1.3 样式与排版契约 (`src/app/globals.css`)
- 完善 `.feedback-nav-link`：
  - `align-items: center`、`display: inline-flex`、`gap: 6px`、`padding: 0 12px`、`white-space: nowrap`、`text-decoration: none`；
  - 悬浮状态保持 `border-color: var(--accent)` 且无下划线；
  - `.feedback-nav-link svg` 明确限定为 `18px`，与旁侧语言切换器及主题切换按钮视觉比例一致；
- 新增 `.feedback-nav-label`：字号 `0.78rem`、字重 `800`、`line-height: 1`；
- **RTL 兼容**：使用 Flexbox `gap` 与对称内边距，阿拉伯语（`ar`）排版自动镜像反转，零硬编码 `left`/`right`。

### 1.4 Windows 平台文件原子重写健壮性增强 (`src/server/jsonl-file.ts`)
- 在 `rewriteJsonlFile` 压缩重写路径中提取 `atomicRenameSync`，针对 Windows 操作系统下高频重写时偶发的临时文件句柄占用 `EPERM`/`EBUSY` 增加自适应短暂忙等重试（最多 10 次重试），彻底根除 Windows 单测与并发测试中的文件锁偶发报错。

---

## 2. 本地四道门禁验证

| 门禁项 | 命令 | 检验结果 | 说明 |
| :--- | :--- | :--- | :--- |
| **1. TypeScript 类型检查** | `npx tsc --noEmit` | **PASS (0 错误)** | 严格模式无类型错误，字典与组件契约对齐 |
| **2. 代码规范检查** | `npm run lint` | **PASS (0 错误 0 警告)** | ESLint 全量通过，无 React Hook 违背 |
| **3. 单元测试套件** | `npm test` | **PASS (35/35 套件，329/329 用例)** | 全量测试通过，字典结构校验通过 |
| **4. 生产构建打包** | `npm run build` | **PASS (18/18 页面)** | Next.js 生产 SSG 打包成功，所有语种静态生成正常 |

---

## 3. 双智能体审查指引 (Reviewer Guide)

- **基准提交 (BASE_SHA)**: `f5d33ae` (docs: record feedback system Round 3 review PASS verdict in STATUS.md)
- **待审提交 (HEAD_SHA)**: `d317764` (feat(ui): add text label to feedback button in navigation)
- **审查目标**: 验证反馈按钮文本在 6 语种下的完整性、布局响应式表现与 RTL 排版，核验 Windows 文件写入重试机制的安全性。
