import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { closeDatabase } from "@prompthub/db";

import {
  ENV_KEYS,
  originalEnv,
  createTestApp,
  registerUser,
  authHeaders,
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
    "imports deep folder hierarchies into SQLite without Markdown path limits",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "deep-folder-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;
        const folderCount = 180;
        const folders = Array.from({ length: folderCount }, (_, index) => ({
          id: `deep-folder-${index}`,
          name: `Deep Folder ${index}`,
          parentId: index === 0 ? null : `deep-folder-${index - 1}`,
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
              prompts: [
                {
                  id: "deep-folder-prompt",
                  title: "Deep Prompt",
                  userPrompt: "Retained SQL content",
                  variables: [],
                  tags: [],
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  folderId: `deep-folder-${folderCount - 1}`,
                  createdAt: "2026-04-22T00:00:00.000Z",
                  updatedAt: "2026-04-22T00:00:00.000Z",
                },
              ],
              promptVersions: [],
              folders,
              skills: [],
              skillVersions: [],
            }),
          }),
        );

        expect(response.status).toBe(201);

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toMatchObject([
          {
            id: "deep-folder-prompt",
            folderId: `deep-folder-${folderCount - 1}`,
            userPrompt: "Retained SQL content",
          },
        ]);
        expect(exportedPayload.folders).toHaveLength(folderCount);
        expect(fs.existsSync(path.join(dataDir, "data", "prompts"))).toBe(
          false,
        );
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "imports long Skill names using stable ID package paths",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "deep-skill-importer",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;
        const longSkillName = "Skill ".repeat(70);

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "web-backup-v2",
              exportedAt: "2026-04-22T00:00:00.000Z",
              prompts: [
                {
                  id: "long-skill-prompt",
                  title: "Imported with long Skill name",
                  userPrompt: "This prompt survives the package import",
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
                  id: "long-skill-name",
                  name: longSkillName,
                  content: "echo too long",
                  instructions: "echo too long",
                  protocol_type: "skill",
                  is_favorite: false,
                  created_at: 1776816000000,
                  updated_at: 1776816000000,
                },
              ],
              skillVersions: [],
            }),
          }),
        );

        expect(response.status).toBe(201);
        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toHaveLength(1);
        expect(exportedPayload.skills).toEqual([
          expect.objectContaining({ id: 'long-skill-name', name: longSkillName }),
        ]);
        expect(fs.readFileSync(path.join(dataDir, 'data', 'skill-files', 'long-skill-name', 'files', 'SKILL.md'), 'utf8')).toBe('echo too long');
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects unsafe imported rule paths before writing media or records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-export-test-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "unsafe-rule-importer",
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
                  id: "unsafe-rule-prompt",
                  title: "Should Not Import",
                  userPrompt: "This prompt must not survive a rejected import",
                  variables: [],
                  tags: [],
                  images: ["unsafe-rule-image.png"],
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
              rules: [
                {
                  id: "project:../escape",
                  platformId: "workspace",
                  platformName: "Unsafe Rule",
                  platformIcon: "FolderRoot",
                  platformDescription: "Unsafe imported rule",
                  name: "../AGENTS.md",
                  description: "Should be rejected",
                  path: "/unsafe/AGENTS.md",
                  targetPath: "/unsafe/AGENTS.md",
                  projectRootPath: "/unsafe",
                  syncStatus: "synced",
                  content: "# Unsafe",
                  versions: [],
                },
              ],
              skills: [],
              skillVersions: [],
              images: {
                "unsafe-rule-image.png":
                  Buffer.from("unsafe-rule-image").toString("base64"),
              },
            }),
          }),
        );

        expect(response.status).toBe(422);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toContain("rule path segment");
        expect(
          fs.existsSync(
            path.join(
              dataDir,
              "data",
              "assets",
              registerPayload.data.user.id,
              "images",
              "unsafe-rule-image.png",
            ),
          ),
        ).toBe(false);

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toEqual([]);
        expect(exportedPayload.rules).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "ignores unknown snapshot fields but rejects unknown enum values without importing records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-forward-compat-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "forwardcompatimporter",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;

        const acceptedResponse = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "desktop-backup-v1",
              exportedAt: "2026-04-23T00:00:00.000Z",
              futureRootField: { ignored: true },
              prompts: [
                {
                  id: "unknown-field-prompt",
                  title: "Unknown Field Prompt",
                  userPrompt: "Known fields should still import",
                  variables: [],
                  tags: [],
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  createdAt: "2026-04-23T00:00:00.000Z",
                  updatedAt: "2026-04-23T00:00:00.000Z",
                  futurePromptField: "ignored",
                },
              ],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
            }),
          }),
        );

        expect(acceptedResponse.status).toBe(201);

        const rejectedResponse = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
              version: "desktop-backup-v1",
              exportedAt: "2026-04-23T01:00:00.000Z",
              prompts: [
                {
                  id: "unknown-enum-prompt",
                  title: "Unknown Enum Prompt",
                  promptType: "audio",
                  userPrompt: "This prompt must not import",
                  variables: [],
                  tags: [],
                  images: [],
                  videos: [],
                  isFavorite: false,
                  isPinned: false,
                  version: 1,
                  currentVersion: 1,
                  usageCount: 0,
                  createdAt: "2026-04-23T01:00:00.000Z",
                  updatedAt: "2026-04-23T01:00:00.000Z",
                },
              ],
              promptVersions: [],
              folders: [],
              skills: [],
              skillVersions: [],
            }),
          }),
        );

        expect(rejectedResponse.status).toBe(422);
        const rejectedBody = (await rejectedResponse.json()) as {
          error: { code: string; message: string };
        };
        expect(rejectedBody.error.code).toBe("VALIDATION_ERROR");
        expect(rejectedBody.error.message).toContain("prompts.0.promptType");

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toEqual([
          expect.objectContaining({
            id: "unknown-field-prompt",
            title: "Unknown Field Prompt",
          }),
        ]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "rejects unsupported desktop ZIP backup versions before writing media or records",
    async () => {
      const dataDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "prompthub-web-import-zip-version-"),
      );

      try {
        const app = await createTestApp(dataDir);
        const { payload: registerPayload } = await registerUser(
          app,
          "zipversionimporter",
          "debugpass001",
        );
        const token = registerPayload.data.accessToken;
        const zipBody = zipSync({
          "import-with-prompthub.json": strToU8(
            JSON.stringify({
              kind: "prompthub-backup",
              exportedAt: "2026-04-23T02:00:00.000Z",
              payload: {
                version: "desktop-backup-v2",
                exportedAt: "2026-04-23T02:00:00.000Z",
                prompts: [
                  {
                    id: "future-version-prompt",
                    title: "Future Version Prompt",
                    userPrompt: "This prompt must not import",
                    variables: [],
                    tags: [],
                    images: ["future-version-image.png"],
                    videos: [],
                    isFavorite: false,
                    isPinned: false,
                    version: 1,
                    currentVersion: 1,
                    usageCount: 0,
                    createdAt: "2026-04-23T02:00:00.000Z",
                    updatedAt: "2026-04-23T02:00:00.000Z",
                  },
                ],
                promptVersions: [],
                folders: [],
                skills: [],
                skillVersions: [],
                images: {
                  "future-version-image.png": Buffer.from(
                    "future-version-image",
                  ).toString("base64"),
                },
              },
            }),
          ),
        });
        const zipPayload = new ArrayBuffer(zipBody.byteLength);
        new Uint8Array(zipPayload).set(zipBody);

        const response = await app.request(
          new Request("http://local/api/import", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/zip",
            },
            body: zipPayload,
          }),
        );

        expect(response.status).toBe(422);
        const body = (await response.json()) as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toContain(
          "unsupported backup version desktop-backup-v2",
        );
        expect(
          fs.existsSync(
            path.join(
              dataDir,
              "data",
              "assets",
              registerPayload.data.user.id,
              "images",
              "future-version-image.png",
            ),
          ),
        ).toBe(false);

        const { payload: exportedPayload } = await exportPayload(app, token);
        expect(exportedPayload.prompts).toEqual([]);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    TEST_TIMEOUT,
  );
});
