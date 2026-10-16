/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createRulesWorkspaceService,
  configureRuntimePaths,
  getRulesDir,
  resetRuntimePaths,
} from "@prompthub/core";
import { initDatabase, closeDatabase, RuleDB } from "@prompthub/core";

let root: string;
function workspace() {
  return createRulesWorkspaceService({
    getRulesDir,
    createRuleDb: () => new RuleDB(initDatabase()),
    getPlatformRootDir: (p) => path.join(root, "agents", p.id),
    getPlatformGlobalRulePath: (p) =>
      p.globalRuleFile
        ? path.join(root, "agents", p.id, p.globalRuleFile)
        : null,
  });
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-scoped-rules-"));
  configureRuntimePaths({ userDataPath: path.join(root, "userdata") });
  initDatabase();
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("discovers nested Claude rules and edits/reopens each without losing paths frontmatter or neighboring history", async () => {
  const directory = path.join(root, "agents", "claude", "rules");
  fs.mkdirSync(path.join(directory, "frontend"), { recursive: true });
  const original = '---\npaths:\n  - "**/*.ts"\n---\nUse typed boundaries.';
  fs.writeFileSync(path.join(directory, "frontend", "typescript.md"), original);
  fs.writeFileSync(path.join(directory, "other.md"), "Other rule");
  const service = workspace();
  const descriptors = await service.scanRuleDescriptors();
  const first = descriptors.find(
    (d) => d.targetPath === path.join(directory, "frontend", "typescript.md"),
  );
  const other = descriptors.find(
    (d) => d.targetPath === path.join(directory, "other.md"),
  );
  if (!first || !other) throw new Error("Scoped rules not discovered");
  expect((await service.readRuleContent(first.id)).content).toBe(original);
  await service.saveRuleContent(first.id, original + "\nNo implicit any.");
  const reopened = workspace();
  expect((await reopened.readRuleContent(first.id)).content).toBe(
    original + "\nNo implicit any.",
  );
  expect((await reopened.readRuleContent(other.id)).content).toBe("Other rule");
  const backup = (await reopened.exportRuleBackupRecords()).filter(
    (record) => record.id === first.id,
  );
  const afterBackup = original + "\nAfter backup";
  await reopened.saveRuleContent(first.id, afterBackup);
  await reopened.importRuleBackupRecords(backup);
  const restored = await workspace().readRuleContent(first.id);
  expect(restored.content).toBe(original + "\nNo implicit any.");
  expect(restored.versions.map((version) => version.content)).toContain(
    afterBackup,
  );
  expect(
    fs.readFileSync(path.join(directory, "frontend", "typescript.md"), "utf8"),
  ).toBe(afterBackup);
  expect(
    fs.readFileSync(path.join(directory, "frontend", "typescript.md"), "utf8"),
  ).toContain('paths:\n  - "**/*.ts"');
  const external = original + "\nExternal edit.";
  fs.writeFileSync(path.join(directory, "frontend", "typescript.md"), external);
  await reopened.bootstrapRuleWorkspace();
  expect(
    (await reopened.scanRuleDescriptors()).find((d) => d.id === first.id)
      ?.syncStatus,
  ).toBe("out-of-sync");
  expect(
    fs.readFileSync(path.join(directory, "frontend", "typescript.md"), "utf8"),
  ).toBe(external);
  fs.unlinkSync(path.join(directory, "other.md"));
  expect(
    (await workspace().scanRuleDescriptors()).find((d) => d.id === other.id)
      ?.syncStatus,
  ).toBe("target-missing");
  expect((await workspace().readRuleContent(other.id)).content).toBe(
    "Other rule",
  );
});

it("does not scan outside links or resolve a traversal-shaped scoped Rule id", async () => {
  const directory = path.join(root, "agents", "claude", "rules");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(root, "private.md"), "Not a rule");
  fs.symlinkSync(
    path.join(root, "private.md"),
    path.join(directory, "escape.md"),
  );
  expect(
    (await workspace().scanRuleDescriptors()).some((d) =>
      d.targetPath?.endsWith("escape.md"),
    ),
  ).toBe(false);
  await expect(
    workspace().readRuleContent(
      `custom:claude-rule:${Buffer.from("escape.md").toString("base64url")}`,
    ),
  ).rejects.toThrow("Claude scoped Rule escapes its directory");
  await expect(
    workspace().readRuleContent(
      `custom:claude-rule:${Buffer.from("../private.md").toString("base64url")}`,
    ),
  ).rejects.toThrow("Invalid Claude scoped Rule identity");
});

it("manages a native-valid long Rule filename without exceeding managed directory name limits", async () => {
  const directory = path.join(root, "agents", "claude", "rules");
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${"long-".repeat(40)}.md`;
  fs.writeFileSync(path.join(directory, filename), "Long rule");
  const service = workspace();
  const rule = (await service.scanRuleDescriptors()).find(
    (descriptor) => descriptor.targetPath === path.join(directory, filename),
  );
  if (!rule) throw new Error("Long Rule filename was not discovered");
  await service.saveRuleContent(rule.id, "Long rule updated");
  expect((await workspace().readRuleContent(rule.id)).content).toBe(
    "Long rule updated",
  );
});
