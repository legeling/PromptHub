import { expect, test } from "@playwright/test";
import {
  closePromptHub,
  getE2EStats,
  isAppWindowVisible,
  launchPromptHub,
  setAppLanguage,
} from "./helpers/electron";

test("operates and reloads the real renderer without showing or focusing a native window", async () => {
  const { app, page, userDataDir } = await launchPromptHub(null, {
    headed: false,
  });
  try {
    await expect.poll(() => isAppWindowVisible(app)).toBe(false);
    await setAppLanguage(page, "en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Model Services", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Add Provider", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect.poll(() => isAppWindowVisible(app)).toBe(false);
    expect((await getE2EStats(page))?.window).toEqual({ show: 0, focus: 0 });
  } finally {
    await closePromptHub(app, userDataDir);
  }
});
