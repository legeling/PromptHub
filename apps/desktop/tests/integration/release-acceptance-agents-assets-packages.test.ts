import assert from "node:assert/strict";
import type { SkillTestRuntime } from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, it, expect } from "vitest";
import { unzipSync } from "fflate";
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
} from "./helpers/skill-runtime";
let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
});
afterEach(() => runtime?.dispose());
function packageFiles() {
  return {
    "SKILL.md": Buffer.from(
      "---\nname: supplemental\ndescription: Fixture\n---\nBody\n",
    ).toString("base64"),
    "docs/nested/note.txt": Buffer.from("Note bytes").toString("base64"),
    "assets/blob.bin": Buffer.from([0, 128, 255]).toString("base64"),
  };
}
async function install() {
  const expected = packageFiles();
  for (const [name, bytes] of Object.entries(expected)) {
    const file = path.join(runtime.source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(bytes, "base64"));
  }
  const content = Buffer.from(expected["SKILL.md"], "base64").toString();
  const result = await skillApi.runPackageOperation({
    operation: "install",
    registrySkill: {
      name: "supplemental",
      slug: "supplemental",
      description: "Fixture",
      category: "general",
      author: "Test",
      version: "1.0.0",
      tags: [],
      source_id: "supplemental",
      source_url: runtime.source,
      content,
    },
    content,
    source: { kind: "local-directory", directory: runtime.source },
  });
  expect(result.status, JSON.stringify(result)).toBe("completed");
  if (result.status !== "completed") throw new Error(JSON.stringify(result));
  return result.skill;
}
it("Skill ZIP exports every file and exact binary bytes", async () => {
  const skill = await install();
  const result = await skillApi.exportZip(skill.id);
  expect(result.fileName).toBe("supplemental.zip");
  const files = unzipSync(Buffer.from(result.base64, "base64"));
  expect(
    Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        Buffer.from(bytes).toString("base64"),
      ]),
    ),
  ).toEqual(packageFiles());
});
it("Skill snapshot rollback restores file tree after reopen", async () => {
  const skill = await install();
  const version = await skillApi.versionCreate(skill.id, "acceptance-original");
  await skillApi.writeLocalFile(skill.id, "docs/nested/note.txt", "Changed");
  await skillApi.writeLocalFile(skill.id, "new.txt", "Added");
  await skillApi.versionRollback(skill.id, version.version);
  await runtime.reopen();
  const result = await skillApi.get(skill.id);
  const actual = fileInventory(result.local_repo_path);
  delete actual[".canonical-bundle-hash"];
  expect(actual).toEqual(packageFiles());
});
it("Skill project copy/link and conflict preserve source inventory", async () => {
  const skill = await install();
  assert(skill.local_repo_path);
  const root = path.join(runtime.root, "project/.agents/skills");
  await skillApi.copyRepoByPathToDirectory(
    skill.local_repo_path,
    skill.name,
    root,
    { mode: "copy", ifExists: "error" },
  );
  const target = path.join(root, skill.name);
  expect(fileInventory(target)).toEqual(packageFiles());
  await expect(
    skillApi.copyRepoByPathToDirectory(
      skill.local_repo_path,
      skill.name,
      root,
      { mode: "copy", ifExists: "error" },
    ),
  ).rejects.toThrow();
  expect(fileInventory(target)).toEqual(packageFiles());
  await skillApi.copyRepoByPathToDirectory(
    skill.local_repo_path,
    skill.name,
    root,
    { mode: "symlink", ifExists: "overwrite" },
  );
  expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
  expect(fs.realpathSync(target)).toBe(fs.realpathSync(skill.local_repo_path));
  expect(fileInventory(runtime.source)).toEqual(packageFiles());
});
