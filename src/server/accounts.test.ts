import { appendFileSync, closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AccountStore, GuestSessionStore, resolvePlayerIdentity } from "./accounts";
import * as jsonlFile from "./jsonl-file";

describe("AccountStore", () => {
  it("creates persistent registered account sessions without storing plaintext tokens", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-accounts-"));
    const filePath = join(tempDir, "accounts.jsonl");

    try {
      const firstStore = new AccountStore({ filePath, now: () => 1_780_000_000_000 });
      const created = expectOk(firstStore.createAccount({ displayName: " Alice   Account " }));

      expect(created).toMatchObject({
        displayName: "Alice Account",
        identity: "registered",
        playerId: expect.stringMatching(/^acct_/),
        publicHandle: "alice_account"
      });
      expect(created.token).toContain(".");
      expect(firstStore.authenticate(created.token)).toMatchObject({
        displayName: "Alice Account",
        playerId: created.playerId
      });
      expect(firstStore.createAccount({ displayName: "alice account" })).toMatchObject({
        ok: false,
        error: { code: "duplicate-name" }
      });

      const persisted = new AccountStore({ filePath });

      expect(persisted.authenticate(created.token)).toMatchObject({
        displayName: "Alice Account",
        playerId: created.playerId,
        publicHandle: created.publicHandle
      });
      expect(readRawFile(filePath)).not.toContain(created.token);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("normalizes, indexes, and rejects invalid or duplicate public handles", () => {
    const store = new AccountStore({ filePath: false });
    const explicit = expectOk(store.createAccount({ displayName: "Alice", publicHandle: " @Alice_Play " }));
    const generated = expectOk(store.createAccount({ displayName: "Alice Play" }));

    expect(explicit.publicHandle).toBe("alice_play");
    expect(generated.publicHandle).not.toBe(explicit.publicHandle);
    expect(generated.publicHandle).toMatch(/^alice_play_[a-z0-9]+$/);
    expect(store.findByPublicHandle("@ALICE_PLAY")).toMatchObject({ playerId: explicit.playerId });
    expect(store.findByPlayerId(explicit.playerId)).toMatchObject({ publicHandle: "alice_play" });
    expect(store.createAccount({ displayName: "Bob", publicHandle: "Alice_Play" })).toMatchObject({
      ok: false,
      error: { code: "duplicate-handle" }
    });
    expect(store.createAccount({ displayName: "Cara", publicHandle: "admin" })).toMatchObject({
      ok: false,
      error: { code: "invalid-handle" }
    });
    expect(store.createAccount({ displayName: "Dana", publicHandle: "bad handle" })).toMatchObject({
      ok: false,
      error: { code: "invalid-handle" }
    });
  });

  it("deterministically migrates legacy account records without public handles", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-account-handle-migration-"));
    const filePath = join(tempDir, "accounts.jsonl");
    const legacyEntries = ["acct_legacy_one", "acct_legacy_two"].map((id) => ({
      account: {
        createdAt: 1,
        displayName: "Legacy Player",
        id,
        lastSeenAt: 1,
        tokenHash: "legacy-hash",
        updatedAt: 1
      },
      type: "account",
      writtenAt: 1
    }));

    try {
      writeFileSync(filePath, `${legacyEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
      const firstLoad = new AccountStore({ filePath });
      const firstHandles = legacyEntries.map((entry) => firstLoad.findByPlayerId(entry.account.id)?.publicHandle);
      const secondLoad = new AccountStore({ filePath });
      const secondHandles = legacyEntries.map((entry) => secondLoad.findByPlayerId(entry.account.id)?.publicHandle);

      expect(firstHandles[0]).toBe("legacy_player");
      expect(firstHandles[1]).toMatch(/^legacy_player_[a-z0-9]+$/);
      expect(new Set(firstHandles).size).toBe(2);
      expect(secondHandles).toEqual(firstHandles);
      expect(readRawFile(filePath)).toBe(`${legacyEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("throttles persisted last-seen updates instead of appending on every authentication", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-account-seen-"));
    const filePath = join(tempDir, "accounts.jsonl");
    let now = 1_780_000_000_000;

    try {
      const store = new AccountStore({
        filePath,
        lastSeenPersistIntervalMs: 1_000,
        now: () => now
      });
      const account = expectOk(store.createAccount({ displayName: "Seen Player" }));

      now += 100;
      expect(store.authenticate(account.token)).not.toBeNull();
      now += 100;
      expect(store.authenticate(account.token)).not.toBeNull();
      expect(readRawFile(filePath).trim().split(/\r?\n/)).toHaveLength(1);

      now += 1_000;
      expect(store.authenticate(account.token)).not.toBeNull();
      expect(readRawFile(filePath).trim().split(/\r?\n/)).toHaveLength(2);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("compacts the append log so file growth follows live accounts, not writes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-account-compact-"));
    const filePath = join(tempDir, "accounts.jsonl");
    let now = 1_780_000_000_000;

    try {
      const store = new AccountStore({
        compactAfterLines: 5,
        filePath,
        lastSeenPersistIntervalMs: 0,
        now: () => now
      });
      const account = expectOk(store.createAccount({ displayName: "Compact Player" }));

      // Every authenticate appends a new last-seen line: 1 + 9 = 10 writes.
      for (let i = 0; i < 9; i += 1) {
        now += 1_000;
        expect(store.authenticate(account.token)).not.toBeNull();
      }

      // The log was collapsed at writes 5 and 9, so the 10 appends leave the
      // single live account plus the one line written after the last collapse.
      expect(readRawFile(filePath).trim().split(/\r?\n/)).toHaveLength(2);

      const reloaded = new AccountStore({ filePath });

      expect(reloaded.authenticate(account.token)).toMatchObject({
        displayName: "Compact Player",
        playerId: account.playerId
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("warns about unreadable lines instead of silently dropping history", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-account-corrupt-"));
    const filePath = join(tempDir, "accounts.jsonl");
    const warnings: string[] = [];
    const originalWarn = console.warn;

    try {
      writeFileSync(filePath, ["{ not json", JSON.stringify({ type: "account" }), ""].join("\n"), "utf8");
      console.warn = (message?: unknown) => {
        warnings.push(String(message));
      };

      new AccountStore({ filePath });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("2 unreadable line(s)");
    } finally {
      console.warn = originalWarn;
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("resolves account tokens into registered player identities", () => {
    const accountStore = new AccountStore({ filePath: false });
    const guestSessionStore = new GuestSessionStore();
    const account = expectOk(accountStore.createAccount({ displayName: "Ranked Player" }));

    expect(
      resolvePlayerIdentity(
        { accountToken: account.token, playerId: "ignored", playerName: "Ignored" },
        accountStore,
        guestSessionStore
      )
    )
      .toEqual({
        ok: true,
        value: {
          identity: "registered",
          playerId: account.playerId,
          playerName: "Ranked Player",
          publicHandle: account.publicHandle
        }
      });
    expect(
      resolvePlayerIdentity(
        { accountToken: "bad.token", playerId: "guest", playerName: "Guest" },
        accountStore,
        guestSessionStore
      )
    )
      .toMatchObject({
        ok: false,
        error: { code: "account-token-invalid" }
      });
    const guest = expectOk(
      resolvePlayerIdentity({ playerId: "guest", playerName: "Guest" }, accountStore, guestSessionStore)
    );

    expect(guest).toMatchObject({
      guestToken: expect.any(String),
      identity: "guest",
      playerName: "Guest"
    });
    expect(guest.playerId).toMatch(/^guest_/);
    expect(guest.playerId).not.toBe("guest");

    // A second tokenless request gets its own fresh identity instead of
    // claiming the first player's id.
    const impostor = expectOk(
      resolvePlayerIdentity({ playerId: guest.playerId, playerName: "Impostor" }, accountStore, guestSessionStore)
    );

    expect(impostor.playerId).not.toBe(guest.playerId);

    expect(
      resolvePlayerIdentity(
        { guestToken: guest.guestToken, playerId: "guest", playerName: "Guest Renamed" },
        accountStore,
        guestSessionStore
      )
    ).toMatchObject({
      ok: true,
      value: {
        guestToken: guest.guestToken,
        identity: "guest",
        playerId: guest.playerId,
        playerName: "Guest Renamed"
      }
    });
  });

  it("issues server-generated guest ids that cannot impersonate registered accounts", () => {
    const accountStore = new AccountStore({ filePath: false });
    const guestSessionStore = new GuestSessionStore();
    const account = expectOk(accountStore.createAccount({ displayName: "Victim" }));

    const guest = expectOk(
      resolvePlayerIdentity({ playerId: account.playerId, playerName: "Impostor" }, accountStore, guestSessionStore)
    );

    expect(guest.playerId).not.toBe(account.playerId);
    expect(guest.playerId.startsWith("acct_")).toBe(false);
    expect(accountStore.findByPlayerId(guest.playerId)).toBeNull();
  });

  it("rejects reserved account-shaped player ids for guest sessions", () => {
    const guestSessionStore = new GuestSessionStore();

    expect(guestSessionStore.createSession({ playerId: "acct_abc12345", playerName: "Impostor" })).toMatchObject({
      ok: false,
      error: { code: "invalid-player" }
    });
  });

  it("expires and bounds in-memory guest sessions", () => {
    let now = 1_780_000_000_000;
    const guestSessionStore = new GuestSessionStore({ maxEntries: 2, now: () => now, ttlMs: 1_000 });
    const first = expectOk(guestSessionStore.createSession({ playerId: "guest-1", playerName: "First" }));

    now += 100;
    const second = expectOk(guestSessionStore.createSession({ playerId: "guest-2", playerName: "Second" }));
    now += 100;
    const third = expectOk(guestSessionStore.createSession({ playerId: "guest-3", playerName: "Third" }));

    expect(guestSessionStore.authenticate(first.token)).toBeNull();
    expect(guestSessionStore.authenticate(second.token)).toMatchObject({ playerId: "guest-2" });
    expect(guestSessionStore.authenticate(third.token)).toMatchObject({ playerId: "guest-3" });

    now += 1_001;
    expect(guestSessionStore.authenticate(second.token)).toBeNull();
    expect(guestSessionStore.authenticate(third.token)).toBeNull();
  });

  it("persists guest sessions to JSONL and restores across store instances", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-guest-sessions-"));
    const filePath = join(tempDir, "guest-sessions.jsonl");

    try {
      const now = 1_780_000_000_000;
      const firstStore = new GuestSessionStore({ filePath, now: () => now });
      const guest = expectOk(firstStore.createSession({ playerId: "guest-persist-1", playerName: "Guest One" }));

      expect(firstStore.authenticate(guest.token)).toMatchObject({
        identity: "guest",
        playerId: "guest-persist-1",
        playerName: "Guest One"
      });

      // Verify token is hashed, not plaintext
      expect(readRawFile(filePath)).not.toContain(guest.token);

      // Second store instance loads from file
      const secondStore = new GuestSessionStore({ filePath, now: () => now });
      expect(secondStore.authenticate(guest.token)).toMatchObject({
        identity: "guest",
        playerId: "guest-persist-1",
        playerName: "Guest One"
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("slides 30-day expiration clock upon active visits and expires after 30 days of inactivity", () => {
    let now = 1_780_000_000_000;
    const store = new GuestSessionStore({ filePath: false, now: () => now });

    const guest = expectOk(store.createSession({ playerId: "guest-slider", playerName: "Slider" }));

    // 15 days later: active visit
    now += 15 * 24 * 60 * 60 * 1000;
    expect(store.authenticate(guest.token)).toMatchObject({ playerId: "guest-slider" });

    // Another 20 days later (35 days from creation, but only 20 days since last visit): still valid!
    now += 20 * 24 * 60 * 60 * 1000;
    expect(store.authenticate(guest.token)).toMatchObject({ playerId: "guest-slider" });

    // 31 days of complete inactivity: naturally expires
    now += 31 * 24 * 60 * 60 * 1000;
    expect(store.authenticate(guest.token)).toBeNull();
  });

  it("throttles disk writes on high-frequency authentication and triggers compaction", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-guest-throttle-"));
    const filePath = join(tempDir, "guest-sessions.jsonl");

    try {
      let now = 1_780_000_000_000;
      const store = new GuestSessionStore({
        compactAfterLines: 2,
        filePath,
        lastSeenPersistIntervalMs: 60_000,
        now: () => now
      });

      const guest = expectOk(store.createSession({ playerId: "guest-th", playerName: "Throttled" }));
      const linesAfterCreate = readRawFile(filePath).trim().split("\n").length;
      expect(linesAfterCreate).toBe(1);

      // Authenticate within 10s: throttled, no new line written
      now += 10_000;
      store.authenticate(guest.token);
      expect(readRawFile(filePath).trim().split("\n").length).toBe(1);

      // Authenticate after 61s: throttle lock expires, writes update line and triggers compaction (compactAfterLines = 2)
      now += 61_000;
      store.authenticate(guest.token);

      // After compaction, the file is rewritten cleanly to 1 live entry
      const linesAfterCompaction = readRawFile(filePath).trim().split("\n").length;
      expect(linesAfterCompaction).toBe(1);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("evicts oldest inactive session based on lastSeenAt rather than creation time", () => {
    let now = 1_000;
    const store = new GuestSessionStore({ maxEntries: 2, now: () => now });

    const first = expectOk(store.createSession({ playerId: "g-1", playerName: "First" }));
    now = 2_000;
    const second = expectOk(store.createSession({ playerId: "g-2", playerName: "Second" }));

    // Visit first at now = 3_000, making second the oldest by lastSeenAt
    now = 3_000;
    store.authenticate(first.token);

    // Create third at now = 4_000, triggering eviction of oldest (which is second!)
    now = 4_000;
    const third = expectOk(store.createSession({ playerId: "g-3", playerName: "Third" }));

    expect(store.authenticate(second.token)).toBeNull(); // evicted!
    expect(store.authenticate(first.token)).toMatchObject({ playerId: "g-1" });
    expect(store.authenticate(third.token)).toMatchObject({ playerId: "g-3" });
  });

  it("does not rewrite file on every persist after loading a file with entries >= compaction threshold", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-guest-compaction-gate-"));
    const filePath = join(tempDir, "guest-sessions.jsonl");

    try {
      const now = 1_000;
      const compactAfterLines = 10;
      // Seed a file with 15 entries (exceeding compactAfterLines = 10)
      const initialStore = new GuestSessionStore({ compactAfterLines, filePath, now: () => now });
      for (let i = 0; i < 15; i += 1) {
        expectOk(initialStore.createSession({ playerId: `g-init-${i}`, playerName: `Player ${i}` }));
      }

      const initialLines = readRawFile(filePath).trim().split("\n").length;
      expect(initialLines).toBeGreaterThanOrEqual(15);

      const rewriteSpy = vi.spyOn(jsonlFile, "rewriteJsonlFile");
      const appendSpy = vi.spyOn(jsonlFile, "appendJsonlLine");
      rewriteSpy.mockClear();
      appendSpy.mockClear();

      // Now load in a fresh store (simulating server restart with file >= threshold)
      const store = new GuestSessionStore({ compactAfterLines, filePath, now: () => now });

      // Perform 5 consecutive createSession calls
      for (let i = 0; i < 5; i += 1) {
        expectOk(store.createSession({ playerId: `g-new-${i}`, playerName: `New ${i}` }));
      }

      // The 5 creates must be pure appends (0 rewrites) and NOT trigger full rewrites
      expect(appendSpy).toHaveBeenCalledTimes(5);
      expect(rewriteSpy).toHaveBeenCalledTimes(0);

      const currentLines = readRawFile(filePath).trim().split("\n").length;
      expect(currentLines).toBe(initialLines + 5);

      rewriteSpy.mockRestore();
      appendSpy.mockRestore();
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("triggers exactly one compaction when loaded file has dead lines exceeding threshold", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-guest-compaction-boundary-"));
    const filePath = join(tempDir, "guest-sessions.jsonl");

    try {
      const now = 1_000;
      const compactAfterLines = 10;
      // Seed a file with 15 live entries
      const initialStore = new GuestSessionStore({ compactAfterLines: 10_000, filePath, now: () => now });
      for (let i = 0; i < 15; i += 1) {
        expectOk(initialStore.createSession({ playerId: `g-live-${i}`, playerName: `Live ${i}` }));
      }

      // Append 185 churn/overwritten lines for one player so file has 200 lines but only 15 live entries
      const churnLines = Array.from({ length: 185 }, (_, i) =>
        JSON.stringify({
          session: {
            createdAt: now,
            lastSeenAt: now,
            playerId: "g-live-0",
            playerName: `Overwritten ${i}`,
            tokenHash: `hash-churn-${i}`
          },
          type: "guest-session",
          writtenAt: now
        })
      ).join("\n") + "\n";
      appendFileSync(filePath, churnLines, "utf8");

      const totalLines = readRawFile(filePath).trim().split("\n").length;
      expect(totalLines).toBe(200);

      const rewriteSpy = vi.spyOn(jsonlFile, "rewriteJsonlFile");
      const appendSpy = vi.spyOn(jsonlFile, "appendJsonlLine");
      rewriteSpy.mockClear();
      appendSpy.mockClear();

      // Now load in a fresh store (15 live sessions, 200 total lines, threshold = 10)
      const store = new GuestSessionStore({ compactAfterLines, filePath, now: () => now });

      // Perform 5 consecutive createSession calls
      for (let i = 0; i < 5; i += 1) {
        expectOk(store.createSession({ playerId: `g-boundary-${i}`, playerName: `Boundary ${i}` }));
      }

      // First createSession must trigger exactly 1 compaction (185 dead lines > 10 threshold).
      // Remaining 4 creates are pure appends without further rewrites.
      expect(rewriteSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledTimes(5);

      // Final file lines must be compacted down to exactly 20 (15 live + 5 new)
      const compactedLines = readRawFile(filePath).trim().split("\n").length;
      expect(compactedLines).toBe(20);

      rewriteSpy.mockRestore();
      appendSpy.mockRestore();
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("safely ignores corrupt lines in guest sessions JSONL", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-guest-corrupt-"));
    const filePath = join(tempDir, "guest-sessions.jsonl");

    try {
      const initialStore = new GuestSessionStore({ filePath, now: () => 1_000 });
      const guest = expectOk(initialStore.createSession({ playerId: "guest-valid", playerName: "Valid" }));
      const originalFileContent = readFileSync(filePath, "utf8");

      // Inject corrupt JSON and invalid schema lines around the valid entry
      writeFileSync(
        filePath,
        `corrupt json\n{"type":"guest-session"}\n${originalFileContent}{"broken":"syntax\n`,
        "utf8"
      );

      const store = new GuestSessionStore({ filePath, now: () => 1_000 });
      // The valid entry is properly restored and authenticates with the real token
      const auth = store.authenticate(guest.token);
      expect(auth).toMatchObject({
        identity: "guest",
        playerId: "guest-valid",
        playerName: "Valid"
      });

      // An unknown token fails cleanly
      expect(store.authenticate("nonexistent-token")).toBeNull();
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("gracefully catches compaction failure under file lock, retains append log, and self-heals when lock releases", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gomoku-compaction-lock-"));
    const filePath = join(tempDir, "guest-sessions.jsonl");

    const warnings: string[] = [];
    const originalWarn = console.warn;

    try {
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      };

      const now = 1_000;
      const store = new GuestSessionStore({ compactAfterLines: 1, filePath, now: () => now });

      expectOk(store.createSession({ playerId: "g-lock-1", playerName: "Player 1" }));

      // Lock destination file so atomic rename fails with EPERM during next write compaction
      const fd = openSync(filePath, "r");
      try {
        let secondSession: ReturnType<typeof store.createSession> | undefined;
        expect(() => {
          secondSession = store.createSession({ playerId: "g-lock-2", playerName: "Player 2" });
        }).not.toThrow();
        expect(secondSession?.ok).toBe(true);

        // Compaction failure was caught and logged gracefully without losing data
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("[GuestSessionStore] file compaction deferred due to lock");
        expect(warnings[0]).toContain("EPERM");

        const linesWhileLocked = readRawFile(filePath).trim().split("\n");
        expect(linesWhileLocked.length).toBe(2);
        expect(existsSync(`${filePath}.compact.tmp`)).toBe(false);
      } finally {
        closeSync(fd);
      }

      // Next session write triggers compaction without lock and compacts to live count
      expectOk(store.createSession({ playerId: "g-lock-3", playerName: "Player 3" }));

      const linesAfterRelease = readRawFile(filePath).trim().split("\n");
      expect(linesAfterRelease.length).toBe(3);
    } finally {
      console.warn = originalWarn;
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}

function readRawFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}
