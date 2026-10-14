import { expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  closePromptHub,
  launchPromptHub,
  setAppSettings,
} from "./helpers/electron";

// Reproduces current export continuity, not the unknown Windows #221 user profile.
test("keeps prompt writes available after native backup export and restart (#221)", async () => {
  test.setTimeout(120_000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-221-backup-"));
  const profile = path.join(root, "profile");
  const home = path.join(root, "home");
  const archive = path.join(root, "prompt-backup.zip");
  fs.mkdirSync(home);
  const options = {
    userDataDir: profile,
    env: { HOME: home, USERPROFILE: home },
  };
  let app: ElectronApplication | null = null;
  try {
    let launched = await launchPromptHub(null, options);
    app = launched.app;
    await setAppSettings(launched.page, {
      language: "en",
      autoCheckUpdate: false,
      minimizeOnLaunch: false,
    });
    await app.evaluate(({ dialog }, destination) => {
      Reflect.set(dialog, "showSaveDialog", async () => ({
        canceled: false,
        filePath: destination,
      }));
    }, archive);
    const saved = await launched.page.evaluate(async () => {
      const folder = await window.api.folder.create({ name: "Backup folder" });
      const prompt = await window.api.prompt.create({
        title: "Before backup",
        promptType: "text",
        systemPrompt: "System instructions",
        userPrompt: "Backup content",
        folderId: folder.id,
        tags: ["backup-check"],
      });
      if (!window.__PROMPTHUB_E2E_BACKUP__ || !window.electron.exportZip)
        throw new Error("Native backup entrypoint unavailable");
      const backup = await window.__PROMPTHUB_E2E_BACKUP__.exportDatabase();
      const scope = {
        prompts: true,
        folders: true,
        versions: true,
        images: true,
        videos: true,
        skills: true,
        rules: true,
        mcp: true,
        plugins: true,
        agents: true,
        aiConfig: true,
        settings: true,
      };
      const result = await window.electron.exportZip({
        scope: {
          ...scope,
          config: true,
          aiConfigJson: JSON.stringify(backup.aiConfig ?? {}),
          settingsJson: JSON.stringify(backup.settings ?? {}),
          exportJson: JSON.stringify({
            kind: "prompthub-export",
            exportedAt: backup.exportedAt,
            scope,
            payload: backup,
          }),
        },
      });
      return { result, id: prompt.id, folderId: folder.id };
    });
    expect(saved.result).toEqual({ canceled: false, filePath: archive });
    expect(fs.statSync(archive).size).toBeGreaterThan(0);
    const preview = await launched.page.evaluate(
      (file) => window.electron.previewPortableBackup?.(file),
      archive,
    );
    expect(preview, JSON.stringify(preview)).toMatchObject({ success: true });
    await launched.page.evaluate(
      (id) =>
        window.api.prompt.update(id, { userPrompt: "Changed after export" }),
      saved.id,
    );
    const createdAfterExport = await launched.page.evaluate(
      (folderId) =>
        window.api.prompt.create({
          title: "After export",
          promptType: "text",
          userPrompt: "Still writable",
          folderId,
        }),
      saved.folderId,
    );
    await closePromptHub(app, profile, { preserveUserDataDir: true });
    app = null;
    launched = await launchPromptHub(null, options);
    app = launched.app;
    const reopened = await launched.page.evaluate(async ({ id }) => {
      const prompts = await window.api.prompt.getAll();
      const folders = await window.api.folder.getAll();
      return {
        prompt: prompts.find((item) => item.id === id),
        folders,
        prompts,
      };
    }, saved);
    expect(reopened.prompt).toMatchObject({
      id: saved.id,
      userPrompt: "Changed after export",
      folderId: saved.folderId,
    });
    expect(reopened.folders).toEqual([
      expect.objectContaining({ id: saved.folderId }),
    ]);
    expect(reopened.prompts).toContainEqual(
      expect.objectContaining({
        id: createdAfterExport.id,
        title: "After export",
        userPrompt: "Still writable",
      }),
    );
  } finally {
    if (app) await closePromptHub(app, profile);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
