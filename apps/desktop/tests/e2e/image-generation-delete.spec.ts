import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  captureAppPage,
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

async function seedHistory(page: Page) {
  return page.evaluate(async () => {
    const model = { id: "fixture", provider: "openai", model: "image" };
    const failed = await window.api.generation.create({
      title: "Failed batch",
      prompt: "Synthetic failure",
      targetCount: 1,
      model,
    });
    await window.api.generation.failSlot({
      batchId: failed.id,
      slotIndex: 0,
      error: {
        code: "provider_error",
        message: "Synthetic failure",
        retryable: true,
      },
    });
    const success = await window.api.generation.create({
      title: "Saved artwork",
      prompt: "Synthetic success",
      targetCount: 1,
      model,
    });
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing canvas context");
    context.fillStyle = "#426893";
    context.fillRect(0, 0, 32, 32);
    const updated = await window.api.generation.commitOutput({
      batchId: success.id,
      slotIndex: 0,
      base64: canvas.toDataURL("image/png").split(",")[1],
    });
    const output = updated.slots[0].output!;
    const copy = await window.api.generation.copyToPromptMedia({
      batchId: success.id,
      outputId: output.id,
    });
    const active = await window.api.generation.create({
      title: "Pending batch",
      prompt: "Synthetic queued work",
      targetCount: 1,
      model,
    });
    return {
      failed: failed.id,
      success: success.id,
      active: active.id,
      fileName: output.fileName,
      copy,
    };
  });
}

for (const themeMode of ["light", "dark"]) {
  test(`history deletion confirms, removes assets and survives restart (${themeMode})`, async () => {
    test.setTimeout(120_000);
    let launched = await launchPromptHub(
      "image-generation-workbench-visual.seed.json",
    );
    const userDataDir = launched.userDataDir;
    try {
      let page = launched.page;
      await setAppSettings(page, { themeMode });
      if (themeMode === "dark")
        await expect(page.locator("html")).toHaveClass(/dark/);
      else await expect(page.locator("html")).not.toHaveClass(/dark/);
      const ids = await seedHistory(page);
      const assets = path.join(userDataDir, "data", "generations", "assets");
      const copyPath = path.join(
        userDataDir,
        "data",
        "assets",
        "images",
        ids.copy,
      );
      const original = fs.readFileSync(
        path.join(assets, ids.success, ids.fileName),
      );
      await page
        .getByRole("button", { name: "Image Workbench", exact: true })
        .click();
      await page
        .getByRole("button", { name: "History works", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Delete batch: Failed batch",
          exact: true,
        })
        .click();
      let dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Failed batch");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(
        (await page.evaluate(() => window.api.generation.list())).map(
          (batch) => batch.id,
        ),
      ).toContain(ids.failed);
      await page
        .getByRole("button", {
          name: "Delete batch: Failed batch",
          exact: true,
        })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete batch", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Delete batch: Failed batch",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.api.generation.list().then((items) => items.length),
          ),
        )
        .toBe(2);

      await page
        .getByRole("button", {
          name: "Delete batch: Saved artwork",
          exact: true,
        })
        .click();
      dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("1 generated image(s)");
      await expect(dialog).toContainText(
        "Copies added to Prompts or downloaded elsewhere are kept",
      );
      await expect(dialog).toHaveCSS("opacity", "1");
      await captureAppPage(
        launched.app,
        page,
        test.info().outputPath("delete-confirmation.png"),
      );
      await dialog
        .getByRole("button", { name: "Delete batch", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      expect(fs.existsSync(path.join(assets, ids.success))).toBe(false);
      expect(fs.readFileSync(copyPath)).toEqual(original);

      const pendingDelete = page.getByRole("button", {
        name: "Delete batch: Pending batch",
        exact: true,
      });
      await expect(pendingDelete).toBeDisabled();
      await page.getByRole("button", { name: /^Pending batch,/ }).click();
      await page
        .getByRole("button", { name: "Workbench actions", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Cancel remaining", exact: true })
        .click();
      await expect(pendingDelete).toBeEnabled();
      await pendingDelete.click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete batch", exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.api.generation.list()))
        .toEqual([]);
      await expect(
        page.getByRole("button", { name: "Switch batch" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: "History works", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toHaveText(
        "No generation history yet.",
      );
      await captureAppPage(
        launched.app,
        page,
        test.info().outputPath("history-empty.png"),
      );
      await closePromptHub(launched.app, userDataDir, {
        preserveUserDataDir: true,
      });
      launched = await launchPromptHub(null, { userDataDir });
      page = launched.page;
      expect(await page.evaluate(() => window.api.generation.list())).toEqual(
        [],
      );
      expect(fs.existsSync(path.join(assets, ids.success))).toBe(false);
      expect(fs.readFileSync(copyPath)).toEqual(original);
      await expect(
        page.getByRole("heading", { name: "Image Workbench", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "History works", exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: "History works", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toHaveText(
        "No generation history yet.",
      );
      await expect(
        page.getByRole("button", { name: /^Delete batch:/ }),
      ).toHaveCount(0);
    } finally {
      await closePromptHub(launched.app, userDataDir);
    }
  });
}
