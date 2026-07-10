"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Flag, LogOut, RotateCcw, Send, Undo2, UserRound, Users, X } from "lucide-react";
import type { Board, Move, Point, Stone } from "@/game/types";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { UndoRequestSnapshot } from "@/server/rooms";
import { GomokuBoard } from "../GomokuBoard";
import type { FriendRoomController } from "../useFriendRoom";
import { deriveTableUiState } from "./table-ui-state";

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

  return (
    <section data-online-view="table" data-table-state={tableUiState ?? undefined}>
      <div className="room-panel" aria-label={labels.panelLabel}>
        <div className="room-actions">
          <button className="mode-pill" onClick={room.copyInvite} type="button">
            <Copy aria-hidden="true" focusable={false} />
            {room.copiedInvite ? labels.copied : labels.copyInvite}
          </button>
        </div>

        <div className="room-summary">
          <div>
            <p className="metric-label">{labels.roomCode}</p>
            <strong>{snapshot.code}</strong>
          </div>
          <div>
            <p className="metric-label">{labels.yourSeat}</p>
            <strong>
              {clientState.role === "spectator"
                ? labels.spectatorSeat
                : clientState.seat === "black"
                  ? labels.blackSeat
                  : labels.whiteSeat}
            </strong>
          </div>
          <div>
            <p className="metric-label">{labels.spectators}</p>
            <strong>{snapshot.spectators.length}</strong>
          </div>
          <div>
            <p className="metric-label">{labels.connection}</p>
            <strong>{room.connectionStatus === "connected" ? labels.connected : labels.disconnected}</strong>
          </div>
        </div>

        <div className="room-players">
          {snapshot.players.map((player) => (
            <div className="room-player" key={player.seat}>
              <span
                aria-label={player.seat === "black" ? dictionary.status.blackStone : dictionary.status.whiteStone}
                className={`stone-preview ${player.seat}`}
                role="img"
              />
              <div>
                <strong>
                  {player.name}
                  {player.seat === clientState.seat ? ` ${labels.you}` : ""}
                </strong>
                <p>
                  {player.ready ? labels.ready : labels.notReady}
                  {" · "}
                  {player.connected ? labels.connected : labels.disconnected}
                </p>
              </div>
            </div>
          ))}
        </div>

        {snapshot.spectators.length ? (
          <div className="room-spectators">
            <p className="metric-label">{labels.spectators}</p>
            <div className="room-players">
              {snapshot.spectators.map((spectator) => (
                <div className="room-player" key={`${spectator.name}-${spectator.joinedAt}`}>
                  <Users aria-hidden="true" className="room-spectator-icon" focusable={false} />
                  <div>
                    <strong>
                      {spectator.name}
                      {clientState.role === "spectator" && spectator.name === clientState.name ? ` ${labels.you}` : ""}
                    </strong>
                    <p>{spectator.connected ? labels.connected : labels.disconnected}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <RoomChatPanel dictionary={dictionary} room={room} />

        <div className="room-actions">
          {room.canReady ? (
            <button
              className={`mode-pill ${room.ready ? "danger" : "success"}`}
              onClick={room.toggleReady}
              type="button"
            >
              <Check aria-hidden="true" focusable={false} />
              {room.ready ? labels.unready : labels.readyAction}
            </button>
          ) : null}
          <button className="mode-pill" disabled={!room.canUndo} onClick={room.undoMove} type="button">
            <Undo2 aria-hidden="true" focusable={false} />
            {dictionary.controls.undo} ({remainingUndoRequests})
          </button>
          <button className="mode-pill" disabled={!room.canResign} onClick={room.resignGame} type="button">
            <Flag aria-hidden="true" focusable={false} />
            {labels.resign}
          </button>
          <button className="mode-pill" disabled={!room.canRestart} onClick={room.restartGame} type="button">
            <RotateCcw aria-hidden="true" focusable={false} />
            {labels.restartRoom}
          </button>
          {room.canSit ? (
            <button className="mode-pill" onClick={room.sitRoom} type="button">
              <UserRound aria-hidden="true" focusable={false} />
              {labels.sitDown}
            </button>
          ) : null}
          <button className="mode-pill" onClick={room.leaveRoom} type="button">
            <LogOut aria-hidden="true" focusable={false} />
            {labels.leaveRoom}
          </button>
        </div>

        <p className="room-message">
          {(clientState.role === "spectator" ? labels.spectatorStatus : labels.selfStatus).replace(
            "{name}",
            clientState.name || selfPlayer?.name || room.playerName
          )}
        </p>
        {room.error ? <p className="room-error">{room.error}</p> : null}
      </div>

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
        <RoomUndoRequestOverlay dictionary={dictionary} room={room} />
      </div>
    </section>
  );
}

function RoomChatPanel({ dictionary, room }: { dictionary: GameDictionary; room: FriendRoomController }) {
  const labels = dictionary.room;
  const messages = room.room?.snapshot.chatMessages ?? [];

  return (
    <section aria-label={labels.roomChat} className="room-chat">
      <div className="room-chat-header">
        <p className="metric-label">{labels.roomChat}</p>
      </div>
      <div aria-live="polite" className="room-chat-list" role="log">
        {messages.length > 0 ? (
          messages.map((message) => (
            <div className="room-chat-message" key={message.id}>
              <div className="room-chat-meta">
                <strong>{message.name}</strong>
                <span>{formatChatMessageTime(message.sentAt)}</span>
              </div>
              <p>{message.text}</p>
            </div>
          ))
        ) : (
          <p className="room-message">{labels.noMessages}</p>
        )}
      </div>
      <form
        className="room-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          room.sendChatMessage();
        }}
      >
        <input
          maxLength={160}
          onChange={(event) => room.setChatText(event.target.value)}
          placeholder={labels.chatPlaceholder}
          type="text"
          value={room.chatText}
        />
        <button
          className="icon-button"
          disabled={!room.chatText.trim()}
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}

function RoomUndoRequestOverlay({ dictionary, room }: { dictionary: GameDictionary; room: FriendRoomController }) {
  const labels = dictionary.room;
  const snapshot = room.room?.snapshot ?? null;
  const undoRequest = snapshot?.undoRequest ?? null;
  const isTarget = Boolean(undoRequest && room.room?.role === "player" && room.room.seat === undoRequest.targetSeat);

  if (!undoRequest || !isTarget || !snapshot) {
    return null;
  }

  const requester = snapshot.players.find((player) => player.seat === undoRequest.requesterSeat);
  const requesterName = requester?.name ?? (undoRequest.requesterSeat === "black" ? labels.blackSeat : labels.whiteSeat);

  return (
    <RoomUndoRequestDialog
      key={undoRequest.id}
      labels={labels}
      requesterName={requesterName}
      respondUndoRequest={room.respondUndoRequest}
      undoRequest={undoRequest}
    />
  );
}

function RoomUndoRequestDialog({
  labels,
  requesterName,
  respondUndoRequest,
  undoRequest
}: {
  labels: GameDictionary["room"];
  requesterName: string;
  respondUndoRequest: (accepted: boolean) => void;
  undoRequest: UndoRequestSnapshot;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const handledRequestRef = useRef(false);
  const secondsLeft = Math.max(0, Math.ceil((undoRequest.expiresAt - nowMs) / 1000));

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (secondsLeft > 0 || handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = true;
    respondUndoRequest(false);
  }, [respondUndoRequest, secondsLeft]);

  function respond(accepted: boolean) {
    if (handledRequestRef.current) {
      return;
    }

    handledRequestRef.current = true;
    respondUndoRequest(accepted);
  }

  return (
    <div aria-modal="true" className="undo-request-modal" role="dialog">
      <h2>{labels.undoRequestTitle}</h2>
      <p>{labels.undoRequestCopy.replace("{name}", requesterName)}</p>
      <div className="undo-request-actions">
        <button className="mode-pill danger" onClick={() => respond(false)} type="button">
          <X aria-hidden="true" focusable={false} />
          {labels.rejectUndo.replace("{seconds}", String(secondsLeft))}
        </button>
        <button className="mode-pill success" onClick={() => respond(true)} type="button">
          <Check aria-hidden="true" focusable={false} />
          {labels.allowUndo}
        </button>
      </div>
    </div>
  );
}

function formatChatMessageTime(sentAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(sentAt));
}
