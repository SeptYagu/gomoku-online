"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { Move } from "@/game/types";
import type { FriendRoomController } from "../useFriendRoom";
import { TableRoomChat } from "./TableRoomChat";

type TableSidebarTab = "chat" | "history" | "info";

type TableSidebarTabsProps = {
  dictionary: GameDictionary;
  room: FriendRoomController;
};

const TABS: TableSidebarTab[] = ["chat", "history", "info"];

export function TableSidebarTabs({ dictionary, room }: TableSidebarTabsProps) {
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
        {activeTab === "history" ? <TableMoveHistory dictionary={dictionary} moves={snapshot.moves} /> : null}
        {activeTab === "info" ? <TableRoomInfo dictionary={dictionary} room={room} /> : null}
      </div>
    </div>
  );
}

function TableMoveHistory({ dictionary, moves }: { dictionary: GameDictionary; moves: Move[] }) {
  const visibleMoves = moves.slice(-20);

  if (visibleMoves.length === 0) {
    return <p className="room-message">{dictionary.room.noMoves}</p>;
  }

  return (
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
  );
}

function TableRoomInfo({ dictionary, room }: TableSidebarTabsProps) {
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
