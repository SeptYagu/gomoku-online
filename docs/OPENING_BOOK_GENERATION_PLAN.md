# 强开局库生成计划

更新日期：2026-06-25

## 目标

为人机模式生成一个可长期维护的强开局库：

- 覆盖标准 26 开局。
- 每个开局至少 3 个变体。
- 目标深度 16 手。
- 单步推演预算 10 秒。
- 原始产物使用 SGF，不自定义棋谱语法。
- 最终进入游戏的运行时开局库必须精简、加权、可回溯。

## 格式约定

主格式使用 SGF：

- `GM[4]`：Gomoku/Renju。
- `SZ[15]`：15 路棋盘。
- `B[..]` / `W[..]`：黑白棋步。
- `C[..]`：记录推演参数、来源、停止原因、权重候选说明。

不要把项目自定义 JSON 或临时坐标串作为正式棋谱格式。JSON 只用于报告、调试、统计。

可选兼容格式：

- `.pos`：以后需要和 Yixin-Board、Gomocup 周边工具互通时再导出。
- `.json`：只作为分析报告，不作为开局库源格式。

## 目录约定

正式生成的原始开局库放这里：

```text
data/openings/generated/
```

建议文件名：

```text
data/openings/generated/standard-26-insane-16ply-10s-v3.sgf
```

精选后进入游戏运行时的数据放这里：

```text
src/game/opening-book.ts
```

临时测试结果仍放这里，不作为长期资产：

```text
.arena-results/
```

## 生成命令

完整目标版本：

```bash
npm run opening-book -- --plies 16 --time-limit-ms 10000 --variants 3 --output data/openings/generated/standard-26-insane-16ply-10s-v3.sgf
```

预计耗时：

- 标准 26 开局。
- 每个开局 3 个变体。
- 每条线初始 3 手，推到 16 手，需要引擎补 13 手。
- 总调用数：`26 * 3 * 13 = 1014` 次。
- 理论最坏耗时：`1014 * 10s = 10140s`，约 2.8 小时。
- 实际耗时可能约 1.5 到 3 小时，取决于开局命中、战术提前返回和机器性能。

先做小样本冒烟：

```bash
npm run opening-book -- --limit 2 --plies 8 --time-limit-ms 1000 --variants 3 --output .arena-results/opening-book-smoke-v3.sgf
```

中等规模预跑：

```bash
npm run opening-book -- --limit 26 --plies 12 --time-limit-ms 3000 --variants 3 --output .arena-results/standard-26-insane-12ply-3s-v3.sgf
```

## 生成前检查

生成前确认：

- `git status --short --branch` 干净。
- `npm test` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- 当前电脑可以接受长时间满载运行。

建议关闭不必要的浏览器、游戏和视频软件，避免长时间推演受系统调度影响。

## 验收标准

SGF 文件生成后，先做结构检查：

- 至少 78 条 game tree：`26 openings * 3 variants`。
- 每条目标线应达到 16 手。
- 每条线的前三手符合标准 26 开局 seed。
- 没有非法落子。
- 没有重复占点。
- `GM[4]`、`SZ[15]`、`CA[UTF-8]` 存在。

棋力筛选：

- 用 arena 让生成库版本对旧库版本做对战。
- 至少跑 100 局快速预算样本。
- 再跑 20 到 40 局较高预算样本。
- 记录胜方开局线，统计变体胜率。
- 剔除明显导致快速失败的线。

推荐快速样本：

```bash
npm run arena -- --games 100 --candidate current-parallel --baseline 09ea4e5 --difficulty insane --random-openings 2 --time-limit-ms 250 --output .arena-results/opening-book-candidate-fast.json
```

推荐较高预算样本：

```bash
npm run arena -- --games 40 --candidate current-parallel --baseline 09ea4e5 --difficulty insane --random-openings 2 --time-limit-ms 1000 --output .arena-results/opening-book-candidate-1s.json
```

## 精选和回灌流程

1. 生成完整 SGF。
2. 解析 SGF，统计每条线：
   - opening id。
   - variant id。
   - 前 8 手 key。
   - 前 16 手 key。
   - 自战胜率。
   - 执黑胜率。
   - 执白胜率。
   - 平均手数。
3. 将表现差的线降权或移除。
4. 将表现稳定的线转成 `src/game/opening-book.ts`。
5. 给每条运行时线写入：
   - `id`。
   - `name`。
   - `minDifficulty`。
   - `weight`。
   - `moves`。
   - `sourceSgf`。
   - `sourceGeneratedAt`。
6. 跑 `npm test`、`npm run lint`、`npm run build`。
7. 跑真实浏览器点击验证。
8. 代码和文档改动再提交推送。

## 运行时策略

运行时不直接加载庞大的 SGF 文件。SGF 是原始资料和可回溯资产。

游戏实际使用：

- `src/game/opening-book.ts` 中的精选 TypeScript 数据。
- normal 使用浅层、较随机的安全线。
- hard 使用 4 到 6 手库。
- expert 使用 8 到 12 手库。
- insane 使用 16 手以内的精选强线。

选择策略：

- 先收集所有合法候选。
- 优先当前可用的最高难度层。
- 同层按权重随机。
- 每局使用 `openingSeed`，同一局内稳定，不同新局变化。

## 风险和注意事项

- 五子棋无禁手规则下黑方天然强，开局库不要只追求黑胜，否则玩家执白体验会很差。
- 强库不能让每局都进入同一路线，至少要保留每个标准开局 3 个变体。
- 生成脚本输出是研究资产，不能未经筛选直接塞进运行时。
- 如果后续引入第三方开局库，必须先确认许可证能商业使用。
- `.arena-results/` 被忽略，不要把正式资产只放在那里。

## 当前可用脚本

- `tools/generate-opening-book.ts`：生成 SGF 开局推演。
- `tools/engine-arena.ts`：新旧引擎/开局库对战评测。

当前脚本已经支持：

- `--plies`
- `--time-limit-ms`
- `--variants`
- `--limit`
- `--seed`
- `--output`

后续需要补的脚本：

- SGF 结构校验脚本。
- SGF 转 `src/game/opening-book.ts` 的精选转换脚本。
- arena 报告回灌权重脚本。
