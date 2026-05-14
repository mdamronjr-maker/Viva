import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vivawellnessco.com',
  trailingSlash: 'ignore',
  // Prefetch nav targets on hover. Combined with <ClientRouter />, this makes
  // navigation feel near-instant on a five-page marketing site.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [
    sitemap({
      // /quiz is now a 301 redirect to /#quiz (see public/_redirects)
      filter: (page) => !page.endsWith('/quiz/'),
    }),
  ],
});
