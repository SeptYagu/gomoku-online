# 多语言与主题模块逻辑

更新日期：2026-06-23

## 参考来源

- `sen-ltd/gomoku-ai`：MIT，可参考翻译字典函数和 dark class 切换。
- 当前产品要求：默认英语，联合国六种官方语言，浅色/黑暗模式切换。

## 学到的逻辑

`sen-ltd/gomoku-ai` 提供了一个很轻量的模式：

- 用字典保存各语言 UI 文案。
- `t(lang, key)` 做回退。
- 语言切换后统一调用 UI 更新。
- 主题切换用 body class 控制。
- 棋盘绘制时根据 dark 状态选择不同颜色。

这个模式适合小项目，但我们要扩展：

- 语言不是两个，而是六个。
- 需要路由级语言前缀。
- 需要 SEO `hreflang`。
- 阿拉伯语需要 RTL。
- 主题需要持久化并避免首屏闪烁。

## 我们要采用的设计

语言：

- 默认语言：`en`。
- 支持：`en`、`zh`、`fr`、`es`、`ru`、`ar`。
- 根路径 `/` 默认进入英语版本，或重定向到 `/en`。
- 页面结构使用 `src/app/[locale]/...`。
- 翻译文件按模块拆分：
  - `game`
  - `navigation`
  - `rooms`
  - `leaderboard`
  - `settings`
  - `legal`
  - `seo`

RTL：

- `ar` 设置 `dir="rtl"`。
- 棋盘组件不镜像。
- 工具栏、面板、表格、弹窗要适配 RTL。
- 数字和棋盘坐标保持清晰，不因文字方向造成误解。

SEO：

- 每个可索引页面都要生成六种语言版本。
- 生成 `hreflang` alternate。
- 每种语言有正确 canonical。
- sitemap 按语言输出或包含语言 alternate。

主题：

- 使用 CSS variables。
- `data-theme="light"` / `data-theme="dark"` 控制主题。
- 默认跟随 `prefers-color-scheme`。
- 用户选择写入 localStorage 和 cookie。
- 首屏用内联脚本或服务端 cookie 避免闪烁。

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

## 验收清单

- `/en`、`/zh`、`/fr`、`/es`、`/ru`、`/ar` 都能进入游戏。
- `/` 默认英语。
- 语言切换后路径、`lang`、`dir` 正确。
- 阿拉伯语下布局不溢出。
- 浅色和黑暗模式都能完整对局。
- 刷新后保留语言和主题。
- 游戏状态、按钮、错误提示不出现硬编码英文。

## MIT 署名要求

如果迁移 `sen-ltd/gomoku-ai` 的 i18n 或主题代码，需要保留：

- 项目名：`gomoku-ai`
- 作者：SEN LLC / SEN 合同会社
- 许可证：MIT
- 来源：https://github.com/sen-ltd/gomoku-ai

## 不复制边界

- 可以参考轻量字典模式，但最终要用本项目的模块化字典和 Next 路由方案重写。
