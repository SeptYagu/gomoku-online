import {
  BOARD_SIZE,
  getGameResult,
  getOpponent,
  isInBounds,
  isValidMove,
  placeStone
} from "./board";
import { GENERATED_OPENING_BOOK_LINES } from "./opening-book";
import type { Board, Move, Point, Stone } from "./types";
import {
  FORK_SCORE,
  WIN_SCORE,
  addStoneHash,
  getBoardCenter,
  getBoardHash,
  getPointKey,
  isInBoundsForSize,
  scoreAiMove,
  scorePointForStone,
  splitMix32,
  type ThreatSummary
} from "./ai-evaluator";
import {
  chooseBestMove,
  chooseSearchMove,
  comparePointsByCenter,
  createSearchDeadline,
  getCandidateMoves,
  hasSearchTimedOut,
  orderCandidateMoves,
  rankCandidateMoves,
  reportBestMove,
  type SearchDeadline,
  type SearchProfile
} from "./ai-search";

export type AiDifficulty = "normal" | "hard" | "expert" | "insane";

export type AiRootCandidateShard = {
  index: number;
  total: number;
};

export type AiMoveSource =
  | "none"
  | "empty-shard"
  | "single"
  | "winning"
  | "blocking"
  | "opening"
  | "forced-threat"
  | "threat-block"
  | "fork"
  | "fork-block"
  | "search";

export type AiMoveResult = {
  point: Point | null;
  score: number;
  completedDepth: number;
  nodes: number;
  source: AiMoveSource;
};

export type ChooseAiMoveOptions = {
  difficulty: AiDifficulty;
  moves?: Move[];
  timeLimitMs?: number;
  onBestMove?: (point: Point) => void;
  rootCandidateShard?: AiRootCandidateShard;
  openingSeed?: number;
};

type ThreatSearchMode = "vcf" | "vct";

type ThreatSearchState = {
  nodes: number;
  deadline: SearchDeadline;
  cache: Map<string, boolean>;
};

type RelativePoint = {
  row: number;
  col: number;
};

type OpeningBookLine = {
  id: string;
  name: string;
  minDifficulty: AiDifficulty;
  weight: number;
  moves: RelativePoint[];
};

type OpeningBookCandidate = {
  point: Point;
  line: OpeningBookLine;
  transformIndex: number;
};

export const SEARCH_PROFILES: Record<AiDifficulty, SearchProfile> = {
  normal: {
    depth: 1,
    rootCandidates: 26,
    branchCandidates: 18,
    maxNodes: 700,
    maxCacheEntries: 1_000,
    tacticalExtensionDepth: 0,
    tacticalCandidates: 0,
    iterativeDeepening: false,
    vcfDepth: 0,
    vctDepth: 0,
    threatSearchCandidates: 0,
    threatSearchNodes: 0
  },
  hard: {
    depth: 4,
    rootCandidates: 20,
    branchCandidates: 10,
    maxNodes: 22_000,
    maxCacheEntries: 24_000,
    tacticalExtensionDepth: 1,
    tacticalCandidates: 8,
    iterativeDeepening: true,
    vcfDepth: 4,
    vctDepth: 5,
    threatSearchCandidates: 8,
    threatSearchNodes: 1_200
  },
  expert: {
    depth: 5,
    rootCandidates: 14,
    branchCandidates: 8,
    maxNodes: 72_000,
    maxCacheEntries: 70_000,
    tacticalExtensionDepth: 1,
    tacticalCandidates: 8,
    iterativeDeepening: true,
    vcfDepth: 6,
    vctDepth: 7,
    threatSearchCandidates: 10,
    threatSearchNodes: 3_600
  },
  insane: {
    depth: 8,
    rootCandidates: 14,
    branchCandidates: 8,
    maxNodes: 750_000,
    maxCacheEntries: 360_000,
    tacticalExtensionDepth: 5,
    tacticalCandidates: 12,
    iterativeDeepening: true,
    vcfDepth: 8,
    vctDepth: 10,
    threatSearchCandidates: 12,
    threatSearchNodes: 12_000
  }
};

export const OPENING_BOOK_PLIES: Record<AiDifficulty, number> = {
  normal: 2,
  hard: 4,
  expert: 6,
  insane: 8
};

export const AI_TIME_LIMIT_MS: Record<AiDifficulty, number> = {
  normal: 1_000,
  hard: 5_000,
  expert: 10_000,
  insane: 30_000
};

export const AI_PARALLEL_WORKERS: Record<AiDifficulty, number> = {
  normal: 1,
  hard: 2,
  expert: 3,
  insane: 4
};

export const DIFFICULTY_RANK: Record<AiDifficulty, number> = {
  normal: 1,
  hard: 2,
  expert: 3,
  insane: 4
};

const OPENING_BOOK_LINES: OpeningBookLine[] = GENERATED_OPENING_BOOK_LINES;

export function chooseAiMove(
  board: Board,
  aiStone: Stone,
  options: ChooseAiMoveOptions
): Point | null {
  return chooseAiMoveResult(board, aiStone, options).point;
}

export function chooseAiMoveResult(
  board: Board,
  aiStone: Stone,
  { difficulty, moves, timeLimitMs, onBestMove, rootCandidateShard, openingSeed }: ChooseAiMoveOptions
): AiMoveResult {
  const profile = SEARCH_PROFILES[difficulty];
  const deadline = createSearchDeadline(getAiTimeLimitMs(difficulty, timeLimitMs));
  const candidatePool = getCandidateMoves(board);
  const candidates = orderCandidateMoves(board, candidatePool, aiStone, aiStone).slice(
    0,
    profile.rootCandidates
  );

  if (candidates.length === 0) {
    return createAiMoveResult(null, Number.NEGATIVE_INFINITY, "none");
  }

  reportBestMove(onBestMove, candidates[0]);

  if (candidates.length === 1) {
    return createAiMoveResult(candidates[0], scoreAiMove(board, candidates[0], aiStone), "single");
  }

  const opponent = getOpponent(aiStone);
  // 必胜/必挡必须在**全量候选池**上判定：候选截断只服务于后续 α-β 搜索的预算控制。
  // 若在截断集里找五连点，结果就会依赖候选排序（中残局空点密集时可能把唯一的
  // 五连点/堵五点挤出截断线），normal 难度 depth=1 无从补救。
  const winningMove = chooseBestMove(board, findWinningMoves(board, candidatePool, aiStone), aiStone);

  if (winningMove) {
    reportBestMove(onBestMove, winningMove);
    return createAiMoveResult(winningMove, WIN_SCORE + scoreAiMove(board, winningMove, aiStone) * 0.001, "winning");
  }

  const blockingMove = chooseBestMove(board, findWinningMoves(board, candidatePool, opponent), aiStone);

  if (blockingMove) {
    reportBestMove(onBestMove, blockingMove);
    return createAiMoveResult(blockingMove, WIN_SCORE - 1_000 + scoreAiMove(board, blockingMove, aiStone) * 0.001, "blocking");
  }

  const bookMove = chooseOpeningBookMove(board, candidatePool, aiStone, difficulty, moves, openingSeed);

  if (bookMove) {
    reportBestMove(onBestMove, bookMove);
    return createAiMoveResult(bookMove, scoreAiMove(board, bookMove, aiStone), "opening");
  }

  const shouldRunFullBoardTactics = !rootCandidateShard || normalizeShardIndex(rootCandidateShard) === 0;
  const boardHash = getBoardHash(board);

  if (shouldRunFullBoardTactics) {
    const forcedThreatMove =
      findForcedThreatMove(board, boardHash, aiStone, profile, "vcf", deadline) ??
      findForcedThreatMove(board, boardHash, aiStone, profile, "vct", deadline);

    if (forcedThreatMove) {
      reportBestMove(onBestMove, forcedThreatMove);
      return createAiMoveResult(
        forcedThreatMove,
        WIN_SCORE - 2_000 + scoreAiMove(board, forcedThreatMove, aiStone) * 0.001,
        "forced-threat"
      );
    }
  }

  if (hasSearchTimedOut(deadline)) {
    return createAiMoveResult(candidates[0], scoreAiMove(board, candidates[0], aiStone), "search");
  }

  if (shouldRunFullBoardTactics) {
    const opponentThreatMove =
      findForcedThreatMove(board, boardHash, opponent, profile, "vcf", deadline) ??
      findForcedThreatMove(board, boardHash, opponent, profile, "vct", deadline);

    if (opponentThreatMove && isValidMove(board, opponentThreatMove)) {
      reportBestMove(onBestMove, opponentThreatMove);
      return createAiMoveResult(
        opponentThreatMove,
        WIN_SCORE - 3_000 + scoreAiMove(board, opponentThreatMove, aiStone) * 0.001,
        "threat-block"
      );
    }
  }

  if (hasSearchTimedOut(deadline)) {
    return createAiMoveResult(candidates[0], scoreAiMove(board, candidates[0], aiStone), "search");
  }

  if (shouldRunFullBoardTactics) {
    const forcingMove = findBestForkMove(board, candidates, aiStone, aiStone);

    if (forcingMove) {
      reportBestMove(onBestMove, forcingMove);
      return createAiMoveResult(
        forcingMove,
        FORK_SCORE + scoreAiMove(board, forcingMove, aiStone) * 0.001,
        "fork"
      );
    }

    const forkBlock = findBestForkMove(board, candidates, opponent, aiStone);

    if (forkBlock) {
      reportBestMove(onBestMove, forkBlock);
      return createAiMoveResult(
        forkBlock,
        FORK_SCORE - 1_000 + scoreAiMove(board, forkBlock, aiStone) * 0.001,
        "fork-block"
      );
    }
  }

  const searchCandidates = shardRootCandidates(candidates, rootCandidateShard);

  if (searchCandidates.length === 0) {
    return createAiMoveResult(null, Number.NEGATIVE_INFINITY, "empty-shard");
  }

  return chooseSearchMove(board, searchCandidates, aiStone, profile, deadline, onBestMove);
}

export function getAiTimeLimitMs(difficulty: AiDifficulty, overrideMs?: number): number {
  if (overrideMs !== undefined) {
    return Math.max(0, Math.floor(overrideMs));
  }

  return AI_TIME_LIMIT_MS[difficulty];
}

export function getAiWorkerCount(difficulty: AiDifficulty, hardwareConcurrency = 1): number {
  const configuredWorkers = AI_PARALLEL_WORKERS[difficulty];
  const normalizedConcurrency = Number.isFinite(hardwareConcurrency) ? Math.max(1, Math.floor(hardwareConcurrency)) : 1;
  const usableWorkers = Math.max(1, normalizedConcurrency - 1);

  return Math.max(1, Math.min(configuredWorkers, usableWorkers));
}

export function createAiMoveResult(
  point: Point | null,
  score: number,
  source: AiMoveSource,
  completedDepth = 0,
  nodes = 0
): AiMoveResult {
  return {
    point,
    score,
    completedDepth,
    nodes,
    source
  };
}

export function shardRootCandidates(candidates: Point[], shard?: AiRootCandidateShard): Point[] {
  if (!shard || shard.total <= 1) {
    return candidates;
  }

  const shardCount = Math.max(1, Math.floor(shard.total));
  const shardIndex = normalizeShardIndex(shard);

  return candidates.filter((_, index) => index % shardCount === shardIndex);
}

export function normalizeShardIndex(shard: AiRootCandidateShard): number {
  const shardCount = Math.max(1, Math.floor(shard.total));
  const rawIndex = Number.isFinite(shard.index) ? Math.floor(shard.index) : 0;

  return ((rawIndex % shardCount) + shardCount) % shardCount;
}

export function chooseOpeningBookMove(
  board: Board,
  candidates: Point[],
  aiStone: Stone,
  difficulty: AiDifficulty,
  moveHistory?: Move[],
  openingSeed = 0
): Point | null {
  const moves = moveHistory ?? getPlacedStones(board);
  const center = getBoardCenter();

  if (moves.length === 0 && isValidMove(board, center)) {
    return center;
  }

  if (
    !moveHistory ||
    getStoneForPly(moves.length) !== aiStone ||
    moves.length >= OPENING_BOOK_PLIES[difficulty]
  ) {
    return null;
  }

  const candidateKeys = new Set(candidates.map((point) => getPointKey(point)));
  const bookCandidates: OpeningBookCandidate[] = [];

  for (const line of OPENING_BOOK_LINES) {
    if (DIFFICULTY_RANK[line.minDifficulty] > DIFFICULTY_RANK[difficulty] || moves.length >= line.moves.length) {
      continue;
    }

    for (let transformIndex = 0; transformIndex < RELATIVE_TRANSFORMS.length; transformIndex += 1) {
      const transform = RELATIVE_TRANSFORMS[transformIndex];
      const bookMove = getBookMoveForPosition(board, line.moves, transform, moves.length);

      if (!bookMove) {
        continue;
      }

      if (candidateKeys.has(getPointKey(bookMove)) && isValidMove(board, bookMove)) {
        bookCandidates.push({
          point: bookMove,
          line,
          transformIndex
        });
      }
    }
  }

  return chooseWeightedOpeningCandidate(bookCandidates, difficulty, moves, aiStone, openingSeed);
}

export function chooseWeightedOpeningCandidate(
  candidates: OpeningBookCandidate[],
  difficulty: AiDifficulty,
  moves: Array<Point & { stone: Stone }>,
  aiStone: Stone,
  openingSeed: number
): Point | null {
  if (candidates.length === 0) {
    return null;
  }

  const preferredRank = Math.max(...candidates.map((candidate) => DIFFICULTY_RANK[candidate.line.minDifficulty]));
  const preferredCandidates = candidates.filter(
    (candidate) => DIFFICULTY_RANK[candidate.line.minDifficulty] === preferredRank
  );
  const totalWeight = preferredCandidates.reduce((sum, candidate) => sum + candidate.line.weight, 0);
  const randomValue = getOpeningRandomValue(difficulty, moves, aiStone, openingSeed);
  let cursor = randomValue * totalWeight;

  for (const candidate of preferredCandidates) {
    cursor -= candidate.line.weight;

    if (cursor <= 0) {
      return candidate.point;
    }
  }

  return preferredCandidates.at(-1)?.point ?? null;
}

export function getOpeningRandomValue(
  difficulty: AiDifficulty,
  moves: Array<Point & { stone: Stone }>,
  aiStone: Stone,
  openingSeed: number
): number {
  let hash = splitMix32(Math.floor(openingSeed) ^ (DIFFICULTY_RANK[difficulty] * 1_000_003));
  hash = splitMix32(hash ^ (aiStone === "black" ? 0x9e3779b9 : 0x7f4a7c15));

  for (const move of moves) {
    hash = splitMix32(hash ^ getNumericPointKey(move) ^ (move.stone === "black" ? 0x85ebca6b : 0xc2b2ae35));
  }

  return (hash >>> 0) / 0x1_0000_0000;
}

export function getNumericPointKey(point: Point): number {
  return point.row * BOARD_SIZE + point.col;
}

export function getPlacedStones(board: Board): Array<Point & { stone: Stone }> {
  const stones: Array<Point & { stone: Stone }> = [];

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const stone = board[row][col];

      if (stone) {
        stones.push({ row, col, stone });
      }
    }
  }

  return stones;
}

const RELATIVE_TRANSFORMS = [
  ({ row, col }: RelativePoint): RelativePoint => ({ row, col }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row, col: -col }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row: -row, col }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row: -row, col: -col }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row: col, col: row }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row: col, col: -row }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row: -col, col: row }),
  ({ row, col }: RelativePoint): RelativePoint => ({ row: -col, col: -row })
];

export function getBookMoveForPosition(
  board: Board,
  line: RelativePoint[],
  transform: (point: RelativePoint) => RelativePoint,
  ply: number
): Point | null {
  for (let index = 0; index < ply; index += 1) {
    const point = relativeToBoardPoint(transform(line[index]));

    if (!isInBounds(board, point) || board[point.row][point.col] !== getStoneForPly(index)) {
      return null;
    }
  }

  const nextPoint = relativeToBoardPoint(transform(line[ply]));

  return isInBoundsForSize(nextPoint) ? nextPoint : null;
}

export function relativeToBoardPoint(point: RelativePoint): Point {
  const center = getBoardCenter();

  return {
    row: center.row + point.row,
    col: center.col + point.col
  };
}

export function getStoneForPly(ply: number): Stone {
  return ply % 2 === 0 ? "black" : "white";
}

export function findWinningMoves(board: Board, candidates: Point[], stone: Stone): Point[] {
  return candidates.filter((point) => {
    if (!isValidMove(board, point)) {
      return false;
    }

    const result = getGameResult(placeStone(board, point, stone), point, stone);
    return result.state === "won";
  });
}

export function findBestForkMove(
  board: Board,
  candidates: Point[],
  stoneToEvaluate: Stone,
  aiStone: Stone
): Point | null {
  let best: { point: Point; score: number } | null = null;

  for (const point of candidates) {
    if (!isValidMove(board, point)) {
      continue;
    }

    const nextBoard = placeStone(board, point, stoneToEvaluate);
    const winningReplies = findWinningMoves(nextBoard, getCandidateMoves(nextBoard), stoneToEvaluate);

    if (winningReplies.length < 2) {
      continue;
    }

    const score =
      winningReplies.length * FORK_SCORE +
      (stoneToEvaluate === aiStone
        ? scoreAiMove(board, point, aiStone)
        : scorePointForStone(board, point, stoneToEvaluate) * 1.35 + scoreAiMove(board, point, aiStone));

    if (!best || score > best.score || (score === best.score && comparePointsByCenter(point, best.point) < 0)) {
      best = { point, score };
    }
  }

  return best?.point ?? null;
}

export function findForcedThreatMove(
  board: Board,
  positionHash: number,
  attackerStone: Stone,
  profile: SearchProfile,
  mode: ThreatSearchMode,
  deadline: SearchDeadline
): Point | null {
  const depth = getThreatSearchDepth(profile, mode);

  if (depth <= 0 || profile.threatSearchCandidates <= 0 || profile.threatSearchNodes <= 0) {
    return null;
  }

  const state = {
    nodes: 0,
    deadline,
    cache: new Map<string, boolean>()
  } satisfies ThreatSearchState;
  const moves = getThreatAttackMoves(board, attackerStone, profile, mode, deadline);

  for (const point of moves) {
    if (state.nodes >= profile.threatSearchNodes || hasSearchTimedOut(deadline)) {
      break;
    }

    const nextBoard = placeStone(board, point, attackerStone);
    const nextHash = addStoneHash(positionHash, point, attackerStone);
    const result = getGameResult(nextBoard, point, attackerStone);

    if (result.state === "won") {
      return point;
    }

    if (
      result.state === "playing" &&
      canForceThreatWin(nextBoard, nextHash, result.nextPlayer, attackerStone, depth - 1, profile, mode, state)
    ) {
      return point;
    }
  }

  return null;
}

export function canForceThreatWin(
  board: Board,
  positionHash: number,
  currentStone: Stone,
  attackerStone: Stone,
  depth: number,
  profile: SearchProfile,
  mode: ThreatSearchMode,
  state: ThreatSearchState
): boolean {
  if (depth <= 0 || state.nodes >= profile.threatSearchNodes || hasSearchTimedOut(state.deadline)) {
    return false;
  }

  const cacheKey = `${positionHash}:${currentStone}:${attackerStone}:${depth}:${mode}`;
  const cached = state.cache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  state.nodes += 1;

  const candidatePool = getCandidateMoves(board);

  if (candidatePool.length === 0) {
    state.cache.set(cacheKey, false);
    return false;
  }

  const currentWins = findWinningMoves(board, candidatePool, currentStone);

  if (currentStone === attackerStone) {
    if (currentWins.length > 0) {
      state.cache.set(cacheKey, true);
      return true;
    }

    const moves = getThreatAttackMoves(board, attackerStone, profile, mode, state.deadline);

    for (const point of moves) {
      if (state.nodes >= profile.threatSearchNodes || hasSearchTimedOut(state.deadline)) {
        break;
      }

      const nextBoard = placeStone(board, point, attackerStone);
      const nextHash = addStoneHash(positionHash, point, attackerStone);
      const result = getGameResult(nextBoard, point, attackerStone);

      if (result.state === "won") {
        state.cache.set(cacheKey, true);
        return true;
      }

      if (
        result.state === "playing" &&
        canForceThreatWin(nextBoard, nextHash, result.nextPlayer, attackerStone, depth - 1, profile, mode, state)
      ) {
        state.cache.set(cacheKey, true);
        return true;
      }
    }

    state.cache.set(cacheKey, false);
    return false;
  }

  if (currentWins.length > 0) {
    state.cache.set(cacheKey, false);
    return false;
  }

  const replies = getThreatDefenseMoves(board, currentStone, attackerStone, profile, mode, state.deadline);

  if (replies.length === 0) {
    state.cache.set(cacheKey, false);
    return false;
  }

  for (const point of replies) {
    if (state.nodes >= profile.threatSearchNodes || hasSearchTimedOut(state.deadline)) {
      state.cache.set(cacheKey, false);
      return false;
    }

    const nextBoard = placeStone(board, point, currentStone);
    const nextHash = addStoneHash(positionHash, point, currentStone);
    const result = getGameResult(nextBoard, point, currentStone);

    if (result.state === "won") {
      state.cache.set(cacheKey, false);
      return false;
    }

    if (
      result.state !== "playing" ||
      !canForceThreatWin(nextBoard, nextHash, result.nextPlayer, attackerStone, depth - 1, profile, mode, state)
    ) {
      state.cache.set(cacheKey, false);
      return false;
    }
  }

  state.cache.set(cacheKey, true);
  return true;
}

export function getThreatAttackMoves(
  board: Board,
  attackerStone: Stone,
  profile: SearchProfile,
  mode: ThreatSearchMode,
  deadline: SearchDeadline
): Point[] {
  if (hasSearchTimedOut(deadline)) {
    return [];
  }

  const candidatePool = getCandidateMoves(board);
  const winningMoves = findWinningMoves(board, candidatePool, attackerStone);

  if (hasSearchTimedOut(deadline)) {
    return [];
  }

  if (winningMoves.length > 0) {
    return orderCandidateMoves(board, winningMoves, attackerStone, attackerStone).slice(
      0,
      profile.threatSearchCandidates
    );
  }

  return rankCandidateMoves(board, candidatePool, attackerStone, attackerStone)
    .filter(({ attack }) => isThreatSearchThreat(attack, mode))
    .slice(0, profile.threatSearchCandidates)
    .map(({ point }) => point);
}

export function getThreatDefenseMoves(
  board: Board,
  defenderStone: Stone,
  attackerStone: Stone,
  profile: SearchProfile,
  mode: ThreatSearchMode,
  deadline: SearchDeadline
): Point[] {
  if (hasSearchTimedOut(deadline)) {
    return [];
  }

  const candidatePool = getCandidateMoves(board);
  const defenderWins = findWinningMoves(board, candidatePool, defenderStone);

  if (hasSearchTimedOut(deadline)) {
    return [];
  }

  if (defenderWins.length > 0) {
    return orderCandidateMoves(board, defenderWins, defenderStone, defenderStone).slice(
      0,
      profile.threatSearchCandidates
    );
  }

  const attackerWins = findWinningMoves(board, candidatePool, attackerStone);

  if (hasSearchTimedOut(deadline)) {
    return [];
  }

  if (attackerWins.length > 0) {
    return orderCandidateMoves(board, attackerWins, defenderStone, defenderStone);
  }

  return rankCandidateMoves(board, candidatePool, defenderStone, defenderStone)
    .filter(
      ({ attack, defense }) =>
        isThreatSearchThreat(defense, mode) || isThreatSearchCounterThreat(attack, mode)
    )
    .slice(0, profile.threatSearchCandidates)
    .map(({ point }) => point);
}

export function isThreatSearchThreat(summary: ThreatSummary, mode: ThreatSearchMode): boolean {
  if (summary.wins > 0 || summary.openFours > 0 || summary.simpleFours > 0) {
    return true;
  }

  return mode === "vct" && summary.openThrees > 0;
}

export function isThreatSearchCounterThreat(summary: ThreatSummary, mode: ThreatSearchMode): boolean {
  if (summary.wins > 0 || summary.openFours > 0 || summary.simpleFours > 0) {
    return true;
  }

  return mode === "vct" && summary.openThrees >= 2;
}

export function getThreatSearchDepth(profile: SearchProfile, mode: ThreatSearchMode): number {
  return mode === "vcf" ? profile.vcfDepth : profile.vctDepth;
}
