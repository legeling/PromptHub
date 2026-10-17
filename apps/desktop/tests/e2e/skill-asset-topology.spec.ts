import fs from "fs";
import path from "path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  closePromptHub,
  launchPromptHub,
  setAppLanguage,
  setAppSettings,
} from "./helpers/electron";

async function openSkillTopology(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  const skillRow = page
    .locator("div.group")
    .filter({ has: page.getByRole("heading", { name: "write" }) })
    .first();
  await expect(skillRow).toBeVisible();
  await skillRow.click();
  await page.getByRole("button", { name: "Source" }).click();

  const topology = page.getByRole("region", { name: "Asset topology" });
  await expect(topology).toBeVisible();
  await expect(
    topology.getByText("Upstream source", { exact: true }),
  ).toBeVisible();
  await expect(
    topology.getByText("PromptHub managed package", { exact: true }),
  ).toBeVisible();
  await expect(
    topology.getByText("Distributed targets", { exact: true }),
  ).toHaveCount(0);
  await expect(topology.getByRole("listitem")).toHaveCount(2);
  return topology;
}

async function expectNoHorizontalOverflow(topology: Locator): Promise<void> {
  const layout = await topology.evaluate((element) => {
    const rootRect = element.getBoundingClientRect();
    const overflowing = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .filter((child) => {
        const rect = child.getBoundingClientRect();
        return rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1;
      })
      .map((child) => child.textContent?.trim().slice(0, 80) || child.tagName);
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowing,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.overflowing).toEqual([]);
}

test.describe("E2E: Skill asset topology", () => {
  test("stays readable in light and dark themes at desktop and narrow widths", async () => {
    const { app, page, userDataDir } = await launchPromptHub(
      "skills-smoke.seed.json",
    );
    const screenshotDir = process.env.PROMPTHUB_TOPOLOGY_SCREENSHOT_DIR;

    try {
      await setAppLanguage(page, "en");

      for (const theme of ["light", "dark"] as const) {
        await setAppSettings(page, {
          themeMode: theme,
          isDarkMode: theme === "dark",
          autoCheckUpdate: false,
        });
        await expect
          .poll(() =>
            page.evaluate(() =>
              document.documentElement.classList.contains("dark"),
            ),
          )
          .toBe(theme === "dark");

        await page.setViewportSize({ width: 1280, height: 860 });
        const desktopTopology = await openSkillTopology(page);
        await expectNoHorizontalOverflow(desktopTopology);
        if (screenshotDir) {
          fs.mkdirSync(screenshotDir, { recursive: true });
          await page.screenshot({
            path: path.join(screenshotDir, `topology-${theme}-desktop.png`),
            fullPage: true,
          });
        }

        await page.setViewportSize({ width: 820, height: 760 });
        await expectNoHorizontalOverflow(desktopTopology);
        if (screenshotDir) {
          await page.screenshot({
            path: path.join(screenshotDir, `topology-${theme}-narrow.png`),
            fullPage: true,
          });
        }
      }
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
