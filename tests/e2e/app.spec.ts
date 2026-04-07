import { test, expect } from "@playwright/test";

import {
  closePromptHub,
  getE2EStats,
  isAppWindowVisible,
  launchPromptHub,
  resetE2EStats,
  setAppSettings,
  setAppLanguage,
  showAppWindow,
} from "./helpers/electron";

test.describe("E2E: Skill smoke", () => {
  test("launches with isolated test profile and opens the seeded skill workflow", async () => {
    const { app, page, userDataDir } = await launchPromptHub("skills-smoke.seed.json");

    try {
      await setAppLanguage(page, "en");

      await expect(page).toHaveTitle(/PromptHub/);
      await expect(page.getByRole("button", { name: "Skills" })).toBeVisible();

      await page.getByRole("button", { name: "Skills" }).click();
      await expect(page.getByRole("button", { name: "My Skills" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "write" }),
      ).toBeVisible();

      await page.getByRole("heading", { name: "write" }).click();
      await expect(page.getByRole("button", { name: "Snapshot" })).toBeVisible();
      await expect(page.getByText("Current Version v0")).toBeVisible();

      await page.getByRole("button", { name: "Snapshot" }).click();
      await expect(page.getByRole("heading", { name: "Create Snapshot" })).toBeVisible();
      await page.getByPlaceholder("Describe what changed...").fill(
        "Smoke snapshot from Playwright",
      );
      await page
        .getByRole("button", { name: "Create Snapshot" })
        .evaluate((button) => {
          (button as HTMLButtonElement).click();
        });

      await expect(page.getByText(/Update failed:/)).toHaveCount(0);

      await expect
        .poll(() =>
          page.evaluate(async () => {
            const skills = await window.api.skill.getAll();
            return skills.find((skill) => skill.name === "write")?.currentVersion ?? -1;
          }),
        )
        .toBe(1);

      await expect(
        page.getByRole("heading", { name: "Create Snapshot" }),
      ).not.toBeVisible();
      await expect(page.getByText("Current Version v1")).toBeVisible();
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });

  test("delays startup WebDAV sync until a hidden launch becomes visible", async () => {
    const { app, page, userDataDir } = await launchPromptHub(
      "background-sync.seed.json",
      {
        env: {
          PROMPTHUB_E2E_WEBDAV_MODE: "remote-empty",
        },
      },
    );

    try {
      await expect(page).toHaveTitle(/PromptHub/);
      await expect
        .poll(async () => Boolean((await getE2EStats(page))?.webdav))
        .toBe(true);
      await expect.poll(() => isAppWindowVisible(app)).toBe(false);
      await setAppSettings(page, {
        webdavEnabled: true,
        webdavUrl: "https://e2e.example.com/dav",
        webdavUsername: "e2e-user",
        webdavPassword: "e2e-pass",
        webdavSyncOnStartup: true,
        webdavSyncOnStartupDelay: 1,
        webdavAutoSyncInterval: 0,
        autoCheckUpdate: false,
      });
      await expect.poll(() => isAppWindowVisible(app)).toBe(false);
      await resetE2EStats(page);

      await page.waitForTimeout(1500);

      await expect
        .poll(async () => (await getE2EStats(page))?.webdav.upload ?? -1)
        .toBe(0);
      await expect
        .poll(async () => (await getE2EStats(page))?.webdav.stat ?? -1)
        .toBe(0);

      await showAppWindow(app);
      await expect.poll(() => isAppWindowVisible(app)).toBe(true);

      await expect
        .poll(async () => (await getE2EStats(page))?.webdav.upload ?? 0)
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await getE2EStats(page))?.webdav.ensureDirectory ?? 0)
        .toBeGreaterThan(0);
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });

  test("toggles app visibility from the local showApp shortcut", async () => {
    const { app, page, userDataDir } = await launchPromptHub("skills-smoke.seed.json");

    try {
      await expect(page).toHaveTitle(/PromptHub/);
      await expect.poll(() => isAppWindowVisible(app)).toBe(true);

      await setAppSettings(page, {
        shortcutModes: {
          showApp: "local",
        },
        autoCheckUpdate: false,
      });

      await page.locator("body").click({ position: { x: 20, y: 20 } });
      await page.keyboard.press("Alt+Shift+P");

      await expect.poll(() => isAppWindowVisible(app)).toBe(false);

      await showAppWindow(app);
      await expect.poll(() => isAppWindowVisible(app)).toBe(true);
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
