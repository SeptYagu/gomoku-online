"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Board, Move, Point, Stone } from "@/game/types";

type GomokuBoardProps = {
  board: Board;
  labels: {
    board: string;
    point: string;
  };
  isInteractive: boolean;
  lastMove: Move | null;
  previewStone: Stone;
  winningKey: Set<string>;
  onPointSelect: (point: Point) => void;
};

const FILE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
const STAR_POINTS: Point[] = [
  { row: 3, col: 3 },
  { row: 3, col: 7 },
  { row: 3, col: 11 },
  { row: 7, col: 3 },
  { row: 7, col: 7 },
  { row: 7, col: 11 },
  { row: 11, col: 3 },
  { row: 11, col: 7 },
  { row: 11, col: 11 }
];

export function GomokuBoard({
  board,
  labels,
  isInteractive,
  lastMove,
  previewStone,
  winningKey,
  onPointSelect
}: GomokuBoardProps) {
  const [activePoint, setActivePoint] = useState<Point>(() => ({
    row: Math.floor(board.length / 2),
    col: Math.floor((board[0]?.length ?? 1) / 2)
  }));
  const focusablePoint = useMemo(
    () => getFocusablePoint(board, activePoint, isInteractive),
    [activePoint, board, isInteractive]
  );

  function moveKeyboardFocus(point: Point) {
    setActivePoint(point);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(getPointSelector(point))?.focus();
    });
  }

  function handlePointKeyDown(event: KeyboardEvent<HTMLButtonElement>, point: Point) {
    const nextPoint = getKeyboardTarget(board, point, event.key);

    if (!nextPoint) {
      return;
    }

    event.preventDefault();
    moveKeyboardFocus(nextPoint);
  }

  return (
    <div className="board-wrap">
      <div className="board-frame" dir="ltr">
        <div className="board-coords board-files board-files-top" aria-hidden="true">
          {FILE_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="board-coords board-files board-files-bottom" aria-hidden="true">
          {FILE_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="board-coords board-ranks board-ranks-left" aria-hidden="true">
          {board.map((_, rowIndex) => (
            <span key={rowIndex}>{rowIndex + 1}</span>
          ))}
        </div>
        <div className="board-coords board-ranks board-ranks-right" aria-hidden="true">
          {board.map((_, rowIndex) => (
            <span key={rowIndex}>{rowIndex + 1}</span>
          ))}
        </div>
        <div
          className={`gomoku-board preview-${previewStone}`}
          dir="ltr"
          role="grid"
          aria-label={labels.board}
        >
          {STAR_POINTS.map((point) => (
            <span
              aria-hidden="true"
              className="board-star"
              key={`${point.row}:${point.col}`}
              style={getStarStyle(point)}
            />
          ))}
          {board.map((row, rowIndex) => (
            <div aria-rowindex={rowIndex + 1} className="board-row" key={rowIndex} role="row">
              {row.map((cell, colIndex) => {
                const key = `${rowIndex}:${colIndex}`;
                const point = { row: rowIndex, col: colIndex };
                const isLastMove = lastMove?.row === rowIndex && lastMove.col === colIndex;
                const isWinningStone = winningKey.has(key);
                const isFocusable =
                  focusablePoint?.row === rowIndex &&
                  focusablePoint.col === colIndex &&
                  cell === null;

                return (
                  <button
                    aria-colindex={colIndex + 1}
                    aria-label={formatPointLabel(labels.point, rowIndex + 1, colIndex + 1)}
                    className="board-point"
                    data-board-point={key}
                    disabled={!isInteractive || cell !== null}
                    key={key}
                    onClick={() => onPointSelect(point)}
                    onFocus={() => setActivePoint(point)}
                    onKeyDown={(event) => handlePointKeyDown(event, point)}
                    role="gridcell"
                    tabIndex={isFocusable ? 0 : -1}
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
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatPointLabel(template: string, row: number, col: number): string {
  return template.replace("{row}", String(row)).replace("{col}", String(col));
}

function getFocusablePoint(
  board: Board,
  preferredPoint: Point,
  isInteractive: boolean
): Point | null {
  if (!isInteractive) {
    return null;
  }

  if (board[preferredPoint.row]?.[preferredPoint.col] === null) {
    return preferredPoint;
  }

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (board[row][col] === null) {
        return { row, col };
      }
    }
  }

  return null;
}

function getKeyboardTarget(board: Board, point: Point, key: string): Point | null {
  switch (key) {
    case "ArrowUp":
      return getNextOpenPoint(board, point, -1, 0);
    case "ArrowDown":
      return getNextOpenPoint(board, point, 1, 0);
    case "ArrowLeft":
      return getNextOpenPoint(board, point, 0, -1);
    case "ArrowRight":
      return getNextOpenPoint(board, point, 0, 1);
    case "Home":
      return getOpenPointInRow(board, point.row, 0, 1);
    case "End":
      return getOpenPointInRow(board, point.row, board[point.row].length - 1, -1);
    default:
      return null;
  }
}

function getNextOpenPoint(
  board: Board,
  origin: Point,
  rowStep: number,
  colStep: number
): Point | null {
  let row = origin.row + rowStep;
  let col = origin.col + colStep;

  while (row >= 0 && col >= 0 && row < board.length && col < board[row].length) {
    if (board[row][col] === null) {
      return { row, col };
    }

    row += rowStep;
    col += colStep;
  }

  return null;
}

function getOpenPointInRow(
  board: Board,
  row: number,
  startCol: number,
  colStep: number
): Point | null {
  for (let col = startCol; col >= 0 && col < board[row].length; col += colStep) {
    if (board[row][col] === null) {
      return { row, col };
    }
  }

  return null;
}

function getPointSelector(point: Point): string {
  return `[data-board-point="${point.row}:${point.col}"]`;
}

function getStarStyle(point: Point): CSSProperties {
  return {
    left: `${((point.col + 0.5) / 15) * 100}%`,
    top: `${((point.row + 0.5) / 15) * 100}%`
  };
}
