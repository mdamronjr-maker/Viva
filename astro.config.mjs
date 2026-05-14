import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vivawellnessco.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // /quiz is now a 301 redirect to /#quiz (see public/_redirects)
      filter: (page) => !page.endsWith('/quiz/'),
    }),
  ],
});
