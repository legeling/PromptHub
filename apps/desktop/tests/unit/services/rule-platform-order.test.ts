import { describe, expect, it } from "vitest";

import { getAgentPlatformFamily } from "@prompthub/shared/constants/platforms";
import type { RuleFileDescriptor } from "@prompthub/shared/types";
import {
  getOrderedGlobalRuleFiles,
  partitionGlobalRuleFilesByFamily,
} from "../../../src/renderer/services/rule-platform-order";

function ruleFile(
  platformId: string,
  overrides: Partial<RuleFileDescriptor> = {},
): RuleFileDescriptor {
  return {
    id: `custom:${platformId}`,
    platformId: platformId as RuleFileDescriptor["platformId"],
    platformName: platformId,
    platformIcon: "Bot",
    platformDescription: platformId,
    name: "AGENTS.md",
    description: platformId,
    path: `~/.${platformId}/AGENTS.md`,
    exists: true,
    group: "assistant",
    ...overrides,
  };
}

describe("rule platform order", () => {
  it("retains every file within a platform in inventory order", () => {
    const global = ruleFile("claude", {
      id: "claude-global",
      name: "CLAUDE.md",
    });
    const scoped = ruleFile("claude", {
      id: "custom:claude-rule:root",
      name: "coding.md",
      path: "/fixture/.claude/rules/coding.md",
    });
    const nested = ruleFile("claude", {
      id: "custom:claude-rule:nested",
      name: "coding.md",
      path: "/fixture/.claude/rules/team/coding.md",
    });
    const codex = ruleFile("codex");
    const project = ruleFile("claude", { id: "project:fixture" });
    const files = [global, codex, scoped, project, nested];

    expect(
      getOrderedGlobalRuleFiles(files, ["codex", "claude", "claude"]),
    ).toEqual([codex, global, scoped, nested]);
    expect(files).toEqual([global, codex, scoped, project, nested]);
  });

  it("returns no files for an empty inventory", () => {
    expect(getOrderedGlobalRuleFiles([], ["claude"])).toEqual([]);
  });

  it("follows skillPlatformOrder before shared default order", () => {
    const files = [
      ruleFile("claude"),
      ruleFile("codex"),
      ruleFile("openclaw", { name: "SOUL.md" }),
      ruleFile("gemini", { name: "GEMINI.md" }),
    ];

    const ordered = getOrderedGlobalRuleFiles(files, [
      "gemini",
      "openclaw",
      "claude",
    ]);

    expect(ordered.map((file) => file.platformId)).toEqual([
      "gemini",
      "openclaw",
      "claude",
      "codex",
    ]);
  });

  it("partitions claw platforms from code/work platforms", () => {
    const files = [
      ruleFile("claude"),
      ruleFile("openclaw", { name: "SOUL.md" }),
      ruleFile("codex"),
      ruleFile("qclaw", {
        id: "custom:qclaw",
        platformId: "qclaw" as RuleFileDescriptor["platformId"],
      }),
      ruleFile("hermes"),
      ruleFile("copaw"),
      ruleFile("autoclaw"),
      ruleFile("nanoclaw"),
    ];

    const { codeWork, claw } = partitionGlobalRuleFilesByFamily(files);
    expect(codeWork.map((file) => file.platformId)).toEqual([
      "claude",
      "codex",
    ]);
    expect(claw.map((file) => file.platformId)).toEqual([
      "openclaw",
      "qclaw",
      "hermes",
      "copaw",
      "autoclaw",
      "nanoclaw",
    ]);
  });

  it("classifies Hermes as a Claw-family runtime", () => {
    expect(getAgentPlatformFamily("hermes")).toBe("claw");
    expect(getAgentPlatformFamily("claude")).toBe("code-work");
  });
});
