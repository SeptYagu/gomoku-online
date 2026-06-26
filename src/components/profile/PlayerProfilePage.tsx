"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, UserRound } from "lucide-react";
import type { Board } from "@/game/types";
import type { Locale } from "@/i18n/config";
import type { GameDictionary } from "@/i18n/dictionaries";
import type {
  GameRecordFinishReason,
  GameRecordStatus,
  PlayerGameRecordResult,
  PlayerGameRecordSummary,
  PlayerProfileSnapshot
} from "@/server/game-records";

type PlayerProfilePageProps = {
  dictionary: GameDictionary;
  initialName?: string;
  locale: Locale;
  playerId: string;
};

type ProfileStatus = "loading" | "ready" | "error";

const ACCOUNT_TOKEN_STORAGE_KEY = "gomoku-account-token";

export function PlayerProfilePage({ dictionary, initialName, locale, playerId }: PlayerProfilePageProps) {
  const labels = dictionary.room;
  const [profile, setProfile] = useState<PlayerProfileSnapshot | null>(null);
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const displayName = profile?.displayName ?? initialName ?? playerId;
  const records = profile?.recentRecords ?? [];
  const profileUrl = useMemo(() => {
    const params = new URLSearchParams({
      limit: "50",
      playerId
    });

    if (initialName?.trim()) {
      params.set("name", initialName.trim());
    }

    return `/api/profile?${params.toString()}`;
  }, [initialName, playerId]);

  const refreshProfile = useCallback(() => {
    const headers: HeadersInit = {
      "accept": "application/json"
    };
    const accountToken = readAccountToken();

    if (accountToken) {
      headers.authorization = `Bearer ${accountToken}`;
    }

    setStatus("loading");
    setError(null);
    void fetch(profileUrl, { headers })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Profile request failed: ${response.status}`);
        }

        return (await response.json()) as PlayerProfileSnapshot;
      })
      .then((nextProfile) => {
        setProfile(nextProfile);
        setStatus("ready");
      })
      .catch((profileError: unknown) => {
        setStatus("error");
        setError(profileError instanceof Error ? profileError.message : "Profile request failed.");
      });
  }, [profileUrl]);

  useEffect(() => {
    const headers: HeadersInit = {
      "accept": "application/json"
    };
    const accountToken = readAccountToken();

    if (accountToken) {
      headers.authorization = `Bearer ${accountToken}`;
    }

    void fetch(profileUrl, { headers })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Profile request failed: ${response.status}`);
        }

        return (await response.json()) as PlayerProfileSnapshot;
      })
      .then((nextProfile) => {
        setProfile(nextProfile);
        setStatus("ready");
      })
      .catch((profileError: unknown) => {
        setStatus("error");
        setError(profileError instanceof Error ? profileError.message : "Profile request failed.");
      });
  }, [profileUrl]);

  return (
    <main className="profile-page-shell">
      <header className="profile-page-header">
        <a className="mode-pill" href={`/${locale}`}>
          <ArrowLeft aria-hidden="true" focusable={false} />
          {dictionary.appName}
        </a>
        <button className="icon-button" onClick={refreshProfile} title={labels.refreshProfile} type="button">
          <RefreshCw aria-hidden="true" focusable={false} />
        </button>
      </header>

      <section className="profile-page-summary" aria-label={labels.profile}>
        <div className="profile-page-avatar">
          <UserRound aria-hidden="true" focusable={false} />
        </div>
        <div className="profile-page-title">
          <p className="metric-label">{labels.profile}</p>
          <h1>{displayName}</h1>
          <p>
            {profile?.identity === "registered" ? labels.account : labels.guestAccount}
            {" · "}
            {playerId}
          </p>
        </div>
      </section>

      <section className="profile-page-stats" aria-label={labels.profile}>
        <ProfileStat label={labels.gamesCount.replace("{count}", String(profile?.stats.games ?? 0))} />
        <ProfileStat label={labels.profileWins.replace("{count}", String(profile?.stats.wins ?? 0))} />
        <ProfileStat label={labels.profileLosses.replace("{count}", String(profile?.stats.losses ?? 0))} />
        <ProfileStat label={labels.profileDraws.replace("{count}", String(profile?.stats.draws ?? 0))} />
        <ProfileStat label={`${labels.recordVerified} ${profile?.stats.verified ?? 0}`} />
        <ProfileStat label={`${labels.recordPartial} ${profile?.stats.partial ?? 0}`} />
      </section>

      <section className="profile-records-section" aria-label={labels.gameRecords}>
        <div className="profile-section-header">
          <p className="metric-label">{labels.gameRecords}</p>
          <strong>{records.length}</strong>
        </div>

        {records.length > 0 ? (
          <div className="profile-record-grid">
            {records.map((record) => (
              <ProfileRecordCard key={record.gameId} labels={labels} record={record} />
            ))}
          </div>
        ) : (
          <p className="room-message">{status === "loading" ? labels.refreshProfile : labels.noGameRecords}</p>
        )}

        {status === "error" && error ? <p className="room-error">{error}</p> : null}
      </section>
    </main>
  );
}

function ProfileStat({ label }: { label: string }) {
  return <span>{label}</span>;
}

function ProfileRecordCard({
  labels,
  record
}: {
  labels: GameDictionary["room"];
  record: PlayerGameRecordSummary;
}) {
  return (
    <article className={`profile-record-card ${record.result}`}>
      <MiniBoard board={record.board} />
      <div className="profile-record-main">
        <strong>
          {getPlayerResultLabel(record.result, labels)}
          {" · "}
          {getFinishReasonLabel(record.finishReason, labels)}
        </strong>
        <p>
          {labels.recordOpponent.replace("{name}", record.opponentName)}
          {" · "}
          {record.gameId}
          {" · "}
          {record.roomCode}
          {" · "}
          {formatRecordTime(record.finishedAt)}
        </p>
        <div className="profile-record-meta">
          <span>{labels.recordMoves.replace("{count}", String(record.moveSeq))}</span>
          <span>{getRecordStatusLabel(record.recordStatus, labels)}</span>
          <span>{record.playerSeat === "black" ? labels.blackSeat : labels.whiteSeat}</span>
        </div>
      </div>
    </article>
  );
}

function MiniBoard({ board }: { board: Board }) {
  return (
    <div className="profile-mini-board" aria-hidden="true">
      {board.map((row, rowIndex) =>
        row.map((stone, colIndex) => (
          <span
            className={`profile-mini-cell${stone ? ` ${stone}` : ""}`}
            key={`${rowIndex}-${colIndex}`}
          />
        ))
      )}
    </div>
  );
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

function formatRecordTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(timestamp));
}

function readAccountToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCOUNT_TOKEN_STORAGE_KEY);
}
