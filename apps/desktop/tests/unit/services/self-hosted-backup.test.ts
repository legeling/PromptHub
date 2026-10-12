import { installWindowMocks } from "../../helpers/window";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  useSettingsStore: { getState: getSettingsStateMock },
}));

import {
  createSelfHostedRemoteBackup,
  restoreLatestSelfHostedRemoteBackup,
  testSelfHostedBackupConnection,
} from "../../../src/renderer/services/self-hosted-sync";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createBackup(): DatabaseBackup {
  return {
    version: 1,
    exportedAt: "2026-07-16T00:00:00.000Z",
    prompts: [],
    folders: [],
    versions: [],
    images: { "image.png": "aW1hZ2U=" },
    videos: { "video.mp4": "dmlkZW8=" },
    aiConfig: {
      aiApiKey: "must-not-leave-device",
      aiProvider: "openai",
      aiApiUrl: "https://api.example.com",
      aiModel: "gpt-test",
      aiProviders: [
        {
          id: "provider-1",
          provider: "openai",
          apiKey: "nested-provider-secret",
          apiUrl: "https://api.example.com",
        },
      ],
    },
    settings: {
      state: {
        themeMode: "light",
        language: "zh",
        autoSave: true,
        motionPreference: "reduced",
        webdavPassword: "webdav-secret",
        githubToken: "github-secret",
        networkProxy: {
          mode: "manual",
          protocol: "http",
          host: "proxy.example.com",
          port: 8080,
          username: "proxy-user",
          password: "proxy-secret",
          bypass: "localhost",
        },
      },
    },
    skills: [],
    skillVersions: [],
  };
}

describe("self-hosted backup-only client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
    installWindowMocks({
      electron: { updater: { getVersion: vi.fn().mockResolvedValue("0.5.9") } },
    });
    getSettingsStateMock.mockReturnValue({
      themeMode: "light",
      language: "zh",
      autoSave: true,
    });
    exportDatabaseMock.mockResolvedValue(createBackup());
  });

  it("stops before login and export when desktop and Web versions differ", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://backup.example.com/health") {
        return jsonResponse({ status: "ok", version: "0.5.8" });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createSelfHostedRemoteBackup({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      }),
    ).rejects.toMatchObject({ code: "SELF_HOSTED_VERSION_MISMATCH" });

    expect(exportDatabaseMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tests the versioned backup endpoint without reading the live sync manifest", async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok", version: "0.5.9" });
      }
      if (url.endsWith("/api/auth/captcha")) {
        return jsonResponse({
          data: {
            captchaId: "550e8400-e29b-41d4-a716-446655440000",
            prompt: "3 + 4 = ?",
          },
        });
      }
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({ data: { accessToken: "access-token" } });
      }
      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({ data: { ok: true } });
      }
      if (url.endsWith("/api/backups/desktop/capabilities")) {
        return jsonResponse({
          data: {
            serverVersion: "0.5.9",
            protocolVersion: 1,
            retentionLimit: 10,
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedBackupConnection({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      serverVersion: "0.5.9",
      protocolVersion: 1,
      retentionLimit: 10,
    });
    expect(requests.some((url) => url.includes("/api/sync/manifest"))).toBe(
      false,
    );
    expect(exportDatabaseMock).not.toHaveBeenCalled();
  });

  it("uploads one inline snapshot without touching live sync or media routes", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/health")) {
          return jsonResponse({ status: "ok", version: "0.5.9" });
        }
        if (url.endsWith("/api/auth/captcha")) {
          return jsonResponse({
            data: {
              captchaId: "550e8400-e29b-41d4-a716-446655440000",
              prompt: "3 + 4 = ?",
            },
          });
        }
        if (url.endsWith("/api/auth/login")) {
          return jsonResponse({ data: { accessToken: "access-token" } });
        }
        if (url.endsWith("/api/devices/heartbeat")) {
          return jsonResponse({ data: { ok: true } });
        }
        if (url.endsWith("/api/backups/desktop/capabilities")) {
          return jsonResponse({
            data: {
              serverVersion: "0.5.9",
              protocolVersion: 1,
              retentionLimit: 10,
            },
          });
        }
        if (url.endsWith("/api/backups/desktop")) {
          return jsonResponse({
            data: {
              id: "backup-1",
              createdAt: "2026-07-16T00:00:00.000Z",
              clientVersion: "0.5.9",
              serverVersion: "0.5.9",
              protocolVersion: 1,
              summary: {
                prompts: 0,
                folders: 0,
                rules: 0,
                skills: 0,
                mcpServers: 0,
                plugins: 0,
              },
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await createSelfHostedRemoteBackup({
      url: "https://backup.example.com",
      username: "owner",
      password: "secret",
    });

    const upload = requests.find(
      (request) =>
        request.url === "https://backup.example.com/api/backups/desktop",
    );
    const body = JSON.parse(String(upload?.init?.body)) as {
      clientVersion: string;
      payload: Record<string, unknown>;
    };
    expect(body.clientVersion).toBe("0.5.9");
    expect(body.payload.images).toEqual({ "image.png": "aW1hZ2U=" });
    expect(body.payload.videos).toEqual({ "video.mp4": "dmlkZW8=" });
    expect(body.payload).not.toHaveProperty("aiConfig");
    expect(body.payload.desktopSettings).toEqual({
      state: expect.objectContaining({ motionPreference: "reduced" }),
    });
    expect(body.payload.desktopSettings).not.toHaveProperty(
      "state.webdavPassword",
    );
    expect(body.payload.desktopSettings).not.toHaveProperty(
      "state.githubToken",
    );
    expect(body.payload.desktopSettings).not.toHaveProperty(
      "state.networkProxy",
    );
    expect(body.payload.desktopAiConfig).toEqual(
      expect.objectContaining({
        aiProvider: "openai",
        aiApiUrl: "https://api.example.com",
        aiModel: "gpt-test",
      }),
    );
    expect(body.payload.desktopAiConfig).not.toHaveProperty("aiApiKey");
    expect(body.payload.desktopAiConfig).not.toHaveProperty(
      "aiProviders.0.apiKey",
    );
    expect(requests.some((request) => request.url.includes("/api/sync"))).toBe(
      false,
    );
    expect(requests.some((request) => request.url.includes("/api/media"))).toBe(
      false,
    );
  });

  it("restores only from the verified stored snapshot endpoint", async () => {
    const snapshot = {
      version: "desktop-backup-v1",
      exportedAt: "2026-07-16T00:00:00.000Z",
      prompts: [],
      promptVersions: [],
      folders: [],
      skills: [],
      skillVersions: [],
      settings: {
        theme: "light",
        language: "zh",
        autoSave: true,
        sync: { enabled: false, provider: "manual", autoSync: false },
      },
      desktopSettings: {
        state: {
          themeMode: "dark",
          language: "zh",
          autoSave: true,
          motionPreference: "standard",
        },
      },
      desktopAiConfig: {
        aiProvider: "openai",
        aiApiUrl: "https://new-api.example.com",
        aiModel: "gpt-new",
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return jsonResponse({ status: "ok", version: "0.5.9" });
      }
      if (url.endsWith("/api/auth/captcha")) {
        return jsonResponse({
          data: {
            captchaId: "550e8400-e29b-41d4-a716-446655440000",
            prompt: "3 + 4 = ?",
          },
        });
      }
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({ data: { accessToken: "access-token" } });
      }
      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({ data: { ok: true } });
      }
      if (url.endsWith("/api/backups/desktop/capabilities")) {
        return jsonResponse({
          data: {
            serverVersion: "0.5.9",
            protocolVersion: 1,
            retentionLimit: 10,
          },
        });
      }
      if (url.endsWith("/api/backups/desktop/latest")) {
        return jsonResponse({
          data: {
            id: "backup-1",
            createdAt: "2026-07-16T00:00:00.000Z",
            clientVersion: "0.5.9",
            serverVersion: "0.5.9",
            protocolVersion: 1,
            summary: {
              prompts: 0,
              folders: 0,
              rules: 0,
              skills: 0,
              mcpServers: 0,
              plugins: 0,
            },
            snapshot,
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreLatestSelfHostedRemoteBackup({
      url: "https://backup.example.com",
      username: "owner",
      password: "secret",
    });

    expect(restoreFromBackupMock).toHaveBeenCalledTimes(1);
    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: {
          state: expect.objectContaining({
            themeMode: "dark",
            motionPreference: "standard",
            webdavPassword: "webdav-secret",
            githubToken: "github-secret",
            networkProxy: expect.objectContaining({
              password: "proxy-secret",
            }),
          }),
        },
        aiConfig: expect.objectContaining({
          aiProvider: "openai",
          aiApiUrl: "https://new-api.example.com",
          aiApiKey: "must-not-leave-device",
        }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/sync/data"),
      ),
    ).toBe(false);
  });
});
