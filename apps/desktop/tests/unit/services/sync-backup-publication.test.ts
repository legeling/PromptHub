import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  downloadSyncBackup,
  incrementalUploadSyncBackup,
  type RemoteDownloadResult,
  type RemoteSyncAdapter,
} from "../../../src/renderer/services/sync-backup-core";
import { installWindowMocks } from "../../helpers/window";

const exportDatabaseMock = vi.fn();
const restoreFromBackupMock = vi.fn();
const getAllPromptsMock = vi.fn();
const getAllFoldersMock = vi.fn();

vi.mock("../../../src/renderer/services/database", () => ({
  getAllPrompts: () => getAllPromptsMock(),
  getAllFolders: () => getAllFoldersMock(),
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  exportDatabase: (...args: unknown[]) => exportDatabaseMock(...args),
  restoreFromBackup: (...args: unknown[]) => restoreFromBackupMock(...args),
}));

vi.mock("../../../src/renderer/services/settings-snapshot", () => ({
  getCanonicalSettingsStateSnapshot: vi.fn().mockReturnValue(undefined),
  restoreAiConfigSnapshot: vi.fn(),
  restoreSettingsStateSnapshot: vi.fn(),
  SENSITIVE_SETTINGS_FIELDS: [],
}));

interface RemoteFixture {
  adapter: RemoteSyncAdapter;
  files: Map<string, string>;
  uploads: Array<{ path: string; content: string }>;
  failManifestUpload: boolean;
  failManifestRead?: string;
}

interface StoredManifest {
  version?: string;
  encrypted?: boolean;
  semanticHash?: string;
  data?: { path: string };
  images?: Record<string, { path: string }>;
}

function createRemoteFixture(): RemoteFixture {
  const files = new Map<string, string>();
  const uploads: Array<{ path: string; content: string }> = [];
  const fixture: RemoteFixture = {
    files,
    uploads,
    failManifestUpload: false,
    adapter: undefined as unknown as RemoteSyncAdapter,
  };

  const downloadText = vi.fn(
    async (path: string): Promise<RemoteDownloadResult> => {
      if (path === "remote/manifest.json" && fixture.failManifestRead) {
        return { success: false, error: fixture.failManifestRead };
      }

      const content = files.get(path);
      return content === undefined
        ? { success: false, notFound: true }
        : { success: true, data: content };
    },
  );
  const uploadText = vi.fn(async (path: string, content: string) => {
    uploads.push({ path, content });
    if (path === "remote/manifest.json" && fixture.failManifestUpload) {
      return { success: false, error: "manifest publication interrupted" };
    }

    files.set(path, content);
    return { success: true };
  });

  fixture.adapter = {
    paths: {
      legacy: "remote/legacy.json",
      manifest: "remote/manifest.json",
      data: "remote/data.json",
      image: (fileName: string) => `remote/images/${fileName}.base64`,
      video: (fileName: string) => `remote/videos/${fileName}.base64`,
    },
    prepareIncrementalUpload: vi.fn().mockResolvedValue(undefined),
    uploadText,
    downloadText,
  };

  return fixture;
}

function createBackup(
  exportedAt: string,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    version: 1,
    exportedAt,
    prompts: [{ id: "prompt-1", title: "Draft", userPrompt: "Write" }],
    folders: [],
    versions: [{ id: "version-1", promptId: "prompt-1", version: 1 }],
    settings: { state: { theme: "dark" } },
    skills: [{ id: "skill-1", name: "writer" }],
    skillVersions: [{ id: "skill-version-1", skillId: "skill-1", version: 1 }],
    skillFiles: {
      "skill-1": [{ relativePath: "SKILL.md", content: "# Writer" }],
    },
    ...overrides,
  };
}

function getStoredManifest(fixture: RemoteFixture): StoredManifest {
  return JSON.parse(fixture.files.get("remote/manifest.json") || "{}");
}

function setStoredManifest(
  fixture: RemoteFixture,
  manifest: Record<string, unknown>,
) {
  fixture.files.set("remote/manifest.json", JSON.stringify(manifest));
}

describe("sync backup immutable publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    installWindowMocks();
    getAllPromptsMock.mockResolvedValue([]);
    getAllFoldersMock.mockResolvedValue([]);
    restoreFromBackupMock.mockResolvedValue(undefined);
    exportDatabaseMock.mockResolvedValue(
      createBackup("2026-01-01T00:00:00.000Z"),
    );
  });

  it("publishes content addressed objects before the manifest and preserves the previous snapshot when publication fails", async () => {
    const fixture = createRemoteFixture();
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z", {
        images: { "cover.png": "image-v1" },
      }),
    );

    const firstResult = await incrementalUploadSyncBackup(fixture.adapter);
    expect(firstResult.success, firstResult.message).toBe(true);
    expect(
      fixture.uploads.findIndex(
        (upload) => upload.path === "remote/manifest.json",
      ),
    ).toBe(fixture.uploads.length - 1);

    const previousManifest = getStoredManifest(fixture);
    const previousDataPath = previousManifest.data?.path as string;
    expect(previousDataPath).not.toBe("remote/data.json");
    expect(previousManifest.version).toBe("5.0");
    expect(previousManifest.images?.["cover.png"]?.path).not.toBe(
      "remote/images/cover.png.base64",
    );

    fixture.uploads.length = 0;
    fixture.failManifestUpload = true;
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-02T00:00:00.000Z", {
        prompts: [{ id: "prompt-2", title: "New", userPrompt: "New" }],
        images: { "cover.png": "image-v2" },
      }),
    );

    const failedResult = await incrementalUploadSyncBackup(fixture.adapter);
    expect(failedResult.success).toBe(false);
    expect(getStoredManifest(fixture).data?.path).toBe(previousDataPath);

    restoreFromBackupMock.mockClear();
    window.electron?.saveImageBase64?.mockResolvedValue(true);
    const restoreResult = await downloadSyncBackup(fixture.adapter);
    expect(restoreResult.success).toBe(true);
    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [{ id: "prompt-1", title: "Draft", userPrompt: "Write" }],
      }),
    );
    expect(fixture.files.has(previousDataPath)).toBe(true);
  });

  it("does not upload when only exportedAt changes", async () => {
    const fixture = createRemoteFixture();
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z"),
    );
    await incrementalUploadSyncBackup(fixture.adapter);

    fixture.uploads.length = 0;
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-02T00:00:00.000Z"),
    );
    const result = await incrementalUploadSyncBackup(fixture.adapter);

    expect(result.success, result.message).toBe(true);
    expect(result.message).toContain("Already up to date");
    expect(fixture.uploads).toHaveLength(0);
  });

  it("publishes when durable metadata changes even if the export time is unchanged", async () => {
    const fixture = createRemoteFixture();
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z"),
    );
    await incrementalUploadSyncBackup(fixture.adapter);

    fixture.uploads.length = 0;
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z", {
        settings: { state: { theme: "light" } },
        versions: [{ id: "version-2", promptId: "prompt-1", version: 2 }],
        pluginPackages: [{ packageId: "package-2", version: "2.0.0" }],
      }),
    );
    const result = await incrementalUploadSyncBackup(fixture.adapter);

    expect(result.success, result.message).toBe(true);
    expect(fixture.uploads.length).toBeGreaterThan(0);
    expect(getStoredManifest(fixture).semanticHash).toBeDefined();
  });

  it("keeps encrypted semantic equality stable without publishing a new random ciphertext", async () => {
    const fixture = createRemoteFixture();
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z"),
    );
    await incrementalUploadSyncBackup(fixture.adapter, {
      encryptionPassword: "test-password",
    });

    expect(
      getStoredManifest(fixture).encrypted,
      "encrypted manifest was not published",
    ).toBe(true);
    expect(getStoredManifest(fixture).semanticHash).toBeUndefined();
    fixture.uploads.length = 0;
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-02T00:00:00.000Z"),
    );
    const result = await incrementalUploadSyncBackup(fixture.adapter, {
      encryptionPassword: "test-password",
    });

    expect(result.success, result.message).toBe(true);
    expect(result.message).toContain("Already up to date");
    expect(fixture.uploads).toHaveLength(0);
  });

  it("publishes a new media object when the media content changes", async () => {
    const fixture = createRemoteFixture();
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z", {
        images: { "cover.png": "image-v1" },
      }),
    );
    await incrementalUploadSyncBackup(fixture.adapter);
    const previousPath = getStoredManifest(fixture).images?.["cover.png"]
      ?.path as string;

    fixture.uploads.length = 0;
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-02T00:00:00.000Z", {
        images: { "cover.png": "image-v2" },
      }),
    );
    const result = await incrementalUploadSyncBackup(fixture.adapter);
    const nextManifest = getStoredManifest(fixture);

    expect(result.success).toBe(true);
    const nextPath = nextManifest.images?.["cover.png"]?.path as string;
    expect(nextPath).not.toBe(previousPath);
    expect(fixture.uploads.some((upload) => upload.path === nextPath)).toBe(
      true,
    );
    expect(fixture.files.has(previousPath)).toBe(true);
  });

  it("rejects local media path injection before uploading any object", async () => {
    const fixture = createRemoteFixture();
    exportDatabaseMock.mockResolvedValueOnce(
      createBackup("2026-01-01T00:00:00.000Z", {
        images: { "../escape.png": "image" },
      }),
    );

    const result = await incrementalUploadSyncBackup(fixture.adapter);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unsafe");
    expect(fixture.uploads).toHaveLength(0);
  });

  it("stops on a non-404 manifest read failure instead of treating it as an empty backup", async () => {
    const fixture = createRemoteFixture();
    fixture.failManifestRead = "503 upstream unavailable";

    const uploadResult = await incrementalUploadSyncBackup(fixture.adapter);
    expect(uploadResult.success).toBe(false);
    expect(uploadResult.message).toContain("503 upstream unavailable");
    expect(fixture.uploads).toHaveLength(0);

    const downloadResult = await downloadSyncBackup(fixture.adapter);
    expect(downloadResult.success).toBe(false);
    expect(downloadResult.message).toContain("503 upstream unavailable");
  });

  it("rejects future manifests, unsafe references, missing data, and data hash mismatches", async () => {
    const fixture = createRemoteFixture();
    const dataHash = "a".repeat(64);
    setStoredManifest(fixture, {
      version: "99.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      data: {
        path: `remote/data.json.${dataHash}`,
        hash: dataHash,
        size: 1,
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      semanticHash: dataHash,
      images: {},
      videos: {},
      encrypted: false,
    });

    const futureResult = await downloadSyncBackup(fixture.adapter);
    expect(futureResult.success).toBe(false);
    expect(futureResult.message).toContain("Unsupported manifest version");

    setStoredManifest(fixture, {
      version: "5.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      data: {
        path: "https://attacker.invalid/data",
        hash: dataHash,
        size: 1,
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      semanticHash: dataHash,
      images: {},
      videos: {},
      encrypted: false,
    });
    const unsafePathResult = await downloadSyncBackup(fixture.adapter);
    expect(unsafePathResult.success).toBe(false);
    expect(unsafePathResult.message).toContain("Unsafe");

    setStoredManifest(fixture, {
      version: "5.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      data: {
        path: `remote/data.json.${dataHash}`,
        hash: dataHash,
        size: 1,
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
      semanticHash: dataHash,
      images: {},
      videos: {},
      encrypted: false,
    });
    const missingResult = await downloadSyncBackup(fixture.adapter);
    expect(missingResult.success).toBe(false);
    expect(missingResult.message).toContain("data file");

    fixture.files.set(`remote/data.json.${dataHash}`, "tampered");
    const mismatchResult = await downloadSyncBackup(fixture.adapter);
    expect(mismatchResult.success).toBe(false);
    expect(mismatchResult.message).toContain("data hash");
    expect(restoreFromBackupMock).not.toHaveBeenCalled();
  });
});
