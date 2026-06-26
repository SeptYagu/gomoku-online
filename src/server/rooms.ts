import { randomInt } from "node:crypto";
import { createBoard, getGameResult, getOpponent, isValidMove, placeStone } from "../game/board";
import type { Board, GameStatus, Move, Point, Stone } from "../game/types";
import {
  GameRecordStore,
  type AuthoritativeGameRecord,
  type GameRecordClientSubmission,
  type GameRecordFinishReason,
  type GameRecordSubmitResult,
  type LeaderboardQuery,
  type LeaderboardSnapshot,
  type PlayerProfileSnapshot,
  type SavedGameRecord
} from "./game-records";

export type RoomStatus = "waiting" | "ready" | "playing" | "finished" | "abandoned";

export type RoomPlayerSeat = Stone;
export type RoomParticipantRole = "player" | "spectator";

export type RoomPlayerSnapshot = {
  name: string;
  connected: boolean;
  disconnectDeadline: number | null;
  ready: boolean;
  seat: RoomPlayerSeat;
  undoRequestsRemaining: number;
};

export type RoomSpectatorSnapshot = {
  connected: boolean;
  joinedAt: number;
  name: string;
};

export type UndoRequestSnapshot = {
  expiresAt: number;
  id: string;
  moveSeq: number;
  requestedAt: number;
  requesterSeat: RoomPlayerSeat;
  targetSeat: RoomPlayerSeat;
};

export type RoomChatMessage = {
  id: string;
  name: string;
  role: RoomParticipantRole;
  seat: RoomPlayerSeat | null;
  sentAt: number;
  text: string;
};

export type PublicChatMessage = {
  id: string;
  name: string;
  sentAt: number;
  text: string;
};

export type PublicChatSnapshot = {
  generatedAt: number;
  messages: PublicChatMessage[];
};

export type PresenceStatus = "online" | "in_room" | "playing" | "spectating" | "offline";

export type UserPresenceSnapshot = {
  connected: boolean;
  identity: "guest" | "registered";
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
  users: UserPresenceSnapshot[];
  version: number;
};

export type RoomSnapshot = {
  board: Board;
  chatMessages: RoomChatMessage[];
  code: string;
  createdAt: number;
  currentTurn: Stone;
  finishReason: GameRecordFinishReason | null;
  gameId: string;
  hostSeat: RoomPlayerSeat;
  moveSeq: number;
  moves: Move[];
  players: RoomPlayerSnapshot[];
  spectators: RoomSpectatorSnapshot[];
  status: RoomStatus;
  undoRequest: UndoRequestSnapshot | null;
  updatedAt: number;
  winner: Stone | null;
  winLine: Point[];
};

export type RoomListStatus = Extract<RoomStatus, "waiting" | "playing" | "finished">;

export type RoomListItem = {
  canJoin: boolean;
  canWatch: boolean;
  code: string;
  createdAt: number;
  hostName: string;
  playerCount: number;
  spectatorCount: number;
  status: RoomStatus;
  updatedAt: number;
  version: number;
};

export type RoomListQuery = {
  limit?: number;
  status?: RoomListStatus | "all";
};

export type RoomListSnapshot = {
  generatedAt: number;
  rooms: RoomListItem[];
  version: number;
};

export type LobbyRoomUpdatedEvent = {
  room: RoomListItem;
  version: number;
};

export type LobbyRoomDeletedEvent = {
  code: string;
  version: number;
};

export type RoomCleanupResult = {
  deletedRoomCodes: string[];
  updatedSnapshots: RoomSnapshot[];
};

export type CreateRoomInput = {
  playerId: string;
  playerName: string;
};

export type JoinRoomInput = {
  playerId: string;
  playerName: string;
};

export type MoveIntent = {
  expectedMoveSeq?: number;
  playerId: string;
  point: Point;
};

export type RoomErrorCode =
  | "duplicate-name"
  | "duplicate-player"
  | "chat-message-empty"
  | "chat-message-too-long"
  | "chat-rate-limited"
  | "game-already-started"
  | "game-not-playing"
  | "game-record-invalid"
  | "game-record-not-finished"
  | "game-record-not-found"
  | "invalid-player"
  | "invalid-room-code"
  | "not-room-host"
  | "move-seq-mismatch"
  | "no-moves-to-undo"
  | "not-last-move-player"
  | "not-room-player"
  | "not-room-spectator"
  | "not-undo-request-target"
  | "not-room-member"
  | "not-your-turn"
  | "room-code-exhausted"
  | "room-full"
  | "room-not-found"
  | "room-not-ready"
  | "spot-unavailable"
  | "undo-request-limit"
  | "undo-request-missing"
  | "undo-request-pending"
  | "undo-request-rejected-position";

export type RoomError = {
  code: RoomErrorCode;
  message: string;
};

export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: RoomError };

export type RoomLifecycleSweep = {
  deletedRoomCodes: string[];
  updatedSnapshots: RoomSnapshot[];
};

type RoomPlayer = {
  connected: boolean;
  disconnectedAt: number | null;
  disconnectDeadline: number | null;
  id: string;
  joinedAt: number;
  lastChatSentAt: number | null;
  name: string;
  ready: boolean;
  rejectedUndoMoveSeq: number | null;
  seat: RoomPlayerSeat;
  undoRequestsRemaining: number;
};

type RoomSpectator = {
  connected: boolean;
  disconnectedAt: number | null;
  id: string;
  joinedAt: number;
  lastChatSentAt: number | null;
  name: string;
};

type PresenceEntry = {
  connectionCount: number;
  identity: "guest" | "registered";
  lastSeenAt: number;
  name: string;
  playerId: string;
};

type RoomState = {
  board: Board;
  chatMessages: RoomChatMessage[];
  code: string;
  createdAt: number;
  currentTurn: Stone;
  finishReason: GameRecordFinishReason | null;
  gameId: string;
  gameNumber: number;
  hostSeat: RoomPlayerSeat;
  nextChatMessageId: number;
  nextStartingSeat: RoomPlayerSeat;
  moveSeq: number;
  moves: Move[];
  nextUndoRequestId: number;
  listVersion: number;
  players: RoomPlayer[];
  spectators: RoomSpectator[];
  status: RoomStatus;
  undoRequest: UndoRequestSnapshot | null;
  updatedAt: number;
  winner: Stone | null;
  winLine: Point[];
};

type RoomStoreOptions = {
  codeGenerator?: () => string;
  codeLength?: number;
  completedRoomTtlMs?: number;
  disconnectGraceMs?: number;
  emptyRoomTtlMs?: number;
  gameRecordStore?: GameRecordStore;
  now?: () => number;
  roomTtlMs?: number;
};

const DEFAULT_ROOM_CODE_LENGTH = 6;
const MAX_ROOM_CODE_ATTEMPTS = 50;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COMPLETED_ROOM_TTL_MS = 30 * 60 * 1000;
const DISCONNECT_GRACE_MS = 60 * 1000;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
const MAX_ROOM_CHAT_MESSAGES = 50;
const MAX_ROOM_CHAT_TEXT_LENGTH = 160;
const MAX_ROOM_LIST_LIMIT = 100;
const ROOM_CHAT_COOLDOWN_MS = 800;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const UNDO_REQUEST_LIMIT = 3;
const UNDO_REQUEST_TIMEOUT_MS = 10_000;

type RoomLifecycleLimits = {
  completedRoomTtlMs: number;
  disconnectGraceMs: number;
  emptyRoomTtlMs: number;
  roomTtlMs: number;
};

export class RoomStore {
  private readonly codeGenerator: () => string;
  private readonly finalizedGames = new Map<string, AuthoritativeGameRecord>();
  private readonly gameRecordStore: GameRecordStore;
  private readonly lifecycleLimits: RoomLifecycleLimits;
  private lobbyVersion = 0;
  private nextPublicChatMessageId = 1;
  private readonly now: () => number;
  private readonly presences = new Map<string, PresenceEntry>();
  private presenceVersion = 0;
  private readonly publicChatLastSentAt = new Map<string, number>();
  private readonly publicChatMessages: PublicChatMessage[] = [];
  private readonly rooms = new Map<string, RoomState>();

  constructor(options: RoomStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.gameRecordStore = options.gameRecordStore ?? new GameRecordStore({ now: this.now });
    this.lifecycleLimits = {
      completedRoomTtlMs: Math.max(1, options.completedRoomTtlMs ?? COMPLETED_ROOM_TTL_MS),
      disconnectGraceMs: Math.max(1, options.disconnectGraceMs ?? DISCONNECT_GRACE_MS),
      emptyRoomTtlMs: Math.max(1, options.emptyRoomTtlMs ?? EMPTY_ROOM_TTL_MS),
      roomTtlMs: Math.max(1, options.roomTtlMs ?? ROOM_TTL_MS)
    };
    this.codeGenerator =
      options.codeGenerator ?? (() => createRoomCode(options.codeLength ?? DEFAULT_ROOM_CODE_LENGTH));
  }

  createRoom(input: CreateRoomInput): RoomResult<RoomSnapshot> {
    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const code = this.generateUniqueRoomCode();

    if (!code) {
      return failure("room-code-exhausted", "Could not allocate a unique room code.");
    }

    const now = this.now();
    const room: RoomState = {
      board: createBoard(),
      chatMessages: [],
      code,
      createdAt: now,
      currentTurn: "black",
      finishReason: null,
      gameId: `${code}-1`,
      gameNumber: 1,
      hostSeat: "black",
      moveSeq: 0,
      moves: [],
      players: [
        {
          ...player,
          connected: true,
          disconnectedAt: null,
          disconnectDeadline: null,
          joinedAt: now,
          lastChatSentAt: null,
          ready: false,
          rejectedUndoMoveSeq: null,
          undoRequestsRemaining: UNDO_REQUEST_LIMIT,
          seat: "black"
        }
      ],
      listVersion: this.nextLobbyVersion(),
      nextChatMessageId: 1,
      nextUndoRequestId: 1,
      nextStartingSeat: "black",
      spectators: [],
      status: "waiting",
      undoRequest: null,
      updatedAt: now,
      winner: null,
      winLine: []
    };

    this.rooms.set(code, room);

    return success(getRoomSnapshot(room));
  }

  findMatch(input: JoinRoomInput): RoomResult<RoomSnapshot> {
    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const room = [...this.rooms.values()]
      .filter(
        (candidate) =>
          candidate.status === "waiting" &&
          candidate.players.length < 2 &&
          !hasParticipantId(candidate, player.id) &&
          !hasParticipantName(candidate, player.name)
      )
      .sort((left, right) => left.createdAt - right.createdAt)[0];

    if (!room) {
      return this.createRoom(input);
    }

    return this.joinRoom(room.code, input);
  }

  joinRoom(roomCode: string, input: JoinRoomInput): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    if (room.status === "abandoned") {
      return failure("game-already-started", "This room is closed.");
    }

    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    if (hasParticipantId(room, player.id)) {
      return failure("duplicate-player", "Player is already in this room.");
    }

    if (hasParticipantName(room, player.name)) {
      return failure("duplicate-name", "A player with this name is already in this room.");
    }

    const now = this.now();

    if (room.players.length >= 2 || room.status === "playing" || room.status === "finished") {
      room.spectators.push({
        ...player,
        connected: true,
        disconnectedAt: null,
        joinedAt: now,
        lastChatSentAt: null
      });
      room.updatedAt = now;
      this.markRoomListed(room);
      return success(getRoomSnapshot(room));
    }

    const seat = room.players.some((candidate) => candidate.seat === "black") ? "white" : "black";
    room.players.push({
      ...player,
      connected: true,
      disconnectedAt: null,
      disconnectDeadline: null,
      joinedAt: now,
      lastChatSentAt: null,
      ready: false,
      rejectedUndoMoveSeq: null,
      undoRequestsRemaining: UNDO_REQUEST_LIMIT,
      seat
    });
    updateRoomStatus(room, now);
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  sitPlayer(roomCode: string, playerId: string, requestedSeat?: RoomPlayerSeat): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndParticipant(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const { participant, role, room } = found.value;

    if (role !== "spectator") {
      return failure("not-room-spectator", "Only spectators can take an open player seat.");
    }

    if (room.status === "playing" || room.status === "abandoned") {
      return failure("game-already-started", "Open seats can only be taken outside an active game.");
    }

    const seat = findAvailableSeat(room, requestedSeat);

    if (!seat) {
      return failure("spot-unavailable", "No player seat is open.");
    }

    const spectatorIndex = room.spectators.findIndex((candidate) => candidate.id === playerId);

    if (spectatorIndex < 0) {
      return failure("not-room-spectator", "Only spectators can take an open player seat.");
    }

    const now = this.now();

    room.spectators.splice(spectatorIndex, 1);
    room.players = room.players.filter((candidate) => candidate.seat !== seat);
    room.players.push({
      connected: true,
      disconnectedAt: null,
      disconnectDeadline: null,
      id: participant.id,
      joinedAt: now,
      lastChatSentAt: participant.lastChatSentAt,
      name: participant.name,
      ready: false,
      rejectedUndoMoveSeq: null,
      seat,
      undoRequestsRemaining: UNDO_REQUEST_LIMIT
    });

    if (!room.players.some((candidate) => candidate.seat === room.hostSeat)) {
      room.hostSeat = seat;
    }

    room.undoRequest = null;
    room.updatedAt = now;

    if (room.status === "waiting" || room.status === "ready") {
      updateRoomStatus(room, now);
    }

    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  reconnectRoom(roomCode: string, input: JoinRoomInput): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const existingParticipant = findParticipant(room, player.id);

    if (!existingParticipant) {
      return failure("not-room-member", "Player is not in this room.");
    }

    existingParticipant.name = player.name;
    existingParticipant.connected = true;
    existingParticipant.disconnectedAt = null;

    if ("disconnectDeadline" in existingParticipant) {
      existingParticipant.disconnectDeadline = null;
    }

    room.updatedAt = this.now();
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  setPlayerReady(roomCode: string, playerId: string, ready = true): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const { room, player } = found.value;

    if (room.status === "playing" || room.status === "finished" || room.status === "abandoned") {
      return failure("game-already-started", "Ready state cannot change after the game starts.");
    }

    player.ready = ready;
    updateRoomStatus(room, this.now());
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  startGame(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const { room } = found.value;

    if (room.status === "playing") {
      return success(getRoomSnapshot(room));
    }

    if (room.status !== "ready") {
      return failure("room-not-ready", "Both players must be ready before the game starts.");
    }

    room.status = "playing";
    room.currentTurn = room.nextStartingSeat;
    room.updatedAt = this.now();
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  applyMove(roomCode: string, intent: MoveIntent): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, intent.playerId);

    if (!found.ok) {
      return found;
    }

    const { room, player } = found.value;

    if (room.status !== "playing") {
      return failure("game-not-playing", "The game is not accepting moves.");
    }

    if (room.undoRequest) {
      return failure("undo-request-pending", "Resolve the pending undo request before playing.");
    }

    if (intent.expectedMoveSeq !== undefined && intent.expectedMoveSeq !== room.moveSeq) {
      return failure("move-seq-mismatch", "Move sequence is stale.");
    }

    if (player.seat !== room.currentTurn) {
      return failure("not-your-turn", "It is not this player's turn.");
    }

    if (!isValidMove(room.board, intent.point)) {
      return failure("spot-unavailable", "Move target is outside the board or already occupied.");
    }

    const nextBoard = placeStone(room.board, intent.point, player.seat);
    const move: Move = {
      ...intent.point,
      moveNumber: room.moveSeq + 1,
      stone: player.seat
    };
    const result = getGameResult(nextBoard, intent.point, player.seat);

    room.board = nextBoard;
    room.moves.push(move);
    room.moveSeq += 1;
    for (const roomPlayer of room.players) {
      roomPlayer.rejectedUndoMoveSeq = null;
    }
    applyGameResult(room, result);
    room.updatedAt = this.now();
    this.captureFinishedGame(room);
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  resignGame(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const { room, player } = found.value;

    if (room.status !== "playing") {
      return failure("game-not-playing", "Only active games can be resigned.");
    }

    room.undoRequest = null;
    room.status = "finished";
    room.finishReason = "resign";
    room.winner = getOpponent(player.seat);
    room.winLine = [];
    room.updatedAt = this.now();
    this.captureFinishedGame(room);
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  requestUndo(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const { room, player } = found.value;
    const now = this.now();

    if (room.status !== "playing") {
      return failure("game-not-playing", "Only active games can request undo.");
    }

    if (room.undoRequest) {
      return failure("undo-request-pending", "An undo request is already waiting for a response.");
    }

    const lastMove = room.moves.at(-1);

    if (!lastMove) {
      return failure("no-moves-to-undo", "There is no move to undo.");
    }

    if (lastMove.stone !== player.seat) {
      return failure("not-last-move-player", "Only the player who made the last move can request undo.");
    }

    if (player.undoRequestsRemaining <= 0) {
      return failure("undo-request-limit", "No undo requests remain for this game.");
    }

    if (player.rejectedUndoMoveSeq === room.moveSeq) {
      return failure("undo-request-rejected-position", "This board position already had an undo request rejected.");
    }

    player.undoRequestsRemaining -= 1;
    room.undoRequest = {
      expiresAt: now + UNDO_REQUEST_TIMEOUT_MS,
      id: `${room.code}-${room.nextUndoRequestId}`,
      moveSeq: room.moveSeq,
      requestedAt: now,
      requesterSeat: player.seat,
      targetSeat: getOpponent(player.seat)
    };
    room.nextUndoRequestId += 1;
    room.updatedAt = now;
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  respondToUndo(
    roomCode: string,
    playerId: string,
    requestId: string,
    accepted: boolean
  ): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    const player = room.players.find((candidate) => candidate.id === playerId);

    if (!player) {
      if (room.spectators.some((candidate) => candidate.id === playerId)) {
        return failure("not-room-player", "Spectators cannot perform player actions.");
      }

      return failure("not-room-member", "Player is not in this room.");
    }

    const undoRequest = room.undoRequest;
    const now = this.now();

    if (!undoRequest || undoRequest.id !== requestId) {
      return failure("undo-request-missing", "Undo request is no longer active.");
    }

    if (player.seat !== undoRequest.targetSeat) {
      return failure("not-undo-request-target", "Only the opponent can answer this undo request.");
    }

    room.undoRequest = null;

    if (!accepted || now >= undoRequest.expiresAt) {
      markUndoRequestRejected(room, undoRequest, now);
      this.markRoomListed(room);
      return success(getRoomSnapshot(room));
    }

    const lastMove = room.moves.at(-1);

    if (!lastMove) {
      return failure("no-moves-to-undo", "There is no move to undo.");
    }

    if (lastMove.stone !== undoRequest.requesterSeat || room.moveSeq !== undoRequest.moveSeq) {
      return failure("undo-request-missing", "Undo request no longer matches the board position.");
    }

    undoLatestMove(room, now);
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  restartGame(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const { room, player } = found.value;

    if (player.seat !== room.hostSeat) {
      return failure("not-room-host", "Only the room host can restart the game.");
    }

    if (room.status !== "finished") {
      return failure("game-not-playing", "Only finished games can be restarted.");
    }

    room.board = createBoard();
    room.gameNumber += 1;
    room.gameId = `${room.code}-${room.gameNumber}`;
    room.finishReason = null;
    room.nextStartingSeat = getOpponent(room.nextStartingSeat);
    room.currentTurn = room.nextStartingSeat;
    room.moveSeq = 0;
    room.moves = [];
    room.nextUndoRequestId = 1;
    room.status = "waiting";
    room.undoRequest = null;
    room.winner = null;
    room.winLine = [];

    for (const roomPlayer of room.players) {
      roomPlayer.ready = false;
      roomPlayer.rejectedUndoMoveSeq = null;
      roomPlayer.undoRequestsRemaining = UNDO_REQUEST_LIMIT;
    }

    updateRoomStatus(room, this.now());
    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  markDisconnected(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndParticipant(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const now = this.now();

    const { participant, role, room } = found.value;

    if (role === "spectator") {
      removeSpectator(room, playerId);
      room.updatedAt = now;
      this.markRoomListed(room);
      return success(this.deleteIfEmpty(room) ?? getRoomSnapshot(room));
    }

    if (role === "player" && room.status !== "playing") {
      removePlayer(room, playerId);
      room.undoRequest = null;
      room.updatedAt = now;
      if (room.status === "waiting" || room.status === "ready") {
        updateRoomStatus(room, now);
      }
      this.markRoomListed(room);
      return success(this.deleteIfEmpty(room) ?? getRoomSnapshot(room));
    }

    participant.connected = false;
    participant.disconnectedAt = now;

    if ("disconnectDeadline" in participant) {
      participant.disconnectDeadline = now + this.lifecycleLimits.disconnectGraceMs;
      room.undoRequest = null;
    }

    room.updatedAt = now;

    if (!hasConnectedParticipant(room)) {
      abandonRoom(room, now);
      this.captureFinishedGame(room);
      this.rooms.delete(room.code);
      this.nextLobbyVersion();
      return success(getRoomSnapshot(room));
    }

    this.markRoomListed(room);

    return success(getRoomSnapshot(room));
  }

  leaveRoom(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    const spectatorIndex = room.spectators.findIndex((candidate) => candidate.id === playerId);

    if (spectatorIndex >= 0) {
      room.spectators.splice(spectatorIndex, 1);
      room.updatedAt = this.now();
      this.markRoomListed(room);
      return success(this.deleteIfEmpty(room) ?? getRoomSnapshot(room));
    }

    const player = room.players.find((candidate) => candidate.id === playerId);

    if (!player) {
      return failure("not-room-member", "Player is not in this room.");
    }

    if (room.status === "playing") {
      return this.markDisconnected(roomCode, playerId);
    }

    removePlayer(room, playerId);
    room.undoRequest = null;
    room.updatedAt = this.now();

    if (room.status === "waiting" || room.status === "ready") {
      updateRoomStatus(room, room.updatedAt);
    }

    this.markRoomListed(room);

    return success(this.deleteIfEmpty(room) ?? getRoomSnapshot(room));
  }

  sendRoomChat(roomCode: string, playerId: string, text: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndParticipant(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const normalizedText = normalizeChatText(text);

    if (!normalizedText) {
      return failure("chat-message-empty", "Enter a message.");
    }

    if ([...normalizedText].length > MAX_ROOM_CHAT_TEXT_LENGTH) {
      return failure("chat-message-too-long", `Messages must be ${MAX_ROOM_CHAT_TEXT_LENGTH} characters or fewer.`);
    }

    const { participant, role, room } = found.value;
    const now = this.now();

    if (participant.lastChatSentAt !== null && now - participant.lastChatSentAt < ROOM_CHAT_COOLDOWN_MS) {
      return failure("chat-rate-limited", "Please wait before sending another message.");
    }

    participant.lastChatSentAt = now;
    room.chatMessages.push({
      id: `${room.code}-${room.nextChatMessageId}`,
      name: participant.name,
      role,
      seat: role === "player" && "seat" in participant ? participant.seat : null,
      sentAt: now,
      text: normalizedText
    });
    room.nextChatMessageId += 1;

    if (room.chatMessages.length > MAX_ROOM_CHAT_MESSAGES) {
      room.chatMessages.splice(0, room.chatMessages.length - MAX_ROOM_CHAT_MESSAGES);
    }

    room.updatedAt = now;

    return success(getRoomSnapshot(room));
  }

  restoreConnection(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndParticipant(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    found.value.participant.connected = true;
    found.value.participant.disconnectedAt = null;

    if ("disconnectDeadline" in found.value.participant) {
      found.value.participant.disconnectDeadline = null;
    }

    found.value.room.updatedAt = this.now();
    this.markRoomListed(found.value.room);

    return success(getRoomSnapshot(found.value.room));
  }

  getSnapshot(roomCode: string): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    if (advanceRoomLifecycle(room, this.now(), this.lifecycleLimits)) {
      this.captureFinishedGame(room);
    }

    if (this.deleteIfExpired(room, this.now())) {
      return failure("room-not-found", "Room does not exist.");
    }

    return success(getRoomSnapshot(room));
  }

  listRooms(query: RoomListQuery = {}): RoomListSnapshot {
    const now = this.now();
    const deletedRoomCodes: string[] = [];

    for (const [code, room] of this.rooms) {
      const changed = advanceRoomLifecycle(room, now, this.lifecycleLimits);

      if (changed) {
        this.captureFinishedGame(room);
        this.markRoomListed(room);
      }

      if (this.deleteIfExpired(room, now)) {
        deletedRoomCodes.push(code);
      }
    }

    if (deletedRoomCodes.length > 0) {
      this.nextLobbyVersion();
    }

    const limit = clampRoomListLimit(query.limit);
    const status = query.status ?? "all";
    const rooms = Array.from(this.rooms.values())
      .filter((room) => isRoomVisibleInLobby(room, status))
      .sort((first, second) => second.updatedAt - first.updatedAt || first.code.localeCompare(second.code))
      .slice(0, limit)
      .map(getRoomListItem);

    return {
      generatedAt: now,
      rooms,
      version: this.lobbyVersion
    };
  }

  listPublicChatMessages(): PublicChatSnapshot {
    return getPublicChatSnapshot(this.publicChatMessages, this.now());
  }

  connectPresence(input: CreateRoomInput): RoomResult<PresenceSnapshot> {
    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const now = this.now();
    const entry =
      this.presences.get(player.id) ??
      ({
        connectionCount: 0,
        identity: "guest",
        lastSeenAt: now,
        name: player.name,
        playerId: player.id
      } satisfies PresenceEntry);

    entry.connectionCount += 1;
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
    const entry =
      this.presences.get(player.id) ??
      ({
        connectionCount: 0,
        identity: "guest",
        lastSeenAt: now,
        name: player.name,
        playerId: player.id
      } satisfies PresenceEntry);

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
    const limit = clampPresenceListLimit(query.limit);
    const users = [...this.presences.values()]
      .map((entry) => getPresenceSnapshotForEntry(entry, [...this.rooms.values()]))
      .filter((presence) => query.includeOffline || presence.connected)
      .sort(comparePresence)
      .slice(0, limit);

    return {
      generatedAt: now,
      users,
      version: this.presenceVersion + this.lobbyVersion
    };
  }

  sendPublicChat(input: CreateRoomInput & { text: string }): RoomResult<PublicChatSnapshot> {
    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    const normalizedText = normalizeChatText(input.text);

    if (!normalizedText) {
      return failure("chat-message-empty", "Enter a message.");
    }

    if ([...normalizedText].length > MAX_ROOM_CHAT_TEXT_LENGTH) {
      return failure("chat-message-too-long", `Messages must be ${MAX_ROOM_CHAT_TEXT_LENGTH} characters or fewer.`);
    }

    const now = this.now();
    const lastSentAt = this.publicChatLastSentAt.get(player.id);

    if (lastSentAt !== undefined && now - lastSentAt < ROOM_CHAT_COOLDOWN_MS) {
      return failure("chat-rate-limited", "Please wait before sending another message.");
    }

    this.publicChatLastSentAt.set(player.id, now);
    this.publicChatMessages.push({
      id: `public-${this.nextPublicChatMessageId}`,
      name: player.name,
      sentAt: now,
      text: normalizedText
    });
    this.nextPublicChatMessageId += 1;

    if (this.publicChatMessages.length > MAX_ROOM_CHAT_MESSAGES) {
      this.publicChatMessages.splice(0, this.publicChatMessages.length - MAX_ROOM_CHAT_MESSAGES);
    }

    return success(getPublicChatSnapshot(this.publicChatMessages, now));
  }

  submitGameRecord(input: GameRecordClientSubmission): RoomResult<GameRecordSubmitResult> {
    const game = this.finalizedGames.get(input.gameId);

    if (!game) {
      return failure("game-record-not-found", "Finished game record is no longer available.");
    }

    if (input.roomCode.trim().toUpperCase() !== game.roomCode) {
      return failure("game-record-invalid", "Submitted room code does not match this game.");
    }

    if (game.status !== "finished" && game.status !== "abandoned") {
      return failure("game-record-not-finished", "Only finished online games can be submitted.");
    }

    if (!game.players.some((player) => player.playerId === input.playerId)) {
      return failure("not-room-player", "Only players can submit this game record.");
    }

    try {
      return success(this.gameRecordStore.submit(game, input));
    } catch {
      return failure("game-record-invalid", "Could not save the submitted game record.");
    }
  }

  listGameRecords(limit?: number): SavedGameRecord[] {
    return this.gameRecordStore.listRecords(limit);
  }

  getLeaderboard(query?: LeaderboardQuery): LeaderboardSnapshot {
    return this.gameRecordStore.getLeaderboard(query);
  }

  getPlayerProfile(playerId: string, displayName?: string, limit?: number): PlayerProfileSnapshot {
    return this.gameRecordStore.getPlayerProfile(playerId, displayName, limit);
  }

  getPlayerSeat(roomCode: string, playerId: string): RoomPlayerSeat | null {
    const room = this.getRoom(roomCode);

    return room?.players.find((candidate) => candidate.id === playerId)?.seat ?? null;
  }

  getParticipantRole(
    roomCode: string,
    playerId: string
  ): { name: string; role: RoomParticipantRole; seat: RoomPlayerSeat | null } | null {
    const room = this.getRoom(roomCode);

    if (!room) {
      return null;
    }

    const player = room.players.find((candidate) => candidate.id === playerId);

    if (player) {
      return { name: player.name, role: "player", seat: player.seat };
    }

    const spectator = room.spectators.find((candidate) => candidate.id === playerId);

    if (spectator) {
      return { name: spectator.name, role: "spectator", seat: null };
    }

    return null;
  }

  leaveParticipantRooms(playerId: string, keepRoomCode?: string): RoomCleanupResult {
    const normalizedPlayerId = playerId.trim();

    if (!normalizedPlayerId) {
      return { deletedRoomCodes: [], updatedSnapshots: [] };
    }

    const normalizedKeepRoomCode = keepRoomCode ? normalizeRoomCode(keepRoomCode) : null;
    const roomCodes = [...this.rooms.values()]
      .filter((room) => room.code !== normalizedKeepRoomCode && hasParticipantId(room, normalizedPlayerId))
      .map((room) => room.code);
    const deletedRoomCodes: string[] = [];
    const updatedSnapshots: RoomSnapshot[] = [];

    for (const roomCode of roomCodes) {
      const result = this.leaveRoom(roomCode, normalizedPlayerId);

      if (!result.ok) {
        continue;
      }

      if (this.rooms.has(roomCode)) {
        updatedSnapshots.push(result.value);
      } else {
        deletedRoomCodes.push(roomCode);
      }
    }

    return { deletedRoomCodes, updatedSnapshots };
  }

  sweepExpiredRooms(): RoomLifecycleSweep {
    const now = this.now();
    const deletedRoomCodes: string[] = [];
    const updatedSnapshots: RoomSnapshot[] = [];

    for (const [code, room] of this.rooms) {
      const changed = advanceRoomLifecycle(room, now, this.lifecycleLimits);

      if (this.deleteIfExpired(room, now)) {
        deletedRoomCodes.push(code);
        this.nextLobbyVersion();
        continue;
      }

      if (changed) {
        this.captureFinishedGame(room);
        this.markRoomListed(room);
        updatedSnapshots.push(getRoomSnapshot(room));
      }
    }

    return { deletedRoomCodes, updatedSnapshots };
  }

  getLobbyVersion(): number {
    return this.lobbyVersion;
  }

  getRoomListItem(roomCode: string): RoomListItem | null {
    const room = this.getRoom(roomCode);

    if (!room) {
      return null;
    }

    return getRoomListItem(room);
  }

  private getRoom(roomCode: string): RoomState | null {
    const code = normalizeRoomCode(roomCode);

    if (!code) {
      return null;
    }

    const room = this.rooms.get(code);

    if (!room) {
      return null;
    }

    if (advanceRoomLifecycle(room, this.now(), this.lifecycleLimits)) {
      this.captureFinishedGame(room);
    }

    if (this.deleteIfExpired(room, this.now())) {
      return null;
    }

    return room;
  }

  private getRoomAndPlayer(
    roomCode: string,
    playerId: string
  ): RoomResult<{ player: RoomPlayer; room: RoomState }> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    expireUndoRequest(room, this.now());

    const player = room.players.find((candidate) => candidate.id === playerId);

    if (!player) {
      if (room.spectators.some((candidate) => candidate.id === playerId)) {
        return failure("not-room-player", "Spectators cannot perform player actions.");
      }

      return failure("not-room-member", "Player is not in this room.");
    }

    return success({ player, room });
  }

  private getRoomAndParticipant(
    roomCode: string,
    playerId: string
  ): RoomResult<{
    participant: RoomPlayer | RoomSpectator;
    role: RoomParticipantRole;
    room: RoomState;
  }> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    expireUndoRequest(room, this.now());

    const player = room.players.find((candidate) => candidate.id === playerId);

    if (player) {
      return success({ participant: player, role: "player", room });
    }

    const spectator = room.spectators.find((candidate) => candidate.id === playerId);

    if (spectator) {
      return success({ participant: spectator, role: "spectator", room });
    }

    return failure("not-room-member", "Player is not in this room.");
  }

  private generateUniqueRoomCode(): string | null {
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const code = normalizeRoomCode(this.codeGenerator());

      if (code && !this.rooms.has(code)) {
        return code;
      }
    }

    return null;
  }

  private deleteIfExpired(room: RoomState, now: number): boolean {
    if (!shouldDeleteRoom(room, now, this.lifecycleLimits)) {
      return false;
    }

    this.rooms.delete(room.code);

    return true;
  }

  private deleteIfEmpty(room: RoomState): RoomSnapshot | null {
    if (room.players.length > 0 || room.spectators.length > 0) {
      return null;
    }

    const snapshot = getRoomSnapshot(room);

    this.rooms.delete(room.code);
    this.nextLobbyVersion();

    return snapshot;
  }

  private markRoomListed(room: RoomState): void {
    room.listVersion = this.nextLobbyVersion();
  }

  private captureFinishedGame(room: RoomState): void {
    if (room.status !== "finished" && room.status !== "abandoned") {
      return;
    }

    if (!room.finishReason) {
      return;
    }

    this.finalizedGames.set(room.gameId, {
      board: room.board,
      createdAt: room.createdAt,
      finishReason: room.finishReason,
      finishedAt: room.updatedAt,
      gameId: room.gameId,
      moveSeq: room.moveSeq,
      moves: room.moves,
      players: room.players.map((player) => ({
        identity: "guest",
        name: player.name,
        playerId: player.id,
        seat: player.seat
      })),
      roomCode: room.code,
      status: room.status,
      winLine: room.winLine,
      winner: room.winner
    });
  }

  private nextLobbyVersion(): number {
    this.lobbyVersion += 1;
    return this.lobbyVersion;
  }

  private nextPresenceVersion(): number {
    this.presenceVersion += 1;
    return this.presenceVersion;
  }
}

export function createRoomCode(length = DEFAULT_ROOM_CODE_LENGTH): string {
  return Array.from({ length: Math.max(1, Math.floor(length)) }, () =>
    ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  ).join("");
}

function applyGameResult(room: RoomState, result: GameStatus) {
  if (result.state === "playing") {
    room.status = "playing";
    room.currentTurn = result.nextPlayer;
    room.finishReason = null;
    room.winner = null;
    room.winLine = [];
    return;
  }

  room.status = "finished";

  if (result.state === "won") {
    room.finishReason = "five";
    room.winner = result.winner;
    room.winLine = result.line;
    return;
  }

  room.finishReason = "draw";
  room.winner = null;
  room.winLine = [];
}

function updateRoomStatus(room: RoomState, now: number) {
  if (room.status === "playing" || room.status === "finished" || room.status === "abandoned") {
    return;
  }

  room.status = room.players.length === 2 && room.players.every((player) => player.ready) ? "playing" : "waiting";
  room.currentTurn = room.status === "playing" ? room.nextStartingSeat : room.currentTurn;
  room.updatedAt = now;
}

function getRoomListItem(room: RoomState): RoomListItem {
  const host = room.players.find((player) => player.seat === room.hostSeat) ?? room.players[0] ?? null;
  const playerCount = room.players.length;
  const spectatorCount = room.spectators.length;

  return {
    canJoin: room.status === "waiting" && playerCount < 2,
    canWatch: room.status === "playing" || playerCount >= 2,
    code: room.code,
    createdAt: room.createdAt,
    hostName: host?.name ?? "Player",
    playerCount,
    spectatorCount,
    status: room.status,
    updatedAt: room.updatedAt,
    version: room.listVersion
  };
}

function findAvailableSeat(room: RoomState, requestedSeat?: RoomPlayerSeat): RoomPlayerSeat | null {
  const seats: RoomPlayerSeat[] = requestedSeat ? [requestedSeat] : ["black", "white"];

  for (const seat of seats) {
    const player = room.players.find((candidate) => candidate.seat === seat);

    if (!player || (room.status === "finished" && !player.connected)) {
      return seat;
    }
  }

  return null;
}

function removePlayer(room: RoomState, playerId: string): RoomPlayer | null {
  const playerIndex = room.players.findIndex((candidate) => candidate.id === playerId);

  if (playerIndex < 0) {
    return null;
  }

  const [player] = room.players.splice(playerIndex, 1);

  if (!room.players.some((candidate) => candidate.seat === room.hostSeat)) {
    room.hostSeat = room.players[0]?.seat ?? "black";
  }

  return player;
}

function removeSpectator(room: RoomState, playerId: string): RoomSpectator | null {
  const spectatorIndex = room.spectators.findIndex((candidate) => candidate.id === playerId);

  if (spectatorIndex < 0) {
    return null;
  }

  const [spectator] = room.spectators.splice(spectatorIndex, 1);

  return spectator;
}

function isRoomVisibleInLobby(room: RoomState, status: RoomListQuery["status"] = "all"): boolean {
  if (room.status === "abandoned") {
    return false;
  }

  if (room.players.length === 0 && room.spectators.length === 0) {
    return false;
  }

  if (status && status !== "all" && room.status !== status) {
    return false;
  }

  if (!status || status === "all") {
    return room.status === "waiting" || room.status === "playing";
  }

  return true;
}

function hasConnectedParticipant(room: RoomState): boolean {
  return [...room.players, ...room.spectators].some((participant) => participant.connected);
}

function getPresenceSnapshotForEntry(entry: PresenceEntry, rooms: RoomState[]): UserPresenceSnapshot {
  const roomPresence = findRoomPresence(entry.playerId, rooms);
  const connected = entry.connectionCount > 0;

  return {
    connected,
    identity: entry.identity,
    lastSeenAt: entry.lastSeenAt,
    name: entry.name,
    playerId: entry.playerId,
    role: roomPresence?.role ?? null,
    roomCode: roomPresence?.room.code ?? null,
    roomStatus: roomPresence?.room.status ?? null,
    status: getPresenceStatus(connected, roomPresence)
  };
}

function findRoomPresence(
  playerId: string,
  rooms: RoomState[]
): { role: RoomParticipantRole; room: RoomState } | null {
  for (const room of rooms) {
    if (room.players.some((player) => player.id === playerId)) {
      return { role: "player", room };
    }

    if (room.spectators.some((spectator) => spectator.id === playerId)) {
      return { role: "spectator", room };
    }
  }

  return null;
}

function getPresenceStatus(
  connected: boolean,
  roomPresence: { role: RoomParticipantRole; room: RoomState } | null
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

  return roomPresence.room.status === "playing" ? "playing" : "in_room";
}

function comparePresence(first: UserPresenceSnapshot, second: UserPresenceSnapshot): number {
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

function getPresenceStatusRank(status: PresenceStatus): number {
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

function clampRoomListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(MAX_ROOM_LIST_LIMIT, Math.max(1, Math.floor(limit)));
}

function clampPresenceListLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function advanceRoomLifecycle(room: RoomState, now: number, limits: RoomLifecycleLimits): boolean {
  let changed = expireUndoRequest(room, now);

  if (room.status === "playing") {
    const expiredDisconnectedPlayers = room.players.filter(
      (player) => !player.connected && player.disconnectDeadline !== null && now >= player.disconnectDeadline
    );

    if (expiredDisconnectedPlayers.length > 0) {
      const connectedPlayers = room.players.filter((player) => player.connected);

      if (connectedPlayers.length === 1) {
        finishRoomByDisconnect(room, connectedPlayers[0].seat, now);
      } else {
        abandonRoom(room, now);
      }

      return true;
    }

    if (now - room.updatedAt >= limits.roomTtlMs) {
      abandonRoom(room, now);
      return true;
    }
  }

  if ((room.status === "waiting" || room.status === "ready") && now - room.updatedAt >= limits.roomTtlMs) {
    abandonRoom(room, now);
    changed = true;
  }

  return changed;
}

function shouldDeleteRoom(room: RoomState, now: number, limits: RoomLifecycleLimits): boolean {
  const participants = [...room.players, ...room.spectators];

  if (participants.length === 0) {
    return true;
  }

  if (participants.every((participant) => !participant.connected)) {
    return true;
  }

  if (room.status === "finished" || room.status === "abandoned") {
    return now - room.updatedAt >= limits.completedRoomTtlMs;
  }

  if (
    room.status !== "playing" &&
    participants.length > 0 &&
    participants.every((participant) => !participant.connected)
  ) {
    return now - room.updatedAt >= limits.emptyRoomTtlMs;
  }

  return false;
}

function finishRoomByDisconnect(room: RoomState, winner: Stone, now: number) {
  room.status = "finished";
  room.finishReason = "disconnect";
  room.undoRequest = null;
  room.winner = winner;
  room.winLine = [];
  room.updatedAt = now;
}

function abandonRoom(room: RoomState, now: number) {
  room.status = "abandoned";
  room.finishReason = "abandoned";
  room.undoRequest = null;
  room.winner = null;
  room.winLine = [];
  room.updatedAt = now;
}

function replayRoomMoves(moves: Move[]): Board {
  return moves.reduce((board, move) => placeStone(board, move, move.stone), createBoard());
}

function undoLatestMove(room: RoomState, now: number) {
  const lastMove = room.moves.at(-1);

  if (!lastMove) {
    return;
  }

  const nextMoves = room.moves.slice(0, -1);

  room.board = replayRoomMoves(nextMoves);
  room.currentTurn = lastMove.stone;
  room.moveSeq = nextMoves.length;
  room.moves = nextMoves;
  room.status = "playing";
  room.finishReason = null;
  room.winner = null;
  room.winLine = [];
  for (const roomPlayer of room.players) {
    roomPlayer.rejectedUndoMoveSeq = null;
  }
  room.updatedAt = now;
}

function expireUndoRequest(room: RoomState, now: number): boolean {
  const undoRequest = room.undoRequest;

  if (!undoRequest || now < undoRequest.expiresAt) {
    return false;
  }

  markUndoRequestRejected(room, undoRequest, now);

  return true;
}

function markUndoRequestRejected(room: RoomState, undoRequest: UndoRequestSnapshot, now: number) {
  const requester = room.players.find((player) => player.seat === undoRequest.requesterSeat);

  if (requester) {
    requester.rejectedUndoMoveSeq = undoRequest.moveSeq;
  }

  room.undoRequest = null;
  room.updatedAt = now;
}

function normalizePlayerInput(input: CreateRoomInput | JoinRoomInput): Pick<RoomPlayer, "id" | "name"> | null {
  const id = input.playerId.trim();
  const name = input.playerName.trim();

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function findParticipant(room: RoomState, playerId: string): RoomPlayer | RoomSpectator | null {
  return (
    room.players.find((candidate) => candidate.id === playerId) ??
    room.spectators.find((candidate) => candidate.id === playerId) ??
    null
  );
}

function hasParticipantId(room: RoomState, playerId: string): boolean {
  return findParticipant(room, playerId) !== null;
}

function hasParticipantName(room: RoomState, playerName: string): boolean {
  return (
    room.players.some((candidate) => namesMatch(candidate.name, playerName)) ||
    room.spectators.some((candidate) => namesMatch(candidate.name, playerName))
  );
}

function normalizeRoomCode(roomCode: string): string | null {
  const code = roomCode.trim().toUpperCase();

  return code.length > 0 ? code : null;
}

function normalizeChatText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function namesMatch(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
}

function getRoomSnapshot(room: RoomState): RoomSnapshot {
  return {
    board: room.board.map((row) => [...row]),
    chatMessages: room.chatMessages.map((message) => ({ ...message })),
    code: room.code,
    createdAt: room.createdAt,
    currentTurn: room.currentTurn,
    finishReason: room.finishReason,
    gameId: room.gameId,
    hostSeat: room.hostSeat,
    moveSeq: room.moveSeq,
    moves: room.moves.map((move) => ({ ...move })),
    players: room.players.map(({ connected, disconnectDeadline, name, ready, seat, undoRequestsRemaining }) => ({
      connected,
      disconnectDeadline,
      name,
      ready,
      seat,
      undoRequestsRemaining
    })),
    spectators: room.spectators.map(({ connected, joinedAt, name }) => ({
      connected,
      joinedAt,
      name
    })),
    status: room.status,
    undoRequest: room.undoRequest ? { ...room.undoRequest } : null,
    updatedAt: room.updatedAt,
    winner: room.winner,
    winLine: room.winLine.map((point) => ({ ...point }))
  };
}

function getPublicChatSnapshot(messages: PublicChatMessage[], generatedAt: number): PublicChatSnapshot {
  return {
    generatedAt,
    messages: messages.map((message) => ({ ...message }))
  };
}

function success<T>(value: T): RoomResult<T> {
  return { ok: true, value };
}

function failure(code: RoomErrorCode, message: string): RoomResult<never> {
  return { ok: false, error: { code, message } };
}
