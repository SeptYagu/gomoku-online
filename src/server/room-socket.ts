import type { Point } from "../game/types";
import { AccountStore, GuestSessionStore, resolvePlayerIdentity } from "./accounts";
import type { GameRecordAck, PresenceAck, PublicChatAck, RoomAck, RoomListAck } from "./room-contract";
import type { GameRecordClientSubmission } from "./game-records";
import {
  RoomStore,
  type LobbyRoomDeletedEvent,
  type LobbyRoomUpdatedEvent,
  type PresenceListQuery,
  type PresenceSnapshot,
  type PublicChatSnapshot,
  type RoomCleanupResult,
  type RoomError,
  type RoomListQuery,
  type RoomListSnapshot,
  type RoomResult,
  type RoomSnapshot
} from "./rooms";

const LOBBY_ROOM = "lobby";
const PRESENCE_ROOM = "presence";
const PUBLIC_CHAT_ROOM = "public-chat";

type PlayerAuthPayload = {
  accountToken?: null | string;
  guestToken?: null | string;
  playerId: string;
  playerName: string;
};

export type ClientToServerEvents = {
  "game:move": (
    payload: { expectedMoveSeq: number; point: Point; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "game:resign": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:restart": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:start": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:undo-request": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "game:undo-respond": (
    payload: { accepted: boolean; requestId: string; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "game-record:submit": (
    payload: Omit<GameRecordClientSubmission, "playerId">,
    ack: (response: GameRecordAck) => void
  ) => void;
  "lobby:join": (payload: RoomListQuery | undefined, ack: (response: RoomListAck) => void) => void;
  "lobby:leave": (payload: undefined, ack: (response: RoomListAck) => void) => void;
  "lobby:list": (payload: RoomListQuery | undefined, ack: (response: RoomListAck) => void) => void;
  "matchmaking:cancel": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "matchmaking:find": (payload: PlayerAuthPayload, ack: (response: RoomAck) => void) => void;
  "presence:join": (
    payload: PlayerAuthPayload & { includeOffline?: boolean; limit?: number },
    ack: (response: PresenceAck) => void
  ) => void;
  "presence:leave": (payload: undefined, ack: (response: PresenceAck) => void) => void;
  "presence:list": (payload: PresenceListQuery | undefined, ack: (response: PresenceAck) => void) => void;
  "public-chat:join": (payload: undefined, ack: (response: PublicChatAck) => void) => void;
  "public-chat:leave": (payload: undefined, ack: (response: PublicChatAck) => void) => void;
  "public-chat:send": (
    payload: PlayerAuthPayload & { text: string },
    ack: (response: PublicChatAck) => void
  ) => void;
  "room:chat-send": (
    payload: { roomCode: string; text: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:create": (payload: PlayerAuthPayload, ack: (response: RoomAck) => void) => void;
  "room:join": (
    payload: PlayerAuthPayload & { roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:leave": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "room:ready": (payload: { ready: boolean; roomCode: string }, ack: (response: RoomAck) => void) => void;
  "room:rejoin": (
    payload: PlayerAuthPayload & { roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:sit": (payload: { roomCode: string; seat?: "black" | "white" }, ack: (response: RoomAck) => void) => void;
};

export type ServerToClientEvents = {
  "lobby:room-deleted": (event: LobbyRoomDeletedEvent) => void;
  "lobby:room-updated": (event: LobbyRoomUpdatedEvent) => void;
  "lobby:rooms": (snapshot: RoomListSnapshot) => void;
  "presence:users": (snapshot: PresenceSnapshot) => void;
  "public-chat:messages": (snapshot: PublicChatSnapshot) => void;
  "room:closed": (event: LobbyRoomDeletedEvent) => void;
  "room:error": (error: RoomError) => void;
  "room:state": (snapshot: RoomSnapshot) => void;
};

type SocketData = {
  guestToken?: string;
  playerId?: string;
  presencePlayerId?: string;
  roomCode?: string;
};

export type RoomSocketServer = {
  on: (event: "connection", listener: (socket: RoomSocket) => void) => void;
  sockets: {
    adapter: {
      rooms: Map<string, Set<string>>;
    };
  };
  to: (roomCode: string) => {
    emit: <Event extends keyof ServerToClientEvents>(
      event: Event,
      ...args: Parameters<ServerToClientEvents[Event]>
    ) => void;
  };
};

type RegisterRoomSocketOptions = {
  accountStore?: AccountStore;
  guestSessionStore?: GuestSessionStore;
  lifecycleIntervalMs?: false | number;
};

type RoomSocket = {
  data: SocketData;
  emit: <Event extends keyof ServerToClientEvents>(
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) => void;
  join: (roomCode: string) => void;
  leave: (roomCode: string) => void;
  on: <Event extends keyof ClientToServerEvents | "disconnect">(
    event: Event,
    listener: Event extends keyof ClientToServerEvents ? ClientToServerEvents[Event] : () => void
  ) => void;
  to: (roomCode: string) => {
    emit: <Event extends keyof ServerToClientEvents>(
      event: Event,
      ...args: Parameters<ServerToClientEvents[Event]>
    ) => void;
  };
};

export function registerRoomSocketHandlers(
  io: RoomSocketServer,
  roomStore = new RoomStore(),
  options: RegisterRoomSocketOptions = {}
) {
  const accountStore = options.accountStore ?? new AccountStore({ filePath: false });
  const guestSessionStore = options.guestSessionStore ?? new GuestSessionStore();
  const lifecycleIntervalMs = options.lifecycleIntervalMs ?? 10_000;
  const connections = new RoomConnectionTracker();

  if (lifecycleIntervalMs !== false) {
    const interval = setInterval(() => broadcastLifecycleSweep(io, roomStore), lifecycleIntervalMs);

    interval.unref?.();
  }

  io.on("connection", (socket) => {
    socket.on("room:create", (payload, ack) => {
      const player = resolveSocketPlayer(socket, payload, accountStore, guestSessionStore);

      if (!player.ok) {
        acknowledgeAndBroadcast(io, socket, roomStore, player, ack);
        return;
      }

      const currentWaitingRoom = getCurrentDisposableWaitingRoom(socket, roomStore, player.value.playerId);

      if (currentWaitingRoom) {
        const response = handleJoinedRoom(socket, roomStore, connections, currentWaitingRoom, player.value);
        acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
        return;
      }

      leaveRoomsBeforeEntry(io, socket, roomStore, connections, player.value);
      const response = handleJoinedRoom(socket, roomStore, connections, roomStore.createRoom(player.value), player.value);
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("room:join", (payload, ack) => {
      const player = resolveSocketPlayer(socket, payload, accountStore, guestSessionStore);

      if (!player.ok) {
        acknowledgeAndBroadcast(io, socket, roomStore, player, ack);
        return;
      }

      leaveRoomsBeforeEntry(io, socket, roomStore, connections, player.value, payload.roomCode);
      const response = handleJoinedRoom(
        socket,
        roomStore,
        connections,
        roomStore.joinRoom(payload.roomCode, player.value),
        player.value
      );
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("room:rejoin", (payload, ack) => {
      const player = resolveSocketPlayer(socket, payload, accountStore, guestSessionStore, false);

      if (!player.ok) {
        acknowledgeAndBroadcast(io, socket, roomStore, player, ack);
        return;
      }

      leaveRoomsBeforeEntry(io, socket, roomStore, connections, player.value, payload.roomCode);
      const response = handleJoinedRoom(
        socket,
        roomStore,
        connections,
        roomStore.reconnectRoom(payload.roomCode, player.value),
        player.value
      );
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("matchmaking:find", (payload, ack) => {
      const player = resolveSocketPlayer(socket, payload, accountStore, guestSessionStore);

      if (!player.ok) {
        acknowledgeAndBroadcast(io, socket, roomStore, player, ack);
        return;
      }

      leaveRoomsBeforeEntry(io, socket, roomStore, connections, player.value);
      const response = handleJoinedRoom(socket, roomStore, connections, roomStore.findMatch(player.value), player.value);
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("matchmaking:cancel", (payload, ack) => {
      const playerId = socket.data.playerId;
      const roomCode = payload.roomCode.trim().toUpperCase();
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentMember(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.leaveRoom(payload.roomCode, playerId)
        ),
        ack
      );
      if (playerId) {
        connections.clearParticipant(roomCode, playerId);
      }
      socket.leave(payload.roomCode.trim().toUpperCase());
      socket.data.roomCode = undefined;
    });

    socket.on("lobby:join", (payload, ack) => {
      socket.join(LOBBY_ROOM);
      acknowledgeLobbyList(roomStore, payload, ack);
    });

    socket.on("lobby:list", (payload, ack) => {
      acknowledgeLobbyList(roomStore, payload, ack);
    });

    socket.on("lobby:leave", (_payload, ack) => {
      socket.leave(LOBBY_ROOM);
      acknowledgeLobbyList(roomStore, undefined, ack);
    });

    socket.on("presence:join", (payload, ack) => {
      const player = resolveSocketPlayer(socket, payload, accountStore, guestSessionStore);

      if (!player.ok) {
        acknowledgePresence(player, ack);
        socket.emit("room:error", player.error);
        return;
      }

      socket.join(PRESENCE_ROOM);
      acknowledgePresence(identifySocketPresence(socket, roomStore, player.value), ack);
      broadcastPresence(io, roomStore);
    });

    socket.on("presence:list", (payload, ack) => {
      acknowledgePresenceList(roomStore, payload, ack);
    });

    socket.on("presence:leave", (_payload, ack) => {
      socket.leave(PRESENCE_ROOM);
      acknowledgePresenceList(roomStore, undefined, ack);
    });

    socket.on("public-chat:join", (_payload, ack) => {
      socket.join(PUBLIC_CHAT_ROOM);
      acknowledgePublicChatList(roomStore, ack);
    });

    socket.on("public-chat:leave", (_payload, ack) => {
      socket.leave(PUBLIC_CHAT_ROOM);
      acknowledgePublicChatList(roomStore, ack);
    });

    socket.on("public-chat:send", (payload, ack) => {
      const player = resolveSocketPlayer(socket, payload, accountStore, guestSessionStore);

      if (!player.ok) {
        acknowledgeAndBroadcastPublicChat(io, socket, player, ack);
        return;
      }

      identifySocketPresence(socket, roomStore, player.value);
      acknowledgeAndBroadcastPublicChat(io, socket, roomStore.sendPublicChat({ ...player.value, text: payload.text }), ack);
      broadcastPresence(io, roomStore);
    });

    socket.on("room:ready", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.setPlayerReady(payload.roomCode, playerId, payload.ready)
        ),
        ack
      );
    });

    socket.on("game:start", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.startGame(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game:move", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.applyMove(payload.roomCode, {
            expectedMoveSeq: payload.expectedMoveSeq,
            playerId,
            point: payload.point
          })
        ),
        ack
      );
    });

    socket.on("game:resign", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.resignGame(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game:undo-request", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.requestUndo(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game:undo-respond", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.respondToUndo(payload.roomCode, playerId, payload.requestId, payload.accepted)
        ),
        ack
      );
    });

    socket.on("game:restart", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentPlayer(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.restartGame(payload.roomCode, playerId)
        ),
        ack
      );
    });

    socket.on("game-record:submit", (payload, ack) => {
      const playerId = socket.data.playerId;

      if (!playerId) {
        acknowledgeGameRecord(
          socket,
          {
            ok: false,
            error: {
              code: "not-room-member",
              message: "This socket has not joined a room."
            }
          },
          ack
        );
        return;
      }

      acknowledgeGameRecord(socket, roomStore.submitGameRecord({ ...payload, playerId }), ack);
    });

    socket.on("room:chat-send", (payload, ack) => {
      acknowledgeAndBroadcastRoomOnly(
        socket,
        runForCurrentMember(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.sendRoomChat(payload.roomCode, playerId, payload.text)
        ),
        ack
      );
    });

    socket.on("room:sit", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentMember(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.sitPlayer(payload.roomCode, playerId, payload.seat)
        ),
        ack
      );
    });

    socket.on("room:leave", (payload, ack) => {
      const playerId = socket.data.playerId;
      const roomCode = payload.roomCode.trim().toUpperCase();
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentMember(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.leaveRoom(payload.roomCode, playerId)
        ),
        ack
      );
      if (playerId) {
        connections.clearParticipant(roomCode, playerId);
      }
      socket.leave(payload.roomCode.trim().toUpperCase());
      socket.data.roomCode = undefined;
    });

    socket.on("disconnect", () => {
      const { playerId, roomCode } = socket.data;

      if (!playerId || !roomCode) {
        releaseSocketPresence(socket, roomStore);
        broadcastPresence(io, roomStore);
        return;
      }

      const hasAnotherConnection = connections.unbind(socket);

      if (hasAnotherConnection) {
        releaseSocketPresence(socket, roomStore);
        broadcastPresence(io, roomStore);
        return;
      }

      const result = roomStore.markDisconnected(roomCode, playerId);

      if (result.ok) {
        broadcastRoomSnapshotOrClosure(io, roomStore, roomCode, result.value);
      }

      releaseSocketPresence(socket, roomStore);
      broadcastPresence(io, roomStore);
    });
  });
}

function resolveSocketPlayer(
  socket: RoomSocket,
  payload: PlayerAuthPayload,
  accountStore: AccountStore,
  guestSessionStore: GuestSessionStore,
  allowGuestSessionCreation = true
) {
  const accountToken = payload.accountToken?.trim();
  const guestToken = payload.guestToken?.trim() || socket.data.guestToken;

  if (!accountToken && !guestToken && !allowGuestSessionCreation) {
    return {
      ok: false as const,
      error: {
        code: "guest-session-invalid" as const,
        message: "Guest session is required to reconnect."
      }
    };
  }

  const player = resolvePlayerIdentity(
    {
      ...payload,
      guestToken
    },
    accountStore,
    guestSessionStore
  );

  if (player.ok) {
    socket.data.guestToken = player.value.guestToken;
  }

  return player;
}

class RoomConnectionTracker {
  private readonly bindings = new Map<RoomSocket, { playerId: string; roomCode: string }>();
  private readonly socketsByParticipant = new Map<string, Set<RoomSocket>>();

  bind(socket: RoomSocket, roomCode: string, playerId: string): void {
    this.unbind(socket);
    const key = getParticipantConnectionKey(roomCode, playerId);
    const sockets = this.socketsByParticipant.get(key) ?? new Set<RoomSocket>();

    sockets.add(socket);
    this.socketsByParticipant.set(key, sockets);
    this.bindings.set(socket, { playerId, roomCode });
  }

  unbind(socket: RoomSocket): boolean {
    const binding = this.bindings.get(socket);

    if (!binding) {
      return false;
    }

    const key = getParticipantConnectionKey(binding.roomCode, binding.playerId);
    const sockets = this.socketsByParticipant.get(key);

    sockets?.delete(socket);
    this.bindings.delete(socket);

    if (!sockets || sockets.size === 0) {
      this.socketsByParticipant.delete(key);
      return false;
    }

    return true;
  }

  clearParticipant(roomCode: string, playerId: string): void {
    const key = getParticipantConnectionKey(roomCode, playerId);
    const sockets = this.socketsByParticipant.get(key);

    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      this.bindings.delete(socket);
    }

    this.socketsByParticipant.delete(key);
  }

  clearParticipantOutsideRoom(playerId: string, keepRoomCode?: string): void {
    for (const binding of [...this.bindings.values()]) {
      if (binding.playerId === playerId && binding.roomCode !== keepRoomCode) {
        this.clearParticipant(binding.roomCode, playerId);
      }
    }
  }
}

function getParticipantConnectionKey(roomCode: string, playerId: string): string {
  return `${roomCode.trim().toUpperCase()}\u0000${playerId}`;
}

function leaveRoomsBeforeEntry(
  io: RoomSocketServer,
  socket: RoomSocket,
  roomStore: RoomStore,
  connections: RoomConnectionTracker,
  nextPlayer: { playerId: string; playerName: string },
  nextRoomCode?: string
) {
  const previousRoomCode = socket.data.roomCode;
  const playerIds = new Set([socket.data.playerId, nextPlayer.playerId].filter((playerId): playerId is string => Boolean(playerId)));
  const normalizedNextRoomCode = nextRoomCode?.trim().toUpperCase();

  closeRoomsWithoutSocketMembers(io, roomStore);

  for (const playerId of playerIds) {
    connections.clearParticipantOutsideRoom(playerId, normalizedNextRoomCode);
    broadcastRoomCleanup(io, roomStore, roomStore.leaveParticipantRooms(playerId, normalizedNextRoomCode));
  }

  broadcastRoomCleanup(
    io,
    roomStore,
    roomStore.leaveDisposableWaitingRoomsByParticipantName(nextPlayer.playerName, normalizedNextRoomCode)
  );

  if (previousRoomCode && previousRoomCode !== normalizedNextRoomCode) {
    socket.leave(previousRoomCode);
    socket.data.roomCode = undefined;
  }

  closeRoomsWithoutSocketMembers(io, roomStore);
}

function getCurrentDisposableWaitingRoom(
  socket: RoomSocket,
  roomStore: RoomStore,
  playerId: string
): RoomResult<RoomSnapshot> | null {
  const roomCode = socket.data.roomCode;

  if (!roomCode || socket.data.playerId !== playerId) {
    return null;
  }

  const currentRoom = roomStore.getSnapshot(roomCode);

  if (!currentRoom.ok) {
    return null;
  }

  const snapshot = currentRoom.value;

  if (
    snapshot.status !== "waiting" ||
    snapshot.moves.length > 0 ||
    snapshot.players.length !== 1 ||
    snapshot.players[0]?.connected !== true ||
    snapshot.spectators.length > 0
  ) {
    return null;
  }

  return currentRoom;
}

function broadcastRoomCleanup(io: RoomSocketServer, roomStore: RoomStore, cleanup: RoomCleanupResult) {
  for (const snapshot of cleanup.updatedSnapshots) {
    io.to(snapshot.code).emit("room:state", snapshot);
    broadcastLobbyRoomChange(io, roomStore, snapshot.code);
  }

  for (const code of cleanup.deletedRoomCodes) {
    broadcastRoomClosed(io, roomStore, code);
  }

  if (cleanup.updatedSnapshots.length > 0 || cleanup.deletedRoomCodes.length > 0) {
    broadcastPresence(io, roomStore);
  }
}

function closeRoomsWithoutSocketMembers(io: RoomSocketServer, roomStore: RoomStore) {
  for (const roomCode of roomStore.listRoomCodes()) {
    const socketRoom = io.sockets.adapter.rooms.get(roomCode);

    if (socketRoom && socketRoom.size > 0) {
      continue;
    }

    const snapshot = roomStore.deleteRoom(roomCode);

    if (snapshot) {
      broadcastRoomClosed(io, roomStore, snapshot.code);
    }
  }
}

function broadcastLifecycleSweep(io: RoomSocketServer, roomStore: RoomStore) {
  closeRoomsWithoutSocketMembers(io, roomStore);

  const sweep = roomStore.sweepExpiredRooms();

  for (const snapshot of sweep.updatedSnapshots) {
    io.to(snapshot.code).emit("room:state", snapshot);
    broadcastLobbyRoomChange(io, roomStore, snapshot.code);
  }

  for (const code of sweep.deletedRoomCodes) {
    broadcastRoomClosed(io, roomStore, code);
  }

  if (sweep.updatedSnapshots.length > 0 || sweep.deletedRoomCodes.length > 0) {
    broadcastPresence(io, roomStore);
  }
}

function handleJoinedRoom(
  socket: RoomSocket,
  roomStore: RoomStore,
  connections: RoomConnectionTracker,
  result: RoomResult<RoomSnapshot>,
  player: { guestToken?: string; playerId: string }
): RoomAck {
  if (!result.ok) {
    return result;
  }

  const roomCode = result.value.code;
  const participant = roomStore.getParticipantRole(roomCode, player.playerId);

  if (!participant) {
    return { ok: false, error: { code: "not-room-member", message: "Player is not in this room." } };
  }

  identifySocketPresence(socket, roomStore, {
    identity: participant.identity,
    playerId: player.playerId,
    playerName: participant.name
  });
  socket.data.playerId = player.playerId;
  socket.data.roomCode = roomCode;
  socket.join(roomCode);
  connections.bind(socket, roomCode, player.playerId);

  return {
    ok: true,
    value: {
      guestToken: player.guestToken,
      identity: participant.identity,
      playerId: player.playerId,
      name: participant.name,
      role: participant.role,
      seat: participant.seat,
      snapshot: result.value
    }
  };
}

function runForCurrentPlayer(
  socket: RoomSocket,
  roomStore: RoomStore,
  roomCode: string,
  action: (playerId: string) => RoomResult<RoomSnapshot>
): RoomAck {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const playerId = socket.data.playerId;

  if (!playerId || socket.data.roomCode !== normalizedRoomCode) {
    return {
      ok: false,
      error: {
        code: "not-room-member",
        message: "This socket has not joined the room."
      }
    };
  }

  const result = action(playerId);

  if (!result.ok) {
    return result;
  }

  const participant = roomStore.getParticipantRole(result.value.code, playerId);

  if (!participant) {
    return { ok: false, error: { code: "not-room-member", message: "Player is not in this room." } };
  }

  if (participant.role !== "player" || !participant.seat) {
    return { ok: false, error: { code: "not-room-player", message: "Spectators cannot perform player actions." } };
  }

  return {
    ok: true,
    value: {
      playerId,
      identity: participant.identity,
      name: participant.name,
      role: participant.role,
      seat: participant.seat,
      snapshot: result.value
    }
  };
}

function runForCurrentMember(
  socket: RoomSocket,
  roomStore: RoomStore,
  roomCode: string,
  action: (playerId: string) => RoomResult<RoomSnapshot>
): RoomAck {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const playerId = socket.data.playerId;

  if (!playerId || socket.data.roomCode !== normalizedRoomCode) {
    return {
      ok: false,
      error: {
        code: "not-room-member",
        message: "This socket has not joined the room."
      }
    };
  }

  const result = action(playerId);

  if (!result.ok) {
    return result;
  }

  const participant = roomStore.getParticipantRole(result.value.code, playerId);

  return {
    ok: true,
    value: {
      playerId,
      identity: participant?.identity ?? "guest",
      name: participant?.name ?? "",
      role: participant?.role ?? "spectator",
      seat: participant?.seat ?? null,
      snapshot: result.value
    }
  };
}

function acknowledgeAndBroadcast(
  io: RoomSocketServer,
  socket: RoomSocket,
  roomStore: RoomStore,
  response: RoomAck,
  ack: (response: RoomAck) => void
) {
  ack(response);

  if (!response.ok) {
    socket.emit("room:error", response.error);
    return;
  }

  socket.to(response.value.snapshot.code).emit("room:state", response.value.snapshot);
  broadcastLobbyRoomChange(io, roomStore, response.value.snapshot.code);
  broadcastPresence(io, roomStore);
}

function acknowledgeAndBroadcastRoomOnly(socket: RoomSocket, response: RoomAck, ack: (response: RoomAck) => void) {
  ack(response);

  if (!response.ok) {
    socket.emit("room:error", response.error);
    return;
  }

  socket.to(response.value.snapshot.code).emit("room:state", response.value.snapshot);
}

function acknowledgeGameRecord(socket: RoomSocket, response: GameRecordAck, ack: (response: GameRecordAck) => void) {
  ack(response);

  if (!response.ok) {
    socket.emit("room:error", response.error);
  }
}

function acknowledgeLobbyList(
  roomStore: RoomStore,
  payload: RoomListQuery | undefined,
  ack: (response: RoomListAck) => void
) {
  ack({
    ok: true,
    value: roomStore.listRooms(parseRoomListQuery(payload))
  });
}

function acknowledgePublicChatList(roomStore: RoomStore, ack: (response: PublicChatAck) => void) {
  ack({
    ok: true,
    value: roomStore.listPublicChatMessages()
  });
}

function acknowledgePresence(response: PresenceAck, ack: (response: PresenceAck) => void) {
  ack(response);
}

function acknowledgePresenceList(
  roomStore: RoomStore,
  payload: PresenceListQuery | undefined,
  ack: (response: PresenceAck) => void
) {
  ack({
    ok: true,
    value: roomStore.listPresence(parsePresenceListQuery(payload))
  });
}

function acknowledgeAndBroadcastPublicChat(
  io: RoomSocketServer,
  socket: RoomSocket,
  response: PublicChatAck,
  ack: (response: PublicChatAck) => void
) {
  ack(response);

  if (!response.ok) {
    socket.emit("room:error", response.error);
    return;
  }

  io.to(PUBLIC_CHAT_ROOM).emit("public-chat:messages", response.value);
}

function broadcastLobbyRoomChange(io: RoomSocketServer, roomStore: RoomStore, roomCode: string) {
  const room = roomStore.getRoomListItem(roomCode);
  const version = roomStore.getLobbyVersion();

  if (room && (room.status === "waiting" || room.status === "playing")) {
    io.to(LOBBY_ROOM).emit("lobby:room-updated", {
      room,
      version
    });
    return;
  }

  io.to(LOBBY_ROOM).emit("lobby:room-deleted", {
    code: roomCode,
    version
  });
}

function broadcastRoomSnapshotOrClosure(
  io: RoomSocketServer,
  roomStore: RoomStore,
  roomCode: string,
  snapshot: RoomSnapshot
) {
  if (!roomStore.getRoomListItem(roomCode)) {
    broadcastRoomClosed(io, roomStore, roomCode);
    return;
  }

  io.to(roomCode).emit("room:state", snapshot);
  broadcastLobbyRoomChange(io, roomStore, roomCode);
  broadcastPresence(io, roomStore);
}

function broadcastRoomClosed(io: RoomSocketServer, roomStore: RoomStore, roomCode: string) {
  const event = {
    code: roomCode,
    version: roomStore.getLobbyVersion()
  };

  io.to(roomCode).emit("room:closed", event);
  io.to(LOBBY_ROOM).emit("lobby:room-deleted", event);
  broadcastPresence(io, roomStore);
}

function broadcastPresence(io: RoomSocketServer, roomStore: RoomStore) {
  io.to(PRESENCE_ROOM).emit("presence:users", roomStore.listPresence());
}

function identifySocketPresence(
  socket: RoomSocket,
  roomStore: RoomStore,
  input: { identity?: "guest" | "registered"; playerId: string; playerName: string }
): PresenceAck {
  const nextPlayerId = input.playerId.trim();

  if (!nextPlayerId) {
    return {
      ok: false,
      error: {
        code: "invalid-player",
        message: "Player id and name are required."
      }
    };
  }

  if (socket.data.presencePlayerId === nextPlayerId) {
    return roomStore.updatePresence(input);
  }

  releaseSocketPresence(socket, roomStore);

  const response = roomStore.connectPresence(input);

  if (response.ok) {
    socket.data.presencePlayerId = nextPlayerId;
  }

  return response;
}

function releaseSocketPresence(socket: RoomSocket, roomStore: RoomStore) {
  const previousPlayerId = socket.data.presencePlayerId;

  if (!previousPlayerId) {
    return;
  }

  roomStore.disconnectPresence(previousPlayerId);
  socket.data.presencePlayerId = undefined;
}

function parseRoomListQuery(payload: RoomListQuery | undefined): RoomListQuery {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return {
    limit: typeof payload.limit === "number" ? payload.limit : undefined,
    status:
      payload.status === "waiting" ||
      payload.status === "playing" ||
      payload.status === "finished" ||
      payload.status === "all"
        ? payload.status
        : undefined
  };
}

function parsePresenceListQuery(payload: PresenceListQuery | undefined): PresenceListQuery {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return {
    includeOffline: payload.includeOffline === true,
    limit: typeof payload.limit === "number" ? payload.limit : undefined
  };
}
