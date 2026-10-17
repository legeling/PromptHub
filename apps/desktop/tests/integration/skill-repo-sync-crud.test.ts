/** @vitest-environment node */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSkillTestRuntime,
  skillApi,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";

describe("Skill detail sync and file CRUD", () => {
  let runtime: SkillTestRuntime;
  beforeEach(async () => {
    runtime = await createSkillTestRuntime();
  });
  afterEach(() => runtime?.dispose());

  it.each([{ sourceTags: [] }, { sourceTags: ["upstream"] }])(
    "persists source tags $sourceTags and settles sync before editing files",
    async ({ sourceTags }) => {
      const skill = await skillApi.create({
        name: "sync-crud",
        protocol_type: "skill",
        instructions: `---\nname: sync-crud\ntags: ${JSON.stringify(sourceTags)}\n---\n# Skill\n`,
        tags: ["personal"],
        original_tags: ["catalog"],
        is_favorite: false,
      });
      expect(skill.original_tags).toEqual(["catalog"]);
      const synced = await skillApi.syncFromRepo(skill.id);
      expect(synced?.original_tags).toEqual(sourceTags);
      expect(synced?.tags).toEqual(["personal"]);
      expect(await skillApi.syncFromRepo(skill.id)).toEqual(synced);

      await skillApi.writeLocalFile(
        skill.id,
        "LICENSE.txt",
        "Original license",
      );
      await skillApi.syncFromRepo(skill.id);
      await Promise.all([
        skillApi.syncFromRepo(skill.id),
        skillApi.writeLocalFile(skill.id, "LICENSE.txt", "Edited license"),
      ]);
      expect(
        (await skillApi.readLocalFile(skill.id, "LICENSE.txt"))?.content,
      ).toBe("Edited license");
      await skillApi.renameLocalPath(skill.id, "LICENSE.txt", "NOTICE.txt");
      await skillApi.syncFromRepo(skill.id);
      await Promise.all([
        skillApi.syncFromRepo(skill.id),
        skillApi.deleteLocalFile(skill.id, "NOTICE.txt"),
      ]);
      await runtime.reopen();
      expect((await skillApi.get(skill.id))?.original_tags).toEqual(sourceTags);
      const files = await skillApi.readLocalFiles(skill.id);
      expect(files.some((file) => /LICENSE|NOTICE/.test(file.path))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(skill.local_repo_path!, "SKILL.md"))).toBe(
        true,
      );
    },
  );
});
