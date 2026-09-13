import {
  BOARD_SIZE,
  WIN_STONE_COUNT,
  getLegalMoves,
  getNearbyMoves,
  getOpponent,
  isValidMove
} from "./board";
import type { Board, Point, Stone } from "./types";
import {
  DIRECTIONS,
  SEARCH_WINDOWS,
  WIN_SCORE,
  WINDOWS_BY_CELL,
  addStoneHash,
  addStoneHashLock,
  countDirection,
  createThreatSummary,
  getBoardCenter,
  getCappedThreatScore,
  getPointIndex,
  getThreatSummaryAfterMove,
  getThreatSummaryForPlacedStone,
  getTranspositionKey,
  getTranspositionLock,
  hasForcingThreat,
  isInBoundsForSize,
  pointFromIndex,
  scoreAiMove,
  scorePointForPlacedStone,
  scorePointForStone,
  scoreStonePlacementPoint,
  scoreWindow,
  type ThreatSummary
} from "./ai-evaluator";

export type SearchProfile = {
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

export type TranspositionFlag = "exact" | "lower" | "upper";

export type TranspositionEntry = {
  lock: number;
  depth: number;
  score: number;
  flag: TranspositionFlag;
  bestMove?: Point;
  age: number;
};

export type SearchDeadline = {
  expiresAt: number;
  timedOut: boolean;
  checks: number;
};

export type SearchState = {
  nodes: number;
  age: number;
  deadline: SearchDeadline;
  cache: Map<number, TranspositionEntry>;
  threatCache: Map<string, ThreatSummary>;
  evaluationCache: Map<string, number>;
};

export type TacticalCandidate = {
  point: Point;
  score: number;
};

export type RankedCandidate = TacticalCandidate & {
  tier: number;
  attack: ThreatSummary;
  defense: ThreatSummary;
};

export type CandidateSnapshot = {
  key: number;
  count: number;
  present: boolean;
};

export type SearchMoveRecord = {
  key: number;
  point: Point;
  stone: Stone;
  hash1: number;
  hash2: number;
  occupiedCount: number;
  candidateSnapshots: CandidateSnapshot[];
};

export type SearchMoveResult = {
  point: Point | null;
  score: number;
  completedDepth: number;
  nodes: number;
  source: "search" | "empty-shard";
};

export function createSearchDeadline(timeLimitMs: number): SearchDeadline {
  return {
    expiresAt: performance.now() + timeLimitMs,
    timedOut: false,
    checks: 0
  };
}

export function hasSearchTimedOut(deadline: SearchDeadline): boolean {
  if (deadline.timedOut) {
    return true;
  }

  deadline.checks += 1;

  if (performance.now() >= deadline.expiresAt) {
    deadline.timedOut = true;
  }

  return deadline.timedOut;
}

export function reportBestMove(onBestMove: ((point: Point) => void) | undefined, point: Point): void {
  onBestMove?.({ row: point.row, col: point.col });
}

export function comparePointsByCenter(a: Point, b: Point): number {
  const center = Math.floor(BOARD_SIZE / 2);
  const aDistance = Math.abs(a.row - center) + Math.abs(a.col - center);
  const bDistance = Math.abs(b.row - center) + Math.abs(b.col - center);

  return aDistance - bDistance || a.row - b.row || a.col - b.col;
}

export function isSamePoint(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col;
}

export function prioritizeMove(moves: Point[], preferredMove?: Point): Point[] {
  if (!preferredMove) {
    return moves;
  }

  const preferredIndex = moves.findIndex((move) => isSamePoint(move, preferredMove));

  if (preferredIndex <= 0) {
    return moves;
  }

  return [moves[preferredIndex], ...moves.slice(0, preferredIndex), ...moves.slice(preferredIndex + 1)];
}

export class SearchPosition {
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

export function getCandidateMoves(board: Board): Point[] {
  const nearbyMoves = getNearbyMoves(board, 2);

  if (nearbyMoves.length > 0) {
    return nearbyMoves;
  }

  return getLegalMoves(board);
}

export function getCandidateTier(attack: ThreatSummary, defense: ThreatSummary): number {
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

export function getMoveOrderingScore(
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

export function rankCandidateMoves(
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

export function orderCandidateMoves(
  board: Board,
  candidates: Point[],
  currentStone: Stone,
  aiStone: Stone
): Point[] {
  return rankCandidateMoves(board, candidates, currentStone, aiStone).map(({ point }) => point);
}

export function chooseBestMove(board: Board, moves: Point[], aiStone: Stone): Point | null {
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

export function findWinningMovesInPosition(position: SearchPosition, candidates: Point[], stone: Stone): Point[] {
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

export function findBestOpenFourMoveInPosition(
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

export function getTacticalCandidateMovesInPosition(
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

export function orderCandidateMovesInPosition(
  position: SearchPosition,
  candidates: Point[],
  currentStone: Stone,
  aiStone: Stone,
  searchState: SearchState
): Point[] {
  return rankCandidateMovesInPosition(position, candidates, currentStone, aiStone, searchState).map(({ point }) => point);
}

export function rankCandidateMovesInPosition(
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

export function getMoveOrderingScoreInPosition(
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

export function scoreAiMoveInPosition(
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

export function scorePointForStoneInPosition(position: SearchPosition, point: Point, stone: Stone): number {
  if (!position.isValidMove(point)) {
    return Number.NEGATIVE_INFINITY;
  }

  position.makeMove(point, stone);
  const score = scorePointForPlacedStone(position.board, point, stone);
  position.undoMove();

  return score;
}

export function getThreatSummaryAfterMoveInPosition(
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

export function evaluateCachedPosition(position: SearchPosition, aiStone: Stone, searchState: SearchState): number {
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

export function profileIndependentThreatCacheLimit(): number {
  return 120_000;
}

export function getSearchGameResult(
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

export function hasFiveAt(board: Board, point: Point, stone: Stone): boolean {
  for (const direction of DIRECTIONS) {
    const forward = countDirection(board, point, stone, direction);
    const backward = countDirection(board, point, stone, {
      row: -direction.row,
      col: -direction.col
    });

    if (forward.count + backward.count + 1 >= WIN_STONE_COUNT) {
      return true;
    }
  }

  return false;
}

export function cacheSearchScore(
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

export function findTranspositionEvictionKey(searchState: SearchState): number | null {
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

export function getTranspositionFlag(score: number, alpha: number, beta: number): TranspositionFlag {
  if (score <= alpha) {
    return "upper";
  }

  if (score >= beta) {
    return "lower";
  }

  return "exact";
}

export function minimax(
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

export function extendTacticalSearch(
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

export function chooseSearchMove(
  board: Board,
  candidates: Point[],
  aiStone: Stone,
  profile: SearchProfile,
  deadline: SearchDeadline,
  onBestMove?: (point: Point) => void
): SearchMoveResult {
  const initialMoves = orderCandidateMoves(board, candidates, aiStone, aiStone).slice(0, profile.rootCandidates);

  if (initialMoves.length === 0) {
    return {
      point: null,
      score: Number.NEGATIVE_INFINITY,
      completedDepth: 0,
      nodes: 0,
      source: "empty-shard"
    };
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

  return {
    point: bestMove,
    score: Number.isFinite(bestScore) ? bestScore : scoreAiMove(board, bestMove, aiStone),
    completedDepth,
    nodes: searchState.nodes,
    source: "search"
  };
}
