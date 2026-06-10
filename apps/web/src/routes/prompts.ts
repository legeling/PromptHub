import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { getAuthUser } from '../middleware/auth.js';
import { PromptService, PromptServiceError } from '../services/prompt.service.js';
import { error, ErrorCode, paginated, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const prompts = new Hono();
const promptService = new PromptService();
const MAX_PROMPT_LIST_KEYWORD_LENGTH = 500;
const MAX_PROMPT_LIST_TAG_QUERY_LENGTH = 2000;
const MAX_PROMPT_LIST_TAGS = 50;
const MAX_PROMPT_METADATA_TAGS = 100;
const MAX_PROMPT_METADATA_TAG_LENGTH = 100;
const MAX_PROMPT_VARIABLES = 50;
const MAX_PROMPT_VARIABLE_NAME_LENGTH = 120;
const MAX_PROMPT_VARIABLE_LABEL_LENGTH = 200;
const MAX_PROMPT_VARIABLE_DEFAULT_LENGTH = 1000;
const MAX_PROMPT_VARIABLE_OPTIONS = 100;
const MAX_PROMPT_VARIABLE_OPTION_LENGTH = 200;
const MAX_PROMPT_MEDIA_REFERENCES = 100;
const MAX_PROMPT_MEDIA_REFERENCE_LENGTH = 255;

const promptMetadataTagSchema = z
  .string()
  .trim()
  .min(1, 'prompt tag must not be empty')
  .max(MAX_PROMPT_METADATA_TAG_LENGTH, `prompt tag must be at most ${MAX_PROMPT_METADATA_TAG_LENGTH} characters`);

const promptMediaReferenceSchema = z
  .string()
  .trim()
  .min(1, 'prompt media reference must not be empty')
  .max(
    MAX_PROMPT_MEDIA_REFERENCE_LENGTH,
    `prompt media reference must be at most ${MAX_PROMPT_MEDIA_REFERENCE_LENGTH} characters`,
  );

const variableSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'variable name is required')
    .max(
      MAX_PROMPT_VARIABLE_NAME_LENGTH,
      `variable name must be at most ${MAX_PROMPT_VARIABLE_NAME_LENGTH} characters`,
    ),
  type: z.enum(['text', 'textarea', 'number', 'select']),
  label: z
    .string()
    .trim()
    .min(1)
    .max(
      MAX_PROMPT_VARIABLE_LABEL_LENGTH,
      `variable label must be at most ${MAX_PROMPT_VARIABLE_LABEL_LENGTH} characters`,
    )
    .optional(),
  defaultValue: z
    .string()
    .max(
      MAX_PROMPT_VARIABLE_DEFAULT_LENGTH,
      `variable defaultValue must be at most ${MAX_PROMPT_VARIABLE_DEFAULT_LENGTH} characters`,
    )
    .optional(),
  options: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'variable option must not be empty')
        .max(
          MAX_PROMPT_VARIABLE_OPTION_LENGTH,
          `variable option must be at most ${MAX_PROMPT_VARIABLE_OPTION_LENGTH} characters`,
        ),
    )
    .max(
      MAX_PROMPT_VARIABLE_OPTIONS,
      `variable options must contain at most ${MAX_PROMPT_VARIABLE_OPTIONS} entries`,
    )
    .optional(),
  required: z.boolean(),
});

const promptVariablesSchema = z
  .array(variableSchema)
  .max(MAX_PROMPT_VARIABLES, `variables must contain at most ${MAX_PROMPT_VARIABLES} entries`);

const promptTagsSchema = z
  .array(promptMetadataTagSchema)
  .max(MAX_PROMPT_METADATA_TAGS, `tags must contain at most ${MAX_PROMPT_METADATA_TAGS} entries`);

const promptMediaReferencesSchema = z
  .array(promptMediaReferenceSchema)
  .max(
    MAX_PROMPT_MEDIA_REFERENCES,
    `media references must contain at most ${MAX_PROMPT_MEDIA_REFERENCES} entries`,
  );

const createPromptSchema = z.object({
  visibility: z.enum(['private', 'shared']).optional(),
  title: z.string().trim().min(1, 'title is required').max(200, 'title is too long'),
  description: z.string().max(5000).optional(),
  promptType: z.enum(['text', 'image', 'video']).optional(),
  systemPrompt: z.string().max(100000).optional(),
  systemPromptEn: z.string().max(100000).optional(),
  userPrompt: z.string().min(1, 'userPrompt is required').max(100000, 'userPrompt is too long'),
  userPromptEn: z.string().max(100000).optional(),
  variables: promptVariablesSchema.optional(),
  tags: promptTagsSchema.optional(),
  folderId: z.string().trim().min(1).optional(),
  images: promptMediaReferencesSchema.optional(),
  videos: promptMediaReferencesSchema.optional(),
  source: z.string().max(5000).optional(),
  notes: z.string().max(20000).optional(),
});

const directPromptSchema = z.object({
  id: z.string().trim().min(1),
  ownerUserId: z.string().nullable().optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  title: z.string().trim().min(1, 'title is required').max(200, 'title is too long'),
  description: z.string().max(5000).nullable().optional(),
  promptType: z.enum(['text', 'image', 'video']).optional(),
  systemPrompt: z.string().max(100000).nullable().optional(),
  systemPromptEn: z.string().max(100000).nullable().optional(),
  userPrompt: z.string().min(1, 'userPrompt is required').max(100000, 'userPrompt is too long'),
  userPromptEn: z.string().max(100000).nullable().optional(),
  variables: promptVariablesSchema,
  tags: promptTagsSchema,
  folderId: z.string().trim().min(1).nullable().optional(),
  images: promptMediaReferencesSchema.optional(),
  videos: promptMediaReferencesSchema.optional(),
  isFavorite: z.boolean(),
  isPinned: z.boolean(),
  version: z.number().int().nonnegative(),
  currentVersion: z.number().int().nonnegative(),
  usageCount: z.number().int().nonnegative(),
  source: z.string().max(5000).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  lastAiResponse: z.string().max(100000).nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const updatePromptSchema = createPromptSchema.partial().extend({
  folderId: z.string().trim().min(1).nullable().optional(),
  isFavorite: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  usageCount: z.number().int().nonnegative().optional(),
  lastAiResponse: z.string().max(100000).optional(),
});

const createVersionSchema = z.object({
  note: z.string().max(500).optional(),
});

const directVersionSchema = z.object({
  id: z.string().trim().min(1),
  promptId: z.string().trim().min(1),
  version: z.number().int().nonnegative(),
  systemPrompt: z.string().max(100000).nullable().optional(),
  systemPromptEn: z.string().max(100000).nullable().optional(),
  userPrompt: z.string().min(1).max(100000),
  userPromptEn: z.string().max(100000).nullable().optional(),
  variables: promptVariablesSchema,
  note: z.string().max(500).nullable().optional(),
  aiResponse: z.string().max(100000).nullable().optional(),
  createdAt: z.string().min(1),
});

const renameTagSchema = z.object({
  oldTag: promptMetadataTagSchema,
  newTag: promptMetadataTagSchema,
});

const deleteTagSchema = z.object({
  tag: promptMetadataTagSchema,
});

const listQuerySchema = z.object({
  scope: z.enum(['private', 'shared', 'all']).optional(),
  keyword: z.string().max(MAX_PROMPT_LIST_KEYWORD_LENGTH).optional(),
  tags: z.string().max(MAX_PROMPT_LIST_TAG_QUERY_LENGTH).optional(),
  tag: z.string().max(MAX_PROMPT_METADATA_TAG_LENGTH).optional(),
  folderId: z.string().max(200).optional(),
  isFavorite: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['title', 'createdAt', 'updatedAt', 'usageCount']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

function getLiteralTagQueryValues(requestUrl: string): string[] {
  return new URL(requestUrl).searchParams.getAll('tag');
}

function parseTagQuery(
  legacyTags: string | undefined,
  literalTags: string[] = [],
): string[] | undefined {
  const rawValues =
    literalTags.length > 0
      ? literalTags
      : legacyTags?.split(',') ?? [];

  if (rawValues.length === 0) {
    return undefined;
  }

  const values = rawValues
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (values.length > MAX_PROMPT_LIST_TAGS) {
    throw new PromptServiceError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `tags must contain at most ${MAX_PROMPT_LIST_TAGS} entries`,
    );
  }

  const oversizedTag = values.find((tag) => tag.length > MAX_PROMPT_METADATA_TAG_LENGTH);
  if (oversizedTag) {
    throw new PromptServiceError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `tag must be at most ${MAX_PROMPT_METADATA_TAG_LENGTH} characters`,
    );
  }

  return values.length > 0 ? values : undefined;
}

const versionDiffQuerySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
});

prompts.post('/', async (c) => {
  const parsed = await parseJsonBody(c, createPromptSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, promptService.create(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/direct-insert', async (c) => {
  const parsed = await parseJsonBody(c, directPromptSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, promptService.insertDirect(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/versions/direct-insert', async (c) => {
  const parsed = await parseJsonBody(c, directVersionSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, promptService.insertVersionDirect(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.delete('/versions/:versionId', async (c) => {
  try {
    promptService.deleteVersionById(getAuthUser(c), c.req.param('versionId'));
    return success(c, { ok: true });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/workspace/sync', async (c) => {
  try {
    getAuthUser(c);
    promptService.syncWorkspace();
    return success(c, { ok: true });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.get('/', async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  const query = parsed.data;
  let tags: string[] | undefined;
  try {
    tags = parseTagQuery(query.tags, getLiteralTagQueryValues(c.req.url));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }

  const normalizedQuery = {
    scope: query.scope,
    keyword: query.keyword,
    tags,
    folderId: query.folderId,
    isFavorite:
      query.isFavorite === undefined ? undefined : query.isFavorite === 'true',
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    offset: query.offset,
  };

  try {
    const result = promptService.list(getAuthUser(c), normalizedQuery);
    return paginated(c, result.items, {
      total: result.total,
      limit: normalizedQuery.limit ?? result.items.length,
      offset: normalizedQuery.offset ?? 0,
    });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.get('/:id', async (c) => {
  try {
    return success(c, promptService.getById(getAuthUser(c), c.req.param('id')));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.put('/:id', async (c) => {
  const parsed = await parseJsonBody(c, updatePromptSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, promptService.update(getAuthUser(c), c.req.param('id'), parsed.data));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.delete('/:id', async (c) => {
  try {
    promptService.delete(getAuthUser(c), c.req.param('id'));
    return success(c, { ok: true });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/:id/copy', async (c) => {
  try {
    return success(c, promptService.duplicate(getAuthUser(c), c.req.param('id')), 201);
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.get('/:id/versions', async (c) => {
  try {
    return success(c, promptService.getVersions(getAuthUser(c), c.req.param('id')));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/:id/versions', async (c) => {
  const parsed = await parseJsonBody(c, createVersionSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, promptService.createVersion(getAuthUser(c), c.req.param('id'), parsed.data.note), 201);
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/:id/versions/:versionId/rollback', async (c) => {
  const version = Number(c.req.param('versionId'));
  if (!Number.isInteger(version) || version <= 0) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, 'versionId must be a positive integer');
  }

  try {
    return success(c, promptService.rollback(getAuthUser(c), c.req.param('id'), version));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.delete('/:id/versions/:versionId', async (c) => {
  try {
    promptService.deleteVersion(
      getAuthUser(c),
      c.req.param('id'),
      c.req.param('versionId'),
    );
    return success(c, { ok: true });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.get('/:id/versions/diff', async (c) => {
  const parsed = versionDiffQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    return success(c, promptService.diff(getAuthUser(c), c.req.param('id'), parsed.data.from, parsed.data.to));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.get('/meta/tags', async (c) => {
  try {
    return success(c, promptService.getAllTags(getAuthUser(c)));
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/meta/tags/rename', async (c) => {
  const parsed = await parseJsonBody(c, renameTagSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    promptService.renameTag(getAuthUser(c), parsed.data.oldTag, parsed.data.newTag);
    return success(c, { ok: true });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

prompts.post('/meta/tags/delete', async (c) => {
  const parsed = await parseJsonBody(c, deleteTagSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    promptService.deleteTag(getAuthUser(c), parsed.data.tag);
    return success(c, { ok: true });
  } catch (routeError) {
    return toPromptErrorResponse(c, routeError);
  }
});

function toPromptErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof PromptServiceError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default prompts;
