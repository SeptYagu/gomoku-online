"use client";

import { useId } from "react";
import { ChevronDown, LogIn, Search, Users, Wifi } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import { useOptionalRoomContext } from "../RoomContext";
import type { FriendRoomController } from "../../useFriendRoom";

export type LobbyMatchmakingProps = {
  dictionary: GameDictionary;
  isFriendsOpen: boolean;
  onToggleFriends: () => void;
  room?: FriendRoomController;
};

export function LobbyMatchmaking({
  dictionary,
  isFriendsOpen,
  onToggleFriends,
  room: roomProp
}: LobbyMatchmakingProps) {
  const room = useOptionalRoomContext(roomProp);
  const labels = dictionary.room;
  const createUnlistedHintId = useId();
  const joinExistingHeadingId = useId();

  return (
    <>
      <div className="lobby-primary-action">
        <button
          className="mode-pill success"
          data-lobby-action="quick-match"
          disabled={!room.canFindMatch}
          onClick={room.findMatch}
          type="button"
        >
          <Search aria-hidden="true" focusable={false} />
          {room.matchmakingStatus === "searching" ? labels.matchmakingSearching : labels.findMatch}
        </button>
      </div>

      <button
        aria-expanded={isFriendsOpen}
        className="lobby-disclosure-toggle"
        data-lobby-section-toggle="friends"
        onClick={onToggleFriends}
        type="button"
      >
        <Users aria-hidden="true" focusable={false} />
        <span>
          <strong>{labels.playWithFriends}</strong>
          <small>{labels.createOrJoin}</small>
        </span>
        <ChevronDown aria-hidden="true" className={isFriendsOpen ? "expanded" : ""} focusable={false} />
      </button>

      {isFriendsOpen ? (
        <section className="lobby-disclosure-panel" data-lobby-section="friends">
          <p className="room-message">{labels.unlistedRoomNotice}</p>
          <div className="lobby-friend-actions">
            <div className="lobby-friend-create-card">
              <div className="lobby-friend-card-content">
                <button
                  aria-describedby={createUnlistedHintId}
                  className="mode-pill"
                  data-lobby-action="create-unlisted"
                  disabled={!room.canCreateRoom}
                  onClick={() => room.createRoom("unlisted")}
                  type="button"
                >
                  <Wifi aria-hidden="true" focusable={false} />
                  {labels.createUnlistedRoom}
                </button>
                <p className="lobby-friend-hint" id={createUnlistedHintId}>
                  {labels.createUnlistedRoomHint}
                </p>
              </div>
            </div>

            <div className="lobby-friend-divider">
              <span>{labels.orJoinExisting}</span>
            </div>

            <div className="lobby-friend-join-card">
              <div className="lobby-friend-join-header">
                <h3 className="lobby-friend-subtitle" id={joinExistingHeadingId}>
                  {labels.joinExistingRoom}
                </h3>
              </div>
              <form
                aria-labelledby={joinExistingHeadingId}
                className="lobby-join-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  room.joinRoom();
                }}
              >
                <label className="room-field">
                  <span>{labels.joinTarget}</span>
                  <input
                    autoCapitalize="none"
                    maxLength={256}
                    onChange={(event) => room.setJoinTarget(event.target.value)}
                    placeholder={labels.joinTargetPlaceholder}
                    spellCheck={false}
                    type="text"
                    value={room.joinTarget}
                  />
                </label>
                <button className="mode-pill" disabled={!room.canJoinRoom} type="submit">
                  <LogIn aria-hidden="true" focusable={false} />
                  {labels.joinRoom}
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

// Backward compatibility alias
export const RoomMatchmakingPanel = LobbyMatchmaking;
