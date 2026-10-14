import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";

import {
  closePromptHub,
  launchPromptHub,
  setAppLanguage,
} from "./helpers/electron";

function createLongRule(prefix: string): string {
  return Array.from(
    { length: 220 },
    (_, index) => `## ${prefix} ${index + 1}\n\n${prefix} rule ${index + 1}`,
  ).join("\n\n");
}

test("scrolls long rule conflicts in one comparison region", async () => {
  const { app, page, userDataDir } = await launchPromptHub(null);
  const projectRoot = path.join(userDataDir, "rule-scroll-project");
  const targetPath = path.join(projectRoot, "AGENTS.md");

  try {
    await setAppLanguage(page, "en");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(targetPath, createLongRule("PromptHub"), "utf8");

    await page.evaluate(async (rootPath) => {
      await window.api.rules.addProject({
        id: "scroll-conflict",
        name: "Scroll Conflict",
        rootPath,
      });
    }, projectRoot);

    fs.writeFileSync(targetPath, createLongRule("External"), "utf8");
    await page.evaluate(() => window.api.rules.scan());

    await page.getByRole("button", { name: "Rules" }).click();

    const dialog = page.getByRole("dialog", { name: /Rule conflict/i });
    const comparisonRegion = dialog.getByRole("region", {
      name: "Rule conflict",
    });
    const sourceKey = dialog.getByTestId("rules-conflict-source-key");

    await expect(dialog).toBeVisible();
    await expect(
      sourceKey.getByText("PromptHub managed version"),
    ).toBeVisible();
    await expect(sourceKey.getByText("External file version")).toBeVisible();
    await expect(comparisonRegion).toBeVisible();
    const [dialogBox, sourceKeyBox, comparisonRegionBox] = await Promise.all([
      dialog.boundingBox(),
      sourceKey.boundingBox(),
      comparisonRegion.boundingBox(),
    ]);
    expect(dialogBox).not.toBeNull();
    expect(sourceKeyBox).not.toBeNull();
    expect(comparisonRegionBox).not.toBeNull();
    expect(sourceKeyBox!.width).toBeLessThan(dialogBox!.width * 0.7);
    expect(
      comparisonRegionBox!.y - (sourceKeyBox!.y + sourceKeyBox!.height),
    ).toBeGreaterThanOrEqual(8);
    await expect
      .poll(() =>
        comparisonRegion.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      )
      .toBe(true);

    await comparisonRegion.focus();
    await comparisonRegion.hover();
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => comparisonRegion.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(sourceKey).toBeVisible();

    await dialog.getByRole("tab", { name: "Side by side" }).click();
    await comparisonRegion.evaluate((element) => {
      element.scrollTop = 0;
    });
    await comparisonRegion.hover();
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => comparisonRegion.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Keep PromptHub version" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Keep external file version" }),
    ).toBeVisible();
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
