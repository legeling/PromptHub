import { Hono } from 'hono';
import { error, ErrorCode } from '../utils/response.js';

const ai = new Hono();

ai.post('/request', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

ai.post('/stream', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

export default ai;
