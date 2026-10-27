import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

import {
  closePromptHub,
  launchPromptHub,
  setAppLanguage,
} from "./helpers/electron";

function createSameNameVariantSource(baseDir: string): string {
  const sourceRoot = path.join(baseDir, "e2e-same-name-source");
  const skillContent = [
    "---",
    "name: writer",
    "description: Shared writer skill",
    "version: 1.0.0",
    "tags: [writer, local]",
    "---",
    "",
    "# Writer",
    "",
    "Same instructions, different assets.",
  ].join("\n");

  const stableDir = path.join(sourceRoot, "stable", "writer");
  const experimentalDir = path.join(sourceRoot, "experimental", "writer");

  fs.mkdirSync(path.join(stableDir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(experimentalDir, "assets"), { recursive: true });

  fs.writeFileSync(path.join(stableDir, "SKILL.md"), skillContent, "utf8");
  fs.writeFileSync(
    path.join(experimentalDir, "SKILL.md"),
    skillContent,
    "utf8",
  );
  fs.writeFileSync(
    path.join(stableDir, "assets", "icon.png"),
    Buffer.from([137, 80, 78, 71, 0, 1]),
  );
  fs.writeFileSync(
    path.join(experimentalDir, "assets", "icon.png"),
    Buffer.from([137, 80, 78, 71, 0, 2]),
  );

  return sourceRoot;
}

async function dismissQuickInstallModal(page: import("@playwright/test").Page) {
  const quickInstallDialog = page.getByRole("dialog", {
    name: "Distribute Skill",
    exact: true,
  });
  await expect(quickInstallDialog).toBeVisible();
  await quickInstallDialog
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(quickInstallDialog).toHaveCount(0);
}

test.describe("E2E: local store same-name variants", () => {
  test("keeps same-name variants visible and installable when only assets differ", async () => {
    const { app, page, userDataDir } = await launchPromptHub(null);

    try {
      await setAppLanguage(page, "en");

      const sourceRoot = path.join(userDataDir, "fixtures");
      const sourceRootDir = createSameNameVariantSource(sourceRoot);

      await page.evaluate(
        async ({ sourceRootDir }) => {
          await window.api.settings.rendererPersistence.replaceSources(
            "skill",
            [
              {
                id: "same-name-local-source",
                name: "Same Name Local Source",
                type: "local-dir",
                url: sourceRootDir,
                enabled: true,
                createdAt: Date.now(),
                order: 0,
              },
            ],
          );
        },
        { sourceRootDir },
      );

      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      const scannedPreview = await page.evaluate(
        async ({ sourceRootDir }) => {
          const scanned = await window.api.skill.scanLocalPreview([
            sourceRootDir,
          ]);
          return scanned
            .filter((skill) => skill.name === "writer")
            .map((skill) => ({
              name: skill.name,
              instructions: skill.instructions,
              directoryFingerprint: skill.directory_fingerprint ?? null,
              localPath: skill.localPath,
            }));
        },
        { sourceRootDir },
      );

      expect(scannedPreview).toHaveLength(2);
      expect(
        new Set(scannedPreview.map((skill) => skill.instructions)).size,
      ).toBe(1);
      expect(
        new Set(scannedPreview.map((skill) => skill.directoryFingerprint)).size,
      ).toBe(2);

      await page.getByRole("button", { name: "Skills", exact: true }).click();
      await page.locator('button[title="Skill Store"]:visible').first().click();
      await page
        .locator('button:has-text("Same Name Local Source"):visible')
        .first()
        .click();

      await expect(
        page.locator('h2:has-text("Same Name Local Source"):visible').first(),
      ).toBeVisible();
      await page.locator('button[title="Refresh"]:visible').first().click();

      await expect(page.locator('h4:has-text("writer"):visible')).toHaveCount(
        2,
      );

      await page.locator('h4:has-text("writer"):visible').first().click();
      const firstDetailModal = page
        .locator("div.fixed.inset-0.z-50")
        .filter({ has: page.locator('h2:has-text("writer")') })
        .last();
      await expect(
        firstDetailModal.locator('h2:has-text("writer")'),
      ).toBeVisible();
      await firstDetailModal
        .locator(
          'button:has-text("Import to My Skills"), button:has-text("Add to Library")',
        )
        .first()
        .click({ force: true });
      await page
        .getByRole("button", { name: "Confirm and add", exact: true })
        .click();
      await dismissQuickInstallModal(page);
      await expect(
        firstDetailModal.locator('button:has-text("Remove")'),
      ).toBeVisible();

      await expect
        .poll(() =>
          page.evaluate(async () => {
            const skills = await window.api.skill.getAll();
            return skills.filter((skill) => skill.name === "writer").length;
          }),
        )
        .toBe(1);

      await firstDetailModal
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect(firstDetailModal).toHaveCount(0);
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await expect(
        page.getByRole("heading", {
          name: "Same Name Local Source",
          exact: true,
        }),
      ).toBeVisible();
      await expect(firstDetailModal).toHaveCount(0);
      await page.locator('button[title="Refresh"]:visible').first().click();

      const writerCards = page
        .locator("div.group")
        .filter({ has: page.locator('h4:has-text("writer")') });
      await expect(writerCards).toHaveCount(2);
      await expect(page.locator('[title="Imported"]:visible')).toHaveCount(1);

      const installableWriterCard = writerCards
        .filter({ hasNot: page.locator('[title="Imported"]') })
        .first();
      await installableWriterCard.click({ force: true });

      const secondDetailModal = page
        .locator("div.fixed.inset-0.z-50")
        .filter({ has: page.locator('h2:has-text("writer")') })
        .last();
      await expect(
        secondDetailModal.locator('h2:has-text("writer")'),
      ).toBeVisible();
      await expect(
        secondDetailModal.locator(
          'button:has-text("Import to My Skills"), button:has-text("Add to Library")',
        ),
      ).toHaveCount(1);
      await secondDetailModal
        .locator(
          'button:has-text("Import to My Skills"), button:has-text("Add to Library")',
        )
        .first()
        .click({ force: true });
      await page
        .getByRole("button", { name: "Confirm and add", exact: true })
        .click();
      await dismissQuickInstallModal(page);

      await expect
        .poll(() =>
          page.evaluate(async () => {
            const skills = await window.api.skill.getAll();
            return skills
              .filter((skill) => skill.name === "writer")
              .map((skill) => ({
                id: skill.id,
                sourceId: skill.source_id ?? null,
                directoryFingerprint: skill.directory_fingerprint ?? null,
              }));
          }),
        )
        .toHaveLength(2);

      const variants = await page.evaluate(async () => {
        const skills = await window.api.skill.getAll();
        return skills
          .filter((skill) => skill.name === "writer")
          .map((skill) => ({
            id: skill.id,
            sourceId: skill.source_id ?? null,
            directoryFingerprint: skill.directory_fingerprint ?? null,
          }));
      });

      expect(new Set(variants.map((skill) => skill.sourceId)).size).toBe(2);
      expect(
        new Set(variants.map((skill) => skill.directoryFingerprint)).size,
      ).toBe(2);
      const installedAssets = variants.map((skill) => {
        const files = path.join(
          userDataDir,
          "data",
          "skills",
          encodeURIComponent(skill.id),
          "files",
        );
        expect(fs.readFileSync(path.join(files, "SKILL.md"), "utf8")).toContain(
          "Same instructions, different assets.",
        );
        return fs
          .readFileSync(path.join(files, "assets", "icon.png"))
          .toString("hex");
      });
      expect(installedAssets.sort()).toEqual(["89504e470001", "89504e470002"]);
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
