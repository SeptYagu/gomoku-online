"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  CircleDot,
  Copy,
  Eye,
  Flag,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Send,
  Undo2,
  UserRound,
  Users,
  Wifi,
  X
} from "lucide-react";
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
import type { RoomSnapshot, UndoRequestSnapshot } from "@/server/rooms";
import { GomokuBoard } from "./GomokuBoard";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useFriendRoom, type FriendRoomController } from "./useFriendRoom";

type GameShellProps = {
  dictionary: GameDictionary;
  locale: Locale;
};

type GameMode = "local" | "ai" | "room";
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
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

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
  const openingSeedRef = useRef(createOpeningSeed());
  const friendRoom = useFriendRoom();

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

  function handleModeChange(nextMode: GameMode) {
    if (nextMode === "room") {
      cancelAiTurn();
      setMode(nextMode);
      return;
    }

    if (mode === "room") {
      friendRoom.leaveRoom();
    }

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
  const activeBoard = mode === "room" && roomSnapshot ? roomSnapshot.board : board;
  const activeMoves = mode === "room" && roomSnapshot ? roomSnapshot.moves : moves;
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
          <button
            className={`mode-pill ${mode === "room" ? "active" : ""}`}
            type="button"
            onClick={() => handleModeChange("room")}
            disabled={isAiThinking}
          >
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

        {mode !== "room" ? (
          <div className="game-actions">
            <button className="mode-pill" disabled={!canUndo} onClick={handleUndo} type="button">
              <Undo2 aria-hidden="true" focusable={false} />
              {dictionary.controls.undo}
            </button>
            <button className="mode-pill" disabled={isAiThinking} onClick={() => resetGame()} type="button">
              <RotateCcw aria-hidden="true" focusable={false} />
              {dictionary.controls.reset}
            </button>
          </div>
        ) : null}

        {mode === "room" ? <FriendRoomControls dictionary={dictionary} room={friendRoom} /> : null}

        <div className="play-area">
          <GomokuBoard
            board={activeBoard}
            isInteractive={canPlayPoint}
            labels={{
              board: dictionary.board.label,
              point: dictionary.board.point
            }}
            lastMove={lastMove}
            previewStone={activeNextPlayer}
            winningKey={winningKey}
            onPointSelect={handlePointSelect}
          />
          {mode === "room" ? <RoomUndoRequestOverlay dictionary={dictionary} room={friendRoom} /> : null}
        </div>
      </section>

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

function FriendRoomControls({
  dictionary,
  room
}: {
  dictionary: GameDictionary;
  room: FriendRoomController;
}) {
  const labels = dictionary.room;
  const snapshot = room.room?.snapshot ?? null;
  const selfPlayer =
    room.room?.role === "player" ? snapshot?.players.find((player) => player.seat === room.room?.seat) : null;
  const remainingUndoRequests = selfPlayer?.undoRequestsRemaining ?? 0;

  return (
    <div className="room-panel" aria-label={labels.panelLabel}>
      <div className="room-fields">
        <label className="room-field">
          <span>{labels.playerName}</span>
          <input
            maxLength={24}
            onChange={(event) => room.setPlayerName(event.target.value)}
            placeholder={labels.playerNamePlaceholder}
            type="text"
            value={room.playerName}
          />
        </label>
        <label className="room-field">
          <span>{labels.roomCode}</span>
          <input
            maxLength={8}
            onChange={(event) => room.setJoinCode(event.target.value)}
            placeholder={labels.roomCodePlaceholder}
            type="text"
            value={room.joinCode}
          />
        </label>
      </div>

      <div className="room-actions">
        <button className="mode-pill" onClick={room.createRoom} type="button">
          <Wifi aria-hidden="true" focusable={false} />
          {labels.createRoom}
        </button>
        <button className="mode-pill" onClick={room.joinRoom} type="button">
          <LogOut aria-hidden="true" focusable={false} />
          {labels.joinRoom}
        </button>
        {snapshot ? (
          <button className="mode-pill" onClick={room.copyInvite} type="button">
            <Copy aria-hidden="true" focusable={false} />
            {room.copiedInvite ? labels.copied : labels.copyInvite}
          </button>
        ) : null}
      </div>

      <PublicChatPanel dictionary={dictionary} room={room} />

      <RoomLobbyList dictionary={dictionary} room={room} />

      {snapshot ? (
        <div className="room-summary">
          <div>
            <p className="metric-label">{labels.roomCode}</p>
            <strong>{snapshot.code}</strong>
          </div>
          <div>
            <p className="metric-label">{labels.yourSeat}</p>
            <strong>
              {room.room?.role === "spectator"
                ? labels.spectatorSeat
                : room.room?.seat === "black"
                  ? labels.blackSeat
                  : labels.whiteSeat}
            </strong>
          </div>
          <div>
            <p className="metric-label">{labels.spectators}</p>
            <strong>{snapshot.spectators.length}</strong>
          </div>
          <div>
            <p className="metric-label">{labels.connection}</p>
            <strong>{room.connectionStatus === "connected" ? labels.connected : labels.disconnected}</strong>
          </div>
        </div>
      ) : null}

      {snapshot ? (
        <div className="room-players">
          {snapshot.players.map((player) => (
            <div className="room-player" key={player.seat}>
              <span
                aria-label={player.seat === "black" ? dictionary.status.blackStone : dictionary.status.whiteStone}
                className={`stone-preview ${player.seat}`}
                role="img"
              />
              <div>
                <strong>
                  {player.name}
                  {player.seat === room.room?.seat ? ` ${labels.you}` : ""}
                </strong>
                <p>
                  {player.ready ? labels.ready : labels.notReady}
                  {" · "}
                  {player.connected ? labels.connected : labels.disconnected}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {snapshot?.spectators.length ? (
        <div className="room-spectators">
          <p className="metric-label">{labels.spectators}</p>
          <div className="room-players">
            {snapshot.spectators.map((spectator) => (
              <div className="room-player" key={`${spectator.name}-${spectator.joinedAt}`}>
                <Users aria-hidden="true" className="room-spectator-icon" focusable={false} />
                <div>
                  <strong>
                    {spectator.name}
                    {room.room?.role === "spectator" && spectator.name === room.room.name ? ` ${labels.you}` : ""}
                  </strong>
                  <p>{spectator.connected ? labels.connected : labels.disconnected}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot ? <RoomChatPanel dictionary={dictionary} room={room} /> : null}

      {snapshot ? (
        <div className="room-actions">
          {room.canReady ? (
            <button
              className={`mode-pill ${room.ready ? "danger" : "success"}`}
              onClick={room.toggleReady}
              type="button"
            >
              <Check aria-hidden="true" focusable={false} />
              {room.ready ? labels.unready : labels.readyAction}
            </button>
          ) : null}
          <button className="mode-pill" disabled={!room.canUndo} onClick={room.undoMove} type="button">
            <Undo2 aria-hidden="true" focusable={false} />
            {dictionary.controls.undo} ({remainingUndoRequests})
          </button>
          <button className="mode-pill" disabled={!room.canResign} onClick={room.resignGame} type="button">
            <Flag aria-hidden="true" focusable={false} />
            {labels.resign}
          </button>
          <button className="mode-pill" disabled={!room.canRestart} onClick={room.restartGame} type="button">
            <RotateCcw aria-hidden="true" focusable={false} />
            {labels.restartRoom}
          </button>
          <button className="mode-pill" onClick={room.leaveRoom} type="button">
            <LogOut aria-hidden="true" focusable={false} />
            {labels.leaveRoom}
          </button>
        </div>
      ) : null}

      {room.room ? (
        <p className="room-message">
          {(room.room.role === "spectator" ? labels.spectatorStatus : labels.selfStatus).replace(
            "{name}",
            room.room.name || selfPlayer?.name || room.playerName
          )}
        </p>
      ) : null}
      {room.error ? <p className="room-error">{room.error}</p> : null}
    </div>
  );
}

function PublicChatPanel({
  dictionary,
  room
}: {
  dictionary: GameDictionary;
  room: FriendRoomController;
}) {
  const labels = dictionary.room;
  const { refreshPublicChat } = room;

  useEffect(() => {
    refreshPublicChat();
  }, [refreshPublicChat]);

  return (
    <section aria-label={labels.publicChat} className="room-chat public-chat">
      <div className="room-chat-header">
        <p className="metric-label">{labels.publicChat}</p>
      </div>
      <div aria-live="polite" className="room-chat-list" role="log">
        {room.publicChatMessages.length > 0 ? (
          room.publicChatMessages.map((message) => (
            <div className="room-chat-message" key={message.id}>
              <div className="room-chat-meta">
                <strong>{message.name}</strong>
                <span>{formatChatMessageTime(message.sentAt)}</span>
              </div>
              <p>{message.text}</p>
            </div>
          ))
        ) : (
          <p className="room-message">{labels.noMessages}</p>
        )}
      </div>
      <form
        className="room-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          room.sendPublicChatMessage();
        }}
      >
        <input
          maxLength={160}
          onChange={(event) => room.setPublicChatText(event.target.value)}
          placeholder={labels.publicChatPlaceholder}
          type="text"
          value={room.publicChatText}
        />
        <button
          className="icon-button"
          disabled={!room.publicChatText.trim()}
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}

function RoomChatPanel({
  dictionary,
  room
}: {
  dictionary: GameDictionary;
  room: FriendRoomController;
}) {
  const labels = dictionary.room;
  const messages = room.room?.snapshot.chatMessages ?? [];

  return (
    <section aria-label={labels.roomChat} className="room-chat">
      <div className="room-chat-header">
        <p className="metric-label">{labels.roomChat}</p>
      </div>
      <div aria-live="polite" className="room-chat-list" role="log">
        {messages.length > 0 ? (
          messages.map((message) => (
            <div className="room-chat-message" key={message.id}>
              <div className="room-chat-meta">
                <strong>{message.name}</strong>
                <span>{formatChatMessageTime(message.sentAt)}</span>
              </div>
              <p>{message.text}</p>
            </div>
          ))
        ) : (
          <p className="room-message">{labels.noMessages}</p>
        )}
      </div>
      <form
        className="room-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          room.sendChatMessage();
        }}
      >
        <input
          maxLength={160}
          onChange={(event) => room.setChatText(event.target.value)}
          placeholder={labels.chatPlaceholder}
          type="text"
          value={room.chatText}
        />
        <button
          className="icon-button"
          disabled={!room.chatText.trim()}
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}

function RoomLobbyList({
  dictionary,
  room
}: {
  dictionary: GameDictionary;
  room: FriendRoomController;
}) {
  const labels = dictionary.room;
  const { refreshLobby } = room;

  useEffect(() => {
    refreshLobby();
  }, [refreshLobby]);

  return (
    <div className="room-lobby">
      <div className="room-lobby-header">
        <p className="metric-label">{labels.availableRooms}</p>
        <button className="icon-button" onClick={room.refreshLobby} title={labels.refreshRooms} type="button">
          <RefreshCw aria-hidden="true" focusable={false} />
        </button>
      </div>
      {room.lobbyStatus === "loading" && room.lobbyRooms.length === 0 ? (
        <p className="room-message">{labels.loadingRooms}</p>
      ) : room.lobbyRooms.length > 0 ? (
        <div className="room-lobby-list">
          {room.lobbyRooms.map((lobbyRoom) => {
            const actionLabel = lobbyRoom.canJoin ? labels.joinRoom : labels.watchRoom;
            const isCurrentRoom = room.room?.snapshot.code === lobbyRoom.code;

            return (
              <div className="room-lobby-item" key={lobbyRoom.code}>
                <div>
                  <strong>{lobbyRoom.hostName}</strong>
                  <p>
                    {lobbyRoom.code}
                    {" · "}
                    {getLobbyStatusLabel(lobbyRoom.status, labels)}
                  </p>
                </div>
                <div className="room-lobby-metrics">
                  <span>{labels.playersCount.replace("{count}", String(lobbyRoom.playerCount))}</span>
                  <span>{`${labels.spectators}: ${lobbyRoom.spectatorCount}`}</span>
                </div>
                <button
                  className="mode-pill"
                  disabled={isCurrentRoom || (!lobbyRoom.canJoin && !lobbyRoom.canWatch)}
                  onClick={() => room.joinListedRoom(lobbyRoom.code)}
                  type="button"
                >
                  {lobbyRoom.canJoin ? (
                    <LogIn aria-hidden="true" focusable={false} />
                  ) : (
                    <Eye aria-hidden="true" focusable={false} />
                  )}
                  {actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="room-message">{labels.noRooms}</p>
      )}
    </div>
  );
}

function RoomUndoRequestOverlay({
  dictionary,
  room
}: {
  dictionary: GameDictionary;
  room: FriendRoomController;
}) {
  const labels = dictionary.room;
  const snapshot = room.room?.snapshot ?? null;
  const undoRequest = snapshot?.undoRequest ?? null;
  const isTarget = Boolean(undoRequest && room.room?.role === "player" && room.room.seat === undoRequest.targetSeat);

  if (!undoRequest || !isTarget || !snapshot) {
    return null;
  }

  const requester = snapshot.players.find((player) => player.seat === undoRequest.requesterSeat);
  const requesterName = requester?.name ?? (undoRequest.requesterSeat === "black" ? labels.blackSeat : labels.whiteSeat);

  return (
    <RoomUndoRequestDialog
      key={undoRequest.id}
      labels={labels}
      requesterName={requesterName}
      respondUndoRequest={room.respondUndoRequest}
      undoRequest={undoRequest}
    />
  );
}

function RoomUndoRequestDialog({
  labels,
  requesterName,
  respondUndoRequest,
  undoRequest
}: {
  labels: GameDictionary["room"];
  requesterName: string;
  respondUndoRequest: (accepted: boolean) => void;
  undoRequest: UndoRequestSnapshot;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const handledRequestRef = useRef(false);
  const secondsLeft = Math.max(0, Math.ceil((undoRequest.expiresAt - nowMs) / 1000));

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (secondsLeft > 0 || handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = true;
    respondUndoRequest(false);
  }, [respondUndoRequest, secondsLeft]);

  function respond(accepted: boolean) {
    if (handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = true;
    respondUndoRequest(accepted);
  }

  return (
    <div aria-modal="true" className="undo-request-modal" role="dialog">
      <h2>{labels.undoRequestTitle}</h2>
      <p>{labels.undoRequestCopy.replace("{name}", requesterName)}</p>
      <div className="undo-request-actions">
        <button className="mode-pill danger" onClick={() => respond(false)} type="button">
          <X aria-hidden="true" focusable={false} />
          {labels.rejectUndo.replace("{seconds}", String(secondsLeft))}
        </button>
        <button className="mode-pill success" onClick={() => respond(true)} type="button">
          <Check aria-hidden="true" focusable={false} />
          {labels.allowUndo}
        </button>
      </div>
    </div>
  );
}

function getLobbyStatusLabel(status: RoomSnapshot["status"], labels: GameDictionary["room"]): string {
  if (status === "playing") {
    return labels.lobbyPlaying;
  }

  if (status === "finished") {
    return labels.roomClosed;
  }

  return labels.lobbyWaiting;
}

function formatChatMessageTime(sentAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(sentAt));
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
    return dictionary.room.notInRoom;
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
    return dictionary.room.createOrJoin;
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
