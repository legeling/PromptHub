import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

const title = "Prompt with a selected reference image";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

async function readSavedImages(page: Page): Promise<string[]> {
  return page.evaluate(async (promptTitle) => {
    const prompts = await window.api.prompt.getAll();
    return prompts.find((prompt) => prompt.title === promptTitle)?.images ?? [];
  }, title);
}

async function verifyZoom(page: Page): Promise<void> {
  const preview = page.getByRole("dialog", { name: "Preview", exact: true });
  const image = preview.getByRole("img");
  const original = await image.boundingBox();
  if (!original) throw new Error("Reference preview has no visible bounds");
  await preview.getByRole("button", { name: "Zoom in", exact: true }).click();
  const reset = preview.getByRole("button", { name: "Reset zoom" });
  await expect(reset).toHaveText("125%");
  const enlarged = await image.boundingBox();
  expect(enlarged?.width).toBeGreaterThan(original.width);
  expect(enlarged?.height).toBeGreaterThan(original.height);
  await image.hover();
  await page.mouse.wheel(0, -100);
  await expect(reset).toHaveText("150%");
  const viewport = image.locator("../..");
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("Zoom viewport has no visible bounds");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 - 60,
    bounds.y + bounds.height / 2 - 60,
  );
  await page.mouse.up();
  expect(
    await viewport.evaluate((element) => element.scrollLeft),
  ).toBeGreaterThan(0);
  await reset.click();
  await expect(reset).toHaveText("100%");
  await preview.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(reset).toHaveText("75%");
  await page.keyboard.press("Escape");
  await expect(preview).not.toBeVisible();
}

async function verifyEditPreview(page: Page): Promise<void> {
  await setAppSettings(page, { themeMode: "dark" });
  await page.getByRole("button", { name: "Gallery View", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit Prompt", exact: true });
  await editor
    .getByRole("button", { name: "Preview reference image 1" })
    .click();
  await page.screenshot({
    path: test.info().outputPath("reference-preview-dark.png"),
    timeout: 10_000,
  });
  await verifyZoom(page);
  await expect(editor).toBeVisible();
  await expect(
    editor.getByRole("textbox", { name: "User Prompt", exact: true }),
  ).toHaveValue("Use the attached reference.");
}

// Only the OS chooser is replaced. The click, preload, registered dialog/image
// IPC, managed file copy, preview protocol and Prompt persistence remain real.
test("selects a reference image, previews it, and preserves it after saving and reload", async () => {
  test.setTimeout(120_000);
  const fixtureDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-media-picker-"),
  );
  const imagePath = path.join(fixtureDir, "reference.png");
  fs.writeFileSync(imagePath, png);
  try {
    const { app, page, userDataDir } = await launchPromptHub(null);
    try {
      await setAppSettings(page, {
        language: "en",
        autoCheckUpdate: false,
        themeMode: "light",
      });
      await app.evaluate(({ dialog }, selectedPath) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [selectedPath],
        });
      }, imagePath);
      await page
        .getByRole("button", { name: "New", exact: true })
        .first()
        .click();
      const modal = page.getByRole("dialog", {
        name: "New Prompt",
        exact: true,
      });
      await modal.getByRole("textbox", { name: /Title/ }).fill(title);
      await modal
        .getByRole("textbox", { name: /User Prompt/ })
        .fill("Use the attached reference.");
      await modal.getByRole("button", { name: /More Settings/ }).click();
      await modal
        .getByRole("button", { name: "Upload/Paste/URL", exact: true })
        .click();
      const preview = modal.getByAltText("preview-0");
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.evaluate(
            (element) =>
              element instanceof HTMLImageElement &&
              element.complete &&
              element.naturalWidth > 0,
          ),
        )
        .toBe(true);
      await modal
        .getByRole("button", { name: "Preview reference image 1" })
        .click();
      await page.screenshot({
        path: test.info().outputPath("reference-preview-light.png"),
        timeout: 10_000,
      });
      await verifyZoom(page);
      await expect(modal).toBeVisible();
      await expect(modal.getByRole("textbox", { name: /Title/ })).toHaveValue(
        title,
      );
      await modal.getByRole("button", { name: "Create", exact: true }).click();
      await expect(modal).not.toBeVisible();
      await expect.poll(() => readSavedImages(page)).toHaveLength(1);
      const images = await readSavedImages(page);
      fs.rmSync(imagePath);
      await page.reload();
      await expect.poll(() => readSavedImages(page)).toEqual(images);
      const savedBytes = await page.evaluate(async (fileName) => {
        const response = await fetch(
          `local-image://${encodeURIComponent(fileName)}`,
        );
        return Array.from(new Uint8Array(await response.arrayBuffer()));
      }, images[0]);
      expect(Buffer.from(savedBytes)).toEqual(png);
      await verifyEditPreview(page);
    } finally {
      await closePromptHub(app, userDataDir);
    }
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
