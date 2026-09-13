import type { PlayerIdentityKind } from "./accounts";
import type {
  GameRecordClientSubmission,
  GameRecordSubmitResult,
  GameRecordStore,
  LeaderboardQuery,
  LeaderboardSnapshot,
  PlayerProfileSnapshot,
  RoomGameRecordSnapshot,
  SavedGameRecord
} from "./game-records";
import { LeaderboardService } from "./domain/leaderboard-service";
import {
  PresenceTracker,
  type PresenceListQuery,
  type PresenceSnapshot,
  type PresenceStatus,
  type UserPresenceSnapshot
} from "./domain/presence-tracker";
import {
  RoomStateMachine,
  createRoomCode,
  type CreateRoomInput,
  type JoinRoomInput,
  type LobbyActivitySummary,
  type LobbyRoomDeletedEvent,
  type LobbyRoomUpdatedEvent,
  type MoveIntent,
  type PublicChatMessage,
  type PublicChatSnapshot,
  type RematchStateSnapshot,
  type RoomChatMessage,
  type RoomCleanupResult,
  type RoomError,
  type RoomErrorCode,
  type RoomLifecycleSweep,
  type RoomListItem,
  type RoomListQuery,
  type RoomListSnapshot,
  type RoomListStatus,
  type RoomParticipantRole,
  type RoomPlayerSeat,
  type RoomPlayerSnapshot,
  type RoomResult,
  type RoomSnapshot,
  type RoomSpectatorSnapshot,
  type RoomStatus,
  type RoomVisibility,
  type UndoRequestSnapshot
} from "./domain/room-state-machine";

export type {
  RoomStatus,
  RoomPlayerSeat,
  RoomParticipantRole,
  RoomPlayerSnapshot,
  RoomSpectatorSnapshot,
  UndoRequestSnapshot,
  RematchStateSnapshot,
  RoomChatMessage,
  PublicChatMessage,
  PublicChatSnapshot,
  PresenceStatus,
  UserPresenceSnapshot,
  PresenceListQuery,
  PresenceSnapshot,
  RoomSnapshot,
  RoomListStatus,
  RoomVisibility,
  RoomListItem,
  RoomListQuery,
  LobbyActivitySummary,
  RoomListSnapshot,
  LobbyRoomUpdatedEvent,
  LobbyRoomDeletedEvent,
  RoomCleanupResult,
  CreateRoomInput,
  JoinRoomInput,
  MoveIntent,
  RoomErrorCode,
  RoomError,
  RoomResult,
  RoomLifecycleSweep,
  PlayerIdentityKind
};

export { createRoomCode };

export type RoomStoreOptions = {
  codeGenerator?: () => string;
  codeLength?: number;
  completedRoomTtlMs?: number;
  disconnectGraceMs?: number;
  emptyRoomTtlMs?: number;
  gameRecordStore?: GameRecordStore;
  now?: () => number;
  presenceRetentionMs?: number;
  transientIdentityLimit?: number;
  roomTtlMs?: number;
};

/**
 * Facade for server room and presence domain services.
 * Delegates lifecycle, presence, and leaderboard operations to their
 * respective micro-domain services while maintaining 100% backward compatibility.
 */
export class RoomStore {
  readonly leaderboardService: LeaderboardService;
  readonly roomStateMachine: RoomStateMachine;
  readonly presenceTracker: PresenceTracker;

  constructor(options: RoomStoreOptions = {}) {
    const now = options.now ?? Date.now;

    this.leaderboardService = new LeaderboardService({
      gameRecordStore: options.gameRecordStore,
      now
    });

    this.roomStateMachine = new RoomStateMachine({
      codeGenerator: options.codeGenerator,
      codeLength: options.codeLength,
      completedRoomTtlMs: options.completedRoomTtlMs,
      disconnectGraceMs: options.disconnectGraceMs,
      emptyRoomTtlMs: options.emptyRoomTtlMs,
      roomTtlMs: options.roomTtlMs,
      transientIdentityLimit: options.transientIdentityLimit,
      now,
      getOnlineUserCount: () => this.presenceTracker.getOnlineUserCount(),
      onGameFinished: (game) => this.leaderboardService.recordAuthoritative(game)
    });

    this.presenceTracker = new PresenceTracker({
      now,
      presenceRetentionMs: options.presenceRetentionMs,
      transientIdentityLimit: options.transientIdentityLimit,
      getLobbyVersion: () => this.roomStateMachine.getLobbyVersion(),
      getRoomPresenceIndex: () => this.roomStateMachine.buildRoomPresenceIndex()
    });
  }

  // ─── Room Lifecycle & Game Actions (delegated to RoomStateMachine) ───

  createRoom(input: CreateRoomInput): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.createRoom(input);
  }

  findMatch(input: JoinRoomInput): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.findMatch(input);
  }

  joinRoom(roomCode: string, input: JoinRoomInput): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.joinRoom(roomCode, input);
  }

  sitPlayer(roomCode: string, playerId: string, requestedSeat?: RoomPlayerSeat): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.sitPlayer(roomCode, playerId, requestedSeat);
  }

  reconnectRoom(roomCode: string, input: JoinRoomInput): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.reconnectRoom(roomCode, input);
  }

  setPlayerReady(roomCode: string, playerId: string, ready = true): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.setPlayerReady(roomCode, playerId, ready);
  }

  startGame(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.startGame(roomCode, playerId);
  }

  applyMove(roomCode: string, intent: MoveIntent): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.applyMove(roomCode, intent);
  }

  resignGame(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.resignGame(roomCode, playerId);
  }

  requestUndo(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.requestUndo(roomCode, playerId);
  }

  respondToUndo(
    roomCode: string,
    playerId: string,
    requestId: string,
    accepted: boolean
  ): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.respondToUndo(roomCode, playerId, requestId, accepted);
  }

  restartGame(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.restartGame(roomCode, playerId);
  }

  setRematchReady(roomCode: string, playerId: string, ready: boolean): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.setRematchReady(roomCode, playerId, ready);
  }

  markDisconnected(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.markDisconnected(roomCode, playerId);
  }

  leaveRoom(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.leaveRoom(roomCode, playerId);
  }

  sendRoomChat(roomCode: string, playerId: string, text: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.sendRoomChat(roomCode, playerId, text);
  }

  restoreConnection(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.restoreConnection(roomCode, playerId);
  }

  getSnapshot(roomCode: string): RoomResult<RoomSnapshot> {
    return this.roomStateMachine.getSnapshot(roomCode);
  }

  listRooms(query: RoomListQuery = {}): RoomListSnapshot {
    return this.roomStateMachine.listRooms(query);
  }

  getLobbyActivitySummary(): LobbyActivitySummary {
    return this.roomStateMachine.getLobbyActivitySummary();
  }

  listPublicChatMessages(): PublicChatSnapshot {
    return this.roomStateMachine.listPublicChatMessages();
  }

  sendPublicChat(input: CreateRoomInput & { text: string }): RoomResult<PublicChatSnapshot> {
    return this.roomStateMachine.sendPublicChat(input);
  }

  getPlayerSeat(roomCode: string, playerId: string): RoomPlayerSeat | null {
    return this.roomStateMachine.getPlayerSeat(roomCode, playerId);
  }

  getParticipantRole(
    roomCode: string,
    playerId: string
  ): { identity: PlayerIdentityKind; name: string; role: RoomParticipantRole; seat: RoomPlayerSeat | null } | null {
    return this.roomStateMachine.getParticipantRole(roomCode, playerId);
  }

  leaveParticipantRooms(playerId: string, keepRoomCode?: string): RoomCleanupResult {
    return this.roomStateMachine.leaveParticipantRooms(playerId, keepRoomCode);
  }

  leaveDisposableWaitingRoomsByParticipantName(playerName: string, keepRoomCode?: string): RoomCleanupResult {
    return this.roomStateMachine.leaveDisposableWaitingRoomsByParticipantName(playerName, keepRoomCode);
  }

  sweepExpiredRooms(): RoomLifecycleSweep {
    return this.roomStateMachine.sweepExpiredRooms();
  }

  getLobbyVersion(): number {
    return this.roomStateMachine.getLobbyVersion();
  }

  resolveHostRoom(accountId: string): string | null {
    return this.roomStateMachine.resolveHostRoom(accountId);
  }

  getRoomListItem(roomCode: string): RoomListItem | null {
    return this.roomStateMachine.getRoomListItem(roomCode);
  }

  listRoomCodes(): string[] {
    return this.roomStateMachine.listRoomCodes();
  }

  deleteRoom(roomCode: string): RoomSnapshot | null {
    return this.roomStateMachine.deleteRoom(roomCode);
  }

  // ─── Presence Management (delegated to PresenceTracker) ───

  connectPresence(input: CreateRoomInput): RoomResult<PresenceSnapshot> {
    return this.presenceTracker.connectPresence(input);
  }

  updatePresence(input: CreateRoomInput): RoomResult<PresenceSnapshot> {
    return this.presenceTracker.updatePresence(input);
  }

  disconnectPresence(playerId: string): PresenceSnapshot {
    return this.presenceTracker.disconnectPresence(playerId);
  }

  listPresence(query: PresenceListQuery = {}): PresenceSnapshot {
    return this.presenceTracker.listPresence(query);
  }

  // ─── Game Records & Leaderboard (delegated to LeaderboardService) ───

  submitGameRecord(input: GameRecordClientSubmission): RoomResult<GameRecordSubmitResult> {
    return this.leaderboardService.submitGameRecord(input);
  }

  listGameRecords(limit?: number): SavedGameRecord[] {
    return this.leaderboardService.listGameRecords(limit);
  }

  getRoomGameRecord(gameId: string, roomCode: string): RoomResult<RoomGameRecordSnapshot> {
    return this.leaderboardService.getRoomGameRecord(gameId, roomCode);
  }

  getLeaderboard(query?: LeaderboardQuery): LeaderboardSnapshot {
    return this.leaderboardService.getLeaderboard(query);
  }

  getPlayerProfile(
    playerId: string,
    displayName?: string,
    limit?: number,
    identity?: PlayerIdentityKind
  ): PlayerProfileSnapshot {
    return this.leaderboardService.getPlayerProfile(playerId, displayName, limit, identity);
  }
}
