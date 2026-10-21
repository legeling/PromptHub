import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://prompthub.click/',
  integrations: [react(), tailwind(), sitemap()],
  output: 'static',
  server: {
    port: 3000
  }
});
