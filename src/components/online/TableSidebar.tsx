import type { GameDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { Move } from "@/game/types";
import type { FriendRoomController } from "../useFriendRoom";
import { TablePlayers } from "./TablePlayers";
import { TableSidebarTabs } from "./TableSidebarTabs";

type TableSidebarProps = {
  dictionary: GameDictionary;
  locale: Locale;
  onReplayGame: (gameId: string, moves: Move[]) => void;
  room: FriendRoomController;
};

export function TableSidebar({ dictionary, locale, onReplayGame, room }: TableSidebarProps) {
  const clientState = room.room;

  if (!clientState) {
    return null;
  }

  return (
    <section aria-label={dictionary.room.panelLabel} className="table-sidebar">
      <div className="table-sidebar-heading">
        <div>
          <p className="metric-label">{dictionary.room.roomCode}</p>
          <strong>{clientState.snapshot.code}</strong>
        </div>
        <span className={`table-connection ${room.connectionStatus}`}>
          {room.connectionStatus === "connected" ? dictionary.room.connected : dictionary.room.disconnected}
        </span>
      </div>
      <TablePlayers dictionary={dictionary} room={clientState} />
      <TableSidebarTabs dictionary={dictionary} locale={locale} onReplayGame={onReplayGame} room={room} />
      {room.error ? <p className="room-error">{room.error}</p> : null}
    </section>
  );
}
