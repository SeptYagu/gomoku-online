"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CircleDot, Users, Wifi } from "lucide-react";
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
import type { RoomSnapshot } from "@/server/rooms";
import { InteractionConfirmation } from "./InteractionConfirmation";
import {
  getModeChangeDecision,
  requiresOnlineLeaveConfirmation,
  resolveNextAiSettings,
  shouldDeferAiSettingChange
} from "./interaction-guards";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { GameTableView } from "./online/GameTableView";
import { OnlineJoiningView, OnlineLobbyView } from "./online/OnlineLobbyView";
import { TableSidebar } from "./online/TableSidebar";
import { createTableReplay, type TableReplayState } from "./online/table-replay";
import { deriveGameWorkspace, isOnlineWorkspaceEnabled, type GameMode } from "./online/workspace-state";
import { AiGameView, type FirstPlayer } from "./play/AiGameView";
import { LocalGameView } from "./play/LocalGameView";
import { useFriendRoom, type FriendRoomController } from "./useFriendRoom";

type GameShellProps = {
  dictionary: GameDictionary;
  locale: Locale;
};

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

type PendingTransition = {
  kind: "ai" | "online";
  nextMode: GameMode | null;
};

const AI_WORKER_TIMEOUT_GRACE_MS = 750;
const AI_EMERGENCY_TIME_LIMIT_MS = 50;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

export function GameShell({ dictionary, locale }: GameShellProps) {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [nextPlayer, setNextPlayer] = useState<Stone>("black");
  const [status, setStatus] = useState<GameStatus>({ state: "playing", nextPlayer: "black" });
  const [moves, setMoves] = useState<Move[]>([]);
  const [mode, setMode] = useState<GameMode>(() => getInitialGameMode());
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [firstPlayer, setFirstPlayer] = useState<FirstPlayer>("human");
  const [pendingDifficulty, setPendingDifficulty] = useState<AiDifficulty | null>(null);
  const [pendingFirstPlayer, setPendingFirstPlayer] = useState<FirstPlayer | null>(null);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tableReplay, setTableReplay] = useState<TableReplayState | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiWorkersRef = useRef<Worker[]>([]);
  const aiWorkerTimeoutRef = useRef<number | null>(null);
  const aiRequestIdRef = useRef(0);
  const openingSeedRef = useRef(createOpeningSeed());
  const friendRoom = useFriendRoom({ enabled: isOnlineWorkspaceEnabled(mode) });

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
    const openingSeed = createOpeningSeed();
    openingSeedRef.current = openingSeed;
    const snapshot = createInitialGameState(nextMode, nextDifficulty, nextFirstPlayer, openingSeed);

    setBoard(snapshot.board);
    setNextPlayer(snapshot.nextPlayer);
    setStatus(snapshot.status);
    setMoves(snapshot.moves);
  }

  function completeModeChange(nextMode: GameMode) {
    if (nextMode === "room") {
      cancelAiTurn();
      setMode(nextMode);
      return;
    }

    setTableReplay(null);

    const nextAiSettings = resolveNextAiSettings({
      aiDifficulty,
      firstPlayer,
      pendingDifficulty,
      pendingFirstPlayer
    });

    if (nextMode === "ai") {
      setAiDifficulty(nextAiSettings.aiDifficulty);
      setFirstPlayer(nextAiSettings.firstPlayer);
      setPendingDifficulty(null);
      setPendingFirstPlayer(null);
    }

    setMode(nextMode);
    resetGame({
      nextDifficulty: nextAiSettings.aiDifficulty,
      nextFirstPlayer: nextAiSettings.firstPlayer,
      nextMode
    });
  }

  function leaveOnlineRoomThen(nextMode: GameMode | null) {
    setIsTransitioning(true);
    friendRoom.leaveRoom((left) => {
      setIsTransitioning(false);

      if (!left) {
        return;
      }

      setPendingTransition(null);
      setTableReplay(null);
      if (nextMode) {
        completeModeChange(nextMode);
      }
    });
  }

  function handleModeChange(nextMode: GameMode) {
    const decision = getModeChangeDecision({
      currentMode: mode,
      localMoveCount: moves.length,
      nextMode,
      onlineRole: friendRoom.room?.role ?? null,
      onlineStatus: friendRoom.room?.snapshot.status ?? null
    });

    if (decision === "noop") {
      return;
    }

    if (decision === "confirm-ai" || decision === "confirm-online") {
      setPendingTransition({ kind: decision === "confirm-ai" ? "ai" : "online", nextMode });
      return;
    }

    if (mode === "room" && friendRoom.room) {
      leaveOnlineRoomThen(nextMode);
      return;
    }

    completeModeChange(nextMode);
  }

  function handleDifficultyChange(difficulty: AiDifficulty) {
    if (shouldDeferAiSettingChange(moves.length)) {
      setPendingDifficulty(difficulty === aiDifficulty ? null : difficulty);
      return;
    }

    setAiDifficulty(difficulty);
    setPendingDifficulty(null);
    resetGame({ nextDifficulty: difficulty });
  }

  function handleFirstPlayerChange(player: FirstPlayer) {
    if (shouldDeferAiSettingChange(moves.length)) {
      setPendingFirstPlayer(player === firstPlayer ? null : player);
      return;
    }

    setFirstPlayer(player);
    setPendingFirstPlayer(null);
    resetGame({ nextFirstPlayer: player });
  }

  function handleAiReset() {
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
    resetGame({ nextDifficulty: nextSettings.aiDifficulty, nextFirstPlayer: nextSettings.firstPlayer });
  }

  function handleOnlineLeaveRequest() {
    if (
      requiresOnlineLeaveConfirmation(friendRoom.room?.role ?? null, friendRoom.room?.snapshot.status ?? null)
    ) {
      setPendingTransition({ kind: "online", nextMode: null });
      return;
    }

    friendRoom.leaveRoom((left) => {
      if (left) {
        setTableReplay(null);
      }
    });
  }

  function confirmPendingTransition() {
    if (!pendingTransition) {
      return;
    }

    if (pendingTransition.kind === "online") {
      leaveOnlineRoomThen(pendingTransition.nextMode);
      return;
    }

    const nextMode = pendingTransition.nextMode;
    setPendingTransition(null);
    if (nextMode) {
      completeModeChange(nextMode);
    }
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
    if (mode === "room") {
      friendRoom.playMove(point);
      return;
    }

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
    const aiPoint = await requestAiMove(currentBoard, currentMoves, aiStone, difficulty, openingSeedRef.current);

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

  useEffect(() => {
    return () => {
      terminateAiWorkers();
      clearAiWorkerTimeout();
    };
  }, []);

  function requestAiMove(
    currentBoard: Board,
    currentMoves: Move[],
    aiStone: Stone,
    difficulty: AiDifficulty,
    openingSeed: number
  ): Promise<Point | null> {
    const timeLimitMs = getAiTimeLimitMs(difficulty);

    if (typeof Worker === "undefined") {
      return Promise.resolve(
        chooseAiMove(currentBoard, aiStone, { difficulty, moves: currentMoves, timeLimitMs, openingSeed })
      );
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
          openingSeed,
          rootCandidateShard: workerCount > 1 ? { index, total: workerCount } : undefined
        });
      });
    });
  }

  const roomSnapshot = friendRoom.room?.snapshot ?? null;
  const workspace = deriveGameWorkspace({
    hasRoom: roomSnapshot !== null,
    isJoiningRoom: friendRoom.isJoiningRoom,
    mode
  });
  const activeBoard = mode === "room" && roomSnapshot ? roomSnapshot.board : board;
  const activeMoves = mode === "room" ? (roomSnapshot?.moves ?? []) : moves;
  const activeStatus = mode === "room" ? getRoomGameStatus(roomSnapshot) : status;
  const activeNextPlayer =
    activeStatus.state === "playing" ? activeStatus.nextPlayer : (activeMoves.at(-1)?.stone ?? "black");
  const winningKey = useMemo(() => {
    if (activeStatus.state !== "won") {
      return new Set<string>();
    }

    return new Set(activeStatus.line.map((point) => `${point.row}:${point.col}`));
  }, [activeStatus]);
  const lastMove = activeMoves.at(-1) ?? null;
  const humanStone = getHumanStone(firstPlayer);
  const canUndo =
    mode !== "room" && !isAiThinking && (mode === "ai" && firstPlayer === "ai" ? moves.length > 1 : moves.length > 0);
  const canPlayPoint =
    mode === "room"
      ? friendRoom.canPlay
      : !isAiThinking && status.state === "playing" && !(mode === "ai" && nextPlayer !== humanStone);

  return (
    <>
      <main className={`app-shell ${workspace === "online-table" ? "table-shell" : ""}`}>
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
          </div>
        </header>

        <div className="mode-strip" aria-label={dictionary.modes.label}>
          <button
            className={`mode-pill ${mode === "local" ? "active" : ""}`}
            data-game-mode="local"
            type="button"
            onClick={() => handleModeChange("local")}
            disabled={isAiThinking || friendRoom.isJoiningRoom || isTransitioning}
          >
            <Users aria-hidden="true" focusable={false} />
            {dictionary.modes.local}
          </button>
          <button
            className={`mode-pill ${mode === "ai" ? "active" : ""}`}
            data-game-mode="ai"
            type="button"
            onClick={() => handleModeChange("ai")}
            disabled={isAiThinking || friendRoom.isJoiningRoom || isTransitioning}
          >
            <Bot aria-hidden="true" focusable={false} />
            {dictionary.modes.ai}
          </button>
          <button
            className={`mode-pill ${mode === "room" ? "active" : ""}`}
            data-game-mode="room"
            type="button"
            onClick={() => handleModeChange("room")}
            disabled={isAiThinking || friendRoom.isJoiningRoom || isTransitioning}
          >
            <Wifi aria-hidden="true" focusable={false} />
            {dictionary.modes.room}
          </button>
        </div>

        {pendingTransition ? (
          <InteractionConfirmation
            cancelLabel={dictionary.controls.cancel}
            confirmLabel={
              pendingTransition.kind === "online" ? dictionary.room.leaveRoom : dictionary.controls.switchMode
            }
            description={
              pendingTransition.kind === "online"
                ? dictionary.controls.onlineExitDescription
                : dictionary.controls.aiExitDescription
            }
            isSubmitting={isTransitioning}
            onCancel={() => setPendingTransition(null)}
            onConfirm={confirmPendingTransition}
            title={
              pendingTransition.kind === "online"
                ? dictionary.controls.onlineExitTitle
                : dictionary.controls.aiExitTitle
            }
          />
        ) : null}

        {workspace === "local" ? (
          <LocalGameView
            board={board}
            canPlay={canPlayPoint}
            canUndo={canUndo}
            dictionary={dictionary}
            lastMove={lastMove}
            nextPlayer={activeNextPlayer}
            onPointSelect={handlePointSelect}
            onReset={() => resetGame()}
            onUndo={handleUndo}
            winningKey={winningKey}
          />
        ) : null}

        {workspace === "ai" ? (
          <AiGameView
            aiDifficulty={aiDifficulty}
            board={board}
            canPlay={canPlayPoint}
            canUndo={canUndo}
            dictionary={dictionary}
            firstPlayer={firstPlayer}
            isAiThinking={isAiThinking}
            lastMove={lastMove}
            nextPlayer={activeNextPlayer}
            onCancelPendingSettings={() => {
              setPendingDifficulty(null);
              setPendingFirstPlayer(null);
            }}
            onDifficultyChange={handleDifficultyChange}
            onFirstPlayerChange={handleFirstPlayerChange}
            onPointSelect={handlePointSelect}
            onReset={handleAiReset}
            onUndo={handleUndo}
            pendingDifficulty={pendingDifficulty}
            pendingFirstPlayer={pendingFirstPlayer}
            winningKey={winningKey}
          />
        ) : null}

        {workspace === "online-lobby" ? (
          <OnlineLobbyView
            dictionary={dictionary}
            locale={locale}
            onPlayAi={() => handleModeChange("ai")}
            room={friendRoom}
          />
        ) : null}

        {workspace === "online-joining" ? (
          <OnlineJoiningView dictionary={dictionary} locale={locale} room={friendRoom} />
        ) : null}

        {workspace === "online-table" ? (
          <GameTableView
            board={activeBoard}
            dictionary={dictionary}
            isInteractive={canPlayPoint}
            lastMove={lastMove}
            onLeaveRequest={handleOnlineLeaveRequest}
            onPointSelect={handlePointSelect}
            onReplayChange={setTableReplay}
            previewStone={activeNextPlayer}
            replay={tableReplay}
            room={friendRoom}
            winningKey={winningKey}
          />
        ) : null}
      </section>

      {workspace === "online-table" ? (
        <aside className="side-panel table-side-panel" aria-label={dictionary.room.panelLabel}>
          <TableSidebar
            dictionary={dictionary}
            locale={locale}
            onReplayGame={(gameId, replayMoves) => setTableReplay(createTableReplay(gameId, replayMoves))}
            room={friendRoom}
          />
        </aside>
      ) : (
        <aside className="side-panel" aria-label={dictionary.status.panelLabel}>
        <div className="status-card">
          <div className="status-title">
            <CircleDot aria-hidden="true" focusable={false} />
            {dictionary.status.title}
          </div>
          <p className="status-copy">
            {mode === "room"
              ? getRoomStatusText(friendRoom, dictionary)
              : isAiThinking
                ? dictionary.ai.thinking
                : getStatusText(status, dictionary)}
          </p>
          <p className="status-note">
            {mode === "room"
              ? getRoomStatusNote(friendRoom, dictionary)
              : mode === "ai"
              ? humanStone === "black"
                ? dictionary.ai.playerBlackAiWhite
                : dictionary.ai.playerWhiteAiBlack
              : dictionary.modes.local}
          </p>
          <div className="stone-row">
            <span
              aria-label={dictionary.status.blackStone}
              className={`stone-preview black ${activeNextPlayer === "black" ? "active" : ""}`}
              role="img"
            />
            <span
              aria-label={dictionary.status.whiteStone}
              className={`stone-preview white ${activeNextPlayer === "white" ? "active" : ""}`}
              role="img"
            />
          </div>
        </div>

        <div className="status-card compact">
          <p className="metric-label">{dictionary.status.moves}</p>
          <strong>{activeMoves.length}</strong>
        </div>

        <div className="ad-placeholder" aria-label={dictionary.ads.label}>
          {dictionary.ads.placeholder}
        </div>
        </aside>
      )}
      </main>
      <footer className="app-version">version: {APP_VERSION}</footer>
    </>
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

function getHumanStone(firstPlayer: FirstPlayer): Stone {
  return firstPlayer === "human" ? "black" : "white";
}

function getAiStone(firstPlayer: FirstPlayer): Stone {
  return getOpponent(getHumanStone(firstPlayer));
}

function createOpeningSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}

function getInitialGameMode(): GameMode {
  if (typeof window === "undefined") {
    return "local";
  }

  return new URLSearchParams(window.location.search).has("room") ? "room" : "local";
}

function getRoomGameStatus(snapshot: RoomSnapshot | null): GameStatus {
  if (!snapshot) {
    return { state: "playing", nextPlayer: "black" };
  }

  if (snapshot.status === "finished") {
    return snapshot.winner ? { state: "won", winner: snapshot.winner, line: snapshot.winLine } : { state: "draw" };
  }

  if (snapshot.status === "abandoned") {
    return { state: "draw" };
  }

  return { state: "playing", nextPlayer: snapshot.currentTurn };
}

function getRoomStatusText(room: FriendRoomController, dictionary: GameDictionary): string {
  const snapshot = room.room?.snapshot;

  if (!snapshot) {
    return room.isJoiningRoom ? dictionary.room.joiningRoom : dictionary.room.notInRoom;
  }

  if (snapshot.status === "waiting") {
    return snapshot.players.length < 2 ? dictionary.room.waitingForOpponent : dictionary.room.waitingForReady;
  }

  if (snapshot.status === "ready") {
    return dictionary.room.readyToStart;
  }

  if (snapshot.status === "finished") {
    if (!snapshot.winner) {
      return dictionary.status.draw;
    }

    if (room.room?.role !== "player") {
      return snapshot.winner === "black" ? dictionary.status.blackWins : dictionary.status.whiteWins;
    }

    return snapshot.winner === room.room.seat ? dictionary.room.youWin : dictionary.room.youLose;
  }

  if (snapshot.status === "abandoned") {
    return dictionary.room.roomClosed;
  }

  if (room.room?.role === "player") {
    return snapshot.currentTurn === room.room.seat ? dictionary.room.yourTurn : dictionary.room.opponentTurn;
  }

  return snapshot.currentTurn === "black" ? dictionary.status.blackTurn : dictionary.status.whiteTurn;
}

function getRoomStatusNote(room: FriendRoomController, dictionary: GameDictionary): string {
  const snapshot = room.room?.snapshot;

  if (!snapshot) {
    return room.isJoiningRoom ? dictionary.room.joiningRoom : dictionary.room.createOrJoin;
  }

  return `${dictionary.room.roomCode}: ${snapshot.code} · ${dictionary.room.spectators}: ${snapshot.spectators.length}`;
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
