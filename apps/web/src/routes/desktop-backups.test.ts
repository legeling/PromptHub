import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import rootPackage from "../../../../package.json";
import { SKILL_SNAPSHOT_SYNC_VERSION } from "@prompthub/shared/utils/skill-file-snapshot";
import { buildRemotePayload } from "./sync.test-fixtures";
import {
  authHeaders,
  createPrompt,
  createTestApp,
  registerUser,
  setupSyncRouteTestLifecycle,
  SYNC_ROUTE_TEST_TIMEOUT,
} from "./sync.test-helpers";

describe("desktop remote backup routes", () => {
  setupSyncRouteTestLifecycle();

  it(
    "accepts encoded Skill snapshots and reads their bytes back (#185)",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-binary-"),
      );
      try {
        const app = await createTestApp(dataDir);
        const { payload } = await registerUser(
          app,
          "binary-backup-owner",
          "debugpass001",
        );
        const headers = authHeaders(payload.data.accessToken);
        const snapshot = buildRemotePayload();
        const files = [
          {
            relativePath: "assets/sample.bin",
            encoding: "base64",
            content: "AP+A",
          },
        ];
        const skillFiles = { [snapshot.skills[0]!.id]: files };
        const response = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers,
            body: JSON.stringify({
              clientVersion: rootPackage.version,
              payload: {
                ...snapshot,
                version: SKILL_SNAPSHOT_SYNC_VERSION,
                skillFiles,
              },
            }),
          }),
        );
        expect(response.status, await response.text()).toBe(201);
        const latest = await app.request(
          new Request("http://local/api/backups/desktop/latest", { headers }),
        );
        expect(latest.status).toBe(200);
        expect(await latest.json()).toMatchObject({
          data: {
            snapshot: {
              version: SKILL_SNAPSHOT_SYNC_VERSION,
              skillFiles,
            },
          },
        });
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "blocks version mismatches before writing a backup",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-version-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload } = await registerUser(
          app,
          "backup-version-owner",
          "debugpass001",
        );
        const capabilitiesResponse = await app.request(
          new Request("http://local/api/backups/desktop/capabilities", {
            headers: authHeaders(payload.data.accessToken),
          }),
        );
        expect(await capabilitiesResponse.json()).toEqual({
          data: {
            serverVersion: rootPackage.version,
            protocolVersion: 1,
            retentionLimit: 10,
            workspaceSnapshotVersion: 1,
          },
        });

        const invalidJsonResponse = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: authHeaders(payload.data.accessToken),
            body: "not-json",
          }),
        );
        expect(invalidJsonResponse.status).toBe(400);

        const oversizedHeaders = new Headers(
          authHeaders(payload.data.accessToken),
        );
        oversizedHeaders.set("Content-Length", String(50 * 1024 * 1024 + 1));
        const oversizedResponse = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: oversizedHeaders,
            body: "{}",
          }),
        );
        expect(oversizedResponse.status).toBe(400);
        expect(await oversizedResponse.json()).toEqual(
          expect.objectContaining({
            error: expect.objectContaining({
              message: "Desktop backup request body exceeds size limit",
            }),
          }),
        );

        const response = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: authHeaders(payload.data.accessToken),
            body: JSON.stringify({
              clientVersion: "0.5.8",
              payload: {
                ...buildRemotePayload(),
                version: "desktop-backup-v1",
              },
            }),
          }),
        );

        expect(response.status).toBe(409);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("CONFLICT");
        expect(body.error.message).toContain(rootPackage.version);

        const wrongSnapshotVersionResponse = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: authHeaders(payload.data.accessToken),
            body: JSON.stringify({
              clientVersion: rootPackage.version,
              payload: {
                ...buildRemotePayload(),
                version: "web-backup-v2",
              },
            }),
          }),
        );
        expect(wrongSnapshotVersionResponse.status).toBe(422);

        const malformedSafetyResponse = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: authHeaders(payload.data.accessToken),
            body: JSON.stringify({
              clientVersion: rootPackage.version,
              payload: {
                ...buildRemotePayload(),
                version: "desktop-backup-v1",
                skills: [
                  {
                    ...buildRemotePayload().skills[0],
                    safetyReport: {
                      level: "safe",
                      summary: "Checked",
                      findings: [],
                      recommendedAction: "allow",
                      scannedAt: 1,
                      checkedFileCount: -1,
                      scanMethod: "preflight",
                    },
                  },
                ],
              },
            }),
          }),
        );
        expect(malformedSafetyResponse.status).toBe(422);
        expect(fs.existsSync(path.join(dataDir, "backups", "desktop"))).toBe(
          false,
        );
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "stores a matching snapshot without importing it into the live Web workspace",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-isolation-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registration } = await registerUser(
          app,
          "backup-isolation-owner",
          "debugpass001",
        );
        const token = registration.data.accessToken;
        await createPrompt(app, token, {
          title: "Live Web Prompt",
          userPrompt: "must remain live",
        });

        const snapshot = {
          ...buildRemotePayload(),
          version: "desktop-backup-v1",
          rules: undefined,
          desktopSettings: {
            state: {
              motionPreference: "reduced",
              skillListPageSize: 50,
            },
          },
          desktopAiConfig: {
            aiProvider: "openai",
            aiApiUrl: "https://api.example.com",
            aiModel: "gpt-test",
            aiProviders: [
              {
                id: "provider-1",
                provider: "openai",
                apiUrl: "https://api.example.com",
              },
            ],
          },
          images: {
            "remote-image.png": Buffer.from("image-bytes").toString("base64"),
          },
          videos: {
            "remote-video.mp4": Buffer.from("video-bytes").toString("base64"),
          },
        };
        const createResponse = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              clientVersion: rootPackage.version,
              payload: snapshot,
            }),
          }),
        );

        expect(createResponse.status).toBe(201);
        const createBody = (await createResponse.json()) as {
          data: {
            clientVersion: string;
            serverVersion: string;
            summary: { prompts: number; skills: number };
          };
        };
        expect(createBody.data).toEqual(
          expect.objectContaining({
            clientVersion: rootPackage.version,
            serverVersion: rootPackage.version,
            summary: expect.objectContaining({ prompts: 1, skills: 1 }),
          }),
        );

        const liveResponse = await app.request(
          new Request("http://local/api/sync/data", {
            headers: authHeaders(token),
          }),
        );
        const liveBody = (await liveResponse.json()) as {
          data: { prompts: Array<{ title: string }> };
        };
        expect(liveBody.data.prompts.map((prompt) => prompt.title)).toEqual([
          "Live Web Prompt",
        ]);

        const latestResponse = await app.request(
          new Request("http://local/api/backups/desktop/latest", {
            headers: authHeaders(token),
          }),
        );
        expect(latestResponse.status).toBe(200);
        const latestBody = (await latestResponse.json()) as {
          data: {
            snapshot: {
              prompts: Array<{ title: string }>;
              images?: Record<string, string>;
              videos?: Record<string, string>;
              desktopSettings?: { state: Record<string, unknown> };
              desktopAiConfig?: Record<string, unknown>;
            };
          };
        };
        expect(latestBody.data.snapshot.prompts[0]?.title).toBe(
          "Remote Prompt",
        );
        expect(latestBody.data.snapshot.images).toEqual(snapshot.images);
        expect(latestBody.data.snapshot.videos).toEqual(snapshot.videos);
        expect(latestBody.data.snapshot.desktopSettings).toEqual(
          snapshot.desktopSettings,
        );
        expect(latestBody.data.snapshot.desktopAiConfig).toEqual(
          snapshot.desktopAiConfig,
        );

        const listResponse = await app.request(
          new Request("http://local/api/backups/desktop", {
            headers: authHeaders(token),
          }),
        );
        expect(listResponse.status).toBe(200);
        const listBody = (await listResponse.json()) as {
          data: Array<{ id: string }>;
        };
        expect(listBody.data).toHaveLength(1);

        const { payload: secondRegistration } = await registerUser(
          app,
          "backup-isolation-second-owner",
          "debugpass001",
        );
        const secondLatestResponse = await app.request(
          new Request("http://local/api/backups/desktop/latest", {
            headers: authHeaders(secondRegistration.data.accessToken),
          }),
        );
        expect(secondLatestResponse.status).toBe(404);

        const [backupFile] = fs
          .readdirSync(path.join(dataDir, "backups", "desktop"), {
            recursive: true,
            withFileTypes: true,
          })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
        const backupPath = path.join(backupFile!.parentPath, backupFile!.name);
        const envelope = JSON.parse(fs.readFileSync(backupPath, "utf8")) as {
          payloadSha256: string;
        };
        envelope.payloadSha256 = "tampered";
        fs.writeFileSync(backupPath, JSON.stringify(envelope), "utf8");

        const corruptLatestResponse = await app.request(
          new Request("http://local/api/backups/desktop/latest", {
            headers: authHeaders(token),
          }),
        );
        expect(corruptLatestResponse.status).toBe(422);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it.skipIf(process.platform === "win32")(
    "rejects a symlinked desktop backup directory through the route boundary",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-symlink-route-"),
      );
      const externalDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-symlink-target-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registration } = await registerUser(
          app,
          "backup-symlink-owner",
          "debugpass001",
        );
        const backupsDir = path.join(dataDir, "backups");
        fs.mkdirSync(backupsDir, { recursive: true });
        fs.symlinkSync(externalDir, path.join(backupsDir, "desktop"), "dir");

        const response = await app.request(
          new Request("http://local/api/backups/desktop", {
            headers: authHeaders(registration.data.accessToken),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.stringContaining("real directory"),
            }),
          }),
        );
        expect(fs.readdirSync(externalDir)).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
        fs.rmSync(externalDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "rejects desktop backup snapshots containing credential fields",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-secrets-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registration } = await registerUser(
          app,
          "backup-secrets-owner",
          "debugpass001",
        );
        const response = await app.request(
          new Request("http://local/api/backups/desktop", {
            method: "POST",
            headers: authHeaders(registration.data.accessToken),
            body: JSON.stringify({
              clientVersion: rootPackage.version,
              payload: {
                ...buildRemotePayload(),
                version: "desktop-backup-v1",
                desktopAiConfig: {
                  aiProviders: [
                    {
                      id: "provider-1",
                      apiKey: "must-not-be-uploaded",
                    },
                  ],
                },
              },
            }),
          }),
        );

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.stringContaining("credential"),
            }),
          }),
        );
        expect(fs.existsSync(path.join(dataDir, "backups", "desktop"))).toBe(
          false,
        );
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );

  it(
    "returns a stable internal error when the backup store throws a non-Error value",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-backup-unknown-error-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { DesktopBackupStore } =
          await import("../services/desktop-backup-store.js");
        const { payload: registration } = await registerUser(
          app,
          "backup-unknown-error-owner",
          "debugpass001",
        );
        const listSpy = vi
          .spyOn(DesktopBackupStore.prototype, "list")
          .mockImplementationOnce(() => {
            throw "unexpected-store-failure";
          });

        const response = await app.request(
          new Request("http://local/api/backups/desktop", {
            headers: authHeaders(registration.data.accessToken),
          }),
        );

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: {
            code: "INTERNAL_ERROR",
            message: "Desktop backup operation failed",
          },
        });
        expect(listSpy).toHaveBeenCalledOnce();
      } finally {
        vi.restoreAllMocks();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    SYNC_ROUTE_TEST_TIMEOUT,
  );
});
