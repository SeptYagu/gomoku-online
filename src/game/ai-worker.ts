import { chooseAiMove, type AiDifficulty } from "./ai";
import type { Board, Move, Point, Stone } from "./types";

type AiWorkerRequest = {
  board: Board;
  moves: Move[];
  aiStone: Stone;
  difficulty: AiDifficulty;
  timeLimitMs: number;
};

type AiWorkerResponse = {
  point: Point | null;
};

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { board, moves, aiStone, difficulty, timeLimitMs } = event.data;
  const point = chooseAiMove(board, aiStone, { difficulty, moves, timeLimitMs });

  self.postMessage({ point } satisfies AiWorkerResponse);
};

export {};
