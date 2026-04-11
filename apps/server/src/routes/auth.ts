import { Hono } from 'hono';
import { error, ErrorCode } from '../utils/response.js';

const auth = new Hono();

auth.post('/register', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

auth.post('/login', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

auth.post('/refresh', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

auth.post('/logout', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

auth.get('/me', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

auth.put('/password', async (c) => {
  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Not implemented');
});

export default auth;
