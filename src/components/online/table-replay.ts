import type { Move } from "@/game/types";
import { clampReplayMove, replayBoardAtMove } from "@/game/record-replay";

export type TableReplayState = {
  gameId: string;
  moveNumber: number;
  moves: Move[];
};

export function createTableReplay(gameId: string, moves: Move[]): TableReplayState {
  return { gameId, moveNumber: moves.length, moves: moves.map((move) => ({ ...move })) };
}

export function setTableReplayMove(replay: TableReplayState, moveNumber: number): TableReplayState {
  return { ...replay, moveNumber: clampReplayMove(moveNumber, replay.moves) };
}

export function getTableReplayFrame(replay: TableReplayState) {
  const moveNumber = clampReplayMove(replay.moveNumber, replay.moves);

  return {
    board: replayBoardAtMove(replay.moves, moveNumber),
    lastMove: moveNumber > 0 ? replay.moves[moveNumber - 1] : null,
    moveNumber
  };
}
