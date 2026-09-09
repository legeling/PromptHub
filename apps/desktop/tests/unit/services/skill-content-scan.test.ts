import { beforeEach, describe, expect, it, vi } from "vitest";
const settings = vi.hoisted(() => ({
  skillSafetyScanEnabled: false,
  skillSafetyScanMethod: "static",
  aiModels: [],
}));
vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: { getState: () => settings },
}));
vi.mock("../../../src/renderer/stores/skill/skill-store-domain", () => ({
  getSafetyScanAIConfig: () => ({
    apiKey: "test",
    apiUrl: "https://model.invalid",
    model: "test",
  }),
}));
import { runSkillContentSafetyScan } from "../../../src/renderer/services/skill-content-scan";

describe("manual content scan entry", () => {
  beforeEach(() => {
    settings.skillSafetyScanEnabled = false;
    settings.skillSafetyScanMethod = "static";
    window.api.skill.scanSafety = vi.fn().mockResolvedValue({ level: "safe" });
  });
  it("does not invoke IPC while disabled", async () => {
    await expect(
      runSkillContentSafetyScan({ enabled: true, content: "x" }),
    ).rejects.toThrow("SAFETY_SCAN_DISABLED");
    expect(window.api.skill.scanSafety).not.toHaveBeenCalled();
  });
  it.each(["static", "ai"])(
    "sends content only for explicit %s scans",
    async (method) => {
      settings.skillSafetyScanEnabled = true;
      settings.skillSafetyScanMethod = method;
      await runSkillContentSafetyScan({
        content: "x",
        sourceUrl: "http://internal",
        securityAudits: ["unknown"],
        aiConfig: { apiKey: "ignored" } as never,
      });
      const input = vi.mocked(window.api.skill.scanSafety).mock.calls[0][0];
      expect(input).toMatchObject({ enabled: true, method, content: "x" });
      expect(input.sourceUrl).toBeUndefined();
      expect(input.securityAudits).toBeUndefined();
      expect(input.aiConfig?.apiKey).toBe(method === "ai" ? "test" : undefined);
    },
  );
});
