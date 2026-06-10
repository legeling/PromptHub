import { z } from 'zod';
import type { SyncSettings } from '@prompthub/shared';
import {
  isHttpsWebDavEndpoint,
  isSafeWebDavRemotePath,
} from './webdav.server.js';

const MAX_SYNC_ENDPOINT_LENGTH = 2048;
const MAX_SYNC_CREDENTIAL_LENGTH = 512;
const MAX_SYNC_REMOTE_PATH_LENGTH = 1024;

function validateWebDavSyncSettings(
  value: { provider?: string; endpoint?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.provider === 'webdav' && value.endpoint && !isHttpsWebDavEndpoint(value.endpoint)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endpoint'],
      message: 'WebDAV endpoint must use HTTPS and cannot include query or fragment',
    });
  }
}

const syncSettingsObjectSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(['manual', 'webdav', 'self-hosted', 's3']),
    endpoint: z
      .string()
      .url()
      .max(MAX_SYNC_ENDPOINT_LENGTH, `endpoint must be at most ${MAX_SYNC_ENDPOINT_LENGTH} characters`)
      .optional(),
    username: z
      .string()
      .max(MAX_SYNC_CREDENTIAL_LENGTH, `username must be at most ${MAX_SYNC_CREDENTIAL_LENGTH} characters`)
      .optional(),
    password: z
      .string()
      .max(MAX_SYNC_CREDENTIAL_LENGTH, `password must be at most ${MAX_SYNC_CREDENTIAL_LENGTH} characters`)
      .optional(),
    remotePath: z
      .string()
      .max(MAX_SYNC_REMOTE_PATH_LENGTH, `remotePath must be at most ${MAX_SYNC_REMOTE_PATH_LENGTH} characters`)
      .refine(isSafeWebDavRemotePath, 'Invalid WebDAV remote path')
      .optional(),
    autoSync: z.boolean().optional(),
    lastSyncAt: z.string().datetime({ offset: true }).optional(),
  });

export const syncSettingsSchema = syncSettingsObjectSchema.superRefine(validateWebDavSyncSettings);

export const syncSettingsPatchSchema = syncSettingsObjectSchema.partial().superRefine(validateWebDavSyncSettings);

export const syncConfigSchema = syncSettingsObjectSchema
  .omit({ lastSyncAt: true })
  .superRefine(validateWebDavSyncSettings);

export function validateSyncSettings(settings: SyncSettings): void {
  const parsed = syncSettingsSchema.safeParse(settings);
  if (parsed.success) {
    return;
  }

  throw new Error(
    parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; '),
  );
}
