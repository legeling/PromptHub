import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDeviceMasterKeyStore,
  DEVICE_MASTER_KEY_BYTES,
} from "../src/device-keyring";
import {
  createMcpMasterKeyStore,
  McpCredentialError,
} from "../src/mcp-credentials";

const native = vi.hoisted(() => {
  const passwords = new Map<string, string>();
  const identities: Array<{ service: string; id: string; options: unknown }> =
    [];
  class Entry {
    constructor(
      private service: string,
      private id: string,
      options: unknown,
    ) {
      identities.push({ service, id, options });
    }
    getPassword(): string | null {
      return passwords.get(`${this.service}/${this.id}`) ?? null;
    }
    setPassword(value: string): void {
      passwords.set(`${this.service}/${this.id}`, value);
    }
  }
  return { passwords, identities, Entry };
});

vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  return {
    ...actual,
    createRequire: () => (id: string) => {
      if (id !== "@napi-rs/keyring")
        throw new Error("Unexpected native fixture import");
      return { Entry: native.Entry };
    },
  };
});

beforeEach(() => {
  native.passwords.clear();
  native.identities.splice(0);
});

describe("native device master key boundary", () => {
  it("keeps service namespaces separate and round-trips binary keys", () => {
    const left = createDeviceMasterKeyStore("PromptHub.Settings");
    const right = createDeviceMasterKeyStore("PromptHub.MCP");
    const key = Buffer.alloc(DEVICE_MASTER_KEY_BYTES, 7);
    expect(left.read("profile")).toBeNull();
    left.write("profile", key);
    expect(left.read("profile")).toEqual(key);
    expect(right.read("profile")).toBeNull();
    expect(native.identities).toContainEqual({
      service: "PromptHub.Settings",
      id: "profile",
      options: { linux: { store: "secret-service" } },
    });
  });

  it("preserves the MCP service identity and its existing error contract", () => {
    const encoded = Buffer.alloc(DEVICE_MASTER_KEY_BYTES, 3).toString("base64");
    native.passwords.set("PromptHub.MCP/existing", encoded);
    const store = createMcpMasterKeyStore();
    expect(store.read("existing")?.toString("base64")).toBe(encoded);
    native.passwords.set("PromptHub.MCP/existing", "invalid key");
    expect(() => store.read("existing")).toThrow(McpCredentialError);
  });

  it("rejects malformed key lengths and encodings without overwriting the stored value", () => {
    const store = createDeviceMasterKeyStore("fixture");
    native.passwords.set("fixture/profile", "not-base64");
    expect(() => store.read("profile")).toThrow(/master key/);
    expect(() =>
      store.write("profile", Buffer.alloc(DEVICE_MASTER_KEY_BYTES - 1)),
    ).toThrow(/master key/);
    expect(native.passwords.get("fixture/profile")).toBe("not-base64");
  });
});
