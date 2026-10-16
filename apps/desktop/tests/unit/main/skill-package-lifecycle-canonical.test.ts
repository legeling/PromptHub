/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import type {
  RegistrySkill,
  SkillPackageOperationRequest,
} from "@prompthub/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStorageDB } from "@prompthub/core/skill-storage";
import { collectSkillPackageFiles } from "@prompthub/core/skill-storage-files";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import {
  configureRuntimePaths,
  getDataDir,
  getOperationsDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";
import { SkillPackageLifecycleService } from "../../../src/main/services/skill-package-lifecycle";
import {
  cleanupAbandonedSkillPackageOperations,
  createDesktopSkillPackageLifecycleDependencies,
} from "../../../src/main/services/skill-package-lifecycle-desktop";

const registrySkill: RegistrySkill = {
  slug: "canonical-writer",
  name: "Canonical Writer",
  description: "Write under canonical authority",
  category: "general",
  author: "PromptHub",
  source_id: "source-canonical-writer",
  source_url: "https://example.com/canonical-writer/SKILL.md",
  tags: [],
  version: "1.0.0",
  content: "# Canonical Writer\n",
};

function installRequest(): SkillPackageOperationRequest {
  return {
    operation: "install",
    registrySkill,
    source: {
      kind: "content",
      sourceUrl: registrySkill.source_url,
      content: registrySkill.content,
    },
    content: registrySkill.content,
  };
}

function updateRequest(
  skillId: string,
  content: string,
): SkillPackageOperationRequest {
  return {
    operation: "update",
    skillId,
    registrySkill: { ...registrySkill, version: "1.1.0", content },
    source: {
      kind: "content",
      sourceUrl: registrySkill.source_url,
      content,
    },
    content,
  };
}

describe("canonical Skill package lifecycle", () => {
  let root: string;
  let database: DatabaseAdapter.Database;

  beforeEach(() => {
    root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-canonical-install-"),
    );
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "c".repeat(64),
      operationId: "canonical-package-lifecycle-test",
    });
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    database.exec(SCHEMA);
  });

  afterEach(() => {
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("installs a complete package through the real canonical persistence boundary", async () => {
    const skillDb = new SkillStorageDB(database);
    const lifecycle = new SkillPackageLifecycleService(
      createDesktopSkillPackageLifecycleDependencies(skillDb),
    );

    const result = await lifecycle.run(installRequest());

    if (result.status !== "completed") {
      throw new Error(`install failed: ${JSON.stringify(result)}`);
    }
    expect(result).toMatchObject({ status: "completed", operation: "install" });
    const stored = skillDb.getById(result.skill.id);
    expect(stored).toMatchObject({
      source_id: registrySkill.source_id,
      currentVersion: 1,
      source_last_error: undefined,
    });
    expect(skillDb.getVersions(result.skill.id)).toMatchObject([
      { content: registrySkill.content },
    ]);
    expect(
      fs.readFileSync(path.join(stored!.local_repo_path!, "SKILL.md"), "utf8"),
    ).toBe(registrySkill.content);
    expect(
      collectSkillPackageFiles(stored!.local_repo_path!).map(
        (file) => file.path,
      ),
    ).toContain("SKILL.md");
    expect(fs.readdirSync(path.join(getDataDir(), "skills"))).toEqual([
      ".prompthub",
      result.skill.id,
    ]);
  });

  it("updates the canonical package without creating a managed container beside bundles", async () => {
    const skillDb = new SkillStorageDB(database);
    const lifecycle = new SkillPackageLifecycleService(
      createDesktopSkillPackageLifecycleDependencies(skillDb),
    );
    const installed = await lifecycle.run(installRequest());
    if (installed.status !== "completed") {
      throw new Error(`install failed: ${JSON.stringify(installed)}`);
    }

    const updatedContent = "# Canonical Writer\n\nUpdated.\n";
    const updated = await lifecycle.run(
      updateRequest(installed.skill.id, updatedContent),
    );

    if (updated.status !== "completed") {
      throw new Error(`update failed: ${JSON.stringify(updated)}`);
    }
    expect(skillDb.getVersions(installed.skill.id)).toMatchObject([
      // Package updates retain the pre-update package for rollback.
      { content: registrySkill.content },
      { content: registrySkill.content },
    ]);
    expect(
      fs.readFileSync(
        path.join(
          skillDb.getById(installed.skill.id)!.local_repo_path!,
          "SKILL.md",
        ),
        "utf8",
      ),
    ).toBe(updatedContent);
    expect(fs.readdirSync(path.join(getDataDir(), "skills"))).toEqual([
      ".prompthub",
      installed.skill.id,
    ]);
  });

  it("remains writable after reopening the canonical database and root", async () => {
    const firstDb = new SkillStorageDB(database);
    const firstLifecycle = new SkillPackageLifecycleService(
      createDesktopSkillPackageLifecycleDependencies(firstDb),
    );
    const first = await firstLifecycle.run(installRequest());
    expect(first.status).toBe("completed");
    database.close();

    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    const reopenedDb = new SkillStorageDB(database);
    const reopenedLifecycle = new SkillPackageLifecycleService(
      createDesktopSkillPackageLifecycleDependencies(reopenedDb),
    );
    const secondRegistry = {
      ...registrySkill,
      slug: "canonical-reviewer",
      name: "Canonical Reviewer",
      source_id: "source-canonical-reviewer",
      source_url: "https://example.com/canonical-reviewer/SKILL.md",
      content: "# Canonical Reviewer\n",
    };

    const second = await reopenedLifecycle.run({
      operation: "install",
      registrySkill: secondRegistry,
      source: {
        kind: "content",
        sourceUrl: secondRegistry.source_url,
        content: secondRegistry.content,
      },
      content: secondRegistry.content,
    });

    expect(second.status).toBe("completed");
    const reopenedSkills = reopenedDb.getAll();
    expect(reopenedSkills).toHaveLength(2);
    expect(fs.readdirSync(path.join(getDataDir(), "skills")).sort()).toEqual(
      [".prompthub", ...reopenedSkills.map((skill) => skill.id)].sort(),
    );
    for (const skill of reopenedSkills) {
      expect(reopenedDb.getVersions(skill.id)).toMatchObject([
        { content: skill.content },
      ]);
    }
  });

  it("cleans interrupted canonical staging and its pending bundle on restart", async () => {
    const skillDb = new SkillStorageDB(database);
    const pending = skillDb.create({
      name: "interrupted-canonical-install",
      protocol_type: "skill",
      content: "# Interrupted\n",
      is_favorite: false,
      source_last_error: "PACKAGE_OPERATION_PENDING",
    });
    const operationRoot = path.join(
      getOperationsDir(),
      "skill-package-lifecycle",
      "op-interrupted",
    );
    fs.mkdirSync(operationRoot, { recursive: true });
    fs.writeFileSync(path.join(operationRoot, "staged.tmp"), "partial");

    await cleanupAbandonedSkillPackageOperations(skillDb, {
      recoverAll: true,
    });

    expect(skillDb.getById(pending.id)).toBeNull();
    expect(fs.existsSync(operationRoot)).toBe(false);
    expect(fs.existsSync(path.join(getDataDir(), "skills", pending.id))).toBe(
      false,
    );
  });

  it("removes the pending bundle when canonical database finalization fails", async () => {
    const skillDb = new SkillStorageDB(database);
    vi.spyOn(skillDb, "finalizePackageInstall").mockImplementation(() => {
      throw new Error("forced canonical finalization failure");
    });
    const lifecycle = new SkillPackageLifecycleService(
      createDesktopSkillPackageLifecycleDependencies(skillDb),
    );

    const result = await lifecycle.run(installRequest());

    expect(result).toMatchObject({
      status: "failed",
      failure: { code: "DATABASE_FINALIZE_FAILED", phase: "finalizing" },
    });
    expect(skillDb.getAll()).toHaveLength(0);
    expect(fs.readdirSync(path.join(getDataDir(), "skills"))).toHaveLength(0);
    expect(
      fs.readdirSync(path.join(getOperationsDir(), "skill-package-lifecycle")),
    ).toHaveLength(0);
  });
});
