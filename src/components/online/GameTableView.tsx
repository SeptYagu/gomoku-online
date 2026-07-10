"use client";

import type { Board, Move, Point, Stone } from "@/game/types";
import type { GameDictionary } from "@/i18n/dictionaries";
import { GomokuBoard } from "../GomokuBoard";
import type { FriendRoomController } from "../useFriendRoom";
import { TableActionBar } from "./TableActionBar";
import { TableReplayBar } from "./TableReplayBar";
import { TableTaskBar } from "./TableTaskBar";
import {
  createTableReplay,
  getTableReplayFrame,
  setTableReplayMove,
  type TableReplayState
} from "./table-replay";
import { deriveTableUiState, getTableActions, type TableActionId } from "./table-ui-state";

type GameTableViewProps = {
  board: Board;
  dictionary: GameDictionary;
  isInteractive: boolean;
  lastMove: Move | null;
  onLeaveRequest: () => void;
  onPointSelect: (point: Point) => void;
  onReplayChange: (replay: TableReplayState | null) => void;
  previewStone: Stone;
  replay: TableReplayState | null;
  room: FriendRoomController;
  winningKey: Set<string>;
};

export function GameTableView({
  board,
  dictionary,
  isInteractive,
  lastMove,
  onLeaveRequest,
  onPointSelect,
  onReplayChange,
  previewStone,
  replay,
  room,
  winningKey
}: GameTableViewProps) {
  const labels = dictionary.room;
  const clientState = room.room;

  if (!clientState) {
    return null;
  }

  const snapshot = clientState.snapshot;
  const selfPlayer =
    clientState.role === "player" ? snapshot.players.find((player) => player.seat === clientState.seat) : null;
  const remainingUndoRequests = selfPlayer?.undoRequestsRemaining ?? 0;
  const tableUiState = deriveTableUiState({ canSit: room.canSit, room: clientState });

  if (!tableUiState) {
    return null;
  }

  const actions = getTableActions(tableUiState, {
    canCancelMatch: room.canCancelMatch,
    canReady: room.canReady,
    canReplay: snapshot.status === "finished" || (snapshot.status === "abandoned" && snapshot.moves.length > 0),
    canRematch: room.canRematch,
    canResign: room.canResign,
    canSit: room.canSit,
    canUndo: room.canUndo,
    ready: room.ready
  });
  const undoRequest = snapshot.undoRequest ?? null;
  const requester = undoRequest
    ? snapshot.players.find((player) => player.seat === undoRequest.requesterSeat)
    : null;
  const requesterName = undoRequest
    ? requester?.name ?? (undoRequest.requesterSeat === "black" ? labels.blackSeat : labels.whiteSeat)
    : null;
  const playerName = clientState.name || selfPlayer?.name || room.playerName;
  const replayFrame = replay ? getTableReplayFrame(replay) : null;

  function handleAction(action: TableActionId) {
    switch (action) {
      case "allow-undo":
        room.respondUndoRequest(true);
        return;
      case "copy-invite":
        room.copyInvite();
        return;
      case "cancel-wait":
        room.cancelMatch();
        return;
      case "leave":
        onLeaveRequest();
        return;
      case "ready":
      case "unready":
        room.toggleReady();
        return;
      case "reject-undo":
        room.respondUndoRequest(false);
        return;
      case "replay":
        onReplayChange(createTableReplay(snapshot.gameId, snapshot.moves));
        return;
      case "resign":
        room.resignGame();
        return;
      case "rematch-ready":
        room.setRematchReady(true);
        return;
      case "rematch-cancel":
        room.setRematchReady(false);
        return;
      case "sit":
        room.sitRoom();
        return;
      case "undo":
        room.undoMove();
    }
  }

  return (
    <section
      className="online-table-workspace"
      data-online-view="table"
      data-table-replay={replay?.gameId}
      data-table-state={tableUiState}
    >
      <div className="table-play-stack">
        {replay ? (
          <TableReplayBar
            dictionary={dictionary}
            onChange={(moveNumber) => onReplayChange(setTableReplayMove(replay, moveNumber))}
            onExit={() => onReplayChange(null)}
            replay={replay}
          />
        ) : (
          <TableTaskBar
            actions={actions}
            copiedInvite={room.copiedInvite}
            dictionary={dictionary}
            key={undoRequest?.id ?? tableUiState}
            onAction={handleAction}
            playerName={playerName}
            remainingUndoRequests={remainingUndoRequests}
            requesterName={requesterName}
            resultText={getTableResultText(clientState.role, clientState.seat, dictionary, snapshot.winner)}
            state={tableUiState}
            undoRequest={undoRequest}
          />
        )}
        <div className="play-area">
          <GomokuBoard
            board={replayFrame?.board ?? board}
            isInteractive={!replay && isInteractive}
            labels={{
              board: dictionary.board.label,
              point: dictionary.board.point
            }}
            lastMove={replayFrame?.lastMove ?? lastMove}
            previewStone={previewStone}
            winningKey={replay ? new Set<string>() : winningKey}
            onPointSelect={onPointSelect}
          />
        </div>
        {!replay ? (
          <TableActionBar
            actions={actions}
            copiedInvite={room.copiedInvite}
            dictionary={dictionary}
            onAction={handleAction}
            remainingUndoRequests={remainingUndoRequests}
          />
        ) : null}
      </div>
    </section>
  );
}

function getTableResultText(
  role: "player" | "spectator",
  seat: Stone | null,
  dictionary: GameDictionary,
  winner: Stone | null
): string | null {
  if (!winner) {
    return dictionary.status.draw;
  }

  if (role === "spectator" || !seat) {
    return winner === "black" ? dictionary.status.blackWins : dictionary.status.whiteWins;
  }

  return winner === seat ? dictionary.room.youWin : dictionary.room.youLose;
}
