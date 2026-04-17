/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUpgradeDataSnapshot, getUpgradeBackupRoot } from "../../../src/main/services/upgrade-backup";
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

    expect(fs.readFileSync(path.join(userDataPath, "prompthub.db"), "utf8")).toBe(
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
});
