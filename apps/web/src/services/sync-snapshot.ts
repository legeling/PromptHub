import { z } from 'zod';
import type {
  AgentAssetFilesSnapshot,
  Folder,
  McpLibraryFile,
  PluginLibraryFile,
  PluginPackageSnapshot,
  Prompt,
  PromptVersion,
  RuleBackupRecord,
  Settings,
  Skill,
  SkillFileSnapshot,
  SkillVersion,
  AgentAssetStoreSourcesSnapshot,
  SyncOperationSummary,
  SyncSnapshot,
} from '@prompthub/shared';
import {
  DEFAULT_SETTINGS,
  isRuleFileId,
  isRulePlatformId,
} from '@prompthub/shared';
import { importedSettingsSchema } from './settings-validation.js';
import { isHttpUrl, isSafeSkillIconUrl } from './skill-url-validation.js';

const ruleVersionSchema = z.object({
  id: z.string(),
  savedAt: z.string(),
  content: z.string(),
  source: z.enum(['manual-save', 'ai-rewrite', 'create']),
});

const ruleSchema = z.object({
  id: z.string(),
  platformId: z.string(),
  platformName: z.string(),
  platformIcon: z.string(),
  platformDescription: z.string(),
  name: z.string(),
  description: z.string(),
  path: z.string(),
  managedPath: z.string().optional(),
  targetPath: z.string().optional(),
  projectRootPath: z.string().nullable().optional(),
  syncStatus: z
    .enum(['synced', 'target-missing', 'out-of-sync', 'sync-error'])
    .optional(),
  content: z.string(),
  versions: z.array(ruleVersionSchema),
});

const skillSafetyFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warn', 'high']),
  title: z.string(),
  detail: z.string(),
  filePath: z.string().optional(),
  evidence: z.string().optional(),
});

const skillSafetyReportSchema = z.object({
  level: z.enum(['safe', 'warn', 'high-risk', 'blocked']),
  summary: z.string(),
  findings: z.array(skillSafetyFindingSchema),
  recommendedAction: z.enum(['allow', 'review', 'block']),
  scannedAt: z.number().int().nonnegative(),
  checkedFileCount: z.number().int().nonnegative(),
  scanMethod: z
    .union([z.literal('ai'), z.literal('static')])
    .transform(() => 'ai' as const),
  score: z.number().min(0).max(100).optional(),
});

function normalizeSkillFileRelativePath(relativePath: string): string | null {
  if (/[\u0000-\u001F\u007F]/u.test(relativePath)) {
    return null;
  }

  const normalized = relativePath.replace(/\\/g, '/');
  const segments: string[] = [];

  if (normalized.startsWith('/') || /^[a-zA-Z]:/u.test(relativePath)) {
    return null;
  }

  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      return null;
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join('/');
}

function isSafeSkillFileRelativePath(relativePath: string): boolean {
  const normalized = normalizeSkillFileRelativePath(relativePath);
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  return (
    lower !== 'skill.json' &&
    lower !== 'versions' &&
    !lower.startsWith('versions/')
  );
}

function isSafePluginFileRelativePath(relativePath: string): boolean {
  return normalizeSkillFileRelativePath(relativePath) !== null;
}

const skillFileSnapshotSchema = z.object({
  relativePath: z
    .string()
    .refine(isSafeSkillFileRelativePath, 'Invalid skill file path'),
  content: z.string(),
});

const promptSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable().optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  promptType: z.enum(['text', 'image', 'video']).optional(),
  systemPrompt: z.string().nullable().optional(),
  systemPromptEn: z.string().nullable().optional(),
  userPrompt: z.string(),
  userPromptEn: z.string().nullable().optional(),
  variables: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['text', 'textarea', 'number', 'select']),
      label: z.string().optional(),
      defaultValue: z.string().optional(),
      options: z.array(z.string()).optional(),
      required: z.boolean(),
    }),
  ),
  tags: z.array(z.string()),
  folderId: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  videos: z.array(z.string()).optional(),
  isFavorite: z.boolean(),
  isPinned: z.boolean(),
  version: z.number().int().nonnegative(),
  currentVersion: z.number().int().nonnegative(),
  usageCount: z.number().int().nonnegative(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lastAiResponse: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number().int().nonnegative()]),
  updatedAt: z.union([z.string(), z.number().int().nonnegative()]),
});

const promptVersionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  version: z.number().int().nonnegative(),
  systemPrompt: z.string().nullable().optional(),
  systemPromptEn: z.string().nullable().optional(),
  userPrompt: z.string(),
  userPromptEn: z.string().nullable().optional(),
  variables: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['text', 'textarea', 'number', 'select']),
      label: z.string().optional(),
      defaultValue: z.string().optional(),
      options: z.array(z.string()).optional(),
      required: z.boolean(),
    }),
  ),
  note: z.string().nullable().optional(),
  aiResponse: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number().int().nonnegative()]),
});

const folderSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable().optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().int().nonnegative(),
  isPrivate: z.boolean().optional(),
  createdAt: z.union([z.string(), z.number().int().nonnegative()]),
  updatedAt: z.union([z.string(), z.number().int().nonnegative()]),
});

const skillSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().nullable().optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  name: z.string(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  content: z.string().optional(),
  mcp_config: z.string().optional(),
  protocol_type: z.enum(['skill', 'mcp', 'claude-code']),
  version: z.string().optional(),
  author: z.string().optional(),
  source_url: z
    .string()
    .refine(isHttpUrl, 'source_url must use HTTP(S)')
    .optional(),
  local_repo_path: z.string().optional(),
  tags: z.array(z.string()).optional(),
  original_tags: z.array(z.string()).optional(),
  is_favorite: z.boolean(),
  currentVersion: z.number().int().nonnegative().optional(),
  versionTrackingEnabled: z.boolean().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  icon_url: z
    .string()
    .refine(
      isSafeSkillIconUrl,
      'icon_url must use HTTP(S) or a base64 image data URL',
    )
    .optional(),
  icon_emoji: z.string().optional(),
  icon_background: z.string().optional(),
  category: z
    .enum([
      'general',
      'office',
      'dev',
      'ai',
      'data',
      'management',
      'deploy',
      'design',
      'security',
      'meta',
    ])
    .optional(),
  is_builtin: z.boolean().optional(),
  registry_slug: z.string().optional(),
  content_url: z
    .string()
    .refine(isHttpUrl, 'content_url must use HTTP(S)')
    .optional(),
  installed_content_hash: z.string().optional(),
  installed_version: z.string().optional(),
  installed_at: z.number().int().nonnegative().optional(),
  updated_from_store_at: z.number().int().nonnegative().optional(),
  prerequisites: z.array(z.string()).optional(),
  compatibility: z.array(z.string()).optional(),
  safetyReport: skillSafetyReportSchema.optional(),
});

const skillVersionSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  version: z.number().int().nonnegative(),
  content: z.string().optional(),
  filesSnapshot: z.array(skillFileSnapshotSchema).optional(),
  note: z.string().optional(),
  createdAt: z.union([z.string(), z.number().int().nonnegative()]),
});

const mcpLibrarySchema = z
  .object({
    kind: z.literal('prompthub-mcp-library'),
    version: z.literal(1),
    updatedAt: z.string(),
    servers: z.array(z.unknown()).default([]),
    bindings: z.array(z.unknown()).default([]),
  })
  .passthrough();

const pluginLibrarySchema = z
  .object({
    kind: z.literal('prompthub-plugin-library'),
    version: z.literal(1),
    updatedAt: z.string(),
    plugins: z.array(z.unknown()).default([]),
  })
  .passthrough();

const pluginFileSnapshotSchema = z.object({
  relativePath: z
    .string()
    .refine(isSafePluginFileRelativePath, 'Invalid plugin file path'),
  contentBase64: z.string(),
  size: z.number().int().nonnegative(),
});

const pluginPackageSnapshotSchema = z.object({
  pluginId: z.string(),
  files: z.array(pluginFileSnapshotSchema),
});

const agentAssetFileSnapshotSchema = z.object({
  relativePath: z
    .string()
    .refine(isSafePluginFileRelativePath, 'Invalid agent asset file path'),
  contentBase64: z.string(),
  size: z.number().int().nonnegative(),
});

const storeSourceSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'official',
    'community',
    'marketplace-json',
    'git-repo',
    'local-dir',
  ]),
  url: z.string(),
  branch: z.string().optional(),
  directory: z.string().optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
  createdAt: z.number().optional(),
});

const customStoreSourceSnapshotSchema = z.object({
  customStoreSources: z.array(storeSourceSnapshotSchema),
  selectedSourceId: z.string().optional(),
});

const agentAssetStoreSourcesSnapshotSchema = z.object({
  skills: customStoreSourceSnapshotSchema.optional(),
  mcp: customStoreSourceSnapshotSchema.optional(),
  plugins: customStoreSourceSnapshotSchema.optional(),
});

const agentAssetFilesSnapshotSchema = z.object({
  mcp: z.array(agentAssetFileSnapshotSchema).optional(),
  plugins: z.array(agentAssetFileSnapshotSchema).optional(),
});

export const syncSnapshotSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  prompts: z.array(promptSchema),
  promptVersions: z.array(promptVersionSchema).default([]),
  versions: z.array(promptVersionSchema).optional(),
  folders: z.array(folderSchema),
  rules: z.array(ruleSchema).optional(),
  skills: z.array(skillSchema),
  skillVersions: z.array(skillVersionSchema).default([]),
  skillFiles: z.record(z.array(skillFileSnapshotSchema)).optional(),
  mcpLibrary: mcpLibrarySchema.optional(),
  pluginLibrary: pluginLibrarySchema.optional(),
  pluginPackages: z.array(pluginPackageSnapshotSchema).optional(),
  storeSources: agentAssetStoreSourcesSnapshotSchema.optional(),
  agentAssetFiles: agentAssetFilesSnapshotSchema.optional(),
  settings: importedSettingsSchema.optional(),
  settingsUpdatedAt: z.string().optional(),
  images: z.record(z.string()).optional(),
  videos: z.record(z.string()).optional(),
});

const promptHubEnvelopeSchema = z.object({
  kind: z.enum(['prompthub-backup', 'prompthub-export']),
  exportedAt: z.string(),
  payload: z.unknown(),
});

const SUPPORTED_SYNC_SNAPSHOT_VERSIONS = new Set([
  '1',
  'desktop-backup-v1',
  'web-backup-v2',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPromptHubEnvelope(rawPayload: unknown): unknown {
  const envelope = promptHubEnvelopeSchema.safeParse(rawPayload);
  if (envelope.success) {
    return envelope.data.payload;
  }

  return rawPayload;
}

function normalizeSnapshotVersion(version: unknown): string | null {
  if (typeof version === 'number' && Number.isFinite(version)) {
    return String(version);
  }

  if (typeof version === 'string' && version.trim()) {
    return version;
  }

  return null;
}

function assertSupportedSnapshotVersion(
  payload: Record<string, unknown>,
): void {
  const version = normalizeSnapshotVersion(payload.version);
  if (!version) {
    return;
  }

  if (!SUPPORTED_SYNC_SNAPSHOT_VERSIONS.has(version)) {
    throw new Error(
      `Sync snapshot is invalid: unsupported backup version ${version}`,
    );
  }
}

function normalizeDesktopSettingsSnapshot(
  settings: unknown,
): Settings | undefined {
  if (!isRecord(settings)) {
    return undefined;
  }

  const state = isRecord(settings.state) ? settings.state : undefined;
  if (!state) {
    return undefined;
  }

  const themeMode = state.themeMode;
  const language = state.language;
  const autoSave = state.autoSave;

  if (themeMode !== 'light' && themeMode !== 'dark' && themeMode !== 'system') {
    return undefined;
  }

  if (
    language !== 'en' &&
    language !== 'zh' &&
    language !== 'zh-TW' &&
    language !== 'ja' &&
    language !== 'fr' &&
    language !== 'de' &&
    language !== 'es'
  ) {
    return undefined;
  }

  if (typeof autoSave !== 'boolean') {
    return undefined;
  }

  return {
    theme: themeMode,
    language,
    autoSave,
    defaultFolderId:
      typeof state.defaultFolderId === 'string'
        ? state.defaultFolderId
        : undefined,
    customPlatformRootPaths: isRecord(state.customPlatformRootPaths)
      ? Object.fromEntries(
          Object.entries(state.customPlatformRootPaths).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
    disabledPlatformIds: Array.isArray(state.disabledPlatformIds)
      ? state.disabledPlatformIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : Array.isArray(
            (state as { trackedRulePlatformIds?: unknown })
              .trackedRulePlatformIds,
          )
        ? (
            state as { trackedRulePlatformIds: unknown[] }
          ).trackedRulePlatformIds.filter(
            (value): value is string => typeof value === 'string',
          )
        : undefined,
    customSkillPlatformPaths: isRecord(state.customSkillPlatformPaths)
      ? Object.fromEntries(
          Object.entries(state.customSkillPlatformPaths).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined,
    skillPlatformOrder: Array.isArray(state.skillPlatformOrder)
      ? state.skillPlatformOrder.filter(
          (value): value is string => typeof value === 'string',
        )
      : undefined,
    skillProjects: Array.isArray(state.skillProjects)
      ? (state.skillProjects as Settings['skillProjects'])
      : undefined,
    backgroundImageFileName:
      typeof state.backgroundImageFileName === 'string'
        ? state.backgroundImageFileName
        : undefined,
    backgroundImageOpacity:
      typeof state.backgroundImageOpacity === 'number'
        ? state.backgroundImageOpacity
        : undefined,
    backgroundImageBlur:
      typeof state.backgroundImageBlur === 'number'
        ? state.backgroundImageBlur
        : undefined,
    lastManualBackupAt:
      typeof state.lastManualBackupAt === 'string'
        ? state.lastManualBackupAt
        : undefined,
    lastManualBackupVersion:
      typeof state.lastManualBackupVersion === 'string'
        ? state.lastManualBackupVersion
        : undefined,
    githubToken:
      typeof state.githubToken === 'string' ? state.githubToken : undefined,
    sync:
      isRecord(state.sync) &&
      typeof state.sync.enabled === 'boolean' &&
      (state.sync.provider === 'manual' ||
        state.sync.provider === 'webdav' ||
        state.sync.provider === 'self-hosted' ||
        state.sync.provider === 's3')
        ? {
            enabled: state.sync.enabled,
            provider: state.sync.provider,
            endpoint:
              typeof state.sync.endpoint === 'string'
                ? state.sync.endpoint
                : undefined,
            username:
              typeof state.sync.username === 'string'
                ? state.sync.username
                : undefined,
            password:
              typeof state.sync.password === 'string'
                ? state.sync.password
                : undefined,
            remotePath:
              typeof state.sync.remotePath === 'string'
                ? state.sync.remotePath
                : undefined,
            autoSync:
              typeof state.sync.autoSync === 'boolean'
                ? state.sync.autoSync
                : undefined,
            lastSyncAt:
              typeof state.sync.lastSyncAt === 'string'
                ? state.sync.lastSyncAt
                : undefined,
          }
        : undefined,
    device: isRecord(state.device)
      ? (state.device as Settings['device'])
      : undefined,
    updateChannel:
      state.updateChannel === 'stable' || state.updateChannel === 'preview'
        ? state.updateChannel
        : undefined,
    launchAtStartup:
      typeof state.launchAtStartup === 'boolean'
        ? state.launchAtStartup
        : undefined,
    minimizeOnLaunch:
      typeof state.minimizeOnLaunch === 'boolean'
        ? state.minimizeOnLaunch
        : undefined,
    security:
      isRecord(state.security) &&
      typeof state.security.masterPasswordConfigured === 'boolean' &&
      typeof state.security.unlocked === 'boolean'
        ? {
            masterPasswordConfigured: state.security.masterPasswordConfigured,
            unlocked: state.security.unlocked,
          }
        : undefined,
  };
}

function normalizeImportedSettings(
  payload: Record<string, unknown>,
): Settings | undefined {
  const directSettings = importedSettingsSchema.safeParse(payload.settings);
  if (directSettings.success) {
    return directSettings.data;
  }

  const desktopSettings = normalizeDesktopSettingsSnapshot(payload.settings);
  if (!desktopSettings) {
    return undefined;
  }

  const parsedDesktopSettings =
    importedSettingsSchema.safeParse(desktopSettings);
  if (parsedDesktopSettings.success) {
    return parsedDesktopSettings.data;
  }

  throw new Error(
    `Sync snapshot is invalid: ${parsedDesktopSettings.error.issues
      .map((issue) => {
        const issuePath = ['settings', ...issue.path].join('.');
        return `${issuePath}: ${issue.message}`;
      })
      .join(', ')}`,
  );
}

function validateFolderHierarchy(folders: Folder[]): void {
  const parentById = new Map(
    folders.map((folder) => [folder.id, folder.parentId]),
  );

  for (const folder of folders) {
    const seen = new Set<string>();
    let currentId: string | undefined = folder.id;

    while (currentId) {
      if (seen.has(currentId)) {
        throw new Error(
          `Sync snapshot is invalid: folders contain a parent cycle at ${folder.id}`,
        );
      }

      seen.add(currentId);
      const parentId = parentById.get(currentId);
      if (!parentId || !parentById.has(parentId)) {
        break;
      }
      currentId = parentId;
    }
  }
}

function normalizeImportedSnapshot(
  rawPayload: unknown,
): z.infer<typeof syncSnapshotSchema> {
  const unwrapped = unwrapPromptHubEnvelope(rawPayload);
  if (!isRecord(unwrapped)) {
    throw new Error('Sync snapshot is invalid: expected an object');
  }

  const normalized: Record<string, unknown> = {
    ...unwrapped,
  };

  assertSupportedSnapshotVersion(normalized);
  const normalizedVersion = normalizeSnapshotVersion(normalized.version);
  if (normalizedVersion) {
    normalized.version = normalizedVersion;
  }

  if (!Array.isArray(normalized.prompts)) {
    normalized.prompts = [];
  }

  if (!Array.isArray(normalized.folders)) {
    normalized.folders = [];
  }

  if (!Array.isArray(normalized.skills)) {
    normalized.skills = [];
  }

  if (!Array.isArray(normalized.skillVersions)) {
    normalized.skillVersions = [];
  }

  if (
    !Array.isArray(normalized.promptVersions) &&
    Array.isArray(normalized.versions)
  ) {
    normalized.promptVersions = normalized.versions;
  }

  if (!Array.isArray(normalized.promptVersions)) {
    normalized.promptVersions = [];
  }

  const settings = normalizeImportedSettings(normalized);
  if (settings) {
    normalized.settings = settings;
  }

  const parsed = syncSnapshotSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error(
      `Sync snapshot is invalid: ${parsed.error.issues
        .map((issue) => {
          const issuePath = issue.path.join('.');
          return issuePath ? `${issuePath}: ${issue.message}` : issue.message;
        })
        .join(', ')}`,
    );
  }

  validateFolderHierarchy(parsed.data.folders as Folder[]);

  return parsed.data;
}

function toIsoString(value: string | number): string {
  return typeof value === 'number' ? new Date(value).toISOString() : value;
}

function normalizeRuleRecords(
  rules: z.infer<typeof syncSnapshotSchema>['rules'],
): RuleBackupRecord[] | undefined {
  return rules?.map((rule): RuleBackupRecord => {
    if (!isRuleFileId(rule.id)) {
      throw new Error(`Invalid rule id: ${rule.id}`);
    }

    if (!isRulePlatformId(rule.platformId)) {
      throw new Error(`Invalid rule platform id: ${rule.platformId}`);
    }

    return {
      id: rule.id,
      platformId: rule.platformId,
      platformName: rule.platformName,
      platformIcon: rule.platformIcon,
      platformDescription: rule.platformDescription,
      name: rule.name,
      description: rule.description,
      path: rule.path,
      managedPath: rule.managedPath,
      targetPath: rule.targetPath,
      projectRootPath: rule.projectRootPath,
      syncStatus: rule.syncStatus,
      content: rule.content,
      versions: rule.versions,
    };
  });
}

export function normalizeSyncSnapshot(
  payload: z.infer<typeof syncSnapshotSchema>,
): SyncSnapshot {
  const promptVersions =
    payload.promptVersions.length > 0
      ? payload.promptVersions
      : (payload.versions ?? []);

  return {
    version: payload.version,
    exportedAt: payload.exportedAt,
    prompts: payload.prompts.map(
      (prompt): Prompt => ({
        ...prompt,
        createdAt: toIsoString(prompt.createdAt),
        updatedAt: toIsoString(prompt.updatedAt),
      }),
    ),
    promptVersions: promptVersions.map(
      (version): PromptVersion => ({
        ...version,
        createdAt: toIsoString(version.createdAt),
      }),
    ),
    versions: promptVersions.map(
      (version): PromptVersion => ({
        ...version,
        createdAt: toIsoString(version.createdAt),
      }),
    ),
    folders: payload.folders.map(
      (folder): Folder => ({
        ...folder,
        icon: folder.icon ?? undefined,
        parentId: folder.parentId ?? undefined,
        createdAt: toIsoString(folder.createdAt),
        updatedAt: toIsoString(folder.updatedAt),
      }),
    ),
    rules: normalizeRuleRecords(payload.rules),
    skills: payload.skills as Skill[],
    skillVersions: payload.skillVersions.map(
      (version): SkillVersion => ({
        ...version,
        createdAt: toIsoString(version.createdAt),
      }),
    ),
    skillFiles: payload.skillFiles as
      | Record<string, SkillFileSnapshot[]>
      | undefined,
    mcpLibrary: payload.mcpLibrary as McpLibraryFile | undefined,
    pluginLibrary: payload.pluginLibrary as PluginLibraryFile | undefined,
    pluginPackages: payload.pluginPackages as
      | PluginPackageSnapshot[]
      | undefined,
    storeSources: payload.storeSources as
      | AgentAssetStoreSourcesSnapshot
      | undefined,
    agentAssetFiles: payload.agentAssetFiles as
      | AgentAssetFilesSnapshot
      | undefined,
    settings: payload.settings as Settings | undefined,
    settingsUpdatedAt: payload.settingsUpdatedAt,
    images: payload.images,
    videos: payload.videos,
  };
}

export function parseSyncSnapshot(rawPayload: unknown): SyncSnapshot {
  return normalizeSyncSnapshot(normalizeImportedSnapshot(rawPayload));
}

export function withDefaultImportedSettings(
  snapshot: SyncSnapshot,
): SyncSnapshot & { settings: Settings } {
  return {
    ...snapshot,
    settings: snapshot.settings ?? { ...DEFAULT_SETTINGS },
  };
}

export function buildSyncSummary(payload: {
  prompts: unknown[];
  folders: unknown[];
  rules?: unknown[];
  skills: unknown[];
  mcpLibrary?: { servers: unknown[] };
  pluginLibrary?: { plugins: unknown[] };
}): SyncOperationSummary {
  return {
    prompts: payload.prompts.length,
    folders: payload.folders.length,
    rules: payload.rules?.length ?? 0,
    skills: payload.skills.length,
    mcpServers: payload.mcpLibrary?.servers.length ?? 0,
    plugins: payload.pluginLibrary?.plugins.length ?? 0,
  };
}

export function buildImportedSyncSummary(result: {
  promptsImported: number;
  foldersImported: number;
  rulesImported?: number;
  skillsImported: number;
  mcpServersImported?: number;
  pluginsImported?: number;
}): SyncOperationSummary {
  return {
    prompts: result.promptsImported,
    folders: result.foldersImported,
    rules: result.rulesImported ?? 0,
    skills: result.skillsImported,
    mcpServers: result.mcpServersImported ?? 0,
    plugins: result.pluginsImported ?? 0,
  };
}
