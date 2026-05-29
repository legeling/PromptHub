import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

import { closePromptHub, launchPromptHub, setAppLanguage } from "./helpers/electron";

function createLocalSkillSource(baseDir: string, content: string): string {
  const sourceRoot = path.join(baseDir, "e2e-local-source");
  const sourceDir = path.join(sourceRoot, "local-writer");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "SKILL.md"), content, "utf8");
  return sourceRoot;
}

test.describe("E2E: local store source", () => {
  test("imports and updates a local directory store skill from the latest SKILL.md", async () => {
    const { app, page, userDataDir } = await launchPromptHub(null);

    try {
      await setAppLanguage(page, "en");

      const sourceRoot = path.join(userDataDir, "fixtures");
      const sourceRootDir = createLocalSkillSource(
        sourceRoot,
        [
          "---",
          "name: local-writer",
          "description: Local source writer",
          "version: 1.0.0",
          "tags: [local, writer]",
          "---",
          "",
          "# Local Writer",
          "",
          "Fresh source content v1",
        ].join("\n"),
      );

      await page.evaluate(({ sourceRootDir }) => {
        localStorage.setItem(
          "skill-store",
          JSON.stringify({
            state: {
              storeView: "store",
              selectedStoreSourceId: "local-e2e-source",
              customStoreSources: [
                {
                  id: "local-e2e-source",
                  name: "E2E Local Source",
                  type: "local-dir",
                  url: sourceRootDir,
                  enabled: true,
                  createdAt: Date.now(),
                  order: 0,
                },
              ],
            },
          }),
        );
      }, { sourceRootDir });

      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      await page.evaluate(() => {
        const win = window as Window & {
          __localStoreDebug?: {
            scanCalls: number;
            readLocalCalls: Array<{ localPath: string; relativePath: string }>;
            createCalls: Array<{ name: string; registry_slug: string | null }>;
            createError: string | null;
          };
        };

        win.__localStoreDebug = {
          scanCalls: 0,
          readLocalCalls: [],
          createCalls: [],
          createError: null,
        };

        const originalScanSafety = window.api.skill.scanSafety;
        const originalReadLocalFileByPath = window.api.skill.readLocalFileByPath;
        const originalCreate = window.api.skill.create;

        window.api.skill.scanSafety = async (...args) => {
          win.__localStoreDebug!.scanCalls += 1;
          return originalScanSafety(...args);
        };

        window.api.skill.readLocalFileByPath = async (...args) => {
          win.__localStoreDebug!.readLocalCalls.push({
            localPath: String(args[0] ?? ""),
            relativePath: String(args[1] ?? ""),
          });
          return originalReadLocalFileByPath(...args);
        };

        window.api.skill.create = async (...args) => {
          const payload = args[0] as {
            name?: string;
            registry_slug?: string | null;
          };
          win.__localStoreDebug!.createCalls.push({
            name: String(payload?.name ?? ""),
            registry_slug: payload?.registry_slug ?? null,
          });
          try {
            return await originalCreate(...args);
          } catch (error) {
            win.__localStoreDebug!.createError = String(error);
            throw error;
          }
        };
      });

      await page.getByRole("button", { name: "Skills" }).click();
      await page.locator('button[title="Skill Store"]:visible').first().click();
      await page.locator('button:has-text("E2E Local Source"):visible').first().click();

      await expect(page.locator('h2:has-text("E2E Local Source"):visible').first()).toBeVisible();
      await page.locator('button[title="Refresh"]:visible').first().click();

      await expect(page.locator('h4:has-text("local-writer"):visible').first()).toBeVisible();
      await page.locator('h4:has-text("local-writer"):visible').first().click();

      const detailModal = page
        .locator('div.fixed.inset-0.z-50')
        .filter({ has: page.locator('h2:has-text("local-writer")') })
        .last();
      await expect(detailModal.locator('h2:has-text("local-writer")')).toBeVisible();

      await expect(page.getByText("Fresh source content v1")).toBeVisible();
      const installButton = detailModal.locator('button:has-text("Import to My Skills")');
      await expect(installButton).toBeVisible();
      await expect(installButton).toBeEnabled();
      await installButton.click({ force: true });
      await expect(detailModal.locator('button:has-text("Adding...")')).toHaveCount(0);

      const failureToast = page.locator('span.text-sm.font-semibold.text-foreground', {
        hasText: /Failed|Error|Import failed|Update failed/i,
      });
      await expect(failureToast).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const skills = await window.api.skill.getAll();
            const installed = skills.find((skill) => skill.name === "local-writer");
            return {
              id: installed?.id ?? null,
              content: installed?.content ?? null,
              installedCount: skills.length,
              installedNames: skills.map((skill) => skill.name),
              debug: (window as Window & { __localStoreDebug?: unknown }).__localStoreDebug,
            };
          }),
        )
        .toEqual(
          expect.objectContaining({
            id: expect.any(String),
            content: expect.stringContaining("Fresh source content v1"),
          }),
        );

      const installedSkill = await page.evaluate(async () => {
        const skills = await window.api.skill.getAll();
        return skills.find((skill) => skill.name === "local-writer") ?? null;
      });
      expect(installedSkill?.id).toBeTruthy();

      const managedSkillDir = path.join(userDataDir, "data", "skills", installedSkill!.id);
      expect(fs.existsSync(path.join(managedSkillDir, ".prompthub", "source.json"))).toBe(true);
      expect(fs.existsSync(path.join(managedSkillDir, ".prompthub", "variant.json"))).toBe(true);
      expect(fs.existsSync(path.join(managedSkillDir, "repo", "SKILL.md"))).toBe(true);

      const quickInstallModal = page.getByText("Install to Platforms");
      if (await quickInstallModal.isVisible().catch(() => false)) {
        const quickInstallDialog = page
          .locator('div.fixed.inset-0.z-50')
          .filter({ has: page.getByText("Install to Platforms") })
          .last();
        await quickInstallDialog.locator("button").first().click({ force: true });
      }

      await expect(detailModal.locator('button:has-text("Remove")')).toBeVisible();
      await expect(detailModal.locator('button:has-text("Import to My Skills")')).toHaveCount(0);

      await detailModal.click({ position: { x: 8, y: 8 } });
      await expect(detailModal).toHaveCount(0);

      fs.writeFileSync(
        path.join(sourceRootDir, "local-writer", "SKILL.md"),
        [
          "---",
          "name: local-writer",
          "description: Local source writer",
          "version: 1.1.0",
          "tags: [local, writer]",
          "---",
          "",
          "# Local Writer",
          "",
          "Fresh source content v2",
        ].join("\n"),
        "utf8",
      );

      await page.locator('button:has-text("E2E Local Source"):visible').first().click();
      await page.locator('button[title="Refresh"]:visible').first().click();
      await page.locator('h4:has-text("local-writer"):visible').first().click();
      const updatedDetailModal = page.locator('div.fixed.inset-0.z-50').last();
      await expect(updatedDetailModal.locator('h2:has-text("local-writer")')).toBeVisible();
      await expect(page.getByText("Fresh source content v2")).toBeVisible();

      await updatedDetailModal
        .getByRole("button", { name: "Check update", exact: true })
        .click({ force: true });
      await updatedDetailModal
        .getByRole("button", { name: "Update", exact: true })
        .click({ force: true });

      await expect
        .poll(() =>
          page.evaluate(async () => {
            const skills = await window.api.skill.getAll();
            const installed = skills.find((skill) => skill.name === "local-writer");
            return {
              content: installed?.content ?? null,
              version: installed?.version ?? null,
            };
          }),
        )
        .toEqual(
          expect.objectContaining({
            content: expect.stringContaining("Fresh source content v2"),
            version: "1.1.0",
          }),
        );
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
