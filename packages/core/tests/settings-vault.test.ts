import { describe, expect, it, vi } from "vitest";
import {
  decryptSettingsVault,
  encryptSettingsVault,
  parseSettingsVault,
} from "../src/settings-vault";
import {
  DEVICE_MASTER_KEY_BYTES,
  type DeviceMasterKeyStore,
} from "../src/device-keyring";

function keyStore(): DeviceMasterKeyStore & { keys: Map<string, Buffer> } {
  const keys = new Map<string, Buffer>();
  return {
    keys,
    read: vi.fn((id) => keys.get(id) ?? null),
    write: vi.fn((id, value) => {
      keys.set(id, Buffer.from(value));
    }),
  };
}

describe("shared device settings vault", () => {
  it("round-trips credentials with authenticated randomized encryption and preserves profile identity across a move", () => {
    const store = keyStore();
    const secrets = {
      "renderer:githubToken": "synthetic-secret-密钥",
      "renderer:ai-provider:p:api-key": "another-secret",
    };
    const first = encryptSettingsVault(secrets, null, "/profile", store);
    const second = encryptSettingsVault(
      secrets,
      first,
      "/moved-profile",
      store,
    );
    expect(second.keyId).toBe(first.keyId);
    expect(second.payload?.iv).not.toBe(first.payload?.iv);
    expect(JSON.stringify(first)).not.toContain(
      secrets["renderer:githubToken"],
    );
    expect(JSON.stringify(first)).not.toContain("renderer:githubToken");
    expect(
      decryptSettingsVault(
        parseSettingsVault(JSON.parse(JSON.stringify(first))),
        store,
      ),
    ).toEqual(secrets);
    expect(decryptSettingsVault(second, store)).toEqual(secrets);
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it("does not require a system credential store for an empty vault", () => {
    const store = keyStore();
    const vault = encryptSettingsVault({}, null, "/profile", store);
    expect(vault.payload).toBeNull();
    expect(decryptSettingsVault(vault, store)).toEqual({});
    expect(store.read).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects a missing existing key without generating a replacement", () => {
    const original = keyStore();
    const vault = encryptSettingsVault(
      { secret: "value" },
      null,
      "/profile",
      original,
    );
    const missing = keyStore();
    expect(() => decryptSettingsVault(vault, missing)).toThrow(
      /credential store/i,
    );
    expect(() =>
      encryptSettingsVault(
        { secret: "replacement" },
        vault,
        "/profile",
        missing,
      ),
    ).toThrow(/credential store/i);
    expect(missing.write).not.toHaveBeenCalled();
  });

  it("rejects a wrong device key", () => {
    const store = keyStore();
    const vault = encryptSettingsVault(
      { secret: "value" },
      null,
      "/profile",
      store,
    );
    store.keys.set(vault.keyId, Buffer.alloc(DEVICE_MASTER_KEY_BYTES, 9));
    expect(() => decryptSettingsVault(vault, store)).toThrow();
  });

  it.each(["iv", "authTag", "ciphertext"] as const)(
    "rejects tampering with %s",
    (field) => {
      const store = keyStore();
      const vault = encryptSettingsVault(
        { secret: "value" },
        null,
        "/profile",
        store,
      );
      if (vault.payload === null) throw new Error("Expected encrypted fixture");
      const bytes = Buffer.from(vault.payload[field], "base64");
      bytes[0] ^= 1;
      const changed = {
        ...vault,
        payload: { ...vault.payload, [field]: bytes.toString("base64") },
      };
      expect(() => decryptSettingsVault(changed, store)).toThrow();
    },
  );

  it("rejects unsupported formats, invalid lengths and noncanonical encodings before key access", () => {
    const store = keyStore();
    const vault = encryptSettingsVault(
      { secret: "value" },
      null,
      "/profile",
      store,
    );
    expect(() => parseSettingsVault({ ...vault, version: 99 })).toThrow(
      /vault/i,
    );
    expect(() =>
      parseSettingsVault({
        ...vault,
        payload: { ...vault.payload, iv: "AA==" },
      }),
    ).toThrow(/vault/i);
    expect(() =>
      parseSettingsVault({
        ...vault,
        payload: { ...vault.payload, ciphertext: "%%invalid" },
      }),
    ).toThrow(/vault/i);
  });
});
