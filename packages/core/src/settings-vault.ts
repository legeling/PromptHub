import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  createDeviceMasterKeyStore,
  DEVICE_MASTER_KEY_BYTES,
  type DeviceMasterKeyStore,
} from "./device-keyring";
import { deriveLocalResourceDeviceId } from "./storage-root-identity";

const VAULT_KIND = "prompthub-device-secret-vault";
const VAULT_VERSION = 2;
const KEYRING_SERVICE = "PromptHub.Settings";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface SettingsVaultDocument {
  kind: typeof VAULT_KIND;
  version: typeof VAULT_VERSION;
  keyId: string;
  payload: { iv: string; authTag: string; ciphertext: string } | null;
}

export class SettingsCredentialError extends Error {
  readonly code = "SETTINGS_SECRET_STORE_UNAVAILABLE";
  constructor(cause?: unknown) {
    super("Settings device credential store is unavailable", { cause });
  }
}

export function createSettingsMasterKeyStore(): DeviceMasterKeyStore {
  return createDeviceMasterKeyStore(KEYRING_SERVICE);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid settings vault");
  return value as Record<string, unknown>; // Object shape is checked before field validation.
}

function base64(value: unknown, length?: number): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error("Invalid settings vault encoding");
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.toString("base64") !== value ||
    (length !== undefined && bytes.length !== length)
  )
    throw new Error("Invalid settings vault encoding");
  return value;
}

export function parseSettingsVault(value: unknown): SettingsVaultDocument {
  const document = record(value);
  if (
    document.kind !== VAULT_KIND ||
    document.version !== VAULT_VERSION ||
    typeof document.keyId !== "string" ||
    !document.keyId ||
    /[\u0000-\u001f]/.test(document.keyId)
  )
    throw new Error("Invalid or unsupported settings vault");
  const payload = document.payload === null ? null : record(document.payload);
  return {
    kind: VAULT_KIND,
    version: VAULT_VERSION,
    keyId: document.keyId,
    payload:
      payload === null
        ? null
        : {
            iv: base64(payload.iv, IV_BYTES),
            authTag: base64(payload.authTag, AUTH_TAG_BYTES),
            ciphertext: base64(payload.ciphertext),
          },
  };
}

function masterKey(
  keyId: string,
  store: DeviceMasterKeyStore,
  allowCreation: boolean,
): Buffer {
  try {
    let key = store.read(keyId);
    if (key === null && allowCreation) {
      key = randomBytes(DEVICE_MASTER_KEY_BYTES);
      store.write(keyId, key);
    }
    if (key === null || key.length !== DEVICE_MASTER_KEY_BYTES)
      throw new Error("Missing device master key");
    return key;
  } catch (cause) {
    throw new SettingsCredentialError(cause);
  }
}

function associatedData(keyId: string): Buffer {
  return Buffer.from(
    JSON.stringify([VAULT_KIND, VAULT_VERSION, keyId]),
    "utf8",
  );
}

function secretMap(value: unknown): Record<string, string> {
  const entries = Object.entries(record(value));
  const result: Record<string, string> = {};
  for (const [ref, secret] of entries) {
    if (!ref || ref.includes("\0") || typeof secret !== "string")
      throw new Error("Invalid settings vault secret");
    Object.defineProperty(result, ref, {
      value: secret,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

export function encryptSettingsVault(
  secrets: Record<string, string>,
  previous: SettingsVaultDocument | null,
  rootPath: string,
  store: DeviceMasterKeyStore,
): SettingsVaultDocument {
  const current = previous === null ? null : parseSettingsVault(previous);
  const keyId =
    current?.keyId ?? `settings:${deriveLocalResourceDeviceId(rootPath)}`;
  const document: SettingsVaultDocument = {
    kind: VAULT_KIND,
    version: VAULT_VERSION,
    keyId,
    payload: null,
  };
  const values = secretMap(secrets);
  if (Object.keys(values).length === 0) return document;
  const key = masterKey(
    keyId,
    store,
    current === null || current.payload === null,
  );
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(keyId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(values), "utf8"),
    cipher.final(),
  ]);
  document.payload = {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return document;
}

export function decryptSettingsVault(
  value: SettingsVaultDocument,
  store: DeviceMasterKeyStore,
): Record<string, string> {
  const document = parseSettingsVault(value);
  if (document.payload === null) return {};
  const key = masterKey(document.keyId, store, false);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(document.payload.iv, "base64"),
  );
  decipher.setAAD(associatedData(document.keyId));
  decipher.setAuthTag(Buffer.from(document.payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(document.payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Invalid decrypted settings vault");
  }
  return secretMap(parsed);
}
