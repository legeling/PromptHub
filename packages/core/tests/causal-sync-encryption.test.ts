import { expect, it } from "vitest";
import {
  encryptData,
  decryptData,
} from "@prompthub/shared/utils/sync-encryption";

it("round-trips Unicode with random ciphertext and rejects a wrong key or altered salt, IV, body and tag", async () => {
  const content = "完整内容 🦌 " + "data".repeat(40),
    password = "test-only-password";
  const encrypted = await encryptData(content, password);
  expect(await decryptData(encrypted, password)).toBe(content);
  expect(await encryptData(content, password)).not.toBe(encrypted);
  await expect(decryptData(encrypted, "wrong")).rejects.toThrow();
  // Offsets describe the established wire format: 16-byte salt, 12-byte IV, then GCM body/tag.
  const bytes = Buffer.from(encrypted, "base64");
  for (const offset of [0, 16, 28, bytes.length - 1]) {
    const altered = Buffer.from(bytes);
    altered[offset] ^= 1;
    await expect(
      decryptData(altered.toString("base64"), password),
    ).rejects.toThrow();
  }
  await expect(decryptData("AA==", password)).rejects.toThrow();
});
