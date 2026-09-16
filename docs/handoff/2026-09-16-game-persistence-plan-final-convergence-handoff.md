# 对局持久化与语言平滑切换方案 Round 3 审查收敛与最终定稿交接单

- **交接日期**：2026-09-16
- **对应审查**：WorkBuddy Round 3 独立终审（提交 `df868b9`，交接单 [`2026-09-16-workbuddy-code-review-round3-handoff.md`](2026-09-16-workbuddy-code-review-round3-handoff.md)）
- **终审判定与指标**：0×P0 / 0×P1 / 0×P2 / **2×P3**（无任何阻断性或中高级缺陷，核心架构 100% 收敛）
- **核心闭环文件**：[`docs/GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md`](../GAME_PERSISTENCE_AND_LOCALE_SWITCHING_PLAN.md)
- **交付类型**：**方案设计审查最终收敛定稿（Design Review Convergence & Final Sign-Off）**。

---

## 1. Round 3 审查缺陷一次性闭环证明

### 1.1 P3-1 闭环：§4.1 兜底 CSS 声明集对齐权威暗色变量
- **审查发现**：§4.1 伪代码代码块包含 8 项非本仓变量名（`--card` 等），且缺失 `color-scheme` 与本仓特有的 `--ink`、`--board` 等关键主题变量；在无属性过渡间隙会导致暗底深字（对比度 1.14:1）。
- **定稿闭环**：
  - §4.1 代码块直接以 `src/app/globals.css:35-67` 权威 `:root[data-theme="dark"]` 声明集为唯一真源，包含 `color-scheme: dark`、`--ink: #edf2f7`、`--board: #9f6b36` 等全部 27 项权威属性；
  - 彻底剔除未经定义的外部变量名，确保即便在微秒级无属性过渡期，页面对比度与色板亦与真实暗色主题 100% 一致。

### 1.2 P3-2 闭环：工作区写入点补齐 URL 启动与退房路径
- **审查发现**：经分享链接 `?room=ABC` 进房的玩家不触发 `completeModeChange`，退房 `leaveRoom` 后若刷新或切语言，因工作区键未写入会跌落 `local` 单机空盘。
- **定稿闭环**：
  - 在 §3.2 明确将工作区写入点扩展至全生命周期：(a) 显式切模式；(b) URL 启动解析命中 `?room=` 或加房成功时同步写入 `"room"`；(c) 退出房间 `leaveRoom` 时显式写入并保持 `"room"`；
  - §3.4 矩阵 `leaveRoom` 行同步明确为“显式写入并保持 `room`”，确保邀请链接进房的玩家退房后刷新依然稳健停留在联机大厅。

### 1.3 交互点击实时值落地（风险项消除）
- 在 §2.1 阶段 3 明确规定：`<Link onClick>` 时若检测到微秒级查询串差异，通过 `router.push(liveTargetHref)` 实施即时跳转，消灭挂载后查询串变化的极窄边界。

---

## 2. 方案收敛与设计审查终结声明（Rule 11 / Branch C）

依照智能体协作规则 **Rule 11** 与项目 **`AGENTS.md §4.3 分支 C`**：
1. **轮次上限达成**：纯技术方案 / 文档讨论阶段已严格完成 3 轮审查（Round 1 $\rightarrow$ Round 2 $\rightarrow$ Round 3），已达文档审查的法定上限；
2. **架构彻底收敛**：
   - Next.js 16 SSG 静态预渲染零 CSR Bailout；
   - 实例级 `useBootSnapshot` 水合与重挂载安全；
   - 权威主题解析源（`localStorage ?? matchMedia`）与预绘制布局阶段同步回写（`useLayoutEffect` 实测同一提交内生效，180 帧零白屏）；
   - `:root:not([data-theme])` 限定选择器杜绝反向劫持；
   - 纯函数确定性回放与 AI 自愈握手传参契约；
   - 四级启动优先级与工作区持久化防跌落；
3. **审查判定一致**：审查员报告明确指出“方案在架构与技术逻辑层面已收敛，主控可判定方案收敛并直接推进源码实现”。

**结论**：技术设计审查流程正式结束定稿，全流程已无阻塞性架构分歧，全面转入代码实现与自动化测试落地阶段。
