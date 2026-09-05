#!/usr/bin/env node
/*
 * guard-protected.mjs
 *
 * Verifies the protected content declared in AGENTS.md ("Protected content,
 * byte-identical, never edit") against the working tree. The expected
 * literals live in scripts/protected.snapshot.json; each snapshot entry
 * names a file, a category, a literal, and the exact number of times that
 * literal must occur in the file (plain byte-for-byte substring count,
 * non-overlapping).
 *
 * Exit 0 with a single OK line when every check passes. Exit 1 listing
 * every missing or miscounted literal (category, file, expected vs found)
 * when anything drifted.
 *
 * Updating the snapshot: see the _readme field inside
 * scripts/protected.snapshot.json. Short version: edit it deliberately in
 * the same PR that intentionally changes protected content, never to
 * silence an unintended failure.
 *
 * No dependencies beyond node builtins. No network. Run from anywhere:
 * paths resolve relative to this script's own location.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const snapshotPath = resolve(scriptDir, 'protected.snapshot.json');

function fail(msg) {
  console.error(`guard-protected FAIL: ${msg}`);
  process.exit(1);
}

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
} catch (err) {
  fail(`cannot read or parse ${snapshotPath}: ${err.message}`);
}

if (!snapshot || !Array.isArray(snapshot.checks) || snapshot.checks.length === 0) {
  fail('snapshot has no "checks" array (or it is empty).');
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function preview(literal, max = 72) {
  const flat = literal.replace(/\s+/g, ' ');
  return flat.length <= max ? flat : `${flat.slice(0, max)}...`;
}

const fileCache = new Map();
function readTreeFile(relPath) {
  if (fileCache.has(relPath)) return fileCache.get(relPath);
  let text = null;
  try {
    text = readFileSync(resolve(repoRoot, relPath), 'utf8');
  } catch {
    text = null;
  }
  fileCache.set(relPath, text);
  return text;
}

const failures = [];
let badEntries = 0;

snapshot.checks.forEach((check, i) => {
  const { category, file, literal } = check || {};
  const expected = check ? check.count : undefined;
  if (
    typeof category !== 'string' || typeof file !== 'string' ||
    typeof literal !== 'string' || literal.length === 0 ||
    !Number.isInteger(expected) || expected < 1
  ) {
    badEntries += 1;
    failures.push(`  [snapshot] checks[${i}] is malformed (needs string category/file/literal and integer count >= 1)`);
    return;
  }
  const text = readTreeFile(file);
  if (text === null) {
    failures.push(`  [${category}] ${file}: file missing or unreadable, expected ${expected}x "${preview(literal)}"`);
    return;
  }
  const found = countOccurrences(text, literal);
  if (found !== expected) {
    const verdict = found === 0 ? 'MISSING' : 'COUNT CHANGED';
    failures.push(`  [${category}] ${file}: ${verdict}, expected ${expected}, found ${found}: "${preview(literal)}"`);
  }
});

const total = snapshot.checks.length;
const fileCount = new Set(snapshot.checks.map((c) => c && c.file).filter(Boolean)).size;

if (failures.length > 0) {
  console.error(`guard-protected FAIL: ${failures.length} of ${total} checks failed${badEntries ? ` (${badEntries} malformed snapshot entries)` : ''}.`);
  for (const line of failures) console.error(line);
  console.error('Protected content drifted (or the snapshot is stale). See scripts/protected.snapshot.json _readme for the update procedure.');
  process.exit(1);
}

console.log(`guard-protected OK: ${total} protected literals verified across ${fileCount} files.`);
process.exit(0);
