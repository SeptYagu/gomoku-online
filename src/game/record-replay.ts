import { createBoard, isValidMove, placeStone } from "./board";
import type { Board, Move } from "./types";

export function clampReplayMove(moveNumber: number, moves: Move[]): number {
  if (!Number.isFinite(moveNumber)) {
    return moves.length;
  }

  return Math.min(moves.length, Math.max(0, Math.floor(moveNumber)));
}

export function replayBoardAtMove(moves: Move[], moveNumber: number): Board {
  let board = createBoard();
  const clampedMoveNumber = clampReplayMove(moveNumber, moves);

  for (const move of moves.slice(0, clampedMoveNumber)) {
    if (!isValidMove(board, move)) {
      continue;
    }

    board = placeStone(board, move, move.stone);
  }

  return board;
}
