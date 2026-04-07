import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

export interface LaunchedElectronApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}

interface LaunchOptions {
  env?: Record<string, string>;
}

function getMainEntry() {
  return path.join(process.cwd(), "out/main/index.js");
}

function getSeedPath(seedFileName: string) {
  return path.join(process.cwd(), "tests/e2e/fixtures", seedFileName);
}

export async function launchPromptHub(
  seedFileName: string,
  options: LaunchOptions = {},
): Promise<LaunchedElectronApp> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-e2e-"));
  const mainEntry = getMainEntry();

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      PROMPTHUB_E2E: "1",
      PROMPTHUB_E2E_USER_DATA_DIR: userDataDir,
      PROMPTHUB_E2E_SEED_PATH: getSeedPath(seedFileName),
      ...options.env,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#root")).toBeVisible();

  return { app, page, userDataDir };
}

export async function setAppLanguage(page: Page, language: string) {
  await page.evaluate((nextLanguage) => {
    localStorage.setItem(
      "prompthub-settings",
      JSON.stringify({
        state: { language: nextLanguage },
      }),
    );
  }, language);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

export async function setAppSettings(
  page: Page,
  nextSettings: Record<string, unknown>,
) {
  await page.evaluate((settingsPatch) => {
    const raw = localStorage.getItem("prompthub-settings");
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.state = {
      ...(parsed.state || {}),
      ...settingsPatch,
    };
    localStorage.setItem("prompthub-settings", JSON.stringify(parsed));
  }, nextSettings);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

export async function closePromptHub(app: ElectronApplication, userDataDir: string) {
  await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

export async function getE2EStats(page: Page) {
  return page.evaluate(() => window.electron?.e2e?.getStats?.());
}

export async function resetE2EStats(page: Page) {
  await page.evaluate(() => window.electron?.e2e?.resetStats?.());
}

export async function isAppWindowVisible(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win ? win.isVisible() : false;
  });
}

export async function showAppWindow(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    }
  });
}
