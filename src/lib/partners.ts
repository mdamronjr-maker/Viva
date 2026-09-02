// Shared trusted-network data. Consumed by the standalone /partners page.
// New partners get added here once and surface on the partners page.
//
// Partners without a logo/photo file render the fallback initials block. Drop
// the asset in /public/partners/ and set `image` to wire it up.

export type Partner = {
  name: string;
  operator: string;
  category: string;
  description: string;
  mediaType: 'portrait' | 'logo' | 'logo-dark';
  image?: string;
  imageAlt?: string;
  fallback: string;
  links: { href: string; label: string }[];
};

// Categorization rule: group by what the partner IS, not what they do.
// A personal trainer and a "strength coach" are functionally identical — both
// go in Coaching. A studio you can drop into is a Gym. A clinic that does
// hands-on rehab is PT/Recovery. Meal prep / nutrition sits in its own bucket.
export type PartnerCategory =
  | 'Physical Therapy & Recovery'
  | 'Coaching & Training'
  | 'Gyms & Studios'
  | 'Nutrition & Meal Prep';

// ─── Viva Perks ────────────────────────────────────────────────────────────
// Brand discounts Liliana passes along to patients. Separate from the
// referral directory above: the directory is local practitioners (no paid
// listings); perks are national brands with a Viva discount code or link.
//
// `pending: true` renders the card without an outbound link and with a
// "details coming soon" note. Flip it off once Liliana sends the real
// affiliate link (Momentous, Noble Origins) or the Fullscript embed code.
//
// FTC NOTE: today every live href is the brand's plain public site, so the
// page copy ("discounts I pass along") is accurate. The moment ANY href is
// swapped for an affiliate/referral link that pays Viva, add a visible
// disclosure line to the perks section on /partners (e.g. "Some links earn
// Viva a referral credit") IN THE SAME commit. Endorsements with a financial
// relationship require clear, proximate disclosure.
export type Perk = {
  name: string;
  blurb: string;
  code?: string;
  href?: string;
  linkLabel?: string;
  pending?: boolean;
  pendingNote?: string;
};

export const perks: Perk[] = [
  {
    name: 'BodySpec',
    blurb: 'DEXA body-composition scans. The gold-standard way to track fat, lean mass, and bone density while you are on a protocol. Mobile trucks all over Austin.',
    code: 'VIVA',
    href: 'https://www.bodyspec.com',
    linkLabel: 'bodyspec.com',
  },
  {
    name: 'Momentous',
    blurb: 'NSF-certified supplements: protein, creatine, omega-3, magnesium. The brand I reach for when a protocol needs a foundation the grocery store cannot provide.',
    code: 'Viva',
    href: 'https://www.livemomentous.com',
    linkLabel: 'livemomentous.com',
    // TODO: swap href for Liliana's partner link when she sends it.
  },
  {
    name: 'Noble Origins',
    blurb: 'Organ-based protein and whole-food supplements for patients who want their micronutrients from food-first sources.',
    pending: true,
    pendingNote: 'Discount link on the way',
  },
  {
    name: 'Fullscript',
    blurb: 'Practitioner-grade supplement dispensary. Professional brands, dosed and curated by Liliana, shipped to your door at a patient discount.',
    pending: true,
    pendingNote: 'Dispensary link coming soon',
    // TODO: replace this card's pending state with the embedded Fullscript
    // widget once the emailed embed code is in hand.
  },
];

// The /partners page renders this array as a single flat grid in array order,
// so the order here IS the on-page order. Voltex PT leads by request.
export const partners: Partner[] = [
  // ─── Physical Therapy & Recovery ─────────────────────────────────────────
  {
    name: 'Voltex PT',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Physical therapy and rehabilitation for the patients who need in-person, hands-on care that no telehealth visit can replace. Movement assessments, manual therapy, return-to-sport.',
    mediaType: 'logo',
    image: '/partners/voltex-pt.svg',
    imageAlt: 'Voltex PT, Austin physical therapy and sports rehabilitation',
    fallback: 'VPT',
    links: [{ href: 'https://voltexpt.com/', label: 'voltexpt.com' }],
  },
  {
    name: 'Recover + Perform',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Physical therapy, performance training, and recovery under one roof: post-op rehab and return-to-sport strength work alongside cold plunge, infrared sauna, and EMS. The in-person care a video visit cannot cover.',
    mediaType: 'portrait',
    fallback: 'RP',
    links: [{ href: 'https://www.recoverperform.com/', label: 'recoverperform.com' }],
  },
  {
    name: 'Swift Fit Training & PT',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Combined personal training and physical therapy under one roof. Useful when a Viva patient needs to rebuild capacity around an old injury.',
    mediaType: 'logo',
    image: '/partners/swift-fit.webp',
    imageAlt: 'Swift Fit Training & PT, Austin personal training and physical therapy',
    fallback: 'SF',
    links: [{ href: 'https://www.swiftfitatx.com/', label: 'swiftfitatx.com' }],
  },
  {
    name: 'Austin Sports Therapy',
    operator: 'Austin, TX',
    category: 'Physical Therapy & Recovery',
    description: 'Specialized sports injury recovery for athletes and active adults. Soft tissue work, joint rehabilitation, performance restoration.',
    mediaType: 'logo-dark',
    image: '/partners/austin-sports-therapy.png',
    imageAlt: 'Austin Sports Therapy logo',
    fallback: 'AST',
    links: [{ href: 'https://www.austinsportstherapy.com/', label: 'austinsportstherapy.com' }],
  },

  // ─── Coaching & Training ─────────────────────────────────────────────────
  {
    name: 'Bodies by Bastian',
    operator: 'Austin, TX',
    category: 'Coaching & Training',
    description: 'Personalized training for clients who want structured, attentive coaching. Strong fit for patients on a metabolic or recomp protocol.',
    mediaType: 'logo-dark',
    image: '/partners/bodies-by-bastian.webp',
    imageAlt: 'Bodies by Bastian, Austin personal training with Syd Bastian',
    fallback: 'BB',
    links: [{ href: 'https://www.bodiesbybastian.com/', label: 'bodiesbybastian.com' }],
  },
  {
    name: 'Train with Davis',
    operator: 'Austin, TX',
    category: 'Coaching & Training',
    description: 'Coaching for clients across strength, conditioning, and body composition. Practical programming, no theatrics.',
    mediaType: 'portrait',
    image: '/partners/train-with-davis.webp',
    imageAlt: 'Davis of Train with Davis, Austin strength and conditioning coach',
    fallback: 'TD',
    links: [{ href: 'https://www.trainwithdavis.com/', label: 'trainwithdavis.com' }],
  },

  // ─── Gyms & Studios ──────────────────────────────────────────────────────
  {
    name: 'Lift ATX',
    operator: 'Austin, TX',
    category: 'Gyms & Studios',
    description: 'Group strength and conditioning gym in Austin. Programming for lifters who want measurable progression alongside their protocol.',
    mediaType: 'logo',
    image: '/partners/lift-atx.avif',
    imageAlt: 'Lift ATX, Austin strength and conditioning gym',
    fallback: 'LA',
    links: [{ href: 'https://www.liftatx.com/', label: 'liftatx.com' }],
  },
  {
    name: 'Lifetime Fitness · Clinic South',
    operator: 'Austin, TX',
    category: 'Gyms & Studios',
    description: 'Full-service health and fitness club with on-site clinic. Useful for patients who want a broader fitness facility alongside their concierge care.',
    mediaType: 'logo',
    image: '/partners/lifetime-fitness.png',
    imageAlt: 'Lifetime Fitness Clinic South, Austin health and fitness club',
    fallback: 'LT',
    links: [{ href: 'https://www.lifetime.life/locations/tx/austin-south.html', label: 'lifetime.life · Austin South' }],
  },

  // ─── Nutrition & Meal Prep ───────────────────────────────────────────────
  {
    name: 'Simple Plan Meal Prep',
    operator: 'Austin, TX',
    category: 'Nutrition & Meal Prep',
    description: 'Chef-prepared, macro-balanced meals with in-store pickup and local Austin delivery. A simple nutrition backbone for patients on a metabolic, GLP-1, or recomp protocol.',
    mediaType: 'logo-dark',
    image: '/partners/simple-plan.png',
    imageAlt: 'Simple Plan meal prep logo',
    fallback: 'SP',
    links: [
      { href: 'https://mysimpleplan.com/', label: 'mysimpleplan.com' },
      { href: 'https://www.instagram.com/simpleplanaustin/', label: '@simpleplanaustin' },
    ],
  },
];

export const partnerCategoryOrder: PartnerCategory[] = [
  'Physical Therapy & Recovery',
  'Coaching & Training',
  'Gyms & Studios',
  'Nutrition & Meal Prep',
];

export const partnersByCategory = partnerCategoryOrder
  .map((cat) => ({
    category: cat,
    items: partners.filter((p) => p.category === cat),
  }))
  .filter((g) => g.items.length > 0);
