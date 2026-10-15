import { expect, test } from "@playwright/test";
import rootPackage from "../../../../package.json";
import { nativeWindowTestTag } from "./helpers/electron-launch-options";

import {
  closePromptHub,
  launchPromptHub,
  setAppLanguage,
  setAppSettings,
} from "./helpers/electron";
import {
  loginSelfHosted,
  startSelfHostedTestServer,
} from "./helpers/self-hosted-web";

interface DesktopBackupListResponse {
  data: Array<{
    id: string;
    summary: {
      prompts: number;
      folders: number;
      rules: number;
      skills: number;
      mcpServers: number;
      plugins: number;
    };
  }>;
}

interface AutoSyncHistoryEntry {
  provider: string;
  reason: string;
  status: string;
  message: string;
}

async function readLatestSelfHostedHistory(
  page: Parameters<typeof setAppSettings>[0],
): Promise<AutoSyncHistoryEntry | null> {
  return page.evaluate(async () => {
    const settings = await window.api.settings.get();
    const history = Array.isArray(settings.autoSyncHistory)
      ? settings.autoSyncHistory
      : [];
    return history.find((entry) => entry.provider === "self-hosted") ?? null;
  });
}

test.describe("E2E: desktop self-hosted sync", () => {
  test("creates an immutable remote backup on startup without replacing the local workspace", { tag: nativeWindowTestTag }, async () => {
    const server = await startSelfHostedTestServer();
    const firstLaunch = await launchPromptHub("prompt-workspace.seed.json");
    let app = firstLaunch.app;
    let page = firstLaunch.page;
    const { userDataDir } = firstLaunch;

    try {
      await setAppLanguage(page, "en");

      const accessToken = await loginSelfHosted(
        server.baseUrl,
        server.username,
        server.password,
      );

      const syncUpdateResponse = await fetch(
        `${server.baseUrl}/api/sync/data`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payload: {
              version: "web-backup-v2",
              exportedAt: "2026-04-16T08:00:00.000Z",
              prompts: [
                {
                  id: "remote_auto_prompt",
                  title: "Auto Pull Prompt",
                  description: "Synced during desktop startup",
                  promptType: "text",
                  systemPrompt: "You are the startup sync payload",
                  userPrompt: "Confirm automatic startup sync works.",
                  variables: [],
                  tags: ["startup", "sync"],
                  folderId: "remote_auto_folder",
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  source: null,
                  notes: "Pulled automatically from self-hosted PromptHub Web",
                  lastAiResponse: null,
                  createdAt: "2026-04-16T08:00:00.000Z",
                  updatedAt: "2026-04-16T08:00:00.000Z",
                },
              ],
              promptVersions: [
                {
                  id: "remote_auto_version",
                  promptId: "remote_auto_prompt",
                  version: 1,
                  systemPrompt: "You are the startup sync payload",
                  userPrompt: "Confirm automatic startup sync works.",
                  variables: [],
                  note: "Initial startup sync version",
                  aiResponse: null,
                  createdAt: "2026-04-16T08:00:00.000Z",
                },
              ],
              folders: [
                {
                  id: "remote_auto_folder",
                  name: "Startup Folder",
                  order: 0,
                  createdAt: "2026-04-16T08:00:00.000Z",
                  updatedAt: "2026-04-16T08:00:00.000Z",
                },
              ],
              skills: [],
              skillVersions: [],
              settings: {
                theme: "dark",
                language: "en",
                autoSave: true,
                customPlatformRootPaths: {},
                customSkillPlatformPaths: {},
                sync: {
                  enabled: false,
                  provider: "manual",
                  autoSync: false,
                },
              },
            },
          }),
        },
      );
      expect(syncUpdateResponse.ok).toBe(true);

      await setAppSettings(page, {
        autoCheckUpdate: false,
        minimizeOnLaunch: false,
        syncProvider: "self-hosted",
        selfHostedSyncEnabled: true,
        selfHostedSyncUrl: server.baseUrl,
        selfHostedSyncUsername: server.username,
        selfHostedSyncPassword: server.password,
        selfHostedSyncOnStartup: true,
        selfHostedSyncOnStartupDelay: 0,
      });

      await closePromptHub(app, userDataDir, { preserveUserDataDir: true });

      const secondLaunch = await launchPromptHub(null, {
        userDataDir,
      });
      app = secondLaunch.app;
      page = secondLaunch.page;

      const startupSettings = await page.evaluate(async () => {
        const settings = await window.api.settings.get();
        return {
          onLine: navigator.onLine,
          selfHostedSyncEnabled:
            (settings as unknown as Record<string, unknown>)
              .selfHostedSyncEnabled ?? false,
          selfHostedSyncOnStartup:
            (settings as unknown as Record<string, unknown>)
              .selfHostedSyncOnStartup ?? false,
          selfHostedSyncUrl:
            (settings as unknown as Record<string, unknown>)
              .selfHostedSyncUrl ?? "",
          selfHostedSyncUsername:
            (settings as unknown as Record<string, unknown>)
              .selfHostedSyncUsername ?? "",
        };
      });

      expect(startupSettings.selfHostedSyncEnabled).toBe(true);
      expect(startupSettings.selfHostedSyncOnStartup).toBe(true);
      expect(startupSettings.selfHostedSyncUrl).toBe(server.baseUrl);
      expect(startupSettings.selfHostedSyncUsername).toBe(server.username);

      await expect
        .poll(() => readLatestSelfHostedHistory(page), {
          timeout: 20000,
          message: "self-hosted startup backup should reach a terminal state",
        })
        .toEqual(
          expect.objectContaining({
            provider: "self-hosted",
            reason: "startup",
            status: "success",
          }),
        );

      await expect
        .poll(
          async () => {
            const response = await fetch(
              `${server.baseUrl}/api/backups/desktop`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
              },
            );
            if (!response.ok) return [];
            const payload =
              (await response.json()) as DesktopBackupListResponse;
            return payload.data.map((backup) => backup.summary);
          },
          {
            timeout: 20000,
            message: "desktop should upload an immutable backup on startup",
          },
        )
        .toContainEqual(expect.objectContaining({ prompts: 1, folders: 1 }));

      const restoredState = await page.evaluate(async () => {
        const prompts = await window.api.prompt.getAll();
        const folders = await window.api.folder.getAll();
        return {
          prompts: prompts.map((prompt) => ({
            title: prompt.title,
            folderId: prompt.folderId,
          })),
          folders: folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
          })),
        };
      });

      expect(restoredState.prompts).toEqual([
        expect.objectContaining({ title: "Deploy Checklist" }),
      ]);
      expect(restoredState.folders).toEqual([
        expect.objectContaining({ name: "Ops" }),
      ]);

      const startupPrompt = restoredState.prompts.find(
        (prompt) => prompt.title === "Deploy Checklist",
      );
      const startupFolder = restoredState.folders.find(
        (folder) => folder.name === "Ops",
      );
      expect(startupPrompt?.folderId).toBe(startupFolder?.id);

      const liveWorkspaceResponse = await fetch(
        `${server.baseUrl}/api/sync/data`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        },
      );
      expect(liveWorkspaceResponse.ok).toBe(true);
      const liveWorkspace = (await liveWorkspaceResponse.json()) as {
        data: { prompts: Array<{ title: string }> };
      };
      expect(liveWorkspace.data.prompts.map((prompt) => prompt.title)).toEqual([
        "Auto Pull Prompt",
      ]);
    } finally {
      await closePromptHub(app, userDataDir);
      await server.stop();
    }
  });

  test("connects, uploads to, and downloads from a live self-hosted PromptHub Web", async () => {
    const server = await startSelfHostedTestServer();
    const firstLaunch = await launchPromptHub("prompt-workspace.seed.json");
    let app = firstLaunch.app;
    let page = firstLaunch.page;
    const { userDataDir } = firstLaunch;

    try {
      await setAppLanguage(page, "en");
      await setAppSettings(page, {
        autoCheckUpdate: false,
        syncProvider: "self-hosted",
        selfHostedSyncEnabled: true,
        selfHostedSyncUrl: server.baseUrl,
        selfHostedSyncUsername: server.username,
        selfHostedSyncPassword: server.password,
      });

      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("button", { name: "Data & Sync", exact: true })
        .click();
      await page.getByRole("button", { name: /Self-Hosted PromptHub/ }).click();

      await page.getByRole("button", { name: "Test Connection" }).click();
      await expect(page.getByText(/Backup endpoint ready/i)).toBeVisible();

      const expectedRuntimeAssetCounts = await page.evaluate(async () => {
        const [rules, mcpLibrary, pluginSnapshot] = await Promise.all([
          window.api.rules.list(),
          window.api.mcp.getLibrary(),
          window.api.plugin.exportLibrarySnapshot(),
        ]);

        return {
          rules: rules.length,
          mcpServers: mcpLibrary.servers.length,
          plugins: pluginSnapshot.library.plugins.length,
        };
      });

      const backupToRemote = page.getByRole("button", {
        name: "Create remote backup",
        exact: true,
      });
      await expect(backupToRemote).toBeEnabled();
      await backupToRemote.click();
      await expect(
        page.getByText(
          new RegExp(
            `Created a remote backup with 1 prompts, 1 folders, ${expectedRuntimeAssetCounts.rules} rules, and 0 skills`,
            "i",
          ),
        ),
      ).toBeVisible();

      const accessToken = await loginSelfHosted(
        server.baseUrl,
        server.username,
        server.password,
      );

      const backupListResponse = await fetch(
        `${server.baseUrl}/api/backups/desktop`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      );
      expect(backupListResponse.ok).toBe(true);
      const backupList =
        (await backupListResponse.json()) as DesktopBackupListResponse;
      expect(backupList.data[0]?.summary).toEqual({
        prompts: 1,
        folders: 1,
        rules: expectedRuntimeAssetCounts.rules,
        skills: 0,
        promptRelations: 0,
        outputFormatItems: 0,
        mcpServers: expectedRuntimeAssetCounts.mcpServers,
        plugins: expectedRuntimeAssetCounts.plugins,
      });

      const syncUpdateResponse = await fetch(
        `${server.baseUrl}/api/backups/desktop`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientVersion: rootPackage.version,
            payload: {
              version: "desktop-backup-v1",
              exportedAt: "2026-04-16T00:00:00.000Z",
              prompts: [
                {
                  id: "remote_prompt_1",
                  title: "Remote Prompt",
                  description: "Pulled from web",
                  promptType: "text",
                  systemPrompt: "You are the remote backup",
                  userPrompt: "Validate {{target}} from remote.",
                  variables: [
                    {
                      name: "target",
                      type: "text",
                      required: true,
                    },
                  ],
                  tags: ["remote", "backup"],
                  folderId: "remote_folder_1",
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  source: null,
                  notes: "Round-tripped from self-hosted web",
                  lastAiResponse: null,
                  createdAt: "2026-04-16T00:00:00.000Z",
                  updatedAt: "2026-04-16T00:00:00.000Z",
                },
              ],
              promptVersions: [
                {
                  id: "remote_version_1",
                  promptId: "remote_prompt_1",
                  version: 1,
                  systemPrompt: "You are the remote backup",
                  userPrompt: "Validate {{target}} from remote.",
                  variables: [
                    {
                      name: "target",
                      type: "text",
                      required: true,
                    },
                  ],
                  note: "Initial remote version",
                  aiResponse: null,
                  createdAt: "2026-04-16T00:00:00.000Z",
                },
              ],
              folders: [
                {
                  id: "remote_folder_1",
                  name: "Remote Folder",
                  order: 0,
                  createdAt: "2026-04-16T00:00:00.000Z",
                  updatedAt: "2026-04-16T00:00:00.000Z",
                },
              ],
              skills: [],
              skillVersions: [],
              settings: {
                theme: "dark",
                language: "en",
                autoSave: true,
                customPlatformRootPaths: {},
                customSkillPlatformPaths: {},
                sync: {
                  enabled: false,
                  provider: "manual",
                  autoSync: false,
                },
              },
            },
          }),
        },
      );
      expect(syncUpdateResponse.ok).toBe(true);

      const updateFromRemote = page.getByRole("button", {
        name: "Restore latest backup",
        exact: true,
      });
      await expect(updateFromRemote).toBeEnabled();
      const restoreSucceeded = page
        .getByText(/Restored 1 prompts, 1 folders/i)
        .waitFor({
          state: "visible",
          timeout: 20000,
        });
      await updateFromRemote.click();
      await restoreSucceeded;

      await closePromptHub(app, userDataDir, {
        preserveUserDataDir: true,
      });
      const secondLaunch = await launchPromptHub(null, { userDataDir });
      app = secondLaunch.app;
      page = secondLaunch.page;

      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const prompts = await window.api.prompt.getAll();
              const folders = await window.api.folder.getAll();
              return {
                prompts: prompts.map((prompt) => ({
                  id: prompt.id,
                  title: prompt.title,
                  folderId: prompt.folderId,
                })),
                folders: folders.map((folder) => ({
                  id: folder.id,
                  name: folder.name,
                })),
              };
            }),
          {
            timeout: 10000,
            message:
              "desktop should restore remote self-hosted data after download",
          },
        )
        .toEqual({
          prompts: [expect.objectContaining({ title: "Remote Prompt" })],
          folders: [expect.objectContaining({ name: "Remote Folder" })],
        });

      const restoredState = await page.evaluate(async () => {
        const prompts = await window.api.prompt.getAll();
        const folders = await window.api.folder.getAll();
        return {
          prompts: prompts.map((prompt) => ({
            id: prompt.id,
            title: prompt.title,
            folderId: prompt.folderId,
          })),
          folders: folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
          })),
        };
      });

      expect(restoredState.prompts).toEqual([
        expect.objectContaining({ title: "Remote Prompt" }),
      ]);
      expect(restoredState.folders).toEqual([
        expect.objectContaining({ name: "Remote Folder" }),
      ]);

      const remotePrompt = restoredState.prompts.find(
        (prompt) => prompt.title === "Remote Prompt",
      );
      const remoteFolder = restoredState.folders.find(
        (folder) => folder.name === "Remote Folder",
      );
      expect(remotePrompt?.folderId).toBe(remoteFolder?.id);
    } finally {
      await closePromptHub(app, userDataDir);
      await server.stop();
    }
  });
});
