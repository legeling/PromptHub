import { Hono } from 'hono';
import { error, ErrorCode } from '../utils/response.js';

const prompts = new Hono();

prompts.post('/', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.get('/', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.get('/:id', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.put('/:id', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.delete('/:id', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.post('/:id/copy', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.get('/:id/versions', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.post('/:id/versions', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.post('/:id/versions/:versionId/rollback', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

prompts.get('/:id/versions/diff', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

export default prompts;
