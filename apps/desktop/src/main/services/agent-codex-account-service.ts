import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

import type {
  AgentCodexAccountActivationResult,
  AgentCodexAccountSummary,
  ImportAgentCodexAccountRequest,
} from "@prompthub/shared";

const MAX_ACCOUNTS = 32;
const MAX_AUTH_BYTES = 256 * 1024;
const MAX_LABEL_LENGTH = 80;
const mutationTails = new Map<string, Promise<void>>();

function requireCodexProviderCapability(): void {
  if (!isAgentDepthCapabilityAvailable("codex", "providerModel")) {
    throw new Error("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  }
}

export interface AgentCodexAccountServiceEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface PersistedAccount {
  id: string;
  label: string;
  maskedAccountId: string | null;
  accountKey: string | null;
  authDigest: string | null;
  ciphertext: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PersistedVault {
  version: 2;
  accounts: PersistedAccount[];
  pendingAccountId?: string;
}

interface ParsedAuth {
  raw: string;
  digest: string;
  accountId: string | null;
  accountKey: string | null;
  email: string | null;
}

interface AgentCodexAccountServiceOptions {
  authPath: string;
  vaultPath: string;
  encryption: AgentCodexAccountServiceEncryption;
  now?: () => number;
  randomId?: () => string;
  afterNativeWrite?: () => Promise<void>;
}

export interface AgentCodexAccountService {
  list(): Promise<AgentCodexAccountSummary[]>;
  saveCurrent(label: string, id?: string): Promise<AgentCodexAccountSummary>;
  importAccount(
    request: ImportAgentCodexAccountRequest,
  ): Promise<AgentCodexAccountSummary>;
  activate(id: string): Promise<AgentCodexAccountActivationResult>;
  delete(id: string): Promise<void>;
}

export function createAgentCodexAccountService(
  options: AgentCodexAccountServiceOptions,
): AgentCodexAccountService {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomUUID;

  function requireEncryption(): void {
    if (!options.encryption.isEncryptionAvailable()) {
      throw new Error("AGENT_CODEX_ACCOUNT_ENCRYPTION_UNAVAILABLE");
    }
  }

  async function loadVault(): Promise<PersistedVault> {
    try {
      return parseVault(await fs.readFile(options.vaultPath, "utf8"));
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { version: 2, accounts: [] };
      throw publicVaultError(error);
    }
  }

  async function persistVault(vault: PersistedVault): Promise<void> {
    await atomicWrite(options.vaultPath, JSON.stringify(vault));
  }

  async function readCurrent(): Promise<ParsedAuth | null> {
    try {
      return parseAuth(await fs.readFile(options.authPath, "utf8"));
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      if (error instanceof Error && error.message.startsWith("AGENT_CODEX_")) {
        throw error;
      }
      throw new Error("AGENT_CODEX_ACCOUNT_CURRENT_INVALID");
    }
  }

  function encrypt(raw: string): string {
    requireEncryption();
    return options.encryption.encryptString(raw).toString("base64");
  }

  function decrypt(account: PersistedAccount): ParsedAuth {
    if (account.ciphertext === null) {
      throw new Error("AGENT_CODEX_ACCOUNT_LOGIN_REQUIRED");
    }
    requireEncryption();
    let raw: string;
    try {
      raw = options.encryption.decryptString(
        Buffer.from(account.ciphertext, "base64"),
      );
    } catch {
      throw new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
    }
    let parsed: ParsedAuth;
    try {
      parsed = parseAuth(raw);
    } catch {
      throw new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
    }
    if (parsed.digest !== account.authDigest) {
      throw new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
    }
    return parsed;
  }

  function summary(
    account: PersistedAccount,
    active: boolean,
  ): AgentCodexAccountSummary {
    const email =
      account.ciphertext !== null && options.encryption.isEncryptionAvailable()
        ? decrypt(account).email
        : null;
    return { ...publicAccount(account, active), email };
  }

  async function summaries(
    vault: PersistedVault,
  ): Promise<AgentCodexAccountSummary[]> {
    const current = await readCurrent();
    return vault.accounts.map((account) => ({
      ...summary(account, isCurrentAccount(account, current)),
      isLoginPending: account.id === vault.pendingAccountId,
    }));
  }

  function addAccount(
    vault: PersistedVault,
    label: string,
    parsed: ParsedAuth,
  ): PersistedAccount {
    const duplicate = vault.accounts.find((account) =>
      isCurrentAccount(account, parsed),
    );
    if (duplicate) {
      duplicate.label = requireLabel(label);
      duplicate.updatedAt = now();
      duplicate.ciphertext = encrypt(parsed.raw);
      duplicate.authDigest = parsed.digest;
      duplicate.maskedAccountId = maskAccountId(parsed.accountId);
      duplicate.accountKey = parsed.accountKey;
      return duplicate;
    }
    if (vault.accounts.length >= MAX_ACCOUNTS) {
      throw new Error("AGENT_CODEX_ACCOUNT_LIMIT_REACHED");
    }
    const timestamp = now();
    const account: PersistedAccount = {
      id: randomId(),
      label: requireLabel(label),
      maskedAccountId: maskAccountId(parsed.accountId),
      accountKey: parsed.accountKey,
      authDigest: parsed.digest,
      ciphertext: encrypt(parsed.raw),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    vault.accounts.push(account);
    return account;
  }

  async function importWithinMutation(
    request: ImportAgentCodexAccountRequest,
  ): Promise<AgentCodexAccountSummary> {
    const label = requireLabel(request?.label);
    const id = request?.id === undefined ? undefined : requireId(request.id);
    const raw = request?.authJson;
    if (raw !== undefined && typeof raw !== "string") {
      throw new Error("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
    }
    const parsed = raw?.trim() ? parseAuth(raw) : null;
    const vault = await loadVault();
    const existing =
      id === undefined
        ? undefined
        : vault.accounts.find((entry) => entry.id === id);
    if (id !== undefined && !existing)
      throw new Error("AGENT_CODEX_ACCOUNT_NOT_FOUND");
    let account: PersistedAccount;
    if (existing) {
      if (
        parsed &&
        vault.accounts.some(
          (entry) => entry.id !== id && isCurrentAccount(entry, parsed),
        )
      ) {
        throw new Error("AGENT_CODEX_ACCOUNT_ALREADY_SAVED");
      }
      account = existing;
      if (parsed) {
        account.ciphertext = encrypt(parsed.raw);
        account.authDigest = parsed.digest;
        account.accountKey = parsed.accountKey;
        account.maskedAccountId = maskAccountId(parsed.accountId);
      }
      account.label = label;
      account.updatedAt = now();
    } else if (parsed) {
      account = addAccount(vault, label, parsed);
    } else {
      if (vault.accounts.length >= MAX_ACCOUNTS)
        throw new Error("AGENT_CODEX_ACCOUNT_LIMIT_REACHED");
      const timestamp = now();
      account = {
        id: randomId(),
        label,
        ciphertext: null,
        authDigest: null,
        accountKey: null,
        maskedAccountId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      vault.accounts.push(account);
    }
    const current = await readCurrent();
    const result = summary(account, isCurrentAccount(account, current));
    if (parsed && vault.pendingAccountId === account.id)
      delete vault.pendingAccountId;
    await persistVault(vault);
    return result;
  }

  return {
    async list() {
      await waitForMutations(options.vaultPath);
      return summaries(await loadVault());
    },

    async saveCurrent(label, id) {
      requireCodexProviderCapability();
      return enqueueMutation(options.vaultPath, async () => {
        const parsed = await readCurrent();
        if (!parsed) {
          throw new Error("AGENT_CODEX_ACCOUNT_CURRENT_MISSING");
        }
        return importWithinMutation({ id, label, authJson: parsed.raw });
      });
    },

    async importAccount(request) {
      requireCodexProviderCapability();
      return enqueueMutation(options.vaultPath, () =>
        importWithinMutation(request),
      );
    },

    async activate(id) {
      requireCodexProviderCapability();
      return enqueueMutation(options.vaultPath, async () => {
        const accountId = requireId(id);
        const vault = await loadVault();
        const target = vault.accounts.find(
          (account) => account.id === accountId,
        );
        if (!target) throw new Error("AGENT_CODEX_ACCOUNT_NOT_FOUND");
        if (
          target.id === vault.pendingAccountId &&
          target.ciphertext === null
        ) {
          return {
            account: { ...summary(target, false), isLoginPending: true },
            preservedCurrent: false,
            requiresLogin: true,
          };
        }
        let desired = target.ciphertext === null ? null : decrypt(target);
        const previousRaw = await readRawIfPresent(options.authPath);
        const current = previousRaw === null ? null : parseAuth(previousRaw);
        let preservedCurrent = false;
        let vaultChanged = false;
        if (
          current &&
          !vault.accounts.some(
            (account) => account.authDigest === current.digest,
          )
        ) {
          const matchingAccount = current.accountKey
            ? vault.accounts.find(
                (account) => account.accountKey === current.accountKey,
              )
            : null;
          if (matchingAccount) {
            matchingAccount.authDigest = current.digest;
            matchingAccount.ciphertext = encrypt(current.raw);
            matchingAccount.maskedAccountId = maskAccountId(current.accountId);
            matchingAccount.updatedAt = now();
            if (matchingAccount.id === target.id) desired = current;
          } else {
            addAccount(vault, autoLabel(current.accountId), current);
          }
          preservedCurrent = true;
          vaultChanged = true;
        } else if (current) {
          const saved = vault.accounts.find(
            (account) => account.authDigest === current.digest,
          );
          if (saved) {
            saved.ciphertext = encrypt(current.raw);
            saved.updatedAt = now();
            vaultChanged = true;
          }
        }
        if (vaultChanged) await persistVault(vault);
        if (desired && current?.digest === desired.digest) {
          if (vault.pendingAccountId) {
            delete vault.pendingAccountId;
            await persistVault(vault);
          }
          return { account: summary(target, true), preservedCurrent };
        }
        try {
          if (desired) await atomicWrite(options.authPath, desired.raw);
          else await fs.rm(options.authPath, { force: true });
          await options.afterNativeWrite?.();
          const verified = await readCurrent();
          if (
            desired
              ? !verified || verified.digest !== desired.digest
              : verified !== null
          ) {
            throw new Error("verification failed");
          }
          if (desired) delete vault.pendingAccountId;
          else vault.pendingAccountId = target.id;
          await persistVault(vault);
        } catch {
          await restoreNative(options.authPath, previousRaw);
          throw new Error("AGENT_CODEX_ACCOUNT_SWITCH_FAILED");
        }
        return {
          account: {
            ...summary(target, desired !== null),
            isLoginPending: desired === null,
          },
          preservedCurrent,
          requiresLogin: desired === null,
        };
      });
    },

    async delete(id) {
      return enqueueMutation(options.vaultPath, async () => {
        const accountId = requireId(id);
        const vault = await loadVault();
        const index = vault.accounts.findIndex(
          (account) => account.id === accountId,
        );
        if (index < 0) throw new Error("AGENT_CODEX_ACCOUNT_NOT_FOUND");
        vault.accounts.splice(index, 1);
        if (vault.pendingAccountId === accountId) delete vault.pendingAccountId;
        await persistVault(vault);
      });
    },
  };
}

/** JWT identity is display-only; decoding does not validate a login or grant access. */
function readAuthEmail(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1].length > MAX_AUTH_BYTES) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    // Opaque/malformed tokens can still be saved; they provide no display identity.
    return null;
  }
  if (!isRecord(payload)) return null;
  const profile = payload["https://api.openai.com/profile"];
  const email = payload.email ?? (isRecord(profile) ? profile.email : null);
  return typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(
      email,
    )
    ? email
    : null;
}

function parseAuth(raw: unknown): ParsedAuth {
  if (typeof raw !== "string") {
    throw new Error("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_AUTH_BYTES) {
    throw new Error("AGENT_CODEX_ACCOUNT_AUTH_TOO_LARGE");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
  }
  if (!isRecord(value) || !isRecord(value.tokens)) {
    throw new Error("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
  }
  const accessToken = value.tokens.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("AGENT_CODEX_ACCOUNT_AUTH_INVALID");
  }
  const accountId = value.tokens.account_id;
  return {
    raw,
    digest: createHash("sha256").update(raw).digest("hex"),
    accountId:
      typeof accountId === "string" && accountId.trim()
        ? accountId.trim()
        : null,
    accountKey:
      typeof accountId === "string" && accountId.trim()
        ? createHash("sha256").update(accountId.trim()).digest("hex")
        : null,
    email: readAuthEmail(value.tokens.id_token) ?? readAuthEmail(accessToken),
  };
}

function parseVault(raw: string): PersistedVault {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
  }
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    !Array.isArray(value.accounts) ||
    value.accounts.length > MAX_ACCOUNTS ||
    !value.accounts.every(isPersistedAccount)
  ) {
    throw new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
  }
  if (
    value.pendingAccountId !== undefined &&
    (typeof value.pendingAccountId !== "string" ||
      !value.accounts.some(
        (account) =>
          account.id === value.pendingAccountId && account.ciphertext === null,
      ))
  ) {
    throw new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
  }
  return {
    version: 2,
    accounts: value.accounts,
    ...(typeof value.pendingAccountId === "string"
      ? { pendingAccountId: value.pendingAccountId }
      : {}),
  };
}

function isPersistedAccount(value: unknown): value is PersistedAccount {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    (value.maskedAccountId === null ||
      typeof value.maskedAccountId === "string") &&
    (value.accountKey === null || typeof value.accountKey === "string") &&
    ((typeof value.authDigest === "string" &&
      typeof value.ciphertext === "string") ||
      (value.authDigest === null &&
        value.ciphertext === null &&
        value.accountKey === null &&
        value.maskedAccountId === null)) &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function publicAccount(
  account: PersistedAccount,
  isActive: boolean,
): AgentCodexAccountSummary {
  return {
    id: account.id,
    label: account.label,
    maskedAccountId: account.maskedAccountId,
    hasAuth: account.ciphertext !== null,
    isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function isCurrentAccount(
  account: PersistedAccount,
  current: ParsedAuth | null,
): boolean {
  if (!current) return false;
  return (
    account.authDigest === current.digest ||
    (account.accountKey !== null && account.accountKey === current.accountKey)
  );
}

function requireLabel(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > MAX_LABEL_LENGTH ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error("AGENT_CODEX_ACCOUNT_LABEL_INVALID");
  }
  return value.trim();
}

function requireId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  ) {
    throw new Error("AGENT_CODEX_ACCOUNT_REQUEST_INVALID");
  }
  return value;
}

function maskAccountId(accountId: string | null): string | null {
  if (!accountId) return null;
  return `••••${accountId.slice(-6)}`;
}

function autoLabel(accountId: string | null): string {
  return accountId
    ? `Codex ${maskAccountId(accountId)}`
    : "Previous Codex account";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function publicVaultError(error: unknown): Error {
  return error instanceof Error && error.message.startsWith("AGENT_CODEX_")
    ? error
    : new Error("AGENT_CODEX_ACCOUNT_VAULT_INVALID");
}

async function readRawIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600).catch(() => undefined);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function restoreNative(
  filePath: string,
  previousRaw: string | null,
): Promise<void> {
  if (previousRaw === null) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await atomicWrite(filePath, previousRaw);
}

async function enqueueMutation<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = mutationTails.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  mutationTails.set(key, tail);
  void tail.finally(() => {
    if (mutationTails.get(key) === tail) mutationTails.delete(key);
  });
  return result;
}

async function waitForMutations(key: string): Promise<void> {
  await mutationTails.get(key);
}
