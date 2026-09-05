// Per-page Open Graph image generation, build-time.
// Each route below produces a 1200x630 PNG at /og/<route>.png.
// Layout.astro switches og:image to /og/<route>.png for routes that exist here;
// everything else falls back to /og-image.jpg.
//
// Design language: italic Fraunces serif title, bronze accent bar, uppercase
// mono tagline. Same display font as the site's H1s — share previews carry
// the brand voice instead of looking like a generic OpenGraph template.

import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';

const blogPosts = await getCollection('blog', ({ data }) => !data.draft);

// Per-page metadata. `tagline` renders in the description slot as small mono
// uppercase — eyebrow-style, not a sentence. Keep titles short (≤8 words);
// they render at 88px and need to breathe.
const pages: Record<string, { title: string; tagline: string }> = {
  home: {
    title: 'Medical weight and hormone care. One provider who knows your plan.',
    tagline: 'One provider · Weight · Hormones · Peptides · Recovery · TX · CO · FL · IA',
  },
  about: {
    title: 'Meet your provider.',
    tagline: 'The Founder · Liliana Damron, APRN, FNP-BC',
  },
  services: {
    title: 'What I treat, and what it costs.',
    tagline: 'Concierge Memberships · $99–$499 / month · TX · CO · FL · IA',
  },
  'weight-management': {
    title: 'Weight care that starts with the whole picture.',
    tagline: 'Medical Weight Management · Clear Pricing · Provider-Led',
  },
  testosterone: {
    title: 'Evaluation first. Treatment only when it fits.',
    tagline: 'Testosterone Care · Labs · Ongoing Monitoring',
  },
  'peptide-therapy': {
    title: 'Peptide therapy, with the hard questions first.',
    tagline: 'Austin-Based Telehealth · TX · CO · FL · IA',
  },
  recovery: {
    title: 'Stay active without buying into hype.',
    tagline: 'Recovery · Performance · Long-Term Health',
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
    title: 'Your hormones changed. Your care should too.',
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
    // Description slot is used for the uppercase mono tagline (eyebrow-style).
    // canvaskit has no text-transform, so we uppercase here.
    description: page.tagline.toUpperCase(),
    logo: {
      path: './public/viva-logo-paper-cropped.png',
      size: [320, 60],
    },
    // Forest, cream, and coral mirror the current provider-led site system.
    bgGradient: [
      [12, 51, 35],
      [23, 75, 51],
    ],
    border: {
      color: [241, 168, 141],
      width: 14,
      side: 'inline-start',
    },
    padding: 80,
    // Use the same self-hosted brand fonts as the site. Keeping OG generation
    // local makes Cloudflare builds deterministic and avoids a third-party
    // font download during every deployment.
    fonts: [
      './public/fonts/fraunces-italic-latin.woff2',
      './public/fonts/geistmono-normal-latin.woff2',
    ],
    font: {
      title: {
        size: 88,
        lineHeight: 1.02,
        families: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        weight: 'Medium',
        color: [255, 253, 248],
      },
      description: {
        size: 26,
        lineHeight: 1.4,
        families: ['Geist Mono', 'Courier New', 'monospace'],
        weight: 'Medium',
        color: [241, 168, 141],
      },
    },
  }),
});
