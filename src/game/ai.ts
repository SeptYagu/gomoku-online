/**
 * ai.ts - 五子棋 AI 启发式引擎 Facade 门面层
 *
 * 聚合底层三个纯函数领域模块并保持向后 100% 零破坏兼容：
 * - ai-evaluator: 棋盘静态评估、威胁分析、Zobrist 散列与棋型评分
 * - ai-search: α-β 剪枝极小极大搜索核心、置换表与战术延伸
 * - ai-scheduler: 难度策略调度、开局库加权匹配与 VCF/VCT 威胁搜索
 */

export {
  evaluateBoard,
  scoreAiMove,
  getThreatSummaryAfterMove,
  type ThreatSummary
} from "./ai-evaluator";

export {
  chooseAiMove,
  chooseAiMoveResult,
  getAiTimeLimitMs,
  getAiWorkerCount,
  type AiDifficulty,
  type AiRootCandidateShard,
  type AiMoveSource,
  type AiMoveResult,
  type ChooseAiMoveOptions
} from "./ai-scheduler";
