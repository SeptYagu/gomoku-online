时间编号：20260625-010043
任务 ID：20260625-stage1-local-ai
代理角色：实现子代理
agent id：GPT-5 Codex
昵称：Ember
状态：完成
写入范围：src/components/**、src/game/**、src/i18n/dictionaries.ts、src/app/globals.css、docs/subagents/20260625-stage1-local-ai-实现-Ember.md

## 任务目标

实现阶段 1 的本地可玩增强切片：本地双人/AI 模式切换、悔棋、Easy/Normal AI 初版、状态流接入新版规则接口，并补齐六语言核心文案。不做 Socket、排行榜、真实广告、Hard AI 或 Worker。

## 实际完成

- 新增 `src/game/ai.ts`：
  - `chooseAiMove` 支持 Easy 和 Normal。
  - Easy：空盘中心、AI 一步胜优先、对手一步胜优先阻挡，否则 nearby 合法候选随机。
  - Normal：同样先胜/先挡，再用连续子、open-end 和中心距离做轻量评分。
  - 所有候选来自规则模块合法落子接口，避免越界或占位落子。
- 新增 `src/game/ai.test.ts`：
  - 覆盖空盘中心、立即取胜、阻挡对手四连、返回合法空位、Normal 倾向更高分点。
- 更新 `src/components/GameShell.tsx`：
  - 支持本地双人和 AI 模式切换。
  - AI 模式玩家执黑、AI 执白。
  - 支持 Easy/Normal 切换。
  - 本地模式悔棋撤销一步，AI 模式优先撤销一组人类+AI 回合。
  - 重开可用。
  - 胜负/平局后不再处理落子。
  - 状态流使用 `getGameResult`，不再在组件内重复手写胜负/满盘判断。
- 更新 `src/i18n/dictionaries.ts`：
  - 六语言补齐悔棋、AI 难度、Easy、Normal、玩家/AI 执子说明。
- 更新 `src/app/globals.css`：
  - 补齐悔棋按钮禁用态、AI 难度按钮行、状态说明和移动端按钮/棋盘约束。

## 修改文件

- `src/game/ai.ts`
- `src/game/ai.test.ts`
- `src/components/GameShell.tsx`
- `src/i18n/dictionaries.ts`
- `src/app/globals.css`
- `docs/subagents/20260625-stage1-local-ai-实现-Ember.md`

## 验证结果

- `npm test`：通过，2 个测试文件，21 个测试用例。
- `npm run lint`：通过。
- `npm run build`：通过。
- `git diff --check`：通过；仅出现工作副本 LF/CRLF 提示。

## 未覆盖项

- 未做真实浏览器点击验收；本任务要求的必须运行命令已完成，UI 仍建议后续由独立验证兼记录子代理覆盖桌面、移动端、六语言和 RTL。
- 未实现 Hard AI、Worker、Socket、排行榜或真实广告，符合本任务禁止范围。
