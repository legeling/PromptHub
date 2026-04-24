import { Hono } from 'hono';
import { z } from 'zod';
import type { Folder, Prompt, PromptVersion, Settings, Skill, SkillVersion, SyncSettings } from '@prompthub/shared';
import { getAuthUser } from '../middleware/auth.js';
import { BackupService } from '../services/backup.service.js';
import { SettingsService } from '../services/settings.service.js';
import { pullWebDavFile, pushWebDavFile, testWebDavConnection, mkcolWebDavDirectory } from '../services/webdav.server.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const sync = new Hono();
const backupService = new BackupService();
const settingsService = new SettingsService();

// Unified path shared with desktop. Legacy path kept for pull fallback (migration).
const REMOTE_BACKUP_DIR = 'prompthub-backup';
const REMOTE_BACKUP_DATA_FILE = 'prompthub-backup/data.json';
const REMOTE_MANIFEST_FILE = 'prompthub-backup/manifest.json';
const LEGACY_REMOTE_BACKUP_FILE = 'prompthub-web-backup.json';

interface NormalizedSyncPayload {
  version: string;
  exportedAt: string;
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  versions: PromptVersion[];
  folders: Folder[];
  skills: Skill[];
  skillVersions: SkillVersion[];
  settings: Settings;
  settingsUpdatedAt?: string;
}

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
  scanMethod: z.enum(['ai', 'static']),
  score: z.number().min(0).max(100).optional(),
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
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'textarea', 'number', 'select']),
    label: z.string().optional(),
    defaultValue: z.string().optional(),
    options: z.array(z.string()).optional(),
    required: z.boolean(),
  })),
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
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'textarea', 'number', 'select']),
    label: z.string().optional(),
    defaultValue: z.string().optional(),
    options: z.array(z.string()).optional(),
    required: z.boolean(),
  })),
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
  source_url: z.string().optional(),
  local_repo_path: z.string().optional(),
  tags: z.array(z.string()).optional(),
  original_tags: z.array(z.string()).optional(),
  is_favorite: z.boolean(),
  currentVersion: z.number().int().nonnegative().optional(),
  versionTrackingEnabled: z.boolean().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  icon_url: z.string().optional(),
  icon_emoji: z.string().optional(),
  icon_background: z.string().optional(),
  category: z.enum(['general', 'office', 'dev', 'ai', 'data', 'management', 'deploy', 'design', 'security', 'meta']).optional(),
  is_builtin: z.boolean().optional(),
  registry_slug: z.string().optional(),
  content_url: z.string().optional(),
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
  filesSnapshot: z.array(z.object({
    relativePath: z.string(),
    content: z.string(),
  })).optional(),
  note: z.string().optional(),
  createdAt: z.union([z.string(), z.number().int().nonnegative()]),
});

const importPayloadSchema = z.object({
  payload: z.object({
    version: z.string(),
    exportedAt: z.string(),
    prompts: z.array(promptSchema),
    promptVersions: z.array(promptVersionSchema).default([]),
    versions: z.array(promptVersionSchema).optional(),
    folders: z.array(folderSchema),
    skills: z.array(skillSchema),
    skillVersions: z.array(skillVersionSchema).default([]),
    settings: z.object({
      theme: z.enum(['light', 'dark', 'system']),
      language: z.enum(['en', 'zh', 'zh-TW', 'ja', 'fr', 'de', 'es']),
      autoSave: z.boolean(),
      defaultFolderId: z.string().optional(),
      customSkillPlatformPaths: z.record(z.string()).optional(),
      sync: z.object({
        enabled: z.boolean(),
        provider: z.enum(['manual', 'webdav']),
        endpoint: z.string().url().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        remotePath: z.string().optional(),
        autoSync: z.boolean().optional(),
        lastSyncAt: z.string().optional(),
      }).optional(),
      security: z.object({
        masterPasswordConfigured: z.boolean(),
        unlocked: z.boolean(),
      }).optional(),
      updateChannel: z.enum(['stable', 'preview']).optional(),
    }).optional(),
    settingsUpdatedAt: z.string().optional(),
  }),
});

const syncConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['manual', 'webdav']),
  endpoint: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  remotePath: z.string().optional(),
  autoSync: z.boolean().optional(),
});

function getSyncSettings(userId: string): SyncSettings {
  const settings = settingsService.get(userId);
  return settings.sync ?? {
    enabled: false,
    provider: 'manual',
    autoSync: false,
  };
}

function assertWebDavConfig(settings: SyncSettings): asserts settings is SyncSettings & { endpoint: string } {
  if (settings.provider !== 'webdav' || !settings.endpoint) {
    throw new Error('WebDAV sync is not configured');
  }
}

function buildSyncStatus(userId: string, payload: { exportedAt: string; prompts: unknown[]; folders: unknown[]; skills: unknown[] }): {
  enabled: boolean;
  provider: 'manual' | 'webdav';
  lastSyncAt: string;
  summary: {
    prompts: number;
    folders: number;
    skills: number;
  };
  message: string;
  config: SyncSettings;
  capabilities: {
    pull: boolean;
    push: boolean;
    autoSync: boolean;
  };
} {
  const syncSettings = getSyncSettings(userId);
  const providerMessage =
    syncSettings.provider === 'webdav'
      ? syncSettings.enabled
        ? 'WebDAV sync is configured for this account'
        : 'WebDAV sync is configured but currently disabled'
      : 'Manual sync is available for this account';

  return {
    enabled: syncSettings.enabled,
    provider: syncSettings.provider,
    lastSyncAt: syncSettings.lastSyncAt ?? payload.exportedAt,
    summary: {
      prompts: payload.prompts.length,
      folders: payload.folders.length,
      skills: payload.skills.length,
    },
    message: providerMessage,
    config: syncSettings,
    capabilities: {
      pull: true,
      push: true,
      autoSync: Boolean(syncSettings.enabled && syncSettings.autoSync && syncSettings.provider === 'webdav'),
    },
  };
}

function normalizeSyncPayload(payload: z.infer<typeof importPayloadSchema>['payload']): NormalizedSyncPayload {
  const promptVersions = payload.promptVersions.length > 0 ? payload.promptVersions : (payload.versions ?? []);

  return {
    version: payload.version,
    exportedAt: payload.exportedAt,
    prompts: payload.prompts.map((prompt): Prompt => ({
      id: prompt.id,
      ownerUserId: prompt.ownerUserId,
      visibility: prompt.visibility,
      title: prompt.title,
      description: prompt.description,
      promptType: prompt.promptType,
      systemPrompt: prompt.systemPrompt,
      systemPromptEn: prompt.systemPromptEn,
      userPrompt: prompt.userPrompt,
      userPromptEn: prompt.userPromptEn,
      variables: prompt.variables,
      tags: prompt.tags,
      folderId: prompt.folderId,
      images: prompt.images,
      videos: prompt.videos,
      isFavorite: prompt.isFavorite,
      isPinned: prompt.isPinned,
      version: prompt.version,
      currentVersion: prompt.currentVersion,
      usageCount: prompt.usageCount,
      source: prompt.source,
      notes: prompt.notes,
      lastAiResponse: prompt.lastAiResponse,
      createdAt: typeof prompt.createdAt === 'number' ? new Date(prompt.createdAt).toISOString() : prompt.createdAt,
      updatedAt: typeof prompt.updatedAt === 'number' ? new Date(prompt.updatedAt).toISOString() : prompt.updatedAt,
    })),
    promptVersions: promptVersions.map((version): PromptVersion => ({
      id: version.id,
      promptId: version.promptId,
      version: version.version,
      systemPrompt: version.systemPrompt,
      systemPromptEn: version.systemPromptEn,
      userPrompt: version.userPrompt,
      userPromptEn: version.userPromptEn,
      variables: version.variables,
      note: version.note,
      aiResponse: version.aiResponse,
      createdAt: typeof version.createdAt === 'number' ? new Date(version.createdAt).toISOString() : version.createdAt,
    })),
    versions: promptVersions.map((version): PromptVersion => ({
      id: version.id,
      promptId: version.promptId,
      version: version.version,
      systemPrompt: version.systemPrompt,
      systemPromptEn: version.systemPromptEn,
      userPrompt: version.userPrompt,
      userPromptEn: version.userPromptEn,
      variables: version.variables,
      note: version.note,
      aiResponse: version.aiResponse,
      createdAt: typeof version.createdAt === 'number' ? new Date(version.createdAt).toISOString() : version.createdAt,
    })),
    folders: payload.folders.map((folder): Folder => ({
      id: folder.id,
      ownerUserId: folder.ownerUserId,
      visibility: folder.visibility,
      name: folder.name,
      icon: folder.icon ?? undefined,
      parentId: folder.parentId ?? undefined,
      order: folder.order,
      isPrivate: folder.isPrivate,
      createdAt: typeof folder.createdAt === 'number' ? new Date(folder.createdAt).toISOString() : folder.createdAt,
      updatedAt: typeof folder.updatedAt === 'number' ? new Date(folder.updatedAt).toISOString() : folder.updatedAt,
    })),
    skills: payload.skills,
    skillVersions: payload.skillVersions.map((version): SkillVersion => ({
      id: version.id,
      skillId: version.skillId,
      version: version.version,
      content: version.content,
      filesSnapshot: version.filesSnapshot,
      note: version.note,
      createdAt: typeof version.createdAt === 'number' ? new Date(version.createdAt).toISOString() : version.createdAt,
    })),
    settings: payload.settings ?? { theme: 'system', language: 'en', autoSave: true },
    settingsUpdatedAt: payload.settingsUpdatedAt,
  };
}

sync.get('/manifest', async (c) => {
  const actor = getAuthUser(c);
  const payload = backupService.export(actor);

  return success(c, {
    version: payload.version,
    exportedAt: payload.exportedAt,
    counts: {
      prompts: payload.prompts.length,
      folders: payload.folders.length,
      skills: payload.skills.length,
    },
    settingsUpdatedAt: payload.settingsUpdatedAt,
    actor: {
      userId: actor.userId,
      role: actor.role,
    },
  });
});

sync.get('/data', async (c) => {
  const payload = backupService.export(getAuthUser(c));
  return success(c, payload);
});

sync.put('/data', async (c) => {
  const parsed = await parseJsonBody(c, importPayloadSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const actor = getAuthUser(c);
  const result = backupService.import(actor, normalizeSyncPayload(parsed.data.payload));
  const currentSettings = settingsService.get(actor.userId);
  settingsService.set(actor.userId, {
    ...currentSettings,
    sync: {
      ...getSyncSettings(actor.userId),
      lastSyncAt: new Date().toISOString(),
    },
  });
  return success(c, {
    ok: true,
    ...result,
  });
});

sync.get('/config', async (c) => {
  const actor = getAuthUser(c);
  return success(c, getSyncSettings(actor.userId));
});

sync.put('/config', async (c) => {
  const parsed = await parseJsonBody(c, syncConfigSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const actor = getAuthUser(c);
  const currentSettings = settingsService.get(actor.userId);
  const nextSync: SyncSettings = {
    ...getSyncSettings(actor.userId),
    ...parsed.data,
  };

  const nextSettings: Partial<Settings> = {
    ...currentSettings,
    sync: nextSync,
  };

  settingsService.set(actor.userId, nextSettings);
  return success(c, nextSync);
});

sync.post('/push', async (c) => {
  const actor = getAuthUser(c);
  const syncSettings = getSyncSettings(actor.userId);

  try {
    assertWebDavConfig(syncSettings);
    const exported = backupService.export(actor);
    const connection = await testWebDavConnection(syncSettings);
    if (!connection.ok) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, `WebDAV connection failed with HTTP ${connection.status}`);
    }

    // Ensure directory exists (MKCOL is idempotent – 405 means already exists)
    await mkcolWebDavDirectory(syncSettings, REMOTE_BACKUP_DIR);

    const pushed = await pushWebDavFile(syncSettings, REMOTE_BACKUP_DATA_FILE, JSON.stringify(exported));
    if (!pushed.ok) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, `WebDAV upload failed with HTTP ${pushed.status}`);
    }

    // Write a minimal manifest.json so the desktop client can locate data.json
    const manifest = {
      version: '1',
      createdAt: exported.exportedAt,
      dataHash: '',
      encrypted: false,
      images: {},
      videos: {},
    };
    await pushWebDavFile(syncSettings, REMOTE_MANIFEST_FILE, JSON.stringify(manifest));

    const syncedAt = new Date().toISOString();
    const currentSettings = settingsService.get(actor.userId);
    settingsService.set(actor.userId, {
      ...currentSettings,
      sync: {
        ...syncSettings,
        lastSyncAt: syncedAt,
      },
    });

    return success(c, {
      ok: true,
      provider: 'webdav',
      syncedAt,
      remoteFile: REMOTE_BACKUP_DATA_FILE,
    });
  } catch (routeError) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, routeError instanceof Error ? routeError.message : 'Sync push failed');
  }
});

sync.post('/pull', async (c) => {
  const actor = getAuthUser(c);
  const syncSettings = getSyncSettings(actor.userId);

  try {
    assertWebDavConfig(syncSettings);

    // Try unified path first, fall back to legacy web-only path for migration
    let pulled = await pullWebDavFile(syncSettings, REMOTE_BACKUP_DATA_FILE);
    if (!pulled.ok) {
      pulled = await pullWebDavFile(syncSettings, LEGACY_REMOTE_BACKUP_FILE);
    }
    if (!pulled.ok) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, `WebDAV download failed: no backup found at ${REMOTE_BACKUP_DATA_FILE} or ${LEGACY_REMOTE_BACKUP_FILE}`);
    }

    const parsedPayload = importPayloadSchema.shape.payload.safeParse(JSON.parse(pulled.body));
    if (!parsedPayload.success) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, `Remote sync payload is invalid: ${parsedPayload.error.issues.map((i) => i.message).join(', ')}`);
    }

    const imported = backupService.import(actor, normalizeSyncPayload(parsedPayload.data));
    const syncedAt = new Date().toISOString();
    const currentSettings = settingsService.get(actor.userId);
    settingsService.set(actor.userId, {
      ...currentSettings,
      sync: {
        ...syncSettings,
        lastSyncAt: syncedAt,
      },
    });

    return success(c, {
      ok: true,
      ...imported,
      provider: 'webdav',
      syncedAt,
      remoteFile: REMOTE_BACKUP_DATA_FILE,
    });
  } catch (routeError) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, routeError instanceof Error ? routeError.message : 'Sync pull failed');
  }
});

sync.get('/status', async (c) => {
  const actor = getAuthUser(c);
  const payload = backupService.export(actor);
  return success(c, buildSyncStatus(actor.userId, payload));
});

export default sync;
