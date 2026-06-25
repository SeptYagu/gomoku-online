import { randomInt } from "node:crypto";
import { createBoard, getGameResult, getOpponent, isValidMove, placeStone } from "@/game/board";
import type { Board, GameStatus, Move, Point, Stone } from "@/game/types";

export type RoomStatus = "waiting" | "ready" | "playing" | "finished" | "abandoned";

export type RoomPlayerSeat = Stone;

export type RoomPlayerSnapshot = {
  name: string;
  connected: boolean;
  ready: boolean;
  seat: RoomPlayerSeat;
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
  status: RoomStatus;
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
  | "move-seq-mismatch"
  | "not-room-member"
  | "not-your-turn"
  | "room-code-exhausted"
  | "room-full"
  | "room-not-found"
  | "room-not-ready"
  | "spot-unavailable";

export type RoomError = {
  code: RoomErrorCode;
  message: string;
};

export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: RoomError };

type RoomPlayer = {
  connected: boolean;
  id: string;
  joinedAt: number;
  name: string;
  ready: boolean;
  seat: RoomPlayerSeat;
};

type RoomState = {
  board: Board;
  code: string;
  createdAt: number;
  currentTurn: Stone;
  hostSeat: RoomPlayerSeat;
  moveSeq: number;
  moves: Move[];
  players: RoomPlayer[];
  status: RoomStatus;
  updatedAt: number;
  winner: Stone | null;
  winLine: Point[];
};

type RoomStoreOptions = {
  codeGenerator?: () => string;
  codeLength?: number;
  now?: () => number;
};

const DEFAULT_ROOM_CODE_LENGTH = 6;
const MAX_ROOM_CODE_ATTEMPTS = 50;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomStore {
  private readonly codeGenerator: () => string;
  private readonly now: () => number;
  private readonly rooms = new Map<string, RoomState>();

  constructor(options: RoomStoreOptions = {}) {
    this.now = options.now ?? Date.now;
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
          joinedAt: now,
          ready: false,
          seat: "black"
        }
      ],
      status: "waiting",
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

    if (room.status === "playing" || room.status === "finished" || room.status === "abandoned") {
      return failure("game-already-started", "This room is no longer accepting players.");
    }

    const player = normalizePlayerInput(input);

    if (!player) {
      return failure("invalid-player", "Player id and name are required.");
    }

    if (room.players.some((candidate) => candidate.id === player.id)) {
      return failure("duplicate-player", "Player is already in this room.");
    }

    if (room.players.some((candidate) => namesMatch(candidate.name, player.name))) {
      return failure("duplicate-name", "A player with this name is already in this room.");
    }

    if (room.players.length >= 2) {
      return failure("room-full", "Room already has two players.");
    }

    const seat = room.players.some((candidate) => candidate.seat === "black") ? "white" : "black";
    room.players.push({
      ...player,
      connected: true,
      joinedAt: this.now(),
      ready: false,
      seat
    });
    updateRoomStatus(room, this.now());

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

    if (room.status !== "ready") {
      return failure("room-not-ready", "Both players must be ready before the game starts.");
    }

    room.status = "playing";
    room.currentTurn = "black";
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

    room.status = "finished";
    room.winner = getOpponent(player.seat);
    room.winLine = [];
    room.updatedAt = this.now();

    return success(getRoomSnapshot(room));
  }

  markDisconnected(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    found.value.player.connected = false;
    found.value.room.updatedAt = this.now();

    return success(getRoomSnapshot(found.value.room));
  }

  restoreConnection(roomCode: string, playerId: string): RoomResult<RoomSnapshot> {
    const found = this.getRoomAndPlayer(roomCode, playerId);

    if (!found.ok) {
      return found;
    }

    found.value.player.connected = true;
    found.value.room.updatedAt = this.now();

    return success(getRoomSnapshot(found.value.room));
  }

  getSnapshot(roomCode: string): RoomResult<RoomSnapshot> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    return success(getRoomSnapshot(room));
  }

  private getRoom(roomCode: string): RoomState | null {
    const code = normalizeRoomCode(roomCode);

    if (!code) {
      return null;
    }

    return this.rooms.get(code) ?? null;
  }

  private getRoomAndPlayer(
    roomCode: string,
    playerId: string
  ): RoomResult<{ player: RoomPlayer; room: RoomState }> {
    const room = this.getRoom(roomCode);

    if (!room) {
      return failure("room-not-found", "Room does not exist.");
    }

    const player = room.players.find((candidate) => candidate.id === playerId);

    if (!player) {
      return failure("not-room-member", "Player is not in this room.");
    }

    return success({ player, room });
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

  room.status = room.players.length === 2 && room.players.every((player) => player.ready) ? "ready" : "waiting";
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
    players: room.players.map(({ connected, name, ready, seat }) => ({
      connected,
      name,
      ready,
      seat
    })),
    status: room.status,
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
