import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
        playerId: expect.stringMatching(/^acct_/)
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
        playerId: created.playerId
      });
      expect(readRawFile(filePath)).not.toContain(created.token);
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
          playerName: "Ranked Player"
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
