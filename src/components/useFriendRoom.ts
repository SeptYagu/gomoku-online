"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Point, Stone } from "@/game/types";
import type { PlayerProfileSnapshot } from "@/server/game-records";
import type { GameRecordAck, PublicChatAck, RoomAck, RoomClientState, RoomListAck } from "@/server/room-contract";
import type {
  LobbyRoomDeletedEvent,
  LobbyRoomUpdatedEvent,
  PublicChatMessage,
  PublicChatSnapshot,
  RoomListItem,
  RoomSnapshot
} from "@/server/rooms";
import { clearRoomUrlFromHref, getRoomUrlFromHref } from "./room-url";

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
  canCancelMatch: boolean;
  canCreateRoom: boolean;
  canFindMatch: boolean;
  canPlay: boolean;
  canReady: boolean;
  canResign: boolean;
  canRestart: boolean;
  canSit: boolean;
  canUndo: boolean;
  chatText: string;
  connectionStatus: "idle" | "connecting" | "connected" | "disconnected";
  cancelMatch: () => void;
  copyInvite: () => void;
  copiedInvite: boolean;
  createRoom: () => void;
  error: string | null;
  inviteUrl: string;
  joinCode: string;
  joinListedRoom: (roomCode: string) => void;
  joinRoom: () => void;
  leaveRoom: () => void;
  lobbyRooms: RoomListItem[];
  lobbyStatus: "idle" | "loading" | "ready" | "error";
  matchmakingStatus: "idle" | "searching";
  playerName: string;
  playMove: (point: Point) => void;
  profile: PlayerProfileSnapshot | null;
  profileStatus: "idle" | "loading" | "ready" | "error";
  publicChatMessages: PublicChatMessage[];
  publicChatStatus: "idle" | "loading" | "ready" | "error";
  publicChatText: string;
  ready: boolean;
  refreshProfile: () => void;
  refreshPublicChat: () => void;
  refreshLobby: () => void;
  resignGame: () => void;
  respondUndoRequest: (accepted: boolean) => void;
  restartGame: () => void;
  room: RoomClientState | null;
  sendPublicChatMessage: () => void;
  sendChatMessage: () => void;
  setChatText: (value: string) => void;
  setJoinCode: (value: string) => void;
  setPlayerName: (value: string) => void;
  setPublicChatText: (value: string) => void;
  findMatch: () => void;
  sitRoom: () => void;
  toggleReady: () => void;
  undoMove: () => void;
};

const PLAYER_ID_STORAGE_KEY = "gomoku-room-player-id";
const PLAYER_NAME_STORAGE_KEY = "gomoku-room-player-name";
const ROOM_SESSION_STORAGE_KEY = "gomoku-room-session";

export function useFriendRoom(): FriendRoomController {
  const socketRef = useRef<RoomSocket | null>(null);
  const submittedGameRecordsRef = useRef<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<FriendRoomController["connectionStatus"]>("idle");
  const [room, setRoom] = useState<RoomClientState | null>(null);
  const [playerName, setPlayerNameState] = useState(getInitialPlayerName);
  const [joinCode, setJoinCodeState] = useState(getInitialJoinCode);
  const [lobbyRooms, setLobbyRooms] = useState<RoomListItem[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<FriendRoomController["lobbyStatus"]>("idle");
  const [chatText, setChatText] = useState("");
  const [profile, setProfile] = useState<PlayerProfileSnapshot | null>(null);
  const [profileStatus, setProfileStatus] = useState<FriendRoomController["profileStatus"]>("idle");
  const [publicChatMessages, setPublicChatMessages] = useState<PublicChatMessage[]>([]);
  const [publicChatStatus, setPublicChatStatus] = useState<FriendRoomController["publicChatStatus"]>("idle");
  const [publicChatText, setPublicChatText] = useState("");
  const [matchmakingStatus, setMatchmakingStatus] = useState<FriendRoomController["matchmakingStatus"]>("idle");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const autoJoinRoomCodeRef = useRef<string | null>(null);

  const isPlayer = room?.role === "player" && room.seat !== null;
  const currentPlayer = isPlayer ? getPlayerBySeat(room.snapshot, room.seat) : null;
  const ready = currentPlayer?.ready ?? false;
  const lastMove = room?.snapshot.moves.at(-1) ?? null;
  const hasPendingUndoRequest = room?.snapshot.undoRequest !== null && room?.snapshot.undoRequest !== undefined;
  const canReady = isPlayer && room?.snapshot.status === "waiting";
  const canPlay = isPlayer && room?.snapshot.status === "playing" && room.snapshot.currentTurn === room.seat && !hasPendingUndoRequest;
  const canResign = isPlayer && room?.snapshot.status === "playing";
  const canRestart = isPlayer && room?.snapshot.status === "finished" && room.seat === room.snapshot.hostSeat;
  const canSit = room?.role === "spectator" && hasOpenPlayerSeat(room.snapshot);
  const canCreateRoom = !isCreatingRoom && matchmakingStatus !== "searching";
  const canFindMatch = matchmakingStatus !== "searching" && room?.snapshot.status !== "playing";
  const canCancelMatch =
    matchmakingStatus !== "searching" &&
    isPlayer &&
    room?.snapshot.status === "waiting" &&
    room.snapshot.players.length === 1;
  const canUndo =
    isPlayer &&
    room?.snapshot.status === "playing" &&
    lastMove?.stone === room.seat &&
    !hasPendingUndoRequest &&
    (currentPlayer?.undoRequestsRemaining ?? 0) > 0;
  const inviteUrl = useMemo(() => {
    if (!room || typeof window === "undefined") {
      return "";
    }

    return getRoomUrl(room.snapshot.code);
  }, [room]);

  const clearClosedRoom = useCallback((roomCode: string) => {
    setLobbyRooms((currentRooms) => currentRooms.filter((candidate) => candidate.code !== roomCode));
    setLobbyStatus("ready");
    setRoom((currentRoom) => {
      if (currentRoom?.snapshot.code !== roomCode) {
        return currentRoom;
      }

      clearRoomSession();
      clearRoomUrl();
      setChatText("");
      setMatchmakingStatus("idle");
      setError(null);

      return null;
    });
  }, []);

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
      setError(formatConnectionError(connectError));
    });
    socket.on("room:error", (roomError: unknown) => {
      setError(isRoomErrorLike(roomError) ? roomError.message : "Room error.");
    });
    socket.on("room:state", (snapshot: unknown) => {
      if (isRoomSnapshot(snapshot)) {
        setRoom((currentRoom) => (currentRoom ? { ...currentRoom, snapshot } : currentRoom));
      }
    });
    socket.on("lobby:room-updated", (event: unknown) => {
      if (isLobbyRoomUpdatedEvent(event)) {
        setLobbyRooms((currentRooms) => sortLobbyRooms(upsertLobbyRoom(currentRooms, event.room)));
        setLobbyStatus("ready");
      }
    });
    socket.on("lobby:room-deleted", (event: unknown) => {
      if (isLobbyRoomDeletedEvent(event)) {
        setLobbyRooms((currentRooms) => currentRooms.filter((candidate) => candidate.code !== event.code));
        setLobbyStatus("ready");
      }
    });
    socket.on("room:closed", (event: unknown) => {
      if (isLobbyRoomDeletedEvent(event)) {
        clearClosedRoom(event.code);
      }
    });
    socket.on("public-chat:messages", (snapshot: unknown) => {
      if (isPublicChatSnapshot(snapshot)) {
        setPublicChatMessages(snapshot.messages);
        setPublicChatStatus("ready");
      }
    });

    socketRef.current = socket;

    return socket;
  }, [clearClosedRoom]);

  const applyRoomAck = useCallback((response: RoomAck) => {
    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    const acknowledgedPlayerName = response.value.name || "Player";

    setError(null);
    setRoom(response.value);
    setJoinCodeState(response.value.snapshot.code);
    syncRoomUrl(response.value.snapshot.code);
    persistRoomSession({
      playerId: response.value.playerId,
      playerName: acknowledgedPlayerName,
      roomCode: response.value.snapshot.code
    });
  }, []);

  const createRoom = useCallback(() => {
    if (!canCreateRoom) {
      return;
    }

    const socket = ensureSocket();
    const nextPlayerId = getOrCreatePlayerId();
    const nextPlayerName = normalizePlayerName(playerName);

    setIsCreatingRoom(true);
    setPlayerNameState(nextPlayerName);
    persistPlayerName(nextPlayerName);
    socket.emit("room:create", { playerId: nextPlayerId, playerName: nextPlayerName }, (response: RoomAck) => {
      setIsCreatingRoom(false);
      applyRoomAck(response);
    });
  }, [applyRoomAck, canCreateRoom, ensureSocket, playerName]);

  const joinRoomByCode = useCallback((roomCode: string, retryWithFreshIdentity = true) => {
    const socket = ensureSocket();
    let nextPlayerId = getOrCreatePlayerId();
    let nextPlayerName = normalizePlayerName(playerName);
    const nextRoomCode = normalizeRoomCode(roomCode);

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
      (response: RoomAck) => {
        if (
          !response.ok &&
          retryWithFreshIdentity &&
          (response.error.code === "duplicate-player" || response.error.code === "duplicate-name")
        ) {
          nextPlayerId = createAndPersistPlayerId();
          nextPlayerName = createGuestPlayerName();
          setPlayerNameState(nextPlayerName);
          persistPlayerName(nextPlayerName);
          socket.emit(
            "room:join",
            { playerId: nextPlayerId, playerName: nextPlayerName, roomCode: nextRoomCode },
            applyRoomAck
          );
          return;
        }

        applyRoomAck(response);
      }
    );
  }, [applyRoomAck, ensureSocket, playerName]);

  const joinRoom = useCallback(() => {
    joinRoomByCode(joinCode);
  }, [joinCode, joinRoomByCode]);

  const joinListedRoom = useCallback((roomCode: string) => {
    joinRoomByCode(roomCode);
  }, [joinRoomByCode]);

  const findMatch = useCallback(() => {
    if (!canFindMatch) {
      return;
    }

    const socket = ensureSocket();
    const nextPlayerId = getOrCreatePlayerId();
    const nextPlayerName = normalizePlayerName(playerName);

    setMatchmakingStatus("searching");
    setPlayerNameState(nextPlayerName);
    persistPlayerName(nextPlayerName);
    socket.emit("matchmaking:find", { playerId: nextPlayerId, playerName: nextPlayerName }, (response: RoomAck) => {
      setMatchmakingStatus("idle");
      applyRoomAck(response);
    });
  }, [applyRoomAck, canFindMatch, ensureSocket, playerName]);

  const cancelMatch = useCallback(() => {
    if (!room) {
      return;
    }

    setMatchmakingStatus("searching");
    ensureSocket().emit("matchmaking:cancel", { roomCode: room.snapshot.code }, (response: RoomAck) => {
      setMatchmakingStatus("idle");

      if (!response.ok) {
        setError(response.error.message);
        return;
      }

      clearRoomSession();
      clearRoomUrl();
      setRoom(null);
      setChatText("");
      setError(null);
    });
  }, [ensureSocket, room]);

  const refreshLobby = useCallback(() => {
    setLobbyStatus("loading");
    ensureSocket().emit("lobby:join", { limit: 20 }, (response: RoomListAck) => {
      if (!response.ok) {
        setLobbyStatus("error");
        setError(response.error.message);
        return;
      }

      setLobbyRooms(response.value.rooms);
      setLobbyStatus("ready");
    });
  }, [ensureSocket]);

  const refreshPublicChat = useCallback(() => {
    setPublicChatStatus("loading");
    ensureSocket().emit("public-chat:join", undefined, (response: PublicChatAck) => {
      if (!response.ok) {
        setPublicChatStatus("error");
        setError(response.error.message);
        return;
      }

      setPublicChatMessages(response.value.messages);
      setPublicChatStatus("ready");
    });
  }, [ensureSocket]);

  const refreshProfile = useCallback(() => {
    const nextPlayerId = getOrCreatePlayerId();
    const nextPlayerName = normalizePlayerName(playerName);
    const params = new URLSearchParams({
      limit: "10",
      name: nextPlayerName,
      playerId: nextPlayerId
    });

    setProfileStatus("loading");
    void fetch(`/api/profile?${params.toString()}`, {
      headers: {
        "accept": "application/json"
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Profile request failed: ${response.status}`);
        }

        return (await response.json()) as PlayerProfileSnapshot;
      })
      .then((nextProfile) => {
        setProfile(nextProfile);
        setProfileStatus("ready");
      })
      .catch((profileError: unknown) => {
        setProfileStatus("error");
        setError(profileError instanceof Error ? profileError.message : "Profile request failed.");
      });
  }, [playerName]);

  const toggleReady = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("room:ready", { ready: !ready, roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, ready, room]);

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

  const undoMove = useCallback(() => {
    if (!room || !canUndo) {
      return;
    }

    ensureSocket().emit("game:undo-request", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, canUndo, ensureSocket, room]);

  const respondUndoRequest = useCallback((accepted: boolean) => {
    const undoRequest = room?.snapshot.undoRequest;

    if (!room || !undoRequest) {
      return;
    }

    ensureSocket().emit(
      "game:undo-respond",
      { accepted, requestId: undoRequest.id, roomCode: room.snapshot.code },
      applyRoomAck
    );
  }, [applyRoomAck, ensureSocket, room]);

  const restartGame = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:restart", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const sitRoom = useCallback(() => {
    if (!room) {
      return;
    }

    ensureSocket().emit("room:sit", { roomCode: room.snapshot.code }, applyRoomAck);
  }, [applyRoomAck, ensureSocket, room]);

  const sendChatMessage = useCallback(() => {
    if (!room) {
      return;
    }

    const text = chatText.trim();

    if (!text) {
      return;
    }

    ensureSocket().emit("room:chat-send", { roomCode: room.snapshot.code, text }, (response: RoomAck) => {
      applyRoomAck(response);

      if (response.ok) {
        setChatText("");
      }
    });
  }, [applyRoomAck, chatText, ensureSocket, room]);

  const sendPublicChatMessage = useCallback(() => {
    const text = publicChatText.trim();

    if (!text) {
      return;
    }

    const nextPlayerId = getOrCreatePlayerId();
    const nextPlayerName = normalizePlayerName(playerName);

    setPlayerNameState(nextPlayerName);
    persistPlayerName(nextPlayerName);
    ensureSocket().emit(
      "public-chat:send",
      { playerId: nextPlayerId, playerName: nextPlayerName, text },
      (response: PublicChatAck) => {
        if (!response.ok) {
          setError(response.error.message);
          return;
        }

        setPublicChatMessages(response.value.messages);
        setPublicChatStatus("ready");
        setPublicChatText("");
        setError(null);
      }
    );
  }, [ensureSocket, playerName, publicChatText]);

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
      clearRoomUrl();
      setRoom(null);
      setChatText("");
      setMatchmakingStatus("idle");
      setError(null);
    });
  }, [ensureSocket, room]);

  const copyInvite = useCallback(() => {
    if (!room || typeof window === "undefined") {
      return;
    }

    const currentInviteUrl = syncRoomUrl(room.snapshot.code);

    if (!navigator.clipboard) {
      if (copyTextWithFallback(currentInviteUrl)) {
        setCopiedInvite(true);
        setError(null);
        return;
      }

      setError(`Copy this link: ${currentInviteUrl}`);
      return;
    }

    void navigator.clipboard
      .writeText(currentInviteUrl)
      .then(() => {
        setCopiedInvite(true);
        setError(null);
      })
      .catch(() => setError(`Copy this link: ${currentInviteUrl}`));
  }, [room]);

  const setPlayerName = useCallback((value: string) => {
    setPlayerNameState(value);
    persistPlayerName(value);
  }, []);

  const setJoinCode = useCallback((value: string) => {
    setJoinCodeState(value.toUpperCase());
  }, []);

  useEffect(() => {
    const storedSession = readRoomSession();
    const roomCodeFromUrl = getRoomCodeFromCurrentUrl();

    if (roomCodeFromUrl) {
      if (room?.snapshot.code === roomCodeFromUrl || autoJoinRoomCodeRef.current === roomCodeFromUrl) {
        return;
      }

      autoJoinRoomCodeRef.current = roomCodeFromUrl;

      if (storedSession?.roomCode === roomCodeFromUrl) {
        ensureSocket().emit("room:rejoin", storedSession, (response: RoomAck) => {
          if (response.ok) {
            applyRoomAck(response);
            return;
          }

          window.setTimeout(() => joinRoomByCode(roomCodeFromUrl, true), 0);
        });
        return;
      }

      window.setTimeout(() => joinRoomByCode(roomCodeFromUrl, true), 0);
      return;
    }

    autoJoinRoomCodeRef.current = null;

    if (!storedSession || room) {
      return;
    }

    ensureSocket().emit("room:rejoin", storedSession, applyRoomAck);
  }, [applyRoomAck, ensureSocket, joinRoomByCode, room]);

  useEffect(() => {
    const snapshot = room?.snapshot;

    if (!room || room.role !== "player" || !snapshot || !snapshot.finishReason) {
      return;
    }

    if (snapshot.status !== "finished" && snapshot.status !== "abandoned") {
      return;
    }

    const submissionKey = `${room.playerId}:${snapshot.gameId}`;

    if (submittedGameRecordsRef.current.has(submissionKey)) {
      return;
    }

    submittedGameRecordsRef.current.add(submissionKey);
    ensureSocket().emit(
      "game-record:submit",
      {
        board: snapshot.board,
        finishReason: snapshot.finishReason,
        gameId: snapshot.gameId,
        moveSeq: snapshot.moveSeq,
        moves: snapshot.moves,
        roomCode: snapshot.code,
        status: snapshot.status,
        winner: snapshot.winner
      },
      (response: GameRecordAck) => {
        if (!response.ok) {
          setError(response.error.message);
          return;
        }

        refreshProfile();
      }
    );
  }, [ensureSocket, refreshProfile, room]);

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
    canCancelMatch,
    canCreateRoom,
    canFindMatch,
    canPlay,
    canReady,
    canResign,
    canRestart,
    canSit,
    canUndo,
    chatText,
    connectionStatus,
    cancelMatch,
    copyInvite,
    copiedInvite,
    createRoom,
    error,
    inviteUrl,
    joinCode,
    joinListedRoom,
    joinRoom,
    leaveRoom,
    lobbyRooms,
    lobbyStatus,
    matchmakingStatus,
    playerName,
    playMove,
    profile,
    profileStatus,
    publicChatMessages,
    publicChatStatus,
    publicChatText,
    ready,
    refreshProfile,
    refreshPublicChat,
    refreshLobby,
    resignGame,
    respondUndoRequest,
    restartGame,
    room,
    sendPublicChatMessage,
    sendChatMessage,
    setChatText,
    setJoinCode,
    setPlayerName,
    setPublicChatText,
    findMatch,
    sitRoom,
    toggleReady,
    undoMove
  };
}

function getPlayerBySeat(snapshot: RoomSnapshot, seat: Stone | null) {
  if (!seat) {
    return null;
  }

  return snapshot.players.find((player) => player.seat === seat) ?? null;
}

function hasOpenPlayerSeat(snapshot: RoomSnapshot): boolean {
  if (snapshot.status === "playing" || snapshot.status === "abandoned") {
    return false;
  }

  return snapshot.players.length < 2 || (snapshot.status === "finished" && snapshot.players.some((player) => !player.connected));
}

function isRoomErrorLike(value: unknown): value is { message: string } {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string";
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return typeof value === "object" && value !== null && "code" in value && "board" in value && "players" in value;
}

function isLobbyRoomUpdatedEvent(value: unknown): value is LobbyRoomUpdatedEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "room" in value &&
    typeof value.room === "object" &&
    value.room !== null &&
    "code" in value.room
  );
}

function isLobbyRoomDeletedEvent(value: unknown): value is LobbyRoomDeletedEvent {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}

function isPublicChatSnapshot(value: unknown): value is PublicChatSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray(value.messages)
  );
}

function upsertLobbyRoom(rooms: RoomListItem[], room: RoomListItem): RoomListItem[] {
  const nextRooms = rooms.filter((candidate) => candidate.code !== room.code);

  nextRooms.push(room);

  return nextRooms;
}

function sortLobbyRooms(rooms: RoomListItem[]): RoomListItem[] {
  return [...rooms].sort((first, second) => second.updatedAt - first.updatedAt || first.code.localeCompare(second.code));
}

function getInitialPlayerName(): string {
  if (typeof window === "undefined") {
    return "Player";
  }

  const storedPlayerName = readRoomSession()?.playerName ?? window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);

  if (storedPlayerName && !isLegacyDefaultPlayerName(storedPlayerName)) {
    return storedPlayerName;
  }

  const playerName = createGuestPlayerName();
  persistPlayerName(playerName);

  return playerName;
}

function getInitialJoinCode(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const roomFromUrl = new URLSearchParams(window.location.search).get("room");

  return normalizeRoomCode(roomFromUrl ?? readRoomSession()?.roomCode ?? "");
}

function getOrCreatePlayerId(): string {
  const storedPlayerId = window.sessionStorage.getItem(PLAYER_ID_STORAGE_KEY) ?? readRoomSession()?.playerId;

  if (storedPlayerId) {
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    return storedPlayerId;
  }

  return createAndPersistPlayerId();
}

function createAndPersistPlayerId(): string {
  const playerId = globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);

  return playerId;
}

function normalizePlayerName(name: string): string {
  return name.trim() || createGuestPlayerName();
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function getRoomUrl(roomCode: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  return getRoomUrlFromHref(url.toString(), roomCode);
}

function syncRoomUrl(roomCode: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const nextUrl = getRoomUrl(roomCode);

  if (nextUrl && window.location.href !== nextUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  return window.location.href;
}

function clearRoomUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = clearRoomUrlFromHref(window.location.href);

  if (window.location.href !== nextUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
}

function getRoomCodeFromCurrentUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return normalizeRoomCode(new URLSearchParams(window.location.search).get("room") ?? "");
}

function copyTextWithFallback(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function persistPlayerName(playerName: string) {
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
}

function persistRoomSession(session: StoredRoomSession) {
  window.sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function readRoomSession(): StoredRoomSession | null {
  const rawSession =
    window.sessionStorage.getItem(ROOM_SESSION_STORAGE_KEY) ??
    window.localStorage.getItem(ROOM_SESSION_STORAGE_KEY);

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
  window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
}

function createGuestPlayerName(): string {
  return `Player ${createRandomNumber(1000, 9999)}`;
}

function isLegacyDefaultPlayerName(playerName: string): boolean {
  return /^(Player|玩家|Joueur|Jugador|Игрок|لاعب)$/iu.test(playerName.trim());
}

function createRandomNumber(min: number, max: number): number {
  const span = max - min + 1;
  const cryptoObject = globalThis.crypto;

  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoObject.getRandomValues(values);

    return min + (values[0] % span);
  }

  return min + Math.floor(Math.random() * span);
}

function formatConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Connection failed.");

  if (message.toLocaleLowerCase().includes("xhr poll")) {
    return "Realtime connection failed: xhr poll error. Deploy with npm start after npm run build, and make sure /socket.io is proxied with WebSocket upgrade support.";
  }

  return `Realtime connection failed: ${message}`;
}
