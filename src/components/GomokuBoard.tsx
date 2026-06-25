import type { Board, Move, Point } from "@/game/types";

type GomokuBoardProps = {
  board: Board;
  labels: {
    board: string;
    point: string;
  };
  lastMove: Move | null;
  winningKey: Set<string>;
  onPointSelect: (point: Point) => void;
};

export function GomokuBoard({
  board,
  labels,
  lastMove,
  winningKey,
  onPointSelect
}: GomokuBoardProps) {
  return (
    <div className="board-wrap">
      <div className="gomoku-board" dir="ltr" role="grid" aria-label={labels.board}>
        {board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const key = `${rowIndex}:${colIndex}`;
            const isLastMove = lastMove?.row === rowIndex && lastMove.col === colIndex;
            const isWinningStone = winningKey.has(key);

            return (
              <button
                aria-label={formatPointLabel(labels.point, rowIndex + 1, colIndex + 1)}
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

function formatPointLabel(template: string, row: number, col: number): string {
  return template.replace("{row}", String(row)).replace("{col}", String(col));
}
