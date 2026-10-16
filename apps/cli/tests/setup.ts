import { vi } from "vitest";

// runCli resets runtime paths. A subsequent direct init must not open the real profile.
vi.mock("@prompthub/core/database", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@prompthub/core/database")>();
  const paths = await import("@prompthub/core/runtime-paths");
  const defaultRoot = paths.getUserDataPath();
  return {
    ...actual,
    initDatabase: vi.fn((...args: Parameters<typeof actual.initDatabase>) => {
      if (paths.getUserDataPath() === defaultRoot) {
        throw new Error("CLI tests require an isolated data directory");
      }
      return actual.initDatabase(...args);
    }),
  };
});

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
