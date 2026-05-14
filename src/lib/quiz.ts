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
};

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
    };
  }

  // 2. Weight goal -> Metabolic Core
  if (goal === 'weight') {
    return {
      key: 'metabolic',
      name: 'Metabolic Core',
      price: '$349',
      body: 'Stepped-up GLP-1 protocol for stronger appetite control, consistent fat loss, and preserved muscle.',
      bullets: [
        'Compounded GLP-1 protocol (Semaglutide or Tirzepatide)',
        'Dose titration calibrated to your physiology',
        'Tesamorelin option for visceral fat targeting',
        'Supplies, sharps, and home delivery included',
      ],
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
    };
  }

  // 5. Default -> Viva Concierge
  return {
    key: 'concierge',
    name: 'Viva Concierge',
    price: '$99',
    body: 'Concierge provider access for evaluation, ongoing guidance, and insurance-based labs across hormones, metabolic, and recovery.',
    bullets: [
      'Direct concierge provider access',
      'Lab orders and prescriptions through your insurance',
      'Guidance across hormones, metabolic, and recovery',
      'Step up to compounded protocols any time',
    ],
  };
}
