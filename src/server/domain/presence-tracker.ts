import type { PlayerIdentityKind } from "../accounts";
import {
  type CreateRoomInput,
  type RoomParticipantRole,
  type RoomPresenceLocation,
  type RoomResult,
  type RoomStatus,
  evictOldestMapEntries,
  failure,
  normalizePlayerInput,
  success
} from "./room-state-machine";

export type PresenceStatus = "online" | "in_room" | "playing" | "spectating" | "offline";

export type UserPresenceSnapshot = {
  connected: boolean;
  identity: PlayerIdentityKind;
  lastSeenAt: number;
  name: string;
  playerId: string;
  role: RoomParticipantRole | null;
  roomCode: string | null;
  roomStatus: RoomStatus | null;
  status: PresenceStatus;
};

export type PresenceListQuery = {
  includeOffline?: boolean;
  limit?: number;
};

export type PresenceSnapshot = {
  generatedAt: number;
  guestToken?: string;
  users: UserPresenceSnapshot[];
  version: number;
};

export type PresenceEntry = {
  connectionCount: number;
  identity: PlayerIdentityKind;
  lastSeenAt: number;
  name: string;
  playerId: string;
};

const MAX_TRANSIENT_IDENTITIES = 10_000;
const PRESENCE_RETENTION_MS = 6 * 60 * 60 * 1000;

export type PresenceTrackerOptions = {
  now?: () => number;
  presenceRetentionMs?: number;
  transientIdentityLimit?: number;
  getLobbyVersion?: () => number;
  getRoomPresenceIndex?: () => Map<string, RoomPresenceLocation>;
};

export class PresenceTracker {
  private readonly presences = new Map<string, PresenceEntry>();
  private presenceVersion = 0;
  private readonly now: () => number;
  private readonly presenceRetentionMs: number;
  private readonly transientIdentityLimit: number;
  private readonly getLobbyVersion: () => number;
  private readonly getRoomPresenceIndex: () => Map<string, RoomPresenceLocation>;

  constructor(options: PresenceTrackerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.presenceRetentionMs = Math.max(1, options.presenceRetentionMs ?? PRESENCE_RETENTION_MS);
    this.transientIdentityLimit = Math.max(1, Math.floor(options.transientIdentityLimit ?? MAX_TRANSIENT_IDENTITIES));
    this.getLobbyVersion = options.getLobbyVersion ?? (() => 0);
    this.getRoomPresenceIndex = options.getRoomPresenceIndex ?? (() => new Map());
  }

  connectPresence(input: CreateRoomInput): RoomResult<PresenceSnapshot> {
    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const now = this.now();
    this.pruneTransientIdentityState(now);
    const entry =
      this.presences.get(player.id) ??
      ({
        connectionCount: 0,
        identity: player.identity,
        lastSeenAt: now,
        name: player.name,
        playerId: player.id
      } satisfies PresenceEntry);

    entry.connectionCount += 1;
    entry.identity = player.identity;
    entry.lastSeenAt = now;
    entry.name = player.name;
    this.presences.set(player.id, entry);
    this.nextPresenceVersion();

    return success(this.listPresence());
  }

  updatePresence(input: CreateRoomInput): RoomResult<PresenceSnapshot> {
    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const now = this.now();
    this.pruneTransientIdentityState(now);
    const entry =
      this.presences.get(player.id) ??
      ({
        connectionCount: 0,
        identity: player.identity,
        lastSeenAt: now,
        name: player.name,
        playerId: player.id
      } satisfies PresenceEntry);

    entry.identity = player.identity;
    entry.lastSeenAt = now;
    entry.name = player.name;
    this.presences.set(player.id, entry);
    this.nextPresenceVersion();

    return success(this.listPresence());
  }

  disconnectPresence(playerId: string): PresenceSnapshot {
    const normalizedPlayerId = playerId.trim();
    const entry = this.presences.get(normalizedPlayerId);

    if (!entry) {
      return this.listPresence();
    }

    entry.connectionCount = Math.max(0, entry.connectionCount - 1);
    entry.lastSeenAt = this.now();
    this.nextPresenceVersion();

    return this.listPresence();
  }

  listPresence(query: PresenceListQuery = {}): PresenceSnapshot {
    const now = this.now();
    this.pruneTransientIdentityState(now);
    const limit = clampPresenceListLimit(query.limit);
    const roomPresenceIndex = this.getRoomPresenceIndex();
    const users = [...this.presences.values()]
      .map((entry) => getPresenceSnapshotForEntry(entry, roomPresenceIndex))
      .filter((presence) => query.includeOffline || presence.connected)
      .sort(comparePresence)
      .slice(0, limit);

    return {
      generatedAt: now,
      users,
      version: this.presenceVersion + this.getLobbyVersion()
    };
  }

  getOnlineUserCount(): number {
    let onlineUsers = 0;
    for (const entry of this.presences.values()) {
      if (entry.connectionCount > 0) {
        onlineUsers += 1;
      }
    }
    return onlineUsers;
  }

  getPresenceVersion(): number {
    return this.presenceVersion;
  }

  private nextPresenceVersion(): number {
    this.presenceVersion += 1;
    return this.presenceVersion;
  }

  private pruneTransientIdentityState(now: number): void {
    const presenceCutoff = now - this.presenceRetentionMs;

    for (const [playerId, entry] of this.presences) {
      if (entry.connectionCount === 0 && entry.lastSeenAt < presenceCutoff) {
        this.presences.delete(playerId);
      }
    }

    evictOldestMapEntries(
      this.presences,
      this.transientIdentityLimit,
      (entry) => entry.connectionCount === 0,
      (entry) => entry.lastSeenAt
    );
  }
}

export function getPresenceStatus(
  connected: boolean,
  roomPresence: { role: RoomParticipantRole; status: RoomStatus } | null
): PresenceStatus {
  if (!connected) {
    return "offline";
  }

  if (!roomPresence) {
    return "online";
  }

  if (roomPresence.role === "spectator") {
    return "spectating";
  }

  return roomPresence.status === "playing" ? "playing" : "in_room";
}

export function getPresenceStatusRank(status: PresenceStatus): number {
  if (status === "playing") {
    return 0;
  }

  if (status === "in_room") {
    return 1;
  }

  if (status === "spectating") {
    return 2;
  }

  if (status === "online") {
    return 3;
  }

  return 4;
}

export function comparePresence(first: UserPresenceSnapshot, second: UserPresenceSnapshot): number {
  const firstStatusRank = getPresenceStatusRank(first.status);
  const secondStatusRank = getPresenceStatusRank(second.status);

  return (
    Number(second.connected) - Number(first.connected) ||
    firstStatusRank - secondStatusRank ||
    second.lastSeenAt - first.lastSeenAt ||
    first.name.localeCompare(second.name) ||
    first.playerId.localeCompare(second.playerId)
  );
}

function getPresenceSnapshotForEntry(
  entry: PresenceEntry,
  roomPresenceIndex: Map<string, RoomPresenceLocation>
): UserPresenceSnapshot {
  const roomPresence = roomPresenceIndex.get(entry.playerId) ?? null;
  const connected = entry.connectionCount > 0;

  return {
    connected,
    identity: entry.identity,
    lastSeenAt: entry.lastSeenAt,
    name: entry.name,
    playerId: entry.playerId,
    role: roomPresence?.role ?? null,
    roomCode: roomPresence?.visibility === "public" ? roomPresence.code : null,
    roomStatus: roomPresence?.status ?? null,
    status: getPresenceStatus(connected, roomPresence)
  };
}

function clampPresenceListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(100, Math.max(1, Math.floor(limit)));
}
