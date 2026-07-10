"use client";

import type { Board, Move, Point, Stone } from "@/game/types";
import type { GameDictionary } from "@/i18n/dictionaries";
import { GomokuBoard } from "../GomokuBoard";
import type { FriendRoomController } from "../useFriendRoom";
import { TableActionBar } from "./TableActionBar";
import { TableTaskBar } from "./TableTaskBar";
import { deriveTableUiState, getTableActions, type TableActionId } from "./table-ui-state";

type GameTableViewProps = {
  board: Board;
  dictionary: GameDictionary;
  isInteractive: boolean;
  lastMove: Move | null;
  onPointSelect: (point: Point) => void;
  previewStone: Stone;
  room: FriendRoomController;
  winningKey: Set<string>;
};

export function GameTableView({
  board,
  dictionary,
  isInteractive,
  lastMove,
  onPointSelect,
  previewStone,
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
    canResign: room.canResign,
    canRestart: room.canRestart,
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
        room.leaveRoom();
        return;
      case "ready":
      case "unready":
        room.toggleReady();
        return;
      case "reject-undo":
        room.respondUndoRequest(false);
        return;
      case "resign":
        room.resignGame();
        return;
      case "restart":
        room.restartGame();
        return;
      case "sit":
        room.sitRoom();
        return;
      case "undo":
        room.undoMove();
    }
  }

  return (
    <section className="online-table-workspace" data-online-view="table" data-table-state={tableUiState}>
      <div className="table-play-stack">
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
        <div className="play-area">
          <GomokuBoard
            board={board}
            isInteractive={isInteractive}
            labels={{
              board: dictionary.board.label,
              point: dictionary.board.point
            }}
            lastMove={lastMove}
            previewStone={previewStone}
            winningKey={winningKey}
            onPointSelect={onPointSelect}
          />
        </div>
        <TableActionBar
          actions={actions}
          copiedInvite={room.copiedInvite}
          dictionary={dictionary}
          onAction={handleAction}
          remainingUndoRequests={remainingUndoRequests}
        />
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
