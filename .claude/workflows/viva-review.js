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
    focus: 'Rule 1: legal and compliant, the only content rule. Testimonial quotes are byte-frozen (real Google reviews, FTC endorsement rules); displayed prices and payment terms must match what GlossGenius actually bills ($99 / $199 / $249 / $349 / $499 tiers, $199 first visit, $50 deposit); no invented credentials, license numbers, outcome guarantees, or clinical claims beyond what the site already asserts; no blurring compounded 503A products with FDA-approved drugs; 503A disclosures, NoPhiNotice, and the legal pages stay intact; no PHI anywhere; no personal-infrastructure details in the repo. Do NOT flag style, voice, or design; those carry no rules.',
  },
  {
    id: 'regression',
    focus: 'Functional regressions that break revenue or the machine-readable layer. Form field names and the source values posted to /api/lead must match what functions/api/lead.js reads; the #quiz element id survives (public/_redirects 301s /quiz there); GlossGenius links still point at vivawellnessco.glossgenius.com; JSON-LD still parses and FAQPage schema stays consistent with the visible FAQ text; only the 404 page is noindexed; OG_CACHE_VERSION bumped when card rendering changed. If the diff deliberately changes a literal pinned in scripts/protected.snapshot.json, the snapshot must be updated in the same diff with the reason stated.',
  },
]

function finderPrompt(lens) {
  return [
    'You are one of three independent reviewers examining a pending change in the Viva Wellness repo at ' + REPO + '.',
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
log('viva-review: fanning out three finder lenses over the diff vs feat/lights-on')

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
