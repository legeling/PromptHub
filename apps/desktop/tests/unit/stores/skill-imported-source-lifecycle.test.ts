import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ScannedSkill,
  Skill,
  SkillPackageOperationRequest,
} from "@prompthub/shared/types";
import { SKILL_PACKAGE_FINGERPRINT_ALGORITHM } from "@prompthub/shared/utils/skill-source-update";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { createSkillFixture } from "../../fixtures/skills";
import { installWindowMocks } from "../../helpers/window";

function resetStores(): void {
  useSkillStore.setState({
    skills: [],
    selectedSkillId: null,
    isLoading: false,
    error: null,
    registrySkills: [],
    remoteStoreEntries: {},
    customStoreSources: [],
  });
  useSettingsStore.setState({
    autoScanStoreSkillsBeforeInstall: false,
    trustedSkillUpdateSourceKeys: [],
  });
  localStorage.clear();
}

function scannedClaudeSkill(sourcePath: string): ScannedSkill {
  return {
    name: "claude-writer",
    description: "Claude writer",
    version: "1.0.0",
    author: "Local",
    tags: ["writing"],
    instructions: "# Claude Writer\n\nOriginal content\n",
    directory_fingerprint: "a".repeat(64),
    filePath: `${sourcePath}/SKILL.md`,
    localPath: sourcePath,
    platforms: ["claude-code"],
  };
}

describe("imported Skill source lifecycle", () => {
  beforeEach(resetStores);

  it("detects and applies a later Claude source update from the imported path", async () => {
    const sourcePath = "/Users/demo/.claude/skills/claude-writer";
    const managedPath = "/managed/claude-writer/repo";
    const scanned = scannedClaudeSkill(sourcePath);
    let storedSkill: Skill | null = null;
    const create = vi.fn(async (data) => {
      storedSkill = createSkillFixture({
        ...data,
        id: "skill-claude-writer",
        name: scanned.name,
      });
      return storedSkill;
    });
    const update = vi.fn(async (_id, data) => {
      storedSkill = storedSkill ? { ...storedSkill, ...data } : null;
      return storedSkill;
    });
    const getAll = vi.fn(async () => (storedSkill ? [storedSkill] : []));
    const syncFromRepo = vi.fn(async () => storedSkill);
    const getLocalPackageSnapshot = vi.fn().mockResolvedValue({
      content: "# Claude Writer\n\nUpdated source content\n",
      directoryFingerprint: "b".repeat(64),
    });
    const saveToRepo = vi.fn().mockResolvedValue(managedPath);
    const { api } = installWindowMocks({
      api: {
        skill: {
          create,
          update,
          getAll,
          syncFromRepo,
          getLocalPackageSnapshot,
          saveToRepo,
        },
      },
    });
    const runPackageOperation = vi.fn(
      async (request: SkillPackageOperationRequest) => {
        if (request.operation === "install") {
          storedSkill = createSkillFixture({
            id: "skill-claude-writer",
            name: scanned.name,
            source_url: sourcePath,
            local_repo_path: managedPath,
            source_id: request.registrySkill.source_id,
            installed_directory_fingerprint: scanned.directory_fingerprint,
            directory_fingerprint: scanned.directory_fingerprint,
            fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
            source_binding_state: "bound",
            installed_content_hash: "original-hash",
          });
          return {
            status: "completed",
            operation: "install",
            skill: storedSkill,
          };
        }
        return {
          status: "completed",
          operation: "update",
          skill: {
            ...storedSkill!,
            content: "# Claude Writer\n\nUpdated source content\n",
            instructions: "# Claude Writer\n\nUpdated source content\n",
            local_repo_path: managedPath,
            directory_fingerprint: "b".repeat(64),
            installed_directory_fingerprint: "b".repeat(64),
          },
        };
      },
    );
    api.skill.runPackageOperation = runPackageOperation;

    const imported = await useSkillStore
      .getState()
      .importScannedSkills([scanned], {}, "copy");

    expect(imported.importedCount).toBe(1);
    expect(storedSkill).toMatchObject({
      source_url: sourcePath,
      local_repo_path: managedPath,
      installed_directory_fingerprint: "a".repeat(64),
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      source_binding_state: "bound",
    });

    const check = await useSkillStore
      .getState()
      .getInstalledSkillSourceUpdateStatus("skill-claude-writer");
    expect(check?.status).toBe("update-available");

    const result = await useSkillStore
      .getState()
      .updateInstalledSkillFromSource("skill-claude-writer");

    expect(result?.status).toBe("updated");
    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update",
        skillId: "skill-claude-writer",
        source: { kind: "local-directory", directory: sourcePath },
        content: "# Claude Writer\n\nUpdated source content\n",
      }),
    );
    expect(getLocalPackageSnapshot).toHaveBeenCalledWith(sourcePath);
  });

  it("allows an explicit source reset for a legacy import without a baseline", async () => {
    const sourcePath = "/Users/demo/.claude/skills/legacy-writer";
    const managedPath = "/managed/legacy-writer/repo";
    const legacySkill = createSkillFixture({
      id: "skill-legacy-writer",
      name: "legacy-writer",
      source_id: undefined,
      source_url: sourcePath,
      local_repo_path: managedPath,
      content: "# Legacy Writer\n\nImported content\n",
      instructions: "# Legacy Writer\n\nImported content\n",
      directory_fingerprint: "a".repeat(64),
      installed_content_hash: undefined,
      installed_directory_fingerprint: undefined,
      fingerprint_algorithm: undefined,
    });
    const updatedSkill = {
      ...legacySkill,
      content: "# Legacy Writer\n\nUpdated source content\n",
      instructions: "# Legacy Writer\n\nUpdated source content\n",
      directory_fingerprint: "b".repeat(64),
      installed_directory_fingerprint: "b".repeat(64),
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    };
    const { api } = installWindowMocks({
      api: {
        skill: {
          syncFromRepo: vi.fn().mockResolvedValue(legacySkill),
          getLocalPackageSnapshot: vi.fn().mockResolvedValue({
            content: updatedSkill.content,
            directoryFingerprint: "b".repeat(64),
          }),
        },
      },
    });
    const runPackageOperation = vi.fn().mockResolvedValue({
      status: "completed",
      operation: "update",
      skill: updatedSkill,
    });
    api.skill.runPackageOperation = runPackageOperation;
    useSkillStore.setState({ skills: [legacySkill], registrySkills: [] });

    const check = await useSkillStore
      .getState()
      .getInstalledSkillSourceUpdateStatus(legacySkill.id);
    expect(check?.status).toBe("baseline-missing");

    const result = await useSkillStore
      .getState()
      .updateInstalledSkillFromSource(legacySkill.id, {
        overwriteLocalChanges: true,
      });

    expect(result?.status).toBe("updated");
    expect(runPackageOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "update",
        skillId: legacySkill.id,
        source: { kind: "local-directory", directory: sourcePath },
      }),
    );
  });

  it("does not overwrite a linked source folder while rebuilding a legacy baseline", async () => {
    const sourcePath = "/Users/demo/.claude/skills/linked-writer";
    const linkedSkill = createSkillFixture({
      id: "skill-linked-writer",
      name: "linked-writer",
      source_url: sourcePath,
      local_repo_path: sourcePath,
      installed_content_hash: undefined,
      installed_directory_fingerprint: undefined,
      fingerprint_algorithm: undefined,
    });
    const { api } = installWindowMocks({
      api: {
        skill: {
          syncFromRepo: vi.fn().mockResolvedValue(linkedSkill),
          getLocalPackageSnapshot: vi.fn().mockResolvedValue({
            content: "# Linked Writer\n\nSource changed after import\n",
            directoryFingerprint: "c".repeat(64),
          }),
        },
      },
    });
    const runPackageOperation = vi.fn();
    api.skill.runPackageOperation = runPackageOperation;
    useSkillStore.setState({ skills: [linkedSkill], registrySkills: [] });

    const result = await useSkillStore
      .getState()
      .updateInstalledSkillFromSource(linkedSkill.id, {
        overwriteLocalChanges: true,
      });

    expect(result?.status).toBe("linked-local-blocked");
    expect(result?.check.status).toBe("baseline-missing");
    expect(runPackageOperation).not.toHaveBeenCalled();
  });
});
