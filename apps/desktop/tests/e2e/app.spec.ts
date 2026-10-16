import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { nativeWindowTestTag } from "./helpers/electron-launch-options";

import {
  closePromptHub,
  getE2EStats,
  isAppWindowVisible,
  launchPromptHub,
  resetE2EStats,
  sendAppCommand,
  setAppSettings,
  setAppLanguage,
  showAppWindow,
} from "./helpers/electron";

test.describe("E2E: Skill smoke", () => {
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
          syncProvider: "webdav",
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

        await expect
          .poll(async () => (await getE2EStats(page))?.webdav.upload ?? 0)
          .toBeGreaterThan(0);
        await expect
          .poll(
            async () => (await getE2EStats(page))?.webdav.ensureDirectory ?? 0,
          )
          .toBeGreaterThan(0);
      } finally {
        await closePromptHub(app, userDataDir);
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
