"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { io } from "socket.io-client";
import type { Point, Stone } from "@/game/types";
import type { AccountSession } from "@/server/accounts";
import type {
  LeaderboardIdentity,
  LeaderboardScope,
  LeaderboardSnapshot,
  PlayerProfileSnapshot,
  RoomGameRecordSnapshot
} from "@/server/game-records";
import type {
  GameRecordAck,
  PresenceAck,
  PublicChatAck,
  RoomAck,
  RoomClientState,
  RoomGameRecordAck,
  RoomListAck
} from "@/server/room-contract";
import type {
  LobbyActivitySummary,
  LobbyRoomDeletedEvent,
  LobbyRoomUpdatedEvent,
  PresenceSnapshot,
  PublicChatMessage,
  PublicChatSnapshot,
  RoomListItem,
  RoomSnapshot,
  RoomVisibility,
  UserPresenceSnapshot
} from "@/server/rooms";
import { clearRoomUrlFromHref, getRoomUrlFromHref } from "./room-url";
import { isAccountIdentityReady } from "./account-identity";
import { subscribeToBootState } from "./client-boot-state";
import { createChatSendGate, type ChatSendGate } from "./chat-send-gate";
import { createLeaveRoomAttempt, type LeaveRoomAttempt } from "./leave-room-attempt";
import {
  COPY_FEEDBACK_DURATION_MS,
  DEFAULT_PLAYER_NAME,
  PAGINATION
} from "@/lib/constants";

type RoomSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type StoredRoomSession = {
  accountToken?: string;
  guestToken?: string;
  playerId: string;
  playerName: string;
  roomCode: string;
};

type PlayerAuthPayload = {
  accountToken?: string;
  guestToken?: string;
  playerId: string;
  playerName: string;
};

export type FriendRoomController = {
  account: AccountSession | null;
  accountStatus: "guest" | "loading" | "registered" | "error";
  canCancelMatch: boolean;
  canCreateRoom: boolean;
  canFindMatch: boolean;
  canJoinRoom: boolean;
  canPlay: boolean;
  canReady: boolean;
  canRematch: boolean;
  canResign: boolean;
  canSit: boolean;
  canUndo: boolean;
  chatText: string;
  connectionStatus: "idle" | "connecting" | "connected" | "disconnected";
  isSendingChat: boolean;
  isSendingPublicChat: boolean;
  cancelMatch: () => void;
  copyInvite: () => void;
  copiedInvite: boolean;
  createRoom: (visibility?: RoomVisibility) => void;
  error: string | null;
  inviteUrl: string;
  isJoiningRoom: boolean;
  joinTarget: string;
  joinListedRoom: (roomCode: string) => void;
  joinRoom: () => void;
  leaveRoom: (onComplete?: (left: boolean) => void) => void;
  lobbyActivity: LobbyActivitySummary | null;
  lobbyRooms: RoomListItem[];
  lobbyStatus: "idle" | "loading" | "ready" | "error";
  leaderboard: LeaderboardSnapshot | null;
  leaderboardIdentity: LeaderboardIdentity;
  leaderboardOffset: number;
  leaderboardSearch: string;
  leaderboardScope: LeaderboardScope;
  leaderboardStatus: "idle" | "loading" | "ready" | "error";
  matchmakingStatus: "idle" | "searching";
  playerName: string;
  playMove: (point: Point) => void;
  presenceStatus: "idle" | "loading" | "ready" | "error";
  presenceUsers: UserPresenceSnapshot[];
  profile: PlayerProfileSnapshot | null;
  profileStatus: "idle" | "loading" | "ready" | "error";
  previousGameRecord: RoomGameRecordSnapshot | null;
  previousGameRecordStatus: "idle" | "loading" | "ready" | "error";
  publicChatMessages: PublicChatMessage[];
  publicChatStatus: "idle" | "loading" | "ready" | "error";
  publicChatText: string;
  registrationHandle: string;
  rematchReady: boolean;
  ready: boolean;
  nextLeaderboardPage: () => void;
  previousLeaderboardPage: () => void;
  registerAccount: () => void;
  refreshPresence: () => void;
  refreshLeaderboard: () => void;
  refreshProfile: () => void;
  refreshPublicChat: () => void;
  refreshLobby: () => void;
  resignGame: () => void;
  respondUndoRequest: (accepted: boolean) => void;
  setRematchReady: (ready: boolean) => void;
  room: RoomClientState | null;
  sendPublicChatMessage: () => void;
  sendChatMessage: () => void;
  signOutAccount: () => void;
  setChatText: (value: string) => void;
  setJoinTarget: (value: string) => void;
  setLeaderboardIdentity: (identity: LeaderboardIdentity) => void;
  setLeaderboardSearch: (value: string) => void;
  setLeaderboardScope: (scope: LeaderboardScope) => void;
  setPlayerName: (value: string) => void;
  setPublicChatText: (value: string) => void;
  setRegistrationHandle: (value: string) => void;
  findMatch: () => void;
  sitRoom: () => void;
  submitLeaderboardSearch: () => void;
  toggleReady: () => void;
  undoMove: () => void;
};

type UseFriendRoomOptions = {
  enabled?: boolean;
  messages?: Partial<{
    chatSendTimeout: string;
    /** `{message}` is replaced with the underlying transport error. */
    connectionFailed: string;
    connectionFailedXhr: string;
    joinTargetRequired: string;
    leaveRoomTimeout: string;
    roomCodeRequired: string;
    roomError: string;
  }>;
};

type LeaveRoomRequest = {
  attempt: LeaveRoomAttempt;
  completions: Set<(left: boolean) => void>;
};

const PLAYER_ID_STORAGE_KEY = "gomoku-room-player-id";
const PLAYER_NAME_STORAGE_KEY = "gomoku-room-player-name";
const ROOM_SESSION_STORAGE_KEY = "gomoku-room-session";
const ACCOUNT_TOKEN_STORAGE_KEY = "gomoku-account-token";
const GUEST_TOKEN_STORAGE_KEY = "gomoku-guest-token";
const LEADERBOARD_PAGE_SIZE = PAGINATION.LEADERBOARD;
const DEFAULT_CHAT_SEND_TIMEOUT_ERROR = "Message not sent: no response from the server. Please try again.";
const DEFAULT_LEAVE_ROOM_TIMEOUT_ERROR = "Leaving the room timed out. Please try again.";
const DEFAULT_CONNECTION_FAILED_ERROR = "Realtime connection failed: {message}";
// 开发态/无字典回退诊断信息：告知部署运维排查 Socket.IO 反向代理与构建模式（生产多语言文案由 dictionaries.ts 提供）
const DEFAULT_CONNECTION_XHR_ERROR =
  "Realtime connection failed: xhr poll error. Deploy with npm start after npm run build, and make sure /socket.io is proxied with WebSocket upgrade support.";
const DEFAULT_JOIN_TARGET_REQUIRED_ERROR = "Enter a room link, code, @handle, or account ID.";
const DEFAULT_ROOM_CODE_REQUIRED_ERROR = "Enter a room code.";
const DEFAULT_ROOM_ERROR = "Room error.";

export function useFriendRoom({ enabled = true, messages }: UseFriendRoomOptions = {}): FriendRoomController {
  const socketRef = useRef<RoomSocket | null>(null);
  // Socket handlers are installed once (empty deps) but the errors they report
  // must follow the active locale, so they read the latest copy through a ref.
  const messagesRef = useRef(messages);
  const leaderboardAbortControllerRef = useRef<AbortController | null>(null);
  const leaderboardRequestSeqRef = useRef(0);
  const submittedGameRecordsRef = useRef<Set<string>>(new Set());
  const previousGameRecordRequestRef = useRef<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<FriendRoomController["connectionStatus"]>("idle");
  const [room, setRoom] = useState<RoomClientState | null>(null);
  const [account, setAccount] = useState<AccountSession | null>(null);
  // 身份相关的前四项来自浏览器（token / 名字 / 邀请链接），服务端渲染读不到。
  // 这里只保存「程序显式设置过的覆盖值」，未设置时回落到启动快照（见 client-boot-state.ts），
  // 于是首屏 SSR 与 hydration 完全一致，且不需要在 effect 里补 setState。
  const [accountStatusOverride, setAccountStatus] = useState<FriendRoomController["accountStatus"] | null>(null);
  const [playerNameOverride, setPlayerNameState] = useState<string | null>(null);
  const [joinTargetOverride, setJoinTargetState] = useState<string | null>(null);
  const bootAccountStatus = useSyncExternalStore(
    subscribeToBootState,
    readBootAccountStatus,
    getServerAccountStatus
  );
  const bootPlayerName = useSyncExternalStore(subscribeToBootState, readBootPlayerName, getServerPlayerName);
  const bootJoinTarget = useSyncExternalStore(subscribeToBootState, readBootJoinTarget, getServerJoinTarget);
  const accountStatus = accountStatusOverride ?? bootAccountStatus;
  const playerName = playerNameOverride ?? bootPlayerName;
  const joinTarget = joinTargetOverride ?? bootJoinTarget;
  const [lobbyActivity, setLobbyActivity] = useState<LobbyActivitySummary | null>(null);
  const [lobbyRooms, setLobbyRooms] = useState<RoomListItem[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<FriendRoomController["lobbyStatus"]>("idle");
  const [chatText, setChatText] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isSendingPublicChat, setIsSendingPublicChat] = useState(false);
  const [profile, setProfile] = useState<PlayerProfileSnapshot | null>(null);
  const [profileStatus, setProfileStatus] = useState<FriendRoomController["profileStatus"]>("idle");
  const [previousGameRecord, setPreviousGameRecord] = useState<RoomGameRecordSnapshot | null>(null);
  const [previousGameRecordStatus, setPreviousGameRecordStatus] =
    useState<FriendRoomController["previousGameRecordStatus"]>("idle");
  const [publicChatMessages, setPublicChatMessages] = useState<PublicChatMessage[]>([]);
  const [publicChatStatus, setPublicChatStatus] = useState<FriendRoomController["publicChatStatus"]>("idle");
  const [publicChatText, setPublicChatText] = useState("");
  const [registrationHandle, setRegistrationHandleState] = useState("");
  const [presenceUsers, setPresenceUsers] = useState<UserPresenceSnapshot[]>([]);
  const [presenceStatus, setPresenceStatus] = useState<FriendRoomController["presenceStatus"]>("idle");
  const [leaderboard, setLeaderboard] = useState<LeaderboardSnapshot | null>(null);
  const [leaderboardIdentity, setLeaderboardIdentityState] = useState<LeaderboardIdentity>("registered");
  const [leaderboardOffset, setLeaderboardOffset] = useState(0);
  const [leaderboardSearch, setLeaderboardSearchState] = useState("");
  const [leaderboardAppliedSearch, setLeaderboardAppliedSearch] = useState("");
  const [leaderboardScope, setLeaderboardScopeState] = useState<LeaderboardScope>("overall");
  const [leaderboardStatus, setLeaderboardStatus] = useState<FriendRoomController["leaderboardStatus"]>("idle");
  const [matchmakingStatus, setMatchmakingStatus] = useState<FriendRoomController["matchmakingStatus"]>("idle");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoomOverride, setIsJoiningRoom] = useState<boolean | null>(null);
  const bootIsJoiningRoom = useSyncExternalStore(
    subscribeToBootState,
    readBootIsJoiningRoom,
    getServerIsJoiningRoom
  );
  const isJoiningRoom = isJoiningRoomOverride ?? bootIsJoiningRoom;
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const autoJoinRoomCodeRef = useRef<string | null>(null);
  const createRequestInFlightRef = useRef(false);
  // 聊天发送的在途闸门：state 只用来驱动按钮禁用，同步闸门（ref 里的 gate）才是真正的
  // 重入防线，且带 8s 看门狗 —— socket.io 断线时会静默丢弃普通 ack，没有兜底就会永久锁死。
  const chatSendGateRef = useRef<ChatSendGate | null>(null);
  const publicChatSendGateRef = useRef<ChatSendGate | null>(null);
  const leaveRoomRequestRef = useRef<LeaveRoomRequest | null>(null);
  const hasConnectedOnceRef = useRef(false);
  const reconnectHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // No dep array on purpose: callers pass an inline object literal, so this
    // keeps the ref in sync with the latest locale copy without re-creating the
    // socket or threading `messages` through every callback's deps.
    messagesRef.current = messages;
  });

  const isPlayer = room?.role === "player" && room.seat !== null;
  const currentPlayer = isPlayer ? getPlayerBySeat(room.snapshot, room.seat) : null;
  const ready = currentPlayer?.ready ?? false;
  const lastMove = room?.snapshot.moves.at(-1) ?? null;
  const hasPendingUndoRequest = room?.snapshot.undoRequest !== null && room?.snapshot.undoRequest !== undefined;
  const canReady = enabled && isPlayer && room?.snapshot.status === "waiting";
  const canPlay =
    enabled && isPlayer && room?.snapshot.status === "playing" && room.snapshot.currentTurn === room.seat && !hasPendingUndoRequest;
  const canResign = enabled && isPlayer && room?.snapshot.status === "playing";
  const canRematch = enabled && isPlayer && room?.snapshot.status === "finished";
  const rematchReady = Boolean(isPlayer && room?.seat && room.snapshot.rematch.readySeats.includes(room.seat));
  const canSit = enabled && room?.role === "spectator" && hasOpenPlayerSeat(room.snapshot);
  const identityReady = isAccountIdentityReady(accountStatus);
  const canCreateRoom = enabled && identityReady && !room && !isCreatingRoom && matchmakingStatus !== "searching";
  const canFindMatch = enabled && identityReady && !room && matchmakingStatus !== "searching";
  const canJoinRoom = enabled && identityReady && !room && matchmakingStatus !== "searching";
  const canCancelMatch =
    enabled &&
    matchmakingStatus !== "searching" &&
    isPlayer &&
    room?.snapshot.status === "waiting" &&
    room.snapshot.players.length === 1;
  const canUndo =
    enabled &&
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
    setLobbyRooms((currentRooms) => currentRooms.filter((candidate) => candidate.code !== roomCode));
    setLobbyStatus("ready");
    setRoom((currentRoom) => {
      if (currentRoom?.snapshot.code !== roomCode) {
        return currentRoom;
      }

      clearRoomSession();
      clearRoomUrl();
      setIsJoiningRoom(false);
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

    socket.on("connect", () => {
      setConnectionStatus("connected");

      // socket.io does not restore server-side room membership after a
      // reconnect, so re-emit room:rejoin or the room would be treated as
      // empty (and eventually swept) while the game is still running.
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
      if (isLobbyActivitySummary(summary)) {
        setLobbyActivity((prev) => {
          if (!prev || summary.version >= prev.version) {
            return summary;
          }
          return prev;
        });
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
    socket.on("presence:users", (snapshot: unknown) => {
      if (isPresenceSnapshot(snapshot)) {
        setPresenceUsers(snapshot.users);
        setPresenceStatus("ready");
      }
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
  }, [account]);

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
    if (!canCreateRoom || createRequestInFlightRef.current) {
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
  }, [applyRoomAck, canCreateRoom, ensureSocket, getActivePlayer]);

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
  }, [applyRoomAck, enabled, ensureSocket, getActivePlayer, identityReady, messages?.roomCodeRequired]);

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
  }, [applyRoomAck, enabled, ensureSocket, getActivePlayer, identityReady, messages?.joinTargetRequired]);

  const joinRoom = useCallback(() => {
    joinRoomByTarget(joinTarget);
  }, [joinRoomByTarget, joinTarget]);

  const joinListedRoom = useCallback((roomCode: string) => {
    joinRoomByCode(roomCode);
  }, [joinRoomByCode]);

  const findMatch = useCallback(() => {
    if (!canFindMatch) {
      return;
    }

    const socket = ensureSocket();
    const player = getActivePlayer();

    setMatchmakingStatus("searching");
    setPlayerNameState(player.playerName);
    persistPlayerName(player.playerName);
    socket.emit("matchmaking:find", player, (response: RoomAck) => {
      setMatchmakingStatus("idle");
      applyRoomAck(response);
    });
  }, [applyRoomAck, canFindMatch, ensureSocket, getActivePlayer]);

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
      setIsJoiningRoom(false);
      setRoom(null);
      setChatText("");
      setError(null);
    });
  }, [ensureSocket, room]);

  const refreshLobby = useCallback(() => {
    setLobbyStatus("loading");
    ensureSocket().emit("lobby:join", { limit: PAGINATION.LOBBY_ROOMS }, (response: RoomListAck) => {
      if (!response.ok) {
        setLobbyStatus("error");
        setError(response.error.message);
        return;
      }

      setLobbyRooms(response.value.rooms);
      if (response.value.activity) {
        setLobbyActivity(response.value.activity);
      }
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

  const refreshPresence = useCallback(() => {
    if (!identityReady) {
      return;
    }

    const player = getActivePlayer();

    setPresenceStatus("loading");
    setPlayerNameState(player.playerName);
    persistPlayerName(player.playerName);
    ensureSocket().emit(
      "presence:join",
      {
        ...player,
        limit: PAGINATION.PRESENCE_USERS,
      },
      (response: PresenceAck) => {
        if (!response.ok) {
          setPresenceStatus("error");
          setError(response.error.message);
          return;
        }

        setPresenceUsers(response.value.users);
        setPresenceStatus("ready");
      }
    );
  }, [ensureSocket, getActivePlayer, identityReady]);

  const refreshLeaderboard = useCallback(() => {
    const params = new URLSearchParams({
      identity: leaderboardIdentity,
      limit: String(LEADERBOARD_PAGE_SIZE),
      offset: String(leaderboardOffset),
      scope: leaderboardScope
    });
    const search = leaderboardAppliedSearch;

    if (search) {
      params.set("search", search);
    }

    leaderboardAbortControllerRef.current?.abort();
    const controller = new AbortController();
    const requestSeq = leaderboardRequestSeqRef.current + 1;

    leaderboardAbortControllerRef.current = controller;
    leaderboardRequestSeqRef.current = requestSeq;
    setLeaderboardStatus("loading");
    void fetch(`/api/leaderboard?${params.toString()}`, {
      headers: {
        "accept": "application/json"
      },
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Leaderboard request failed: ${response.status}`);
        }

        return (await response.json()) as LeaderboardSnapshot;
      })
      .then((snapshot) => {
        if (leaderboardRequestSeqRef.current !== requestSeq) {
          return;
        }

        setLeaderboard(snapshot);
        setLeaderboardStatus("ready");
      })
      .catch((leaderboardError: unknown) => {
        if (isAbortError(leaderboardError) || leaderboardRequestSeqRef.current !== requestSeq) {
          return;
        }

        setLeaderboardStatus("error");
        setError(leaderboardError instanceof Error ? leaderboardError.message : "Leaderboard request failed.");
      })
      .finally(() => {
        if (leaderboardAbortControllerRef.current === controller) {
          leaderboardAbortControllerRef.current = null;
        }
      });
  }, [leaderboardAppliedSearch, leaderboardIdentity, leaderboardOffset, leaderboardScope]);

  const refreshProfile = useCallback(() => {
    if (!identityReady) {
      return;
    }

    const player = getActivePlayer();
    const params = new URLSearchParams({
      limit: String(PAGINATION.LEADERBOARD),
      name: player.playerName,
      playerId: player.playerId
    });
    const headers: HeadersInit = {
      "accept": "application/json"
    };

    if (player.accountToken) {
      headers.authorization = `Bearer ${player.accountToken}`;
    }

    setProfileStatus("loading");
    void fetch(`/api/profile?${params.toString()}`, {
      headers
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
  }, [getActivePlayer, identityReady]);

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

  const setRematchReady = useCallback((ready: boolean) => {
    if (!room) {
      return;
    }

    ensureSocket().emit("game:rematch-ready", { ready, roomCode: room.snapshot.code }, applyRoomAck);
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

    const gate = (chatSendGateRef.current ??= createChatSendGate());

    if (
      !gate.begin(() => {
        // 超时兜底：闸门已经放开，把内容放回输入框并提示，避免按钮永久禁用 + 内容丢失。
        setIsSendingChat(false);
        setError(messages?.chatSendTimeout ?? DEFAULT_CHAT_SEND_TIMEOUT_ERROR);
        setChatText((current) => (current ? current : text));
      })
    ) {
      return;
    }

    setIsSendingChat(true);
    // 乐观清空输入框：ack 回来之前闸门已经关上，连点也不会重复发同一条。
    setChatText("");

    ensureSocket().emit("room:chat-send", { roomCode: room.snapshot.code, text }, (response: RoomAck) => {
      gate.settle();
      setIsSendingChat(false);
      applyRoomAck(response);

      if (!response.ok) {
        // 发送失败时把内容放回输入框（仅当用户还没输入新内容），方便直接重试。
        setChatText((current) => (current ? current : text));
      }
    });
  }, [applyRoomAck, chatText, ensureSocket, messages?.chatSendTimeout, room]);

  const sendPublicChatMessage = useCallback(() => {
    if (!identityReady) {
      return;
    }

    const text = publicChatText.trim();

    if (!text) {
      return;
    }

    const player = getActivePlayer();
    const gate = (publicChatSendGateRef.current ??= createChatSendGate());

    if (
      !gate.begin(() => {
        setIsSendingPublicChat(false);
        setError(messages?.chatSendTimeout ?? DEFAULT_CHAT_SEND_TIMEOUT_ERROR);
        setPublicChatText((current) => (current ? current : text));
      })
    ) {
      return;
    }

    setIsSendingPublicChat(true);
    setPlayerNameState(player.playerName);
    persistPlayerName(player.playerName);
    setPublicChatText("");

    ensureSocket().emit(
      "public-chat:send",
      { ...player, text },
      (response: PublicChatAck) => {
        gate.settle();
        setIsSendingPublicChat(false);

        if (!response.ok) {
          setError(response.error.message);
          setPublicChatText((current) => (current ? current : text));
          return;
        }

        setPublicChatMessages(response.value.messages);
        setPublicChatStatus("ready");
        setError(null);
      }
    );
  }, [ensureSocket, getActivePlayer, identityReady, messages?.chatSendTimeout, publicChatText]);

  const leaveRoom = useCallback((onComplete?: (left: boolean) => void) => {
    if (!room) {
      // 没有房间可离开也算「已离开」，否则调用方会一直等一个永远不来的回调。
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
      // 超时或卸载后到达的 ack 已不属于当前 UI 状态，不能再清房间或改写调用方结果。
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
      setChatText("");
      setMatchmakingStatus("idle");
      setError(null);
      completions.forEach((complete) => complete(true));
    });
  }, [ensureSocket, messages?.leaveRoomTimeout, room]);

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

  const registerAccount = useCallback(() => {
    const displayName = normalizePlayerName(playerName);

    setAccountStatus("loading");
    void fetch("/api/account/register", {
      body: JSON.stringify({ displayName, publicHandle: registrationHandle.trim() || undefined }),
      headers: {
        "accept": "application/json",
        "content-type": "application/json"
      },
      method: "POST"
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;

          throw new Error(body?.error ?? `Account request failed: ${response.status}`);
        }

        return (await response.json()) as AccountSession;
      })
      .then((session) => {
        persistAccountToken(session.token);
        setAccount(session);
        setAccountStatus("registered");
        setPlayerNameState(session.displayName);
        setRegistrationHandleState(session.publicHandle);
        persistPlayerName(session.displayName);
        setError(null);
      })
      .catch((accountError: unknown) => {
        setAccountStatus("error");
        setError(accountError instanceof Error ? accountError.message : "Account request failed.");
      });
  }, [playerName, registrationHandle]);

  const signOutAccount = useCallback(() => {
    clearAccountToken();
    clearGuestToken();
    setAccount(null);
    setAccountStatus("guest");
    setRegistrationHandleState("");
    createAndPersistPlayerId();
    clearRoomSession();
  }, []);

  const setPlayerName = useCallback((value: string) => {
    setPlayerNameState(value);
    persistPlayerName(value);
  }, []);

  const setJoinTarget = useCallback((value: string) => {
    setJoinTargetState(value);
  }, []);

  const setRegistrationHandle = useCallback((value: string) => {
    setRegistrationHandleState(value.replace(/^@/, ""));
  }, []);

  const setLeaderboardScope = useCallback((scope: LeaderboardScope) => {
    setLeaderboardScopeState(scope);
    setLeaderboardOffset(0);
  }, []);

  const setLeaderboardIdentity = useCallback((identity: LeaderboardIdentity) => {
    setLeaderboardIdentityState(identity);
    setLeaderboardOffset(0);
  }, []);

  const setLeaderboardSearch = useCallback((value: string) => {
    setLeaderboardSearchState(value);
  }, []);

  const submitLeaderboardSearch = useCallback(() => {
    const nextSearch = leaderboardSearch.trim();

    setLeaderboardOffset(0);
    if (nextSearch === leaderboardAppliedSearch) {
      refreshLeaderboard();
      return;
    }

    setLeaderboardAppliedSearch(nextSearch);
  }, [leaderboardAppliedSearch, leaderboardSearch, refreshLeaderboard]);

  const nextLeaderboardPage = useCallback(() => {
    setLeaderboardOffset((currentOffset) => {
      const nextOffset = currentOffset + LEADERBOARD_PAGE_SIZE;

      if (leaderboard && nextOffset >= leaderboard.totalEntries) {
        return currentOffset;
      }

      return nextOffset;
    });
  }, [leaderboard]);

  const previousLeaderboardPage = useCallback(() => {
    setLeaderboardOffset((currentOffset) => Math.max(0, currentOffset - LEADERBOARD_PAGE_SIZE));
  }, []);

  useEffect(() => {
    const token = readAccountToken();

    if (!token) {
      return;
    }

    void fetch("/api/account/session", {
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${token}`
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Account session failed: ${response.status}`);
        }

        return (await response.json()) as AccountSession;
      })
      .then((session) => {
        persistAccountToken(session.token);
        setAccount(session);
        setAccountStatus("registered");
        setPlayerNameState(session.displayName);
        setRegistrationHandleState(session.publicHandle);
        persistPlayerName(session.displayName);
      })
      .catch(() => {
        clearAccountToken();
        setAccount(null);
        setAccountStatus("guest");
      });
  }, []);

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
    const roomCode = room?.snapshot.code;
    const previousGameId = room?.snapshot.previousGameId;

    if (!enabled || !roomCode || !previousGameId) {
      previousGameRecordRequestRef.current = null;
      window.setTimeout(() => {
        setPreviousGameRecord(null);
        setPreviousGameRecordStatus("idle");
      }, 0);
      return;
    }

    const requestKey = `${roomCode}:${previousGameId}`;

    if (previousGameRecordRequestRef.current === requestKey) {
      return;
    }

    previousGameRecordRequestRef.current = requestKey;
    window.setTimeout(() => setPreviousGameRecordStatus("loading"), 0);
    ensureSocket().emit("game-record:get", { gameId: previousGameId }, (response: RoomGameRecordAck) => {
      if (previousGameRecordRequestRef.current !== requestKey) {
        return;
      }

      if (!response.ok) {
        setPreviousGameRecord(null);
        setPreviousGameRecordStatus("error");
        return;
      }

      setPreviousGameRecord(response.value);
      setPreviousGameRecordStatus("ready");
    });
  }, [enabled, ensureSocket, room?.snapshot.code, room?.snapshot.previousGameId]);

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
      chatSendGateRef.current?.settle();
      publicChatSendGateRef.current?.settle();
      leaveRoomRequestRef.current?.attempt.settle();
      leaveRoomRequestRef.current = null;
      leaderboardAbortControllerRef.current?.abort();
      leaderboardAbortControllerRef.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!copiedInvite) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedInvite(false), COPY_FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [copiedInvite]);

  return {
    account,
    accountStatus,
    canCancelMatch,
    canCreateRoom,
    canFindMatch,
    canJoinRoom,
    canPlay,
    canReady,
    canRematch,
    canResign,
    canSit,
    canUndo,
    chatText,
    connectionStatus,
    isSendingChat,
    isSendingPublicChat,
    cancelMatch,
    copyInvite,
    copiedInvite,
    createRoom,
    error,
    inviteUrl,
    isJoiningRoom: enabled && isJoiningRoom,
    joinTarget,
    joinListedRoom,
    joinRoom,
    leaveRoom,
    leaderboard,
    leaderboardIdentity,
    leaderboardOffset,
    leaderboardSearch,
    leaderboardScope,
    leaderboardStatus,
    lobbyActivity,
    lobbyRooms,
    lobbyStatus,
    matchmakingStatus,
    playerName,
    playMove,
    presenceStatus,
    presenceUsers,
    profile,
    profileStatus,
    previousGameRecord,
    previousGameRecordStatus,
    publicChatMessages,
    publicChatStatus,
    publicChatText,
    registrationHandle,
    rematchReady,
    ready,
    nextLeaderboardPage,
    previousLeaderboardPage,
    registerAccount,
    refreshPresence,
    refreshLeaderboard,
    refreshProfile,
    refreshPublicChat,
    refreshLobby,
    resignGame,
    respondUndoRequest,
    setRematchReady,
    room,
    sendPublicChatMessage,
    sendChatMessage,
    signOutAccount,
    setChatText,
    setJoinTarget,
    setLeaderboardIdentity,
    setLeaderboardSearch,
    setLeaderboardScope,
    setPlayerName,
    setPublicChatText,
    setRegistrationHandle,
    findMatch,
    sitRoom,
    submitLeaderboardSearch,
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

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError";
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return typeof value === "object" && value !== null && "code" in value && "board" in value && "players" in value;
}

function isLobbyActivitySummary(value: unknown): value is LobbyActivitySummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "onlineUsers" in value &&
    typeof (value as { onlineUsers: unknown }).onlineUsers === "number" &&
    "openTables" in value &&
    typeof (value as { openTables: unknown }).openTables === "number" &&
    "playingTables" in value &&
    typeof (value as { playingTables: unknown }).playingTables === "number" &&
    "spectators" in value &&
    typeof (value as { spectators: unknown }).spectators === "number" &&
    "version" in value &&
    typeof (value as { version: unknown }).version === "number"
  );
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

function isPresenceSnapshot(value: unknown): value is PresenceSnapshot {
  return typeof value === "object" && value !== null && "users" in value && Array.isArray(value.users);
}

function upsertLobbyRoom(rooms: RoomListItem[], room: RoomListItem): RoomListItem[] {
  const nextRooms = rooms.filter((candidate) => candidate.code !== room.code);

  nextRooms.push(room);

  return nextRooms;
}

function sortLobbyRooms(rooms: RoomListItem[]): RoomListItem[] {
  return [...rooms].sort((first, second) => second.updatedAt - first.updatedAt || first.code.localeCompare(second.code));
}

// 启动快照读取器：只在浏览器里读 storage / URL，而且只读一次（之后由 React 状态接管）。
// 对应的服务端快照固定为默认值，保证 hydration 前后的首屏 DOM 完全一致。
let bootAccountStatusCache: FriendRoomController["accountStatus"] | null = null;

function readBootAccountStatus(): FriendRoomController["accountStatus"] {
  bootAccountStatusCache ??= readAccountToken() ? "loading" : "guest";
  return bootAccountStatusCache;
}

function getServerAccountStatus(): "guest" {
  return "guest";
}

let bootPlayerNameCache: string | null = null;

function readBootPlayerName(): string {
  bootPlayerNameCache ??= getInitialPlayerName();
  return bootPlayerNameCache;
}

function getServerPlayerName(): string {
  return DEFAULT_PLAYER_NAME;
}

let bootJoinTargetCache: string | null = null;

function readBootJoinTarget(): string {
  bootJoinTargetCache ??= getInitialJoinTarget();
  return bootJoinTargetCache;
}

function getServerJoinTarget(): string {
  return "";
}

let bootIsJoiningRoomCache: boolean | null = null;

function readBootIsJoiningRoom(): boolean {
  bootIsJoiningRoomCache ??= Boolean(getRoomCodeFromCurrentUrl());
  return bootIsJoiningRoomCache;
}

function getServerIsJoiningRoom(): boolean {
  return false;
}

function getInitialPlayerName(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYER_NAME;
  }

  const storedPlayerName = readRoomSession()?.playerName ?? window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);

  if (storedPlayerName && !isLegacyDefaultPlayerName(storedPlayerName)) {
    return storedPlayerName;
  }

  const playerName = createGuestPlayerName();
  persistPlayerName(playerName);

  return playerName;
}

function getInitialJoinTarget(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const roomFromUrl = new URLSearchParams(window.location.search).get("room");

  return normalizeRoomCode(roomFromUrl ?? readRoomSession()?.roomCode ?? "");
}

// 多标签页访客隔离说明：
// 访客 playerId 存储于 sessionStorage，确保同一浏览器打开多个标签页时，
// 各自拥有独立的游客身份与连接会话，避免本地多开测试或单人多开对弈时身份互相覆盖。
// 若当前标签页拥有活跃房间对局会话（readRoomSession），则优先继承对应房间对局者的 playerId。
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

function persistAccountToken(accountToken: string) {
  window.localStorage.setItem(ACCOUNT_TOKEN_STORAGE_KEY, accountToken);
}

function readAccountToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCOUNT_TOKEN_STORAGE_KEY);
}

function clearAccountToken() {
  window.localStorage.removeItem(ACCOUNT_TOKEN_STORAGE_KEY);
}

function persistGuestToken(guestToken: string) {
  window.sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
}

function readGuestToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ?? readRoomSession()?.guestToken ?? null;
}

function clearGuestToken() {
  window.sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
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
  return `${DEFAULT_PLAYER_NAME} ${createRandomNumber(1000, 9999)}`;
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

function formatConnectionError(error: unknown, messages?: UseFriendRoomOptions["messages"]): string {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.toLocaleLowerCase().includes("xhr poll")) {
    return messages?.connectionFailedXhr ?? DEFAULT_CONNECTION_XHR_ERROR;
  }

  return (messages?.connectionFailed ?? DEFAULT_CONNECTION_FAILED_ERROR).replace("{message}", message || "unknown error");
}
