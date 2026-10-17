import { expect, test, type Page } from "@playwright/test";
import { closePromptHub, launchPromptHub } from "./helpers/electron";
import { isElectronHeaded } from "./helpers/electron-launch-options";

async function seedImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const batch = await window.api.generation.create({
      title: "Preview regression",
      prompt: "Local preview fixture",
      targetCount: 2,
      model: {
        id: "image-model-visual-qa",
        provider: "openai",
        model: "gpt-image-1",
      },
      aspectRatio: "1:1",
    });
    for (const slotIndex of [0, 1]) {
      const canvas = document.createElement("canvas");
      canvas.width = slotIndex === 0 ? 1200 : 600;
      canvas.height = 900;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot prepare preview image fixture");
      context.fillStyle = slotIndex === 0 ? "#426893" : "#b37b53";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "white";
      for (let x = 0; x < canvas.width; x += 100) {
        context.strokeRect(x, 100, 60, canvas.height - 200);
      }
      await window.api.generation.markSlotRunning(batch.id, slotIndex);
      await window.api.generation.commitOutput({
        batchId: batch.id,
        slotIndex,
        mimeType: "image/png",
        base64: canvas.toDataURL("image/png").split(",")[1],
      });
    }
  });
}

async function verifyPersistentActions(page: Page): Promise<void> {
  const toolbar = page.getByRole("toolbar", { name: "Image actions" });
  const preview = page.getByTestId("generation-primary-preview");
  await expect(toolbar).toBeVisible();
  await expect(
    toolbar.getByText("Current image", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generated image 2", exact: true })
    .click();
  const before = await preview.boundingBox();
  if (!before) throw new Error("Missing review preview");
  for (const index of [1, 2]) {
    await page
      .getByTestId("generation-review-thumbnail")
      .nth(index - 1)
      .hover();
    await page
      .getByRole("checkbox", { name: `Select image ${index}`, exact: true })
      .click();
  }
  await expect(toolbar.getByText("2 selected", { exact: true })).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Copy image", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () => (await preview.boundingBox())?.height)
    .toBe(before.height);
  await toolbar
    .getByRole("button", { name: "Clear Selection", exact: true })
    .click();
  await expect(
    toolbar.getByText("Current image", { exact: true }),
  ).toBeVisible();
  await expect(preview).toHaveAttribute("aria-label", "Generated image 2");
  await expect
    .poll(async () => (await preview.boundingBox())?.height)
    .toBe(before.height);
  await toolbar.getByRole("button", { name: "Favorite", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.api.generation.list())[0].slots[1].output?.favorite,
      ),
    )
    .toBe(true);
  if (isElectronHeaded())
    await page.screenshot({
      path: test.info().outputPath("persistent-image-actions.png"),
    });
}

test("generated image preview zooms, pans and remains dismissible", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "image-generation-workbench-visual.seed.json",
  );
  try {
    await seedImages(page);
    await page
      .getByRole("button", { name: "Image Workbench", exact: true })
      .click();
    await verifyPersistentActions(page);
    const trigger = page
      .getByRole("button", { name: /^Generated image/ })
      .first();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Preview regression" });
    const close = dialog.getByRole("button", { name: "Close viewer" });
    const reset = dialog.getByRole("button", { name: "Reset zoom" });
    const image = dialog.getByRole("img");
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await expect(close).toBeFocused();
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(reset).toHaveText("125%");
    await image.hover();
    await page.mouse.wheel(0, -100);
    await expect(reset).toHaveText("150%");
    const viewport = image.locator("../..");
    const initialScroll = await viewport.evaluate((el) => el.scrollLeft);
    const box = await viewport.boundingBox();
    if (!box) throw new Error("Missing preview viewport");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 - 90,
      box.y + box.height / 2 - 60,
    );
    await page.mouse.up();
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(initialScroll + 80);
    await reset.click();
    await expect(reset).toHaveText("100%");
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBe(0);
    await dialog.getByRole("button", { name: "Zoom out" }).click();
    await expect(reset).toHaveText("75%");
    await page.keyboard.press("ArrowRight");
    await expect(reset).toHaveText("100%");
    for (const fullscreen of [false, true]) {
      await app.evaluate(({ BrowserWindow }, value) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setSize(900, 650);
        window.setFullScreen(value);
      }, fullscreen);
      for (let index = 0; index < 5; index++)
        await dialog.getByRole("button", { name: "Zoom in" }).click();
      await expect(reset).toHaveText("400%");
      await expect
        .poll(() =>
          viewport.evaluate((el) =>
            Math.abs(
              (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth - 0.5,
            ),
          ),
        )
        .toBeLessThan(0.01);
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByRole("button", { name: "Download", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      if (isElectronHeaded())
        await page.screenshot({
          path: test
            .info()
            .outputPath(`preview-${fullscreen ? "fullscreen" : "compact"}.png`),
        });
      if (fullscreen) await page.keyboard.press("Escape");
      else await close.click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(reset).toHaveText("100%");
    }
    await close.click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
