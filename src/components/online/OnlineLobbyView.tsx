"use client";

import { useState } from "react";
import { LogOut, Trophy, UserRound, Users } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import { MAX_PLAYER_NAME_LENGTH } from "@/lib/constants";
import { getProfileUrl } from "../profile/profile-url";
import type { FriendRoomController } from "../useFriendRoom";
import { useOptionalRoomContext } from "./RoomContext";
import { LobbyLeaderboard } from "./lobby/LobbyLeaderboard";
import { LobbyMatchmaking } from "./lobby/LobbyMatchmaking";
import { LobbyProfilePanel } from "./lobby/LobbyProfilePanel";
import { LobbyPublicChat } from "./lobby/LobbyPublicChat";
import { LobbyRoomList } from "./lobby/LobbyRoomList";
import { LobbyUsersPanel } from "./lobby/LobbyUsersPanel";

export type OnlineViewProps = {
  dictionary: GameDictionary;
  locale?: Locale;
  room?: FriendRoomController;
};

export type OnlineLobbyViewProps = {
  dictionary: GameDictionary;
  locale: Locale;
  onPlayAi: () => void;
  room?: FriendRoomController;
};

export type LobbySection = "community" | "friends" | "identity" | "progress";

export function OnlineJoiningView({ dictionary, room: roomProp }: OnlineViewProps) {
  const room = useOptionalRoomContext(roomProp);
  return (
    <section aria-label={dictionary.room.panelLabel} className="room-panel" data-online-view="joining">
      <p aria-live="polite" className="room-message">
        {dictionary.room.joiningRoom}
      </p>
      {room.error ? <p className="room-error">{room.error}</p> : null}
    </section>
  );
}

export function OnlineLobbyView({ dictionary, locale, onPlayAi, room: roomProp }: OnlineLobbyViewProps) {
  const room = useOptionalRoomContext(roomProp);
  const labels = dictionary.room;
  const [activeSection, setActiveSection] = useState<LobbySection | null>(null);

  function toggleSection(section: LobbySection) {
    setActiveSection((current) => (current === section ? null : section));
  }

  return (
    <section aria-label={labels.panelLabel} className="room-panel" data-online-view="lobby">
      <div className="lobby-heading">
        <div>
          <p className="metric-label">{labels.panelLabel}</p>
          <strong>{room.account?.displayName ?? room.playerName}</strong>
          {room.account ? <p className="room-message">@{room.account.publicHandle}</p> : null}
        </div>
        <button
          aria-expanded={activeSection === "identity"}
          className="mode-pill lobby-identity-button"
          data-lobby-section-toggle="identity"
          onClick={() => toggleSection("identity")}
          type="button"
        >
          <UserRound aria-hidden="true" focusable={false} />
          {labels.editIdentity}
        </button>
      </div>

      {activeSection === "identity" ? (
        <section className="lobby-disclosure-panel" data-lobby-section="identity">
          <div className="room-fields lobby-identity-fields">
            <label className="room-field">
              <span>{labels.playerName}</span>
              <input
                maxLength={MAX_PLAYER_NAME_LENGTH}
                onChange={(event) => room.setPlayerName(event.target.value)}
                placeholder={labels.playerNamePlaceholder}
                type="text"
                value={room.playerName}
              />
            </label>
            {!room.account ? (
              <label className="room-field">
                <span>{labels.publicHandle}</span>
                <input
                  autoCapitalize="none"
                  maxLength={20}
                  onChange={(event) => room.setRegistrationHandle(event.target.value)}
                  placeholder={labels.publicHandlePlaceholder}
                  spellCheck={false}
                  type="text"
                  value={room.registrationHandle}
                />
              </label>
            ) : null}
          </div>
          <div className="room-account">
            <div>
              <p className="metric-label">{labels.account}</p>
              <strong>{room.account ? room.account.displayName : labels.guestAccount}</strong>
              {room.account ? <p className="room-message">@{room.account.publicHandle}</p> : null}
            </div>
            {room.account ? (
              <div className="room-account-actions">
                <a className="mode-pill" href={getProfileUrl(locale, room.account.playerId, room.account.displayName)}>
                  <UserRound aria-hidden="true" focusable={false} />
                  {labels.profile}
                </a>
                <button className="mode-pill" onClick={room.signOutAccount} type="button">
                  <LogOut aria-hidden="true" focusable={false} />
                  {labels.signOutAccount}
                </button>
              </div>
            ) : (
              <button
                className="mode-pill"
                disabled={room.accountStatus === "loading"}
                onClick={room.registerAccount}
                type="button"
              >
                <UserRound aria-hidden="true" focusable={false} />
                {room.accountStatus === "loading" ? labels.accountLoading : labels.registerAccount}
              </button>
            )}
          </div>
        </section>
      ) : null}

      <LobbyMatchmaking
        dictionary={dictionary}
        isFriendsOpen={activeSection === "friends"}
        onToggleFriends={() => toggleSection("friends")}
        room={room}
      />

      <LobbyRoomList dictionary={dictionary} onPlayAi={onPlayAi} room={room} />

      <div className="lobby-secondary-actions">
        <button
          aria-expanded={activeSection === "community"}
          className="mode-pill"
          data-lobby-section-toggle="community"
          onClick={() => toggleSection("community")}
          type="button"
        >
          <Users aria-hidden="true" focusable={false} />
          {labels.publicChat} / {labels.onlineUsers}
        </button>
        <button
          aria-expanded={activeSection === "progress"}
          className="mode-pill"
          data-lobby-section-toggle="progress"
          onClick={() => toggleSection("progress")}
          type="button"
        >
          <Trophy aria-hidden="true" focusable={false} />
          {labels.profile} / {labels.leaderboard}
        </button>
      </div>

      {activeSection === "community" ? (
        <section className="lobby-disclosure-panel" data-lobby-section="community">
          <LobbyPublicChat dictionary={dictionary} room={room} />
          <LobbyUsersPanel dictionary={dictionary} room={room} />
        </section>
      ) : null}

      {activeSection === "progress" ? (
        <section className="lobby-disclosure-panel" data-lobby-section="progress">
          <LobbyProfilePanel dictionary={dictionary} room={room} />
          <LobbyLeaderboard dictionary={dictionary} locale={locale} room={room} />
        </section>
      ) : null}

      {room.error ? <p className="room-error">{room.error}</p> : null}
    </section>
  );
}

// Re-export sub-components for flexible consumer imports
export { LobbyUsersPanel, OnlineUsersPanel } from "./lobby/LobbyUsersPanel";
export { LobbyProfilePanel, RoomProfilePanel } from "./lobby/LobbyProfilePanel";
export { LobbyLeaderboard, LeaderboardPanel } from "./lobby/LobbyLeaderboard";
export { LobbyPublicChat, PublicChatPanel } from "./lobby/LobbyPublicChat";
export { LobbyMatchmaking, RoomMatchmakingPanel } from "./lobby/LobbyMatchmaking";
export { LobbyRoomList, RoomLobbyList, LobbyPanel } from "./lobby/LobbyRoomList";
