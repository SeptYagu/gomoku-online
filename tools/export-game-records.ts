import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  filterGameRecordsForExport,
  serializeGameRecordsForExport,
  type GameRecordExportFormat,
  type GameRecordExportStatus
} from "../src/server/game-record-export";
import { GameRecordStore } from "../src/server/game-records";

type ExportOptions = {
  format: GameRecordExportFormat;
  input: string;
  limit: number;
  output: string;
  status: GameRecordExportStatus;
};

const DEFAULT_INPUT = process.env.GOMOKU_GAME_RECORDS_PATH ?? "data/game-records/records.jsonl";
const DEFAULT_OUTPUT = ".arena-results/game-records-export.sgf";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const store = new GameRecordStore({ filePath: options.input });
  const records = filterGameRecordsForExport(store.listRecords(options.limit), options.status);
  const content = serializeGameRecordsForExport(records, options.format);
  const outputPath = path.resolve(process.cwd(), options.output);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");

  console.log(
    `Exported ${records.length} ${options.status} game records to ${path.relative(process.cwd(), outputPath)} (${options.format}).`
  );
}

function parseArgs(args: string[]): ExportOptions {
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

  const output = values.get("output") ?? DEFAULT_OUTPUT;

  return {
    format: readFormat(values.get("format") ?? inferFormat(output)),
    input: values.get("input") ?? DEFAULT_INPUT,
    limit: readLimit(values.get("limit")),
    output,
    status: readStatus(values.get("status") ?? "verified")
  };
}

function readFormat(value: string): GameRecordExportFormat {
  if (value === "jsonl" || value === "sgf") {
    return value;
  }

  throw new Error("--format must be sgf or jsonl.");
}

function readStatus(value: string): GameRecordExportStatus {
  if (value === "all" || value === "partial" || value === "verified" || value === "conflicted") {
    return value;
  }

  throw new Error("--status must be verified, partial, conflicted, or all.");
}

function readLimit(value: string | undefined): number {
  if (!value) {
    return 10_000;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100_000) {
    throw new Error("--limit must be an integer between 1 and 100000.");
  }

  return parsed;
}

function inferFormat(output: string): GameRecordExportFormat {
  return output.toLowerCase().endsWith(".jsonl") ? "jsonl" : "sgf";
}

function printHelp(): void {
  console.log(`Export saved online game records.

Usage:
  npm run export:game-records -- --input data/game-records/records.jsonl --output .arena-results/game-records.sgf

Options:
  --input <path>       JSONL record store path. Defaults to GOMOKU_GAME_RECORDS_PATH or data/game-records/records.jsonl.
  --output <path>      Output file. Defaults to .arena-results/game-records-export.sgf.
  --format <sgf|jsonl> Output format. Inferred from --output when omitted.
  --status <status>    verified, partial, conflicted, or all. Defaults to verified.
  --limit <number>     Maximum records to load. Defaults to 10000.
`);
}

await main();
