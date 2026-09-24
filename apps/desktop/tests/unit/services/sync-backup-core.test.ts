import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autoSyncBackup,
  computeHash,
  downloadSyncBackup,
  getRemoteSyncBackupTimestamp,
  incrementalUploadSyncBackup,
  uploadSyncBackup,
  type RemoteDownloadResult,
  type RemoteStatResult,
  type RemoteSyncAdapter,
} from "../../../src/renderer/services/sync-backup-core";
import { installWindowMocks } from "../../helpers/window";

const exportDatabaseMock = vi.fn();
const restoreFromBackupMock = vi.fn();
const getAllPromptsMock = vi.fn();
const getAllFoldersMock = vi.fn();
const getSettingsStateSnapshotMock = vi.fn();
const restoreAiConfigSnapshotMock = vi.fn();
const restoreSettingsStateSnapshotMock = vi.fn();

vi.mock("../../../src/renderer/services/database", () => ({
  getAllPrompts: () => getAllPromptsMock(),
  getAllFolders: () => getAllFoldersMock(),
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  exportDatabase: (...args: unknown[]) => exportDatabaseMock(...args),
  restoreFromBackup: (...args: unknown[]) => restoreFromBackupMock(...args),
}));

vi.mock("../../../src/renderer/services/settings-snapshot", () => ({
  getCanonicalSettingsStateSnapshot: (...args: unknown[]) =>
    getSettingsStateSnapshotMock(...args),
  restoreAiConfigSnapshot: (...args: unknown[]) =>
    restoreAiConfigSnapshotMock(...args),
  restoreSettingsStateSnapshot: (...args: unknown[]) =>
    restoreSettingsStateSnapshotMock(...args),
  SENSITIVE_SETTINGS_FIELDS: ["aiApiKey", "s3AccessKeyId"],
}));

function createAdapter(overrides?: {
  downloadText?: (path: string) => Promise<RemoteDownloadResult>;
  uploadText?: (
    path: string,
    content: string,
  ) => Promise<{ success: boolean; error?: string }>;
  stat?: (path: string) => Promise<RemoteStatResult>;
  prepareLegacyUpload?: () => Promise<void>;
  prepareIncrementalUpload?: (includeMedia: boolean) => Promise<void>;
}): RemoteSyncAdapter {
  return {
    paths: {
      legacy: "remote/legacy.json",
      manifest: "remote/manifest.json",
      data: "remote/data.json",
      image: (fileName: string) => `remote/images/${fileName}`,
      video: (fileName: string) => `remote/videos/${fileName}`,
    },
    prepareLegacyUpload:
      overrides?.prepareLegacyUpload || vi.fn().mockResolvedValue(undefined),
    prepareIncrementalUpload:
      overrides?.prepareIncrementalUpload ||
      vi.fn().mockResolvedValue(undefined),
    uploadText:
      overrides?.uploadText || vi.fn().mockResolvedValue({ success: true }),
    downloadText:
      overrides?.downloadText ||
      vi.fn().mockResolvedValue({ success: false, notFound: true }),
    stat: overrides?.stat,
  };
}

function createLegacyBackup(exportedAt: string) {
  return JSON.stringify({
    version: "3.1",
    exportedAt,
    prompts: [],
    folders: [],
    versions: [],
  });
}

function createManifest(updatedAt: string, dataHash = "deadbeef") {
  return JSON.stringify({
    version: "4.0",
    createdAt: updatedAt,
    updatedAt,
    dataHash,
    images: {},
    videos: {},
    encrypted: false,
  });
}

function createIncrementalData(exportedAt: string) {
  return JSON.stringify({
    version: "4.0",
    exportedAt,
    prompts: [],
    folders: [],
    versions: [],
  });
}

describe("sync-backup-core", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    installWindowMocks();
    getAllPromptsMock.mockResolvedValue([]);
    getAllFoldersMock.mockResolvedValue([]);
    getSettingsStateSnapshotMock.mockReturnValue(undefined);
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      prompts: [],
      folders: [],
      versions: [],
    });
    restoreFromBackupMock.mockResolvedValue(undefined);
    localStorage.clear();
  });

  describe("getRemoteSyncBackupTimestamp", () => {
    it("prefers incremental manifest timestamps before legacy backup timestamps", async () => {
      const stat = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return {
            exists: true,
            lastModified: "2026-01-03T00:00:00.000Z",
          };
        }

        return {
          exists: true,
          lastModified: "2026-01-01T00:00:00.000Z",
        };
      });
      const adapter = createAdapter({ stat });

      const result = await getRemoteSyncBackupTimestamp(adapter);

      expect(stat).toHaveBeenCalledTimes(1);
      expect(stat).toHaveBeenCalledWith("remote/manifest.json");
      expect(result).toEqual({
        exists: true,
        lastModified: "2026-01-03T00:00:00.000Z",
      });
    });

    it("falls back to parsing the legacy backup when manifest is unavailable", async () => {
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return { success: false, notFound: true };
        }

        return {
          success: true,
          data: createLegacyBackup("2026-01-04T00:00:00.000Z"),
        };
      });
      const adapter = createAdapter({ downloadText, stat: undefined });

      const result = await getRemoteSyncBackupTimestamp(adapter);

      expect(downloadText).toHaveBeenNthCalledWith(1, "remote/manifest.json");
      expect(downloadText).toHaveBeenNthCalledWith(2, "remote/legacy.json");
      expect(result).toEqual({
        exists: true,
        lastModified: "2026-01-04T00:00:00.000Z",
      });
    });
  });

  describe("downloadSyncBackup", () => {
    it("falls back to the legacy backup payload when no incremental manifest exists", async () => {
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return { success: false, notFound: true };
        }

        return {
          success: true,
          data: createLegacyBackup("2026-01-05T00:00:00.000Z"),
        };
      });
      const adapter = createAdapter({ downloadText, stat: undefined });

      const result = await downloadSyncBackup(adapter);

      expect(downloadText).toHaveBeenCalledWith("remote/manifest.json");
      expect(downloadText).toHaveBeenCalledWith("remote/legacy.json");
      expect(restoreFromBackupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          exportedAt: "2026-01-05T00:00:00.000Z",
          prompts: [],
          folders: [],
          versions: [],
        }),
      );
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(true);
    });

    it("creates a safety snapshot immediately before legacy restore", async () => {
      const beforeRestore = vi.fn().mockResolvedValue(undefined);
      const adapter = createAdapter({
        stat: undefined,
        downloadText: vi.fn(async (path: string) =>
          path.includes("manifest")
            ? { success: false, notFound: true }
            : {
                success: true,
                data: createLegacyBackup("2026-01-05T00:00:00.000Z"),
              },
        ),
      });

      const result = await downloadSyncBackup(adapter, { beforeRestore });

      expect(result.success).toBe(true);
      expect(beforeRestore).toHaveBeenCalledTimes(1);
      expect(beforeRestore.mock.invocationCallOrder[0]).toBeLessThan(
        restoreFromBackupMock.mock.invocationCallOrder[0],
      );
    });

    it("rolls back the safety snapshot when restore fails after mutation starts", async () => {
      const beforeRestore = vi.fn().mockResolvedValue(undefined);
      const rollbackRestore = vi.fn().mockResolvedValue(undefined);
      restoreFromBackupMock.mockRejectedValueOnce(new Error("disk full"));
      const adapter = createAdapter({
        stat: undefined,
        downloadText: vi.fn(async (path: string) =>
          path.includes("manifest")
            ? { success: false, notFound: true }
            : {
                success: true,
                data: createLegacyBackup("2026-01-05T00:00:00.000Z"),
              },
        ),
      });

      const result = await downloadSyncBackup(adapter, {
        beforeRestore,
        rollbackRestore,
      });

      expect(result.success).toBe(false);
      expect(result.localChanged).toBe(false);
      expect(rollbackRestore).toHaveBeenCalledTimes(1);
      expect(result.message).toContain("disk full");
    });

    it("does not create a safety snapshot before payload validation succeeds", async () => {
      const beforeRestore = vi.fn().mockResolvedValue(undefined);
      const expectedData = createIncrementalData("2026-01-05T00:00:00.000Z");
      const result = await downloadSyncBackup(
        createAdapter({
          stat: undefined,
          downloadText: vi.fn(async (path: string) =>
            path.includes("manifest")
              ? {
                  success: true,
                  data: createManifest(
                    "2026-01-05T00:00:00.000Z",
                    await computeHash(`${expectedData}tampered`),
                  ),
                }
              : { success: true, data: expectedData },
          ),
        }),
        { beforeRestore },
      );

      expect(result.success).toBe(false);
      expect(beforeRestore).not.toHaveBeenCalled();
    });

    it("reports a decryption failure when encrypted incremental data cannot be decoded", async () => {
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return {
            success: true,
            data: JSON.stringify({
              version: "4.0",
              createdAt: "2026-01-05T00:00:00.000Z",
              updatedAt: "2026-01-05T00:00:00.000Z",
              dataHash: await computeHash(
                JSON.stringify({ data: "not-valid-base64" }),
              ),
              images: {},
              videos: {},
              encrypted: true,
            }),
          };
        }

        return {
          success: true,
          data: JSON.stringify({ data: "not-valid-base64" }),
        };
      });
      const adapter = createAdapter({ downloadText, stat: undefined });

      const result = await downloadSyncBackup(adapter, {
        encryptionPassword: "secret",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Decryption failed");
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
    });

    it("blocks restore when incremental data does not match the manifest hash", async () => {
      const expectedData = createIncrementalData("2026-01-05T00:00:00.000Z");
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return {
            success: true,
            data: createManifest(
              "2026-01-05T00:00:00.000Z",
              await computeHash(expectedData + "tampered"),
            ),
          };
        }

        return { success: true, data: expectedData };
      });
      const result = await downloadSyncBackup(
        createAdapter({ downloadText, stat: undefined }),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("data hash");
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
    });

    it("blocks restore before database writes when media does not match the manifest", async () => {
      const data = createIncrementalData("2026-01-05T00:00:00.000Z");
      const manifest = JSON.stringify({
        version: "4.0",
        createdAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
        dataHash: await computeHash(data),
        images: {
          "cover.png": {
            hash: "incorrect-hash",
            size: "image-base64".length,
            uploadedAt: "2026-01-05T00:00:00.000Z",
          },
        },
        videos: {},
        encrypted: false,
      });
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return { success: true, data: manifest };
        }
        if (path.includes("data.json")) {
          return { success: true, data };
        }
        return { success: true, data: "image-base64" };
      });

      const result = await downloadSyncBackup(
        createAdapter({ downloadText, stat: undefined }),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("media hash");
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
      expect(window.electron.saveImageBase64).not.toHaveBeenCalled();
    });

    it("blocks restore when a manifest-listed media file is missing", async () => {
      const data = createIncrementalData("2026-01-05T00:00:00.000Z");
      const manifest = JSON.stringify({
        version: "4.0",
        createdAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
        dataHash: await computeHash(data),
        images: {
          "missing.png": {
            hash: await computeHash("image-base64"),
            size: "image-base64".length,
            uploadedAt: "2026-01-05T00:00:00.000Z",
          },
        },
        videos: {},
        encrypted: false,
      });
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return { success: true, data: manifest };
        }
        if (path.includes("data.json")) {
          return { success: true, data };
        }
        return { success: false, notFound: true };
      });

      const result = await downloadSyncBackup(
        createAdapter({ downloadText, stat: undefined }),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("Missing media image payload");
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
    });

    it("blocks restore when media size differs from the manifest", async () => {
      const data = createIncrementalData("2026-01-05T00:00:00.000Z");
      const media = "image-base64";
      const manifest = JSON.stringify({
        version: "4.0",
        createdAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
        dataHash: await computeHash(data),
        images: {
          "cover.png": {
            hash: await computeHash(media),
            size: media.length + 1,
            uploadedAt: "2026-01-05T00:00:00.000Z",
          },
        },
        videos: {},
        encrypted: false,
      });
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return { success: true, data: manifest };
        }
        if (path.includes("data.json")) {
          return { success: true, data };
        }
        return { success: true, data: media };
      });

      const result = await downloadSyncBackup(
        createAdapter({ downloadText, stat: undefined }),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("media size mismatch");
      expect(restoreFromBackupMock).not.toHaveBeenCalled();
    });
  });

  describe("incrementalUploadSyncBackup", () => {
    it("reports uploaded skill metadata, versions, and files", async () => {
      exportDatabaseMock.mockResolvedValue({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        skills: [{ id: "skill-1", name: "writer" }],
        skillVersions: [
          { id: "skill-version-1", skillId: "skill-1", version: 1 },
        ],
        skillFiles: {
          "skill-1": [
            { relativePath: "SKILL.md", content: "# Writer" },
            { relativePath: "references/example.md", content: "Example" },
          ],
        },
      });

      const legacyUpload = vi.fn().mockResolvedValue({ success: true });
      const legacyResult = await uploadSyncBackup(
        createAdapter({ uploadText: legacyUpload }),
        {
          incrementalSync: false,
        },
      );
      const incrementalUpload = vi.fn().mockResolvedValue({ success: true });
      const incrementalResult = await incrementalUploadSyncBackup(
        createAdapter({ uploadText: incrementalUpload }),
      );

      for (const result of [legacyResult, incrementalResult]) {
        expect(result.success).toBe(true);
        expect(result.message).toContain("1 skill");
        expect(result.message).toContain("1 skill version");
        expect(result.message).toContain("2 skill files");
        expect(result.details).toEqual(
          expect.objectContaining({
            skillsUploaded: 1,
            skillVersionsUploaded: 1,
            skillFilesUploaded: 2,
          }),
        );
      }

      const legacyPayload = JSON.parse(String(legacyUpload.mock.calls[0]?.[1]));
      const incrementalDataCall = incrementalUpload.mock.calls.find((call) =>
        String(call[0]).includes("data.json"),
      );
      const incrementalPayload = JSON.parse(String(incrementalDataCall?.[1]));
      for (const payload of [legacyPayload, incrementalPayload]) {
        expect(payload.skills).toHaveLength(1);
        expect(payload.skillVersions).toHaveLength(1);
        expect(payload.skillFiles["skill-1"]).toHaveLength(2);
      }
    });

    it("preserves prompt graph collections in legacy and incremental payloads", async () => {
      const graph = {
        promptRelations: [
          {
            id: "relation-1",
            sourcePromptId: "prompt-1",
            targetPromptId: "prompt-2",
            kind: "next_step",
            note: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        outputFormatItems: [
          {
            id: "output-1",
            sourcePromptId: "prompt-1",
            targetPromptId: null,
            sortOrder: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as const;
      exportDatabaseMock.mockResolvedValue({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
        ...graph,
      });

      const legacyUpload = vi.fn().mockResolvedValue({ success: true });
      await uploadSyncBackup(createAdapter({ uploadText: legacyUpload }), {
        incrementalSync: false,
      });
      expect(JSON.parse(String(legacyUpload.mock.calls[0]?.[1]))).toEqual(
        expect.objectContaining(graph),
      );

      const incrementalUpload = vi.fn().mockResolvedValue({ success: true });
      const downloadText = vi.fn().mockResolvedValue({
        success: false,
        notFound: true,
      });
      await uploadSyncBackup(
        createAdapter({ uploadText: incrementalUpload, downloadText }),
        { incrementalSync: true },
      );
      const dataCall = incrementalUpload.mock.calls.find((call) =>
        String(call[0]).includes("data.json"),
      );
      expect(JSON.parse(String(dataCall?.[1]))).toEqual(
        expect.objectContaining(graph),
      );
    });

    it("returns a no-op result when data and media already match the remote manifest", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-06T00:00:00.000Z"));

      const imageBase64 = "image-base64";
      const videoBase64 = "video-base64";
      exportDatabaseMock.mockResolvedValue({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        prompts: [{ id: "prompt-1", videos: ["demo.mp4"] }],
        folders: [],
        versions: [],
        images: { "cover.png": imageBase64 },
      });
      window.electron.readVideoBase64.mockResolvedValue(videoBase64);

      const expectedDataString = JSON.stringify({
        version: "4.0",
        exportedAt: "2026-01-06T00:00:00.000Z",
        prompts: [{ id: "prompt-1", videos: ["demo.mp4"] }],
        folders: [],
        versions: [],
        aiConfig: undefined,
        settings: undefined,
        settingsUpdatedAt: undefined,
        rules: undefined,
        skills: undefined,
        skillVersions: undefined,
        skillFiles: undefined,
      });

      const manifest = JSON.stringify({
        version: "4.0",
        createdAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z",
        dataHash: await computeHash(expectedDataString),
        images: {
          "cover.png": {
            hash: await computeHash(imageBase64),
            size: imageBase64.length,
            uploadedAt: "2026-01-06T00:00:00.000Z",
          },
        },
        videos: {
          "demo.mp4": {
            hash: await computeHash(videoBase64),
            size: videoBase64.length,
            uploadedAt: "2026-01-06T00:00:00.000Z",
          },
        },
        encrypted: false,
      });

      const prepareIncrementalUpload = vi.fn().mockResolvedValue(undefined);
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return { success: true, data: manifest };
        }

        if (path.includes("data.json")) {
          return { success: true, data: expectedDataString };
        }

        return { success: false, notFound: true };
      });
      const uploadText = vi.fn().mockResolvedValue({ success: true });
      const adapter = createAdapter({
        prepareIncrementalUpload,
        downloadText,
        uploadText,
      });

      const result = await incrementalUploadSyncBackup(adapter);

      expect(prepareIncrementalUpload).toHaveBeenCalledWith(true);
      expect(uploadText).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
      expect(result.message).toContain("Already up to date");
      expect(result.details?.skipped).toBe(3);
    });
  });

  describe("autoSyncBackup", () => {
    it("uploads local data when the remote backup does not exist", async () => {
      const uploadText = vi.fn().mockResolvedValue({ success: true });
      const stat = vi.fn().mockResolvedValue({ exists: false });
      const adapter = createAdapter({ uploadText, stat });

      const result = await autoSyncBackup(adapter, { incrementalSync: false });

      expect(uploadText).toHaveBeenCalledTimes(1);
      expect(uploadText).toHaveBeenCalledWith(
        "remote/legacy.json",
        expect.any(String),
      );
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
    });

    it("downloads remote data when the manifest timestamp is newer than local changes", async () => {
      getAllPromptsMock.mockResolvedValue([
        {
          id: "prompt-1",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const stat = vi.fn().mockResolvedValue({
        exists: true,
        lastModified: "2026-01-03T00:00:00.000Z",
      });
      const downloadText = vi.fn(async (path: string) => {
        if (path.includes("manifest")) {
          return {
            success: true,
            data: createManifest(
              "2026-01-03T00:00:00.000Z",
              await computeHash(
                createIncrementalData("2026-01-03T00:00:00.000Z"),
              ),
            ),
          };
        }

        return {
          success: true,
          data: createIncrementalData("2026-01-03T00:00:00.000Z"),
        };
      });
      const adapter = createAdapter({ stat, downloadText });

      const result = await autoSyncBackup(adapter);

      expect(downloadText).toHaveBeenCalledWith("remote/manifest.json");
      expect(downloadText).toHaveBeenCalledWith("remote/data.json");
      expect(restoreFromBackupMock).toHaveBeenCalledWith(
        expect.objectContaining({
          exportedAt: "2026-01-03T00:00:00.000Z",
        }),
      );
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(true);
    });

    it("treats settingsUpdatedAt as local activity when deciding to upload", async () => {
      getSettingsStateSnapshotMock.mockReturnValue({
        settingsUpdatedAt: "2026-01-04T00:00:00.000Z",
      });

      const stat = vi.fn().mockResolvedValue({
        exists: true,
        lastModified: "2026-01-03T00:00:00.000Z",
      });
      const uploadText = vi.fn().mockResolvedValue({ success: true });
      const adapter = createAdapter({
        stat,
        uploadText,
      });

      const result = await autoSyncBackup(adapter, { incrementalSync: false });

      expect(uploadText).toHaveBeenCalledTimes(1);
      expect(uploadText).toHaveBeenCalledWith(
        "remote/legacy.json",
        expect.any(String),
      );
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
    });

    it("returns a no-op result when local and remote timestamps are equal", async () => {
      getAllPromptsMock.mockResolvedValue([
        {
          id: "prompt-1",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      ]);

      const stat = vi.fn().mockResolvedValue({
        exists: true,
        lastModified: "2026-01-03T00:00:00.000Z",
      });
      const downloadText = vi.fn();
      const uploadText = vi.fn();
      const adapter = createAdapter({ stat, downloadText, uploadText });

      const result = await autoSyncBackup(adapter);

      expect(downloadText).not.toHaveBeenCalled();
      expect(uploadText).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
      expect(result.message).toContain("Already up to date");
    });

    it("uploads when non-prompt snapshot records are newer than the remote", async () => {
      exportDatabaseMock.mockResolvedValue({
        version: 1,
        exportedAt: "2026-01-06T00:00:00.000Z",
        prompts: [
          {
            id: "prompt-1",
            updatedAt: "2026-01-01T00:00:00.000Z",
            images: ["cover.png"],
            videos: ["demo.mp4"],
          },
        ],
        folders: [],
        versions: [{ createdAt: "2026-01-02T00:00:00.000Z" }],
        promptRelations: [{ updatedAt: "2026-01-03T00:00:00.000Z" }],
        outputFormatItems: [{ updatedAt: "2026-01-04T00:00:00.000Z" }],
        rules: [
          {
            versions: [{ savedAt: "2026-01-05T00:00:00.000Z" }],
          },
        ],
        skills: [{ updated_at: Date.parse("2026-01-06T00:00:00.000Z") }],
        skillVersions: [{ createdAt: "2026-01-06T00:00:00.000Z" }],
        mcpLibrary: { updatedAt: "2026-01-07T00:00:00.000Z" },
        pluginLibrary: { updatedAt: "2026-01-08T00:00:00.000Z" },
        settingsUpdatedAt: "2026-01-09T00:00:00.000Z",
      });

      const stat = vi.fn().mockResolvedValue({
        exists: true,
        lastModified: "2026-01-08T00:00:00.000Z",
      });
      const uploadText = vi.fn().mockResolvedValue({ success: true });
      const result = await autoSyncBackup(createAdapter({ stat, uploadText }), {
        incrementalSync: false,
      });

      expect(uploadText).toHaveBeenCalledWith(
        "remote/legacy.json",
        expect.any(String),
      );
      expect(result.success).toBe(true);
      expect(result.localChanged).toBe(false);
    });

    it("fails instead of treating an unreadable freshness snapshot as unchanged", async () => {
      exportDatabaseMock.mockRejectedValue(new Error("snapshot read failed"));
      const stat = vi.fn().mockResolvedValue({
        exists: true,
        lastModified: "2026-01-08T00:00:00.000Z",
      });

      const result = await autoSyncBackup(createAdapter({ stat }));

      expect(result.success).toBe(false);
      expect(result.message).toContain("snapshot read failed");
    });
  });
});
