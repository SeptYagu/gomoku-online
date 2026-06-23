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
import { GomokuBoard } from "./GomokuBoard";

export function GameShell() {
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
      <section className="game-stage" aria-label="Gomoku game">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Gomoku Online</p>
            <h1>五子棋在线对弈</h1>
          </div>
          <button className="icon-button" type="button" onClick={resetGame} aria-label="重开">
            <RotateCcw size={20} />
          </button>
        </header>

        <div className="mode-strip" aria-label="Game modes">
          <button className="mode-pill active" type="button">
            <Users size={16} />
            本地双人
          </button>
          <button className="mode-pill" type="button" disabled>
            <Bot size={16} />
            人机
          </button>
          <button className="mode-pill" type="button" disabled>
            <Wifi size={16} />
            好友房
          </button>
        </div>

        <div className="play-area">
          <GomokuBoard
            board={board}
            lastMove={lastMove}
            winningKey={winningKey}
            onPointSelect={handlePointSelect}
          />
        </div>
      </section>

      <aside className="side-panel" aria-label="Game status">
        <div className="status-card">
          <div className="status-title">
            <CircleDot size={18} />
            当前对局
          </div>
          <p className="status-copy">{getStatusText(status)}</p>
          <div className="stone-row">
            <span className={`stone-preview black ${nextPlayer === "black" ? "active" : ""}`} />
            <span className={`stone-preview white ${nextPlayer === "white" ? "active" : ""}`} />
          </div>
        </div>

        <div className="status-card compact">
          <p className="metric-label">已落子</p>
          <strong>{moves.length}</strong>
        </div>

        <div className="ad-placeholder" aria-label="Future ad placement">
          广告预留位
        </div>
      </aside>
    </main>
  );
}

function getStatusText(status: GameStatus): string {
  if (status.state === "won") {
    return status.winner === "black" ? "黑棋获胜" : "白棋获胜";
  }

  if (status.state === "draw") {
    return "棋盘已满，平局";
  }

  return status.nextPlayer === "black" ? "黑棋回合" : "白棋回合";
}
