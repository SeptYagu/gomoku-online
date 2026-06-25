时间编号：20260625-014339
任务 ID：20260625-stage1-interaction-hotfix
代理角色：实现子代理
agent id：GPT-5 Codex
昵称：Iris
状态：完成
写入范围：src/components/**、src/app/globals.css、docs/subagents/20260625-stage1-interaction-hotfix-实现-Iris.md

## 排查结论

- 复现到 3000 dev 旧进程下按钮命中但点击后状态不变，同时 HMR WebSocket 握手报错；该进程疑似处在旧 dev server/热更新异常状态。
- `.next-dev.err.log` 里有 hydration mismatch 和 Fast Refresh full reload 记录，主要差异来自浏览器扩展向 `html/body` 与 lucide SVG 注入 `data-darkreader-*`、内联 style 等属性。
- 生产服务 `http://127.0.0.1:3001/zh` 下验证修复后没有 runtime exception 或 hydration exception；控制台只剩 favicon/static resource 404。
- `mode-pill` 可被 `elementFromPoint` 命中为 `BUTTON`，非 disabled。
- `board-point` 滚动到可视区后可被 `elementFromPoint` 命中为 `BUTTON`，非 disabled。
- 未发现已有 overlay 覆盖棋盘；主要交互风险来自 SVG hydration 噪音、按钮文字/伪元素命中不够明确、触控目标缺少显式 pointer/touch 约束。

## 修复内容

- 移除核心交互区的 lucide SVG 图标渲染，改为稳定的文本/ASCII 标识，减少浏览器扩展改写 SVG 后导致 hydration mismatch 的表面积。
- 为模式按钮、顶部按钮、语言切换、棋盘容器和棋盘点位补充明确的 `position`、`z-index`、`touch-action`、`cursor` 规则。
- 扩大 `.board-point::before` 的可视 hover 热区，并设置 `pointer-events: none`，避免伪元素参与命中。
- 设置 `.icon-button > span`、`.mode-icon`、`.locale-icon` 不接管 pointer 命中，让点击冒泡路径更稳定。

## 真实浏览器验证

使用本机 Chrome headless + DevTools Protocol，不新增依赖，不修改 `package.json`。

- 本地双人：
  - 第 8 行第 8 列命中 `BUTTON.board-point`，`disabled=false`。
  - 点击后 stones 0 -> 1，disabledPoints 0 -> 1，状态变为白棋回合。
- 悔棋：
  - 点击悔棋后 stones 1 -> 0，disabledPoints 1 -> 0，状态回到黑棋回合。
- AI Easy：
  - 点击 AI 后 active 变为 `AI人机`，难度条出现，Easy active。
  - 点击棋盘后 stones 0 -> 2，表示玩家黑棋与 AI 白棋均完成。
- AI Normal：
  - 点击普通后 active 变为 `AI人机` + `普通`，棋盘重置。
  - 点击棋盘后 stones 0 -> 2。
- 重开：
  - AI 模式落子后点击新开一局，stones 回到 0，disabledPoints 回到 0。

## 必跑命令

- `npm test`：通过，2 个测试文件，21 个测试。
- `npm run lint`：通过。
- `npm run build`：通过。
- `git diff --check`：通过；仅有 Git 的 LF/CRLF 工作副本提示。

## 修改文件

- `src/components/GameShell.tsx`
- `src/components/LocaleSwitcher.tsx`
- `src/components/ThemeToggle.tsx`
- `src/app/globals.css`
- `docs/subagents/20260625-stage1-interaction-hotfix-实现-Iris.md`

## 未覆盖项

- 没有修改 `next-env.d.ts`、`package.json`、`package-lock.json` 或既有报告/流程文档。
- 3000 上已有 Next dev 旧进程，且 Next 16 阻止同项目第二个 dev 实例；最终真实点击验证使用的是已构建后的生产服务 3001。
- 控制台剩余的 404 未定位到核心交互阻断，未在本切片处理。
