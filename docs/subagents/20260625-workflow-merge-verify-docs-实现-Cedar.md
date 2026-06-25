时间编号：20260625-004639
任务 ID：20260625-workflow-merge-verify-docs
代理角色：实现
agent id：Codex
昵称：Cedar
状态：完成
写入范围：docs/STANDARD_DEVELOPMENT_WORKFLOW.md、docs/STANDARD_RESEARCH_WORKFLOW.md、docs/HANDOFF.md、docs/subagents/README.md、docs/subagents/20260625-workflow-merge-verify-docs-实现-Cedar.md

# 实现报告

## 任务目标

优化项目标准流程，将原先分离的验证执行和验证后文档状态收口职责合并为“独立验证兼记录子代理”。明确该角色可以运行验证、写验证报告、更新验证矩阵、阶段报告和 `docs/HANDOFF.md` 中的验证状态与报告路径；但不能修代码、不能修改实现内容。遇到 blocker 或 major 时，必须写失败报告并要求主控派返工实现子代理，复测仍由验证兼记录子代理完成。

## 实际完成

- 将标准开发流程默认角色更新为“主控 + 研究子代理 + 实现子代理 + 独立验证兼记录子代理”。
- 将派发模板角色枚举更新为 `研究 / 实现 / 验证兼记录 / 返工`。
- 明确验证通过后由验证兼记录子代理按授权更新验证矩阵、阶段报告、`docs/HANDOFF.md` 的验证状态和报告路径。
- 明确验证失败时验证兼记录子代理只记录问题、失败证据和返工建议，不修代码、不修改实现内容。
- 明确 blocker/major 由主控派返工实现子代理处理，返工后仍由验证兼记录子代理复测。
- 同步更新研究流程、子代理报告目录说明和 HANDOFF 中的 Do / Do Not、验证矩阵、报告路径。

## 修改文件

- `docs/STANDARD_DEVELOPMENT_WORKFLOW.md`
- `docs/STANDARD_RESEARCH_WORKFLOW.md`
- `docs/HANDOFF.md`
- `docs/subagents/README.md`
- `docs/subagents/20260625-workflow-merge-verify-docs-实现-Cedar.md`

## 验证结果

- `git diff --check`：通过。仅有 LF/CRLF 工作副本提示，未发现 whitespace error。

## 未覆盖项

- 未运行代码门禁；本任务为文档-only 改动，用户要求的必跑命令是 `git diff --check`。
- 未修改 `docs/STAGE_0_REPORT.md`，因为该文件在本任务禁止修改范围内。

## 交给主控的建议

- 后续派发验证任务时，角色统一写为“验证兼记录”。
- 返工任务必须引用原失败报告路径，复测报告必须同时引用失败报告和返工报告路径。
