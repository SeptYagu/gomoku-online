"use client";

import { useEffect } from "react";
import { Bot, Eye, LogIn, RefreshCw, Search, Wifi } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type { RoomListItem, RoomSnapshot } from "@/server/rooms";
import { useOptionalRoomContext } from "../RoomContext";
import type { FriendRoomController } from "../../useFriendRoom";

export type LobbyRoomListProps = {
  dictionary: GameDictionary;
  onPlayAi: () => void;
  room?: FriendRoomController;
};

export function LobbyRoomList({ dictionary, onPlayAi, room: roomProp }: LobbyRoomListProps) {
  const room = useOptionalRoomContext(roomProp);
  const labels = dictionary.room;
  const { refreshLobby } = room;
  const joinableRooms = room.lobbyRooms.filter((lobbyRoom) => lobbyRoom.canJoin);
  const watchableRooms = room.lobbyRooms.filter((lobbyRoom) => !lobbyRoom.canJoin && lobbyRoom.canWatch);
  const hasActionableRooms = joinableRooms.length > 0 || watchableRooms.length > 0;

  useEffect(() => {
    refreshLobby();
  }, [refreshLobby]);

  return (
    <div className="room-lobby">
      <div className="room-lobby-header">
        <p className="metric-label">{labels.availableRooms}</p>
        <button className="icon-button" onClick={room.refreshLobby} title={labels.refreshRooms} type="button">
          <RefreshCw aria-hidden="true" focusable={false} />
        </button>
      </div>
      {room.lobbyActivity ? (
        <div aria-label={labels.lobbyActivityServer} className="lobby-activity-bar" role="status">
          <span className="lobby-activity-pill accent">
            <span aria-hidden="true" className="lobby-activity-dot" />
            {labels.lobbyActivityOnline.replace("{count}", String(room.lobbyActivity.onlineUsers))}
          </span>
          <span className="lobby-activity-pill">
            {labels.lobbyActivityWaiting.replace("{count}", String(room.lobbyActivity.openTables))}
          </span>
          <span className="lobby-activity-pill">
            {labels.lobbyActivityPlaying.replace("{count}", String(room.lobbyActivity.playingTables))}
          </span>
          <span className="lobby-activity-pill">
            {labels.lobbyActivitySpectators.replace("{count}", String(room.lobbyActivity.spectators))}
          </span>
        </div>
      ) : null}
      {room.lobbyStatus === "loading" && room.lobbyRooms.length === 0 ? (
        <p className="room-message">{labels.loadingRooms}</p>
      ) : hasActionableRooms ? (
        <div className="room-lobby-groups">
          {joinableRooms.length > 0 ? (
            <RoomLobbyGroup
              action="join"
              label={labels.joinableRooms}
              labels={labels}
              room={room}
              rooms={joinableRooms}
            />
          ) : null}
          {watchableRooms.length > 0 ? (
            <RoomLobbyGroup
              action="watch"
              label={labels.watchableRooms}
              labels={labels}
              room={room}
              rooms={watchableRooms}
            />
          ) : null}
        </div>
      ) : (
        <div className="room-lobby-empty" data-lobby-empty-state>
          <strong>{labels.noRooms}</strong>
          <p className="room-message">{labels.unlistedRoomNotice}</p>
          <div className="room-lobby-empty-actions">
            <button
              className="mode-pill success"
              data-lobby-action="empty-quick-match"
              disabled={!room.canFindMatch}
              onClick={room.findMatch}
              type="button"
            >
              <Search aria-hidden="true" focusable={false} />
              {labels.findMatch}
            </button>
            <button
              className="mode-pill"
              data-lobby-action="empty-create-unlisted"
              disabled={!room.canCreateRoom}
              onClick={() => room.createRoom("unlisted")}
              type="button"
            >
              <Wifi aria-hidden="true" focusable={false} />
              {labels.createUnlistedRoom}
            </button>
            <button className="mode-pill" onClick={onPlayAi} type="button">
              <Bot aria-hidden="true" focusable={false} />
              {dictionary.modes.ai}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Backward compatibility aliases
export const RoomLobbyList = LobbyRoomList;
export const LobbyPanel = LobbyRoomList;

export function RoomLobbyGroup({
  action,
  label,
  labels,
  room,
  rooms
}: {
  action: "join" | "watch";
  label: string;
  labels: GameDictionary["room"];
  room: FriendRoomController;
  rooms: RoomListItem[];
}) {
  return (
    <section className="room-lobby-group" data-room-group={action === "join" ? "joinable" : "watchable"}>
      <div className="room-lobby-group-heading">
        <strong>{label}</strong>
        <span>{rooms.length}</span>
      </div>
      <div className="room-lobby-list">
        {rooms.map((lobbyRoom) => (
          <div className="room-lobby-item" key={lobbyRoom.code}>
            <div>
              <strong>{lobbyRoom.hostName}</strong>
              <p>
                {lobbyRoom.code}
                {" · "}
                {getLobbyStatusLabel(lobbyRoom.status, labels)}
              </p>
            </div>
            <div className="room-lobby-metrics">
              <span>{labels.playersCount.replace("{count}", String(lobbyRoom.playerCount))}</span>
              <span>{`${labels.spectators}: ${lobbyRoom.spectatorCount}`}</span>
            </div>
            <button
              className="mode-pill"
              disabled={room.accountStatus === "loading"}
              onClick={() => room.joinListedRoom(lobbyRoom.code)}
              type="button"
            >
              {action === "join" ? (
                <LogIn aria-hidden="true" focusable={false} />
              ) : (
                <Eye aria-hidden="true" focusable={false} />
              )}
              {action === "join" ? labels.joinRoom : labels.watchRoom}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function getLobbyStatusLabel(status: RoomSnapshot["status"], labels: GameDictionary["room"]): string {
  if (status === "playing") {
    return labels.lobbyPlaying;
  }

  if (status === "finished") {
    return labels.roomClosed;
  }

  return labels.lobbyWaiting;
}
