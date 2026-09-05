# Partner asset intake

This directory contains approved images used by the public partner directory. Partner copy and outbound links live in `src/lib/partners.ts`.

## Before adding an asset

1. Confirm Viva has permission to publish the image or logo.
2. Confirm the asset depicts or identifies the correct independent business.
3. Remove embedded metadata that is not needed for display.
4. Do not add patient photos, testimonials, clinical records, or personal contact information.
5. Record a descriptive `imageAlt` in `src/lib/partners.ts`. Decorative marks should use an empty alt value instead.

## Production standards

- Prefer SVG for logos when the partner supplies an authoritative vector file.
- Prefer AVIF or WebP for photos; keep a PNG only when transparency or exact artwork requires it.
- Use lowercase, descriptive, hyphenated filenames.
- Crop photos to the aspect ratio used by the component before committing.
- Verify the result at mobile and desktop widths and run `npm run verify`.
- Do not upscale a small source image; request a sharper original.

Current production assets are referenced directly from `src/lib/partners.ts`. Unreferenced drafts belong in the gitignored `asset-drop/` intake directory, not here.
