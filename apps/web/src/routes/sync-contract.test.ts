import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS } from "@prompthub/shared";
import {
  SYNC_ROUTE_TEST_TIMEOUT,
  authHeaders,
  createFolder,
  createPrompt,
  createSkill,
  createTestApp,
  registerUser,
  setupSyncRouteTestLifecycle,
} from "./sync.test-helpers";

describe("web sync route contracts", () => {
  setupSyncRouteTestLifecycle();

  it(
    "serves manifest, data, config, and status routes with real backup data integrity",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "syncowner",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const folderResponse = await createFolder(app, token, {
          name: "Sync Folder",
        });
        const folder = (await folderResponse.json()) as {
          data: { id: string };
        };

        const promptResponse = await createPrompt(app, token, {
          title: "Sync Prompt",
          userPrompt: "Sync body",
          folderId: folder.data.id,
        });
        expect(promptResponse.status).toBe(201);

        const skillResponse = await createSkill(app, token, {
          name: "sync-skill",
          content: "echo sync",
        });
        expect(skillResponse.status).toBe(201);

        const invalidConfig = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "bad-url",
            }),
          }),
        );
        expect(invalidConfig.status).toBe(422);

        const insecureEndpointConfig = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "http://dav.example.com/remote.php/dav/files/sync",
            }),
          }),
        );
        expect(insecureEndpointConfig.status).toBe(422);
        const insecureEndpointBody = (await insecureEndpointConfig.json()) as {
          error: { message: string };
        };
        expect(insecureEndpointBody.error.message).toContain("endpoint");
        expect(insecureEndpointBody.error.message).toContain(
          "WebDAV endpoint must use HTTPS",
        );

        const queryEndpointConfig = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint:
                "https://dav.example.com/remote.php/dav/files/sync?token=abc",
            }),
          }),
        );
        expect(queryEndpointConfig.status).toBe(422);
        const queryEndpointBody = (await queryEndpointConfig.json()) as {
          error: { message: string };
        };
        expect(queryEndpointBody.error.message).toContain("endpoint");
        expect(queryEndpointBody.error.message).toContain(
          "cannot include query or fragment",
        );

        const invalidRemotePathConfig = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "https://dav.example.com/remote.php/dav/files/sync",
              remotePath: "../escape",
            }),
          }),
        );
        expect(invalidRemotePathConfig.status).toBe(422);
        const invalidRemotePathBody =
          (await invalidRemotePathConfig.json()) as {
            error: { message: string };
          };
        expect(invalidRemotePathBody.error.message).toContain("remotePath");
        expect(invalidRemotePathBody.error.message).toContain(
          "Invalid WebDAV remote path",
        );

        const manifestResponse = await app.request(
          new Request("http://local/api/sync/manifest", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(manifestResponse.status).toBe(200);
        const manifestBody = (await manifestResponse.json()) as {
          data: {
            version: string;
            counts: {
              prompts: number;
              folders: number;
              skills: number;
              plugins: number;
              mcpServers: number;
            };
            actor: { userId: string; role: "admin" | "user" };
          };
        };
        expect(manifestBody.data.version).toBe("web-backup-v2");
        expect(manifestBody.data.counts).toEqual({
          prompts: 1,
          folders: 1,
          skills: 1,
          plugins: 0,
          mcpServers: 0,
        });
        expect(manifestBody.data.actor).toEqual({
          userId: registerPayload.data.user.id,
          role: registerPayload.data.user.role,
        });

        const dataResponse = await app.request(
          new Request("http://local/api/sync/data", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(dataResponse.status).toBe(200);
        const dataBody = (await dataResponse.json()) as {
          data: {
            version: string;
            prompts: Array<{ title: string }>;
            folders: Array<{ name: string }>;
            skills: Array<{ name: string }>;
            settingsUpdatedAt: string;
          };
        };
        expect(dataBody.data.version).toBe("web-backup-v2");
        expect(dataBody.data.settingsUpdatedAt).toBe(new Date(0).toISOString());
        expect(dataBody.data.prompts).toEqual([
          expect.objectContaining({ title: "Sync Prompt" }),
        ]);
        expect(
          (dataBody.data as { rules?: Array<{ content: string }> }).rules,
        ).toEqual([]);

        const configUpdate = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: "https://dav.example.com/remote.php/dav/files/sync",
              username: "sync-user",
              password: "sync-pass",
              remotePath: "/web-backups",
              autoSync: true,
            }),
          }),
        );
        expect(configUpdate.status).toBe(200);

        const configResponse = await app.request(
          new Request("http://local/api/sync/config", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(configResponse.status).toBe(200);
        const configBody = (await configResponse.json()) as {
          data: {
            enabled: boolean;
            provider: string;
            endpoint?: string;
            username?: string;
            password?: string;
            remotePath?: string;
            autoSync?: boolean;
          };
        };
        expect(configBody.data).toEqual({
          enabled: true,
          provider: "webdav",
          endpoint: "https://dav.example.com/remote.php/dav/files/sync",
          username: "sync-user",
          password: "sync-pass",
          remotePath: "/web-backups",
          autoSync: true,
        });

        const statusResponse = await app.request(
          new Request("http://local/api/sync/status", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(statusResponse.status).toBe(200);
        const statusBody = (await statusResponse.json()) as {
          data: {
            enabled: boolean;
            provider: string;
            summary: {
              prompts: number;
              folders: number;
              skills: number;
              plugins: number;
              mcpServers: number;
            };
            config: { endpoint?: string; autoSync?: boolean };
            capabilities: { pull: boolean; push: boolean; autoSync: boolean };
          };
        };
        expect(statusBody.data.enabled).toBe(true);
        expect(statusBody.data.provider).toBe("webdav");
        expect(statusBody.data.summary).toEqual({
          prompts: 1,
          folders: 1,
          skills: 1,
          plugins: 0,
          mcpServers: 0,
        });
        expect(statusBody.data.config.endpoint).toBe(
          "https://dav.example.com/remote.php/dav/files/sync",
        );
        expect(statusBody.data.capabilities).toEqual({
          pull: true,
          push: true,
          autoSync: true,
        });

        await createFolder(app, token, { name: "Noisy Sync Folder" });
        await createPrompt(app, token, {
          title: "Noisy Sync Prompt",
          userPrompt: "discard",
        });
        await createSkill(app, token, {
          name: "noisy-sync-skill",
          content: "discard",
        });

        const importResponse = await app.request(
          new Request("http://local/api/sync/data", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({ payload: dataBody.data }),
          }),
        );
        expect(importResponse.status).toBe(200);
        const importBody = (await importResponse.json()) as {
          data: {
            ok: boolean;
            promptsImported: number;
            foldersImported: number;
            rulesImported: number;
            skillsImported: number;
            settingsUpdated: boolean;
          };
        };
        expect(importBody.data.ok).toBe(true);
        expect(importBody.data.promptsImported).toBe(1);
        expect(importBody.data.foldersImported).toBe(1);
        expect(importBody.data.rulesImported).toBe(0);
        expect(importBody.data.skillsImported).toBe(1);
        expect(importBody.data.settingsUpdated).toBe(false);

        const dataAfterImportResponse = await app.request(
          new Request("http://local/api/sync/data", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        const dataAfterImport = (await dataAfterImportResponse.json()) as {
          data: {
            prompts: Array<{ title: string }>;
            folders: Array<{ name: string }>;
            skills: Array<{ name: string }>;
            rules?: Array<{ id: string; content: string }>;
            settings: { sync?: { lastSyncAt?: string; endpoint?: string; username?: string; password?: string } };
          };
        };
        expect(dataAfterImport.data.prompts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: "Sync Prompt" }),
            expect.objectContaining({ title: "Noisy Sync Prompt" }),
          ]),
        );
        expect(dataAfterImport.data.folders).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "Sync Folder" }),
            expect.objectContaining({ name: "Noisy Sync Folder" }),
          ]),
        );
        expect(dataAfterImport.data.skills).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "sync-skill" }),
            expect.objectContaining({ name: "noisy-sync-skill" }),
          ]),
        );
        expect(dataAfterImport.data.rules).toEqual([]);
        expect(dataAfterImport.data.settings.sync?.lastSyncAt).toBeTruthy();
        expect(dataAfterImport.data.settings.sync).toMatchObject({
          endpoint: "https://dav.example.com/remote.php/dav/files/sync",
          username: "sync-user",
          password: "sync-pass",
        });
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "rejects oversized sync data content-length before importing records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-size-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "syncoversize",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const promptResponse = await createPrompt(app, token, {
          title: "Keep Existing Sync Prompt",
          userPrompt:
            "This prompt must remain after a rejected oversized sync import",
        });
        expect(promptResponse.status).toBe(201);

        const emptySnapshot = {
          version: "web-backup-v2",
          exportedAt: "2026-06-09T00:00:00.000Z",
          prompts: [],
          promptVersions: [],
          folders: [],
          rules: [],
          skills: [],
          skillVersions: [],
          settings: DEFAULT_SETTINGS,
        };

        const oversizedResponse = await app.request(
          new Request("http://local/api/sync/data", {
            method: "PUT",
            headers: {
              ...authHeaders(token),
              "Content-Length": String(51 * 1024 * 1024),
            },
            body: JSON.stringify({ payload: emptySnapshot }),
          }),
        );

        expect(oversizedResponse.status).toBe(400);
        const oversizedBody = (await oversizedResponse.json()) as {
          error: { code: string; message: string };
        };
        expect(oversizedBody.error).toEqual({
          code: "BAD_REQUEST",
          message: "Sync data request body exceeds size limit",
        });

        const invalidLengthResponse = await app.request(
          new Request("http://local/api/sync/data", {
            method: "PUT",
            headers: {
              ...authHeaders(token),
              "Content-Length": "-1",
            },
            body: JSON.stringify({ payload: emptySnapshot }),
          }),
        );
        expect(invalidLengthResponse.status).toBe(400);
        const invalidLengthBody = (await invalidLengthResponse.json()) as {
          error: { code: string; message: string };
        };
        expect(invalidLengthBody.error).toEqual({
          code: "BAD_REQUEST",
          message: "Invalid Content-Length header",
        });

        const dataResponse = await app.request(
          new Request("http://local/api/sync/data", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        const dataBody = (await dataResponse.json()) as {
          data: { prompts: Array<{ title: string }> };
        };
        expect(dataBody.data.prompts).toEqual([
          expect.objectContaining({ title: "Keep Existing Sync Prompt" }),
        ]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "rejects oversized sync config fields without persisting them",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-config-boundary-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "syncconfigboundary",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const oversizedConfigResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
              endpoint: `https://dav.example.com/${"a".repeat(2050)}`,
              username: "u".repeat(513),
              password: "p".repeat(513),
              remotePath: `/${"backup/".repeat(180)}`,
              autoSync: true,
            }),
          }),
        );

        expect(oversizedConfigResponse.status).toBe(422);
        const oversizedConfigBody = (await oversizedConfigResponse.json()) as {
          error: { code: string; message: string };
        };
        expect(oversizedConfigBody.error.code).toBe("VALIDATION_ERROR");
        expect(oversizedConfigBody.error.message).toContain("endpoint");
        expect(oversizedConfigBody.error.message).toContain("username");
        expect(oversizedConfigBody.error.message).toContain("password");
        expect(oversizedConfigBody.error.message).toContain("remotePath");

        const configResponse = await app.request(
          new Request("http://local/api/sync/config", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(configResponse.status).toBe(200);
        const configBody = (await configResponse.json()) as {
          data: {
            provider: string;
            endpoint?: string;
            username?: string;
            password?: string;
            remotePath?: string;
          };
        };
        expect(configBody.data.provider).toBe("manual");
        expect(configBody.data.endpoint).toBeUndefined();
        expect(configBody.data.username).toBeUndefined();
        expect(configBody.data.password).toBeUndefined();
        expect(configBody.data.remotePath).toBeUndefined();
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "accepts extended sync providers in config and reflects provider in status",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-sync-providers-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "providerowner",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const selfHostedConfigResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "self-hosted",
              endpoint: "http://sync.example.com/workspace",
              autoSync: true,
            }),
          }),
        );
        expect(selfHostedConfigResponse.status).toBe(200);

        const selfHostedStatusResponse = await app.request(
          new Request("http://local/api/sync/status", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(selfHostedStatusResponse.status).toBe(200);
        const selfHostedStatusBody =
          (await selfHostedStatusResponse.json()) as {
            data: {
              provider: string;
              message: string;
              capabilities: { autoSync: boolean };
            };
          };
        expect(selfHostedStatusBody.data.provider).toBe("self-hosted");
        expect(selfHostedStatusBody.data.message).toContain("Self-hosted sync");
        expect(selfHostedStatusBody.data.capabilities.autoSync).toBe(false);

        const inheritedWebDavEndpointResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "webdav",
            }),
          }),
        );
        expect(inheritedWebDavEndpointResponse.status).toBe(422);
        const inheritedWebDavEndpointBody =
          (await inheritedWebDavEndpointResponse.json()) as {
            error: { message: string };
          };
        expect(inheritedWebDavEndpointBody.error.message).toContain("endpoint");
        expect(inheritedWebDavEndpointBody.error.message).toContain(
          "WebDAV endpoint must use HTTPS",
        );

        const s3ConfigResponse = await app.request(
          new Request("http://local/api/sync/config", {
            method: "PUT",
            headers: authHeaders(token),
            body: JSON.stringify({
              enabled: true,
              provider: "s3",
              endpoint: "https://s3.example.com/bucket",
              autoSync: true,
            }),
          }),
        );
        expect(s3ConfigResponse.status).toBe(200);

        const s3StatusResponse = await app.request(
          new Request("http://local/api/sync/status", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        expect(s3StatusResponse.status).toBe(200);
        const s3StatusBody = (await s3StatusResponse.json()) as {
          data: {
            provider: string;
            message: string;
            capabilities: { autoSync: boolean };
          };
        };
        expect(s3StatusBody.data.provider).toBe("s3");
        expect(s3StatusBody.data.message).toContain("S3 sync");
        expect(s3StatusBody.data.capabilities.autoSync).toBe(false);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );
});
