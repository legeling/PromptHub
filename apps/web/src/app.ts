import { Hono } from 'hono';
import { FolderDB, PromptDB, SkillDB } from '@prompthub/db';
import { getServerDatabase } from './database.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { auth as authMiddleware } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import authRoutes from './routes/auth.js';
import promptRoutes from './routes/prompts.js';
import folderRoutes from './routes/folders.js';
import skillRoutes from './routes/skills.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import mediaRoutes from './routes/media.js';
import syncRoutes from './routes/sync.js';
import importExportRoutes from './routes/import-export.js';
import devicesRoutes from './routes/devices.js';
import { bootstrapPromptWorkspace } from './services/prompt-workspace.js';
import { bootstrapSkillWorkspace } from './services/skill-workspace.js';

export function createApp(): Hono {
  const db = getServerDatabase();
  bootstrapPromptWorkspace(db, new PromptDB(db), new FolderDB(db));
  bootstrapSkillWorkspace(db, new SkillDB(db));

  const app = new Hono();

  app.use('*', logger());
  app.use('*', securityHeaders());
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
  protectedApi.route('/devices', devicesRoutes);
  protectedApi.route('/', importExportRoutes);

  app.route('/api', protectedApi);

  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
}
