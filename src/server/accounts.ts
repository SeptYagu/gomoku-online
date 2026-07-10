import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type PlayerIdentityKind = "guest" | "registered";

export type AccountSnapshot = {
  createdAt: number;
  displayName: string;
  identity: "registered";
  lastSeenAt: number;
  playerId: string;
  updatedAt: number;
};

export type AccountSession = AccountSnapshot & {
  token: string;
};

export type AccountResult<T> = { ok: true; value: T } | { ok: false; error: AccountError };

export type AccountError = {
  code: "account-token-invalid" | "duplicate-name" | "guest-session-invalid" | "invalid-player";
  message: string;
};

export type GuestSessionSnapshot = {
  identity: "guest";
  playerId: string;
  playerName: string;
  token: string;
};

type AccountStoreOptions = {
  filePath?: false | string;
  lastSeenPersistIntervalMs?: number;
  now?: () => number;
};

type StoredAccount = {
  createdAt: number;
  displayName: string;
  id: string;
  lastSeenAt: number;
  tokenHash: string;
  updatedAt: number;
};

type StoredGuestSession = {
  createdAt: number;
  lastSeenAt: number;
  playerId: string;
  playerName: string;
  tokenHash: string;
};

type PersistedAccountEntry = {
  account: StoredAccount;
  type: "account";
  writtenAt: number;
};

const ACCOUNT_ID_PREFIX = "acct";
const ACCOUNT_LAST_SEEN_PERSIST_INTERVAL_MS = 60_000;
const GUEST_SESSION_MAX_ENTRIES = 10_000;
const GUEST_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_DISPLAY_NAME_LENGTH = 24;
const MAX_PLAYER_ID_LENGTH = 128;

export class AccountStore {
  private readonly accounts = new Map<string, StoredAccount>();
  private readonly filePath: false | string;
  private readonly lastPersistedSeenAt = new Map<string, number>();
  private readonly lastSeenPersistIntervalMs: number;
  private readonly now: () => number;

  constructor(options: AccountStoreOptions = {}) {
    this.filePath = options.filePath === undefined ? false : options.filePath === false ? false : resolve(options.filePath);
    this.lastSeenPersistIntervalMs = Math.max(
      0,
      options.lastSeenPersistIntervalMs ?? ACCOUNT_LAST_SEEN_PERSIST_INTERVAL_MS
    );
    this.now = options.now ?? Date.now;

    this.loadFromFile();
  }

  createAccount(input: { displayName: string }): AccountResult<AccountSession> {
    const displayName = normalizeDisplayName(input.displayName);

    if (!displayName) {
      return failure("invalid-player", "Display name is required.");
    }

    if (this.hasDisplayName(displayName)) {
      return failure("duplicate-name", "This display name is already registered.");
    }

    const id = this.createUniqueAccountId();
    const token = `${id}.${randomTokenPart(24)}`;
    const now = this.now();
    const account: StoredAccount = {
      createdAt: now,
      displayName,
      id,
      lastSeenAt: now,
      tokenHash: hashToken(token),
      updatedAt: now
    };

    this.accounts.set(account.id, account);
    this.persist(account);

    return success({
      ...getAccountSnapshot(account),
      token
    });
  }

  authenticate(token: string): AccountSnapshot | null {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const accountId = normalizedToken.split(".", 1)[0];
    const account = this.accounts.get(accountId);

    if (!account || account.tokenHash !== hashToken(normalizedToken)) {
      return null;
    }

    const now = this.now();

    account.lastSeenAt = now;

    if (now - (this.lastPersistedSeenAt.get(account.id) ?? 0) >= this.lastSeenPersistIntervalMs) {
      account.updatedAt = now;
      this.persist(account);
    }

    return getAccountSnapshot(account);
  }

  private createUniqueAccountId(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const id = `${ACCOUNT_ID_PREFIX}_${randomTokenPart(8)}`;

      if (!this.accounts.has(id)) {
        return id;
      }
    }

    return `${ACCOUNT_ID_PREFIX}_${Date.now()}_${randomTokenPart(4)}`;
  }

  private hasDisplayName(displayName: string): boolean {
    return [...this.accounts.values()].some((account) => namesMatch(account.displayName, displayName));
  }

  private loadFromFile(): void {
    if (!this.filePath || !existsSync(this.filePath)) {
      return;
    }

    const content = readFileSync(this.filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line) as PersistedAccountEntry;

        if (entry.type === "account" && entry.account?.id) {
          this.accounts.set(entry.account.id, entry.account);
          this.lastPersistedSeenAt.set(entry.account.id, entry.account.lastSeenAt);
        }
      } catch {
        // Ignore corrupt historical lines; the next valid line for an account wins.
      }
    }
  }

  private persist(account: StoredAccount): void {
    if (!this.filePath) {
      return;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(
      this.filePath,
      `${JSON.stringify({
        account,
        type: "account",
        writtenAt: this.now()
      } satisfies PersistedAccountEntry)}\n`,
      "utf8"
    );
    this.lastPersistedSeenAt.set(account.id, account.lastSeenAt);
  }
}

export class GuestSessionStore {
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly sessionsByPlayerId = new Map<string, StoredGuestSession>();
  private readonly ttlMs: number;
  private readonly playerIdByTokenHash = new Map<string, string>();

  constructor(options: { maxEntries?: number; now?: () => number; ttlMs?: number } = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? GUEST_SESSION_MAX_ENTRIES));
    this.now = options.now ?? Date.now;
    this.ttlMs = Math.max(1, options.ttlMs ?? GUEST_SESSION_TTL_MS);
  }

  createSession(input: { playerId: string; playerName: string }): AccountResult<GuestSessionSnapshot> {
    this.pruneExpiredSessions();
    const playerId = normalizePlayerId(input.playerId);
    const playerName = normalizeDisplayName(input.playerName);

    if (!playerId || !playerName) {
      return failure("invalid-player", "Player id and name are required.");
    }

    if (this.sessionsByPlayerId.has(playerId)) {
      return failure("guest-session-invalid", "This guest identity requires its session token.");
    }

    this.evictOldestSessions();

    const token = randomTokenPart(32);
    const now = this.now();
    const session: StoredGuestSession = {
      createdAt: now,
      lastSeenAt: now,
      playerId,
      playerName,
      tokenHash: hashToken(token)
    };

    this.sessionsByPlayerId.set(playerId, session);
    this.playerIdByTokenHash.set(session.tokenHash, playerId);

    return success(getGuestSessionSnapshot(session, token));
  }

  authenticate(token: string, playerName?: string): GuestSessionSnapshot | null {
    this.pruneExpiredSessions();
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const tokenHash = hashToken(normalizedToken);
    const playerId = this.playerIdByTokenHash.get(tokenHash);
    const session = playerId ? this.sessionsByPlayerId.get(playerId) : null;

    if (!session || session.tokenHash !== tokenHash) {
      return null;
    }

    const normalizedName = normalizeDisplayName(playerName ?? session.playerName);

    if (normalizedName) {
      session.playerName = normalizedName;
    }

    session.lastSeenAt = this.now();

    return getGuestSessionSnapshot(session, normalizedToken);
  }

  private evictOldestSessions(): void {
    while (this.sessionsByPlayerId.size >= this.maxEntries) {
      const oldest = [...this.sessionsByPlayerId.values()].sort(
        (left, right) => left.lastSeenAt - right.lastSeenAt || left.createdAt - right.createdAt
      )[0];

      if (!oldest) {
        return;
      }

      this.deleteSession(oldest);
    }
  }

  private pruneExpiredSessions(): void {
    const cutoff = this.now() - this.ttlMs;

    for (const session of this.sessionsByPlayerId.values()) {
      if (session.lastSeenAt < cutoff) {
        this.deleteSession(session);
      }
    }
  }

  private deleteSession(session: StoredGuestSession): void {
    this.sessionsByPlayerId.delete(session.playerId);
    this.playerIdByTokenHash.delete(session.tokenHash);
  }
}

export function resolvePlayerIdentity(
  input: { accountToken?: null | string; guestToken?: null | string; playerId: string; playerName: string },
  accountStore: AccountStore,
  guestSessionStore: GuestSessionStore
): AccountResult<{ guestToken?: string; identity: PlayerIdentityKind; playerId: string; playerName: string }> {
  const accountToken = input.accountToken?.trim();

  if (accountToken) {
    const account = accountStore.authenticate(accountToken);

    if (!account) {
      return failure("account-token-invalid", "Registered account session is invalid.");
    }

    return success({
      identity: "registered",
      playerId: account.playerId,
      playerName: account.displayName
    });
  }

  const guestToken = input.guestToken?.trim();

  if (guestToken) {
    const guestSession = guestSessionStore.authenticate(guestToken, input.playerName);

    if (!guestSession) {
      return failure("guest-session-invalid", "Guest session is invalid. Start a new guest session.");
    }

    return success({
      guestToken: guestSession.token,
      identity: "guest",
      playerId: guestSession.playerId,
      playerName: guestSession.playerName
    });
  }

  const guestSession = guestSessionStore.createSession(input);

  if (!guestSession.ok) {
    return guestSession;
  }

  return success({
    guestToken: guestSession.value.token,
    identity: "guest",
    playerId: guestSession.value.playerId,
    playerName: guestSession.value.playerName
  });
}

function getAccountSnapshot(account: StoredAccount): AccountSnapshot {
  return {
    createdAt: account.createdAt,
    displayName: account.displayName,
    identity: "registered",
    lastSeenAt: account.lastSeenAt,
    playerId: account.id,
    updatedAt: account.updatedAt
  };
}

function getGuestSessionSnapshot(session: StoredGuestSession, token: string): GuestSessionSnapshot {
  return {
    identity: "guest",
    playerId: session.playerId,
    playerName: session.playerName,
    token
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function randomTokenPart(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME_LENGTH);
}

function normalizePlayerId(playerId: string): string {
  return playerId.trim().slice(0, MAX_PLAYER_ID_LENGTH);
}

function namesMatch(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
}

function success<T>(value: T): AccountResult<T> {
  return { ok: true, value };
}

function failure(code: AccountError["code"], message: string): AccountResult<never> {
  return { ok: false, error: { code, message } };
}
