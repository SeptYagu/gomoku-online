# 多语言与主题模块逻辑

更新日期：2026-06-23

## 参考来源

- `sen-ltd/gomoku-ai`：MIT，可参考翻译字典函数和 dark class 切换。
- 当前产品要求：默认英语，联合国六种官方语言，浅色/黑暗模式切换。

## 关键文件和证据

参考项目：

- `.research/sen-ltd-gomoku-ai/src/i18n.js:5-60`：`translations` 与 `t(lang,key)`。
- `.research/sen-ltd-gomoku-ai/src/main.js:18-19`：`lang` 和 `dark` 状态。
- `.research/sen-ltd-gomoku-ai/src/main.js:61-69`：canvas 颜色常量和 dark 分支。
- `.research/sen-ltd-gomoku-ai/src/main.js:67-134`：canvas 绘制。
- `.research/sen-ltd-gomoku-ai/src/main.js:164-181`：`updateUI`。
- `.research/sen-ltd-gomoku-ai/src/main.js:354-364`：语言/主题按钮切换。
- `.research/sen-ltd-gomoku-ai/style.css:4-14`：浅色 CSS variables。
- `.research/sen-ltd-gomoku-ai/style.css:16-25`：`body.dark` 覆盖变量。
- `.research/sen-ltd-gomoku-ai/index.html:2`：`html lang="ja"`。
- `.research/sen-ltd-gomoku-ai/index.html:10-15`：语言和主题按钮。

本项目当前差距：

- `src/app/layout.tsx:4`：metadata 静态，`html lang="zh-CN"`。
- `src/components/GameShell.tsx:73`：UI 文案硬编码中文。
- `src/components/GomokuBoard.tsx:13`：aria 文案硬编码英文。
- `src/app/globals.css:1`：只有浅色变量，无 `data-theme`/dark 分支。

项目要求：

- `WEBSITE_BUILD_PLAN.md:70-85`：默认英语 + 六语言 + RTL。
- `WEBSITE_BUILD_PLAN.md:87-94`：浅色/黑暗模式。
- `WEBSITE_BUILD_PLAN.md:414-435`：SEO、`hreflang`、sitemap。
- `docs/REUSE_EVALUATION.md:178-181`：默认英语、六语言、RTL、主题 token。

## sen-ltd i18n 逻辑

`translations`：

- 顶层只有 `ja` 和 `en`。
- 值既有字符串，也有函数型 key，例如 `moveN(n)`。

`t(lang,key,...args)`：

- 先取 `translations[lang]?.[key]`。
- 缺失时回退 `translations.en[key]`。
- 如果值是函数，传入 args 执行。
- 如果英语也缺失，返回 key 本身。

特点：

- key 级英语 fallback。
- 不做 locale 规范化。
- 不记录缺失 key。
- 不区分 UI/SEO/legal 字典。

`updateUI()` 覆盖：

- `document.title`
- 页面标题。
- 新游戏按钮。
- 悔棋按钮。
- 语言按钮。
- 主题按钮。
- 难度和颜色 label。
- select option。
- 历史标题。
- 调用 `updateStatus()` 和 `renderHistory()`。

不足：

- 不更新 `<html lang>`。
- 不更新 `dir`。
- 不更新 meta description。
- 不更新 canonical / hreflang。
- 不更新 aria-label。
- `updateStatus()` 在 gameOver 时直接 return，语言切换后已结束结果不会重新翻译。

语言按钮：

- 二态切换：`ja <-> en`。
- 不改 URL。
- 不持久化。
- 不写 cookie/localStorage。

## sen-ltd dark 逻辑

CSS：

- `:root` 定义浅色变量。
- `body.dark` 覆盖 `--bg`、`--surface`、`--border`、`--text`、`--text-muted`、`--accent`、`--accent-dk`、`--shadow`。
- body、header、按钮、select、状态、历史、canvas 阴影通过 CSS variables 变化。

Canvas：

- 棋盘内部颜色不读 CSS variables。
- `main.js` 使用 `dark` 布尔值选择 `BOARD_COLOR_LIGHT/DARK` 和 `LINE_COLOR_LIGHT/DARK`。
- 切主题时调用 `draw()` 重绘。

风险：

- body class 与 JS `dark` 是双源状态。
- SSR 或持久化后可能出现页面 chrome 和 canvas 主题不同步。
- 星位、棋子、胜线、最后一步大多固定色，对比度未系统化。

## 当前实现不足

参考项目不足：

- 只有日英。
- 默认日语，不符合本项目默认 English。
- 无路由级 locale。
- 无持久化。
- 无 RTL。
- 无 SEO i18n。

本项目不足：

- 还没有 `/en`、`/zh`、`/fr`、`/es`、`/ru`、`/ar`。
- 根 layout 仍是 `zh-CN`。
- UI 文案硬编码。
- aria 文案中英文混杂。
- CSS 没有 dark token。
- 没有语言/主题 cookie。

## 本项目采用方案

### 路由结构

使用 Next App Router：

- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/page.tsx`
- 后续内容页都放在 `[locale]` 下。
- 根 `/` 重定向到 `/en`。
- 非法 locale `notFound()`。

配置：

```ts
export const locales = ["en", "zh", "fr", "es", "ru", "ar"] as const;
export const defaultLocale = "en";
export const rtlLocales = ["ar"] as const;
```

### 字典拆分

目录建议：

```text
src/i18n/dictionaries/{locale}/game.ts
src/i18n/dictionaries/{locale}/navigation.ts
src/i18n/dictionaries/{locale}/rooms.ts
src/i18n/dictionaries/{locale}/leaderboard.ts
src/i18n/dictionaries/{locale}/settings.ts
src/i18n/dictionaries/{locale}/legal.ts
src/i18n/dictionaries/{locale}/seo.ts
```

策略：

- 英语主字典是 schema。
- 其他语言 `satisfies typeof en`。
- 缺失 key 开发期报错或测试失败。
- 运行时可回退英语，但 SEO/legal 不允许静默缺失。

### RTL

`[locale]/layout` 设置：

- `<html lang={locale}>`
- `dir={locale === "ar" ? "rtl" : "ltr"}`

CSS：

- 使用 `padding-inline`。
- 使用 `margin-inline`。
- 使用 `border-inline`。
- 避免只写 left/right。

棋盘：

- 不随 RTL 镜像。
- 坐标和落子逻辑保持标准。
- 工具栏、面板、表格、弹窗适配 RTL。

### 主题

使用 CSS variables + `data-theme`：

- `data-theme="light"`
- `data-theme="dark"`

主题选择：

- `system`
- `light`
- `dark`

持久化：

- localStorage 保存用户偏好。
- cookie 同步主题和语言。
- 服务端 layout 读取 cookie 输出初始 `data-theme`。
- 无 cookie 时用短 inline script 读 localStorage / `prefers-color-scheme`，避免闪烁。

主题 token：

- `--bg`
- `--ink`
- `--muted`
- `--panel`
- `--line`
- `--accent`
- `--board`
- `--board-line`
- `--black-stone`
- `--white-stone`
- `--last-move`
- `--win-line`
- `--ad-surface`

### SEO

每个可索引页面：

- `generateMetadata` 基于 locale 字典生成。
- `title`
- `description`
- `canonical`
- `alternates.languages`
- Open Graph。
- Twitter card。

Sitemap：

- `src/app/sitemap.ts`
- 生成所有内容页 × 六语言 URL。
- 包含 localized alternates。

## 六语言覆盖清单

UI：

- 全局导航。
- 语言菜单。
- 主题切换。
- 游戏模式。
- 本地双人/AI/好友房。
- 棋盘 aria。
- 状态文案。
- 胜负/平局。
- 重开。
- 悔棋。
- 错误提示。
- 加载。
- 断线/重连。
- 房间/lobby。
- 匹配。
- 排行榜。
- 账号入口。
- 设置。
- 广告占位。

SEO：

- 主页。
- Gomoku rules。
- Five in a row online。
- 五子棋技巧。
- 活三/冲四/活四/双三/双四。
- Renju 禁手。
- Swap2。
- 五子棋和围棋区别。
- AI 难度说明。
- FAQ。
- Open Graph/Twitter/结构化数据。

Legal/compliance：

- 隐私政策。
- 服务条款。
- Cookie 说明。
- 广告/AdSense 说明。
- 分析统计说明。
- 个性化广告退出说明。
- 联系/关于页面。

语言：

- `en`
- `zh`
- `fr`
- `es`
- `ru`
- `ar`

英语是默认主版本，其余语言不能只是空壳。

## 实现任务清单

- 新建 `src/i18n/config.ts`。
- 建立 `[locale]` 路由。
- 根路径重定向 `/en`。
- 移动当前 page/layout 到 `[locale]`。
- 建立模块化字典。
- 消除 GameShell/GomokuBoard 硬编码文案。
- 实现语言切换。
- 实现主题切换。
- CSS 改为 `data-theme` token。
- 阿拉伯语 RTL 检查。
- `generateMetadata` 输出 alternates。
- sitemap 输出六语言 alternate。

## 测试清单

- `/` 进入英语。
- 六种语言页面都能打开。
- 非法 locale 404。
- `html lang` 正确。
- 阿拉伯语 `dir=rtl`。
- 棋盘不镜像。
- 刷新后语言和主题保留。
- 系统 dark 下默认 dark。
- 用户选择覆盖系统偏好。
- 无首屏主题闪烁。
- 字典 key 完整。
- `hreflang` 正确。

## 许可证边界

`sen-ltd/gomoku-ai` 是 MIT：

- 项目名：`gomoku-ai`
- 作者：SEN LLC / SEN 合同会社
- 来源：https://github.com/sen-ltd/gomoku-ai

如果复制或改写实质代码片段，需要保留版权声明和 MIT 许可文本。若只是参考模式，模块文档保留来源即可。
