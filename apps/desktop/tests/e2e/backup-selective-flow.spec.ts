import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
  captureAppPage,
} from "./helpers/electron";
import {
  seedBackupDomains,
  readBackupDomains,
  expectBackupFiles,
} from "./helpers/backup-fixture";

async function launchHiddenBackupApp(
  profile: string,
): Promise<Awaited<ReturnType<typeof launchPromptHub>>> {
  const launched = await launchPromptHub(null, {
    userDataDir: profile,
    headed: false,
  });
  try {
    expect(
      await launched.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible()),
      ),
    ).toBe(false);
    return launched;
  } catch (error) {
    await closePromptHub(launched.app, profile);
    throw error;
  }
}

async function openBackupSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Data & Sync", exact: true }).click();
  await page
    .getByRole("button", { name: "Backup & Restore", exact: true })
    .click();
}

async function chooseDestination(
  app: ElectronApplication,
  destination: string,
): Promise<void> {
  // Replace only the native picker. All archive construction and filesystem I/O remain real.
  await app.evaluate(({ dialog }, filePath) => {
    Reflect.set(dialog, "showSaveDialog", async () => ({
      canceled: false,
      filePath,
    }));
  }, destination);
}

async function selectExportScope(page: Page, history: boolean): Promise<void> {
  for (const name of [
    "Prompts",
    "Folders",
    "Media",
    "AI config",
    "App settings",
    "Rules",
    "Skills",
    "MCP",
    "Plugins",
    "Agents",
  ]) {
    await expect(
      page
        .getByRole("button", { name, exact: true })
        .and(page.locator("[aria-pressed]")),
    ).toHaveAttribute("aria-pressed", "true");
  }
  const versions = page.getByRole("button", {
    name: "Version history",
    exact: true,
  });
  await expect(versions).toHaveAttribute("aria-pressed", "false");
  if (history) await versions.click();
  await expect(versions).toHaveAttribute("aria-pressed", String(history));
}

async function importFromSettings(page: Page, archive: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import Data", exact: true }).click();
  await (await chooser).setFiles(archive);
  const summary = page.getByRole("alertdialog", {
    name: "Review import summary",
  });
  await expect(summary).toBeVisible();
  await summary
    .getByRole("button", {
      name: "Back up current data and import",
      exact: true,
    })
    .click();
  await expect(summary).toBeHidden();
}

async function dismissToasts(page: Page): Promise<void> {
  for (const close of await page
    .getByRole("button", { name: "Close", exact: true })
    .all())
    await close.click();
}

for (const history of [false, true]) {
  test(`Settings selective export preserves populated domains with version history=${history}, including failure and retry`, async ({}, testInfo) => {
    test.setTimeout(150_000);
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-selective-ui-")),
    );
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    const archive = path.join(root, "backup.zip");
    let profile = source;
    let app: ElectronApplication | null = null;
    try {
      let launched = await launchHiddenBackupApp(profile);
      app = launched.app;
      const promptId = await seedBackupDomains(launched.page, root, profile);
      const before = await readBackupDomains(launched.page);
      for (const domain of [
        before.prompts,
        before.folders,
        before.skills,
        before.plugins,
        before.rules,
        before.mcp,
        before.providers,
        before.generations,
      ])
        expect(domain).toHaveLength(1);
      expect(before.generations[0].outputs).toHaveLength(1);
      const versions = await launched.page.evaluate(
        (id) => window.api.version.getAll(id),
        promptId,
      );
      expect(versions.length).toBeGreaterThanOrEqual(2);
      await openBackupSettings(launched.page);
      await selectExportScope(launched.page, history);
      await captureAppPage(
        app,
        launched.page,
        testInfo.outputPath("selected-scope.png"),
      );

      // A regular file used as a parent produces real ENOTDIR on every OS.
      // A false success toast, a changed source or a disabled retry must fail here.
      const blockedParent = path.join(root, "not-a-directory");
      fs.writeFileSync(blockedParent, "Keep this file");
      await chooseDestination(app, path.join(blockedParent, "backup.zip"));
      await launched.page
        .getByRole("button", { name: "Export Data", exact: true })
        .click();
      await expect(
        launched.page.getByText("Export failed", { exact: true }),
      ).toBeVisible();
      await expect(
        launched.page.getByText("Data exported successfully", { exact: true }),
      ).toHaveCount(0);
      expect(fs.readFileSync(blockedParent, "utf8")).toBe("Keep this file");
      expect(await readBackupDomains(launched.page)).toEqual(before);
      await expectBackupFiles(launched.page, profile);
      await dismissToasts(launched.page);

      await chooseDestination(app, archive);
      await launched.page
        .getByRole("button", { name: "Export Data", exact: true })
        .click();
      await expect(
        launched.page.getByText("Data exported successfully", { exact: true }),
      ).toBeVisible();
      expect(fs.statSync(archive).size).toBeGreaterThan(0);
      expect(await readBackupDomains(launched.page)).toEqual(before);
      await captureAppPage(
        app,
        launched.page,
        testInfo.outputPath("export-success.png"),
      );
      await launched.page.evaluate(
        (id) =>
          window.api.prompt.update(id, { userPrompt: "Edited after export" }),
        promptId,
      );
      expect(
        (await readBackupDomains(launched.page)).prompts[0].userPrompt,
      ).toBe("Edited after export");
      await closePromptHub(app, profile, { preserveUserDataDir: true });
      app = null;
      launched = await launchHiddenBackupApp(profile);
      app = launched.app;
      expect(
        (await readBackupDomains(launched.page)).prompts[0].userPrompt,
      ).toBe("Edited after export");
      await closePromptHub(app, profile, { preserveUserDataDir: true });
      app = null;

      // Fresh destination prevents an empty or incomplete archive passing against retained source data.
      profile = destination;
      launched = await launchHiddenBackupApp(profile);
      app = launched.app;
      await setAppSettings(launched.page, {
        language: "en",
        autoCheckUpdate: false,
        minimizeOnLaunch: false,
      });
      expect(
        await launched.page.evaluate(() => window.api.prompt.getAll()),
      ).toEqual([]);
      await openBackupSettings(launched.page);
      await importFromSettings(launched.page, archive);
      await closePromptHub(app, profile, { preserveUserDataDir: true });
      app = null;
      launched = await launchHiddenBackupApp(profile);
      app = launched.app;
      expect(await readBackupDomains(launched.page)).toEqual(before);
      await expectBackupFiles(launched.page, profile);
      const restoredVersions = await launched.page.evaluate(
        (id) => window.api.version.getAll(id),
        promptId,
      );
      if (history) expect(restoredVersions).toEqual(versions);
      else {
        expect(restoredVersions).toHaveLength(1);
        expect(restoredVersions[0].userPrompt).toBe(
          before.prompts[0].userPrompt,
        );
      }
      await expect(
        launched.page.getByText("Backup prompt", { exact: true }).first(),
      ).toBeVisible();
      await captureAppPage(
        app,
        launched.page,
        testInfo.outputPath("restored.png"),
      );
    } finally {
      if (app) await closePromptHub(app, profile);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
