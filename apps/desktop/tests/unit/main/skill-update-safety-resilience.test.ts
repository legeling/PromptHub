import { describe, expect, it, vi } from "vitest";
import { scanSkillSafety } from "../../../src/main/services/skill-safety-scan";
describe("manual assessment failure isolation", () => {
  it("rejects missing opt-in even with a configured AI provider", async () => {
    const aiChat = vi.fn();
    await expect(
      scanSkillSafety({ aiConfig: { apiKey: "test" } as never }, { aiChat }),
    ).rejects.toThrow("SAFETY_SCAN_DISABLED");
    expect(aiChat).not.toHaveBeenCalled();
  });
  it("validates explicit AI configuration before opening a package", async () => {
    const readRepoFiles = vi.fn();
    await expect(
      scanSkillSafety(
        { enabled: true, method: "ai", localRepoPath: "/not-opened" },
        { readRepoFiles },
      ),
    ).rejects.toThrow("AI_NOT_CONFIGURED");
    expect(readRepoFiles).not.toHaveBeenCalled();
  });
});
