import { Hono } from 'hono';
import { error, ErrorCode } from '../utils/response.js';

const importExport = new Hono();

importExport.get('/export', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

importExport.post('/import', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

export default importExport;
