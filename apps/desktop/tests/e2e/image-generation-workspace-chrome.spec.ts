import { expect, test } from "@playwright/test";
import { closePromptHub, launchPromptHub } from "./helpers/electron";
import { isElectronHeaded } from "./helpers/electron-launch-options";

test("workbench hides Prompt controls and keeps grid placeholders square", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "image-generation-workbench-visual.seed.json",
  );
  try {
    await page.evaluate(async () => {
      const batch = await window.api.generation.create({
        title: "Square placeholder",
        prompt: "A colorful square",
        targetCount: 2,
        model: {
          id: "image-model-visual-qa",
          provider: "openai",
          model: "gpt-image-1",
        },
        aspectRatio: "1:1",
      });
      await window.api.generation.markSlotRunning(batch.id, 0);
    });
    await page
      .getByRole("button", { name: "Image Workbench", exact: true })
      .click();
    await expect(page.getByPlaceholder(/^Search prompts/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New batch", exact: true }),
    ).toBeVisible();
    const tile = page.getByTestId("generation-output-state-0");
    await expect(tile).toBeVisible();
    for (const width of [1200, 900]) {
      await app.evaluate(
        ({ BrowserWindow }, value) =>
          BrowserWindow.getAllWindows()[0].setSize(value, 740),
        width,
      );
      for (const density of ["Compact grid", "Large grid"]) {
        const actions = page.getByRole("button", {
          name: "Workbench actions",
          exact: true,
        });
        await actions.click();
        await page.getByRole("button", { name: density, exact: true }).click();
        await page.keyboard.press("Escape");
        await expect
          .poll(async () => {
            const bounds = await tile.boundingBox();
            return bounds ? Math.abs(bounds.width - bounds.height) : 100;
          })
          .toBeLessThan(1);
      }
    }
    await page
      .getByRole("button", { name: "Workbench actions", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Compact grid", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await tile.scrollIntoViewIfNeeded();
    if (isElectronHeaded())
      await page.screenshot({
        path: test.info().outputPath("square-generation-placeholder.png"),
        animations: "disabled",
      });
    await page
      .getByRole("button", { name: "Workbench actions", exact: true })
      .click();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await tile.boundingBox())?.height).toBe(96);
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByPlaceholder(/^Search prompts/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New", exact: true }),
    ).toBeVisible();
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
