import { randomInt } from "node:crypto";
import { createBoard, getGameResult, getOpponent, isValidMove, placeStone } from "../game/board";
import type { Board, GameStatus, Move, Point, Stone } from "../game/types";

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

export type RoomSnapshot = {
  board: Board;
  code: string;
  createdAt: number;
  currentTurn: Stone;
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
  | "game-already-started"
  | "game-not-playing"
  | "invalid-player"
  | "invalid-room-code"
  | "not-room-host"
  | "move-seq-mismatch"
  | "no-moves-to-undo"
  | "not-last-move-player"
  | "not-room-player"
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
  name: string;
};

type RoomState = {
  board: Board;
  code: string;
  createdAt: number;
  currentTurn: Stone;
  hostSeat: RoomPlayerSeat;
  moveSeq: number;
  moves: Move[];
  nextUndoRequestId: number;
  nextStartingSeat: RoomPlayerSeat;
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
  now?: () => number;
  roomTtlMs?: number;
};

const DEFAULT_ROOM_CODE_LENGTH = 6;
const MAX_ROOM_CODE_ATTEMPTS = 50;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COMPLETED_ROOM_TTL_MS = 30 * 60 * 1000;
const DISCONNECT_GRACE_MS = 60 * 1000;
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
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
  private readonly lifecycleLimits: RoomLifecycleLimits;
  private readonly now: () => number;
  private readonly rooms = new Map<string, RoomState>();

  constructor(options: RoomStoreOptions = {}) {
    this.now = options.now ?? Date.now;
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
      code,
      createdAt: now,
      currentTurn: "black",
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
          ready: false,
          rejectedUndoMoveSeq: null,
          undoRequestsRemaining: UNDO_REQUEST_LIMIT,
          seat: "black"
        }
      ],
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
        joinedAt: now
      });
      room.updatedAt = now;
      return success(getRoomSnapshot(room));
    }

    const seat = room.players.some((candidate) => candidate.seat === "black") ? "white" : "black";
    room.players.push({
      ...player,
      connected: true,
      disconnectedAt: null,
      disconnectDeadline: null,
      joinedAt: now,
      ready: false,
      rejectedUndoMoveSeq: null,
      undoRequestsRemaining: UNDO_REQUEST_LIMIT,
      seat
    });
    updateRoomStatus(room, now);

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
    room.winner = getOpponent(player.seat);
    room.winLine = [];
    room.updatedAt = this.now();

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

    return success(getRoomSnapshot(room));
  }

  markDisconnected(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndParticipant(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    const now = this.now();

    found.value.participant.connected = false;
    found.value.participant.disconnectedAt = now;

    if (found.value.role === "player" && "disconnectDeadline" in found.value.participant) {
      found.value.participant.disconnectDeadline =
        found.value.room.status === "playing" ? now + this.lifecycleLimits.disconnectGraceMs : null;
      found.value.room.undoRequest = null;
    }

    found.value.room.updatedAt = now;

    return success(getRoomSnapshot(found.value.room));
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
      return success(getRoomSnapshot(room));
    }

    return this.markDisconnected(roomCode, playerId);
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

    return success(getRoomSnapshot(found.value.room));
  }

  getSnapshot(roomCode: string): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    advanceRoomLifecycle(room, this.now(), this.lifecycleLimits);

    if (this.deleteIfExpired(room, this.now())) {
      return failure("room-not-found", "Room does not exist.");
    }

    return success(getRoomSnapshot(room));
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

  sweepExpiredRooms(): RoomLifecycleSweep {
    const now = this.now();
    const deletedRoomCodes: string[] = [];
    const updatedSnapshots: RoomSnapshot[] = [];

    for (const [code, room] of this.rooms) {
      const changed = advanceRoomLifecycle(room, now, this.lifecycleLimits);

      if (this.deleteIfExpired(room, now)) {
        deletedRoomCodes.push(code);
        continue;
      }

      if (changed) {
        updatedSnapshots.push(getRoomSnapshot(room));
      }
    }

    return { deletedRoomCodes, updatedSnapshots };
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

    advanceRoomLifecycle(room, this.now(), this.lifecycleLimits);

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
    room.winner = null;
    room.winLine = [];
    return;
  }

  room.status = "finished";

  if (result.state === "won") {
    room.winner = result.winner;
    room.winLine = result.line;
    return;
  }

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
  if (room.status === "finished" || room.status === "abandoned") {
    return now - room.updatedAt >= limits.completedRoomTtlMs;
  }

  const participants = [...room.players, ...room.spectators];

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
  room.undoRequest = null;
  room.winner = winner;
  room.winLine = [];
  room.updatedAt = now;
}

function abandonRoom(room: RoomState, now: number) {
  room.status = "abandoned";
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

function namesMatch(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
}

function getRoomSnapshot(room: RoomState): RoomSnapshot {
  return {
    board: room.board.map((row) => [...row]),
    code: room.code,
    createdAt: room.createdAt,
    currentTurn: room.currentTurn,
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

function success<T>(value: T): RoomResult<T> {
  return { ok: true, value };
}

function failure(code: RoomErrorCode, message: string): RoomResult<never> {
  return { ok: false, error: { code, message } };
}
