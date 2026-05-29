import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

import { closePromptHub, launchPromptHub, setAppLanguage } from "./helpers/electron";

test.describe("E2E: create skill structure", () => {
  test("creates a new skill inside the managed variant container", async () => {
    const { app, page, userDataDir } = await launchPromptHub(null);

    try {
      await setAppLanguage(page, "en");

      await page.getByRole("button", { name: "Skills" }).click();
      await page.getByRole("button", { name: /new/i }).click();

      const modal = page.getByTestId("create-skill-modal-container");
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "Create Manually" }).click();

      await modal.getByPlaceholder("my-skill-name").fill("e2e-created-skill");
      await modal
        .getByPlaceholder("Briefly describe what this skill does")
        .fill("E2E created skill");
      await modal.locator("textarea").first().fill(
        "# E2E Created Skill\n\nUse this skill for end-to-end verification.",
      );

      await modal.getByRole("button", { name: "Create Skill" }).click();

      await expect
        .poll(() =>
          page.evaluate(async () => {
            const skills = await window.api.skill.getAll();
            return (
              skills.find((skill) => skill.name === "e2e-created-skill") ?? null
            );
          }),
        )
        .toBeTruthy();

      const installedSkill = await page.evaluate(async () => {
        const skills = await window.api.skill.getAll();
        return skills.find((skill) => skill.name === "e2e-created-skill") ?? null;
      });

      expect(installedSkill?.id).toBeTruthy();

      const managedSkillDir = path.join(userDataDir, "data", "skills", installedSkill!.id);
      const repoSkillMdPath = path.join(managedSkillDir, "repo", "SKILL.md");
      const sourceMetadataPath = path.join(managedSkillDir, ".prompthub", "source.json");
      const variantMetadataPath = path.join(managedSkillDir, ".prompthub", "variant.json");

      expect(fs.existsSync(repoSkillMdPath)).toBe(true);
      expect(fs.existsSync(sourceMetadataPath)).toBe(true);
      expect(fs.existsSync(variantMetadataPath)).toBe(true);

      expect(fs.readFileSync(repoSkillMdPath, "utf8")).toContain(
        "E2E Created Skill",
      );
      expect(fs.readFileSync(sourceMetadataPath, "utf8")).toContain(
        '"logicalName": "e2e-created-skill"',
      );
      expect(fs.readFileSync(variantMetadataPath, "utf8")).toContain(
        '"repoMode": "copy"',
      );
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
