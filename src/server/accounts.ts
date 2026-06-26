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
  code: "account-token-invalid" | "duplicate-name" | "invalid-player";
  message: string;
};

type AccountStoreOptions = {
  filePath?: false | string;
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

type PersistedAccountEntry = {
  account: StoredAccount;
  type: "account";
  writtenAt: number;
};

const ACCOUNT_ID_PREFIX = "acct";
const MAX_DISPLAY_NAME_LENGTH = 24;

export class AccountStore {
  private readonly accounts = new Map<string, StoredAccount>();
  private readonly filePath: false | string;
  private readonly now: () => number;

  constructor(options: AccountStoreOptions = {}) {
    this.filePath = options.filePath === undefined ? false : options.filePath === false ? false : resolve(options.filePath);
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

    account.lastSeenAt = this.now();
    this.persist(account);

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
  }
}

export function resolvePlayerIdentity(
  input: { accountToken?: null | string; playerId: string; playerName: string },
  accountStore: AccountStore
): AccountResult<{ identity: PlayerIdentityKind; playerId: string; playerName: string }> {
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

  const playerId = input.playerId.trim();
  const playerName = normalizeDisplayName(input.playerName);

  if (!playerId || !playerName) {
    return failure("invalid-player", "Player id and name are required.");
  }

  return success({
    identity: "guest",
    playerId,
    playerName
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function randomTokenPart(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ").slice(0, MAX_DISPLAY_NAME_LENGTH);
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
