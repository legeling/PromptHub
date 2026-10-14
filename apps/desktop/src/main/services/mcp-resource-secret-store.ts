import crypto from "crypto";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";

import type {
  CanonicalMcpSecretStore,
  ExtractedMcpSecret,
} from "@prompthub/core";

const STORE_KIND = "prompthub-mcp-resource-secret-store";
const MAX_REF_LENGTH = 512;
const MAX_VALUE_BYTES = 64 * 1024;
const mutationTails = new Map<string, Promise<void>>();

export interface McpResourceSecretEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface McpResourceSecretStore {
  read(ref: string): Promise<string | null>;
  writeMany(secrets: readonly ExtractedMcpSecret[]): Promise<void>;
}

interface PersistedMcpResourceSecrets {
  kind: typeof STORE_KIND;
  version: 1;
  secrets: Record<string, string>;
}

function normalizeRef(ref: string): string {
  if (
    typeof ref !== "string" ||
    ref.length === 0 ||
    ref.length > MAX_REF_LENGTH ||
    /[\u0000-\u0020\u007f]/u.test(ref)
  ) {
    throw new Error("MCP_RESOURCE_SECRET_STORE_REF_INVALID");
  }
  return ref;
}

function assertValue(value: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES
  ) {
    throw new Error("MCP_RESOURCE_SECRET_STORE_VALUE_INVALID");
  }
}

function requireEncryption(encryption: McpResourceSecretEncryption): void {
  if (!encryption.isEncryptionAvailable()) {
    throw new Error("MCP_RESOURCE_SECRET_STORE_UNAVAILABLE");
  }
}

function parseStore(raw: string): PersistedMcpResourceSecrets {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("MCP_RESOURCE_SECRET_STORE_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MCP_RESOURCE_SECRET_STORE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind !== STORE_KIND ||
    record.version !== 1 ||
    !record.secrets ||
    typeof record.secrets !== "object" ||
    Array.isArray(record.secrets) ||
    Object.entries(record.secrets).some(
      ([ref, encrypted]) =>
        normalizeRef(ref) !== ref ||
        typeof encrypted !== "string" ||
        !/^[a-zA-Z0-9+/]*={0,2}$/u.test(encrypted),
    )
  ) {
    throw new Error("MCP_RESOURCE_SECRET_STORE_INVALID");
  }
  return {
    kind: STORE_KIND,
    version: 1,
    secrets: record.secrets as Record<string, string>,
  };
}

async function load(filePath: string): Promise<PersistedMcpResourceSecrets> {
  try {
    return parseStore(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: STORE_KIND, version: 1, secrets: {} };
    }
    throw error;
  }
}

async function publish(
  filePath: string,
  value: PersistedMcpResourceSecrets,
): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const descriptor = await fs.open(temporaryPath, "wx", 0o600);
    try {
      await descriptor.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await descriptor.sync();
    } finally {
      await descriptor.close();
    }
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function enqueue<T>(
  filePath: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const previous = mutationTails.get(filePath) ?? Promise.resolve();
  const result = previous.then(mutation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  mutationTails.set(filePath, tail);
  void tail.finally(() => {
    if (mutationTails.get(filePath) === tail) mutationTails.delete(filePath);
  });
  return result;
}

export function createMcpResourceSecretStore(options: {
  filePath: string;
  encryption: McpResourceSecretEncryption;
}): McpResourceSecretStore {
  const filePath = path.resolve(options.filePath);
  return {
    async read(ref) {
      const normalized = normalizeRef(ref);
      await mutationTails.get(filePath);
      const encrypted = (await load(filePath)).secrets[normalized];
      if (!encrypted) return null;
      requireEncryption(options.encryption);
      const value = options.encryption.decryptString(
        Buffer.from(encrypted, "base64"),
      );
      assertValue(value);
      return value;
    },

    async writeMany(secrets) {
      if (secrets.length === 0) return;
      requireEncryption(options.encryption);
      const incoming = new Map<string, string>();
      for (const secret of secrets) {
        const ref = normalizeRef(secret.ref);
        assertValue(secret.value);
        const previous = incoming.get(ref);
        if (previous !== undefined && previous !== secret.value) {
          throw new Error("MCP_RESOURCE_SECRET_STORE_CONFLICT");
        }
        incoming.set(ref, secret.value);
      }
      await enqueue(filePath, async () => {
        const persisted = await load(filePath);
        for (const [ref, value] of incoming) {
          const encrypted = persisted.secrets[ref];
          if (encrypted) {
            const current = options.encryption.decryptString(
              Buffer.from(encrypted, "base64"),
            );
            if (current !== value) {
              throw new Error("MCP_RESOURCE_SECRET_STORE_CONFLICT");
            }
            continue;
          }
          persisted.secrets[ref] = options.encryption
            .encryptString(value)
            .toString("base64");
        }
        await publish(filePath, persisted);
      });
    },
  };
}

export function createCanonicalMcpResourceSecretStore(options: {
  filePath: string;
  encryption: McpResourceSecretEncryption;
}): CanonicalMcpSecretStore {
  const filePath = path.resolve(options.filePath);

  function loadSync(): PersistedMcpResourceSecrets {
    try {
      const stats = fsSync.lstatSync(filePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error("MCP_RESOURCE_SECRET_STORE_INVALID");
      }
      return parseStore(fsSync.readFileSync(filePath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: STORE_KIND, version: 1, secrets: {} };
      }
      throw error;
    }
  }

  return {
    filePath,
    read(ref) {
      const encrypted = loadSync().secrets[normalizeRef(ref)];
      if (!encrypted) return null;
      requireEncryption(options.encryption);
      const value = options.encryption.decryptString(
        Buffer.from(encrypted, "base64"),
      );
      assertValue(value);
      return value;
    },
    prepareUpdate(stagePath, input) {
      const persisted = loadSync();
      if (input.secrets.length > 0) requireEncryption(options.encryption);
      const next: PersistedMcpResourceSecrets = {
        kind: STORE_KIND,
        version: 1,
        secrets: Object.fromEntries(
          Object.entries(persisted.secrets).filter(([ref]) =>
            input.retainRefs.has(ref),
          ),
        ),
      };
      for (const secret of input.secrets) {
        const ref = normalizeRef(secret.ref);
        assertValue(secret.value);
        const encrypted = next.secrets[ref];
        if (encrypted) {
          const current = options.encryption.decryptString(
            Buffer.from(encrypted, "base64"),
          );
          if (current !== secret.value) {
            throw new Error("MCP_RESOURCE_SECRET_STORE_CONFLICT");
          }
          continue;
        }
        next.secrets[ref] = options.encryption
          .encryptString(secret.value)
          .toString("base64");
      }
      fsSync.mkdirSync(path.dirname(stagePath), {
        recursive: true,
        mode: 0o700,
      });
      const descriptor = fsSync.openSync(stagePath, "wx", 0o600);
      try {
        fsSync.writeFileSync(
          descriptor,
          `${JSON.stringify(next, null, 2)}\n`,
          "utf8",
        );
        fsSync.fsyncSync(descriptor);
      } finally {
        fsSync.closeSync(descriptor);
      }
    },
  };
}

export function createLegacyMcpResourceSecretReader(options: {
  filePath: string;
  encryption: McpResourceSecretEncryption;
}): (ref: string) => string | null {
  let snapshot: PersistedMcpResourceSecrets | null = null;
  const decoded = new Map<string, string>();
  return (ref) => {
    const normalized = normalizeRef(ref);
    const cached = decoded.get(normalized);
    if (cached !== undefined) return cached;
    if (snapshot === null) {
      try {
        const stat = fsSync.lstatSync(options.filePath);
        if (!stat.isFile() || stat.isSymbolicLink())
          throw new Error("MCP_RESOURCE_SECRET_STORE_INVALID");
        snapshot = parseStore(fsSync.readFileSync(options.filePath, "utf8"));
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw error;
        snapshot = { kind: STORE_KIND, version: 1, secrets: {} };
      }
    }
    const encrypted = snapshot.secrets[normalized];
    if (!encrypted) return null;
    requireEncryption(options.encryption);
    let value: string;
    try {
      value = options.encryption.decryptString(
        Buffer.from(encrypted, "base64"),
      );
    } catch (cause) {
      throw new Error("MCP_RESOURCE_SECRET_STORE_UNAVAILABLE", { cause });
    }
    assertValue(value);
    decoded.set(normalized, value);
    return value;
  };
}
