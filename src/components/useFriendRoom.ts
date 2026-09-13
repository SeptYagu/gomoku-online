"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "@/game/types";
import type { AccountSession } from "@/server/accounts";
import type {
  LeaderboardIdentity,
  LeaderboardScope,
  LeaderboardSnapshot,
  PlayerProfileSnapshot,
  RoomGameRecordSnapshot
} from "@/server/game-records";
import type {
  RoomClientState
} from "@/server/room-contract";
import type {
  LobbyActivitySummary,
  PublicChatMessage,
  RoomListItem,
  RoomVisibility,
  UserPresenceSnapshot
} from "@/server/rooms";
import { isAccountIdentityReady } from "./account-identity";
import {
  clearAccountToken,
  clearGuestToken,
  clearRoomSession,
  copyTextWithFallback,
  createAndPersistPlayerId,
  getInitialJoinTarget,
  getInitialPlayerName,
  getRoomUrl,
  normalizePlayerName,
  persistAccountToken,
  persistPlayerName,
  readAccountToken,
  syncRoomUrl,
  useBootSnapshot,
  type UseFriendRoomOptions
} from "./hooks/room-state-utils";
import { useRoomSocket } from "./hooks/useRoomSocket";
import { useLobbyPresence } from "./hooks/useLobbyPresence";
import { useRoomChat } from "./hooks/useRoomChat";
import { useRoomGame } from "./hooks/useRoomGame";
import { COPY_FEEDBACK_DURATION_MS, DEFAULT_PLAYER_NAME } from "@/lib/constants";

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

export function useFriendRoom({ enabled = true, messages }: UseFriendRoomOptions = {}): FriendRoomController {
  // ─── 账户与身份域状态 ───
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [accountStatusOverride, setAccountStatus] = useState<FriendRoomController["accountStatus"] | null>(null);
  const [playerNameOverride, setPlayerNameState] = useState<string | null>(null);
  const [joinTargetOverride, setJoinTargetState] = useState<string | null>(null);
  const [registrationHandle, setRegistrationHandleState] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);

  // 消除 R6 缺陷：使用实例级 useRef 缓存客户端快照，消除模块级变量污染
  const bootAccountStatus = useBootSnapshot(
    () => (readAccountToken() ? "loading" : "guest"),
    "guest"
  );
  const bootPlayerName = useBootSnapshot(getInitialPlayerName, DEFAULT_PLAYER_NAME);
  const bootJoinTarget = useBootSnapshot(getInitialJoinTarget, "");

  const accountStatus = accountStatusOverride ?? bootAccountStatus;
  const playerName = playerNameOverride ?? bootPlayerName;
  const joinTarget = joinTargetOverride ?? bootJoinTarget;
  const identityReady = isAccountIdentityReady(accountStatus);

  const lobbyPresenceRef = useRef<ReturnType<typeof useLobbyPresence> | null>(null);
  const roomChatRef = useRef<ReturnType<typeof useRoomChat> | null>(null);

  const roomSocket = useRoomSocket({
    enabled,
    messages,
    account,
    identityReady,
    playerName,
    setPlayerNameState,
    setJoinTargetState,
    onRoomCleared: (roomCode: string, isCurrentRoom: boolean) => {
      lobbyPresenceRef.current?.resetLobbyOnRoomClosed(roomCode);
      if (isCurrentRoom) {
        roomChatRef.current?.resetChatOnRoomClosed();
      }
    },
    canCreate: () => lobbyPresenceRef.current?.canCreateRoom ?? (enabled && identityReady && !roomSocket.room)
  });

  const lobbyPresence = useLobbyPresence({
    enabled,
    room: roomSocket.room,
    isCreatingRoom: roomSocket.isCreatingRoom,
    identityReady,
    ensureSocket: roomSocket.ensureSocket,
    getActivePlayer: roomSocket.getActivePlayer,
    applyRoomAck: roomSocket.applyRoomAck,
    setPlayerNameState,
    setError: roomSocket.setError,
    setRoom: roomSocket.setRoom,
    setIsJoiningRoom: roomSocket.setIsJoiningRoom,
    onMatchCancelled: () => {
      roomChatRef.current?.resetChatOnRoomClosed();
    }
  });

  const roomChat = useRoomChat({
    room: roomSocket.room,
    identityReady,
    messages,
    ensureSocket: roomSocket.ensureSocket,
    getActivePlayer: roomSocket.getActivePlayer,
    applyRoomAck: roomSocket.applyRoomAck,
    setError: roomSocket.setError,
    setPlayerNameState
  });

  const roomGame = useRoomGame({
    enabled,
    room: roomSocket.room,
    ensureSocket: roomSocket.ensureSocket,
    applyRoomAck: roomSocket.applyRoomAck
  });

  // 通过 effect 同步更新 Socket 事件分发器与 ref 委派，杜绝 render 阶段访问 ref
  useEffect(() => {
    lobbyPresenceRef.current = lobbyPresence;
    roomChatRef.current = roomChat;
    roomSocket.updateEventHandlers({
      onLobbyActivity: lobbyPresence.handleLobbyActivity,
      onLobbyRoomUpdated: lobbyPresence.handleLobbyRoomUpdated,
      onLobbyRoomDeleted: lobbyPresence.handleLobbyRoomDeleted,
      onPresenceUsers: lobbyPresence.handlePresenceUsers,
      onPublicChatMessages: roomChat.handlePublicChatMessages
    });
  });

  // ─── 账户与会话方法 ───
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
        roomSocket.setError(null);
      })
      .catch((accountError: unknown) => {
        setAccountStatus("error");
        roomSocket.setError(accountError instanceof Error ? accountError.message : "Account request failed.");
      });
  }, [playerName, registrationHandle, roomSocket]);

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

  // 邀请链接复制
  const inviteUrl = useMemo(() => {
    if (!roomSocket.room || typeof window === "undefined") {
      return "";
    }

    return getRoomUrl(roomSocket.room.snapshot.code);
  }, [roomSocket.room]);

  const copyInvite = useCallback(() => {
    if (!roomSocket.room || typeof window === "undefined") {
      return;
    }

    const currentInviteUrl = syncRoomUrl(roomSocket.room.snapshot.code);

    if (!navigator.clipboard) {
      if (copyTextWithFallback(currentInviteUrl)) {
        setCopiedInvite(true);
        roomSocket.setError(null);
        return;
      }

      roomSocket.setError(`Copy this link: ${currentInviteUrl}`);
      return;
    }

    void navigator.clipboard
      .writeText(currentInviteUrl)
      .then(() => {
        setCopiedInvite(true);
        roomSocket.setError(null);
      })
      .catch(() => roomSocket.setError(`Copy this link: ${currentInviteUrl}`));
  }, [roomSocket]);

  useEffect(() => {
    if (!copiedInvite) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedInvite(false), COPY_FEEDBACK_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [copiedInvite]);

  // 挂载时校验 account token
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

  const joinRoom = useCallback(() => {
    roomSocket.joinRoomByTarget(joinTarget);
  }, [joinTarget, roomSocket]);

  // ─── 79 个字段无缝装配导出 ───
  return {
    account,
    accountStatus,
    canCancelMatch: lobbyPresence.canCancelMatch,
    canCreateRoom: lobbyPresence.canCreateRoom,
    canFindMatch: lobbyPresence.canFindMatch,
    canJoinRoom: lobbyPresence.canJoinRoom,
    canPlay: roomGame.canPlay,
    canReady: roomGame.canReady,
    canRematch: roomGame.canRematch,
    canResign: roomGame.canResign,
    canSit: roomGame.canSit,
    canUndo: roomGame.canUndo,
    chatText: roomChat.chatText,
    connectionStatus: roomSocket.connectionStatus,
    isSendingChat: roomChat.isSendingChat,
    isSendingPublicChat: roomChat.isSendingPublicChat,
    cancelMatch: lobbyPresence.cancelMatch,
    copyInvite,
    copiedInvite,
    createRoom: roomSocket.createRoom,
    error: roomSocket.error,
    inviteUrl,
    isJoiningRoom: roomSocket.isJoiningRoom,
    joinTarget,
    joinListedRoom: roomSocket.joinListedRoom,
    joinRoom,
    leaveRoom: roomSocket.leaveRoom,
    leaderboard: lobbyPresence.leaderboard,
    leaderboardIdentity: lobbyPresence.leaderboardIdentity,
    leaderboardOffset: lobbyPresence.leaderboardOffset,
    leaderboardSearch: lobbyPresence.leaderboardSearch,
    leaderboardScope: lobbyPresence.leaderboardScope,
    leaderboardStatus: lobbyPresence.leaderboardStatus,
    lobbyActivity: lobbyPresence.lobbyActivity,
    lobbyRooms: lobbyPresence.lobbyRooms,
    lobbyStatus: lobbyPresence.lobbyStatus,
    matchmakingStatus: lobbyPresence.matchmakingStatus,
    playerName,
    playMove: roomGame.playMove,
    presenceStatus: lobbyPresence.presenceStatus,
    presenceUsers: lobbyPresence.presenceUsers,
    profile: lobbyPresence.profile,
    profileStatus: lobbyPresence.profileStatus,
    previousGameRecord: lobbyPresence.previousGameRecord,
    previousGameRecordStatus: lobbyPresence.previousGameRecordStatus,
    publicChatMessages: roomChat.publicChatMessages,
    publicChatStatus: roomChat.publicChatStatus,
    publicChatText: roomChat.publicChatText,
    registrationHandle,
    rematchReady: roomGame.rematchReady,
    ready: roomGame.ready,
    nextLeaderboardPage: lobbyPresence.nextLeaderboardPage,
    previousLeaderboardPage: lobbyPresence.previousLeaderboardPage,
    registerAccount,
    refreshPresence: lobbyPresence.refreshPresence,
    refreshLeaderboard: lobbyPresence.refreshLeaderboard,
    refreshProfile: lobbyPresence.refreshProfile,
    refreshPublicChat: roomChat.refreshPublicChat,
    refreshLobby: lobbyPresence.refreshLobby,
    resignGame: roomGame.resignGame,
    respondUndoRequest: roomGame.respondUndoRequest,
    setRematchReady: roomGame.setRematchReady,
    room: roomSocket.room,
    sendPublicChatMessage: roomChat.sendPublicChatMessage,
    sendChatMessage: roomChat.sendChatMessage,
    signOutAccount,
    setChatText: roomChat.setChatText,
    setJoinTarget,
    setLeaderboardIdentity: lobbyPresence.setLeaderboardIdentity,
    setLeaderboardSearch: lobbyPresence.setLeaderboardSearch,
    setLeaderboardScope: lobbyPresence.setLeaderboardScope,
    setPlayerName,
    setPublicChatText: roomChat.setPublicChatText,
    setRegistrationHandle,
    findMatch: lobbyPresence.findMatch,
    sitRoom: roomGame.sitRoom,
    submitLeaderboardSearch: lobbyPresence.submitLeaderboardSearch,
    toggleReady: roomGame.toggleReady,
    undoMove: roomGame.undoMove
  };
}
