import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";

import type {
  AppCommand,
  Settings,
  SyncProviderKind,
} from "@prompthub/shared/types";
import {
  getElectronLaunchArgs,
  getElectronLaunchEnvironment,
  isElectronHeaded,
} from "./electron-launch-options";
import { isolateMcpKeyring } from "./isolated-keyring";

export interface LaunchedElectronApp {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}

interface LaunchOptions {
  headed?: boolean;
  env?: Record<string, string>;
  userDataDir?: string;
}

function isSyncProviderKind(value: unknown): value is SyncProviderKind {
  return (
    value === "manual" ||
    value === "webdav" ||
    value === "self-hosted" ||
    value === "s3"
  );
}

function buildMainSettingsPatch(
  settingsPatch: Record<string, unknown>,
): Partial<Settings> | null {
  const nextSettings: Partial<Settings> = {};

  if (typeof settingsPatch.launchAtStartup === "boolean") {
    nextSettings.launchAtStartup = settingsPatch.launchAtStartup;
  }

  if (typeof settingsPatch.minimizeOnLaunch === "boolean") {
    nextSettings.minimizeOnLaunch = settingsPatch.minimizeOnLaunch;
  }

  if (typeof settingsPatch.githubToken === "string") {
    nextSettings.githubToken = settingsPatch.githubToken;
  }

  if (isSyncProviderKind(settingsPatch.syncProvider)) {
    nextSettings.sync = {
      enabled: settingsPatch.syncProvider !== "manual",
      provider: settingsPatch.syncProvider,
      autoSync: settingsPatch.syncProvider !== "manual",
    };
  }

  return Object.keys(nextSettings).length > 0 ? nextSettings : null;
}

function getMainEntry() {
  return path.join(process.cwd(), "out/main/index.js");
}

function getSeedPath(seedFileName: string) {
  return path.join(process.cwd(), "tests/e2e/fixtures", seedFileName);
}

async function waitForRendererReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.locator("#root button:not([disabled])").first(),
  ).toBeVisible();
}

export async function launchPromptHub(
  seedFileName: string | null,
  options: LaunchOptions = {},
): Promise<LaunchedElectronApp> {
  const userDataDir =
    options.userDataDir ||
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-e2e-"));
  const mainEntry = getMainEntry();
  const seedPath = seedFileName ? getSeedPath(seedFileName) : undefined;
  const env = getElectronLaunchEnvironment(userDataDir, options.env);
  fs.mkdirSync(env.HOME, { recursive: true });

  const app = await electron.launch({
    args: getElectronLaunchArgs(
      mainEntry,
      process.platform,
      Boolean(process.env.CI),
      options.headed,
    ),
    env: {
      ...env,
      ...(seedPath ? { PROMPTHUB_E2E_SEED_PATH: seedPath } : {}),
    },
  });

  try {
    await isolateMcpKeyring(app);
    const page = await app.firstWindow();
    await waitForRendererReady(page);
    return { app, page, userDataDir };
  } catch (error) {
    await closePromptHub(app, userDataDir);
    throw error;
  }
}

export async function setAppLanguage(page: Page, language: string) {
  await setAppSettings(page, { language });
}

export async function setAppSettings(
  page: Page,
  nextSettings: Record<string, unknown>,
) {
  await waitForRendererReady(page);
  const mainSettingsPatch = buildMainSettingsPatch(nextSettings);

  await page.evaluate(
    async ({ settingsPatch, persistedSettingsPatch }) => {
      const persistence = window.api.settings.rendererPersistence;
      if (persistence) {
        const canonical = await persistence.get();
        await persistence.replaceSettings({
          ...(canonical?.settings ?? {}),
          ...settingsPatch,
        });
      }
      const raw = localStorage.getItem("prompthub-settings");
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.state = {
        ...(parsed.state || {}),
        ...settingsPatch,
      };
      localStorage.setItem("prompthub-settings", JSON.stringify(parsed));
      if (persistedSettingsPatch) {
        await window.api.settings.set(persistedSettingsPatch);
      }
    },
    { settingsPatch: nextSettings, persistedSettingsPatch: mainSettingsPatch },
  );
  await page.reload();
  await waitForRendererReady(page);
}

export async function closePromptHub(
  app: ElectronApplication,
  userDataDir: string,
  options: { preserveUserDataDir?: boolean } = {},
) {
  await app.close();
  if (!options.preserveUserDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
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
  if (!isElectronHeaded()) {
    throw new Error("Native window display requires PROMPTHUB_E2E_HEADED=1");
  }
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    }
  });
}

export async function sendAppCommand(
  app: ElectronApplication,
  command: AppCommand,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, nextCommand) => {
    const appWindow = BrowserWindow.getAllWindows()[0];
    appWindow?.webContents.send("app:command", nextCommand);
  }, command);
}
