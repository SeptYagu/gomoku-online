import type { Point } from "../game/types";
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
  "matchmaking:find": (payload: { playerId: string; playerName: string }, ack: (response: RoomAck) => void) => void;
  "presence:join": (
    payload: { includeOffline?: boolean; limit?: number; playerId: string; playerName: string },
    ack: (response: PresenceAck) => void
  ) => void;
  "presence:leave": (payload: undefined, ack: (response: PresenceAck) => void) => void;
  "presence:list": (payload: PresenceListQuery | undefined, ack: (response: PresenceAck) => void) => void;
  "public-chat:join": (payload: undefined, ack: (response: PublicChatAck) => void) => void;
  "public-chat:leave": (payload: undefined, ack: (response: PublicChatAck) => void) => void;
  "public-chat:send": (
    payload: { playerId: string; playerName: string; text: string },
    ack: (response: PublicChatAck) => void
  ) => void;
  "room:chat-send": (
    payload: { roomCode: string; text: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:create": (payload: { playerId: string; playerName: string }, ack: (response: RoomAck) => void) => void;
  "room:join": (
    payload: { playerId: string; playerName: string; roomCode: string },
    ack: (response: RoomAck) => void
  ) => void;
  "room:leave": (payload: { roomCode: string }, ack: (response: RoomAck) => void) => void;
  "room:ready": (payload: { ready: boolean; roomCode: string }, ack: (response: RoomAck) => void) => void;
  "room:rejoin": (
    payload: { playerId: string; playerName: string; roomCode: string },
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
  playerId?: string;
  presencePlayerId?: string;
  roomCode?: string;
};

export type RoomSocketServer = {
  on: (event: "connection", listener: (socket: RoomSocket) => void) => void;
  to: (roomCode: string) => {
    emit: <Event extends keyof ServerToClientEvents>(
      event: Event,
      ...args: Parameters<ServerToClientEvents[Event]>
    ) => void;
  };
};

type RegisterRoomSocketOptions = {
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
  const lifecycleIntervalMs = options.lifecycleIntervalMs ?? 10_000;

  if (lifecycleIntervalMs !== false) {
    const interval = setInterval(() => broadcastLifecycleSweep(io, roomStore), lifecycleIntervalMs);

    interval.unref?.();
  }

  io.on("connection", (socket) => {
    socket.on("room:create", (payload, ack) => {
      leaveRoomsBeforeEntry(io, socket, roomStore, payload.playerId);
      const response = handleJoinedRoom(socket, roomStore, roomStore.createRoom(payload), payload.playerId);
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("room:join", (payload, ack) => {
      leaveRoomsBeforeEntry(io, socket, roomStore, payload.playerId, payload.roomCode);
      const response = handleJoinedRoom(
        socket,
        roomStore,
        roomStore.joinRoom(payload.roomCode, payload),
        payload.playerId
      );
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("room:rejoin", (payload, ack) => {
      leaveRoomsBeforeEntry(io, socket, roomStore, payload.playerId, payload.roomCode);
      const response = handleJoinedRoom(
        socket,
        roomStore,
        roomStore.reconnectRoom(payload.roomCode, payload),
        payload.playerId
      );
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("matchmaking:find", (payload, ack) => {
      leaveRoomsBeforeEntry(io, socket, roomStore, payload.playerId);
      const response = handleJoinedRoom(socket, roomStore, roomStore.findMatch(payload), payload.playerId);
      acknowledgeAndBroadcast(io, socket, roomStore, response, ack);
    });

    socket.on("matchmaking:cancel", (payload, ack) => {
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentMember(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.leaveRoom(payload.roomCode, playerId)
        ),
        ack
      );
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
      socket.join(PRESENCE_ROOM);
      acknowledgePresence(identifySocketPresence(socket, roomStore, payload), ack);
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
      identifySocketPresence(socket, roomStore, payload);
      acknowledgeAndBroadcastPublicChat(io, socket, roomStore.sendPublicChat(payload), ack);
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
      acknowledgeAndBroadcast(
        io,
        socket,
        roomStore,
        runForCurrentMember(socket, roomStore, payload.roomCode, (playerId) =>
          roomStore.leaveRoom(payload.roomCode, playerId)
        ),
        ack
      );
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

      const result = roomStore.markDisconnected(roomCode, playerId);

      if (result.ok) {
        broadcastRoomSnapshotOrClosure(io, roomStore, roomCode, result.value);
      }

      releaseSocketPresence(socket, roomStore);
      broadcastPresence(io, roomStore);
    });
  });
}

function leaveRoomsBeforeEntry(
  io: RoomSocketServer,
  socket: RoomSocket,
  roomStore: RoomStore,
  nextPlayerId: string,
  nextRoomCode?: string
) {
  const previousRoomCode = socket.data.roomCode;
  const playerIds = new Set([socket.data.playerId, nextPlayerId].filter((playerId): playerId is string => Boolean(playerId)));
  const normalizedNextRoomCode = nextRoomCode?.trim().toUpperCase();

  for (const playerId of playerIds) {
    broadcastRoomCleanup(io, roomStore, roomStore.leaveParticipantRooms(playerId, normalizedNextRoomCode));
  }

  if (previousRoomCode && previousRoomCode !== normalizedNextRoomCode) {
    socket.leave(previousRoomCode);
    socket.data.roomCode = undefined;
  }
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

function broadcastLifecycleSweep(io: RoomSocketServer, roomStore: RoomStore) {
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
  result: RoomResult<RoomSnapshot>,
  playerId: string
): RoomAck {
  if (!result.ok) {
    return result;
  }

  const roomCode = result.value.code;
  const participant = roomStore.getParticipantRole(roomCode, playerId);

  if (!participant) {
    return { ok: false, error: { code: "not-room-member", message: "Player is not in this room." } };
  }

  identifySocketPresence(socket, roomStore, { playerId, playerName: participant.name });
  socket.data.playerId = playerId;
  socket.data.roomCode = roomCode;
  socket.join(roomCode);

  return {
    ok: true,
    value: {
      playerId,
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
  input: { playerId: string; playerName: string }
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
