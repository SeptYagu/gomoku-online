import {
  BOARD_SIZE,
  getGameResult,
  getLegalMoves,
  getNearbyMoves,
  getOpponent,
  isInBounds,
  isValidMove,
  placeStone
} from "./board";
import { GENERATED_OPENING_BOOK_LINES } from "./opening-book";
import type { Board, Move, Point, Stone } from "./types";

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

type ChooseAiMoveOptions = {
  difficulty: AiDifficulty;
  moves?: Move[];
  timeLimitMs?: number;
  onBestMove?: (point: Point) => void;
  rootCandidateShard?: AiRootCandidateShard;
  openingSeed?: number;
};

type SearchProfile = {
  depth: number;
  rootCandidates: number;
  branchCandidates: number;
  maxNodes: number;
  maxCacheEntries: number;
  tacticalExtensionDepth: number;
  tacticalCandidates: number;
  iterativeDeepening: boolean;
  vcfDepth: number;
  vctDepth: number;
  threatSearchCandidates: number;
  threatSearchNodes: number;
};

type TranspositionFlag = "exact" | "lower" | "upper";

type TranspositionEntry = {
  lock: number;
  depth: number;
  score: number;
  flag: TranspositionFlag;
  bestMove?: Point;
  age: number;
};

type SearchState = {
  nodes: number;
  age: number;
  deadline: SearchDeadline;
  cache: Map<number, TranspositionEntry>;
  threatCache: Map<string, ThreatSummary>;
  evaluationCache: Map<string, number>;
};

type ThreatSummary = {
  wins: number;
  openFours: number;
  simpleFours: number;
  openThrees: number;
  score: number;
};

type TacticalCandidate = {
  point: Point;
  score: number;
};

type RankedCandidate = TacticalCandidate & {
  tier: number;
  attack: ThreatSummary;
  defense: ThreatSummary;
};

type ThreatSearchMode = "vcf" | "vct";

type ThreatSearchState = {
  nodes: number;
  deadline: SearchDeadline;
  cache: Map<string, boolean>;
};

type SearchDeadline = {
  expiresAt: number;
  timedOut: boolean;
  checks: number;
};

type CandidateSnapshot = {
  key: number;
  count: number;
  present: boolean;
};

type SearchMoveRecord = {
  key: number;
  point: Point;
  stone: Stone;
  hash1: number;
  hash2: number;
  occupiedCount: number;
  candidateSnapshots: CandidateSnapshot[];
};

type EvaluationWindow = {
  points: Point[];
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

const DIRECTIONS: Point[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 }
];

const SEARCH_PROFILES: Record<AiDifficulty, SearchProfile> = {
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

const OPENING_BOOK_PLIES: Record<AiDifficulty, number> = {
  normal: 2,
  hard: 4,
  expert: 6,
  insane: 8
};

const AI_TIME_LIMIT_MS: Record<AiDifficulty, number> = {
  normal: 1_000,
  hard: 5_000,
  expert: 10_000,
  insane: 30_000
};

const AI_PARALLEL_WORKERS: Record<AiDifficulty, number> = {
  normal: 1,
  hard: 2,
  expert: 3,
  insane: 4
};

const DIFFICULTY_RANK: Record<AiDifficulty, number> = {
  normal: 1,
  hard: 2,
  expert: 3,
  insane: 4
};

const OPENING_BOOK_LINES: OpeningBookLine[] = GENERATED_OPENING_BOOK_LINES;

const WIN_SCORE = 1_000_000_000;
const FORK_SCORE = 6_000_000;
const OPEN_FOUR_THREAT_SCORE = 7_500_000;
const SIMPLE_FOUR_THREAT_SCORE = 1_150_000;
const OPEN_THREE_THREAT_SCORE = 92_000;
const DOUBLE_THREAT_SCORE = 2_400_000;
const SIMPLE_FOUR_OPEN_THREE_SCORE = 1_650_000;
const DOUBLE_OPEN_THREE_SCORE = 850_000;
const ZOBRIST_STONES = createZobristStoneTable();
const ZOBRIST_STONES_LOCK = createZobristStoneTable(11_337);
const ZOBRIST_SIDE_TO_MOVE: Record<Stone, number> = {
  black: splitMix32(8_001),
  white: splitMix32(8_002)
};
const ZOBRIST_SIDE_TO_MOVE_LOCK: Record<Stone, number> = {
  black: splitMix32(18_001),
  white: splitMix32(18_002)
};
const SEARCH_WINDOWS = createEvaluationWindows();
const WINDOWS_BY_CELL = createWindowsByCell(SEARCH_WINDOWS);

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
  const winningMove = chooseBestMove(board, findWinningMoves(board, candidates, aiStone), aiStone);

  if (winningMove) {
    reportBestMove(onBestMove, winningMove);
    return createAiMoveResult(winningMove, WIN_SCORE + scoreAiMove(board, winningMove, aiStone) * 0.001, "winning");
  }

  const blockingMove = chooseBestMove(board, findWinningMoves(board, candidates, opponent), aiStone);

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

function createAiMoveResult(
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

function shardRootCandidates(candidates: Point[], shard?: AiRootCandidateShard): Point[] {
  if (!shard || shard.total <= 1) {
    return candidates;
  }

  const shardCount = Math.max(1, Math.floor(shard.total));
  const shardIndex = normalizeShardIndex(shard);

  return candidates.filter((_, index) => index % shardCount === shardIndex);
}

function normalizeShardIndex(shard: AiRootCandidateShard): number {
  const shardCount = Math.max(1, Math.floor(shard.total));
  const rawIndex = Number.isFinite(shard.index) ? Math.floor(shard.index) : 0;

  return ((rawIndex % shardCount) + shardCount) % shardCount;
}

function createSearchDeadline(timeLimitMs: number): SearchDeadline {
  return {
    expiresAt: performance.now() + timeLimitMs,
    timedOut: false,
    checks: 0
  };
}

function hasSearchTimedOut(deadline: SearchDeadline): boolean {
  if (deadline.timedOut) {
    return true;
  }

  deadline.checks += 1;

  if (performance.now() >= deadline.expiresAt) {
    deadline.timedOut = true;
  }

  return deadline.timedOut;
}

function reportBestMove(onBestMove: ((point: Point) => void) | undefined, point: Point): void {
  onBestMove?.({ row: point.row, col: point.col });
}

export function scoreAiMove(board: Board, point: Point, aiStone: Stone): number {
  if (!isValidMove(board, point)) {
    return Number.NEGATIVE_INFINITY;
  }

  const opponent = getOpponent(aiStone);
  const center = Math.floor(BOARD_SIZE / 2);
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);
  const attackThreat = getThreatSummaryAfterMove(board, point, aiStone);
  const defenseThreat = getThreatSummaryAfterMove(board, point, opponent);

  return (
    scorePointForStone(board, point, aiStone) * 1.7 +
    scorePointForStone(board, point, opponent) * 1.28 +
    getCappedThreatScore(attackThreat) * 0.045 +
    getCappedThreatScore(defenseThreat) * 0.036 +
    Math.max(0, 28 - centerDistance * 2)
  );
}

export function evaluateBoard(board: Board, aiStone: Stone): number {
  const opponent = getOpponent(aiStone);

  return (
    scoreBoardForStone(board, aiStone) -
    scoreBoardForStone(board, opponent) * 1.12 +
    scoreStonePlacement(board, aiStone) -
    scoreStonePlacement(board, opponent) * 0.8
  );
}

function getCandidateMoves(board: Board): Point[] {
  const nearbyMoves = getNearbyMoves(board, 2);

  if (nearbyMoves.length > 0) {
    return nearbyMoves;
  }

  return getLegalMoves(board);
}

function chooseOpeningBookMove(
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

function chooseWeightedOpeningCandidate(
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

function getOpeningRandomValue(
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

function getNumericPointKey(point: Point): number {
  return point.row * BOARD_SIZE + point.col;
}

function getPlacedStones(board: Board): Array<Point & { stone: Stone }> {
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

function getBookMoveForPosition(
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

function relativeToBoardPoint(point: RelativePoint): Point {
  const center = getBoardCenter();

  return {
    row: center.row + point.row,
    col: center.col + point.col
  };
}

function getStoneForPly(ply: number): Stone {
  return ply % 2 === 0 ? "black" : "white";
}

function getBoardCenter(): Point {
  const center = Math.floor(BOARD_SIZE / 2);

  return { row: center, col: center };
}

function findWinningMoves(board: Board, candidates: Point[], stone: Stone): Point[] {
  return candidates.filter((point) => {
    if (!isValidMove(board, point)) {
      return false;
    }

    const result = getGameResult(placeStone(board, point, stone), point, stone);
    return result.state === "won";
  });
}

function findBestForkMove(
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

class SearchPosition {
  readonly board: Board;
  readonly candidateCounts = new Int16Array(BOARD_SIZE * BOARD_SIZE);
  readonly candidateSet = new Set<number>();
  readonly windowScores: Record<Stone, number[]>;
  readonly boardScores: Record<Stone, number>;
  readonly placementScores: Record<Stone, number>;
  readonly history: SearchMoveRecord[] = [];
  hash1 = 0;
  hash2 = 0;
  occupiedCount = 0;

  constructor(board: Board) {
    this.board = board.map((row) => [...row]);
    this.windowScores = {
      black: Array<number>(SEARCH_WINDOWS.length).fill(0),
      white: Array<number>(SEARCH_WINDOWS.length).fill(0)
    };
    this.boardScores = { black: 0, white: 0 };
    this.placementScores = { black: 0, white: 0 };

    for (let row = 0; row < this.board.length; row += 1) {
      for (let col = 0; col < this.board[row].length; col += 1) {
        const stone = this.board[row][col];

        if (!stone) {
          continue;
        }

        const point = { row, col };
        this.hash1 = addStoneHash(this.hash1, point, stone);
        this.hash2 = addStoneHashLock(this.hash2, point, stone);
        this.placementScores[stone] += scoreStonePlacementPoint(point);
        this.occupiedCount += 1;
      }
    }

    this.initializeWindowScores();
    this.initializeCandidates();
  }

  isValidMove(point: Point): boolean {
    return isInBoundsForSize(point) && this.board[point.row][point.col] === null;
  }

  getCandidateMoves(): Point[] {
    if (this.occupiedCount === 0) {
      const center = getBoardCenter();
      return this.isValidMove(center) ? [center] : [];
    }

    const moves = [...this.candidateSet]
      .map(pointFromIndex)
      .filter((point) => this.isValidMove(point))
      .sort((a, b) => a.row - b.row || a.col - b.col);

    if (moves.length > 0) {
      return moves;
    }

    return getLegalMoves(this.board);
  }

  makeMove(point: Point, stone: Stone): void {
    if (!this.isValidMove(point)) {
      throw new Error("Search move targets an invalid point.");
    }

    const key = getPointIndex(point);
    const record: SearchMoveRecord = {
      key,
      point,
      stone,
      hash1: this.hash1,
      hash2: this.hash2,
      occupiedCount: this.occupiedCount,
      candidateSnapshots: []
    };

    this.rememberCandidate(record, key);
    this.board[point.row][point.col] = stone;
    this.hash1 = addStoneHash(this.hash1, point, stone);
    this.hash2 = addStoneHashLock(this.hash2, point, stone);
    this.placementScores[stone] += scoreStonePlacementPoint(point);
    this.occupiedCount += 1;
    this.candidateCounts[key] = 0;
    this.candidateSet.delete(key);

    this.updateNeighborCandidates(point, 1, record);
    this.updateAffectedWindows(point);
    this.history.push(record);
  }

  undoMove(): void {
    const record = this.history.pop();

    if (!record) {
      throw new Error("Cannot undo an empty search history.");
    }

    this.board[record.point.row][record.point.col] = null;
    this.hash1 = record.hash1;
    this.hash2 = record.hash2;
    this.occupiedCount = record.occupiedCount;
    this.placementScores[record.stone] -= scoreStonePlacementPoint(record.point);
    this.updateAffectedWindows(record.point);

    for (let index = record.candidateSnapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = record.candidateSnapshots[index];
      this.candidateCounts[snapshot.key] = snapshot.count;

      if (snapshot.present) {
        this.candidateSet.add(snapshot.key);
      } else {
        this.candidateSet.delete(snapshot.key);
      }
    }
  }

  evaluate(aiStone: Stone): number {
    const opponent = getOpponent(aiStone);

    return (
      this.boardScores[aiStone] -
      this.boardScores[opponent] * 1.12 +
      this.placementScores[aiStone] -
      this.placementScores[opponent] * 0.8
    );
  }

  hashAfter(point: Point, stone: Stone): { hash1: number; hash2: number } {
    return {
      hash1: addStoneHash(this.hash1, point, stone),
      hash2: addStoneHashLock(this.hash2, point, stone)
    };
  }

  private initializeWindowScores(): void {
    for (let index = 0; index < SEARCH_WINDOWS.length; index += 1) {
      const window = SEARCH_WINDOWS[index];
      const blackScore = scoreWindow(this.board, window.points, "black");
      const whiteScore = scoreWindow(this.board, window.points, "white");

      this.windowScores.black[index] = blackScore;
      this.windowScores.white[index] = whiteScore;
      this.boardScores.black += blackScore;
      this.boardScores.white += whiteScore;
    }
  }

  private initializeCandidates(): void {
    if (this.occupiedCount === 0) {
      const center = getBoardCenter();
      this.candidateCounts[getPointIndex(center)] = 1;
      this.candidateSet.add(getPointIndex(center));
      return;
    }

    for (let row = 0; row < this.board.length; row += 1) {
      for (let col = 0; col < this.board[row].length; col += 1) {
        if (this.board[row][col]) {
          this.updateNeighborCandidates({ row, col }, 1);
        }
      }
    }
  }

  private updateNeighborCandidates(point: Point, delta: 1 | -1, record?: SearchMoveRecord): void {
    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      for (let colOffset = -2; colOffset <= 2; colOffset += 1) {
        const candidate = {
          row: point.row + rowOffset,
          col: point.col + colOffset
        };

        if (!isInBoundsForSize(candidate) || (rowOffset === 0 && colOffset === 0)) {
          continue;
        }

        if (this.board[candidate.row][candidate.col] !== null) {
          continue;
        }

        const key = getPointIndex(candidate);

        if (record) {
          this.rememberCandidate(record, key);
        }

        const nextCount = Math.max(0, this.candidateCounts[key] + delta);
        this.candidateCounts[key] = nextCount;

        if (nextCount > 0) {
          this.candidateSet.add(key);
        } else {
          this.candidateSet.delete(key);
        }
      }
    }
  }

  private updateAffectedWindows(point: Point): void {
    for (const windowIndex of WINDOWS_BY_CELL[getPointIndex(point)] ?? []) {
      const window = SEARCH_WINDOWS[windowIndex];

      for (const stone of ["black", "white"] as const) {
        const previousScore = this.windowScores[stone][windowIndex];
        const nextScore = scoreWindow(this.board, window.points, stone);

        if (previousScore !== nextScore) {
          this.windowScores[stone][windowIndex] = nextScore;
          this.boardScores[stone] += nextScore - previousScore;
        }
      }
    }
  }

  private rememberCandidate(record: SearchMoveRecord, key: number): void {
    if (record.candidateSnapshots.some((snapshot) => snapshot.key === key)) {
      return;
    }

    record.candidateSnapshots.push({
      key,
      count: this.candidateCounts[key],
      present: this.candidateSet.has(key)
    });
  }
}

function chooseSearchMove(
  board: Board,
  candidates: Point[],
  aiStone: Stone,
  profile: SearchProfile,
  deadline: SearchDeadline,
  onBestMove?: (point: Point) => void
): AiMoveResult {
  const initialMoves = orderCandidateMoves(board, candidates, aiStone, aiStone).slice(0, profile.rootCandidates);

  if (initialMoves.length === 0) {
    return createAiMoveResult(null, Number.NEGATIVE_INFINITY, "empty-shard");
  }

  const position = new SearchPosition(board);
  const searchState = {
    nodes: 0,
    age: 0,
    deadline,
    cache: new Map<number, TranspositionEntry>(),
    threatCache: new Map<string, ThreatSummary>(),
    evaluationCache: new Map<string, number>()
  } satisfies SearchState;
  let bestMove = initialMoves[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let completedDepth = 0;
  const startDepth = profile.iterativeDeepening ? 1 : profile.depth;
  reportBestMove(onBestMove, bestMove);

  for (let searchDepth = startDepth; searchDepth <= profile.depth; searchDepth += 1) {
    searchState.age += 1;

    const orderedMoves = prioritizeMove(initialMoves, bestMove);
    let iterationBestMove = bestMove;
    let iterationBestScore = Number.NEGATIVE_INFINITY;
    let searchedMoves = 0;

    for (const point of orderedMoves) {
      if (hasSearchTimedOut(deadline)) {
        break;
      }

      position.makeMove(point, aiStone);

      const result = getSearchGameResult(position, point, aiStone);
      const score =
        result.state === "won"
          ? WIN_SCORE
          : result.state === "draw"
            ? 0
            : minimax(
                position,
                searchDepth - 1,
                result.nextPlayer,
                aiStone,
                Number.NEGATIVE_INFINITY,
                Number.POSITIVE_INFINITY,
                profile,
                searchState
              );

      position.undoMove();
      searchedMoves += 1;

      const adjustedScore = score + scoreAiMove(board, point, aiStone) * 0.001;

      if (
        adjustedScore > iterationBestScore ||
        (adjustedScore === iterationBestScore && comparePointsByCenter(point, iterationBestMove) < 0)
      ) {
        iterationBestScore = adjustedScore;
        iterationBestMove = point;
        reportBestMove(onBestMove, iterationBestMove);
      }

      if (searchState.nodes >= profile.maxNodes || hasSearchTimedOut(deadline)) {
        break;
      }
    }

    if (searchedMoves > 0) {
      bestScore = iterationBestScore;
      bestMove = iterationBestMove;
      completedDepth = searchDepth;
      reportBestMove(onBestMove, bestMove);
    }

    if (!profile.iterativeDeepening || bestScore >= WIN_SCORE || searchState.nodes >= profile.maxNodes || deadline.timedOut) {
      break;
    }
  }

  return createAiMoveResult(
    bestMove,
    Number.isFinite(bestScore) ? bestScore : scoreAiMove(board, bestMove, aiStone),
    "search",
    completedDepth,
    searchState.nodes
  );
}

function minimax(
  position: SearchPosition,
  depth: number,
  currentStone: Stone,
  aiStone: Stone,
  alpha: number,
  beta: number,
  profile: SearchProfile,
  searchState: SearchState
): number {
  searchState.nodes += 1;

  if (hasSearchTimedOut(searchState.deadline)) {
    return evaluateCachedPosition(position, aiStone, searchState);
  }

  const cacheKey = getTranspositionKey(position.hash1, currentStone);
  const cacheLock = getTranspositionLock(position.hash2, currentStone);
  const cached = searchState.cache.get(cacheKey);
  const alphaStart = alpha;
  const betaStart = beta;

  if (cached && cached.lock === cacheLock && cached.depth >= depth) {
    if (cached.flag === "exact") {
      return cached.score;
    }

    if (cached.flag === "lower") {
      alpha = Math.max(alpha, cached.score);
    } else {
      beta = Math.min(beta, cached.score);
    }

    if (alpha >= beta) {
      return cached.score;
    }
  }

  if (depth <= 0 || searchState.nodes >= profile.maxNodes || hasSearchTimedOut(searchState.deadline)) {
    const tacticalScore =
      depth <= 0 &&
        profile.tacticalExtensionDepth > 0 &&
        searchState.nodes < profile.maxNodes &&
        !searchState.deadline.timedOut
        ? extendTacticalSearch(
            position,
            profile.tacticalExtensionDepth,
            currentStone,
            aiStone,
            alpha,
            beta,
            profile,
            searchState
          )
        : null;

    return cacheSearchScore(
      searchState,
      profile,
      cacheKey,
      cacheLock,
      depth,
      tacticalScore ?? evaluateCachedPosition(position, aiStone, searchState)
    );
  }

  const candidatePool = position.getCandidateMoves();
  const opponent = getOpponent(currentStone);
  const winningMoves = findWinningMovesInPosition(position, candidatePool, currentStone);

  if (winningMoves.length > 0) {
    const score = currentStone === aiStone ? WIN_SCORE + depth : -WIN_SCORE - depth;
    const bestMove = chooseBestMove(position.board, winningMoves, aiStone) ?? winningMoves[0];
    return cacheSearchScore(searchState, profile, cacheKey, cacheLock, depth, score, "exact", bestMove);
  }

  const blockingMoves = findWinningMovesInPosition(position, candidatePool, opponent);

  if (blockingMoves.length > 1) {
    const score = currentStone === aiStone ? -WIN_SCORE - depth : WIN_SCORE + depth;
    return cacheSearchScore(searchState, profile, cacheKey, cacheLock, depth, score, "exact", blockingMoves[0]);
  }

  if (blockingMoves.length === 0) {
    const openFourMove = findBestOpenFourMoveInPosition(position, candidatePool, currentStone, aiStone, searchState);

    if (openFourMove) {
      const score = currentStone === aiStone ? WIN_SCORE + depth - 2 : -WIN_SCORE - depth + 2;
      return cacheSearchScore(searchState, profile, cacheKey, cacheLock, depth, score, "exact", openFourMove);
    }
  }

  const tacticalMoves = blockingMoves.length > 0 ? blockingMoves : candidatePool;
  const candidates = prioritizeMove(
    orderCandidateMovesInPosition(position, tacticalMoves, currentStone, aiStone, searchState).slice(
      0,
      profile.branchCandidates
    ),
    cached?.bestMove
  );

  if (candidates.length === 0) {
    return cacheSearchScore(searchState, profile, cacheKey, cacheLock, depth, 0);
  }

  if (currentStone === aiStone) {
    let best = Number.NEGATIVE_INFINITY;
    let bestMove = candidates[0];

    for (const point of candidates) {
      if (hasSearchTimedOut(searchState.deadline)) {
        break;
      }

      position.makeMove(point, currentStone);

      const result = getSearchGameResult(position, point, currentStone);
      const score =
        result.state === "won"
          ? WIN_SCORE + depth
          : result.state === "draw"
            ? 0
            : minimax(position, depth - 1, result.nextPlayer, aiStone, alpha, beta, profile, searchState);

      position.undoMove();

      if (score > best || (score === best && comparePointsByCenter(point, bestMove) < 0)) {
        best = score;
        bestMove = point;
      }

      alpha = Math.max(alpha, best);

      if (beta <= alpha || searchState.nodes >= profile.maxNodes || searchState.deadline.timedOut) {
        break;
      }
    }

    return cacheSearchScore(
      searchState,
      profile,
      cacheKey,
      cacheLock,
      depth,
      best,
      getTranspositionFlag(best, alphaStart, betaStart),
      bestMove
    );
  }

  let best = Number.POSITIVE_INFINITY;
  let bestMove = candidates[0];

  for (const point of candidates) {
    if (hasSearchTimedOut(searchState.deadline)) {
      break;
    }

    position.makeMove(point, currentStone);

    const result = getSearchGameResult(position, point, currentStone);
    const score =
      result.state === "won"
        ? -WIN_SCORE - depth
        : result.state === "draw"
          ? 0
          : minimax(position, depth - 1, result.nextPlayer, aiStone, alpha, beta, profile, searchState);

    position.undoMove();

    if (score < best || (score === best && comparePointsByCenter(point, bestMove) < 0)) {
      best = score;
      bestMove = point;
    }

    beta = Math.min(beta, best);

    if (beta <= alpha || searchState.nodes >= profile.maxNodes || searchState.deadline.timedOut) {
      break;
    }
  }

  return cacheSearchScore(
    searchState,
    profile,
    cacheKey,
    cacheLock,
    depth,
    best,
    getTranspositionFlag(best, alphaStart, betaStart),
    bestMove
  );
}

function extendTacticalSearch(
  position: SearchPosition,
  depth: number,
  currentStone: Stone,
  aiStone: Stone,
  alpha: number,
  beta: number,
  profile: SearchProfile,
  searchState: SearchState
): number | null {
  if (depth <= 0 || searchState.nodes >= profile.maxNodes || hasSearchTimedOut(searchState.deadline)) {
    return evaluateCachedPosition(position, aiStone, searchState);
  }

  const candidates = getTacticalCandidateMovesInPosition(position, currentStone, aiStone, profile, searchState);

  if (candidates.length === 0) {
    return null;
  }

  if (currentStone === aiStone) {
    let best = Number.NEGATIVE_INFINITY;

    for (const point of candidates) {
      if (searchState.nodes >= profile.maxNodes || hasSearchTimedOut(searchState.deadline)) {
        break;
      }

      searchState.nodes += 1;

      position.makeMove(point, currentStone);

      const result = getSearchGameResult(position, point, currentStone);
      const score =
        result.state === "won"
          ? WIN_SCORE + depth
          : result.state === "draw"
            ? 0
            : (extendTacticalSearch(
                position,
                depth - 1,
                result.nextPlayer,
                aiStone,
                alpha,
                beta,
                profile,
                searchState
              ) ?? evaluateCachedPosition(position, aiStone, searchState));

      position.undoMove();

      best = Math.max(best, score);
      alpha = Math.max(alpha, best);

      if (beta <= alpha) {
        break;
      }
    }

    return best;
  }

    let best = Number.POSITIVE_INFINITY;

  for (const point of candidates) {
    if (searchState.nodes >= profile.maxNodes || hasSearchTimedOut(searchState.deadline)) {
      break;
    }

    searchState.nodes += 1;

    position.makeMove(point, currentStone);

    const result = getSearchGameResult(position, point, currentStone);
    const score =
      result.state === "won"
        ? -WIN_SCORE - depth
        : result.state === "draw"
          ? 0
          : (extendTacticalSearch(
              position,
              depth - 1,
              result.nextPlayer,
              aiStone,
              alpha,
              beta,
              profile,
              searchState
            ) ?? evaluateCachedPosition(position, aiStone, searchState));

    position.undoMove();

    best = Math.min(best, score);
    beta = Math.min(beta, best);

    if (beta <= alpha) {
      break;
    }
  }

  return best;
}

function findWinningMovesInPosition(position: SearchPosition, candidates: Point[], stone: Stone): Point[] {
  const moves: Point[] = [];

  for (const point of candidates) {
    if (!position.isValidMove(point)) {
      continue;
    }

    position.makeMove(point, stone);

    if (getSearchGameResult(position, point, stone).state === "won") {
      moves.push(point);
    }

    position.undoMove();
  }

  return moves;
}

function findBestOpenFourMoveInPosition(
  position: SearchPosition,
  candidates: Point[],
  stoneToEvaluate: Stone,
  aiStone: Stone,
  searchState: SearchState
): Point | null {
  let best: { point: Point; score: number } | null = null;

  for (const point of candidates) {
    if (!position.isValidMove(point)) {
      continue;
    }

    const threat = getThreatSummaryAfterMoveInPosition(position, point, stoneToEvaluate, searchState);

    if (threat.openFours === 0) {
      continue;
    }

    const score =
      threat.score +
      (stoneToEvaluate === aiStone
        ? scoreAiMoveInPosition(position, point, aiStone, searchState)
        : scorePointForStoneInPosition(position, point, stoneToEvaluate) +
          scoreAiMoveInPosition(position, point, aiStone, searchState) * 0.2);

    if (!best || score > best.score || (score === best.score && comparePointsByCenter(point, best.point) < 0)) {
      best = { point, score };
    }
  }

  return best?.point ?? null;
}

function getTacticalCandidateMovesInPosition(
  position: SearchPosition,
  currentStone: Stone,
  aiStone: Stone,
  profile: SearchProfile,
  searchState: SearchState
): Point[] {
  const candidatePool = position.getCandidateMoves();

  if (candidatePool.length === 0) {
    return [];
  }

  const opponent = getOpponent(currentStone);
  const winningMoves = findWinningMovesInPosition(position, candidatePool, currentStone);

  if (winningMoves.length > 0) {
    return orderCandidateMovesInPosition(position, winningMoves, currentStone, aiStone, searchState).slice(
      0,
      profile.tacticalCandidates
    );
  }

  const blockingMoves = findWinningMovesInPosition(position, candidatePool, opponent);

  if (blockingMoves.length > 0) {
    return orderCandidateMovesInPosition(position, blockingMoves, currentStone, aiStone, searchState).slice(
      0,
      profile.tacticalCandidates
    );
  }

  const tacticalMoves = rankCandidateMovesInPosition(
    position,
    candidatePool,
    currentStone,
    aiStone,
    searchState
  ).filter(({ attack, defense }) => hasForcingThreat(attack) || hasForcingThreat(defense));

  return tacticalMoves.slice(0, profile.tacticalCandidates).map(({ point }) => point);
}

function orderCandidateMovesInPosition(
  position: SearchPosition,
  candidates: Point[],
  currentStone: Stone,
  aiStone: Stone,
  searchState: SearchState
): Point[] {
  return rankCandidateMovesInPosition(position, candidates, currentStone, aiStone, searchState).map(({ point }) => point);
}

function rankCandidateMovesInPosition(
  position: SearchPosition,
  candidates: Point[],
  currentStone: Stone,
  aiStone: Stone,
  searchState: SearchState
): RankedCandidate[] {
  const opponent = getOpponent(currentStone);

  return candidates
    .map((point): RankedCandidate | null => {
      if (!position.isValidMove(point)) {
        return null;
      }

      const attack = getThreatSummaryAfterMoveInPosition(position, point, currentStone, searchState);
      const defense = getThreatSummaryAfterMoveInPosition(position, point, opponent, searchState);
      const tier = getCandidateTier(attack, defense);
      const perspectiveBonus = currentStone === aiStone ? 1 : 0.94;

      return {
        point,
        tier,
        attack,
        defense,
        score:
          attack.score * 1.35 * perspectiveBonus +
          defense.score * 1.08 +
          getMoveOrderingScoreInPosition(position, point, currentStone, opponent, aiStone, searchState) * 0.02
      };
    })
    .filter((move): move is RankedCandidate => move !== null)
    .sort((a, b) => a.tier - b.tier || b.score - a.score || comparePointsByCenter(a.point, b.point));
}

function getMoveOrderingScoreInPosition(
  position: SearchPosition,
  point: Point,
  currentStone: Stone,
  opponent: Stone,
  aiStone: Stone,
  searchState: SearchState
): number {
  const perspectiveBonus = currentStone === aiStone ? 1 : 0.92;

  return (
    scorePointForStoneInPosition(position, point, currentStone) * 1.55 * perspectiveBonus +
    scorePointForStoneInPosition(position, point, opponent) * 1.18 +
    scoreAiMoveInPosition(position, point, aiStone, searchState) * 0.18
  );
}

function scoreAiMoveInPosition(
  position: SearchPosition,
  point: Point,
  aiStone: Stone,
  searchState: SearchState
): number {
  if (!position.isValidMove(point)) {
    return Number.NEGATIVE_INFINITY;
  }

  const opponent = getOpponent(aiStone);
  const center = Math.floor(BOARD_SIZE / 2);
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);
  const attackThreat = getThreatSummaryAfterMoveInPosition(position, point, aiStone, searchState);
  const defenseThreat = getThreatSummaryAfterMoveInPosition(position, point, opponent, searchState);

  return (
    scorePointForStoneInPosition(position, point, aiStone) * 1.7 +
    scorePointForStoneInPosition(position, point, opponent) * 1.28 +
    getCappedThreatScore(attackThreat) * 0.045 +
    getCappedThreatScore(defenseThreat) * 0.036 +
    Math.max(0, 28 - centerDistance * 2)
  );
}

function scorePointForStoneInPosition(position: SearchPosition, point: Point, stone: Stone): number {
  if (!position.isValidMove(point)) {
    return Number.NEGATIVE_INFINITY;
  }

  position.makeMove(point, stone);
  const score = scorePointForPlacedStone(position.board, point, stone);
  position.undoMove();

  return score;
}

function getThreatSummaryAfterMoveInPosition(
  position: SearchPosition,
  point: Point,
  stone: Stone,
  searchState: SearchState
): ThreatSummary {
  if (!position.isValidMove(point)) {
    return createThreatSummary();
  }

  const nextHash = position.hashAfter(point, stone);
  const cacheKey = `${nextHash.hash1}:${nextHash.hash2}:${stone}:${point.row}:${point.col}`;
  const cached = searchState.threatCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  position.makeMove(point, stone);
  const summary = getThreatSummaryForPlacedStone(position.board, point, stone);
  position.undoMove();

  if (searchState.threatCache.size < profileIndependentThreatCacheLimit()) {
    searchState.threatCache.set(cacheKey, summary);
  }

  return summary;
}

function evaluateCachedPosition(position: SearchPosition, aiStone: Stone, searchState: SearchState): number {
  const cacheKey = `${position.hash1}:${position.hash2}:${aiStone}`;
  const cached = searchState.evaluationCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const score = position.evaluate(aiStone);

  if (searchState.evaluationCache.size < 80_000) {
    searchState.evaluationCache.set(cacheKey, score);
  }

  return score;
}

function profileIndependentThreatCacheLimit(): number {
  return 120_000;
}

function getSearchGameResult(
  position: SearchPosition,
  lastMove: Point,
  stone: Stone
): { state: "won"; winner: Stone } | { state: "draw" } | { state: "playing"; nextPlayer: Stone } {
  if (hasFiveAt(position.board, lastMove, stone)) {
    return { state: "won", winner: stone };
  }

  if (position.occupiedCount >= BOARD_SIZE * BOARD_SIZE) {
    return { state: "draw" };
  }

  return { state: "playing", nextPlayer: getOpponent(stone) };
}

function hasFiveAt(board: Board, point: Point, stone: Stone): boolean {
  for (const direction of DIRECTIONS) {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });

    if (forward.count + backward.count + 1 >= 5) {
      return true;
    }
  }

  return false;
}

function findForcedThreatMove(
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

function canForceThreatWin(
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

function getThreatAttackMoves(
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

function getThreatDefenseMoves(
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

function isThreatSearchThreat(summary: ThreatSummary, mode: ThreatSearchMode): boolean {
  if (summary.wins > 0 || summary.openFours > 0 || summary.simpleFours > 0) {
    return true;
  }

  return mode === "vct" && summary.openThrees > 0;
}

function isThreatSearchCounterThreat(summary: ThreatSummary, mode: ThreatSearchMode): boolean {
  if (summary.wins > 0 || summary.openFours > 0 || summary.simpleFours > 0) {
    return true;
  }

  return mode === "vct" && summary.openThrees >= 2;
}

function getThreatSearchDepth(profile: SearchProfile, mode: ThreatSearchMode): number {
  return mode === "vcf" ? profile.vcfDepth : profile.vctDepth;
}

export function getThreatSummaryAfterMove(board: Board, point: Point, stone: Stone): ThreatSummary {
  if (!isValidMove(board, point)) {
    return createThreatSummary();
  }

  const nextBoard = placeStone(board, point, stone);

  return getThreatSummaryForPlacedStone(nextBoard, point, stone);
}

function getThreatSummaryForPlacedStone(board: Board, point: Point, stone: Stone): ThreatSummary {
  const summary = createThreatSummary();

  for (const direction of DIRECTIONS) {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const total = forward.count + backward.count + 1;
    const openEnds = Number(forward.open) + Number(backward.open);

    if (total >= 5) {
      summary.wins += 1;
    } else if (total === 4 && openEnds === 2) {
      summary.openFours += 1;
    } else if (total === 4 && openEnds === 1) {
      summary.simpleFours += 1;
    } else if (total === 3 && openEnds === 2) {
      summary.openThrees += 1;
    }

    addWindowThreatsThroughPoint(board, point, stone, direction, summary);
  }

  summary.score = getThreatScore(summary);

  return summary;
}

function addWindowThreatsThroughPoint(
  board: Board,
  point: Point,
  stone: Stone,
  direction: Point,
  summary: ThreatSummary
): void {
  for (let offset = -4; offset <= 0; offset += 1) {
    const start = {
      row: point.row + direction.row * offset,
      col: point.col + direction.col * offset
    };
    const points = getWindowPoints(start, direction);

    if (!points?.some((candidate) => candidate.row === point.row && candidate.col === point.col)) {
      continue;
    }

    addWindowThreat(board, points, stone, summary);
  }
}

function addWindowThreat(board: Board, points: Point[], stone: Stone, summary: ThreatSummary): void {
  const opponent = getOpponent(stone);
  let stones = 0;
  let empties = 0;

  for (const point of points) {
    const cell = board[point.row][point.col];

    if (cell === opponent) {
      return;
    }

    if (cell === stone) {
      stones += 1;
    } else {
      empties += 1;
    }
  }

  if (stones >= 5) {
    summary.wins += 1;
    return;
  }

  const openEnds = getWindowOpenEnds(board, points);

  if (stones === 4 && empties === 1) {
    if (openEnds === 2) {
      summary.openFours += 1;
    } else {
      summary.simpleFours += 1;
    }
    return;
  }

  if (stones === 3 && empties === 2 && openEnds === 2) {
    summary.openThrees += 1;
  }
}

function getWindowOpenEnds(board: Board, points: Point[]): number {
  const start = points[0];
  const end = points[points.length - 1];
  const direction = {
    row: points[1].row - points[0].row,
    col: points[1].col - points[0].col
  };
  const before = {
    row: start.row - direction.row,
    col: start.col - direction.col
  };
  const after = {
    row: end.row + direction.row,
    col: end.col + direction.col
  };

  return (
    Number(isInBounds(board, before) && board[before.row][before.col] === null) +
    Number(isInBounds(board, after) && board[after.row][after.col] === null)
  );
}

function createThreatSummary(): ThreatSummary {
  return {
    wins: 0,
    openFours: 0,
    simpleFours: 0,
    openThrees: 0,
    score: 0
  };
}

function hasForcingThreat(summary: ThreatSummary): boolean {
  return summary.wins > 0 || summary.openFours > 0 || summary.simpleFours > 0 || summary.openThrees > 0;
}

function getThreatScore(summary: ThreatSummary): number {
  const forcingThreats = summary.openFours + summary.simpleFours;
  let score =
    summary.wins * WIN_SCORE +
    summary.openFours * OPEN_FOUR_THREAT_SCORE +
    summary.simpleFours * SIMPLE_FOUR_THREAT_SCORE +
    summary.openThrees * OPEN_THREE_THREAT_SCORE;

  if (forcingThreats >= 2) {
    score += DOUBLE_THREAT_SCORE;
  }

  if (summary.simpleFours > 0 && summary.openThrees > 0) {
    score += SIMPLE_FOUR_OPEN_THREE_SCORE;
  }

  if (summary.openThrees >= 2) {
    score += DOUBLE_OPEN_THREE_SCORE;
  }

  return score;
}

function getCappedThreatScore(summary: ThreatSummary): number {
  return Math.min(summary.score, OPEN_FOUR_THREAT_SCORE * 2);
}

function cacheSearchScore(
  searchState: SearchState,
  profile: SearchProfile,
  key: number,
  lock: number,
  depth: number,
  score: number,
  flag: TranspositionFlag = "exact",
  bestMove?: Point
): number {
  if (searchState.deadline.timedOut) {
    return score;
  }

  const existing = searchState.cache.get(key);

  if (!existing || existing.lock === lock || existing.depth <= depth || existing.age < searchState.age - 2) {
    if (!existing && searchState.cache.size >= profile.maxCacheEntries) {
      const evictableKey = findTranspositionEvictionKey(searchState);

      if (evictableKey !== null) {
        searchState.cache.delete(evictableKey);
      }
    }

    if (searchState.cache.size < profile.maxCacheEntries || searchState.cache.has(key)) {
      searchState.cache.set(key, { lock, depth, score, flag, bestMove, age: searchState.age });
    }
  }

  return score;
}

function findTranspositionEvictionKey(searchState: SearchState): number | null {
  let selectedKey: number | null = null;
  let selectedDepth = Number.POSITIVE_INFINITY;
  let selectedAge = Number.POSITIVE_INFINITY;
  let inspected = 0;

  for (const [key, entry] of searchState.cache) {
    if (entry.depth < selectedDepth || (entry.depth === selectedDepth && entry.age < selectedAge)) {
      selectedKey = key;
      selectedDepth = entry.depth;
      selectedAge = entry.age;
    }

    inspected += 1;

    if (inspected >= 64) {
      break;
    }
  }

  return selectedKey;
}

function getTranspositionFlag(score: number, alpha: number, beta: number): TranspositionFlag {
  if (score <= alpha) {
    return "upper";
  }

  if (score >= beta) {
    return "lower";
  }

  return "exact";
}

function chooseBestMove(board: Board, moves: Point[], aiStone: Stone): Point | null {
  if (moves.length === 0) {
    return null;
  }

  return moves.reduce((best, point) => {
    const score = scoreAiMove(board, point, aiStone);
    const bestScore = scoreAiMove(board, best, aiStone);

    if (score > bestScore) {
      return point;
    }

    if (score === bestScore && comparePointsByCenter(point, best) < 0) {
      return point;
    }

    return best;
  }, moves[0]);
}

function prioritizeMove(moves: Point[], preferredMove?: Point): Point[] {
  if (!preferredMove) {
    return moves;
  }

  const preferredIndex = moves.findIndex((move) => isSamePoint(move, preferredMove));

  if (preferredIndex <= 0) {
    return moves;
  }

  return [moves[preferredIndex], ...moves.slice(0, preferredIndex), ...moves.slice(preferredIndex + 1)];
}

function orderCandidateMoves(
  board: Board,
  candidates: Point[],
  currentStone: Stone,
  aiStone: Stone
): Point[] {
  return rankCandidateMoves(board, candidates, currentStone, aiStone).map(({ point }) => point);
}

function rankCandidateMoves(
  board: Board,
  candidates: Point[],
  currentStone: Stone,
  aiStone: Stone
): RankedCandidate[] {
  const opponent = getOpponent(currentStone);

  return candidates
    .map((point): RankedCandidate | null => {
      if (!isValidMove(board, point)) {
        return null;
      }

      const attack = getThreatSummaryAfterMove(board, point, currentStone);
      const defense = getThreatSummaryAfterMove(board, point, opponent);
      const tier = getCandidateTier(attack, defense);
      const perspectiveBonus = currentStone === aiStone ? 1 : 0.94;

      return {
        point,
        tier,
        attack,
        defense,
        score:
          attack.score * 1.35 * perspectiveBonus +
          defense.score * 1.08 +
          getMoveOrderingScore(board, point, currentStone, opponent, aiStone) * 0.02
      };
    })
    .filter((move): move is RankedCandidate => move !== null)
    .sort((a, b) => a.tier - b.tier || b.score - a.score || comparePointsByCenter(a.point, b.point));
}

function getCandidateTier(attack: ThreatSummary, defense: ThreatSummary): number {
  if (attack.wins > 0) {
    return 0;
  }

  if (defense.wins > 0) {
    return 1;
  }

  if (attack.openFours > 0) {
    return 2;
  }

  if (defense.openFours > 0) {
    return 3;
  }

  if (attack.simpleFours > 0) {
    return 4;
  }

  if (defense.simpleFours > 0) {
    return 5;
  }

  if (attack.openThrees > 0) {
    return 6;
  }

  if (defense.openThrees > 0) {
    return 7;
  }

  return 8;
}

function getMoveOrderingScore(
  board: Board,
  point: Point,
  currentStone: Stone,
  opponent: Stone,
  aiStone: Stone
): number {
  const perspectiveBonus = currentStone === aiStone ? 1 : 0.92;

  return (
    scorePointForStone(board, point, currentStone) * 1.55 * perspectiveBonus +
    scorePointForStone(board, point, opponent) * 1.18 +
    scoreAiMove(board, point, aiStone) * 0.18
  );
}

function scorePointForStone(board: Board, point: Point, stone: Stone): number {
  if (!isValidMove(board, point)) {
    return Number.NEGATIVE_INFINITY;
  }

  const nextBoard = placeStone(board, point, stone);

  return scorePointForPlacedStone(nextBoard, point, stone);
}

function scorePointForPlacedStone(board: Board, point: Point, stone: Stone): number {
  return DIRECTIONS.reduce((score, direction) => {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });
    const total = forward.count + backward.count + 1;
    const openEnds = Number(forward.open) + Number(backward.open);

    return score + scorePattern(total, openEnds) * 1.4 + scoreWindowsThroughPoint(board, point, stone, direction);
  }, 0);
}

function scoreBoardForStone(board: Board, stone: Stone): number {
  let score = 0;

  for (const direction of DIRECTIONS) {
    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const points = getWindowPoints({ row, col }, direction);

        if (points) {
          score += scoreWindow(board, points, stone);
        }
      }
    }
  }

  return score;
}

function scoreWindowsThroughPoint(board: Board, point: Point, stone: Stone, direction: Point): number {
  let score = 0;

  for (let offset = -4; offset <= 0; offset += 1) {
    const start = {
      row: point.row + direction.row * offset,
      col: point.col + direction.col * offset
    };
    const points = getWindowPoints(start, direction);

    if (points?.some((candidate) => candidate.row === point.row && candidate.col === point.col)) {
      score += scoreWindow(board, points, stone);
    }
  }

  return score;
}

function getWindowPoints(start: Point, direction: Point): Point[] | null {
  const points = Array.from({ length: 5 }, (_, index) => ({
    row: start.row + direction.row * index,
    col: start.col + direction.col * index
  }));

  return points.every((point) => isInBoundsForSize(point)) ? points : null;
}

function scoreWindow(board: Board, points: Point[], stone: Stone): number {
  const opponent = getOpponent(stone);
  let stones = 0;

  for (const point of points) {
    const cell = board[point.row][point.col];

    if (cell === opponent) {
      return 0;
    }

    if (cell === stone) {
      stones += 1;
    }
  }

  if (stones === 0) {
    return 0;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const direction = {
    row: points[1].row - points[0].row,
    col: points[1].col - points[0].col
  };
  const before = {
    row: start.row - direction.row,
    col: start.col - direction.col
  };
  const after = {
    row: end.row + direction.row,
    col: end.col + direction.col
  };
  const openEnds = Number(isInBounds(board, before) && board[before.row][before.col] === null) +
    Number(isInBounds(board, after) && board[after.row][after.col] === null);

  return scorePattern(stones, openEnds);
}

function scoreStonePlacement(board: Board, stone: Stone): number {
  const center = Math.floor(BOARD_SIZE / 2);
  let score = 0;

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col] !== stone) {
        continue;
      }

      const centerDistance = Math.abs(row - center) + Math.abs(col - center);
      score += Math.max(0, 18 - centerDistance);
    }
  }

  return score;
}

function countDirection(
  board: Board,
  origin: Point,
  stone: Stone,
  step: Point
): { count: number; open: boolean } {
  let count = 0;
  let point = { row: origin.row + step.row, col: origin.col + step.col };

  while (isInBounds(board, point)) {
    const cell = board[point.row][point.col];

    if (cell === stone) {
      count += 1;
      point = { row: point.row + step.row, col: point.col + step.col };
      continue;
    }

    return { count, open: cell === null };
  }

  return { count, open: false };
}

function scorePattern(stones: number, openEnds: number): number {
  if (stones >= 5) {
    return WIN_SCORE;
  }

  if (stones === 4 && openEnds === 2) {
    return 420_000;
  }

  if (stones === 4 && openEnds === 1) {
    return 96_000;
  }

  if (stones === 4) {
    return 14_000;
  }

  if (stones === 3 && openEnds === 2) {
    return 22_000;
  }

  if (stones === 3 && openEnds === 1) {
    return 2_600;
  }

  if (stones === 3) {
    return 420;
  }

  if (stones === 2 && openEnds === 2) {
    return 850;
  }

  if (stones === 2 && openEnds === 1) {
    return 130;
  }

  return openEnds > 0 ? 12 : 2;
}

function comparePointsByCenter(a: Point, b: Point): number {
  const center = Math.floor(BOARD_SIZE / 2);
  const aDistance = Math.abs(a.row - center) + Math.abs(a.col - center);
  const bDistance = Math.abs(b.row - center) + Math.abs(b.col - center);

  return aDistance - bDistance || a.row - b.row || a.col - b.col;
}

function isSamePoint(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col;
}

function createZobristStoneTable(initialSeed = 2_025): Record<Stone, number[][]> {
  let seed = initialSeed;
  const table = {
    black: [] as number[][],
    white: [] as number[][]
  };

  for (const stone of ["black", "white"] as const) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      const values: number[] = [];

      for (let col = 0; col < BOARD_SIZE; col += 1) {
        seed += 1;
        values.push(splitMix32(seed));
      }

      table[stone].push(values);
    }
  }

  return table;
}

function splitMix32(seed: number): number {
  let value = (seed + 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;

  return (value ^ (value >>> 16)) >>> 0;
}

function getBoardHash(board: Board): number {
  let hash = 0;

  for (let rowIndex = 0; rowIndex < board.length; rowIndex += 1) {
    const row = board[rowIndex];

    for (let col = 0; col < row.length; col += 1) {
      const cell = row[col];

      if (cell) {
        hash = (hash ^ (ZOBRIST_STONES[cell][rowIndex]?.[col] ?? 0)) >>> 0;
      }
    }
  }

  return hash;
}

function addStoneHash(hash: number, point: Point, stone: Stone): number {
  return (hash ^ (ZOBRIST_STONES[stone][point.row]?.[point.col] ?? 0)) >>> 0;
}

function addStoneHashLock(hash: number, point: Point, stone: Stone): number {
  return (hash ^ (ZOBRIST_STONES_LOCK[stone][point.row]?.[point.col] ?? 0)) >>> 0;
}

function getTranspositionKey(positionHash: number, currentStone: Stone): number {
  return (positionHash ^ ZOBRIST_SIDE_TO_MOVE[currentStone]) >>> 0;
}

function getTranspositionLock(positionHash: number, currentStone: Stone): number {
  return (positionHash ^ ZOBRIST_SIDE_TO_MOVE_LOCK[currentStone]) >>> 0;
}

function getPointKey(point: Point): string {
  return `${point.row}:${point.col}`;
}

function getPointIndex(point: Point): number {
  return point.row * BOARD_SIZE + point.col;
}

function pointFromIndex(index: number): Point {
  return {
    row: Math.floor(index / BOARD_SIZE),
    col: index % BOARD_SIZE
  };
}

function isInBoundsForSize(point: Point): boolean {
  return point.row >= 0 && point.col >= 0 && point.row < BOARD_SIZE && point.col < BOARD_SIZE;
}

function createEvaluationWindows(): EvaluationWindow[] {
  const windows: EvaluationWindow[] = [];

  for (const direction of DIRECTIONS) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const points = getWindowPoints({ row, col }, direction);

        if (points) {
          windows.push({ points });
        }
      }
    }
  }

  return windows;
}

function createWindowsByCell(windows: EvaluationWindow[]): number[][] {
  const map = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => [] as number[]);

  windows.forEach((window, index) => {
    for (const point of window.points) {
      map[getPointIndex(point)].push(index);
    }
  });

  return map;
}

function scoreStonePlacementPoint(point: Point): number {
  const center = Math.floor(BOARD_SIZE / 2);
  const centerDistance = Math.abs(point.row - center) + Math.abs(point.col - center);

  return Math.max(0, 18 - centerDistance);
}
