import {
  chooseAiMoveResult,
  type AiDifficulty,
  type AiMoveSource,
  type AiRootCandidateShard
} from "./ai";
import type { Board, Move, Point, Stone } from "./types";

type AiWorkerRequest = {
  board: Board;
  moves: Move[];
  aiStone: Stone;
  difficulty: AiDifficulty;
  timeLimitMs: number;
  rootCandidateShard?: AiRootCandidateShard;
};

type AiWorkerResponse = {
  type: "best" | "done";
  point: Point | null;
  score?: number;
  completedDepth?: number;
  nodes?: number;
  source?: AiMoveSource;
};

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { board, moves, aiStone, difficulty, timeLimitMs, rootCandidateShard } = event.data;
  const result = chooseAiMoveResult(board, aiStone, {
    difficulty,
    moves,
    timeLimitMs,
    rootCandidateShard,
    onBestMove: (bestMove) => {
      self.postMessage({ type: "best", point: bestMove } satisfies AiWorkerResponse);
    }
  });

  self.postMessage({ type: "done", ...result } satisfies AiWorkerResponse);
};

export {};
