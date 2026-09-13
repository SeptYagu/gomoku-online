"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import type { GameDictionary } from "@/i18n/dictionaries";
import type {
  GameRecordFinishReason,
  GameRecordStatus,
  PlayerGameRecordResult,
  PlayerGameRecordSummary
} from "@/server/game-records";
import { useOptionalRoomContext } from "../RoomContext";
import type { FriendRoomController } from "../../useFriendRoom";

export type LobbyProfilePanelProps = {
  dictionary: GameDictionary;
  room?: FriendRoomController;
};

export function LobbyProfilePanel({ dictionary, room: roomProp }: LobbyProfilePanelProps) {
  const room = useOptionalRoomContext(roomProp);
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
        <span>{labels.gamesCount.replace("{count}", String(profile?.stats?.games ?? 0))}</span>
        <span>{labels.profileWins.replace("{count}", String(profile?.stats?.wins ?? 0))}</span>
        <span>{labels.profileLosses.replace("{count}", String(profile?.stats?.losses ?? 0))}</span>
        <span>{labels.profileDraws.replace("{count}", String(profile?.stats?.draws ?? 0))}</span>
      </div>

      {records.length > 0 ? (
        <div className="room-record-list">
          {records.map((record) => (
            <RoomRecordItem key={record.gameId} labels={labels} record={record} />
          ))}
        </div>
      ) : (
        <p className="room-message">
          {room.profileStatus === "loading" && !profile ? labels.loading : labels.noGameRecords}
        </p>
      )}
    </section>
  );
}

// Backward compatibility alias
export const RoomProfilePanel = LobbyProfilePanel;

export function RoomRecordItem({
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

export function getPlayerResultLabel(result: PlayerGameRecordResult, labels: GameDictionary["room"]): string {
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

export function getFinishReasonLabel(reason: GameRecordFinishReason, labels: GameDictionary["room"]): string {
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

export function getRecordStatusLabel(status: GameRecordStatus, labels: GameDictionary["room"]): string {
  if (status === "verified") {
    return labels.recordVerified;
  }

  if (status === "conflicted") {
    return labels.recordConflicted;
  }

  return labels.recordPartial;
}

export function formatRecordTime(finishedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(finishedAt));
}
