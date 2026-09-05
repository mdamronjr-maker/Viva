// Per-page Open Graph image generation, build-time.
// Each route below produces a 1200x630 PNG at /og/<route>.png.
// Layout.astro switches og:image to /og/<route>.png for routes that exist here;
// everything else falls back to /og-image.jpg.
//
// Direction B: deep teal, warm white, a restrained terracotta accent,
// and the same Geist typography used throughout the website.

import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';

const blogPosts = await getCollection('blog', ({ data }) => !data.draft);

// Keep share titles descriptive and short enough to read at thumbnail size.
const pages: Record<string, { title: string; tagline: string }> = {
  home: {
    title: 'Medical weight and hormone care.',
    tagline: 'Weight · Hormones · Peptide consultations · Recovery',
  },
  about: {
    title: 'Meet Liliana Damron.',
    tagline: 'The Founder · Liliana Damron, APRN, FNP-BC',
  },
  services: {
    title: 'Care and membership pricing.',
    tagline: 'Concierge Memberships · $99–$499 / month · TX · CO · FL · IA',
  },
  'weight-management': {
    title: 'Medical weight management.',
    tagline: 'Medical Weight Management · Clear Pricing · Provider-Led',
  },
  testosterone: {
    title: 'Testosterone evaluation and ongoing care.',
    tagline: 'Testosterone Care · Labs · Ongoing Monitoring',
  },
  'peptide-therapy': {
    title: 'Peptide therapy consultations.',
    tagline: 'Austin-Based Telehealth · TX · CO · FL · IA',
  },
  recovery: {
    title: 'Recovery care for active adults.',
    tagline: 'Recovery questions · Active life · Long-term health',
  },
  partners: {
    title: 'Austin resources beyond telehealth.',
    tagline: 'Physical Therapy · Training · Fitness · Meal Prep',
  },
  contact: {
    title: 'Questions before you book? Ask Viva.',
    tagline: 'Scheduling · Pricing · Partnerships · Non-Clinical Contact',
  },
  privacy: {
    title: 'Your data, your control.',
    tagline: 'Privacy Practices · Plain language',
  },
  terms: {
    title: 'How this works.',
    tagline: 'Terms of Service · Plain language',
  },
  blog: {
    title: 'Evidence-aware patient education.',
    tagline: 'Telehealth · Weight Care · Hormones · Menopause',
  },
  menopause: {
    title: 'Perimenopause and menopause care.',
    tagline: 'Perimenopause & Menopause · HRT Telehealth · TX · CO · FL · IA',
  },
  start: {
    // Title is the page's own H1; the primary conversion page every Book CTA
    // routes to, so it needs a branded share card, not the generic fallback.
    title: 'Forty-five minutes with Liliana.',
    tagline: 'Your First Visit · What To Expect',
  },
};

for (const post of blogPosts) {
  pages[`blog/${post.id}`] = {
    title: post.data.title,
    tagline: `${post.data.category} · Viva Wellness Co.`,
  };
}

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'route',
  pages,
  // Use the key as-is. The filename pattern [...route].png.ts already adds .png.
  getSlug: (path) => path,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.tagline,
    logo: {
      path: './public/viva-logo-paper-cropped.png',
      size: [320, 60],
    },
    // A solid inverse surface keeps share cards consistent with the site.
    bgGradient: [
      [18, 59, 58],
      [18, 59, 58],
    ],
    border: {
      color: [237, 180, 151],
      width: 8,
      side: 'inline-start',
    },
    padding: 80,
    // Use the same self-hosted brand fonts as the site. Keeping OG generation
    // local makes Cloudflare builds deterministic and avoids a third-party
    // font download during every deployment.
    fonts: [
      './public/fonts/geist-normal-latin.woff2',
    ],
    font: {
      title: {
        size: 70,
        lineHeight: 1.1,
        families: ['Geist', 'sans-serif'],
        weight: 'SemiBold',
        color: [247, 247, 242],
      },
      description: {
        size: 26,
        lineHeight: 1.4,
        families: ['Geist', 'sans-serif'],
        weight: 'Normal',
        color: [237, 180, 151],
      },
    },
  }),
});
