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
// Each relationship disclosure stays on the same card as its outbound action.
// That proximity is deliberate: a sitewide or footer-only affiliate notice is
// too easy to miss. Links marked sponsored render rel="sponsored noopener".
export type PerkLink = {
  href: string;
  label: string;
  sponsored?: boolean;
};

export type Perk = {
  name: string;
  blurb: string;
  code?: string;
  offer?: string;
  links?: PerkLink[];
  relationshipDisclosure?: string;
  reviewed?: string;
  pending?: boolean;
  pendingNote?: string;
};

export const perks: Perk[] = [
  {
    name: 'BodySpec',
    blurb: 'Whole-body DEXA scans that report body-fat percentage, lean mass, visceral fat, and bone density. Results are measurements, not a diagnosis; ask your clinician how they fit your goals.',
    code: 'VIVA',
    offer: 'Code VIVA: $10 off a one-time scan (advertised regular price $59.95) or $5 off membership options. Confirm current terms at booking.',
    links: [
      { href: 'https://www.bodyspec.com/booking', label: 'Book a BodySpec scan', sponsored: true },
      { href: 'https://www.bodyspec.com/sample-report', label: 'View a sample report' },
    ],
    relationshipDisclosure: 'Viva may receive a referral benefit when you use this code.',
    reviewed: 'Links checked September 5, 2026',
  },
  {
    name: 'Momentous',
    blurb: 'Performance-nutrition products with third-party testing and certification details. Review the certification, ingredients, and directions for the individual product before purchasing.',
    code: 'VIVA',
    links: [
      { href: 'https://crrnt.app/MOME/QMg8PBab', label: 'Shop Momentous', sponsored: true },
    ],
    relationshipDisclosure: 'Viva may receive a commission when you shop through this link or use this code.',
    reviewed: 'Link checked September 5, 2026',
  },
  {
    name: 'Noble Origins',
    blurb: 'Grass-fed beef protein made with collagen, colostrum, and other food-derived ingredients. Review the label and discuss supplements with your clinician if you take medication or have a health condition.',
    links: [
      { href: 'https://www.nobleorigins.com/VIVAWELLNESS', label: 'Shop Noble Origins', sponsored: true },
    ],
    relationshipDisclosure: 'Viva may receive a commission when you shop through this link.',
    reviewed: 'Link checked September 5, 2026',
  },
  {
    name: 'Fullscript',
    blurb: 'Viva’s online supplement dispensary. Products in the shop are optional and should not be treated as an individualized recommendation unless Liliana has discussed them with you.',
    links: [
      { href: 'https://us.fullscript.com/s/vivawellnessco/shop', label: 'Open Viva’s Fullscript shop', sponsored: true },
    ],
    relationshipDisclosure: 'Viva may receive a financial benefit from purchases made through this dispensary.',
    reviewed: 'Link checked September 5, 2026',
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
    description: 'Personalized training for clients who want structured, attentive coaching around strength, conditioning, and body composition.',
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
    description: 'Group strength and conditioning gym in Austin with programming for lifters who want measurable progression.',
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
    description: 'Chef-prepared meals with in-store pickup and local Austin delivery. Confirm current menus, nutrition information, allergens, and delivery coverage directly.',
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
