import { describe, expect, it } from "vitest";

import { sortSkillPlatformsByPreference } from "../../../src/renderer/components/skill/use-skill-platform";

describe("use-skill-platform helpers", () => {
  it("sorts detected platforms by the saved user preference", () => {
    const sorted = sortSkillPlatformsByPreference(
      [
        { id: "cursor", name: "Cursor" },
        { id: "claude", name: "Claude Code" },
        { id: "opencode", name: "OpenCode" },
      ] as any,
      ["opencode", "claude"],
    );

    expect(sorted.map((platform) => platform.id)).toEqual([
      "opencode",
      "claude",
      "cursor",
    ]);
  });

  it("uses the product default priority when no preference is saved", () => {
    const original = [
      { id: "cursor", name: "Cursor" },
      { id: "windsurf", name: "Windsurf" },
      { id: "openclaw", name: "OpenClaw" },
      { id: "codex", name: "Codex CLI" },
      { id: "claude", name: "Claude Code" },
      { id: "gemini", name: "Gemini CLI" },
      { id: "cline", name: "Cline" },
      { id: "cherry-studio", name: "Cherry Studio" },
      { id: "trae", name: "TRAE IDE" },
      { id: "trae-work", name: "TRAE Work" },
      { id: "trae-cn", name: "TRAE IDE CN" },
      { id: "trae-work-cn", name: "TRAE Work CN" },
      { id: "kilo", name: "Kilo Code" },
      { id: "kiro", name: "Kiro" },
      { id: "hermes", name: "Hermes Agent" },
      { id: "opencode", name: "OpenCode" },
    ] as any;

    const sorted = sortSkillPlatformsByPreference(original, []);

    expect(sorted.map((platform) => platform.id)).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "cline",
      "cursor",
      "cherry-studio",
      "windsurf",
      "kiro",
      "kilo",
      "trae",
      "trae-work",
      "trae-cn",
      "trae-work-cn",
      "openclaw",
      "hermes",
    ]);
  });

  it("keeps saved user preference ahead of the default priority", () => {
    const original = [
      { id: "cursor", name: "Cursor" },
      { id: "windsurf", name: "Windsurf" },
      { id: "openclaw", name: "OpenClaw" },
      { id: "codex", name: "Codex CLI" },
      { id: "claude", name: "Claude Code" },
      { id: "gemini", name: "Gemini CLI" },
      { id: "cline", name: "Cline" },
      { id: "cherry-studio", name: "Cherry Studio" },
      { id: "trae", name: "TRAE IDE" },
      { id: "trae-work", name: "TRAE Work" },
      { id: "trae-cn", name: "TRAE IDE CN" },
      { id: "trae-work-cn", name: "TRAE Work CN" },
      { id: "kilo", name: "Kilo Code" },
      { id: "kiro", name: "Kiro" },
      { id: "hermes", name: "Hermes Agent" },
      { id: "opencode", name: "OpenCode" },
    ] as any;

    const sorted = sortSkillPlatformsByPreference(original, ["cursor"]);

    expect(sorted.map((platform) => platform.id)).toEqual([
      "cursor",
      "claude",
      "codex",
      "gemini",
      "opencode",
      "cline",
      "cherry-studio",
      "windsurf",
      "kiro",
      "kilo",
      "trae",
      "trae-work",
      "trae-cn",
      "trae-work-cn",
      "openclaw",
      "hermes",
    ]);
  });
});
