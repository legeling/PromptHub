import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RuleFileContent } from "@prompthub/shared/types/rules";
import { afterEach, describe, expect, it } from "vitest";

import {
  materializeRuleResourceBundle,
  readRuleResourceBundle,
} from "../src/rule-resource-schema";

const roots: string[] = [];

function root(): string {
  const value = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-rule-bundle-"),
  );
  roots.push(value);
  return value;
}

function rule(): RuleFileContent {
  return {
    id: "codex-global",
    platformId: "codex",
    platformName: "Codex",
    platformIcon: "terminal",
    platformDescription: "Codex rules",
    name: "AGENTS.md",
    description: "Global instructions",
    path: "/Users/example/.codex/AGENTS.md",
    exists: true,
    group: "assistant",
    managedPath: "/Users/example/PromptHub/data/rules/codex.md",
    targetPath: "/Users/example/.codex/AGENTS.md",
    syncStatus: "synced",
    content: "# Current\n",
    targetContent: "# Current\n",
    versions: [
      {
        id: "rule-version-1",
        savedAt: "2026-08-11T00:00:00.000Z",
        content: "# Initial\n",
        source: "create",
      },
      {
        id: "rule-version-2",
        savedAt: "2026-08-11T01:00:00.000Z",
        content: "# Current\n",
        source: "manual-save",
      },
    ],
  };
}

afterEach(() => {
  for (const value of roots.splice(0))
    fs.rmSync(value, { recursive: true, force: true });
});

describe("Rule canonical resource schema", () => {
  it.each(["", "/former/project/AGENTS.md"])(
    "preserves a detached project Rule without restoring the former path %s",
    (formerPath) => {
      const input: RuleFileContent = {
        ...rule(),
        id: "project:detached",
        path: formerPath,
        targetPath: "",
        projectRootPath: null,
      };
      const bundlePath = path.join(root(), "detached-rule");
      materializeRuleResourceBundle({ bundlePath, rule: input });
      const restored = readRuleResourceBundle(bundlePath).rule;
      expect(restored.targetPath).toBeUndefined();
      expect(restored.projectRootPath).toBeUndefined();
      expect(restored.content).toBe(input.content);
      expect(restored.versions).toEqual(input.versions);
      expect(restored.name).toBe("AGENTS.md");
    },
  );

  it("continues rejecting control characters in a project Rule deployment path", () => {
    const bundlePath = path.join(root(), "invalid-project-rule");
    expect(() =>
      materializeRuleResourceBundle({
        bundlePath,
        rule: {
          ...rule(),
          id: "project:invalid",
          targetPath: "/project/\u0000AGENTS.md",
        },
      }),
    ).toThrow(/targetPath is invalid/);
    expect(fs.existsSync(bundlePath)).toBe(false);
  });

  it("publishes a new resource revision when Rule history advances", () => {
    const base = root();
    const bundlePath = path.join(base, "rule");
    materializeRuleResourceBundle({ bundlePath, rule: rule() });
    const updated = rule();
    updated.content = "# Revised\n";
    updated.versions.push({
      id: "rule-version-3",
      savedAt: "2026-08-11T02:00:00.000Z",
      content: updated.content,
      source: "manual-save",
    });

    const manifest = materializeRuleResourceBundle({
      bundlePath,
      rule: updated,
      writePolicy: { mode: "replace" },
    });

    expect(manifest.revision).toBe(3);
    expect(readRuleResourceBundle(bundlePath).rule.content).toBe("# Revised\n");
  });

  it("round-trips logical metadata, current Markdown, and immutable history", () => {
    const base = root();
    const bundlePath = path.join(base, "rule");
    materializeRuleResourceBundle({ bundlePath, rule: rule() });

    const restored = readRuleResourceBundle(bundlePath);
    expect(restored.rule).toMatchObject({
      id: "codex-global",
      group: "assistant",
      content: "# Current\n",
      versions: rule().versions,
    });
    expect(restored.rule).not.toHaveProperty("path");
    expect(restored.rule).not.toHaveProperty("managedPath");
    expect(restored.rule.targetPath).toBeUndefined();
    expect(restored.rule.projectRootPath).toBeUndefined();
    expect(restored.rule).not.toHaveProperty("targetContent");
    expect(restored.rule).not.toHaveProperty("syncStatus");
    expect(fs.readFileSync(path.join(bundlePath, "rule.md"), "utf8")).toBe(
      "# Current\n",
    );
  });

  it("keeps project placement in canonical files so SQLite can be rebuilt", () => {
    const base = root();
    const projectRule = {
      ...rule(),
      id: "project:docs",
      platformId: "workspace",
      platformName: "Docs",
      path: "/Users/example/docs/AGENTS.md",
      targetPath: "/Users/example/docs/AGENTS.md",
      projectRootPath: "/Users/example/docs",
      group: "workspace",
    } satisfies RuleFileContent;

    materializeRuleResourceBundle({
      bundlePath: path.join(base, "project-rule"),
      rule: projectRule,
    });

    expect(
      readRuleResourceBundle(path.join(base, "project-rule")).rule,
    ).toMatchObject({
      id: "project:docs",
      targetPath: "/Users/example/docs/AGENTS.md",
      projectRootPath: "/Users/example/docs",
    });
  });

  it("rejects duplicate history identities and preserves a current body independent of history", () => {
    const base = root();
    const duplicate = rule();
    duplicate.versions[1].id = duplicate.versions[0].id;
    expect(() =>
      materializeRuleResourceBundle({
        bundlePath: path.join(base, "duplicate"),
        rule: duplicate,
      }),
    ).toThrow(/duplicate version/u);

    const mismatch = rule();
    mismatch.content = "# Different\n";
    materializeRuleResourceBundle({
      bundlePath: path.join(base, "mismatch"),
      rule: mismatch,
    });
    expect(
      readRuleResourceBundle(path.join(base, "mismatch")).rule,
    ).toMatchObject({ content: mismatch.content, versions: mismatch.versions });
    mismatch.versions = [];
    materializeRuleResourceBundle({
      bundlePath: path.join(base, "without-history"),
      rule: mismatch,
    });
    expect(
      readRuleResourceBundle(path.join(base, "without-history")).rule,
    ).toMatchObject({ content: mismatch.content, versions: [] });
  });

  it("fails closed on unsafe identities and payload tampering", () => {
    const base = root();
    expect(() =>
      materializeRuleResourceBundle({
        bundlePath: path.join(base, "unsafe"),
        rule: { ...rule(), id: "custom:../escape" },
      }),
    ).toThrow(/id is invalid/u);
    expect(() =>
      materializeRuleResourceBundle({
        bundlePath: path.join(base, "unsafe-placement"),
        rule: {
          ...rule(),
          id: "project:unsafe",
          targetPath: "/tmp/rule\0escape",
        },
      }),
    ).toThrow(/targetPath is invalid/u);

    const bundlePath = path.join(base, "tampered");
    materializeRuleResourceBundle({ bundlePath, rule: rule() });
    fs.appendFileSync(path.join(bundlePath, "rule.md"), "tamper");
    expect(() => readRuleResourceBundle(bundlePath)).toThrow(/size mismatch/u);
  });
});
