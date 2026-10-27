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
  it("detects Antigravity CLI before its shared configuration directory exists", async () => {
    const detected = await detectInstalledPlatforms({
      pathExists: vi.fn().mockResolvedValue(false),
      resolveExecutable: vi.fn(async (candidate: string) =>
        candidate === "agy" ? "/Users/test/.local/bin/agy" : null,
      ),
    });
    expect(detected).toContain("antigravity-cli");
    expect(detected).not.toContain("antigravity");
  });

  it("does not infer Antigravity from an unrelated Gemini root", async () => {
    const detected = await detectInstalledPlatforms({
      pathExists: vi.fn(async (candidate: string) =>
        candidate.endsWith("/.gemini"),
      ),
      resolveExecutable: vi.fn().mockResolvedValue(null),
    });
    expect(detected).not.toContain("antigravity");
  });
  it("does not infer desktop installation from shared customization files", async () => {
    const detected = await detectInstalledPlatforms({
      pathExists: async (candidate) => candidate.endsWith("/.gemini/config"),
      resolveExecutable: async () => null,
    });
    expect(detected).not.toContain("antigravity");
    expect(detected).not.toContain("antigravity-cli");
  });
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
