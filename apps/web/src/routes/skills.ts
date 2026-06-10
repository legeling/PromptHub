import { Hono } from 'hono';
import { z } from 'zod';
import type { SkillSafetyReport, SkillSafetyScanInput } from '@prompthub/shared';
import type { Context } from 'hono';
import { getAuthUser } from '../middleware/auth.js';
import { SkillService, SkillServiceError } from '../services/skill.service.js';
import { isHttpUrl, isSafeSkillIconUrl } from '../services/skill-url-validation.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody, readRequestTextBody } from '../utils/validation.js';

const skills = new Hono();
const skillService = new SkillService();
const MAX_SKILL_METADATA_TAGS = 100;
const MAX_SKILL_METADATA_TAG_LENGTH = 100;
const MAX_SKILL_METADATA_DETAILS = 50;
const MAX_SKILL_METADATA_DETAIL_LENGTH = 500;
const MAX_SKILL_SAFETY_FINDINGS = 100;
const MAX_SKILL_SAFETY_SUMMARY_LENGTH = 2000;
const MAX_SKILL_SAFETY_FIELD_LENGTH = 200;
const MAX_SKILL_SAFETY_DETAIL_LENGTH = 5000;
const MAX_SKILL_SAFETY_FILE_PATH_LENGTH = 500;
const MAX_SKILL_SAFETY_SCAN_CONTENT_LENGTH = 200000;
const MAX_SKILL_SAFETY_SCAN_PATH_LENGTH = 1000;
const MAX_SKILL_SAFETY_SCAN_AUDITS = 50;
const MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH = 1000;

const skillMetadataTagSchema = z
  .string()
  .trim()
  .min(1, 'skill metadata tag must not be empty')
  .max(
    MAX_SKILL_METADATA_TAG_LENGTH,
    `skill metadata tag must be at most ${MAX_SKILL_METADATA_TAG_LENGTH} characters`,
  );

const skillMetadataDetailSchema = z
  .string()
  .trim()
  .min(1, 'skill metadata entry must not be empty')
  .max(
    MAX_SKILL_METADATA_DETAIL_LENGTH,
    `skill metadata entry must be at most ${MAX_SKILL_METADATA_DETAIL_LENGTH} characters`,
  );

const skillMetadataTagsSchema = z
  .array(skillMetadataTagSchema)
  .max(
    MAX_SKILL_METADATA_TAGS,
    `skill metadata tags must contain at most ${MAX_SKILL_METADATA_TAGS} entries`,
  );

const skillMetadataDetailsSchema = z
  .array(skillMetadataDetailSchema)
  .max(
    MAX_SKILL_METADATA_DETAILS,
    `skill metadata details must contain at most ${MAX_SKILL_METADATA_DETAILS} entries`,
  );

const skillHttpUrlSchema = z.string().url().refine(isHttpUrl, 'must use HTTP(S)');
const skillIconUrlSchema = z
  .string()
  .url()
  .refine(isSafeSkillIconUrl, 'must use HTTP(S) or a base64 image data URL');

const createSkillSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  description: z.string().max(10000).optional(),
  instructions: z.string().max(200000).optional(),
  content: z.string().max(200000).optional(),
  mcp_config: z.string().max(50000).optional(),
  protocol_type: z.enum(['skill', 'mcp', 'claude-code']).default('skill'),
  version: z.string().max(50).optional(),
  author: z.string().max(120).optional(),
  source_url: skillHttpUrlSchema.optional(),
  local_repo_path: z.string().max(1000).optional(),
  tags: skillMetadataTagsSchema.optional(),
  original_tags: skillMetadataTagsSchema.optional(),
  is_favorite: z.boolean().default(false),
  icon_url: skillIconUrlSchema.optional(),
  icon_emoji: z.string().max(32).optional(),
  icon_background: z.string().max(50).optional(),
  category: z.enum(['general', 'office', 'dev', 'ai', 'data', 'management', 'deploy', 'design', 'security', 'meta']).optional(),
  is_builtin: z.boolean().optional(),
  registry_slug: z.string().max(200).optional(),
  content_url: skillHttpUrlSchema.optional(),
  prerequisites: skillMetadataDetailsSchema.optional(),
  compatibility: skillMetadataDetailsSchema.optional(),
  visibility: z.enum(['private', 'shared']).optional(),
});

const updateSkillSchema = createSkillSchema.partial().extend({
  currentVersion: z
    .any()
    .optional()
    .refine(
      (value) => value === undefined,
      'Version counters are managed by /api/skills/:id/versions',
    ),
  versionTrackingEnabled: z.boolean().optional(),
  safetyReport: z
    .any()
    .optional()
    .refine(
      (value) => value === undefined,
      'Use /api/skills/:id/safety-report to save safety reports',
    ),
});

const versionSchema = z.object({
  note: z.string().max(500).optional(),
});

const safetyFindingSchema = z.object({
  code: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
  severity: z.enum(['info', 'warn', 'high']),
  title: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
  detail: z.string().max(MAX_SKILL_SAFETY_DETAIL_LENGTH),
  filePath: z.string().max(MAX_SKILL_SAFETY_FILE_PATH_LENGTH).optional(),
  evidence: z.string().max(MAX_SKILL_SAFETY_DETAIL_LENGTH).optional(),
});

const safetyReportSchema = z.object({
  level: z.enum(['safe', 'warn', 'high-risk', 'blocked']),
  summary: z.string().max(MAX_SKILL_SAFETY_SUMMARY_LENGTH),
  findings: z
    .array(safetyFindingSchema)
    .max(MAX_SKILL_SAFETY_FINDINGS, `findings must contain at most ${MAX_SKILL_SAFETY_FINDINGS} entries`),
  recommendedAction: z.enum(['allow', 'review', 'block']),
  scannedAt: z.number().int().nonnegative(),
  checkedFileCount: z.number().int().nonnegative(),
  scanMethod: z.literal('ai'),
  score: z.number().min(0).max(100).optional(),
});

const safetyScanInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(MAX_SKILL_SAFETY_SCAN_CONTENT_LENGTH).optional(),
  sourceUrl: z.string().url().max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH).optional(),
  contentUrl: z.string().url().max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH).optional(),
  localRepoPath: z.string().max(MAX_SKILL_SAFETY_SCAN_PATH_LENGTH).optional(),
  securityAudits: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MAX_SKILL_METADATA_DETAIL_LENGTH),
    )
    .max(MAX_SKILL_SAFETY_SCAN_AUDITS, `securityAudits must contain at most ${MAX_SKILL_SAFETY_SCAN_AUDITS} entries`)
    .optional(),
  aiConfig: z
    .object({
      provider: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
      apiProtocol: z.enum(['openai', 'gemini', 'anthropic']),
      apiKey: z.string().min(1).max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH),
      apiUrl: z.string().url().max(MAX_SKILL_SAFETY_SCAN_AI_CONFIG_LENGTH),
      model: z.string().trim().min(1).max(MAX_SKILL_SAFETY_FIELD_LENGTH),
    })
    .optional(),
});

const fetchRemoteSchema = z.object({
  url: z.string().url().refine((value) => new URL(value).protocol === 'https:', 'Remote skill URL must use HTTPS'),
  importToLibrary: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(10000).optional(),
  visibility: z.enum(['private', 'shared']).optional(),
});

const deleteAllSchema = z.object({
  confirm: z.boolean(),
});

const listQuerySchema = z.object({
  scope: z.enum(['private', 'shared', 'all']).optional(),
});

async function parseOptionalJsonBody(c: Context): Promise<
  | { success: true; data: unknown }
  | { success: false; response: Response }
> {
  const textResult = await readRequestTextBody(c);
  if (!textResult.success) {
    return { success: false, response: textResult.response };
  }

  const text = textResult.text;
  if (!text.trim()) {
    return { success: true, data: {} };
  }

  try {
    return { success: true, data: JSON.parse(text) };
  } catch {
    return {
      success: false,
      response: error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid JSON request body'),
    };
  }
}

skills.post('/', async (c) => {
  const parsed = await parseJsonBody(c, createSkillSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, skillService.create(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get('/', async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    return success(c, skillService.list(getAuthUser(c), parsed.data.scope));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get('/search', async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    return success(c, skillService.list(getAuthUser(c), parsed.data.scope ?? 'shared'));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get('/:id', async (c) => {
  try {
    return success(c, skillService.getById(getAuthUser(c), c.req.param('id')));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.put('/:id', async (c) => {
  const parsed = await parseJsonBody(c, updateSkillSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, skillService.update(getAuthUser(c), c.req.param('id'), parsed.data));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.delete('/:id', async (c) => {
  try {
    skillService.delete(getAuthUser(c), c.req.param('id'));
    return success(c, { ok: true });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.delete('/', async (c) => {
  const parsed = deleteAllSchema.safeParse({ confirm: c.req.query('confirm') === 'true' });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    skillService.deleteAll(getAuthUser(c), parsed.data.confirm);
    return success(c, { ok: true });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/:id/export', async (c) => {
  try {
    const skill = skillService.getById(getAuthUser(c), c.req.param('id'));
    return success(c, { name: skill.name, content: skill.content ?? skill.instructions ?? '' });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/import', async (c) => {
  const parsed = await parseJsonBody(c, createSkillSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, skillService.create(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/:id/safety-scan', async (c) => {
  const body = await parseOptionalJsonBody(c);
  if (!body.success) {
    return body.response;
  }

  const parsed = safetyScanInputSchema.partial().safeParse(body.data);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    const report = await skillService.scanSafety(
      getAuthUser(c),
      c.req.param('id'),
      parsed.data as Partial<SkillSafetyScanInput>,
    );
    return success(c, report);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/safety-scan', async (c) => {
  const parsed = await parseJsonBody(c, safetyScanInputSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const report = await skillService.scanSafetyInput(
      parsed.data as SkillSafetyScanInput,
    );
    return success(c, report);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.put('/:id/safety-report', async (c) => {
  const parsed = await parseJsonBody(c, safetyReportSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const updated = skillService.saveSafetyReport(getAuthUser(c), c.req.param('id'), parsed.data as SkillSafetyReport);
    return success(c, updated);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/fetch-remote', async (c) => {
  const parsed = await parseJsonBody(c, fetchRemoteSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await skillService.fetchRemote(getAuthUser(c), parsed.data);
    return success(c, result, result.importedSkill ? 201 : 200);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.get('/:id/versions', async (c) => {
  try {
    return success(c, skillService.getVersions(getAuthUser(c), c.req.param('id')));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/:id/versions', async (c) => {
  const parsed = await parseJsonBody(c, versionSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, skillService.createVersion(getAuthUser(c), c.req.param('id'), parsed.data.note), 201);
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.post('/:id/versions/:versionId/rollback', async (c) => {
  const version = Number(c.req.param('versionId'));
  if (!Number.isInteger(version) || version <= 0) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'versionId must be a positive integer');
  }

  try {
    return success(c, skillService.rollback(getAuthUser(c), c.req.param('id'), version));
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

skills.delete('/:id/versions/:versionId', async (c) => {
  try {
    skillService.deleteVersion(getAuthUser(c), c.req.param('id'), c.req.param('versionId'));
    return success(c, { ok: true });
  } catch (routeError) {
    return toSkillErrorResponse(c, routeError);
  }
});

function toSkillErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof SkillServiceError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  if (routeError instanceof Error) {
    if (routeError.message === 'AI_NOT_CONFIGURED') {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, 'AI_NOT_CONFIGURED');
    }
    if (routeError.message === 'SAFETY_SCAN_BLOCKED_SOURCE') {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, 'SAFETY_SCAN_BLOCKED_SOURCE');
    }
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default skills;
