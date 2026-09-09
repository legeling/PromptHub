import { describe, expect, it, vi } from "vitest";
import { scanSkillSafety } from "../../../src/main/services/skill-safety-scan";

vi.mock("../../../src/main/services/ai-client", () => ({
  chatCompletion: vi.fn(),
}));

describe("explicit standalone Skill scanning", () => {
  it("rejects absent or disabled opt-in before reading content or calling AI", async () => {
    const readRepoFiles = vi.fn();
    const aiChat = vi.fn();
    for (const enabled of [undefined, false]) {
      await expect(
        scanSkillSafety(
          { enabled, localRepoPath: "/not-read" },
          { readRepoFiles, aiChat },
        ),
      ).rejects.toThrow("SAFETY_SCAN_DISABLED");
    }
    expect(readRepoFiles).not.toHaveBeenCalled();
    expect(aiChat).not.toHaveBeenCalled();
  });

  it("runs static content analysis without credentials or any source dependency", async () => {
    const aiChat = vi.fn();
    const report = await scanSkillSafety(
      {
        enabled: true,
        method: "static",
        content: "# Skill\nsudo is documented here",
        sourceUrl: "http://127.0.0.1/offline",
      },
      { aiChat, now: () => 5 },
    );
    expect(report).toMatchObject({
      level: "safe",
      scanMethod: "preflight",
      findings: [],
      scannedAt: 5,
    });
    expect(aiChat).not.toHaveBeenCalled();
  });

  it("sends the same content-only AI request regardless of provenance", async () => {
    const aiChat = vi
      .fn()
      .mockResolvedValue({
        content: JSON.stringify({
          level: "safe",
          summary: "Content reviewed",
          findings: [],
          recommendedAction: "allow",
        }),
      });
    const config = {
      provider: "openai",
      apiProtocol: "openai" as const,
      apiKey: "test-key",
      apiUrl: "https://model.invalid/v1",
      model: "test-model",
    };
    for (const sourceUrl of [
      "https://github.com/team/skill",
      "http://private.invalid/team",
    ]) {
      const report = await scanSkillSafety(
        {
          enabled: true,
          method: "ai",
          content: "# Identical content",
          sourceUrl,
          contentUrl: sourceUrl,
          securityAudits: [sourceUrl],
          aiConfig: config,
        },
        { aiChat },
      );
      expect(report.scanMethod).toBe("ai");
    }
    expect(aiChat.mock.calls[0]).toEqual(aiChat.mock.calls[1]);
    expect(JSON.stringify(aiChat.mock.calls[0])).not.toContain(
      "private.invalid",
    );
    expect(JSON.stringify(aiChat.mock.calls[0])).not.toContain(
      "github.com/team",
    );
  });

  it("does not label static fallback as a successful AI assessment", async () => {
    await expect(
      scanSkillSafety({ enabled: true, method: "ai", content: "# Skill" }),
    ).rejects.toThrow("AI_NOT_CONFIGURED");
  });
});
