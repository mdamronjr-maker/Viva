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
    title: "You bring the goals. I'll build the protocol.",
    tagline: 'Peptides · GLP-1 · TRT/HRT · Menopause · TX · CO · FL · IA',
  },
  about: {
    title: 'Meet your provider.',
    tagline: 'The Founder · Liliana Damron, APRN, FNP-BC',
  },
  services: {
    title: 'What I treat, and what it costs.',
    tagline: 'Concierge Memberships · $99–$499 / month · TX · CO · FL · IA',
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
  menu: {
    title: 'Stacks & protocols.',
    tagline: 'The Full Menu · Peptides · GLP-1 · TRT/HRT',
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
      path: './public/viva-logo-ink.png',
      size: [280, 60],
    },
    // Background: the light gouache Capitol art (public/og-bg.png), pre-washed
    // with cream so charcoal type reads at full contrast.
    bgGradient: [
      [247, 242, 233],
      [239, 232, 218],
    ],
    bgImage: {
      path: './public/og-bg.png',
      fit: 'cover',
      position: 'center',
    },
    border: {
      color: [244, 226, 155],
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
        color: [43, 37, 29],
      },
      description: {
        size: 26,
        lineHeight: 1.4,
        families: ['Geist Mono', 'Courier New', 'monospace'],
        weight: 'Medium',
        color: [111, 84, 16],
      },
    },
  }),
});
