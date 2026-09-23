"use client";

import type { Stone } from "@/game/types";
import type {
  LobbyActivitySummary,
  LobbyRoomDeletedEvent,
  LobbyRoomUpdatedEvent,
  PresenceSnapshot,
  PublicChatSnapshot,
  RoomListItem,
  RoomSnapshot
} from "@/server/rooms";
import { clearRoomUrlFromHref, getRoomUrlFromHref } from "../room-url";
import { DEFAULT_PLAYER_NAME } from "@/lib/constants";

export type RoomSocket = {
  disconnect: () => void;
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type StoredRoomSession = {
  accountToken?: string;
  guestToken?: string;
  playerId: string;
  playerName: string;
  roomCode: string;
};

export type PlayerAuthPayload = {
  accountToken?: string;
  guestToken?: string;
  playerId: string;
  playerName: string;
  resetGuestIdentity?: boolean;
};

export type StorageOptions = {
  ephemeralOnly?: boolean;
};

export type UseFriendRoomOptions = {
  enabled?: boolean;
  messages?: Partial<{
    chatSendTimeout: string;
    /** `{message}` is replaced with the underlying transport error. */
    connectionFailed: string;
    connectionFailedXhr: string;
    joinTargetRequired: string;
    leaveRoomTimeout: string;
    guestSessionError: string;
    nameReservedError: string;
    roomCodeRequired: string;
    roomError: string;
  }>;
};

export const PLAYER_ID_STORAGE_KEY = "gomoku-room-player-id";
export const PLAYER_NAME_STORAGE_KEY = "gomoku-room-player-name";
export const ROOM_SESSION_STORAGE_KEY = "gomoku-room-session";
export const ACCOUNT_TOKEN_STORAGE_KEY = "gomoku-account-token";
export const GUEST_TOKEN_STORAGE_KEY = "gomoku-guest-token";
export const EPHEMERAL_SESSION_KEY = "gomoku:ephemeral_session";

export function isEphemeralSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(EPHEMERAL_SESSION_KEY) === "1";
}

export function markEphemeralSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(EPHEMERAL_SESSION_KEY, "1");
}

export function clearEphemeralSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(EPHEMERAL_SESSION_KEY);
}

export function shouldBeEphemeral(options?: StorageOptions): boolean {
  return Boolean(options?.ephemeralOnly || isEphemeralSession());
}

export const DEFAULT_CHAT_SEND_TIMEOUT_ERROR = "Message not sent: no response from the server. Please try again.";
export const DEFAULT_LEAVE_ROOM_TIMEOUT_ERROR = "Leaving the room timed out. Please try again.";
export const DEFAULT_CONNECTION_FAILED_ERROR = "Realtime connection failed: {message}";
// 开发态/无字典回退诊断信息：告知部署运维排查 Socket.IO 反向代理与构建模式（生产多语言文案由 dictionaries.ts 提供）
export const DEFAULT_CONNECTION_XHR_ERROR =
  "Realtime connection failed: xhr poll error. Deploy with npm start after npm run build, and make sure /socket.io is proxied with WebSocket upgrade support.";
export const DEFAULT_JOIN_TARGET_REQUIRED_ERROR = "Enter a room link, code, @handle, or account ID.";
export const DEFAULT_ROOM_CODE_REQUIRED_ERROR = "Enter a room code.";
export const DEFAULT_ROOM_ERROR = "Room error.";

export function getPlayerBySeat(snapshot: RoomSnapshot, seat: Stone | null) {
  if (!seat) {
    return null;
  }

  return snapshot.players.find((player) => player.seat === seat) ?? null;
}

export function hasOpenPlayerSeat(snapshot: RoomSnapshot): boolean {
  if (snapshot.status === "playing" || snapshot.status === "abandoned") {
    return false;
  }

  return snapshot.players.length < 2 || (snapshot.status === "finished" && snapshot.players.some((player) => !player.connected));
}

export function isRoomErrorLike(value: unknown): value is { message: string } {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string";
}

export function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === "AbortError";
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return typeof value === "object" && value !== null && "code" in value && "board" in value && "players" in value;
}

export function isLobbyActivitySummary(value: unknown): value is LobbyActivitySummary {
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

export function isLobbyRoomUpdatedEvent(value: unknown): value is LobbyRoomUpdatedEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "room" in value &&
    typeof value.room === "object" &&
    value.room !== null &&
    "code" in value.room
  );
}

export function isLobbyRoomDeletedEvent(value: unknown): value is LobbyRoomDeletedEvent {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}

export function isPublicChatSnapshot(value: unknown): value is PublicChatSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "messages" in value &&
    Array.isArray(value.messages)
  );
}

export function isPresenceSnapshot(value: unknown): value is PresenceSnapshot {
  return typeof value === "object" && value !== null && "users" in value && Array.isArray(value.users);
}

export function upsertLobbyRoom(rooms: RoomListItem[], room: RoomListItem): RoomListItem[] {
  const nextRooms = rooms.filter((candidate) => candidate.code !== room.code);

  nextRooms.push(room);

  return nextRooms;
}

export function sortLobbyRooms(rooms: RoomListItem[]): RoomListItem[] {
  return [...rooms].sort((first, second) => second.updatedAt - first.updatedAt || first.code.localeCompare(second.code));
}

export { useBootSnapshot } from "../client-boot-state";

export function getInitialPlayerName(): string {
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

export function getInitialJoinTarget(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const roomFromUrl = new URLSearchParams(window.location.search).get("room");

  return normalizeRoomCode(roomFromUrl ?? readRoomSession()?.roomCode ?? "");
}

// 访客设备长效保留与分身隔离说明：
// 主身份同时落盘 localStorage 与 sessionStorage，只要未清除浏览器数据且未超时即长效保持。
// 当处于分身模式（options.ephemeralOnly 或 isEphemeralSession）时，
// 强行短路仅存取 sessionStorage，严禁触碰或覆写 localStorage 中的主访客身份。
export function getOrCreatePlayerId(options: StorageOptions = {}): string {
  if (typeof window === "undefined") {
    return `player-${Date.now()}`;
  }

  const storedPlayerId =
    window.sessionStorage.getItem(PLAYER_ID_STORAGE_KEY) ??
    window.localStorage.getItem(PLAYER_ID_STORAGE_KEY) ??
    readRoomSession()?.playerId;

  if (storedPlayerId) {
    if (!shouldBeEphemeral(options)) {
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    }
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, storedPlayerId);
    return storedPlayerId;
  }

  return createAndPersistPlayerId(options);
}

export function createAndPersistPlayerId(options: StorageOptions = {}): string {
  const playerId = globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
    if (!shouldBeEphemeral(options)) {
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
    }
  }

  return playerId;
}

export function normalizePlayerName(name: string): string {
  return name.trim() || createGuestPlayerName();
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function getRoomUrl(roomCode: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  return getRoomUrlFromHref(url.toString(), roomCode);
}

export function syncRoomUrl(roomCode: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  const nextUrl = getRoomUrl(roomCode);

  if (nextUrl && window.location.href !== nextUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  return window.location.href;
}

export function clearRoomUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = clearRoomUrlFromHref(window.location.href);

  if (window.location.href !== nextUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
}

export function getRoomCodeFromCurrentUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return normalizeRoomCode(new URLSearchParams(window.location.search).get("room") ?? "");
}

export function copyTextWithFallback(text: string): boolean {
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

export function persistPlayerName(playerName: string, options: StorageOptions = {}): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
  if (!shouldBeEphemeral(options)) {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
  }
}

export function readPlayerName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.sessionStorage.getItem(PLAYER_NAME_STORAGE_KEY) ??
    window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ??
    null
  );
}

export function persistAccountToken(accountToken: string) {
  window.localStorage.setItem(ACCOUNT_TOKEN_STORAGE_KEY, accountToken);
}

export function readAccountToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCOUNT_TOKEN_STORAGE_KEY);
}

export function clearAccountToken() {
  window.localStorage.removeItem(ACCOUNT_TOKEN_STORAGE_KEY);
}

export function persistGuestToken(guestToken: string, options: StorageOptions = {}): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
  if (!shouldBeEphemeral(options)) {
    window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, guestToken);
  }
}

export function readGuestToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ??
    window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ??
    null
  );
}

export function clearGuestToken(options: StorageOptions = {}): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
  if (!shouldBeEphemeral(options)) {
    window.localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
    const currentSession = readRoomSession();
    if (currentSession?.guestToken) {
      persistRoomSession({ ...currentSession, guestToken: undefined });
    }
  }
}

export function persistRoomSession(session: StoredRoomSession) {
  window.sessionStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readRoomSession(): StoredRoomSession | null {
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

export function clearRoomSession() {
  window.sessionStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
}

export function createGuestPlayerName(): string {
  return `${DEFAULT_PLAYER_NAME} ${createRandomNumber(1000, 9999)}`;
}

export function isLegacyDefaultPlayerName(playerName: string): boolean {
  return /^(Player|玩家|Joueur|Jugador|Игрок|لاعب)$/iu.test(playerName.trim());
}

export function createRandomNumber(min: number, max: number): number {
  const span = max - min + 1;
  const cryptoObject = globalThis.crypto;

  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoObject.getRandomValues(values);

    return min + (values[0] % span);
  }

  return min + Math.floor(Math.random() * span);
}

export function formatConnectionError(error: unknown, messages?: UseFriendRoomOptions["messages"]): string {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message.toLocaleLowerCase().includes("xhr poll")) {
    return messages?.connectionFailedXhr ?? DEFAULT_CONNECTION_XHR_ERROR;
  }

  return (messages?.connectionFailed ?? DEFAULT_CONNECTION_FAILED_ERROR).replace("{message}", message || "unknown error");
}

export interface RoomErrorMessages {
  guestSessionError?: string;
  nameReservedError?: string;
  roomError?: string;
}

export function resolveRoomErrorMessage(
  error: { code?: string; message?: string } | string | unknown,
  messages?: (UseFriendRoomOptions["messages"] & RoomErrorMessages) | null
): string | null {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    if (error === "name-reserved") {
      return messages?.nameReservedError ?? "Name is registered. Please log in.";
    }
    if (error === "guest-session-invalid") {
      return messages?.guestSessionError ?? "Guest session expired. Starting a new session...";
    }
    return error;
  }
  if (typeof error !== "object") {
    return messages?.roomError ?? DEFAULT_ROOM_ERROR;
  }
  const err = error as { code?: string; message?: string };
  if (err.code === "name-reserved") {
    return messages?.nameReservedError ?? err.message ?? "Name is registered. Please log in.";
  }
  if (err.code === "guest-session-invalid") {
    return messages?.guestSessionError ?? err.message ?? "Guest session expired. Starting a new session...";
  }
  return err.message || messages?.roomError || DEFAULT_ROOM_ERROR;
}
