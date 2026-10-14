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
} from "./helpers/electron";

async function selectBackupFile(page: Page, archive: string): Promise<void> {
  const selection = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import Data", exact: true }).click();
  await (await selection).setFiles(archive);
  await expect(
    page.getByRole("alertdialog", { name: "Review import summary" }),
  ).toBeVisible();
}

async function readContent(
  page: Page,
  id: string,
): Promise<string | undefined> {
  return page.evaluate(
    async (promptId) =>
      (await window.api.prompt.getAll()).find((item) => item.id === promptId)
        ?.userPrompt,
    id,
  );
}

test("exports a native ZIP from Settings, cancels then confirms restore, and reopens the restored data", async () => {
  test.setTimeout(120_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-backup-ui-"));
  const profile = path.join(root, "profile");
  const archive = path.join(root, "ui-backup.zip");
  let app: ElectronApplication | null = null;
  try {
    let launched = await launchPromptHub(null, { userDataDir: profile });
    app = launched.app;
    await setAppSettings(launched.page, {
      language: "en",
      autoCheckUpdate: false,
    });
    const fixture = await launched.page.evaluate(async () => {
      const folder = await window.api.folder.create({
        name: "Restored UI folder",
      });
      const prompt = await window.api.prompt.create({
        title: "Restored UI prompt",
        promptType: "text",
        userPrompt: "Content in native backup",
        folderId: folder.id,
      });
      return { id: prompt.id, folderId: folder.id };
    });
    // Only the native destination picker is replaced; ZIP creation remains real.
    await app.evaluate(({ dialog }, filePath) => {
      Reflect.set(dialog, "showSaveDialog", async () => ({
        canceled: false,
        filePath,
      }));
    }, archive);
    await launched.page
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await launched.page
      .getByRole("button", { name: "Data & Sync", exact: true })
      .click();
    await launched.page
      .getByRole("button", { name: "Backup & Restore", exact: true })
      .click();
    await launched.page
      .getByRole("button", { name: "Full backup", exact: true })
      .click();
    await expect
      .poll(() => fs.existsSync(archive) && fs.statSync(archive).size > 0)
      .toBe(true);
    await launched.page.evaluate(
      (id) =>
        window.api.prompt.update(id, {
          userPrompt: "Local change after backup",
        }),
      fixture.id,
    );
    await selectBackupFile(launched.page, archive);
    await launched.page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    expect(await readContent(launched.page, fixture.id)).toBe(
      "Local change after backup",
    );
    await selectBackupFile(launched.page, archive);
    await launched.page
      .getByRole("alertdialog")
      .getByRole("button", {
        name: "Back up current data and import",
        exact: true,
      })
      .click();
    await expect(launched.page.getByRole("alertdialog")).not.toBeVisible();
    // Portable restore closes SQLite and requires relaunch. E2E disables the OS
    // relaunch scheduler, so reopen the same profile explicitly before readback.
    await closePromptHub(app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, { userDataDir: profile });
    app = launched.app;
    expect(await readContent(launched.page, fixture.id)).toBe(
      "Content in native backup",
    );
    const restored = await launched.page.evaluate(async () => ({
      prompts: await window.api.prompt.getAll(),
      folders: await window.api.folder.getAll(),
    }));
    expect(restored.prompts).toContainEqual(
      expect.objectContaining({ id: fixture.id, folderId: fixture.folderId }),
    );
    expect(restored.folders).toContainEqual(
      expect.objectContaining({
        id: fixture.folderId,
        name: "Restored UI folder",
      }),
    );
    await launched.page
      .getByRole("button", { name: "Prompts", exact: true })
      .click();
    await expect(
      launched.page.getByText("Restored UI prompt", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    if (app) await closePromptHub(app, profile);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
