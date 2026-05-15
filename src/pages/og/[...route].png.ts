// Per-page Open Graph image generation, build-time.
// Each route below produces a 1200x630 PNG at /og/<route>.png.
// Layout.astro switches og:image to /og/<route>.png for routes that exist here;
// everything else falls back to /og-image.jpg.

import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';

const blogPosts = await getCollection('blog', ({ data }) => !data.draft);

// Map of route slug -> page metadata for OG rendering.
// Slug must match what Layout.astro sends as the og:image URL.
const pages: Record<string, { title: string; description: string; eyebrow: string }> = {
  home: {
    eyebrow: 'Concierge Telehealth · Austin',
    title: 'Peptide therapy, engineered for the body you train.',
    description: 'Provider-led protocols. Peptides, GLP-1, TRT, recovery. Texas, Colorado, Florida.',
  },
  about: {
    eyebrow: 'The story',
    title: 'We treat health like training.',
    description: 'Founded by Liliana Damron, APRN, FNP-BC. A concierge practice for people who expect their body to keep up with their ambition.',
  },
  services: {
    eyebrow: 'Programs & memberships',
    title: "You bring the goals, we'll bring the protocol.",
    description: 'Concierge telehealth memberships from $99 to $699 per month. Flat fee, everything included.',
  },
  contact: {
    eyebrow: 'Start the conversation',
    title: 'Get the eBook. Get a real reply.',
    description: 'Drop your details. Liliana follows up personally, often same day.',
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your data, your control.',
    description: 'Plain-language privacy practices. No analytics cookies. No PHI on this site.',
  },
  terms: {
    eyebrow: 'Terms',
    title: 'How this works.',
    description: 'Membership terms, medical disclaimers, governing law. Plain language, short paragraphs.',
  },
  blog: {
    eyebrow: 'Patient education',
    title: 'Real answers, written by a clinician.',
    description: 'Peptide therapy and hormone medicine without the marketing. Clinical perspective, plain language.',
  },
};

for (const post of blogPosts) {
  pages[`blog/${post.id}`] = {
    eyebrow: post.data.category,
    title: post.data.title,
    description: post.data.description,
  };
}

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'route',
  pages,
  // Use the key as-is. The filename pattern [...route].png.ts already adds .png.
  getSlug: (path) => path,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    logo: {
      path: './public/viva-logo-paper.png',
      size: [220, 48],
    },
    bgGradient: [
      [12, 10, 9],
      [26, 22, 20],
    ],
    border: {
      color: [201, 120, 58],
      width: 4,
      side: 'inline-start',
    },
    padding: 60,
    font: {
      title: {
        size: 64,
        lineHeight: 1.05,
        families: ['Geist', 'Helvetica', 'Arial', 'sans-serif'],
        weight: 'Bold',
        color: [247, 244, 238],
      },
      description: {
        size: 28,
        lineHeight: 1.45,
        families: ['Geist', 'Helvetica', 'Arial', 'sans-serif'],
        weight: 'Normal',
        color: [184, 174, 161],
      },
    },
  }),
});
