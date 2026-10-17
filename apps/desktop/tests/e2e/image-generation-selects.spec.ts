import { expect, test } from "@playwright/test";
import { closePromptHub, launchPromptHub } from "./helpers/electron";
import { isElectronHeaded } from "./helpers/electron-launch-options";

test("workbench uses themed dropdowns contained in a compact viewport", async () => {
  const { app, page, userDataDir } = await launchPromptHub(
    "image-generation-workbench-visual.seed.json",
  );
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 720),
    );
    await page
      .getByRole("button", { name: "Image Workbench", exact: true })
      .click();
    const panel = page.getByTestId("generation-config-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("select")).toHaveCount(0);
    const choices = [
      ["Source Prompt", "Editorial product study"],
      ["Model", "GPT Image"],
      ["Ratio", "1:1"],
      ["Quality", "High"],
    ];
    for (const [label, option] of choices) {
      const trigger = panel.getByRole("button", { name: label, exact: true });
      await trigger.click();
      const menu = page.getByRole("listbox", { name: label, exact: true });
      await expect(menu).toBeVisible();
      await menu.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      const menuBox = await menu.boundingBox();
      const triggerBox = await trigger.boundingBox();
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
      }));
      expect(menuBox).not.toBeNull();
      expect(triggerBox).not.toBeNull();
      if (menuBox && triggerBox) {
        expect(menuBox.x).toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
        expect(menuBox.y).toBeGreaterThanOrEqual(0);
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
        const gap =
          menuBox.y >= triggerBox.y + triggerBox.height
            ? menuBox.y - triggerBox.y - triggerBox.height
            : triggerBox.y - menuBox.y - menuBox.height;
        expect(gap).toBeCloseTo(4, 0);
      }
      if (isElectronHeaded() && label === "Quality")
        await page.screenshot({
          path: test.info().outputPath("quality-dropdown.png"),
          animations: "disabled",
        });
      await menu.getByRole("option", { name: option, exact: true }).click();
      await expect(menu).toHaveCount(0);
      await expect(trigger).toContainText(option);
    }
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    const model = panel.getByRole("button", { name: "Model", exact: true });
    await model.click();
    await expect(
      page.getByRole("listbox", { name: "Model", exact: true }),
    ).toBeVisible();
    if (isElectronHeaded())
      await page.screenshot({
        path: test.info().outputPath("model-dropdown-dark.png"),
        animations: "disabled",
      });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await model.click();
    await page
      .getByRole("heading", { name: "Image Workbench", exact: true })
      .click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
