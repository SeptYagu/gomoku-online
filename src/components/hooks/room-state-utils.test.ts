import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearGuestToken,
  createAndPersistPlayerId,
  getOrCreatePlayerId,
  isEphemeralSession,
  markEphemeralSession,
  persistGuestToken,
  persistPlayerName,
  readGuestToken,
  readPlayerName,
  persistRoomSession,
  GUEST_TOKEN_STORAGE_KEY,
  PLAYER_ID_STORAGE_KEY,
  PLAYER_NAME_STORAGE_KEY
} from "./room-state-utils";

class MemoryStorage implements Storage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

describe("room-state-utils client storage & ephemeral tab isolation", () => {
  let mockLocalStorage: MemoryStorage;
  let mockSessionStorage: MemoryStorage;

  beforeEach(() => {
    mockLocalStorage = new MemoryStorage();
    mockSessionStorage = new MemoryStorage();

    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: mockLocalStorage,
        sessionStorage: mockSessionStorage,
        location: { href: "http://localhost:3000", search: "" },
        history: { replaceState: () => {}, state: null }
      },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
  });

  it("persists guest tokens to both localStorage and sessionStorage for primary identities", () => {
    persistGuestToken("tok-primary-123");

    expect(mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("tok-primary-123");
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("tok-primary-123");
    expect(readGuestToken()).toBe("tok-primary-123");
  });

  it("restricts guest tokens to sessionStorage when ephemeralOnly is true", () => {
    mockLocalStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "tok-primary-stable");

    persistGuestToken("tok-avatar-ephemeral", { ephemeralOnly: true });

    expect(mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("tok-avatar-ephemeral");
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("tok-primary-stable");
  });

  it("reads sessionStorage token with priority over localStorage, and removes dead room session fallback", () => {
    // Both storages have tokens: sessionStorage takes precedence
    mockLocalStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "tok-primary");
    mockSessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "tok-avatar");
    expect(readGuestToken()).toBe("tok-avatar");

    // When sessionStorage is empty: falls back to localStorage primary token
    mockSessionStorage.clear();
    expect(readGuestToken()).toBe("tok-primary");

    // When both are empty: does NOT resurrect dead token from readRoomSession
    mockLocalStorage.clear();
    persistRoomSession({
      guestToken: "dead-token-in-session",
      playerId: "p1",
      playerName: "Name",
      roomCode: "ABCD"
    });
    expect(readGuestToken()).toBeNull();
  });

  it("clears guest token from localStorage on normal clear, but only sessionStorage on ephemeral clear", () => {
    mockLocalStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "tok-primary");
    mockSessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "tok-avatar");

    // Ephemeral clear
    clearGuestToken({ ephemeralOnly: true });
    expect(mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBeNull();
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("tok-primary");

    // Primary clear
    clearGuestToken();
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("manages player ID with long-term persistence and ephemeral protection", () => {
    const primaryId = createAndPersistPlayerId();
    expect(mockLocalStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(primaryId);
    expect(mockSessionStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(primaryId);

    // Ephemeral creation
    const avatarId = createAndPersistPlayerId({ ephemeralOnly: true });
    expect(mockSessionStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(avatarId);
    // localStorage remains the primaryId!
    expect(mockLocalStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(primaryId);

    // getOrCreatePlayerId with ephemeral protection does not upgrade avatarId to localStorage
    const retrievedId = getOrCreatePlayerId({ ephemeralOnly: true });
    expect(retrievedId).toBe(avatarId);
    expect(mockLocalStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(primaryId);
  });

  it("seals all localStorage leaks when the tab is marked as an ephemeral session (P2-1 Integration Gate)", () => {
    // 1. Initial baseline: Tab 1 sets up primary persistent guest identity
    const primaryToken = "tok-device-primary-guid";
    const primaryPlayerId = "pid-device-primary-uuid";
    const primaryPlayerName = "Device Owner";

    mockLocalStorage.setItem(GUEST_TOKEN_STORAGE_KEY, primaryToken);
    mockLocalStorage.setItem(PLAYER_ID_STORAGE_KEY, primaryPlayerId);
    mockLocalStorage.setItem(PLAYER_NAME_STORAGE_KEY, primaryPlayerName);

    // 2. Tab 2 opens in same browser: initial sessionStorage is empty, inherits primary from localStorage
    expect(readGuestToken()).toBe(primaryToken);
    expect(getOrCreatePlayerId()).toBe(primaryPlayerId);

    // 3. Tab 2 encounters duplicate-player when joining host's room:
    // Tab 2 marks itself as ephemeral!
    markEphemeralSession();
    expect(isEphemeralSession()).toBe(true);

    clearGuestToken({ ephemeralOnly: true });
    const avatarId = createAndPersistPlayerId({ ephemeralOnly: true });
    const avatarName = "Avatar 9999";
    persistPlayerName(avatarName, { ephemeralOnly: true });

    // 4. Tab 2 receives roomAck containing fresh guest token:
    const avatarToken = "tok-avatar-secondary-guid";
    // Even if caller calls persistGuestToken without passing options, ambient isEphemeralSession() protects localStorage!
    persistGuestToken(avatarToken);

    // And subsequent getOrCreatePlayerId without options:
    const recheckedPlayerId = getOrCreatePlayerId();
    expect(recheckedPlayerId).toBe(avatarId);

    // 5. HARD INTEGRATION ASSERTIONS:
    // localStorage primary credentials MUST be byte-for-byte identical to baseline!
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(primaryToken);
    expect(mockLocalStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(primaryPlayerId);
    expect(mockLocalStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBe(primaryPlayerName);

    // Tab 2's sessionStorage contains its ephemeral avatar credentials:
    expect(mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(avatarToken);
    expect(mockSessionStorage.getItem(PLAYER_ID_STORAGE_KEY)).toBe(avatarId);

    // 6. Simulate Tab 3 (a new tab opened without ephemeral flag):
    // New tab has empty sessionStorage:
    const tab3SessionStorage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: mockLocalStorage,
        sessionStorage: tab3SessionStorage,
        location: { href: "http://localhost:3000", search: "" },
        history: { replaceState: () => {}, state: null }
      },
      writable: true,
      configurable: true
    });

    expect(isEphemeralSession()).toBe(false);
    expect(readGuestToken()).toBe(primaryToken);
    expect(getOrCreatePlayerId()).toBe(primaryPlayerId);
    expect(readPlayerName()).toBe(primaryPlayerName);
  });
});
