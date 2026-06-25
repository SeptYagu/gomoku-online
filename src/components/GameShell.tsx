"use client";

import { Bot, CircleDot, RotateCcw, Undo2, Users, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { chooseAiMove, type AiDifficulty } from "@/game/ai";
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

export function GameShell({ dictionary, locale }: GameShellProps) {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [nextPlayer, setNextPlayer] = useState<Stone>("black");
  const [status, setStatus] = useState<GameStatus>({ state: "playing", nextPlayer: "black" });
  const [moves, setMoves] = useState<Move[]>([]);
  const [mode, setMode] = useState<GameMode>("local");
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("easy");

  const winningKey = useMemo(() => {
    if (status.state !== "won") {
      return new Set<string>();
    }

    return new Set(status.line.map((point) => `${point.row}:${point.col}`));
  }, [status]);

  function resetGame() {
    setBoard(createBoard());
    setNextPlayer("black");
    setStatus({ state: "playing", nextPlayer: "black" });
    setMoves([]);
  }

  function handleModeChange(nextMode: GameMode) {
    setMode(nextMode);
    resetGame();
  }

  function handleDifficultyChange(difficulty: AiDifficulty) {
    setAiDifficulty(difficulty);
    resetGame();
  }

  function handleUndo() {
    if (moves.length === 0) {
      return;
    }

    const removeCount = mode === "ai" && moves.length >= 2 && moves.at(-1)?.stone === "white" ? 2 : 1;
    const remainingMoves = moves.slice(0, Math.max(0, moves.length - removeCount));
    const nextBoard = replayMoves(remainingMoves);
    const nextStone = remainingMoves.length === 0 ? "black" : getOpponent(remainingMoves.at(-1)!.stone);

    setBoard(nextBoard);
    setMoves(remainingMoves);
    setNextPlayer(nextStone);
    setStatus({ state: "playing", nextPlayer: nextStone });
  }

  function handlePointSelect(point: Point) {
    if (status.state !== "playing") {
      return;
    }

    if (mode === "ai" && nextPlayer !== "black") {
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
        commitAiTurn(nextBoard, nextMoves);
        return;
      }

      commitGameState(nextBoard, nextMoves, result);
    } catch {
      // Illegal clicks are intentionally ignored; the board remains authoritative.
    }
  }

  function commitAiTurn(currentBoard: Board, currentMoves: Move[]) {
    const aiPoint = chooseAiMove(currentBoard, "white", { difficulty: aiDifficulty });

    if (!aiPoint) {
      commitGameState(currentBoard, currentMoves, { state: "draw" });
      return;
    }

    const aiBoard = placeStone(currentBoard, aiPoint, "white");
    const aiMove = {
      ...aiPoint,
      stone: "white" as const,
      moveNumber: currentMoves.length + 1
    };
    const aiMoves = [...currentMoves, aiMove];
    const aiResult = getGameResult(aiBoard, aiPoint, "white");

    if (aiResult.state === "playing") {
      commitGameState(aiBoard, aiMoves, { state: "playing", nextPlayer: "black" });
      return;
    }

    commitGameState(aiBoard, aiMoves, aiResult);
  }

  function commitGameState(nextBoard: Board, nextMoves: Move[], nextStatus: GameStatus) {
    setBoard(nextBoard);
    setMoves(nextMoves);
    setStatus(nextStatus);
    setNextPlayer(nextStatus.state === "playing" ? nextStatus.nextPlayer : (nextMoves.at(-1)?.stone ?? "black"));
  }

  const lastMove = moves.at(-1) ?? null;
  const canUndo = moves.length > 0;

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
              <Undo2 size={20} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={resetGame}
              aria-label={dictionary.controls.reset}
              title={dictionary.controls.reset}
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </header>

        <div className="mode-strip" aria-label={dictionary.modes.label}>
          <button
            className={`mode-pill ${mode === "local" ? "active" : ""}`}
            type="button"
            onClick={() => handleModeChange("local")}
          >
            <Users size={16} />
            {dictionary.modes.local}
          </button>
          <button
            className={`mode-pill ${mode === "ai" ? "active" : ""}`}
            type="button"
            onClick={() => handleModeChange("ai")}
          >
            <Bot size={16} />
            {dictionary.modes.ai}
          </button>
          <button className="mode-pill" type="button" disabled>
            <Wifi size={16} />
            {dictionary.modes.room}
          </button>
        </div>

        {mode === "ai" ? (
          <div className="difficulty-strip" aria-label={dictionary.ai.difficultyLabel}>
            <button
              className={`mode-pill ${aiDifficulty === "easy" ? "active" : ""}`}
              type="button"
              onClick={() => handleDifficultyChange("easy")}
            >
              {dictionary.ai.easy}
            </button>
            <button
              className={`mode-pill ${aiDifficulty === "normal" ? "active" : ""}`}
              type="button"
              onClick={() => handleDifficultyChange("normal")}
            >
              {dictionary.ai.normal}
            </button>
          </div>
        ) : null}

        <div className="play-area">
          <GomokuBoard
            board={board}
            labels={{
              board: dictionary.board.label,
              point: dictionary.board.point
            }}
            lastMove={lastMove}
            winningKey={winningKey}
            onPointSelect={handlePointSelect}
          />
        </div>
      </section>

      <aside className="side-panel" aria-label={dictionary.status.panelLabel}>
        <div className="status-card">
          <div className="status-title">
            <CircleDot size={18} />
            {dictionary.status.title}
          </div>
          <p className="status-copy">{getStatusText(status, dictionary)}</p>
          <p className="status-note">
            {mode === "ai" ? dictionary.ai.playerBlackAiWhite : dictionary.modes.local}
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

function replayMoves(moves: Move[]): Board {
  return moves.reduce((currentBoard, move) => placeStone(currentBoard, move, move.stone), createBoard());
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
