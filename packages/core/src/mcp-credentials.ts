import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { McpEncryptedSecret } from "@prompthub/shared/types/mcp-storage";

import {
  createDeviceMasterKeyStore,
  DEVICE_MASTER_KEY_BYTES,
  type DeviceMasterKeyStore,
} from "./device-keyring";
const IV_BYTES = 12;
const KEYRING_SERVICE = "PromptHub.MCP";

export type McpMasterKeyStore = DeviceMasterKeyStore;
export class McpCredentialError extends Error {
  readonly code = "MCP_RESOURCE_SECRET_STORE_UNAVAILABLE";
  constructor(cause?: unknown) {
    super("MCP device credential store is unavailable", { cause });
  }
}
export function createMcpMasterKeyStore(): McpMasterKeyStore {
  const store = createDeviceMasterKeyStore(KEYRING_SERVICE);
  return {
    read(keyId) {
      try {
        return store.read(keyId);
      } catch (cause) {
        throw new McpCredentialError(cause);
      }
    },
    write(keyId, key) {
      try {
        store.write(keyId, key);
      } catch (cause) {
        throw new McpCredentialError(cause);
      }
    },
  };
}
function readKey(
  id: string,
  store: McpMasterKeyStore,
  create: boolean,
): Buffer {
  let key = store.read(id);
  if (key === null && create) {
    key = randomBytes(DEVICE_MASTER_KEY_BYTES);
    store.write(id, key);
  }
  if (key === null || key.length !== DEVICE_MASTER_KEY_BYTES)
    throw new McpCredentialError();
  return key;
}
function associatedData(
  secret: Pick<McpEncryptedSecret, "serverId" | "ref" | "keyId">,
): Buffer {
  return Buffer.from(
    JSON.stringify([secret.serverId, secret.ref, secret.keyId]),
    "utf8",
  );
}
export function encryptMcpSecret(
  identity: Pick<McpEncryptedSecret, "serverId" | "ref" | "keyId">,
  value: string,
  store: McpMasterKeyStore,
  allowKeyCreation = true,
): McpEncryptedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    readKey(identity.keyId, store, allowKeyCreation),
    iv,
  );
  cipher.setAAD(associatedData(identity));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ...identity,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}
export function decryptMcpSecret(
  secret: McpEncryptedSecret,
  store: McpMasterKeyStore,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    readKey(secret.keyId, store, false),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAAD(associatedData(secret));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
