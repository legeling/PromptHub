import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadSelectiveExport,
  exportDatabase,
  importDatabase,
} from "../../../src/renderer/services/database-backup";
import { installWindowMocks } from "../../helpers/window";

const getDatabaseMock = vi.fn();

vi.mock("../../../src/renderer/services/database", () => ({
  getAllFolders: vi.fn().mockResolvedValue([]),
  getAllPrompts: vi.fn().mockResolvedValue([]),
  getDatabase: () => getDatabaseMock(),
  listOutputFormatItems: vi.fn().mockResolvedValue([]),
  listPromptRelations: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/renderer/services/settings-snapshot", () => ({
  getCanonicalAiConfigSnapshot: vi.fn(),
  getCanonicalSettingsStateSnapshot: vi.fn(),
  restoreAiConfigSnapshot: vi.fn(),
  restoreSettingsStateSnapshot: vi.fn(),
  SENSITIVE_SETTINGS_FIELDS: [
    "webdavPassword",
    "s3SecretAccessKey",
    "aiApiKey",
  ],
}));

function createEmptyTransaction() {
  const transaction: {
    error: null;
    objectStore: () => {
      clear: () => void;
      add: (value: unknown) => void;
      getAll: () => {
        result: unknown[];
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      };
    };
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
  } = {
    error: null,
    objectStore: () => ({
      clear: () => undefined,
      add: () => undefined,
      getAll: () => {
        const request = {
          result: [],
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    }),
    oncomplete: null,
    onerror: null,
  };
  queueMicrotask(() => transaction.oncomplete?.());
  return transaction;
}

describe("database backup Agent runtime exclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getDatabaseMock.mockResolvedValue({
      transaction: () => createEmptyTransaction(),
    });
    installWindowMocks();
  });

  it("keeps Qwen runtime sessions and transcripts out of ordinary backups", async () => {
    const backup = await exportDatabase();

    expect(window.api.agent.listSessions).not.toHaveBeenCalled();
    expect(window.api.agent.readSession).not.toHaveBeenCalled();
    expect(JSON.stringify(backup)).not.toMatch(
      /qwenRuntime|sessionTranscript|team-memory|mcp-oauth-tokens/,
    );
  });

  it("includes the main-owned portable Agent management section without reading sessions", async () => {
    const agentManagement = {
      version: 1,
      providerProfiles: [],
      snapshots: [],
      sessionSourcePreferences: [
        {
          platformId: "claude",
          adapterId: "claude-jsonl-v1",
          enabled: true,
        },
      ],
    };
    const exportManagementBackup = vi.fn().mockResolvedValue(agentManagement);
    (
      window.api.agent as typeof window.api.agent & {
        exportManagementBackup: typeof exportManagementBackup;
      }
    ).exportManagementBackup = exportManagementBackup;

    const backup = await exportDatabase();

    expect(backup).toMatchObject({ agentManagement });
    expect(exportManagementBackup).toHaveBeenCalledTimes(1);
    expect(window.api.agent.listSessions).not.toHaveBeenCalled();
    expect(window.api.agent.readSession).not.toHaveBeenCalled();
    expect(JSON.stringify(backup.agentManagement)).not.toMatch(
      /rootPath|scanCursor|sourcePath|transcript/,
    );
  });

  it("includes Agent management only when the selective Agents scope is enabled", async () => {
    const agentManagement = {
      version: 1,
      providerProfiles: [
        {
          id: "profile-portable",
          profile: {
            platformId: "codex",
            name: "Portable",
            providerKind: "custom",
            protocol: "responses",
            endpoint: null,
            config: {},
            source: "manual",
          },
          modelMappings: [],
          requiresSecret: false,
          archived: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      snapshots: [],
    };
    window.api.agent.exportManagementBackup = vi
      .fn()
      .mockResolvedValue(agentManagement as never);

    await downloadSelectiveExport({
      prompts: false,
      folders: false,
      versions: false,
      images: false,
      videos: false,
      aiConfig: false,
      settings: false,
      rules: false,
      skills: false,
      mcp: false,
      plugins: false,
      agents: true,
    } as never);

    const firstExport = JSON.parse(
      String(
        vi.mocked(window.electron.exportZip).mock.calls[0]?.[0]?.scope.exportJson,
      ),
    ) as {
      scope: { agents?: boolean };
      payload: { agentManagement?: unknown };
    };
    expect(firstExport.scope.agents).toBe(true);
    expect(firstExport.payload.agentManagement).toEqual(agentManagement);

    await downloadSelectiveExport({
      prompts: false,
      folders: false,
      versions: false,
      images: false,
      videos: false,
      aiConfig: false,
      settings: false,
      rules: false,
      skills: false,
      mcp: false,
      plugins: false,
      agents: false,
    } as never);

    const secondExport = JSON.parse(
      String(
        vi.mocked(window.electron.exportZip).mock.calls[1]?.[0]?.scope.exportJson,
      ),
    ) as { payload: { agentManagement?: unknown } };
    expect(secondExport.payload.agentManagement).toBeUndefined();
    expect(window.api.agent.exportManagementBackup).toHaveBeenCalledTimes(1);
  });

  it("fails full export instead of silently omitting Agent data when the main boundary is unavailable", async () => {
    (
      window.api.agent as typeof window.api.agent & {
        exportManagementBackup?: undefined;
      }
    ).exportManagementBackup = undefined;

    await expect(exportDatabase()).rejects.toThrow(
      "Agent management backup API is unavailable",
    );
  });

  it("restores Agent management only through the validated main-process boundary", async () => {
    const restoreManagementBackup = vi.fn().mockResolvedValue({
      profileCount: 0,
      snapshotCount: 0,
      availableSecretProfileIds: [],
      missingSecretProfileIds: [],
      restoredSessionPreferenceCount: 0,
      unresolvedSessionPreferenceKeys: [],
    });
    (
      window.api.agent as typeof window.api.agent & {
        restoreManagementBackup: typeof restoreManagementBackup;
      }
    ).restoreManagementBackup = restoreManagementBackup;
    const agentManagement = {
      version: 1,
      providerProfiles: [],
      snapshots: [],
    };

    await importDatabase({
      version: 1,
      exportedAt: "2026-07-29T00:00:00.000Z",
      prompts: [],
      folders: [],
      versions: [],
      settings: { state: {} },
      agentManagement,
    } as never);

    expect(restoreManagementBackup).toHaveBeenCalledWith(agentManagement);
  });

  it("reports restore failure instead of silently skipping an Agent section when the main boundary is unavailable", async () => {
    (
      window.api.agent as typeof window.api.agent & {
        restoreManagementBackup?: undefined;
      }
    ).restoreManagementBackup = undefined;

    await expect(
      importDatabase({
        version: 1,
        exportedAt: "2026-07-29T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        settings: { state: {} },
        agentManagement: {
          version: 1,
          providerProfiles: [],
          snapshots: [],
        },
      }),
    ).rejects.toThrow("Agent management restore");
  });

  it("keeps legacy backups compatible and does not clear Agent profiles implicitly", async () => {
    const restoreManagementBackup = window.api.agent.restoreManagementBackup;

    await importDatabase({
      version: 1,
      exportedAt: "2026-07-29T00:00:00.000Z",
      prompts: [],
      folders: [],
      versions: [],
      settings: { state: {} },
    });

    expect(restoreManagementBackup).not.toHaveBeenCalled();
  });

  it("rejects a secret-bearing Agent section before invoking restore", async () => {
    const restoreManagementBackup = window.api.agent.restoreManagementBackup;

    await expect(
      importDatabase({
        version: 1,
        exportedAt: "2026-07-29T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        settings: { state: {} },
        agentManagement: {
          version: 1,
          providerProfiles: [
            {
              id: "profile-invalid",
              profile: {
                platformId: "codex",
                name: "Invalid",
                providerKind: "custom",
                protocol: "responses",
                endpoint: null,
                config: { apiKey: "literal-secret" },
                source: "manual",
              },
              modelMappings: [],
              requiresSecret: false,
              archived: false,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          snapshots: [],
        },
      }),
    ).rejects.toThrow("AGENT_MANAGEMENT_BACKUP_INVALID");

    expect(restoreManagementBackup).not.toHaveBeenCalled();
  });
});
