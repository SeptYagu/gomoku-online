"use client";

import { RotateCcw, Undo2 } from "lucide-react";
import type { Board, Move, Point, Stone } from "@/game/types";
import type { GameDictionary } from "@/i18n/dictionaries";
import { GomokuBoard } from "../GomokuBoard";

type LocalGameViewProps = {
  board: Board;
  canPlay: boolean;
  canUndo: boolean;
  dictionary: GameDictionary;
  lastMove: Move | null;
  nextPlayer: Stone;
  onPointSelect: (point: Point) => void;
  onReset: () => void;
  onUndo: () => void;
  winningKey: Set<string>;
};

export function LocalGameView({
  board,
  canPlay,
  canUndo,
  dictionary,
  lastMove,
  nextPlayer,
  onPointSelect,
  onReset,
  onUndo,
  winningKey
}: LocalGameViewProps) {
  return (
    <section data-play-view="local">
      <div className="game-actions">
        <button className="mode-pill" disabled={!canUndo} onClick={onUndo} type="button">
          <Undo2 aria-hidden="true" focusable={false} />
          {dictionary.controls.undo}
        </button>
        <button className="mode-pill" onClick={onReset} type="button">
          <RotateCcw aria-hidden="true" focusable={false} />
          {dictionary.controls.reset}
        </button>
      </div>

      <div className="play-area">
        <GomokuBoard
          board={board}
          isInteractive={canPlay}
          labels={{
            board: dictionary.board.label,
            point: dictionary.board.point
          }}
          lastMove={lastMove}
          previewStone={nextPlayer}
          winningKey={winningKey}
          onPointSelect={onPointSelect}
        />
      </div>
    </section>
  );
}
