import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Database from "../../../src/main/database/sqlite";
import { SCHEMA } from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";

describe("SkillDB versioning", () => {
  let tempDir: string;
  let db: Database.Database;
  let skillDb: SkillDB;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-skill-db-"));
    configureRuntimePaths({ userDataPath: tempDir });
    db = new Database(path.join(tempDir, "prompthub.db"));
    db.exec(SCHEMA);
    skillDb = new SkillDB(db);
  });

  afterEach(() => {
    db.close();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists currentVersion when creating a snapshot", () => {
    const created = skillDb.create({
      name: "write",
      description: "Write better",
      content: "# Write",
      instructions: "# Write",
      protocol_type: "skill",
      author: "Test",
      tags: ["general"],
      is_favorite: false,
      currentVersion: 0,
      versionTrackingEnabled: true,
    });

    const snapshot = skillDb.createVersion(created.id, "initial snapshot", [
      { relativePath: "SKILL.md", content: "# Write" },
    ]);

    expect(snapshot).toEqual(
      expect.objectContaining({
        skillId: created.id,
        version: 1,
        note: "initial snapshot",
      }),
    );
    expect(skillDb.getById(created.id)?.currentVersion).toBe(1);
    expect(skillDb.getVersions(created.id)).toHaveLength(1);
  });

  it("atomically discards a failed-operation snapshot and restores its counter", () => {
    const created = skillDb.create({
      name: "recoverable-write",
      content: "# Write",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      currentVersion: 2,
    });
    const snapshot = skillDb.createVersion(created.id, "pending update");

    expect(snapshot?.version).toBe(3);
    expect(
      skillDb.discardVersionAndRestoreCounter(
        created.id,
        snapshot!.id,
        created.currentVersion ?? 0,
      ),
    ).toBe(true);
    expect(skillDb.getVersions(created.id)).toHaveLength(0);
    expect(skillDb.getById(created.id)?.currentVersion).toBe(2);
  });

  it("atomically finalizes an install baseline and its initial version", () => {
    const pending = skillDb.create({
      name: "install-baseline",
      content: "# Pending",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      source_last_error: "PACKAGE_OPERATION_PENDING",
      currentVersion: 0,
    });

    const packagePath = path.join(tempDir, "install-package");
    fs.mkdirSync(packagePath);
    fs.writeFileSync(path.join(packagePath, "SKILL.md"), "# Installed");
    const result = skillDb.finalizePackageInstall(
      pending.id,
      {
        content: "# Installed",
        local_repo_path: packagePath,
        installed_directory_fingerprint: "a".repeat(64),
        source_last_error: null,
      },
      "Initial store install",
      [{ relativePath: "SKILL.md", content: "# Installed" }],
    );

    expect(result?.skill).toMatchObject({
      content: "# Installed",
      currentVersion: 1,
      source_last_error: undefined,
    });
    expect(result?.version).toMatchObject({
      skillId: pending.id,
      version: 1,
      content: "# Installed",
    });
  });

  it("returns null when package finalization targets a missing Skill", () => {
    expect(
      skillDb.finalizePackageInstall(
        "missing-skill",
        { content: "# Installed" },
        "Initial store install",
        [{ relativePath: "SKILL.md", content: "# Installed" }],
      ),
    ).toBeNull();
    expect(
      skillDb.finalizePackageUpdate(
        "missing-skill",
        { content: "# Updated" },
        "Store update",
        undefined,
      ),
    ).toBeNull();
  });

  it("rolls back install metadata when initial version creation fails", () => {
    const pending = skillDb.create({
      name: "failed-install-baseline",
      content: "# Pending",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      source_last_error: "PACKAGE_OPERATION_PENDING",
      currentVersion: 0,
    });
    db.exec(`
      CREATE TRIGGER fail_initial_skill_version
      BEFORE INSERT ON skill_versions
      BEGIN
        SELECT RAISE(ABORT, 'forced version failure');
      END
    `);

    expect(() =>
      skillDb.finalizePackageInstall(
        pending.id,
        {
          content: "# Installed",
          source_last_error: null,
        },
        "Initial store install",
        [{ relativePath: "SKILL.md", content: "# Installed" }],
      ),
    ).toThrow("forced version failure");

    expect(skillDb.getById(pending.id)).toMatchObject({
      content: "# Pending",
      currentVersion: 0,
      source_last_error: "PACKAGE_OPERATION_PENDING",
    });
    expect(skillDb.getVersions(pending.id)).toHaveLength(0);
  });

  it("rolls back an update snapshot when metadata finalization fails", () => {
    const installed = skillDb.create({
      name: "failed-update-baseline",
      content: "# Before",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      installed_directory_fingerprint: "b".repeat(64),
      currentVersion: 2,
    });
    db.exec(`
      CREATE TRIGGER fail_skill_package_update
      BEFORE UPDATE OF source_last_error ON skills
      WHEN NEW.source_last_error = 'FORCED_FAILURE'
      BEGIN
        SELECT RAISE(ABORT, 'forced metadata failure');
      END
    `);

    expect(() =>
      skillDb.finalizePackageUpdate(
        installed.id,
        {
          content: "# After",
          source_last_error: "FORCED_FAILURE",
          installed_directory_fingerprint: "c".repeat(64),
        },
        "Store update",
        [{ relativePath: "SKILL.md", content: "# Before" }],
        installed,
      ),
    ).toThrow("forced metadata failure");

    expect(skillDb.getById(installed.id)).toMatchObject({
      content: "# Before",
      currentVersion: 2,
      installed_directory_fingerprint: "b".repeat(64),
    });
    expect(skillDb.getVersions(installed.id)).toHaveLength(0);
  });

  it("atomically snapshots the previous package and finalizes an update", () => {
    const installed = skillDb.create({
      name: "update-baseline",
      content: "# Before",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      installed_directory_fingerprint: "b".repeat(64),
      currentVersion: 2,
    });

    const result = skillDb.finalizePackageUpdate(
      installed.id,
      {
        content: "# After",
        installed_directory_fingerprint: "c".repeat(64),
      },
      "Store update",
      undefined,
    );

    expect(result?.skill).toMatchObject({
      content: "# After",
      currentVersion: 3,
      installed_directory_fingerprint: "c".repeat(64),
    });
    expect(result?.version).toMatchObject({
      version: 3,
      content: "# Before",
      filesSnapshot: undefined,
    });
  });

  it("rejects a stale update baseline without writing a snapshot", () => {
    const installed = skillDb.create({
      name: "concurrent-update-baseline",
      content: "# Before",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      currentVersion: 2,
    });
    skillDb.update(installed.id, { currentVersion: 3, content: "# User edit" });

    expect(() =>
      skillDb.finalizePackageUpdate(
        installed.id,
        { content: "# Remote update" },
        "Store update",
        [{ relativePath: "SKILL.md", content: "# Before" }],
        installed,
      ),
    ).toThrow("Skill changed during package update finalization");

    expect(skillDb.getById(installed.id)).toMatchObject({
      content: "# User edit",
      currentVersion: 3,
    });
    expect(skillDb.getVersions(installed.id)).toHaveLength(0);
  });

  it("rejects a baseline whose durable timestamp changed", () => {
    const installed = skillDb.create({
      name: "timestamp-baseline",
      content: "# Before",
      protocol_type: "skill",
      tags: [],
      is_favorite: false,
      currentVersion: 2,
    });
    db.prepare(
      "UPDATE skills SET updated_at = updated_at + 1000 WHERE id = ?",
    ).run(installed.id);

    expect(() =>
      skillDb.finalizePackageUpdate(
        installed.id,
        { content: "# Remote update" },
        "Store update",
        undefined,
        installed,
      ),
    ).toThrow("Skill changed during package update finalization");
    expect(skillDb.getVersions(installed.id)).toHaveLength(0);
  });
});
