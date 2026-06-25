"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CircleDot, RotateCcw, Undo2, UserRound, Users, Wifi } from "lucide-react";
import {
  chooseAiMove,
  getAiTimeLimitMs,
  getAiWorkerCount,
  type AiDifficulty,
  type AiMoveSource
} from "@/game/ai";
import { createBoard, getGameResult, getOpponent, placeStone } from "@/game/board";
import type { Board, GameStatus, Move, Point, Stone } from "@/game/types";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import { GomokuBoard } from "./GomokuBoard";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type GameShellProps = {
  dictionary: GameDictionary;
  locale: Locale;
};

type GameMode = "local" | "ai";
type FirstPlayer = "human" | "ai";

type GameSnapshot = {
  board: Board;
  moves: Move[];
  nextPlayer: Stone;
  status: GameStatus;
};

type AiWorkerResponse = {
  type: "best" | "done";
  point: Point | null;
  score?: number;
  completedDepth?: number;
  nodes?: number;
  source?: AiMoveSource;
};

type AiWorkerDoneResult = {
  point: Point | null;
  score: number;
  completedDepth: number;
  nodes: number;
  source: AiMoveSource;
};

const AI_DIFFICULTIES: AiDifficulty[] = ["normal", "hard", "expert", "insane"];
const AI_WORKER_TIMEOUT_GRACE_MS = 750;
const AI_EMERGENCY_TIME_LIMIT_MS = 50;

export function GameShell({ dictionary, locale }: GameShellProps) {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [nextPlayer, setNextPlayer] = useState<Stone>("black");
  const [status, setStatus] = useState<GameStatus>({ state: "playing", nextPlayer: "black" });
  const [moves, setMoves] = useState<Move[]>([]);
  const [mode, setMode] = useState<GameMode>("local");
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [firstPlayer, setFirstPlayer] = useState<FirstPlayer>("human");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiWorkersRef = useRef<Worker[]>([]);
  const aiWorkerTimeoutRef = useRef<number | null>(null);
  const aiRequestIdRef = useRef(0);

  const winningKey = useMemo(() => {
    if (status.state !== "won") {
      return new Set<string>();
    }

    return new Set(status.line.map((point) => `${point.row}:${point.col}`));
  }, [status]);

  useEffect(() => {
    return () => {
      terminateAiWorkers();
      clearAiWorkerTimeout();
    };
  }, []);

  function resetGame({
    nextMode = mode,
    nextDifficulty = aiDifficulty,
    nextFirstPlayer = firstPlayer
  }: {
    nextMode?: GameMode;
    nextDifficulty?: AiDifficulty;
    nextFirstPlayer?: FirstPlayer;
  } = {}) {
    cancelAiTurn();
    const snapshot = createInitialGameState(nextMode, nextDifficulty, nextFirstPlayer);

    setBoard(snapshot.board);
    setNextPlayer(snapshot.nextPlayer);
    setStatus(snapshot.status);
    setMoves(snapshot.moves);
  }

  function handleModeChange(nextMode: GameMode) {
    setMode(nextMode);
    resetGame({ nextMode });
  }

  function handleDifficultyChange(difficulty: AiDifficulty) {
    setAiDifficulty(difficulty);
    resetGame({ nextDifficulty: difficulty });
  }

  function handleFirstPlayerChange(player: FirstPlayer) {
    setFirstPlayer(player);
    resetGame({ nextFirstPlayer: player });
  }

  function handleUndo() {
    cancelAiTurn();
    const aiStone = getAiStone(firstPlayer);

    if (moves.length === 0 || (mode === "ai" && firstPlayer === "ai" && moves.length <= 1)) {
      return;
    }

    const removeCount = mode === "ai" && moves.length >= 2 && moves.at(-1)?.stone === aiStone ? 2 : 1;
    const remainingMoves = moves.slice(0, Math.max(0, moves.length - removeCount));
    const nextBoard = replayMoves(remainingMoves);
    const nextStone = remainingMoves.length === 0 ? "black" : getOpponent(remainingMoves.at(-1)!.stone);

    setBoard(nextBoard);
    setMoves(remainingMoves);
    setNextPlayer(nextStone);
    setStatus({ state: "playing", nextPlayer: nextStone });
  }

  function handlePointSelect(point: Point) {
    const humanStone = getHumanStone(firstPlayer);

    if (status.state !== "playing") {
      return;
    }

    if (mode === "ai" && nextPlayer !== humanStone) {
      return;
    }

    try {
      const humanMove = {
        ...point,
        stone: nextPlayer,
        moveNumber: moves.length + 1
      };
      const nextBoard = placeStone(board, point, nextPlayer);
      const nextMoves = [...moves, humanMove];
      const result = getGameResult(nextBoard, point, nextPlayer);

      if (result.state !== "playing") {
        commitGameState(nextBoard, nextMoves, result);
        return;
      }

      if (mode === "ai") {
        commitGameState(nextBoard, nextMoves, result);
        void commitAiTurn(nextBoard, nextMoves, aiDifficulty, firstPlayer);
        return;
      }

      commitGameState(nextBoard, nextMoves, result);
    } catch {
      // Illegal clicks are intentionally ignored; the board remains authoritative.
    }
  }

  async function commitAiTurn(
    currentBoard: Board,
    currentMoves: Move[],
    difficulty: AiDifficulty,
    selectedFirstPlayer: FirstPlayer
  ) {
    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    setIsAiThinking(true);

    const aiStone = getAiStone(selectedFirstPlayer);
    const aiPoint = await requestAiMove(currentBoard, currentMoves, aiStone, difficulty);

    if (aiRequestIdRef.current !== requestId) {
      return;
    }

    setIsAiThinking(false);

    if (!aiPoint) {
      commitGameState(currentBoard, currentMoves, { state: "draw" });
      return;
    }

    const aiBoard = placeStone(currentBoard, aiPoint, aiStone);
    const aiMove = {
      ...aiPoint,
      stone: aiStone,
      moveNumber: currentMoves.length + 1
    };
    const aiMoves = [...currentMoves, aiMove];
    const aiResult = getGameResult(aiBoard, aiPoint, aiStone);

    commitGameState(aiBoard, aiMoves, aiResult);
  }

  function commitGameState(nextBoard: Board, nextMoves: Move[], nextStatus: GameStatus) {
    setBoard(nextBoard);
    setMoves(nextMoves);
    setStatus(nextStatus);
    setNextPlayer(nextStatus.state === "playing" ? nextStatus.nextPlayer : (nextMoves.at(-1)?.stone ?? "black"));
  }

  function cancelAiTurn() {
    aiRequestIdRef.current += 1;
    setIsAiThinking(false);
    terminateAiWorkers();
    clearAiWorkerTimeout();
  }

  function terminateAiWorkers() {
    for (const worker of aiWorkersRef.current) {
      worker.terminate();
    }

    aiWorkersRef.current = [];
  }

  function clearAiWorkerTimeout() {
    if (aiWorkerTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(aiWorkerTimeoutRef.current);
    aiWorkerTimeoutRef.current = null;
  }

  function requestAiMove(
    currentBoard: Board,
    currentMoves: Move[],
    aiStone: Stone,
    difficulty: AiDifficulty
  ): Promise<Point | null> {
    const timeLimitMs = getAiTimeLimitMs(difficulty);

    if (typeof Worker === "undefined") {
      return Promise.resolve(chooseAiMove(currentBoard, aiStone, { difficulty, moves: currentMoves, timeLimitMs }));
    }

    return new Promise((resolve) => {
      terminateAiWorkers();
      clearAiWorkerTimeout();
      let latestBestMove: Point | null = null;
      let bestResult: AiWorkerDoneResult | null = null;
      let completedWorkers = 0;
      let settled = false;
      const workerCount = getAiWorkerCount(difficulty, navigator.hardwareConcurrency);
      const workers = Array.from({ length: workerCount }, () =>
        new Worker(new URL("../game/ai-worker.ts", import.meta.url), {
          type: "module"
        })
      );

      aiWorkersRef.current = workers;

      const finishAiRequest = (point: Point | null) => {
        if (settled) {
          return;
        }

        settled = true;
        for (const worker of workers) {
          worker.terminate();
        }
        aiWorkersRef.current = aiWorkersRef.current.filter((activeWorker) => !workers.includes(activeWorker));

        clearAiWorkerTimeout();
        resolve(point);
      };

      const getEmergencyMove = () =>
        latestBestMove ??
        chooseAiMove(currentBoard, aiStone, {
          difficulty,
          moves: currentMoves,
          timeLimitMs: AI_EMERGENCY_TIME_LIMIT_MS
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
          aiStone,
          difficulty,
          timeLimitMs,
          rootCandidateShard: workerCount > 1 ? { index, total: workerCount } : undefined
        });
      });
    });
  }

  const lastMove = moves.at(-1) ?? null;
  const humanStone = getHumanStone(firstPlayer);
  const canUndo = !isAiThinking && (mode === "ai" && firstPlayer === "ai" ? moves.length > 1 : moves.length > 0);
  const canPlayPoint = !isAiThinking && status.state === "playing" && !(mode === "ai" && nextPlayer !== humanStone);

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label={dictionary.appName}>
        <header className="top-bar">
          <div>
            <p className="eyebrow">{dictionary.appName}</p>
            <h1>{dictionary.heroTitle}</h1>
          </div>
          <div className="top-actions">
            <LocaleSwitcher currentLocale={locale} label={dictionary.controls.language} />
            <ThemeToggle
              labels={{
                theme: dictionary.controls.theme,
                lightTheme: dictionary.controls.lightTheme,
                darkTheme: dictionary.controls.darkTheme
              }}
            />
            <button
              className="icon-button"
              type="button"
              onClick={handleUndo}
              aria-label={dictionary.controls.undo}
              disabled={!canUndo}
              title={dictionary.controls.undo}
            >
              <Undo2 aria-hidden="true" focusable={false} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => resetGame()}
              aria-label={dictionary.controls.reset}
              title={dictionary.controls.reset}
            >
              <RotateCcw aria-hidden="true" focusable={false} />
            </button>
          </div>
        </header>

        <div className="mode-strip" aria-label={dictionary.modes.label}>
          <button
            className={`mode-pill ${mode === "local" ? "active" : ""}`}
            type="button"
            onClick={() => handleModeChange("local")}
            disabled={isAiThinking}
          >
            <Users aria-hidden="true" focusable={false} />
            {dictionary.modes.local}
          </button>
          <button
            className={`mode-pill ${mode === "ai" ? "active" : ""}`}
            type="button"
            onClick={() => handleModeChange("ai")}
            disabled={isAiThinking}
          >
            <Bot aria-hidden="true" focusable={false} />
            {dictionary.modes.ai}
          </button>
          <button className="mode-pill" type="button" disabled>
            <Wifi aria-hidden="true" focusable={false} />
            {dictionary.modes.room}
          </button>
        </div>

        {mode === "ai" ? (
          <div className="difficulty-strip" aria-label={dictionary.ai.firstPlayerLabel}>
            <button
              className={`mode-pill ${firstPlayer === "human" ? "active" : ""}`}
              type="button"
              onClick={() => handleFirstPlayerChange("human")}
              disabled={isAiThinking}
            >
              <UserRound aria-hidden="true" focusable={false} />
              {dictionary.ai.humanFirst}
            </button>
            <button
              className={`mode-pill ${firstPlayer === "ai" ? "active" : ""}`}
              type="button"
              onClick={() => handleFirstPlayerChange("ai")}
              disabled={isAiThinking}
            >
              <Bot aria-hidden="true" focusable={false} />
              {dictionary.ai.aiFirst}
            </button>
          </div>
        ) : null}

        {mode === "ai" ? (
          <div className="difficulty-strip" aria-label={dictionary.ai.difficultyLabel}>
            {AI_DIFFICULTIES.map((difficulty) => (
              <button
                className={`mode-pill ${aiDifficulty === difficulty ? "active" : ""}`}
                key={difficulty}
                type="button"
                onClick={() => handleDifficultyChange(difficulty)}
                disabled={isAiThinking}
              >
                <CircleDot aria-hidden="true" focusable={false} />
                {dictionary.ai[difficulty]}
              </button>
            ))}
          </div>
        ) : null}

        <div className="play-area">
          <GomokuBoard
            board={board}
            isInteractive={canPlayPoint}
            labels={{
              board: dictionary.board.label,
              point: dictionary.board.point
            }}
            lastMove={lastMove}
            previewStone={nextPlayer}
            winningKey={winningKey}
            onPointSelect={handlePointSelect}
          />
        </div>
      </section>

      <aside className="side-panel" aria-label={dictionary.status.panelLabel}>
        <div className="status-card">
          <div className="status-title">
            <CircleDot aria-hidden="true" focusable={false} />
            {dictionary.status.title}
          </div>
          <p className="status-copy">{isAiThinking ? dictionary.ai.thinking : getStatusText(status, dictionary)}</p>
          <p className="status-note">
            {mode === "ai"
              ? humanStone === "black"
                ? dictionary.ai.playerBlackAiWhite
                : dictionary.ai.playerWhiteAiBlack
              : dictionary.modes.local}
          </p>
          <div className="stone-row">
            <span
              aria-label={dictionary.status.blackStone}
              className={`stone-preview black ${nextPlayer === "black" ? "active" : ""}`}
              role="img"
            />
            <span
              aria-label={dictionary.status.whiteStone}
              className={`stone-preview white ${nextPlayer === "white" ? "active" : ""}`}
              role="img"
            />
          </div>
        </div>

        <div className="status-card compact">
          <p className="metric-label">{dictionary.status.moves}</p>
          <strong>{moves.length}</strong>
        </div>

        <div className="ad-placeholder" aria-label={dictionary.ads.label}>
          {dictionary.ads.placeholder}
        </div>
      </aside>
    </main>
  );
}

function normalizeAiWorkerResult(response: AiWorkerResponse): AiWorkerDoneResult {
  return {
    point: response.point,
    score: response.score ?? Number.NEGATIVE_INFINITY,
    completedDepth: response.completedDepth ?? 0,
    nodes: response.nodes ?? 0,
    source: response.source ?? "none"
  };
}

function isBetterAiWorkerResult(
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

function isDecisiveAiWorkerResult(result: AiWorkerDoneResult): boolean {
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

function replayMoves(moves: Move[]): Board {
  return moves.reduce((currentBoard, move) => placeStone(currentBoard, move, move.stone), createBoard());
}

function createInitialGameState(
  mode: GameMode,
  aiDifficulty: AiDifficulty,
  firstPlayer: FirstPlayer
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
    timeLimitMs: getAiTimeLimitMs(aiDifficulty)
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

function getHumanStone(firstPlayer: FirstPlayer): Stone {
  return firstPlayer === "human" ? "black" : "white";
}

function getAiStone(firstPlayer: FirstPlayer): Stone {
  return getOpponent(getHumanStone(firstPlayer));
}

function getStatusText(status: GameStatus, dictionary: GameDictionary): string {
  if (status.state === "won") {
    return status.winner === "black" ? dictionary.status.blackWins : dictionary.status.whiteWins;
  }

  if (status.state === "draw") {
    return dictionary.status.draw;
  }

  return status.nextPlayer === "black" ? dictionary.status.blackTurn : dictionary.status.whiteTurn;
}
