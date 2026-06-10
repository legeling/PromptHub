import { Hono } from 'hono';
import { getAuthUser } from '../middleware/auth.js';
import { SettingsService } from '../services/settings.service.js';
import { updateSettingsSchema } from '../services/settings-validation.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const settings = new Hono();
const settingsService = new SettingsService();

settings.get('/', async (c) => {
  try {
    const { userId } = getAuthUser(c);
    return success(c, settingsService.get(userId));
  } catch {
    return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }
});

settings.put('/', async (c) => {
  const parsed = await parseJsonBody(c, updateSettingsSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const { userId } = getAuthUser(c);
    const nextSettings: Parameters<SettingsService['set']>[1] = {
      ...parsed.data,
    };
    settingsService.set(userId, nextSettings);
    return success(c, { ok: true });
  } catch {
    return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }
});

export default settings;
