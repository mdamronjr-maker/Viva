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
    title: 'Peptide therapy, engineered for the body you train.',
    tagline: 'Concierge Telehealth · Austin · TX · CO · FL',
  },
  about: {
    title: 'I treat health like training.',
    tagline: 'The Story · Liliana Damron, APRN, FNP-BC',
  },
  services: {
    title: 'Peptide therapy. TRT. GLP-1. Hormone optimization.',
    tagline: 'Concierge Memberships · From $99 / month · TX · CO · FL',
  },
  partners: {
    title: 'The Austin partners I trust with my patients.',
    tagline: 'The Trusted Network · 11 hand-picked partners',
  },
  contact: {
    title: 'Get the eBook. Get a real reply.',
    tagline: 'Start the Conversation · Same-day follow-up',
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
    title: 'Real answers, written by a clinician.',
    tagline: 'Patient Education · Peptide therapy, hormones, GLP-1',
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
      path: './public/viva-logo-paper.png',
      size: [280, 60],
    },
    // Photo background — Matt Johnson running past the Texas Capitol, pre-
    // darkened to 1200x630 with a 55% overlay by scripts/build-og-bg.mjs.
    // The pre-bake is necessary because astro-og-canvas draws bgImage AFTER
    // bgGradient (no native overlay option), and the raw photo is too bright
    // for paper/bronze text to read against the sky.
    bgGradient: [
      [12, 10, 9],
      [22, 18, 16],
    ],
    bgImage: {
      path: './public/matt-johnson-og.png',
      fit: 'cover',
      position: 'center',
    },
    border: {
      color: [201, 120, 58],
      width: 14,
      side: 'inline-start',
    },
    padding: 80,
    // Brand display fonts loaded from Fontsource at build time. Fraunces
    // italic carries the editorial voice; Geist Mono handles the tagline.
    // Only loading italic Fraunces faces so the family always renders italic.
    fonts: [
      'https://api.fontsource.org/v1/fonts/fraunces/latin-600-italic.ttf',
      'https://api.fontsource.org/v1/fonts/fraunces/latin-500-italic.ttf',
      'https://api.fontsource.org/v1/fonts/geist-mono/latin-500-normal.ttf',
    ],
    font: {
      title: {
        size: 88,
        lineHeight: 1.02,
        families: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        weight: 'Medium',
        color: [247, 244, 238],
      },
      description: {
        size: 26,
        lineHeight: 1.4,
        families: ['Geist Mono', 'Courier New', 'monospace'],
        weight: 'Medium',
        color: [212, 154, 100],
      },
    },
  }),
});
