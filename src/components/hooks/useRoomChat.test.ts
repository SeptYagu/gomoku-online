import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { CHAT_ACK_TIMEOUT_MS } from "../chat-send-gate";
import {
  GUEST_TOKEN_STORAGE_KEY,
  isEphemeralSession,
  markEphemeralSession,
  type PlayerAuthPayload,
  type RoomSocket
} from "./room-state-utils";
import { useRoomChat, type UseRoomChatProps } from "./useRoomChat";
import type { PublicChatAck } from "@/server/room-contract";

type PublicChatPayload = {
  clientMessageId: string;
  guestToken?: string;
  playerId: string;
  playerName: string;
  resetGuestIdentity?: boolean;
  text: string;
};

let stateSlots: unknown[] = [];
let stateSetters: Array<(v: unknown) => void> = [];
let refSlots: Array<{ current: unknown }> = [];
let statePointer = 0;
let refPointer = 0;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T>(initial: T | (() => T)) => {
      const idx = statePointer++;
      if (stateSlots[idx] === undefined) {
        stateSlots[idx] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      if (!stateSetters[idx]) {
        stateSetters[idx] = (updater: unknown) => {
          stateSlots[idx] = typeof updater === "function" ? (updater as (prev: unknown) => unknown)(stateSlots[idx]) : updater;
        };
      }
      return [stateSlots[idx] as T, stateSetters[idx] as React.Dispatch<React.SetStateAction<T>>];
    },
    useRef: <T>(initial: T) => {
      const idx = refPointer++;
      if (refSlots.length <= idx) {
        refSlots[idx] = { current: initial };
      }
      return refSlots[idx] as React.MutableRefObject<T>;
    },
    useCallback: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
    useEffect: () => {}
  };
});

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

describe("useRoomChat self-healing & watchdog integration guard", () => {
  let mockLocalStorage: MemoryStorage;
  let mockSessionStorage: MemoryStorage;
  let emittedCalls: Array<{
    ack: (response: PublicChatAck) => void;
    event: string;
    payload: PublicChatPayload;
  }>;
  let mockSocket: RoomSocket;
  let mockSetError: (error: string | null) => void;
  let mockGetActivePlayer: () => PlayerAuthPayload;

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

    stateSlots = [];
    stateSetters = [];
    refSlots = [];
    statePointer = 0;
    refPointer = 0;

    emittedCalls = [];
    mockSocket = {
      disconnect: vi.fn(),
      emit: vi.fn((event: string, ...args: unknown[]) => {
        emittedCalls.push({
          event,
          payload: args[0] as PublicChatPayload,
          ack: args[1] as (response: PublicChatAck) => void
        });
      }),
      on: vi.fn()
    };
    mockSetError = vi.fn();
    mockGetActivePlayer = () => ({
      playerId: "player-initial-id",
      playerName: "InitialPlayer",
      guestToken: mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ?? mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY) ?? undefined
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function useTestRoomChat(props: Partial<UseRoomChatProps> = {}) {
    statePointer = 0;
    refPointer = 0;
    return useRoomChat({
      room: null,
      identityReady: true,
      ensureSocket: () => mockSocket,
      getActivePlayer: mockGetActivePlayer,
      applyRoomAck: vi.fn(),
      setError: mockSetError,
      setPlayerNameState: vi.fn(),
      ...props
    });
  }

  it("M-2 Guard: explicitly constructs freshPlayer without guestToken and with resetGuestIdentity upon guest-session-invalid", () => {
    // Tab is ephemeral (e.g. secondary tab)
    markEphemeralSession();
    expect(isEphemeralSession()).toBe(true);

    // Primary token remains in localStorage; secondary token in sessionStorage
    const deadPrimaryToken = "dead-primary-token-12345";
    mockLocalStorage.setItem(GUEST_TOKEN_STORAGE_KEY, deadPrimaryToken);
    mockSessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "secondary-token-67890");

    // Initialize hook with text to send
    stateSlots[4] = "hello from ephemeral tab"; // publicChatText index
    const controller = useTestRoomChat();

    controller.sendPublicChatMessage();

    // 1. Initial send emitted
    expect(emittedCalls).toHaveLength(1);
    expect(emittedCalls[0].event).toBe("public-chat:send");
    expect(emittedCalls[0].payload.text).toBe("hello from ephemeral tab");

    // 2. Server replies with guest-session-invalid
    emittedCalls[0].ack({
      ok: false,
      error: { code: "guest-session-invalid", message: "Guest session is invalid." }
    });

    // 3. Self-healing retry must be emitted
    expect(emittedCalls).toHaveLength(2);
    const retryCall = emittedCalls[1];
    expect(retryCall.event).toBe("public-chat:send");

    // CRITICAL M-2 INVARIANT:
    // Retry payload MUST NOT contain dead token from localStorage, and must flag resetGuestIdentity
    expect(retryCall.payload.guestToken).toBeUndefined();
    expect(retryCall.payload.resetGuestIdentity).toBe(true);
    expect(retryCall.payload.playerId).toEqual(expect.any(String));
    expect(retryCall.payload.playerName).toBe("InitialPlayer");

    // Primary token in localStorage MUST remain pristine and untouched
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(deadPrimaryToken);
  });

  it("M-1 Watchdog Guard: arms gate.begin on self-healing retry and resets isSendingPublicChat upon ack timeout", () => {
    vi.useFakeTimers();

    stateSlots[4] = "important message that should not lock UI";
    const controller = useTestRoomChat();

    controller.sendPublicChatMessage();
    expect(stateSlots[5]).toBe(true); // isSendingPublicChat

    // First send fails with guest-session-invalid
    emittedCalls[0].ack({
      ok: false,
      error: { code: "guest-session-invalid", message: "Guest session is invalid." }
    });

    // Retry was emitted and gate is armed
    expect(emittedCalls).toHaveLength(2);
    expect(stateSlots[5]).toBe(true); // isSendingPublicChat remains true during retry in-flight

    // Simulate dropped retry ACK: advance time past CHAT_ACK_TIMEOUT_MS
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS);

    // CRITICAL M-1 INVARIANT:
    // Watchdog must fire: isSendingPublicChat reset to false, error set, and draft text restored
    expect(stateSlots[5]).toBe(false); // Button unlocked!
    expect(mockSetError).toHaveBeenCalledWith("Message not sent: no response from the server. Please try again.");
    expect(stateSlots[4]).toBe("important message that should not lock UI"); // Draft restored!
  });

  it("P3-4 Retry Write-back Guard: persists fresh guestToken to sessionStorage in ephemeral tab on retry success", () => {
    markEphemeralSession();
    const deadPrimaryToken = "primary-untouched-token";
    mockLocalStorage.setItem(GUEST_TOKEN_STORAGE_KEY, deadPrimaryToken);
    mockSessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "old-avatar-token");

    stateSlots[4] = "retry test message";
    const controller = useTestRoomChat();

    controller.sendPublicChatMessage();

    // First send fails
    emittedCalls[0].ack({
      ok: false,
      error: { code: "guest-session-invalid", message: "Guest session is invalid." }
    });

    expect(emittedCalls).toHaveLength(2);

    // Retry succeeds with newly minted guestToken
    emittedCalls[1].ack({
      ok: true,
      value: {
        generatedAt: Date.now(),
        guestToken: "freshly-minted-avatar-token",
        messages: [{ id: "m1", name: "InitialPlayer", sentAt: Date.now(), text: "retry test message" }]
      }
    });

    // CRITICAL P3-4 INVARIANT (Retry branch):
    // Fresh guestToken must be persisted to sessionStorage only
    expect(mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("freshly-minted-avatar-token");
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(deadPrimaryToken);
    expect(stateSlots[5]).toBe(false); // isSendingPublicChat settled
    expect(mockSetError).not.toHaveBeenCalledWith(expect.stringContaining("invalid"));
  });

  it("P3-4 First-send Write-back Guard: persists returned guestToken to localStorage and sessionStorage in primary tab", () => {
    // Non-ephemeral tab
    expect(isEphemeralSession()).toBe(false);

    stateSlots[4] = "first send message";
    const controller = useTestRoomChat();

    controller.sendPublicChatMessage();
    expect(emittedCalls).toHaveLength(1);

    // Server returns success with minted guestToken on first send
    emittedCalls[0].ack({
      ok: true,
      value: {
        generatedAt: Date.now(),
        guestToken: "initial-minted-primary-token",
        messages: [{ id: "m2", name: "InitialPlayer", sentAt: Date.now(), text: "first send message" }]
      }
    });

    // CRITICAL P3-4 INVARIANT (Initial send branch):
    // Both storages must receive the minted guestToken
    expect(mockLocalStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("initial-minted-primary-token");
    expect(mockSessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe("initial-minted-primary-token");
    expect(stateSlots[5]).toBe(false); // isSendingPublicChat settled
  });
});
