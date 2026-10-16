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
  createTestApp,
  registerUser,
  authHeaders,
  streamedOversizedMultipartImportRequest,
  exportPayload,
} from "./import-export.test-helpers";

describe("web import/export routes", () => {
  const TEST_TIMEOUT = 20000;

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
    "rejects import requests with oversized content-length before parsing payloads",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-size-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "oversizedimporter",
          "debugpass001",
        );

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: {
              ...authHeaders(registerPayload.data.accessToken),
              "Content-Length": String(51 * 1024 * 1024),
            },
            body: JSON.stringify({
              version: "web-backup-v2",
              exportedAt: "2026-04-24T00:00:00.000Z",
              prompts: [],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
            }),
          }),
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error).toEqual({
          code: "BAD_REQUEST",
          message: "Import request body exceeds size limit",
        });

        const { payload: exportedPayload } = await exportPayload(
          app,
          registerPayload.data.accessToken,
        );
        expect(exportedPayload.prompts).toEqual([]);
        expect(exportedPayload.folders).toEqual([]);
        expect(exportedPayload.skills).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects streamed multipart imports that exceed the import body limit",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-stream-size-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "streamedmultipartimporter",
          "debugpass001",
        );

        const response = await app.request(
          streamedOversizedMultipartImportRequest(
            registerPayload.data.accessToken,
          ),
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error).toEqual({
          code: "BAD_REQUEST",
          message: "Import request body exceeds size limit",
        });

        const { payload: exportedPayload } = await exportPayload(
          app,
          registerPayload.data.accessToken,
        );
        expect(exportedPayload.prompts).toEqual([]);
        expect(exportedPayload.folders).toEqual([]);
        expect(exportedPayload.skills).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects unsafe imported skill file paths before importing records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "unsafe-skill-file-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const invalidPaths = ["../escape.md", "versions", "bad\u0000name.md"];
        for (const relativePath of invalidPaths) {
          const response = await app.request(
            new Request("http://local/api/import", {
              method: "POST",
              headers: authHeaders(token),
              body: JSON.stringify({
                version: "web-backup-v2",
                exportedAt: "2026-04-22T00:00:00.000Z",
                prompts: [
                  {
                    id: `unsafe-skill-file-prompt-${relativePath}`,
                    title: "Should Not Import",
                    userPrompt:
                      "This prompt must not survive a rejected import",
                    variables: [],
                    tags: [],
                    images: [],
                    videos: [],
                    isFavorite: false,
                    isPinned: false,
                    version: 1,
                    currentVersion: 1,
                    usageCount: 0,
                    createdAt: "2026-04-22T00:00:00.000Z",
                    updatedAt: "2026-04-22T00:00:00.000Z",
                  },
                ],
                promptVersions: [],
                folders: [],
                skills: [
                  {
                    id: `unsafe-skill-file-skill-${relativePath}`,
                    name: `unsafe-skill-file-skill-${relativePath}`,
                    content: "echo unsafe",
                    instructions: "echo unsafe",
                    protocol_type: "skill",
                    is_favorite: false,
                    created_at: 1776816000000,
                    updated_at: 1776816000000,
                  },
                ],
                skillVersions: [],
                skillFiles: {
                  [`unsafe-skill-file-skill-${relativePath}`]: [
                    {
                      relativePath,
                      content: "escape",
                    },
                  ],
                },
              }),
            }),
          );

          expect(response.status).toBe(422);
          const body = (await response.json()) as {
            error: { code: string; message: string };
          };
          expect(body.error.code).toBe("VALIDATION_ERROR");
          expect(body.error.message).toContain(
            `skillFiles.unsafe-skill-file-skill-${relativePath}.0.relativePath`,
          );
          expect(body.error.message).toContain("Invalid skill file path");
        }

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toEqual([]);
        expect(exportedPayload.skills).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects imported skills with unsafe URL metadata before importing records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-skill-url-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "unsafe-skill-url-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "web-backup-v2",
              exportedAt: "2026-04-22T00:00:00.000Z",
              prompts: [],
              promptVersions: [],
              folders: [],
              skills: [
                {
                  id: "unsafe-url-skill",
                  name: "unsafe-url-skill",
                  content: "echo unsafe",
                  instructions: "echo unsafe",
                  protocol_type: "skill",
                  is_favorite: false,
                  source_url: "javascript:alert(1)",
                  icon_url: "file:///tmp/icon.svg",
                  created_at: 1776816000000,
                  updated_at: 1776816000000,
                },
              ],
              skillVersions: [],
              settings: DEFAULT_SETTINGS,
            }),
          }),
        );

        expect(response.status).toBe(422);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toContain("skills.0.source_url");
        expect(body.error.message).toContain("skills.0.icon_url");

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.skills).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rolls back database records when import fails during later writes",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        vi.resetModules();


        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "atomic-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;
        const { getServerDatabase } = await import('../database');
        getServerDatabase().exec("CREATE TRIGGER reject_import_rule BEFORE INSERT ON rules BEGIN SELECT RAISE(ABORT, 'Simulated rule import failure'); END");

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "web-backup-v2",
              exportedAt: "2026-04-23T00:00:00.000Z",
              prompts: [
                {
                  id: "atomic-prompt",
                  title: "Atomic Prompt",
                  userPrompt: "This prompt must roll back",
                  variables: [],
                  tags: [],
                  images: ["atomic-image.png"],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  folderId: "atomic-folder",
                  createdAt: "2026-04-23T00:00:00.000Z",
                  updatedAt: "2026-04-23T00:00:00.000Z",
                },
              ],
              promptVersions: [],
              folders: [
                {
                  id: "atomic-folder",
                  name: "Atomic Folder",
                  order: 0,
                  createdAt: "2026-04-23T00:00:00.000Z",
                  updatedAt: "2026-04-23T00:00:00.000Z",
                },
              ],
              rules: [
                {
                  id: "project:atomic-rule",
                  platformId: "workspace",
                  platformName: "Atomic Rule",
                  platformIcon: "FolderRoot",
                  platformDescription: "Rule import failure trigger",
                  name: "AGENTS.md",
                  description: "Atomic rule",
                  path: "/atomic/AGENTS.md",
                  targetPath: "/atomic/AGENTS.md",
                  projectRootPath: "/atomic",
                  syncStatus: "synced",
                  content: "# Atomic",
                  versions: [],
                },
              ],
              skills: [],
              skillVersions: [],
              images: {
                "atomic-image.png":
                  Buffer.from("atomic-image").toString("base64"),
              },
            }),
          }),
        );

        expect(response.status).toBe(400);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error.message).toContain("Simulated rule import failure");

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toEqual([]);
        expect(exportedPayload.folders).toEqual([]);
        expect(exportedPayload.rules).toEqual([]);
        expect(
          fs.existsSync(
            path.join(
              dataDir,
              "data",
              "assets",
              registerPayload.data.user.id,
              "images",
              "atomic-image.png",
            ),
          ),
        ).toBe(false);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects imported folder parent cycles before importing records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "cyclic-folder-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "web-backup-v2",
              exportedAt: "2026-04-22T00:00:00.000Z",
              prompts: [
                {
                  id: "cyclic-folder-prompt",
                  title: "Should Not Import",
                  userPrompt: "This prompt must not survive a rejected import",
                  variables: [],
                  tags: [],
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  createdAt: "2026-04-22T00:00:00.000Z",
                  updatedAt: "2026-04-22T00:00:00.000Z",
                },
              ],
              promptVersions: [],
              folders: [
                {
                  id: "folder-a",
                  name: "Folder A",
                  parentId: "folder-b",
                  order: 0,
                  createdAt: "2026-04-22T00:00:00.000Z",
                  updatedAt: "2026-04-22T00:00:00.000Z",
                },
                {
                  id: "folder-b",
                  name: "Folder B",
                  parentId: "folder-a",
                  order: 1,
                  createdAt: "2026-04-22T00:00:00.000Z",
                  updatedAt: "2026-04-22T00:00:00.000Z",
                },
              ],
              skills: [],
              skillVersions: [],
            }),
          }),
        );

        expect(response.status).toBe(422);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toContain("folders");
        expect(body.error.message).toContain("cycle");

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toEqual([]);
        expect(exportedPayload.folders).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "imports large reversed folder hierarchies with intact parent links",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "large-folder-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;
        const folderCount = 40;
        const folders = Array.from({ length: folderCount }, (_, index) => ({
          id: `large-folder-${index}`,
          name: `Large Folder ${index}`,
          parentId: index === 0 ? null : `large-folder-${index - 1}`,
          order: index,
          createdAt: "2026-04-22T00:00:00.000Z",
          updatedAt: "2026-04-22T00:00:00.000Z",
        })).reverse();

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "web-backup-v2",
              exportedAt: "2026-04-22T00:00:00.000Z",
              prompts: [],
              promptVersions: [],
              folders,
              skills: [],
              skillVersions: [],
            }),
          }),
        );

        expect(response.status).toBe(201);
        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.folders).toHaveLength(folderCount);

        for (let index = 1; index < folderCount; index += 1) {
          const folder = exportedPayload.folders.find(
            (entry) => entry.id === `large-folder-${index}`,
          );
          expect(folder?.parentId).toBe(`large-folder-${index - 1}`);
        }
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );
});
