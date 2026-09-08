import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { readSkillFileSnapshots } from "@prompthub/core/skills/file-snapshot";
import type {
  CreateSkillParams,
  Skill,
  SkillFileSnapshot,
  SkillPackageFileInput,
  SkillPackageOperationRequest,
  SkillSafetyReport,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import {
  buildSkillSourceId,
  shouldIgnoreSkillDirectoryEntry,
} from "@prompthub/shared/utils/skill-identity";
import { normalizeSkillMdForHash } from "@prompthub/core/skills/skill-frontmatter";
import { sanitizeSkillPackageSourceUrl } from "@prompthub/core/skills/package-operation";
import { getSkillsDirAccessor, isPathWithin } from "./skill-installer-internal";
import { computeRepoDirectoryFingerprint } from "./skill-repo-sync";
import { SkillInstaller } from "./skill-installer";
import { validateMaterializedSkillPackage } from "./skill-package-validation";
import { assertStagedRemoteSkillPackageSafe } from "./skill-update-safety";
import {
  PENDING_INSTALL_MARKER,
  type PackageReplacement,
  type PackageRecoveryManifest,
  type SkillPackageLifecycleDependencies,
  type StagedSkillPackage,
} from "./skill-package-lifecycle";
import { getOperationsDir, getRuntimeStorageContext } from "../runtime-paths";

const RECOVERY_FILE = "recovery.json";
const DEFAULT_STAGING_LEASE_MS = 60 * 60 * 1000;

export interface SkillPackageRecoveryDatabase {
  getById: (id: string) => Skill | null;
  getBySourceId: (sourceId: string) => Skill | null;
  getAll: () => Skill[];
  create: (data: CreateSkillParams) => Skill;
  update: (id: string, data: UpdateSkillParams) => Skill | null;
  delete: (id: string) => boolean;
  finalizePackageInstall: (
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[],
  ) => { skill: Skill; version: SkillVersion } | null;
  finalizePackageUpdate: (
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[] | undefined,
    expectedSkill?: Skill,
  ) => { skill: Skill; version: SkillVersion } | null;
}

type DesktopLifecycleOptions = {
  skillsDir?: string;
};

type CleanupOptions = DesktopLifecycleOptions & {
  now?: () => number;
  leaseMs?: number;
  recoverAll?: boolean;
};

type RemotePackageSource = Extract<
  SkillPackageOperationRequest["source"],
  { kind: "remote-git" | "remote-zip" }
>;

type NonRemotePackageSource = Exclude<
  SkillPackageOperationRequest["source"],
  RemotePackageSource
>;

export function getSkillPackageLifecycleRoot(
  skillsDir = getSkillsDirAccessor(),
): string {
  return path.join(skillsDir, ".package-lifecycle");
}

function getSourceUrl(request: SkillPackageOperationRequest): string {
  switch (request.source.kind) {
    case "remote-git":
      return request.source.repoUrl;
    case "remote-zip":
      return request.source.zipUrl;
    case "content":
    case "files":
      return request.source.sourceUrl;
    case "local-directory":
      return request.source.directory;
  }
}

function deriveSourceId(request: SkillPackageOperationRequest): string {
  if (request.registrySkill.source_id?.trim()) {
    return request.registrySkill.source_id.trim();
  }
  return buildSkillSourceId({
    sourceType: request.source.kind,
    sourceUrl:
      request.source.kind === "local-directory"
        ? getSourceUrl(request)
        : sanitizeSkillPackageSourceUrl(getSourceUrl(request)),
    branch:
      request.source.kind === "remote-git" ? request.source.branch : undefined,
    directory:
      request.source.kind === "remote-git"
        ? request.source.directory
        : request.source.kind === "local-directory"
          ? request.source.directory
          : undefined,
    skillPath:
      request.registrySkill.canonical_skill_path ||
      (request.source.kind === "remote-git"
        ? request.source.skillName
        : undefined),
  });
}

function createStageSkill(
  request: SkillPackageOperationRequest,
  sourceId: string,
): Skill {
  const now = Date.now();
  return {
    id: `stage-${randomUUID()}`,
    name: request.registrySkill.install_name || request.registrySkill.slug,
    content: request.content,
    instructions: request.content,
    protocol_type: "skill",
    source_id: sourceId,
    source_url: request.registrySkill.source_url,
    source_directory: request.registrySkill.source_directory,
    logical_name: request.registrySkill.name,
    is_favorite: false,
    created_at: now,
    updated_at: now,
  };
}

async function writePackageFiles(
  repoPath: string,
  files: SkillPackageFileInput[],
): Promise<void> {
  await fs.mkdir(repoPath, { recursive: true });
  for (const file of files) {
    if (shouldIgnoreSkillDirectoryEntry(file.path)) continue;
    const targetPath = path.resolve(repoPath, file.path);
    if (!isPathWithin(repoPath, targetPath)) {
      throw new Error(`Path traversal detected in package file: ${file.path}`);
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, file.content, "utf8");
  }
}

async function materializeNonRemoteSource(
  source: NonRemotePackageSource,
  stagingRoot: string,
): Promise<string> {
  if (source.kind === "local-directory") {
    return SkillInstaller.copyRepoByPathToDirectory(
      source.directory,
      "repo",
      stagingRoot,
      { ifExists: "error" },
    );
  }
  const repoPath = path.join(stagingRoot, "repo");
  const files =
    source.kind === "files"
      ? source.files
      : [
          {
            path: "SKILL.md",
            content: source.content,
          },
        ];
  await writePackageFiles(repoPath, files);
  return repoPath;
}

async function materializeRemoteSource(
  request: SkillPackageOperationRequest,
  source: RemotePackageSource,
  stagingRoot: string,
  stageSkill: Skill,
  onSafetyReport: (report: SkillSafetyReport) => void,
): Promise<string> {
  if (source.kind === "remote-git") {
    return SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId(stageSkill, {
      repoUrl: source.repoUrl,
      branch: source.branch,
      directory: source.directory,
      skillName: source.skillName,
      safetyScan: request.safetyScan,
      approvedPackageFingerprint: request.approvedPackageFingerprint,
      targetRootDir: stagingRoot,
      onSafetyReport,
    });
  }
  return SkillInstaller.saveRemoteZipSkillToLocalRepoBySkillId(stageSkill, {
    zipUrl: source.zipUrl,
    safetyScan: request.safetyScan,
    approvedPackageFingerprint: request.approvedPackageFingerprint,
    targetRootDir: stagingRoot,
    onSafetyReport,
  });
}

function isRemotePackageSource(
  source: SkillPackageOperationRequest["source"],
): source is RemotePackageSource {
  return source.kind === "remote-git" || source.kind === "remote-zip";
}

function computeContentHash(content: string): string {
  return createHash("sha256")
    .update(normalizeSkillMdForHash(content), "utf8")
    .digest("hex");
}

async function scanNonRemoteStage(
  request: SkillPackageOperationRequest,
  sourceId: string,
  repoPath: string,
  directoryFingerprint: string,
  stageSkill: Skill,
): Promise<SkillSafetyReport | undefined> {
  return assertStagedRemoteSkillPackageSafe({
    skill: stageSkill,
    skillDir: repoPath,
    sourceUrl: getSourceUrl(request),
    safetyScan: request.safetyScan,
    packageFingerprint: directoryFingerprint,
    approvedPackageFingerprint: request.approvedPackageFingerprint,
    sourceKey: sourceId,
  });
}

async function stagePackage(
  request: SkillPackageOperationRequest,
  context: { stagingRoot: string; sourceId: string },
): Promise<StagedSkillPackage> {
  const stageSkill = createStageSkill(request, context.sourceId);
  let safetyReport: SkillSafetyReport | undefined;
  const source = request.source;
  const remote = isRemotePackageSource(source);
  const repoPath = remote
    ? await materializeRemoteSource(
        request,
        source,
        context.stagingRoot,
        stageSkill,
        (report) => {
          safetyReport = report;
        },
      )
    : await materializeNonRemoteSource(source, context.stagingRoot);
  await validateMaterializedSkillPackage(repoPath);
  const directoryFingerprint = await computeRepoDirectoryFingerprint(repoPath);
  if (!remote) {
    safetyReport = await scanNonRemoteStage(
      request,
      context.sourceId,
      repoPath,
      directoryFingerprint,
      stageSkill,
    );
  }
  const content = await fs.readFile(path.join(repoPath, "SKILL.md"), "utf8");
  return {
    repoPath,
    content,
    contentHash: computeContentHash(content),
    directoryFingerprint,
    safetyReport,
  };
}

async function createStagingRoot(skillsDir: string): Promise<string> {
  const lifecycleRoot = getSkillPackageLifecycleRoot(skillsDir);
  await fs.mkdir(lifecycleRoot, { recursive: true });
  return fs.mkdtemp(path.join(lifecycleRoot, "op-"));
}

async function createCanonicalStagingRoot(): Promise<string> {
  const lifecycleRoot = path.join(
    getOperationsDir(),
    "skill-package-lifecycle",
  );
  await fs.mkdir(lifecycleRoot, { recursive: true });
  return fs.mkdtemp(path.join(lifecycleRoot, "op-"));
}

function beginCanonicalPublication(
  stagedRepoPath: string,
): Promise<PackageReplacement> {
  return Promise.resolve({
    repoPath: stagedRepoPath,
    recovery: { repoPath: stagedRepoPath, hadOriginal: false },
    commit: () => Promise.resolve(),
    rollback: () => Promise.resolve(),
  });
}

async function writeRecoveryManifest(
  stagingRoot: string,
  manifest: PackageRecoveryManifest,
): Promise<void> {
  const target = path.join(stagingRoot, RECOVERY_FILE);
  const temporary = `${target}.tmp`;
  await fs.writeFile(
    temporary,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(temporary, target);
}

async function readFilesSnapshot(
  repoPath: string,
): Promise<SkillFileSnapshot[]> {
  return readSkillFileSnapshots(repoPath);
}

function isRecoveryManifest(value: unknown): value is PackageRecoveryManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<PackageRecoveryManifest>;
  return (
    ["install", "update"].includes(item.operation ?? "") &&
    typeof item.skillId === "string" &&
    typeof item.expectedFingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(item.expectedFingerprint) &&
    typeof item.repoPath === "string" &&
    typeof item.hadOriginal === "boolean" &&
    (item.hadOriginal
      ? typeof item.backupPath === "string"
      : item.backupPath === undefined)
  );
}

function hasValidRecoveryPaths(
  manifest: PackageRecoveryManifest,
  skillsDir: string,
): boolean {
  if (!path.isAbsolute(manifest.repoPath)) return false;
  const relativeRepo = path.relative(
    path.resolve(skillsDir),
    path.resolve(manifest.repoPath),
  );
  const parts = relativeRepo.split(path.sep);
  if (
    parts.length !== 2 ||
    !parts[0] ||
    parts[0].startsWith(".") ||
    parts[1] !== "repo"
  ) {
    return false;
  }
  if (!manifest.backupPath) return true;
  return (
    path.isAbsolute(manifest.backupPath) &&
    path.dirname(manifest.backupPath) === path.dirname(manifest.repoPath) &&
    path.basename(manifest.backupPath).startsWith("repo.old-")
  );
}

async function lstatIfPresent(targetPath: string) {
  return fs.lstat(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

async function hasSafeRecoveryFilesystemPaths(
  manifest: PackageRecoveryManifest,
  skillsDir: string,
): Promise<boolean> {
  const containerDir = path.dirname(manifest.repoPath);
  const containerStat = await lstatIfPresent(containerDir);
  if (containerStat?.isSymbolicLink()) return false;
  const repoStat = await lstatIfPresent(manifest.repoPath);
  if (repoStat?.isSymbolicLink()) return false;
  if (manifest.backupPath) {
    const backupStat = await lstatIfPresent(manifest.backupPath);
    if (backupStat?.isSymbolicLink()) return false;
  }
  if (!containerStat) return true;
  const realSkillsDir = await fs.realpath(path.resolve(skillsDir));
  const realContainer = await fs.realpath(containerDir);
  return path.dirname(realContainer) === realSkillsDir;
}

async function readRecoveryManifest(
  operationRoot: string,
  skillsDir: string,
): Promise<PackageRecoveryManifest | null> {
  try {
    const raw = await fs.readFile(
      path.join(operationRoot, RECOVERY_FILE),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    if (!isRecoveryManifest(parsed)) return null;
    if (!hasValidRecoveryPaths(parsed, skillsDir)) return null;
    return (await hasSafeRecoveryFilesystemPaths(parsed, skillsDir))
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function commitRecoveredReplacement(
  manifest: PackageRecoveryManifest,
): Promise<void> {
  if (manifest.backupPath) {
    await fs.rm(manifest.backupPath, { recursive: true, force: true });
  }
}

async function rollbackRecoveredReplacement(
  manifest: PackageRecoveryManifest,
): Promise<void> {
  if (manifest.hadOriginal) {
    if (!(await pathExists(manifest.backupPath!))) {
      throw new Error("Replacement backup is missing");
    }
    await fs.rm(manifest.repoPath, { recursive: true, force: true });
    await fs.rename(manifest.backupPath!, manifest.repoPath);
    return;
  }
  await fs.rm(manifest.repoPath, { recursive: true, force: true });
}

async function repoMatchesInstalledBaseline(
  skill: Skill,
  repoPath: string,
): Promise<boolean> {
  if (!skill.installed_directory_fingerprint || !(await pathExists(repoPath))) {
    return false;
  }
  return (
    (await computeRepoDirectoryFingerprint(repoPath)) ===
    skill.installed_directory_fingerprint
  );
}

async function recoverInstall(
  db: SkillPackageRecoveryDatabase,
  skill: Skill | null,
  manifest: PackageRecoveryManifest,
): Promise<void> {
  if (skill?.installed_directory_fingerprint === manifest.expectedFingerprint) {
    await commitRecoveredReplacement(manifest);
    return;
  }
  if (skill?.source_last_error === PENDING_INSTALL_MARKER) {
    await rollbackRecoveredReplacement(manifest);
    if (!manifest.hadOriginal) {
      await fs.rm(path.dirname(manifest.repoPath), {
        recursive: true,
        force: true,
      });
    }
    if (!db.delete(skill.id))
      throw new Error("Pending install row cleanup failed");
    return;
  }
  if (!skill) {
    await rollbackRecoveredReplacement(manifest);
    if (!manifest.hadOriginal) {
      await fs.rm(path.dirname(manifest.repoPath), {
        recursive: true,
        force: true,
      });
    }
    return;
  }
  throw new Error("Install recovery state is ambiguous");
}

async function recoverUpdate(
  skill: Skill | null,
  manifest: PackageRecoveryManifest,
): Promise<void> {
  if (skill?.installed_directory_fingerprint === manifest.expectedFingerprint) {
    await commitRecoveredReplacement(manifest);
    return;
  }
  if (skill && (await repoMatchesInstalledBaseline(skill, manifest.repoPath))) {
    await commitRecoveredReplacement(manifest);
    return;
  }
  await rollbackRecoveredReplacement(manifest);
}

async function recoverOperationRoot(
  db: SkillPackageRecoveryDatabase,
  operationRoot: string,
  skillsDir: string,
): Promise<void> {
  const manifest = await readRecoveryManifest(operationRoot, skillsDir);
  if (!manifest) {
    await fs.rm(operationRoot, { recursive: true, force: true });
    return;
  }
  const skill = db.getById(manifest.skillId);
  if (manifest.operation === "install") {
    await recoverInstall(db, skill, manifest);
  } else {
    await recoverUpdate(skill, manifest);
  }
  await fs.rm(operationRoot, { recursive: true, force: true });
}

async function getOldOperationRoots(
  lifecycleRoot: string,
  now: number,
  leaseMs: number,
  recoverAll: boolean,
): Promise<string[]> {
  const entries = await fs
    .readdir(lifecycleRoot, { withFileTypes: true })
    .catch(() => []);
  const roots: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("op-")) continue;
    const operationRoot = path.join(lifecycleRoot, entry.name);
    const stat = await fs.stat(operationRoot).catch(() => null);
    if (stat && (recoverAll || now - stat.mtimeMs >= leaseMs)) {
      roots.push(operationRoot);
    }
  }
  return roots;
}

async function getManifestSkillIds(
  lifecycleRoot: string,
  skillsDir: string,
): Promise<Set<string>> {
  const entries = await fs
    .readdir(lifecycleRoot, { withFileTypes: true })
    .catch(() => []);
  const skillIds = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("op-")) continue;
    const manifest = await readRecoveryManifest(
      path.join(lifecycleRoot, entry.name),
      skillsDir,
    );
    if (manifest) skillIds.add(manifest.skillId);
  }
  return skillIds;
}

function isExpiredPendingInstall(
  skill: Skill,
  now: number,
  leaseMs: number,
): boolean {
  return (
    skill.source_last_error === PENDING_INSTALL_MARKER &&
    now - skill.created_at >= leaseMs
  );
}

function cleanupExpiredPendingInstallRows(
  db: SkillPackageRecoveryDatabase,
  now: number,
  leaseMs: number,
  referencedSkillIds: Set<string>,
  recoverAll: boolean,
): void {
  for (const skill of db.getAll()) {
    if (
      (!recoverAll && !isExpiredPendingInstall(skill, now, leaseMs)) ||
      skill.source_last_error !== PENDING_INSTALL_MARKER ||
      referencedSkillIds.has(skill.id)
    ) {
      continue;
    }
    if (!db.delete(skill.id)) {
      console.warn(`Failed to remove abandoned pending Skill row: ${skill.id}`);
    }
  }
}

/** Recover only expired operation roots; fresh roots may belong to live calls. */
export async function cleanupAbandonedSkillPackageOperations(
  db: SkillPackageRecoveryDatabase,
  options: CleanupOptions = {},
): Promise<void> {
  const skillsDir = options.skillsDir ?? getSkillsDirAccessor();
  const canonical =
    options.skillsDir === undefined &&
    getRuntimeStorageContext().localAuthority === "canonical-files";
  const lifecycleRoot = canonical
    ? path.join(getOperationsDir(), "skill-package-lifecycle")
    : getSkillPackageLifecycleRoot(skillsDir);
  const now = (options.now ?? Date.now)();
  const leaseMs = options.leaseMs ?? DEFAULT_STAGING_LEASE_MS;
  const recoverAll = options.recoverAll === true;
  const roots = await getOldOperationRoots(
    lifecycleRoot,
    now,
    leaseMs,
    recoverAll,
  );
  for (const operationRoot of roots) {
    await recoverOperationRoot(db, operationRoot, skillsDir).catch((error) => {
      console.warn(
        "Failed to recover abandoned Skill package operation:",
        error,
      );
    });
  }
  const referencedSkillIds = await getManifestSkillIds(
    lifecycleRoot,
    skillsDir,
  );
  cleanupExpiredPendingInstallRows(
    db,
    now,
    leaseMs,
    referencedSkillIds,
    recoverAll,
  );
}

/** Bind the generic lifecycle service to Desktop filesystem and SkillDB APIs. */
export function createDesktopSkillPackageLifecycleDependencies(
  db: SkillPackageRecoveryDatabase,
  options: DesktopLifecycleOptions = {},
): SkillPackageLifecycleDependencies {
  const skillsDir = options.skillsDir ?? getSkillsDirAccessor();
  const canonical =
    options.skillsDir === undefined &&
    getRuntimeStorageContext().localAuthority === "canonical-files";
  return {
    db,
    createStagingRoot: () =>
      canonical ? createCanonicalStagingRoot() : createStagingRoot(skillsDir),
    stagePackage,
    beginReplacement: canonical
      ? (_skill, stagedRepoPath) => beginCanonicalPublication(stagedRepoPath)
      : (skill, stagedRepoPath, beforeApply) =>
          SkillInstaller.beginManagedRepoReplacement(
            skill,
            stagedRepoPath,
            beforeApply,
          ),
    readFilesSnapshot,
    deleteManagedContainer: canonical
      ? () => Promise.resolve()
      : (skill) => SkillInstaller.deleteManagedVariantContainer(skill),
    recordReplacement: writeRecoveryManifest,
    cleanupStagingRoot: (stagingRoot) =>
      recoverOperationRoot(db, stagingRoot, skillsDir),
    deriveSourceId,
    now: Date.now,
  };
}
