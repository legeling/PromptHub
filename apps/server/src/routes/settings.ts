import { Hono } from 'hono';
import { error, ErrorCode } from '../utils/response.js';

const settings = new Hono();

settings.get('/', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

settings.put('/', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

export default settings;
