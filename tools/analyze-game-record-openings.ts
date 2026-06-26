import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeGameRecordOpenings } from "../src/server/game-record-opening-analysis";
import { filterGameRecordsForExport, type GameRecordExportStatus } from "../src/server/game-record-export";
import { GameRecordStore } from "../src/server/game-records";

type AnalyzeOptions = {
  input: string;
  limit: number;
  minGames: number;
  output: string;
  prefixLength: number;
  status: GameRecordExportStatus;
};

const DEFAULT_INPUT = process.env.GOMOKU_GAME_RECORDS_PATH ?? "data/game-records/records.jsonl";
const DEFAULT_OUTPUT = ".arena-results/game-record-opening-analysis.json";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const store = new GameRecordStore({ filePath: options.input });
  const records = filterGameRecordsForExport(store.listRecords(options.limit), options.status);
  const analysis = analyzeGameRecordOpenings(records, {
    minGames: options.minGames,
    prefixLength: options.prefixLength
  });
  const outputPath = path.resolve(process.cwd(), options.output);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");

  console.log(
    `Analyzed ${analysis.recordsAnalyzed}/${analysis.recordsRead} ${options.status} game records into ${analysis.candidates.length} opening candidates at ${path.relative(process.cwd(), outputPath)}.`
  );
}

function parseArgs(args: string[]): AnalyzeOptions {
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
    input: values.get("input") ?? DEFAULT_INPUT,
    limit: readInteger(values.get("limit"), "limit", 10_000, 1, 100_000),
    minGames: readInteger(values.get("min-games"), "min-games", 1, 1, 100_000),
    output: values.get("output") ?? DEFAULT_OUTPUT,
    prefixLength: readInteger(values.get("prefix-length"), "prefix-length", 8, 1, 225),
    status: readStatus(values.get("status") ?? "verified")
  };
}

function readStatus(value: string): GameRecordExportStatus {
  if (value === "all" || value === "partial" || value === "verified" || value === "conflicted") {
    return value;
  }

  throw new Error("--status must be verified, partial, conflicted, or all.");
}

function readInteger(
  value: string | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${key} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function printHelp(): void {
  console.log(`Analyze saved online game records into opening candidates.

Usage:
  npm run analyze:openings -- --input data/game-records/records.jsonl --output .arena-results/game-record-opening-analysis.json

Options:
  --input <path>            JSONL record store path. Defaults to GOMOKU_GAME_RECORDS_PATH or data/game-records/records.jsonl.
  --output <path>           Output JSON file. Defaults to .arena-results/game-record-opening-analysis.json.
  --status <status>         verified, partial, conflicted, or all. Defaults to verified.
  --limit <number>          Maximum records to load. Defaults to 10000.
  --prefix-length <number>  Opening prefix length in moves. Defaults to 8.
  --min-games <number>      Minimum games required for a candidate. Defaults to 1.
`);
}

await main();
