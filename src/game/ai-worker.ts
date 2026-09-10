import { chooseAiMoveResult } from "./ai";
import {
  describeInvalidAiWorkerRequest,
  type AiWorkerRequest,
  type AiWorkerResponse
} from "./ai-worker-request";

self.onmessage = (event: MessageEvent<unknown>) => {
  const invalid = describeInvalidAiWorkerRequest(event.data);

  if (invalid) {
    self.postMessage({ type: "error", point: null, message: invalid } satisfies AiWorkerResponse);
    return;
  }

  const { board, moves, aiStone, difficulty, timeLimitMs, rootCandidateShard, openingSeed } =
    event.data as AiWorkerRequest;

  try {
    const result = chooseAiMoveResult(board, aiStone, {
      difficulty,
      moves,
      timeLimitMs,
      rootCandidateShard,
      openingSeed,
      onBestMove: (bestMove) => {
        self.postMessage({ type: "best", point: bestMove } satisfies AiWorkerResponse);
      }
    });

    self.postMessage({ type: "done", ...result } satisfies AiWorkerResponse);
  } catch (error) {
    // Never leave the caller waiting on the watchdog: report the failure so it
    // can finish this request immediately and fall back to a synchronous move.
    self.postMessage({
      type: "error",
      point: null,
      message: error instanceof Error ? error.message : String(error)
    } satisfies AiWorkerResponse);
  }
};

export {};
