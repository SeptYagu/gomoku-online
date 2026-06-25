# Gomoku Online

五子棋在线对弈网站。目标是先做一个打开即玩的轻量对弈体验，再逐步加入好友房、随机匹配、排行榜、SEO 内容和广告变现。

默认语言为 English，并必须支持联合国六种官方语言：English、中文、Français、Español、Русский、العربية。网站也必须支持浅色/黑暗模式切换。

## 当前状态

阶段 0 已启动：

- Next.js + React + TypeScript 项目骨架。
- 15x15 棋盘首屏。
- 本地双人落子原型。
- 普通五子棋规则模块。
- 基础单元测试。
- 开源复用评估文档。

下一轮基础要求：

- 默认英语和六种语言路由/字典。
- 阿拉伯语 RTL 布局支持。
- 浅色/黑暗模式切换和持久化。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://127.0.0.1:3000
```

## 验证命令

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

## 项目文档

- `WEBSITE_BUILD_PLAN.md`：总体搭建计划。
- `docs/REUSE_EVALUATION.md`：可复用项目评估和许可证边界。
- `docs/STAGE_0_REPORT.md`：阶段 0 执行报告。
- `docs/STANDARD_RESEARCH_WORKFLOW.md`：以后参考项目研究和子代理分工的标准流程。
- `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`：主控、实现子代理、验证子代理的标准开发流程。
- `docs/HANDOFF.md`：当前任务交接文档，方便新窗口接手。
- `docs/logic/`：按模块记录从参考项目提取出的实现逻辑。

## 复用原则

- 商业发布优先，不把 GPL/AGPL 引擎、WASM、权重或数据库资产打包进前端。
- 当前人机引擎为项目内自写 TypeScript 实现，可继续闭源商用；最高档保留更深搜索、更高节点预算和更深分层开局库，但不引入 GPL 外部引擎。
- 无明确许可证的项目只参考产品路径、架构和事件设计，不复制代码。
- MIT 许可项目可迁移/改写代码，但需要保留许可证和署名。
- APK 仅作为体验参考，不进入源码仓库。
