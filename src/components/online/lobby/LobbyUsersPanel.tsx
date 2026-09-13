"use client";

import { useEffect } from "react";
import { RefreshCw, Users } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { PresenceStatus, UserPresenceSnapshot } from "@/server/rooms";
import { useOptionalRoomContext } from "../RoomContext";
import type { FriendRoomController } from "../../useFriendRoom";

export type LobbyUsersPanelProps = {
  dictionary: GameDictionary;
  room?: FriendRoomController;
};

export function LobbyUsersPanel({ dictionary, room: roomProp }: LobbyUsersPanelProps) {
  const room = useOptionalRoomContext(roomProp);
  const labels = dictionary.room;
  const { refreshPresence } = room;

  useEffect(() => {
    refreshPresence();
  }, [refreshPresence]);

  return (
    <section aria-label={labels.onlineUsers} className="room-presence">
      <div className="room-presence-header">
        <p className="metric-label">{labels.onlineUsers}</p>
        <button className="icon-button" onClick={room.refreshPresence} title={labels.refreshPresence} type="button">
          <RefreshCw aria-hidden="true" focusable={false} />
        </button>
      </div>
      {room.presenceUsers.length > 0 ? (
        <div className="room-presence-list">
          {room.presenceUsers.map((user) => (
            <PresenceUserItem key={user.playerId} labels={labels} user={user} />
          ))}
        </div>
      ) : (
        <p className="room-message">
          {room.presenceStatus === "loading" ? labels.loading : labels.noOnlineUsers}
        </p>
      )}
    </section>
  );
}

// Backward compatibility alias
export const OnlineUsersPanel = LobbyUsersPanel;

export function PresenceUserItem({ labels, user }: { labels: GameDictionary["room"]; user: UserPresenceSnapshot }) {
  return (
    <div className={`room-presence-user ${user.status}`}>
      <Users aria-hidden="true" className="room-presence-icon" focusable={false} />
      <div>
        <strong>{user.name}</strong>
        <p>
          {getPresenceStatusLabel(user.status, labels)}
          {user.roomCode ? ` · ${user.roomCode}` : ""}
        </p>
      </div>
    </div>
  );
}

export function getPresenceStatusLabel(status: PresenceStatus, labels: GameDictionary["room"]): string {
  if (status === "playing") {
    return labels.presencePlaying;
  }

  if (status === "in_room") {
    return labels.presenceInRoom;
  }

  if (status === "spectating") {
    return labels.presenceSpectating;
  }

  if (status === "offline") {
    return labels.presenceOffline;
  }

  return labels.presenceOnline;
}
