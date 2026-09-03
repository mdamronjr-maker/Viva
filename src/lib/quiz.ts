// Single source of truth for the protocol-match quiz.
// Imported by src/pages/index.astro (embedded quiz) and src/pages/quiz.astro
// (standalone). Keep priority rules here matching README.

// Answers come from DOM dataset values (string). Valid values per question:
//   goal:     'weight' | 'hormones' | 'recovery' | 'longevity' | 'performance'
//   age:      'u35' | '35to44' | '45to54' | '55plus'
//   sex:      'm' | 'f'
//   activity: 'sedentary' | 'moderate' | 'athlete' | 'competitive'
//   budget:   'b99' | 'b199' | 'b349' | 'bmax'
export type Answers = Partial<{
  goal: string;
  age: string;
  sex: string;
  activity: string;
  budget: string;
}>;

export type Match = {
  key: 'metabolic' | 'trt' | 'concierge';
  name: string;
  price: string;
  body: string;
  bullets: string[];
  // Peptide / protocol talking points for the discovery call, tailored to the
  // lead's answers. Conversation starters only — the provider confirms
  // clinical fit; nothing here is a prescription or a promise.
  discuss: string[];
  // Path to the lead magnet emailed to the user on this match.
  // Defaults to the generic /viva-ebook.pdf; replace with vertical-specific
  // PDFs once they exist (e.g. /ebooks/viva-glp-1-guide.pdf).
  ebookPath: string;
};

// TODO: replace these with vertical-specific lead magnets when authored.
//   Recommended path: /public/ebooks/viva-<slug>.pdf
//   e.g. viva-glp-1-guide.pdf, viva-trt-guide.pdf, viva-recovery-stack.pdf
const DEFAULT_EBOOK = '/viva-ebook.pdf';

export function match(a: Answers): Match {
  const goal = a.goal || 'longevity';
  const budget = a.budget || 'b199';
  const sex = a.sex || 'm';

  // Hormone therapy surfaces as a potential recommendation on every path,
  // not just the explicit hormones goal. The provider confirms clinical fit;
  // this is a discovery-call talking point, never a prescription.
  const midlife = a.age === '45to54' || a.age === '55plus';
  const hormoneDiscuss =
    sex === 'f'
      ? midlife
        ? 'HRT · whether perimenopause or menopause management (estradiol, progesterone) belongs in your plan'
        : 'HRT · whether a hormone baseline panel (estradiol, progesterone, thyroid) should anchor the plan'
      : 'TRT · whether a testosterone baseline panel belongs in your workup';

  // 1. Weight goal -> Metabolic Core
  if (goal === 'weight') {
    return {
      key: 'metabolic',
      name: 'Metabolic Core',
      price: '$349',
      body: 'Compounded GLP-1 protocol stepped to your physiology. Patient-specific tirzepatide from a 503A pharmacy (same active molecule as Mounjaro and Zepbound, prepared individually under clinical supervision, not the brand-name product).',
      bullets: [
        'Compounded tirzepatide, 503A-sourced',
        'Dose titration calibrated to your physiology',
        'Tesamorelin option for visceral fat targeting',
        'Supplies, sharps, and home delivery included',
      ],
      discuss: [
        'Tesamorelin · targets visceral fat specifically; the most common pairing with a GLP-1',
        'CJC-1295 / Ipamorelin · lean-muscle and sleep support while the weight comes off',
        'MOTS-c · mitochondrial support for energy and insulin sensitivity',
        'Your titration plan · where tirzepatide starts and how fast it steps up',
        hormoneDiscuss,
      ],
      ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-glp-1-guide.pdf
    };
  }

  // 2. Hormones -> Viva Concierge Access for women; TRT All Inclusive for
  // men whose stated budget is above the $99 concierge tier. HRT medications
  // are clinician-selected add-ons, not part of the concierge membership.
  if (goal === 'hormones') {
    const isFemale = sex === 'f';
    if (isFemale) {
      return {
        key: 'trt',
        name: 'Viva Concierge Access',
        price: '$99',
        body: 'Provider-led HRT management with monthly evaluation, dosing guidance, and direct provider access. Compounded estradiol and progesterone are available as clinician-selected add-ons and are not included in the $99 membership fee.',
        bullets: [
          'Monthly evaluation and ongoing medication management',
          'Perimenopause and menopause symptom management',
          'Compounded estradiol and progesterone available as add-ons',
          'Insurance routing for eligible labs and retail prescriptions',
          'Direct provider access by message',
        ],
        discuss: [
          'Your HRT options · whether estradiol, progesterone, or another medication belongs in your plan',
          'GHK-Cu · collagen, skin, and hair support alongside HRT',
          'CJC-1295 / Ipamorelin · sleep architecture and recovery',
          'Low-dose testosterone · whether it belongs in your protocol',
          'BPC-157 · gut and joint support if either is a complaint',
        ],
        ebookPath: DEFAULT_EBOOK,
      };
    }

    if (budget !== 'b99') {
      return {
        key: 'trt',
        name: 'TRT All Inclusive',
        price: '$199',
        body: 'Personalized testosterone optimization with compounded testosterone, supplies, biannual labs, and home delivery included.',
        bullets: [
          'Compounded testosterone (injection, cream, or gel)',
          'Personalized dosing and ongoing adjustments',
          'Biannual labs',
          'Supplies, sharps, and home delivery',
          'Direct provider access by message',
        ],
        discuss: [
          'CJC-1295 / Ipamorelin · growth-hormone support that pairs well with TRT',
          'BPC-157 · joint and gut support as training volume climbs',
          'MOTS-c · metabolic and endurance support',
          'Adjuncts · anastrozole, HCG, enclomiphene. What your labs say belongs in the plan',
        ],
        ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-trt-guide.pdf
      };
    }
  }

  // 3. Recovery + budget >= $349 -> Metabolic Core (recovery emphasis)
  if (goal === 'recovery' && (budget === 'b349' || budget === 'bmax')) {
    return {
      key: 'metabolic',
      name: 'Metabolic Core',
      price: '$349',
      body: 'Provider-managed plan with recovery peptide emphasis. Combines metabolic support with the most-requested recovery stack.',
      bullets: [
        'BPC-157 + TB-500 recovery stack',
        'GHK-Cu for tissue repair and collagen support',
        'Optional GLP-1 for inflammation and body comp',
        'Provider-led dose calibration',
      ],
      discuss: [
        'BPC-157 + TB-500 · the core repair stack for tendon, joint, and gut',
        'GHK-Cu · tissue repair, collagen, and skin quality',
        'CJC-1295 / Ipamorelin · deep-sleep recovery and growth-hormone support',
        'Whether low-dose GLP-1 belongs in the plan for inflammation and body comp',
        hormoneDiscuss,
      ],
      ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-recovery-stack.pdf
    };
  }

  // 4. Default -> Viva Concierge (includes performance-goal leads, who
  //    build their peptide stack a la carte at member pricing)
  const discuss =
    goal === 'performance'
      ? [
          'CJC-1295 / Ipamorelin · growth-hormone support for output and recovery',
          'MOTS-c · mitochondrial endurance and metabolic efficiency',
          'BPC-157 + TB-500 · the repair stack that keeps training volume sustainable',
          'Whether a hormone baseline panel should come before the peptide stack',
        ]
      : goal === 'recovery'
        ? [
            'BPC-157 + TB-500 · the core repair stack for tendon, joint, and gut',
            'GHK-Cu · tissue repair, collagen, and skin quality',
            'CJC-1295 / Ipamorelin · deep-sleep recovery',
            'Which labs to run first to anchor the plan',
          ]
        : [
            'CJC-1295 / Ipamorelin · sleep architecture and the GH axis',
            'GHK-Cu · collagen, skin, and tissue repair',
            'MOTS-c · metabolic and mitochondrial support for healthspan',
            'Which labs to run first to anchor the plan',
          ];
  discuss.push(hormoneDiscuss);
  return {
    key: 'concierge',
    name: 'Viva Concierge',
    price: '$99',
    body: 'Provider access plus member pricing on compounded peptides, GLP-1, and medication add-ons, including HRT. Pay a la carte for the protocols you want instead of committing to an all-inclusive monthly fee. The right tier when you want flexibility and provider expertise without a bundled price.',
    bullets: [
      'Direct messaging access to your provider',
      'Monthly evaluation visit + one acute/sick visit credit per month',
      'Member pricing on compounded peptides, GLP-1, and hormone add-ons',
      'Lab orders + standard prescriptions routed through your insurance',
      'Guidance across hormones, peptides, metabolic, and recovery',
    ],
    discuss,
    ebookPath: DEFAULT_EBOOK,
  };
}
