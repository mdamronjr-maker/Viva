/**
 * One-shot build step: take the high-res /public/matt-johnson.jpg portrait
 * (1600x2400) and produce /public/matt-johnson-og.jpg sized exactly to the
 * Open Graph canvas (1200x630) with a dark overlay baked in so that
 * Fraunces title + bronze tagline read cleanly on top.
 *
 * Run: `node scripts/build-og-bg.mjs`
 *
 * The output is committed to /public so the OG generator can reference it as
 * a regular static asset (astro-og-canvas's bgImage takes a file path).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import CanvasKitInit from 'canvaskit-wasm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const inputPath = resolve(projectRoot, 'public/matt-johnson.jpg');
const outputPath = resolve(projectRoot, 'public/matt-johnson-og.png');

const CANVAS_W = 1200;
const CANVAS_H = 630;

// Black overlay opacity. 0 = no darkening, 1 = solid black.
// 0.5–0.6 leaves the photo readable while letting paper/bronze text dominate.
const OVERLAY_ALPHA = 0.55;

// We position the cover-fit slightly toward the top of the image so the
// runner's torso + Capitol dome stay in frame (the bottom of the portrait
// is mostly road). 0 = top, 0.5 = center, 1 = bottom.
const VERTICAL_FOCUS = 0.32;

const CanvasKit = await CanvasKitInit({
  locateFile: (file) => resolve(projectRoot, 'node_modules/canvaskit-wasm/bin/', file),
});

const inputBytes = readFileSync(inputPath);
const sourceImage = CanvasKit.MakeImageFromEncoded(inputBytes);
if (!sourceImage) {
  throw new Error(`Failed to decode ${inputPath}`);
}

const surface = CanvasKit.MakeSurface(CANVAS_W, CANVAS_H);
if (!surface) throw new Error('CanvasKit surface allocation failed');
const canvas = surface.getCanvas();

// Cover-fit math: scale by whichever dimension hits first, then crop.
const iw = sourceImage.width();
const ih = sourceImage.height();
const scale = Math.max(CANVAS_W / iw, CANVAS_H / ih);
const targetW = iw * scale;
const targetH = ih * scale;
const targetX = (CANVAS_W - targetW) / 2;
// VERTICAL_FOCUS biases which slice survives the crop:
//   focus=0   → top of image aligned with top of canvas
//   focus=0.5 → centered (default behavior of cover)
//   focus=1   → bottom of image aligned with bottom of canvas
const targetY = (CANVAS_H - targetH) * VERTICAL_FOCUS;

canvas.drawImageRect(
  sourceImage,
  CanvasKit.XYWHRect(0, 0, iw, ih),
  CanvasKit.XYWHRect(targetX, targetY, targetW, targetH),
  new CanvasKit.Paint(),
);

// Darken pass. Full-canvas rect with semi-transparent black.
const overlay = new CanvasKit.Paint();
overlay.setColor(CanvasKit.Color(0, 0, 0, OVERLAY_ALPHA));
canvas.drawRect(CanvasKit.XYWHRect(0, 0, CANVAS_W, CANVAS_H), overlay);

// Encode and write.
surface.flush();
const snapshot = surface.makeImageSnapshot();
// PNG is the format canvaskit-wasm reliably supports in node. File size is
// larger than JPEG but still small (~250–400 KB at 1200x630).
const encoded = snapshot.encodeToBytes(CanvasKit.ImageFormat.PNG, 100);
if (!encoded) throw new Error('Failed to encode output PNG');
writeFileSync(outputPath, Buffer.from(encoded));

console.log(`Wrote ${outputPath} (${CANVAS_W}x${CANVAS_H}, ${OVERLAY_ALPHA * 100}% dark overlay)`);
