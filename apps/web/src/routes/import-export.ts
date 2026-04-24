import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Folder, Prompt, PromptVersion, Settings, Skill, SkillVersion } from '@prompthub/shared';
import { getAuthUser } from '../middleware/auth.js';
import { BackupService } from '../services/backup.service.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';
import { unzipSync, strFromU8 } from 'fflate';

const importExport = new Hono();
const backupService = new BackupService();

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

const settingsSchema = z.object({
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
});

const backupPayloadSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  prompts: z.array(promptSchema),
  promptVersions: z.array(promptVersionSchema).default([]),
  versions: z.array(promptVersionSchema).optional(),
  folders: z.array(folderSchema),
  skills: z.array(skillSchema),
  skillVersions: z.array(skillVersionSchema).default([]),
  settings: settingsSchema,
});

function normalizeBackupPayload(payload: z.infer<typeof backupPayloadSchema>): {
  version: string;
  exportedAt: string;
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  versions: PromptVersion[];
  folders: Folder[];
  skills: Skill[];
  skillVersions: SkillVersion[];
  settings: Settings;
} {
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
    settings: payload.settings,
  };
}

importExport.get('/export', async (c) => {
  try {
    const payload = backupService.export(getAuthUser(c));
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="prompthub-web-export-${Date.now()}.json"`);
    return c.body(JSON.stringify(payload, null, 2), 200);
  } catch (routeError) {
    return toRouteErrorResponse(c, routeError);
  }
});

importExport.post('/import', async (c) => {
  const contentType = c.req.header('content-type') ?? '';

  // Handle ZIP file upload (from desktop export)
  if (contentType.includes('application/zip') || contentType.includes('application/octet-stream') || contentType.includes('multipart/form-data')) {
    try {
      let zipBuffer: Uint8Array;

      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.formData();
        const file = formData.get('file');
        if (!file || typeof file === 'string') {
          return error(c, 400, ErrorCode.BAD_REQUEST, 'Missing file field in form data');
        }
        zipBuffer = new Uint8Array(await file.arrayBuffer());
      } else {
        zipBuffer = new Uint8Array(await c.req.arrayBuffer());
      }

      const files = unzipSync(zipBuffer);
      // Desktop ZIP contains import-with-prompthub.json as the importable payload
      const jsonEntry = files['import-with-prompthub.json'];
      if (!jsonEntry) {
        return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid ZIP file: missing import-with-prompthub.json');
      }

      const jsonText = strFromU8(jsonEntry);
      let rawData: unknown;
      try {
        rawData = JSON.parse(jsonText);
      } catch {
        return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid JSON in import-with-prompthub.json');
      }

      const parsed = backupPayloadSchema.safeParse(rawData);
      if (!parsed.success) {
        return error(c, 400, ErrorCode.BAD_REQUEST, `Invalid backup format: ${parsed.error.message}`);
      }

      const result = backupService.import(getAuthUser(c), normalizeBackupPayload(parsed.data));
      return success(c, result, 201);
    } catch (routeError) {
      return toRouteErrorResponse(c, routeError);
    }
  }

  // Handle JSON import (web export format)
  const parsed = await parseJsonBody(c, backupPayloadSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = backupService.import(getAuthUser(c), normalizeBackupPayload(parsed.data));
    return success(c, result, 201);
  } catch (routeError) {
    return toRouteErrorResponse(c, routeError);
  }
});

function toRouteErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof Error) {
    return error(c, 400, ErrorCode.BAD_REQUEST, routeError.message);
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default importExport;
