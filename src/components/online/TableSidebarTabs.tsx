"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { Move } from "@/game/types";
import type { FriendRoomController } from "../useFriendRoom";
import { getProfileUrl } from "../profile/profile-url";
import { TableRoomChat } from "./TableRoomChat";

type TableSidebarTab = "chat" | "history" | "info";

type TableSidebarTabsProps = {
  dictionary: GameDictionary;
  locale: Locale;
  onReplayGame: (gameId: string, moves: Move[]) => void;
  room: FriendRoomController;
};

const TABS: TableSidebarTab[] = ["chat", "history", "info"];

export function TableSidebarTabs({ dictionary, locale, onReplayGame, room }: TableSidebarTabsProps) {
  const [activeTab, setActiveTab] = useState<TableSidebarTab>("chat");
  const snapshot = room.room?.snapshot;

  if (!snapshot) {
    return null;
  }

  return (
    <div className="table-sidebar-tabs">
      <div aria-label={dictionary.room.panelLabel} className="table-sidebar-tab-list" role="tablist">
        {TABS.map((tab) => (
          <button
            aria-controls={`table-sidebar-panel-${tab}`}
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : ""}
            data-table-sidebar-tab={tab}
            id={`table-sidebar-tab-${tab}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {getTabLabel(tab, dictionary)}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`table-sidebar-tab-${activeTab}`}
        className="table-sidebar-tab-panel"
        id={`table-sidebar-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "chat" ? <TableRoomChat dictionary={dictionary} room={room} /> : null}
        {activeTab === "history" ? (
          <TableMoveHistory dictionary={dictionary} locale={locale} onReplayGame={onReplayGame} room={room} />
        ) : null}
        {activeTab === "info" ? <TableRoomInfo dictionary={dictionary} room={room} /> : null}
      </div>
    </div>
  );
}

function TableMoveHistory({
  dictionary,
  locale,
  onReplayGame,
  room
}: {
  dictionary: GameDictionary;
  locale: Locale;
  onReplayGame: (gameId: string, moves: Move[]) => void;
  room: FriendRoomController;
}) {
  const snapshot = room.room?.snapshot;
  const moves = snapshot?.moves ?? [];
  const visibleMoves = moves.slice(-20);
  const previousRecord = room.previousGameRecord;
  const clientState = room.room;
  const profileHref =
    previousRecord?.visibility === "public" && clientState?.role === "player"
      ? getProfileUrl(locale, clientState.playerId, clientState.name)
      : null;

  return (
    <div className="table-history-panel">
      {snapshot?.status === "finished" ? (
        <button
          className="mode-pill"
          data-table-replay-current
          onClick={() => onReplayGame(snapshot.gameId, snapshot.moves)}
          type="button"
        >
          {dictionary.room.reviewGame}
        </button>
      ) : null}
      {room.previousGameRecordStatus === "loading" ? (
        <p className="room-message">{dictionary.room.previousGameLoading}</p>
      ) : null}
      {previousRecord ? (
        <div className="table-previous-game">
          <div>
            <p className="metric-label">{dictionary.room.previousGame}</p>
            <strong>{previousRecord.gameId}</strong>
            <p className="room-message">
              {dictionary.room.recordMoves.replace("{count}", String(previousRecord.moveSeq))}
            </p>
          </div>
          <div className="table-previous-game-actions">
            <button
              className="mode-pill"
              data-table-replay-previous
              onClick={() => onReplayGame(previousRecord.gameId, previousRecord.moves)}
              type="button"
            >
              {dictionary.room.reviewGame}
            </button>
            {profileHref ? (
              <a className="mode-pill" data-table-record-profile href={profileHref}>
                {dictionary.room.gameRecords}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {visibleMoves.length === 0 ? (
        <p className="room-message">{dictionary.room.noMoves}</p>
      ) : (
        <ol className="table-move-history">
          {visibleMoves.map((move) => (
            <li key={move.moveNumber}>
              <span aria-hidden="true" className={`stone-preview ${move.stone}`} />
              <span>
                {dictionary.room.replayMove
                  .replace("{move}", String(move.moveNumber))
                  .replace("{total}", String(moves.length))}
              </span>
              <span>
                {dictionary.board.point
                  .replace("{row}", String(move.row + 1))
                  .replace("{col}", String(move.col + 1))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TableRoomInfo({ dictionary, room }: Omit<TableSidebarTabsProps, "locale" | "onReplayGame">) {
  const clientState = room.room;

  if (!clientState) {
    return null;
  }

  const labels = dictionary.room;
  const snapshot = clientState.snapshot;
  const seatLabel =
    clientState.role === "spectator"
      ? labels.spectatorSeat
      : clientState.seat === "black"
        ? labels.blackSeat
        : labels.whiteSeat;

  return (
    <div className="table-room-info">
      <dl>
        <div>
          <dt>{labels.roomCode}</dt>
          <dd>{snapshot.code}</dd>
        </div>
        <div>
          <dt>{labels.roomVisibility}</dt>
          <dd>{snapshot.visibility === "unlisted" ? labels.unlistedRoom : labels.publicRoom}</dd>
        </div>
        {snapshot.hostPublicHandle ? (
          <div>
            <dt>{labels.hostHandle}</dt>
            <dd>@{snapshot.hostPublicHandle}</dd>
          </div>
        ) : null}
        <div>
          <dt>{labels.yourSeat}</dt>
          <dd>{seatLabel}</dd>
        </div>
        <div>
          <dt>{labels.spectators}</dt>
          <dd>{snapshot.spectators.length}</dd>
        </div>
        <div>
          <dt>{labels.connection}</dt>
          <dd>{room.connectionStatus === "connected" ? labels.connected : labels.disconnected}</dd>
        </div>
      </dl>
      <button className="mode-pill" onClick={room.copyInvite} type="button">
        <Copy aria-hidden="true" focusable={false} />
        {room.copiedInvite ? labels.copied : labels.copyInvite}
      </button>
    </div>
  );
}

function getTabLabel(tab: TableSidebarTab, dictionary: GameDictionary): string {
  if (tab === "chat") {
    return dictionary.room.roomChat;
  }

  if (tab === "history") {
    return dictionary.room.moveHistory;
  }

  return dictionary.room.roomInfo;
}
