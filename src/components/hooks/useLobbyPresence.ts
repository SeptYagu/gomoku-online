"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  RoomAck,
  RoomClientState,
  RoomGameRecordAck,
  RoomListAck
} from "@/server/room-contract";
import type {
  LobbyActivitySummary,
  RoomListItem,
  UserPresenceSnapshot
} from "@/server/rooms";
import { PAGINATION } from "@/lib/constants";
import {
  clearGuestToken,
  clearRoomSession,
  clearRoomUrl,
  createAndPersistPlayerId,
  isAbortError,
  isEphemeralSession,
  isLobbyActivitySummary,
  isLobbyRoomDeletedEvent,
  isLobbyRoomUpdatedEvent,
  isPresenceSnapshot,
  persistGuestToken,
  persistPlayerName,
  sortLobbyRooms,
  upsertLobbyRoom,
  type PlayerAuthPayload,
  type RoomSocket
} from "./room-state-utils";

const LEADERBOARD_PAGE_SIZE = PAGINATION.LEADERBOARD;

export type UseLobbyPresenceProps = {
  enabled: boolean;
  room: RoomClientState | null;
  isCreatingRoom: boolean;
  identityReady: boolean;
  ensureSocket: () => RoomSocket;
  getActivePlayer: () => PlayerAuthPayload;
  applyRoomAck: (response: RoomAck) => void;
  setPlayerNameState: (name: string) => void;
  setError: (error: string | null) => void;
  setRoom: (updater: (current: RoomClientState | null) => RoomClientState | null) => void;
  setIsJoiningRoom: (joining: boolean) => void;
  onMatchCancelled?: () => void;
};

export function useLobbyPresence({
  enabled,
  room,
  isCreatingRoom,
  identityReady,
  ensureSocket,
  getActivePlayer,
  applyRoomAck,
  setPlayerNameState,
  setError,
  setRoom,
  setIsJoiningRoom,
  onMatchCancelled
}: UseLobbyPresenceProps) {
  const leaderboardAbortControllerRef = useRef<AbortController | null>(null);
  const leaderboardRequestSeqRef = useRef(0);
  const submittedGameRecordsRef = useRef<Set<string>>(new Set());
  const previousGameRecordRequestRef = useRef<string | null>(null);

  const [lobbyActivity, setLobbyActivity] = useState<LobbyActivitySummary | null>(null);
  const [lobbyRooms, setLobbyRooms] = useState<RoomListItem[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [presenceUsers, setPresenceUsers] = useState<UserPresenceSnapshot[]>([]);
  const [presenceStatus, setPresenceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [leaderboard, setLeaderboard] = useState<LeaderboardSnapshot | null>(null);
  const [leaderboardIdentity, setLeaderboardIdentityState] = useState<LeaderboardIdentity>("registered");
  const [leaderboardOffset, setLeaderboardOffset] = useState(0);
  const [leaderboardSearch, setLeaderboardSearchState] = useState("");
  const [leaderboardAppliedSearch, setLeaderboardAppliedSearch] = useState("");
  const [leaderboardScope, setLeaderboardScopeState] = useState<LeaderboardScope>("overall");
  const [leaderboardStatus, setLeaderboardStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [profile, setProfile] = useState<PlayerProfileSnapshot | null>(null);
  const [profileStatus, setProfileStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [previousGameRecord, setPreviousGameRecord] = useState<RoomGameRecordSnapshot | null>(null);
  const [previousGameRecordStatus, setPreviousGameRecordStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [matchmakingStatus, setMatchmakingStatus] = useState<"idle" | "searching">("idle");

  const isPlayer = room?.role === "player" && room.seat !== null;
  const canCreateRoom = enabled && identityReady && !room && !isCreatingRoom && matchmakingStatus !== "searching";
  const canFindMatch = enabled && identityReady && !room && matchmakingStatus !== "searching";
  const canJoinRoom = enabled && identityReady && !room && matchmakingStatus !== "searching";
  const canCancelMatch =
    enabled &&
    matchmakingStatus !== "searching" &&
    isPlayer &&
    room?.snapshot.status === "waiting" &&
    room.snapshot.players.length === 1;

  // Socket 事件响应函数
  const handleLobbyActivity = useCallback((summary: unknown) => {
    if (isLobbyActivitySummary(summary)) {
      setLobbyActivity((prev) => {
        if (!prev || summary.version >= prev.version) {
          return summary;
        }
        return prev;
      });
    }
  }, []);

  const handleLobbyRoomUpdated = useCallback((event: unknown) => {
    if (isLobbyRoomUpdatedEvent(event)) {
      setLobbyRooms((currentRooms) => sortLobbyRooms(upsertLobbyRoom(currentRooms, event.room)));
      setLobbyStatus("ready");
    }
  }, []);

  const handleLobbyRoomDeleted = useCallback((event: unknown) => {
    if (isLobbyRoomDeletedEvent(event)) {
      setLobbyRooms((currentRooms) => currentRooms.filter((candidate) => candidate.code !== event.code));
      setLobbyStatus("ready");
    }
  }, []);

  const handlePresenceUsers = useCallback((snapshot: unknown) => {
    if (isPresenceSnapshot(snapshot)) {
      setPresenceUsers(snapshot.users);
      setPresenceStatus("ready");
    }
  }, []);

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
  }, [ensureSocket, setError]);

  const refreshPresence = useCallback(() => {
    if (!identityReady) {
      return;
    }

    let player = getActivePlayer();

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
          if (!player.accountToken && response.error.code === "guest-session-invalid") {
            clearGuestToken();
            setError(null);
            player = {
              playerId: createAndPersistPlayerId(),
              playerName: player.playerName,
              resetGuestIdentity: true
            };
            setPlayerNameState(player.playerName);
            ensureSocket().emit(
              "presence:join",
              {
                ...player,
                limit: PAGINATION.PRESENCE_USERS
              },
              (retryResponse: PresenceAck) => {
                if (!retryResponse.ok) {
                  setPresenceStatus("error");
                  setError(retryResponse.error.message);
                  return;
                }
                if (retryResponse.value.guestToken) {
                  persistGuestToken(retryResponse.value.guestToken, {
                    ephemeralOnly: isEphemeralSession()
                  });
                }
                setPresenceUsers(retryResponse.value.users);
                setPresenceStatus("ready");
              }
            );
            return;
          }

          setPresenceStatus("error");
          setError(response.error.message);
          return;
        }

        if (response.value.guestToken) {
          persistGuestToken(response.value.guestToken, {
            ephemeralOnly: isEphemeralSession()
          });
        }
        setPresenceUsers(response.value.users);
        setPresenceStatus("ready");
      }
    );
  }, [ensureSocket, getActivePlayer, identityReady, setError, setPlayerNameState]);

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
  }, [leaderboardAppliedSearch, leaderboardIdentity, leaderboardOffset, leaderboardScope, setError]);

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
  }, [getActivePlayer, identityReady, setError]);

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

  const findMatch = useCallback(() => {
    if (!canFindMatch) {
      return;
    }

    const socket = ensureSocket();
    let player = getActivePlayer();

    setMatchmakingStatus("searching");
    setPlayerNameState(player.playerName);
    persistPlayerName(player.playerName);
    socket.emit("matchmaking:find", player, (response: RoomAck) => {
      if (
        !response.ok &&
        !player.accountToken &&
        response.error.code === "guest-session-invalid"
      ) {
        clearGuestToken();
        setError(null);
        player = {
          playerId: createAndPersistPlayerId(),
          playerName: player.playerName,
          resetGuestIdentity: true
        };
        setPlayerNameState(player.playerName);
        socket.emit("matchmaking:find", player, (retryResponse: RoomAck) => {
          setMatchmakingStatus("idle");
          applyRoomAck(retryResponse);
        });
        return;
      }

      setMatchmakingStatus("idle");
      applyRoomAck(response);
    });
  }, [applyRoomAck, canFindMatch, ensureSocket, getActivePlayer, setError, setPlayerNameState]);

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
      setRoom(() => null);
      setError(null);
      onMatchCancelled?.();
    });
  }, [ensureSocket, onMatchCancelled, room, setError, setIsJoiningRoom, setRoom]);

  // 上一局对局记录自动获取
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

  // 对局结束自动提交记录
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
  }, [ensureSocket, refreshProfile, room, setError]);

  // 组件卸载时中断在途请求
  useEffect(() => {
    return () => {
      leaderboardAbortControllerRef.current?.abort();
      leaderboardAbortControllerRef.current = null;
    };
  }, []);

  // 当外部关闭房间时重置大厅与匹配状态
  const resetLobbyOnRoomClosed = useCallback((roomCode: string) => {
    setLobbyRooms((currentRooms) => currentRooms.filter((candidate) => candidate.code !== roomCode));
    setLobbyStatus("ready");
    setMatchmakingStatus("idle");
  }, []);

  return {
    lobbyActivity,
    lobbyRooms,
    lobbyStatus,
    presenceStatus,
    presenceUsers,
    leaderboard,
    leaderboardIdentity,
    leaderboardOffset,
    leaderboardSearch,
    leaderboardScope,
    leaderboardStatus,
    profile,
    profileStatus,
    previousGameRecord,
    previousGameRecordStatus,
    matchmakingStatus,
    refreshPresence,
    refreshLeaderboard,
    refreshProfile,
    refreshLobby,
    nextLeaderboardPage,
    previousLeaderboardPage,
    setLeaderboardIdentity,
    setLeaderboardSearch,
    setLeaderboardScope,
    submitLeaderboardSearch,
    findMatch,
    cancelMatch,
    canCreateRoom,
    canFindMatch,
    canJoinRoom,
    canCancelMatch,
    handleLobbyActivity,
    handleLobbyRoomUpdated,
    handleLobbyRoomDeleted,
    handlePresenceUsers,
    resetLobbyOnRoomClosed
  };
}
