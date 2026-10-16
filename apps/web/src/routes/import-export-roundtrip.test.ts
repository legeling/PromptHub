import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { closeDatabase } from "@prompthub/db";
import { DEFAULT_SETTINGS } from "@prompthub/shared";

import {
  ENV_KEYS,
  originalEnv,
  ISO_TIMESTAMP,
  createTestApp,
  registerUser,
  authHeaders,
  createFolder,
  createPrompt,
  uploadMedia,
  createSkill,
  exportPayload,
} from "./import-export.test-helpers";

describe("web import/export routes", () => {
  // These cases exercise real SQLite, archive, media, and password hashing flows.
  const TEST_TIMEOUT = 60000;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    closeDatabase();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it(
    "exports the expected payload shape and enforces auth",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "exportowner",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const rootFolder = await createFolder(app, token, {
          name: "Export Root",
        });
        const uploadedImage = await uploadMedia(
          app,
          token,
          "images",
          "export-image.png",
          "image-content",
        );
        expect(uploadedImage.response.status).toBe(201);
        const uploadedVideo = await uploadMedia(
          app,
          token,
          "videos",
          "export-video.mp4",
          "video-content",
        );
        expect(uploadedVideo.response.status).toBe(201);

        const prompt = await createPrompt(app, token, {
          title: "Export Prompt",
          userPrompt: "Export body",
          folderId: rootFolder.payload.data!.id,
          tags: ["exported"],
          images: [uploadedImage.payload.data],
          videos: [uploadedVideo.payload.data],
        });
        expect(prompt.response.status).toBe(201);

        const skill = await createSkill(app, token, {
          name: "export-skill",
          content: "echo export",
        });
        expect(skill.response.status).toBe(201);
        fs.mkdirSync(
          path.join(
            dataDir,
            "data",
            "skill-files",
            skill.payload.data!.id,
            "files",
            "templates",
          ),
          {
            recursive: true,
          },
        );
        fs.writeFileSync(
          path.join(
            dataDir,
            "data",
            "skill-files",
            skill.payload.data!.id,
            "files",
            "templates",
            "guide.md",
          ),
          "# Export guide",
          "utf8",
        );

        const { response, payload } = await exportPayload(app, token);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
          "application/json",
        );
        expect(response.headers.get("content-disposition")).toContain(
          "prompthub-web-export-",
        );
        expect(payload.version).toBe("web-backup-v2");
        expect(payload.exportedAt).toMatch(ISO_TIMESTAMP);
        expect(payload.prompts).toEqual([
          expect.objectContaining({
            title: "Export Prompt",
            folderId: rootFolder.payload.data!.id,
          }),
        ]);
        expect(payload.promptVersions.length).toBeGreaterThanOrEqual(1);
        expect(payload.versions.length).toBe(payload.promptVersions.length);
        expect(payload.folders).toEqual([
          expect.objectContaining({
            id: rootFolder.payload.data!.id,
            name: "Export Root",
          }),
        ]);
        expect(payload.skills).toEqual([
          expect.objectContaining({
            id: skill.payload.data!.id,
            name: "export-skill",
          }),
        ]);
        expect(payload.skillFiles).toEqual(
          expect.objectContaining({
            [skill.payload.data!.id]: expect.arrayContaining([
              expect.objectContaining({
                relativePath: "SKILL.md",
                content: "echo export",
              }),
              expect.objectContaining({
                relativePath: "templates/guide.md",
                content: "# Export guide",
              }),
            ]),
          }),
        );
        expect(payload.rules).toEqual([]);
        expect(payload.images).toEqual({
          [uploadedImage.payload.data]: Buffer.from(
            "image-content",
            "utf8",
          ).toString("base64"),
        });
        expect(payload.videos).toEqual({
          [uploadedVideo.payload.data]: Buffer.from(
            "video-content",
            "utf8",
          ).toString("base64"),
        });
        expect(payload.settings).toEqual(
          expect.objectContaining({
            theme: "system",
            language: "zh",
            autoSave: true,
            sync: {
              enabled: false,
              provider: "manual",
              autoSync: false,
            },
          }),
        );

        const unauthenticatedExport = await app.request(
          new Request("http://local/api/export"),
        );
        expect(unauthenticatedExport.status).toBe(401);

        const unauthenticatedImport = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        expect(unauthenticatedImport.status).toBe(401);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "round-trips data, merges visible records, restores settings, and preserves nested folders",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "roundtripowner",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const rootFolder = await createFolder(app, token, { name: "Projects" });
        const childFolder = await createFolder(app, token, {
          name: "Nested",
          parentId: rootFolder.payload.data!.id,
        });
        const prompt = await createPrompt(app, token, {
          title: "Round-trip Prompt",
          userPrompt: "Version one",
          folderId: childFolder.payload.data!.id,
          tags: ["sync", "roundtrip"],
        });
        const promptId = prompt.payload.data!.id;

        const promptUpdate = await app.request(
          new Request(`http://local/api/prompts/${promptId}`, {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              userPrompt: "Version two",
              isFavorite: true,
            }),
          }),
        );
        expect(promptUpdate.status).toBe(200);

        const skill = await createSkill(app, token, {
          name: "roundtrip-skill",
          content: "echo version one",
        });
        const skillId = skill.payload.data!.id;

        const skillUpdate = await app.request(
          new Request(`http://local/api/skills/${skillId}`, {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({ content: "echo version two" }),
          }),
        );
        expect(skillUpdate.status).toBe(200);

        const createSkillVersion = await app.request(
          new Request(`http://local/api/skills/${skillId}/versions`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({ note: "snapshot-1" }),
          }),
        );
        expect(createSkillVersion.status).toBe(201);

        const settingsUpdate = await app.request(
          new Request("http://local/api/settings", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              theme: "dark",
              language: "fr",
              autoSave: false,
              tagFilterMode: "single",
              promptTagCatalog: ["sync", "roundtrip"],
              defaultFolderId: rootFolder.payload.data!.id,
              backgroundImageFileName: "roundtrip-wallpaper.png",
              backgroundImageOpacity: 0.4,
              backgroundImageBlur: 8,
              builtinAgentOverrides: {
                claude: {
                  rootPath: "/tmp/exported-agent-root",
                  skillsRelativePath: "skills",
                  configRelativePaths: ["config.json"],
                },
              },
              customPlatformRootPaths: { claude: "/tmp/exported-root" },
              customAgents: [
                {
                  id: "exported-agent",
                  name: "Exported Agent",
                  rootPath: "/tmp/exported-agent",
                  skillsRelativePath: "skills",
                  configRelativePaths: ["config.json"],
                },
              ],
              customAgentRootPaths: ["/tmp/exported-custom-agent-root"],
              disabledPlatformIds: ["cursor"],
              customSkillPlatformPaths: {
                cherry: "/tmp/exported-cherry-skills",
              },
              skillPlatformOrder: ["codex", "claude"],
              skillProjects: [
                {
                  id: "exported-project",
                  name: "Exported Project",
                  rootPath: "/tmp/exported-project",
                  scanPaths: ["/tmp/exported-project/.agents/skills"],
                  deployTargets: ["/tmp/exported-project/.agents/skills"],
                  createdAt: 1780999200000,
                  updatedAt: 1780999200000,
                },
              ],
              lastManualBackupAt: "2026-04-13T13:00:00.000Z",
              lastManualBackupVersion: "0.5.8",
              updateChannel: "preview",
              launchAtStartup: true,
              minimizeOnLaunch: true,
              sync: {
                enabled: true,
                provider: "webdav",
                endpoint:
                  "https://dav.example.com/remote.php/dav/files/roundtrip",
                username: "roundtrip-user",
                password: "roundtrip-pass",
                remotePath: "/exports",
                autoSync: true,
                lastSyncAt: "2026-04-13T12:00:00.000Z",
              },
            }),
          }),
        );
        expect(settingsUpdate.status).toBe(200);

        const { payload: backupPayload } = await exportPayload(app, token);
        backupPayload.settings.security = {
          masterPasswordConfigured: true,
          unlocked: false,
        };
        backupPayload.rules = [
          {
            id: "project:projects-rule",
            platformId: "workspace",
            platformName: "Projects Rule",
            platformIcon: "FolderRoot",
            platformDescription: "Rule imported from desktop",
            name: "AGENTS.md",
            description: "Project rule file",
            path: "/workspace/AGENTS.md",
            targetPath: "/workspace/AGENTS.md",
            projectRootPath: "/workspace",
            syncStatus: "synced",
            content: "# Projects rules",
            versions: [],
          },
        ];

        await createFolder(app, token, { name: "Replacement Folder" });
        await createPrompt(app, token, {
          title: "Replacement Prompt",
          userPrompt: "Discard me",
        });
        await createSkill(app, token, {
          name: "replacement-skill",
          content: "echo discard",
        });

        const noisySettings = await app.request(
          new Request("http://local/api/settings", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              theme: "light",
              language: "de",
              autoSave: true,
              tagFilterMode: "multi",
              promptTagCatalog: ["discard"],
              backgroundImageFileName: "discard-wallpaper.png",
              backgroundImageOpacity: 0.8,
              backgroundImageBlur: 2,
              builtinAgentOverrides: {
                claude: {
                  rootPath: "/tmp/discard-agent-root",
                  skillsRelativePath: "discard-skills",
                  configRelativePaths: ["discard.json"],
                },
              },
              customAgents: [
                {
                  id: "discard-agent",
                  name: "Discard Agent",
                  rootPath: "/tmp/discard-agent",
                  skillsRelativePath: "discard-skills",
                  configRelativePaths: ["discard.json"],
                },
              ],
              customAgentRootPaths: ["/tmp/discard-custom-agent-root"],
              disabledPlatformIds: ["windsurf"],
              customSkillPlatformPaths: {
                cherry: "/tmp/discard-cherry-skills",
              },
              skillPlatformOrder: ["claude", "codex"],
              skillProjects: [
                {
                  id: "discard-project",
                  name: "Discard Project",
                  rootPath: "/tmp/discard-project",
                  scanPaths: ["/tmp/discard-project/.agents/skills"],
                  deployTargets: ["/tmp/discard-project/.agents/skills"],
                  createdAt: 1780999300000,
                  updatedAt: 1780999300000,
                },
              ],
              lastManualBackupAt: "2026-04-13T14:00:00.000Z",
              lastManualBackupVersion: "discard-version",
              updateChannel: "stable",
              launchAtStartup: false,
              minimizeOnLaunch: false,
            }),
          }),
        );
        expect(noisySettings.status).toBe(200);

        const importResponse = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify(backupPayload),
          }),
        );

        expect(importResponse.status).toBe(201);
        const importBody = (await importResponse.json()) as {
          data: {
            promptsImported: number;
            foldersImported: number;
            rulesImported: number;
            skillsImported: number;
            pluginsImported: number;
            mcpServersImported: number;
            settingsUpdated: boolean;
          };
        };
        expect(importBody.data).toEqual({
          promptsImported: 1,
          foldersImported: 2,
          rulesImported: 1,
          skillsImported: 1,
          pluginsImported: 0,
          mcpServersImported: 0,
          settingsUpdated: true,
        });

        const { payload: restoredPayload } = await exportPayload(app, token);

        expect(restoredPayload.prompts).toHaveLength(2);
        expect(restoredPayload.prompts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              title: "Round-trip Prompt",
              userPrompt: "Version two",
              isFavorite: true,
            }),
            expect.objectContaining({
              title: "Replacement Prompt",
              userPrompt: "Discard me",
            }),
          ]),
        );
        expect(restoredPayload.promptVersions.length).toBe(
          backupPayload.promptVersions.length + 1,
        );

        expect(restoredPayload.skills).toHaveLength(2);
        expect(restoredPayload.skills).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "roundtrip-skill",
              content: "echo version two",
            }),
            expect.objectContaining({
              name: "replacement-skill",
              content: "echo discard",
            }),
          ]),
        );
        expect(restoredPayload.skillVersions).toHaveLength(1);
        expect(restoredPayload.rules).toEqual([
          expect.objectContaining({
            id: "project:projects-rule",
            content: "# Projects rules",
          }),
        ]);

        const restoredRootFolder = restoredPayload.folders.find(
          (folder) => folder.name === "Projects",
        );
        const restoredChildFolder = restoredPayload.folders.find(
          (folder) => folder.name === "Nested",
        );
        const replacementFolder = restoredPayload.folders.find(
          (folder) => folder.name === "Replacement Folder",
        );
        const roundTripPrompt = restoredPayload.prompts.find(
          (prompt) => prompt.title === "Round-trip Prompt",
        );
        expect(restoredPayload.folders).toHaveLength(3);
        expect(restoredRootFolder).toBeTruthy();
        expect(restoredChildFolder).toBeTruthy();
        expect(replacementFolder).toBeTruthy();
        expect(restoredChildFolder?.parentId).toBe(restoredRootFolder?.id);
        expect(roundTripPrompt?.folderId).toBe(restoredChildFolder?.id);

        expect(restoredPayload.settings).toEqual(
          expect.objectContaining({
            theme: "dark",
            language: "fr",
            autoSave: false,
            tagFilterMode: "single",
            promptTagCatalog: ["sync", "roundtrip"],
            backgroundImageFileName: "roundtrip-wallpaper.png",
            backgroundImageOpacity: 0.4,
            backgroundImageBlur: 8,
            builtinAgentOverrides: {
              claude: {
                rootPath: "/tmp/exported-agent-root",
                skillsRelativePath: "skills",
                configRelativePaths: ["config.json"],
              },
            },
            customPlatformRootPaths: { claude: "/tmp/exported-root" },
            customAgents: [
              {
                id: "exported-agent",
                name: "Exported Agent",
                rootPath: "/tmp/exported-agent",
                skillsRelativePath: "skills",
                configRelativePaths: ["config.json"],
              },
            ],
            customAgentRootPaths: ["/tmp/exported-custom-agent-root"],
            disabledPlatformIds: ["cursor"],
            customSkillPlatformPaths: { cherry: "/tmp/exported-cherry-skills" },
            skillPlatformOrder: ["codex", "claude"],
            skillProjects: [
              {
                id: "exported-project",
                name: "Exported Project",
                rootPath: "/tmp/exported-project",
                scanPaths: ["/tmp/exported-project/.agents/skills"],
                deployTargets: ["/tmp/exported-project/.agents/skills"],
                createdAt: 1780999200000,
                updatedAt: 1780999200000,
              },
            ],
            lastManualBackupAt: "2026-04-13T13:00:00.000Z",
            lastManualBackupVersion: "0.5.8",
            updateChannel: "preview",
            launchAtStartup: true,
            minimizeOnLaunch: true,
            security: {
              masterPasswordConfigured: true,
              unlocked: false,
            },
            sync: {
              enabled: true,
              provider: "webdav",
              endpoint:
                "https://dav.example.com/remote.php/dav/files/roundtrip",
              username: "roundtrip-user",
              password: "roundtrip-pass",
              remotePath: "/exports",
              autoSync: true,
              lastSyncAt: "2026-04-13T12:00:00.000Z",
            },
          }),
        );
        expect(restoredPayload.settings.defaultFolderId).toBe(
          restoredRootFolder?.id,
        );
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );
});
