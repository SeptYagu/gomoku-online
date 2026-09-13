"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { AccountSession } from "@/server/accounts";
import type { RoomAck, RoomClientState } from "@/server/room-contract";
import type { RoomVisibility } from "@/server/rooms";
import { createLeaveRoomAttempt, type LeaveRoomAttempt } from "../leave-room-attempt";
import { DEFAULT_PLAYER_NAME } from "@/lib/constants";
import {
  clearGuestToken,
  clearRoomSession,
  clearRoomUrl,
  createAndPersistPlayerId,
  createGuestPlayerName,
  DEFAULT_JOIN_TARGET_REQUIRED_ERROR,
  DEFAULT_LEAVE_ROOM_TIMEOUT_ERROR,
  DEFAULT_ROOM_CODE_REQUIRED_ERROR,
  DEFAULT_ROOM_ERROR,
  formatConnectionError,
  getOrCreatePlayerId,
  getRoomCodeFromCurrentUrl,
  isLobbyRoomDeletedEvent,
  isRoomErrorLike,
  isRoomSnapshot,
  normalizePlayerName,
  normalizeRoomCode,
  persistGuestToken,
  persistPlayerName,
  persistRoomSession,
  readAccountToken,
  readGuestToken,
  readRoomSession,
  syncRoomUrl,
  useBootSnapshot,
  type PlayerAuthPayload,
  type RoomSocket,
  type UseFriendRoomOptions
} from "./room-state-utils";

export type RoomSocketEventHandlers = {
  onLobbyActivity?: (summary: unknown) => void;
  onLobbyRoomUpdated?: (event: unknown) => void;
  onLobbyRoomDeleted?: (event: unknown) => void;
  onPublicChatMessages?: (snapshot: unknown) => void;
  onPresenceUsers?: (snapshot: unknown) => void;
};

export type UseRoomSocketProps = {
  enabled: boolean;
  messages?: UseFriendRoomOptions["messages"];
  account: AccountSession | null;
  identityReady: boolean;
  playerName: string;
  setPlayerNameState: (name: string) => void;
  setJoinTargetState: (target: string) => void;
  onRoomCleared?: () => void;
};

type LeaveRoomRequest = {
  attempt: LeaveRoomAttempt;
  completions: Set<(left: boolean) => void>;
};

export function useRoomSocket({
  enabled,
  messages,
  account,
  identityReady,
  playerName,
  setPlayerNameState,
  setJoinTargetState,
  onRoomCleared
}: UseRoomSocketProps) {
  const socketRef = useRef<RoomSocket | null>(null);
  const messagesRef = useRef(messages);
  const eventHandlersRef = useRef<RoomSocketEventHandlers>({});
  const onRoomClearedRef = useRef(onRoomCleared);

  const updateEventHandlers = useCallback((handlers: RoomSocketEventHandlers) => {
    eventHandlersRef.current = handlers;
  }, []);

  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");
  const [room, setRoom] = useState<RoomClientState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoomOverride, setIsJoiningRoom] = useState<boolean | null>(null);

  // 消除 R6 缺陷：实例级 useRef 守护启动快照
  const bootIsJoiningRoom = useBootSnapshot(
    () => Boolean(getRoomCodeFromCurrentUrl()),
    false
  );
  const isJoiningRoom = isJoiningRoomOverride ?? bootIsJoiningRoom;

  const autoJoinRoomCodeRef = useRef<string | null>(null);
  const createRequestInFlightRef = useRef(false);
  const leaveRoomRequestRef = useRef<LeaveRoomRequest | null>(null);
  const hasConnectedOnceRef = useRef(false);
  const reconnectHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
    onRoomClearedRef.current = onRoomCleared;
  });

  const getActivePlayer = useCallback((): PlayerAuthPayload => {
    if (account) {
      return {
        accountToken: account.token,
        playerId: account.playerId,
        playerName: account.displayName
      };
    }

    return {
      guestToken: readGuestToken() ?? undefined,
      playerId: getOrCreatePlayerId(),
      playerName: normalizePlayerName(playerName)
    };
  }, [account, playerName]);

  const clearClosedRoom = useCallback((roomCode: string) => {
    onRoomClearedRef.current?.();
    setRoom((currentRoom) => {
      if (currentRoom?.snapshot.code !== roomCode) {
        return currentRoom;
      }

      clearRoomSession();
      clearRoomUrl();
      setIsJoiningRoom(false);
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

    socket.on("connect", () => {
      setConnectionStatus("connected");

      if (hasConnectedOnceRef.current) {
        reconnectHandlerRef.current?.();
      } else {
        hasConnectedOnceRef.current = true;
      }
    });

    socket.on("disconnect", () => setConnectionStatus("disconnected"));

    socket.on("connect_error", (connectError: unknown) => {
      setConnectionStatus("disconnected");
      setError(formatConnectionError(connectError, messagesRef.current));
    });

    socket.on("room:error", (roomError: unknown) => {
      setError(isRoomErrorLike(roomError) ? roomError.message : messagesRef.current?.roomError ?? DEFAULT_ROOM_ERROR);
    });

    socket.on("room:state", (snapshot: unknown) => {
      if (isRoomSnapshot(snapshot)) {
        setRoom((currentRoom) => (currentRoom ? { ...currentRoom, snapshot } : currentRoom));
      }
    });

    socket.on("lobby:activity", (summary: unknown) => {
      eventHandlersRef.current.onLobbyActivity?.(summary);
    });

    socket.on("lobby:room-updated", (event: unknown) => {
      eventHandlersRef.current.onLobbyRoomUpdated?.(event);
    });

    socket.on("lobby:room-deleted", (event: unknown) => {
      eventHandlersRef.current.onLobbyRoomDeleted?.(event);
    });

    socket.on("room:closed", (event: unknown) => {
      if (isLobbyRoomDeletedEvent(event)) {
        clearClosedRoom(event.code);
      }
    });

    socket.on("public-chat:messages", (snapshot: unknown) => {
      eventHandlersRef.current.onPublicChatMessages?.(snapshot);
    });

    socket.on("presence:users", (snapshot: unknown) => {
      eventHandlersRef.current.onPresenceUsers?.(snapshot);
    });

    socketRef.current = socket;

    return socket;
  }, [clearClosedRoom]);

  const applyRoomAck = useCallback((response: RoomAck) => {
    setIsJoiningRoom(false);

    if (!response.ok) {
      setError(response.error.message);
      return;
    }

    const acknowledgedPlayerName = response.value.name || DEFAULT_PLAYER_NAME;
    const existingSession = readRoomSession();
    const acknowledgedGuestToken =
      response.value.identity === "guest"
        ? response.value.guestToken ?? readGuestToken() ?? existingSession?.guestToken
        : undefined;

    setError(null);
    setRoom(response.value);
    setJoinTargetState(response.value.snapshot.code);
    syncRoomUrl(response.value.snapshot.code);
    persistRoomSession({
      accountToken: response.value.identity === "registered" ? account?.token ?? readAccountToken() ?? undefined : undefined,
      guestToken: acknowledgedGuestToken,
      playerId: response.value.playerId,
      playerName: acknowledgedPlayerName,
      roomCode: response.value.snapshot.code
    });
    if (acknowledgedGuestToken) {
      persistGuestToken(acknowledgedGuestToken);
    }
  }, [account, setJoinTargetState]);

  useEffect(() => {
    reconnectHandlerRef.current = () => {
      const storedSession = readRoomSession();

      if (!storedSession) {
        return;
      }

      ensureSocket().emit("room:rejoin", storedSession, (response: RoomAck) => {
        if (response.ok) {
          applyRoomAck(response);
          return;
        }

        if (response.error.code === "guest-session-invalid") {
          clearGuestToken();
          createAndPersistPlayerId();
        } else if (response.error.code === "room-not-found") {
          clearClosedRoom(storedSession.roomCode);
          return;
        }

        applyRoomAck(response);
      });
    };
  }, [applyRoomAck, clearClosedRoom, ensureSocket]);

  const createRoom = useCallback((visibility: RoomVisibility = "public") => {
    if (!identityReady || createRequestInFlightRef.current || room) {
      return;
    }

    const socket = ensureSocket();
    const player = getActivePlayer();

    createRequestInFlightRef.current = true;
    setIsCreatingRoom(true);
    setPlayerNameState(player.playerName);
    persistPlayerName(player.playerName);
    socket.emit("room:create", { ...player, visibility }, (response: RoomAck) => {
      createRequestInFlightRef.current = false;
      setIsCreatingRoom(false);
      applyRoomAck(response);
    });
  }, [applyRoomAck, ensureSocket, getActivePlayer, identityReady, room, setPlayerNameState]);

  const joinRoomByCode = useCallback((roomCode: string, retryWithFreshIdentity = true) => {
    if (!enabled || !identityReady) {
      return;
    }

    const nextRoomCode = normalizeRoomCode(roomCode);

    if (!nextRoomCode) {
      setIsJoiningRoom(false);
      setError(messages?.roomCodeRequired ?? DEFAULT_ROOM_CODE_REQUIRED_ERROR);
      return;
    }

    setIsJoiningRoom(true);
    const socket = ensureSocket();
    let player = getActivePlayer();

    setPlayerNameState(player.playerName);
    setJoinTargetState(nextRoomCode);
    persistPlayerName(player.playerName);
    socket.emit(
      "room:join",
      { ...player, roomCode: nextRoomCode },
      (response: RoomAck) => {
        if (
          !response.ok &&
          !player.accountToken &&
          retryWithFreshIdentity &&
          (response.error.code === "duplicate-player" ||
            response.error.code === "duplicate-name" ||
            response.error.code === "guest-session-invalid")
        ) {
          clearGuestToken();
          player = {
            playerId: createAndPersistPlayerId(),
            playerName: createGuestPlayerName()
          };
          setPlayerNameState(player.playerName);
          persistPlayerName(player.playerName);
          socket.emit(
            "room:join",
            { ...player, roomCode: nextRoomCode },
            applyRoomAck
          );
          return;
        }

        applyRoomAck(response);
      }
    );
  }, [applyRoomAck, enabled, ensureSocket, getActivePlayer, identityReady, messages?.roomCodeRequired, setJoinTargetState, setPlayerNameState]);

  const joinRoomByTarget = useCallback((target: string, retryWithFreshIdentity = true) => {
    if (!enabled || !identityReady) {
      return;
    }

    const nextTarget = target.trim();

    if (!nextTarget) {
      setIsJoiningRoom(false);
      setError(messages?.joinTargetRequired ?? DEFAULT_JOIN_TARGET_REQUIRED_ERROR);
      return;
    }

    setIsJoiningRoom(true);
    const socket = ensureSocket();
    let player = getActivePlayer();

    setPlayerNameState(player.playerName);
    setJoinTargetState(nextTarget);
    persistPlayerName(player.playerName);
    socket.emit("room:join-target", { ...player, target: nextTarget }, (response: RoomAck) => {
      if (
        !response.ok &&
        !player.accountToken &&
        retryWithFreshIdentity &&
        (response.error.code === "duplicate-player" ||
          response.error.code === "duplicate-name" ||
          response.error.code === "guest-session-invalid")
      ) {
        clearGuestToken();
        player = {
          playerId: createAndPersistPlayerId(),
          playerName: createGuestPlayerName()
        };
        setPlayerNameState(player.playerName);
        persistPlayerName(player.playerName);
        socket.emit("room:join-target", { ...player, target: nextTarget }, applyRoomAck);
        return;
      }

      applyRoomAck(response);
    });
  }, [applyRoomAck, enabled, ensureSocket, getActivePlayer, identityReady, messages?.joinTargetRequired, setJoinTargetState, setPlayerNameState]);

  const joinRoom = useCallback((target?: string) => {
    joinRoomByTarget(target ?? "");
  }, [joinRoomByTarget]);

  const joinListedRoom = useCallback((roomCode: string) => {
    joinRoomByCode(roomCode);
  }, [joinRoomByCode]);

  const leaveRoom = useCallback((onComplete?: (left: boolean) => void) => {
    if (!room) {
      onComplete?.(true);
      return;
    }

    if (leaveRoomRequestRef.current) {
      if (onComplete) {
        leaveRoomRequestRef.current.completions.add(onComplete);
      }
      return;
    }

    const completions = new Set<(left: boolean) => void>();
    if (onComplete) {
      completions.add(onComplete);
    }

    const attempt = createLeaveRoomAttempt(() => {
      if (leaveRoomRequestRef.current === request) {
        leaveRoomRequestRef.current = null;
      }
      setError(messages?.leaveRoomTimeout ?? DEFAULT_LEAVE_ROOM_TIMEOUT_ERROR);
      completions.forEach((complete) => complete(false));
    });
    const request = { attempt, completions };
    leaveRoomRequestRef.current = request;

    ensureSocket().emit("room:leave", { roomCode: room.snapshot.code }, (response: RoomAck) => {
      if (leaveRoomRequestRef.current !== request || !attempt.settle()) {
        return;
      }
      leaveRoomRequestRef.current = null;

      if (!response.ok) {
        setError(response.error.message);
        completions.forEach((complete) => complete(false));
        return;
      }

      clearRoomSession();
      clearRoomUrl();
      setIsJoiningRoom(false);
      setRoom(null);
      setError(null);
      onRoomClearedRef.current?.();
      completions.forEach((complete) => complete(true));
    });
  }, [ensureSocket, messages?.leaveRoomTimeout, room]);

  const currentRoomCode = room?.snapshot.code ?? null;
  const hasRoom = Boolean(room);

  useEffect(() => {
    if (!enabled) {
      autoJoinRoomCodeRef.current = null;
      return;
    }

    if (!identityReady) {
      return;
    }

    const storedSession = readRoomSession();
    const roomCodeFromUrl = getRoomCodeFromCurrentUrl();

    if (roomCodeFromUrl) {
      if (currentRoomCode === roomCodeFromUrl || autoJoinRoomCodeRef.current === roomCodeFromUrl) {
        return;
      }

      autoJoinRoomCodeRef.current = roomCodeFromUrl;

      if (storedSession?.roomCode === roomCodeFromUrl) {
        ensureSocket().emit("room:rejoin", storedSession, (response: RoomAck) => {
          if (response.ok) {
            applyRoomAck(response);
            return;
          }

          if (response.error.code === "guest-session-invalid") {
            clearGuestToken();
            createAndPersistPlayerId();
          }

          window.setTimeout(() => joinRoomByCode(roomCodeFromUrl, true), 0);
        });
        return;
      }

      window.setTimeout(() => joinRoomByCode(roomCodeFromUrl, true), 0);
      return;
    }

    autoJoinRoomCodeRef.current = null;

    if (!storedSession || hasRoom) {
      return;
    }

    window.setTimeout(() => setIsJoiningRoom(true), 0);
    ensureSocket().emit("room:rejoin", storedSession, (response: RoomAck) => {
      if (response.ok) {
        applyRoomAck(response);
        return;
      }

      if (response.error.code === "guest-session-invalid") {
        clearGuestToken();
        createAndPersistPlayerId();
        clearRoomSession();
        window.setTimeout(() => joinRoomByCode(storedSession.roomCode, true), 0);
        return;
      }

      applyRoomAck(response);
    });
  }, [applyRoomAck, currentRoomCode, enabled, ensureSocket, hasRoom, identityReady, joinRoomByCode]);

  useEffect(() => {
    return () => {
      leaveRoomRequestRef.current?.attempt.settle();
      leaveRoomRequestRef.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    connectionStatus,
    room,
    setRoom,
    error,
    setError,
    isCreatingRoom,
    isJoiningRoom: enabled && isJoiningRoom,
    setIsJoiningRoom,
    createRoom,
    joinRoomByCode,
    joinRoomByTarget,
    joinRoom,
    joinListedRoom,
    leaveRoom,
    applyRoomAck,
    clearClosedRoom,
    ensureSocket,
    getActivePlayer,
    updateEventHandlers
  };
}
