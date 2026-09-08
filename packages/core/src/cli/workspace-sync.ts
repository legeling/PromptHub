import fs from "fs";
import path from "path";

import {
  isDatabaseEmpty,
  PromptOutputFormatDB,
  PromptRelationDB,
  type DatabaseAdapter,
  type FolderDB,
  type PromptDB,
  type SkillDB,
} from "../database";
import { publishCanonicalPromptGraph } from "../canonical-prompt-graph-db";
import { CoreMcpLibraryService, getMcpLibraryFilePath } from "../mcp-library";
import {
  CorePluginLibraryService,
  getPluginLibraryFilePath,
} from "../plugin-library";
import { coreRulesWorkspaceService } from "../rules-workspace-default";
import { getImagesDir, getVideosDir } from "../runtime-paths";
import { hasEncodedSkillSnapshots, SKILL_SNAPSHOT_SYNC_VERSION, validateSkillFileSnapshots } from "@prompthub/shared/utils/skill-file-snapshot";
import type {
  AgentAssetFileSnapshot,
  AgentAssetFilesSnapshot,
  SyncSnapshot,
} from "@prompthub/shared/types/sync";
import type {
  OutputFormatItem,
  PromptRelation,
  PromptVersion,
  SkillFileSnapshot,
} from "@prompthub/shared/types";
import type { McpLibraryFile } from "@prompthub/shared/types/mcp";
import {
  mergeMcpLibraryFromTransport,
  redactMcpLibraryForTransport,
} from "@prompthub/shared/utils/mcp-config";
import { coreCliSkillService, type CliSkillService } from "./skill";

const WORKSPACE_BUNDLE_KIND = "prompthub-cli-workspace";
const WORKSPACE_BUNDLE_VERSION = 2;
const MAX_AGENT_ASSET_FILE_BYTES = 5 * 1024 * 1024;
const MAX_AGENT_ASSET_FILE_COUNT = 5000;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);

export interface CliWorkspaceBundleV2 {
  kind: typeof WORKSPACE_BUNDLE_KIND;
  version: typeof WORKSPACE_BUNDLE_VERSION | 3;
  exportedAt: string;
  payload: SyncSnapshot;
}

interface LegacyCliWorkspaceBundleV1 {
  kind: typeof WORKSPACE_BUNDLE_KIND;
  version: 1;
  exportedAt: string;
  prompts: SyncSnapshot["prompts"];
  folders: SyncSnapshot["folders"];
  versions: PromptVersion[];
}

export interface CliWorkspaceSummary {
  prompts: number;
  folders: number;
  versions: number;
  rules: number;
  skills: number;
  skillVersions: number;
  skillFiles: number;
  promptRelations: number;
  outputFormatItems: number;
  mcpServers: number;
  plugins: number;
}

export interface ParsedCliWorkspaceBundle {
  exportedAt: string;
  payload: SyncSnapshot;
  legacyVersion: 1 | 2 | 3 | "raw-sync";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRelativePath(relativePath: string): string {
  if (/[\u0000-\u001F\u007F]/u.test(relativePath)) {
    throw new Error(
      `Agent asset path contains control characters: ${relativePath}`,
    );
  }

  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  const withoutPrefix = normalized.replace(/^\.\//, "");
  if (
    !withoutPrefix ||
    withoutPrefix === "." ||
    withoutPrefix === ".." ||
    withoutPrefix.startsWith("../") ||
    path.posix.isAbsolute(withoutPrefix) ||
    /^[a-zA-Z]:/u.test(relativePath)
  ) {
    throw new Error(`Unsafe agent asset path: ${relativePath}`);
  }
  return withoutPrefix;
}

function ensureInsideDirectory(rootDir: string, candidatePath: string): void {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(
      `Refusing to write outside agent asset directory: ${candidate}`,
    );
  }
}

function exportAgentAssetDirectorySnapshot(
  rootDir: string,
): AgentAssetFileSnapshot[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files: AgentAssetFileSnapshot[] = [];
  const queue = [path.resolve(rootDir)];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_AGENT_ASSET_FILE_BYTES) {
        throw new Error(`Agent asset file exceeds sync limit: ${entry.name}`);
      }
      if (files.length >= MAX_AGENT_ASSET_FILE_COUNT) {
        throw new Error(
          `Agent asset file count exceeds sync limit: ${rootDir}`,
        );
      }

      files.push({
        relativePath: normalizeRelativePath(path.relative(rootDir, fullPath)),
        contentBase64: fs.readFileSync(fullPath).toString("base64"),
        size: stat.size,
      });
    }
  }
  return files;
}

function restoreAgentAssetDirectorySnapshot(
  rootDir: string,
  files: AgentAssetFileSnapshot[],
): void {
  const tempDir = `${rootDir}.sync-tmp-${process.pid}-${Date.now()}`;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    for (const file of files) {
      const relativePath = normalizeRelativePath(file.relativePath);
      const targetPath = path.join(tempDir, ...relativePath.split("/"));
      ensureInsideDirectory(tempDir, targetPath);
      const content = Buffer.from(file.contentBase64, "base64");
      if (content.length !== file.size) {
        throw new Error(`Agent asset file size mismatch: ${relativePath}`);
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);
    }

    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(rootDir), { recursive: true });
    fs.renameSync(tempDir, rootDir);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function readMediaDirectory(dir: string): Record<string, string> | undefined {
  if (!fs.existsSync(dir)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    result[entry.name] = fs.readFileSync(filePath).toString("base64");
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function writeMediaDirectory(
  dir: string,
  files: Record<string, string> | undefined,
): void {
  if (!files) {
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const [fileName, contentBase64] of Object.entries(files)) {
    const relativePath = normalizeRelativePath(fileName);
    if (relativePath.includes("/")) {
      throw new Error(`Unsafe media file name: ${fileName}`);
    }
    fs.writeFileSync(
      path.join(dir, relativePath),
      Buffer.from(contentBase64, "base64"),
    );
  }
}

function createAgentAssetFilesSnapshot(): AgentAssetFilesSnapshot | undefined {
  const mcp = redactMcpAssetFiles(
    exportAgentAssetDirectorySnapshot(path.dirname(getMcpLibraryFilePath())),
  );
  const plugins = exportAgentAssetDirectorySnapshot(
    path.dirname(getPluginLibraryFilePath()),
  );
  const snapshot: AgentAssetFilesSnapshot = {};
  if (mcp.length > 0) snapshot.mcp = mcp;
  if (plugins.length > 0) snapshot.plugins = plugins;
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

function encodeMcpLibraryAssetSnapshot(
  library: McpLibraryFile,
  original: AgentAssetFileSnapshot,
  redactValues = true,
): AgentAssetFileSnapshot {
  const content = Buffer.from(
    `${JSON.stringify(
      redactValues ? redactMcpLibraryForTransport(library) : library,
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    ...original,
    contentBase64: content.toString("base64"),
    size: content.length,
  };
}

function redactMcpAssetFiles(
  files: AgentAssetFileSnapshot[],
): AgentAssetFileSnapshot[] {
  return files.map((file) => {
    if (file.relativePath !== "library.json") return file;
    try {
      const library = JSON.parse(
        Buffer.from(file.contentBase64, "base64").toString("utf8"),
      ) as McpLibraryFile;
      return encodeMcpLibraryAssetSnapshot(library, file);
    } catch {
      return file;
    }
  });
}

function mergeMcpAssetFiles(
  files: AgentAssetFileSnapshot[],
  local: McpLibraryFile,
): AgentAssetFileSnapshot[] {
  return files.map((file) => {
    if (file.relativePath !== "library.json") return file;
    try {
      const incoming = JSON.parse(
        Buffer.from(file.contentBase64, "base64").toString("utf8"),
      ) as McpLibraryFile;
      return encodeMcpLibraryAssetSnapshot(
        mergeMcpLibraryFromTransport(local, incoming),
        file,
        false,
      );
    } catch {
      return file;
    }
  });
}

export function createCliWorkspaceSummary(
  snapshot: SyncSnapshot,
): CliWorkspaceSummary {
  const skillFileCount = snapshot.skillFiles
    ? Object.values(snapshot.skillFiles).reduce(
        (total, files) => total + (files?.length ?? 0),
        0,
      )
    : 0;
  return {
    prompts: snapshot.prompts.length,
    folders: snapshot.folders.length,
    versions: (snapshot.versions ?? snapshot.promptVersions).length,
    rules: snapshot.rules?.length ?? 0,
    skills: snapshot.skills.length,
    skillVersions: snapshot.skillVersions.length,
    skillFiles: skillFileCount,
    promptRelations: snapshot.promptRelations?.length ?? 0,
    outputFormatItems: snapshot.outputFormatItems?.length ?? 0,
    mcpServers: snapshot.mcpLibrary?.servers.length ?? 0,
    plugins: snapshot.pluginLibrary?.plugins.length ?? 0,
  };
}

async function collectSkillFilesSnapshot(
  skillDb: SkillDB,
  skillService: CliSkillService,
): Promise<Record<string, SkillFileSnapshot[]> | undefined> {
  const skills = skillDb.getAll();
  const skillFiles: Record<string, SkillFileSnapshot[]> = {};
  for (const skill of skills) {
    const files = await skillService.readCurrentFilesSnapshot(skillDb, skill.id);
    if (files && files.length > 0) {
      skillFiles[skill.id] = files;
    }
  }
  return Object.keys(skillFiles).length > 0 ? skillFiles : undefined;
}

export async function createCliWorkspaceBundle(
  promptDb: PromptDB,
  folderDb: FolderDB,
  skillDb: SkillDB,
  skillService: CliSkillService = coreCliSkillService,
  db?: DatabaseAdapter.Database,
): Promise<CliWorkspaceBundleV2> {
  const prompts = promptDb.getAll();
  const promptVersions = prompts.flatMap((prompt) =>
    promptDb.getVersions(prompt.id),
  );
  const skills = skillDb.getAll();
  const skillVersions = skills.flatMap((skill) =>
    skillDb.getVersions(skill.id),
  );
  const pluginSnapshot = new CorePluginLibraryService().exportSnapshot();
  const skillFiles = await collectSkillFilesSnapshot(skillDb, skillService);
  const relationDb = db ? new PromptRelationDB(db) : null;
  const outputFormatDb = db ? new PromptOutputFormatDB(db) : null;
  const promptRelations = relationDb?.list() ?? [];
  const outputFormatItems = outputFormatDb?.list() ?? [];
  const exportedAt = new Date().toISOString();
  const payload: SyncSnapshot = {
    version: hasEncodedSkillSnapshots({ skillFiles, skillVersions }) ? SKILL_SNAPSHOT_SYNC_VERSION : "prompthub-cli-workspace-v2",
    exportedAt,
    prompts,
    promptVersions,
    versions: promptVersions,
    folders: folderDb.getAll(),
    rules: await coreRulesWorkspaceService.exportRuleBackupRecords(),
    skills,
    skillVersions,
    ...(skillFiles && { skillFiles }),
    ...(promptRelations.length > 0 && { promptRelations }),
    ...(outputFormatItems.length > 0 && { outputFormatItems }),
    mcpLibrary: redactMcpLibraryForTransport(
      new CoreMcpLibraryService().read(),
    ),
    pluginLibrary: pluginSnapshot.library,
    pluginPackages: pluginSnapshot.packages,
    agentAssetFiles: createAgentAssetFilesSnapshot(),
    images: readMediaDirectory(getImagesDir()),
    videos: readMediaDirectory(getVideosDir()),
  };

  return {
    kind: WORKSPACE_BUNDLE_KIND,
    version: hasEncodedSkillSnapshots(payload) ? 3 : WORKSPACE_BUNDLE_VERSION,
    exportedAt,
    payload,
  };
}

function snapshotFromLegacyBundle(
  bundle: LegacyCliWorkspaceBundleV1,
): SyncSnapshot {
  return {
    version: "prompthub-cli-workspace-v1",
    exportedAt: bundle.exportedAt,
    prompts: bundle.prompts,
    promptVersions: bundle.versions,
    versions: bundle.versions,
    folders: bundle.folders,
    rules: [],
    skills: [],
    skillVersions: [],
  };
}

function assertSyncSnapshotShape(value: Record<string, unknown>): SyncSnapshot {
  const skillFiles = value.skillFiles as SyncSnapshot["skillFiles"];
  for (const files of Object.values(skillFiles ?? {})) validateSkillFileSnapshots(files);
  if (Array.isArray(value.skillVersions)) {
    for (const version of value.skillVersions) {
      if (version.filesSnapshot !== undefined) validateSkillFileSnapshots(version.filesSnapshot);
    }
  }
  if (
    typeof value.version !== "string" ||
    typeof value.exportedAt !== "string" ||
    !Array.isArray(value.prompts) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.skills)
  ) {
    throw new Error("workspace import file has invalid SyncSnapshot shape");
  }
  const promptVersions = Array.isArray(value.promptVersions)
    ? value.promptVersions
    : Array.isArray(value.versions)
      ? value.versions
      : [];
  return {
    ...(value as unknown as SyncSnapshot),
    promptVersions: promptVersions as PromptVersion[],
    versions: (Array.isArray(value.versions)
      ? value.versions
      : promptVersions) as PromptVersion[],
    skillVersions: Array.isArray(value.skillVersions)
      ? (value.skillVersions as SyncSnapshot["skillVersions"])
      : [],
  };
}

export function parseCliWorkspaceBundle(
  text: string,
): ParsedCliWorkspaceBundle {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("workspace import file must be a JSON object");
  }

  if (
    parsed.kind === WORKSPACE_BUNDLE_KIND &&
    parsed.version === 1 &&
    Array.isArray(parsed.prompts) &&
    Array.isArray(parsed.folders) &&
    Array.isArray(parsed.versions)
  ) {
    const legacy = parsed as unknown as LegacyCliWorkspaceBundleV1;
    return {
      exportedAt: legacy.exportedAt,
      payload: snapshotFromLegacyBundle(legacy),
      legacyVersion: 1,
    };
  }

  if (
    parsed.kind === WORKSPACE_BUNDLE_KIND &&
    (parsed.version === 2 || parsed.version === 3) &&
    isRecord(parsed.payload)
  ) {
    const payload = assertSyncSnapshotShape(parsed.payload);
    return {
      exportedAt:
        typeof parsed.exportedAt === "string"
          ? parsed.exportedAt
          : payload.exportedAt,
      payload,
      legacyVersion: parsed.version,
    };
  }

  if (typeof parsed.version === "string" && Array.isArray(parsed.prompts)) {
    const payload = assertSyncSnapshotShape(parsed);
    return {
      exportedAt: payload.exportedAt,
      payload,
      legacyVersion: "raw-sync",
    };
  }

  throw new Error("workspace import file format is unsupported");
}

export function clearCliWorkspaceData(db: DatabaseAdapter.Database): void {
  const transaction = db.transaction(() => {
    // Child tables first when FK is enabled.
    db.prepare("DELETE FROM prompt_relations").run();
    db.prepare("DELETE FROM prompt_output_format_items").run();
    db.prepare("DELETE FROM prompt_versions").run();
    db.prepare("DELETE FROM prompts").run();
    db.prepare("DELETE FROM folders").run();
    db.prepare("DELETE FROM skill_versions").run();
    db.prepare("DELETE FROM skills").run();
  });
  transaction();
}

export async function hasCliWorkspaceData(
  db: DatabaseAdapter.Database,
): Promise<boolean> {
  if (!isDatabaseEmpty(db)) {
    return true;
  }
  if ((await coreRulesWorkspaceService.exportRuleBackupRecords()).length > 0) {
    return true;
  }
  if (new CoreMcpLibraryService().read().servers.length > 0) {
    return true;
  }
  if (new CorePluginLibraryService().read().plugins.length > 0) {
    return true;
  }
  return false;
}

function restorePromptRelations(
  db: DatabaseAdapter.Database,
  relations: PromptRelation[] | undefined,
): void {
  if (!relations?.length) {
    return;
  }
  const relationDb = new PromptRelationDB(db);
  for (const relation of relations) {
    relationDb.insertRelationDirect(relation);
  }
}

function restoreOutputFormatItems(
  db: DatabaseAdapter.Database,
  items: OutputFormatItem[] | undefined,
): void {
  if (!items?.length) {
    return;
  }
  const outputFormatDb = new PromptOutputFormatDB(db);
  for (const item of items) {
    outputFormatDb.insertItemDirect(item);
  }
}

async function restoreSkillFiles(
  skillDb: SkillDB,
  skillFiles: Record<string, SkillFileSnapshot[]> | undefined,
  skillService: CliSkillService,
): Promise<void> {
  if (!skillFiles) {
    return;
  }
  for (const [skillId, files] of Object.entries(skillFiles)) {
    if (!files?.length) {
      continue;
    }
    if (!skillDb.getById(skillId)) {
      continue;
    }
    await skillService.replaceRepoFiles(skillDb, skillId, files);
  }
}

function orderByParentFirst<T extends { id: string; parentId?: string | null }>(
  items: T[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: T[] = [];

  const visit = (id: string): void => {
    if (visited.has(id) || !byId.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      // Cycle: insert remaining nodes without parent ordering.
      return;
    }
    visiting.add(id);
    const item = byId.get(id);
    if (item?.parentId) {
      visit(item.parentId);
    }
    visiting.delete(id);
    visited.add(id);
    if (item) {
      ordered.push(item);
    }
  };

  for (const item of items) {
    visit(item.id);
  }
  return ordered;
}

export async function restoreCliWorkspaceSnapshot(
  snapshot: SyncSnapshot,
  dbs: {
    promptDb: PromptDB;
    folderDb: FolderDB;
    skillDb: SkillDB;
  },
  options: {
    db?: DatabaseAdapter.Database;
    skillService?: CliSkillService;
  } = {},
): Promise<CliWorkspaceSummary> {
  const skillService = options.skillService ?? coreCliSkillService;

  for (const folder of orderByParentFirst(snapshot.folders)) {
    dbs.folderDb.insertFolderDirect(folder);
  }
  for (const prompt of orderByParentFirst(snapshot.prompts)) {
    dbs.promptDb.insertPromptDirect(prompt);
  }
  for (const version of snapshot.versions ?? snapshot.promptVersions) {
    dbs.promptDb.insertVersionDirect(version);
  }
  for (const skill of snapshot.skills) {
    // Drop host-specific paths; skillFiles restore recreates managed repos.
    dbs.skillDb.insertSkillDirect({
      ...skill,
      local_repo_path: undefined,
    });
  }
  for (const version of snapshot.skillVersions) {
    dbs.skillDb.insertVersionDirect(version);
  }

  if (options.db) {
    restorePromptRelations(options.db, snapshot.promptRelations);
    restoreOutputFormatItems(options.db, snapshot.outputFormatItems);
  }

  await restoreSkillFiles(dbs.skillDb, snapshot.skillFiles, skillService);

  if (snapshot.rules) {
    await coreRulesWorkspaceService.importRuleBackupRecords(snapshot.rules, {
      replace: true,
    });
  }

  const currentMcpLibrary = new CoreMcpLibraryService().read();
  if (snapshot.agentAssetFiles?.mcp) {
    restoreAgentAssetDirectorySnapshot(
      path.dirname(getMcpLibraryFilePath()),
      mergeMcpAssetFiles(snapshot.agentAssetFiles.mcp, currentMcpLibrary),
    );
  }
  if (snapshot.agentAssetFiles?.plugins) {
    restoreAgentAssetDirectorySnapshot(
      path.dirname(getPluginLibraryFilePath()),
      snapshot.agentAssetFiles.plugins,
    );
  }
  if (snapshot.mcpLibrary) {
    new CoreMcpLibraryService().write(
      mergeMcpLibraryFromTransport(currentMcpLibrary, snapshot.mcpLibrary),
    );
  }
  if (snapshot.pluginLibrary) {
    new CorePluginLibraryService().restoreSnapshot({
      library: snapshot.pluginLibrary,
      packages: snapshot.pluginPackages,
    });
  }
  writeMediaDirectory(getImagesDir(), snapshot.images);
  writeMediaDirectory(getVideosDir(), snapshot.videos);
  if (options.db) publishCanonicalPromptGraph(options.db);

  return createCliWorkspaceSummary(snapshot);
}
