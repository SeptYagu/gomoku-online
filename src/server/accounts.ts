import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { appendJsonlLine, JsonlCompactionTracker, readJsonlFile, rewriteJsonlFile } from "./jsonl-file";

export type PlayerIdentityKind = "guest" | "registered";

export type AccountSnapshot = {
  createdAt: number;
  displayName: string;
  identity: "registered";
  lastSeenAt: number;
  playerId: string;
  publicHandle: string;
  updatedAt: number;
};

export type AccountSession = AccountSnapshot & {
  token: string;
};

export type AccountResult<T> = { ok: true; value: T } | { ok: false; error: AccountError };

export type AccountError = {
  code:
    | "account-token-invalid"
    | "duplicate-handle"
    | "duplicate-name"
    | "guest-session-invalid"
    | "invalid-handle"
    | "invalid-player";
  message: string;
};

export type GuestSessionSnapshot = {
  identity: "guest";
  playerId: string;
  playerName: string;
  token: string;
};

type AccountStoreOptions = {
  /**
   * Rewrite the append-only log after this many appended lines, bounding file
   * growth by the number of live accounts instead of the number of writes.
   * `0` disables compaction (only useful in tests).
   */
  compactAfterLines?: number;
  filePath?: false | string;
  lastSeenPersistIntervalMs?: number;
  now?: () => number;
};

type StoredAccount = {
  createdAt: number;
  displayName: string;
  id: string;
  lastSeenAt: number;
  publicHandle: string;
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
const ACCOUNT_COMPACT_AFTER_LINES = 2_000;
const ACCOUNT_LAST_SEEN_PERSIST_INTERVAL_MS = 60_000;
const GUEST_PLAYER_ID_PREFIX = "guest_";
const GUEST_SESSION_MAX_ENTRIES = 10_000;
const GUEST_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_DISPLAY_NAME_LENGTH = 24;
const MAX_PLAYER_ID_LENGTH = 128;
const MAX_PUBLIC_HANDLE_LENGTH = 20;
const MIN_PUBLIC_HANDLE_LENGTH = 3;
const RESERVED_PUBLIC_HANDLES = new Set(["admin", "api", "gomoku", "guest", "player", "root", "support", "system"]);

export class AccountStore {
  private readonly accounts = new Map<string, StoredAccount>();
  private readonly compaction: JsonlCompactionTracker;
  private readonly filePath: false | string;
  private readonly lastPersistedSeenAt = new Map<string, number>();
  private readonly lastSeenPersistIntervalMs: number;
  private readonly now: () => number;
  private readonly playerIdByPublicHandle = new Map<string, string>();

  constructor(options: AccountStoreOptions = {}) {
    this.filePath = options.filePath === undefined ? false : options.filePath === false ? false : resolve(options.filePath);
    this.lastSeenPersistIntervalMs = Math.max(
      0,
      options.lastSeenPersistIntervalMs ?? ACCOUNT_LAST_SEEN_PERSIST_INTERVAL_MS
    );
    this.now = options.now ?? Date.now;
    this.compaction = new JsonlCompactionTracker({
      threshold: options.compactAfterLines ?? ACCOUNT_COMPACT_AFTER_LINES
    });

    this.loadFromFile();
  }

  createAccount(input: { displayName: string; publicHandle?: string }): AccountResult<AccountSession> {
    const displayName = normalizeDisplayName(input.displayName);

    if (!displayName) {
      return failure("invalid-player", "Display name is required.");
    }

    if (this.hasDisplayName(displayName)) {
      return failure("duplicate-name", "This display name is already registered.");
    }

    const id = this.createUniqueAccountId();
    const requestedHandle = input.publicHandle?.trim() ?? "";
    const publicHandle = requestedHandle
      ? normalizePublicHandle(requestedHandle)
      : this.createAvailablePublicHandle(displayName, id);

    if (!publicHandle || !isValidPublicHandle(publicHandle)) {
      return failure(
        "invalid-handle",
        "Public handle must be 3-20 letters, numbers, underscores, or hyphens, with a letter or number at each end."
      );
    }

    if (this.playerIdByPublicHandle.has(publicHandle)) {
      return failure("duplicate-handle", "This public handle is already registered.");
    }

    const token = `${id}.${randomTokenPart(24)}`;
    const now = this.now();
    const account: StoredAccount = {
      createdAt: now,
      displayName,
      id,
      lastSeenAt: now,
      publicHandle,
      tokenHash: hashToken(token),
      updatedAt: now
    };

    this.accounts.set(account.id, account);
    this.playerIdByPublicHandle.set(account.publicHandle, account.id);
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

  findByPlayerId(playerId: string): AccountSnapshot | null {
    const account = this.accounts.get(playerId.trim());

    return account ? getAccountSnapshot(account) : null;
  }

  findByPublicHandle(publicHandle: string): AccountSnapshot | null {
    const normalizedHandle = normalizePublicHandle(publicHandle);
    const playerId = normalizedHandle ? this.playerIdByPublicHandle.get(normalizedHandle) : null;
    const account = playerId ? this.accounts.get(playerId) : null;

    return account ? getAccountSnapshot(account) : null;
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

  private createAvailablePublicHandle(displayName: string, accountId: string): string {
    const base = createPublicHandleBase(displayName);

    if (isValidPublicHandle(base) && !this.playerIdByPublicHandle.has(base)) {
      return base;
    }

    const suffix = createHandleSuffix(accountId);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const attemptSuffix = attempt === 0 ? suffix : `${suffix}${attempt.toString(36)}`;
      const prefixLength = MAX_PUBLIC_HANDLE_LENGTH - attemptSuffix.length - 1;
      const prefix = (base || "player").slice(0, Math.max(1, prefixLength)).replace(/[-_]+$/g, "") || "p";
      const candidate = `${prefix}_${attemptSuffix}`;

      if (isValidPublicHandle(candidate) && !this.playerIdByPublicHandle.has(candidate)) {
        return candidate;
      }
    }

    return `p_${createHash("sha256").update(accountId).digest("hex").slice(0, 16)}`;
  }

  private loadFromFile(): void {
    if (!this.filePath) {
      return;
    }

    const { entries, lineCount, skipped } = readJsonlFile(this.filePath, parsePersistedAccountEntry);

    if (skipped > 0) {
      console.warn(`[accounts] skipped ${skipped} unreadable line(s) while loading ${this.filePath}`);
    }

    this.compaction.reset(lineCount);

    for (const entry of entries) {
      const previous = this.accounts.get(entry.account.id);

      if (previous) {
        this.playerIdByPublicHandle.delete(previous.publicHandle);
      }

      const persistedHandle = normalizePublicHandle(entry.account.publicHandle ?? "");
      const publicHandle =
        persistedHandle &&
        isValidPublicHandle(persistedHandle) &&
        !this.playerIdByPublicHandle.has(persistedHandle)
          ? persistedHandle
          : this.createAvailablePublicHandle(entry.account.displayName, entry.account.id);
      const account = { ...entry.account, publicHandle };

      this.accounts.set(account.id, account);
      this.playerIdByPublicHandle.set(account.publicHandle, account.id);
      this.lastPersistedSeenAt.set(account.id, account.lastSeenAt);
    }
  }

  private persist(account: StoredAccount): void {
    if (!this.filePath) {
      return;
    }

    appendJsonlLine(this.filePath, {
      account,
      type: "account",
      writtenAt: this.now()
    } satisfies PersistedAccountEntry);
    this.lastPersistedSeenAt.set(account.id, account.lastSeenAt);

    if (this.compaction.noteAppend()) {
      this.compactFile();
    }
  }

  /**
   * Collapses the append log into one line per live account. The in-memory map
   * is already the win-by-latest-line projection of the log, so rewriting from
   * it is lossless while bounding the file at ~the number of accounts.
   */
  private compactFile(): void {
    if (!this.filePath || this.accounts.size === 0) {
      return;
    }

    const writtenAt = this.now();

    rewriteJsonlFile(
      this.filePath,
      [...this.accounts.values()].map(
        (account) => ({ account, type: "account", writtenAt }) satisfies PersistedAccountEntry
      )
    );
    this.compaction.reset(this.accounts.size);
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

    if (isRegisteredPlayerIdShape(playerId)) {
      return failure("invalid-player", "This player id is reserved for registered accounts.");
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
): AccountResult<{
  guestToken?: string;
  identity: PlayerIdentityKind;
  playerId: string;
  playerName: string;
  publicHandle?: string;
}> {
  const accountToken = input.accountToken?.trim();

  if (accountToken) {
    const account = accountStore.authenticate(accountToken);

    if (!account) {
      return failure("account-token-invalid", "Registered account session is invalid.");
    }

    return success({
      identity: "registered",
      playerId: account.playerId,
      playerName: account.displayName,
      publicHandle: account.publicHandle
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

  // The client-supplied playerId is never trusted for identity: guest ids are
  // issued server-side so a client cannot claim another player's id (or a
  // registered `acct_*` id) and pollute their records.
  const guestSession = guestSessionStore.createSession({
    playerId: createGuestPlayerId(),
    playerName: input.playerName
  });

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
    publicHandle: account.publicHandle,
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

function parsePersistedAccountEntry(value: unknown): PersistedAccountEntry | null {
  const entry = value as PersistedAccountEntry;

  return entry?.type === "account" && entry.account?.id ? entry : null;
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

function createGuestPlayerId(): string {
  return `${GUEST_PLAYER_ID_PREFIX}${randomTokenPart(12)}`;
}

function isRegisteredPlayerIdShape(playerId: string): boolean {
  return /^acct(?:[_-]|$)/i.test(playerId);
}

function normalizePublicHandle(publicHandle: string): string {
  const normalized = publicHandle.trim().toLowerCase();

  return normalized.startsWith("@") ? normalized.slice(1) : normalized;
}

function createPublicHandleBase(displayName: string): string {
  const normalized = displayName
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, MAX_PUBLIC_HANDLE_LENGTH);

  return normalized.length >= MIN_PUBLIC_HANDLE_LENGTH && !RESERVED_PUBLIC_HANDLES.has(normalized)
    ? normalized
    : "player";
}

function createHandleSuffix(accountId: string): string {
  return accountId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6).padStart(6, "0");
}

function isValidPublicHandle(publicHandle: string): boolean {
  return (
    publicHandle.length >= MIN_PUBLIC_HANDLE_LENGTH &&
    publicHandle.length <= MAX_PUBLIC_HANDLE_LENGTH &&
    !RESERVED_PUBLIC_HANDLES.has(publicHandle) &&
    /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])$/.test(publicHandle)
  );
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
