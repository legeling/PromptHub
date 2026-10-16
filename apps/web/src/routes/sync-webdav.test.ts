import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRemotePayload } from "./sync.test-fixtures";
import {
  SYNC_ROUTE_TEST_TIMEOUT,
  authHeaders,
  createFolder,
  createPrompt,
  createSkill,
  createTestApp,
  ensureTestMediaDir,
  getMockCall,
  mediaManifestEntry,
  registerUser,
  setupSyncRouteTestLifecycle,
  sha256,
} from "./sync.test-helpers";

describe("web sync WebDAV transport", () => {
  setupSyncRouteTestLifecycle();

  it(
    "pushes backup data to WebDAV using only mocked server functions",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-test-"),
      );
      const testWebDavConnection = vi.fn(async () => ({
        ok: true,
        status: 207,
      }));
      const pushWebDavFile = vi.fn(async () => ({ ok: true, status: 201 }));

      try {
        const app = await createTestApp(dataDir, {
          testWebDavConnection,
          pushWebDavFile,
        });
        const { payload: registerPayload } = await registerUser(
          app,
          "pushowner",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;
        const userId = registerPayload.data.user.id;

        fs.writeFileSync(
          path.join(
            ensureTestMediaDir(dataDir, userId, "images"),
            "push-image.png",
          ),
          Buffer.from("push-image-binary"),
        );
        fs.writeFileSync(
          path.join(
            ensureTestMediaDir(dataDir, userId, "videos"),
            "push-video.mp4",
          ),
          Buffer.from("push-video-binary"),
        );

        await createFolder(app, token, { name: "Push Folder" });
        await createPrompt(app, token, {
          title: "Push Prompt",
          userPrompt: "Push body",
          images: ["push-image.png"],
          videos: ["push-video.mp4"],
        });

        const configResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "https://dav.example.com/remote.php/dav/files/push",
              username: "push-user",
              password: "push-pass",
              remotePath: "/prod",
              autoSync: true,
            }),
          }),
        );
        expect(configResponse.status).toBe(200);

        const pushResponse = await app.request(
          new Request("http://local/api/sync/push", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(pushResponse.status).toBe(200);
        const pushBody = (await pushResponse.json()) as {
          data: {
            ok: boolean;
            provider: string;
            syncedAt: string;
            remoteFile: string;
            promptsExported: number;
            foldersExported: number;
            rulesExported: number;
            skillsExported: number;
            summary: {
              prompts: number;
              folders: number;
              rules: number;
              skills: number;
              plugins: number;
              mcpServers: number;
            };
          };
        };

        expect(pushBody.data.ok).toBe(true);
        expect(pushBody.data.provider).toBe("webdav");
        expect(pushBody.data.remoteFile).toBe("prompthub-backup/data.json");
        expect(pushBody.data.syncedAt).toBeTruthy();
        expect(pushBody.data.promptsExported).toBe(1);
        expect(pushBody.data.foldersExported).toBe(1);
        expect(pushBody.data.rulesExported).toBe(0);
        expect(pushBody.data.skillsExported).toBe(0);
        expect(pushBody.data.summary).toEqual({
          prompts: 1,
          folders: 1,
          rules: 0,
          skills: 0,
          plugins: 0,
          mcpServers: 0,
        });
        expect(testWebDavConnection).toHaveBeenCalledTimes(1);
        expect(pushWebDavFile).toHaveBeenCalledTimes(4); // image + video + data.json + manifest.json
        expect(getMockCall(pushWebDavFile, 0)[1]).toBe(
          "prompthub-backup/images/push-image.png.base64",
        );
        expect(getMockCall(pushWebDavFile, 1)[1]).toBe(
          "prompthub-backup/videos/push-video.mp4.base64",
        );
        const pushCall = getMockCall(pushWebDavFile, 2);
        expect(pushCall).toBeTruthy();
        expect(pushCall[1]).toBe("prompthub-backup/data.json");

        const pushedPayload = JSON.parse(String(pushCall[2])) as {
          prompts: Array<{ title: string }>;
          folders: Array<{ name: string }>;
        };
        expect(pushedPayload.prompts).toEqual([
          expect.objectContaining({ title: "Push Prompt" }),
        ]);
        expect(pushedPayload.folders).toEqual([
          expect.objectContaining({ name: "Push Folder" }),
        ]);
        expect(getMockCall(pushWebDavFile, 3)[1]).toBe(
          "prompthub-backup/manifest.json",
        );

        const statusResponse = await app.request(
          new Request("http://local/api/sync/status", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        const statusBody = (await statusResponse.json()) as {
          data: { lastSyncAt: string };
        };
        expect(statusBody.data.lastSyncAt).toBe(pushBody.data.syncedAt);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "pulls backup data from WebDAV and replaces local visible data",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-test-"),
      );
      const remotePayload = buildRemotePayload();
      const remotePayloadJson = JSON.stringify(remotePayload);
      const remoteImageBase64 = Buffer.from("remote-image-binary").toString(
        "base64",
      );
      const remoteVideoBase64 = Buffer.from("remote-video-binary").toString(
        "base64",
      );
      const pullWebDavFile = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: remotePayloadJson,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: JSON.stringify({
            version: "4.0",
            createdAt: remotePayload.exportedAt,
            updatedAt: remotePayload.exportedAt,
            dataHash: sha256(remotePayloadJson),
            encrypted: false,
            images: {
              "remote-image.png": mediaManifestEntry(
                remoteImageBase64,
                remotePayload.exportedAt,
              ),
            },
            videos: {
              "remote-video.mp4": mediaManifestEntry(
                remoteVideoBase64,
                remotePayload.exportedAt,
              ),
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: remoteImageBase64,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: remoteVideoBase64,
        });

      try {
        const app = await createTestApp(dataDir, { pullWebDavFile });
        const { payload: registerPayload } = await registerUser(
          app,
          "pullowner",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        await createFolder(app, token, { name: "Stale Folder" });
        await createPrompt(app, token, {
          title: "Stale Prompt",
          userPrompt: "stale",
        });
        await createSkill(app, token, {
          name: "stale-skill",
          content: "stale",
        });

        const configResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "https://dav.example.com/remote.php/dav/files/pull",
              username: "pull-user",
              password: "pull-pass",
              remotePath: "/restore",
              autoSync: false,
            }),
          }),
        );
        expect(configResponse.status).toBe(200);

        const pullResponse = await app.request(
          new Request("http://local/api/sync/pull", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(pullResponse.status).toBe(200);
        const pullBody = (await pullResponse.json()) as {
          data: {
            ok: boolean;
            promptsImported: number;
            foldersImported: number;
            rulesImported: number;
            skillsImported: number;
            provider: string;
            remoteFile: string;
            syncedAt: string;
            summary: {
              prompts: number;
              folders: number;
              rules: number;
              skills: number;
              plugins: number;
              mcpServers: number;
            };
          };
        };
        expect(pullBody.data.ok).toBe(true);
        expect(pullBody.data.promptsImported).toBe(1);
        expect(pullBody.data.foldersImported).toBe(2);
        expect(pullBody.data.rulesImported).toBe(1);
        expect(pullBody.data.skillsImported).toBe(1);
        expect(pullBody.data.summary).toEqual({
          prompts: 1,
          folders: 2,
          rules: 1,
          skills: 1,
          plugins: 0,
          mcpServers: 0,
        });
        expect(pullBody.data.provider).toBe("webdav");
        expect(pullBody.data.remoteFile).toBe("prompthub-backup/data.json");
        expect(pullWebDavFile).toHaveBeenCalledTimes(4);
        const pullCall = getMockCall(pullWebDavFile, 0);
        expect(pullCall).toBeTruthy();
        expect(pullCall[1]).toBe("prompthub-backup/data.json");
        expect(getMockCall(pullWebDavFile, 1)[1]).toBe(
          "prompthub-backup/manifest.json",
        );
        expect(getMockCall(pullWebDavFile, 2)[1]).toBe(
          "prompthub-backup/images/remote-image.png.base64",
        );
        expect(getMockCall(pullWebDavFile, 3)[1]).toBe(
          "prompthub-backup/videos/remote-video.mp4.base64",
        );

        const dataResponse = await app.request(
          new Request("http://local/api/sync/data", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(dataResponse.status).toBe(200);
        const dataBody = (await dataResponse.json()) as {
          data: {
            prompts: Array<{
              title: string;
              folderId?: string;
              images?: string[];
              videos?: string[];
            }>;
            folders: Array<{ id: string; name: string; parentId?: string }>;
            skills: Array<{ name: string }>;
            skillFiles?: Record<
              string,
              Array<{ relativePath: string; content: string }>
            >;
            rules?: Array<{ id: string; content: string }>;
            settings: {
              theme: string;
              language: string;
              autoSave: boolean;
              customPlatformRootPaths: Record<string, string>;
              sync?: { endpoint?: string; lastSyncAt?: string };
            };
          };
        };

        expect(dataBody.data.prompts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: "Remote Prompt" }),
            expect.objectContaining({ title: "Stale Prompt" }),
          ]),
        );
        expect(dataBody.data.skills).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "remote-skill" }),
            expect.objectContaining({ name: "stale-skill" }),
          ]),
        );
        expect(dataBody.data.skillFiles).toEqual(
          expect.objectContaining({
            "remote-skill-1": expect.arrayContaining([
              expect.objectContaining({
                relativePath: "SKILL.md",
                content: "echo remote",
              }),
              expect.objectContaining({
                relativePath: "templates/review.md",
                content: "# Remote review checklist",
              }),
            ]),
          }),
        );
        expect(dataBody.data.rules).toEqual([
          expect.objectContaining({
            id: "project:remote-site",
            content: "# Remote rules",
          }),
        ]);

        const rootFolder = dataBody.data.folders.find(
          (entry) => entry.name === "Remote Root",
        );
        const childFolder = dataBody.data.folders.find(
          (entry) => entry.name === "Remote Child",
        );
        const remotePrompt = dataBody.data.prompts.find(
          (entry) => entry.title === "Remote Prompt",
        );
        expect(rootFolder).toBeTruthy();
        expect(childFolder?.parentId).toBe(rootFolder?.id);
        expect(remotePrompt?.folderId).toBe(childFolder?.id);
        expect(remotePrompt).toEqual(
          expect.objectContaining({
            title: "Remote Prompt",
            images: ["remote-image.png"],
            videos: ["remote-video.mp4"],
          }),
        );

        expect(dataBody.data.settings.theme).toBe("dark");
        expect(dataBody.data.settings.language).toBe("en");
        expect(dataBody.data.settings.autoSave).toBe(false);
        expect(dataBody.data.settings.customPlatformRootPaths).toEqual({
          claude: "/tmp/remote-root",
        });
        expect(dataBody.data.settings.sync?.endpoint).toBe(
          "https://dav.example.com/remote.php/dav/files/pull",
        );
        expect(dataBody.data.settings.sync?.lastSyncAt).toBe(
          pullBody.data.syncedAt,
        );
        expect(
          fs.existsSync(
            path.join(
              ensureTestMediaDir(
                dataDir,
                registerPayload.data.user.id,
                "images",
              ),
              "remote-image.png",
            ),
          ),
        ).toBe(true);
        expect(
          fs.existsSync(
            path.join(
              ensureTestMediaDir(
                dataDir,
                registerPayload.data.user.id,
                "videos",
              ),
              "remote-video.mp4",
            ),
          ),
        ).toBe(true);
        expect(
          fs.readFileSync(
            path.join(
              dataDir,
              "data",
              "skill-files",
              "remote-skill-1",
              "files",
              "templates",
              "review.md",
            ),
            "utf8",
          ),
        ).toBe("# Remote review checklist");
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "surfaces WebDAV auth failures on pull instead of masking them as missing backups",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-auth-"),
      );
      const pullWebDavFile = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401, body: "" });

      try {
        const app = await createTestApp(dataDir, { pullWebDavFile });
        const { payload: registerPayload } = await registerUser(
          app,
          "pullauth",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const configResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "https://dav.example.com/remote.php/dav/files/pull",
              username: "pull-user",
              password: "pull-pass",
              remotePath: "/restore",
              autoSync: false,
            }),
          }),
        );
        expect(configResponse.status).toBe(200);

        const pullResponse = await app.request(
          new Request("http://local/api/sync/pull", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }),
        );

        expect(pullResponse.status).toBe(422);
        const errorBody = (await pullResponse.json()) as {
          error: { message: string };
        };
        expect(errorBody.error.message).toContain(
          "WebDAV download failed with HTTP 401",
        );
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "falls back to desktop legacy WebDAV backup filename on pull",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-legacy-"),
      );
      const pullWebDavFile = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404, body: "" })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: JSON.stringify(buildRemotePayload()),
        });

      try {
        const app = await createTestApp(dataDir, { pullWebDavFile });
        const { payload: registerPayload } = await registerUser(
          app,
          "pulllegacy",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const configResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "https://dav.example.com/remote.php/dav/files/pull",
              username: "pull-user",
              password: "pull-pass",
              remotePath: "/restore",
              autoSync: false,
            }),
          }),
        );
        expect(configResponse.status).toBe(200);

        const pullResponse = await app.request(
          new Request("http://local/api/sync/pull", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }),
        );

        expect(pullResponse.status).toBe(200);
        expect(getMockCall(pullWebDavFile, 0)[1]).toBe(
          "prompthub-backup/data.json",
        );
        expect(getMockCall(pullWebDavFile, 1)[1]).toBe("prompthub-backup.json");
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );
});
