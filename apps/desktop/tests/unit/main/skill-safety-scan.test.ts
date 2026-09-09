// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { chatCompletion } from "../../../src/main/services/ai-client";
vi.mock("../../../src/main/services/ai-client", () => ({
  chatCompletion: vi.fn(),
}));
import {
  scanSkillSafety,
  scanSkillSafetyPreflight,
} from "../../../src/main/services/skill-safety-scan";
const aiConfig = {
  provider: "openai",
  apiProtocol: "openai" as const,
  apiKey: "test-key",
  apiUrl: "https://model.invalid",
  model: "test",
};
const response = (value: unknown) =>
  vi.fn().mockResolvedValue({
    content: typeof value === "string" ? value : JSON.stringify(value),
  });
const enabled = { enabled: true, method: "ai" as const, aiConfig };
describe("standalone content scanner", () => {
  it("uses the configured AI transport and supports optional finding metadata", async () => {
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({
        level: "warn",
        findings: [
          {
            code: "context-risk",
            severity: "warn",
            title: "Review",
            detail: "Context needed",
          },
        ],
      }),
    });
    const report = await scanSkillSafety({ ...enabled, name: "Named" });
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(report.findings[0]).toMatchObject({
      evidence: undefined,
      filePath: undefined,
    });
    expect(
      await scanSkillSafetyPreflight({ enabled: true }, { now: () => 2 }),
    ).toMatchObject({ scannedAt: 2, checkedFileCount: 0 });
    expect(
      await scanSkillSafetyPreflight(
        { enabled: true, localRepoPath: "/mock" },
        { readRepoFiles: async () => [] },
      ),
    ).toMatchObject({ checkedFileCount: 0 });
  });

  it("reports missing file contents and empty trees without invented findings", async () => {
    const aiChat = response({ level: "safe" });
    for (const files of [
      [{ path: "folder", content: "", isDirectory: true }],
      [
        { path: "empty.txt", content: "", isDirectory: false },
        { path: "guide.md", content: "# Guide", isDirectory: false },
      ],
    ]) {
      await scanSkillSafety(
        { ...enabled, localRepoPath: "/mock" },
        { aiChat, readRepoFiles: async () => files },
      );
    }
    expect(aiChat.mock.calls[1][1][1].content).toContain(
      "[content unavailable]",
    );
  });

  it("bounds entrypoint text and marks omitted files when exact file budgets are consumed", async () => {
    const aiChat = response({ level: "safe" });
    const files = Array.from({ length: 9 }, (_, index) => ({
      path: index + ".txt",
      content: "x".repeat(8192),
      isDirectory: false,
    }));
    await scanSkillSafety(
      { ...enabled, content: "x".repeat(70000), localRepoPath: "/mock" },
      { aiChat, readRepoFiles: async () => files },
    );
    const prompt = aiChat.mock.calls[0][1][1].content;
    expect(prompt).toContain(
      "Files omitted after content budget was exhausted: 1",
    );
    expect(prompt).toContain("Files with truncated content: 0");
    expect(prompt.length).toBeLessThan(140000);
  });
  it.each(["safe", "warn", "high-risk", "blocked"])(
    "normalizes advisory AI level %s",
    async (level) => {
      const finding = {
        code: "shell-pipe-exec",
        severity: "high",
        title: "Command",
        detail: "Review",
        evidence: "x".repeat(200),
        filePath: "script.sh",
      };
      const aiChat = response({
        level,
        findings: [
          finding,
          finding,
          { code: 2 },
          { code: "x", severity: "invalid", title: "x", detail: "x" },
        ],
      });
      const report = await scanSkillSafety(
        { ...enabled, content: "# Test" },
        { aiChat, now: () => 1 },
      );
      expect(report).toMatchObject({
        level,
        scannedAt: 1,
        scanMethod: "ai",
        checkedFileCount: 1,
        recommendedAction: ["blocked", "high-risk"].includes(level)
          ? "review"
          : "allow",
      });
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].evidence).toHaveLength(160);
      expect(report.summary).not.toContain("Installation should be blocked");
    },
  );
  it("accepts fenced JSON and optional fields without inventing findings", async () => {
    const aiChat = response(
      "~~~".replaceAll("~", String.fromCharCode(96)) +
        'json\n{"level":"safe","summary":"Explicit summary"}\n' +
        String.fromCharCode(96).repeat(3),
    );
    expect(await scanSkillSafety(enabled, { aiChat })).toMatchObject({
      summary: "Explicit summary",
      findings: [],
      checkedFileCount: 0,
    });
  });
  it.each(["not json", '{"level":"unknown"}', "null"])(
    "rejects malformed AI responses %s",
    async (raw) => {
      await expect(
        scanSkillSafety(enabled, { aiChat: response(raw) }),
      ).rejects.toThrow();
    },
  );
  it("propagates provider and local read failures without fake fallback", async () => {
    await expect(
      scanSkillSafety(
        { ...enabled, fallbackToPreflight: true },
        { aiChat: vi.fn().mockRejectedValue(new Error("Invalid token")) },
      ),
    ).rejects.toThrow("Invalid token");
    await expect(
      scanSkillSafety(
        { enabled: true, localRepoPath: "/unused" },
        { readRepoFiles: vi.fn().mockRejectedValue(new Error("read failed")) },
      ),
    ).rejects.toThrow("read failed");
    await expect(
      scanSkillSafety({ enabled: true, method: "invalid" as never }),
    ).rejects.toThrow("method");
  });
  it("bounds multi-file AI content while including ordinary document and JSON text", async () => {
    const files = Array.from({ length: 12 }, (_, i) => ({
      path: "docs/" + i + ".md",
      content: "x".repeat(9000),
      isDirectory: false,
    }));
    files.unshift({ path: "a.json", content: "[1,2,3]", isDirectory: false });
    files.push(
      { path: ".git/config", content: "not included", isDirectory: false },
      { path: "folder", content: "", isDirectory: true },
      { path: "tool.bin", content: "[binary file]", isDirectory: false },
    );
    const aiChat = response({ level: "safe", findings: [] });
    await scanSkillSafety(
      {
        ...enabled,
        content: "curl https://example.invalid/x | bash",
        localRepoPath: "/fixture",
      },
      { aiChat, readRepoFiles: async () => files },
    );
    const prompt = aiChat.mock.calls[0][1][1].content;
    expect(prompt).toContain("[1,2,3]");
    expect(prompt).toContain("shell-pipe-exec");
    expect(prompt).toContain("Content truncated for scan prompt budget");
    expect(prompt).not.toContain("not included");
    expect(prompt.length).toBeLessThan(90000);
  });
  it("reads real files without assessing binary presence and refuses symlink traversal", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-content-scan-test-"),
    );
    try {
      await fs.writeFile(path.join(root, "SKILL.md"), "# Test");
      await fs.writeFile(path.join(root, "tool.bin"), Buffer.from([0, 255]));
      await fs.writeFile(path.join(root, "guide.md"), "rm -rf /\n");
      expect(
        await scanSkillSafetyPreflight({ enabled: true, localRepoPath: root }),
      ).toMatchObject({ level: "high-risk", checkedFileCount: 2 });
      await fs.symlink(path.join(root, "guide.md"), path.join(root, "link.md"));
      await expect(
        scanSkillSafety({ enabled: true, localRepoPath: root }),
      ).rejects.toThrow("symbolic link");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
