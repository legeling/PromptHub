import assert from "node:assert/strict";
import type { SkillTestRuntime } from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import type { Skill } from "@prompthub/shared/types";
import {
  createSkillTestRuntime,
  fileInventory,
  skillApi,
} from "./helpers/skill-runtime";
let runtime: SkillTestRuntime;
let skill: Skill;
const text =
  "---\nname: acceptance-package\ndescription: Fixture\n---\n# Full package\n";
const expected = {
  "SKILL.md": Buffer.from(text).toString("base64"),
  "docs/nested/reference.txt":
    Buffer.from("Reference bytes\n").toString("base64"),
  "assets/binary.bin": Buffer.from([0, 128, 255, 13, 10]).toString("base64"),
};
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  fs.mkdirSync(path.join(runtime.source, "docs/nested"), { recursive: true });
  fs.mkdirSync(path.join(runtime.source, "assets"));
  for (const [name, bytes] of Object.entries(expected))
    fs.writeFileSync(
      path.join(runtime.source, name),
      Buffer.from(bytes, "base64"),
    );
  const result = await skillApi.runPackageOperation({
    operation: "install",
    registrySkill: {
      slug: "acceptance-package",
      name: "acceptance-package",
      description: "Fixture",
      category: "general",
      version: "1.0.0",
      author: "Test",
      source_id: "acceptance-local",
      source_url: runtime.source,
      tags: [],
      content: text,
    },
    content: text,
    source: { kind: "local-directory", directory: runtime.source },
  });
  expect(result.status, JSON.stringify(result)).toBe("completed");
  if (result.status !== "completed") throw new Error(JSON.stringify(result));
  skill = result.skill;
});
afterEach(() => runtime?.dispose());
describe("All directory platform Skill public workflows", () => {
  for (const platform of SKILL_PLATFORMS.filter(
    (p) => p.assetModel !== "plugin-harness" && p.id !== "cherry-studio",
  ))
    it(
      platform.id + " copy/link inventory, state, reopen and uninstall",
      async () => {
        assert(skill.local_repo_path);
        const destination = path.join(
          runtime.platformRoot(platform.id),
          platform.skillsRelativePath,
          skill.name,
        );
        await skillApi.installMd(skill.id, text, platform.id);
        expect(fileInventory(destination)).toEqual(expected);
        expect(
          (await skillApi.getMdInstallStatusDetails(skill.id))[platform.id],
        ).toMatchObject({ installed: true, mode: "copy" });
        await runtime.reopen();
        expect(fileInventory(destination)).toEqual(expected);
        await skillApi.uninstallMd(skill.id, platform.id);
        expect(fs.existsSync(destination)).toBe(false);
        await skillApi.installMdSymlink(skill.id, text, platform.id);
        expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
        expect(fs.realpathSync(destination)).toBe(
          fs.realpathSync(skill.local_repo_path),
        );
        const linkFiles = fileInventory(destination);
        delete linkFiles[".canonical-bundle-hash"];
        expect(linkFiles).toEqual(expected);
        expect(
          (await skillApi.getMdInstallStatusDetails(skill.id))[platform.id],
        ).toMatchObject({ installed: true, mode: "symlink" });
        await runtime.reopen();
        expect(
          fs.readFileSync(path.join(destination, "assets/binary.bin")),
        ).toEqual(Buffer.from([0, 128, 255, 13, 10]));
        await skillApi.uninstallMd(skill.id, platform.id);
        expect(fs.existsSync(destination)).toBe(false);
        expect(fileInventory(runtime.source)).toEqual(expected);
      },
    );
});
