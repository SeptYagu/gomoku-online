"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  chooseAiMove,
  getAiTimeLimitMs,
  getAiWorkerCount,
  type AiDifficulty,
  type AiMoveSource
} from "@/game/ai";
import { AiWorkerPool } from "@/game/ai-worker-pool";
import { createBoard, getGameResult, getOpponent, placeStone } from "@/game/board";
import type { Board, GameStatus, Move, Point, Stone } from "@/game/types";
import {
  resolveNextAiSettings,
  shouldDeferAiSettingChange
} from "../interaction-guards";
import type { GameMode } from "../online/workspace-state";
import type { FirstPlayer } from "../play/AiGameView";

export type GameSnapshot = {
  board: Board;
  moves: Move[];
  nextPlayer: Stone;
  status: GameStatus;
};

export type AiWorkerResponse = {
  type: "best" | "done" | "error";
  point: Point | null;
  message?: string;
  score?: number;
  completedDepth?: number;
  nodes?: number;
  source?: AiMoveSource;
};

export type AiWorkerDoneResult = {
  point: Point | null;
  score: number;
  completedDepth: number;
  nodes: number;
  source: AiMoveSource;
};

export const AI_WORKER_TIMEOUT_GRACE_MS = 750;
export const AI_EMERGENCY_TIME_LIMIT_MS = 50;

export type UseAiGameOptions = {
  mode: GameMode;
  moves: Move[];
  onCommitGameState: (board: Board, moves: Move[], status: GameStatus) => void;
  onResetGame: (options?: { nextDifficulty?: AiDifficulty; nextFirstPlayer?: FirstPlayer }) => void;
};

export function useAiGame({
  mode,
  moves,
  onCommitGameState,
  onResetGame
}: UseAiGameOptions) {
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [firstPlayer, setFirstPlayer] = useState<FirstPlayer>("human");
  const [pendingDifficulty, setPendingDifficulty] = useState<AiDifficulty | null>(null);
  const [pendingFirstPlayer, setPendingFirstPlayer] = useState<FirstPlayer | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiThinkingCountdown, setAiThinkingCountdown] = useState<number | null>(null);

  const aiWorkersRef = useRef<Worker[]>([]);
  const aiWorkerPoolRef = useRef<AiWorkerPool | null>(null);
  const aiWorkerTimeoutRef = useRef<number | null>(null);
  const aiCountdownIntervalRef = useRef<number | null>(null);
  const aiRequestIdRef = useRef(0);
  const openingSeedRef = useRef(createOpeningSeed());

  const movesCount = moves.length;
  const onResetGameRef = useRef(onResetGame);
  const onCommitGameStateRef = useRef(onCommitGameState);

  useEffect(() => {
    onResetGameRef.current = onResetGame;
    onCommitGameStateRef.current = onCommitGameState;
  });

  const aiStone = useMemo(() => getAiStone(firstPlayer), [firstPlayer]);
  const humanStone = useMemo(() => getHumanStone(firstPlayer), [firstPlayer]);

  function getAiWorkerPool(): AiWorkerPool {
    if (!aiWorkerPoolRef.current) {
      aiWorkerPoolRef.current = new AiWorkerPool();
    }
    return aiWorkerPoolRef.current;
  }

  function terminateAiWorkers() {
    if (aiWorkerPoolRef.current && aiWorkersRef.current.length > 0) {
      aiWorkerPoolRef.current.terminateBusy(aiWorkersRef.current);
    }
    aiWorkersRef.current = [];
  }

  function clearAiCountdownInterval() {
    if (aiCountdownIntervalRef.current !== null) {
      window.clearInterval(aiCountdownIntervalRef.current);
      aiCountdownIntervalRef.current = null;
    }
  }

  function clearAiWorkerTimeout() {
    if (aiWorkerTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(aiWorkerTimeoutRef.current);
    aiWorkerTimeoutRef.current = null;
  }

  const cancelAiTurn = useCallback(() => {
    aiRequestIdRef.current += 1;
    setIsAiThinking(false);
    setAiThinkingCountdown(null);
    clearAiCountdownInterval();
    terminateAiWorkers();
    clearAiWorkerTimeout();
  }, []);

  useEffect(() => {
    return () => {
      clearAiCountdownInterval();
      terminateAiWorkers();
      aiWorkerPoolRef.current?.terminateAll();
      clearAiWorkerTimeout();
    };
  }, []);

  const requestAiMove = useCallback((
    currentBoard: Board,
    currentMoves: Move[],
    targetAiStone: Stone,
    difficulty: AiDifficulty,
    openingSeed: number
  ): Promise<Point | null> => {
    const timeLimitMs = getAiTimeLimitMs(difficulty);

    if (typeof Worker === "undefined") {
      return Promise.resolve(
        chooseAiMove(currentBoard, targetAiStone, { difficulty, moves: currentMoves, timeLimitMs, openingSeed })
      );
    }

    return new Promise((resolve) => {
      terminateAiWorkers();
      clearAiWorkerTimeout();
      let latestBestMove: Point | null = null;
      let bestResult: AiWorkerDoneResult | null = null;
      let completedWorkers = 0;
      let settled = false;
      const pool = getAiWorkerPool();
      const workerCount = getAiWorkerCount(difficulty, navigator.hardwareConcurrency);
      const workers = pool.acquire(workerCount);

      aiWorkersRef.current = workers;

      const finishAiRequest = (point: Point | null) => {
        if (settled) {
          return;
        }

        settled = true;
        pool.releaseAll(workers);
        aiWorkersRef.current = aiWorkersRef.current.filter((activeWorker) => !workers.includes(activeWorker));

        clearAiWorkerTimeout();
        resolve(point);
      };

      const getEmergencyMove = () =>
        latestBestMove ??
        chooseAiMove(currentBoard, targetAiStone, {
          difficulty,
          moves: currentMoves,
          timeLimitMs: AI_EMERGENCY_TIME_LIMIT_MS,
          openingSeed
        });

      aiWorkerTimeoutRef.current = window.setTimeout(() => {
        finishAiRequest(bestResult?.point ?? latestBestMove ?? getEmergencyMove());
      }, timeLimitMs + AI_WORKER_TIMEOUT_GRACE_MS);

      const markWorkerComplete = () => {
        completedWorkers += 1;

        if (completedWorkers >= workers.length) {
          finishAiRequest(bestResult?.point ?? latestBestMove ?? getEmergencyMove());
        }
      };

      workers.forEach((worker, index) => {
        worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
          if (settled) {
            return;
          }

          if (event.data.type === "best") {
            latestBestMove = event.data.point ?? latestBestMove;
            return;
          }

          if (event.data.type === "error") {
            markWorkerComplete();
            return;
          }

          const result = normalizeAiWorkerResult(event.data);

          if (isBetterAiWorkerResult(result, bestResult, currentBoard)) {
            bestResult = result;
          }

          if (result.point) {
            latestBestMove = result.point;
          }

          if (isDecisiveAiWorkerResult(result)) {
            finishAiRequest(result.point);
            return;
          }

          markWorkerComplete();
        };

        worker.onerror = () => {
          if (!settled) {
            markWorkerComplete();
          }
        };

        worker.postMessage({
          board: currentBoard,
          moves: currentMoves,
          aiStone: targetAiStone,
          difficulty,
          timeLimitMs,
          openingSeed,
          rootCandidateShard: workerCount > 1 ? { index, total: workerCount } : undefined
        });
      });
    });
  }, []);

  const commitAiTurn = useCallback(async (
    currentBoard: Board,
    currentMoves: Move[],
    targetDifficulty: AiDifficulty = aiDifficulty,
    targetFirstPlayer: FirstPlayer = firstPlayer
  ) => {
    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    setIsAiThinking(true);

    const timeLimitMs = getAiTimeLimitMs(targetDifficulty);
    const initialSeconds = computeAiThinkingSeconds(timeLimitMs, 0);
    setAiThinkingCountdown(initialSeconds);
    clearAiCountdownInterval();

    const startTime = Date.now();
    aiCountdownIntervalRef.current = window.setInterval(() => {
      const remainingSec = computeAiThinkingSeconds(timeLimitMs, Date.now() - startTime);
      setAiThinkingCountdown((prev) => (prev !== remainingSec ? remainingSec : prev));
    }, 250);

    try {
      const targetAiStone = getAiStone(targetFirstPlayer);
      const aiPoint = await requestAiMove(
        currentBoard,
        currentMoves,
        targetAiStone,
        targetDifficulty,
        openingSeedRef.current
      );

      if (aiRequestIdRef.current !== requestId) {
        return;
      }

      setIsAiThinking(false);
      setAiThinkingCountdown(null);

      if (!aiPoint) {
        onCommitGameStateRef.current(currentBoard, currentMoves, { state: "draw" });
        return;
      }

      const nextAiBoard = placeStone(currentBoard, aiPoint, targetAiStone);
      const aiMove: Move = {
        ...aiPoint,
        stone: targetAiStone,
        moveNumber: currentMoves.length + 1
      };
      const nextAiMoves = [...currentMoves, aiMove];
      const aiResult = getGameResult(nextAiBoard, aiPoint, targetAiStone);

      onCommitGameStateRef.current(nextAiBoard, nextAiMoves, aiResult);
    } finally {
      clearAiCountdownInterval();
      if (aiRequestIdRef.current === requestId) {
        setAiThinkingCountdown(null);
      }
    }
  }, [aiDifficulty, firstPlayer, requestAiMove]);

  const handleDifficultyChange = useCallback((difficulty: AiDifficulty) => {
    if (shouldDeferAiSettingChange(movesCount)) {
      setPendingDifficulty(difficulty === aiDifficulty ? null : difficulty);
      return;
    }

    setAiDifficulty(difficulty);
    setPendingDifficulty(null);
    onResetGameRef.current({ nextDifficulty: difficulty });
  }, [aiDifficulty, movesCount]);

  const handleFirstPlayerChange = useCallback((player: FirstPlayer) => {
    if (shouldDeferAiSettingChange(movesCount)) {
      setPendingFirstPlayer(player === firstPlayer ? null : player);
      return;
    }

    setFirstPlayer(player);
    setPendingFirstPlayer(null);
    onResetGameRef.current({ nextFirstPlayer: player });
  }, [firstPlayer, movesCount]);

  const handleAiReset = useCallback(() => {
    const nextSettings = resolveNextAiSettings({
      aiDifficulty,
      firstPlayer,
      pendingDifficulty,
      pendingFirstPlayer
    });

    setAiDifficulty(nextSettings.aiDifficulty);
    setFirstPlayer(nextSettings.firstPlayer);
    setPendingDifficulty(null);
    setPendingFirstPlayer(null);
    onResetGameRef.current({
      nextDifficulty: nextSettings.aiDifficulty,
      nextFirstPlayer: nextSettings.firstPlayer
    });
  }, [aiDifficulty, firstPlayer, pendingDifficulty, pendingFirstPlayer]);

  const cancelPendingSettings = useCallback(() => {
    setPendingDifficulty(null);
    setPendingFirstPlayer(null);
  }, []);

  const applyPendingSettingsOnModeEnter = useCallback(() => {
    const nextSettings = resolveNextAiSettings({
      aiDifficulty,
      firstPlayer,
      pendingDifficulty,
      pendingFirstPlayer
    });

    setAiDifficulty(nextSettings.aiDifficulty);
    setFirstPlayer(nextSettings.firstPlayer);
    setPendingDifficulty(null);
    setPendingFirstPlayer(null);

    return nextSettings;
  }, [aiDifficulty, firstPlayer, pendingDifficulty, pendingFirstPlayer]);

  const createInitialSnapshot = useCallback((
    targetMode: GameMode = mode,
    targetDifficulty: AiDifficulty = aiDifficulty,
    targetFirstPlayer: FirstPlayer = firstPlayer
  ): GameSnapshot => {
    const newSeed = createOpeningSeed();
    openingSeedRef.current = newSeed;
    return createInitialGameState(targetMode, targetDifficulty, targetFirstPlayer, newSeed);
  }, [aiDifficulty, firstPlayer, mode]);

  return {
    aiDifficulty,
    setAiDifficulty,
    firstPlayer,
    setFirstPlayer,
    pendingDifficulty,
    pendingFirstPlayer,
    isAiThinking,
    aiThinkingCountdown,
    aiStone,
    humanStone,
    handleDifficultyChange,
    handleFirstPlayerChange,
    handleAiReset,
    cancelPendingSettings,
    commitAiTurn,
    cancelAiTurn,
    applyPendingSettingsOnModeEnter,
    createInitialSnapshot
  };
}

export function computeAiThinkingSeconds(timeLimitMs: number, elapsedMs: number): number {
  const remainingMs = Math.max(0, timeLimitMs - elapsedMs);
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export function normalizeAiWorkerResult(response: AiWorkerResponse): AiWorkerDoneResult {
  return {
    point: response.point,
    score: response.score ?? Number.NEGATIVE_INFINITY,
    completedDepth: response.completedDepth ?? 0,
    nodes: response.nodes ?? 0,
    source: response.source ?? "none"
  };
}

export function isBetterAiWorkerResult(
  next: AiWorkerDoneResult,
  current: AiWorkerDoneResult | null,
  board: Board
): boolean {
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

export function isDecisiveAiWorkerResult(result: AiWorkerDoneResult): boolean {
  return (
    result.point !== null &&
    result.source !== "search" &&
    result.source !== "none" &&
    result.source !== "empty-shard"
  );
}

export function getCenterDistance(point: Point, board: Board): number {
  const center = Math.floor(board.length / 2);

  return Math.abs(point.row - center) + Math.abs(point.col - center);
}

export function replayMoves(moves: Move[]): Board {
  return moves.reduce((currentBoard, move) => placeStone(currentBoard, move, move.stone), createBoard());
}

export function createInitialGameState(
  mode: GameMode,
  aiDifficulty: AiDifficulty,
  firstPlayer: FirstPlayer,
  openingSeed: number
): GameSnapshot {
  const emptyBoard = createBoard();

  if (mode !== "ai" || firstPlayer !== "ai") {
    return {
      board: emptyBoard,
      moves: [],
      nextPlayer: "black",
      status: { state: "playing", nextPlayer: "black" }
    };
  }

  const aiStone = getAiStone(firstPlayer);
  const aiPoint = chooseAiMove(emptyBoard, aiStone, {
    difficulty: aiDifficulty,
    timeLimitMs: getAiTimeLimitMs(aiDifficulty),
    openingSeed
  });

  if (!aiPoint) {
    return {
      board: emptyBoard,
      moves: [],
      nextPlayer: "black",
      status: { state: "draw" }
    };
  }

  const board = placeStone(emptyBoard, aiPoint, aiStone);
  const moves: Move[] = [{ ...aiPoint, stone: aiStone, moveNumber: 1 }];
  const status = getGameResult(board, aiPoint, aiStone);

  return {
    board,
    moves,
    nextPlayer: status.state === "playing" ? status.nextPlayer : aiStone,
    status
  };
}

export function getHumanStone(firstPlayer: FirstPlayer): Stone {
  return firstPlayer === "human" ? "black" : "white";
}

export function getAiStone(firstPlayer: FirstPlayer): Stone {
  return getOpponent(getHumanStone(firstPlayer));
}

export function createOpeningSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}
