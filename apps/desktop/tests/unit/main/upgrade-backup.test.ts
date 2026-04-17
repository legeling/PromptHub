import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  createUpgradeDataSnapshot,
  deleteUpgradeBackup,
  getLegacyUpgradeBackupRoot,
  getUpgradeBackup,
  getUpgradeBackupRoot,
  listUpgradeBackups,
  migrateLegacyUpgradeBackups,
} from "../../../src/main/services/upgrade-backup";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedUserData(userDataPath: string): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-bytes");
  fs.mkdirSync(path.join(userDataPath, "skills", "demo-skill"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(userDataPath, "skills", "demo-skill", "SKILL.md"),
    "# skill",
  );
  fs.mkdirSync(path.join(userDataPath, "workspace"), { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, "workspace", "prompt-1.md"),
    "prompt body",
  );
  fs.writeFileSync(
    path.join(userDataPath, "shortcut-mode.json"),
    '{"showApp":"global"}',
  );
}

describe("upgrade-backup", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("upgrade-backup-test-");
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  describe("getUpgradeBackupRoot", () => {
    it("resolves to <userData>/backups (new location, inside userData)", () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });

      expect(getUpgradeBackupRoot(userDataPath)).toBe(
        path.join(path.resolve(userDataPath), "backups"),
      );
    });

    it("differs from the legacy sibling location", () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });

      expect(getUpgradeBackupRoot(userDataPath)).not.toBe(
        getLegacyUpgradeBackupRoot(userDataPath),
      );
      expect(getLegacyUpgradeBackupRoot(userDataPath)).toBe(
        path.join(path.dirname(path.resolve(userDataPath)), "PromptHub-upgrade-backups"),
      );
    });
  });

  describe("createUpgradeDataSnapshot", () => {
    it("copies the entire user data payload into <userData>/backups with a v2 manifest", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);

      const snapshot = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
        toVersion: "0.5.4",
      });

      expect(snapshot.manifest.fromVersion).toBe("0.5.1");
      expect(snapshot.manifest.toVersion).toBe("0.5.4");
      expect(snapshot.manifest.schemaVersion).toBe(2);
      expect(snapshot.manifest.kind).toBe("prompthub-upgrade-backup");
      expect(
        snapshot.backupPath.startsWith(getUpgradeBackupRoot(userDataPath)),
      ).toBe(true);
      expect(snapshot.backupId).toMatch(/^v0\.5\.1-/);

      expect(snapshot.manifest.copiedItems).toEqual(
        expect.arrayContaining([
          "prompthub.db",
          "skills",
          "workspace",
          "shortcut-mode.json",
        ]),
      );
      expect(
        fs.readFileSync(path.join(snapshot.backupPath, "prompthub.db"), "utf8"),
      ).toBe("db-bytes");
      expect(
        fs.readFileSync(
          path.join(snapshot.backupPath, "skills", "demo-skill", "SKILL.md"),
          "utf8",
        ),
      ).toBe("# skill");

      const manifestOnDisk = JSON.parse(
        fs.readFileSync(
          path.join(snapshot.backupPath, "backup-manifest.json"),
          "utf8",
        ),
      );
      expect(manifestOnDisk.fromVersion).toBe("0.5.1");
      expect(manifestOnDisk.toVersion).toBe("0.5.4");
      expect(manifestOnDisk.sourcePath).toBe(path.resolve(userDataPath));
    });

    it("accepts snapshots without toVersion (install-time trigger)", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);

      const snapshot = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
      });

      expect(snapshot.manifest.fromVersion).toBe("0.5.1");
      expect(snapshot.manifest.toVersion).toBeUndefined();
    });

    it("does not recurse into the backup root when snapshotting", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);

      // First snapshot lives under <userData>/backups. A second snapshot must
      // not copy it into itself or we'd explode in size over time.
      const first = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
      });
      expect(fs.existsSync(first.backupPath)).toBe(true);

      const second = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.2",
      });
      expect(second.manifest.copiedItems).not.toContain("backups");
      expect(fs.existsSync(path.join(second.backupPath, "backups"))).toBe(false);
    });

    it("rejects an empty user data path", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub-empty");
      fs.mkdirSync(userDataPath, { recursive: true });

      await expect(
        createUpgradeDataSnapshot(userDataPath, { fromVersion: "0.5.1" }),
      ).rejects.toThrow(/user data path is empty/i);
    });

    it("rejects a missing fromVersion", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);

      await expect(
        createUpgradeDataSnapshot(userDataPath, { fromVersion: "" }),
      ).rejects.toThrow(/fromVersion/);
    });
  });

  describe("listUpgradeBackups", () => {
    it("returns backups newest-first with size and manifest", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);

      const older = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.0",
      });
      // Force the second snapshot to have a strictly later createdAt by
      // waiting past millisecond boundary; avoid mocking Date for simplicity.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
      });

      const entries = await listUpgradeBackups(userDataPath);
      expect(entries).toHaveLength(2);
      expect(entries[0].backupId).toBe(newer.backupId);
      expect(entries[1].backupId).toBe(older.backupId);
      expect(entries[0].sizeBytes).toBeGreaterThan(0);
      expect(entries[0].manifest.fromVersion).toBe("0.5.1");
    });

    it("returns [] when the root does not exist", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });
      expect(await listUpgradeBackups(userDataPath)).toEqual([]);
    });

    it("silently ignores directories without a valid manifest", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);
      await createUpgradeDataSnapshot(userDataPath, { fromVersion: "0.5.1" });

      // Drop a garbage dir into the backup root.
      const root = getUpgradeBackupRoot(userDataPath);
      fs.mkdirSync(path.join(root, "not-a-backup"));
      fs.writeFileSync(path.join(root, "not-a-backup", "random.txt"), "hi");

      const entries = await listUpgradeBackups(userDataPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].backupId).not.toBe("not-a-backup");
    });
  });

  describe("getUpgradeBackup", () => {
    it("returns a single backup by id", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);
      const snapshot = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
      });

      const entry = await getUpgradeBackup(userDataPath, snapshot.backupId);
      expect(entry).not.toBeNull();
      expect(entry!.backupPath).toBe(snapshot.backupPath);
      expect(entry!.manifest.fromVersion).toBe("0.5.1");
    });

    it("returns null for unknown / malformed ids", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });

      expect(await getUpgradeBackup(userDataPath, "nope")).toBeNull();
      expect(await getUpgradeBackup(userDataPath, "..")).toBeNull();
      expect(await getUpgradeBackup(userDataPath, "a/b")).toBeNull();
      expect(await getUpgradeBackup(userDataPath, "")).toBeNull();
    });
  });

  describe("deleteUpgradeBackup", () => {
    it("removes a single backup directory", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);
      const snapshot = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
      });

      await deleteUpgradeBackup(userDataPath, snapshot.backupId);
      expect(fs.existsSync(snapshot.backupPath)).toBe(false);
      expect(await listUpgradeBackups(userDataPath)).toEqual([]);
    });

    it("rejects path-traversal ids without touching the filesystem", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);
      const snapshot = await createUpgradeDataSnapshot(userDataPath, {
        fromVersion: "0.5.1",
      });

      await expect(
        deleteUpgradeBackup(userDataPath, "../../"),
      ).rejects.toThrow(/invalid upgrade backup id/i);
      await expect(
        deleteUpgradeBackup(userDataPath, "/etc/passwd"),
      ).rejects.toThrow(/invalid upgrade backup id/i);
      await expect(deleteUpgradeBackup(userDataPath, "")).rejects.toThrow(
        /invalid upgrade backup id/i,
      );

      // Original backup still intact.
      expect(fs.existsSync(snapshot.backupPath)).toBe(true);
    });

    it("refuses to delete a directory without a valid manifest", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });
      const root = getUpgradeBackupRoot(userDataPath);
      fs.mkdirSync(path.join(root, "imposter"), { recursive: true });
      fs.writeFileSync(path.join(root, "imposter", "hello.txt"), "hi");

      await expect(
        deleteUpgradeBackup(userDataPath, "imposter"),
      ).rejects.toThrow(/missing manifest|not a valid upgrade backup/i);
      expect(fs.existsSync(path.join(root, "imposter"))).toBe(true);
    });

    it("is a no-op for non-existent ids that pass validation", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });
      await expect(
        deleteUpgradeBackup(userDataPath, "v0.5.1-2025-01-01T00-00-00-000Z"),
      ).resolves.toBeUndefined();
    });
  });

  describe("migrateLegacyUpgradeBackups", () => {
    it("moves legacy snapshots into <userData>/backups and writes a marker", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      seedUserData(userDataPath);

      // Seed a legacy snapshot at the sibling location.
      const legacyRoot = getLegacyUpgradeBackupRoot(userDataPath);
      const legacyBackup = path.join(legacyRoot, "v0.5.1-2025-01-01T00-00-00-000Z");
      fs.mkdirSync(legacyBackup, { recursive: true });
      fs.writeFileSync(path.join(legacyBackup, "prompthub.db"), "legacy-bytes");
      fs.writeFileSync(
        path.join(legacyBackup, "backup-manifest.json"),
        JSON.stringify({
          kind: "prompthub-upgrade-backup",
          createdAt: "2025-01-01T00:00:00.000Z",
          version: "0.5.1", // legacy field name
          sourcePath: userDataPath,
          copiedItems: ["prompthub.db"],
          platform: "linux",
        }),
      );

      const result = await migrateLegacyUpgradeBackups(userDataPath);
      expect(result.migrated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.alreadyDone).toBe(false);

      // Legacy copy is gone and the root was cleaned up.
      expect(fs.existsSync(legacyBackup)).toBe(false);
      expect(fs.existsSync(legacyRoot)).toBe(false);

      // New copy exists with upgraded manifest.
      const migratedPath = path.join(
        getUpgradeBackupRoot(userDataPath),
        "v0.5.1-2025-01-01T00-00-00-000Z",
      );
      expect(
        fs.readFileSync(path.join(migratedPath, "prompthub.db"), "utf8"),
      ).toBe("legacy-bytes");
      const migratedManifest = JSON.parse(
        fs.readFileSync(path.join(migratedPath, "backup-manifest.json"), "utf8"),
      );
      expect(migratedManifest.schemaVersion).toBe(2);
      expect(migratedManifest.fromVersion).toBe("0.5.1");
      expect(migratedManifest.legacyMigratedFrom).toBe(legacyBackup);

      // Marker was written.
      const markerPath = path.join(
        getUpgradeBackupRoot(userDataPath),
        ".legacy-migrated",
      );
      expect(fs.existsSync(markerPath)).toBe(true);
    });

    it("is idempotent once the marker is present", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });

      const first = await migrateLegacyUpgradeBackups(userDataPath);
      expect(first.alreadyDone).toBe(false);

      // Drop a new legacy backup after the first run — it must NOT be pulled in.
      const legacyRoot = getLegacyUpgradeBackupRoot(userDataPath);
      const legacyBackup = path.join(legacyRoot, "v0.5.1-2025-02-02T00-00-00-000Z");
      fs.mkdirSync(legacyBackup, { recursive: true });
      fs.writeFileSync(
        path.join(legacyBackup, "backup-manifest.json"),
        JSON.stringify({
          kind: "prompthub-upgrade-backup",
          createdAt: "2025-02-02T00:00:00.000Z",
          fromVersion: "0.5.1",
          sourcePath: userDataPath,
          copiedItems: [],
          platform: "linux",
        }),
      );

      const second = await migrateLegacyUpgradeBackups(userDataPath);
      expect(second.alreadyDone).toBe(true);
      expect(second.migrated).toBe(0);
      // Legacy item is intentionally left behind because we already ran once.
      expect(fs.existsSync(legacyBackup)).toBe(true);
    });

    it("skips items that already exist in the new root and keeps their legacy copy", async () => {
      const userDataPath = path.join(tmpBase, "PromptHub");
      fs.mkdirSync(userDataPath, { recursive: true });

      const newRoot = getUpgradeBackupRoot(userDataPath);
      const id = "v0.5.1-2025-03-03T00-00-00-000Z";
      // Pre-existing new backup.
      const existingPath = path.join(newRoot, id);
      fs.mkdirSync(existingPath, { recursive: true });
      fs.writeFileSync(path.join(existingPath, "marker"), "new");
      fs.writeFileSync(
        path.join(existingPath, "backup-manifest.json"),
        JSON.stringify({
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2025-03-03T00:00:00.000Z",
          fromVersion: "0.5.1",
          sourcePath: userDataPath,
          copiedItems: ["marker"],
          platform: "linux",
        }),
      );

      // Legacy copy with same id.
      const legacyRoot = getLegacyUpgradeBackupRoot(userDataPath);
      const legacyBackup = path.join(legacyRoot, id);
      fs.mkdirSync(legacyBackup, { recursive: true });
      fs.writeFileSync(path.join(legacyBackup, "marker"), "legacy");
      fs.writeFileSync(
        path.join(legacyBackup, "backup-manifest.json"),
        JSON.stringify({
          kind: "prompthub-upgrade-backup",
          createdAt: "2025-03-03T00:00:00.000Z",
          version: "0.5.1",
          sourcePath: userDataPath,
          copiedItems: ["marker"],
          platform: "linux",
        }),
      );

      const result = await migrateLegacyUpgradeBackups(userDataPath);
      expect(result.migrated).toBe(0);
      expect(result.skipped).toBe(1);

      // New copy is untouched.
      expect(fs.readFileSync(path.join(existingPath, "marker"), "utf8")).toBe(
        "new",
      );
      // Legacy copy is preserved because we didn't overwrite.
      expect(fs.existsSync(legacyBackup)).toBe(true);
    });
  });
});
