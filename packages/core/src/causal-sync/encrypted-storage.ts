import type { RemoteTextStorage } from "@prompthub/shared/types/remote-sync";
import {
  decryptData,
  encryptData,
} from "@prompthub/shared/utils/sync-encryption";

/** Conditional tokens continue to identify ciphertext; only payload bodies are decoded. */
export function encryptedSyncStorage(
  store: RemoteTextStorage,
  password: string,
): RemoteTextStorage {
  if (!password) throw new Error("Sync encryption requires a password");
  return {
    uploadText: async (key, text, condition) =>
      store.uploadText(key, await encryptData(text, password), condition),
    async downloadText(key) {
      const result = await store.downloadText(key);
      if (!result.success || typeof result.data !== "string") return result;
      return { ...result, data: await decryptData(result.data, password) };
    },
    deleteText: (key) => store.deleteText(key),
  };
}
