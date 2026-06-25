import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chooseAiMoveResult, type AiDifficulty } from "../src/game/ai";
import { BOARD_SIZE, createBoard, isValidMove, placeStone } from "../src/game/board";
import type { Move, Point, Stone } from "../src/game/types";

type RelativePoint = {
  row: number;
  col: number;
};

type OpeningSeed = {
  id: string;
  name: string;
  category: "direct" | "indirect";
  moves: RelativePoint[];
};

type CliOptions = {
  difficulty: AiDifficulty;
  output: string;
  plies: number;
  seed: number;
  timeLimitMs: number;
  variants: number;
  limit: number;
};

type GeneratedLine = {
  seed: OpeningSeed;
  variant: number;
  openingSeed: number;
  moves: Move[];
  stoppedReason: "target-plies" | "no-move" | "illegal-move";
};

const ROOT_DIR = process.cwd();
const CENTER = Math.floor(BOARD_SIZE / 2);
const DEFAULT_OUTPUT = ".arena-results/generated-opening-book.sgf";
const DIRECT_WHITE: RelativePoint = { row: -1, col: 0 };
const INDIRECT_WHITE: RelativePoint = { row: -1, col: 1 };

const STANDARD_OPENING_SEEDS: OpeningSeed[] = [
  ...createSeeds("direct", DIRECT_WHITE, [
    ["D1", "cold-star", -2, 0],
    ["D2", "stream-moon", -2, 1],
    ["D3", "sparse-star", -2, 2],
    ["D4", "flower-moon", -1, 1],
    ["D5", "waning-moon", -1, 2],
    ["D6", "rain-moon", 0, 1],
    ["D7", "gold-star", 0, 2],
    ["D8", "pine-moon", 1, 0],
    ["D9", "hill-moon", 1, 1],
    ["D10", "new-moon", 1, 2],
    ["D11", "auspicious-star", 2, 0],
    ["D12", "mountain-moon", 2, 1],
    ["D13", "wandering-star", 2, 2]
  ]),
  ...createSeeds("indirect", INDIRECT_WHITE, [
    ["I1", "long-star", -2, 2],
    ["I2", "canyon-moon", -1, 2],
    ["I3", "constant-star", 0, 2],
    ["I4", "water-moon", 1, 2],
    ["I5", "meteor", 2, 2],
    ["I6", "cloud-moon", 0, 1],
    ["I7", "shore-moon", 1, 1],
    ["I8", "storm-moon", 2, 1],
    ["I9", "silver-moon", 1, 0],
    ["I10", "bright-star", 2, 0],
    ["I11", "slant-moon", 1, -1],
    ["I12", "famous-moon", 2, -1],
    ["I13", "comet", 2, -2]
  ])
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const lines: GeneratedLine[] = [];
  const selectedSeeds = STANDARD_OPENING_SEEDS.slice(0, options.limit);

  for (const [seedIndex, seed] of selectedSeeds.entries()) {
    for (let variant = 0; variant < options.variants; variant += 1) {
      const openingSeed = options.seed + seedIndex * 9_973 + variant * 37_193;
      const line = generateLine(seed, variant + 1, openingSeed, options);
      lines.push(line);
      console.log(
        `${line.seed.id}/${line.variant}: ${line.stoppedReason}, plies=${line.moves.length}, seed=${openingSeed}`
      );
    }
  }

  const outputPath = path.resolve(ROOT_DIR, options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeSgfCollection(lines, options), "utf8");
  printSummary(lines, options);
}

function parseArgs(args: string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = token.slice(2).split("=", 2);

    if (key === "help") {
      printHelp();
      process.exit(0);
    }

    const value = inlineValue ?? args[index + 1];

    if (value === undefined) {
      throw new Error(`--${key} requires a value.`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    values.set(key, value);
  }

  return {
    difficulty: readDifficulty(values.get("difficulty") ?? "insane"),
    output: values.get("output") ?? DEFAULT_OUTPUT,
    plies: readInteger(values, "plies", 8, 3, BOARD_SIZE * BOARD_SIZE),
    seed: readInteger(values, "seed", 20_260_625, 0),
    timeLimitMs: readInteger(values, "time-limit-ms", 1_000, 0),
    variants: readInteger(values, "variants", 1, 1, 100),
    limit: readInteger(values, "limit", STANDARD_OPENING_SEEDS.length, 1, STANDARD_OPENING_SEEDS.length)
  };
}

function readDifficulty(value: string): AiDifficulty {
  if (value === "normal" || value === "hard" || value === "expert" || value === "insane") {
    return value;
  }

  throw new Error("--difficulty must be normal, hard, expert, or insane.");
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

function createSeeds(
  category: OpeningSeed["category"],
  whiteMove: RelativePoint,
  blackThirdMoves: Array<[string, string, number, number]>
): OpeningSeed[] {
  return blackThirdMoves.map(([id, name, row, col]) => ({
    id,
    name,
    category,
    moves: [{ row: 0, col: 0 }, whiteMove, { row, col }]
  }));
}

function generateLine(
  seed: OpeningSeed,
  variant: number,
  openingSeed: number,
  options: CliOptions
): GeneratedLine {
  let board = createBoard();
  const moves: Move[] = [];

  for (const relativePoint of seed.moves.slice(0, options.plies)) {
    const point = relativeToBoardPoint(relativePoint);
    const stone = getStoneForPly(moves.length);

    if (!isValidMove(board, point)) {
      return { seed, variant, openingSeed, moves, stoppedReason: "illegal-move" };
    }

    board = placeStone(board, point, stone);
    moves.push({ ...point, stone, moveNumber: moves.length + 1 });
  }

  while (moves.length < options.plies) {
    const stone = getStoneForPly(moves.length);
    const result = chooseAiMoveResult(board, stone, {
      difficulty: options.difficulty,
      moves,
      openingSeed,
      timeLimitMs: options.timeLimitMs
    });

    if (!result.point) {
      return { seed, variant, openingSeed, moves, stoppedReason: "no-move" };
    }

    if (!isValidMove(board, result.point)) {
      return { seed, variant, openingSeed, moves, stoppedReason: "illegal-move" };
    }

    board = placeStone(board, result.point, stone);
    moves.push({ ...result.point, stone, moveNumber: moves.length + 1 });
  }

  return { seed, variant, openingSeed, moves, stoppedReason: "target-plies" };
}

function serializeSgfCollection(lines: GeneratedLine[], options: CliOptions): string {
  return `${lines.map((line) => serializeSgfGameTree(line, options)).join("\n")}\n`;
}

function serializeSgfGameTree(line: GeneratedLine, options: CliOptions): string {
  const rootProperties = [
    "FF[4]",
    "GM[4]",
    `SZ[${BOARD_SIZE}]`,
    "CA[UTF-8]",
    "AP[gomoku-online:opening-book]",
    `GN[${escapeSgfValue(`${line.seed.id}-${line.seed.name}-v${line.variant}`)}]`,
    `RU[${escapeSgfValue("freestyle gomoku")}]`,
    `SO[${escapeSgfValue("standard 26 opening seeds + local engine rollout")}]`,
    `C[${escapeSgfValue(
      [
        `seedId=${line.seed.id}`,
        `seedName=${line.seed.name}`,
        `category=${line.seed.category}`,
        `difficulty=${options.difficulty}`,
        `timeLimitMs=${options.timeLimitMs}`,
        `openingSeed=${line.openingSeed}`,
        `stoppedReason=${line.stoppedReason}`
      ].join("; ")
    )}]`
  ].join("");
  const moveNodes = line.moves.map((move) => `;${move.stone === "black" ? "B" : "W"}[${toSgfPoint(move)}]`);

  return `(;${rootProperties}${moveNodes.join("")})`;
}

function toSgfPoint(point: Point): string {
  return `${String.fromCharCode(97 + point.col)}${String.fromCharCode(97 + point.row)}`;
}

function escapeSgfValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function relativeToBoardPoint(point: RelativePoint): Point {
  return {
    row: CENTER + point.row,
    col: CENTER + point.col
  };
}

function getStoneForPly(ply: number): Stone {
  return ply % 2 === 0 ? "black" : "white";
}

function printSummary(lines: GeneratedLine[], options: CliOptions): void {
  const complete = lines.filter((line) => line.stoppedReason === "target-plies").length;

  console.log("");
  console.log("Opening book rollout complete");
  console.log(`lines: ${complete}/${lines.length} reached ${options.plies} plies`);
  console.log(`difficulty: ${options.difficulty}`);
  console.log(`time limit: ${options.timeLimitMs}ms/move`);
  console.log(`output: ${options.output}`);
}

function printHelp(): void {
  console.log(`Usage:
  npm run opening-book -- --plies 8 --time-limit-ms 1000 --output .arena-results/generated-opening-book.sgf

Options:
  --difficulty <name>     normal, hard, expert, insane. Default: insane
  --plies <n>             Target plies for each generated line. Default: 8
  --time-limit-ms <n>     Per-move rollout budget. Default: 1000
  --variants <n>          Variants per standard opening seed. Default: 1
  --limit <n>             Number of standard 26 seeds to process. Default: 26
  --seed <n>              Deterministic base seed. Default: 20260625
  --output <path>         SGF output path. Default: ${DEFAULT_OUTPUT}`);
}

void main();
