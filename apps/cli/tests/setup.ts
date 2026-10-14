import { vi } from "vitest";

// Keep CLI integration tests off the user's OS keychain; encryption remains real.
vi.mock("@prompthub/core/mcp-credentials", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@prompthub/core/mcp-credentials")>();
  const keys = new Map<string, Buffer>();
  return {
    ...actual,
    createMcpMasterKeyStore: () => ({
      read: (id: string) => keys.get(id) ?? null,
      write: (id: string, key: Buffer) => {
        keys.set(id, Buffer.from(key));
      },
    }),
  };
});
