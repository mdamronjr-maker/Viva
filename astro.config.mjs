import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vivawellnessco.com',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
});
