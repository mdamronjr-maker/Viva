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
  key: 'peak' | 'metabolic' | 'trt' | 'concierge';
  name: string;
  price: string;
  body: string;
  bullets: string[];
  // Path to the lead magnet emailed to the user on this match.
  // Defaults to the generic /viva-ebook.pdf; replace with vertical-specific
  // PDFs once they exist (e.g. /ebooks/viva-glp-1-guide.pdf).
  ebookPath: string;
};

// TODO: replace these with vertical-specific lead magnets when authored.
//   Recommended path: /public/ebooks/viva-<slug>.pdf
//   e.g. viva-glp-1-guide.pdf, viva-trt-guide.pdf, viva-peak-performance.pdf,
//        viva-recovery-stack.pdf
const DEFAULT_EBOOK = '/viva-ebook.pdf';

export function match(a: Answers): Match {
  const goal = a.goal || 'longevity';
  const budget = a.budget || 'b199';
  const activity = a.activity || 'moderate';
  const sex = a.sex || 'm';

  // 1. Performance OR competitive athlete + budget >= $349 -> Peak Performance
  if ((goal === 'performance' || activity === 'competitive') && (budget === 'bmax' || budget === 'b349')) {
    return {
      key: 'peak',
      name: 'Peak Performance',
      price: '$699',
      body: 'Total-body optimization combining hormone, metabolic, recovery, and performance protocols in one fully managed plan.',
      bullets: [
        'Provider-led hormone foundation (TRT or HRT)',
        'Recovery peptide stack (BPC-157, TB-500, GHK-Cu)',
        'Performance support (CJC-1295 / Ipamorelin, MOTS-c)',
        'Comprehensive labs, supplies, and home delivery',
      ],
      ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-peak-performance.pdf
    };
  }

  // 2. Weight goal -> Metabolic Core
  if (goal === 'weight') {
    return {
      key: 'metabolic',
      name: 'Metabolic Core',
      price: '$349',
      body: 'Compounded GLP-1 protocol stepped to your physiology. Patient-specific semaglutide or tirzepatide from a 503A pharmacy (same active molecule as Wegovy and Mounjaro, prepared individually under clinical supervision, not the brand-name product).',
      bullets: [
        'Compounded semaglutide or tirzepatide, 503A-sourced',
        'Dose titration calibrated to your physiology, not a fixed protocol',
        'Tesamorelin option for visceral fat targeting',
        'Supplies, sharps, and home delivery included',
      ],
      ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-glp-1-guide.pdf
    };
  }

  // 3. Hormones + male + budget != $99 -> TRT All Inclusive
  if (goal === 'hormones' && sex === 'm' && budget !== 'b99') {
    return {
      key: 'trt',
      name: 'TRT All Inclusive',
      price: '$199',
      body: 'Personalized testosterone optimization with compounded medication, supplies, and biannual labs.',
      bullets: [
        'Compounded testosterone (injection, cream, or gel)',
        'Anastrozole and HCG when clinically indicated',
        'Biannual labs and dose adjustments',
        'Direct provider access by message',
      ],
      ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-trt-guide.pdf
    };
  }

  // 4. Recovery + budget >= $349 -> Metabolic Core (recovery emphasis)
  if (goal === 'recovery' && (budget === 'b349' || budget === 'bmax')) {
    return {
      key: 'metabolic',
      name: 'Metabolic Core',
      price: '$349',
      body: 'Provider-managed plan with recovery peptide emphasis. Combines metabolic support with our most-requested recovery stack.',
      bullets: [
        'BPC-157 + TB-500 recovery stack',
        'GHK-Cu for tissue repair and collagen support',
        'Optional GLP-1 for inflammation and body comp',
        'Provider-led dose calibration',
      ],
      ebookPath: DEFAULT_EBOOK, // TODO: /ebooks/viva-recovery-stack.pdf
    };
  }

  // 5. Default -> Concierge Access
  return {
    key: 'concierge',
    name: 'Concierge Access',
    price: '$99',
    body: 'Concierge-level provider attention without compounded medication in the price. The right tier when you want guidance across hormones, peptides, metabolic, or recovery and prefer to use insurance for labs and any insurance-covered medications.',
    bullets: [
      'Direct messaging access to your provider',
      'Lab orders and prescriptions routed through your insurance',
      'Guidance across hormones, peptides, metabolic, and recovery',
      'Step up to a compounded tier (TRT, Metabolic, Peak) any time',
      'Note: compounded peptides and GLP-1 are not included at this tier',
    ],
    ebookPath: DEFAULT_EBOOK,
  };
}
