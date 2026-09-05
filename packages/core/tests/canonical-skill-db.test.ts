import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CanonicalSkillDB } from "../src/canonical-skill-db";
import {
  getCanonicalSkillWorkspacePath,
  publishCanonicalSkill,
} from "../src/canonical-skill-library";
import { readSkillResourceBundle } from "../src/skill-resource-schema";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";

describe("canonical Skill database adapter", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let skillDb: CanonicalSkillDB;
  let sourcePath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-canonical-skill-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "canonical-skill-test",
    });
    database = new DatabaseAdapter(":memory:");
    database.exec(SCHEMA);
    skillDb = new CanonicalSkillDB(database);
    sourcePath = path.join(root, "incoming-skill");
    fs.mkdirSync(sourcePath);
    fs.writeFileSync(path.join(sourcePath, "SKILL.md"), "# Initial\n");
  });

  afterEach(() => {
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("publishes DB mutations and keeps the writable workspace disposable", () => {
    const created = skillDb.create({
      name: "canonical-skill",
      protocol_type: "skill",
      content: "Initial",
      is_favorite: false,
      local_repo_path: sourcePath,
    });
    const bundlePath = path.join(root, "data", "skills", created.id);
    const workspacePath = getCanonicalSkillWorkspacePath(created.id);

    expect(skillDb.getById(created.id)?.local_repo_path).toBe(workspacePath);
    expect(fs.readFileSync(path.join(workspacePath, "SKILL.md"), "utf8")).toBe(
      "# Initial\n",
    );
    expect(readSkillResourceBundle(bundlePath).bundleManifest.revision).toBe(1);

    fs.writeFileSync(path.join(workspacePath, "SKILL.md"), "# Updated\n");
    skillDb.update(created.id, {
      content: "Updated",
      directory_fingerprint: "f".repeat(64),
    });
    expect(
      fs.readFileSync(path.join(bundlePath, "files", "SKILL.md"), "utf8"),
    ).toBe("# Updated\n");
    expect(readSkillResourceBundle(bundlePath).bundleManifest.revision).toBe(2);

    skillDb.createVersion(created.id, "snapshot", [
      { relativePath: "SKILL.md", content: "# Updated\n" },
    ]);
    expect(readSkillResourceBundle(bundlePath).versions).toHaveLength(1);
    expect(skillDb.delete(created.id)).toBe(true);
    expect(fs.existsSync(bundlePath)).toBe(false);
    expect(fs.existsSync(workspacePath)).toBe(false);
  });

  it("rolls back a failed bundle replacement without touching the prior bundle", () => {
    const created = skillDb.create({
      name: "canonical-skill",
      protocol_type: "skill",
      content: "Initial",
      is_favorite: false,
      local_repo_path: sourcePath,
    });
    const before = readSkillResourceBundle(
      path.join(root, "data", "skills", created.id),
    );

    expect(() =>
      publishCanonicalSkill({
        skill: { ...created, content: "Broken", updated_at: Date.now() },
        versions: [],
        packageSourcePath: sourcePath,
        injectPublicationFailure() {
          throw new Error("disk full");
        },
      }),
    ).toThrow("disk full");

    const restored = readSkillResourceBundle(
      path.join(root, "data", "skills", created.id),
    );
    expect(restored.skill.content).toBe(before.skill.content);
    expect(restored.bundleManifest.revision).toBe(
      before.bundleManifest.revision,
    );
  });

  it("restores the pending row and bundle when package finalization cannot publish", () => {
    const pending = skillDb.create({
      name: "unsafe-finalization",
      protocol_type: "skill",
      content: "Pending",
      is_favorite: false,
      source_last_error: "PACKAGE_OPERATION_PENDING",
    });
    const bundlePath = path.join(root, "data", "skills", pending.id);
    const before = readSkillResourceBundle(bundlePath);
    const unsafeSource = path.join(root, "unsafe-source");
    fs.mkdirSync(unsafeSource);
    fs.writeFileSync(path.join(unsafeSource, "SKILL.md"), "# Unsafe\n");
    fs.symlinkSync(sourcePath, path.join(unsafeSource, "linked"));

    expect(() =>
      skillDb.finalizePackageInstall(
        pending.id,
        {
          content: "Installed",
          local_repo_path: unsafeSource,
          source_last_error: null,
        },
        "Initial store install",
        [{ relativePath: "SKILL.md", content: "# Unsafe\n" }],
      ),
    ).toThrow(/symbolic link/u);

    expect(skillDb.getById(pending.id)).toMatchObject({
      content: "Pending",
      currentVersion: 0,
      source_last_error: "PACKAGE_OPERATION_PENDING",
    });
    expect(skillDb.getVersions(pending.id)).toHaveLength(0);
    const restored = readSkillResourceBundle(bundlePath);
    expect(restored.bundleManifest.revision).toBe(
      before.bundleManifest.revision,
    );
    expect(restored.skill.content).toBe("Pending");
  });

  it("excludes the user .prompthub sidecar from canonical bundle content", () => {
    fs.mkdirSync(path.join(sourcePath, ".prompthub"));
    fs.writeFileSync(
      path.join(sourcePath, ".prompthub", "user.json"),
      JSON.stringify({ note: "draft" }),
    );
    const created = skillDb.create({
      name: "sidecar-excluded",
      protocol_type: "skill",
      content: "Initial",
      is_favorite: false,
      local_repo_path: sourcePath,
    });
    const bundlePath = path.join(root, "data", "skills", created.id);
    const payloadPaths = readSkillResourceBundle(bundlePath).packageFiles.map(
      (file) => file.path,
    );
    expect(payloadPaths).toContain("SKILL.md");
    expect(payloadPaths.some((filePath) => filePath.startsWith(".prompthub"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(bundlePath, ".prompthub"))).toBe(false);
  });

  it.each([".prompthub", "repo"])(
    "clears an undeclared %s dir from an existing bundle on the next republish",
    (leftoverDir) => {
      const created = skillDb.create({
        name: `stale-${leftoverDir.replace(".", "dot")}-cleanup`,
        protocol_type: "skill",
        content: "Initial",
        is_favorite: false,
        local_repo_path: sourcePath,
      });
      const bundlePath = path.join(root, "data", "skills", created.id);
      fs.mkdirSync(path.join(bundlePath, leftoverDir));
      fs.writeFileSync(
        path.join(bundlePath, leftoverDir, "user.json"),
        JSON.stringify({ note: "stale" }),
      );
      expect(readSkillResourceBundle(bundlePath).skill.content).toBe("Initial");

      skillDb.update(created.id, {
        content: "Updated",
        directory_fingerprint: "f".repeat(64),
      });
      expect(fs.existsSync(path.join(bundlePath, leftoverDir))).toBe(false);
      expect(readSkillResourceBundle(bundlePath).skill.content).toBe("Updated");
    },
  );

  it("hydrates canonical Skill workspaces only once per database connection", () => {
    const created = skillDb.create({
      name: "one-shot-hydration",
      protocol_type: "skill",
      content: "Initial",
      is_favorite: false,
      local_repo_path: sourcePath,
    });
    const workspacePath = getCanonicalSkillWorkspacePath(created.id);

    skillDb.reconcileCanonicalWorkspaces();
    fs.rmSync(workspacePath, { recursive: true, force: true });
    new CanonicalSkillDB(database).reconcileCanonicalWorkspaces();

    expect(fs.existsSync(workspacePath)).toBe(false);
  });
});
