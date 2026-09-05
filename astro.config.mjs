import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vivawellnessco.com',
  trailingSlash: 'always',
  // Astro 7 defaults to JSX-style whitespace compression. Retain the
  // previously verified HTML-aware behavior during this security upgrade.
  compressHTML: true,
  // Prefetch nav targets on hover. Combined with <ClientRouter />, this makes
  // navigation feel near-instant on a five-page marketing site.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  integrations: [
    sitemap({
      // Utility and retired routes should not appear in the XML sitemap.
      filter: (page) => !page.endsWith('/quiz/') && !page.endsWith('/unsubscribe/'),
    }),
  ],
});
