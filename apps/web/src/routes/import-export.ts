import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { getAuthUser } from '../middleware/auth.js';
import { BackupService } from '../services/backup.service.js';
import { validatePromptWorkspaceSnapshotPaths } from '../services/prompt-workspace.js';
import { validateRuleWorkspaceSnapshotPaths } from '../services/rule-workspace.js';
import { getMediaBase64Map, validatePulledSyncMedia, writePulledSyncMedia } from '../services/sync-media.js';
import {
  parseSyncSnapshot,
  withDefaultImportedSettings,
} from '../services/sync-snapshot.js';
import { validateSkillWorkspaceSnapshotPaths } from '../services/skill-workspace.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody, readRequestBytesBody } from '../utils/validation.js';
import { unzipSync, strFromU8 } from 'fflate';

const importExport = new Hono();
const backupService = new BackupService();
const MAX_IMPORT_REQUEST_BYTES = 50 * 1024 * 1024;

function rejectOversizedImportRequest(c: Context): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) {
    return null;
  }

  const byteLength = Number(contentLength);
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid Content-Length header');
  }

  if (byteLength > MAX_IMPORT_REQUEST_BYTES) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Import request body exceeds size limit');
  }

  return null;
}

async function readLimitedMultipartFormData(c: Context): Promise<
  | { success: true; formData: FormData }
  | { success: false; response: Response }
> {
  const body = await readRequestBytesBody(c, {
    maxBytes: MAX_IMPORT_REQUEST_BYTES,
    maxBytesMessage: 'Import request body exceeds size limit',
  });
  if (!body.success) {
    return body;
  }

  try {
    const requestBody = new Uint8Array(body.bytes.byteLength);
    requestBody.set(body.bytes);
    const request = new Request(c.req.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: requestBody.buffer,
    });
    return { success: true, formData: await request.formData() };
  } catch {
    return {
      success: false,
      response: error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid multipart form data'),
    };
  }
}

importExport.get('/export', async (c) => {
  try {
    const actor = getAuthUser(c);
    const payload = backupService.export(actor);
    const media = getMediaBase64Map(actor.userId, payload.prompts);
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="prompthub-web-export-${Date.now()}.json"`);
    return c.body(JSON.stringify({
      ...payload,
      images: media.images,
      videos: media.videos,
    }, null, 2), 200);
  } catch (routeError) {
    return toRouteErrorResponse(c, routeError);
  }
});

importExport.post('/import', async (c) => {
  const oversizedResponse = rejectOversizedImportRequest(c);
  if (oversizedResponse) {
    return oversizedResponse;
  }

  const contentType = c.req.header('content-type') ?? '';

  // Handle ZIP file upload (from desktop export)
  if (contentType.includes('application/zip') || contentType.includes('application/octet-stream') || contentType.includes('multipart/form-data')) {
    try {
      let zipBuffer: Uint8Array;

      if (contentType.includes('multipart/form-data')) {
        const multipart = await readLimitedMultipartFormData(c);
        if (!multipart.success) {
          return multipart.response;
        }

        const formData = multipart.formData;
        const file = formData.get('file');
        if (!file || typeof file === 'string') {
          return error(c, 400, ErrorCode.BAD_REQUEST, 'Missing file field in form data');
        }
        if (file.size > MAX_IMPORT_REQUEST_BYTES) {
          return error(c, 400, ErrorCode.BAD_REQUEST, 'Import request body exceeds size limit');
        }
        zipBuffer = new Uint8Array(await file.arrayBuffer());
      } else {
        const body = await readRequestBytesBody(c, {
          maxBytes: MAX_IMPORT_REQUEST_BYTES,
          maxBytesMessage: 'Import request body exceeds size limit',
        });
        if (!body.success) {
          return body.response;
        }
        zipBuffer = body.bytes;
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

      const snapshot = parseSyncSnapshot(rawData);
      const actor = getAuthUser(c);
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
        result = backupService.import(
          actor,
          withDefaultImportedSettings(snapshot),
          { forceSettingsImport: true },
        );
      } catch (importError) {
        rollbackMedia();
        throw importError;
      }
      return success(c, result, 201);
    } catch (routeError) {
      return toRouteErrorResponse(c, routeError);
    }
  }

  try {
    const parsed = await parseJsonBody(c, z.unknown(), {
      maxBytes: MAX_IMPORT_REQUEST_BYTES,
      maxBytesMessage: 'Import request body exceeds size limit',
    });
    if (!parsed.success) {
      return parsed.response;
    }

    const snapshot = parseSyncSnapshot(parsed.data);
    const actor = getAuthUser(c);
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
      result = backupService.import(
        actor,
        withDefaultImportedSettings(snapshot),
        { forceSettingsImport: true },
      );
    } catch (importError) {
      rollbackMedia();
      throw importError;
    }
    return success(c, result, 201);
  } catch (routeError) {
    return toRouteErrorResponse(c, routeError);
  }
});

function toRouteErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof Error) {
    if (routeError.message.startsWith('Sync snapshot is invalid:')) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, routeError.message);
    }
    return error(c, 400, ErrorCode.BAD_REQUEST, routeError.message);
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default importExport;
