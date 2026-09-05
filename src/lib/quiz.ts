// Anonymous care-path guide used on the homepage.
// Answers never leave the visitor's browser. The result compares published
// service structures; it is not a diagnosis, eligibility decision, or plan.

export type Answers = Partial<{
  goal: string;
  path: string;
  budget: string;
}>;

export type Match = {
  key: 'metabolic' | 'trt' | 'concierge';
  name: string;
  price: string;
  body: string;
  bullets: string[];
  discuss: string[];
};

const commonQuestions = [
  'What information or labs would be useful before making a decision?',
  'What is included in the monthly price, and what may be billed separately?',
  'What happens if I am not a candidate for the option I had in mind?',
];

const concierge = (goal: string, body?: string): Match => ({
  key: 'concierge',
  name: 'Viva Concierge Access',
  price: '$99',
  body: body || 'This is Viva’s flexible provider-access membership. It can be a useful comparison point when your path is not yet clear or when eligible prescriptions, labs, and medication costs will be handled separately.',
  bullets: [
    'Monthly evaluation and ongoing medication management',
    'Direct provider messaging through the clinical workflow',
    'Lab-order coordination and one acute or sick-visit credit each month',
    'Medication is separate unless a plan specifically lists it',
  ],
  discuss: [
    goal === 'recovery'
      ? 'What changed in your recovery and whether an injury needs in-person evaluation'
      : goal === 'performance'
        ? 'What performance change you want to understand and what evidence supports the available options'
        : goal === 'longevity'
          ? 'Which health priorities matter most over the next six to twelve months'
          : 'The timing and pattern of the changes you have noticed',
    ...commonQuestions,
  ],
});

export function match(a: Answers): Match {
  const goal = a.goal || 'longevity';
  const path = a.path || 'unsure';
  const budget = a.budget || 'b199';
  const wantsMetabolic = path === 'metabolic' || (path === 'unsure' && goal === 'weight');

  if (wantsMetabolic) {
    if (budget === 'b99' || budget === 'b199') {
      return concierge(
        goal,
        'The bundled medical weight-management plans begin at $249 per month, above the range you selected. Viva Concierge Access is $99 per month, but medication is separate. Compare the full cost and clinical options before deciding.'
      );
    }

    if (budget === 'bmax') {
      return {
        key: 'metabolic',
        name: 'Compare all metabolic tiers',
        price: '$249–$499',
        body: 'Viva publishes three medical weight-management tiers in this range. The guide cannot choose among them or determine whether any medication is appropriate; compare the inclusions, then use a clinical visit for an individual decision.',
        bullets: [
          'Metabolic Essential · $249 per month',
          'Metabolic Core · $349 per month',
          'Metabolic Advanced · $499 per month',
          'Medication remains subject to clinical review, current law, and availability',
        ],
        discuss: [
          'Which level of follow-up and bundled services you actually need',
          'Medication status, risks, alternatives, and patient-specific legal availability',
          ...commonQuestions,
        ],
      };
    }

    if (budget === 'b349') {
      return {
        key: 'metabolic',
        name: 'Metabolic Core',
        price: '$349',
        body: 'This published tier is within the range you selected and lists monthly medication management and follow-up. It is a price comparison, not a recommendation or prescription.',
        bullets: [
          'Monthly provider evaluation and medication management',
          'The plan-listed medication only when clinically appropriate and lawfully prescribed',
          'Supplies and home delivery where listed',
          'Ongoing side-effect review and follow-up',
        ],
        discuss: [
          'Your previous weight-management efforts and what was difficult to sustain',
          'Medication benefits, risks, alternatives, and monitoring',
          ...commonQuestions,
        ],
      };
    }

    return {
      key: 'metabolic',
      name: 'Metabolic Essential',
      price: '$249',
      body: 'This is Viva’s lowest-priced bundled medical weight-management tier. The guide cannot determine whether the plan-listed medication is lawful, available, or appropriate for you.',
      bullets: [
        'Provider evaluation and medication management',
        'Plan-listed medication only when clinically appropriate and lawfully prescribed',
        'Supplies and home delivery where listed',
        'Ongoing follow-up',
      ],
      discuss: [
        'Your goals, prior approaches, and the routines that need to fit your schedule',
        'Eligibility, product status, side effects, alternatives, and maintenance planning',
        ...commonQuestions,
      ],
    };
  }

  if (path === 'testosterone' && budget !== 'b99') {
    return {
      key: 'trt',
      name: 'TRT All Inclusive',
      price: '$199',
      body: 'This published testosterone-care membership is within the range you selected. Symptoms alone do not establish low testosterone, and treatment is never determined by this guide.',
      bullets: [
        'Provider evaluation before treatment is considered',
        'The listed medication, supplies, and delivery only when prescribed',
        'Twice-yearly labs included in the membership',
        'Ongoing follow-up and medication management',
      ],
      discuss: [
        'Which symptoms and changes brought you here',
        'What testing, monitoring, risks, and alternatives should be considered',
        ...commonQuestions,
      ],
    };
  }

  if (path === 'testosterone' && budget === 'b99') {
    return concierge(
      goal,
      'The all-inclusive testosterone membership is $199 per month, above the range you selected. Viva Concierge Access is $99 per month and handles eligible prescriptions, labs, and medication costs separately. Compare the total cost before deciding.'
    );
  }

  if (path === 'menopause') {
    return concierge(
      goal,
      'Viva Concierge Access is the published management membership for hormone and menopause evaluation. Medication, if clinically appropriate, is selected individually and billed separately unless explicitly listed as included.'
    );
  }

  return concierge(goal);
}
