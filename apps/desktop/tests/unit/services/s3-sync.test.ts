import { beforeEach, describe, expect, it, vi } from "vitest";

import { installWindowMocks } from "../../helpers/window";

const exportDatabaseMock = vi.fn();
const restoreFromBackupMock = vi.fn();

vi.mock("../../../src/renderer/services/database-backup", () => ({
  exportDatabase: (...args: unknown[]) => exportDatabaseMock(...args),
  restoreFromBackup: (...args: unknown[]) => restoreFromBackupMock(...args),
}));

vi.mock("../../../src/renderer/services/settings-snapshot", () => ({
  getSettingsStateSnapshot: vi.fn().mockReturnValue(undefined),
  restoreAiConfigSnapshot: vi.fn(),
  restoreSettingsStateSnapshot: vi.fn(),
  SENSITIVE_SETTINGS_FIELDS: [],
}));

import {
  downloadFromS3,
  testConnection,
  uploadToS3,
} from "../../../src/renderer/services/s3-sync";

const config = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  bucket: "prompthub-backups",
  accessKeyId: "access",
  secretAccessKey: "secret",
  backupPrefix: "/team/",
};

const mainConfig = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  bucket: "prompthub-backups",
  accessKeyId: "access",
  secretAccessKey: "secret",
};

describe("s3-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest: vi
            .fn()
            .mockResolvedValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer),
        },
      },
    });
    installWindowMocks({
      electron: {
        s3: {
          testConnection: vi.fn().mockResolvedValue({
            success: true,
            message: "Connection successful",
          }),
          upload: vi.fn().mockResolvedValue({ success: true }),
          download: vi.fn().mockResolvedValue({ success: false, notFound: true }),
          stat: vi.fn().mockResolvedValue({ success: false, notFound: true }),
        },
      },
    });
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-06-01T00:00:00.000Z",
      prompts: [],
      folders: [],
      versions: [],
      images: {},
    });
    restoreFromBackupMock.mockResolvedValue(undefined);
  });

  it("delegates connection checks to the preload s3 bridge", async () => {
    const result = await testConnection(config);

    expect(window.electron?.s3?.testConnection).toHaveBeenCalledWith(mainConfig);
    expect(result.success).toBe(true);
    expect(result.message).toBe("Connection successful");
  });

  it("uploads incremental backup data and manifest through normalized S3 object keys", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-06-01T00:00:00.000Z",
      prompts: [{ id: "prompt-1", title: "Home edit", videos: [] }],
      folders: [],
      versions: [],
      images: {},
      rules: [{ id: "global:agents", content: "# Agents" }],
    });

    const result = await uploadToS3(config, {
      includeImages: true,
      incrementalSync: true,
    });

    expect(window.electron?.s3?.download).toHaveBeenCalledWith(
      "team/prompthub-backup/manifest.json",
      mainConfig,
    );
    expect(window.electron?.s3?.upload).toHaveBeenCalledWith(
      "team/prompthub-backup/data.json",
      mainConfig,
      expect.stringContaining('"Home edit"'),
    );
    expect(window.electron?.s3?.upload).toHaveBeenCalledWith(
      "team/prompthub-backup/manifest.json",
      mainConfig,
      expect.stringContaining('"dataHash"'),
    );
    expect(result.success).toBe(true);
    expect(result.localChanged).toBe(false);
  });

  it("downloads incremental backup data from S3 and restores the full payload", async () => {
    const remoteManifest = JSON.stringify({
      version: "4.0",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
      dataHash: "deadbeef",
      images: {},
      videos: {},
      encrypted: false,
    });
    const remoteData = JSON.stringify({
      version: "4.0",
      exportedAt: "2026-06-02T00:00:00.000Z",
      prompts: [{ id: "prompt-2", title: "Office pull" }],
      folders: [],
      versions: [],
      rules: [{ id: "global:agents", content: "# Pulled" }],
      skills: [{ id: "skill-1", name: "writer" }],
      skillVersions: [{ id: "skill-version-1", skillId: "skill-1", version: 1 }],
      skillFiles: {
        "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
      },
    });
    vi.mocked(window.electron?.s3?.download).mockImplementation(
      async (key: string) => {
        if (key.endsWith("/manifest.json")) {
          return { success: true, data: remoteManifest };
        }
        if (key.endsWith("/data.json")) {
          return { success: true, data: remoteData };
        }
        return { success: false, notFound: true };
      },
    );

    const result = await downloadFromS3(config, { incrementalSync: true });

    expect(window.electron?.s3?.download).toHaveBeenCalledWith(
      "team/prompthub-backup/manifest.json",
      mainConfig,
    );
    expect(window.electron?.s3?.download).toHaveBeenCalledWith(
      "team/prompthub-backup/data.json",
      mainConfig,
    );
    expect(restoreFromBackupMock).toHaveBeenCalledWith({
      version: 4,
      exportedAt: "2026-06-02T00:00:00.000Z",
      prompts: [{ id: "prompt-2", title: "Office pull" }],
      folders: [],
      versions: [],
      rules: [{ id: "global:agents", content: "# Pulled" }],
      skills: [{ id: "skill-1", name: "writer" }],
      skillVersions: [
        { id: "skill-version-1", skillId: "skill-1", version: 1 },
      ],
      skillFiles: {
        "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.localChanged).toBe(true);
  });
});
