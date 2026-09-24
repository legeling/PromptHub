import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

import {
  closePromptHub,
  launchPromptHub,
  setAppLanguage,
} from "./helpers/electron";

test.describe("E2E: create skill structure", () => {
  test("creates a canonical package and a readable workspace from the manual UI", async () => {
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
      await modal
        .locator("textarea")
        .first()
        .fill(
          "# E2E Created Skill\n\nUse this skill for end-to-end verification.",
        );

      await modal.getByRole("button", { name: "Create Skill" }).click();
      await expect(modal).not.toBeVisible();
      await expect(
        page.getByRole("heading", { name: "e2e-created-skill", exact: true }),
      ).toBeVisible();

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
        return (
          skills.find((skill) => skill.name === "e2e-created-skill") ?? null
        );
      });

      expect(installedSkill?.id).toBeTruthy();
      expect(installedSkill?.local_repo_path).toBeTruthy();

      const skillId = encodeURIComponent(installedSkill!.id);
      const bundlePath = path.join(userDataDir, "data", "skills", skillId);
      const workspacePath = path.join(
        userDataDir,
        "cache",
        "skill-workspaces",
        skillId,
      );
      expect(installedSkill!.local_repo_path).toBe(workspacePath);
      const canonicalContent = fs.readFileSync(
        path.join(bundlePath, "files", "SKILL.md"),
        "utf8",
      );
      expect(canonicalContent).toContain("E2E Created Skill");
      expect(
        fs.readFileSync(path.join(workspacePath, "SKILL.md"), "utf8"),
      ).toBe(canonicalContent);
      expect(
        JSON.parse(
          fs.readFileSync(path.join(bundlePath, "skill.json"), "utf8"),
        ),
      ).toMatchObject({
        skill: { id: installedSkill!.id, name: "e2e-created-skill" },
      });
      expect(
        await page.evaluate(
          (id) => window.api.skill.versionGetAll(id),
          installedSkill!.id,
        ),
      ).toHaveLength(1);
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
