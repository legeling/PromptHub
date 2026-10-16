import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Entry } from "@napi-rs/keyring";

export const DEVICE_MASTER_KEY_BYTES = 32;

export interface DeviceMasterKeyStore {
  read(keyId: string): Buffer | null;
  write(keyId: string, key: Buffer): void;
}

function entry(service: string, keyId: string): Entry {
  // Keep the native addon external in app bundles and load it only for secret access.
  const requireNative = createRequire(
    typeof __filename === "string"
      ? __filename
      : fileURLToPath(import.meta.url),
  );
  const native: typeof import("@napi-rs/keyring") =
    requireNative("@napi-rs/keyring");
  return new native.Entry(service, keyId, {
    linux: { store: "secret-service" },
  });
}

export function createDeviceMasterKeyStore(
  service: string,
): DeviceMasterKeyStore {
  return {
    read(keyId) {
      const value = entry(service, keyId).getPassword();
      if (value === null) return null;
      const key = Buffer.from(value, "base64");
      if (
        key.length !== DEVICE_MASTER_KEY_BYTES ||
        key.toString("base64") !== value
      )
        throw new Error("Invalid device master key");
      return key;
    },
    write(keyId, key) {
      if (key.length !== DEVICE_MASTER_KEY_BYTES)
        throw new Error("Invalid device master key");
      entry(service, keyId).setPassword(key.toString("base64"));
    },
  };
}
