import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "../../../src/main/database";

import { detectInstalledPlatforms } from "../../../src/main/services/skill-installer-platform";

beforeEach(() => {
  initDatabase();
});
afterEach(() => {
  closeDatabase();
});

describe("Agent platform detection", () => {
  it("detects plugin Harness agents by CLI even before the profile root exists", async () => {
    const detected = await detectInstalledPlatforms({
      pathExists: vi.fn().mockResolvedValue(false),
      resolveExecutable: vi.fn(async (candidate: string) =>
        candidate === "dsh" ? "/usr/local/bin/dsh" : null,
      ),
    });

    expect(detected).toContain("deepseek-harness");
  });
});
