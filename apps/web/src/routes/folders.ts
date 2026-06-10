import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { getAuthUser } from '../middleware/auth.js';
import { FolderService, FolderServiceError } from '../services/folder.service.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const folders = new Hono();
const folderService = new FolderService();
const MAX_FOLDER_REORDER_IDS = 500;
const MAX_FOLDER_ID_LENGTH = 200;

const createFolderSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200, 'name is too long'),
  icon: z.string().trim().min(1).max(50).optional(),
  parentId: z.string().trim().min(1).optional(),
  isPrivate: z.boolean().optional(),
  visibility: z.enum(['private', 'shared']).optional(),
});

const directFolderSchema = z.object({
  id: z.string().trim().min(1),
  ownerUserId: z.string().nullable().optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  name: z.string().trim().min(1, 'name is required').max(200, 'name is too long'),
  icon: z.string().trim().min(1).max(50).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  order: z.number().int().nonnegative(),
  isPrivate: z.boolean().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const updateFolderSchema = createFolderSchema.partial().extend({
  parentId: z.string().trim().min(1).nullable().optional(),
  order: z.number().int().nonnegative().optional(),
});

const reorderSchema = z.object({
  ids: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MAX_FOLDER_ID_LENGTH, `folder id must be at most ${MAX_FOLDER_ID_LENGTH} characters`),
    )
    .max(MAX_FOLDER_REORDER_IDS, `ids must contain at most ${MAX_FOLDER_REORDER_IDS} folder ids`)
    .default([]),
});

const listQuerySchema = z.object({
  scope: z.enum(['private', 'shared', 'all']).optional(),
});

folders.post('/', async (c) => {
  const parsed = await parseJsonBody(c, createFolderSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const actor = getAuthUser(c);
    return success(c, folderService.create(actor, parsed.data), 201);
  } catch (routeError) {
    return toFolderErrorResponse(c, routeError);
  }
});

folders.post('/direct-insert', async (c) => {
  const parsed = await parseJsonBody(c, directFolderSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const actor = getAuthUser(c);
    return success(c, folderService.insertDirect(actor, parsed.data), 201);
  } catch (routeError) {
    return toFolderErrorResponse(c, routeError);
  }
});

folders.get('/', async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  try {
    const actor = getAuthUser(c);
    return success(c, folderService.list(actor, parsed.data.scope));
  } catch (routeError) {
    return toFolderErrorResponse(c, routeError);
  }
});

folders.put('/reorder', async (c) => {
  const parsed = await parseJsonBody(c, reorderSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const actor = getAuthUser(c);
    folderService.reorder(actor, parsed.data.ids);
    return success(c, { ok: true });
  } catch (routeError) {
    return toFolderErrorResponse(c, routeError);
  }
});

folders.put('/:id', async (c) => {
  const parsed = await parseJsonBody(c, updateFolderSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const actor = getAuthUser(c);
    return success(c, folderService.update(actor, c.req.param('id'), parsed.data));
  } catch (routeError) {
    return toFolderErrorResponse(c, routeError);
  }
});

folders.delete('/:id', async (c) => {
  try {
    const actor = getAuthUser(c);
    folderService.delete(actor, c.req.param('id'));
    return success(c, { ok: true });
  } catch (routeError) {
    return toFolderErrorResponse(c, routeError);
  }
});

function toFolderErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof FolderServiceError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default folders;
