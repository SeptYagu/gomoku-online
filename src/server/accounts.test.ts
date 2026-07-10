import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AccountStore, GuestSessionStore, resolvePlayerIdentity } from "./accounts";

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
      playerId: "guest",
      playerName: "Guest"
    });
    expect(resolvePlayerIdentity({ playerId: "guest", playerName: "Attacker" }, accountStore, guestSessionStore))
      .toMatchObject({ ok: false, error: { code: "guest-session-invalid" } });
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
        playerId: "guest",
        playerName: "Guest Renamed"
      }
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
