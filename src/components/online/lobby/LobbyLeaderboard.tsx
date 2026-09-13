"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search, Trophy } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import type {
  LeaderboardEntry,
  LeaderboardIdentity,
  LeaderboardScope
} from "@/server/game-records";
import { getProfileUrl } from "../../profile/profile-url";
import { useOptionalRoomContext } from "../RoomContext";
import type { FriendRoomController } from "../../useFriendRoom";

export const LEADERBOARD_SCOPES: LeaderboardScope[] = ["overall", "daily", "streak"];
export const LEADERBOARD_IDENTITIES: LeaderboardIdentity[] = ["registered", "guest", "all"];

export type LobbyLeaderboardProps = {
  dictionary: GameDictionary;
  locale: Locale;
  room?: FriendRoomController;
};

export function LobbyLeaderboard({ dictionary, locale, room: roomProp }: LobbyLeaderboardProps) {
  const room = useOptionalRoomContext(roomProp);
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
          {room.leaderboardStatus === "loading" ? labels.loading : labels.leaderboardNoEntries}
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

// Backward compatibility alias
export const LeaderboardPanel = LobbyLeaderboard;

export function LeaderboardEntryItem({
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

export function getLeaderboardScopeLabel(scope: LeaderboardScope, labels: GameDictionary["room"]): string {
  if (scope === "daily") {
    return labels.leaderboardDaily;
  }

  if (scope === "streak") {
    return labels.leaderboardStreak;
  }

  return labels.leaderboardOverall;
}

export function getLeaderboardIdentityLabel(identity: LeaderboardIdentity, labels: GameDictionary["room"]): string {
  if (identity === "all") {
    return labels.leaderboardAll;
  }

  return getLeaderboardEntryIdentityLabel(identity, labels);
}

export function getLeaderboardEntryIdentityLabel(
  identity: Exclude<LeaderboardIdentity, "all">,
  labels: GameDictionary["room"]
): string {
  return identity === "registered" ? labels.leaderboardRegistered : labels.leaderboardGuests;
}
