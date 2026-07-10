"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Send,
  Trophy,
  UserRound,
  Users,
  Wifi
} from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import type {
  GameRecordFinishReason,
  GameRecordStatus,
  LeaderboardEntry,
  LeaderboardIdentity,
  LeaderboardScope,
  PlayerGameRecordResult,
  PlayerGameRecordSummary
} from "@/server/game-records";
import type { PresenceStatus, RoomListItem, RoomSnapshot, UserPresenceSnapshot } from "@/server/rooms";
import { getProfileUrl } from "../profile/profile-url";
import type { FriendRoomController } from "../useFriendRoom";

const LEADERBOARD_SCOPES: LeaderboardScope[] = ["overall", "daily", "streak"];
const LEADERBOARD_IDENTITIES: LeaderboardIdentity[] = ["registered", "guest", "all"];

type OnlineViewProps = {
  dictionary: GameDictionary;
  locale: Locale;
  room: FriendRoomController;
};

type OnlineLobbyViewProps = OnlineViewProps & {
  onPlayAi: () => void;
};

type LobbySection = "community" | "friends" | "identity" | "progress";

export function OnlineJoiningView({ dictionary, room }: OnlineViewProps) {
  return (
    <section aria-label={dictionary.room.panelLabel} className="room-panel" data-online-view="joining">
      <p aria-live="polite" className="room-message">
        {dictionary.room.joiningRoom}
      </p>
      {room.error ? <p className="room-error">{room.error}</p> : null}
    </section>
  );
}

export function OnlineLobbyView({ dictionary, locale, onPlayAi, room }: OnlineLobbyViewProps) {
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
                maxLength={24}
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
        aria-expanded={activeSection === "friends"}
        className="lobby-disclosure-toggle"
        data-lobby-section-toggle="friends"
        onClick={() => toggleSection("friends")}
        type="button"
      >
        <Users aria-hidden="true" focusable={false} />
        <span>
          <strong>{labels.playWithFriends}</strong>
          <small>{labels.createOrJoin}</small>
        </span>
        <ChevronDown aria-hidden="true" className={activeSection === "friends" ? "expanded" : ""} focusable={false} />
      </button>

      {activeSection === "friends" ? (
        <section className="lobby-disclosure-panel" data-lobby-section="friends">
          <p className="room-message">{labels.unlistedRoomNotice}</p>
          <div className="lobby-friend-actions">
            <button
              className="mode-pill"
              data-lobby-action="create-unlisted"
              disabled={!room.canCreateRoom}
              onClick={() => room.createRoom("unlisted")}
              type="button"
            >
              <Wifi aria-hidden="true" focusable={false} />
              {labels.createUnlistedRoom}
            </button>
            <form
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
        </section>
      ) : null}

      <RoomLobbyList dictionary={dictionary} onPlayAi={onPlayAi} room={room} />

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
          <PublicChatPanel dictionary={dictionary} room={room} />
          <OnlineUsersPanel dictionary={dictionary} room={room} />
        </section>
      ) : null}

      {activeSection === "progress" ? (
        <section className="lobby-disclosure-panel" data-lobby-section="progress">
          <RoomProfilePanel dictionary={dictionary} room={room} />
          <LeaderboardPanel dictionary={dictionary} locale={locale} room={room} />
        </section>
      ) : null}
      {room.error ? <p className="room-error">{room.error}</p> : null}
    </section>
  );
}

function OnlineUsersPanel({ dictionary, room }: { dictionary: GameDictionary; room: FriendRoomController }) {
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
          {room.presenceStatus === "loading" ? labels.refreshPresence : labels.noOnlineUsers}
        </p>
      )}
    </section>
  );
}

function PresenceUserItem({ labels, user }: { labels: GameDictionary["room"]; user: UserPresenceSnapshot }) {
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

function RoomProfilePanel({ dictionary, room }: { dictionary: GameDictionary; room: FriendRoomController }) {
  const labels = dictionary.room;
  const { refreshProfile } = room;
  const profile = room.profile;
  const records = profile?.recentRecords ?? [];

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <section aria-label={labels.profile} className="room-profile">
      <div className="room-profile-header">
        <div>
          <p className="metric-label">{labels.profile}</p>
          <strong>{profile?.displayName ?? room.playerName}</strong>
        </div>
        <button className="icon-button" onClick={room.refreshProfile} title={labels.refreshProfile} type="button">
          <RefreshCw aria-hidden="true" focusable={false} />
        </button>
      </div>

      <div className="room-profile-stats">
        <span>{labels.gamesCount.replace("{count}", String(profile?.stats.games ?? 0))}</span>
        <span>{labels.profileWins.replace("{count}", String(profile?.stats.wins ?? 0))}</span>
        <span>{labels.profileLosses.replace("{count}", String(profile?.stats.losses ?? 0))}</span>
        <span>{labels.profileDraws.replace("{count}", String(profile?.stats.draws ?? 0))}</span>
      </div>

      {records.length > 0 ? (
        <div className="room-record-list">
          {records.map((record) => (
            <RoomRecordItem key={record.gameId} labels={labels} record={record} />
          ))}
        </div>
      ) : (
        <p className="room-message">
          {room.profileStatus === "loading" && !profile ? labels.refreshProfile : labels.noGameRecords}
        </p>
      )}
    </section>
  );
}

function RoomRecordItem({
  labels,
  record
}: {
  labels: GameDictionary["room"];
  record: PlayerGameRecordSummary;
}) {
  return (
    <article className={`room-record-item ${record.result}`}>
      <div>
        <strong>
          {getPlayerResultLabel(record.result, labels)}
          {" · "}
          {getFinishReasonLabel(record.finishReason, labels)}
        </strong>
        <p>
          {labels.recordOpponent.replace("{name}", record.opponentName)}
          {" · "}
          {record.roomCode}
          {" · "}
          {formatRecordTime(record.finishedAt)}
        </p>
      </div>
      <div className="room-record-metrics">
        <span>{labels.recordMoves.replace("{count}", String(record.moveSeq))}</span>
        <span>{getRecordStatusLabel(record.recordStatus, labels)}</span>
      </div>
    </article>
  );
}

function LeaderboardPanel({
  dictionary,
  locale,
  room
}: {
  dictionary: GameDictionary;
  locale: Locale;
  room: FriendRoomController;
}) {
  const labels = dictionary.room;
  const { refreshLeaderboard } = room;
  const entries = room.leaderboard?.entries ?? [];
  const pageOffset = room.leaderboard?.offset ?? room.leaderboardOffset;
  const pageStart = entries.length > 0 ? pageOffset + 1 : 0;
  const pageEnd = pageOffset + entries.length;
  const totalEntries = room.leaderboard?.totalEntries ?? 0;
  const canPreviousPage = pageOffset > 0 && room.leaderboardStatus !== "loading";
  const canNextPage =
    room.leaderboard !== null &&
    room.leaderboard.offset + room.leaderboard.limit < room.leaderboard.totalEntries &&
    room.leaderboardStatus !== "loading";
  const pageLabel = labels.leaderboardPage
    .replace("{start}", String(pageStart))
    .replace("{end}", String(pageEnd))
    .replace("{total}", String(totalEntries));

  useEffect(() => {
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  return (
    <section aria-label={labels.leaderboard} className="room-leaderboard">
      <div className="room-leaderboard-header">
        <div>
          <p className="metric-label">{labels.leaderboard}</p>
          <strong>
            {getLeaderboardIdentityLabel(room.leaderboardIdentity, labels)} /{" "}
            {getLeaderboardScopeLabel(room.leaderboardScope, labels)}
          </strong>
        </div>
        <button className="icon-button" onClick={room.refreshLeaderboard} title={labels.refreshLeaderboard} type="button">
          <RefreshCw aria-hidden="true" focusable={false} />
        </button>
      </div>

      <div className="room-leaderboard-tabs" aria-label={labels.leaderboard}>
        {LEADERBOARD_IDENTITIES.map((identity) => (
          <button
            className={`mode-pill ${room.leaderboardIdentity === identity ? "active" : ""}`}
            key={identity}
            onClick={() => room.setLeaderboardIdentity(identity)}
            type="button"
          >
            {getLeaderboardIdentityLabel(identity, labels)}
          </button>
        ))}
      </div>

      <div className="room-leaderboard-tabs" aria-label={labels.leaderboard}>
        {LEADERBOARD_SCOPES.map((scope) => (
          <button
            className={`mode-pill ${room.leaderboardScope === scope ? "active" : ""}`}
            key={scope}
            onClick={() => room.setLeaderboardScope(scope)}
            type="button"
          >
            {getLeaderboardScopeLabel(scope, labels)}
          </button>
        ))}
      </div>

      <form
        className="room-leaderboard-search"
        onSubmit={(event) => {
          event.preventDefault();
          room.submitLeaderboardSearch();
        }}
      >
        <button className="icon-button" title={labels.leaderboardSearchPlaceholder} type="submit">
          <Search aria-hidden="true" focusable={false} />
        </button>
        <input
          aria-label={labels.leaderboardSearchPlaceholder}
          maxLength={64}
          onChange={(event) => room.setLeaderboardSearch(event.target.value)}
          placeholder={labels.leaderboardSearchPlaceholder}
          type="search"
          value={room.leaderboardSearch}
        />
      </form>

      {entries.length > 0 ? (
        <div className="room-leaderboard-list">
          {entries.map((entry) => (
            <LeaderboardEntryItem
              entry={entry}
              key={entry.playerId}
              labels={labels}
              locale={locale}
              scope={room.leaderboardScope}
            />
          ))}
        </div>
      ) : (
        <p className="room-message">
          {room.leaderboardStatus === "loading" ? labels.refreshLeaderboard : labels.leaderboardNoEntries}
        </p>
      )}

      <div className="room-leaderboard-pagination">
        <button
          className="icon-button"
          disabled={!canPreviousPage}
          onClick={room.previousLeaderboardPage}
          title={labels.leaderboardPrevious}
          type="button"
        >
          <ChevronLeft aria-hidden="true" focusable={false} />
        </button>
        <span>{pageLabel}</span>
        <button
          className="icon-button"
          disabled={!canNextPage}
          onClick={room.nextLeaderboardPage}
          title={labels.leaderboardNext}
          type="button"
        >
          <ChevronRight aria-hidden="true" focusable={false} />
        </button>
      </div>
    </section>
  );
}

function LeaderboardEntryItem({
  entry,
  labels,
  locale,
  scope
}: {
  entry: LeaderboardEntry;
  labels: GameDictionary["room"];
  locale: Locale;
  scope: LeaderboardScope;
}) {
  const primaryMetric =
    scope === "daily"
      ? labels.leaderboardTodayWins.replace("{count}", String(entry.dailyWins))
      : scope === "streak"
        ? labels.leaderboardStreakValue.replace("{count}", String(entry.currentStreak))
        : labels.leaderboardRating.replace("{rating}", String(entry.rating));

  return (
    <a className="room-leaderboard-item" href={getProfileUrl(locale, entry.playerId, entry.displayName)}>
      <span className="room-leaderboard-rank">#{entry.rank}</span>
      <Trophy aria-hidden="true" className="room-leaderboard-icon" focusable={false} />
      <div>
        <strong>{entry.displayName}</strong>
        <p>
          {labels.leaderboardRecord
            .replace("{wins}", String(entry.wins))
            .replace("{losses}", String(entry.losses))
            .replace("{draws}", String(entry.draws))}
        </p>
      </div>
      <div className="room-leaderboard-metrics">
        <span>{getLeaderboardEntryIdentityLabel(entry.identity, labels)}</span>
        <span>{primaryMetric}</span>
        {scope === "overall" ? null : <span>{labels.leaderboardRating.replace("{rating}", String(entry.rating))}</span>}
      </div>
    </a>
  );
}

function PublicChatPanel({ dictionary, room }: { dictionary: GameDictionary; room: FriendRoomController }) {
  const labels = dictionary.room;
  const { refreshPublicChat } = room;

  useEffect(() => {
    refreshPublicChat();
  }, [refreshPublicChat]);

  return (
    <section aria-label={labels.publicChat} className="room-chat public-chat">
      <div className="room-chat-header">
        <p className="metric-label">{labels.publicChat}</p>
      </div>
      <div aria-live="polite" className="room-chat-list" role="log">
        {room.publicChatMessages.length > 0 ? (
          room.publicChatMessages.map((message) => (
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
          room.sendPublicChatMessage();
        }}
      >
        <input
          maxLength={160}
          onChange={(event) => room.setPublicChatText(event.target.value)}
          placeholder={labels.publicChatPlaceholder}
          type="text"
          value={room.publicChatText}
        />
        <button
          className="icon-button"
          disabled={room.accountStatus === "loading" || !room.publicChatText.trim()}
          title={labels.sendMessage}
          type="submit"
        >
          <Send aria-hidden="true" focusable={false} />
        </button>
      </form>
    </section>
  );
}

function RoomLobbyList({
  dictionary,
  onPlayAi,
  room
}: {
  dictionary: GameDictionary;
  onPlayAi: () => void;
  room: FriendRoomController;
}) {
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

function RoomLobbyGroup({
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

function getLobbyStatusLabel(status: RoomSnapshot["status"], labels: GameDictionary["room"]): string {
  if (status === "playing") {
    return labels.lobbyPlaying;
  }

  if (status === "finished") {
    return labels.roomClosed;
  }

  return labels.lobbyWaiting;
}

function getPlayerResultLabel(result: PlayerGameRecordResult, labels: GameDictionary["room"]): string {
  if (result === "win") {
    return labels.resultWin;
  }

  if (result === "loss") {
    return labels.resultLoss;
  }

  if (result === "draw") {
    return labels.resultDraw;
  }

  return labels.resultAbandoned;
}

function getPresenceStatusLabel(status: PresenceStatus, labels: GameDictionary["room"]): string {
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

function getFinishReasonLabel(reason: GameRecordFinishReason, labels: GameDictionary["room"]): string {
  if (reason === "five") {
    return labels.finishFive;
  }

  if (reason === "draw") {
    return labels.finishDraw;
  }

  if (reason === "resign") {
    return labels.finishResign;
  }

  if (reason === "disconnect") {
    return labels.finishDisconnect;
  }

  return labels.finishAbandoned;
}

function getRecordStatusLabel(status: GameRecordStatus, labels: GameDictionary["room"]): string {
  if (status === "verified") {
    return labels.recordVerified;
  }

  if (status === "conflicted") {
    return labels.recordConflicted;
  }

  return labels.recordPartial;
}

function getLeaderboardScopeLabel(scope: LeaderboardScope, labels: GameDictionary["room"]): string {
  if (scope === "daily") {
    return labels.leaderboardDaily;
  }

  if (scope === "streak") {
    return labels.leaderboardStreak;
  }

  return labels.leaderboardOverall;
}

function getLeaderboardIdentityLabel(identity: LeaderboardIdentity, labels: GameDictionary["room"]): string {
  if (identity === "all") {
    return labels.leaderboardAll;
  }

  return getLeaderboardEntryIdentityLabel(identity, labels);
}

function getLeaderboardEntryIdentityLabel(
  identity: Exclude<LeaderboardIdentity, "all">,
  labels: GameDictionary["room"]
): string {
  return identity === "registered" ? labels.leaderboardRegistered : labels.leaderboardGuests;
}

function formatRecordTime(finishedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(finishedAt));
}

function formatChatMessageTime(sentAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(sentAt));
}
