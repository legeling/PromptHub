import fs from "fs";
import path from "path";
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { nativeWindowTestTag } from "./helpers/electron-launch-options";
import { createWebDAVFixture } from "./helpers/webdav-fixture";

import {
  captureAppPage,
  closePromptHub,
  isAppWindowVisible,
  launchPromptHub,
  sendAppCommand,
  setAppSettings,
  setAppLanguage,
  showAppWindow,
  type LaunchedElectronApp,
} from "./helpers/electron";

async function createPromptThroughEditor(
  page: Page,
  title: string,
  content: string,
): Promise<void> {
  await page.getByRole("button", { name: "Prompts", exact: true }).click();
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Prompt", exact: true });
  await dialog.getByPlaceholder("Name your Prompt").fill(title);
  await dialog
    .getByPlaceholder("Enter your Prompt content", { exact: false })
    .fill(content);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
}

test("creates Prompts through the editor before and after a complete restart (#236)", async () => {
  test.setTimeout(120_000);
  let launched = await launchPromptHub(null);
  let app: ElectronApplication | null = launched.app;
  const profile = launched.userDataDir;
  const expected = [
    { title: "Before restart", userPrompt: "First body Ω" },
    { title: "After restart", userPrompt: "Second body 🚀" },
  ];
  try {
    await setAppSettings(launched.page, {
      language: "en",
      autoCheckUpdate: false,
    });
    for (const item of expected) {
      await createPromptThroughEditor(
        launched.page,
        item.title,
        item.userPrompt,
      );
      await closePromptHub(app, profile, { preserveUserDataDir: true });
      app = null;
      launched = await launchPromptHub(null, { userDataDir: profile });
      app = launched.app;
    }
    const records = await launched.page.evaluate(() =>
      window.api.prompt.getAll(),
    );
    expect(records).toHaveLength(expected.length);
    for (const item of expected) {
      expect(records).toContainEqual(expect.objectContaining(item));
      await expect(
        launched.page.getByText(item.title, { exact: true }).first(),
      ).toBeVisible();
    }
    await captureAppPage(
      app,
      launched.page,
      test.info().outputPath("prompts-after-restarts.png"),
    );
  } finally {
    if (app) await closePromptHub(app, profile);
    else fs.rmSync(profile, { recursive: true, force: true });
  }
});

test.describe("E2E: Skill smoke", () => {
  test("copies redacted startup failure diagnostics and keeps reload usable", async () => {
    const { app, page, userDataDir } = await launchPromptHub(null);
    const clipboardBackup = await app.evaluate(({ clipboard }) =>
      clipboard.availableFormats().map((format) => ({
        format,
        data: clipboard.readBuffer(format).toString("base64"),
      })),
    );
    try {
      await setAppLanguage(page, "en");
      // A migration failure occurs before saved-language hydration; fix the browser locale too.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "language", { value: "en-US" });
      });
      // Inject only the failed storage response; real preload, startup UI and clipboard remain active.
      await app.evaluate(({ ipcMain }, channel) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
          throw new Error(
            "Synthetic startup storage failure password=fixture-secret",
          );
        });
      }, IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Unable to initialize local data" }),
      ).toBeVisible();
      await page.getByText("Error details", { exact: true }).click();
      const details = page.getByTestId("startup-error-log");
      await expect(details).toContainText("Synthetic startup storage failure");
      await expect(details).not.toContainText("fixture-secret");
      await page
        .getByRole("button", { name: "Copy error log", exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText("Error log copied");
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
        await details.textContent(),
      );
      await Promise.all([
        page.waitForEvent("domcontentloaded"),
        page
          .getByRole("button", { name: "Reload PromptHub", exact: true })
          .click(),
      ]);
      await expect(
        page.getByRole("button", { name: "Copy error log", exact: true }),
      ).toBeVisible();
    } finally {
      try {
        await app.evaluate(({ clipboard }, previous) => {
          clipboard.clear();
          for (const item of previous)
            clipboard.writeBuffer(
              item.format,
              Buffer.from(item.data, "base64"),
            );
        }, clipboardBackup);
      } finally {
        await closePromptHub(app, userDataDir);
      }
    }
  });

  test("launches with isolated test profile and opens the seeded skill workflow", async () => {
    const { app, page, userDataDir } = await launchPromptHub(
      "skills-smoke.seed.json",
    );

    try {
      await setAppLanguage(page, "en");

      await expect(page).toHaveTitle(/PromptHub/);
      await expect(page.getByRole("button", { name: "Skills" })).toBeVisible();

      await page.getByRole("button", { name: "Skills" }).click();
      const skillRow = page
        .locator("div.group")
        .filter({ has: page.getByRole("heading", { name: "write" }) })
        .first();
      await expect(skillRow).toBeVisible();
      await expect(page.getByRole("heading", { name: "write" })).toBeVisible();

      await skillRow.click();
      await expect(
        page.getByRole("button", { name: "Snapshot" }),
      ).toBeVisible();
      await expect(page.getByText("Current Version v1")).toBeVisible();

      await page.getByRole("button", { name: "Snapshot" }).click();
      await expect(
        page.getByRole("heading", { name: "Create Snapshot" }),
      ).toBeVisible();
      await page
        .getByPlaceholder("Describe what changed...")
        .fill("Smoke snapshot from Playwright");
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
            return (
              skills.find((skill) => skill.name === "write")?.currentVersion ??
              -1
            );
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

  test(
    "delays startup WebDAV sync until a hidden launch becomes visible",
    { tag: nativeWindowTestTag },
    async () => {
      const remote = await createWebDAVFixture();
      let active: LaunchedElectronApp | undefined;
      try {
        active = await launchPromptHub("background-sync.seed.json");
        const { app, page } = active;
        await expect(page).toHaveTitle(/PromptHub/);
        await expect.poll(() => isAppWindowVisible(app)).toBe(false);
        await setAppSettings(page, {
          syncProvider: "webdav",
          webdavEnabled: true,
          webdavUrl: remote.url,
          webdavUsername: "e2e-user",
          webdavPassword: "e2e-pass",
          webdavSyncOnStartup: true,
          webdavSyncOnStartupDelay: 1,
          webdavAutoSyncInterval: 0,
          autoCheckUpdate: false,
        });
        await expect.poll(() => isAppWindowVisible(app)).toBe(false);
        remote.requests.splice(0);

        await page.waitForTimeout(1500);

        expect(remote.requests).toEqual([]);
        expect(remote.objects.size).toBe(0);

        await page.evaluate(() => window.electron?.toggleVisibility());
        await expect.poll(() => isAppWindowVisible(app)).toBe(true);

        await expect
          .poll(
            () =>
              page.evaluate(async () => {
                const settings = await window.api.settings.get();
                return (
                  settings.autoSyncHistory?.find(
                    (entry) => entry.provider === "webdav",
                  ) ?? null
                );
              }),
            {
              message:
                "resumed WebDAV startup sync should reach a terminal state",
            },
          )
          .toEqual(
            expect.objectContaining({
              provider: "webdav",
              reason: "startup-resume",
              status: "success",
            }),
          );

        expect(remote.requests).toEqual(
          expect.arrayContaining([
            { method: "PUT", path: "/dav/prompthub-sync/head.json" },
            { method: "MKCOL", path: "/dav/prompthub-sync" },
          ]),
        );
        expect(remote.objects.has("/dav/prompthub-sync/head.json")).toBe(true);
      } finally {
        try {
          if (active) await closePromptHub(active.app, active.userDataDir);
        } finally {
          await remote.close();
        }
      }
    },
  );

  test(
    "toggles app visibility from the local showApp shortcut",
    { tag: nativeWindowTestTag },
    async () => {
      const { app, page, userDataDir } = await launchPromptHub(
        "skills-smoke.seed.json",
      );

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
    },
  );

  test("opens lazy asset and quick-add workflows from main-process app commands", async () => {
    const { app, page, userDataDir } = await launchPromptHub(null);

    try {
      await setAppLanguage(page, "en");
      await expect
        .poll(() =>
          page.evaluate(async () => (await window.api.settings.get()).language),
        )
        .toBe("en");

      await sendAppCommand(app, { type: "asset:create", asset: "mcp" });
      const mcpDialog = page.getByRole("dialog", { name: "New MCP" });
      await expect(
        mcpDialog.getByTestId("mcp-create-method-chooser"),
      ).toBeVisible();
      await mcpDialog.getByRole("button", { name: "Close" }).click();
      await expect(mcpDialog).not.toBeVisible();

      await sendAppCommand(app, { type: "asset:create", asset: "plugin" });
      const pluginDialog = page.getByRole("dialog", { name: "New Plugin" });
      await expect(pluginDialog).toBeVisible();
      await pluginDialog.getByRole("button", { name: "Close" }).click();
      await expect(pluginDialog).not.toBeVisible();

      await sendAppCommand(app, {
        type: "prompt:quick-add",
        mode: "generate",
      });
      await expect(page.getByTestId("quick-add-backdrop")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "AI Generate Prompt" }),
      ).toHaveAttribute("aria-pressed", "true");
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });

  test("preserves seeded prompts and history in SQLite across cold startup", async () => {
    let { app, page, userDataDir } = await launchPromptHub(
      "prompt-workspace.seed.json",
    );
    try {
      for (const startup of [1, 2]) {
        await expect(page).toHaveTitle(/PromptHub/);
        const prompt = await page.evaluate(() =>
          window.api.prompt.get("prompt_ops_1"),
        );
        expect(prompt).toMatchObject({
          id: "prompt_ops_1",
          title: "Deploy Checklist",
          userPrompt: "Review deploy health for {{service}}.",
          folderId: "folder_ops",
          currentVersion: 1,
        });
        const versions = await page.evaluate(() =>
          window.api.version.getAll("prompt_ops_1"),
        );
        expect(versions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "version_ops_1",
              promptId: "prompt_ops_1",
              userPrompt: prompt.userPrompt,
            }),
          ]),
        );
        expect(
          fs.existsSync(
            path.join(userDataDir, "data/prompts/prompt_ops_1/prompt.json"),
          ),
        ).toBe(false);
        if (startup === 1) {
          await app.close();
          ({ app, page } = await launchPromptHub(null, { userDataDir }));
        }
      }
    } finally {
      await closePromptHub(app, userDataDir);
    }
  });
});
