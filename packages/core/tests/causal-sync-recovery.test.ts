import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { preserveSyncResolution } from "../src/causal-sync/recovery";
import { syncPayload } from "../src/causal-sync/payload";

it("verifies retained recovery bytes before allowing a repeated resolution", async () => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-recovery-"));
  try {
    const payload = syncPayload("prompt", "id", { title: "preserve this" }, []);
    const input = {
      rootPath,
      token: "a".repeat(64),
      local: [payload],
      remote: null,
      headPath: "head",
      store: {
        downloadText: async () => ({ success: false, notFound: true }),
        uploadText: async () => ({ success: true }),
        deleteText: async () => ({ success: true }),
      },
    };
    await preserveSyncResolution(input);
    await preserveSyncResolution(input);
    const file = path.join(
      rootPath,
      "recovery",
      "causal-sync",
      input.token,
      "objects",
      payload.contentHash,
    );
    fs.writeFileSync(file, "corrupt");
    await expect(preserveSyncResolution(input)).rejects.toThrow(/recovery/);
    expect(fs.readFileSync(file, "utf8")).toBe("corrupt");
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});
