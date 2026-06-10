import { Hono } from 'hono';
import { z } from 'zod';
import { getAuthUser } from '../middleware/auth.js';
import { DeviceService } from '../services/device.service.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const devices = new Hono();
const deviceService = new DeviceService();

const deviceIdSchema = z.string().trim().min(1, 'id is required').max(128, 'id must be at most 128 characters');
const deviceLabelSchema = (field: string) =>
  z.string().trim().min(1, `${field} is required`).max(120, `${field} must be at most 120 characters`);
const optionalDeviceLabelSchema = (field: string) =>
  z.string().trim().min(1).max(120, `${field} must be at most 120 characters`).optional();

const heartbeatSchema = z.object({
  id: deviceIdSchema,
  type: z.enum(['desktop', 'browser']),
  name: deviceLabelSchema('name'),
  platform: deviceLabelSchema('platform'),
  appVersion: optionalDeviceLabelSchema('appVersion'),
  clientVersion: optionalDeviceLabelSchema('clientVersion'),
  userAgent: z.string().trim().min(1).max(512, 'userAgent must be at most 512 characters').optional(),
});

devices.get('/', async (c) => {
  try {
    const { userId } = getAuthUser(c);
    return success(c, deviceService.list(userId));
  } catch {
    return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }
});

devices.post('/heartbeat', async (c) => {
  const parsed = await parseJsonBody(c, heartbeatSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const { userId } = getAuthUser(c);
    return success(c, deviceService.heartbeat(userId, parsed.data));
  } catch {
    return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }
});

export default devices;
