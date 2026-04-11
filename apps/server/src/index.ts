import { serve } from '@hono/node-server';
import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(`PromptHub server listening on http://${info.address}:${info.port}`);
  },
);
