"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CircleDot, Users, Wifi } from "lucide-react";
import { createBoard, getGameResult, getOpponent, placeStone } from "@/game/board";
import type { Board, GameStatus, Move, Point, Stone } from "@/game/types";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { RoomSnapshot } from "@/server/rooms";
import { useBootGameMode } from "./client-boot-state";
import { InteractionConfirmation } from "./InteractionConfirmation";
import {
  getModeChangeDecision,
  requiresOnlineLeaveConfirmation
} from "./interaction-guards";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { GameTableView } from "./online/GameTableView";
import { OnlineJoiningView, OnlineLobbyView } from "./online/OnlineLobbyView";
import { RoomProvider } from "./online/RoomContext";
import { TableSidebar } from "./online/TableSidebar";
import { createTableReplay, type TableReplayState } from "./online/table-replay";
import { deriveGameWorkspace, isOnlineWorkspaceEnabled, type GameMode } from "./online/workspace-state";
import { AiGameView, type FirstPlayer } from "./play/AiGameView";
import { LocalGameView } from "./play/LocalGameView";
import { useAiGame, replayMoves } from "./hooks/useAiGame";
import { useFriendRoom, type FriendRoomController } from "./useFriendRoom";
import type { AiDifficulty } from "@/game/ai";

type GameShellProps = {
  dictionary: GameDictionary;
  locale: Locale;
};

type PendingTransition = {
  kind: "ai" | "online";
  nextMode: GameMode | null;
};

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

export function GameShell({ dictionary, locale }: GameShellProps) {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [nextPlayer, setNextPlayer] = useState<Stone>("black");
  const [status, setStatus] = useState<GameStatus>({ state: "playing", nextPlayer: "black" });
  const [moves, setMoves] = useState<Move[]>([]);

  // 模式由 URL 决定（带 ?room= 直接进联机），但 URL 只有浏览器能读：
  // 未显式切换过模式前先用启动快照，避免 SSR/CSR 首屏不一致。
  const bootMode = useBootGameMode();
  const [modeOverride, setMode] = useState<GameMode | null>(null);
  const mode = modeOverride ?? bootMode;

  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tableReplay, setTableReplay] = useState<TableReplayState | null>(null);

  const resetGameRef = useRef<((options?: { nextMode?: GameMode; nextDifficulty?: AiDifficulty; nextFirstPlayer?: FirstPlayer }) => void) | null>(null);

  const commitGameState = useCallback((nextBoard: Board, nextMoves: Move[], nextStatus: GameStatus) => {
    setBoard(nextBoard);
    setMoves(nextMoves);
    setStatus(nextStatus);
    setNextPlayer(nextStatus.state === "playing" ? nextStatus.nextPlayer : (nextMoves.at(-1)?.stone ?? "black"));
  }, []);

  const handleResetFromAi = useCallback((options?: { nextDifficulty?: AiDifficulty; nextFirstPlayer?: FirstPlayer }) => {
    resetGameRef.current?.(options);
  }, []);

  const aiGame = useAiGame({
    mode,
    moves,
    onCommitGameState: commitGameState,
    onResetGame: handleResetFromAi
  });

  const friendRoom = useFriendRoom({
    enabled: isOnlineWorkspaceEnabled(mode),
    messages: {
      chatSendTimeout: dictionary.room.chatSendTimeout,
      connectionFailed: dictionary.room.connectionFailed,
      connectionFailedXhr: dictionary.room.connectionFailedXhr,
      joinTargetRequired: dictionary.room.joinTargetRequired,
      leaveRoomTimeout: dictionary.room.leaveRoomTimeout,
      roomCodeRequired: dictionary.room.roomCodeRequired,
      roomError: dictionary.room.roomError
    }
  });

  const resetGame = useCallback(({
    nextMode = mode,
    nextDifficulty = aiGame.aiDifficulty,
    nextFirstPlayer = aiGame.firstPlayer
  }: {
    nextMode?: GameMode;
    nextDifficulty?: AiDifficulty;
    nextFirstPlayer?: FirstPlayer;
  } = {}) => {
    aiGame.cancelAiTurn();
    const snapshot = aiGame.createInitialSnapshot(nextMode, nextDifficulty, nextFirstPlayer);

    setBoard(snapshot.board);
    setNextPlayer(snapshot.nextPlayer);
    setStatus(snapshot.status);
    setMoves(snapshot.moves);
  }, [aiGame, mode]);

  useEffect(() => {
    resetGameRef.current = resetGame;
  });

  function completeModeChange(nextMode: GameMode) {
    if (nextMode === "room") {
      aiGame.cancelAiTurn();
      setMode(nextMode);
      return;
    }

    setTableReplay(null);

    let nextAiSettings = { aiDifficulty: aiGame.aiDifficulty, firstPlayer: aiGame.firstPlayer };
    if (nextMode === "ai") {
      nextAiSettings = aiGame.applyPendingSettingsOnModeEnter();
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
    if (pendingTransition) {
      // 已经有待确认的切换：忽略新的点击，避免确认态被悄悄改写。
      return;
    }

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

  const handleCancelPendingTransition = useCallback(() => {
    setPendingTransition(null);
  }, []);

  function handleUndo() {
    aiGame.cancelAiTurn();
    const aiStone = aiGame.aiStone;

    if (moves.length === 0 || (mode === "ai" && aiGame.firstPlayer === "ai" && moves.length <= 1)) {
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

    const humanStone = aiGame.humanStone;

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
        void aiGame.commitAiTurn(nextBoard, nextMoves);
        return;
      }

      commitGameState(nextBoard, nextMoves, result);
    } catch {
      // Illegal clicks are intentionally ignored; the board remains authoritative.
    }
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
  const humanStone = aiGame.humanStone;
  const canUndo =
    mode !== "room" && !aiGame.isAiThinking && (mode === "ai" && aiGame.firstPlayer === "ai" ? moves.length > 1 : moves.length > 0);
  const canPlayPoint =
    mode === "room"
      ? friendRoom.canPlay
      : !aiGame.isAiThinking && status.state === "playing" && !(mode === "ai" && nextPlayer !== humanStone);
  // 确认弹窗打开期间必须锁住模式切换：否则第二次点击会直接覆盖 pendingTransition，
  // 让用户以为自己在回答第一个问题时其实已经换了目标模式。
  const isModeSwitchLocked =
    aiGame.isAiThinking || friendRoom.isJoiningRoom || isTransitioning || pendingTransition !== null;

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
            disabled={isModeSwitchLocked}
          >
            <Users aria-hidden="true" focusable={false} />
            {dictionary.modes.local}
          </button>
          <button
            className={`mode-pill ${mode === "ai" ? "active" : ""}`}
            data-game-mode="ai"
            type="button"
            onClick={() => handleModeChange("ai")}
            disabled={isModeSwitchLocked}
          >
            <Bot aria-hidden="true" focusable={false} />
            {dictionary.modes.ai}
          </button>
          <button
            className={`mode-pill ${mode === "room" ? "active" : ""}`}
            data-game-mode="room"
            type="button"
            onClick={() => handleModeChange("room")}
            disabled={isModeSwitchLocked}
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
            onCancel={handleCancelPendingTransition}
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
            aiDifficulty={aiGame.aiDifficulty}
            board={board}
            canPlay={canPlayPoint}
            canUndo={canUndo}
            dictionary={dictionary}
            firstPlayer={aiGame.firstPlayer}
            isAiThinking={aiGame.isAiThinking}
            lastMove={lastMove}
            nextPlayer={activeNextPlayer}
            onCancelPendingSettings={aiGame.cancelPendingSettings}
            onDifficultyChange={aiGame.handleDifficultyChange}
            onFirstPlayerChange={aiGame.handleFirstPlayerChange}
            onPointSelect={handlePointSelect}
            onReset={aiGame.handleAiReset}
            onUndo={handleUndo}
            pendingDifficulty={aiGame.pendingDifficulty}
            pendingFirstPlayer={aiGame.pendingFirstPlayer}
            winningKey={winningKey}
          />
        ) : null}

        <RoomProvider value={friendRoom}>
          {workspace === "online-lobby" ? (
            <OnlineLobbyView
              dictionary={dictionary}
              locale={locale}
              onPlayAi={() => handleModeChange("ai")}
            />
          ) : null}

          {workspace === "online-joining" ? (
            <OnlineJoiningView dictionary={dictionary} locale={locale} />
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
              winningKey={winningKey}
            />
          ) : null}
        </RoomProvider>
      </section>

      {workspace === "online-table" ? (
        <aside className="side-panel table-side-panel" aria-label={dictionary.room.panelLabel}>
          <RoomProvider value={friendRoom}>
            <TableSidebar
              dictionary={dictionary}
              locale={locale}
              onReplayGame={(gameId, replayMovesList) => setTableReplay(createTableReplay(gameId, replayMovesList))}
            />
          </RoomProvider>
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
              : aiGame.isAiThinking
                ? dictionary.ai.thinking
                : getStatusText(activeStatus, dictionary)}
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
