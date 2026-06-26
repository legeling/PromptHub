import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseBackup } from "../../../src/renderer/services/database-backup-format";

const { exportDatabaseMock, restoreFromBackupMock, getSettingsStateMock } =
  vi.hoisted(() => ({
    exportDatabaseMock: vi.fn(),
    restoreFromBackupMock: vi.fn(),
    getSettingsStateMock: vi.fn(),
  }));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  exportDatabase: exportDatabaseMock,
  restoreFromBackup: restoreFromBackupMock,
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: {
    getState: getSettingsStateMock,
  },
}));

import {
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
  testSelfHostedConnection,
} from "../../../src/renderer/services/self-hosted-sync";

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function captchaResponse(prompt = "3 + 4 = ?"): Response {
  return jsonResponse({
    data: {
      captchaId: "550e8400-e29b-41d4-a716-446655440000",
      prompt,
    },
  });
}

describe("self-hosted-sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
    window.electron = {
      updater: {
        getVersion: vi.fn().mockResolvedValue("0.5.2"),
      },
    } as typeof window.electron;

    getSettingsStateMock.mockReturnValue({
      themeMode: "light",
      language: "zh",
      autoSave: true,
      settingsUpdatedAt: "2026-04-16T00:00:00.000Z",
    });
  });

  it("tests the remote self-hosted connection through login and manifest", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/captcha")) {
        return captchaResponse();
      }

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/manifest")) {
        return jsonResponse({
          data: {
            counts: {
              prompts: 4,
              folders: 2,
              rules: 1,
              skills: 3,
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedConnection({
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 4,
      folders: 2,
      rules: 1,
      skills: 3,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://backup.example.com/api/auth/captcha",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://backup.example.com/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "owner",
          password: "secret",
          captchaId: "550e8400-e29b-41d4-a716-446655440000",
          captchaAnswer: "7",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://backup.example.com/api/devices/heartbeat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://backup.example.com/api/sync/manifest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("normalizes pasted /api URLs before issuing captcha and login requests", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url === "https://backup.example.com/api/auth/captcha") {
        return captchaResponse();
      }

      if (url === "https://backup.example.com/api/auth/login") {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url === "https://backup.example.com/api/devices/heartbeat") {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url === "https://backup.example.com/api/sync/manifest") {
        return jsonResponse({
          data: {
            counts: {
              prompts: 0,
              folders: 0,
              rules: 0,
              skills: 0,
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedConnection({
        url: "https://backup.example.com/api/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 0,
      folders: 0,
      rules: 0,
      skills: 0,
    });

    expect(requestedUrls).toEqual([
      "https://backup.example.com/api/auth/captcha",
      "https://backup.example.com/api/auth/login",
      "https://backup.example.com/api/devices/heartbeat",
      "https://backup.example.com/api/sync/manifest",
    ]);
  });

  it("normalizes pasted auth endpoint URLs before connecting", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://backup.example.com/api/auth/captcha") {
        return captchaResponse();
      }

      if (url === "https://backup.example.com/api/auth/login") {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url === "https://backup.example.com/api/devices/heartbeat") {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url === "https://backup.example.com/api/sync/manifest") {
        return jsonResponse({
          data: {
            counts: {
              prompts: 1,
              folders: 0,
              rules: 0,
              skills: 0,
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedConnection({
        url: "https://backup.example.com/api/auth/captcha?retry=1",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 1,
      folders: 0,
      rules: 0,
      skills: 0,
    });
  });

  it("falls back to legacy login when an older Web server has no public captcha endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "https://backup.example.com/api/auth/captcha") {
          return jsonResponse(
            {
              error: {
                code: "UNAUTHORIZED",
                message: "Missing or invalid Authorization header",
              },
            },
            { status: 401 },
          );
        }

        if (url === "https://backup.example.com/api/auth/login") {
          expect(JSON.parse(String(init?.body))).toEqual({
            username: "owner",
            password: "secret",
          });
          return jsonResponse({
            data: { accessToken: "legacy-access-token" },
          });
        }

        if (url === "https://backup.example.com/api/devices/heartbeat") {
          return jsonResponse({
            data: { ok: true },
          });
        }

        if (url === "https://backup.example.com/api/sync/manifest") {
          return jsonResponse({
            data: {
              counts: {
                prompts: 2,
                folders: 1,
                rules: 0,
                skills: 0,
              },
            },
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedConnection({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 2,
      folders: 1,
      rules: 0,
      skills: 0,
    });
  });

  it("reports protected captcha as a deployment mismatch when login still requires captcha", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://backup.example.com/api/auth/captcha") {
        return jsonResponse(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "Missing or invalid Authorization header",
            },
          },
          { status: 401 },
        );
      }

      if (url === "https://backup.example.com/api/auth/login") {
        return jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "captchaId is required",
            },
          },
          { status: 422 },
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedConnection({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      }),
    ).rejects.toThrow("update the self-hosted Web deployment");
  });

  it("pushes desktop backup data and uploads media before syncing payload", async () => {
    const backup: DatabaseBackup = {
      version: 1,
      exportedAt: "2026-04-16T01:02:03.000Z",
      prompts: [
        {
          id: "prompt-1",
          title: "Prompt One",
          description: "",
          promptType: "text",
          userPrompt: "Body",
          variables: [],
          tags: [],
          folderId: "folder-1",
          images: ["local-image.png"],
          videos: ["local-video.mp4"],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: "2026-04-16T01:02:03.000Z",
          updatedAt: "2026-04-16T01:02:03.000Z",
        },
      ],
      folders: [
        {
          id: "folder-1",
          name: "Folder One",
          order: 0,
          createdAt: "2026-04-16T01:02:03.000Z",
          updatedAt: "2026-04-16T01:02:03.000Z",
        },
      ],
      versions: [],
      images: {
        "local-image.png": "image-base64",
      },
      videos: {
        "local-video.mp4": "video-base64",
      },
      settings: {
        state: {
          themeMode: "dark",
          language: "en",
          autoSave: false,
          builtinAgentOverrides: { claude: { rootPath: "/tmp/claude-root" } },
          customPlatformRootPaths: { claude: "/tmp/claude-root" },
        },
      },
      rules: [
        {
          id: "project:docs-site",
          platformId: "workspace",
          platformName: "Docs Site",
          platformIcon: "FolderRoot",
          platformDescription: "Project rules",
          name: "AGENTS.md",
          description: "Project rules file",
          path: "/repo/AGENTS.md",
          content: "# Docs rules",
          versions: [],
        },
      ],
      skills: [
        {
          id: "skill-1",
          name: "Skill One",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      skillVersions: [],
      skillFiles: {
        "skill-1": [{ relativePath: "SKILL.md", content: "# Skill One" }],
      },
    };

    exportDatabaseMock.mockResolvedValue(backup);

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/api/auth/captcha")) {
          return captchaResponse();
        }

        if (url.endsWith("/api/auth/login")) {
          return jsonResponse({
            data: { accessToken: "access-token" },
          });
        }

        if (url.endsWith("/api/devices/heartbeat")) {
          return jsonResponse({
            data: { ok: true },
          });
        }

        if (url.endsWith("/api/media/images/base64")) {
          return jsonResponse({ data: "remote-image.png" });
        }

        if (url.endsWith("/api/media/videos/base64")) {
          return jsonResponse({ data: "remote-video.mp4" });
        }

        if (url.endsWith("/api/sync/data")) {
          const parsedBody = JSON.parse(String(init?.body)) as {
            payload: {
              prompts: Array<{ images?: string[]; videos?: string[] }>;
              rules?: Array<{ id: string; content: string }>;
              skillFiles?: Record<
                string,
                Array<{ relativePath: string; content: string }>
              >;
              settings: {
                theme: string;
                language: string;
                autoSave: boolean;
                builtinAgentOverrides: Record<string, { rootPath?: string }>;
                customPlatformRootPaths: Record<string, string>;
              };
            };
          };

          expect(parsedBody.payload.prompts).toEqual([
            expect.objectContaining({
              images: ["remote-image.png"],
              videos: ["remote-video.mp4"],
            }),
          ]);
          expect(parsedBody.payload.rules).toEqual([
            expect.objectContaining({
              id: "project:docs-site",
              content: "# Docs rules",
            }),
          ]);
          expect(parsedBody.payload.skillFiles).toEqual({
            "skill-1": [{ relativePath: "SKILL.md", content: "# Skill One" }],
          });
          expect(parsedBody.payload.settings).toEqual({
            theme: "dark",
            language: "en",
            autoSave: false,
            builtinAgentOverrides: { claude: { rootPath: "/tmp/claude-root" } },
            customPlatformRootPaths: { claude: "/tmp/claude-root" },
            customSkillPlatformPaths: {},
            disabledPlatformIds: [],
            sync: {
              enabled: false,
              provider: "manual",
              autoSync: false,
            },
          });

          return jsonResponse({
            data: {
              ok: true,
              promptsImported: 1,
              foldersImported: 1,
              rulesImported: 1,
              skillsImported: 1,
            },
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pushToSelfHostedWeb({
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 1,
      folders: 1,
      rules: 1,
      skills: 1,
      mcpServers: 0,
      plugins: 0,
    });

    expect(exportDatabaseMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backup.example.com/api/media/images/base64",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backup.example.com/api/media/videos/base64",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("pulls remote workspace data and restores it back into desktop backup format", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-16T01:00:00.000Z",
      prompts: [],
      folders: [],
      versions: [],
      settingsUpdatedAt: "2026-04-16T01:00:00.000Z",
    } satisfies DatabaseBackup);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/captcha")) {
        return captchaResponse();
      }

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/data")) {
        return jsonResponse({
          data: {
            version: "web-backup-v2",
            exportedAt: "2026-04-16T02:03:04.000Z",
            prompts: [
              {
                id: "prompt-remote",
                title: "Remote Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote body",
                variables: [],
                tags: [],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: ["remote-video.mp4"],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            promptVersions: [],
            folders: [
              {
                id: "folder-remote",
                name: "Remote Folder",
                order: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            rules: [
              {
                id: "project:remote-site",
                platformId: "workspace",
                platformName: "Remote Site",
                platformIcon: "FolderRoot",
                platformDescription: "Remote rules",
                name: "AGENTS.md",
                description: "Remote project rules",
                path: "/remote/AGENTS.md",
                content: "# Remote rules",
                versions: [],
              },
            ],
            skills: [
              {
                id: "skill-remote",
                name: "Remote Skill",
                protocol_type: "skill",
                is_favorite: false,
                created_at: 1,
                updated_at: 1,
              },
            ],
            skillVersions: [],
            skillFiles: {
              "skill-remote": [
                { relativePath: "SKILL.md", content: "# Remote Skill" },
                { relativePath: "templates/review.md", content: "# Review" },
              ],
            },
            settings: {
              theme: "dark",
              language: "en",
              autoSave: false,
              customPlatformRootPaths: { claude: "/tmp/remote-root" },
            },
            settingsUpdatedAt: "2026-04-16T02:03:04.000Z",
          },
        });
      }

      if (url.endsWith("/api/media/images")) {
        return jsonResponse({ data: ["remote-image.png"] });
      }

      if (url.endsWith("/api/media/videos")) {
        return jsonResponse({ data: ["remote-video.mp4"] });
      }

      if (url.endsWith("/api/media/images/remote-image.png/base64")) {
        return jsonResponse({ data: "remote-image-base64" });
      }

      if (url.endsWith("/api/media/videos/remote-video.mp4/base64")) {
        return jsonResponse({ data: "remote-video-base64" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pullFromSelfHostedWeb({
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 1,
      folders: 1,
      rules: 1,
      skills: 1,
      mcpServers: 0,
      plugins: 0,
    });

    expect(restoreFromBackupMock).toHaveBeenCalledTimes(1);
    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [
          expect.objectContaining({
            title: "Remote Prompt",
            images: ["remote-image.png"],
            videos: ["remote-video.mp4"],
          }),
        ],
        folders: [expect.objectContaining({ name: "Remote Folder" })],
        images: {
          "remote-image.png": "remote-image-base64",
        },
        videos: {
          "remote-video.mp4": "remote-video-base64",
        },
        settings: {
          state: expect.objectContaining({
            themeMode: "dark",
            language: "en",
            autoSave: false,
            customPlatformRootPaths: { claude: "/tmp/remote-root" },
            customSkillPlatformPaths: {},
            settingsUpdatedAt: "2026-04-16T02:03:04.000Z",
          }),
        },
        rules: [
          expect.objectContaining({
            id: "project:remote-site",
            content: "# Remote rules",
          }),
        ],
        skills: [expect.objectContaining({ name: "Remote Skill" })],
        skillFiles: {
          "skill-remote": [
            { relativePath: "SKILL.md", content: "# Remote Skill" },
            { relativePath: "templates/review.md", content: "# Review" },
          ],
        },
      }),
    );
  });

  it("merges divergent local and remote changes during pull and keeps the latest copy of shared entities", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-16T01:00:00.000Z",
      prompts: [
        {
          id: "prompt-shared",
          title: "Local Shared Prompt",
          description: "",
          promptType: "text",
          userPrompt: "Local newer body",
          variables: [],
          tags: ["local"],
          folderId: "folder-local",
          images: ["local-image.png"],
          videos: [],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T03:00:00.000Z",
        },
      ],
      folders: [
        {
          id: "folder-local",
          name: "Local Folder",
          order: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T03:00:00.000Z",
        },
      ],
      versions: [
        {
          id: "prompt-shared-v1",
          promptId: "prompt-shared",
          version: 1,
          userPrompt: "Local newer body",
          variables: [],
          createdAt: "2026-04-16T03:00:00.000Z",
        },
      ],
      images: {
        "local-image.png": "local-image-base64",
      },
      settings: {
        state: {
          themeMode: "light",
          language: "zh",
          autoSave: true,
        },
      },
      settingsUpdatedAt: "2026-04-16T03:00:00.000Z",
      rules: [
        {
          id: "project:local-site",
          platformId: "workspace",
          platformName: "Local Site",
          platformIcon: "FolderRoot",
          platformDescription: "Local rules",
          name: "AGENTS.md",
          description: "Local project rules",
          path: "/local/AGENTS.md",
          content: "# Local rules",
          versions: [
            {
              id: "local-rule-v1",
              savedAt: "2026-04-16T03:00:00.000Z",
              source: "manual-save",
              content: "# Local rules",
            },
          ],
        },
      ],
      skills: [
        {
          id: "skill-local",
          name: "Local Skill",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 10,
        },
      ],
      skillVersions: [],
      skillFiles: {
        "skill-local": [{ relativePath: "SKILL.md", content: "# Local Skill" }],
      },
    } satisfies DatabaseBackup);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/captcha")) {
        return captchaResponse();
      }

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/data")) {
        return jsonResponse({
          data: {
            version: "web-backup-v2",
            exportedAt: "2026-04-16T02:03:04.000Z",
            prompts: [
              {
                id: "prompt-shared",
                title: "Remote Shared Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote older body",
                variables: [],
                tags: ["remote"],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:00:00.000Z",
                updatedAt: "2026-04-16T02:00:00.000Z",
              },
              {
                id: "prompt-remote",
                title: "Remote Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote only body",
                variables: [],
                tags: ["remote"],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            promptVersions: [
              {
                id: "prompt-remote-v1",
                promptId: "prompt-remote",
                version: 1,
                userPrompt: "Remote only body",
                variables: [],
                createdAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            folders: [
              {
                id: "folder-remote",
                name: "Remote Folder",
                order: 1,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            rules: [
              {
                id: "project:local-site",
                platformId: "workspace",
                platformName: "Local Site",
                platformIcon: "FolderRoot",
                platformDescription: "Remote older local rules",
                name: "AGENTS.md",
                description: "Remote older local rules",
                path: "/remote/local/AGENTS.md",
                content: "# Remote older local rules",
                versions: [
                  {
                    id: "remote-local-rule-v1",
                    savedAt: "2026-04-16T02:00:00.000Z",
                    source: "manual-save",
                    content: "# Remote older local rules",
                  },
                ],
              },
              {
                id: "project:remote-site",
                platformId: "workspace",
                platformName: "Remote Site",
                platformIcon: "FolderRoot",
                platformDescription: "Remote rules",
                name: "AGENTS.md",
                description: "Remote project rules",
                path: "/remote/AGENTS.md",
                content: "# Remote rules",
                versions: [],
              },
            ],
            skills: [
              {
                id: "skill-remote",
                name: "Remote Skill",
                protocol_type: "skill",
                is_favorite: false,
                created_at: 1,
                updated_at: 20,
              },
            ],
            skillVersions: [],
            skillFiles: {
              "skill-remote": [
                { relativePath: "SKILL.md", content: "# Remote Skill" },
              ],
            },
            settings: {
              theme: "dark",
              language: "en",
              autoSave: false,
              customPlatformRootPaths: { claude: "/tmp/remote-root" },
            },
            settingsUpdatedAt: "2026-04-16T02:00:00.000Z",
          },
        });
      }

      if (url.endsWith("/api/media/images")) {
        return jsonResponse({ data: ["remote-image.png"] });
      }

      if (url.endsWith("/api/media/videos")) {
        return jsonResponse({ data: [] });
      }

      if (url.endsWith("/api/media/images/remote-image.png/base64")) {
        return jsonResponse({ data: "remote-image-base64" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await pullFromSelfHostedWeb({
      url: "https://backup.example.com/",
      username: "owner",
      password: "secret",
    });

    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: expect.arrayContaining([
          expect.objectContaining({
            id: "prompt-shared",
            title: "Local Shared Prompt",
            userPrompt: "Local newer body",
          }),
          expect.objectContaining({
            id: "prompt-remote",
            title: "Remote Prompt",
          }),
        ]),
        folders: expect.arrayContaining([
          expect.objectContaining({ id: "folder-local", name: "Local Folder" }),
          expect.objectContaining({
            id: "folder-remote",
            name: "Remote Folder",
          }),
        ]),
        images: {
          "local-image.png": "local-image-base64",
          "remote-image.png": "remote-image-base64",
        },
        settings: {
          state: expect.objectContaining({
            themeMode: "light",
            language: "zh",
            autoSave: true,
          }),
        },
        rules: expect.arrayContaining([
          expect.objectContaining({
            id: "project:local-site",
            content: "# Local rules",
          }),
          expect.objectContaining({
            id: "project:remote-site",
            content: "# Remote rules",
          }),
        ]),
        skills: expect.arrayContaining([
          expect.objectContaining({ id: "skill-local", name: "Local Skill" }),
          expect.objectContaining({ id: "skill-remote", name: "Remote Skill" }),
        ]),
        skillFiles: {
          "skill-local": [
            { relativePath: "SKILL.md", content: "# Local Skill" },
          ],
          "skill-remote": [
            { relativePath: "SKILL.md", content: "# Remote Skill" },
          ],
        },
      }),
    );
  });

  it("replaces the local workspace during pull when replace mode is requested", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-16T01:00:00.000Z",
      prompts: [
        {
          id: "prompt-local",
          title: "Local Prompt",
          description: "",
          promptType: "text",
          userPrompt: "Keep me only in merge mode",
          variables: [],
          tags: ["local"],
          folderId: "folder-local",
          images: ["local-image.png"],
          videos: [],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T01:00:00.000Z",
        },
      ],
      folders: [
        {
          id: "folder-local",
          name: "Local Folder",
          order: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T01:00:00.000Z",
        },
      ],
      versions: [],
      images: {
        "local-image.png": "local-image-base64",
      },
      aiConfig: {
        rootApiKey: "local-root-key",
      },
      rules: [
        {
          id: "project:local-site",
          platformId: "workspace",
          platformName: "Local Site",
          platformIcon: "FolderRoot",
          platformDescription: "Local rules",
          name: "AGENTS.md",
          description: "Local project rules",
          path: "/local/AGENTS.md",
          content: "# Local rules",
          versions: [],
        },
      ],
      skills: [
        {
          id: "skill-local",
          name: "Local Skill",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      skillVersions: [],
      skillFiles: {
        "skill-local": [{ relativePath: "SKILL.md", content: "# Local Skill" }],
      },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/captcha")) {
        return captchaResponse();
      }

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/data")) {
        return jsonResponse({
          data: {
            version: "web-backup-v2",
            exportedAt: "2026-04-16T02:03:04.000Z",
            prompts: [
              {
                id: "prompt-remote",
                title: "Remote Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote only body",
                variables: [],
                tags: ["remote"],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            promptVersions: [
              {
                id: "prompt-remote-v1",
                promptId: "prompt-remote",
                version: 1,
                userPrompt: "Remote only body",
                variables: [],
                createdAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            folders: [
              {
                id: "folder-remote",
                name: "Remote Folder",
                order: 1,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            rules: [
              {
                id: "project:remote-site",
                platformId: "workspace",
                platformName: "Remote Site",
                platformIcon: "FolderRoot",
                platformDescription: "Remote rules",
                name: "AGENTS.md",
                description: "Remote project rules",
                path: "/remote/AGENTS.md",
                content: "# Remote rules",
                versions: [],
              },
            ],
            skills: [
              {
                id: "skill-remote",
                name: "Remote Skill",
                protocol_type: "skill",
                is_favorite: false,
                created_at: 1,
                updated_at: 20,
              },
            ],
            skillVersions: [],
            skillFiles: {
              "skill-remote": [
                { relativePath: "SKILL.md", content: "# Remote Skill" },
              ],
            },
            settings: {
              theme: "dark",
              language: "en",
              autoSave: false,
              customPlatformRootPaths: {},
              customSkillPlatformPaths: {},
              sync: {
                enabled: false,
                provider: "manual",
                autoSync: false,
              },
            },
            settingsUpdatedAt: "2026-04-16T02:03:04.000Z",
          },
        });
      }

      if (url.endsWith("/api/media/images")) {
        return jsonResponse({ data: ["remote-image.png"] });
      }

      if (url.endsWith("/api/media/videos")) {
        return jsonResponse({ data: [] });
      }

      if (url.endsWith("/api/media/images/remote-image.png/base64")) {
        return jsonResponse({ data: "remote-image-base64" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await pullFromSelfHostedWeb(
      {
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      },
      { mode: "replace" },
    );

    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [
          expect.objectContaining({
            id: "prompt-remote",
            title: "Remote Prompt",
          }),
        ],
        folders: [
          expect.objectContaining({
            id: "folder-remote",
            name: "Remote Folder",
          }),
        ],
        versions: [
          expect.objectContaining({
            promptId: "prompt-remote",
            version: 1,
          }),
        ],
        images: {
          "remote-image.png": "remote-image-base64",
        },
        aiConfig: {
          rootApiKey: "local-root-key",
        },
        rules: [
          expect.objectContaining({
            id: "project:remote-site",
            content: "# Remote rules",
          }),
        ],
        skills: [
          expect.objectContaining({ id: "skill-remote", name: "Remote Skill" }),
        ],
        skillFiles: {
          "skill-remote": [
            { relativePath: "SKILL.md", content: "# Remote Skill" },
          ],
        },
      }),
    );
  });
});
