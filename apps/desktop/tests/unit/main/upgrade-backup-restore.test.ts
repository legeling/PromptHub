/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUpgradeDataSnapshot,
  getUpgradeBackupRoot,
  listUpgradeBackups,
  MAX_UPGRADE_BACKUP_SNAPSHOTS,
} from "../../../src/main/services/upgrade-backup";
import { restoreFromUpgradeBackupAsync } from "../../../src/main/services/upgrade-backup-restore";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("upgrade-backup-restore", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("upgrade-backup-restore-");
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("replaces current userData content while preserving the backups root", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "old-db");
    fs.writeFileSync(path.join(userDataPath, "shortcut-mode.json"), '{"mode":"old"}');
    fs.mkdirSync(path.join(userDataPath, "workspace"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "workspace", "prompt-1.md"), "old prompt");

    const snapshot = await createUpgradeDataSnapshot(userDataPath, {
      fromVersion: "0.5.3",
      toVersion: "0.5.4",
    });

    // Mutate current state after snapshot so restore has something to roll back.
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "new-db");
    fs.rmSync(path.join(userDataPath, "workspace"), { recursive: true, force: true });
    fs.mkdirSync(path.join(userDataPath, "images"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "images", "new.png"), "png");

    const result = await restoreFromUpgradeBackupAsync(
      userDataPath,
      snapshot.backupId,
    );

    expect(result.success).toBe(true);
    expect(result.needsRestart).toBe(true);
    expect(result.currentStateBackupPath).toBeTruthy();

    expect(fs.readFileSync(path.join(userDataPath, "data", "prompthub.db"), "utf8")).toBe(
      "old-db",
    );
    expect(
      fs.readFileSync(path.join(userDataPath, "workspace", "prompt-1.md"), "utf8"),
    ).toBe("old prompt");
    expect(fs.existsSync(path.join(userDataPath, "images"))).toBe(false);

    // The backups root must still exist because both the source snapshot and
    // the insurance backup live there.
    const backupRoot = getUpgradeBackupRoot(userDataPath);
    expect(fs.existsSync(backupRoot)).toBe(true);
    expect(result.currentStateBackupPath?.startsWith(backupRoot)).toBe(true);
  });

  it("returns an error for an unknown backup id", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });

    const result = await restoreFromUpgradeBackupAsync(
      userDataPath,
      "v0.5.3-unknown",
    );

    expect(result).toEqual({
      success: false,
      needsRestart: false,
      error: "Upgrade backup not found: v0.5.3-unknown",
    });
  });

  it("ignores runtime cache directories during restore", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "old-db");

    const snapshot = await createUpgradeDataSnapshot(userDataPath, {
      fromVersion: "0.5.3",
      toVersion: "0.5.4",
    });

    fs.mkdirSync(path.join(userDataPath, "DawnGraphiteCache"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "DawnGraphiteCache", "data_0"),
      "live-cache",
    );

    const result = await restoreFromUpgradeBackupAsync(
      userDataPath,
      snapshot.backupId,
    );

    expect(result.success).toBe(true);
    expect(
      fs.readFileSync(path.join(userDataPath, "DawnGraphiteCache", "data_0"), "utf8"),
    ).toBe("live-cache");
  });

  it("moves a legacy root database into data/prompthub.db during restore", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "old-db");

    const snapshot = await createUpgradeDataSnapshot(userDataPath, {
      fromVersion: "0.5.6",
      toVersion: "0.5.7",
    });

    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "new-db");

    const result = await restoreFromUpgradeBackupAsync(
      userDataPath,
      snapshot.backupId,
    );

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(userDataPath, "prompthub.db"))).toBe(false);
    expect(
      fs.readFileSync(path.join(userDataPath, "data", "prompthub.db"), "utf8"),
    ).toBe("old-db");
  });

  it("rolls back to the insurance snapshot when restore fails mid-flight", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "old-db");
    fs.writeFileSync(path.join(userDataPath, "shortcut-mode.json"), '{"mode":"old"}');

    const snapshot = await createUpgradeDataSnapshot(userDataPath, {
      fromVersion: "0.5.3",
      toVersion: "0.5.4",
    });

    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "new-db");
    fs.writeFileSync(path.join(userDataPath, "shortcut-mode.json"), '{"mode":"new"}');

    const originalCpSync = fs.cpSync;
    const cpSpy = vi
      .spyOn(fs, "cpSync")
      .mockImplementation(((source: fs.PathLike, destination: fs.PathLike, options?: fs.CopySyncOptions) => {
        const sourceText = source.toString();
        const destinationText = destination.toString();
        if (
          sourceText.includes(snapshot.backupId) &&
          destinationText.endsWith(path.join("PromptHub", "shortcut-mode.json"))
        ) {
          throw new Error("simulated restore failure");
        }
        return originalCpSync(source, destination, options);
      }) as typeof fs.cpSync);

    const result = await restoreFromUpgradeBackupAsync(
      userDataPath,
      snapshot.backupId,
    );

    cpSpy.mockRestore();

    expect(result).toEqual({
      success: false,
      needsRestart: false,
      error: "simulated restore failure",
    });
    expect(fs.readFileSync(path.join(userDataPath, "data", "prompthub.db"), "utf8")).toBe(
      "new-db",
    );
    expect(
      fs.readFileSync(path.join(userDataPath, "shortcut-mode.json"), "utf8"),
    ).toBe('{"mode":"new"}');
  });

  it("prunes old snapshots after restore while keeping source and insurance backups", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "seed-db");

    const snapshots = [] as Array<{ backupId: string }>;
    for (let index = 0; index < MAX_UPGRADE_BACKUP_SNAPSHOTS - 1; index += 1) {
      const snapshot = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: `0.5.${index}`,
      });
      snapshots.push(snapshot);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "latest-db");

    const restoreTarget = snapshots[0];
    const result = await restoreFromUpgradeBackupAsync(userDataPath, restoreTarget.backupId);

    expect(result.success).toBe(true);
    const backups = await listUpgradeBackups(userDataPath);
    expect(backups.length).toBeLessThanOrEqual(MAX_UPGRADE_BACKUP_SNAPSHOTS);
    expect(backups.some((entry) => entry.backupId === restoreTarget.backupId)).toBe(true);
    expect(
      backups.some(
        (entry) => entry.backupPath === result.currentStateBackupPath,
      ),
    ).toBe(true);
  });
});
