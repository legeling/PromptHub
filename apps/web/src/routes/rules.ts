import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type {
  CreateRuleProjectInput,
  RuleBackupRecord,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileId,
  RuleRewriteRequest,
  RuleRewriteResult,
  RuleVersionSnapshot,
} from '@prompthub/shared';
import { getAuthUser } from '../middleware/auth.js';
import {
  createProjectRule,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  readRuleContent,
  readRuleVersions,
  removeProjectRule,
  removeRuleVersion,
  saveRuleContent,
} from '../services/rule.service.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const rules = new Hono();
const MAX_RULE_CONTENT_LENGTH = 200000;
const MAX_RULE_REWRITE_INSTRUCTION_LENGTH = 2000;
const MAX_RULE_LABEL_LENGTH = 200;
const MAX_RULE_AI_CONFIG_FIELD_LENGTH = 1000;
const MAX_RULE_IMPORT_RECORDS = 1000;
const MAX_RULE_PROJECT_NAME_LENGTH = 120;
const MAX_RULE_PROJECT_ROOT_PATH_LENGTH = 1024;

const ruleIdSchema = z.string().min(1);

const saveRuleSchema = z.object({
  content: z
    .string()
    .max(MAX_RULE_CONTENT_LENGTH, `content must be at most ${MAX_RULE_CONTENT_LENGTH} characters`),
});

const rewriteRuleSchema = z.object({
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(
      MAX_RULE_REWRITE_INSTRUCTION_LENGTH,
      `instruction must be at most ${MAX_RULE_REWRITE_INSTRUCTION_LENGTH} characters`,
    ),
  currentContent: z
    .string()
    .max(MAX_RULE_CONTENT_LENGTH, `currentContent must be at most ${MAX_RULE_CONTENT_LENGTH} characters`),
  fileName: z.string().trim().min(1).max(MAX_RULE_LABEL_LENGTH),
  platformName: z.string().trim().min(1).max(MAX_RULE_LABEL_LENGTH),
  aiConfig: z
    .object({
      apiKey: z.string().max(MAX_RULE_AI_CONFIG_FIELD_LENGTH),
      apiUrl: z.string().url().max(MAX_RULE_AI_CONFIG_FIELD_LENGTH),
      model: z.string().trim().min(1).max(MAX_RULE_LABEL_LENGTH),
      provider: z.string().trim().min(1).max(MAX_RULE_LABEL_LENGTH),
      apiProtocol: z.string().trim().min(1).max(MAX_RULE_LABEL_LENGTH),
    })
    .optional(),
});

const importRecordsSchema = z.object({
  records: z
    .array(z.unknown())
    .max(MAX_RULE_IMPORT_RECORDS, `records must contain at most ${MAX_RULE_IMPORT_RECORDS} entries`),
  options: z
    .object({
      replace: z.boolean().optional(),
    })
    .optional(),
});

const deleteVersionSchema = z.object({
  versionId: z.string().min(1),
});

const projectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, 'project id contains unsafe characters');

function boundedRuleProjectString(fieldName: string, maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} must not be empty`)
    .max(maxLength, `${fieldName} must be at most ${maxLength} characters`)
    .refine(
      (value) => !/[\u0000-\u001F\u007F]/u.test(value),
      `${fieldName} must not contain control characters`,
    );
}

const createProjectRuleSchema = z.object({
  id: projectIdSchema.optional(),
  name: boundedRuleProjectString('name', MAX_RULE_PROJECT_NAME_LENGTH),
  rootPath: boundedRuleProjectString('rootPath', MAX_RULE_PROJECT_ROOT_PATH_LENGTH),
});

rules.get('/', async (c) => {
  const actor = getAuthUser(c);
  const records = exportRuleBackupRecords(actor.userId);
  const descriptors: RuleFileDescriptor[] = records.map((record) => ({
    id: record.id,
    platformId: record.platformId,
    platformName: record.platformName,
    platformIcon: record.platformIcon,
    platformDescription: record.platformDescription,
    name: record.name,
    description: record.description,
    path: record.targetPath || record.path,
    exists: true,
    group: record.id.startsWith('project:') ? 'workspace' : 'assistant',
    managedPath: record.managedPath,
    targetPath: record.targetPath,
    projectRootPath: record.projectRootPath ?? null,
    syncStatus: record.syncStatus,
  }));
  return success(c, descriptors);
});

rules.post('/scan', async (c) => {
  const actor = getAuthUser(c);
  const records = exportRuleBackupRecords(actor.userId);
  const descriptors: RuleFileDescriptor[] = records.map((record) => ({
    id: record.id,
    platformId: record.platformId,
    platformName: record.platformName,
    platformIcon: record.platformIcon,
    platformDescription: record.platformDescription,
    name: record.name,
    description: record.description,
    path: record.targetPath || record.path,
    exists: true,
    group: record.id.startsWith('project:') ? 'workspace' : 'assistant',
    managedPath: record.managedPath,
    targetPath: record.targetPath,
    projectRootPath: record.projectRootPath ?? null,
    syncStatus: record.syncStatus,
  }));
  return success(c, descriptors);
});

rules.post('/projects', async (c) => {
  const parsed = await parseJsonBody(c, createProjectRuleSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const actor = getAuthUser(c);
  try {
    return success(c, createProjectRule(actor.userId, parsed.data), 201);
  } catch (routeError) {
    return toRuleErrorResponse(c, routeError);
  }
});

rules.delete('/projects/:projectId', async (c) => {
  const parsed = projectIdSchema.safeParse(c.req.param('projectId'));
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  const actor = getAuthUser(c);
  removeProjectRule(actor.userId, parsed.data);
  return success(c, { success: true });
});

rules.get('/:id', async (c) => {
  const parsed = ruleIdSchema.safeParse(c.req.param('id'));
  if (!parsed.success) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'rule id is required');
  }

  const actor = getAuthUser(c);
  const content = readRuleContent(actor.userId, parsed.data as RuleFileId);
  if (!content) {
    return error(c, 404, ErrorCode.NOT_FOUND, 'Rule not found');
  }
  return success(c, content);
});

rules.put('/:id', async (c) => {
  const idParsed = ruleIdSchema.safeParse(c.req.param('id'));
  if (!idParsed.success) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'rule id is required');
  }

  const parsed = await parseJsonBody(c, saveRuleSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const actor = getAuthUser(c);
  const updated = saveRuleContent(actor.userId, idParsed.data as RuleFileId, parsed.data.content);
  return success(c, updated);
});

function buildRewriteResult(payload: z.infer<typeof rewriteRuleSchema>): RuleRewriteResult {
  const current = payload.currentContent.trim();
  const instruction = payload.instruction.trim();
  const rewrittenContent = current
    ? `${current}\n\n<!-- ${instruction} -->`
    : `<!-- ${instruction} -->`;

  return {
    content: rewrittenContent,
    summary: 'AI rewrite generated a new draft.',
  };
}

rules.post('/rewrite', async (c) => {
  const parsed = await parseJsonBody(c, rewriteRuleSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  return success(c, buildRewriteResult(parsed.data));
});

rules.post('/:id/rewrite', async (c) => {
  const idParsed = ruleIdSchema.safeParse(c.req.param('id'));
  if (!idParsed.success) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'rule id is required');
  }

  const parsed = await parseJsonBody(c, rewriteRuleSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  return success(c, buildRewriteResult(parsed.data));
});

rules.post('/import-records', async (c) => {
  const parsed = await parseJsonBody(c, importRecordsSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const actor = getAuthUser(c);
  try {
    importRuleBackupRecords(actor.userId, parsed.data.records as RuleBackupRecord[]);
    return success(c, { success: true });
  } catch (routeError) {
    return toRuleErrorResponse(c, routeError);
  }
});

rules.delete('/:id/versions/:versionId', async (c) => {
  const idParsed = ruleIdSchema.safeParse(c.req.param('id'));
  if (!idParsed.success) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'rule id is required');
  }

  const versionParsed = deleteVersionSchema.safeParse({
    versionId: c.req.param('versionId'),
  });
  if (!versionParsed.success) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'version id is required');
  }

  const actor = getAuthUser(c);
  const updatedVersions: RuleVersionSnapshot[] = removeRuleVersion(
    actor.userId,
    idParsed.data as RuleFileId,
    versionParsed.data.versionId,
  );
  return success(c, updatedVersions);
});

function toRuleErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof Error) {
    if (routeError.message.startsWith('Sync snapshot is invalid:')) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, routeError.message);
    }

    if (routeError.message === 'Rule project root path already exists') {
      return error(c, 409, ErrorCode.CONFLICT, routeError.message);
    }

    if (routeError.message === 'Rule project name and rootPath are required') {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, routeError.message);
    }
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default rules;
