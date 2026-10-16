import { vi } from "vitest";

// These tests exercise real SQL, publication and AES-GCM. Only the OS keychain
// boundary is substituted so synthetic profiles never touch the user's keychain.
vi.mock("../../src/settings-vault", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/settings-vault")>();
  const keys = new Map<string, Buffer>();
  return {
    ...original,
    createSettingsMasterKeyStore: () => ({
      read: (id: string): Buffer | null => keys.get(id) ?? null,
      write: (id: string, key: Buffer): void => {
        keys.set(id, Buffer.from(key));
      },
    }),
  };
});
