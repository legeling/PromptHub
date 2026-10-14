import { expect, it } from "vitest";
import {
  decryptMcpSecret,
  encryptMcpSecret,
  type McpMasterKeyStore,
} from "../src/mcp-credentials";

it("encrypts every value with an independent authenticated IV and binds it to its reference", () => {
  const keys = new Map<string, Buffer>();
  const store: McpMasterKeyStore = {
    read: (id) => keys.get(id) ?? null,
    write: (id, value) => {
      keys.set(id, Buffer.from(value));
    },
  };
  const input = { ref: "fixture", serverId: "server", keyId: "test-key" };
  const first = encryptMcpSecret(input, "credential-value", store);
  const second = encryptMcpSecret(input, "credential-value", store);
  expect(first.iv).not.toBe(second.iv);
  expect(first.ciphertext).not.toContain("credential-value");
  expect(decryptMcpSecret(first, store)).toBe("credential-value");
  expect(() => decryptMcpSecret({ ...first, ref: "other" }, store)).toThrow();
  expect(() => decryptMcpSecret(first, { ...store, read: () => null })).toThrow(
    /unavailable/i,
  );
});
