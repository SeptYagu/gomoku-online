"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, LogIn, LogOut, Trophy, UserRound, Users } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import { COPY_FEEDBACK_DURATION_MS, MAX_PLAYER_NAME_LENGTH } from "@/lib/constants";
import { copyTextWithFallback } from "../hooks/room-state-utils";
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
  const [authTab, setAuthTab] = useState<"guest" | "login" | "register">("guest");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginToken, setLoginToken] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);

  function toggleSection(section: LobbySection) {
    setActiveSection((current) => (current === section ? null : section));
  }

  const handleCopyToken = useCallback(() => {
    if (!room.account?.token) {
      return;
    }

    if (!navigator.clipboard) {
      if (copyTextWithFallback(room.account.token)) {
        setCopiedToken(true);
      }
      return;
    }

    void navigator.clipboard
      .writeText(room.account.token)
      .then(() => setCopiedToken(true))
      .catch(() => {
        if (room.account?.token && copyTextWithFallback(room.account.token)) {
          setCopiedToken(true);
        }
      });
  }, [room.account]);

  useEffect(() => {
    if (!copiedToken) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedToken(false), COPY_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [copiedToken]);

  const authTabs: Array<"guest" | "login" | "register"> = ["guest", "login", "register"];

  function handleAuthTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = authTabs.indexOf(authTab);
    if (currentIndex === -1) {
      return;
    }
    let nextTab: "guest" | "login" | "register" | null = null;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextTab = authTabs[(currentIndex + 1) % authTabs.length];
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      nextTab = authTabs[(currentIndex - 1 + authTabs.length) % authTabs.length];
    } else if (event.key === "Home") {
      event.preventDefault();
      nextTab = authTabs[0];
    } else if (event.key === "End") {
      event.preventDefault();
      nextTab = authTabs[authTabs.length - 1];
    }
    if (nextTab) {
      setAuthTab(nextTab);
      const targetElement = document.getElementById(`auth-tab-${nextTab}`);
      targetElement?.focus();
    }
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
          {room.account ? (
            <>
              <div className="room-fields lobby-identity-fields">
                <label className="room-field">
                  <span>{labels.playerName}</span>
                  <input
                    disabled
                    maxLength={MAX_PLAYER_NAME_LENGTH}
                    type="text"
                    value={room.account.displayName}
                  />
                </label>
                <label className="room-field">
                  <span>{labels.publicHandle}</span>
                  <input
                    disabled
                    type="text"
                    value={`@${room.account.publicHandle}`}
                  />
                </label>
              </div>
              <div className="room-account">
                <div>
                  <p className="metric-label">{labels.account}</p>
                  <strong>{room.account.displayName}</strong>
                  <p className="room-message">@{room.account.publicHandle}</p>
                </div>
                <div className="room-account-actions">
                  <a className="mode-pill" href={getProfileUrl(locale, room.account.playerId, room.account.displayName)}>
                    <UserRound aria-hidden="true" focusable={false} />
                    {labels.profile}
                  </a>
                  <button
                    className="mode-pill"
                    onClick={handleCopyToken}
                    title={labels.copyAccountToken}
                    type="button"
                  >
                    {copiedToken ? <Check aria-hidden="true" focusable={false} /> : <Copy aria-hidden="true" focusable={false} />}
                    {copiedToken ? labels.accountTokenCopied : labels.copyAccountToken}
                  </button>
                  <button className="mode-pill" onClick={room.signOutAccount} type="button">
                    <LogOut aria-hidden="true" focusable={false} />
                    {labels.signOutAccount}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                aria-label={labels.account}
                className="lobby-auth-tab-list"
                onKeyDown={handleAuthTabKeyDown}
                role="tablist"
              >
                <button
                  aria-controls="auth-panel-guest"
                  aria-selected={authTab === "guest"}
                  className={`mode-pill ${authTab === "guest" ? "active" : ""}`}
                  id="auth-tab-guest"
                  onClick={() => setAuthTab("guest")}
                  role="tab"
                  tabIndex={authTab === "guest" ? 0 : -1}
                  type="button"
                >
                  {labels.guestAccount}
                </button>
                <button
                  aria-controls="auth-panel-login"
                  aria-selected={authTab === "login"}
                  className={`mode-pill ${authTab === "login" ? "active" : ""}`}
                  id="auth-tab-login"
                  onClick={() => setAuthTab("login")}
                  role="tab"
                  tabIndex={authTab === "login" ? 0 : -1}
                  type="button"
                >
                  {labels.loginTab}
                </button>
                <button
                  aria-controls="auth-panel-register"
                  aria-selected={authTab === "register"}
                  className={`mode-pill ${authTab === "register" ? "active" : ""}`}
                  id="auth-tab-register"
                  onClick={() => setAuthTab("register")}
                  role="tab"
                  tabIndex={authTab === "register" ? 0 : -1}
                  type="button"
                >
                  {labels.registerTab}
                </button>
              </div>

              {authTab === "guest" ? (
                <>
                  <div
                    aria-labelledby="auth-tab-guest"
                    className="room-fields lobby-identity-fields"
                    id="auth-panel-guest"
                    role="tabpanel"
                  >
                    <label className="room-field lobby-identity-span-2">
                      <span>{labels.playerName}</span>
                      <input
                        maxLength={MAX_PLAYER_NAME_LENGTH}
                        onChange={(event) => room.setPlayerName(event.target.value)}
                        placeholder={labels.playerNamePlaceholder}
                        type="text"
                        value={room.playerName}
                      />
                    </label>
                  </div>
                  <div className="room-account">
                    <div>
                      <p className="metric-label">{labels.account}</p>
                      <strong>{labels.guestAccount}</strong>
                    </div>
                  </div>
                </>
              ) : null}

              {authTab === "login" ? (
                <form
                  aria-labelledby="auth-tab-login"
                  className="room-fields lobby-identity-fields"
                  id="auth-panel-login"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!loginIdentifier.trim()) {
                      return;
                    }
                    room.loginAccount({
                      identifier: loginIdentifier.trim(),
                      password: loginPassword || undefined,
                      ownershipToken: loginToken.trim() || undefined,
                      token: loginToken.trim() || undefined
                    });
                  }}
                  role="tabpanel"
                >
                  <label className="room-field">
                    <span>{labels.accountIdentifier}</span>
                    <input
                      autoCapitalize="none"
                      maxLength={32}
                      onChange={(event) => setLoginIdentifier(event.target.value)}
                      placeholder={labels.accountIdentifierPlaceholder}
                      spellCheck={false}
                      type="text"
                      value={loginIdentifier}
                    />
                  </label>
                  <label className="room-field">
                    <span>{labels.accountPassword}</span>
                    <input
                      autoCapitalize="none"
                      maxLength={128}
                      onChange={(event) => setLoginPassword(event.target.value)}
                      placeholder={labels.accountPasswordPlaceholder}
                      type="password"
                      value={loginPassword}
                    />
                  </label>
                  <label className="room-field lobby-identity-span-2">
                    <span>{labels.accountTokenInput}</span>
                    <input
                      autoCapitalize="none"
                      maxLength={128}
                      onChange={(event) => setLoginToken(event.target.value)}
                      placeholder={labels.accountTokenPlaceholder}
                      spellCheck={false}
                      type="text"
                      value={loginToken}
                    />
                  </label>
                  <div className="room-account-actions lobby-identity-span-2">
                    <button
                      className="mode-pill"
                      disabled={room.accountStatus === "loading" || !loginIdentifier.trim()}
                      type="submit"
                    >
                      <LogIn aria-hidden="true" focusable={false} />
                      {room.accountStatus === "loading" ? labels.accountLoading : labels.loginAccount}
                    </button>
                  </div>
                </form>
              ) : null}

              {authTab === "register" ? (
                <form
                  aria-labelledby="auth-tab-register"
                  className="room-fields lobby-identity-fields"
                  id="auth-panel-register"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!room.playerName.trim()) {
                      return;
                    }
                    room.registerAccount({
                      password: registerPassword || undefined
                    });
                  }}
                  role="tabpanel"
                >
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
                  <label className="room-field lobby-identity-span-2">
                    <span>{labels.accountPassword}</span>
                    <input
                      autoCapitalize="none"
                      maxLength={128}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      placeholder={labels.accountPasswordPlaceholder}
                      type="password"
                      value={registerPassword}
                    />
                  </label>
                  <div className="room-account-actions lobby-identity-span-2">
                    <button
                      className="mode-pill"
                      disabled={room.accountStatus === "loading" || !room.playerName.trim()}
                      type="submit"
                    >
                      <UserRound aria-hidden="true" focusable={false} />
                      {room.accountStatus === "loading" ? labels.accountLoading : labels.registerAccount}
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
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
