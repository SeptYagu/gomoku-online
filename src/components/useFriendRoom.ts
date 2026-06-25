"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Point, Stone } from "@/game/types";
import type { RoomAck, RoomClientState } from "@/server/room-contract";
import type { RoomSnapshot } from "@/server/rooms";

type RoomSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type StoredRoomSession = {
  playerId: string;
  playerName: string;
  roomCode: string;
};

export type FriendRoomController = {
  canPlay: boolean;
  canReady: boolean;
  canResign: boolean;
  canRestart: boolean;
  canStart: boolean;
  connectionStatus: "idle" | "connecting" | "connected" | "disconnected";
  copyInvite: () => void;
  copiedInvite: boolean;
  createRoom: () => void;
  error: string | null;
  inviteUrl: string;
  joinCode: string;
  joinRoom: () => void;
  leaveRoom: () => void;
  playerName: string;
  playMove: (point: Point) => void;
  ready: boolean;
  resignGame: () => void;
  restartGame: () => void;
  room: RoomClientState | null;
  setJoinCode: (value: string) => void;
  setPlayerName: (value: string) => void;
  startGame: () => void;
  toggleReady: () => void;
};

const PLAYER_ID_STORAGE_KEY = "gomoku-room-player-id";
const PLAYER_NAME_STORAGE_KEY = "gomoku-room-player-name";
const ROOM_SESSION_STORAGE_KEY = "gomoku-room-session";

export function useFriendRoom(): FriendRoomController {
  const socketRef = useRef<RoomSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<FriendRoomController["connectionStatus"]>("idle");
  const [room, setRoom] = useState<RoomClientState | null>(null);
  const [playerName, setPlayerNameState] = useState(getInitialPlayerName);
  const [joinCode, setJoinCodeState] = useState(getInitialJoinCode);
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const currentPlayer = room ? getPlayerBySeat(room.snapshot, room.seat) : null;
  const ready = currentPlayer?.ready ?? false;
  const canReady = room !== null && (room.snapshot.status === "waiting" || room.snapshot.status === "ready");
  const canStart = room?.snapshot.status === "ready";
  const canPlay = room?.snapshot.status === "playing" && room.snapshot.currentTurn === room.seat;
  const canResign = room?.snapshot.status === "playing";
  const canRestart = room?.snapshot.status === "finished" && room.seat === room.snapshot.hostSeat;
  const inviteUrl = useMemo(() => {
    if (!room || typeof window === "undefined") {
      return "";
    }

    return `${window.location.origin}${window.location.pathname}?room=${room.snapshot.code}`;
  }, [room]);

  const ensureSocket = useCallback((): RoomSocket => {
    if (socketRef.current) {
      return socketRef.current;
    }

    setConnectionStatus("connecting");

    const socket: RoomSocket = io({
      path: "/socket.io"
    });

    socket.on("connect", () => setConnectionStatus("connected"));
    socket.on("disconnect", () => setConnectionStatus("disconnected"));
    socket.on("connect_error", (connectError: unknown) => {
      setConnectionStatus("disconnected");
      setError(connectError instanceof Error ? connectError.message : "Connection failed.");
    });
    socket.on("room:error", (roomError: unknown) => {
      setError(isRoomErrorLike(roomError) ? roomError.message : "Room error.");
    });
    socket.on("room:state", (snapshot: unknown) => {
      if (isRoomSnapshot(snapshot)) {
        setRoom((currentRoom) => (currentRoom ? { ...currentRoom, snapshot } : currentRoom));
      }
    });

    socketRef.current = socket;

    return socket;
  }, []);

  const applyRoomAck = useCallback((response: RoomAck) => {
    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    const acknowledgedPlayer = getPlayerBySeat(response.value.snapshot, response.value.seat);
    const acknowledgedPlayerName = acknowledgedPlayer?.name ?? "Player";

    setError(null);
    setRoom(response.value);
    setJoinCodeState(response.value.snapshot.code);
    persistRoomSession({
      playerId: response.value.playerId,
      playerName: acknowledgedPlayerName,
      roomCode: response.value.snapshot.code
    });
  }, []);

  const createRoom = useCallback(() => {
    const socket = ensureSocket();
    const nextPlayerId = getOrCreatePlayerId();
    const nextPlayerName = normalizePlayerName(playerName);

    setPlayerNameState(nextPlayerName);
    persistPlayerName(nextPlayerName);
    socket.emit("room:create", { playerId: nextPlayerId, playerName: nextPlayerName }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, playerName]);

  const joinRoom = useCallback(() => {
    const socket = ensureSocket();
    const nextPlayerId = getOrCreatePlayerId();
    const nextPlayerName = normalizePlayerName(playerName);
    const nextRoomCode = normalizeRoomCode(joinCode);

    if (!nextRoomCode) {
      setError("Enter a room code.");
      return;
    }

    setPlayerNameState(nextPlayerName);
    setJoinCodeState(nextRoomCode);
    persistPlayerName(nextPlayerName);
    socket.emit(
      "room:join",
      { playerId: nextPlayerId, playerName: nextPlayerName, roomCode: nextRoomCode },
      applyRoomAck
    );
  }, [applyRoomAck, ensureSocket, joinCode, playerName]);

  const toggleReady = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("room:ready", { ready: !ready, roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, ready, room]);

  const startGame = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:start", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const playMove = useCallback((point: Point) => {
    if (!room || !canPlay) {
      return;
    }

    ensureSocket().emit(
      "game:move",
      {
        expectedMoveSeq: room.snapshot.moveSeq,
        point,
        roomCode: room.snapshot.code
      },
      applyRoomAck
    );
  }, [applyRoomAck, canPlay, ensureSocket, room]);

  const resignGame = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:resign", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const restartGame = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:restart", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const leaveRoom = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("room:leave", { roomCode: room.snapshot.code }, (response: RoomAck) => {
      if (!response.ok) {
        setError(response.error.message);
        return;
      }

      clearRoomSession();
      setRoom(null);
      setError(null);
    });
  }, [ensureSocket, room]);

  const copyInvite = useCallback(() => {
    if (!inviteUrl || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(inviteUrl).then(() => setCopiedInvite(true));
  }, [inviteUrl]);

  const setPlayerName = useCallback((value: string) => {
    setPlayerNameState(value);
    persistPlayerName(value);
  }, []);

  const setJoinCode = useCallback((value: string) => {
    setJoinCodeState(value.toUpperCase());
  }, []);

  useEffect(() => {
    const storedSession = readRoomSession();

    if (!storedSession) {
      return;
    }

    ensureSocket().emit("room:rejoin", storedSession, applyRoomAck);
  }, [applyRoomAck, ensureSocket]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!copiedInvite) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedInvite(false), 1800);

    return () => window.clearTimeout(timeout);
  }, [copiedInvite]);

  return {
    canPlay,
    canReady,
    canResign,
    canRestart,
    canStart,
    connectionStatus,
    copyInvite,
    copiedInvite,
    createRoom,
    error,
    inviteUrl,
    joinCode,
    joinRoom,
    leaveRoom,
    playerName,
    playMove,
    ready,
    resignGame,
    restartGame,
    room,
    setJoinCode,
    setPlayerName,
    startGame,
    toggleReady
  };
}

function getPlayerBySeat(snapshot: RoomSnapshot, seat: Stone) {
  return snapshot.players.find((player) => player.seat === seat) ?? null;
}

function isRoomErrorLike(value: unknown): value is { message: string } {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string";
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return typeof value === "object" && value !== null && "code" in value && "board" in value && "players" in value;
}

function getInitialPlayerName(): string {
  if (typeof window === "undefined") {
    return "Player";
  }

  return readRoomSession()?.playerName ?? window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "Player";
}

function getInitialJoinCode(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const roomFromUrl = new URLSearchParams(window.location.search).get("room");

  return normalizeRoomCode(roomFromUrl ?? readRoomSession()?.roomCode ?? "");
}

function getOrCreatePlayerId(): string {
  const storedPlayerId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);

  if (storedPlayerId) {
    return storedPlayerId;
  }

  const playerId = globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);

  return playerId;
}

function normalizePlayerName(name: string): string {
  return name.trim() || "Player";
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function persistPlayerName(playerName: string) {
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
}

function persistRoomSession(session: StoredRoomSession) {
  window.localStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function readRoomSession(): StoredRoomSession | null {
  const rawSession = window.localStorage.getItem(ROOM_SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as StoredRoomSession;

    if (!session.playerId || !session.playerName || !session.roomCode) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function clearRoomSession() {
  window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
}
