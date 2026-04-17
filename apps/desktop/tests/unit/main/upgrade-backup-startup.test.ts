/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getLastRunVersionMarkerPath,
  runUpgradeBackupStartupTasks,
} from "../../../src/main/services/upgrade-backup-startup";
import {
  getLegacyUpgradeBackupRoot,
  getUpgradeBackupRoot,
} from "../../../src/main/services/upgrade-backup";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedUserData(userDataPath: string): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-bytes");
  fs.mkdirSync(path.join(userDataPath, "workspace"), { recursive: true });
  fs.writeFileSync(path.join(userDataPath, "workspace", "prompt-1.md"), "prompt");
}

describe("upgrade-backup-startup", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("upgrade-backup-startup-");
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("treats the first launch as marker-only and does not create a snapshot", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    seedUserData(userDataPath);

    const result = await runUpgradeBackupStartupTasks(userDataPath, "0.5.4");

    expect(result.status).toBe("first-run");
    expect(result.previousVersion).toBeNull();
    expect(result.snapshot).toBeNull();

    const marker = JSON.parse(
      fs.readFileSync(getLastRunVersionMarkerPath(userDataPath), "utf8"),
    ) as { version: string };
    expect(marker.version).toBe("0.5.4");
    expect(fs.existsSync(getUpgradeBackupRoot(userDataPath))).toBe(true);
    expect(await fs.promises.readdir(getUpgradeBackupRoot(userDataPath))).toEqual(
      expect.arrayContaining([".legacy-migrated", ".last-run-version.json"]),
    );
  });

  it("creates a snapshot when the current version is newer than the last run version", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    seedUserData(userDataPath);
    fs.mkdirSync(getUpgradeBackupRoot(userDataPath), { recursive: true });
    fs.writeFileSync(
      getLastRunVersionMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.3", updatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const result = await runUpgradeBackupStartupTasks(userDataPath, "0.5.4");

    expect(result.status).toBe("snapshot-created");
    expect(result.previousVersion).toBe("0.5.3");
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot?.manifest.fromVersion).toBe("0.5.3");
    expect(result.snapshot?.manifest.toVersion).toBe("0.5.4");
    expect(result.snapshot?.backupPath.startsWith(getUpgradeBackupRoot(userDataPath))).toBe(true);

    const marker = JSON.parse(
      fs.readFileSync(getLastRunVersionMarkerPath(userDataPath), "utf8"),
    ) as { version: string };
    expect(marker.version).toBe("0.5.4");
  });

  it("does not create a snapshot when relaunching the same version", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    seedUserData(userDataPath);
    fs.mkdirSync(getUpgradeBackupRoot(userDataPath), { recursive: true });
    fs.writeFileSync(
      getLastRunVersionMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.4", updatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const result = await runUpgradeBackupStartupTasks(userDataPath, "0.5.4");

    expect(result.status).toBe("not-an-upgrade");
    expect(result.snapshot).toBeNull();
  });

  it("does not create a snapshot when downgrading", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    seedUserData(userDataPath);
    fs.mkdirSync(getUpgradeBackupRoot(userDataPath), { recursive: true });
    fs.writeFileSync(
      getLastRunVersionMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.5", updatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const result = await runUpgradeBackupStartupTasks(userDataPath, "0.5.4");

    expect(result.status).toBe("not-an-upgrade");
    expect(result.snapshot).toBeNull();

    const marker = JSON.parse(
      fs.readFileSync(getLastRunVersionMarkerPath(userDataPath), "utf8"),
    ) as { version: string };
    expect(marker.version).toBe("0.5.4");
  });

  it("treats empty userData as a non-fatal no-op and still advances the marker", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.mkdirSync(getUpgradeBackupRoot(userDataPath), { recursive: true });
    fs.writeFileSync(
      getLastRunVersionMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.3", updatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const result = await runUpgradeBackupStartupTasks(userDataPath, "0.5.4");

    expect(result.status).toBe("user-data-empty");
    expect(result.snapshot).toBeNull();

    const marker = JSON.parse(
      fs.readFileSync(getLastRunVersionMarkerPath(userDataPath), "utf8"),
    ) as { version: string };
    expect(marker.version).toBe("0.5.4");
  });

  it("migrates legacy sibling backups before evaluating the version jump", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    seedUserData(userDataPath);
    fs.mkdirSync(getUpgradeBackupRoot(userDataPath), { recursive: true });
    fs.writeFileSync(
      getLastRunVersionMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.3", updatedAt: "2026-01-01T00:00:00.000Z" }),
      "utf8",
    );

    const legacyRoot = getLegacyUpgradeBackupRoot(userDataPath);
    const legacyBackup = path.join(legacyRoot, "v0.5.2-2026-01-01T00-00-00-000Z");
    fs.mkdirSync(legacyBackup, { recursive: true });
    fs.writeFileSync(path.join(legacyBackup, "prompthub.db"), "legacy-db");
    fs.writeFileSync(
      path.join(legacyBackup, "backup-manifest.json"),
      JSON.stringify({
        kind: "prompthub-upgrade-backup",
        createdAt: "2026-01-01T00:00:00.000Z",
        version: "0.5.2",
        sourcePath: userDataPath,
        copiedItems: ["prompthub.db"],
        platform: process.platform,
      }),
      "utf8",
    );

    const result = await runUpgradeBackupStartupTasks(userDataPath, "0.5.4");

    expect(result.migration.migrated).toBe(1);
    expect(result.status).toBe("snapshot-created");
    expect(
      fs.existsSync(
        path.join(getUpgradeBackupRoot(userDataPath), "v0.5.2-2026-01-01T00-00-00-000Z"),
      ),
    ).toBe(true);
    expect(fs.existsSync(legacyBackup)).toBe(false);
  });
});
