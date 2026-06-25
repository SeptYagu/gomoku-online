"use client";

import { Bot, CircleDot, RotateCcw, Users, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import {
  checkWin,
  createBoard,
  getOpponent,
  isBoardFull,
  placeStone
} from "@/game/board";
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

export function GameShell({ dictionary, locale }: GameShellProps) {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [nextPlayer, setNextPlayer] = useState<Stone>("black");
  const [status, setStatus] = useState<GameStatus>({ state: "playing", nextPlayer: "black" });
  const [moves, setMoves] = useState<Move[]>([]);

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

  function handlePointSelect(point: Point) {
    if (status.state !== "playing") {
      return;
    }

    try {
      const nextBoard = placeStone(board, point, nextPlayer);
      const line = checkWin(nextBoard, point, nextPlayer);
      const move = {
        ...point,
        stone: nextPlayer,
        moveNumber: moves.length + 1
      };

      setBoard(nextBoard);
      setMoves((currentMoves) => [...currentMoves, move]);

      if (line) {
        setStatus({ state: "won", winner: nextPlayer, line });
        return;
      }

      if (isBoardFull(nextBoard)) {
        setStatus({ state: "draw" });
        return;
      }

      const upcoming = getOpponent(nextPlayer);
      setNextPlayer(upcoming);
      setStatus({ state: "playing", nextPlayer: upcoming });
    } catch {
      // Illegal clicks are intentionally ignored; the board remains authoritative.
    }
  }

  const lastMove = moves.at(-1) ?? null;

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
              onClick={resetGame}
              aria-label={dictionary.controls.reset}
              title={dictionary.controls.reset}
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </header>

        <div className="mode-strip" aria-label={dictionary.modes.label}>
          <button className="mode-pill active" type="button">
            <Users size={16} />
            {dictionary.modes.local}
          </button>
          <button className="mode-pill" type="button" disabled>
            <Bot size={16} />
            {dictionary.modes.ai}
          </button>
          <button className="mode-pill" type="button" disabled>
            <Wifi size={16} />
            {dictionary.modes.room}
          </button>
        </div>

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

function getStatusText(status: GameStatus, dictionary: GameDictionary): string {
  if (status.state === "won") {
    return status.winner === "black" ? dictionary.status.blackWins : dictionary.status.whiteWins;
  }

  if (status.state === "draw") {
    return dictionary.status.draw;
  }

  return status.nextPlayer === "black" ? dictionary.status.blackTurn : dictionary.status.whiteTurn;
}
