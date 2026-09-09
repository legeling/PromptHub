import type {
  RegistrySkill,
  Skill,
  SkillSafetyScanMode,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import { shouldIgnoreSkillDirectoryEntry } from "@prompthub/shared/utils/skill-identity";
import {
  getRegistrySkillDirectory,
  isLocalRegistrySkill,
  normalizeLocalRegistryDirectory,
  parseGitHubSkillLocation,
  resolveRegistrySkillGitPackage,
  shouldCloneRegistrySkillPackage,
} from "../../services/skill-source-resolver";
import {
  computeSkillContentHash,
  type RegistrySkillUpdateCheck,
} from "../../services/skill-store-update";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import {
  getCloudSkillMarkdown,
  getCloudStorePackage,
  isCloudRegistrySkill,
} from "../../services/cloud-store";
import { buildSourceBaselineFields } from "./skill-source-update-baseline";
import type { SkillState } from "./skill-store-types";

const REMOTE_REPO_SYNC_CONCURRENCY = 6;

function shouldSkipRemoteRepoFile(relativePath: string): boolean {
  return shouldIgnoreSkillDirectoryEntry(relativePath);
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isGitHubTreeEntry(entry: {
  path?: string;
  type?: string;
}): entry is { path: string; type: string } {
  return typeof entry.path === "string" && typeof entry.type === "string";
}

type GitHubTreeFile = { path: string; type: string };
type GitHubSkillLocation = NonNullable<
  ReturnType<typeof parseGitHubSkillLocation>
>;

async function fetchGitHubSkillRepoFiles(
  sourceUrl?: string,
  contentUrl?: string,
): Promise<
  | {
      location: GitHubSkillLocation;
      directoryPrefix: string;
      files: GitHubTreeFile[];
    }
  | undefined
> {
  const location = parseGitHubSkillLocation(sourceUrl, contentUrl);
  if (!location) return undefined;
  const treeRaw = await window.api.skill.fetchRemoteContent(
    `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${location.branch}?recursive=1`,
  );
  const treeData = parseJson<{
    tree?: Array<{ path?: string; type?: string }>;
  }>(treeRaw || "{}", {});
  const directoryPrefix = location.directoryPath
    ? `${location.directoryPath}/`
    : "";
  const files: GitHubTreeFile[] = Array.isArray(treeData.tree)
    ? treeData.tree.filter(
        (entry): entry is GitHubTreeFile =>
          isGitHubTreeEntry(entry) &&
          entry.type === "blob" &&
          (directoryPrefix ? entry.path.startsWith(directoryPrefix) : true),
      )
    : [];
  return { location, directoryPrefix, files };
}

async function syncRemoteGitHubSkillFile(
  skillId: string,
  location: GitHubSkillLocation,
  directoryPrefix: string,
  file: GitHubTreeFile,
): Promise<void> {
  const relativePath = file.path.slice(directoryPrefix.length);
  if (!relativePath || shouldSkipRemoteRepoFile(relativePath)) return;
  const rawUrl = `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${location.branch}/${file.path}`;
  if (relativePath.toLowerCase() === "skill.md") {
    const content = await window.api.skill.fetchRemoteContent(rawUrl);
    await window.api.skill.writeLocalFile(skillId, relativePath, content, {
      skipVersionSnapshot: true,
    });
    return;
  }
  const repoPath = await window.api.skill.getRepoPath(skillId);
  if (!repoPath)
    throw new Error(`Missing local repo path for skill: ${skillId}`);
  const content = await window.api.skill.fetchRemoteContentBytes(rawUrl);
  await window.api.skill.writeLocalFileBufferByPath(
    repoPath,
    relativePath,
    content,
  );
}

async function syncRemoteGitHubSkillRepo(
  skillId: string,
  sourceUrl?: string,
  contentUrl?: string,
): Promise<void> {
  const repository = await fetchGitHubSkillRepoFiles(sourceUrl, contentUrl);
  if (!repository) return;
  await runWithConcurrency(
    repository.files,
    REMOTE_REPO_SYNC_CONCURRENCY,
    (file) =>
      syncRemoteGitHubSkillFile(
        skillId,
        repository.location,
        repository.directoryPrefix,
        file,
      ),
  );
}

type RemoteRegistrySyncOptions = {
  refreshBaseline?: boolean;
  approvedPackageFingerprint?: string;
  safetyScanMode?: SkillSafetyScanMode;
};

async function refreshSyncedRegistrySkill(
  skillId: string,
  registrySkill: RegistrySkill,
  refreshBaseline: boolean,
): Promise<Skill | null> {
  const syncedSkill = await window.api.skill.syncFromRepo(skillId);
  if (!refreshBaseline) return syncedSkill ?? null;
  return refreshInstalledContentHashFromSyncedSkill(
    skillId,
    syncedSkill,
    registrySkill,
  );
}

async function syncRemoteZipPackage(
  skillId: string,
  registrySkill: RegistrySkill,
  options: RemoteRegistrySyncOptions,
): Promise<Skill | null> {
  await window.api.skill.saveRemoteZipToRepo(skillId, {
    zipUrl: registrySkill.package_url!,
  });
  return refreshSyncedRegistrySkill(
    skillId,
    registrySkill,
    options.refreshBaseline !== false,
  );
}

async function syncRemoteGitPackage(
  skillId: string,
  registrySkill: RegistrySkill,
  options: RemoteRegistrySyncOptions,
): Promise<Skill | null> {
  const gitPackage = resolveRegistrySkillGitPackage(registrySkill);
  if (!gitPackage) {
    throw new Error("Git-backed Skill source is missing repository metadata");
  }
  await window.api.skill.saveRemoteGitToRepo(skillId, gitPackage);
  return refreshSyncedRegistrySkill(
    skillId,
    registrySkill,
    options.refreshBaseline !== false,
  );
}

async function syncRemoteContentUrlSkill(
  skillId: string,
  registrySkill: RegistrySkill,
  effectiveContent: string,
  options: RemoteRegistrySyncOptions,
): Promise<void> {
  await window.api.skill.writeLocalFile(skillId, "SKILL.md", effectiveContent, {
    skipVersionSnapshot: true,
  });
  await syncRemoteGitHubSkillRepo(
    skillId,
    registrySkill.source_url,
    registrySkill.content_url,
  );
}

async function rollbackCloudPackageWrite(
  skillId: string,
  previousFiles: Array<{ path: string; content: string }>,
  writtenPaths: Set<string>,
): Promise<void> {
  const previousByPath = new Map(
    previousFiles.map((file) => [file.path.toLowerCase(), file]),
  );
  for (const path of writtenPaths) {
    const previous = previousByPath.get(path.toLowerCase());
    try {
      if (previous) {
        await window.api.skill.writeLocalFile(
          skillId,
          previous.path,
          previous.content,
          { skipVersionSnapshot: true },
        );
      } else {
        await window.api.skill.deleteLocalFile(skillId, path);
      }
    } catch (rollbackError) {
      console.warn(
        `Failed to roll back Cloud package file "${path}":`,
        rollbackError,
      );
    }
  }
}

async function syncCloudSkillPackage(
  skillId: string,
  registrySkill: RegistrySkill,
  effectiveContent: string,
  options: RemoteRegistrySyncOptions,
): Promise<void> {
  const packageResponse = await getCloudStorePackage(registrySkill);
  const effectiveCloudContent = getCloudSkillMarkdown(packageResponse);
  const previousFiles = (await window.api.skill.readLocalFiles(skillId))
    .filter((file) => !file.isDirectory)
    .map((file) => ({ path: file.path, content: file.content }));
  const writtenPaths = new Set<string>();
  try {
    for (const file of packageResponse.package.files) {
      writtenPaths.add(file.path);
      await window.api.skill.writeLocalFile(
        skillId,
        file.path,
        file.path.toLowerCase() === "skill.md"
          ? effectiveContent || effectiveCloudContent
          : file.content,
        { skipVersionSnapshot: true },
      );
    }
  } catch (error) {
    await rollbackCloudPackageWrite(skillId, previousFiles, writtenPaths);
    throw error;
  }
}

export async function syncRemoteRegistrySkillRepo(
  skillId: string,
  registrySkill: RegistrySkill,
  effectiveContent: string,
  options: RemoteRegistrySyncOptions = {},
): Promise<Skill | null> {
  if (isCloudRegistrySkill(registrySkill)) {
    await syncCloudSkillPackage(
      skillId,
      registrySkill,
      effectiveContent,
      options,
    );
    return refreshSyncedRegistrySkill(
      skillId,
      registrySkill,
      options.refreshBaseline !== false,
    );
  }
  if (registrySkill.package_url?.trim()) {
    return syncRemoteZipPackage(skillId, registrySkill, options);
  }
  if (shouldCloneRegistrySkillPackage(registrySkill)) {
    return syncRemoteGitPackage(skillId, registrySkill, options);
  }
  await syncRemoteContentUrlSkill(
    skillId,
    registrySkill,
    effectiveContent,
    options,
  );
  return null;
}

async function refreshInstalledContentHashFromSyncedSkill(
  skillId: string,
  syncedSkill: Skill | null | undefined,
  registrySkill: Pick<RegistrySkill, "version">,
): Promise<Skill | null> {
  const content = syncedSkill?.content ?? syncedSkill?.instructions;
  if (typeof content !== "string" || !content.trim())
    return syncedSkill ?? null;
  const contentHash = await computeSkillContentHash(content);
  const checkedAt = Date.now();
  return window.api.skill.update(skillId, {
    installed_content_hash: contentHash,
    installed_version: registrySkill.version,
    ...buildSourceBaselineFields({
      contentHash,
      directoryFingerprint:
        syncedSkill?.directory_fingerprint ||
        syncedSkill?.installed_directory_fingerprint,
      checkedAt,
    }),
  });
}

export async function syncLocalRegistrySkillRepo(
  skillId: string,
  registrySkill: RegistrySkill,
): Promise<Skill | null> {
  const localDir = normalizeLocalRegistryDirectory(registrySkill);
  if (!localDir) return null;
  await window.api.skill.saveToRepo(skillId, localDir, "copy");
  const syncedSkill = await window.api.skill.syncFromRepo(skillId);
  return refreshInstalledContentHashFromSyncedSkill(
    skillId,
    syncedSkill,
    registrySkill,
  );
}

function getCreatedSkillVersionNumber(version: unknown): number | null {
  if (
    typeof version === "object" &&
    version !== null &&
    "version" in version &&
    typeof version.version === "number" &&
    Number.isFinite(version.version)
  ) {
    return version.version;
  }
  return null;
}

async function discardUnchangedSourceUpdateSnapshot(
  skillId: string,
  createdVersion: unknown,
): Promise<void> {
  if (
    typeof createdVersion !== "object" ||
    createdVersion === null ||
    !("id" in createdVersion) ||
    typeof createdVersion.id !== "string"
  ) {
    return;
  }
  try {
    await window.api.skill.versionDelete(skillId, createdVersion.id);
  } catch (error) {
    console.warn(
      `Failed to discard unchanged source update snapshot for "${skillId}":`,
      error,
    );
  }
}

async function rollbackMaterializedSourceUpdate(
  skillId: string,
  createdVersion: unknown,
): Promise<void> {
  const version = getCreatedSkillVersionNumber(createdVersion);
  if (version === null) return;
  try {
    await window.api.skill.versionRollback(skillId, version);
  } catch (error) {
    console.warn(`Failed to roll back source update for "${skillId}":`, error);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
}

type RegistrySkillUpdateOptions = {
  notePrefix: string;
  markAsBuiltin: boolean;
  updateSkill: SkillState["updateSkill"];
  approvedPackageFingerprint?: string;
  safetyScanMode?: SkillSafetyScanMode;
};

type SourceMaterialization = {
  didMaterializeRemoteSource: boolean;
  preSyncedSkill: Skill | null;
};

async function createSourceUpdateSnapshot(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  notePrefix: string,
): Promise<unknown> {
  const snapshot = await window.api.skill.versionCreate(
    installedSkill.id,
    `${notePrefix}: ${installedSkill.version || "unknown"} -> ${registrySkill.version}`,
  );
  scheduleAllSaveSync("skill:create-version");
  return snapshot;
}

async function materializeRemoteSourceBeforeMetadata(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  check: RegistrySkillUpdateCheck,
  approvedPackageFingerprint: string | undefined,
  safetyScanMode?: SkillSafetyScanMode,
): Promise<SourceMaterialization> {
  if (isLocalRegistrySkill(registrySkill)) {
    return { didMaterializeRemoteSource: false, preSyncedSkill: null };
  }
  const preSyncedSkill = await syncRemoteRegistrySkillRepo(
    installedSkill.id,
    registrySkill,
    check.remoteContent,
    {
      refreshBaseline: false,
      approvedPackageFingerprint,
      safetyScanMode,
    },
  );
  return { didMaterializeRemoteSource: true, preSyncedSkill };
}

function getUpdatedSkillContent(
  materialization: SourceMaterialization,
  check: RegistrySkillUpdateCheck,
): string {
  return (
    materialization.preSyncedSkill?.content ??
    materialization.preSyncedSkill?.instructions ??
    check.remoteContent
  );
}

function getUpdatedDirectoryFingerprint(
  materialization: SourceMaterialization,
  check: RegistrySkillUpdateCheck,
  registrySkill: RegistrySkill,
): string | undefined {
  return (
    materialization.preSyncedSkill?.directory_fingerprint ||
    materialization.preSyncedSkill?.installed_directory_fingerprint ||
    check.remoteDirectoryFingerprint ||
    registrySkill.directory_fingerprint
  );
}

function buildRegistrySkillUpdateParams(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  content: string,
  contentHash: string,
  directoryFingerprint: string | undefined,
  updatedAt: number,
  markAsBuiltin: boolean,
): UpdateSkillParams {
  return {
    description: registrySkill.description,
    instructions: content,
    content,
    version: registrySkill.version,
    author: registrySkill.author,
    source_url: registrySkill.source_url,
    source_id: registrySkill.source_id,
    source_label: installedSkill.source_label || registrySkill.source_label,
    source_branch: registrySkill.source_branch,
    source_directory: registrySkill.source_directory,
    canonical_skill_path: registrySkill.canonical_skill_path,
    icon_url: registrySkill.icon_url,
    icon_emoji: registrySkill.icon_emoji,
    icon_background: registrySkill.icon_background,
    category: registrySkill.category,
    is_builtin: markAsBuiltin ? true : installedSkill.is_builtin,
    registry_slug: registrySkill.slug,
    directory_fingerprint: directoryFingerprint,
    content_url: registrySkill.content_url,
    original_tags: registrySkill.tags,
    prerequisites: registrySkill.prerequisites,
    compatibility: registrySkill.compatibility,
    installed_content_hash: contentHash,
    installed_version: registrySkill.version,
    updated_from_store_at: updatedAt,
    ...buildSourceBaselineFields({
      contentHash,
      directoryFingerprint,
      checkedAt: updatedAt,
    }),
  };
}

async function updateInstalledSkillMetadata(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  check: RegistrySkillUpdateCheck,
  options: RegistrySkillUpdateOptions,
  materialization: SourceMaterialization,
): Promise<Skill | null> {
  const content = getUpdatedSkillContent(materialization, check);
  const contentHash = await computeSkillContentHash(content);
  const directoryFingerprint = getUpdatedDirectoryFingerprint(
    materialization,
    check,
    registrySkill,
  );
  return options.updateSkill(
    installedSkill.id,
    buildRegistrySkillUpdateParams(
      installedSkill,
      registrySkill,
      content,
      contentHash,
      directoryFingerprint,
      Date.now(),
      options.markAsBuiltin,
    ),
  );
}

async function syncSourceAfterMetadataUpdate(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  check: RegistrySkillUpdateCheck,
  materialization: SourceMaterialization,
  safetyScanMode?: SkillSafetyScanMode,
): Promise<Skill | null> {
  if (materialization.didMaterializeRemoteSource) return null;
  if (isLocalRegistrySkill(registrySkill)) {
    return syncLocalRegistrySkillRepo(installedSkill.id, registrySkill);
  }
  return syncRemoteRegistrySkillRepo(
    installedSkill.id,
    registrySkill,
    check.remoteContent,
    { safetyScanMode },
  );
}

async function handleSourceUpdateFailure(
  installedSkill: Skill,
  snapshot: unknown,
  materialization: SourceMaterialization,
  error: unknown,
): Promise<void> {
  if (materialization.didMaterializeRemoteSource) {
    await rollbackMaterializedSourceUpdate(installedSkill.id, snapshot);
  }
}

async function handleMissingUpdatedSkill(
  installedSkill: Skill,
  snapshot: unknown,
  materialization: SourceMaterialization,
): Promise<null> {
  if (materialization.didMaterializeRemoteSource) {
    await rollbackMaterializedSourceUpdate(installedSkill.id, snapshot);
  }
  return null;
}

async function executeRegistrySkillUpdate(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  check: RegistrySkillUpdateCheck,
  options: RegistrySkillUpdateOptions,
  snapshot: unknown,
): Promise<Skill | null> {
  let materialization: SourceMaterialization = {
    didMaterializeRemoteSource: false,
    preSyncedSkill: null,
  };
  try {
    materialization = await materializeRemoteSourceBeforeMetadata(
      installedSkill,
      registrySkill,
      check,
      options.approvedPackageFingerprint,
      options.safetyScanMode,
    );
    const updatedSkill = await updateInstalledSkillMetadata(
      installedSkill,
      registrySkill,
      check,
      options,
      materialization,
    );
    if (!updatedSkill) {
      return handleMissingUpdatedSkill(
        installedSkill,
        snapshot,
        materialization,
      );
    }
    const syncedSkill = await syncSourceAfterMetadataUpdate(
      installedSkill,
      registrySkill,
      check,
      materialization,
      options.safetyScanMode,
    );
    return syncedSkill ?? updatedSkill;
  } catch (error) {
    await handleSourceUpdateFailure(
      installedSkill,
      snapshot,
      materialization,
      error,
    );
    throw error;
  }
}

export async function applyRegistrySkillUpdateToInstalledSkill(
  installedSkill: Skill,
  registrySkill: RegistrySkill,
  check: RegistrySkillUpdateCheck,
  options: RegistrySkillUpdateOptions,
): Promise<Skill | null> {
  const snapshot = await createSourceUpdateSnapshot(
    installedSkill,
    registrySkill,
    options.notePrefix,
  );
  return executeRegistrySkillUpdate(
    installedSkill,
    registrySkill,
    check,
    options,
    snapshot,
  );
}
