# Gomoku Online

五子棋在线对弈网站。目标是先做一个打开即玩的轻量对弈体验，再逐步加入好友房、随机匹配、排行榜、SEO 内容和广告变现。

## 当前状态

阶段 0 已启动：

- Next.js + React + TypeScript 项目骨架。
- 15x15 棋盘首屏。
- 本地双人落子原型。
- 普通五子棋规则模块。
- 基础单元测试。
- 开源复用评估文档。

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

## 复用原则

- 无明确许可证的项目只参考产品路径、架构和事件设计，不复制代码。
- MIT 许可项目可迁移/改写代码，但需要保留许可证和署名。
- APK 仅作为体验参考，不进入源码仓库。
