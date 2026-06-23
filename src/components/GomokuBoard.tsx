import type { Board, Move, Point } from "@/game/types";

type GomokuBoardProps = {
  board: Board;
  lastMove: Move | null;
  winningKey: Set<string>;
  onPointSelect: (point: Point) => void;
};

export function GomokuBoard({ board, lastMove, winningKey, onPointSelect }: GomokuBoardProps) {
  return (
    <div className="board-wrap">
      <div className="gomoku-board" role="grid" aria-label="15 by 15 Gomoku board">
        {board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const key = `${rowIndex}:${colIndex}`;
            const isLastMove = lastMove?.row === rowIndex && lastMove.col === colIndex;
            const isWinningStone = winningKey.has(key);

            return (
              <button
                aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}`}
                className="board-point"
                disabled={cell !== null}
                key={key}
                onClick={() => onPointSelect({ row: rowIndex, col: colIndex })}
                role="gridcell"
                type="button"
              >
                {cell ? (
                  <span
                    className={`stone ${cell} ${isLastMove ? "last" : ""} ${
                      isWinningStone ? "winning" : ""
                    }`}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
