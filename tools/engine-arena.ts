import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BOARD_SIZE, createBoard, getGameResult, isValidMove, placeStone } from "../src/game/board";
import type { Board, Move, Point, Stone } from "../src/game/types";

type Difficulty = "normal" | "hard" | "expert" | "insane";
type EngineId = "candidate" | "baseline";
type Outcome = EngineId | "draw";

type EngineOptions = {
  difficulty: Difficulty;
  moves: Move[];
};

type AiMoveResult = {
  point: Point | null;
  score: number;
  completedDepth: number;
  nodes: number;
  source?: string;
};

type EngineModule = {
  chooseAiMove: (board: Board, aiStone: Stone, options: EngineOptions) => Point | null;
  chooseAiMoveResult?: (
    board: Board,
    aiStone: Stone,
    options: EngineOptions & { rootCandidateShard?: { index: number; total: number } }
  ) => AiMoveResult;
  getAiWorkerCount?: (difficulty: Difficulty, hardwareConcurrency?: number) => number;
};

type Engine = {
  id: EngineId;
  spec: string;
  mode: "single" | "parallel";
  module: EngineModule;
};

type CliOptions = {
  games: number;
  baseline: string;
  candidate: string;
  difficulty: Difficulty;
  output: string;
  seed: number;
  randomOpeningPlies: number;
  recordedOpeningPlies: number;
  maxMoves: number;
};

type PlayerAssignment = Record<Stone, Engine>;

type GameRecord = {
  gameNumber: number;
  winner: Outcome;
  reason: "won" | "draw" | "forfeit" | "max-moves";
  candidateStone: Stone;
  baselineStone: Stone;
  openingSeed: number;
  moves: Move[];
  durationMs: number;
  winnerOpening?: OpeningRecord;
};

type OpeningMove = Move & {
  relativeRow: number;
  relativeCol: number;
};

type OpeningRecord = {
  winner: EngineId;
  winnerStone: Stone;
  plies: number;
  key: string;
  moves: OpeningMove[];
};

type OpeningSummary = {
  key: string;
  wins: number;
  candidateWins: number;
  baselineWins: number;
  lastWinner: EngineId;
  moves: OpeningMove[];
};

type ArenaReport = {
  generatedAt: string;
  options: CliOptions;
  engines: {
    candidate: string;
    baseline: string;
  };
  summary: {
    games: number;
    candidateWins: number;
    baselineWins: number;
    draws: number;
    candidateWinRate: number;
    baselineWinRate: number;
    drawRate: number;
    averageMoves: number;
    averageDurationMs: number;
    candidateAsBlack: SideStats;
    candidateAsWhite: SideStats;
    baselineAsBlack: SideStats;
    baselineAsWhite: SideStats;
  };
  winningOpenings: OpeningSummary[];
  games: GameRecord[];
};

type SideStats = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
};

const ROOT_DIR = process.cwd();
const CENTER = Math.floor(BOARD_SIZE / 2);
const SOURCE_FILES = ["ai.ts", "board.ts", "types.ts"] as const;
const CENTRAL_OPENING_POOL: Point[] = [
  { row: CENTER, col: CENTER },
  { row: CENTER - 1, col: CENTER - 1 },
  { row: CENTER + 1, col: CENTER + 1 },
  { row: CENTER - 1, col: CENTER + 1 },
  { row: CENTER + 1, col: CENTER - 1 },
  { row: CENTER - 2, col: CENTER },
  { row: CENTER + 2, col: CENTER },
  { row: CENTER, col: CENTER - 2 },
  { row: CENTER, col: CENTER + 2 },
  { row: CENTER - 2, col: CENTER - 1 },
  { row: CENTER + 2, col: CENTER + 1 },
  { row: CENTER - 1, col: CENTER + 2 },
  { row: CENTER + 1, col: CENTER - 2 }
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const [candidate, baseline] = await Promise.all([
    loadEngine("candidate", options.candidate),
    loadEngine("baseline", options.baseline)
  ]);
  const games: GameRecord[] = [];

  for (let index = 0; index < options.games; index += 1) {
    const candidateStone: Stone = index % 2 === 0 ? "black" : "white";
    const baselineStone = getOpponent(candidateStone);
    const openingSeed = options.seed + index * 9_973;
    const record = playGame({
      gameNumber: index + 1,
      options,
      candidate,
      baseline,
      candidateStone,
      baselineStone,
      openingSeed
    });

    games.push(record);
    printGameProgress(record, options.games);
  }

  const report = buildReport(options, candidate, baseline, games);
  await mkdir(path.dirname(path.resolve(ROOT_DIR, options.output)), { recursive: true });
  await writeFile(path.resolve(ROOT_DIR, options.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printSummary(report);
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);

    if (rawKey === "help") {
      values.set(rawKey, "true");
      continue;
    }

    const value = inlineValue ?? args[index + 1];

    if (value === undefined) {
      throw new Error(`--${rawKey} requires a value.`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(rawKey, value);
  }

  if (values.has("help")) {
    printHelp();
    process.exit(0);
  }

  return {
    games: readInteger(values, "games", 20, 1),
    baseline: values.get("baseline") ?? "HEAD^",
    candidate: values.get("candidate") ?? "current",
    difficulty: readDifficulty(values.get("difficulty") ?? "insane"),
    output: values.get("output") ?? ".arena-results/latest.json",
    seed: readInteger(values, "seed", 20_260_625, 0),
    randomOpeningPlies: readInteger(values, "random-openings", 0, 0, 12),
    recordedOpeningPlies: readInteger(values, "opening-plies", 8, 1, 30),
    maxMoves: readInteger(values, "max-moves", BOARD_SIZE * BOARD_SIZE, 1, BOARD_SIZE * BOARD_SIZE)
  };
}

function readInteger(
  values: Map<string, string>,
  key: string,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER
): number {
  const rawValue = values.get(key);

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${key} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function readDifficulty(value: string): Difficulty {
  if (value === "normal" || value === "hard" || value === "expert" || value === "insane") {
    return value;
  }

  throw new Error("--difficulty must be normal, hard, expert, or insane.");
}

async function loadEngine(id: EngineId, spec: string): Promise<Engine> {
  if (spec === "current" || spec === "current-parallel") {
    const modulePath = path.resolve(ROOT_DIR, "src/game/ai.ts");
    const engineModule = (await import(pathToFileURL(modulePath).href)) as unknown as EngineModule;

    return { id, spec, mode: spec === "current-parallel" ? "parallel" : "single", module: engineModule };
  }

  const cacheDir = path.resolve(ROOT_DIR, ".arena-cache", sanitizeRef(spec), "src", "game");
  await rm(path.resolve(ROOT_DIR, ".arena-cache", sanitizeRef(spec)), { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });

  for (const file of SOURCE_FILES) {
    const source = execFileSync("git", ["show", `${spec}:src/game/${file}`], {
      cwd: ROOT_DIR,
      encoding: "utf8"
    });

    await writeFile(path.join(cacheDir, file), source, "utf8");
  }

  const modulePath = path.join(cacheDir, "ai.ts");
  const engineModule = (await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`)) as unknown as EngineModule;

  return { id, spec, mode: "single", module: engineModule };
}

function sanitizeRef(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function chooseEngineMove(engine: Engine, board: Board, stone: Stone, options: EngineOptions): Point | null {
  if (engine.mode === "single") {
    return engine.module.chooseAiMove(board, stone, options);
  }

  return chooseParallelEngineMove(engine, board, stone, options);
}

function chooseParallelEngineMove(engine: Engine, board: Board, stone: Stone, options: EngineOptions): Point | null {
  if (!engine.module.chooseAiMoveResult) {
    throw new Error(`${engine.spec} does not expose chooseAiMoveResult for parallel arena mode.`);
  }

  const hardwareConcurrency = availableParallelism();
  const workerCount = Math.max(1, engine.module.getAiWorkerCount?.(options.difficulty, hardwareConcurrency) ?? 1);
  let bestResult: AiMoveResult | null = null;

  for (let index = 0; index < workerCount; index += 1) {
    const result = engine.module.chooseAiMoveResult(board, stone, {
      ...options,
      rootCandidateShard: workerCount > 1 ? { index, total: workerCount } : undefined
    });

    if (isBetterAiResult(result, bestResult, board)) {
      bestResult = result;
    }

    if (isDecisiveAiResult(result)) {
      return result.point;
    }
  }

  return bestResult?.point ?? engine.module.chooseAiMove(board, stone, options);
}

function isBetterAiResult(next: AiMoveResult, current: AiMoveResult | null, board: Board): boolean {
  if (!next.point) {
    return false;
  }

  if (!current?.point) {
    return true;
  }

  if (next.score !== current.score) {
    return next.score > current.score;
  }

  if (next.completedDepth !== current.completedDepth) {
    return next.completedDepth > current.completedDepth;
  }

  if (next.nodes !== current.nodes) {
    return next.nodes > current.nodes;
  }

  return getCenterDistance(next.point, board) < getCenterDistance(current.point, board);
}

function isDecisiveAiResult(result: AiMoveResult): boolean {
  return (
    result.point !== null &&
    result.source !== "search" &&
    result.source !== "none" &&
    result.source !== "empty-shard"
  );
}

function getCenterDistance(point: Point, board: Board): number {
  const center = Math.floor(board.length / 2);

  return Math.abs(point.row - center) + Math.abs(point.col - center);
}

function playGame({
  gameNumber,
  options,
  candidate,
  baseline,
  candidateStone,
  baselineStone,
  openingSeed
}: {
  gameNumber: number;
  options: CliOptions;
  candidate: Engine;
  baseline: Engine;
  candidateStone: Stone;
  baselineStone: Stone;
  openingSeed: number;
}): GameRecord {
  const startedAt = performance.now();
  let board = createBoard();
  const moves: Move[] = [];
  const players: PlayerAssignment =
    candidateStone === "black"
      ? { black: candidate, white: baseline }
      : { black: baseline, white: candidate };

  board = applyRandomOpening(board, moves, options.randomOpeningPlies, openingSeed);

  while (moves.length < options.maxMoves) {
    const stone = getStoneForPly(moves.length);
    const engine = players[stone];
    const move = chooseEngineMove(engine, board, stone, {
      difficulty: options.difficulty,
      moves
    });

    if (!move || !isValidMove(board, move)) {
      const winner = engine.id === "candidate" ? "baseline" : "candidate";

      return finalizeGame({
        gameNumber,
        winner,
        reason: "forfeit",
        candidateStone,
        baselineStone,
        openingSeed,
        moves,
        startedAt,
        recordedOpeningPlies: options.recordedOpeningPlies
      });
    }

    board = placeStone(board, move, stone);
    moves.push({ ...move, stone, moveNumber: moves.length + 1 });

    const result = getGameResult(board, move, stone);

    if (result.state === "won") {
      return finalizeGame({
        gameNumber,
        winner: players[stone].id,
        reason: "won",
        candidateStone,
        baselineStone,
        openingSeed,
        moves,
        startedAt,
        recordedOpeningPlies: options.recordedOpeningPlies
      });
    }

    if (result.state === "draw") {
      return finalizeGame({
        gameNumber,
        winner: "draw",
        reason: "draw",
        candidateStone,
        baselineStone,
        openingSeed,
        moves,
        startedAt,
        recordedOpeningPlies: options.recordedOpeningPlies
      });
    }
  }

  return finalizeGame({
    gameNumber,
    winner: "draw",
    reason: "max-moves",
    candidateStone,
    baselineStone,
    openingSeed,
    moves,
    startedAt,
    recordedOpeningPlies: options.recordedOpeningPlies
  });
}

function applyRandomOpening(board: Board, moves: Move[], plies: number, seed: number): Board {
  if (plies <= 0) {
    return board;
  }

  let nextBoard = board;
  const random = createRandom(seed);
  const pool = shuffle(CENTRAL_OPENING_POOL, random);

  for (const point of pool) {
    if (moves.length >= plies) {
      break;
    }

    if (!isValidMove(nextBoard, point)) {
      continue;
    }

    const stone = getStoneForPly(moves.length);
    nextBoard = placeStone(nextBoard, point, stone);
    moves.push({ ...point, stone, moveNumber: moves.length + 1 });
  }

  return nextBoard;
}

function finalizeGame({
  gameNumber,
  winner,
  reason,
  candidateStone,
  baselineStone,
  openingSeed,
  moves,
  startedAt,
  recordedOpeningPlies
}: {
  gameNumber: number;
  winner: Outcome;
  reason: GameRecord["reason"];
  candidateStone: Stone;
  baselineStone: Stone;
  openingSeed: number;
  moves: Move[];
  startedAt: number;
  recordedOpeningPlies: number;
}): GameRecord {
  return {
    gameNumber,
    winner,
    reason,
    candidateStone,
    baselineStone,
    openingSeed,
    moves,
    durationMs: Math.round(performance.now() - startedAt),
    winnerOpening:
      winner === "draw"
        ? undefined
        : createOpeningRecord(winner, winner === "candidate" ? candidateStone : baselineStone, moves, recordedOpeningPlies)
  };
}

function createOpeningRecord(
  winner: EngineId,
  winnerStone: Stone,
  moves: Move[],
  recordedOpeningPlies: number
): OpeningRecord {
  const openingMoves = moves.slice(0, recordedOpeningPlies).map((move) => ({
    ...move,
    relativeRow: move.row - CENTER,
    relativeCol: move.col - CENTER
  }));

  return {
    winner,
    winnerStone,
    plies: openingMoves.length,
    key: openingMoves.map((move) => `${move.stone[0]}${move.relativeRow}:${move.relativeCol}`).join("|"),
    moves: openingMoves
  };
}

function buildReport(options: CliOptions, candidate: Engine, baseline: Engine, games: GameRecord[]): ArenaReport {
  const candidateWins = games.filter((game) => game.winner === "candidate").length;
  const baselineWins = games.filter((game) => game.winner === "baseline").length;
  const draws = games.filter((game) => game.winner === "draw").length;
  const totalMoves = games.reduce((sum, game) => sum + game.moves.length, 0);
  const totalDuration = games.reduce((sum, game) => sum + game.durationMs, 0);

  return {
    generatedAt: new Date().toISOString(),
    options,
    engines: {
      candidate: candidate.spec,
      baseline: baseline.spec
    },
    summary: {
      games: games.length,
      candidateWins,
      baselineWins,
      draws,
      candidateWinRate: roundRate(candidateWins, games.length),
      baselineWinRate: roundRate(baselineWins, games.length),
      drawRate: roundRate(draws, games.length),
      averageMoves: games.length === 0 ? 0 : round(totalMoves / games.length),
      averageDurationMs: games.length === 0 ? 0 : round(totalDuration / games.length),
      candidateAsBlack: getSideStats(games, "candidate", "black"),
      candidateAsWhite: getSideStats(games, "candidate", "white"),
      baselineAsBlack: getSideStats(games, "baseline", "black"),
      baselineAsWhite: getSideStats(games, "baseline", "white")
    },
    winningOpenings: summarizeOpenings(games),
    games
  };
}

function getSideStats(games: GameRecord[], engine: EngineId, stone: Stone): SideStats {
  const scoped = games.filter((game) => (engine === "candidate" ? game.candidateStone : game.baselineStone) === stone);

  return {
    games: scoped.length,
    wins: scoped.filter((game) => game.winner === engine).length,
    losses: scoped.filter((game) => game.winner !== engine && game.winner !== "draw").length,
    draws: scoped.filter((game) => game.winner === "draw").length
  };
}

function summarizeOpenings(games: GameRecord[]): OpeningSummary[] {
  const summaries = new Map<string, OpeningSummary>();

  for (const game of games) {
    if (!game.winnerOpening) {
      continue;
    }

    const existing = summaries.get(game.winnerOpening.key);

    if (existing) {
      existing.wins += 1;
      existing.candidateWins += game.winner === "candidate" ? 1 : 0;
      existing.baselineWins += game.winner === "baseline" ? 1 : 0;
      existing.lastWinner = game.winnerOpening.winner;
      continue;
    }

    summaries.set(game.winnerOpening.key, {
      key: game.winnerOpening.key,
      wins: 1,
      candidateWins: game.winner === "candidate" ? 1 : 0,
      baselineWins: game.winner === "baseline" ? 1 : 0,
      lastWinner: game.winnerOpening.winner,
      moves: game.winnerOpening.moves
    });
  }

  return [...summaries.values()].sort(
    (a, b) => b.wins - a.wins || b.candidateWins - a.candidateWins || a.key.localeCompare(b.key)
  );
}

function printGameProgress(record: GameRecord, totalGames: number): void {
  const winner = record.winner === "draw" ? "draw" : `${record.winner} ${record.reason}`;
  console.log(
    `game ${record.gameNumber}/${totalGames}: ${winner}, moves=${record.moves.length}, duration=${record.durationMs}ms`
  );
}

function printSummary(report: ArenaReport): void {
  console.log("");
  console.log("Engine arena complete");
  console.log(`candidate: ${report.engines.candidate}`);
  console.log(`baseline: ${report.engines.baseline}`);
  console.log(
    `score: candidate ${report.summary.candidateWins} - baseline ${report.summary.baselineWins} - draw ${report.summary.draws}`
  );
  console.log(
    `win rate: candidate ${(report.summary.candidateWinRate * 100).toFixed(1)}%, baseline ${(
      report.summary.baselineWinRate * 100
    ).toFixed(1)}%, draw ${(report.summary.drawRate * 100).toFixed(1)}%`
  );
  console.log(`average: ${report.summary.averageMoves} moves, ${report.summary.averageDurationMs}ms/game`);
  console.log(`result: ${report.options.output}`);

  if (report.winningOpenings.length > 0) {
    console.log("");
    console.log("Top winning openings");

    for (const opening of report.winningOpenings.slice(0, 5)) {
      console.log(
        `${opening.wins} wins (${opening.candidateWins} candidate / ${opening.baselineWins} baseline): ${opening.key}`
      );
    }
  }
}

function printHelp(): void {
  console.log(`Usage:
  npm run arena -- --games 100 --baseline HEAD^ --candidate current --difficulty insane

Options:
  --games <n>             Number of games. Default: 20
  --baseline <ref>        Baseline engine git ref or current. Default: HEAD^
  --candidate <ref>       Candidate engine git ref, current, or current-parallel. Default: current
  --difficulty <name>     normal, hard, expert, insane. Default: insane
  --random-openings <n>   Seeded central opening plies before engines move. Default: 0
  --opening-plies <n>     Winner opening plies recorded in the report. Default: 8
  --seed <n>              Deterministic seed. Default: 20260625
  --output <path>         JSON report path. Default: .arena-results/latest.json
  --max-moves <n>         Max plies before adjudicating draw. Default: 225`);
}

function getStoneForPly(ply: number): Stone {
  return ply % 2 === 0 ? "black" : "white";
}

function getOpponent(stone: Stone): Stone {
  return stone === "black" ? "white" : "black";
}

function roundRate(value: number, total: number): number {
  return total === 0 ? 0 : round(value / total, 4);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function shuffle(points: Point[], random: () => number): Point[] {
  const shuffled = [...points];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);

    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
