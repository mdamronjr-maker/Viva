export const meta = {
  name: 'viva-review',
  description: 'Multi-lens adversarial review of the current diff vs feat/lights-on',
  whenToUse: 'Before merging any change in the Viva repo',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

// Forward slashes: git on Windows accepts them in both Bash and PowerShell,
// while unquoted backslashes collapse under the Bash tool.
const REPO = 'C:/dev/viva-wellness'
const DIFF_CMD = 'git -C "' + REPO + '" diff feat/lights-on...HEAD'

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short name for the problem' },
          file: { type: 'string', description: 'Repo-relative path of the file the finding is in' },
          line: { type: 'number', description: 'Line number in the changed file; 0 for a file-level finding' },
          detail: { type: 'string', description: 'What is wrong and why, with evidence from the diff or the file' },
          severity: { type: 'string', description: 'One of: blocker, major, minor' },
        },
        required: ['title', 'file', 'line', 'detail', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding does not hold up against the actual code' },
    reason: { type: 'string', description: 'Concrete evidence for the verdict, citing file:line' },
  },
  required: ['refuted', 'reason'],
}

const LENSES = [
  {
    id: 'correctness',
    focus: 'Bugs and breakage. Logic errors, broken imports or links, syntax problems, anything that would break npm run build, broken form or quiz behavior, regressions in behavior the diff touches, and mismatches between what the code does and what the change claims to do.',
  },
  {
    id: 'compliance',
    focus: 'Protected content and funnel contracts. AGENTS.md lists content that must stay byte-identical: prices and payment terms, testimonial quotes, compliance copy (503A disclosures, NoPhiNotice, legal pages, disclaimers), JSON-LD source strings, form field names, the source values posted to /api/lead, the #quiz element id, GlossGenius URLs and UTM params, everything under functions/api/, and the brand line in the home hero. Flag any hunk that edits, moves, or rewords any of it. Also flag any invented owner content: license numbers, the GlossGenius deep link, tier rulings, menu stack names, CV facts, replacement reviews, or a fabricated hero photo.',
  },
  {
    id: 'voice',
    focus: 'Voice and style rules. No em dashes or en dashes anywhere. Interpunct only as a separator in mono metadata. First-person Liliana voice with no fabricated stories, credentials, claims, or PHI implications. Negation budget: at most one X-not-Y construction per page, with the standing exemptions AGENTS.md names. The site-wide budget for the word actually is fully allocated, so any new use is a violation. Headlines are single color; italic display appears only on each page hero accent line, one per page; no counting-headline formula except the sanctioned Google review one. CTAs are plain sentence-case verbs, and the word protocol stays in clinical body copy.',
  },
  {
    id: 'design',
    focus: 'Design system. Tokens live in src/styles/global.css and must not be renamed; token names predate the light flip, so check roles, not names. Font weights must stay inside the declared variable ranges (Fraunces 350 to 600, Geist 300 to 900, Mono 400 to 600). Every text pairing must hold WCAG 4.5:1 and meaningful strokes 3:1. Butter is a fill, never a text color on light grounds. Imagery policy: people must be real photographs, never photoreal generated humans, never generated art presented as photography; every new image needs a caption, correct width and height attributes, webp responsive pairs, and a matching preload in Layout.astro when it is the LCP asset.',
  },
  {
    id: 'seo-schema',
    focus: 'SEO and structured data. The faqs arrays on home and /menopause feed FAQPage schema and their source strings must not change (only the render-only aHtml field is fair game). The MedicalBusiness/WebSite graph, Person, and BlogPosting JSON-LD must stay valid and consistent with the page content. Check meta tags, canonical links, og share cards under src/pages/og/, public/_redirects, and anything the diff touches in Layout.astro for schema or SEO breakage.',
  },
]

function finderPrompt(lens) {
  return [
    'You are one of five independent reviewers examining a pending change in the Viva Wellness repo at ' + REPO + '.',
    '',
    'Setup, in order:',
    '1. Read ' + REPO + '\\AGENTS.md in full. It is the source of truth for every rule you enforce.',
    '2. Run: ' + DIFF_CMD,
    '   That diff is the entire scope of this review. Read surrounding file context wherever the diff alone is ambiguous.',
    '',
    'Your lens: ' + lens.id + '.',
    lens.focus,
    '',
    'Report only real problems you can tie to a specific place in the diff. Cite every finding as file:line, using the repo-relative path and the line number in the changed file (0 for file-level issues). Stay inside your lens, and do not report problems in code the diff does not touch. If you find nothing, return an empty findings list. Your structured output is data for an orchestrator, not prose for a human.',
  ].join('\n')
}

function verifierPrompt(lens, f) {
  return [
    'You are an adversarial verifier in the Viva Wellness repo at ' + REPO + '. A reviewer using the ' + lens.id + ' lens reported the finding below against the pending diff (' + DIFF_CMD + '). Your job is to try to REFUTE it.',
    '',
    'Finding:',
    'Title: ' + f.title,
    'Severity: ' + f.severity,
    'Location: ' + f.file + ':' + f.line,
    'Detail: ' + f.detail,
    '',
    'Do this, in order:',
    '1. Read ' + REPO + '\\AGENTS.md so you are judging against the actual rules, not a paraphrase.',
    '2. Run ' + DIFF_CMD + ' and open the cited file at the cited location. Read the real code and the hunk that touches it.',
    '3. Attack the finding: is the code actually fine, is the rule misread, is the location wrong, is the issue outside this diff, did the behavior already exist before the change?',
    '',
    'Set refuted to true if the finding is wrong, overstated, mislocated, outside the diff, or not a violation of any rule in AGENTS.md. Set refuted to false only if you confirmed the problem in the actual code. Either way, give a concrete reason with evidence cited as file:line.',
  ].join('\n')
}

phase('Find')
log('viva-review: fanning out five finder lenses over the diff vs feat/lights-on')

const perLens = await pipeline(
  LENSES,
  (lens) =>
    agent(finderPrompt(lens), {
      label: 'find ' + lens.id,
      phase: 'Find',
      schema: FINDINGS_SCHEMA,
    }),
  (result, lens) => {
    const findings = result && Array.isArray(result.findings) ? result.findings : []
    if (findings.length === 0) return []
    log('viva-review: ' + lens.id + ' reported ' + findings.length + ' finding(s), sending each to an adversarial verifier')
    return parallel(
      findings.map((f, i) => () =>
        agent(verifierPrompt(lens, f), {
          label: 'verify ' + lens.id + ' #' + (i + 1),
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
        }).then((verdict) => ({ lens: lens.id, finding: f, verdict: verdict }))
      )
    )
  }
)

const judged = (perLens || [])
  .filter(Boolean)
  .flat()
  .filter(Boolean)

const confirmed = []
let refuted_count = 0
for (const entry of judged) {
  if (entry.verdict && entry.verdict.refuted === true) {
    refuted_count = refuted_count + 1
  } else {
    confirmed.push(
      Object.assign({}, entry.finding, {
        lens: entry.lens,
        verify_note: entry.verdict ? entry.verdict.reason : 'verifier unavailable; finding kept because it was not refuted',
      })
    )
  }
}

log('viva-review: ' + confirmed.length + ' confirmed, ' + refuted_count + ' refuted')

// Workflow result: the findings that survived adversarial verification, plus
// the refuted count. The workflow runtime executes this body inside an async
// wrapper, so a top-level return is the correct way to deliver the result
// (node --check is NOT a valid syntax oracle for this file).
return { confirmed: confirmed, refuted_count: refuted_count }
