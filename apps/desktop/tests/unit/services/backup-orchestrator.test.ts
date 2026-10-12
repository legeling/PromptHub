import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/database-backup", () => ({
  downloadBackup: vi.fn(),
  downloadSelectiveExport: vi.fn(),
}));

vi.mock("../../../src/renderer/services/backup-status", () => ({
  recordManualBackup: vi.fn(),
}));

vi.mock("../../../src/renderer/services/upgrade-backup", () => ({
  createUpgradeBackup: vi.fn(),
  restoreUpgradeBackup: vi.fn(),
}));

vi.mock("../../../src/renderer/services/webdav", () => ({
  autoSync: vi.fn(),
  downloadFromWebDAV: vi.fn(),
  testConnection: vi.fn(),
  uploadToWebDAV: vi.fn(),
}));

vi.mock("../../../src/renderer/services/self-hosted-sync", () => {
  class SelfHostedBackupCompatibilityError extends Error {}

  return {
    createSelfHostedRemoteBackup: vi.fn(),
    pullFromSelfHostedWeb: vi.fn(),
    pushToSelfHostedWeb: vi.fn(),
    restoreLatestSelfHostedRemoteBackup: vi.fn(),
    SelfHostedBackupCompatibilityError,
    testSelfHostedBackupConnection: vi.fn(),
    testSelfHostedConnection: vi.fn(),
  };
});

vi.mock("../../../src/renderer/services/s3-sync", () => ({
  autoSync: vi.fn(),
  downloadFromS3: vi.fn(),
  testConnection: vi.fn(),
  uploadToS3: vi.fn(),
}));

import {
  runFullExportBackup,
  runS3AutoSync,
  runPreUpgradeBackup,
  runSelfHostedAutoSync,
  runSelfHostedPull,
  runWebDAVAutoSync,
} from "../../../src/renderer/services/backup-orchestrator";

import {
  downloadBackup,
  downloadSelectiveExport,
} from "../../../src/renderer/services/database-backup";
import { recordManualBackup } from "../../../src/renderer/services/backup-status";
import { createUpgradeBackup } from "../../../src/renderer/services/upgrade-backup";
import { autoSync } from "../../../src/renderer/services/webdav";
import {
  createSelfHostedRemoteBackup,
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
  restoreLatestSelfHostedRemoteBackup,
  SelfHostedBackupCompatibilityError,
} from "../../../src/renderer/services/self-hosted-sync";
import { autoSync as autoSyncS3 } from "../../../src/renderer/services/s3-sync";

describe("backup-orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs full backup as a full selective ZIP export with snapshot and manual backup record", async () => {
    vi.mocked(recordManualBackup).mockResolvedValue({
      lastManualBackupAt: "2026-05-10T00:00:00.000Z",
      lastManualBackupVersion: "0.5.5",
    });

    const result = await runFullExportBackup({
      currentVersion: "0.5.5",
      recordManualBackup: true,
    });

    expect(createUpgradeBackup).toHaveBeenCalledWith({ fromVersion: "0.5.5" });
    expect(downloadSelectiveExport).toHaveBeenCalledWith({
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: true,
      aiConfig: true,
      settings: true,
      rules: true,
      skills: true,
      mcp: true,
      plugins: true,
      agents: true,
    });
    expect(downloadBackup).not.toHaveBeenCalled();
    expect(recordManualBackup).toHaveBeenCalledWith("0.5.5");
    expect(result?.lastManualBackupVersion).toBe("0.5.5");
  });

  it("runs full backup without currentVersion by skipping snapshot but still exporting ZIP", async () => {
    const result = await runFullExportBackup({
      recordManualBackup: false,
    });

    expect(createUpgradeBackup).toHaveBeenCalledWith(undefined);
    expect(downloadSelectiveExport).toHaveBeenCalledTimes(1);
    expect(recordManualBackup).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("runs full backup without manual record when disabled", async () => {
    const result = await runFullExportBackup({
      currentVersion: "0.5.5",
      recordManualBackup: false,
    });

    expect(createUpgradeBackup).toHaveBeenCalledWith({ fromVersion: "0.5.5" });
    expect(downloadSelectiveExport).toHaveBeenCalledTimes(1);
    expect(downloadBackup).not.toHaveBeenCalled();
    expect(recordManualBackup).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("runs pre-upgrade backup with legacy JSON backup and status update", async () => {
    vi.mocked(recordManualBackup).mockResolvedValue({
      lastManualBackupAt: "2026-05-10T00:00:00.000Z",
      lastManualBackupVersion: "0.5.5",
    });

    const status = await runPreUpgradeBackup("0.5.5");

    expect(createUpgradeBackup).toHaveBeenCalledWith({ fromVersion: "0.5.5" });
    expect(downloadSelectiveExport).toHaveBeenCalledWith({
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: true,
      aiConfig: true,
      settings: true,
      rules: true,
      skills: true,
      mcp: true,
      plugins: true,
      agents: true,
    });
    expect(downloadBackup).not.toHaveBeenCalled();
    expect(recordManualBackup).toHaveBeenCalledWith("0.5.5");
    expect(status.lastManualBackupVersion).toBe("0.5.5");
  });

  it("delegates webdav auto sync call", async () => {
    vi.mocked(autoSync).mockResolvedValue({
      success: true,
      message: "ok",
      localChanged: false,
    });

    const result = await runWebDAVAutoSync({
      config: {
        url: "https://dav.example.com",
        username: "u",
        password: "p",
      },
      options: {
        incrementalSync: true,
      },
    });

    expect(autoSync).toHaveBeenCalledTimes(1);
    expect(autoSync).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        beforeRestore: expect.any(Function),
        rollbackRestore: expect.any(Function),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("ok");
  });

  it("delegates s3 auto sync call", async () => {
    vi.mocked(autoSyncS3).mockResolvedValue({
      success: true,
      message: "ok",
      localChanged: false,
    });

    const result = await runS3AutoSync({
      config: {
        endpoint: "https://s3.example.com",
        region: "us-east-1",
        bucket: "prompthub-backups",
        accessKeyId: "access",
        secretAccessKey: "secret",
      },
      options: {
        incrementalSync: true,
      },
    });

    expect(autoSyncS3).toHaveBeenCalledTimes(1);
    expect(autoSyncS3).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        beforeRestore: expect.any(Function),
        rollbackRestore: expect.any(Function),
      }),
    );
    expect(result.success).toBe(true);
    expect(result.message).toBe("ok");
  });

  it("uses immutable backup creation for self-hosted interval automation", async () => {
    vi.mocked(createSelfHostedRemoteBackup).mockResolvedValue({
      id: "backup-fixture",
      createdAt: "2026-10-04T00:00:00.000Z",
      clientVersion: "0.5.9",
      serverVersion: "0.5.9",
      prompts: 3,
      folders: 2,
      rules: 1,
      skills: 4,
      mcpServers: 0,
      plugins: 0,
    });

    const result = await runSelfHostedAutoSync("interval", {
      url: "https://example.com",
      username: "u",
      password: "p",
    });

    expect(createSelfHostedRemoteBackup).toHaveBeenCalledTimes(1);
    expect(pushToSelfHostedWeb).not.toHaveBeenCalled();
    expect(pullFromSelfHostedWeb).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.localChanged).toBe(false);
  });

  it("uses the same upload-only backup behavior on self-hosted startup", async () => {
    vi.mocked(createSelfHostedRemoteBackup).mockResolvedValue({
      id: "backup-fixture",
      createdAt: "2026-10-04T00:00:00.000Z",
      clientVersion: "0.5.9",
      serverVersion: "0.5.9",
      prompts: 5,
      folders: 2,
      rules: 1,
      skills: 4,
      mcpServers: 0,
      plugins: 0,
    });

    const result = await runSelfHostedAutoSync("startup", {
      url: "https://example.com",
      username: "u",
      password: "p",
    });

    expect(createSelfHostedRemoteBackup).toHaveBeenCalledWith({
      url: "https://example.com",
      username: "u",
      password: "p",
    });
    expect(pullFromSelfHostedWeb).not.toHaveBeenCalled();
    expect(pushToSelfHostedWeb).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.localChanged).toBe(false);
  });

  it("creates a local safety snapshot before restoring the latest remote backup", async () => {
    const restoreMutation = vi.fn();
    vi.mocked(createUpgradeBackup).mockResolvedValue({
      created: true,
      skipped: false,
      backupId: "safety-1",
    });
    vi.mocked(restoreLatestSelfHostedRemoteBackup).mockImplementation(
      async (_config, safety) => {
        await safety?.beforeRestore?.();
        restoreMutation();
        return {
          prompts: 1,
          folders: 1,
          rules: 1,
          skills: 1,
        };
      },
    );

    await runSelfHostedPull({
      config: {
        url: "https://example.com",
        username: "u",
        password: "p",
      },
    });

    expect(createUpgradeBackup).toHaveBeenCalledWith({ allowEmpty: true });
    expect(restoreLatestSelfHostedRemoteBackup).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(createUpgradeBackup).mock.invocationCallOrder[0],
    ).toBeLessThan(restoreMutation.mock.invocationCallOrder[0]);
  });

  it("does not begin remote restore when the local safety snapshot fails", async () => {
    vi.mocked(createUpgradeBackup).mockRejectedValue(
      new Error("local snapshot failed"),
    );
    vi.mocked(restoreLatestSelfHostedRemoteBackup).mockImplementation(
      async (_config, safety) => {
        await safety?.beforeRestore?.();
        throw new Error("restore should not start");
      },
    );

    await expect(
      runSelfHostedPull({
        config: {
          url: "https://example.com",
          username: "u",
          password: "p",
        },
      }),
    ).rejects.toThrow("local snapshot failed");
    expect(restoreLatestSelfHostedRemoteBackup).toHaveBeenCalledTimes(1);
  });

  it("reports an exact-version mismatch as a skipped automatic backup", async () => {
    vi.mocked(createSelfHostedRemoteBackup).mockRejectedValue(
      new SelfHostedBackupCompatibilityError("version mismatch"),
    );

    const result = await runSelfHostedAutoSync("interval", {
      url: "https://example.com",
      username: "u",
      password: "p",
    });

    expect(result).toEqual({
      success: false,
      skipped: true,
      localChanged: false,
      message: "version mismatch",
    });
  });

  it("returns failure result when self-hosted sync throws", async () => {
    vi.mocked(createSelfHostedRemoteBackup).mockRejectedValue(
      new Error("network error"),
    );

    const result = await runSelfHostedAutoSync("interval", {
      url: "https://example.com",
      username: "u",
      password: "p",
    });

    expect(result.success).toBe(false);
    expect(result.localChanged).toBe(false);
    expect(result.message).toContain("network error");
  });
});
