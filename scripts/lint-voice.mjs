#!/usr/bin/env node
/*
 * lint-voice.mjs
 *
 * Mechanical checks for the AGENTS.md voice and style rules that can be
 * enforced without taste. Scope: src/pages, src/components, src/layouts,
 * src/lib (.astro, .md, .mdx, .ts files; src/lib carries rendered copy such
 * as quiz-result strings and the partners directory). Rules:
 *
 *   1. dash        No em dash (U+2014) or en dash (U+2013) anywhere.
 *   2. actually    Whole-word, case-insensitive count of "actually" across
 *                  the whole scope must not exceed 3 (the site-wide budget,
 *                  fully allocated).
 *   3. italic-display  At most one markup usage of "italic-display" per file
 *                  under src/pages, counting class="..." attributes and
 *                  class:list={...} values on a single line. CSS rule
 *                  definitions (.italic-display selectors) do not count.
 *                  Known limitation: a class attribute wrapped across lines,
 *                  or a usage inside a component or layout, escapes the count.
 *   4. brand-line  The brand line lives ONLY in the home hero. Any fragment
 *                  of "You bring the goals" / "I'll build the protocol"
 *                  outside src/pages/index.astro fails (AGENTS.md: exactly
 *                  once site-wide, never reused or varied).
 *
 * Exit 0 with one OK line when clean; exit 1 listing every violation as
 * file:line otherwise.
 *
 * GRANDFATHERED EXCLUSIONS (documented, deliberately narrow):
 * This linter was adopted after the fact by a harness change that is not
 * allowed to edit site source, and the tree already contained violations
 * that live entirely inside NON-RENDERED code comments (JS, CSS, and
 * frontmatter comments), which never reach a visitor. Those exact
 * occurrences are excluded below, matched by file plus a dash-free
 * fragment of the offending line, so the exclusion dies naturally if the
 * comment is edited or removed. Do not add entries to cover rendered copy;
 * remove entries as the comments get cleaned up.
 *   - DASH_EXCLUSIONS: 13 em dashes in code comments.
 *   - ACTUALLY_EXCLUSIONS: 2 uses of "actually" in code comments. The
 *     3-use copy budget is fully held by rendered copy (the home FAQ, the
 *     menopause FAQ, and the partners directory intro), so comment uses
 *     would otherwise falsely blow the budget.
 *
 * No dependencies beyond node builtins. No network. Run from anywhere:
 * paths resolve relative to this script's own location.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const SCOPE_DIRS = ['src/pages', 'src/components', 'src/layouts', 'src/lib'];
const EXTENSIONS = ['.astro', '.md', '.mdx', '.ts'];
const ACTUALLY_BUDGET = 3;

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

// Pre-existing em dashes inside non-rendered code comments (see header).
// Matched by file + a dash-free fragment of the line the dash sits on.
const DASH_EXCLUSIONS = [
  { file: 'src/pages/blog/[...slug].astro', lineIncludes: 'scroll/resize handler before rebinding' },
  { file: 'src/pages/index.astro', lineIncludes: 'reset its scrollTop so every new step starts at the top' },
  { file: 'src/pages/index.astro', lineIncludes: "these li's are injected at runtime by the quiz script" },
  { file: 'src/pages/index.astro', lineIncludes: 'vertical padding + content-box clip' },
  { file: 'src/pages/menu.astro', lineIncludes: 'stack names are edgy Spanish slang' },
  { file: 'src/pages/og/[...route].png.ts', lineIncludes: "Same display font as the site's H1s" },
  { file: 'src/pages/og/[...route].png.ts', lineIncludes: 'eyebrow-style, not a sentence' },
  { file: 'src/pages/services.astro', lineIncludes: 'GlossGenius is the source of truth' },
  { file: 'src/pages/services.astro', lineIncludes: 'it does not apply to Viva Concierge Access' },
  { file: 'src/pages/services.astro', lineIncludes: 'type that actually defines' },
  { file: 'src/components/MobileStickyCta.astro', lineIncludes: 'otherwise those pages get an empty bottom band' },
  { file: 'src/layouts/Layout.astro', lineIncludes: 'Booking links (GlossGenius) navigate directly' },
  { file: 'src/layouts/Layout.astro', lineIncludes: 'Subtle parallax on the Vega backdrop images' },
  { file: 'src/lib/quiz.ts', lineIncludes: 'the provider confirms' },
  { file: 'src/lib/partners.ts', lineIncludes: 'are functionally identical' },
];

// Brand-line fragments that may exist ONLY in the home hero. One grandfathered
// occurrence: menu.astro's lead sentence predates this rule and is pending an
// owner ruling on whether it counts as a brand-line variation. Do not add more.
const BRAND_FRAGMENTS = ['You bring the goals', "I'll build the protocol"];
const BRAND_HOME = 'src/pages/index.astro';
const BRAND_EXCLUSIONS = [
  { file: 'src/pages/menu.astro', lineIncludes: "Tell me your goals and I'll build the protocol" },
];

// Pre-existing "actually" uses inside non-rendered code comments (see header).
const ACTUALLY_EXCLUSIONS = [
  { file: 'src/pages/services.astro', lineIncludes: 'type that actually defines' },
  { file: 'src/components/MobileStickyCta.astro', lineIncludes: 'Only reserve space when the bar is actually rendered' },
];

function toPosix(p) {
  return p.split('\\').join('/');
}

function isExcluded(exclusions, relFile, lineText) {
  return exclusions.some((ex) => ex.file === relFile && lineText.includes(ex.lineIncludes));
}

function walk(dirAbs, out) {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (entry.isFile() && EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

const files = [];
for (const dir of SCOPE_DIRS) walk(resolve(repoRoot, dir), files);
files.sort();

const violations = [];
const actuallyHits = []; // { file, line } for every counted (non-excluded) use
let scanned = 0;

for (const abs of files) {
  const relFile = toPosix(abs.slice(repoRoot.length + 1));
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    violations.push(`${relFile}: unreadable file`);
    continue;
  }
  if (text.includes('\u0000')) continue; // binary masquerading under a text extension
  scanned += 1;

  const lines = text.split(/\r\n|\r|\n/);
  let italicDisplayUses = []; // line numbers of markup usages in this file
  const isPage = relFile.startsWith('src/pages/');

  lines.forEach((lineText, idx) => {
    const lineNo = idx + 1;

    // Rule 1: em/en dashes.
    if (lineText.includes(EM_DASH) || lineText.includes(EN_DASH)) {
      if (!isExcluded(DASH_EXCLUSIONS, relFile, lineText)) {
        const which = [];
        if (lineText.includes(EM_DASH)) which.push('em dash U+2014');
        if (lineText.includes(EN_DASH)) which.push('en dash U+2013');
        violations.push(`${relFile}:${lineNo} dash: ${which.join(' and ')} found`);
      }
    }

    // Rule 2: collect whole-word "actually" hits; budget judged after the scan.
    if (/\bactually\b/i.test(lineText) && !isExcluded(ACTUALLY_EXCLUSIONS, relFile, lineText)) {
      const matches = lineText.match(/\bactually\b/gi) || [];
      for (let k = 0; k < matches.length; k += 1) {
        actuallyHits.push({ file: relFile, line: lineNo });
      }
    }

    // Rule 3: markup usages of italic-display in class attributes on pages.
    // CSS selectors (.italic-display) are not class attributes and do not match.
    if (isPage && lineText.includes('italic-display')) {
      const attrMatches =
        (lineText.match(/class="[^"]*italic-display[^"]*"/g) || []).length +
        (lineText.match(/class='[^']*italic-display[^']*'/g) || []).length +
        (lineText.match(/class:list=\{[^}]*italic-display/g) || []).length;
      for (let k = 0; k < attrMatches; k += 1) italicDisplayUses.push(lineNo);
    }

    // Rule 4: brand-line fragments outside the home hero.
    if (relFile !== BRAND_HOME) {
      for (const fragment of BRAND_FRAGMENTS) {
        if (lineText.includes(fragment) && !isExcluded(BRAND_EXCLUSIONS, relFile, lineText)) {
          violations.push(
            `${relFile}:${lineNo} brand-line: "${fragment}" outside the home hero (exactly once site-wide)`
          );
        }
      }
    }
  });

  if (isPage && italicDisplayUses.length > 1) {
    violations.push(
      `${relFile}:${italicDisplayUses.join(',')} italic-display: ${italicDisplayUses.length} markup usages in one page (max 1 per page)`
    );
  }
}

if (actuallyHits.length > ACTUALLY_BUDGET) {
  for (const hit of actuallyHits) {
    violations.push(`${hit.file}:${hit.line} actually: counted toward the site-wide budget`);
  }
  violations.push(
    `(scope-wide) actually: ${actuallyHits.length} whole-word uses, budget is ${ACTUALLY_BUDGET}`
  );
}

violations.sort();

if (violations.length > 0) {
  console.error(`lint-voice FAIL: ${violations.length} violation(s) across ${scanned} files scanned.`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(`lint-voice OK: ${scanned} files scanned, 0 violations (actually budget ${actuallyHits.length}/${ACTUALLY_BUDGET}).`);
process.exit(0);
