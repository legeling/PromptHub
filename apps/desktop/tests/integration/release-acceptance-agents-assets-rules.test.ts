import type { SkillTestRuntime } from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, it, expect, describe } from "vitest";
import { getDatabase, RuleDB } from "../../src/main/database";
import { KNOWN_RULE_FILE_TEMPLATES } from "@prompthub/shared/constants/rules";
import { createSkillTestRuntime } from "./helpers/skill-runtime";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { rulesApi } from "../../src/preload/api/rules";
import { detectInstalledPlatforms } from "../../src/main/services/skill-installer-platform";
let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerRulesIPC();
});
afterEach(() => runtime?.dispose());
async function reopen(): Promise<void> {
  await runtime.reopen();
  registerRulesIPC();
}
it("Agent Harness detection with initialized profile and controlled CLI resolver", async () => {
  const detected = await detectInstalledPlatforms({
    pathExists: async (p) => fs.existsSync(p),
    resolveExecutable: async (c) =>
      c === "dsh" ? path.join(runtime.root, "bin/dsh") : null,
  });
  expect(detected).toContain("deepseek-harness");
});
describe("Rules every registered global entry", () => {
  for (const template of Object.values(KNOWN_RULE_FILE_TEMPLATES))
    it(template.id + " save native/read SQLite/reopen", async () => {
      fs.mkdirSync(runtime.platformRoot(template.platformId), {
        recursive: true,
      });
      const scanned = await rulesApi.scan();
      const descriptor = scanned.find((d) => d.id === template.id);
      expect(descriptor).toBeDefined();
      if (!descriptor) throw new Error("Missing rule " + template.id);
      expect(descriptor.targetPath.startsWith(runtime.root + path.sep)).toBe(
        true,
      );
      const text = "# Acceptance " + template.id + "\n";
      await rulesApi.save(template.id, text);
      expect(fs.readFileSync(descriptor.targetPath, "utf8")).toBe(text);
      expect(new RuleDB(getDatabase()).getById(template.id)).toMatchObject({
        targetPath: descriptor.targetPath,
      });
      await reopen();
      expect((await rulesApi.read(template.id)).content).toBe(text);
    });
});
it("Rules project conflict resolution and detach retain target", async () => {
  const project = path.join(runtime.root, "project");
  fs.mkdirSync(project);
  const descriptor = await rulesApi.addProject({
    id: "acceptance-project",
    name: "Acceptance Project",
    rootPath: project,
  });
  await rulesApi.save(descriptor.id, "# Managed\n");
  const file = path.join(project, "AGENTS.md");
  expect(fs.readFileSync(file, "utf8")).toBe("# Managed\n");
  fs.writeFileSync(file, "# External\n");
  await rulesApi.scan();
  await rulesApi.resolveConflict(descriptor.id, "use-target");
  expect((await rulesApi.read(descriptor.id)).content).toBe("# External\n");
  await reopen();
  expect((await rulesApi.read(descriptor.id)).content).toBe("# External\n");
  await rulesApi.removeProject("acceptance-project");
  expect.soft(new RuleDB(getDatabase()).getById(descriptor.id)).toBeNull();
  expect(fs.readFileSync(file, "utf8")).toBe("# External\n");
  const listed = await rulesApi.list();
  expect.soft(listed.some((d) => d.id === descriptor.id)).toBe(false);
  await reopen();
  expect
    .soft((await rulesApi.list()).some((d) => d.id === descriptor.id))
    .toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe("# External\n");
});
