import { Hono } from 'hono';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { auth as authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import promptRoutes from './routes/prompts.js';
import folderRoutes from './routes/folders.js';
import skillRoutes from './routes/skills.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import mediaRoutes from './routes/media.js';
import syncRoutes from './routes/sync.js';
import importExportRoutes from './routes/import-export.js';

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', logger());
  app.onError(errorHandler);

  app.route('/api/auth', authRoutes);

  const protectedApi = new Hono();
  protectedApi.use('*', authMiddleware());
  protectedApi.route('/prompts', promptRoutes);
  protectedApi.route('/folders', folderRoutes);
  protectedApi.route('/skills', skillRoutes);
  protectedApi.route('/settings', settingsRoutes);
  protectedApi.route('/ai', aiRoutes);
  protectedApi.route('/media', mediaRoutes);
  protectedApi.route('/sync', syncRoutes);
  protectedApi.route('/', importExportRoutes);

  app.route('/api', protectedApi);

  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
}
