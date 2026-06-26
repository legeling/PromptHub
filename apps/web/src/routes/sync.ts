import { Hono } from 'hono';
import { z } from 'zod';
import type { Settings, SyncProviderKind, SyncSettings, SyncSnapshot } from '@prompthub/shared';
import { getAuthUser } from '../middleware/auth.js';
import { BackupService } from '../services/backup.service.js';
import { validatePromptWorkspaceSnapshotPaths } from '../services/prompt-workspace.js';
import { validateRuleWorkspaceSnapshotPaths } from '../services/rule-workspace.js';
import { validateSkillWorkspaceSnapshotPaths } from '../services/skill-workspace.js';
import { SettingsService } from '../services/settings.service.js';
import {
  buildImportedSyncSummary,
  buildSyncSummary,
  parseSyncSnapshot,
  withDefaultImportedSettings,
} from '../services/sync-snapshot.js';
import {
  syncConfigSchema,
  validateSyncSettings,
} from '../services/sync-settings-validation.js';
import { validatePulledSyncMedia, writePulledSyncMedia } from '../services/sync-media.js';
import {
  pullWebDavSnapshot,
  pushWebDavSnapshot,
} from '../services/sync-orchestrator.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const sync = new Hono();
const backupService = new BackupService();
const settingsService = new SettingsService();
const MAX_SYNC_DATA_REQUEST_BYTES = 50 * 1024 * 1024;

const syncImportRequestSchema = z.object({
  payload: z.unknown(),
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

function validateMergedSyncSettings(settings: SyncSettings): void {
  validateSyncSettings(settings);
}

function buildSyncStatus(userId: string, payload: {
  exportedAt: string;
  prompts: unknown[];
  folders: unknown[];
  skills: unknown[];
  mcpLibrary?: { servers: unknown[] };
  pluginLibrary?: { plugins: unknown[] };
}): {
  enabled: boolean;
  provider: SyncProviderKind;
  lastSyncAt: string;
  summary: {
    prompts: number;
    folders: number;
    skills: number;
    mcpServers: number;
    plugins: number;
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
      : syncSettings.provider === 'self-hosted'
        ? 'Self-hosted sync is configured for this account'
        : syncSettings.provider === 's3'
          ? 'S3 sync is configured for this account'
      : 'Manual sync is available for this account';

  return {
    enabled: syncSettings.enabled,
    provider: syncSettings.provider,
    lastSyncAt: syncSettings.lastSyncAt ?? payload.exportedAt,
    summary: {
      prompts: payload.prompts.length,
      folders: payload.folders.length,
      skills: payload.skills.length,
      mcpServers: payload.mcpLibrary?.servers.length ?? 0,
      plugins: payload.pluginLibrary?.plugins.length ?? 0,
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

function parseRemoteSyncSnapshot(body: string): SyncSnapshot {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON in remote sync payload');
  }

  return parseSyncSnapshot(rawPayload);
}

function toSyncValidationError(c: Parameters<typeof success>[0], routeError: unknown, fallbackMessage: string): Response {
  return error(
    c,
    422,
    ErrorCode.VALIDATION_ERROR,
    routeError instanceof Error ? routeError.message : fallbackMessage,
  );
}

function updateSyncLastSyncAt(userId: string, syncSettings: SyncSettings, lastSyncAt: string): void {
  const currentSettings = settingsService.get(userId);
  settingsService.set(userId, {
    ...currentSettings,
    sync: {
      ...syncSettings,
      lastSyncAt,
    },
  });
}

function buildSyncImportPayload(snapshot: SyncSnapshot) {
  return withDefaultImportedSettings(snapshot);
}

function rejectOversizedSyncDataRequest(c: Parameters<typeof success>[0]): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) {
    return null;
  }

  const byteLength = Number(contentLength);
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid Content-Length header');
  }

  if (byteLength > MAX_SYNC_DATA_REQUEST_BYTES) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Sync data request body exceeds size limit');
  }

  return null;
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
      mcpServers: payload.mcpLibrary?.servers.length ?? 0,
      plugins: payload.pluginLibrary?.plugins.length ?? 0,
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
  const oversizedResponse = rejectOversizedSyncDataRequest(c);
  if (oversizedResponse) {
    return oversizedResponse;
  }

  const parsed = await parseJsonBody(c, syncImportRequestSchema, {
    maxBytes: MAX_SYNC_DATA_REQUEST_BYTES,
    maxBytesMessage: 'Sync data request body exceeds size limit',
  });
  if (!parsed.success) {
    return parsed.response;
  }

  let snapshot: SyncSnapshot;
  try {
    snapshot = parseSyncSnapshot(parsed.data.payload);
  } catch (routeError) {
    return toSyncValidationError(c, routeError, 'Sync payload is invalid');
  }

  const actor = getAuthUser(c);
  try {
    validatePromptWorkspaceSnapshotPaths(snapshot.folders, snapshot.prompts, snapshot.promptVersions);
    validateSkillWorkspaceSnapshotPaths(snapshot.skills, snapshot.skillVersions, snapshot.skillFiles);
    validateRuleWorkspaceSnapshotPaths(actor.userId, snapshot.rules ?? []);
    const media = {
      images: snapshot.images,
      videos: snapshot.videos,
    };
    validatePulledSyncMedia(media);
    const rollbackMedia = writePulledSyncMedia(actor.userId, media);
    let result;
    try {
      result = backupService.import(actor, buildSyncImportPayload(snapshot));
    } catch (importError) {
      rollbackMedia();
      throw importError;
    }
    updateSyncLastSyncAt(actor.userId, getSyncSettings(actor.userId), new Date().toISOString());
    return success(c, {
      ok: true,
      ...result,
      summary: buildImportedSyncSummary(result),
    });
  } catch (routeError) {
    return toSyncValidationError(c, routeError, 'Sync payload is invalid');
  }
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
  try {
    validateMergedSyncSettings(nextSync);
  } catch (routeError) {
    return error(
      c,
      422,
      ErrorCode.VALIDATION_ERROR,
      routeError instanceof Error ? routeError.message : 'Sync config is invalid',
    );
  }

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
    const pushed = await pushWebDavSnapshot(actor.userId, syncSettings, exported);
    updateSyncLastSyncAt(actor.userId, syncSettings, pushed.syncedAt);

    return success(c, {
      ok: true,
      provider: 'webdav',
      syncedAt: pushed.syncedAt,
      remoteFile: pushed.remoteFile,
      promptsExported: exported.prompts.length,
      foldersExported: exported.folders.length,
      rulesExported: exported.rules?.length ?? 0,
      skillsExported: exported.skills.length,
      summary: buildSyncSummary(exported),
    });
  } catch (routeError) {
    return toSyncValidationError(c, routeError, 'Sync push failed');
  }
});

sync.post('/pull', async (c) => {
  const actor = getAuthUser(c);
  const syncSettings = getSyncSettings(actor.userId);

  try {
    assertWebDavConfig(syncSettings);
    const pulled = await pullWebDavSnapshot(syncSettings);
    const remoteSnapshot = parseRemoteSyncSnapshot(pulled.body);
    validatePromptWorkspaceSnapshotPaths(remoteSnapshot.folders, remoteSnapshot.prompts, remoteSnapshot.promptVersions);
    validateSkillWorkspaceSnapshotPaths(remoteSnapshot.skills, remoteSnapshot.skillVersions, remoteSnapshot.skillFiles);
    validateRuleWorkspaceSnapshotPaths(actor.userId, remoteSnapshot.rules ?? []);
    const media = {
      images: pulled.images ?? remoteSnapshot.images,
      videos: pulled.videos ?? remoteSnapshot.videos,
    };
    validatePulledSyncMedia(media);
    const rollbackMedia = writePulledSyncMedia(actor.userId, media);
    let imported;
    try {
      imported = backupService.import(
        actor,
        buildSyncImportPayload(remoteSnapshot),
      );
    } catch (importError) {
      rollbackMedia();
      throw importError;
    }
    updateSyncLastSyncAt(actor.userId, syncSettings, pulled.syncedAt);

    return success(c, {
      ok: true,
      ...imported,
      provider: 'webdav',
      syncedAt: pulled.syncedAt,
      remoteFile: pulled.remoteFile,
      summary: buildImportedSyncSummary(imported),
    });
  } catch (routeError) {
    return toSyncValidationError(c, routeError, 'Sync pull failed');
  }
});

sync.get('/status', async (c) => {
  const actor = getAuthUser(c);
  const payload = backupService.export(actor);
  return success(c, buildSyncStatus(actor.userId, payload));
});

export default sync;
